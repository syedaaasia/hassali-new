import { auth } from "@clerk/nextjs/server";
import { getGitHubAccessToken, listGitHubRepositories, safeGitHubError } from "@/lib/server/github/github-integration";

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const token = await getGitHubAccessToken(userId);
  if (!token) return Response.json({ error: "Connect GitHub before choosing a repository." }, { status: 409 });
  try {
    return Response.json({ repositories: await listGitHubRepositories({ signal: request.signal, token }) });
  } catch (error) {
    const safe = safeGitHubError(error);
    return Response.json({ error: safe.message }, { status: safe.status });
  }
}
