import type { IntelligenceProductMode } from "./skill-kernel";
import type { WorkspaceContextInput } from "@/lib/server/ai/workspace-context-engine";

export type PlanState =
  | "AWAITING_APPROVAL"
  | "BLOCKED"
  | "COMPLETE"
  | "DIRECT"
  | "EXECUTE"
  | "EXPLORE"
  | "PLAN"
  | "VERIFY";

export type PlanFact = {
  status: "ASSUMPTION" | "CONFIRMED" | "INFERRED" | "PENDING";
  value: string;
};

export type PlanStep = {
  id: string;
  objective: string;
  state: "pending" | "ready";
  verification: string;
};

export type PlanEvent =
  | "approval_requested"
  | "approved"
  | "blocked"
  | "execution_complete"
  | "exploration_complete"
  | "verification_failed"
  | "verification_passed";

export type IntelligencePlan = {
  architecture: string[];
  assumptions: string[];
  blockers: string[];
  decisionComplete: boolean;
  executionState: {
    approvalRequired: boolean;
    mayExecuteNow: boolean;
    state: PlanState;
  };
  facts: PlanFact[];
  genuineUserDecision: string | null;
  interfaces: string[];
  mutationScope: string[];
  objective: string;
  state: PlanState;
  steps: PlanStep[];
  tests: string[];
  verificationCriteria: string[];
};

