export type SelfReviewMode = "ASK" | "CODE" | "WEBSITE";
export type SelfReviewStatus = "FAIL" | "PASS" | "PASS_WITH_WARNINGS";
export type SelfReviewSeverity = "critical" | "high" | "info" | "low" | "medium";
export type SelfReviewRuleId =
  | "A11Y001"
  | "ASK001"
  | "BRAND001"
  | "CODE001"
  | "CODE_BUTTON001"
  | "CODE_NAV001"
  | "CODE_NAV002"
  | "CODE_STACK001"
  | "CODE_STACK002"
  | "CODE_STACK003"
  | "CODE_UI001"
  | "COPY001"
  | "DOMAIN001"
  | "DOMAIN_CONFLICT001"
  | "INTENT_LOCK001"
  | "LINK001"
  | "META001"
  | "NAV001"
  | "PAGE001"
  | "PAGE002"
  | "PERF001"
  | "PLACEHOLDER001"
  | "REPAIR001"
  | "RISK001"
  | "SECURITY001"
  | "STACK_CONTRACT001"
  | "SOV001"
  | "SOV002"
  | "TAXONOMY001"
  | "TAXONOMY002"
  | "PREVIEW001"
  | "STRUCT001"
  | "VAL001"
  | "WEBSITE_COPY001"
  | "WEBSITE_DOMAIN001"
  | "WEBSITE_DOMAIN002"
  | "UX001";
export type SelfReviewScoreCategory =
  | "accessibility"
  | "brand"
  | "completeness"
  | "consistency"
  | "copy"
  | "overall"
  | "structure"
  | "technical"
  | "UX";

export type SelfReviewLocation = {
  path?: string;
  selector?: string;
  label?: string;
  line?: number;
};

export type SelfReviewEvidence = {
  excerpt?: string;
  expected?: string;
  found?: string;
  source?: string;
  value?: string | number | boolean | null;
};

export type SelfReviewTraceStep = {
  checked: string;
  evidence: string;
  repairHint: string;
  result: "failed" | "passed" | "warning";
  severityReason: string;
};

export type SelfReviewFailureMemory = {
  category: string;
  domain: string | null;
  evidence: SelfReviewEvidence[];
  fixSuggestion: string;
  generator: string;
  issueSignature: string;
  mode: SelfReviewMode;
  projectId: string | null;
  repairStrategy: string;
  reviewer: string;
  ruleId: SelfReviewRuleId;
  severity: SelfReviewSeverity;
  timestamp: number;
};

export type SelfReviewIssue = {
  id: string;
  ruleId: SelfReviewRuleId;
  reviewer: string;
  mode: SelfReviewMode;
  category: string;
  severity: SelfReviewSeverity;
  title: string;
  description: string;
  evidence: SelfReviewEvidence[];
  location: SelfReviewLocation;
  confidence: number;
  repairable: boolean;
  repairStrategy: string;
  recommendedFix: string;
  timestamp: number;
  trace: SelfReviewTraceStep[];
  metadata?: Record<string, unknown>;
  memory?: SelfReviewFailureMemory;
};

export type SelfReviewRecommendation = {
  id: string;
  priority: "high" | "low" | "medium";
  description: string;
};

export type SelfReviewReport = {
  reviewId: string;
  reviewer: string;
  mode: SelfReviewMode;
  overallStatus: SelfReviewStatus;
  confidence: number;
  passed: boolean;
  warnings: SelfReviewIssue[];
  failures: SelfReviewIssue[];
  recommendations: SelfReviewRecommendation[];
  scores: Record<SelfReviewScoreCategory, number>;
  metrics: Record<string, boolean | number | string | null>;
  timestamp: number;
  trace: SelfReviewTraceStep[];
  reviewerReports?: SelfReviewReport[];
};
