import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  normalizeProposalLifecycleSnapshot,
  proposalLifecycleIsActionable,
  proposalLifecycleLabel
} from "@/lib/proposal-lifecycle";
import { analyzeWebsiteAssets, workspaceMediaFromAssetIntelligence } from "@/lib/server/ai/website-asset-intelligence";
import { replaceWebsiteSectionImage } from "@/lib/server/ai/website-asset-edit";
import {
  boundedAssetEditDrift,
  classifyWebsiteImageAttachmentIntent
} from "@/lib/server/ai/website-asset-edit";
import { buildWebsiteAssetPlan } from "@/lib/server/ai/website-asset-plan";
import { buildApprovalDecision } from "@/lib/server/ai/approval-authority";
import type { WebsiteCompositionStructure } from "@/lib/server/ai/composition-engine";
import { generatePlannedWebsiteFiles } from "@/lib/server/ai/domain-site-generator";
import { buildIntentIntelligence } from "@/lib/server/ai/intent-intelligence";
import { buildProposalContext } from "@/lib/server/ai/proposal-context";
import { buildCompositionStrategy } from "@/lib/server/ai/reasoning-composition";
import { translateIntent } from "@/lib/server/ai/intent-translator";
import { buildWebsiteEditContext } from "@/lib/server/ai/website-edit-context";
import { classifyWebsiteEditIntent, type WebsiteEditIntent } from "@/lib/server/ai/website-edit-intent";
import { planWebsiteEdit } from "@/lib/server/ai/website-edit-planner";
import { buildWebsiteGrowthHandoff } from "@/lib/server/ai/website-growth-handoff";

const composition = {} as WebsiteCompositionStructure;

function plan(input: {
  assets?: Array<{ path: string }>;
  businessType?: string;
  explicitAssetPaths?: string[];
  prompt?: string;
  visualSubjects?: string[];
}) {
  const assets = analyzeWebsiteAssets({
    assets: input.assets ?? [],
    capabilities: [],
    explicitAssetPaths: input.explicitAssetPaths,
    visualSubjects: input.visualSubjects ?? []
  });
  return buildWebsiteAssetPlan({
    assets,
    businessType: input.businessType ?? "Independent studio",
    composition,
    explicitAssetPaths: input.explicitAssetPaths,
    media: workspaceMediaFromAssetIntelligence(assets, input.businessType ?? "Independent studio"),
    prompt: input.prompt ?? "Build a premium website",
    visualSubjects: input.visualSubjects ?? []
  });
}

test("ASSET STUDIO preserves supplied logos and prefers a current product upload", () => {
  const result = plan({
    assets: [{ path: "assets/brand-logo.png" }, { path: "assets/product-photo.png" }],
    businessType: "Ceramic lighting studio",
    explicitAssetPaths: ["assets/brand-logo.png", "assets/product-photo.png"],
    visualSubjects: ["ceramic pendant lights"]
  });
  const logo = result.assets.find((asset) => asset.role === "logo_brand_mark");
  const hero = result.assets.find((asset) => asset.role === "hero_product");
  assert.equal(logo?.source, "user_upload");
  assert.equal(logo?.generationPermitted, false);
  assert.equal(logo?.replacementPermitted, false);
  assert.equal(hero?.source, "user_upload");
  assert.equal(hero?.sourcePath, "assets/product-photo.png");
  assert.equal(result.generationRequests.length, 0);
});

test("ASSET STUDIO allows an image-light typography-led hero", () => {
  const result = plan({ prompt: "Create a typography-led editorial journal with no hero image" });
  assert.equal(result.imageStrategy, "typography_led");
  assert.equal(result.assets.some((asset) => asset.role === "no_asset_required"), true);
  assert.equal(result.generationRequests.length, 0);
});

test("ASSET STUDIO produces domain-specific provider-neutral generation briefs", () => {
  const paint = plan({ businessType: "Architectural paint brand", visualSubjects: ["mineral wall finish", "paint texture"] });
  const restaurant = plan({ businessType: "Coastal restaurant", visualSubjects: ["seasonal seafood", "open kitchen"] });
  const paintPrompt = paint.generationRequests[0]?.prompt ?? "";
  const restaurantPrompt = restaurant.generationRequests[0]?.prompt ?? "";
  assert.match(paintPrompt, /mineral wall finish|paint texture/i);
  assert.match(restaurantPrompt, /seasonal seafood|open kitchen/i);
  assert.notEqual(paintPrompt, restaurantPrompt);
  assert.equal("provider" in (paint.generationRequests[0] ?? {}), false);
});

