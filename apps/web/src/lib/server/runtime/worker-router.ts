import { isAiderWorkerEnabled } from "@/lib/server/runtime/workers/aider-worker-config";
import { isOpenCodeWorkerEnabled } from "@/lib/server/runtime/workers/opencode-worker-config";
import { isOpenHandsSandboxEnabled } from "@/lib/server/runtime/workers/openhands-sandbox-config";
import type { RuntimeWorkerType } from "@/lib/server/runtime/runtime-adapter-selector";
import type {
  RejectedWorker,
  WorkerRouterFeatureFlags,
  WorkerRouterInput,
  WorkerRouterOutput,
  WorkerRouterSnapshotStatus
} from "@/lib/server/runtime/worker-router-types";

const localReason = "Local approved file runner is the default safest worker.";

function defaultFeatureFlags(): WorkerRouterFeatureFlags {
  return {
    aider: isAiderWorkerEnabled(),
    opencode: isOpenCodeWorkerEnabled(),
    openhands: isOpenHandsSandboxEnabled()
  };
}

function featureFlags(input?: Partial<WorkerRouterFeatureFlags>): WorkerRouterFeatureFlags {
  return {
    ...defaultFeatureFlags(),
    ...input
  };
}

function requestedWorker(value: unknown): RuntimeWorkerType | "goose" | "unknown" | null {
  if (value === "local" || value === "aider" || value === "opencode" || value === "openhands") {
    return value;
  }

  if (value === "goose") {
    return "goose";
  }

  if (typeof value === "string" && value.trim()) {
    return "unknown";
  }

  return null;
}

function localOutput(input: {
  confidence?: number;
  reason: string;
  rejectedWorkers?: RejectedWorker[];
  requested: WorkerRouterOutput["requestedWorkerType"];
  status?: WorkerRouterOutput["routerStatus"];
  warnings?: string[];
}): WorkerRouterOutput {
  return {
    confidence: input.confidence ?? 0.95,
    fallbackWorkerType: input.requested && input.requested !== "local" ? "local" : null,
    isDryRun: false,
    isExternalWorker: false,
    rejectedWorkers: input.rejectedWorkers ?? [],
    requestedWorkerType: input.requested,
    requiresFeatureFlag: false,
    routerStatus: input.status ?? (input.warnings?.length ? "warning" : "selected"),
    routerWarnings: input.warnings ?? [],
    selectedWorkerType: "local",
    selectionReason: input.reason
  };
}

function requestedFlag(worker: RuntimeWorkerType, flags: WorkerRouterFeatureFlags) {
  if (worker === "aider") {
    return flags.aider;
  }

  if (worker === "opencode") {
    return flags.opencode;
  }

  if (worker === "openhands") {
    return flags.openhands;
  }

  return true;
}

function workerStrength(worker: RuntimeWorkerType) {
  if (worker === "aider") {
    return "Aider is suitable for approved code edits, refactors, repo file edits, and docs/source patch plans.";
  }

  if (worker === "opencode") {
    return "OpenCode is suitable for approved multi-file CODE implementation plans.";
  }

  if (worker === "openhands") {
    return "OpenHands sandbox is suitable for sandboxed verification plans and remains dry-run only in this phase.";
  }

  return localReason;
}

function needsSnapshot(worker: RuntimeWorkerType) {
  return worker === "aider" || worker === "opencode" || worker === "openhands";
}

function isSnapshotAvailable(snapshotStatus: WorkerRouterSnapshotStatus | undefined) {
  return snapshotStatus === "available";
}

function externalOutput(input: {
  requested: RuntimeWorkerType;
  reason: string;
  warnings?: string[];
}): WorkerRouterOutput {
  return {
    confidence: input.requested === "openhands" ? 0.8 : 0.82,
    fallbackWorkerType: null,
    isDryRun: input.requested === "openhands",
    isExternalWorker: input.requested !== "local",
    rejectedWorkers: [],
    requestedWorkerType: input.requested,
    requiresFeatureFlag: input.requested !== "local",
    routerStatus: input.warnings?.length ? "warning" : "selected",
    routerWarnings: input.warnings ?? [],
    selectedWorkerType: input.requested,
    selectionReason: input.reason
  };
}

