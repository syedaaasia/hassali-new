import { createHash } from "node:crypto";

export type WebsiteVisualQASeverity = "critical" | "major" | "minor";

export type WebsiteVisualQAIssueCategory =
  | "accessibility_concern"
  | "broken_image"
  | "clipping"
  | "contrast"
  | "element_offscreen"
  | "engine_render_artifact"
  | "excessive_whitespace"
  | "image_crop"
  | "interaction_target"
  | "malformed_grid"
  | "mobile_navigation"
  | "overlap"
  | "responsive_collapse"
  | "text_overflow"
  | "typography_scale"
  | "unexpected_asset"
  | "viewport_overflow";

export type WebsiteVisualQASource = "deterministic" | "reference" | "vision";
export type WebsiteVisualQAStatus = "failed" | "incomplete" | "passed" | "review_required";
export type WebsiteVisualQARenderStatus = "failed" | "not_attempted" | "rendered";

export type WebsiteVisualQAViewport = {
  height: number;
  id: "desktop" | "large_desktop" | "mobile" | "narrow_mobile" | "tablet" | string;
  width: number;
};

export const websiteVisualQAViewports: WebsiteVisualQAViewport[] = [
  { height: 800, id: "narrow_mobile", width: 360 },
  { height: 844, id: "mobile", width: 390 },
  { height: 1024, id: "tablet", width: 768 },
  { height: 900, id: "desktop", width: 1024 },
  { height: 900, id: "large_desktop", width: 1440 }
];

export type WebsiteVisualQAEvidence = {
  capturedAt: string;
  id: string;
  kind: "browser_geometry" | "reference_comparison" | "screenshot" | "source_preflight" | "vision_analysis";
  reference: string;
  viewport: WebsiteVisualQAViewport | null;
};

export type WebsiteVisualQAIssue = {
  category: WebsiteVisualQAIssueCategory;
  confidence: number;
  evidenceIds: string[];
  id: string;
  introducedByProposal: boolean | null;
  likelyCause: string;
  message: string;
  recommendedRepair: string;
  repairEligible: boolean;
  selector: string | null;
  severity: WebsiteVisualQASeverity;
  source: WebsiteVisualQASource;
  verification: "failed" | "not_run" | "passed";
  viewportId: string | null;
};

export type WebsiteVisualQAReport = {
  candidateId: string;
  completedAt: string;
  deterministicChecksPassed: boolean;
  evidence: WebsiteVisualQAEvidence[];
  issues: WebsiteVisualQAIssue[];
  page: string;
  projectId: string | null;
  referenceReview: "not_applicable" | "not_evaluated" | "passed" | "review_required";
  renderStatus: WebsiteVisualQARenderStatus;
  repairCycle: number;
  screenshotReview: "not_available" | "not_evaluated" | "rendered";
  status: WebsiteVisualQAStatus;
  unresolvedIssueCount: number;
  viewport: WebsiteVisualQAViewport | null;
  visionReview: "not_available" | "not_evaluated" | "passed" | "review_required";
};

export type WebsitePostApplyVisualVerification = {
  filesApplied: boolean;
  previewContentVerified: boolean;
  screenshotVerified: boolean;
  status: "failed" | "verification_incomplete" | "verified";
  summary: string;
  visualQAReportId: string | null;
};

export type WebsiteVisualElementObservation = {
  clientWidth?: number;
  complete?: boolean;
  height: number;
  important?: boolean;
  interactive?: boolean;
  lineCount?: number;
  naturalHeight?: number;
  naturalWidth?: number;
  role?: "button" | "heading" | "image" | "navigation" | "other";
  scrollWidth?: number;
  selector: string;
  visible: boolean;
  width: number;
  x: number;
  y: number;
};

export type WebsiteVisualOverlapObservation = {
  firstSelector: string;
  invalid: boolean;
  secondSelector: string;
};