test("ASSET STUDIO lets the same domain produce materially different reference-led plans", () => {
  const editorial = plan({ businessType: "Furniture studio", prompt: "Typography-led editorial minimal furniture journal with no hero image" });
  const catalog = plan({ businessType: "Furniture studio", prompt: "Product-led furniture catalog with a gallery and visual product grid" });
  assert.notEqual(editorial.imageStrategy, catalog.imageStrategy);
  assert.notDeepEqual(editorial.assets.map((asset) => asset.role), catalog.assets.map((asset) => asset.role));
});

test("ASSET STUDIO does not let an unrelated existing image contaminate automatic placement", () => {
  const result = plan({
    assets: [{ path: "assets/random-holiday-selfie.jpg" }],
    businessType: "Legal advisory",
    visualSubjects: ["legal documents"]
  });
  assert.equal(result.assets.some((asset) => asset.sourcePath === "assets/random-holiday-selfie.jpg"), false);
});

test("ASSET STUDIO rejects traversal and absolute asset paths", () => {
  const result = plan({
    assets: [{ path: "../private/secret.png" }, { path: "/outside/logo.png" }],
    businessType: "Local studio",
    explicitAssetPaths: ["../private/secret.png", "/outside/logo.png"]
  });
  assert.equal(result.assets.some((asset) => asset.sourcePath?.includes("secret.png") || asset.sourcePath?.includes("outside/logo.png")), false);
});

test("ASSET STUDIO replaces only the targeted hero image", () => {
  const html = `<main><section class="hero premium"><div><img src="assets/old.jpg" alt="Old"></div></section><section id="services"><img src="assets/service.jpg" alt="Service"></section></main>`;
  const result = replaceWebsiteSectionImage({ alt: "New product photo", assetPath: "assets/new.jpg", html, section: "hero" });
  assert.equal(result.changed, true);
  assert.match(result.html, /<section class="hero premium">[\s\S]*src="\.\/assets\/new\.jpg"/);
  assert.doesNotMatch(result.html, /assets\/old\.jpg/);
  assert.match(result.html, /assets\/service\.jpg/);
  assert.equal((result.html.match(/assets\/new\.jpg/g) ?? []).length, 1);
});

function appleWebsiteFixture() {
  const snapshot = {
    assets: [{ path: null, role: "hero_product", source: "curated", status: "ready" }],
    business: {
      audience: "people exploring beauty and cosmetics",
      businessType: "beauty and cosmetics brand",
      conversionGoal: "help visitors explore the current collection",
      coreOffer: "beauty and cosmetics collections",
      differentiators: ["clear category discovery"],
      displayName: "Beauty Brand",
      locationScope: null,
      primaryCta: { label: "Browse the collection", target: "index.html" },
      secondaryCta: null,
      tone: ["quiet", "product-first"]
    },
    composition: { authoritativeDomain: "beauty_cosmetics", pageRoutes: ["index.html"], productOrServiceEntities: ["beauty", "cosmetics"] },
    design: { archetype: "quiet product storytelling", fingerprint: "apple-fingerprint", personality: ["quiet", "precise"], referenceNames: ["Apple-design-analysis"] },
    facts: [],
    offers: [{ detail: "Explore current categories.", meta: "Collection", title: "Browse beauty" }],
    version: 1
  };
  const files = {
    "DESIGN.md": "# Project Design Contract\n\nReference: Apple-design-analysis\nFingerprint: apple-fingerprint\nTypography: SF Pro Display / SF Pro Text\nPalette: #ffffff #f5f5f7 #0066cc #1d1d1f\n",
    "HASSALI.md": `# HASSALI.md\n\nmode: WEBSITE\ndomainId: beauty_cosmetics\ndisplayName: Beauty Brand\nrequestedPages: home\nexactPageCount: 1\nrequiredFiles: index.html, styles.css, main.js, HASSALI.md\nPreview Type: static_website\nassetPlan: asset_led:1 planned:0 unresolved\nassetPlanActions: hero_product:curated:ready\nmediaAssets: unsplash:beauty-hero\n\n## Creative Direction\n\n- Visual archetype: quiet product storytelling\n- Palette: #ffffff, #f5f5f7, #0066cc, #1d1d1f\n- Typography: SF Pro Display / SF Pro Text\n- Section rhythm: focused hero -> product chapters -> contact\n\n<!-- HASSALI_GROWTH_SOURCE_V1 -->\n\`\`\`json\n${JSON.stringify(snapshot)}\n\`\`\`\n`,
    "index.html": '<!doctype html><html><head><title>Beauty Brand</title><meta name="description" content="Premium beauty collections"><meta property="og:image" content="https://images.unsplash.com/old-hero.jpg"></head><body data-page="home"><main><section class="hero"><h1>Beauty in every detail</h1><div class="media-frame" data-media-provider="unsplash" data-media-reliability="curated"><img src="https://images.unsplash.com/old-hero.jpg" alt="Old editorial hero" data-media-provider="unsplash" data-fallback-src="./assets/old.svg"><p class="media-credit">Unsplash credit</p></div></section><section id="proof"><h2>Original proof section</h2></section></main></body></html>',
    "main.js": "document.documentElement.classList.add('js');\n",
    "styles.css": ":root { --bg: #ffffff; --surface: #f5f5f7; --ink: #1d1d1f; --accent: #0066cc; --font-display: SF Pro Display, system-ui; --font-body: SF Pro Text, system-ui; }\n"
  };
  return { files, snapshot };
}

