import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type { HassaliAttachment } from "@/lib/attachments";
import { hassaliChatContractHeader, hassaliChatContractVersion, hassaliReloadRequiredMessage } from "@/lib/chat-contract";
import { generatePlannedWebsiteFiles } from "@/lib/server/ai/domain-site-generator";
import { buildIntentIntelligence } from "@/lib/server/ai/intent-intelligence";
import { translateIntent } from "@/lib/server/ai/intent-translator";
import { buildProposalContext } from "@/lib/server/ai/proposal-context";
import {
  createWebsiteProposalRepairAuthority,
  parseWebsiteProposalRepairAuthority,
  preserveWebsiteProposalContextForRepair,
  repairDesignAuthorityDrift
} from "@/lib/server/ai/proposal-repair-authority";
import { buildApprovalDecision } from "@/lib/server/ai/approval-authority";
import { buildWebsiteIntentContract, getTaxonomyProfile } from "@/lib/server/ai/industry-taxonomy";
import { inspectWebsiteSemanticCompleteness } from "@/lib/server/ai/proposal-quality-gate";
import { repairProposal } from "@/lib/server/ai/proposal-repair-engine";
import { validateWebsitePlanAndFiles } from "@/lib/server/ai/website-validator";
import { prepareProjectExportFiles } from "@/lib/server/project-export";
import { buildCompositionStrategy } from "@/lib/server/ai/reasoning-composition";
import {
  findSemanticSignals,
  includesSemanticSignal
} from "@/lib/server/ai/domain-signal-matcher";
import {
  beginServerProposalApproval,
  clearServerProposalRegistry,
  completeServerProposalApproval,
  registerServerProposal,
  releaseServerProposalApproval
} from "@/lib/server/runtime/server-proposal-registry";
import { buildDesignReferenceIntake, designReferenceVisibleSummary } from "@/lib/server/design/reference/reference-intake";
import { buildProjectDesignContract } from "../design-direction-kernel";

const prompt = "Build me a website for premium paint Brand, follow this document exactly for typography and colors and feel";
const now = () => new Date("2026-08-15T10:00:00.000Z");

async function exactPaintGeneration() {
  const bytes = await readFile(new URL("../../../../../../resources/design-knowledge/awesome-design-md/apple/DESIGN.md", import.meta.url));
  const metadata: HassaliAttachment = {
    analysisCapabilities: ["text"],
    conversationId: "production-parity",
    createdAt: now().toISOString(),
    extractedTextAvailable: true,
    id: "design-copy",
    kind: "text",
    mimeType: "text/markdown",
    originalName: "DESIGN (1).md",
    previewAvailable: false,
    projectId: "paint-project",
    safeName: "DESIGN (1).md",
    sizeBytes: bytes.byteLength,
    status: "ready",
    storageScope: "conversation"
  };
  const request = await buildDesignReferenceIntake({ attachments: [{ bytes, metadata }], now, prompt });
  const translatedIntent = translateIntent({ mode: "WEBSITE", prompt });
  const projectDesignContract = buildProjectDesignContract({ domain: translatedIntent.domain, now, request });
  const proposalContext = buildProposalContext({
    designDirectionRequest: request,
    mode: "WEBSITE",
    projectDesignContract,
    prompt,
    translatedIntent
  });
  const intent = buildIntentIntelligence({ prompt });
  const generation = generatePlannedWebsiteFiles({ composition: buildCompositionStrategy(intent), intent, proposalContext });
  return { generation, projectDesignContract, proposalContext, request };
}

async function generationFor(promptValue: string, designOverride?: ReturnType<typeof buildProjectDesignContract>) {
  const request = await buildDesignReferenceIntake({ now, prompt: promptValue });
  const translatedIntent = translateIntent({ mode: "WEBSITE", prompt: promptValue });
  const projectDesignContract = designOverride ?? buildProjectDesignContract({ domain: translatedIntent.domain, now, request });
  const proposalContext = buildProposalContext({
    designDirectionRequest: request,
    mode: "WEBSITE",
    projectDesignContract,
    prompt: promptValue,
    translatedIntent
  });
  const intent = buildIntentIntelligence({ prompt: promptValue });
  return generatePlannedWebsiteFiles({ composition: buildCompositionStrategy(intent), intent, proposalContext });
}

async function generationWithUploadedDesign(promptValue: string, profile: "airbnb" | "apple" | "ferrari" | "figma", projectId = "reference-project") {
  const bytes = await readFile(new URL(`../../../../../../resources/design-knowledge/awesome-design-md/${profile}/DESIGN.md`, import.meta.url));
  const request = await buildDesignReferenceIntake({
    attachments: [{
      bytes,
      metadata: {
        analysisCapabilities: ["text"], conversationId: `reference-${profile}`, createdAt: now().toISOString(), extractedTextAvailable: true,
        id: `reference-${profile}`, kind: "text", mimeType: "text/markdown", originalName: `${profile}-reference.md`, previewAvailable: false,
        projectId, safeName: `${profile}-reference.md`, sizeBytes: bytes.byteLength, status: "ready", storageScope: "conversation"
      }
    }],
    now,
    prompt: promptValue
  });
  const translatedIntent = translateIntent({ mode: "WEBSITE", prompt: promptValue });
  const projectDesignContract = buildProjectDesignContract({ domain: translatedIntent.domain, now, request });
  const proposalContext = buildProposalContext({
    designDirectionRequest: request,
    mode: "WEBSITE",
    projectDesignContract,
    prompt: promptValue,
    translatedIntent
  });
  const intent = buildIntentIntelligence({ prompt: promptValue });
  return {
    generation: generatePlannedWebsiteFiles({ composition: buildCompositionStrategy(intent), intent, proposalContext }),
    projectDesignContract,
    proposalContext,
    request
  };
}

