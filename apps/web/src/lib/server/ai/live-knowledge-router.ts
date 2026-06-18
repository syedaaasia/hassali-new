export type LiveKnowledgeDecision = {
  answer: string | null;
  confidence: number;
  liveKnowledgeRequired: boolean;
  reason: string | null;
  requiresLiveSearch: boolean;
  status: "live_search_required" | "not_required";
};

const livePatterns = [
  /\b(?:richest|wealthiest)\s+(?:person|man|woman|people)\b/i,
  /\b(?:current|latest|today'?s|now|right now|real[- ]time)\b/i,
  /\b(?:latest news|current ceo|current president|stock price|crypto price|exchange rate|current price)\b/i,
  /\b(?:who is .* now|who currently)\b/i
];

export function routeLiveKnowledgeQuestion(prompt: string): LiveKnowledgeDecision {
  const liveKnowledgeRequired = livePatterns.some((pattern) => pattern.test(prompt));

  if (!liveKnowledgeRequired) {
    return {
      answer: null,
      confidence: 0.9,
      liveKnowledgeRequired: false,
      reason: null,
      requiresLiveSearch: false,
      status: "not_required"
    };
  }

  return {
    answer:
      "That changes frequently. Live search is not connected/configured in this Hassali environment yet, so I should not guess from stale knowledge.\n\nWhen live search is configured, Hassali should verify the current source, date, and confidence before answering.",
    confidence: 0.88,
    liveKnowledgeRequired: true,
    reason: "current_or_frequently_changing_fact",
    requiresLiveSearch: true,
    status: "live_search_required"
  };
}
