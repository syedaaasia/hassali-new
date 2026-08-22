import type {
  WebsiteVisualQAIssue,
  WebsiteVisualQAIssueCategory,
  WebsiteVisualQAReport,
  WebsiteVisualRenderObservation
} from "@/lib/server/ai/website-visual-qa";
import {
  evaluateWebsiteVisualObservation,
  mergeWebsiteVisualQAReports
} from "@/lib/server/ai/website-visual-qa";

export const websiteVisualRepairIterationLimit = 2;

export type WebsiteResponsiveRepairScope = {
  allowedCategories: WebsiteVisualQAIssueCategory[];
  allowedPaths: string[];
  kind: "full_candidate" | "targeted_edit";
};

export type WebsiteResponsiveRepairAction = {
  category: WebsiteVisualQAIssueCategory;
  css: string;
  issueId: string;
  path: "styles.css";
  reason: string;
  selector: string;
  viewportId: string | null;
};

export type WebsiteResponsiveRepairPlan = {
  actions: WebsiteResponsiveRepairAction[];
  blockedIssueIds: string[];
  cycle: number;
  planId: string;
  scope: WebsiteResponsiveRepairScope;
  status: "blocked" | "planned" | "unnecessary";
};

export type WebsiteVisualRenderAdapter = {
  render(input: {
    candidateId: string;
    files: Record<string, string>;
    page: string;
    viewport: { height: number; id: string; width: number };
  }): Promise<WebsiteVisualRenderObservation>;
};

export type WebsiteVisionQAAdapter = {
  review(input: {
    candidateId: string;
    page: string;
    referenceEvidence?: string[];
    screenshotReference: string;
    viewport: { height: number; id: string; width: number };
  }): Promise<WebsiteVisualQAIssue[]>;
};

