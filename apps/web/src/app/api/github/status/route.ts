import { auth } from "@clerk/nextjs/server";
import { getOwnedGithubProjectConnection } from "@hassali/database";
import { getGitHubAccessToken, githubConfiguration, removeGitHubAccessToken } from "@/lib/server/github/github-integration";

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const projectId = new URL(request.url).searchParams.get("projectId")?.trim() ?? "";
  const config = githubConfiguration();
  const connected = config.configured ? Boolean(await getGitHubAccessToken(userId).catch(() => null)) : false;
  const repository = projectId ? await getOwnedGithubProjectConnection({ externalUserId: userId, projectId }) : null;
  return Response.json({ configured: config.configured, connected, reason: config.reason, repository });
}

export async function DELETE() {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  await removeGitHubAccessToken(userId);
  return Response.json({ connected: false });
}
