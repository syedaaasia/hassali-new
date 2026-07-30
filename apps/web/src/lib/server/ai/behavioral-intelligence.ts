import {
  extractIntentConstraints,
  type IntentConstraintResult
} from "./intent-constraint-brain";
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

export type BehavioralConversationMessage = {
  content: string;
  role: "assistant" | "system" | "user";
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
  answerContract: AnswerContract;
  answerIntent: boolean;
  confidence: number;
  constraints: string[];
  executionIntent: boolean;
  explicitNegatives: string[];
  handoffIntent: boolean;
  intent: IntentConstraintResult;
  mode: WorkspaceProductMode;
  mutationIntent: boolean;
  objective: string;
  objectiveState: ConversationObjectiveState;
  referencedObjective: string | null;
  requestedComparisons: string[];
  requestedCount: number | null;
  requestedEntities: string[];
  requiredOutputs: string[];
  researchIntent: boolean;
  resolvedRequest: string;
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

function contentTokens(value: string) {
  return unique(
    normalize(value)
      .split(/\s+/)
      .filter((token) => token.length >= 3 && !STOP_WORDS.has(token))
  );
}

function isEllipticalFollowup(value: string) {
  const text = value.trim();
  return (
    /^(?:answer|do|build|fix|try|make|continue|explain|compare)\s+(?:it|that|them|the previous (?:question|answer))(?:\s+correctly)?[.!?]*$/i.test(text) ||
    /^(?:think longer(?: and answer)?|why|which one(?:\s+is\s+[^.!?]+)?|more|continue|go on|try again|make (?:it|that) (?:shorter|longer|simpler))[.!?]*$/i.test(text) ||
    /^(?:give me\s+)?(?:the\s+)?top\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)(?:\s+[^.!?]+)?[.!?]*$/i.test(text) ||
    /^(?:give|name)(?:\s+me)?\s+(?:(?:an?|one)\s+example|(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:benefits?|drawbacks?|examples?|options?|reasons?|tools?|ways?))[.!?]*$/i.test(text) ||
    /^(?:what are (?:the )?(?:benefits?|downsides?|drawbacks?|pros?|cons?)|would you personally [^.!?]*(?:it|here))[.!?]*$/i.test(text) ||
    /\b(?:go back to|return to)\b/i.test(text)
  );
}

function isAnswerableObjective(value: string) {
  return (
    /\?/u.test(value) ||
    /^(?:analy[sz]e|compare|explain|give|help me plan|list|recommend|review|should|tell|think|what|which|who|why|how)\b/i.test(value.trim())
  );
}

function isActionableObjective(value: string) {
  return /^(?:now\s+)?(?:add|apply|build|change|create|delete|design|edit|fix|implement|make|refactor|remove|rename|replace|rewrite|run|test|update|use|write)\b/i.test(value.trim());
}

function isConstraintOnly(value: string) {
  return /^(?:do not|don't|dont|never|no|without)\b/i.test(value.trim());
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

  if (/\b(?:previous question|answer (?:it|that)|think longer|why|which one|compare them|top \w+)\b/i.test(prompt)) {
    return answerableObjectives.at(-1) ?? priorUserObjectives.at(-1) ?? null;
  }

  if (isEllipticalFollowup(prompt) && !/^(?:build|do|fix|implement|apply)\b/i.test(prompt.trim())) {
    return priorUserObjectives.at(-1) ?? answerableObjectives.at(-1) ?? null;
  }

  if (/^(?:build|do|fix|implement|apply)\s+(?:it|that)[.!?]*$/i.test(prompt.trim())) {
    return actionableObjectives.at(-1) ?? answerableObjectives.at(-1) ?? priorUserObjectives.at(-1) ?? null;
  }

  if (isEllipticalFollowup(prompt)) {
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
  if (/^(?:build|do|fix|implement|apply)\s+(?:it|that)[.!?]*$/i.test(trimmed)) {
    return `${trimmed.replace(/\b(?:it|that)\b/i, `"${referencedObjective}"`)}`;
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
    /^(?:add|apply|change|delete|edit|modify|refactor|remove|rename|replace|rewrite|redesign|update|use)\b/i.test(raw) ||
    /^(?:i want|i need|please)\s+(?:you\s+to\s+)?(?:add|apply|change|edit|modify|refactor|remove|replace|rewrite|update)\b/i.test(raw)
  ) return "EDIT";
  if (/^(?:plan|help me plan|outline a plan)\b/i.test(raw)) return "PLAN";
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

function isMutationAction(action: BehavioralAction) {
  return ["BUILD", "EDIT", "EXECUTE", "FIX", "RUN", "TEST"].includes(action);
}

function isAnswerAction(action: BehavioralAction) {
  return ["ANALYZE", "ANSWER", "EXPLAIN", "PLAN", "RESEARCH"].includes(action);
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
    freshnessRequirement: /\b(?:current|currently|latest|today|right now|up[- ]to[- ]date)\b/i.test(resolvedRequest)
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
  const objectiveState = buildConversationObjectiveState(messages, input.prompt);
  const priorObjectives = objectiveState.recentObjectives;
  const requestedCountFromPrompt = extractRequestedCount(input.prompt);
  const referencedObjective = selectReferencedObjective(
    input.prompt,
    priorObjectives,
    priorObjectives.filter(isAnswerableObjective),
    priorObjectives.filter(isActionableObjective)
  );
  const resolvedRequest = resolveFollowup(input.prompt, referencedObjective, requestedCountFromPrompt);
  const intent = extractIntentConstraints({
    message: resolvedRequest,
    priorMessages: messages,
    selectedMode: input.selectedMode,
    workspace: input.workspace
  });
  const inferredAction = inferAction(input.prompt, resolvedRequest);
  const action = input.selectedMode === "WEBSITE" && isExplicitWebsiteFactUpdate(input.prompt)
    ? "EDIT"
    : inferredAction;
  const mutationIntent = isMutationAction(action);
  const answerIntent = isAnswerAction(action);
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
    isEllipticalFollowup(input.prompt) && !referencedObjective
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
  const objective = referencedObjective && isEllipticalFollowup(input.prompt)
    ? referencedObjective
    : input.prompt.trim();
  const persistentConstraints = (
    referencedObjective ||
    isEllipticalFollowup(input.prompt) ||
    isConstraintOnly(input.prompt)
  )
    ? objectiveState.acceptedConstraints
    : [];

  return {
    action: finalAction,
    ambiguities,
    answerContract: buildAnswerContract(
      finalAction,
      resolvedRequest,
      intent,
      requestedCount,
      requestedEntities,
      persistentConstraints
    ),
    answerIntent,
    confidence,
    constraints: unique([
      ...intent.contentConstraints,
      ...intent.styleConstraints,
      ...intent.countConstraints.map((constraint) => constraint.source)
    ]),
    executionIntent: ["EXECUTE", "RUN", "TEST"].includes(action),
    explicitNegatives: extractExplicitNegatives(resolvedRequest),
    handoffIntent,
    intent,
    mode: input.selectedMode,
    mutationIntent,
    objective,
    objectiveState: {
      ...objectiveState,
      activeObjective: objective,
      activeTopic: topicFromObjective(objective),
      referencedEntities: unique([...objectiveState.referencedEntities, ...requestedEntities]).slice(-16)
    },
    referencedObjective,
    requestedComparisons,
    requestedCount,
    requestedEntities,
    requiredOutputs,
    researchIntent: action === "RESEARCH" || /\b(?:current|latest|today|right now)\b/i.test(resolvedRequest),
    resolvedRequest
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
