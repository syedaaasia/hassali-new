import type { RuntimeAdapter } from "@/lib/server/runtime/runtime-adapter";
import { createLocalApprovedFileRunnerAdapter } from "@/lib/server/runtime/local-approved-file-runner-adapter";
import { isAiderWorkerEnabled } from "@/lib/server/runtime/workers/aider-worker-config";
import { createAiderRuntimeAdapter } from "@/lib/server/runtime/workers/aider-worker";
import { isOpenCodeWorkerEnabled } from "@/lib/server/runtime/workers/opencode-worker-config";
import { createOpenCodeRuntimeAdapter } from "@/lib/server/runtime/workers/opencode-worker";
import { isOpenHandsSandboxEnabled } from "@/lib/server/runtime/workers/openhands-sandbox-config";
import { createOpenHandsSandboxAdapter } from "@/lib/server/runtime/workers/openhands-sandbox-adapter";
import { isGooseDelegationEnabled } from "@/lib/server/runtime/workers/goose-delegation-config";
import { createGooseDelegationAdapter } from "@/lib/server/runtime/workers/goose-delegation-adapter";
import type { WorkerRouterOutput } from "@/lib/server/runtime/worker-router-types";

export type RuntimeWorkerType = "aider" | "goose" | "local" | "opencode" | "openhands";

export type RuntimeAdapterSelection = {
  adapter: RuntimeAdapter;
  fallbackReason: string | null;
  requestedWorkerType: RuntimeWorkerType;
  selectedWorkerType: RuntimeWorkerType;
};

export function normalizeRuntimeWorkerType(value: unknown): RuntimeWorkerType {
  if (value === "aider" || value === "goose" || value === "opencode" || value === "openhands") {
    return value;
  }

  return "local";
}

function workerTypeFromSelection(input: RuntimeWorkerType | WorkerRouterOutput): RuntimeWorkerType {
  return typeof input === "string" ? input : input.selectedWorkerType;
}

export function selectRuntimeAdapter(input: RuntimeWorkerType | WorkerRouterOutput): RuntimeAdapterSelection {
  const workerType = workerTypeFromSelection(input);

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

  if (workerType === "openhands" && isOpenHandsSandboxEnabled()) {
    return {
      adapter: createOpenHandsSandboxAdapter(),
      fallbackReason: null,
      requestedWorkerType: workerType,
      selectedWorkerType: "openhands"
    };
  }

  if (workerType === "goose" && isGooseDelegationEnabled()) {
    return {
      adapter: createGooseDelegationAdapter(),
      fallbackReason: null,
      requestedWorkerType: workerType,
      selectedWorkerType: "goose"
    };
  }

  return {
    adapter: createLocalApprovedFileRunnerAdapter(),
    fallbackReason:
      workerType === "aider"
        ? "Aider worker was requested but ENABLE_AIDER_WORKER is not true; using the default local approved file runner."
        : workerType === "opencode"
          ? "OpenCode worker was requested but ENABLE_OPENCODE_WORKER is not true; using the default local approved file runner."
          : workerType === "openhands"
            ? "OpenHands sandbox was requested but ENABLE_OPENHANDS_SANDBOX is not true; using the default local approved file runner."
            : workerType === "goose"
              ? "Goose delegation was requested but ENABLE_GOOSE_DELEGATION is not true; using the default local approved file runner."
              : null,
    requestedWorkerType: workerType,
    selectedWorkerType: "local"
  };
}
