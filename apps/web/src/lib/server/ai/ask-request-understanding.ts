export type AskMemoryRequirement = "irrelevant" | "required" | "useful";

export type AskTaskType =
  | "calculation"
  | "coding"
  | "comparison"
  | "follow_up"
  | "fresh_information"
  | "general_knowledge"
  | "personal_recall"
  | "writing";

export type AskMethod =
  | "conversation_reasoning"
  | "deterministic_if_available"
  | "evidence_grounded_reasoning"
  | "fresh_retrieval"
  | "memory_recall"
  | "model_reasoning";

export type AskRequestUnderstanding = {
  conversationContext: "recent_required" | "useful" | "current_turn_only";
  evidenceAuthority: "irrelevant" | "required";
  freshnessRequirement: "retrieval_required" | "timeless";
  memoryRequirement: AskMemoryRequirement;
  method: AskMethod;
  taskType: AskTaskType;
  uncertainty: "freshness_required" | "future_or_unknowable" | "ordinary";
};

type ConversationMessage = {
  content: string;
  role: "assistant" | "system" | "user";
};

function isPersonalRecall(prompt: string) {
  return /^(?:what(?:'s|\s+is)\s+my|do you remember(?:\s+what)?\s+my)\s+.+/i.test(prompt) ||
    /^(?:what|tell me what)\s+(?:do\s+)?you\s+(?:remember|know)\s+about\s+me\b/i.test(prompt) ||
    /^(?:who\s+is|how\s+is)\s+.+?\s+(?:to\s+me|related\s+to\s+me)\b/i.test(prompt) ||
    /\b(?:from|in|using)\s+(?:your\s+)?saved memor(?:y|ies)\b/i.test(prompt);
}

function isMemoryMutation(prompt: string) {
  return /^(?:please\s+)?remember(?:\s+that)?\s+/i.test(prompt) ||
    /^(?:forget|delete|remove)\s+(?:all|everything|that|my|everything\s+about)\b/i.test(prompt) ||
    /^(?:change|update)\s+my\s+.+?\s+to\s+/i.test(prompt) ||
    /^(?:my\s+favorite\s+.+?\s+is|i\s+prefer|my\s+goal\s+is|please\s+always|always)\s+/i.test(prompt);
}

function isContextualFollowUp(prompt: string, messages: ConversationMessage[]) {
  if (!messages.some((message) => message.role === "assistant" && message.content.trim())) return false;
  return /^(?:why|what about|and|also|then|so)\b/i.test(prompt) ||
    /\b(?:you (?:said|mentioned|recommended)|your (?:answer|example)|the (?:first|second|third|last|previous) (?:point|advantage|option|step)|that (?:point|answer|example|idea)|it|those|them)\b/i.test(prompt);
}

function explicitlyUsesEvidence(prompt: string) {
  return /\b(?:attached|attachment|uploaded|document|pdf|spreadsheet|csv|image|screenshot|photo|file|pasted (?:text|data)|this (?:text|table|data|source))\b/i.test(prompt) &&
    /\b(?:analy[sz]e|according to|compare|explain|extract|find|read|review|say|show|summari[sz]e|what)\b/i.test(prompt);
}

function taskType(prompt: string, input: {
  followUp: boolean;
  freshnessRequired: boolean;
  personalRecall: boolean;
}): AskTaskType {
  if (input.personalRecall) return "personal_recall";
  if (input.freshnessRequired) return "fresh_information";
  if (input.followUp) return "follow_up";
  if (/\b(?:write|create|show|give me)\b[\s\S]{0,60}\b(?:code|function|class|query|regex|script|python|javascript|typescript|sql)\b|\b(?:debug|refactor)\b[\s\S]{0,60}\b(?:code|function|class|script|program)\b/i.test(prompt)) return "coding";
  if (/\b(?:rewrite|draft|email|message|letter|caption|proposal|copy)\b/i.test(prompt)) return "writing";
  if (/\b(?:calculate|compute|how much|percentage|compound interest|\d+\s*[+*/-]\s*\d+)\b/i.test(prompt)) return "calculation";
  if (/\b(?:compare|versus|\bvs\b|advantages? and disadvantages?|pros and cons|tradeoffs?)\b/i.test(prompt)) return "comparison";
  return "general_knowledge";
}

export function understandAskRequest(input: {
  freshnessRequired: boolean;
  hasSuppliedEvidence: boolean;
  messages: ConversationMessage[];
  prompt: string;
}): AskRequestUnderstanding {
  const prompt = input.prompt.trim();
  const personalRecall = isPersonalRecall(prompt);
  const memoryMutation = isMemoryMutation(prompt);
  const followUp = isContextualFollowUp(prompt, input.messages);
  const evidenceAuthority = input.hasSuppliedEvidence && explicitlyUsesEvidence(prompt)
    ? "required"
    : "irrelevant";
  const memoryRequirement: AskMemoryRequirement = personalRecall
    ? "required"
    : memoryMutation || /\b(?:for me|based on my preferences?|personalized?)\b/i.test(prompt)
      ? "useful"
      : "irrelevant";
  const resolvedTaskType = taskType(prompt, {
    followUp,
    freshnessRequired: input.freshnessRequired,
    personalRecall
  });
  const futureUncertainty = /\b(?:who will win|what will happen|predict the|in 20\d{2})\b/i.test(prompt);
  const method: AskMethod = evidenceAuthority === "required"
    ? "evidence_grounded_reasoning"
    : input.freshnessRequired
      ? "fresh_retrieval"
      : personalRecall
        ? "memory_recall"
        : followUp
          ? "conversation_reasoning"
          : resolvedTaskType === "calculation"
            ? "deterministic_if_available"
            : "model_reasoning";

  return {
    conversationContext: followUp
      ? "recent_required"
      : input.messages.some((message) => message.role === "assistant" && message.content.trim())
        ? "useful"
        : "current_turn_only",
    evidenceAuthority,
    freshnessRequirement: input.freshnessRequired ? "retrieval_required" : "timeless",
    memoryRequirement,
    method,
    taskType: resolvedTaskType,
    uncertainty: input.freshnessRequired
      ? "freshness_required"
      : futureUncertainty
        ? "future_or_unknowable"
        : "ordinary"
  };
}

export function compactAskRequestUnderstanding(input: AskRequestUnderstanding) {
  return { ...input };
}
