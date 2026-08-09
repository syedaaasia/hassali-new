import { auth } from "@clerk/nextjs/server";
import { loadWorkspaceForExternalUser } from "@hassali/database";
import { recordCanonicalEvent } from "@/lib/server/canonical-persistence";
import {
  isWorkspaceBindingError,
  resolveProjectWorkspace
} from "@/lib/server/runtime/project-workspace-registry";

async function recordProjectLoadEvent(projectId: string | null | undefined, switched: boolean) {
  if (!projectId) return;

  try {
    const binding = await resolveProjectWorkspace(projectId);

    if (!isWorkspaceBindingError(binding)) {
      await recordCanonicalEvent(binding.workspaceRoot, "PROJECT_LOADED", { projectId });
      await recordCanonicalEvent(binding.workspaceRoot, "PROJECT_REHYDRATED", { projectId });
      if (switched) {
        await recordCanonicalEvent(binding.workspaceRoot, "PROJECT_SWITCHED", { projectId });
      }
    }
  } catch {
    // Project load must not fail because workflow history logging is unavailable.
  }
}

export async function GET(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const selectedProjectId = url.searchParams.get("projectId");
  const selectedSessionId = url.searchParams.get("sessionId");
  const workspace = await loadWorkspaceForExternalUser(userId, selectedProjectId, undefined, selectedSessionId);

  await recordProjectLoadEvent(workspace.project?.id, Boolean(selectedProjectId));

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
