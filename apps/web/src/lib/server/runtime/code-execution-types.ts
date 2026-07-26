export type CodeExecutionPolicy = "AUTOPILOT_EXPERIMENTAL" | "CALM" | "FLOW";

export type CodeExecutionState =
  | "BLOCKED"
  | "CANCELLED"
  | "COMPLETE"
  | "COMPLETE_WITH_LIMITATIONS"
  | "DIAGNOSING"
  | "EXECUTING"
  | "FAILED"
  | "INSPECTING"
  | "REPAIRING"
  | "REVIEWING"
  | "RUNNING"
  | "TESTING"
  | "VERIFYING";

export type CodeFailureType =
  | "API_ERROR"
  | "AUTH_ERROR"
  | "BROWSER_ERROR"
  | "BUILD_ERROR"
  | "CONSOLE_ERROR"
  | "DEPENDENCY_ERROR"
  | "ENVIRONMENT_ERROR"
  | "EXTERNAL_SERVICE_ERROR"
  | "NETWORK_ERROR"
  | "PERMISSION_ERROR"
  | "PROCESS_TEARDOWN_ERROR"
  | "PROJECT_SCOPE_ERROR"
  | "PROVIDER_ERROR"
  | "RUNTIME_ERROR"
  | "TEST_FAILURE"
  | "TEST_HARNESS_ERROR"
  | "TOOL_ERROR"
  | "TYPE_ERROR"
  | "UNKNOWN";

export type CodeCommandKind = "build" | "lint" | "test" | "typecheck";

export type CodeCommandSpec = {
  args: string[];
  command: string;
  effect: "READ_ONLY" | "REVERSIBLE_LOCAL";
  id: string;
  kind: CodeCommandKind;
  label: string;
  scriptName: string;
  timeoutMs: number;
};

export type CodeCommandResult = {
  commandId: string;
  durationMs: number;
  exitCode: number | null;
  failureType: CodeFailureType | null;
  outputExcerpt: string;
  signal: string | null;
  status: "CANCELLED" | "FAILED" | "PASSED";
};

export type CodeRepositoryUnderstanding = {
  architectureFacts: string[];
  commands: CodeCommandSpec[];
  dependencies: string[];
  entrypoints: string[];
  fingerprint: string;
  framework: string;
  packageManager: "bun" | "npm" | "pnpm" | "unknown" | "yarn";
  relevantDirectories: string[];
  scripts: Record<string, string>;
  sourceFileCount: number;
  warnings: string[];
};

export type CodeFailureEvidence = {
  affectedComponent: string | null;
  commandId: string;
  evidence: string;
  exitCode: number | null;
  failureType: CodeFailureType;
  signature: string;
  target: string;
};

export type CodeRepairChange = {
  content: string;
  path: string;
};

export type CodeRepairPlan = {
  changes: CodeRepairChange[];
  evidenceToRerun: string[];
  expectedEffect: string;
  hypothesis: string;
  repairTarget: string;
  risk: "high" | "low" | "medium";
};

export type CodeRepairProviderResult =
  | {
      failureCategory: null;
      ok: true;
      plan: CodeRepairPlan;
      provider: string;
      resolvedModel: string;
    }
  | {
      failureCategory: CodeFailureType;
      message: string;
      ok: false;
      provider: string | null;
      resolvedModel: string | null;
    };

export type CodeRepairProvider = {
  proposeRepair(input: {
    approvedPaths: string[];
    attempt: number;
    failure: CodeFailureEvidence;
    files: Record<string, string>;
    objective: string;
    previousAttempts: CodeRepairAttempt[];
    repository: CodeRepositoryUnderstanding;
    selectedModel: string;
  }): Promise<CodeRepairProviderResult>;
};

export type CodeRepairAttempt = {
  attempt: number;
  changedFiles: string[];
  failureBefore: CodeFailureEvidence;
  finishedAt: string;
  hypothesis: string;
  outcome:
    | "APPLIED"
    | "CANCELLED"
    | "FAILED"
    | "REJECTED_REPEAT"
    | "ROLLED_BACK_UNRESOLVED"
    | "ROLLED_BACK_WORSE"
    | "SCOPE_EXPANSION_REQUIRED"
    | "SUCCEEDED";
  repairSignature: string;
  rollbackUsed: boolean;
  startedAt: string;
  verificationAfter: CodeCommandResult[];
};

export type CodeProgressEvent = {
  at: string;
  label: string;
  state: CodeExecutionState;
  status: "active" | "complete" | "failed" | "pending";
};

export type CodeExecutionMetrics = {
  commandsExecuted: number;
  repairAttempts: number;
  repairsApplied: number;
  rollbackUsed: boolean;
  successfulAttempt: number | null;
  verificationOutcome: "FAILED" | "LIMITED" | "PASSED";
};

export type CodeExecutionReport = {
  approvedScope: string[];
  commandResults: CodeCommandResult[];
  completionStatus: "BLOCKED" | "CANCELLED" | "COMPLETE_VERIFIED" | "COMPLETE_WITH_LIMITATIONS" | "FAILED";
  executionPolicy: CodeExecutionPolicy;
  finalFileContents: Record<string, string>;
  finishedAt: string;
  limitations: string[];
  metrics: CodeExecutionMetrics;
  modifiedFiles: string[];
  objective: string;
  progress: CodeProgressEvent[];
  projectId: string;
  proposalId: string;
  repairAttempts: CodeRepairAttempt[];
  repository: CodeRepositoryUnderstanding;
  resumableState: string;
  scopeExpansionRequired: string[];
  startedAt: string;
  state: CodeExecutionState;
  taskId: string;
};

export function normalizeCodeExecutionPolicy(value: unknown): CodeExecutionPolicy {
  if (value === "CALM" || value === "AUTOPILOT_EXPERIMENTAL") return value;
  return "FLOW";
}

export function repairBudgetForPolicy(policy: CodeExecutionPolicy) {
  if (policy === "CALM") return 1;
  if (policy === "AUTOPILOT_EXPERIMENTAL") return 3;
  return 2;
}
