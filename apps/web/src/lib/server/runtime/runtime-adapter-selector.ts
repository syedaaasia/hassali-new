import type { RuntimeAdapter } from "@/lib/server/runtime/runtime-adapter";
import { createLocalApprovedFileRunnerAdapter } from "@/lib/server/runtime/local-approved-file-runner-adapter";
import { isAiderWorkerEnabled } from "@/lib/server/runtime/workers/aider-worker-config";
import { createAiderRuntimeAdapter } from "@/lib/server/runtime/workers/aider-worker";

export type RuntimeWorkerType = "aider" | "local";

export type RuntimeAdapterSelection = {
  adapter: RuntimeAdapter;
  fallbackReason: string | null;
  requestedWorkerType: RuntimeWorkerType;
  selectedWorkerType: RuntimeWorkerType;
};

export function normalizeRuntimeWorkerType(value: unknown): RuntimeWorkerType {
  return value === "aider" ? "aider" : "local";
}

export function selectRuntimeAdapter(workerType: RuntimeWorkerType): RuntimeAdapterSelection {
  if (workerType === "aider" && isAiderWorkerEnabled()) {
    return {
      adapter: createAiderRuntimeAdapter(),
      fallbackReason: null,
      requestedWorkerType: workerType,
      selectedWorkerType: "aider"
    };
  }

  return {
    adapter: createLocalApprovedFileRunnerAdapter(),
    fallbackReason: workerType === "aider"
      ? "Aider worker was requested but ENABLE_AIDER_WORKER is not true; using the default local approved file runner."
      : null,
    requestedWorkerType: workerType,
    selectedWorkerType: "local"
  };
}