function assetReplacementIntent(assetPath: string): WebsiteEditIntent {
  const classified = classifyWebsiteEditIntent("Use this exact image as the hero image. Do not redesign the rest of the website.");
  return {
    ...classified,
    confidence: 0.98,
    editType: "asset_replacement",
    extractedValues: { ...classified.extractedValues, assetPath },
    requestScope: "section_edit",
    risks: [],
    shouldClarify: false,
    targetFiles: ["index.html"],
    targetPages: ["home"]
  };
}

test("ASSET EDIT distinguishes placement from image-as-design-reference intent", () => {
  assert.equal(classifyWebsiteImageAttachmentIntent("Use this exact image as the hero image. Do not redesign the rest of the website."), "asset_replacement");
  assert.equal(classifyWebsiteImageAttachmentIntent("Redesign this website to match the visual style of this image."), "design_reference");
});

test("ASSET EDIT wires the approved hero while preserving the Apple design contract", () => {
  const { files } = appleWebsiteFixture();
  const before = JSON.stringify(files);
  const context = buildWebsiteEditContext({ fileContents: files, fileList: Object.keys(files) });
  const planResult = planWebsiteEdit(context, assetReplacementIntent("assets/Business-Web-Banner-20.jpg"));
  assert.equal(planResult.mode, "planned");
  assert.equal(JSON.stringify(files), before, "planning must not mutate canonical files before approval");
  assert.deepEqual(planResult.changes.map((change) => change.path).sort(), ["HASSALI.md", "index.html"]);
  const html = planResult.changes.find((change) => change.path === "index.html")?.content ?? "";
  const contract = planResult.changes.find((change) => change.path === "HASSALI.md")?.content ?? "";
  assert.match(html, /src="\.\/assets\/Business-Web-Banner-20\.jpg"/);
  assert.equal((html.match(/Business-Web-Banner-20\.jpg/g) ?? []).length, 2, "hero and Open Graph should use the same approved asset");
  assert.doesNotMatch(html, /images\.unsplash\.com|media-credit|data-media-provider="unsplash"/);
  assert.match(html, /Original proof section/);
  assert.match(contract, /"fingerprint":"apple-fingerprint"/);
  assert.match(contract, /"referenceNames":\["Apple-design-analysis"\]/);
  assert.match(contract, /"source":"user_upload"/);
  assert.equal(planResult.changes.some((change) => change.path === "DESIGN.md" || change.path === "styles.css"), false);
  assert.equal(boundedAssetEditDrift([...planResult.changes, { path: "assets/Business-Web-Banner-20.jpg" }]), null);
  assert.match(boundedAssetEditDrift([{ path: "DESIGN.md" }]) ?? "", /ASSET_EDIT_DESIGN_DRIFT/);
});

