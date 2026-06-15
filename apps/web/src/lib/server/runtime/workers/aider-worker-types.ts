import type {
  ApprovedExecutionPlan,
  RuntimeBlockedReason,
  RuntimeEvent,
  RuntimeSnapshotMetadata,
  RuntimeVerificationResult
} from "@/lib/server/runtime/runtime-types";

export type AiderWorkerStatus =
  | "blocked"
  | "completed"
  | "failed"
  | "timeout"
  | "unavailable";

export type AiderWorkerType = "aider";

export type AiderWorkerConfig = {
  args: string[];
  command: string;
  enabled: boolean;
  timeoutMs: number;
};

export type AiderWorkerInput = {
  config?: Partial<AiderWorkerConfig>;
  plan: ApprovedExecutionPlan;
  sessionId: string;
};

export type AiderWorkerExecution = {
  durationMs: number;
  exitCode: number | null;
  stderr: string;
  stdout: string;
  timedOut: boolean;
};

export type AiderWorkerResult = {
  changedFiles: string[];
  durationMs: number;
  errors: string[];
  events: RuntimeEvent[];
  exitCode: number | null;
  snapshot: RuntimeSnapshotMetadata | null;
  snapshotId: string | null;
  status: AiderWorkerStatus;
  stderr: string;
  stdout: string;
  verification: RuntimeVerificationResult | null;
  workerType: AiderWorkerType;
};

export type AiderRuntimeAdapterResult = {
  blockedReasons: RuntimeBlockedReason[];
  workerResult: AiderWorkerResult;
};
