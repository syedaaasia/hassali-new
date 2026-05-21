import { auth } from "@clerk/nextjs/server";
import { loadWorkspaceForExternalUser } from "@hassali/database";

export async function GET(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const selectedProjectId = url.searchParams.get("projectId");
  const workspace = await loadWorkspaceForExternalUser(userId, selectedProjectId);

  console.info("workspace chat response", {
    messages: workspace.chat.messages.length,
    sessionId: workspace.chat.sessionId
  });

  return Response.json({
    chat: workspace.chat,
    files: workspace.files,
    project: workspace.project,
    projects: workspace.projects,
    workspace: workspace.workspace ?? {
      id: "",
      name: "My Workspace"
    }
  });
}
