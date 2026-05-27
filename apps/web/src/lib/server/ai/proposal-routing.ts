import type { IntelligenceKernelResult } from "@/lib/server/ai/intelligence-kernel";

export type ProposalRoutingMode = "blocked" | "normal" | "review_required";

export type ProposalRoutingReason = {
  code: string;
  message: string;
  severity: "high" | "info" | "medium";
};

export type ProposalRoutingWarning = {
  code: string;
  message: string;
  risk: "high" | "medium";
};

export type ProposalRoutingMetadata = {
  confidence: number;
  critiquePassed: boolean;
  kernelSummary: string;
  riskScore: number;
  selectedPlan: string;
  verificationChecks: string[];
};

export type ProposalRoutingDecision = {
  metadataSummary: string;
  mode: ProposalRoutingMode;
  reasons: ProposalRoutingReason[];
  shouldBlockExecution: boolean;
  shouldRequireExtraReview: boolean;
  shouldShowProposal: boolean;
  warnings: ProposalRoutingWarning[];
};

function roundRisk(value: number) {
  return Math.round(value * 100) / 100;
}

function isMedium(value: number) {
  return value >= 0.34;
}

function isHigh(value: number) {
  return value >= 0.67;
}

function isWebsitePlan(kernel: IntelligenceKernelResult) {
  return kernel.selectedPlan.expectedFiles.some((path) => path.endsWith(".html"));
}

function hasRequestedVisualStyle(kernel: IntelligenceKernelResult, term: string) {
  return kernel.taskUnderstanding.summary.toLowerCase().includes(term.toLowerCase());
}

function hasRequestedPalette(kernel: IntelligenceKernelResult) {
  return /palette|white|pink|blue|black|gold|green|red|teal|neutral|gradient/i.test(
    kernel.taskUnderstanding.summary
  );
}

export function scoreRoutingRisk(kernel: IntelligenceKernelResult) {
  const risk = kernel.riskAssessment;
  const critiquePenalty = kernel.critiqueResult.passed ? 0 : 0.14;
  const confidencePenalty = kernel.confidence < 0.68 ? 0.12 : 0;

  return roundRisk(
    Math.min(
      1,
      Math.max(
        risk.overallRisk,
        risk.projectIsolationRisk,
        risk.wrongDomainRisk,
        risk.userIntentMismatchRisk,
        risk.overgenerationRisk
      ) +
        critiquePenalty +
        confidencePenalty
    )
  );
}

export function buildRoutingWarnings(kernel: IntelligenceKernelResult): ProposalRoutingWarning[] {
  const risk = kernel.riskAssessment;
  const warnings: ProposalRoutingWarning[] = [];

  if (isMedium(risk.visualMismatchRisk)) {
    warnings.push({
      code: "visual_mismatch_risk",
      message: "Requested visual style or colors may need closer review before approval.",
      risk: isHigh(risk.visualMismatchRisk) ? "high" : "medium"
    });
  }

  if (isMedium(risk.userIntentMismatchRisk)) {
    warnings.push({
      code: "user_intent_mismatch_risk",
      message: "The selected plan may not fully match the user's intent.",
      risk: isHigh(risk.userIntentMismatchRisk) ? "high" : "medium"
    });
  }

  if (isMedium(risk.overgenerationRisk)) {
    warnings.push({
      code: "overgeneration_risk",
      message: "The plan may be broader than necessary for the request.",
      risk: isHigh(risk.overgenerationRisk) ? "high" : "medium"
    });
  }

  if (isMedium(risk.previewRuntimeRisk)) {
    warnings.push({
      code: "preview_runtime_risk",
      message: "Preview/runtime actions should be reviewed after file actions.",
      risk: isHigh(risk.previewRuntimeRisk) ? "high" : "medium"
    });
  }

  if (kernel.confidence < 0.72) {
    warnings.push({
      code: "moderate_confidence",
      message: "Kernel confidence is moderate, so the proposal should be reviewed carefully.",
      risk: "medium"
    });
  }

  if (hasRequestedVisualStyle(kernel, "apple glass") && isWebsitePlan(kernel)) {
    warnings.push({
      code: "apple_glass_quality_check",
      message: "Apple Glass inspiration should be visible in the final CSS without heavy effects.",
      risk: "medium"
    });
  }

  if (hasRequestedPalette(kernel) && isWebsitePlan(kernel)) {
    warnings.push({
      code: "requested_palette_check",
      message: "Requested colors should appear as visible design tokens in the generated CSS.",
      risk: "medium"
    });
  }

  return warnings;
}

