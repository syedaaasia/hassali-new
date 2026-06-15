import { bindProjectWorkspace, type WorkspaceBindingError, type WorkspaceBindingResult } from "@/lib/server/runtime/workspace-binding";

export type ProjectWorkspaceRegistryResult = WorkspaceBindingResult | WorkspaceBindingError;

export async function resolveProjectWorkspace(projectId: string): Promise<ProjectWorkspaceRegistryResult> {
  return bindProjectWorkspace(projectId);
}

export function isWorkspaceBindingError(
  result: ProjectWorkspaceRegistryResult
): result is WorkspaceBindingError {
  return result.registryStatus === "blocked";
}
