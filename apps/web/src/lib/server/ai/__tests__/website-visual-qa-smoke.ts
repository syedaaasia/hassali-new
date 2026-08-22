import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPostApplyWebsiteVisualVerification,
  buildWebsiteVisualSourcePreflight,
  evaluateWebsiteVisualObservation,
  mergeWebsiteVisualQAReports,
  websiteVisualQAViewports,
  type WebsiteVisualRenderObservation
} from "@/lib/server/ai/website-visual-qa";
import {
  applyWebsiteResponsiveRepairPlan,
  planWebsiteResponsiveRepairs,
  runWebsiteVisualRepairLoop,
  websiteVisualRepairIterationLimit
} from "@/lib/server/ai/website-responsive-repair";
import { generatePlannedWebsiteFiles } from "@/lib/server/ai/domain-site-generator";
import { buildIntentIntelligence } from "@/lib/server/ai/intent-intelligence";
import { buildProposalContext } from "@/lib/server/ai/proposal-context";
import { buildCompositionStrategy } from "@/lib/server/ai/reasoning-composition";
import { translateIntent } from "@/lib/server/ai/intent-translator";
import { compileStaticPreview } from "@/lib/static-preview-compiler";
import { evaluateStaticPreviewVisualQA } from "@/lib/static-preview-visual-qa";
import { parseWebsiteGrowthSourceSnapshot } from "@/lib/server/ai/website-growth-handoff";

const viewport = { height: 844, id: "mobile", width: 390 };

function observation(overrides: Partial<WebsiteVisualRenderObservation> = {}): WebsiteVisualRenderObservation {
  return {
    candidateId: "candidate-1",
    capturedAt: "2026-08-21T10:00:00.000Z",
    documentHeight: 1200,
    documentWidth: 390,
    elements: [
      { height: 56, important: true, role: "navigation", selector: ".site-header", visible: true, width: 358, x: 16, y: 0 },
      { clientWidth: 358, height: 160, important: true, lineCount: 3, role: "heading", scrollWidth: 358, selector: "h1", visible: true, width: 358, x: 16, y: 120 },
      { complete: true, height: 300, important: true, naturalHeight: 900, naturalWidth: 1200, role: "image", selector: ".hero img", visible: true, width: 358, x: 16, y: 330 },
      { height: 44, interactive: true, role: "button", selector: ".button", visible: true, width: 120, x: 16, y: 660 }
    ],
    page: "index.html",
    projectId: "project-1",
    renderStatus: "rendered",
    screenshotReference: "artifacts/candidate-1/mobile-before.png",
    viewport,
    ...overrides
  };
}

function candidateFiles() {
  return {
    "assets/hero.png": "binary-placeholder",
    "index.html": '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><img src="assets/hero.png" alt="Paint finish"></body></html>',
    "styles.css": "@media (max-width: 600px) { .hero { grid-template-columns: 1fr; } }"
  };
}

test("VISUAL QA source preflight stays incomplete without render evidence", () => {
  const report = buildWebsiteVisualSourcePreflight({ candidateId: "candidate-1", files: candidateFiles() });
  assert.equal(report.deterministicChecksPassed, true);
  assert.equal(report.renderStatus, "not_attempted");
  assert.equal(report.screenshotReview, "not_evaluated");
  assert.equal(report.status, "incomplete");
});

test("VISUAL QA source preflight blocks a missing mobile viewport and missing asset", () => {
  const report = buildWebsiteVisualSourcePreflight({
    candidateId: "candidate-2",
    files: {
      "index.html": '<html><body><img src="assets/missing.png"></body></html>',
      "styles.css": "body { margin: 0; }"
    }
  });
  assert.equal(report.status, "failed");
  assert.equal(report.issues.some((candidate) => candidate.category === "responsive_collapse" && candidate.severity === "critical"), true);
  assert.equal(report.issues.some((candidate) => candidate.category === "broken_image"), true);
});

test("VISUAL QA detects document overflow and off-screen elements from browser geometry", () => {
  const report = evaluateWebsiteVisualObservation(observation({
    documentWidth: 470,
    elements: [{ height: 80, important: true, role: "navigation", selector: ".primary-navigation", visible: true, width: 430, x: 20, y: 0 }]
  }));
  assert.equal(report.status, "failed");
  assert.equal(report.issues.some((candidate) => candidate.category === "viewport_overflow"), true);
  assert.equal(report.issues.some((candidate) => candidate.category === "element_offscreen"), true);
});

