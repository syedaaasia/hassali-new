export type AskContentOperation =
  | "answer"
  | "explain"
  | "extract"
  | "format"
  | "rewrite"
  | "shorten"
  | "simplify"
  | "summarize"
  | "translate"
  | "unknown";

export type AskContentTarget =
  | "conversation"
  | "explicit_subject"
  | "named_artifact"
  | "pasted_content"
  | "selected_artifact"
  | null;

export type AskTurnDependency = "independent" | "local_reference" | "operation_transfer" | "prior_context";

export type AskTurnAuthority = "answer_only" | "persistent_mutation";

export type AskTurnSemantics = {
  authority: AskTurnAuthority;
  dependency: AskTurnDependency;
  explicitMutation: boolean;
  explicitTarget: boolean;
  operation: AskContentOperation;
  target: AskContentTarget;
};

export type AskTurnSemanticContext = {
  artifactTargetAvailable?: boolean;
  hasConversationContext?: boolean;
};

const ARTIFACT_PATH = /(?:^|[\s"'`(])(?:[\w.-]+\/)*[\w.-]+\.(?:csv|docx?|html?|jsx?|md|pdf|rtf|tsx?|txt|xlsx?)(?=$|[\s"'`),.!?])/i;
const CONVERSATION_TARGET = /\b(?:our|this|the|current|complete|entire)\s+(?:chat|conversation|discussion|thread)\b|\b(?:chat|conversation|discussion|thread)\s+(?:history|transcript)\b|\b(?:last|latest|most recent)\s+\d{1,3}\s+(?:messages?|turns?)\b|\beverything (?:we(?:'ve| have) discussed|we discussed)\b|\bwhat (?:have|did) we (?:discuss(?:ed)?|talk(?:ed)? about)\b/i;
const ARTIFACT_TARGET = /\b(?:active|attached|current|named|selected|uploaded)\s+(?:article|attachment|document|file|pdf|report|text)\b|\b(?:article|attachment|document|file|pdf|report|upload)\s+(?:attached|selected|uploaded)\b/i;
const OPERATION_VERBS: ReadonlyArray<[AskContentOperation, RegExp]> = [
  ["summarize", /\b(?:recap|summari[sz]e|summary)\b/i],
  ["shorten", /\b(?:abridge|compress|condense|shorten)\b|\b(?:cut|trim)\s+(?:it|this|that)\s+down\b|\bmake\s+[^.!?\r\n]{1,80}\s+(?:more\s+)?(?:concise|shorter)\b|\b(?:more concise|shorter version)\b|\breduce\s+(?:it|this|that)\s+to\s+(?:the\s+)?essentials\b/i],
  ["rewrite", /\b(?:polish|proofread|rephrase|rewrite)\b|\bcorrect\s+(?:the\s+)?(?:grammar|wording)\b|\bmake\s+(?:it|this|that)\s+(?:more\s+)?(?:formal|friendly|human|professional)\b|\bput\s+(?:it|this|that)\s+(?:in\s+)?(?:a\s+)?(?:different|another|simpler)\s+way\b/i],
  ["simplify", /\b(?:simplify)\b|\b(?:plain|simpler|simple)\s+(?:English|language|terms|words)\b|\bmake\s+(?:it|this|that)\s+(?:more\s+)?simple\b/i],
  ["translate", /\btranslat(?:e|ion)\b/i],
  ["format", /\b(?:convert|format|organize|turn)\b[\s\S]{0,80}\b(?:as|into)\b|\b(?:checklist|table|bullet points?)\s+(?:format|version)\b/i],
  ["extract", /\b(?:extract|identify|list|pull out|find)\b/i],
  ["explain", /\b(?:clarify|describe|elaborate|explain|teach|unpack|walk me through)\b|\bexpand\s+(?:on|upon)\b/i]
];

const DISCOURSE_WORDS = new Set([
  "after", "afterward", "alternative", "argument", "assumption", "before", "case", "certain",
  "claim", "comparison", "consequence", "down", "effect", "evidence", "example", "follows",
  "happen", "happens", "immediately", "implication", "least", "matter", "most", "objection",
  "option", "other", "part", "point", "practical", "prefer", "reason", "reverse", "risk", "skeptic",
  "stated", "strongest", "tradeoff", "tradeoffs", "uncertain", "use", "work", "works"
]);

const FUNCTION_WORDS = new Set([
  "a", "an", "and", "are", "be", "can", "could", "did", "do", "does", "for", "from", "has",
  "have", "how", "i", "if", "in", "is", "it", "may", "me", "might", "my", "of", "on", "or", "should", "so",
  "that", "the", "then", "there", "these", "this", "those", "to", "was", "were", "what", "when",
  "where", "which", "why", "will", "with", "would", "you"
]);

function normalized(value: string) {
  return value
    .trim()
    .replace(/[.!?]+$/g, "")
    .replace(/^please\s+/i, "")
    .replace(/^(?:can|could|would|will)\s+(?:you|u)\s+(?:please\s+)?/i, "")
    .replace(/^(?:actually|instead|next|now)\s*,?\s+/i, "")
    .trim();
}

function operationFor(prompt: string): AskContentOperation {
  for (const [operation, pattern] of OPERATION_VERBS) {
    if (pattern.test(prompt)) return operation;
  }
  return "unknown";
}

export function isAskContentTransformationOperation(operation: AskContentOperation) {
  return ["explain", "extract", "format", "rewrite", "shorten", "simplify", "summarize", "translate"].includes(operation);
}

function hasPersistentMutationAuthority(prompt: string) {
  return /\b(?:apply|commit|modify|overwrite|save|update|write)\b[\s\S]{0,80}\b(?:changes?|file|project|repository|repo|workspace|disk)\b/i.test(prompt) ||
    /\b(?:apply|save|write)\s+(?:it|this|that|the result|the changes?)\b/i.test(prompt) ||
    /\b(?:edit|modify|update|replace)\s+(?:the\s+)?(?:active|current|selected|named)?\s*(?:file|project|repository|workspace|[\w./-]+\.(?:jsx?|tsx?|html?|css|md|txt))\b/i.test(prompt) ||
    /\b(?:in[- ]place|on disk|in (?:the )?(?:file|project|repository|repo|workspace))\b/i.test(prompt);
}

function hasPastedBody(prompt: string) {
  const body = prompt.match(/:\s*(?:\r?\n)?([\s\S]+)$/)?.[1]?.trim() ?? "";
  return body.length >= 40 || body.split(/\r?\n/).filter(Boolean).length >= 2;
}

function explicitTransformSubject(prompt: string, operation: AskContentOperation) {
  if (ARTIFACT_PATH.test(prompt) || ARTIFACT_TARGET.test(prompt) || CONVERSATION_TARGET.test(prompt)) return true;
  if (hasPastedBody(prompt)) return true;
  const text = normalized(prompt);
  const prepositional = text.match(/\b(?:about|from|in|of|on|regarding)\s+([^,;:!?]{2,100})/i)?.[1]?.trim();
  if (prepositional && !/^(?:it|this|that|these|those|them|the (?:attachment|document|file|report|text))\b/i.test(prepositional)) {
    return true;
  }
  if (operation === "explain") {
    const object = text.match(/^(?:(?:can|could|would)\s+(?:you|u)\s+)?(?:clarify|describe|elaborate(?:\s+on)?|expand\s+(?:on|upon)|explain|teach|unpack|walk me through)\s+(.+)$/i)?.[1]?.trim();
    return Boolean(object &&
      !/^(?:it|this|that|these|those|them)\b/i.test(object) &&
      !/^(?:again|how|more|why)[.!?]*$/i.test(object));
  }
  return false;
}

function targetFor(
  prompt: string,
  operation: AskContentOperation,
  context: AskTurnSemanticContext
): AskContentTarget {
  if (ARTIFACT_PATH.test(prompt)) return "named_artifact";
  if (ARTIFACT_TARGET.test(prompt)) return context.artifactTargetAvailable ? "selected_artifact" : "named_artifact";
  if (CONVERSATION_TARGET.test(prompt)) return "conversation";
  if (hasPastedBody(prompt)) return "pasted_content";
  if (context.artifactTargetAvailable && hasArtifactBoundReference(prompt)) return "selected_artifact";
  if (!isAskContentTransformationOperation(operation)) return null;
  if (explicitTransformSubject(prompt, operation)) return "explicit_subject";
  if (context.artifactTargetAvailable) return "selected_artifact";
  if (operation === "summarize" && context.hasConversationContext) return "conversation";
  return null;
}

function hasArtifactBoundReference(prompt: string) {
  const text = normalized(prompt);
  if (!text) return false;

  // A deictic object has no source inside the turn; the selected artifact is the
  // only authoritative local antecedent. This is independent of the operation
  // verb, so new rewrite styles do not need routing patches.
  if (/\b(?:it|this|these|those|them)\b/i.test(text) &&
      !/\b(?:this|these)\s+(?:chat|conversation|discussion|thread)\b/i.test(text)) {
    return true;
  }

  // Projection requests name the desired output fields but omit the source.
  // They are artifact-bound only when no explicit source/subject follows.
  if (/^(?:give|list|show)(?:\s+me)?\s+(?:just\s+|only\s+)?(?:the\s+)?[^:?!]{2,100}$/i.test(text) &&
      !/\b(?:about|for|from|in|of|on|regarding)\s+(?:an?|the\s+)?[A-Za-z0-9][\w.+#/-]*/i.test(text) &&
      !/\b[A-Z][A-Za-z0-9.+#/-]{2,}\b/.test(text.split(/\s+/).slice(1).join(" "))) {
    return true;
  }

  return false;
}

function hasSameTurnAntecedent(prompt: string) {
  const reference = prompt.search(/\b(?:it|this|that|these|those|them|there|the (?:alternative|comparison|option|reverse case))\b/i);
  if (reference <= 0) return false;
  const prefix = prompt.slice(0, reference);
  if (!/[,:;—-]|\b(?:and then|because|given that)\b/i.test(prefix)) return false;
  const contentWords = prefix
    .toLowerCase()
    .match(/[a-z][\w.-]*/g)
    ?.filter((word) => !FUNCTION_WORDS.has(word) && !DISCOURSE_WORDS.has(word)) ?? [];
  return contentWords.length >= 1;
}

function hasDeicticReference(prompt: string) {
  if (/\b(?:it|this|these|those|them|there)\b/i.test(prompt)) return true;
  if (!/\bthat\b/i.test(prompt)) return false;
  return /^(?:that\b|(?:are|can|could|did|do|does|has|have|is|should|was|were|will|would)\s+that\b|(?:how|what|when|where|why)\s+(?:are|can|could|did|do|does|has|have|is|should|was|were|will|would)\s+that\b)/i.test(prompt) ||
    /\b(?:about|against|because|if|mean|means|meant|of|on|say|said|says|suppose|use|uses|with)\s+that\b/i.test(prompt) ||
    /\bthat\s+(?:[A-Za-z][\w-]*\s+){0,2}(?:alternative|argument|assumption|case|claim|comparison|conclusion|consequence|decision|idea|objection|option|point|reason|result|risk|statement|view)\b/i.test(prompt) ||
    /\bthat\s*$/i.test(prompt);
}

function hasExplicitLocalSubject(prompt: string) {
  const text = normalized(prompt);
  if (/^(?:how|what)\s+about\s+(?:it|this|that|these|those|them|there)$/i.test(text)) return false;
  if (/^(?:are|can|could|did|do|does|has|have|is|should|was|were|will|would)\s+(?:it|this|that|these|those|them)\b/i.test(text)) return false;
  if (/:[\s\S]*\b[A-Za-z0-9][\w.-]*(?:\s+[A-Za-z0-9][\w.-]*)+/.test(text)) return true;
  if (hasPastedBody(text) || ARTIFACT_PATH.test(text)) return true;
  const operation = operationFor(text);
  if (isAskContentTransformationOperation(operation)) {
    return explicitTransformSubject(text, operation);
  }
  if (/\b(?:this|that|these|those)\s+(?:[A-Za-z][\w-]*\s+){0,2}(?:app|architecture|class|code|component|copy|design|document|draft|file|function|hero|implementation|module|query|report|response|section|service|site|table|text|type|website)\b/i.test(text)) return true;
  if (/^(?:add|build|create|design|develop|generate|implement|make)\s+(?:this|that|the)\s+[A-Za-z][\w-]*(?:\s+[A-Za-z][\w-]*)?/i.test(text)) return true;
  if (/^(?:can|could|would|will)\s+(?:you|u)\s+(?:build|create|design|develop|fix|implement|make|repair)\s+(?:it|this|that)\b/i.test(text)) return true;
  if (/^(?:(?:can|could|would)\s+(?:you|u)\s+)?(?:describe|explain|teach|walk me through)\s+(?!(?:it|this|that|these|those|them|why|more|again)\b)\S+/i.test(text)) return true;
  const questionSubject = text.match(/^(?:how|what|when|where|which|why)\s+(?:am|are|can|could|did|do|does|has|have|is|should|was|were|will|would)\s+(.+)$/i)?.[1]
    ?.replace(/^(?:an?|the)\s+/i, "")
    .trim();
  if (questionSubject &&
    !/^(?:(?:best|main|strongest)\s+(?:argument|objection|reason)|it|this|that|these|those|them|alternative|argument|assumption|case|comparison|consequence|happen|happens|objection|part|reason|reverse(?:\s+case)?|skeptic)\b/i.test(questionSubject) &&
    !/^(?:i|we|you)\s+(?:apply|choose|prefer|use)\s+(?:it|this|that|these|those|them)\b/i.test(questionSubject)) return true;
  if (/\b(?:about|against|between|from|in|of|on|regarding|to|versus|vs\.?|with)\s+(?!(?:it|this|that|these|those|them|the (?:alternative|comparison|option|reverse case))\b)[A-Za-z0-9][\w.+#/-]*/i.test(text)) return true;
  const words = text.toLowerCase().match(/[a-z0-9][\w.+#/-]*/g) ?? [];
  const topical = words.filter((word) => !FUNCTION_WORDS.has(word) && !DISCOURSE_WORDS.has(word));
  const namedTopic = text.split(/\s+/).slice(1).some((word) => /^[A-Z][A-Za-z0-9.+#/-]*$/.test(word));
  return topical.length >= 1 && (
    topical.length >= 2 ||
    namedTopic ||
    /\b(?:about|from|in|of|on|regarding|to|with)\b/i.test(text) ||
    words.length > 12
  );
}

function dependencyFor(prompt: string): AskTurnDependency {
  const text = normalized(prompt);
  if (!text) return "independent";
  if (hasSameTurnAntecedent(text)) return "local_reference";
  const relativeClauseThat = /\b(?!(?:apply|argue|assume|believe|claim|conclude|do|repeat|say|suppose|think|use)\b)[a-z][\w-]*\s+that\s+(?!(?:for|on|to|with)\b)[a-z][\w-]*\b/i.test(text);
  const transferableReference = /\b(?:it|same|equivalent|likewise|similarly)\b/i.test(text) ||
    (/\bthat\b/i.test(text) && !relativeClauseThat);
  if (transferableReference && (
      /\b(?:for|to|with|on)\s+(?!(?:it|this|that|these|those|them)\b)\S+/i.test(text) ||
      /^(?:likewise|similarly)\s*,?\s+\S+\s+(?!(?:it|this|that|these|those|them)\b)\S+/i.test(text)
    )) {
    return "operation_transfer";
  }
  if (/\b(?:go back|previous (?:answer|point|question)|return to)\b/i.test(text)) return "prior_context";
  if (/\bthe\s+(?:alternative|former|latter|opposite|previous\s+(?:answer|point)|reverse case)\b/i.test(text) && !/:\s*\S/.test(text)) {
    return "prior_context";
  }
  const concreteDemonstrative = /\b(?:this|that|these|those)\s+(?:[A-Za-z][\w-]*\s+){0,2}(?:app|architecture|class|code|component|copy|design|document|draft|file|function|hero|implementation|module|query|report|response|section|service|site|table|text|type|website)\b/i.test(text);
  const directActionTarget = /^(?:(?:can|could|would|will)\s+(?:you|u)\s+)?(?:add|build|create|design|develop|fix|generate|implement|make|repair|use)\s+(?:it|this|that|the|\S+)\s+\S+/i.test(text);
  const explicitLocalSubject = hasExplicitLocalSubject(text);
  const deicticReference = hasDeicticReference(text);
  if (deicticReference && !concreteDemonstrative && !directActionTarget && !/:\s*\S/.test(text)) {
    return "prior_context";
  }
  if (deicticReference || /\bthe\s+(?:alternative|former|latter|opposite|previous\s+(?:answer|point)|reverse case)\b/i.test(text)) {
    return explicitLocalSubject ? "independent" : "prior_context";
  }
  if (/^(?:clarify|continue|defend|elaborate|expand|go (?:deeper|further|on)|more|rephrase|tell me more|unpack)(?:\s+(?:again|deeper|further|more))?$/i.test(text)) {
    return "prior_context";
  }
  const operation = operationFor(text);
  if (isAskContentTransformationOperation(operation) && !explicitTransformSubject(text, operation)) {
    return "prior_context";
  }
  if (/^(?:why|how|(?:and\s+)?then(?:\s+what)?|what do you mean)$/i.test(text)) return "prior_context";
  if (/^(?:what|which|where|when|why|how|could|would|should|is|are|does|do|can|will)\b/i.test(text) && !hasExplicitLocalSubject(text)) {
    return "prior_context";
  }
  if (/^(?:give|show)(?:\s+me)?\s+(?:an?|another|the)\s+(?:counterexample|example|objection|reason)$/i.test(text)) {
    return "prior_context";
  }
  if (/^(?:an?|another|the)\s+(?:counterexample|example|objection|reason)$/i.test(text)) return "prior_context";
  if (/^(?:any|what(?:\s+(?:are|is))?)\s+(?:the\s+)?(?:caveats?|drawbacks?|downsides?|objections?|risks?|tradeoffs?)$/i.test(text)) return "prior_context";
  if (/^what\s+is\s+(?:the\s+)?(?:(?:best|main|strongest)\s+)?(?:argument|counterargument|objection|reason)$/i.test(text)) return "prior_context";
  return "independent";
}

export function analyzeAskTurnSemantics(
  prompt: string,
  context: AskTurnSemanticContext = {}
): AskTurnSemantics {
  const operation = operationFor(prompt);
  const target = targetFor(prompt, operation, context);
  const dependency = dependencyFor(prompt);
  const authority: AskTurnAuthority = hasPersistentMutationAuthority(prompt)
    ? "persistent_mutation"
    : "answer_only";
  return {
    authority,
    dependency,
    explicitMutation: authority === "persistent_mutation",
    explicitTarget: target === "conversation" || target === "explicit_subject" || target === "named_artifact" || target === "pasted_content",
    operation,
    target
  };
}

export function resolveAskContentTarget(prompt: string, context: AskTurnSemanticContext = {}) {
  return analyzeAskTurnSemantics(prompt, context).target;
}

export function isAskAnswerOnlyTransformation(prompt: string) {
  const semantics = analyzeAskTurnSemantics(prompt);
  return isAskContentTransformationOperation(semantics.operation) && !semantics.explicitMutation;
}
