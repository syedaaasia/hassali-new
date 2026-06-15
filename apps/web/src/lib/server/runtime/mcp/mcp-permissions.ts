import type {
  McpBlockedReason,
  McpToolCall,
  McpToolPermission,
  McpToolSchema
} from "@/lib/server/runtime/mcp/mcp-types";
import { getMcpToolSchema } from "@/lib/server/runtime/mcp/mcp-tool-registry";

export const defaultMcpToolPermission: McpToolPermission = {
  allowDatabaseMutation: false,
  allowDestructiveGit: false,
  allowExternalPaths: false,
  allowNetwork: false,
  allowPackageInstall: false,
  allowSandboxRun: false,
  allowShellExecution: false,
  requireApproval: true
};

function blocked(code: McpBlockedReason["code"], message: string): McpBlockedReason {
  return {
    code,
    message,
    severity: "high"
  };
}

function mergedPolicy(policy: Partial<McpToolPermission> = {}): McpToolPermission {
  return {
    ...defaultMcpToolPermission,
    ...policy,
    requireApproval: true
  };
}

function isExternalPath(value: unknown) {
  return typeof value === "string" && (/^[a-z]:[\\/]/i.test(value) || value.startsWith("/") || value.startsWith("\\") || value.includes(".."));
}

function containsShellLikeIntent(value: unknown) {
  if (typeof value !== "string") {
    return false;
  }

  return /\b(shell|terminal|bash|powershell|cmd\.exe|rm\s+-rf|del\s+\/|curl\s+|wget\s+)\b/i.test(value);
}

function containsPackageInstall(value: unknown) {
  if (typeof value !== "string") {
    return false;
  }

  return /\b(npm\s+install|pnpm\s+add|yarn\s+add|bun\s+add|pip\s+install)\b/i.test(value);
}

function inputValues(input: Record<string, unknown>) {
  return Object.values(input);
}

function validateInputShape(call: McpToolCall, schema: McpToolSchema) {
  const reasons: McpBlockedReason[] = [];

  for (const [key, expectedType] of Object.entries(schema.inputShape)) {
    const value = call.input[key];

    if (typeof value !== expectedType) {
      reasons.push(blocked("schema_validation_failed", `MCP tool '${schema.name}' expected '${key}' to be ${expectedType}.`));
    }
  }

  return reasons;
}

export function validateMcpToolCall(
  call: McpToolCall,
  policyInput: Partial<McpToolPermission> = {}
): {
  blockedReasons: McpBlockedReason[];
  schema: McpToolSchema | null;
} {
  const policy = mergedPolicy(policyInput);
  const schema = getMcpToolSchema(call.toolName);
  const reasons: McpBlockedReason[] = [];

  if (!schema) {
    return {
      blockedReasons: [blocked("unknown_tool", `Unknown MCP tool '${call.toolName}'.`)],
      schema: null
    };
  }

  if (policy.requireApproval && schema.requiresApproval && !call.approved) {
    reasons.push(blocked("tool_not_approved", `MCP tool '${schema.name}' requires approval.`));
  }

  reasons.push(...validateInputShape(call, schema));

  if (schema.networkAccess && !policy.allowNetwork) {
    reasons.push(blocked("network_blocked", `MCP tool '${schema.name}' requires network access, which is disabled by default.`));
  }

  if (schema.mutatesDatabase && !policy.allowDatabaseMutation) {
    reasons.push(blocked("database_mutation_blocked", `MCP tool '${schema.name}' can mutate database state and is blocked by default.`));
  }

  if (schema.category === "sandbox" && !policy.allowSandboxRun) {
    reasons.push(blocked("sandbox_blocked", "Sandbox execution is blocked by default."));
  }

  if (schema.category === "git" && !policy.allowDestructiveGit && /delete|reset|clean|push|pull|merge|rebase/i.test(String(call.input.command ?? call.input.action ?? ""))) {
    reasons.push(blocked("destructive_git_blocked", "Destructive Git operations are blocked by default."));
  }

  for (const value of inputValues(call.input)) {
    if (!policy.allowExternalPaths && isExternalPath(value)) {
      reasons.push(blocked("external_path_blocked", "External or traversal paths are blocked by default."));
    }

    if (!policy.allowShellExecution && containsShellLikeIntent(value)) {
      reasons.push(blocked("shell_execution_blocked", "Shell-like MCP tool input is blocked by default."));
    }

    if (!policy.allowPackageInstall && containsPackageInstall(value)) {
      reasons.push(blocked("package_install_blocked", "Package installation through MCP tools is blocked by default."));
    }
  }

  return {
    blockedReasons: reasons,
    schema
  };
}
