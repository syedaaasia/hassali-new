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
  | "missing_workspace_root"
  | "package_install_blocked"
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
    | "file_written"
    | "plan_received"
    | "session_started"
    | "session_stopped"
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

export type RuntimeAdapterResult = {
  blockedReasons: RuntimeBlockedReason[];
  events: RuntimeEvent[];
  ok: boolean;
  session: RuntimeSession;
  verification?: RuntimeVerificationResult;
};