test("PRODUCTION PARITY keeps DESIGN (1).md visual-only and paint authoritative", async () => {
  const result = await exactPaintGeneration();
  assert.equal(result.request.references[0]?.sourceType, "uploaded-design-md");
  assert.equal(result.request.references.some((reference) => reference.sourceType === "internal-design-knowledge"), false);
  assert.equal(result.proposalContext.domain, "paint_brand");
  assert.equal(result.proposalContext.businessName, "Paint and Coatings Brand");
  assert.equal(result.projectDesignContract.identity.userBrand, "Paint Brand");
  assert.equal(result.request.references[0]?.name, "Apple-design-analysis");
  assert.match(result.request.references[0]?.provenance.sourceLabel ?? "", /Current-turn uploaded design document: DESIGN \(1\)\.md/);
  assert.match(designReferenceVisibleSummary(result.request), /Reference: Apple-design-analysis/);
  assert.equal(result.projectDesignContract.colors.background.value.toLowerCase(), "#ffffff");
  assert.equal(result.projectDesignContract.colors.accent.value.toLowerCase(), "#0066cc");
  assert.equal(result.projectDesignContract.colors.primaryAction.value.toLowerCase(), "#0066cc");
  assert.equal(result.projectDesignContract.colors.textPrimary.value.toLowerCase(), "#1d1d1f");
  assert.match(result.projectDesignContract.typography.display, /SF Pro Display/i);
  assert.match(result.projectDesignContract.typography.body, /SF Pro Text/i);
  assert.equal(result.projectDesignContract.geometry.buttonRadius, "9999px");
  assert.match(result.projectDesignContract.imagery.direction, /photography-first/i);
});

