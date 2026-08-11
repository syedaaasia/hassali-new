import type { ChangeLedger, DeliveryReadiness } from "../verification-recovery/verification-types";

export type LiveExecutionTaskStatus =
  | "blocked"
  | "cancelled"
  | "completed"
  | "failed"
  | "queued"
  | "running"
  | "waiting";

export type ExecutionTimelineStage =
  | "approval"
  | "delivery"
  | "execution"
  | "git"
  | "inspection"
  | "planning"
  | "repair"
  | "review"
  | "runtime"
  | "verification";

export type ExecutionTimelineStatus =
  | "active"
  | "blocked"
  | "cancelled"
  | "complete"
  | "failed"
  | "pending"
  | "warning";

export type ExecutionTimelineEvent = {
  artifact?: { kind: string; label: string; path?: string } | null;
  blocking?: boolean;
  command?: { id: string; label: string } | null;
  detail?: string | null;
  durationMs?: number | null;
  execution?: { capability: string; scope: string } | null;
  id: string;
  progress?: { current: number; total: number } | null;
  sequence: number;
  source: "approval" | "delivery" | "git" | "orchestrator" | "review" | "runtime" | "tool" | "verification";
  stage: ExecutionTimelineStage;
  status: ExecutionTimelineStatus;
  taskId: string;
  timestamp: string;
  title: string;
  tool?: { name: string; status?: string } | null;
  userAction?: { action: string; label: string; required: boolean } | null;
  warning?: string | null;
};

export type LiveTaskOutputChunk = {
  commandId: string | null;
  id: string;
  sequence: number;
  stream: "stderr" | "stdout" | "system";
  taskId: string;
  text: string;
  timestamp: string;
  truncated: boolean;
};

export type GitDeliveryState = {
  branch: string | null;
  commitEligible: boolean;
  commitReason: string;
  diffPreview: string;
  diffSummary: string;
  head: string | null;
  repositoryAvailable: boolean;
  taskOwnedPaths: string[];
  userOwnedPaths: string[];
  warnings: string[];
  worktreeStatus: "clean" | "dirty" | "unavailable";
};

export type VerifiedDeliveryProjection = {
  artifacts: Array<{ kind: "file" | "preview" | "report" | "zip"; label: string; path?: string }>;
  changedFiles: string[];
  gitEligible: boolean;
  manualChecks: string[];
  pushAuthorized: false;
  status: "blocked" | "cancelled" | "failed" | "partial" | "verified-ready" | "verified-with-warnings";
  summary: string;
  warnings: string[];
};

export type LiveExecutionTaskSnapshot = {
  cancellable: boolean;
  completedAt: string | null;
  createdAt: string;
  delivery: VerifiedDeliveryProjection | null;
  expiresAt: string;
  git: GitDeliveryState | null;
  kind: "code_execution" | "dev_server" | "verification";
  mode: "CODE";
  objective: string;
  output: LiveTaskOutputChunk[];
  outputTruncated: boolean;
  projectId: string;
  proposalId: string | null;
  startedAt: string | null;
  status: LiveExecutionTaskStatus;
  taskId: string;
  timeline: ExecutionTimelineEvent[];
  updatedAt: string;
};

export type LiveExecutionTaskDeliveryContext = {
  changeLedger: ChangeLedger;
  delivery: DeliveryReadiness;
};
