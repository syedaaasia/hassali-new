/*
Phase 29 SSOT audit before edits:
1. Proposal files are created by apps/web/src/app/api/ai/chat/route.ts and returned to the client as a HASSALI_DIFF_PROPOSAL JSON payload.
2. Proposal files are parsed in apps/web/src/lib/chat-store.ts via parseDiffProposal/isDiffProposal, which previously accepted only JSON after the marker.
3. Approval payloads are built in apps/web/src/components/shell/right-sidebar.tsx by approveProposalThroughRuntime before POSTing proposal.changes to /api/runtime/approve.
4. Approval writes files through apps/web/src/app/api/runtime/approve/route.ts -> runtime-approval-plan.ts -> local-approved-file-runner-adapter.ts -> approved-file-runner.ts.
5. Workspace files are stored/listed/reloaded through packages/database/src/persistence.ts, apps/web/src/app/api/workspace/route.ts, apps/web/src/app/api/workspace/files/route.ts, and mirrored in apps/web/src/lib/workspace-store.ts.
6. Preview reads/classifies files in apps/web/src/lib/server/preview/* and in the client preview panel at apps/web/src/components/shell/preview-panel.tsx.
7. Runtime actions enter approval through proposal.changes; runtime-approval-plan.ts records metadata actions, while previous summary text sniffing caused shell false positives.
8. Project state is reconstructed after refresh by WorkspaceHydrator -> workspace-store.loadWorkspace() -> /api/workspace -> loadWorkspaceForExternalUser().
9. Independent proposal/workspace/runtime/preview state existed in chat-store.ts, workspace-store.ts, runtime-store.ts, runtime-result-sync.ts, and preview-panel.tsx.
*/

export function normalizePath(rawPath: unknown): string {
  if (typeof rawPath !== "string" || rawPath.trim() === "") return "";

  return rawPath
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\.?\//, "")
    .replace(/\/+$/, "")
    .replace(/\/{2,}/g, "/");
}

export function validateSafePath(path: string, projectRoot: string): void {
  void projectRoot;

  if (!path) throw new Error("Path cannot be empty");
  if (path.includes("..")) throw new Error(`Path traversal rejected: ${path}`);
  if (/^[A-Za-z]:\//.test(path)) throw new Error(`Absolute drive path rejected: ${path}`);
  if (path.startsWith("/")) throw new Error(`Absolute path rejected: ${path}`);
}

export function normalizeSafeProjectPath(rawPath: unknown, projectRoot = ""): string | null {
  const path = normalizePath(rawPath);

  try {
    validateSafePath(path, projectRoot);
    return path;
  } catch {
    return null;
  }
}
