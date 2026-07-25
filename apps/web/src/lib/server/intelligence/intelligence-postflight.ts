import type { RuntimeVerificationResult } from "@/lib/server/runtime/runtime-types";
import {
  createVerificationEvidence,
  evaluateVerification,
  type VerificationEvidence,
  type VerificationPlan,
  type VerificationStatus
} from "./verification-kernel";
import type { IntelligenceProductMode } from "./skill-kernel";
import { runCodeReview, type CodeReviewReport } from "./review-kernel";
import { runSecurityReview, type SecurityReviewReport } from "./security-kernel";
import {
  findSimplificationCandidates,
  type SimplificationCandidate
} from "./simplify-kernel";

export type CompletionStatus =
  | "BLOCKED"
  | "COMPLETE_VERIFIED"
  | "COMPLETE_WITH_LIMITATIONS"
  | "FAILED";

export type IntelligenceCompletion = {
  completionStatus: CompletionStatus;
  implementationStatus: "FAILED" | "NOT_RUN" | "SUCCEEDED";
  limitations: string[];
  reviewStatus?: "FINDINGS" | "NO_ACTIONABLE_FINDINGS" | "NOT_RUN";
  securityStatus?: "FINDINGS" | "NO_ACTIONABLE_FINDINGS" | "NOT_RUN";
  selectedPostExecutionSkills: string[];
  verificationStatus: VerificationStatus;
};

export type ApprovedRuntimePostflight = {
  completion: IntelligenceCompletion;
  review: CodeReviewReport | null;
  security: SecurityReviewReport | null;
  simplificationCandidates: SimplificationCandidate[];
  simplifyStatus: "CANDIDATES" | "NO_ACTIONABLE_CANDIDATES" | "NOT_SELECTED";
};

export function selectPostExecutionSkills(input: {
  changedFiles?: string[];
  mode: IntelligenceProductMode;
  prompt: string;
}) {
  const prompt = input.prompt.toLowerCase();
  const files = input.changedFiles ?? [];
  const selected = new Set<string>();
  const touchesUi = input.mode === "WEBSITE" ||
    /\b(?:ui|browser|layout|button|form|responsive|page)\b/.test(prompt) ||
    files.some((file) => /\.(?:css|html|jsx|tsx)$/.test(file));
  const touchesSecurity = /\b(?:auth|permission|secret|session|upload|path|webhook|security)\b/.test(prompt);
  const broadChange = /\b(?:large refactor|rewrite|multiple modules|architecture)\b/.test(prompt) || files.length >= 6;

  if (files.length || input.mode !== "ASK") selected.add("verify");
  if (touchesUi) selected.add("browser-verify");
  if (touchesSecurity) selected.add("security-review");
  if (broadChange) {
    selected.add("code-review");
    selected.add("simplify");
  }

  return [...selected];
}

export function runtimeVerificationEvidence(
  verification: RuntimeVerificationResult | null | undefined
): VerificationEvidence[] {
  if (!verification) return [];
  return [createVerificationEvidence({
    criterionId: "approved-file-state",
    details: verification.details.join(" | "),
    method: "FILESYSTEM_STATE",
    source: "approved_file_runner",
    status: verification.ok ? "PASS" : "FAIL",
    target: "approved-files"
  })];
}

export function evaluateCompletion(input: {
  implementationSucceeded: boolean;
  plan: VerificationPlan;
  evidence: VerificationEvidence[];
  reviewStatus?: IntelligenceCompletion["reviewStatus"];
  securityStatus?: IntelligenceCompletion["securityStatus"];
  selectedPostExecutionSkills: string[];
}): IntelligenceCompletion {
  const verification = evaluateVerification(input.plan, input.evidence);
  const limitations = [...verification.limitations];
  if (verification.missingCriteria.length) {
    limitations.push(`Missing evidence: ${verification.missingCriteria.join(", ")}`);
  }

  let completionStatus: CompletionStatus;
  if (!input.implementationSucceeded) completionStatus = "FAILED";
  else if (verification.status === "FAIL") completionStatus = "FAILED";
  else if (verification.status === "PASS") completionStatus = "COMPLETE_VERIFIED";
  else completionStatus = "COMPLETE_WITH_LIMITATIONS";

  return {
    completionStatus,
    implementationStatus: input.implementationSucceeded ? "SUCCEEDED" : "FAILED",
    limitations,
    reviewStatus: input.reviewStatus,
    securityStatus: input.securityStatus,
    selectedPostExecutionSkills: input.selectedPostExecutionSkills,
    verificationStatus: verification.status
  };
}

