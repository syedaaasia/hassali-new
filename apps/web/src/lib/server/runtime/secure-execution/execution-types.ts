import type { ProjectApprovalPolicy } from "@/lib/approval-policy";

export type ExecutionMode = "ASK" | "CODE" | "GROWTH" | "WEBSITE";

export type ExecutionCapability =
  | "git.read"
  | "media.inspect"
  | "media.transform"
  | "ocr.extract"
  | "python.deterministic"
  | "python.project"
  | "repository.verify";

export type ExecutionRisk = "critical" | "high" | "low" | "medium";

export type ExecutionCommandProvenance = {
  evidence: string;
  source: "hassali-tool-adapter" | "repository-inspector";
};

export type ExecutionScope = {
  allowedInputs: string[];
  allowedOutputs: string[];
  kind: "project" | "task-temp";
  root: string;
};

export type ExecutionRequest = {
  abortSignal?: AbortSignal;
  actor: {
    externalUserId: string;
    projectId: string | null;
  };
  capability: ExecutionCapability;
  command: {
    args: string[];
    executable: string;
    provenance: ExecutionCommandProvenance;
  };
  cwd: string;
  expectedWorkspaceFingerprint?: string;
  grantId: string;
  id: string;
  maxOutputBytes?: number;
  mode: ExecutionMode;
  mutation: "none" | "project" | "temporary";
  network: "external" | "loopback" | "none";
  risk: ExecutionRisk;
  scope: ExecutionScope;
  timeoutMs: number;
};

export type ExecutionFailureCode =
  | "approval-required"
  | "capability-unavailable"
  | "command-not-allowed"
  | "environment-unavailable"
  | "grant-invalid"
  | "grant-expired"
  | "grant-scope-mismatch"
  | "hard-deny"
  | "network-not-enforced"
  | "path-blocked"
  | "process-failed"
  | "process-teardown-failed"
  | "stale-workspace"
  | "unexpected-mutation";

export type ExecutionAuditEvent = {
  at: string;
  code: string;
  requestId: string;
  summary: string;
};

export type ExecutionIsolation = {
  environment: "allowlist";
  filesystem: "validated-paths";
  level: "process-bounded";
  network: "policy-only";
  osEnforced: false;
  processTree: "owned-process-tree";
};

export type ExecutionResult = {
  audit: ExecutionAuditEvent[];
  command: {
    args: string[];
    executable: string;
    provenance: ExecutionCommandProvenance;
  };
  durationMs: number;
  exitCode: number | null;
  failure: {
    code: ExecutionFailureCode;
    message: string;
  } | null;
  finishedAt: string;
  isolation: ExecutionIsolation;
  mutation: {
    afterFingerprint: string | null;
    beforeFingerprint: string | null;
    changedPaths: string[];
    state: "expected" | "none" | "unexpected" | "unknown";
  };
  output: {
    stderr: string;
    stdout: string;
    truncated: boolean;
  };
  requestId: string;
  resources: {
    cpuLimit: null;
    memoryLimitBytes: null;
    outputLimitBytes: number;
    timeoutMs: number;
  };
  signal: string | null;
  startedAt: string;
  status: "blocked" | "cancelled" | "failed" | "passed" | "timed-out" | "unavailable";
  tool: {
    executable: string;
    version: string | null;
  };
  warnings: string[];
};

export type ExecutionGrant = {
  approvalPolicy: ProjectApprovalPolicy;
  approvalSource: "inline_approval" | "standing_policy";
  capabilities: ExecutionCapability[];
  externalUserId: string;
  expiresAt: number;
  id: string;
  issuedAt: number;
  maxUses: number;
  mode: ExecutionMode;
  projectId: string | null;
  riskCeiling: Exclude<ExecutionRisk, "critical">;
  scopeKind: ExecutionScope["kind"];
  scopeRoot: string;
  uses: number;
};
