import type { WorkspaceContextInput } from "@/lib/server/ai/workspace-context-engine";
import type { BehavioralDecision } from "@/lib/server/ai/behavioral-intelligence";
import {
  createAgentPlan,
  type AgentPlan
} from "./agent-orchestration-kernel";
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
import {
  classifyTaskComplexity,
  type TaskComplexityDecision
} from "./task-complexity";
import {
  createVerificationPlan,
  type VerificationPlan
} from "./verification-kernel";

export type IntelligencePreflightTimings = {
  classificationMs: number;
  contextAssemblyMs: number;
  planningMs: number;
  skillSelectionMs: number;
  toolSelectionMs: number;
  totalMs: number;
};

export type IntelligencePreflight = {
  agentPlan: AgentPlan;
  complexity: TaskComplexityDecision;
  context: IntelligenceContext;
  fallback: boolean;
  latencyMs: number;
  plan: IntelligencePlan;
  providerContext: string;
  skills: SkillSelectionResult;
  timings: IntelligencePreflightTimings;
  tools: DeferredToolSelection;
  verificationPlan: VerificationPlan;
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

function fallbackComplexity(input: {
  mode: IntelligenceProductMode;
  prompt: string;
}) {
  return {
    class: "STANDARD",
    expectedVerificationDepth: "normal",
    projectContextSelected: input.mode !== "ASK",
    signals: ["classification_fallback"]
  } satisfies TaskComplexityDecision;
}

export async function runIntelligencePreflight(input: {
  finalAction?: Pick<
    BehavioralDecision,
    "answerOnly" | "finalDisposition" | "mutationIntent" | "planRequested"
  >;
  messages: IntelligenceConversationMessage[];
  mode: IntelligenceProductMode;
  model: string;
  projectId?: string | null;
  prompt: string;
  workspace?: WorkspaceContextInput | null;
}): Promise<IntelligencePreflight> {
  const startedAt = Date.now();
  let complexity: TaskComplexityDecision = fallbackComplexity(input);
  try {
    const classificationStartedAt = Date.now();
    complexity = classifyTaskComplexity(input);
    const classificationMs = Date.now() - classificationStartedAt;
    const workspace = complexity.projectContextSelected ? input.workspace : null;
    const nonMutatingFinalAction = Boolean(
      input.finalAction?.answerOnly &&
      ["answer", "clarify", "plan"].includes(input.finalAction.finalDisposition)
    );

    const planningStartedAt = Date.now();
    const plan = buildIntelligencePlan({
      answerOnly: nonMutatingFinalAction,
      mode: input.mode,
      mutationRequested: input.finalAction?.mutationIntent,
      planRequested: input.finalAction?.planRequested,
      prompt: input.prompt,
      workspace
    });
    const verificationPlan = createVerificationPlan({
      answerOnly: nonMutatingFinalAction,
      mode: input.mode,
      prompt: input.prompt
    });
    const agentPlan = createAgentPlan({
      mode: input.mode,
      parentMutationAllowed: false,
      projectId: input.projectId?.trim() || "unbound-project",
      prompt: input.prompt,
      taskComplexity: nonMutatingFinalAction ? "INSTANT" : complexity.class
    });
    const planningMs = Date.now() - planningStartedAt;

    let skillSelectionMs = 0;
    let toolSelectionMs = 0;
    const [skills, tools] = complexity.class === "INSTANT" || nonMutatingFinalAction
      ? [emptySkills, emptyTools] as const
      : await Promise.all([
          (async () => {
            const selectionStartedAt = Date.now();
            try {
              return await selectAndLoadSkills({ mode: input.mode, prompt: input.prompt });
            } finally {
              skillSelectionMs = Date.now() - selectionStartedAt;
            }
          })(),
          Promise.resolve().then(() => {
            const selectionStartedAt = Date.now();
            try {
              return discoverDeferredTools({ mode: input.mode, query: input.prompt });
            } finally {
              toolSelectionMs = Date.now() - selectionStartedAt;
            }
          })
        ]);

    const contextStartedAt = Date.now();
    const context = buildIntelligenceContext({
      ...input,
      plan,
      skills,
      tools,
      workspace
    });
    const contextAssemblyMs = Date.now() - contextStartedAt;
    const totalMs = Date.now() - startedAt;

    return {
      agentPlan,
      complexity,
      context,
      fallback: false,
      latencyMs: totalMs,
      plan,
      providerContext: context.providerContext,
      skills,
      timings: {
        classificationMs,
        contextAssemblyMs,
        planningMs,
        skillSelectionMs,
        toolSelectionMs,
        totalMs
      },
      tools,
      verificationPlan
    };
  } catch {
    const workspace = complexity.projectContextSelected ? input.workspace : null;
    const nonMutatingFinalAction = Boolean(
      input.finalAction?.answerOnly &&
      ["answer", "clarify", "plan"].includes(input.finalAction.finalDisposition)
    );
    const plan = buildIntelligencePlan({
      answerOnly: nonMutatingFinalAction,
      mode: input.mode,
      mutationRequested: input.finalAction?.mutationIntent,
      planRequested: input.finalAction?.planRequested,
      prompt: input.prompt,
      workspace
    });
    const verificationPlan = createVerificationPlan({
      answerOnly: nonMutatingFinalAction,
      mode: input.mode,
      prompt: input.prompt
    });
    const agentPlan = createAgentPlan({
      mode: input.mode,
      parentMutationAllowed: false,
      projectId: input.projectId?.trim() || "unbound-project",
      prompt: input.prompt,
      taskComplexity: nonMutatingFinalAction ? "INSTANT" : complexity.class
    });
    const context = fallbackContext();
    const totalMs = Date.now() - startedAt;
    return {
      agentPlan,
      complexity,
      context,
      fallback: true,
      latencyMs: totalMs,
      plan,
      providerContext: "",
      skills: emptySkills,
      timings: {
        classificationMs: totalMs,
        contextAssemblyMs: 0,
        planningMs: 0,
        skillSelectionMs: 0,
        toolSelectionMs: 0,
        totalMs
      },
      tools: emptyTools,
      verificationPlan
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
    "x-hassali-intelligence-agents": headerValue(preflight.agentPlan.tasks.length),
    "x-hassali-intelligence-context-tokens": headerValue(preflight.context.estimatedTokens),
    "x-hassali-intelligence-complexity": headerValue(preflight.complexity.class),
    "x-hassali-intelligence-fallback": headerValue(preflight.fallback),
    "x-hassali-intelligence-injection": headerValue(preflight.context.injectionDetected),
    "x-hassali-intelligence-latency": headerValue(preflight.latencyMs),
    "x-hassali-intelligence-project-context": headerValue(preflight.complexity.projectContextSelected),
    "x-hassali-intelligence-plan": headerValue(preflight.plan.state),
    "x-hassali-intelligence-schemas": headerValue(preflight.tools.loadedSchemas.map((schema) => schema.name).join(",")),
    "x-hassali-intelligence-secret-redacted": headerValue(preflight.context.secretRedactionApplied),
    "x-hassali-intelligence-skills": headerValue(preflight.skills.loadedSkills.map((skill) => skill.metadata.id).join(",")),
    "x-hassali-intelligence-timings": headerValue(
      `class:${preflight.timings.classificationMs},plan:${preflight.timings.planningMs},skills:${preflight.timings.skillSelectionMs},tools:${preflight.timings.toolSelectionMs},context:${preflight.timings.contextAssemblyMs}`
    ),
    "x-hassali-intelligence-tools": headerValue(preflight.tools.discoveredTools.map((tool) => tool.name).join(",")),
    "x-hassali-intelligence-truncated": headerValue(preflight.context.truncated),
    "x-hassali-intelligence-verification": headerValue(preflight.verificationPlan.criteria.map((criterion) => criterion.method).join(","))
  };
}

export function withIntelligenceResponseHeaders(
  response: Response,
  preflight: IntelligencePreflight,
  routeLatencyMs?: number
) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(createIntelligenceDebugHeaders(preflight))) headers.set(name, value);
  if (process.env.NODE_ENV !== "production" && Number.isFinite(routeLatencyMs)) {
    headers.set("x-hassali-route-latency-ms", headerValue(Math.max(0, Math.round(routeLatencyMs ?? 0))));
  }
  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText
  });
}

export function compactIntelligencePreflight(preflight: IntelligencePreflight) {
  return {
    agents: {
      complexity: preflight.agentPlan.complexity,
      max: preflight.agentPlan.maxAgents,
      tasks: preflight.agentPlan.tasks.map((task) => ({
        id: task.id,
        mutationAllowed: task.mutationAllowed,
        role: task.role
      }))
    },
    context: compactIntelligenceContext(preflight.context),
    complexity: preflight.complexity,
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
    },
    timings: preflight.timings,
    verification: {
      criteria: preflight.verificationPlan.criteria.map((criterion) => ({
        id: criterion.id,
        method: criterion.method,
        required: criterion.required,
        target: criterion.target
      })),
      taskKind: preflight.verificationPlan.taskKind
    }
  };
}
