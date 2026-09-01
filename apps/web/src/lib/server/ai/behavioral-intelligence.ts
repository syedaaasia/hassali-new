import {
  extractIntentConstraints,
  type IntentConstraintResult
} from "./intent-constraint-brain";
import { analyzeAskTurnSemantics, isAskContentTransformationOperation } from "../../ask-turn-semantics";
import type {
  WorkspaceContextInput,
  WorkspaceProductMode
} from "./workspace-context-engine";

export type BehavioralAction =
  | "ANALYZE"
  | "ANSWER"
  | "BUILD"
  | "EDIT"
  | "EXECUTE"
  | "EXPLAIN"
  | "FIX"
  | "HANDOFF"
  | "PLAN"
  | "RESEARCH"
  | "RUN"
  | "TEST";

export type BehavioralIntentClass =
  | "CLARIFICATION_NEEDED"
  | "CODE_MUTATION"
  | "DIAGNOSIS"
  | "EXECUTION_REQUEST"
  | "EXPLANATION"
  | "INFORMATIONAL_ANSWER"
  | "MIXED_INTENT"
  | "NEW_CODE_BUILD"
  | "NEW_WEBSITE_BUILD"
  | "PLAN_ONLY"
  | "RECOMMENDATION"
  | "WEBSITE_MUTATION";

export type FinalActionDisposition =
  | "answer"
  | "clarify"
  | "execute_approved_action"
  | "plan"
  | "propose_action"
  | "request_approval";

export type FinalActionValidationWarning = {
  code: string;
  message: string;
};

export type BehavioralConversationMessage = {
  content: string;
  role: "assistant" | "system" | "user";
};

export type BehavioralContextSelection = {
  excludedCount: number;
  includedCount: number;
  messages: BehavioralConversationMessage[];
  relevantContextScope: string[];
  topicShift: boolean;
  workspaceContextIncluded: boolean;
};

export type ConversationObjectiveState = {
  acceptedConstraints: string[];
  activeObjective: string | null;
  activeTopic: string | null;
  lastActionableObjective: string | null;
  lastAnswerableObjective: string | null;
  lastAssistantResult: string | null;
  openQuestions: string[];
  recentObjectives: string[];
  referencedEntities: string[];
};

export type AnswerContract = {
  countRequirements: AnswerCountRequirement[];
  explicitConstraints: string[];
  formatRequirements: string[];
  freshnessRequirement: "current_if_available" | "none";
  minimumCompleteness: "all_material_parts";
  requestedAction: BehavioralAction;
  requestedComparisons: string[];
  requestedCount: number | null;
  requestedEntities: string[];
  requestedQuestions: string[];
  requiredOutputs: string[];
  topic: string;
};

export type AnswerCountRequirement = {
  count: number;
  label: string;
};

export type BehavioralDecision = {
  action: BehavioralAction;
  ambiguities: string[];
  answerOnly: boolean;
  answerContract: AnswerContract;
  answerIntent: boolean;
  approvalRequired: boolean;
  approvalSatisfied: boolean;
  artifactRequested: boolean;
  confidence: number;
  constraints: string[];
  contextItemsExcluded: number;
  contextItemsIncluded: number;
  decisionReasons: string[];
  clarificationRequired: boolean;
  executionAllowed: boolean;
  executionIntent: boolean;
  explicitNegatives: string[];
  finalDisposition: FinalActionDisposition;
  handoffIntent: boolean;
  intent: IntentConstraintResult;
  intentClass: BehavioralIntentClass;
  mixedIntent: boolean;
  mode: WorkspaceProductMode;
  mutationIntent: boolean;
  objective: string;
  objectiveState: ConversationObjectiveState;
  planRequested: boolean;
  referencedObjective: string | null;
  relevantContextScope: string[];
  relevantWorkspaceContext: boolean;
  requestedComparisons: string[];
  requestedCount: number | null;
  requestedEntities: string[];
  requestedOutcome: string;
  requiredOutputs: string[];
  researchIntent: boolean;
  resolvedRequest: string;
  topicShift: boolean;
  userGoal: string;
  validationWarnings: FinalActionValidationWarning[];
};

export type BehavioralDecisionInput = {
  messages?: BehavioralConversationMessage[];
  prompt: string;
  selectedMode: WorkspaceProductMode;
  workspace?: WorkspaceContextInput;
};

export type AnswerContractValidation = {
  complete: boolean;
  issues: string[];
  missingCountRequirements: AnswerCountRequirement[];
  missingEntities: string[];
  missingFormatRequirements: string[];
  missingOutputs: string[];
  missingQuestions: string[];
  observedItemCount: number | null;
  topicAligned: boolean;
  violatedConstraints: string[];
};

const MAX_OBJECTIVES = 8;
const NUMBER_WORDS: Record<string, number> = {
  eight: 8,
  five: 5,
  four: 4,
  nine: 9,
  one: 1,
  seven: 7,
  six: 6,
  ten: 10,
  three: 3,
  two: 2
};

const STOP_WORDS = new Set([
  "about",
  "again",
  "answer",
  "best",
  "build",
  "can",
  "compare",
  "correctly",
  "could",
  "explain",
  "for",
  "from",
  "give",
  "have",
  "how",
  "into",
  "make",
  "more",
  "most",
  "please",
  "should",
  "that",
  "the",
  "them",
  "these",
  "think",
  "this",
  "use",
  "what",
  "which",
  "with",
  "would",
  "your"
]);

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim() ?? "").filter(Boolean)));
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function normalizeRoutingIntentText(value: string) {
  return value
    .replace(/\b(?:buld|buidl|biuld)\b/gi, "build")
    .replace(/\bfinace\b/gi, "finance")
    .replace(/\bdashbaord\b/gi, "dashboard");
}

function contentTokens(value: string) {
  return unique(
    normalize(value)
      .split(/\s+/)
      .filter((token) => token.length >= 3 && !STOP_WORDS.has(token))
  );
}

const CONTEXT_STOP_WORDS = new Set([
  ...STOP_WORDS,
  "app",
  "application",
  "code",
  "current",
  "file",
  "project",
  "site",
  "task",
  "todo",
  "website"
]);

function contextTokens(value: string) {
  return unique(
    normalize(value)
      .split(/\s+/)
      .filter((token) => token.length >= 3 && !CONTEXT_STOP_WORDS.has(token))
  );
}

type ContinuityKind = "action_reference" | "elliptical_reference" | "explicit_prior_reference" | "operation_transfer" | "prior_refinement" | "self_contained";

export type ContinuityDependencyAnalysis = {
  explicitTarget: boolean;
  kind: "dependent" | "independent";
  missingObject: boolean;
  unresolvedReference: boolean;
};

function independentClause(value: string) {
  const text = value.trim();
  const explicitSecondObjective = text.match(
    /^(?:before|after|while)\b.{1,120}?\b(?:it|that|this)\b\s*,?\s*((?:analy[sz]e|compare|describe|explain|review|summari[sz]e|tell me about)\b.+)$/i
  )?.[1]?.trim();
  if (explicitSecondObjective) return explicitSecondObjective;
  const prefaced = text.match(/^(?:before|after|while)\b[^,]{1,140},\s*(.+)$/i)?.[1]?.trim();
  return prefaced || text;
}

function hasUnresolvedDeicticReference(value: string) {
  return /^(?:(?:why\s+(?:is|was|does|did)|what\s+(?:does|did|is|was))\s+(?:it|that|this)(?:\s+(?:mean|happen))?|how\s+(?:does|did|is|was|can|could|would)\s+(?:it|that|this)(?:\s+(?:work|happen))?|(?:describe|explain|review|summari[sz]e|tell me about)\s+(?:it|that|this|them|those)(?:\s+(?:more|further|again))?)[.!?]*$/i.test(value.trim());
}

const anaphoricReferenceHeads = new Set([
  "alternative", "answer", "approach", "argument", "assumption", "claim", "conclusion",
  "decision", "example", "explanation", "idea", "method", "option", "opposite", "outcome",
  "change", "fail", "follow", "happen", "matter", "point", "proposal", "reason", "result",
  "scale", "statement", "suggestion", "theory", "work"
]);

function normalizedContinuityClause(value: string) {
  const text = value.trim().replace(/[.!?]+$/g, "");
  return text
    .replace(/^please\s+/i, "")
    .replace(/^(?:can|could|would|will)\s+you\s+/i, "")
    .trim();
}

