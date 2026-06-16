import type {
  NextRuntimeOperationResult,
  NextRuntimeRecord
} from "@/lib/server/runtime/next-runtime-types";
import { runtimeLogLines } from "@/lib/server/runtime/next-process-registry";

export function runtimeRecordToNextPreviewBridge(
  record: NextRuntimeRecord
): NextRuntimeOperationResult {
  return {
    error: record.error,
    framework: "next_app",
    logs: runtimeLogLines(record),
    port: record.port,
    previewUrl: record.previewUrl,
    projectId: record.projectId,
    routerKind: record.routerKind,
    runtimeId: record.runtimeId,
    runtimeStatus: record.status,
    startedAt: record.startedAt,
    workspaceRoot: record.workspaceRoot
  };
}
