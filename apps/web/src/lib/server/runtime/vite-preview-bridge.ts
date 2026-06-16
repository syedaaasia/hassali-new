import type {
  ViteRuntimeOperationResult,
  ViteRuntimeRecord
} from "@/lib/server/runtime/vite-runtime-types";
import { runtimeLogLines } from "@/lib/server/runtime/vite-process-registry";

export function runtimeRecordToPreviewBridge(
  record: ViteRuntimeRecord
): ViteRuntimeOperationResult {
  return {
    error: record.error,
    logs: runtimeLogLines(record),
    port: record.port,
    previewUrl: record.previewUrl,
    projectId: record.projectId,
    runtimeId: record.runtimeId,
    runtimeStatus: record.status,
    startedAt: record.startedAt,
    workspaceRoot: record.workspaceRoot
  };
}
