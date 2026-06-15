export type McpServerId = string;

export type McpToolName =
  | "apply_patch"
  | "browser_fetch"
  | "database_query"
  | "design_read"
  | "git_status"
  | "list_files"
  | "read_file"
  | "sandbox_run"
  | "worker_delegate"
  | "write_file";

export type McpToolCategory =
  | "browser"
  | "database"
  | "deployment"
  | "design"
  | "filesystem"
  | "git"
  | "sandbox"
  | "unknown"
  | "worker";

export type McpToolInput = Record<string, unknown>;

export type McpToolResult = {
  content: unknown;
  dryRun: boolean;
  metadata?: Record<string, string | number | boolean | null>;
};

export type McpToolPermission = {
  allowDatabaseMutation: boolean;
  allowDestructiveGit: boolean;
  allowExternalPaths: boolean;
  allowNetwork: boolean;
  allowPackageInstall: boolean;
  allowSandboxRun: boolean;
  allowShellExecution: boolean;
  requireApproval: true;
};

export type McpToolSchema = {
  category: McpToolCategory;
  description: string;
  inputShape: Record<string, "boolean" | "number" | "object" | "string">;
  mutatesDatabase: boolean;
  mutatesFiles: boolean;
  name: McpToolName;
  networkAccess: boolean;
  requiresApproval: boolean;
};

export type McpServerConfig = {
  enabled: boolean;
  id: McpServerId;
  label: string;
  toolNames: McpToolName[];
};

export type McpRegistryEntry = {
  serverId: McpServerId;
  tool: McpToolSchema;
};

export type McpToolCall = {
  approved: boolean;
  callId: string;
  input: McpToolInput;
  serverId: McpServerId;
  toolName: McpToolName | string;
};

export type McpBlockedReasonCode =
  | "database_mutation_blocked"
  | "destructive_git_blocked"
  | "external_path_blocked"
  | "network_blocked"
  | "package_install_blocked"
  | "sandbox_blocked"
  | "schema_validation_failed"
  | "shell_execution_blocked"
  | "tool_not_approved"
  | "unknown_tool";

export type McpBlockedReason = {
  code: McpBlockedReasonCode;
  message: string;
  severity: "high" | "medium";
};

export type McpAuditEvent = {
  callId?: string;
  createdAt: string;
  message: string;
  serverId?: McpServerId;
  toolName?: string;
  type:
    | "mcp_call_blocked"
    | "mcp_call_dry_run"
    | "mcp_call_received"
    | "mcp_registry_lookup";
};

export type McpToolCallResult = {
  auditEvents: McpAuditEvent[];
  blockedReasons: McpBlockedReason[];
  ok: boolean;
  result: McpToolResult | null;
};

export type McpAdapterResult = {
  auditEvents: McpAuditEvent[];
  blockedReasons: McpBlockedReason[];
  ok: boolean;
  result: McpToolResult | null;
};

export type McpAdapter = {
  callTool: (call: McpToolCall, policy?: Partial<McpToolPermission>) => Promise<McpAdapterResult>;
  getToolSchema: (toolName: string) => McpToolSchema | null;
  listTools: () => McpRegistryEntry[];
};
