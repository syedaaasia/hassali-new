import type {
  RuntimeEvent,
  RuntimeSnapshotMetadata,
  RuntimeVerificationResult
} from "@/lib/server/runtime/runtime-types";

export type OpenHandsSandboxIsolationMode =
  | "none"
  | "planned_container"
  | "planned_process"
  | "planned_remote";

export type OpenHandsSandboxStatus =
  | "blocked"
  | "planned"
  | "unavailable";

export type OpenHandsSandboxPolicy = "deny" | "planned_allowlist";

export type OpenHandsSandboxResourceLimits = {
  cpuCores: number;
  memoryMb: number;
  timeoutMs: number;
};

export type OpenHandsSandboxConfig = {
  commandPolicy: OpenHandsSandboxPolicy;
  enabled: boolean;
  isolationMode: OpenHandsSandboxIsolationMode;
  networkPolicy: OpenHandsSandboxPolicy;
  resourceLimits: OpenHandsSandboxResourceLimits;
  timeoutMs: number;
};

export type OpenHandsSandboxContract = {
  allowedFutureOperations: string[];
  allowedMounts: string[];
  auditEvents: RuntimeEvent[];
  commandPolicy: OpenHandsSandboxPolicy;
  deniedMounts: string[];
  dryRun: true;
  isolationMode: OpenHandsSandboxIsolationMode;
  networkPolicy: OpenHandsSandboxPolicy;
  resourceLimits: OpenHandsSandboxResourceLimits;
  sandboxId: string;
  sandboxStatus: OpenHandsSandboxStatus;
  timeoutMs: number;
  verification: RuntimeVerificationResult;
  workspaceRoot: string;
};

export type OpenHandsSandboxResult = {
  changedFiles: string[];
  durationMs: number;
  errors: string[];
  events: RuntimeEvent[];
  exitCode: null;
  sandbox: OpenHandsSandboxContract;
  snapshot: RuntimeSnapshotMetadata | null;
  snapshotId: string | null;
  status: OpenHandsSandboxStatus;
  stderr: string;
  stdout: string;
  verification: RuntimeVerificationResult;
  workerType: "openhands";
};