test("VISUAL QA detects broken images, text overflow, tiny targets, and invalid overlap", () => {
  const report = evaluateWebsiteVisualObservation(observation({
    elements: [
      { clientWidth: 200, height: 90, important: true, role: "heading", scrollWidth: 260, selector: "h1", visible: true, width: 200, x: 10, y: 20 },
      { complete: false, height: 200, important: true, naturalHeight: 0, naturalWidth: 0, role: "image", selector: ".hero img", visible: true, width: 300, x: 10, y: 140 },
      { height: 28, interactive: true, role: "button", selector: ".menu-toggle", visible: true, width: 28, x: 340, y: 10 }
    ],
    overlaps: [{ firstSelector: ".hero-copy", invalid: true, secondSelector: ".hero-media" }]
  }));
  assert.equal(report.issues.some((candidate) => candidate.category === "broken_image"), true);
  assert.equal(report.issues.some((candidate) => candidate.category === "text_overflow"), true);
  assert.equal(report.issues.some((candidate) => candidate.category === "interaction_target"), true);
  assert.equal(report.issues.some((candidate) => candidate.category === "overlap"), true);
});

test("VISUAL QA passes a rendered responsive observation with screenshot evidence", () => {
  const report = evaluateWebsiteVisualObservation(observation());
  assert.equal(report.status, "passed");
  assert.equal(report.screenshotReview, "rendered");
  assert.equal(report.deterministicChecksPassed, true);
});

test("VISUAL QA representative matrix contains all five required viewports", () => {
  assert.deepEqual(websiteVisualQAViewports.map((candidate) => candidate.width), [360, 390, 768, 1024, 1440]);
});

test("responsive repair respects issue category and candidate path scope", () => {
  const report = evaluateWebsiteVisualObservation(observation({
    documentWidth: 470,
    elements: [{ height: 50, interactive: true, role: "button", selector: ".button", visible: true, width: 30, x: 10, y: 10 }]
  }));
  const plan = planWebsiteResponsiveRepairs({
    cycle: 0,
    report,
    scope: { allowedCategories: ["viewport_overflow"], allowedPaths: ["styles.css"], kind: "targeted_edit" }
  });
  assert.equal(plan.actions.every((action) => action.category === "viewport_overflow"), true);
  assert.equal(plan.actions.every((action) => action.path === "styles.css"), true);
  assert.equal(plan.blockedIssueIds.length > 0, true);
});

test("responsive repair modifies only candidate styles and records the cycle", () => {
  const report = evaluateWebsiteVisualObservation(observation({ documentWidth: 470 }));
  const plan = planWebsiteResponsiveRepairs({
    cycle: 0,
    report,
    scope: { allowedCategories: ["viewport_overflow"], allowedPaths: ["styles.css"], kind: "full_candidate" }
  });
  const files = candidateFiles();
  const repaired = applyWebsiteResponsiveRepairPlan(files, plan);
  assert.equal(repaired.files["index.html"], files["index.html"]);
  assert.match(repaired.files["styles.css"], /HASSALI_VISUAL_REPAIR:0/);
  assert.equal(repaired.repairedIssueIds.length, 1);
});

test("responsive repair loop re-renders and stops after resolving the defect", async () => {
  let renders = 0;
  const result = await runWebsiteVisualRepairLoop({
    candidateId: "candidate-loop",
    files: candidateFiles(),
    renderAdapter: {
      async render(input) {
        renders += 1;
        const repaired = /HASSALI_VISUAL_REPAIR/.test(input.files["styles.css"] ?? "");
        return observation({ candidateId: input.candidateId, documentWidth: repaired ? 390 : 470, screenshotReference: `artifact-${renders}.png`, viewport: input.viewport });
      }
    },
    scope: { allowedCategories: ["viewport_overflow"], allowedPaths: ["styles.css"], kind: "full_candidate" },
    viewports: [viewport]
  });
  assert.equal(result.iterations, 2);
  assert.equal(result.finalReport.status, "passed");
  assert.equal(renders, 2);
});

test("responsive repair loop has a hard limit and reports unresolved defects", async () => {
  const result = await runWebsiteVisualRepairLoop({
    candidateId: "candidate-limit",
    files: candidateFiles(),
    renderAdapter: { async render(input) { return observation({ candidateId: input.candidateId, documentWidth: 470, screenshotReference: `artifact-${input.viewport.id}.png`, viewport: input.viewport }); } },
    scope: { allowedCategories: ["viewport_overflow"], allowedPaths: ["styles.css"], kind: "full_candidate" },
    viewports: [viewport]
  });
  assert.equal(result.iterations, websiteVisualRepairIterationLimit + 1);
  assert.equal(result.unresolvedAfterLimit.length > 0, true);
});