export type WebsiteVisualRenderObservation = {
  candidateId: string;
  capturedAt: string;
  consoleErrors?: string[];
  documentHeight: number;
  documentWidth: number;
  elements: WebsiteVisualElementObservation[];
  failureReason?: string;
  overlaps?: WebsiteVisualOverlapObservation[];
  page: string;
  projectId: string | null;
  renderStatus: "failed" | "rendered";
  screenshotReference?: string;
  viewport: WebsiteVisualQAViewport;
};

function stableId(...parts: string[]) {
  return createHash("sha256").update(parts.join("\u001f")).digest("hex").slice(0, 16);
}

function evidence(input: Omit<WebsiteVisualQAEvidence, "id">): WebsiteVisualQAEvidence {
  return {
    ...input,
    id: `vqa-evidence-${stableId(input.kind, input.reference, input.capturedAt, input.viewport?.id ?? "none")}`
  };
}

function issue(input: Omit<WebsiteVisualQAIssue, "id" | "verification">): WebsiteVisualQAIssue {
  return {
    ...input,
    id: `vqa-issue-${stableId(input.category, input.selector ?? "page", input.viewportId ?? "all", input.message)}`,
    verification: "not_run"
  };
}

function statusFor(issues: WebsiteVisualQAIssue[], complete: boolean): WebsiteVisualQAStatus {
  if (issues.some((candidate) => candidate.severity === "critical")) return "failed";
  if (issues.some((candidate) => candidate.severity === "major")) return "review_required";
  return complete ? "passed" : "incomplete";
}

