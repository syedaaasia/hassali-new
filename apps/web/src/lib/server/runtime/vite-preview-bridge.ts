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
    existingProcessReused: false,
    httpStatus: record.status === "running" ? 200 : null,
    logs: runtimeLogLines(record),
    port: record.port,
    previewUrl: record.previewUrl,
    processStarted: record.status === "running" || record.status === "starting",
    projectId: record.projectId,
    readinessVerified: record.status === "running",
    runtimeId: record.runtimeId,
    runtimeStatus: record.status,
    startedAt: record.startedAt,
    workspaceRoot: record.workspaceRoot
  };
}