export function buildRoutingReasons(kernel: IntelligenceKernelResult): ProposalRoutingReason[] {
  const risk = kernel.riskAssessment;
  const reasons: ProposalRoutingReason[] = [
    {
      code: "kernel_summary",
      message: kernel.summary,
      severity: "info"
    },
    {
      code: "approval_first",
      message: kernel.executionProposal.approvalRequired
        ? "Approval-first safety remains active."
        : "Approval-first safety was not confirmed.",
      severity: kernel.executionProposal.approvalRequired ? "info" : "high"
    }
  ];

  if (!kernel.shouldProceed) {
    reasons.push({
      code: "kernel_needs_review",
      message: "The intelligence kernel marked this plan as needing review.",
      severity: "medium"
    });
  }

  if (isHigh(risk.projectIsolationRisk)) {
    reasons.push({
      code: "project_isolation_high",
      message: "Project isolation risk is high.",
      severity: "high"
    });
  }

  if (isHigh(risk.wrongDomainRisk)) {
    reasons.push({
      code: "wrong_domain_high",
      message: "Wrong-domain risk is high, such as a non-technical business drifting into developer/tooling output.",
      severity: "high"
    });
  }

  if (isHigh(risk.fileMutationRisk)) {
    reasons.push({
      code: "file_mutation_high",
      message: "File mutation risk is high for this proposal.",
      severity: "high"
    });
  }

  if (kernel.selectedPlan.expectedFiles.includes("welcome.ts") && isWebsitePlan(kernel)) {
    reasons.push({
      code: "welcome_ts_pollution",
      message: "Website work should not target welcome.ts.",
      severity: "high"
    });
  }

  for (const issue of kernel.critiqueResult.issues) {
    reasons.push({
      code: "kernel_critique_issue",
      message: issue,
      severity: issue.toLowerCase().includes("welcome.ts") ? "high" : "medium"
    });
  }

  return reasons;
}

export function summarizeRoutingMetadata(
  kernel: IntelligenceKernelResult,
  mode: ProposalRoutingMode,
  routingRisk: number
): string {
  return (
    `routing=${mode}; risk=${routingRisk.toFixed(2)}; confidence=${kernel.confidence.toFixed(2)}; ` +
    `plan=${kernel.selectedPlan.title}; proceed=${kernel.shouldProceed ? "yes" : "review"}`
  );
}

export function buildProposalRoutingDecision(kernel: IntelligenceKernelResult): ProposalRoutingDecision {
  const routingRisk = scoreRoutingRisk(kernel);
  const warnings = buildRoutingWarnings(kernel);
  const reasons = buildRoutingReasons(kernel);
  const hasHighReason = reasons.some((reason) => reason.severity === "high");
  const shouldBlockExecution =
    hasHighReason ||
    isHigh(routingRisk) ||
    isHigh(kernel.riskAssessment.projectIsolationRisk) ||
    isHigh(kernel.riskAssessment.wrongDomainRisk) ||
    !kernel.executionProposal.approvalRequired;
  const shouldRequireExtraReview =
    !shouldBlockExecution &&
    (!kernel.shouldProceed ||
      routingRisk >= 0.34 ||
      warnings.length > 0 ||
      kernel.riskAssessment.riskLevel === "medium");
  const mode: ProposalRoutingMode = shouldBlockExecution
    ? "blocked"
    : shouldRequireExtraReview
      ? "review_required"
      : "normal";

  return {
    metadataSummary: summarizeRoutingMetadata(kernel, mode, routingRisk),
    mode,
    reasons,
    shouldBlockExecution,
    shouldRequireExtraReview,
    shouldShowProposal: true,
    warnings
  };
}