export function evaluateWebsiteVisualObservation(
  observation: WebsiteVisualRenderObservation,
  options: { introducedByProposal?: boolean | null } = {}
): WebsiteVisualQAReport {
  const capturedAt = observation.capturedAt;
  const geometryEvidence = evidence({
    capturedAt,
    kind: "browser_geometry",
    reference: `${observation.page}:${observation.viewport.width}x${observation.viewport.height}`,
    viewport: observation.viewport
  });
  const reportEvidence = [geometryEvidence];
  if (observation.screenshotReference) {
    reportEvidence.push(evidence({
      capturedAt,
      kind: "screenshot",
      reference: observation.screenshotReference,
      viewport: observation.viewport
    }));
  }
  const issues: WebsiteVisualQAIssue[] = [];
  const introducedByProposal = options.introducedByProposal ?? null;
  const evidenceIds = reportEvidence.map((item) => item.id);

  if (observation.renderStatus === "failed") {
    issues.push(issue({
      category: "engine_render_artifact",
      confidence: 1,
      evidenceIds,
      introducedByProposal,
      likelyCause: observation.failureReason ?? "The candidate could not be rendered.",
      message: `Visual QA did not render ${observation.page} at ${observation.viewport.width}px.`,
      recommendedRepair: "Repair the candidate render failure before presenting it as visually verified.",
      repairEligible: false,
      selector: null,
      severity: "critical",
      source: "deterministic",
      viewportId: observation.viewport.id
    }));
  }

  if (observation.documentWidth > observation.viewport.width + 1) {
    issues.push(issue({
      category: "viewport_overflow",
      confidence: 1,
      evidenceIds,
      introducedByProposal,
      likelyCause: `Document width ${observation.documentWidth}px exceeds viewport width ${observation.viewport.width}px.`,
      message: `Horizontal overflow is present at ${observation.viewport.width}px.`,
      recommendedRepair: "Constrain the responsible layout track or media element without hiding page content.",
      repairEligible: true,
      selector: "html",
      severity: "critical",
      source: "deterministic",
      viewportId: observation.viewport.id
    }));
  }

  observation.elements.filter((element) => element.visible).forEach((element) => {
    const right = element.x + element.width;
    const bottom = element.y + element.height;
    const important = element.important || ["button", "heading", "image", "navigation"].includes(element.role ?? "other");
    if (important && (element.x < -1 || right > observation.viewport.width + 1)) {
      issues.push(issue({
        category: "element_offscreen",
        confidence: 0.99,
        evidenceIds,
        introducedByProposal,
        likelyCause: `Element bounds ${element.x}-${right}px escape a ${observation.viewport.width}px viewport.`,
        message: `${element.selector} is partly off-screen.`,
        recommendedRepair: "Constrain or reflow this element at the failing breakpoint.",
        repairEligible: true,
        selector: element.selector,
        severity: "major",
        source: "deterministic",
        viewportId: observation.viewport.id
      }));
    }
    if (important && (element.width <= 0 || element.height <= 0 || bottom < 0)) {
      issues.push(issue({
        category: "clipping",
        confidence: 0.98,
        evidenceIds,
        introducedByProposal,
        likelyCause: "A visible important element has no usable rendered area.",
        message: `${element.selector} is clipped or has zero rendered size.`,
        recommendedRepair: "Restore a stable size and responsive layout for this element.",
        repairEligible: true,
        selector: element.selector,
        severity: "major",
        source: "deterministic",
        viewportId: observation.viewport.id
      }));
    }
    if ((element.scrollWidth ?? 0) > (element.clientWidth ?? element.width) + 1) {
      issues.push(issue({
        category: "text_overflow",
        confidence: 0.97,
        evidenceIds,
        introducedByProposal,
        likelyCause: `Content width ${element.scrollWidth}px exceeds its ${element.clientWidth ?? element.width}px container.`,
        message: `${element.selector} contains overflowing content.`,
        recommendedRepair: "Allow safe wrapping or reduce the local responsive type/layout constraint.",
        repairEligible: true,
        selector: element.selector,
        severity: important ? "major" : "minor",
        source: "deterministic",
        viewportId: observation.viewport.id
      }));
    }
    if (element.role === "image" && (element.complete === false || element.naturalWidth === 0 || element.naturalHeight === 0)) {
      issues.push(issue({
        category: "broken_image",
        confidence: 1,
        evidenceIds,
        introducedByProposal,
        likelyCause: "The browser did not decode a usable image resource.",
        message: `${element.selector} did not load.`,
        recommendedRepair: "Use the planned local fallback or repair the project-relative asset path.",
        repairEligible: false,
        selector: element.selector,
        severity: "major",
        source: "deterministic",
        viewportId: observation.viewport.id
      }));
    }
    if (element.interactive && (element.width < 40 || element.height < 40)) {
      issues.push(issue({
        category: "interaction_target",
        confidence: 0.95,
        evidenceIds,
        introducedByProposal,
        likelyCause: `Interactive target is ${Math.round(element.width)}x${Math.round(element.height)}px.`,
        message: `${element.selector} is too small for reliable touch use.`,
        recommendedRepair: "Increase only this control's minimum hit area to at least 44px where space permits.",
        repairEligible: true,
        selector: element.selector,
        severity: "minor",
        source: "deterministic",
        viewportId: observation.viewport.id
      }));
    }
    if (element.role === "heading" && (element.lineCount ?? 0) > 6) {
      issues.push(issue({
        category: "typography_scale",
        confidence: 0.9,
        evidenceIds,
        introducedByProposal,
        likelyCause: `Heading wraps to ${element.lineCount} lines at this viewport.`,
        message: `${element.selector} has an excessive mobile line count.`,
        recommendedRepair: "Apply a bounded responsive clamp or a wider local text measure.",
        repairEligible: true,
        selector: element.selector,
        severity: "major",
        source: "deterministic",
        viewportId: observation.viewport.id
      }));
    }
  });

  observation.overlaps?.filter((overlap) => overlap.invalid).forEach((overlap) => {
    issues.push(issue({
      category: "overlap",
      confidence: 0.98,
      evidenceIds,
      introducedByProposal,
      likelyCause: `${overlap.firstSelector} intersects ${overlap.secondSelector}.`,
      message: "Important rendered elements overlap.",
      recommendedRepair: "Reflow the two elements at this breakpoint without changing unrelated sections.",
      repairEligible: true,
      selector: overlap.firstSelector,
      severity: "major",
      source: "deterministic",
      viewportId: observation.viewport.id
    }));
  });

  const renderComplete = observation.renderStatus === "rendered" && Boolean(observation.screenshotReference);
  return {
    candidateId: observation.candidateId,
    completedAt: capturedAt,
    deterministicChecksPassed: !issues.some((candidate) => candidate.source === "deterministic" && candidate.severity !== "minor"),
    evidence: reportEvidence,
    issues,
    page: observation.page,
    projectId: observation.projectId,
    referenceReview: "not_evaluated",
    renderStatus: observation.renderStatus,
    repairCycle: 0,
    screenshotReview: observation.screenshotReference ? "rendered" : "not_available",
    status: statusFor(issues, renderComplete),
    unresolvedIssueCount: issues.length,
    viewport: observation.viewport,
    visionReview: "not_evaluated"
  };
}

