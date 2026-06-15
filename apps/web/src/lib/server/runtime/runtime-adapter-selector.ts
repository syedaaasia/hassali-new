import type { RuntimeAdapter } from "@/lib/server/runtime/runtime-adapter";
import { createLocalApprovedFileRunnerAdapter } from "@/lib/server/runtime/local-approved-file-runner-adapter";
import { isAiderWorkerEnabled } from "@/lib/server/runtime/workers/aider-worker-config";
import { createAiderRuntimeAdapter } from "@/lib/server/runtime/workers/aider-worker";
import { isOpenCodeWorkerEnabled } from "@/lib/server/runtime/workers/opencode-worker-config";
import { createOpenCodeRuntimeAdapter } from "@/lib/server/runtime/workers/opencode-worker";

export type RuntimeWorkerType = "aider" | "local" | "opencode";

export type RuntimeAdapterSelection = {
  adapter: RuntimeAdapter;
  fallbackReason: string | null;
  requestedWorkerType: RuntimeWorkerType;
  selectedWorkerType: RuntimeWorkerType;
};

export function normalizeRuntimeWorkerType(value: unknown): RuntimeWorkerType {
  if (value === "aider" || value === "opencode") {
    return value;
  }

  return "local";
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

  if (workerType === "opencode" && isOpenCodeWorkerEnabled()) {
    return {
      adapter: createOpenCodeRuntimeAdapter(),
      fallbackReason: null,
      requestedWorkerType: workerType,
      selectedWorkerType: "opencode"
    };
  }

  return {
    adapter: createLocalApprovedFileRunnerAdapter(),
    fallbackReason:
      workerType === "aider"
        ? "Aider worker was requested but ENABLE_AIDER_WORKER is not true; using the default local approved file runner."
        : workerType === "opencode"
          ? "OpenCode worker was requested but ENABLE_OPENCODE_WORKER is not true; using the default local approved file runner."
          : null,
    requestedWorkerType: workerType,
    selectedWorkerType: "local"
  };
}
