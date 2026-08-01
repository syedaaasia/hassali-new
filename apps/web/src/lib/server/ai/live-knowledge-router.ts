import { buildAskRuntimeContext, type AskRuntimeContext } from "./ask-context";
import {
  createAskResearchFailureAnswer,
  decideAskFreshness,
  normalizeAskTimeContext,
  type AskFreshnessDecision
} from "./ask-source-reliability";

export type LiveKnowledgeDecision = {
  answer: string | null;
  confidence: number;
  liveKnowledgeRequired: boolean;
  reason: string | null;
  requiresLiveSearch: boolean;
  status: "live_search_required" | "not_required";
};

export function routeLiveKnowledgeQuestion(
  prompt: string,
  options?: {
    decision?: AskFreshnessDecision;
    runtime?: AskRuntimeContext;
  }
): LiveKnowledgeDecision {
  const runtime = options?.runtime ?? buildAskRuntimeContext();
  const decision = options?.decision ?? decideAskFreshness({ prompt, runtime });

  if (!decision.researchRequired) {
    return {
      answer: null,
      confidence: decision.confidence,
      liveKnowledgeRequired: false,
      reason: null,
      requiresLiveSearch: false,
      status: "not_required"
    };
  }

  return {
    answer: createAskResearchFailureAnswer({
      decision,
      outcome: "SOURCE_UNAVAILABLE",
      time: normalizeAskTimeContext(prompt, runtime)
    }),
    confidence: decision.confidence,
    liveKnowledgeRequired: true,
    reason: decision.reasons.join(" "),
    requiresLiveSearch: !decision.researchProhibited && decision.sourceRequirement !== "private_file_required",
    status: "live_search_required"
  };
}
