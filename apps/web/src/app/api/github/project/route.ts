import { auth } from "@clerk/nextjs/server";
import { getOwnedGithubProjectConnection, upsertOwnedGithubProjectConnection } from "@hassali/database";
import { getGitHubAccessToken, listGitHubRepositories, listGitHubRepositoryPaths, safeGitHubError } from "@/lib/server/github/github-integration";
import { boundedJsonFailure, productionRequestLimits, readBoundedJson } from "@/lib/server/production-hardening/request-guard";

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const projectId = new URL(request.url).searchParams.get("projectId")?.trim() ?? "";
  if (!projectId) return Response.json({ error: "projectId is required" }, { status: 400 });
  const repository = await getOwnedGithubProjectConnection({ externalUserId: userId, projectId });
  if (!repository) return Response.json({ repository: null, source: null });
  const token = await getGitHubAccessToken(userId);
  if (!token) return Response.json({ repository, source: null, warning: "Reconnect GitHub to load repository source metadata." });
  try {
    const source = await listGitHubRepositoryPaths({
      branch: repository.defaultBranch,
      owner: repository.repositoryOwner,
      repository: repository.repositoryName,
      signal: request.signal,
      token
    });
    return Response.json({ repository, source });
  } catch (error) {
    const safe = safeGitHubError(error);
    return Response.json({ repository, source: null, warning: safe.message });
  }
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = await readBoundedJson<Record<string, unknown>>(request, productionRequestLimits.settingsJsonBytes);
  if (!parsed.ok) return boundedJsonFailure(parsed);
  const body = parsed.value;
  const projectId = typeof body?.projectId === "string" ? body.projectId.trim() : "";
  const fullName = typeof body?.fullName === "string" ? body.fullName.trim() : "";
  if (!projectId || !/^[^/\s]+\/[^/\s]+$/.test(fullName)) return Response.json({ error: "projectId and a valid repository are required" }, { status: 400 });
  const token = await getGitHubAccessToken(userId);
  if (!token) return Response.json({ error: "Connect GitHub before choosing a repository." }, { status: 409 });
  try {
    const repositories = await listGitHubRepositories({ signal: request.signal, token });
    const selected = repositories.find((repository) => repository.fullName.toLowerCase() === fullName.toLowerCase());
    if (!selected) return Response.json({ error: "That repository is not available to the connected GitHub account." }, { status: 404 });
    const source = await listGitHubRepositoryPaths({ branch: selected.defaultBranch, owner: selected.owner, repository: selected.name, signal: request.signal, token });
    const repository = await upsertOwnedGithubProjectConnection({
      defaultBranch: selected.defaultBranch,
      externalUserId: userId,
      htmlUrl: selected.htmlUrl,
      lastKnownHead: source.head,
      private: selected.private,
      projectId,
      repositoryName: selected.name,
      repositoryOwner: selected.owner
    });
    return repository
      ? Response.json({ repository, source })
      : Response.json({ error: "Project not found" }, { status: 404 });
  } catch (error) {
    const safe = safeGitHubError(error);
    return Response.json({ error: safe.message }, { status: safe.status });
  }
}
