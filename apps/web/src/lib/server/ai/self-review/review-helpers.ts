import type {
  SelfReviewEvidence,
  SelfReviewIssue,
  SelfReviewMode,
  SelfReviewRecommendation,
  SelfReviewReport,
  SelfReviewRuleId,
  SelfReviewScoreCategory,
  SelfReviewSeverity
} from "@/lib/self-review-types";

function clampConfidence(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function severityPenalty(severity: SelfReviewSeverity) {
  if (severity === "critical") return 28;
  if (severity === "high") return 18;
  if (severity === "medium") return 10;
  if (severity === "low") return 4;
  return 1;
}

export function confidenceFromIssues(failures: SelfReviewIssue[], warnings: SelfReviewIssue[]) {
  const failurePenalty = failures.reduce((sum, issue) => sum + severityPenalty(issue.severity), 0);
  const warningPenalty = warnings.reduce((sum, issue) => sum + Math.max(1, Math.floor(severityPenalty(issue.severity) / 2)), 0);

  return clampConfidence(100 - failurePenalty - warningPenalty);
}

export function statusFromIssues(failures: SelfReviewIssue[], warnings: SelfReviewIssue[]) {
  if (failures.length > 0) return "FAIL";
  if (warnings.length > 0) return "PASS_WITH_WARNINGS";

  return "PASS";
}

function scoreCategoryFor(issue: SelfReviewIssue): SelfReviewScoreCategory {
  if (issue.category.includes("missing") || issue.category.includes("page_count") || issue.category.includes("empty")) return "completeness";
  if (issue.ruleId === "A11Y001") return "accessibility";
  if (issue.ruleId === "BRAND001" || issue.ruleId === "WEBSITE_DOMAIN001" || issue.ruleId === "WEBSITE_DOMAIN002") return "brand";
  if (issue.ruleId === "COPY001" || issue.ruleId === "WEBSITE_COPY001") return "copy";
  if (issue.ruleId === "LINK001" || issue.ruleId === "NAV001" || issue.ruleId === "STRUCT001") return "structure";
  if (issue.ruleId === "UX001" || issue.ruleId === "CODE_UI001" || issue.ruleId === "CODE_BUTTON001") return "UX";
  if (issue.ruleId === "CODE001" || issue.ruleId === "CODE_NAV001" || issue.ruleId === "CODE_NAV002" || issue.ruleId === "CODE_STACK001" || issue.ruleId === "CODE_STACK002" || issue.ruleId === "CODE_STACK003" || issue.ruleId === "SECURITY001" || issue.ruleId === "PERF001") return "technical";
  if (issue.ruleId === "SOV001" || issue.ruleId === "SOV002" || issue.ruleId === "VAL001" || issue.ruleId === "REPAIR001" || issue.ruleId === "RISK001" || issue.ruleId === "META001") return "consistency";
  return "consistency";
}

function issueSignature(input: {
  category: string;
  description: string;
  location?: SelfReviewIssue["location"];
  ruleId: SelfReviewRuleId;
}) {
  const path = input.location?.path ?? "global";
  const selector = input.location?.selector ?? "none";

  return `${input.ruleId}:${input.category}:${path}:${selector}:${input.description.slice(0, 80)}`;
}

function scoreFromIssueCount(issues: SelfReviewIssue[], category: SelfReviewScoreCategory) {
  const relevant = issues.filter((issue) => scoreCategoryFor(issue) === category);

  if (relevant.length === 0) {
    return 100;
  }

  return Math.max(
    0,
    100 - relevant.reduce((sum, issue) => sum + severityPenalty(issue.severity), 0)
  );
}

export function scoresFromIssues(failures: SelfReviewIssue[], warnings: SelfReviewIssue[]) {
  const issues = [...failures, ...warnings];
  const scores: Record<SelfReviewScoreCategory, number> = {
    technical: scoreFromIssueCount(issues, "technical"),
    structure: scoreFromIssueCount(issues, "structure"),
    UX: scoreFromIssueCount(issues, "UX"),
    copy: scoreFromIssueCount(issues, "copy"),
    brand: scoreFromIssueCount(issues, "brand"),
    accessibility: scoreFromIssueCount(issues, "accessibility"),
    completeness: scoreFromIssueCount(issues, "completeness"),
    consistency: scoreFromIssueCount(issues, "consistency"),
    overall: confidenceFromIssues(failures, warnings)
  };

  return scores;
}

export function createIssue(input: {
  category: string;
  confidence?: number;
  description: string;
  domain?: string | null;
  evidence?: SelfReviewEvidence[];
  generator: string;
  id: string;
  location?: SelfReviewIssue["location"];
  metadata?: Record<string, unknown>;
  mode: SelfReviewMode;
  projectId?: string | null;
  recommendedFix: string;
  repairable?: boolean;
  repairStrategy?: string;
  reviewer: string;
  ruleId: SelfReviewRuleId;
  severity: SelfReviewSeverity;
  title: string;
  timestamp: number;
  trace?: SelfReviewIssue["trace"];
}): SelfReviewIssue {
  const evidence = input.evidence ?? [];
  const location = input.location ?? {};
  const repairStrategy = input.repairStrategy ?? "review_then_regenerate_targeted_output";
  const trace = input.trace ?? [
    {
      checked: input.title,
      evidence: evidence.map((item) => item.excerpt ?? item.found ?? item.source ?? String(item.value ?? "")).filter(Boolean).join(" | ") || "No concrete evidence excerpt was available.",
      repairHint: input.recommendedFix,
      result: input.severity === "info" || input.severity === "low" ? "warning" : "failed",
      severityReason: `${input.severity} severity was assigned by ${input.reviewer} for ${input.category}.`
    }
  ];
  const signature = issueSignature({
    category: input.category,
    description: input.description,
    location,
    ruleId: input.ruleId
  });

  return {
    id: input.id,
    ruleId: input.ruleId,
    reviewer: input.reviewer,
    mode: input.mode,
    category: input.category,
    severity: input.severity,
    title: input.title,
    description: input.description,
    evidence,
    location,
    confidence: input.confidence ?? 0.82,
    repairable: input.repairable ?? true,
    repairStrategy,
    recommendedFix: input.recommendedFix,
    timestamp: input.timestamp,
    trace,
    metadata: input.metadata,
    memory: {
      category: input.category,
      domain: input.domain ?? null,
      evidence,
      fixSuggestion: input.recommendedFix,
      generator: input.generator,
      issueSignature: signature,
      mode: input.mode,
      projectId: input.projectId ?? null,
      repairStrategy,
      reviewer: input.reviewer,
      ruleId: input.ruleId,
      severity: input.severity,
      timestamp: input.timestamp
    }
  };
}

export function createReport(input: {
  failures: SelfReviewIssue[];
  metrics?: SelfReviewReport["metrics"];
  mode: SelfReviewMode;
  recommendations?: SelfReviewRecommendation[];
  reviewer: string;
  timestamp: number;
  warnings: SelfReviewIssue[];
}): SelfReviewReport {
  const confidence = confidenceFromIssues(input.failures, input.warnings);
  const overallStatus = statusFromIssues(input.failures, input.warnings);
  const trace = [
    ...input.failures.flatMap((issue) => issue.trace),
    ...input.warnings.flatMap((issue) => issue.trace)
  ];

  return {
    reviewId: `${input.reviewer}_${input.mode.toLowerCase()}_${input.timestamp}`,
    reviewer: input.reviewer,
    mode: input.mode,
    overallStatus,
    confidence,
    passed: overallStatus !== "FAIL",
    warnings: input.warnings,
    failures: input.failures,
    recommendations: input.recommendations ?? [],
    scores: scoresFromIssues(input.failures, input.warnings),
    metrics: input.metrics ?? {},
    timestamp: input.timestamp,
    trace
  };
}
