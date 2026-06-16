import { runtimeLogLines } from "@/lib/server/runtime/backend-process-registry";
import type {
  BackendRuntimeAnalysis,
  BackendRuntimeOperationResult,
  BackendExecutionRecord
} from "@/lib/server/runtime/backend-runtime-types";

export function runtimeRecordToBackendPreviewBridge(input: {
  analysis: BackendRuntimeAnalysis;
  record: BackendExecutionRecord;
}): BackendRuntimeOperationResult {
  return {
    apiStatus: input.record.status === "running" ? "running" : "candidate",
    endpointCount: input.analysis.endpointCount,
    error: input.record.error,
    framework: input.record.framework,
    healthStatus: input.record.status === "running" ? "healthy" : "unknown",
    logs: runtimeLogLines(input.record),
    port: input.record.port,
    previewUrl: input.record.previewUrl,
    projectId: input.record.projectId,
    routeCount: input.analysis.routeCount,
    runtimeId: input.record.runtimeId,
    runtimeStatus: input.record.status,
    startedAt: input.record.startedAt,
    workspaceRoot: input.record.workspaceRoot
  };
}
