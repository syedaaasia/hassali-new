import type { SelfReviewIssue } from "@/lib/self-review-types";
import type { SelfReviewReviewer } from "@/lib/server/ai/self-review/engine";
import {
  createIssue,
  createReport
} from "@/lib/server/ai/self-review/review-helpers";

function askIssue(input: {
  category: string;
  description: string;
  domain?: string | null;
  generator: string;
  id: string;
  mode: "ASK";
  recommendedFix: string;
  severity: SelfReviewIssue["severity"];
  timestamp: number;
  title: string;
}) {
  return createIssue({
    ...input,
    evidence: [{ found: input.description, source: "ask_response" }],
    repairStrategy: "rewrite_answer_with_clear_mode_boundaries",
    reviewer: "AskReviewer",
    ruleId: input.category.includes("identity") || input.category.includes("knowledge") ? "ASK001" : "ASK001"
  });
}

export const askReviewer: SelfReviewReviewer = {
  id: "AskReviewer",
  supports: (input) => input.mode === "ASK",
  review: (input) => {
    const timestamp = Date.now();
    const failures: SelfReviewIssue[] = [];
    const warnings: SelfReviewIssue[] = [];
    const answer = input.answer?.trim() ?? "";

    if (input.files.length) {
      failures.push(askIssue({
        category: "mode_contract",
        description: "ASK mode produced file outputs.",
        domain: input.domain,
        generator: input.generator,
        id: "ask_no_file_outputs",
        mode: "ASK",
        recommendedFix: "Return an explanation-only response for ASK mode and move file changes to WEBSITE or CODE.",
        severity: "high",
        timestamp,
        title: "ASK Mode Produced Files"
      }));
    }

    if (typeof input.answer === "string" && answer.length === 0) {
      failures.push(askIssue({
        category: "empty_answer",
        description: "ASK mode produced an empty answer.",
        domain: input.domain,
        generator: input.generator,
        id: "ask_empty_answer",
        mode: "ASK",
        recommendedFix: "Return a concise answer, plan, or decision-support response.",
        severity: "high",
        timestamp,
        title: "Empty ASK Answer"
      }));
    }

    if (/\b(?:as an openai model|i am chatgpt|i cannot access any project context)\b/i.test(answer)) {
      warnings.push(askIssue({
        category: "identity_confusion",
        description: "ASK answer appears to identify as a raw model instead of Hassali workspace intelligence.",
        domain: input.domain,
        generator: input.generator,
        id: "ask_identity_confusion",
        mode: "ASK",
        recommendedFix: "Answer honestly as Hassali.ai and distinguish provider model from workspace capabilities.",
        severity: "medium",
        timestamp,
        title: "Model Identity Confusion"
      }));
    }

    if (/\b(?:latest|today|current|right now|live)\b/i.test(input.prompt) && /\b(?:definitely|currently|as of today)\b/i.test(answer) && !/\b(?:live search|connected|not connected|cannot verify)\b/i.test(answer)) {
      warnings.push(askIssue({
        category: "stale_live_knowledge_claim",
        description: "ASK answer makes current-knowledge claims without clarifying live-search availability.",
        domain: input.domain,
        generator: input.generator,
        id: "ask_live_knowledge_claim",
        mode: "ASK",
        recommendedFix: "State whether live search is connected before making current factual claims.",
        severity: "medium",
        timestamp,
        title: "Unqualified Live Knowledge Claim"
      }));
    }

    if (/\b(?:should i|what should|recommend|decide|roadmap|strategy|advice)\b/i.test(input.prompt) && answer.length > 0 && !/\b(?:recommend|because|tradeoff|next step|risk)\b/i.test(answer)) {
      warnings.push(askIssue({
        category: "decision_support",
        description: "Prompt asks for advice, but answer may lack decision-support framing.",
        domain: input.domain,
        generator: input.generator,
        id: "ask_missing_decision_support",
        mode: "ASK",
        recommendedFix: "Add a concise recommendation, reasoning, tradeoffs, and next step.",
        severity: "low",
        timestamp,
        title: "Thin Decision Support"
      }));
    }

    return createReport({
      failures,
      metrics: {
        answerLength: answer.length,
        fileCount: input.files.length
      },
      mode: input.mode,
      recommendations: warnings.length || failures.length
        ? [{ id: "ask_answer_only", priority: "high", description: "Keep ASK responses explanation-only." }]
        : [],
      reviewer: "AskReviewer",
      timestamp,
      warnings
    });
  }
};
