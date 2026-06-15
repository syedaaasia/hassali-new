export type RuntimeToolName =
  | "apply_patch"
  | "list_files"
  | "read_file"
  | "restart_preview"
  | "run_typecheck"
  | "verify_files"
  | "write_file";

export type RuntimeTool = {
  description: string;
  mutatesFiles: boolean;
  name: RuntimeToolName;
  requiresApproval: boolean;
};

export type RuntimeBlockedReasonCode =
  | "external_path_blocked"
  | "missing_project_id"
  | "missing_snapshot"
  | "missing_workspace_root"
  | "package_install_blocked"
  | "runtime_worker_timeout"
  | "runtime_worker_unavailable"
  | "shell_command_blocked"
  | "unapproved_step"
  | "unknown_tool"
  | "unsafe_path"
  | "write_not_allowed";

export type RuntimeBlockedReason = {
  code: RuntimeBlockedReasonCode;
  message: string;
  severity: "high" | "medium";
};

export type RuntimePermissionPolicy = {
  allowExternalPaths: false;
  allowPackageInstalls: false;
  allowShellCommands: false;
  allowedTools: RuntimeToolName[];
  requireApproval: true;
  requireProjectId: true;
  requireWorkspaceRoot: true;
};

export type ApprovedExecutionStep = {
  approved: boolean;
  content?: string;
  id: string;
  path?: string;
  summary: string;
  tool: RuntimeToolName;
};

export type ApprovedExecutionPlan = {
  approvedAt?: string;
  approvedByUserId?: string;
  createdAt: string;
  id: string;
  mode: "CODE" | "WEBSITE";
  projectId: string;
  steps: ApprovedExecutionStep[];
  summary: string;
  workspaceRoot: string;
};

export type RuntimeSession = {
  adapterName: string;
  createdAt: string;
  id: string;
  projectId: string;
  status: "completed" | "failed" | "idle" | "running" | "stopped";
  workspaceRoot: string;
};

export type RuntimeEvent = {
  createdAt: string;
  message: string;
  metadata?: Record<string, string | number | boolean | null>;
  sessionId: string;
  stepId?: string;
  type:
    | "blocked"
    | "completed"
    | "error"
    | "aider_worker_completed"
    | "aider_worker_failed"
    | "aider_worker_started"
    | "aider_worker_timeout"
    | "aider_worker_unavailable"
    | "file_written"
    | "opencode_worker_completed"
    | "opencode_worker_failed"
    | "opencode_worker_started"
    | "opencode_worker_timeout"
    | "opencode_worker_unavailable"
    | "openhands_sandbox_blocked"
    | "openhands_sandbox_failed"
    | "openhands_sandbox_planned"
    | "openhands_sandbox_unavailable"
    | "openhands_sandbox_verified"
    | "plan_received"
    | "rollback_applied"
    | "rollback_available"
    | "rollback_failed"
    | "session_started"
    | "session_stopped"
    | "snapshot_changed_files"
    | "snapshot_created"
    | "snapshot_unavailable"
    | "step_skipped"
    | "step_started"
    | "tool_noop"
    | "verification";
};

export type RuntimeVerificationResult = {
  checkedAt: string;
  details: string[];
  ok: boolean;
};

export type RuntimeSnapshotMetadata = {
  afterRef: string | null;
  beforeRef: string | null;
  changedFiles: string[];
  rollbackApplied: boolean;
  rollbackAvailable: boolean;
  snapshotId: string;
  snapshotStatus: "available" | "failed" | "unavailable";
};

export type RuntimeAdapterResult = {
  blockedReasons: RuntimeBlockedReason[];
  events: RuntimeEvent[];
  ok: boolean;
  session: RuntimeSession;
  snapshot?: RuntimeSnapshotMetadata;
  verification?: RuntimeVerificationResult;
  workerResult?: unknown;
};
