import type {
  McpAdapter,
  McpAdapterResult,
  McpAuditEvent,
  McpRegistryEntry,
  McpToolCall,
  McpToolPermission,
  McpToolSchema
} from "@/lib/server/runtime/mcp/mcp-types";
import {
  createDefaultMcpRegistry,
  getMcpToolSchema
} from "@/lib/server/runtime/mcp/mcp-tool-registry";
import { validateMcpToolCall } from "@/lib/server/runtime/mcp/mcp-permissions";

function now() {
  return new Date().toISOString();
}

export function createMcpAuditEvent(input: Omit<McpAuditEvent, "createdAt">): McpAuditEvent {
  return {
    ...input,
    createdAt: now()
  };
}

export function createBlockedMcpAdapterResult(
  call: McpToolCall,
  message: string,
  policy?: Partial<McpToolPermission>
): McpAdapterResult {
  const validation = validateMcpToolCall(call, policy);

  return {
    auditEvents: [
      createMcpAuditEvent({
        callId: call.callId,
        message,
        serverId: call.serverId,
        toolName: call.toolName,
        type: "mcp_call_blocked"
      })
    ],
    blockedReasons: validation.blockedReasons,
    ok: false,
    result: null
  };
}

export class BaseMcpAdapter implements McpAdapter {
  protected registry: McpRegistryEntry[];

  constructor(registry: McpRegistryEntry[] = createDefaultMcpRegistry()) {
    this.registry = registry;
  }

  getToolSchema(toolName: string): McpToolSchema | null {
    return getMcpToolSchema(toolName, this.registry);
  }

  listTools(): McpRegistryEntry[] {
    return this.registry;
  }

  async callTool(call: McpToolCall, policy?: Partial<McpToolPermission>): Promise<McpAdapterResult> {
    return createBlockedMcpAdapterResult(
      call,
      "Base MCP adapter does not execute tools. Use a concrete dry-run or future server adapter.",
      policy
    );
  }
}
