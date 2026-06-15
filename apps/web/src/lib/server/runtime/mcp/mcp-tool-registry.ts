import type {
  McpRegistryEntry,
  McpServerConfig,
  McpServerId,
  McpToolName,
  McpToolSchema
} from "@/lib/server/runtime/mcp/mcp-types";

export const defaultMcpServerId: McpServerId = "hassali-mcp-registry";

const defaultToolSchemas: McpToolSchema[] = [
  {
    category: "filesystem",
    description: "Read a project file through a future approved filesystem tool.",
    inputShape: { path: "string" },
    mutatesDatabase: false,
    mutatesFiles: false,
    name: "read_file",
    networkAccess: false,
    requiresApproval: false
  },
  {
    category: "filesystem",
    description: "Write a project file through a future approved filesystem tool.",
    inputShape: { content: "string", path: "string" },
    mutatesDatabase: false,
    mutatesFiles: true,
    name: "write_file",
    networkAccess: false,
    requiresApproval: true
  },
  {
    category: "filesystem",
    description: "List project files through a future approved filesystem tool.",
    inputShape: { path: "string" },
    mutatesDatabase: false,
    mutatesFiles: false,
    name: "list_files",
    networkAccess: false,
    requiresApproval: false
  },
  {
    category: "filesystem",
    description: "Apply a patch through a future approved filesystem tool.",
    inputShape: { patch: "string", path: "string" },
    mutatesDatabase: false,
    mutatesFiles: true,
    name: "apply_patch",
    networkAccess: false,
    requiresApproval: true
  },
  {
    category: "git",
    description: "Read Git status through a future read-only Git tool.",
    inputShape: {},
    mutatesDatabase: false,
    mutatesFiles: false,
    name: "git_status",
    networkAccess: false,
    requiresApproval: false
  },
  {
    category: "browser",
    description: "Fetch a URL through a future approved browser/network tool.",
    inputShape: { url: "string" },
    mutatesDatabase: false,
    mutatesFiles: false,
    name: "browser_fetch",
    networkAccess: true,
    requiresApproval: true
  },
  {
    category: "database",
    description: "Run a future database query tool.",
    inputShape: { query: "string", readonly: "boolean" },
    mutatesDatabase: true,
    mutatesFiles: false,
    name: "database_query",
    networkAccess: false,
    requiresApproval: true
  },
  {
    category: "design",
    description: "Read future design-tool context such as Figma or Penpot.",
    inputShape: { resourceId: "string" },
    mutatesDatabase: false,
    mutatesFiles: false,
    name: "design_read",
    networkAccess: true,
    requiresApproval: true
  },
  {
    category: "sandbox",
    description: "Run a future sandboxed command or job.",
    inputShape: { command: "string" },
    mutatesDatabase: false,
    mutatesFiles: true,
    name: "sandbox_run",
    networkAccess: false,
    requiresApproval: true
  },
  {
    category: "worker",
    description: "Delegate to a future approved worker adapter.",
    inputShape: { task: "string", workerType: "string" },
    mutatesDatabase: false,
    mutatesFiles: true,
    name: "worker_delegate",
    networkAccess: false,
    requiresApproval: true
  }
];

export function createDefaultMcpRegistry(serverId: McpServerId = defaultMcpServerId): McpRegistryEntry[] {
  return defaultToolSchemas.map((tool) => ({
    serverId,
    tool
  }));
}

export function createDefaultMcpServerConfig(serverId: McpServerId = defaultMcpServerId): McpServerConfig {
  return {
    enabled: false,
    id: serverId,
    label: "Hassali MCP registry placeholder",
    toolNames: defaultToolSchemas.map((tool) => tool.name)
  };
}

export function getMcpToolSchema(
  toolName: string,
  registry: McpRegistryEntry[] = createDefaultMcpRegistry()
): McpToolSchema | null {
  return registry.find((entry) => entry.tool.name === toolName)?.tool ?? null;
}

export function isKnownMcpToolName(value: string): value is McpToolName {
  return Boolean(getMcpToolSchema(value));
}