test("ASSET EDIT applies once and exposes user-upload provenance to Growth", () => {
  const { files } = appleWebsiteFixture();
  const context = buildWebsiteEditContext({ fileContents: files, fileList: Object.keys(files) });
  const planResult = planWebsiteEdit(context, assetReplacementIntent("assets/Business-Web-Banner-20.jpg"));
  const applied: Record<string, string> = { ...files };
  for (const item of planResult.changes) if (item.content) applied[item.path] = item.content;
  Object.assign(applied, { "assets/Business-Web-Banner-20.jpg": "data:image/jpeg;base64,/9j/4AAQ" });
  assert.equal(Object.keys(applied).filter((path) => path === "assets/Business-Web-Banner-20.jpg").length, 1);
  const handoff = buildWebsiteGrowthHandoff({ authoritativeState: "applied", files: applied, projectId: "apple-beauty", revision: "revision-2" });
  const heroAsset = handoff.assets.find((asset) => asset.path === "assets/Business-Web-Banner-20.jpg");
  assert.equal(heroAsset?.source, "user_upload");
  assert.match(handoff.brand.designReference.value ?? "", /Apple-design-analysis/);
  assert.equal(handoff.business.domain.value, "beauty_cosmetics");
});

test("ASSET EDIT route reviews the uploaded binary with the bounded website change", async () => {
  const route = await readFile(new URL("../../../../app/api/ai/chat/route.ts", import.meta.url), "utf8");
  assert.match(route, /!explicitWebsiteAssetReplacement\s*&&\s*\n\s*productMode === "WEBSITE"/);
  assert.match(route, /supplementalChanges:\s*explicitWebsiteAssetReplacement\s*\?\s*currentAttachmentAssetChanges/);
  assert.match(route, /explicitWebsiteAssetReplacement\s*\n\s*\?\s*\{[\s\S]*assembledWebsiteEditProposal/);
  assert.match(route, /boundedAssetEditDrift\(candidateProposal\.changes\)/);
});

test("WEBSITE EDIT supports typography, exact text, color, scroll, and approvable WebGL changes", () => {
  const { files } = appleWebsiteFixture();
  const context = buildWebsiteEditContext({ fileContents: files, fileList: Object.keys(files) });
  assert.equal(classifyWebsiteEditIntent("Change the typography to an elegant editorial serif").editType, "typography");
  assert.equal(classifyWebsiteEditIntent("Change the hero heading to Beauty in motion").editType, "text_content");
  assert.equal(classifyWebsiteEditIntent("Change the accent color to red").editType, "color_palette");
  assert.equal(classifyWebsiteEditIntent("Add premium scroll effects").editType, "set_scroll_effects");

  const textPlan = planWebsiteEdit(context, classifyWebsiteEditIntent('Change the hero heading to "Beauty, Designed Differently." Do not change anything else.'));
  assert.equal(textPlan.mode, "planned", textPlan.blockedReason);
  assert.deepEqual(textPlan.changes.map((change) => change.path), ["index.html"]);
  assert.match(textPlan.changes[0]?.content ?? "", /Beauty, Designed Differently\./);

  const colorPlan = planWebsiteEdit(context, classifyWebsiteEditIntent("Change the primary button color to black. Do not change anything else."));
  assert.equal(colorPlan.mode, "planned", colorPlan.blockedReason);
  assert.equal(colorPlan.changes.some((change) => change.path === "styles.css"), true);
  assert.equal(colorPlan.changes.some((change) => change.path === "DESIGN.md"), false);
  assert.ok(colorPlan.changes.length <= 2);

  const webglIntent = classifyWebsiteEditIntent("Make it look premium with Webgl Scroll effects");
  assert.equal(webglIntent.editType, "set_webgl");
  const webglPlan = planWebsiteEdit(context, webglIntent);
  assert.equal(webglPlan.mode, "planned", webglPlan.blockedReason);
  const html = webglPlan.changes.find((change) => change.path === "index.html")?.content ?? "";
  assert.match(html, /data-scene-scroll-driven="true"/);
  assert.match(html, /data-rhythm="existing-flow-with-spatial-chapter"/);
  assert.doesNotMatch(html, /reusable scene family|without pretending/i);
  assert.equal(webglPlan.changes.some((change) => change.path === "DESIGN.md"), false);

  const proposalContext = {
    ...buildProposalContext({ mode: "WEBSITE", prompt: webglIntent.originalPrompt, translatedIntent: translateIntent({ mode: "WEBSITE", prompt: webglIntent.originalPrompt }) }),
    domain: "beauty_cosmetics",
    pages: context.requestedPages,
    requiredFiles: [...new Set([...context.requiredFiles, ...webglPlan.changes.map((change) => change.path)])]
  };
  const approval = buildApprovalDecision({
    proposal: {
      changes: webglPlan.changes.map((item) => ({ action: "update", path: item.path, proposedContent: item.content })),
      selfReviewStatus: "PASS_WITH_WARNINGS",
      validationFilePaths: [...new Set([...Object.keys(files), ...webglPlan.changes.map((change) => change.path)])]
    },
    proposalContext
  });
  const ids = Array.from(html.matchAll(/(?:^|\s)id=["']([^"']+)["']/gi), (match) => match[1]);
  assert.equal(approval.approvalAllowed, true, `${approval.criticalIssues.join("; ")} ids=${ids.join(",")}`);
});

test("ASSET STUDIO feeds an approved upload into the real WEBSITE renderer", () => {
  const prompt = "Build a premium ceramic lighting studio website and use the attached product image in the hero";
  const intent = buildIntentIntelligence({ prompt });
  const translatedIntent = translateIntent({ mode: "WEBSITE", prompt });
  const proposalContext = buildProposalContext({ mode: "WEBSITE", prompt, translatedIntent });
  const generation = generatePlannedWebsiteFiles({
    composition: buildCompositionStrategy(intent),
    explicitAssetPaths: ["assets/pendant-product.png"],
    intent,
    proposalContext,
    workspaceAssets: [{ path: "assets/pendant-product.png" }]
  });
  assert.equal(generation.qualityBlueprint.assetPlan.assets.find((asset) => asset.role === "hero_product")?.source, "user_upload");
  assert.match(generation.files["index.html"] ?? "", /src="\.\/assets\/pendant-product\.png"/);
  assert.doesNotMatch(generation.files["index.html"] ?? "", /hero-fallback\.svg/);
});

test("APPROVAL LIFECYCLE distinguishes permission, application, failure, rejection, and stale state", () => {
  assert.equal(proposalLifecycleLabel("submitting"), "Approving...");
  assert.equal(proposalLifecycleLabel("applying"), "Applying changes...");
  assert.equal(proposalLifecycleLabel("applied"), "Applied");
  assert.equal(proposalLifecycleIsActionable("pending"), true);
  assert.equal(proposalLifecycleIsActionable("applying"), false);
  assert.equal(proposalLifecycleIsActionable("applied"), false);
  assert.equal(proposalLifecycleIsActionable("rejected"), false);
  assert.equal(proposalLifecycleIsActionable("expired"), false);
  assert.deepEqual(normalizeProposalLifecycleSnapshot({ error: "write failed", status: "failed" }), { error: "write failed", status: "failed" });
});

test("APPROVAL LIFECYCLE state stays isolated by proposal identity in the UI and durable route", async () => {
  const sidebar = await readFile(new URL("../../../../components/shell/right-sidebar.tsx", import.meta.url), "utf8");
  const route = await readFile(new URL("../../../../app/api/runtime/approve/route.ts", import.meta.url), "utf8");
  const persistence = await readFile(new URL("../../../../../../../packages/database/src/persistence.ts", import.meta.url), "utf8");
  assert.match(sidebar, /approvalInFlightProposalRef\.current === proposal\.id/);
  assert.match(sidebar, /projectId, proposal\?\.id/);
  assert.match(sidebar, /method: "PATCH"/);
  assert.match(route, /export async function GET/);
  assert.match(route, /export async function PATCH/);
  assert.match(route, /completeOwnedChatProposalApproval/);
  assert.match(persistence, /status: "rejected"/);
  assert.match(persistence, /status: "failed"/);
  assert.match(persistence, /currentRevision !== expectedRevision/);
});

test("ASSET STUDIO does not resurrect universal hero fallback or force scene engines", async () => {
  const renderer = await readFile(new URL("../website-quality-renderer.ts", import.meta.url), "utf8");
  const generator = await readFile(new URL("../domain-site-generator.ts", import.meta.url), "utf8");
  assert.doesNotMatch(`${renderer}\n${generator}`, /hero-fallback\.svg/);
  assert.doesNotMatch(renderer, /scene\.js[\s\S]{0,80}always/i);
});
