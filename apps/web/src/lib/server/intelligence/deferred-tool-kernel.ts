import type { IntelligenceProductMode } from "./skill-kernel";

export type ToolEffect = "DESTRUCTIVE" | "EXTERNAL_MUTATION" | "LOCAL_MUTATION" | "READ_ONLY";
export type ToolAvailability = "available" | "permission_required" | "unavailable";

export type DeferredToolMetadata = {
  availability: ToolAvailability;
  description: string;
  effect: ToolEffect;
  modes: IntelligenceProductMode[];
  name: string;
  semanticTriggers: string[];
};

export type DeferredToolSchema = {
  input: Record<string, unknown>;
  name: string;
  output: Record<string, unknown>;
};

export type DeferredToolSelection = {
  discoveredTools: DeferredToolMetadata[];
  exactSelection: boolean;
  loadedSchemas: DeferredToolSchema[];
  schemaLoadCount: number;
  warnings: string[];
};

type ToolDefinition = DeferredToolMetadata & {
  loadSchema: () => DeferredToolSchema;
};

const toolDefinitions: ToolDefinition[] = [
  {
    availability: "available",
    description: "Read one selected workspace file after project and path validation.",
    effect: "READ_ONLY",
    loadSchema: () => ({
      input: { path: { type: "string" }, projectId: { type: "string" } },
      name: "workspace.read_file",
      output: { content: { type: "string" }, path: { type: "string" } }
    }),
    modes: ["ASK", "CODE", "WEBSITE"],
    name: "workspace.read_file",
    semanticTriggers: ["read file", "inspect file", "active file", "source code"]
  },
  {
    availability: "permission_required",
    description: "Inspect a rendered browser page for visible state, console errors, and layout.",
    effect: "READ_ONLY",
    loadSchema: () => ({
      input: { url: { type: "string" }, viewport: { type: "string" } },
      name: "browser.inspect",
      output: { consoleErrors: { type: "array" }, observations: { type: "array" } }
    }),
    modes: ["ASK", "CODE", "WEBSITE"],
    name: "browser.inspect",
    semanticTriggers: ["browser", "responsive", "rendered page", "console error", "visual"]
  },
  {
    availability: "permission_required",
    description: "Reload an approved static preview without running arbitrary commands.",
    effect: "LOCAL_MUTATION",
    loadSchema: () => ({
      input: { projectId: { type: "string" }, proposalId: { type: "string" } },
      name: "preview.reload",
      output: { status: { type: "string" } }
    }),
    modes: ["CODE", "WEBSITE"],
    name: "preview.reload",
    semanticTriggers: ["reload preview", "refresh preview"]
  },
  {
    availability: "unavailable",
    description: "Inspect Git status. Arbitrary terminal execution is not connected to product chat.",
    effect: "READ_ONLY",
    loadSchema: () => ({
      input: { projectId: { type: "string" } },
      name: "git.status",
      output: { paths: { type: "array" } }
    }),
    modes: ["ASK", "CODE", "WEBSITE"],
    name: "git.status",
    semanticTriggers: ["git status", "working tree", "changed files"]
  },
  {
    availability: "unavailable",
    description: "Query a project database through an approved read-only connection.",
    effect: "READ_ONLY",
    loadSchema: () => ({
      input: { query: { type: "string" } },
      name: "database.query",
      output: { rows: { type: "array" } }
    }),
    modes: ["ASK", "CODE"],
    name: "database.query",
    semanticTriggers: ["query database", "database rows", "sql data"]
  },
  {
    availability: "unavailable",
    description: "Send an external message only with explicit recipient, content, and approval.",
    effect: "EXTERNAL_MUTATION",
    loadSchema: () => ({
      input: { content: { type: "string" }, recipient: { type: "string" } },
      name: "external.send_message",
      output: { messageId: { type: "string" } }
    }),
    modes: ["ASK"],
    name: "external.send_message",
    semanticTriggers: ["send message", "email this", "notify customer"]
  }
];

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9_.]+/g, " ").trim();
}

function exactToolNames(prompt: string) {
  const match = prompt.match(/\bselect:\s*([a-z0-9_.-]+(?:\s*,\s*[a-z0-9_.-]+)*)/i);
  if (!match) return [];
  return Array.from(new Set(match[1].split(",").map((name) => name.trim().toLowerCase()).filter(Boolean)));
}

function semanticScore(tool: ToolDefinition, query: string, mode: IntelligenceProductMode) {
  if (!tool.modes.includes(mode)) return 0;
  const normalized = normalize(query);
  let score = normalized.includes(tool.name.toLowerCase()) ? 10 : 0;
  for (const trigger of tool.semanticTriggers) {
    if (normalized.includes(normalize(trigger))) score += 3 + trigger.split(" ").length;
  }
  return score;
}

function metadataForTool(tool: ToolDefinition): DeferredToolMetadata {
  return {
    availability: tool.availability,
    description: tool.description,
    effect: tool.effect,
    modes: tool.modes,
    name: tool.name,
    semanticTriggers: tool.semanticTriggers
  };
}

export function discoverDeferredTools(input: {
  mode: IntelligenceProductMode;
  query: string;
}): DeferredToolSelection {
  const exactNames = exactToolNames(input.query);
  const exactSelection = exactNames.length > 0;
  const candidates = exactSelection
    ? exactNames.map((name) => toolDefinitions.find((tool) => tool.name === name)).filter((tool): tool is ToolDefinition => Boolean(tool))
    : toolDefinitions
      .map((tool) => ({ score: semanticScore(tool, input.query, input.mode), tool }))
      .filter((candidate) => candidate.score >= 4)
      .sort((a, b) => b.score - a.score || a.tool.name.localeCompare(b.tool.name))
      .slice(0, 5)
      .map((candidate) => candidate.tool);
  const cache = new Map<string, DeferredToolSchema>();
  const warnings: string[] = [];

  for (const name of exactNames) {
    if (!toolDefinitions.some((tool) => tool.name === name)) warnings.push(`Unknown deferred tool: ${name}`);
  }

  for (const tool of candidates) {
    if (tool.availability === "unavailable") {
      warnings.push(`${tool.name} is not available in this product runtime.`);
      continue;
    }
    if (!cache.has(tool.name)) cache.set(tool.name, tool.loadSchema());
  }

  return {
    discoveredTools: candidates.map(metadataForTool),
    exactSelection,
    loadedSchemas: [...cache.values()],
    schemaLoadCount: cache.size,
    warnings
  };
}

export function listDeferredToolMetadata() {
  return toolDefinitions.map(metadataForTool);
}