function hasExplicitContinuityTarget(value: string) {
  const text = normalizedContinuityClause(value);
  if (/\b(?:this|that)\s+[^:]{1,60}:\s*\S/i.test(text)) return true;
  if (/\b(?:about|against|for|of|on|through|to|using|versus|vs\.?|with)\s+(?!(?:it|that|this|them|those|the\s+(?:alternative|opposite|previous\s+(?:answer|point)))\b)[A-Za-z0-9][\w.-]*/i.test(text)) return true;
  if (/^put\s+(?!(?:it|that|this)\b).+?\s+(?:another|a different)\s+way$/i.test(text)) return true;
  if (/^(?:describe|explain|justify|review|summari[sz]e|unpack|walk me through)\s+(?!(?:it|that|this|them|those|more|again|why)\b)\S+/i.test(text)) return true;
  if (/\bif\s+(?!(?:it|that|this)\b)(?:an?|the\s+)?[A-Za-z0-9][\w.-]*(?:\s+[A-Za-z0-9][\w.-]*)?\s+(?:changed|disappeared|failed|held|were|was)\b/i.test(text)) return true;
  if (/^(?:does|did|is|was|can|could|would|will)\s+(?!(?:it|that|this|the\s+(?:alternative|opposite))\b)[A-Za-z0-9][\w.-]*/i.test(text)) return true;
  if (/^what\s+makes\s+(?!(?:it|that|this|you)\b)[A-Za-z0-9][\w.-]*(?:\s+[A-Za-z0-9][\w.-]*)?/i.test(text)) return true;
  return /\b(?:this|that|those)\s+(?:[A-Z][\w.-]*\s+)?(?:component|function|implementation|module|query|service|table|type)\b/.test(text);
}

function hasUnresolvedContinuityReference(value: string) {
  const text = normalizedContinuityClause(value);
  const localReference = text.match(/^([\s\S]+?)\s+(?:and\s+then|and|then)\s+[\s\S]*\b(?:it|that|them)\b/i);
  if (localReference?.[1] && hasExplicitContinuityTarget(localReference[1])) return false;
  const relativeClause = text.match(/\b([A-Za-z][\w-]*)\s+that\s+(?:can|could|does|did|has|is|may|might|was|will|would)\b/i);
  if (relativeClause?.[1] && !/^(?:argue|assume|believe|claim|conclude|say|suppose|think)$/i.test(relativeClause[1])) return false;
  if (/\b(?:it|them)\b/i.test(text)) return true;
  if (/^put\s+(?:it|this|that)\b/i.test(text)) return true;
  if (/^make\s+(?:it|this|that)\b/i.test(text)) return true;
  if (/\b(?:this|that)\s+(?:could|is|may|might|seems|was|were|would)\b/i.test(text)) return true;
  if (/\bthe\s+(?:alternative|former|latter|opposite|previous\s+(?:answer|point|proposal))\b/i.test(text)) return true;
  const demonstratives = [...text.matchAll(/\b(?:this|that|those)\b(?:\s+([A-Za-z][\w-]*))?/gi)];
  return demonstratives.some((match) => {
    const head = match[1]?.toLowerCase();
    if (!head) return true;
    return anaphoricReferenceHeads.has(head) || /^(?:again|always|false|more|true|wrong)$/.test(head);
  });
}

export function analyzeContinuityDependency(value: string): ContinuityDependencyAnalysis {
  const semantics = analyzeAskTurnSemantics(value);
  const explicitTarget = semantics.explicitTarget || hasExplicitContinuityTarget(value);
  const unresolvedReference = semantics.dependency === "prior_context" && hasUnresolvedContinuityReference(value);
  const missingObject = semantics.dependency === "prior_context" && !unresolvedReference;
  return {
    explicitTarget,
    kind: semantics.dependency === "prior_context" ? "dependent" : "independent",
    missingObject,
    unresolvedReference
  };
}

function isStandaloneContextDependent(value: string) {
  return hasUnresolvedDeicticReference(value) || analyzeContinuityDependency(value).kind === "dependent" ||
    /^(?:why(?: though)?|how(?: so)?|what about (?:that|it|them|those)|and then|explain why|tell me more|what do you mean|can you explain|which one(?:\s+is\s+[^.!?]+)?|more|continue|go on)[.!?]*$/i.test(value.trim());
}

function hasSelfContainedObjective(value: string) {
  const text = independentClause(value).replace(/[.!?]+$/g, "").trim();
  if (!text) return false;
  if (/^which one\s+is\s+(?:the\s+)?best\s+\S+/i.test(text)) return true;
  if (isStandaloneContextDependent(text)) return false;
  if (/^what are (?:the )?(?:benefits?|downsides?|drawbacks?|pros?|cons?)$/i.test(text)) return false;

  if (/^think longer about\s+(?!(?:it|that|this|them|those)\b).+/i.test(text)) return true;

  const imperative = text.match(/^(?:analy[sz]e|compare|describe|explain|review|summari[sz]e|tell me about)\s+(.+)$/i)?.[1]?.trim();
  if (imperative && !/^(?:it|that|this|them|those|why|more|the previous (?:one|question|answer))$/i.test(imperative)) {
    return true;
  }

  if (/^(?:what|when|where|who|why|how)\s+(?:am|are|can|could|did|do|does|has|have|is|should|was|were|will|would)\s+\S+/i.test(text)) {
    return true;
  }

  return false;
}

function classifyContinuity(value: string): ContinuityKind {
  const text = value.trim();
  if (analyzeAskTurnSemantics(text).dependency === "operation_transfer") return "operation_transfer";
  if (hasSelfContainedObjective(text)) return "self_contained";

  if (/^(?:build|do|fix|implement|apply)\s+(?:it|that(?: plan)?)[.!?]*$/i.test(text)) {
    return "action_reference";
  }

  if (
    /\b(?:previous question|answer (?:it|that)|go back to|return to)\b/i.test(text) ||
    /^(?:answer|do|build|fix|try|make|continue|explain|compare)\s+(?:it|that|them|the previous (?:question|answer))(?:\s+correctly)?[.!?]*$/i.test(text)
  ) {
    return "explicit_prior_reference";
  }

  if (/^(?:think longer(?: and answer)?|make (?:it|that) (?:shorter|longer|simpler)|try again)[.!?]*$/i.test(text)) {
    return "prior_refinement";
  }

  if (
    isStandaloneContextDependent(text) ||
    /^(?:give me\s+)?(?:the\s+)?top\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)(?:\s+(?:of them|from those|options?))?[.!?]*$/i.test(text) ||
    /^(?:give|name)(?:\s+me)?\s+(?:(?:an?|one)\s+example|(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:benefits?|drawbacks?|examples?|options?|reasons?|tools?|ways?))[.!?]*$/i.test(text) ||
    /^(?:what are (?:the )?(?:benefits?|downsides?|drawbacks?|pros?|cons?)|would you personally [^.!?]*(?:it|here))[.!?]*$/i.test(text)
  ) {
    return "elliptical_reference";
  }

  return "self_contained";
}

function isEllipticalFollowup(value: string) {
  return classifyContinuity(value) !== "self_contained";
}

function isAnswerableObjective(value: string) {
  return (
    /\?/u.test(value) ||
    /^(?:analy[sz]e|compare|explain|give|help me plan|list|plan|propose|recommend|review|should|tell|think|what|which|who|why|how)\b/i.test(value.trim())
  );
}

function isActionableObjective(value: string) {
  return /^(?:now\s+)?(?:add|apply|build|change|create|delete|design|edit|fix|implement|make|refactor|remove|rename|replace|rewrite|run|test|update|use|write)\b/i.test(value.trim());
}

function isConstraintOnly(value: string) {
  return /^(?:do not|don't|dont|never|no|without)\b/i.test(value.trim()) ||
    /^(?:answer|respond to)(?:\s+my)?\s+next\s+(?:answer|question|response)\b/i.test(value.trim());
}

function containsUnsafeBusinessNameCharacter(value: string) {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127 || "<>{}[]\\".includes(character);
  });
}

