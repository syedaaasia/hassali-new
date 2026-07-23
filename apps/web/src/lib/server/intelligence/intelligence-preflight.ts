import type { WorkspaceContextInput } from "@/lib/server/ai/workspace-context-engine";
import {
  buildIntelligenceContext,
  compactIntelligenceContext,
  type IntelligenceContext,
  type IntelligenceConversationMessage
} from "./context-kernel";
import {
  discoverDeferredTools,
  type DeferredToolSelection
} from "./deferred-tool-kernel";
import {
  buildIntelligencePlan,
  compactIntelligencePlan,
  type IntelligencePlan
} from "./plan-kernel";
import {
  selectAndLoadSkills,
  type IntelligenceProductMode,
  type SkillSelectionResult
} from "./skill-kernel";

export type IntelligencePreflight = {
  context: IntelligenceContext;
  fallback: boolean;
  latencyMs: number;
  plan: IntelligencePlan;
  providerContext: string;
  skills: SkillSelectionResult;
  tools: DeferredToolSelection;
};

const emptySkills: SkillSelectionResult = {
  collisions: [],
  explicitSkillIds: [],
  loadedSkills: [],
  missingSkillIds: [],
  rejectedSkills: [],
  selectedSkillIds: [],
  warnings: []
};

const emptyTools: DeferredToolSelection = {
  discoveredTools: [],
  exactSelection: false,
  loadedSchemas: [],
  schemaLoadCount: 0,
  warnings: []
};

function fallbackContext(): IntelligenceContext {
  const content = "Hassali preflight was unavailable. Preserve the current mode, approval, project-isolation, and no-mutation contracts.";
  return {
    budgetTokens: 0,
    compacted: false,
    compactedTaskState: null,
    estimatedTokens: Math.ceil(content.length / 4),
    injectionDetected: false,
    layers: [{
      content,
      estimatedTokens: Math.ceil(content.length / 4),
      provenance: "policy",
      trusted: true
    }],
    providerContext: "",
    secretRedactionApplied: false,
    sources: ["policy"],
    truncated: false
  };
}

export async function runIntelligencePreflight(input: {
  messages: IntelligenceConversationMessage[];
  mode: IntelligenceProductMode;
  model: string;
  prompt: string;
  workspace?: WorkspaceContextInput | null;
}): Promise<IntelligencePreflight> {
  const startedAt = Date.now();
  try {
    const plan = buildIntelligencePlan({ mode: input.mode, prompt: input.prompt, workspace: input.workspace });
    const [skills, tools] = await Promise.all([
      selectAndLoadSkills({ mode: input.mode, prompt: input.prompt }),
      Promise.resolve(discoverDeferredTools({ mode: input.mode, query: input.prompt }))
    ]);
    const context = buildIntelligenceContext({
      ...input,
      plan,
      skills,
      tools
    });

    return {
      context,
      fallback: false,
      latencyMs: Date.now() - startedAt,
      plan,
      providerContext: context.providerContext,
      skills,
      tools
    };
  } catch {
    const plan = buildIntelligencePlan({ mode: input.mode, prompt: input.prompt, workspace: input.workspace });
    const context = fallbackContext();
    return {
      context,
      fallback: true,
      latencyMs: Date.now() - startedAt,
      plan,
      providerContext: "",
      skills: emptySkills,
      tools: emptyTools
    };
  }
}

function headerValue(value: unknown) {
  return String(value ?? "").replace(/[^\x20-\x7E]/g, "").slice(0, 220);
}

export function createIntelligenceDebugHeaders(preflight: IntelligencePreflight): Record<string, string> {
  if (process.env.NODE_ENV === "production" && process.env.HASSALI_INTELLIGENCE_DEBUG !== "1") return {};

  return {
    "x-hassali-intelligence-compacted": headerValue(preflight.context.compacted),
    "x-hassali-intelligence-context-tokens": headerValue(preflight.context.estimatedTokens),
    "x-hassali-intelligence-fallback": headerValue(preflight.fallback),
    "x-hassali-intelligence-injection": headerValue(preflight.context.injectionDetected),
    "x-hassali-intelligence-latency": headerValue(preflight.latencyMs),
    "x-hassali-intelligence-plan": headerValue(preflight.plan.state),
    "x-hassali-intelligence-schemas": headerValue(preflight.tools.loadedSchemas.map((schema) => schema.name).join(",")),
    "x-hassali-intelligence-secret-redacted": headerValue(preflight.context.secretRedactionApplied),
    "x-hassali-intelligence-skills": headerValue(preflight.skills.loadedSkills.map((skill) => skill.metadata.id).join(",")),
    "x-hassali-intelligence-tools": headerValue(preflight.tools.discoveredTools.map((tool) => tool.name).join(",")),
    "x-hassali-intelligence-truncated": headerValue(preflight.context.truncated)
  };
}

export function withIntelligenceResponseHeaders(response: Response, preflight: IntelligencePreflight) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(createIntelligenceDebugHeaders(preflight))) headers.set(name, value);
  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText
  });
}

export function compactIntelligencePreflight(preflight: IntelligencePreflight) {
  return {
    context: compactIntelligenceContext(preflight.context),
    fallback: preflight.fallback,
    latencyMs: preflight.latencyMs,
    plan: compactIntelligencePlan(preflight.plan),
    skills: {
      loaded: preflight.skills.loadedSkills.map((skill) => skill.metadata.id),
      missing: preflight.skills.missingSkillIds,
      resources: preflight.skills.loadedSkills.flatMap((skill) => skill.resources.map((resource) => resource.path)),
      warnings: preflight.skills.warnings
    },
    tools: {
      discovered: preflight.tools.discoveredTools.map((tool) => ({
        availability: tool.availability,
        effect: tool.effect,
        name: tool.name
      })),
      schemas: preflight.tools.loadedSchemas.map((schema) => schema.name),
      warnings: preflight.tools.warnings
    }
  };
}