test("PRODUCTION PARITY renders the supplied visual system without domain or WebGL leakage", async () => {
  const { generation } = await exactPaintGeneration();
  const publicHtml = Object.entries(generation.files).filter(([path]) => path.endsWith(".html")).map(([, content]) => content).join("\n");
  const css = generation.files["styles.css"] ?? "";
  assert.equal(generation.sourceOfTruthDomain, "paint_brand");
  assert.equal(generation.qualityBlueprint.business.domainId, "paint_brand");
  assert.equal(generation.qualityBlueprint.scene.requirement, "not_requested");
  assert.equal(generation.qualityBlueprint.webgl.enabled, false);
  assert.equal("scene.js" in generation.files, false);
  assert.match(publicHtml, /paint|coatings|color collections|finishes/i);
  assert.doesNotMatch(publicHtml, /OLED|QLED|smart televisions?|home cinema|wall mounting|law firm|legal advisory|furniture showroom/i);
  assert.doesNotMatch(publicHtml, /Current website|Suzuki|favorite black/i);
  assert.match(publicHtml, /data-design-archetype="quiet product storytelling"/i);
  assert.match(publicHtml, /material-spectrum/);
  assert.match(css, /color-scheme: light/);
  assert.match(css, /--bg: #ffffff/i);
  assert.match(css, /--accent-alt: #0066cc/i);
  assert.match(css, /--font-display: SF Pro Display, system-ui, -apple-system, sans-serif/i);
  assert.match(css, /--font-body: SF Pro Text, system-ui, -apple-system, sans-serif/i);
  assert.match(css, /--display-tracking: -0\.28px/i);
  assert.doesNotMatch(css, /linear-gradient|radial-gradient/i);
  assert.equal(generation.qualityBlueprint.brand.designConstraints.imageryPriority, "photography_first");
  assert.equal(generation.qualityBlueprint.assetPlan.imageStrategy, "asset_led");
  assert.ok(generation.qualityBlueprint.assetPlan.unresolved.length > 0);
  assert.equal(generation.qualityBlueprint.compositionQuality.status, "passed");
  assert.equal(generation.validation.passed, true, generation.validation.blockedReasons.join("\n"));
});

test("PRODUCTION PARITY exposes precise quality evidence and remains approvable", async () => {
  const { generation, proposalContext } = await exactPaintGeneration();
  const taxonomy = getTaxonomyProfile("paint_brand");
  assert.ok(taxonomy);
  const completeness = inspectWebsiteSemanticCompleteness({
    expectedEntities: taxonomy.expectedEntities,
    expectedSections: taxonomy.commonSections,
    expectedTrustSignals: taxonomy.trustSignals,
    files: generation.files
  });
  assert.deepEqual(completeness, { missingEntities: [], missingSections: [], missingTrustSignals: [] });
  const approval = buildApprovalDecision({
    proposal: {
      changes: Object.entries(generation.files).map(([path, proposedContent]) => ({ action: "create", path, proposedContent })),
      validationFilePaths: Object.keys(generation.files)
    },
    proposalContext
  });
  assert.equal(approval.approvalAllowed, true, approval.criticalIssues.join("\n"));
});

test("PRODUCTION PARITY gives paint offers product semantics and distinct page purposes", async () => {
  const { generation } = await exactPaintGeneration();
  const html = Object.values(generation.files).join("\n");
  assert.match(html, /data-entity-type="(?:product|product_category|collection)"/i);
  assert.doesNotMatch(html, /data-entity-label="(?:Paint|Coatings|Color Collections)"[^>]*data-entity-type="service"/i);
  assert.doesNotMatch(html, /made easier to understand|clear paint brand guidance|choose with useful context/i);
  const pages = generation.qualityBlueprint.pages;
  const about = pages.find((page) => page.name === "about");
  const inspiration = pages.find((page) => /inspiration/.test(page.name));
  assert.ok(about);
  assert.ok(inspiration);
  assert.notDeepEqual(about.sections.map((section) => `${section.kind}:${section.title}`), inspiration.sections.map((section) => `${section.kind}:${section.title}`));
});

test("PRODUCTION PARITY keeps internal automatic profile identity private", async () => {
  const request = await buildDesignReferenceIntake({ now, prompt: "Build a cinematic editorial portfolio with generous negative space." });
  const summary = designReferenceVisibleSummary(request);
  assert.doesNotMatch(summary, /shopify|mastercard|linear|resources\/design-knowledge/i);
  if (request.references.some((reference) => reference.sourceType === "internal-design-knowledge")) {
    assert.match(summary, /Hassali design intelligence/);
  }
});

test("PRODUCTION PARITY recognizes a structured current-turn design document by content", async () => {
  const bytes = await readFile(new URL("../../../../../../resources/design-knowledge/awesome-design-md/apple/DESIGN.md", import.meta.url));
  const request = await buildDesignReferenceIntake({
    attachments: [{
      bytes,
      metadata: {
        analysisCapabilities: ["text"], conversationId: "production-parity", createdAt: now().toISOString(), extractedTextAvailable: true,
        id: "brand-brief", kind: "text", mimeType: "text/markdown", originalName: "brand-brief.md", previewAvailable: false,
        projectId: "paint-project", safeName: "brand-brief.md", sizeBytes: bytes.byteLength, status: "ready", storageScope: "conversation"
      }
    }],
    now,
    prompt
  });
  assert.equal(request.references[0]?.sourceType, "uploaded-design-md");
  assert.equal(request.references[0]?.name, "Apple-design-analysis");
  assert.doesNotMatch(designReferenceVisibleSummary(request), /user-description/i);
});

test("PRODUCTION PARITY excludes irrelevant personal memory from design provenance", async () => {
  const request = await buildDesignReferenceIntake({
    memory: {
      diagnostics: { excludedCount: 0, includedCount: 2, requestedLayers: ["project"], sourceScopes: ["project"], totalCharacters: 100 },
      policy: {
        allowCrossProject: false, allowSensitive: false, automaticCapture: true, categories: ["preference"], intent: "website_work",
        maxCharacters: 3600, maxRecords: 12, mode: "WEBSITE", publicResearch: false, readConversation: true, readProject: true,
        readUser: true, state: "active", writeConversation: true, writeProject: true, writeUserAutomatic: true, writeUserExplicit: true,
        writeUserSensitiveExplicit: false
      },
      providerContext: "",
      sections: { conversations: [], people: [], project: [{ content: "My favorite car is a black Suzuki.", current: true, id: "car", scope: "project", sensitivity: "standard", sourceType: "project_memory", trust: "untrusted_context_only" }], user: [] }
    },
    now,
    prompt
  });
  assert.deepEqual(request.constraints.memory, []);
});

test("PRODUCTION PARITY makes a new prompt outrank stale project domain", () => {
  const translatedIntent = translateIntent({ contract: { domain: "electronics_retail" } as never, mode: "WEBSITE", prompt });
  const context = buildProposalContext({ contract: { domain: "electronics_retail" } as never, mode: "WEBSITE", prompt, translatedIntent });
  assert.equal(context.domain, "paint_brand");
  assert.equal(context.isNewBuild, true);
});

test("PRODUCTION PARITY keeps a restaurant prompt authoritative over visual inspiration", async () => {
  const restaurantPrompt = "Build a premium restaurant website inspired by Apple with a cinematic dark visual system.";
  const request = await buildDesignReferenceIntake({ now, prompt: restaurantPrompt });
  const translatedIntent = translateIntent({ mode: "WEBSITE", prompt: restaurantPrompt });
  const projectDesignContract = buildProjectDesignContract({ domain: translatedIntent.domain, now, request });
  const proposalContext = buildProposalContext({
    designDirectionRequest: request,
    mode: "WEBSITE",
    projectDesignContract,
    prompt: restaurantPrompt,
    translatedIntent
  });
  const intent = buildIntentIntelligence({ prompt: restaurantPrompt });
  const generation = generatePlannedWebsiteFiles({ composition: buildCompositionStrategy(intent), intent, proposalContext });
  const publicHtml = Object.entries(generation.files).filter(([path]) => path.endsWith(".html")).map(([, content]) => content).join("\n");

  assert.equal(proposalContext.domain, "restaurant");
  assert.equal(generation.sourceOfTruthDomain, "restaurant");
  assert.match(publicHtml, /menu|reservation|dining|restaurant/i);
  assert.doesNotMatch(publicHtml, /OLED|QLED|smart televisions?|paint coatings|furniture showroom/i);
});

test("PRODUCTION PARITY preserves the existing domain for an explicit site edit", () => {
  const editPrompt = "Make the hero darker and more cinematic.";
  const existingContract = { domain: "seafood_restaurant", websitePages: ["home", "menu", "about", "contact"] } as never;
  const translatedIntent = translateIntent({ contract: existingContract, mode: "WEBSITE", prompt: editPrompt });
  const context = buildProposalContext({ contract: existingContract, mode: "WEBSITE", prompt: editPrompt, translatedIntent });

  assert.equal(context.domain, "seafood_restaurant");
  assert.equal(context.isNewBuild, false);
});

test("PRODUCTION PARITY rejects a stale browser contract before generation", async () => {
  const { POST } = await import("@/app/api/ai/chat/route");
  const response = await POST(new Request("http://localhost/api/ai/chat", {
    body: JSON.stringify({
      clientContractVersion: "stale-client",
      messages: [{ content: prompt, role: "user" }],
      mode: "EXECUTE",
      productMode: "WEBSITE",
      projectId: null,
      workspaceProjectId: null
    }),
    headers: { "content-type": "application/json" },
    method: "POST"
  }));
  assert.equal(response.status, 409);
  assert.equal(response.headers.get(hassaliChatContractHeader), hassaliChatContractVersion);
  assert.equal((await response.json() as { error: string }).error, hassaliReloadRequiredMessage);
});

test("PRODUCTION PARITY keeps route filtering and client revision on the ordinary product path", async () => {
  const route = await readFile(new URL("../../../../../app/api/ai/chat/route.ts", import.meta.url), "utf8");
  const store = await readFile(new URL("../../../../chat-store.ts", import.meta.url), "utf8");
  assert.match(route, /isDesignMdAttachmentName\(artifact\.filename\)/);
  assert.match(route, /findSemanticSignals\(publicWebsiteFiles\.join\("\\n"\)/);
  assert.match(route, /CLIENT_CONTRACT_STALE/);
  assert.match(route, /PROJECT_CONTEXT_STALE/);
  assert.match(store, /clientContractVersion:\s*hassaliChatContractVersion/);
  assert.match(store, /workspaceProjectId:\s*workspaceContext\.projectId/);
  assert.match(store, /hassaliReloadRequiredMessage/);
});

test("PRODUCTION PARITY matches domain entities instead of arbitrary substrings or markup", () => {
  const allowed = [
    "disabled",
    "enabled",
    "style disabled",
    "WebGL disabled",
    "cinematic disabled",
    'data-webgl="disabled"',
    "stable",
    "button disabled",
    "disabled state",
    "HTML table",
    "comparison table",
    "pricing table",
    "data table",
    "table of finishes",
    "table of contents",
    "<table><tr><td>Plan</td></tr></table>"
  ];
  for (const value of allowed) {
    assert.equal(includesSemanticSignal(value, "LED"), false, value);
    assert.equal(includesSemanticSignal(value, "table"), false, value);
  }
  assert.deepEqual(findSemanticSignals("LED television, LED display, LED panel, and LED TV", ["LED"]), ["LED"]);
  for (const value of ["oak dining table", "wooden dining table", "coffee table", "bedside table", "furniture table"]) {
    assert.equal(includesSemanticSignal(value, "table"), true, value);
  }
});

test("PRODUCTION PARITY uses reusable offer semantics across hotel, restaurant, and SaaS", async () => {
  const hotel = await generationFor("Build a premium boutique hotel website with rooms, amenities, dining, and guest services.");
  const restaurant = await generationFor("Build a premium restaurant website with a menu, dining experience, reservations, and private events.");
  const saas = await generationFor("Build a premium CRM SaaS website with plans, workflow features, integrations, and demos.");
  assert.ok(hotel.qualityBlueprint.contentEntities.some((entity) => ["product", "product_category", "service"].includes(entity.entityType)));
  assert.ok(restaurant.qualityBlueprint.contentEntities.some((entity) => entity.entityType === "product_category"));
  assert.ok(saas.qualityBlueprint.contentEntities.some((entity) => entity.entityType === "capability"));
  assert.equal([hotel, restaurant, saas].every((generation) => generation.qualityBlueprint.contentEntities.every((entity) => entity.entityType !== undefined)), true);
});

test("PRODUCTION PARITY produces evidence-led structural diversity across paint, hotel, restaurant, and SaaS", async () => {
  const paint = (await exactPaintGeneration()).generation;
  const hotel = await generationFor("Build a premium boutique hotel website with rooms, amenities, location, and booking.");
  const restaurant = await generationFor("Build a premium restaurant website with signature dishes, chef story, reservations, and location.");
  const saas = await generationFor("Build a premium CRM software SaaS website with product workflow, integrations, pricing, and demo.");
  const signature = (generation: typeof paint) => JSON.stringify({
    families: generation.qualityBlueprint.composition.componentFamilies,
    grid: generation.qualityBlueprint.composition.gridStrategy,
    hero: generation.qualityBlueprint.composition.heroArchitecture,
    sections: generation.qualityBlueprint.pages.find((page) => page.name === "home")?.sections.map((section) => `${section.kind}:${section.title}`)
  });
  const signatures = new Set([paint, hotel, restaurant, saas].map(signature));
  assert.equal(signatures.size, 4);
  assert.equal(paint.qualityBlueprint.composition.heroArchitecture, "material-immersion");
  assert.equal(hotel.qualityBlueprint.business.domainId, "hotel_guesthouse");
  assert.notEqual(hotel.qualityBlueprint.composition.heroArchitecture, "material-immersion");
  assert.equal(restaurant.qualityBlueprint.composition.footerStrategy, "editorial");
  assert.equal(saas.qualityBlueprint.composition.heroArchitecture, "product-interface");
});

test("PRODUCTION PARITY lets materially different uploaded references alter the same restaurant composition", async () => {
  const restaurantPrompt = "Build a premium restaurant website with menus, reservations, and location. Follow the attached design document for visual direction.";
  const apple = await generationWithUploadedDesign(restaurantPrompt, "apple");
  const airbnb = await generationWithUploadedDesign(restaurantPrompt, "airbnb");
  assert.equal(apple.generation.qualityBlueprint.business.domainId, "restaurant");
  assert.equal(airbnb.generation.qualityBlueprint.business.domainId, "restaurant");
  assert.equal(apple.request.references[0]?.name, "Apple-design-analysis");
  assert.equal(airbnb.request.references[0]?.name, "Airbnb-design-analysis");
  assert.notEqual(apple.generation.qualityBlueprint.brand.palette.accent, airbnb.generation.qualityBlueprint.brand.palette.accent);
  assert.notEqual(apple.generation.qualityBlueprint.brand.typography.display, airbnb.generation.qualityBlueprint.brand.typography.display);
  assert.notEqual(apple.generation.qualityBlueprint.brand.visualArchetype, airbnb.generation.qualityBlueprint.brand.visualArchetype);
  assert.notDeepEqual(
    {
      brand: apple.generation.qualityBlueprint.brand,
      composition: apple.generation.qualityBlueprint.composition
    },
    {
      brand: airbnb.generation.qualityBlueprint.brand,
      composition: airbnb.generation.qualityBlueprint.composition
    }
  );
});

test("REPAIR B keeps generic Beauty business semantics under an explicit Apple design upload", async () => {
  const beautyPrompt = "Build me a website for premium Beauty Brand, follow this document exactly for typography and colors and feel";
  const apple = await generationWithUploadedDesign(beautyPrompt, "apple", "beauty-apple");
  const publicHtml = Object.entries(apple.generation.files).filter(([path]) => path.endsWith(".html")).map(([, content]) => content).join("\n");
  const css = apple.generation.files["styles.css"] ?? "";
  const hassali = apple.generation.files["HASSALI.md"] ?? "";

  assert.equal(apple.generation.sourceOfTruthDomain, "beauty_cosmetics");
  assert.equal(apple.generation.qualityBlueprint.business.domainId, "beauty_cosmetics");
  assert.equal(apple.request.references[0]?.name, "Apple-design-analysis");
  assert.equal(apple.request.references[0]?.sourceAttachmentId, "reference-apple");
  assert.ok(apple.request.references[0]?.provenance.fingerprint);
  assert.equal(apple.projectDesignContract.references[0]?.sourceAttachmentId, "reference-apple");
  assert.equal(apple.projectDesignContract.references[0]?.sourceFingerprint, apple.request.references[0]?.provenance.fingerprint);
  assert.match(publicHtml, /beauty|cosmetic|product discovery/i);
  assert.doesNotMatch(publicHtml, /Korean|K-beauty|DummyJSON|prototype provider|local fallback|project contract|HASSALI\.md/i);
  assert.match(css, /--bg: #ffffff/i);
  assert.match(css, /--accent-alt: #0066cc/i);
  assert.match(css, /SF Pro (?:Display|Text)/i);
  assert.doesNotMatch(css, /--bg:\s*#f6f0e7|--accent-alt:\s*#8e3d48/i);
  assert.doesNotMatch(hassali, /domainId:\s*(?:null|unknown|unclassified)|authoritativeDomain:\s*null|unknown:unknown|Current Prompt Website|^expectedVocabulary:\s*$|^trustSignals:\s*$/im);
  assert.equal(apple.generation.validation.passed, true, apple.generation.validation.blockedReasons.join("\n"));
});

test("REPAIR B replaces the current Beauty design reference without changing its business domain", async () => {
  const beautyPrompt = "Build me a website for premium Cosmetic Brand, follow this document exactly for typography and colors and feel";
  const apple = await generationWithUploadedDesign(beautyPrompt, "apple", "beauty-apple");
  const airbnb = await generationWithUploadedDesign(beautyPrompt, "airbnb", "beauty-airbnb");
  assert.equal(apple.generation.sourceOfTruthDomain, "beauty_cosmetics");
  assert.equal(airbnb.generation.sourceOfTruthDomain, "beauty_cosmetics");
  assert.equal(airbnb.request.references[0]?.name, "Airbnb-design-analysis");
  assert.equal(airbnb.request.references[0]?.sourceAttachmentId, "reference-airbnb");
  assert.notEqual(apple.request.references[0]?.provenance.fingerprint, airbnb.request.references[0]?.provenance.fingerprint);
  assert.notEqual(apple.generation.qualityBlueprint.brand.palette.accent, airbnb.generation.qualityBlueprint.brand.palette.accent);
  assert.doesNotMatch(Object.values(airbnb.generation.files).join("\n"), /Apple-design-analysis|reference-apple/);
});

test("REPAIR B permits Korean Beauty only when the current prompt supplies that specificity", async () => {
  const generic = await generationFor("Build me a premium Beauty Brand website with product discovery and contact.");
  const explicit = await generationFor("Build me a premium Korean Beauty Brand website with K-beauty product discovery and contact.");
  const genericPublic = Object.entries(generic.files).filter(([path]) => path.endsWith(".html")).map(([, content]) => content).join("\n");
  const explicitPublic = Object.entries(explicit.files).filter(([path]) => path.endsWith(".html")).map(([, content]) => content).join("\n");
  assert.doesNotMatch(genericPublic, /Korean|K-beauty/i);
  assert.match(explicitPublic, /Korean|K-beauty/i);
});

test("REPAIR C treats care as contextual domain evidence rather than a global forbidden token", () => {
  const beautyContract = buildWebsiteIntentContract({ prompt: "Build a premium Beauty Brand website." });
  assert.equal(beautyContract.domainId, "beauty_cosmetics");
  assert.equal(beautyContract.forbiddenVocabulary.some((term) => term.toLowerCase() === "care"), false);
  assert.equal(beautyContract.forbiddenVocabulary.some((term) => /patient care/i.test(term)), true);
  const beautySafe = [
    "skincare",
    "skin care",
    "Beauty Care",
    "product care",
    "Care Boundary",
    "hair care",
    "care instructions",
    "aftercare"
  ];
  for (const phrase of beautySafe) {
    assert.deepEqual(findSemanticSignals(phrase, ["care"]), [], phrase);
  }
  for (const phrase of [
    "urgent care clinic",
    "primary care physician",
    "patient care plan",
    "medical care provider",
    "clinical care treatment"
  ]) {
    assert.deepEqual(findSemanticSignals(phrase, ["care"]), ["care"], phrase);
  }
});

test("REPAIR C keeps broad Beauty prompts evidence-bounded and visitor-facing", async () => {
  const generation = await generationFor("Build me a website for premium Beauty Brand with a beautiful premium interface.");
  const publicHtml = Object.entries(generation.files).filter(([path]) => path.endsWith(".html")).map(([, content]) => content).join("\n");
  const contract = generation.qualityBlueprint.contentContract;
  assert.equal(generation.sourceOfTruthDomain, "beauty_cosmetics");
  assert.equal(contract.primaryAudience, "people exploring beauty and cosmetics");
  assert.doesNotMatch(contract.primaryAudience, /premium Beauty Brand/i);
  assert.doesNotMatch(publicHtml, /skincare beginners|skincare store|skin advice|patch[- ]test|treatment claims|ingredient and suitability|considered routine/i);
  assert.doesNotMatch(publicHtml, /claims kept bounded|without inventing a catalog|without relying on invented history|verified product evidence|representative content|generator fallback|provider fallback/i);
  assert.equal(generation.qualityBlueprint.copyValidation.blocked, false, JSON.stringify(generation.qualityBlueprint.copyValidation.findings));
});

test("REPAIR C keeps a curated Beauty hero and asset-plan state logically consistent", async () => {
  const generation = await generationFor("Build me a website for premium Beauty Brand with editorial imagery and a beautiful interface.");
  const heroAssets = generation.qualityBlueprint.assetPlan.assets.filter((asset) => asset.destination.page === "home" && asset.destination.section === "hero");
  assert.equal(heroAssets.length, 1);
  assert.notEqual(heroAssets[0]?.role, "no_asset_required");
  assert.equal(heroAssets[0]?.status, "ready");
  assert.equal(generation.qualityBlueprint.assetPlan.unresolved.length, 0);
});

test("REPAIR C de-duplicates an uploaded Apple document from its co-referential prompt name", async () => {
  const apple = await generationWithUploadedDesign(
    "Build me a website for premium Beauty Brand, follow this apple document exactly for typography and colors and feel",
    "apple",
    "beauty-apple-coreference"
  );
  assert.equal(apple.request.references.filter((reference) => reference.sourceType === "uploaded-design-md").length, 1);
  assert.equal(apple.request.references.some((reference) => reference.sourceType === "named-brand" && /apple/i.test(reference.name)), false);
  assert.deepEqual(apple.projectDesignContract.references.map((reference) => reference.name), ["Apple-design-analysis"]);
});

test("REPAIR C preserves intentional mixed references while resolving document co-reference", async () => {
  const mixed = await generationWithUploadedDesign(
    "Build a premium Beauty Brand website. Use this figma document but make typography like Apple.",
    "figma",
    "beauty-mixed-reference"
  );
  assert.equal(mixed.request.references.some((reference) => reference.sourceType === "uploaded-design-md" && /Figma-design-analysis/i.test(reference.name)), true);
  assert.equal(mixed.request.references.some((reference) => reference.sourceType === "named-brand" && reference.role === "typography" && /Apple/i.test(reference.name)), true);
});

test("REPAIR C preserves Figma design authority through a non-design successor proposal", async () => {
  const promptValue = "Build me a website for premium Beauty Brand, follow this figma document exactly for typography and colors and feel";
  const figma = await generationWithUploadedDesign(promptValue, "figma", "beauty-figma-repair");
  const unrelated = await generationWithUploadedDesign(promptValue, "airbnb", "beauty-airbnb-attack");
  const authority = createWebsiteProposalRepairAuthority(figma.proposalContext);
  assert.ok(authority);
  const persisted = parseWebsiteProposalRepairAuthority(JSON.parse(JSON.stringify(authority)));
  assert.ok(persisted);
  const repairedContext = preserveWebsiteProposalContextForRepair(unrelated.proposalContext, persisted);
  assert.equal(repairedContext.domain, "beauty_cosmetics");
  assert.equal(repairedContext.projectDesignContract?.fingerprint, figma.projectDesignContract.fingerprint);
  assert.equal(repairedContext.projectDesignContract?.references[0]?.sourceAttachmentId, "reference-figma");
  assert.equal(repairDesignAuthorityDrift({ actual: repairedContext.projectDesignContract, expected: figma.projectDesignContract, failureCodes: ["website_domain_semantic_block"] }), null);
  assert.match(repairDesignAuthorityDrift({ actual: unrelated.projectDesignContract, expected: figma.projectDesignContract, failureCodes: ["website_domain_semantic_block"] }) ?? "", /REPAIR_DESIGN_AUTHORITY_DRIFT/);
  const intent = buildIntentIntelligence({ prompt: promptValue });
  const repaired = generatePlannedWebsiteFiles({ composition: buildCompositionStrategy(intent), intent, proposalContext: repairedContext });
  assert.equal(repaired.qualityBlueprint.brand.palette.accent, figma.generation.qualityBlueprint.brand.palette.accent);
  assert.equal(repaired.qualityBlueprint.brand.typography.display, figma.generation.qualityBlueprint.brand.typography.display);
});

test("REPAIR C preserves Apple design authority through a non-design successor proposal", async () => {
  const promptValue = "Build me a website for premium Beauty Brand, follow this apple document exactly for typography and colors and feel";
  const apple = await generationWithUploadedDesign(promptValue, "apple", "beauty-apple-repair");
  const unrelated = await generationWithUploadedDesign(promptValue, "airbnb", "beauty-apple-attack");
  const authority = parseWebsiteProposalRepairAuthority(JSON.parse(JSON.stringify(createWebsiteProposalRepairAuthority(apple.proposalContext))));
  assert.ok(authority);
  const repairedContext = preserveWebsiteProposalContextForRepair(unrelated.proposalContext, authority);
  assert.equal(repairedContext.projectDesignContract?.fingerprint, apple.projectDesignContract.fingerprint);
  assert.equal(repairedContext.projectDesignContract?.references[0]?.sourceAttachmentId, "reference-apple");
  assert.equal(repairDesignAuthorityDrift({ actual: repairedContext.projectDesignContract, expected: apple.projectDesignContract, failureCodes: ["website_content_quality_block"] }), null);
  assert.match(repairedContext.projectDesignContract?.typography.display ?? "", /SF Pro Display/i);
  assert.equal(repairedContext.projectDesignContract?.colors.accent.value.toLowerCase(), "#0066cc");
});

test("REPAIR B keeps rendered section IDs unique and internal media diagnostics out of public Beauty copy", async () => {
  const generation = await generationFor("Build me a premium Beauty Brand website with product discovery, routines, about, and contact.");
  for (const [path, content] of Object.entries(generation.files).filter(([path]) => path.endsWith(".html"))) {
    const ids = Array.from(content.matchAll(/\bid=["']([^"']+)["']/gi), (match) => match[1]);
    assert.equal(new Set(ids).size, ids.length, path);
  }
  const publicHtml = Object.entries(generation.files).filter(([path]) => path.endsWith(".html")).map(([, content]) => content).join("\n");
  assert.doesNotMatch(publicHtml, /DummyJSON|prototype provider|local fallback architecture|project contract internals|HASSALI\.md|mascara-sample/i);
  assert.equal(generation.validation.passed, true, generation.validation.blockedReasons.join("\n"));
});

test("REPAIR B hard-blocks duplicate HTML IDs before approval", async () => {
  const generation = await generationFor("Build me a premium Beauty Brand website with product discovery and contact.");
  const files = { ...generation.files, "index.html": `${generation.files["index.html"]}<div id="home-trust"></div><div id="home-trust"></div>` };
  const validation = validateWebsitePlanAndFiles({ files, plan: generation.plan });
  assert.equal(validation.passed, false);
  assert.match(validation.blockedReasons.join("\n"), /Duplicate HTML IDs detected: index\.html#home-trust/i);
  const approval = buildApprovalDecision({
    proposal: {
      changes: Object.entries(files).map(([path, proposedContent]) => ({ action: "create", path, proposedContent })),
      validationFilePaths: Object.keys(files)
    },
    proposalContext: buildProposalContext({
      mode: "WEBSITE",
      prompt: "Build me a premium Beauty Brand website with product discovery and contact.",
      translatedIntent: translateIntent({ mode: "WEBSITE", prompt: "Build me a premium Beauty Brand website with product discovery and contact." })
    })
  });
  assert.equal(approval.approvalAllowed, false);
  assert.match(approval.criticalIssues.join("\n"), /duplicate HTML id/i);
});

test("REPAIR B rejects unresolved canonical HASSALI metadata at server approval authority", async () => {
  const promptValue = "Build me a premium Beauty Brand website with product discovery and contact.";
  const translatedIntent = translateIntent({ mode: "WEBSITE", prompt: promptValue });
  const proposalContext = buildProposalContext({ mode: "WEBSITE", prompt: promptValue, translatedIntent });
  const generation = await generationFor(promptValue);
  const unsafeFiles = {
    ...generation.files,
    "HASSALI.md": (generation.files["HASSALI.md"] ?? "")
      .replace(/^domainId:.*$/m, "domainId: null")
      .replace(/^qualitySemanticHierarchy:.*$/m, "qualitySemanticHierarchy: unknown:unknown:Beauty Brand")
  };
  const decision = buildApprovalDecision({
    proposal: { changes: Object.entries(unsafeFiles).map(([path, proposedContent]) => ({ action: "create", path, proposedContent })), validationFilePaths: Object.keys(unsafeFiles) },
    proposalContext
  });
  assert.equal(decision.approvalAllowed, false);
  assert.match(decision.criticalIssues.join("\n"), /unresolved canonical WEBSITE metadata/i);
});

test("REPAIR B isolates Ferrari and Apple design contracts through project export", async () => {
  const promptValue = "Build a premium automotive studio website and follow the attached design document exactly for visual direction.";
  const ferrari = await generationWithUploadedDesign(promptValue, "ferrari", "project-a");
  const apple = await generationWithUploadedDesign(promptValue, "apple", "project-b");
  const exportFor = (generation: typeof ferrari.generation, projectName: string) => prepareProjectExportFiles({
    files: Object.entries(generation.files).map(([path, content]) => ({ content, path })), mode: "WEBSITE", projectName
  }).map((file) => `${file.path}\n${typeof file.content === "string" ? file.content : "[binary]"}`).join("\n");
  const exportA = exportFor(ferrari.generation, "Project A");
  const exportB = exportFor(apple.generation, "Project B");
  assert.match(exportA, /Ferrari-design-analysis|#d71920/i);
  assert.doesNotMatch(exportA, /Apple-design-analysis|reference-apple/);
  assert.match(exportB, /Apple-design-analysis|#0066cc/i);
  assert.doesNotMatch(exportB, /Ferrari-design-analysis|reference-ferrari/);
});

test("REPAIR B keeps shared business vocabulary neutral and project polling project-bound", async () => {
  const validator = await readFile(new URL("../../../ai/domain-validator.ts", import.meta.url), "utf8");
  const sidebar = await readFile(new URL("../../../../../components/shell/right-sidebar.tsx", import.meta.url), "utf8");
  const route = await readFile(new URL("../../../../../app/api/ai/chat/route.ts", import.meta.url), "utf8");
  for (const term of ["stock", "table", "display", "service", "product", "collection", "model"]) {
    assert.match(validator, new RegExp(`\\"${term}\\"`));
  }
  assert.match(sidebar, /proposal\.projectId !== projectId\) return/);
  assert.match(sidebar, /controller\.abort\(\)/);
  assert.match(sidebar, /HASSALI_REPAIR_CONTEXT_JSON/);
  assert.doesNotMatch(sidebar, /Previous proposal was blocked because:\\n\$\{formatPromptList/);
  assert.match(route, /canonical_block_preserved/);
  assert.match(route, /should_block_execution_without_cause/);
});

test("REPAIR B repair is bounded to existing generated WEBSITE files and never invents a fallback site", () => {
  const repairInput = (proposedFiles: Record<string, string>) => ({
    assetVisualValidation: {
      shouldBlockVisualApproval: true,
      visualBlocks: [],
      visualFailures: [{ message: "Visual placeholders are too generic." }]
    },
    contextPriority: { authoritativeMode: "WEBSITE" },
    domainValidation: { repairHints: [], shouldBlockProposal: false },
    generatorContract: {
      authoritativeBusinessType: "beauty and cosmetics brand",
      authoritativeDomain: "beauty_cosmetics",
      contractBlocks: [],
      contractId: "repair-b-beauty",
      forbiddenTerms: [],
      generatorMode: "website_generation",
      requiredCopySignals: ["beauty", "cosmetics", "product discovery"],
      requiredPages: ["home", "products", "about", "contact"],
      requiredFileStrategy: [],
      requiredVisualSignals: ["beauty product discovery"]
    },
    productMode: "WEBSITE",
    proposalQuality: { approvalDisabled: false, blocks: [], failures: [] },
    proposedFiles,
    proposalSummary: "Beauty proposal"
  } as unknown as Parameters<typeof repairProposal>[0]);

  const empty = repairProposal(repairInput({}));
  assert.equal(empty.shouldKeepBlocked, true);
  assert.deepEqual(empty.repairedFiles, {});
  assert.match(empty.unresolvedIssues.join("\n"), /Website Generation Returned No Files/i);

  const repaired = repairProposal(repairInput({ "index.html": '<main aria-label="placeholder">visual</main>' }));
  assert.equal(repaired.repairApplied, true);
  assert.equal(repaired.revalidationRequired, true);
  assert.match(repaired.repairedFiles["index.html"] ?? "", /aria-label="beauty product discovery"/i);
  assert.doesNotMatch(repaired.repairedFiles["index.html"] ?? "", /bouquet|dental clinic|TV showroom|CRM dashboard/i);
  assert.deepEqual(Object.keys(repaired.repairedFiles), ["index.html"]);
});

test("PRODUCTION PARITY keeps quality failures blocked without security-alarm wording", async () => {
  const { generation, proposalContext } = await exactPaintGeneration();
  const decision = buildApprovalDecision({
    proposal: {
      approvalDisabled: true,
      blockedReason: "Expected paint product evidence is missing.",
      changes: Object.entries(generation.files).map(([path, proposedContent]) => ({ action: "create", path, proposedContent })),
      proposalQualityStatus: "blocked",
      proposalRoutingMode: "blocked",
      shouldBlockExecution: true,
      validationFilePaths: Object.keys(generation.files)
    },
    proposalContext
  });
  assert.equal(decision.approvalAllowed, false);
  assert.match(decision.criticalIssues.join("\n"), /paint product evidence is missing/i);
  const sidebar = await readFile(new URL("../../../../../components/shell/right-sidebar.tsx", import.meta.url), "utf8");
  assert.match(sidebar, /Blocked — Needs repair/);
  assert.match(sidebar, /Blocked \/ Unsafe to Execute/);
});

test("PRODUCTION PARITY omits generic hero and dormant special-engine scaffolding", async () => {
  const generation = await generationFor("Build a premium boutique hotel website with rooms, amenities, and booking.");
  const css = generation.files["styles.css"] ?? "";
  const html = generation.files["index.html"] ?? "";
  assert.equal("assets/hero-fallback.svg" in generation.files, false);
  assert.equal("scene.js" in generation.files, false);
  assert.equal(Object.keys(generation.files).some((path) => path.startsWith("cinematic/")), false);
  assert.doesNotMatch(css, /\.scene-section|\.cinematic-sequence/);
  assert.doesNotMatch(html, /hero-fallback\.svg|<canvas\b/);
});

test("PRODUCTION PARITY keeps successors independent after blocked, rejected, applied, failed, and stale proposals", async () => {
  const proposal = (proposalId: string) => ({
    authoritativeMode: "WEBSITE",
    changes: [{ action: "update", path: "index.html", proposedContent: proposalId, summary: proposalId }],
    id: proposalId,
    mode: "SUGGEST",
    projectId: "project-lifecycle",
    serverProjectRevision: "revision",
    summary: proposalId
  });

  clearServerProposalRegistry();
  assert.equal(beginServerProposalApproval({ projectId: "project-lifecycle", proposalId: "blocked-a" }).status, "missing");
  registerServerProposal(proposal("blocked-b"));
  assert.equal(beginServerProposalApproval({ projectId: "project-lifecycle", proposalId: "blocked-b" }).status, "acquired");

  clearServerProposalRegistry();
  registerServerProposal(proposal("rejected-a"));
  registerServerProposal(proposal("rejected-b"));
  assert.equal(beginServerProposalApproval({ projectId: "project-lifecycle", proposalId: "rejected-b" }).status, "acquired");

  clearServerProposalRegistry();
  registerServerProposal(proposal("applied-a"));
  assert.equal(beginServerProposalApproval({ projectId: "project-lifecycle", proposalId: "applied-a" }).status, "acquired");
  completeServerProposalApproval({ projectId: "project-lifecycle", proposalId: "applied-a", result: { ok: true } });
  registerServerProposal(proposal("applied-b"));
  assert.equal(beginServerProposalApproval({ projectId: "project-lifecycle", proposalId: "applied-b" }).status, "acquired");

  clearServerProposalRegistry();
  registerServerProposal(proposal("proposal-a"));
  assert.equal(beginServerProposalApproval({ projectId: "project-lifecycle", proposalId: "proposal-a" }).status, "acquired");
  assert.equal(releaseServerProposalApproval({ projectId: "project-lifecycle", proposalId: "proposal-a" }), true);
  registerServerProposal(proposal("proposal-b"));
  assert.equal(beginServerProposalApproval({ projectId: "project-lifecycle", proposalId: "proposal-b" }).status, "acquired");

  clearServerProposalRegistry();
  assert.equal(beginServerProposalApproval({ projectId: "project-lifecycle", proposalId: "stale-a" }).status, "missing");
  registerServerProposal(proposal("stale-b"));
  assert.equal(beginServerProposalApproval({ projectId: "project-lifecycle", proposalId: "stale-b" }).status, "acquired");
  clearServerProposalRegistry();
});