function isExplicitWebsiteFactUpdate(value: string) {
  const match = value.trim().match(
    /^(?:our\s+(?:(?:business|brand|company|site|website)\s+)?name|(?:my|the)\s+(?:business|brand|company|site|website)\s+name)\s+(?:is|should be)\s+(.+?)(?=\s+(?:and|but)\s+(?:use|make|change|update|add|remove|set|keep)\b|$)/i
  );
  const businessName = match?.[1]?.replace(/^["'`]+|["'`.]+$/g, "").replace(/\s+/g, " ").trim();
  return Boolean(
    businessName &&
    businessName.length <= 80 &&
    !containsUnsafeBusinessNameCharacter(businessName) &&
    /[a-z0-9]/i.test(businessName)
  );
}

function isExplicitWebsiteDesignUpdate(value: string) {
  return /^for\s+(?:the\s+)?[a-z0-9][a-z0-9 -]{0,60}\s+(?:use|make|keep|set)\s+(?:rounded|square|sharp|dark|light|editorial|minimal|playful|cinematic)\b/i.test(value.trim());
}

function extractExplicitNegatives(value: string) {
  return unique(
    Array.from(value.matchAll(/\b(?:do not|don't|dont|never|no|without)\s+([^.!?\n]{2,120})/gi))
      .map((match) => match[0].trim())
  );
}

function extractTopicReference(prompt: string) {
  return prompt.match(/\b(?:go back|return)\s+to\s+(?:the\s+)?([^.!?]{2,80})/i)?.[1]?.trim() ?? null;
}

function relevanceScore(candidate: string, reference: string) {
  const referenceTokens = contentTokens(reference);
  const candidateTokens = new Set(contentTokens(candidate));
  return referenceTokens.reduce((score, token) => score + (candidateTokens.has(token) ? 1 : 0), 0);
}

function selectReferencedObjective(
  prompt: string,
  priorUserObjectives: string[],
  answerableObjectives: string[],
  actionableObjectives: string[]
) {
  const topicReference = extractTopicReference(prompt);
  if (topicReference) {
    const ranked = priorUserObjectives
      .map((objective) => ({ objective, score: relevanceScore(objective, topicReference) }))
      .sort((left, right) => right.score - left.score);
    if (ranked[0]?.score) return ranked[0].objective;
  }

  const continuity = classifyContinuity(prompt);
  if (continuity === "self_contained") return null;

  if (continuity === "action_reference") {
    return actionableObjectives.at(-1) ?? answerableObjectives.at(-1) ?? priorUserObjectives.at(-1) ?? null;
  }

  if (continuity === "explicit_prior_reference") {
    return answerableObjectives.at(-1) ?? priorUserObjectives.at(-1) ?? null;
  }

  if (continuity === "prior_refinement") {
    return /^think longer|^try again/i.test(prompt.trim())
      ? answerableObjectives.at(-1) ?? priorUserObjectives.at(-1) ?? null
      : priorUserObjectives.at(-1) ?? answerableObjectives.at(-1) ?? null;
  }

  if (continuity === "operation_transfer") {
    return answerableObjectives.at(-1) ?? priorUserObjectives.at(-1) ?? null;
  }

  if (continuity === "elliptical_reference" && !/^(?:build|do|fix|implement|apply)\b/i.test(prompt.trim())) {
    return priorUserObjectives.at(-1) ?? answerableObjectives.at(-1) ?? null;
  }

  if (/^(?:build|do|fix|implement|apply)\s+(?:it|that(?: plan)?)[.!?]*$/i.test(prompt.trim())) {
    return actionableObjectives.at(-1) ?? answerableObjectives.at(-1) ?? priorUserObjectives.at(-1) ?? null;
  }

  if (continuity === "elliptical_reference") {
    return priorUserObjectives.at(-1) ?? null;
  }

  return null;
}

function topicFromObjective(objective: string) {
  const cleaned = objective
    .replace(/^(?:please\s+)?(?:analy[sz]e|answer|build|can you|compare|create|design|explain|give me|help me|how (?:can|do|should) i|implement|list|make|recommend|review|should i|tell me|what (?:are|does|is)|which|why is)\s+/i, "")
    .replace(/[.!?]+$/g, "")
    .trim();
  return cleaned || objective.trim();
}

function extractComparisonEntities(value: string) {
  const comparison = value.match(/\bcompare\s+(.+?)(?=\s+(?:for|on|using|when|because|and (?:give|explain|recommend))\b|[.?!]|$)/i)?.[1]
    ?? value.match(/\bbetween\s+(.+?)(?=\s+(?:for|on|using|when|because)\b|[.?!]|$)/i)?.[1];
  if (!comparison) return [];

  return unique(
    comparison
      .replace(/\bversus\b|\bvs\.?\b/gi, ",")
      .split(/\s*,\s*|\s+and\s+/i)
      .map((item) => item.replace(/^(?:(?:and|the|a|an)\s+)+/i, "").trim())
      .filter((item) => item.length >= 2 && item.length <= 60)
  );
}

function extractLocationEntities(value: string) {
  const timeMatch = value.match(/\b(?:current\s+)?time\b[\s\S]{0,40}?\bin\s+([^?!.]+)/i);
  if (!timeMatch) return [];
  return unique(
    timeMatch[1]
      .split(/\s*,\s*|\s+and\s+/i)
      .map((item) => item.replace(/^and\s+/i, "").trim())
      .filter((item) => item.length >= 2 && item.length <= 60)
  );
}

function extractNamedEntities(value: string) {
  const matches = Array.from(value.matchAll(/\b[A-Z][A-Za-z0-9.+#-]*(?:\s+[A-Z][A-Za-z0-9.+#-]*){0,3}\b/g))
    .map((match) => match[0])
    .map((item) =>
      item.replace(/^(?:Answer|Build|Can|Compare|Continue|Could|Create|Describe|Explain|Give|How|List|Make|Recommend|Reconsider|Return|Review|Should|Tell|Think|What|Which|Who|Why|Will|Would)\s+/i, "").trim()
    )
    .filter((item) =>
      !/^(?:(?:Answer|Build|Compare|Continue|Create|Explain|Give|Make|Reconsider|Return|The|Think)|(?:Can|Could|Would|Will|Should|What|Which|Who|Where|When|Why|How)(?:\s+(?:I|we|you|it|this|that))?|I)$/i.test(item)
    )
    .filter((item) => contentTokens(item).length > 0)
    .filter((item) =>
      !/^(?:bro|buddy|dear|dude|friend|hello|hey|hi|mate|ma'am|sir)$/i.test(item)
    );
  return unique(matches);
}

function extractRequestedEntities(value: string) {
  const comparisons = extractComparisonEntities(value);
  const locations = extractLocationEntities(value);
  if (comparisons.length || locations.length) return unique([...comparisons, ...locations]);
  return extractNamedEntities(value);
}

function extractRequestedCount(value: string) {
  const match = value.match(/\btop\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/i) ??
    value.match(/\b(?:give|name)(?:\s+me)?\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:good\s+|best\s+)?(?:benefits?|drawbacks?|environments?|examples?|options?|platforms?|reasons?|steps?|tools?|ways?|ideas?|items?|recommendations?)\b/i) ??
    value.match(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:best\s+)?(?:benefits?|drawbacks?|environments?|examples?|options?|platforms?|reasons?|steps?|tools?|ways?|ideas?|items?|recommendations?)\b/i);
  if (!match) return null;
  const raw = match[1].toLowerCase();
  return /^\d+$/.test(raw) ? Number(raw) : NUMBER_WORDS[raw] ?? null;
}

function extractCountRequirements(value: string): AnswerCountRequirement[] {
  const requirements = Array.from(value.matchAll(
    /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:best\s+|good\s+)?(benefits?|drawbacks?|examples?|options?|pros?|cons?|reasons?|steps?|tools?|ways?|ideas?|items?|recommendations?)\b/gi
  )).map((match) => ({
    count: /^\d+$/.test(match[1]) ? Number(match[1]) : NUMBER_WORDS[match[1].toLowerCase()] ?? 0,
    label: match[2].toLowerCase()
  })).filter((requirement) => requirement.count > 0);

  return requirements.filter((requirement, index) =>
    requirements.findIndex((candidate) => candidate.label === requirement.label) === index
  );
}

function extractFormatRequirements(value: string) {
  return unique([
    /\bconcise(?:ly)?\b|\bbrief(?:ly)?\b/i.test(value) ? "concise" : null,
    /\btable\b/i.test(value) ? "table" : null,
    /\b(?:bullet|bulleted)\b/i.test(value) ? "bullets" : null,
    /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+sentences?\b/i.test(value)
      ? value.match(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+sentences?\b/i)?.[0]
      : null,
    /\b(?:approximately|about|around)?\s*\d+\s+words?\b/i.test(value)
      ? value.match(/\b(?:approximately|about|around)?\s*\d+\s+words?\b/i)?.[0]
      : null
  ]);
}

function extractRequiredOutputs(value: string) {
  return unique([
    /\bpros?\s+(?:and|&)\s+cons?\b/i.test(value) ? "pros_and_cons" : null,
    /\b(?:example|sample)\b/i.test(value) ? "example" : null,
    /\b(?:explain|explanation)\b/i.test(value) ? "explanation" : null,
    /\b(?:recommend|recommendation|which (?:one|option))\b/i.test(value) ? "recommendation" : null,
    /\b(?:steps?|how to)\b/i.test(value) ? "steps" : null,
    /\b(?:code|snippet)\b/i.test(value) ? "code" : null
  ]);
}

function resolveFollowup(prompt: string, referencedObjective: string | null, requestedCount: number | null) {
  if (!referencedObjective) return prompt.trim();
  const trimmed = prompt.trim();
  if (classifyContinuity(trimmed) === "operation_transfer") {
    return `Apply the operation from the referenced objective to the current subject.\nCurrent request: ${trimmed}\nReferenced objective: ${referencedObjective}`;
  }
  if (/\b(?:go back|return)\s+to\b/i.test(trimmed)) {
    return `${trimmed}\nReferenced objective: ${referencedObjective}`;
  }
  if (/\bthink longer\b/i.test(trimmed)) {
    return `Reconsider this objective with greater depth and answer it directly: ${referencedObjective}`;
  }
  if (/\banswer (?:the )?previous question correctly\b/i.test(trimmed)) {
    return `Answer this objective directly, accurately, and completely: ${referencedObjective}`;
  }
  if (/^(?:why|which one|compare them|continue|more|go on|try again)[.!?]*$/i.test(trimmed)) {
    return `${trimmed.replace(/[.!?]+$/, "")} regarding this objective: ${referencedObjective}`;
  }
  if (/^make it (?:shorter|longer)[.!?]*$/i.test(trimmed)) {
    return `${trimmed.replace(/[.!?]+$/, "")} while preserving the answer to: ${referencedObjective}`;
  }
  if (requestedCount && /\btop\b/i.test(trimmed)) {
    return `${trimmed.replace(/[.!?]+$/, "")} for this objective: ${referencedObjective}`;
  }
  if (/^(?:build|do|fix|implement|apply)\s+(?:it|that(?: plan)?)[.!?]*$/i.test(trimmed)) {
    return `${trimmed.replace(/\b(?:it|that(?: plan)?)\b/i, `"${referencedObjective}"`)}`;
  }
  return `${trimmed}\nReferenced objective: ${referencedObjective}`;
}

function inferAction(prompt: string, resolvedRequest: string): BehavioralAction {
  const raw = prompt.trim();
  const resolved = resolvedRequest.trim();
  const directBuildQuestion = /^(?:can|could|would|will)\s+(?:you\s+)?(?:please\s+)?(?:build|create|design|develop|implement|make)\b/i.test(raw);
  const informationalQuestion = (
    /^(?:can|could|would)\s+(?:you\s+)?(?:please\s+)?(?:explain|compare|review|tell|recommend|suggest|analy[sz]e)\b/i.test(raw) ||
    /^(?:what|why|how|when|where|who|which|is|are|do|does|should|would|could)\b/i.test(raw) ||
    /^(?:bro\s+)?should\s+i\b/i.test(raw)
  );
  const informationalImperative = /^(?:answer|compare|describe|explain|give|list|recommend|review|show me|suggest|tell|think)\b/i.test(raw);

  if (isEllipticalFollowup(raw) && !/^(?:build|do|fix|implement|apply)\b/i.test(raw)) {
    return /\b(?:why|compare|which|downsides?|drawbacks?|pros?|cons?)\b/i.test(raw) ? "ANALYZE" : "ANSWER";
  }

  if (/\b(?:research|look up|browse|search (?:for|the web)|verify (?:online|current|latest))\b/i.test(raw)) return "RESEARCH";
  if (
    /^(?:give|create|draft|outline|prepare|write)(?:\s+me)?\b[\s\S]{0,100}\b(?:(?:implementation |migration |step-by-step )?plan|implementation steps|proposed change list|technical specification|architecture proposal)\b/i.test(raw) ||
    /^(?:plan|help me plan|outline a plan)\b/i.test(raw)
  ) return "PLAN";
  if (/^(?:(?:please|(?:can|could|would)\s+you(?:\s+please)?|i (?:want|need) (?:you )?to)\s+)?(?:run|start|launch|execute)\b/i.test(raw)) return "RUN";
  if (
    /^(?:(?:please|(?:can|could|would)\s+you(?:\s+please)?|i (?:want|need) (?:you )?to)\s+)?(?:test|verify)\b/i.test(raw) &&
    !/\b(?:explain|how|what)\b/i.test(raw)
  ) return "TEST";
  if (/^(?:(?:please|(?:can|could|would)\s+you(?:\s+please)?|i (?:want|need) (?:you )?to)\s+)?(?:fix|debug|repair|resolve)\b/i.test(raw)) return "FIX";
  if (
    directBuildQuestion ||
    /^(?:(?:please|i (?:want|need) (?:you )?to)\s+)?(?:build|create|design|develop|generate|implement|make)\b/i.test(raw) ||
    /\b(?:build|create|implement)\s+(?:this|it)\s+for me\b/i.test(raw)
  ) return "BUILD";
  if (
    /^(?:go ahead and\s+)?(?:add|apply|change|delete|edit|modify|refactor|remove|rename|replace|rewrite|redesign|update|use)\b/i.test(raw) ||
    /^(?:i want|i need|please)\s+(?:you\s+to\s+)?(?:add|apply|change|edit|modify|refactor|remove|replace|rewrite|update)\b/i.test(raw)
  ) return "EDIT";
  if (
    /^(?:(?:can|could)\s+(?:you|u)\s+)?(?:explain|describe|teach)\b/i.test(raw) ||
    /^what does\b[\s\S]*\bmean\b/i.test(raw) ||
    /^what is\b[\s\S]*\b(?:meaning|definition)\b/i.test(raw)
  ) return "EXPLAIN";
  if (
    /^(?:analy[sz]e|compare|review)\b/i.test(raw) ||
    /\b(?:should i|would .* make sense|good idea|pros?\s+(?:and|&)\s+cons?|tradeoffs?)\b/i.test(raw)
  ) return "ANALYZE";
  if (informationalQuestion || informationalImperative || /\?$/.test(raw)) return "ANSWER";

  if (isEllipticalFollowup(raw)) {
    if (/^(?:build|do|fix|implement|apply)\b/i.test(raw)) {
      if (/^fix\b/i.test(raw)) return "FIX";
      return "BUILD";
    }
    return /\b(?:why|compare|which)\b/i.test(raw) ? "ANALYZE" : "ANSWER";
  }

  if (/^(?:execute)\b/i.test(resolved)) return "EXECUTE";
  return "ANSWER";
}

function inferMixedMutationAction(prompt: string): BehavioralAction | null {
  const text = prompt.trim();
  const startsInformational =
    /^(?:analy[sz]e|compare|describe|explain|recommend|review|tell me|walk me through|what|why|how|which|should)\b/i.test(text);
  const actionClause = text.match(
    /\b(?:and\s+then|then|and)\s+(?:please\s+)?(add|apply|build|change|create|edit|fix|implement|modify|refactor|remove|replace|rewrite|update)\b/i
  );
  if (!startsInformational || !actionClause) return null;

  const verb = actionClause[1].toLowerCase();
  if (verb === "fix") return "FIX";
  if (["build", "create", "implement"].includes(verb)) return "BUILD";
  return "EDIT";
}

function isMutationAction(action: BehavioralAction) {
  return ["BUILD", "EDIT", "EXECUTE", "FIX", "RUN", "TEST"].includes(action);
}

function isAnswerAction(action: BehavioralAction) {
  return ["ANALYZE", "ANSWER", "EXPLAIN", "PLAN", "RESEARCH"].includes(action);
}

function intentClassFor(input: {
  action: BehavioralAction;
  clarificationRequired: boolean;
  mixedIntent: boolean;
  mode: WorkspaceProductMode;
  prompt: string;
}): BehavioralIntentClass {
  if (input.clarificationRequired) return "CLARIFICATION_NEEDED";
  if (input.mixedIntent) return "MIXED_INTENT";
  if (input.action === "PLAN") return "PLAN_ONLY";
  if (["EXECUTE", "RUN", "TEST"].includes(input.action)) return "EXECUTION_REQUEST";
  if (input.action === "BUILD") {
    return input.mode === "WEBSITE" ? "NEW_WEBSITE_BUILD" : "NEW_CODE_BUILD";
  }
  if (["EDIT", "FIX"].includes(input.action)) {
    return input.mode === "WEBSITE" ? "WEBSITE_MUTATION" : "CODE_MUTATION";
  }
  if (input.action === "EXPLAIN") return "EXPLANATION";
  if (
    /\b(?:recommend|which|should|best|trade-?offs?|pros?\s+(?:and|&)\s+cons?)\b/i.test(input.prompt)
  ) {
    return "RECOMMENDATION";
  }
  if (/\b(?:diagnose|why\b[\s\S]{0,80}\b(?:fail|slow|error)|root cause|not working)\b/i.test(input.prompt)) {
    return "DIAGNOSIS";
  }
  return "INFORMATIONAL_ANSWER";
}

export function normalizeFinalActionDecision(input: {
  answerOnly: boolean;
  approvalRequired: boolean;
  approvalSatisfied: boolean;
  clarificationRequired: boolean;
  disposition: FinalActionDisposition;
  executionAllowed: boolean;
  mutationRequested: boolean;
}) {
  let answerOnly = input.answerOnly;
  let approvalRequired = input.approvalRequired;
  const approvalSatisfied = input.approvalSatisfied;
  const clarificationRequired = input.clarificationRequired;
  let disposition = input.disposition;
  let executionAllowed = input.executionAllowed;
  let mutationRequested = input.mutationRequested;
  const warnings: FinalActionValidationWarning[] = [];
  const warn = (code: string, message: string) => warnings.push({ code, message });

  if (answerOnly && mutationRequested) {
    warn("FINAL_ACTION_ANSWER_MUTATION", "Answer-only state cannot request mutation; the decision was normalized to a non-mutating answer.");
    mutationRequested = false;
  }
  if (answerOnly && approvalRequired) {
    warn("FINAL_ACTION_ANSWER_APPROVAL", "Answer-only state cannot require approval; approval was removed.");
    approvalRequired = false;
  }
  if (answerOnly && executionAllowed) {
    warn("FINAL_ACTION_ANSWER_EXECUTION", "Answer-only state cannot execute; execution was blocked.");
    executionAllowed = false;
  }
  if (clarificationRequired && executionAllowed) {
    warn("FINAL_ACTION_CLARIFY_EXECUTION", "Clarification state cannot execute; execution was blocked.");
    executionAllowed = false;
  }
  if (executionAllowed && !approvalSatisfied) {
    warn("FINAL_ACTION_UNAPPROVED_EXECUTION", "Execution requires satisfied approval; execution was blocked.");
    executionAllowed = false;
  }
  if (disposition === "request_approval" && !mutationRequested) {
    warn("FINAL_ACTION_APPROVAL_WITHOUT_MUTATION", "Approval cannot be requested without a mutation; the decision was normalized to an answer.");
    disposition = "answer";
    answerOnly = true;
    approvalRequired = false;
  }
  if (disposition === "execute_approved_action" && !executionAllowed) {
    warn("FINAL_ACTION_EXECUTION_NOT_ALLOWED", "Approved execution disposition lacked execution authority; the decision was normalized safely.");
    disposition = mutationRequested ? "request_approval" : "answer";
    approvalRequired = mutationRequested;
    answerOnly = !mutationRequested;
  }
  if (clarificationRequired && disposition !== "clarify") {
    warn("FINAL_ACTION_CLARIFY_DISPOSITION", "Clarification was required, so the disposition was normalized to clarify.");
    disposition = "clarify";
    answerOnly = true;
    approvalRequired = false;
    mutationRequested = false;
  }

  return {
    answerOnly,
    approvalRequired,
    approvalSatisfied,
    clarificationRequired,
    disposition,
    executionAllowed,
    mutationRequested,
    warnings
  };
}

function overlapScore(left: string, right: string) {
  const leftTokens = contextTokens(left);
  const rightTokens = new Set(contextTokens(right));
  const overlap = leftTokens.filter((token) => rightTokens.has(token)).length;
  const denominator = Math.max(1, Math.min(leftTokens.length, rightTokens.size));
  return { overlap, ratio: overlap / denominator };
}

export function selectRelevantBehavioralContext(input: {
  messages: BehavioralConversationMessage[];
  mode: WorkspaceProductMode;
  mutationRequested: boolean;
  prompt: string;
  referencedObjective?: string | null;
  workspace?: WorkspaceContextInput;
}): BehavioralContextSelection {
  const prior = [...input.messages];
  let currentMessage: BehavioralConversationMessage = { content: input.prompt, role: "user" };
  for (let index = prior.length - 1; index >= 0; index -= 1) {
    if (prior[index].role === "user" && prior[index].content.trim() === input.prompt.trim()) {
      currentMessage = prior[index];
      prior.splice(index, 1);
      break;
    }
  }

  const explicitContinuity = Boolean(input.referencedObjective) ||
    /\b(?:apply that plan|continue (?:the )?previous|same (?:app|file|project|site|website)|use the (?:same|website we just discussed)|go back to|return to)\b/i.test(input.prompt);
  const selectedIndexes = new Set<number>();
  const priorUserIndexes = prior
    .map((message, index) => ({ index, message }))
    .filter((entry) => entry.message.role === "user")
    .slice(-6);

  for (const entry of priorUserIndexes) {
    const isReferenced = Boolean(
      input.referencedObjective &&
      entry.message.content.trim() === input.referencedObjective.trim()
    );
    const relevance = overlapScore(entry.message.content, input.prompt);
    const related = isReferenced || relevance.overlap >= 2 || (relevance.overlap >= 1 && relevance.ratio >= 0.5);
    if (!related && !explicitContinuity) continue;
    if (explicitContinuity && !isReferenced && entry !== priorUserIndexes.at(-1) && !related) continue;

    selectedIndexes.add(entry.index);
    if (prior[entry.index + 1]?.role === "assistant") selectedIndexes.add(entry.index + 1);
    for (let index = entry.index + 1; index < prior.length; index += 1) {
      if (prior[index].role === "user" && isConstraintOnly(prior[index].content)) selectedIndexes.add(index);
      if (prior[index].role === "user" && !isConstraintOnly(prior[index].content)) break;
    }
  }

  const selectedPrior = prior.filter((_, index) => selectedIndexes.has(index)).slice(-8);
  const artifactTargetAvailable = Boolean(
    input.workspace?.activePath?.trim() && input.workspace?.activeFileContent?.trim()
  );
  const contentTarget = analyzeAskTurnSemantics(input.prompt, {
    artifactTargetAvailable,
    hasConversationContext: prior.some((message) => message.role === "user")
  }).target;
  const referencedPath = (input.workspace?.fileList ?? []).some((path) => {
    const normalizedPath = path.replace(/\\/g, "/").toLowerCase();
    const basename = normalizedPath.split("/").at(-1) ?? normalizedPath;
    const prompt = input.prompt.toLowerCase();
    return prompt.includes(normalizedPath) || prompt.includes(basename);
  });
  const localContextRequested =
    contentTarget === "selected_artifact" || contentTarget === "named_artifact" ||
    /\b(?:active file|current (?:app|codebase|file|project|repo(?:sitory)?|site|website|workspace)|existing (?:app|project|site|website)|my (?:app|code|files?|project|repo(?:sitory)?|site|website)|selected file|this (?:app|code|file|function|project|site|website))\b/i.test(input.prompt) ||
    /\b(?:inside|within|in) (?:my|the|this) (?:codebase|project|repo(?:sitory)?|workspace)\b/i.test(input.prompt) ||
    /^(?:explain|review|summari[sz]e|walk me through)\s+this\b/i.test(input.prompt);
  const workspaceContextIncluded = input.mutationRequested || localContextRequested || referencedPath;
  const topicShift = priorUserIndexes.length > 0 && selectedPrior.length === 0 && !explicitContinuity;
  const relevantContextScope = unique([
    "current_message",
    selectedPrior.length ? "related_conversation" : null,
    workspaceContextIncluded ? "selected_project" : null,
    referencedPath ? "referenced_file" : null
  ]);

  return {
    excludedCount: Math.max(0, prior.length - selectedPrior.length),
    includedCount: selectedPrior.length + 1,
    messages: [...selectedPrior, currentMessage],
    relevantContextScope,
    topicShift,
    workspaceContextIncluded
  };
}

export function buildConversationObjectiveState(
  messages: BehavioralConversationMessage[],
  currentPrompt = ""
): ConversationObjectiveState {
  const prior = [...messages];
  for (let index = prior.length - 1; index >= 0; index -= 1) {
    if (prior[index].role === "user" && prior[index].content.trim() === currentPrompt.trim()) {
      prior.splice(index, 1);
      break;
    }
  }
  const allUserMessages = prior
    .filter((message) => message.role === "user")
    .map((message) => message.content.trim())
    .filter(Boolean);
  const userObjectives = allUserMessages
    .filter((message) => !isEllipticalFollowup(message))
    .filter((message) => !isConstraintOnly(message))
    .slice(-MAX_OBJECTIVES);
  const answerable = userObjectives.filter(isAnswerableObjective);
  const actionable = userObjectives.filter(isActionableObjective);
  const activeObjective = userObjectives.at(-1) ?? null;
  const lastAssistantResult = [...prior].reverse().find((message) => message.role === "assistant")?.content.trim() ?? null;
  const activeObjectiveIndex = activeObjective ? allUserMessages.lastIndexOf(activeObjective) : -1;
  const activeConstraints = allUserMessages
    .slice(activeObjectiveIndex + 1)
    .filter(isConstraintOnly)
    .flatMap(extractExplicitNegatives);

  return {
    acceptedConstraints: unique(activeConstraints),
    activeObjective,
    activeTopic: activeObjective ? topicFromObjective(activeObjective) : null,
    lastActionableObjective: actionable.at(-1) ?? null,
    lastAnswerableObjective: answerable.at(-1) ?? null,
    lastAssistantResult: lastAssistantResult?.slice(0, 1_200) ?? null,
    openQuestions: answerable.filter((objective) => /\?/.test(objective)).slice(-4),
    recentObjectives: userObjectives,
    referencedEntities: unique(userObjectives.flatMap(extractRequestedEntities)).slice(-16)
  };
}

function buildAnswerContract(
  action: BehavioralAction,
  resolvedRequest: string,
  intent: IntentConstraintResult,
  requestedCount: number | null,
  requestedEntities: string[],
  persistentConstraints: string[]
): AnswerContract {
  const countRequirements = extractCountRequirements(resolvedRequest);
  const requiredOutputs = extractRequiredOutputs(resolvedRequest);
  if (/\bone\s+example\s+of\s+each\b/i.test(resolvedRequest) && requestedEntities.length > 1) {
    const exampleRequirement = countRequirements.find((requirement) => /^examples?$/i.test(requirement.label));
    if (exampleRequirement) exampleRequirement.count = requestedEntities.length;
    else countRequirements.push({ count: requestedEntities.length, label: "examples" });
  }
  const requestedComparisons = extractComparisonEntities(resolvedRequest);
  return {
    countRequirements,
    explicitConstraints: unique([
      ...intent.contentConstraints,
      ...persistentConstraints,
      ...extractExplicitNegatives(resolvedRequest)
    ]),
    formatRequirements: extractFormatRequirements(resolvedRequest),
    freshnessRequirement: /\b(?:current|currently|latest|today|right now|up[- ]to[- ]date)\b/i.test(resolvedRequest) &&
      !/\b(?:if|suppose|imagine|puzzle|riddle|prove|which is heavier|how many|all but)\b/i.test(resolvedRequest)
      ? "current_if_available"
      : "none",
    minimumCompleteness: "all_material_parts",
    requestedAction: action,
    requestedComparisons,
    requestedCount,
    requestedEntities,
    requestedQuestions: unique(
      resolvedRequest
        .split("?")
        .slice(0, -1)
        .map((question) => question.trim())
        .filter(Boolean)
    ),
    requiredOutputs,
    topic: topicFromObjective(resolvedRequest)
  };
}

export function resolveBehavioralDecision(input: BehavioralDecisionInput): BehavioralDecision {
  const messages = input.messages ?? [];
  const currentPrompt = normalizeRoutingIntentText(input.prompt);
  const objectiveState = buildConversationObjectiveState(messages, currentPrompt);
  const priorObjectives = objectiveState.recentObjectives;
  const requestedCountFromPrompt = extractRequestedCount(currentPrompt);
  const turnSemantics = analyzeAskTurnSemantics(currentPrompt, {
    artifactTargetAvailable: Boolean(
      input.workspace?.activePath?.trim() && input.workspace?.activeFileContent?.trim()
    ),
    hasConversationContext: messages.some((message) => message.role === "user" && message.content.trim() !== currentPrompt)
  });
  const artifactTransformation = turnSemantics.target === "selected_artifact" ||
    turnSemantics.target === "named_artifact" ||
    turnSemantics.target === "pasted_content";
  const referencedObjective = turnSemantics.target !== null
    ? null
    : selectReferencedObjective(
        currentPrompt,
        priorObjectives,
        priorObjectives.filter(isAnswerableObjective),
        priorObjectives.filter(isActionableObjective)
      );
  const resolvedRequest = resolveFollowup(currentPrompt, referencedObjective, requestedCountFromPrompt);
  const intent = extractIntentConstraints({
    message: resolvedRequest,
    priorMessages: messages,
    selectedMode: input.selectedMode,
    workspace: input.workspace
  });
  const inferredAction = inferAction(currentPrompt, resolvedRequest);
  const mixedAction = inferMixedMutationAction(currentPrompt);
  const answerOnlyTransformation = input.selectedMode === "ASK" &&
    (isAskContentTransformationOperation(turnSemantics.operation) || artifactTransformation) &&
    turnSemantics.authority === "answer_only";
  const persistentArtifactMutation = input.selectedMode === "ASK" &&
    artifactTransformation &&
    turnSemantics.authority === "persistent_mutation";
  const action = answerOnlyTransformation
    ? turnSemantics.operation === "explain" || turnSemantics.operation === "simplify" ? "EXPLAIN" : "ANSWER"
    : persistentArtifactMutation
      ? "EDIT"
      : input.selectedMode === "WEBSITE" && (
          isExplicitWebsiteFactUpdate(currentPrompt) || isExplicitWebsiteDesignUpdate(currentPrompt)
        )
        ? "EDIT"
        : mixedAction ?? inferredAction;
  const mixedIntent = Boolean(mixedAction) && !answerOnlyTransformation;
  const mutationIntent = isMutationAction(action);
  const answerIntent = mixedIntent || isAnswerAction(action);
  const requestedCount = requestedCountFromPrompt ?? extractRequestedCount(resolvedRequest);
  const entitySource = resolvedRequest.replace(
    /\b(?:do not|don't|dont|never|no|without)\s+[^.!?\n]{2,120}/gi,
    ""
  );
  const requestedEntities = extractRequestedEntities(entitySource);
  const requestedComparisons = extractComparisonEntities(resolvedRequest);
  const requiredOutputs = extractRequiredOutputs(resolvedRequest);
  const ambiguities = unique([
    ...intent.ambiguity,
    isEllipticalFollowup(currentPrompt) && !referencedObjective && !artifactTransformation
      ? "The follow-up refers to earlier context, but no relevant conversation objective is available."
      : null
  ]);
  const handoffIntent = input.selectedMode === "ASK" &&
    mutationIntent &&
    (intent.semanticMode === "CODE" || intent.semanticMode === "WEBSITE");
  const finalAction: BehavioralAction = handoffIntent ? "HANDOFF" : action;
  const confidence = ambiguities.length
    ? Math.min(intent.confidence, referencedObjective ? 0.72 : 0.45)
    : Math.max(intent.confidence, 0.88);
  const objective = referencedObjective && isEllipticalFollowup(currentPrompt) && turnSemantics.dependency !== "operation_transfer"
    ? referencedObjective
    : currentPrompt.trim();
  const persistentConstraints = (
    referencedObjective ||
    isEllipticalFollowup(currentPrompt) ||
    isConstraintOnly(currentPrompt)
  )
    ? objectiveState.acceptedConstraints
    : [];
  const clarificationRequired = Boolean(
    ambiguities.some((ambiguity) => /no relevant conversation objective/i.test(ambiguity))
  );
  const intentClass = intentClassFor({
    action,
    clarificationRequired,
    mixedIntent,
    mode: input.selectedMode,
    prompt: currentPrompt
  });
  const initialDisposition: FinalActionDisposition = clarificationRequired
    ? "clarify"
    : action === "PLAN"
      ? "plan"
      : mutationIntent
        ? input.selectedMode === "ASK"
          ? "propose_action"
          : "request_approval"
        : "answer";
  const normalizedFinalAction = normalizeFinalActionDecision({
    answerOnly: !mutationIntent,
    approvalRequired: mutationIntent && input.selectedMode !== "ASK",
    approvalSatisfied: false,
    clarificationRequired,
    disposition: initialDisposition,
    executionAllowed: false,
    mutationRequested: mutationIntent
  });
  const contextSelection = selectRelevantBehavioralContext({
    messages,
    mode: input.selectedMode,
    mutationRequested: normalizedFinalAction.mutationRequested,
    prompt: currentPrompt,
    referencedObjective,
    workspace: input.workspace
  });
  const decisionReasons = unique([
    mixedIntent ? "The request combines specialist explanation with an explicit implementation action." : null,
    action === "PLAN" ? "The user requested a plan without asking Hassali to apply it." : null,
    !mutationIntent ? "The requested outcome can be satisfied without changing project state." : null,
    mutationIntent ? "The user explicitly requested a project, file, or runtime action." : null,
    normalizedFinalAction.approvalRequired ? "Selected-mode mutation requires approval before execution." : null,
    contextSelection.topicShift ? "Low topic overlap indicates a new task, so stale task-specific history was excluded." : null,
    contextSelection.workspaceContextIncluded ? "The request explicitly targets selected project or file context." : null
  ]);

  return {
    action: finalAction,
    ambiguities,
    answerOnly: normalizedFinalAction.answerOnly,
    answerContract: buildAnswerContract(
      finalAction,
      resolvedRequest,
      intent,
      requestedCount,
      requestedEntities,
      persistentConstraints
    ),
    answerIntent,
    approvalRequired: normalizedFinalAction.approvalRequired,
    approvalSatisfied: normalizedFinalAction.approvalSatisfied,
    artifactRequested: ["BUILD", "EDIT", "FIX"].includes(action),
    confidence,
    constraints: unique([
      ...intent.contentConstraints,
      ...intent.styleConstraints,
      ...intent.countConstraints.map((constraint) => constraint.source)
    ]),
    contextItemsExcluded: contextSelection.excludedCount,
    contextItemsIncluded: contextSelection.includedCount,
    decisionReasons,
    clarificationRequired: normalizedFinalAction.clarificationRequired,
    executionAllowed: normalizedFinalAction.executionAllowed,
    executionIntent: ["EXECUTE", "RUN", "TEST"].includes(action),
    explicitNegatives: extractExplicitNegatives(resolvedRequest),
    finalDisposition: normalizedFinalAction.disposition,
    handoffIntent,
    intent,
    intentClass,
    mixedIntent,
    mode: input.selectedMode,
    mutationIntent: normalizedFinalAction.mutationRequested,
    objective,
    objectiveState: {
      ...objectiveState,
      activeObjective: objective,
      activeTopic: topicFromObjective(objective),
      referencedEntities: unique([...objectiveState.referencedEntities, ...requestedEntities]).slice(-16)
    },
    planRequested: action === "PLAN",
    referencedObjective,
    relevantContextScope: contextSelection.relevantContextScope,
    relevantWorkspaceContext: contextSelection.workspaceContextIncluded,
    requestedComparisons,
    requestedCount,
    requestedEntities,
    requestedOutcome: resolvedRequest,
    requiredOutputs,
    researchIntent: action === "RESEARCH" || /\b(?:current|latest|today|right now)\b/i.test(resolvedRequest),
    resolvedRequest,
    topicShift: contextSelection.topicShift,
    userGoal: topicFromObjective(objective),
    validationWarnings: normalizedFinalAction.warnings
  };
}

function entityPresent(answer: string, entity: string) {
  const answerNormalized = normalize(answer);
  const entityNormalized = normalize(entity);
  if (!entityNormalized) return true;
  if (answerNormalized.includes(entityNormalized)) return true;
  const meaningful = contentTokens(entity);
  return meaningful.length > 0 && meaningful.every((token) => answerNormalized.includes(token));
}

function observedListItemCount(answer: string) {
  const items = answer
    .split(/\r?\n/)
    .filter((line) => /^\s*(?:[-*•]|\*{0,2}\d+[.)]\*{0,2})\s+\S/.test(line));
  if (items.length) return items.length;

  const inlineNumbered = Array.from(answer.matchAll(/(?:^|\s)(\d+)[.)]\s+\S/g));
  return inlineNumbered.length || null;
}

function countRequirementAliases(label: string) {
  if (/^(?:benefits?|pros?)$/i.test(label)) return ["benefits?", "pros?", "advantages?"];
  if (/^(?:drawbacks?|cons?)$/i.test(label)) return ["drawbacks?", "cons?", "disadvantages?"];
  return [`${label.replace(/s$/i, "")}s?`];
}

function observedCountForRequirement(answer: string, requirement: AnswerCountRequirement) {
  const aliases = countRequirementAliases(requirement.label);
  if (/^examples?$/i.test(requirement.label)) {
    return Array.from(answer.matchAll(/\b(?:example|for instance|e\.g\.)\b/gi)).length;
  }

  const headingPattern = new RegExp(
    `^\\s*(?:#{1,6}\\s*)?(?:${aliases.join("|")})\\s*:?\\s*$`,
    "i"
  );
  const anyCountHeadingPattern = /^\s*(?:#{1,6}\s*)?(?:benefits?|pros?|advantages?|drawbacks?|cons?|disadvantages?|examples?|options?|reasons?|steps?|tools?|ways?|ideas?|items?|recommendations?)\s*:?\s*$/i;
  const lines = answer.split(/\r?\n/);
  let active = false;
  let count = 0;

  for (const line of lines) {
    if (headingPattern.test(line)) {
      active = true;
      continue;
    }
    if (active && anyCountHeadingPattern.test(line)) break;
    if (active && /^\s*(?:[-*â€¢]|\*{0,2}\d+[.)]\*{0,2})\s+\S/.test(line)) count += 1;
  }

  return count;
}

function observedCompleteListItemCount(answer: string) {
  const legacyCount = observedListItemCount(answer) ?? 0;
  const unicodeBulletCount = answer
    .split(/\r?\n/)
    .filter((line) => /^\s*\u2022\s+\S/.test(line))
    .length;
  return Math.max(legacyCount, unicodeBulletCount) || null;
}

function observedCompleteCountForRequirement(answer: string, requirement: AnswerCountRequirement) {
  const aliases = countRequirementAliases(requirement.label);
  const headingPattern = new RegExp(
    `^\\s*(?:#{1,6}\\s*)?(?:${aliases.join("|")})\\s*:?\\s*$`,
    "i"
  );
  const anyCountHeadingPattern = /^\s*(?:#{1,6}\s*)?(?:benefits?|pros?|advantages?|drawbacks?|cons?|disadvantages?|examples?|options?|reasons?|steps?|tools?|ways?|ideas?|items?|recommendations?)\s*:?\s*$/i;
  const lines = answer.split(/\r?\n/);
  let active = false;
  let unicodeBulletCount = 0;

  for (const line of lines) {
    if (headingPattern.test(line)) {
      active = true;
      continue;
    }
    if (active && anyCountHeadingPattern.test(line)) break;
    if (active && /^\s*\u2022\s+\S/.test(line)) unicodeBulletCount += 1;
  }

  return Math.max(observedCountForRequirement(answer, requirement), unicodeBulletCount);
}

function sentenceCount(answer: string) {
  return answer
    .replace(/```[\s\S]*?```/g, "")
    .split(/(?<=[.!?])(?:["')\]]*)\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .length;
}

function missingAnswerFormats(answer: string, requirements: string[]) {
  return requirements.filter((requirement) => {
    if (requirement === "table") {
      return answer.split(/\r?\n/).filter((line) => /\|/.test(line)).length < 2;
    }
    if (requirement === "bullets") return observedCompleteListItemCount(answer) === null;
    const sentenceRequirement = requirement.match(/^(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+sentences?$/i);
    if (sentenceRequirement) {
      const expected = /^\d+$/.test(sentenceRequirement[1])
        ? Number(sentenceRequirement[1])
        : NUMBER_WORDS[sentenceRequirement[1].toLowerCase()] ?? 0;
      return sentenceCount(answer) !== expected;
    }
    const wordRequirement = requirement.match(/(\d+)\s+words?$/i);
    if (wordRequirement) {
      const expected = Number(wordRequirement[1]);
      const actual = answer.trim().split(/\s+/).filter(Boolean).length;
      const tolerance = Math.max(5, Math.round(expected * 0.2));
      return actual < expected - tolerance || actual > expected + tolerance;
    }
    if (requirement === "concise") {
      return answer.trim().split(/\s+/).filter(Boolean).length > 250;
    }
    return false;
  });
}

function negativeConstraintViolated(answer: string, constraint: string) {
  if (!/^(?:do not|don't|dont|never|no|without)\s+/i.test(constraint)) return false;
  const target = constraint
    .replace(/^(?:do not|don't|dont|never|no|without)\s+/i, "")
    .replace(/^(?:include|mention|recommend|use|add|discuss|suggest)\s+/i, "")
    .trim();
  if (!target || target.length < 2 || !entityPresent(answer, target)) return false;
  const relevantSentences = answer
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => entityPresent(sentence, target));
  return relevantSentences.some((sentence) =>
    !/\b(?:avoid|do not|don't|exclude|never|no need|not recommend|skip|without)\b/i.test(sentence)
  );
}

function topicAligned(answer: string, topic: string, requiredEntities: string[]) {
  if (requiredEntities.length) {
    return requiredEntities.some((entity) => entityPresent(answer, entity));
  }
  const tokens = contentTokens(topic);
  if (!tokens.length) return true;
  const answerTokens = new Set(contentTokens(answer));
  const matches = tokens.filter((token) => answerTokens.has(token)).length;
  return matches >= Math.min(2, tokens.length);
}

export function validateAnswerAgainstContract(
  answer: string,
  contract: AnswerContract
): AnswerContractValidation {
  const issues: string[] = [];
  const selectionRecommendation = contract.requiredOutputs.includes("recommendation") &&
    contract.requestedComparisons.length > 1;
  const selectionNamesOneComparedEntity = contract.requestedComparisons.some((entity) =>
    entityPresent(answer, entity)
  );
  const missingEntities = selectionRecommendation && selectionNamesOneComparedEntity
    ? []
    : contract.requestedEntities.filter((entity) => !entityPresent(answer, entity));
  const missingOutputs = contract.requiredOutputs.filter((output) => {
    if (output === "pros_and_cons") return !(/\bpros?\b/i.test(answer) && /\bcons?\b/i.test(answer));
    if (output === "example") return !/\b(?:example|for instance|e\.g\.)\b/i.test(answer);
    if (output === "explanation") return answer.trim().length < 80;
    if (output === "recommendation") return !/\b(?:recommend|best fit|choose|choice|prefer|would use|simpler|better)\b/i.test(answer);
    if (output === "steps") return observedCompleteListItemCount(answer) === null;
    if (output === "code") return !/```|(?:const|function|class|def|import|<\w+)/i.test(answer);
    return false;
  });
  const enforceLabeledCounts = contract.countRequirements.length > 1 ||
    contract.countRequirements.some((requirement) => /^examples?$/i.test(requirement.label) && requirement.count > 1);
  const missingCountRequirements = enforceLabeledCounts
    ? contract.countRequirements.filter((requirement) =>
        observedCompleteCountForRequirement(answer, requirement) < requirement.count
      )
    : [];
  const inlinePerEntityExampleRequest = contract.countRequirements.length === 1 &&
    /^examples?$/i.test(contract.countRequirements[0].label) &&
    contract.requestedCount !== null &&
    contract.countRequirements[0].count > contract.requestedCount;
  const observedItemCount = contract.requestedCount && !inlinePerEntityExampleRequest
    ? observedCompleteListItemCount(answer)
    : null;
  const countConstrainedListIsComplete = contract.requestedCount !== null &&
    !inlinePerEntityExampleRequest &&
    (observedItemCount ?? 0) >= contract.requestedCount &&
    missingEntities.length === 0 &&
    missingCountRequirements.length === 0;
  const aligned = topicAligned(answer, contract.topic, contract.requestedEntities) ||
    countConstrainedListIsComplete;
  const missingFormats = missingAnswerFormats(answer, contract.formatRequirements);
  const missingQuestions = contract.requestedQuestions.length > 1
    ? contract.requestedQuestions.filter((question) => {
    const questionEntitySource = question.replace(
      /\b(?:do not|don't|dont|never|no|without)\s+[^.!?\n]{2,120}/gi,
      ""
    );
    return !topicAligned(
      answer,
      topicFromObjective(question),
      extractRequestedEntities(questionEntitySource)
    );
      })
    : [];
  const violatedConstraints = contract.explicitConstraints.filter((constraint) =>
    negativeConstraintViolated(answer, constraint)
  );

  if (!answer.trim()) issues.push("Answer is empty.");
  if (/\b(?:kernel classified|analysis request|kept code from generating|relevant objective for ask mode)\b/i.test(answer)) {
    issues.push("Answer exposes internal routing language.");
  }
  if (/\b(?:evaluation rubric|grading criteria|score this answer|assistant response quality)\b/i.test(answer)) {
    issues.push("Answer resembles evaluator or rubric output.");
  }
  if (!aligned) issues.push("Answer is not aligned with the resolved topic.");
  if (missingEntities.length) issues.push(`Answer omits required entities: ${missingEntities.join(", ")}.`);
  if (missingOutputs.length) issues.push(`Answer omits required outputs: ${missingOutputs.join(", ")}.`);
  if (missingFormats.length) issues.push(`Answer misses required format: ${missingFormats.join(", ")}.`);
  if (missingQuestions.length) issues.push(`Answer omits requested questions: ${missingQuestions.join(" | ")}.`);
  if (violatedConstraints.length) issues.push(`Answer violates explicit constraints: ${violatedConstraints.join(", ")}.`);
  if (missingCountRequirements.length) {
    issues.push(
      `Answer does not satisfy requested category counts: ${missingCountRequirements
        .map((requirement) => `${requirement.count} ${requirement.label}`)
        .join(", ")}.`
    );
  }
  if (contract.requestedCount && !inlinePerEntityExampleRequest && (observedItemCount ?? 0) < contract.requestedCount) {
    issues.push(`Answer provides fewer than the requested ${contract.requestedCount} items.`);
  }

  return {
    complete: issues.length === 0,
    issues,
    missingCountRequirements,
    missingEntities,
    missingFormatRequirements: missingFormats,
    missingOutputs,
    missingQuestions,
    observedItemCount,
    topicAligned: aligned,
    violatedConstraints
  };
}

export function answerContractRepairInstruction(
  contract: AnswerContract,
  validation: AnswerContractValidation
) {
  return [
    `Resolved objective: ${contract.topic}`,
    validation.missingEntities.length
      ? `Address these missing entities: ${validation.missingEntities.join(", ")}.`
      : null,
    validation.missingOutputs.length
      ? `Add these missing response parts: ${validation.missingOutputs.join(", ")}.`
      : null,
    validation.missingFormatRequirements.length
      ? `Follow these missing format requirements: ${validation.missingFormatRequirements.join(", ")}.`
      : null,
    validation.missingQuestions.length
      ? `Answer every omitted question: ${validation.missingQuestions.join(" | ")}.`
      : null,
    validation.violatedConstraints.length
      ? `Remove content that violates: ${validation.violatedConstraints.join(", ")}.`
      : null,
    validation.missingCountRequirements.length
      ? `Add clearly labeled sections with ${validation.missingCountRequirements
          .map((requirement) => `${requirement.count} ${requirement.label}`)
          .join(" and ")}.`
      : null,
    contract.requestedCount
      ? `Return exactly ${contract.requestedCount} clearly distinguishable items when the request asks for a list.`
      : null,
    !validation.topicAligned ? "Replace unrelated material with an answer to the resolved objective." : null,
    "Return one coherent final answer. Do not mention validation, routing, rubrics, or this repair instruction."
  ].filter(Boolean).join("\n");
}
