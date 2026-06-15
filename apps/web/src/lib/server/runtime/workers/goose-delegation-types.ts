import type { RuntimeWorkerType } from "@/lib/server/runtime/runtime-adapter-selector";
import type {
  RuntimeEvent,
  RuntimeSnapshotMetadata,
  RuntimeVerificationResult
} from "@/lib/server/runtime/runtime-types";

export type GooseDelegationStatus =
  | "blocked"
  | "planned"
  | "unavailable";

export type GooseDelegationMode =
  | "dry_run"
  | "planned_agent_delegation"
  | "planned_mcp_delegation"
  | "planned_worker_chain";

export type GooseDelegationPolicyValue = "deny" | "planned_allowlist";

export type GooseDelegationPolicy = {
  externalWorkspace: GooseDelegationPolicyValue;
  mcpToolExecution: GooseDelegationPolicyValue;
  network: GooseDelegationPolicyValue;
  packageInstall: GooseDelegationPolicyValue;
  shell: GooseDelegationPolicyValue;
};

export type GooseDelegationConfig = {
  delegationMode: GooseDelegationMode;
  enabled: boolean;
  policy: GooseDelegationPolicy;
  timeoutMs: number;
};

export type GooseDelegationTask = {
  candidateWorker: Exclude<RuntimeWorkerType, "goose" | "local"> | "mcp";
  dryRun: true;
  id: string;
  mcpToolsRequired: string[];
  purpose: string;
  title: string;
};

export type GooseDelegationContract = {
  auditEvents: RuntimeEvent[];
  candidateWorkers: Exclude<RuntimeWorkerType, "goose" | "local">[];
  delegationId: string;
  delegationMode: GooseDelegationMode;
  delegationPolicy: GooseDelegationPolicy;
  delegationStatus: GooseDelegationStatus;
  delegationTasks: GooseDelegationTask[];
  dryRun: true;
  mcpToolsRequired: string[];
  requestedWorkerType: "goose";
  selectedDelegate: "goose_dry_run_planner" | null;
  timeoutMs: number;
  verification: RuntimeVerificationResult;
  workspaceRoot: string;
};

export type GooseDelegationResult = {
  changedFiles: string[];
  delegation: GooseDelegationContract;
  durationMs: number;
  errors: string[];
  events: RuntimeEvent[];
  exitCode: null;
  snapshot: RuntimeSnapshotMetadata | null;
  snapshotId: string | null;
  status: GooseDelegationStatus;
  stderr: string;
  stdout: string;
  verification: RuntimeVerificationResult;
  workerType: "goose";
};
