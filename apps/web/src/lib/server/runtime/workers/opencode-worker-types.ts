import type {
  ApprovedExecutionPlan,
  RuntimeEvent,
  RuntimeSnapshotMetadata,
  RuntimeVerificationResult
} from "@/lib/server/runtime/runtime-types";

export type OpenCodeWorkerStatus =
  | "blocked"
  | "completed"
  | "failed"
  | "timeout"
  | "unavailable";

export type OpenCodeWorkerType = "opencode";

export type OpenCodeWorkerConfig = {
  args: string[];
  command: string;
  enabled: boolean;
  timeoutMs: number;
};

export type OpenCodeWorkerInput = {
  config?: Partial<OpenCodeWorkerConfig>;
  plan: ApprovedExecutionPlan;
  sessionId: string;
};

export type OpenCodeWorkerExecution = {
  commandMissing: boolean;
  durationMs: number;
  exitCode: number | null;
  stderr: string;
  stdout: string;
  timedOut: boolean;
};

export type OpenCodeWorkerResult = {
  changedFiles: string[];
  durationMs: number;
  errors: string[];
  events: RuntimeEvent[];
  exitCode: number | null;
  snapshot: RuntimeSnapshotMetadata | null;
  snapshotId: string | null;
  status: OpenCodeWorkerStatus;
  stderr: string;
  stdout: string;
  verification: RuntimeVerificationResult | null;
  workerType: OpenCodeWorkerType;
};