function localAssetReferences(html: string) {
  const paths: string[] = [];
  const pattern = /(?:src|href)=["']([^"'#?]+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    const value = match[1].replace(/^\.\//, "");
    if (!/^(?:https?:|data:|mailto:|tel:|javascript:)/i.test(value) && !value.endsWith(".html")) paths.push(value);
  }
  return [...new Set(paths)];
}

export function buildWebsiteVisualSourcePreflight(input: {
  availableAssetPaths?: string[];
  candidateId: string;
  expectations?: {
    assetPaths?: string[];
    cinematicEnabled?: boolean;
    compositionGrid?: string;
    compositionHero?: string;
    imageStrategy?: string;
    webglEnabled?: boolean;
  };
  files: Record<string, string>;
  page?: string;
  projectId?: string | null;
}): WebsiteVisualQAReport {
  const page = input.page ?? "index.html";
  const capturedAt = new Date().toISOString();
  const html = input.files[page] ?? "";
  const css = input.files["styles.css"] ?? "";
  const sourceEvidence = evidence({
    capturedAt,
    kind: "source_preflight",
    reference: `${page}:${stableId(html, css)}`,
    viewport: null
  });
  const issues: WebsiteVisualQAIssue[] = [];
  const add = (value: Omit<WebsiteVisualQAIssue, "evidenceIds" | "id" | "introducedByProposal" | "source" | "verification" | "viewportId">) => {
    issues.push(issue({
      ...value,
      evidenceIds: [sourceEvidence.id],
      introducedByProposal: true,
      source: "deterministic",
      viewportId: null
    }));
  };

  if (!html) {
    add({ category: "engine_render_artifact", confidence: 1, likelyCause: `${page} is missing.`, message: "The candidate has no renderable entry page.", recommendedRepair: "Generate the required entry page before approval.", repairEligible: false, selector: null, severity: "critical" });
  }
  if (html && !/<meta\s+name=["']viewport["'][^>]*width=device-width/i.test(html)) {
    add({ category: "responsive_collapse", confidence: 1, likelyCause: "The entry page does not declare a mobile viewport.", message: "Mobile rendering would use an incorrect layout viewport.", recommendedRepair: "Add the standard device-width viewport declaration.", repairEligible: true, selector: "head", severity: "critical" });
  }
  if (css && !/@media\s*\([^)]*max-width\s*:/i.test(css)) {
    add({ category: "responsive_collapse", confidence: 0.98, likelyCause: "No bounded responsive breakpoint was found in the generated stylesheet.", message: "The candidate has no explicit narrow-screen layout adaptation.", recommendedRepair: "Add component-specific responsive rules derived from the composition plan.", repairEligible: true, selector: "styles.css", severity: "major" });
  }
  if (html && !/data-menu-toggle/i.test(html) && /class=["'][^"']*primary-navigation/i.test(html)) {
    add({ category: "mobile_navigation", confidence: 0.9, likelyCause: "Primary navigation has no discoverable mobile control.", message: "Mobile navigation may become unreachable.", recommendedRepair: "Add an accessible menu control bound to the existing navigation.", repairEligible: false, selector: ".primary-navigation", severity: "major" });
  }
  const availablePaths = new Set([
    ...Object.keys(input.files),
    ...(input.availableAssetPaths ?? [])
  ].map((path) => path.replace(/^\.\//, "")));
  localAssetReferences(html).filter((path) => !availablePaths.has(path)).forEach((path) => {
    add({ category: "broken_image", confidence: 1, likelyCause: `Project-relative asset ${path} is absent from the candidate.`, message: `The candidate references missing asset ${path}.`, recommendedRepair: "Restore the approved asset or use its planned local fallback.", repairEligible: false, selector: `[src="${path}"]`, severity: "major" });
  });
  if (input.expectations?.compositionHero && !html.includes(`data-composition-hero="${input.expectations.compositionHero}"`)) {
    add({ category: "malformed_grid", confidence: 0.98, likelyCause: "The renderer did not preserve the planned hero architecture marker.", message: "The candidate does not execute its planned hero composition.", recommendedRepair: "Render the current WebsiteCompositionPlan instead of a generic hero skeleton.", repairEligible: false, selector: ".hero", severity: "major" });
  }
  if (input.expectations?.compositionGrid && !html.includes(`data-composition-grid="${input.expectations.compositionGrid}"`)) {
    add({ category: "malformed_grid", confidence: 0.98, likelyCause: "The renderer did not preserve the planned grid strategy marker.", message: "The candidate does not execute its planned grid composition.", recommendedRepair: "Render the current composition grid without normalizing it to a generic card grid.", repairEligible: false, selector: "body", severity: "major" });
  }
  (input.expectations?.assetPaths ?? []).filter((path) => !html.includes(path)).forEach((path) => {
    add({ category: "broken_image", confidence: 0.96, likelyCause: `Planned asset ${path} is not represented on the entry page.`, message: "The hero asset plan is not represented in the rendered candidate source.", recommendedRepair: "Bind the planned hero asset to the intended media role without replacing it.", repairEligible: false, selector: ".hero img", severity: "major" });
  });
  if (input.expectations?.webglEnabled === false && ("scene.js" in input.files || /<canvas\b/i.test(html))) {
    add({ category: "engine_render_artifact", confidence: 1, likelyCause: "WebGL output exists even though the composition did not authorize it.", message: "Dormant WebGL scaffolding was emitted.", recommendedRepair: "Prune the scene engine and canvas from this candidate.", repairEligible: false, selector: "canvas", severity: "major" });
  }
  if (input.expectations?.cinematicEnabled === false && Object.keys(input.files).some((path) => /cinematic|sequence-manifest/i.test(path))) {
    add({ category: "engine_render_artifact", confidence: 1, likelyCause: "Cinematic output exists even though the composition did not authorize it.", message: "Dormant cinematic scaffolding was emitted.", recommendedRepair: "Prune cinematic files and CSS from this candidate.", repairEligible: false, selector: null, severity: "major" });
  }
  if (input.expectations?.imageStrategy === "typography_led" && /<img\b[^>]*class=["'][^"']*hero/i.test(html)) {
    add({ category: "unexpected_asset", confidence: 0.95, likelyCause: "A hero image was emitted for a typography-led composition.", message: "The candidate overrides its image-light asset plan.", recommendedRepair: "Remove the arbitrary hero image while preserving the typography-led composition.", repairEligible: false, selector: ".hero img", severity: "major" });
  }

  return {
    candidateId: input.candidateId,
    completedAt: capturedAt,
    deterministicChecksPassed: !issues.some((candidate) => candidate.severity !== "minor"),
    evidence: [sourceEvidence],
    issues,
    page,
    projectId: input.projectId ?? null,
    referenceReview: "not_evaluated",
    renderStatus: "not_attempted",
    repairCycle: 0,
    screenshotReview: "not_evaluated",
    status: statusFor(issues, false),
    unresolvedIssueCount: issues.length,
    viewport: null,
    visionReview: "not_evaluated"
  };
}

export function mergeWebsiteVisualQAReports(reports: WebsiteVisualQAReport[]): WebsiteVisualQAReport {
  if (!reports.length) throw new Error("At least one visual QA report is required.");
  const first = reports[0];
  const issues = reports.flatMap((report) => report.issues);
  const allRendered = reports.every((report) => report.renderStatus === "rendered" && report.screenshotReview === "rendered");
  return {
    ...first,
    completedAt: reports.map((report) => report.completedAt).sort().at(-1) ?? first.completedAt,
    deterministicChecksPassed: reports.every((report) => report.deterministicChecksPassed),
    evidence: reports.flatMap((report) => report.evidence),
    issues,
    page: reports.every((report) => report.page === first.page) ? first.page : "multiple",
    referenceReview: reports.some((report) => report.referenceReview === "review_required") ? "review_required" : reports.every((report) => report.referenceReview === "passed") ? "passed" : "not_evaluated",
    renderStatus: reports.some((report) => report.renderStatus === "failed") ? "failed" : allRendered ? "rendered" : "not_attempted",
    screenshotReview: allRendered ? "rendered" : reports.some((report) => report.screenshotReview === "not_available") ? "not_available" : "not_evaluated",
    status: statusFor(issues, allRendered),
    unresolvedIssueCount: issues.filter((candidate) => candidate.verification !== "passed").length,
    viewport: null,
    visionReview: reports.some((report) => report.visionReview === "review_required") ? "review_required" : reports.every((report) => report.visionReview === "passed") ? "passed" : reports.some((report) => report.visionReview === "not_available") ? "not_available" : "not_evaluated"
  };
}

export function summarizeWebsiteVisualQA(report: WebsiteVisualQAReport) {
  const counts = { critical: 0, major: 0, minor: 0 };
  report.issues.forEach((candidate) => { counts[candidate.severity] += 1; });
  return {
    deterministicChecksPassed: report.deterministicChecksPassed,
    issueCounts: counts,
    renderStatus: report.renderStatus,
    screenshotReview: report.screenshotReview,
    status: report.status,
    unresolvedIssueCount: report.unresolvedIssueCount,
    visionReview: report.visionReview
  };
}

export function buildPostApplyWebsiteVisualVerification(input: {
  filesApplied: boolean;
  previewContentVerified: boolean;
  report?: WebsiteVisualQAReport | null;
}): WebsitePostApplyVisualVerification {
  const screenshotVerified = Boolean(
    input.report?.renderStatus === "rendered" &&
    input.report.screenshotReview === "rendered" &&
    input.report.status === "passed"
  );
  const visualQAReportId = input.report
    ? `${input.report.candidateId}:${input.report.page}:${input.report.completedAt}`
    : null;
  if (!input.filesApplied || !input.previewContentVerified) {
    return {
      filesApplied: input.filesApplied,
      previewContentVerified: input.previewContentVerified,
      screenshotVerified: false,
      status: "failed",
      summary: input.filesApplied
        ? "Applied, but Preview verification failed. Visual verification is not complete."
        : "Files were not applied, so visual verification was not attempted.",
      visualQAReportId
    };
  }
  if (!screenshotVerified) {
    return {
      filesApplied: true,
      previewContentVerified: true,
      screenshotVerified: false,
      status: "verification_incomplete",
      summary: "Applied and Preview content verified. Screenshot-based visual verification is still pending.",
      visualQAReportId
    };
  }
  return {
    filesApplied: true,
    previewContentVerified: true,
    screenshotVerified: true,
    status: "verified",
    summary: "Applied, Preview content verified, and rendered visual QA passed.",
    visualQAReportId
  };
}