function safeSelector(value: string | null) {
  if (!value) return null;
  return /^[a-z0-9_.#:[\]="'\-\s>+*()]+$/i.test(value) ? value.trim() : null;
}

function cssFor(issue: WebsiteVisualQAIssue, selector: string) {
  if (issue.category === "viewport_overflow" || issue.category === "element_offscreen" || issue.category === "clipping") {
    return `${selector} { min-width: 0; max-width: 100%; }`;
  }
  if (issue.category === "text_overflow") {
    return `${selector} { min-width: 0; max-width: 100%; overflow-wrap: anywhere; word-break: normal; }`;
  }
  if (issue.category === "typography_scale") {
    return `${selector} { font-size: clamp(2rem, 9vw, 4.5rem); max-width: 16ch; }`;
  }
  if (issue.category === "interaction_target") {
    return `${selector} { min-width: 44px; min-height: 44px; }`;
  }
  if (issue.category === "overlap" || issue.category === "responsive_collapse" || issue.category === "mobile_navigation") {
    return `${selector} { min-width: 0; max-width: 100%; position: relative; }`;
  }
  if (issue.category === "image_crop") {
    return `${selector} { object-fit: cover; object-position: 50% 50%; }`;
  }
  return null;
}

export function planWebsiteResponsiveRepairs(input: {
  cycle: number;
  report: WebsiteVisualQAReport;
  scope: WebsiteResponsiveRepairScope;
}): WebsiteResponsiveRepairPlan {
  const blockedIssueIds: string[] = [];
  const actions: WebsiteResponsiveRepairAction[] = [];
  if (input.cycle >= websiteVisualRepairIterationLimit || !input.scope.allowedPaths.includes("styles.css")) {
    return {
      actions,
      blockedIssueIds: input.report.issues.map((candidate) => candidate.id),
      cycle: input.cycle,
      planId: `${input.report.candidateId}:repair:${input.cycle}`,
      scope: input.scope,
      status: "blocked"
    };
  }

  input.report.issues.forEach((candidate) => {
    if (candidate.severity === "minor" || !candidate.repairEligible || !input.scope.allowedCategories.includes(candidate.category)) {
      blockedIssueIds.push(candidate.id);
      return;
    }
    const selector = safeSelector(candidate.selector);
    const css = selector ? cssFor(candidate, selector) : null;
    if (!selector || !css) {
      blockedIssueIds.push(candidate.id);
      return;
    }
    actions.push({
      category: candidate.category,
      css,
      issueId: candidate.id,
      path: "styles.css",
      reason: candidate.message,
      selector,
      viewportId: candidate.viewportId
    });
  });

  return {
    actions,
    blockedIssueIds,
    cycle: input.cycle,
    planId: `${input.report.candidateId}:repair:${input.cycle}`,
    scope: input.scope,
    status: actions.length ? "planned" : blockedIssueIds.length ? "blocked" : "unnecessary"
  };
}

export function applyWebsiteResponsiveRepairPlan(
  files: Record<string, string>,
  plan: WebsiteResponsiveRepairPlan
): { files: Record<string, string>; repairedIssueIds: string[] } {
  if (plan.status !== "planned" || !plan.actions.length) return { files: { ...files }, repairedIssueIds: [] as string[] };
  const marker = `/* HASSALI_VISUAL_REPAIR:${plan.cycle} */`;
  const css = [...new Set(plan.actions.map((action) => action.css))].join("\n");
  return {
    files: {
      ...files,
      "styles.css": `${files["styles.css"] ?? ""}\n\n${marker}\n${css}\n`
    },
    repairedIssueIds: plan.actions.map((action) => action.issueId)
  };
}

export async function runWebsiteVisualRepairLoop(input: {
  candidateId: string;
  files: Record<string, string>;
  page?: string;
  projectId?: string | null;
  referenceEvidence?: string[];
  renderAdapter: WebsiteVisualRenderAdapter;
  scope: WebsiteResponsiveRepairScope;
  viewports: Array<{ height: number; id: string; width: number }>;
  visionAdapter?: WebsiteVisionQAAdapter;
}) {
  let files = { ...input.files };
  let cycle = 0;
  const reports: WebsiteVisualQAReport[] = [];
  const plans: WebsiteResponsiveRepairPlan[] = [];
  const page = input.page ?? "index.html";

  while (cycle <= websiteVisualRepairIterationLimit) {
    const cycleReports: WebsiteVisualQAReport[] = [];
    for (const viewport of input.viewports) {
      const observation = await input.renderAdapter.render({
        candidateId: input.candidateId,
        files,
        page,
        viewport
      });
      const report = evaluateWebsiteVisualObservation(observation, { introducedByProposal: true });
      if (input.visionAdapter && observation.screenshotReference) {
        const visionIssues = await input.visionAdapter.review({
          candidateId: input.candidateId,
          page,
          referenceEvidence: input.referenceEvidence,
          screenshotReference: observation.screenshotReference,
          viewport
        });
        report.issues.push(...visionIssues);
        report.visionReview = visionIssues.some((candidate) => candidate.severity !== "minor") ? "review_required" : "passed";
        report.unresolvedIssueCount = report.issues.length;
        report.status = report.issues.some((candidate) => candidate.severity === "critical")
          ? "failed"
          : report.issues.some((candidate) => candidate.severity === "major")
            ? "review_required"
            : "passed";
      } else {
        report.visionReview = "not_available";
      }
      report.repairCycle = cycle;
      cycleReports.push(report);
    }
    const merged = mergeWebsiteVisualQAReports(cycleReports);
    merged.repairCycle = cycle;
    reports.push(merged);
    const actionable = merged.issues.some((candidate) => candidate.repairEligible && candidate.severity !== "minor");
    if (!actionable || cycle === websiteVisualRepairIterationLimit) break;
    const plan = planWebsiteResponsiveRepairs({ cycle, report: merged, scope: input.scope });
    plans.push(plan);
    if (plan.status !== "planned") break;
    const applied = applyWebsiteResponsiveRepairPlan(files, plan);
    files = applied.files;
    cycle += 1;
  }

  const finalReport = reports.at(-1)!;
  return {
    files,
    finalReport,
    iterationLimit: websiteVisualRepairIterationLimit,
    iterations: reports.length,
    plans,
    reports,
    unresolvedAfterLimit: finalReport.issues.filter((candidate) => candidate.verification !== "passed")
  };
}
