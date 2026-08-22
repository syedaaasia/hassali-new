import { environmentIntelligenceSecretStore } from "@/lib/server/intelligence/intelligence-secret-store";

const githubSecretSourceId = "github-oauth";
const githubApiVersion = "2022-11-28";

export type GitHubRepositorySummary = {
  defaultBranch: string;
  fullName: string;
  htmlUrl: string;
  name: string;
  owner: string;
  private: boolean;
  updatedAt: string | null;
};

export type GitHubCodeContext = {
  branch: string;
  head: string | null;
  paths: string[];
  repository: string;
  truncated: boolean;
};

export function githubConfiguration() {
  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID?.trim() || process.env.GITHUB_CLIENT_ID?.trim() || "";
  const clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET?.trim() || process.env.GITHUB_CLIENT_SECRET?.trim() || "";
  const callbackUrl = process.env.GITHUB_OAUTH_CALLBACK_URL?.trim()
    || (process.env.NEXT_PUBLIC_APP_URL?.trim()
      ? `${process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/api/github/callback`
      : "");
  const secretStore = environmentIntelligenceSecretStore();
  return {
    callbackUrl,
    clientId,
    clientSecret,
    configured: Boolean(clientId && clientSecret && callbackUrl && secretStore),
    reason: !clientId || !clientSecret
      ? "GitHub OAuth is not configured on this Hassali server."
      : !callbackUrl
        ? "GitHub OAuth needs GITHUB_OAUTH_CALLBACK_URL or NEXT_PUBLIC_APP_URL."
        : !secretStore
          ? "GitHub OAuth needs Hassali's encrypted credential store."
          : null,
    secretStore
  };
}

function githubHeaders(token: string) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "User-Agent": "Hassali.ai",
    "X-GitHub-Api-Version": githubApiVersion
  };
}

async function githubFetch(input: {
  fetchImpl?: typeof fetch;
  path: string;
  signal?: AbortSignal;
  token: string;
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  const relayAbort = () => controller.abort();
  input.signal?.addEventListener("abort", relayAbort, { once: true });
  try {
    return await (input.fetchImpl ?? fetch)(`https://api.github.com${input.path}`, {
      headers: githubHeaders(input.token),
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
    input.signal?.removeEventListener("abort", relayAbort);
  }
}

export async function getGitHubAccessToken(userId: string) {
  const store = githubConfiguration().secretStore;
  return store ? store.get(userId, githubSecretSourceId) : null;
}

export async function saveGitHubAccessToken(userId: string, token: string) {
  const store = githubConfiguration().secretStore;
  if (!store) throw new Error("GITHUB_SECURE_STORAGE_UNAVAILABLE");
  await store.put(userId, githubSecretSourceId, token);
}

export async function removeGitHubAccessToken(userId: string) {
  const store = githubConfiguration().secretStore;
  return store ? store.delete(userId, githubSecretSourceId) : false;
}

export async function listGitHubRepositories(input: {
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  token: string;
}) {
  const response = await githubFetch({
    ...input,
    path: "/user/repos?affiliation=owner%2Ccollaborator%2Corganization_member&per_page=100&sort=updated"
  });
  if (!response.ok) {
    const error = response.status === 401 ? "GITHUB_AUTHENTICATION_FAILED" : "GITHUB_REPOSITORIES_UNAVAILABLE";
    throw new Error(error);
  }
  const payload = await response.json() as Array<Record<string, unknown>>;
  return payload.slice(0, 100).flatMap((repo): GitHubRepositorySummary[] => {
    const ownerRecord = repo.owner && typeof repo.owner === "object" ? repo.owner as Record<string, unknown> : null;
    const owner = typeof ownerRecord?.login === "string" ? ownerRecord.login : "";
    const name = typeof repo.name === "string" ? repo.name : "";
    const htmlUrl = typeof repo.html_url === "string" ? repo.html_url : "";
    if (!owner || !name || !htmlUrl) return [];
    return [{
      defaultBranch: typeof repo.default_branch === "string" ? repo.default_branch : "main",
      fullName: `${owner}/${name}`,
      htmlUrl,
      name,
      owner,
      private: repo.private === true,
      updatedAt: typeof repo.updated_at === "string" ? repo.updated_at : null
    }];
  });
}

export async function listGitHubRepositoryPaths(input: {
  branch: string;
  fetchImpl?: typeof fetch;
  owner: string;
  repository: string;
  signal?: AbortSignal;
  token: string;
}) {
  const owner = encodeURIComponent(input.owner);
  const repository = encodeURIComponent(input.repository);
  const branch = encodeURIComponent(input.branch);
  const response = await githubFetch({ ...input, path: `/repos/${owner}/${repository}/git/trees/${branch}?recursive=1` });
  if (!response.ok) throw new Error(response.status === 404 ? "GITHUB_REPOSITORY_NOT_FOUND" : "GITHUB_REPOSITORY_UNAVAILABLE");
  const payload = await response.json() as { sha?: unknown; tree?: Array<Record<string, unknown>>; truncated?: unknown };
  const paths = (payload.tree ?? [])
    .filter((item) => item.type === "blob" && typeof item.path === "string")
    .map((item) => item.path as string)
    .filter((path) => !/(^|\/)(?:\.env(?:\.|$)|node_modules|\.next|dist|build)(?:\/|$)/i.test(path))
    .slice(0, 500);
  return {
    head: typeof payload.sha === "string" ? payload.sha : null,
    paths,
    truncated: payload.truncated === true || (payload.tree?.length ?? 0) > paths.length
  };
}

export function formatGitHubCodeContext(input: GitHubCodeContext) {
  const paths = input.paths.slice(0, 24).join(", ");
  return [
    `Selected GitHub repository (read-only remote metadata): ${input.repository}`,
    `branch=${input.branch}`,
    input.head ? `head=${input.head}` : "",
    paths ? `paths=${paths}` : "paths unavailable",
    input.truncated || input.paths.length > 24 ? "path inventory is bounded" : ""
  ].filter(Boolean).join("; ");
}

export function safeGitHubError(error: unknown) {
  const code = error instanceof Error ? error.message : "GITHUB_UNAVAILABLE";
  if (code === "GITHUB_AUTHENTICATION_FAILED") return { message: "GitHub authorization expired. Reconnect GitHub and try again.", status: 401 };
  if (code === "GITHUB_REPOSITORY_NOT_FOUND") return { message: "That repository is no longer available to this GitHub account.", status: 404 };
  if (code === "GITHUB_SECURE_STORAGE_UNAVAILABLE") return { message: "Encrypted GitHub credential storage is not configured.", status: 503 };
  return { message: "GitHub is temporarily unavailable. No project files were changed.", status: 502 };
}
