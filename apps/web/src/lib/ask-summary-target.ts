export type ConversationSummaryTargetContext = {
  artifactTargetAvailable?: boolean;
  hasConversationContext?: boolean;
};

export type AskSummaryTarget = "artifact" | "conversation" | null;

export function hasExplicitConversationSummaryTarget(prompt: string) {
  return /\b(?:chat|conversation|discussion|messages?|everything (?:we(?:'ve| have) discussed|we discussed)|what (?:have|did) we (?:discuss(?:ed)?|talk(?:ed)? about)|what did we talk about|so far|decisions? we|complete chat|entire chat|our discussion|from this chat)\b/i.test(prompt.trim());
}

export function hasExplicitArtifactSummaryTarget(prompt: string) {
  return /\b(?:article|document|file|pdf|report|attachment|pasted (?:text|content|article|document|report))\b/i.test(prompt) ||
    /\b(?:summari[sz]e|summary|recap)\b[\s\S]{0,40}:\s*(?:\r?\n)?[\s\S]{80,}/i.test(prompt);
}

export function isTargetlessSummaryRequest(prompt: string) {
  return /^(?:please\s+)?(?:(?:write|create|give me)\s+(?:a\s+)?(?:summary|recap)|summari[sz]e|recap)(?:\s+(?:it|this|everything))?[.!?]*$/i.test(prompt.trim());
}

export function resolveAskSummaryTarget(
  prompt: string,
  context: ConversationSummaryTargetContext = {}
): AskSummaryTarget {
  if (hasExplicitConversationSummaryTarget(prompt)) return "conversation";
  if (hasExplicitArtifactSummaryTarget(prompt)) return "artifact";
  if (!isTargetlessSummaryRequest(prompt)) return null;
  if (context.artifactTargetAvailable) return "artifact";
  return context.hasConversationContext ? "conversation" : null;
}
