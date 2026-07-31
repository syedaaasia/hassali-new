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
    existingProcessReused: false,
    framework: "next_app",
    httpStatus: record.status === "running" ? 200 : null,
    logs: runtimeLogLines(record),
    port: record.port,
    previewUrl: record.previewUrl,
    processStarted: record.status === "running" || record.status === "starting",
    projectId: record.projectId,
    readinessVerified: record.status === "running",
    routerKind: record.routerKind,
    runtimeId: record.runtimeId,
    runtimeStatus: record.status,
    startedAt: record.startedAt,
    workspaceRoot: record.workspaceRoot
  };
}