test("post-apply truth keeps application distinct from screenshot verification", () => {
  const incomplete = buildPostApplyWebsiteVisualVerification({ filesApplied: true, previewContentVerified: true });
  const failed = buildPostApplyWebsiteVisualVerification({ filesApplied: true, previewContentVerified: false });
  const verified = buildPostApplyWebsiteVisualVerification({
    filesApplied: true,
    previewContentVerified: true,
    report: evaluateWebsiteVisualObservation(observation())
  });
  assert.equal(incomplete.status, "verification_incomplete");
  assert.equal(failed.status, "failed");
  assert.equal(verified.status, "verified");
});

test("merged viewport report fails when any required viewport fails", () => {
  const good = evaluateWebsiteVisualObservation(observation());
  const bad = evaluateWebsiteVisualObservation(observation({ documentWidth: 470, viewport: { height: 800, id: "narrow_mobile", width: 360 } }));
  const merged = mergeWebsiteVisualQAReports([good, bad]);
  assert.equal(merged.status, "failed");
  assert.equal(merged.viewport, null);
  assert.equal(merged.issues.some((candidate) => candidate.viewportId === "narrow_mobile"), true);
});

test("production WEBSITE generation records source preflight without fabricating render evidence", () => {
  const prompt = "Build a premium paint brand website with home, products, about, and contact pages";
  const intent = buildIntentIntelligence({ prompt });
  const translatedIntent = translateIntent({ mode: "WEBSITE", prompt });
  const proposalContext = buildProposalContext({ mode: "WEBSITE", prompt, translatedIntent });
  const generation = generatePlannedWebsiteFiles({ composition: buildCompositionStrategy(intent), intent, proposalContext });
  assert.equal(generation.visualQA.deterministicChecksPassed, true);
  assert.equal(generation.visualQA.renderStatus, "not_attempted");
  assert.equal(generation.visualQA.status, "incomplete");
  assert.match(generation.files["HASSALI.md"], /source preflight does not prove rendered visual quality/i);
  const growthSource = parseWebsiteGrowthSourceSnapshot(generation.files["HASSALI.md"]);
  assert.ok(growthSource);
  assert.match(growthSource.business.businessType, /paint/i);
  assert.doesNotMatch(growthSource.business.businessType, /Shopify|television|restaurant/i);
});

test("image-light output remains valid and dormant engines stay pruned", () => {
  const prompt = "Build a typography-led SaaS website with no images, no WebGL, and no cinematic animation";
  const intent = buildIntentIntelligence({ prompt });
  const translatedIntent = translateIntent({ mode: "WEBSITE", prompt });
  const proposalContext = buildProposalContext({ mode: "WEBSITE", prompt, translatedIntent });
  const generation = generatePlannedWebsiteFiles({ composition: buildCompositionStrategy(intent), intent, proposalContext });
  assert.equal(generation.qualityBlueprint.assetPlan.imageStrategy, "typography_led");
  assert.equal("scene.js" in generation.files, false);
  assert.equal(Object.keys(generation.files).some((path) => /cinematic/i.test(path)), false);
  assert.equal(generation.visualQA.issues.some((candidate) => candidate.category === "broken_image"), false);
});

test("static Preview compiler injects the bounded geometry probe", () => {
  const compilation = compileStaticPreview({ activeHtmlPath: "index.html", files: candidateFiles(), projectId: "project-1" });
  assert.match(compilation.srcDoc, /HASSALI_STATIC_PREVIEW_VISUAL_QA/);
  assert.match(compilation.srcDoc, /slice\(0,160\)/);
  assert.match(compilation.srcDoc, /requestAnimationFrame/);
});

test("static Preview geometry diagnostics block overflow and preserve touch warnings", () => {
  const diagnostics = evaluateStaticPreviewVisualQA({
    documentHeight: 1200,
    documentWidth: 430,
    elements: [
      { clientWidth: 430, height: 60, interactive: false, role: "navigation", scrollWidth: 430, selector: ".site-header", visible: true, width: 430, x: 0, y: 0 },
      { clientWidth: 28, height: 28, interactive: true, role: "other", scrollWidth: 28, selector: ".menu-toggle", visible: true, width: 28, x: 350, y: 10 }
    ],
    page: "index.html",
    viewportHeight: 844,
    viewportWidth: 390
  });
  assert.equal(diagnostics.some((candidate) => candidate.code === "VISUAL_HORIZONTAL_OVERFLOW" && candidate.severity === "blocking"), true);
  assert.equal(diagnostics.some((candidate) => candidate.code === "VISUAL_TARGET_SMALL" && candidate.severity === "warning"), true);
});