export function buildApprovedRuntimeCompletion(input: {
  changedFiles: string[];
  implementationSucceeded: boolean;
  productMode: IntelligenceProductMode;
  taskDescription: string;
  verification: RuntimeVerificationResult | null | undefined;
}): IntelligenceCompletion {
  const behaviorCriterion = input.productMode === "WEBSITE"
    ? {
        description: "The approved WEBSITE works through the real browser surface.",
        id: "post-execution-behavior",
        method: "BROWSER_INTERACTION" as const,
        required: true,
        target: "browser"
      }
    : {
        description: "The approved CODE artifact passes task-appropriate behavior verification.",
        id: "post-execution-behavior",
        method: "GENERATED_ARTIFACT" as const,
        required: true,
        target: "code-artifact"
      };
  const plan: VerificationPlan = {
    criteria: [
      {
        description: "Approved file content matches the proposal after execution.",
        id: "approved-file-state",
        method: "FILESYSTEM_STATE",
        required: true,
        target: "approved-files"
      },
      behaviorCriterion
    ],
    mode: input.productMode,
    requiresRuntimeSurface: input.productMode === "WEBSITE",
    taskKind: input.productMode === "WEBSITE" ? "website" : "code"
  };
  return evaluateCompletion({
    evidence: runtimeVerificationEvidence(input.verification),
    implementationSucceeded: input.implementationSucceeded,
    plan,
    selectedPostExecutionSkills: selectPostExecutionSkills({
      changedFiles: input.changedFiles,
      mode: input.productMode,
      prompt: input.taskDescription
    })
  });
}

export function runApprovedRuntimePostflight(input: {
  changedFiles: Array<{ content: string; path: string }>;
  implementationSucceeded: boolean;
  productMode: IntelligenceProductMode;
  taskDescription: string;
  verification: RuntimeVerificationResult | null | undefined;
}): ApprovedRuntimePostflight {
  const selected = selectPostExecutionSkills({
    changedFiles: input.changedFiles.map((file) => file.path),
    mode: input.productMode,
    prompt: input.taskDescription
  });
  const review = selected.includes("code-review")
    ? runCodeReview({
        files: input.changedFiles.map((file) => ({
          after: file.content,
          path: file.path
        }))
      })
    : null;
  const security = selected.includes("security-review")
    ? runSecurityReview({
        files: input.changedFiles
      })
    : null;
  const simplificationCandidates = selected.includes("simplify")
    ? input.changedFiles.flatMap((file) =>
        findSimplificationCandidates({
          content: file.content,
          path: file.path
        })
      ).slice(0, 10)
    : [];
  const completion = buildApprovedRuntimeCompletion({
    changedFiles: input.changedFiles.map((file) => file.path),
    implementationSucceeded: input.implementationSucceeded,
    productMode: input.productMode,
    taskDescription: input.taskDescription,
    verification: input.verification
  });
  completion.reviewStatus = review?.status ?? "NOT_RUN";
  completion.securityStatus = security?.status ?? "NOT_RUN";
  if (review?.status === "FINDINGS") {
    completion.limitations.push(`Deterministic review prefilter found ${review.findings.length} actionable candidate(s).`);
  }
  if (security?.status === "FINDINGS") {
    completion.limitations.push(`Security review found ${security.findings.length} actionable candidate(s).`);
  }
  if (
    input.implementationSucceeded &&
    (review?.status === "FINDINGS" || security?.status === "FINDINGS")
  ) {
    completion.completionStatus = "COMPLETE_WITH_LIMITATIONS";
  }

  return {
    completion,
    review,
    security,
    simplificationCandidates,
    simplifyStatus: selected.includes("simplify")
      ? simplificationCandidates.length
        ? "CANDIDATES"
        : "NO_ACTIONABLE_CANDIDATES"
      : "NOT_SELECTED"
  };
}
