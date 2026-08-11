import type { CodeCommandResult } from "../code-execution-types";

export type VerificationType =
  | "artifact"
  | "browser"
  | "build"
  | "lint"
  | "manual"
  | "repository-state"
  | "runtime"
  | "security"
  | "static"
  | "test"
  | "typecheck";

export type VerificationStatus =
  | "blocked"
  | "failed"
  | "inconclusive"
  | "not-applicable"
  | "partial"
  | "passed"
  | "unavailable";

export type VerificationCriterion = {
  blocking: boolean;
  criterion: string;
  id: string;
  requiredEvidence: VerificationType[];
  risk: "high" | "low" | "medium";
  source: "acceptance-criterion" | "execution-contract" | "security-policy";
};

export type VerificationPlan = {
  criteria: VerificationCriterion[];
  createdAt: string;
  taskId: string;
};

export type VerificationEvidence = {
  criterionIds: string[];
  id: string;
  observed: string;
  provenance: string;
  status: Exclude<VerificationStatus, "inconclusive" | "not-applicable" | "partial">;
  type: VerificationType;
};

export type VerificationResult = {
  blocking: boolean;
  confidence: "high" | "low" | "medium";
  criterion: string;
  criterionId: string;
  evidence: VerificationEvidence[];
  expected: string;
  limitations: string[];
  status: VerificationStatus;
};

export type TaskVerificationState =
  | "blocked"
  | "failed"
  | "inconclusive"
  | "partially-verified"
  | "verified"
  | "verified-with-warnings";

export type TaskVerification = {
  blockingFailures: string[];
  results: VerificationResult[];
  state: TaskVerificationState;
  taskId: string;
  warnings: string[];
};

export type ReviewSeverity = "blocking" | "high" | "informational" | "low" | "medium";

export type ReviewIssue = {
  code: string;
  evidence: string;
  message: string;
  path: string | null;
  severity: ReviewSeverity;
};

export type ReviewedChange = {
  after: string | null;
  before: string | null;
  path: string;
  planned: boolean;
};

export type ImplementationReview = {
  boundedFileCount: number;
  issues: ReviewIssue[];
  reviewId: string;
  securitySensitive: boolean;
  status: "blocked" | "passed" | "passed-with-warnings";
};

export type ChangeLedgerEntry = {
  afterFingerprint: string | null;
  beforeFingerprint: string | null;
  existedBefore: boolean;
  operation: "create" | "delete" | "modify" | "unchanged";
  ownership: "hassali" | "pre-existing-user" | "unexpected" | "unknown";
  path: string;
  planned: boolean;
};

export type ChangeLedger = {
  baselineRepositoryFingerprint: string;
  entries: ChangeLedgerEntry[];
  taskId: string;
  unexpectedPaths: string[];
};

export type DeliveryReadiness = {
  changedFiles: string[];
  gitEligible: boolean;
  implementationComplete: boolean;
  manualChecks: string[];
  pushAuthorized: false;
  readyForDelivery: boolean;
  recoveryState: "clean" | "conflict" | "not-required" | "partial" | "recovered";
  reviewStatus: ImplementationReview["status"];
  verificationState: TaskVerificationState;
  warnings: string[];
};

export type RepairEligibility = {
  eligible: boolean;
  nextAttempt: number | null;
  reason: string;
  requiresReapproval: boolean;
};

export type CommandEvidenceInput = {
  commandKinds?: Record<string, string[]>;
  results: CodeCommandResult[];
};