function normalize(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function isMutationRequest(prompt: string, mode: IntelligenceProductMode) {
  if (mode !== "ASK") return /\b(?:add|apply|build|change|create|edit|fix|implement|make|modify|remove|replace|rewrite|update)\b/i.test(prompt);
  return /\b(?:apply|build|change|create|edit|modify|mutate|replace|rewrite)\b.*\b(?:files?|project|app|website|codebase)\b/i.test(prompt);
}

function isComplexRequest(prompt: string) {
  const normalized = normalize(prompt);
  return /\b(?:architecture|authentication|authorization|migration|realtime|websocket|security|multi-page|database|payment|provider|refactor)\b/.test(normalized) ||
    normalized.split(" ").length > 45;
}

function needsExploration(prompt: string) {
  return /\b(?:debug|crash|error|fails?|not working|regression|root cause|investigate)\b/i.test(prompt) &&
    !/\b(?:because|caused by|stack trace|error:|exception:)\b/i.test(prompt);
}

function genuineDecision(prompt: string) {
  const normalized = normalize(prompt);
  if (/\b(?:social login|oauth)\b/.test(normalized) && !/\b(?:google|github|microsoft|apple|facebook)\b/.test(normalized)) {
    return "Choose the identity providers that must be supported; this changes credentials, callback configuration, and user experience.";
  }
  if (/\b(?:deploy|production hosting)\b/.test(normalized) && !/\b(?:vercel|cloudflare|aws|azure|self hosted|self-hosted)\b/.test(normalized)) {
    return "Choose the deployment target because it materially changes environment and runtime constraints.";
  }
  return null;
}

function requestedTargets(prompt: string) {
  const candidates = [
    "authentication",
    "database",
    "API",
    "website",
    "application",
    "preview",
    "React",
    "Python",
    "WebGL"
  ];
  return candidates.filter((target) => prompt.toLowerCase().includes(target.toLowerCase()));
}

export function buildIntelligencePlan(input: {
  answerOnly?: boolean;
  mode: IntelligenceProductMode;
  mutationRequested?: boolean;
  planRequested?: boolean;
  prompt: string;
  workspace?: WorkspaceContextInput | null;
}): IntelligencePlan {
  const mutation = input.mutationRequested ?? isMutationRequest(input.prompt, input.mode);
  const planOnly = Boolean(input.planRequested && !mutation);
  const explore = !input.answerOnly && !planOnly && needsExploration(input.prompt);
  const complex = isComplexRequest(input.prompt);
  const userDecision = genuineDecision(input.prompt);
  const state: PlanState = planOnly
    ? "PLAN"
    : input.answerOnly
      ? "DIRECT"
      : explore
    ? "EXPLORE"
    : mutation || complex
      ? "PLAN"
      : "DIRECT";
  const targets = requestedTargets(input.prompt);
  const workspaceText = Object.values(input.workspace?.fileContents ?? {}).join("\n");
  const detectedZod = /(?:\bfrom\s+["']zod["']|["']zod["']\s*:)/i.test(workspaceText);
  const approvalRequired = mutation && input.mode !== "ASK";
  const objective = input.prompt.trim().slice(0, 240) || "Respond to the current request.";
  const facts: PlanFact[] = [
    { status: "CONFIRMED", value: `User-selected product mode is ${input.mode}.` },
    { status: "CONFIRMED", value: mutation ? "The request asks for a state or file change." : "The request is informational at this stage." }
  ];

  if (explore) facts.push({ status: "PENDING", value: "The failure owner and root cause require evidence." });
  if (targets.length) facts.push({ status: "INFERRED", value: `Likely target areas: ${targets.join(", ")}.` });
  if (detectedZod) facts.push({ status: "CONFIRMED", value: "The selected project already uses Zod for validation." });
  if (userDecision) facts.push({ status: "PENDING", value: userDecision });

  const steps: PlanStep[] = state === "DIRECT" || planOnly
    ? []
    : explore
      ? [
          { id: "explore-evidence", objective: "Reproduce the failure and collect the smallest decisive evidence.", state: "ready", verification: "Observed and expected behavior are recorded." },
          { id: "trace-owner", objective: "Trace the execution path to the owning boundary.", state: "pending", verification: "The first divergence and owner are confirmed." },
          { id: "plan-correction", objective: "Define the smallest correction and regression probe.", state: "pending", verification: "The plan addresses the confirmed root cause." }
        ]
      : [
          { id: "inspect-context", objective: "Inspect the selected project and relevant existing contracts.", state: "ready", verification: "Project identity and constraints are confirmed." },
          { id: "prepare-change", objective: "Prepare the smallest approval-first implementation.", state: "pending", verification: "Proposed scope matches the current request." },
          { id: "verify-result", objective: "Verify the result at its real user surface.", state: "pending", verification: "Acceptance criteria and one adjacent regression pass." }
        ];

  return {
    architecture: [
      ...(complex ? ["Preserve existing ownership boundaries.", "Keep planning, execution, and verification states separate."] : []),
      ...(detectedZod ? ["Reuse the project's existing Zod validation convention."] : [])
    ],
    assumptions: userDecision ? [] : ["Existing repository conventions remain preferred unless the request explicitly replaces them."],
    blockers: userDecision ? [userDecision] : [],
    decisionComplete: !userDecision,
    executionState: {
      approvalRequired,
      mayExecuteNow: false,
      state
    },
    facts,
    genuineUserDecision: userDecision,
    interfaces: targets,
    mutationScope: mutation ? [input.mode === "ASK" ? "none: ASK remains non-mutating" : "selected project only"] : [],
    objective,
    state,
    steps,
    tests: state === "DIRECT" || planOnly ? [] : ["Focused direct test", "Adjacent regression test"],
    verificationCriteria: state === "DIRECT" || planOnly
      ? ["Answer addresses the current request directly."]
      : ["No unrelated behavior changes.", "Required approval and safety boundaries remain intact."]
  };
}

export function compactIntelligencePlan(plan: IntelligencePlan) {
  return {
    approvalRequired: plan.executionState.approvalRequired,
    decisionComplete: plan.decisionComplete,
    genuineUserDecision: plan.genuineUserDecision,
    state: plan.state,
    stepIds: plan.steps.map((step) => step.id)
  };
}

export function transitionIntelligencePlan(plan: IntelligencePlan, event: PlanEvent): IntelligencePlan {
  const nextState: PlanState = event === "blocked" || event === "verification_failed"
    ? "BLOCKED"
    : event === "exploration_complete" && plan.state === "EXPLORE"
      ? "PLAN"
      : event === "approval_requested" && plan.executionState.approvalRequired && plan.decisionComplete
        ? "AWAITING_APPROVAL"
        : event === "approved" && plan.state === "AWAITING_APPROVAL"
          ? "EXECUTE"
          : event === "execution_complete" && plan.state === "EXECUTE"
            ? "VERIFY"
            : event === "verification_passed" && plan.state === "VERIFY"
              ? "COMPLETE"
              : plan.state;

  return {
    ...plan,
    state: nextState,
    executionState: {
      ...plan.executionState,
      mayExecuteNow: nextState === "EXECUTE",
      state: nextState
    }
  };
}
