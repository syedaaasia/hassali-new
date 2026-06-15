import { BaseMcpAdapter, createMcpAuditEvent } from "@/lib/server/runtime/mcp/mcp-adapter";
import { validateMcpToolCall } from "@/lib/server/runtime/mcp/mcp-permissions";
import type {
  McpAdapterResult,
  McpRegistryEntry,
  McpToolCall,
  McpToolPermission
} from "@/lib/server/runtime/mcp/mcp-types";

export class MockMcpAdapter extends BaseMcpAdapter {
  constructor(registry?: McpRegistryEntry[]) {
    super(registry);
  }

  async callTool(call: McpToolCall, policy?: Partial<McpToolPermission>): Promise<McpAdapterResult> {
    const validation = validateMcpToolCall(call, policy);
    const received = createMcpAuditEvent({
      callId: call.callId,
      message: `Mock MCP adapter received '${call.toolName}'.`,
      serverId: call.serverId,
      toolName: call.toolName,
      type: "mcp_call_received"
    });

    if (validation.blockedReasons.length > 0 || !validation.schema) {
      return {
        auditEvents: [
          received,
          createMcpAuditEvent({
            callId: call.callId,
            message: `Mock MCP adapter blocked '${call.toolName}'.`,
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

    return {
      auditEvents: [
        received,
        createMcpAuditEvent({
          callId: call.callId,
          message: `Mock MCP adapter dry-ran '${call.toolName}'.`,
          serverId: call.serverId,
          toolName: call.toolName,
          type: "mcp_call_dry_run"
        })
      ],
      blockedReasons: [],
      ok: true,
      result: {
        content: {
          input: call.input,
          toolName: call.toolName
        },
        dryRun: true,
        metadata: {
          category: validation.schema.category,
          mutatesDatabase: validation.schema.mutatesDatabase,
          mutatesFiles: validation.schema.mutatesFiles,
          networkAccess: validation.schema.networkAccess
        }
      }
    };
  }
}

export function createMockMcpAdapter(registry?: McpRegistryEntry[]) {
  return new MockMcpAdapter(registry);
}
