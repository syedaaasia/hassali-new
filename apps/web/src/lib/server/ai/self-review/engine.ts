import type {
  SelfReviewMode,
  SelfReviewReport,
  SelfReviewRuleId,
  SelfReviewSeverity,
  SelfReviewTraceStep
} from "@/lib/self-review-types";
import {
  confidenceFromIssues,
  scoresFromIssues,
  statusFromIssues
} from "@/lib/server/ai/self-review/review-helpers";
import { askReviewer } from "@/lib/server/ai/self-review/reviewers/ask-reviewer";
import { codeReviewer } from "@/lib/server/ai/self-review/reviewers/code-reviewer";
import { systemRiskReviewer } from "@/lib/server/ai/self-review/reviewers/system-risk-reviewer";
import { websiteReviewer } from "@/lib/server/ai/self-review/reviewers/website-reviewer";

export type SelfReviewFile = {
  path: string;
  content: string;
};

export type SelfReviewManifest = {
  type?: string | null;
  framework?: string | null;
  entryPoint?: string | null;
  requiredFiles?: string[];
};

export type SelfReviewSystemRisk = {
  category: string;
  code: string;
  description: string;
  evidence?: string;
  location?: {
    path?: string;
    selector?: string;
    label?: string;
  };
  recommendedFix?: string;
  repairStrategy?: string;
  ruleId: SelfReviewRuleId;
  severity: SelfReviewSeverity;
  title: string;
};

export type SelfReviewInput = {
  answer?: string | null;
  domain?: string | null;
  files: SelfReviewFile[];
  generator: string;
  manifest?: SelfReviewManifest | null;
  mode: SelfReviewMode;
  projectId?: string | null;
  prompt: string;
  requestedPages?: string[];
  requiredFiles?: string[];
  systemRisks?: SelfReviewSystemRisk[];
};

export type SelfReviewReviewer = {
  id: string;
  supports: (input: SelfReviewInput) => boolean;
  review: (input: SelfReviewInput) => SelfReviewReport;
};

const reviewerRegistry = new Map<string, SelfReviewReviewer>();

export function registerSelfReviewReviewer(reviewer: SelfReviewReviewer) {
  reviewerRegistry.set(reviewer.id, reviewer);
}

export function getSelfReviewReviewers() {
  return [...reviewerRegistry.values()];
}

registerSelfReviewReviewer(websiteReviewer);
registerSelfReviewReviewer(codeReviewer);
registerSelfReviewReviewer(askReviewer);
registerSelfReviewReviewer(systemRiskReviewer);

function severityRank(severity: string) {
  if (severity === "critical") return 5;
  if (severity === "high") return 4;
  if (severity === "medium") return 3;
  if (severity === "low") return 2;
  return 1;
}

function sortIssues<T extends { confidence: number; severity: string }>(issues: T[]) {
  return [...issues].sort((a, b) => {
    const severityDelta = severityRank(b.severity) - severityRank(a.severity);

    if (severityDelta !== 0) {
      return severityDelta;
    }

    return b.confidence - a.confidence;
  });
}

export function runSelfReview(input: SelfReviewInput): SelfReviewReport {
  const timestamp = Date.now();
  const activeReviewers = getSelfReviewReviewers().filter((reviewer) => reviewer.supports(input));
  const reviewerReports = activeReviewers.map((reviewer) => reviewer.review(input));
  const failures = sortIssues(reviewerReports.flatMap((report) => report.failures));
  const warnings = sortIssues(reviewerReports.flatMap((report) => report.warnings));
  const recommendations = reviewerReports.flatMap((report) => report.recommendations);
  const confidence = confidenceFromIssues(failures, warnings);
  const overallStatus = statusFromIssues(failures, warnings);
  const trace: SelfReviewTraceStep[] = [
    ...reviewerReports.flatMap((report) => report.trace),
    {
      checked: "Self Review aggregation",
      evidence: `${reviewerReports.length} reviewer(s), ${failures.length} failure(s), ${warnings.length} warning(s).`,
      repairHint: "Future repair agents should consume issue.repairStrategy and issue.memory records.",
      result: failures.length ? "failed" : warnings.length ? "warning" : "passed",
      severityReason: failures.length ? "One or more reviewers emitted failures." : warnings.length ? "No failures, but warnings were emitted." : "No failures or warnings were emitted."
    }
  ];

  return {
    reviewId: `self_review_${input.mode.toLowerCase()}_${timestamp}`,
    reviewer: "SelfReviewEngine",
    mode: input.mode,
    overallStatus,
    confidence,
    passed: overallStatus !== "FAIL",
    warnings,
    failures,
    recommendations,
    scores: scoresFromIssues(failures, warnings),
    metrics: {
      fileCount: input.files.length,
      reviewerCount: reviewerReports.length,
      warningCount: warnings.length,
      failureCount: failures.length
    },
    timestamp,
    trace,
    reviewerReports
  };
}