export function routeRuntimeWorker(input: WorkerRouterInput): WorkerRouterOutput {
  const requested = requestedWorker(input.requestedWorkerType);
  const flags = featureFlags(input.featureFlags);
  const productMode = input.productMode;

  if (!requested) {
    return localOutput({
      reason: localReason,
      requested
    });
  }

  if (requested === "unknown" || requested === "goose") {
    return localOutput({
      reason: "Unknown or unavailable worker requested; falling back to local approved file runner.",
      rejectedWorkers: [{
        reason: requested === "goose" ? "Goose is reserved for a future phase." : "Worker type is not registered.",
        workerType: requested
      }],
      requested,
      status: "fallback",
      warnings: ["Requested worker is not available in this phase."]
    });
  }

  if (requested === "local") {
    return localOutput({
      reason: localReason,
      requested
    });
  }

  if (productMode === "ASK") {
    return localOutput({
      reason: "ASK mode is answer-only and does not route to external runtime workers.",
      rejectedWorkers: [{
        reason: "ASK mode suppresses mutation/external worker context.",
        workerType: requested
      }],
      requested,
      status: "fallback",
      warnings: ["ASK mode was routed to local/no-op behavior."]
    });
  }

  if (productMode === "WEBSITE") {
    return localOutput({
      reason: "WEBSITE mode stays on the local approved file runner in this phase.",
      rejectedWorkers: [{
        reason: "External CODE workers are disabled for WEBSITE mode.",
        workerType: requested
      }],
      requested,
      status: "fallback",
      warnings: ["WEBSITE mode cannot use Aider/OpenCode/OpenHands in this phase."]
    });
  }

  if (input.plan.mode !== "CODE") {
    return localOutput({
      reason: "Only approved CODE-mode plans can request external runtime workers.",
      rejectedWorkers: [{
        reason: `Approved plan mode was ${input.plan.mode}.`,
        workerType: requested
      }],
      requested,
      status: "fallback",
      warnings: ["Non-CODE approved plan routed to local."]
    });
  }

  if (!input.plan.approvedAt || input.plan.steps.some((step) => !step.approved)) {
    return localOutput({
      reason: "External worker rejected because the execution plan is not fully approved.",
      rejectedWorkers: [{
        reason: "Plan or one of its steps is missing approval.",
        workerType: requested
      }],
      requested,
      status: "fallback",
      warnings: ["Approval-first policy forced local fallback."]
    });
  }

  if (!requestedFlag(requested, flags)) {
    return localOutput({
      reason: `${requested} worker feature flag is disabled; falling back to local approved file runner.`,
      rejectedWorkers: [{
        reason: "Required feature flag is disabled.",
        workerType: requested
      }],
      requested,
      status: "fallback",
      warnings: [`${requested} worker is disabled by feature flag.`]
    });
  }

  if (needsSnapshot(requested) && !isSnapshotAvailable(input.snapshotStatus)) {
    return localOutput({
      reason: `${requested} worker requires an available Git snapshot; falling back to local.`,
      rejectedWorkers: [{
        reason: `Snapshot status was ${input.snapshotStatus ?? "missing"}.`,
        workerType: requested
      }],
      requested,
      status: "fallback",
      warnings: ["Missing snapshot blocks external workers."]
    });
  }

  if (input.riskLevel === "high" && !input.requestedWorkerType) {
    return localOutput({
      reason: "High-risk task without explicit external worker request stays local.",
      requested,
      status: "fallback",
      warnings: ["High-risk task stayed on local worker."]
    });
  }

  return externalOutput({
    reason: workerStrength(requested),
    requested,
    warnings: requested === "openhands"
      ? ["OpenHands sandbox is dry-run only in this phase."]
      : []
  });
}
