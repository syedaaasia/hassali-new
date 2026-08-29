import {
  analyzeAskTurnSemantics,
  isAskContentTransformationOperation,
  resolveAskContentTarget
} from "./ask-turn-semantics";

export type ConversationSummaryTargetContext = {
  artifactTargetAvailable?: boolean;
  hasConversationContext?: boolean;
};

export type AskSummaryTarget = "artifact" | "conversation" | null;

export function hasExplicitConversationSummaryTarget(prompt: string) {
  const text = prompt.trim();
  return /\b(?:our|this|the|current|complete|entire)\s+(?:chat|conversation|discussion|thread)\b/i.test(text) ||
    /\b(?:chat|conversation|discussion|thread)\s+(?:history|transcript)\b/i.test(text) ||
    /\b(?:last|latest|most recent)\s+\d{1,3}\s+(?:messages?|turns?)\b/i.test(text) ||
    /\b(?:messages?|decisions?)\s+(?:in|from)\s+(?:our|this|the)\s+(?:chat|conversation|discussion|thread)\b/i.test(text) ||
    /\b(?:everything (?:we(?:'ve| have) discussed|we discussed)|what (?:have|did) we (?:discuss(?:ed)?|talk(?:ed)? about)|what did we talk about|what decisions? (?:have we|did we) made?|what have we (?:done|covered)|so far|from this chat)\b/i.test(text);
}

export function hasExplicitArtifactSummaryTarget(prompt: string) {
  return /\b(?:article|document|file|pdf|attachment|upload|pasted (?:text|content|article|document|report))\b/i.test(prompt) ||
    /\b(?:selected|attached|uploaded|named|this|the)\s+report\b/i.test(prompt) ||
    /(?:^|[\s"'`(])(?:[\w.-]+\/)*[\w.-]+\.(?:csv|docx?|md|pdf|rtf|txt|xlsx?)(?=$|[\s"'`),.!?])/i.test(prompt) ||
    /\b(?:summari[sz]e|summary|recap)\b[\s\S]{0,40}:\s*(?:\r?\n)?[\s\S]{80,}/i.test(prompt);
}

export function isAskSummaryTransformationRequest(prompt: string) {
  const operation = analyzeAskTurnSemantics(prompt).operation;
  return operation === "summarize" || operation === "shorten";
}

export function isTargetlessSummaryRequest(prompt: string) {
  const text = prompt.trim();
  if (!isAskSummaryTransformationRequest(text)) return false;
  return /^(?:please\s+)?(?:(?:write|create|give me)\s+(?:a\s+)?(?:summary|recap)|summari[sz]e|recap)(?:\s+(?:it|this|everything))?[.!?]*$/i.test(text) ||
    /^(?:please\s+)?(?:make\s+)?(?:it|this|that)(?:\s+(?:more))?\s+(?:shorter|concise)[.!?]*$/i.test(text) ||
    /^(?:please\s+)?give me\s+(?:a\s+)?shorter\s+version[.!?]*$/i.test(text) ||
    /^(?:please\s+)?(?:shorten|condense|compress)\s+(?:it|this|that)[.!?]*$/i.test(text) ||
    /^(?:please\s+)?(?:trim|cut)\s+(?:it|this|that)\s+down[.!?]*$/i.test(text) ||
    /^(?:please\s+)?reduce\s+(?:it|this|that)\s+to\s+(?:the\s+)?essentials[.!?]*$/i.test(text);
}

export function resolveAskSummaryTarget(
  prompt: string,
  context: ConversationSummaryTargetContext = {}
): AskSummaryTarget {
  if (!isAskSummaryTransformationRequest(prompt) && !hasExplicitConversationSummaryTarget(prompt)) return null;
  if (hasExplicitArtifactSummaryTarget(prompt)) return "artifact";
  if (hasExplicitConversationSummaryTarget(prompt)) return "conversation";
  if (!isTargetlessSummaryRequest(prompt)) return null;
  if (context.artifactTargetAvailable) return "artifact";
  return context.hasConversationContext ? "conversation" : null;
}

export { resolveAskContentTarget };

export function isAskContentTransformationRequest(prompt: string) {
  return isAskContentTransformationOperation(analyzeAskTurnSemantics(prompt).operation);
}
