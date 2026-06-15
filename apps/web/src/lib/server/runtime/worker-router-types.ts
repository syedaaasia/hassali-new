import type { ApprovedExecutionPlan } from "@/lib/server/runtime/runtime-types";
import type { RuntimeWorkerType } from "@/lib/server/runtime/runtime-adapter-selector";

export type WorkerRouterProductMode = "ASK" | "CODE" | "WEBSITE";

export type WorkerRouterSnapshotStatus = "available" | "failed" | "missing" | "unavailable";

export type WorkerRouterRiskLevel = "high" | "low" | "medium";

export type WorkerRouterFeatureFlags = {
  aider: boolean;
  opencode: boolean;
  openhands: boolean;
};

export type WorkerRouterInput = {
  featureFlags?: Partial<WorkerRouterFeatureFlags>;
  plan: ApprovedExecutionPlan;
  productMode: WorkerRouterProductMode;
  projectId: string;
  proposalMetadata?: Record<string, unknown>;
  requestedWorkerType?: RuntimeWorkerType | string | null;
  riskLevel?: WorkerRouterRiskLevel;
  snapshotStatus?: WorkerRouterSnapshotStatus;
  taskKind?: string;
  workspaceRoot: string;
};

export type RejectedWorker = {
  reason: string;
  workerType: RuntimeWorkerType | "goose" | "unknown";
};

export type WorkerRouterOutput = {
  confidence: number;
  fallbackWorkerType: RuntimeWorkerType | null;
  isDryRun: boolean;
  isExternalWorker: boolean;
  rejectedWorkers: RejectedWorker[];
  requestedWorkerType: RuntimeWorkerType | "goose" | "unknown" | null;
  requiresFeatureFlag: boolean;
  routerStatus: "fallback" | "selected" | "warning";
  routerWarnings: string[];
  selectedWorkerType: RuntimeWorkerType;
  selectionReason: string;
};
