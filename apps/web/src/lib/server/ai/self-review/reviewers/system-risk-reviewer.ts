import type { SelfReviewIssue } from "@/lib/self-review-types";
import type { SelfReviewReviewer } from "@/lib/server/ai/self-review/engine";
import {
  createIssue,
  createReport
} from "@/lib/server/ai/self-review/review-helpers";

export const systemRiskReviewer: SelfReviewReviewer = {
  id: "SystemRiskReviewer",
  supports: (input) => (input.systemRisks?.length ?? 0) > 0,
  review: (input) => {
    const timestamp = Date.now();
    const failures: SelfReviewIssue[] = [];
    const warnings: SelfReviewIssue[] = [];

    for (const [index, risk] of (input.systemRisks ?? []).entries()) {
      const issue = createIssue({
        category: risk.category,
        confidence: risk.ruleId.startsWith("SOV") ? 0.95 : 0.88,
        description: risk.description,
        domain: input.domain,
        evidence: [
          {
            found: risk.evidence ?? risk.description,
            source: risk.code
          }
        ],
        generator: input.generator,
        id: `system_risk_${risk.ruleId.toLowerCase()}_${index + 1}`,
        location: risk.location,
        mode: input.mode,
        projectId: input.projectId,
        recommendedFix: risk.recommendedFix ?? "Review the proposal against the existing system risk before approval.",
        repairStrategy: risk.repairStrategy ?? "regenerate_or_patch_output_to_satisfy_existing_review_risk",
        repairable: true,
        reviewer: "SystemRiskReviewer",
        ruleId: risk.ruleId,
        severity: risk.severity,
        timestamp,
        title: risk.title,
        trace: [
          {
            checked: "Existing Hassali proposal risk metadata",
            evidence: risk.evidence ?? risk.description,
            repairHint: risk.recommendedFix ?? "Use the existing risk metadata as repair input.",
            result: risk.severity === "high" || risk.severity === "critical" ? "failed" : "warning",
            severityReason: `${risk.severity} severity came from existing proposal risk code ${risk.code}.`
          }
        ]
      });

      if (risk.severity === "critical" || risk.severity === "high") {
        failures.push(issue);
      } else {
        warnings.push(issue);
      }
    }

    return createReport({
      failures,
      metrics: {
        systemRiskCount: (input.systemRisks ?? []).length
      },
      mode: input.mode,
      recommendations: failures.length || warnings.length
        ? [{ id: "system_risks_before_approval", priority: failures.length ? "high" : "medium", description: "Resolve existing validator or sovereignty risks before approval." }]
        : [],
      reviewer: "SystemRiskReviewer",
      timestamp,
      warnings
    });
  }
};
