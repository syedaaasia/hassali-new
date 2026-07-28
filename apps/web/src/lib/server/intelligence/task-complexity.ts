import { requestNeedsWorkspaceContext } from "@/lib/chat-request-context";
import {
  extractIntentConstraints,
  type IntentConstraintResult
} from "@/lib/server/ai/intent-constraint-brain";
import type { WorkspaceContextInput } from "@/lib/server/ai/workspace-context-engine";
import type { IntelligenceConversationMessage } from "./context-kernel";
import type { IntelligenceProductMode } from "./skill-kernel";

export type TaskComplexityClass = "DEEP" | "INSTANT" | "STANDARD";

export type TaskComplexityDecision = {
  class: TaskComplexityClass;
  expectedVerificationDepth: "broad" | "minimal" | "normal";
  projectContextSelected: boolean;
  signals: string[];
};

export type ComplexityEscalationEvidence = {
  conflictingEvidence?: boolean;
  failedRepairAttempts?: number;
  implicatedSubsystems?: number;
  unresolvedAmbiguity?: boolean;
  verificationFailures?: number;
};

function promptWordCount(prompt: string) {
  return prompt.trim().split(/\s+/).filter(Boolean).length;
}

function isCasualOrIdentity(prompt: string) {
  return /^(?:hi|hello|hey|thanks|thank you|who are you|what can you do)[.!?\s]*$/i.test(prompt.trim());
}

function isSmallInformationalRequest(prompt: string, intent: IntentConstraintResult) {
  if (intent.taskType !== "question_or_explanation" || intent.mutationIntent) return false;
  if (promptWordCount(prompt) > 28) return false;
  if (/\b(?:architecture|compare|database|distributed|framework|migration|research|security|server components|trade-?offs?)\b/i.test(prompt)) {
    return false;
  }
  if (/\b(?:difference|versus|vs\.?)\b/i.test(prompt)) return false;
  const normalized = prompt.trim();
  return /^(?:rewrite|summari[sz]e|what (?:does|is)|why|how)\b/i.test(normalized) ||
    /^explain (?:this|the (?:current|following|selected))\b/i.test(normalized);
}

function isSmallBoundedChange(prompt: string) {
  if (promptWordCount(prompt) > 18) return false;
  if (/\b(?:across|all|database|dependencies|every|framework|migration|multiple|project|repository|security|throughout)\b/i.test(prompt)) {
    return false;
  }
  return /^rename\b/i.test(prompt.trim()) ||
    /^(?:change|fix|replace|rewrite|update)\b[\s\S]{0,80}\b(?:button|copy|grammar|label|sentence|text|typo|wording)\b/i.test(prompt.trim());
}

function broadOrSensitiveRequest(prompt: string, intent: IntentConstraintResult, fileCount: number) {
  const multiSystem = [
    /\b(?:frontend|browser|ui)\b/i.test(prompt),
    /\b(?:backend|api|server)\b/i.test(prompt),
    /\b(?:database|migration|storage)\b/i.test(prompt),
    /\b(?:auth|permission|security)\b/i.test(prompt)
  ].filter(Boolean).length;
  const broadScope = /\b(?:entire|full repository|large refactor|multiple (?:modules|systems)|production architecture|end[- ]to[- ]end)\b/i.test(prompt);
  const difficultFailure = /\b(?:conflicting evidence|keeps failing|repeated failure|root cause unknown|intermittent)\b/i.test(prompt);
  const deepResearch = /\b(?:comprehensive research|deep research|long-form synthesis|research and synthesize)\b/i.test(prompt);
  const explicitConstraintCount =
    intent.contentConstraints.length +
    intent.countConstraints.length +
    intent.styleConstraints.length;
  const longConstraintSet =
    prompt.length > 1_200 ||
    explicitConstraintCount + intent.requestedFeaturesOrPages.length >= 10;

  return multiSystem >= 3 ||
    broadScope ||
    difficultFailure ||
    deepResearch ||
    longConstraintSet ||
    (fileCount > 300 && intent.mutationIntent) ||
    (intent.risks.length >= 3 && intent.mutationIntent);
}

export function classifyTaskComplexity(input: {
  messages?: IntelligenceConversationMessage[];
  mode: IntelligenceProductMode;
  prompt: string;
  workspace?: WorkspaceContextInput | null;
}): TaskComplexityDecision {
  const projectContextSelected = requestNeedsWorkspaceContext(input.prompt, input.mode, {
    activePath: input.workspace?.activePath,
    fileList: input.workspace?.fileList,
    messages: input.messages,
    projectName: input.workspace?.projectName
  });
  const workspace = projectContextSelected ? input.workspace : null;
  const intent = extractIntentConstraints({
    message: input.prompt,
    priorMessages: input.messages ?? [],
    selectedMode: input.mode,
    workspace: workspace ?? undefined
  });
  const fileCount = workspace?.fileList?.length ?? 0;
  const signals: string[] = [];

  if (isCasualOrIdentity(input.prompt)) {
    signals.push("direct_casual_or_identity");
    return {
      class: "INSTANT",
      expectedVerificationDepth: "minimal",
      projectContextSelected: false,
      signals
    };
  }

  if (isSmallInformationalRequest(input.prompt, intent) || isSmallBoundedChange(input.prompt)) {
    signals.push("bounded_informational_request");
    return {
      class: "INSTANT",
      expectedVerificationDepth: "minimal",
      projectContextSelected,
      signals
    };
  }

  if (broadOrSensitiveRequest(input.prompt, intent, fileCount)) {
    signals.push("broad_or_multi_system_scope");
    if (projectContextSelected) signals.push("project_context_required");
    return {
      class: "DEEP",
      expectedVerificationDepth: "broad",
      projectContextSelected,
      signals
    };
  }

  signals.push(intent.mutationIntent ? "bounded_deliverable" : "normal_reasoning");
  if (projectContextSelected) signals.push("project_context_required");
  if (intent.risks.length) signals.push("risk_review_required");

  return {
    class: "STANDARD",
    expectedVerificationDepth: "normal",
    projectContextSelected,
    signals
  };
}

export function escalateTaskComplexity(
  current: TaskComplexityClass,
  evidence: ComplexityEscalationEvidence
): TaskComplexityClass {
  const pressure =
    (evidence.conflictingEvidence ? 2 : 0) +
    Math.min(evidence.failedRepairAttempts ?? 0, 3) +
    Math.min(evidence.verificationFailures ?? 0, 3) +
    ((evidence.implicatedSubsystems ?? 0) >= 3 ? 2 : 0) +
    (evidence.unresolvedAmbiguity ? 1 : 0);

  if (pressure >= 3) return "DEEP";
  if (current === "INSTANT" && pressure > 0) return "STANDARD";
  return current;
}

export function completionComplexity(current: TaskComplexityClass, hardWorkResolved: boolean) {
  return current === "DEEP" && hardWorkResolved ? "INSTANT" as const : current;
}
