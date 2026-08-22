import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type { HassaliAttachment } from "@/lib/attachments";
import { deriveManifest, type VfsFile } from "@/lib/preview-manifest";
import { generatePlannedWebsiteFiles } from "@/lib/server/ai/domain-site-generator";
import { buildIntentIntelligence } from "@/lib/server/ai/intent-intelligence";
import { inferSemanticDomain } from "@/lib/server/ai/industry-taxonomy";
import { buildProposalContext } from "@/lib/server/ai/proposal-context";
import {
  classifyProposalFailure,
  isHardProposalFailure,
  isRepairableProposalFailure
} from "@/lib/server/ai/proposal-risk-classification";
import { buildCompositionStrategy } from "@/lib/server/ai/reasoning-composition";
import { translateIntent } from "@/lib/server/ai/intent-translator";
import { buildWebsiteContentContract } from "@/lib/server/ai/website-content-contract";
import { analyzeWebsiteRequestObjective } from "@/lib/server/ai/website-request-objective";
import { repairGeneratedWebsiteStructure } from "@/lib/server/ai/website-structural-repair";
import { validateWebsitePlanAndFiles } from "@/lib/server/ai/website-validator";
import { buildProjectDesignContract } from "@/lib/server/design/direction/design-direction-kernel";
import { buildDesignReferenceIntake } from "@/lib/server/design/reference/reference-intake";

const founderPrompt = "Build me a webgl scroll effect site for my portfolio as a photographer use this .md file as inspiration";
const now = () => new Date("2026-08-21T10:00:00.000Z");

async function generationFor(prompt: string, withDesign = false) {
  let attachments: Array<{ bytes: Buffer; metadata: HassaliAttachment }> = [];
  if (withDesign) {
    const bytes = await readFile("resources/design-knowledge/awesome-design-md/apple/DESIGN.md");
    attachments = [{
      bytes,
      metadata: {
        analysisCapabilities: ["text"], conversationId: "systemic-robustness", createdAt: now().toISOString(), extractedTextAvailable: true,
        id: "systemic-design", kind: "text", mimeType: "text/markdown", originalName: "DESIGN.md", previewAvailable: false,
        projectId: "systemic-project", safeName: "DESIGN.md", sizeBytes: bytes.byteLength, status: "ready", storageScope: "conversation"
      }
    }];
  }
  const request = await buildDesignReferenceIntake({ attachments, now, prompt });
  const translatedIntent = translateIntent({ mode: "WEBSITE", prompt });
  const projectDesignContract = buildProjectDesignContract({ domain: translatedIntent.domain, now, request });
  const proposalContext = buildProposalContext({ designDirectionRequest: request, mode: "WEBSITE", projectDesignContract, prompt, translatedIntent });
  const intent = buildIntentIntelligence({ prompt });
  const generation = generatePlannedWebsiteFiles({ composition: buildCompositionStrategy(intent), intent, proposalContext });
  return { generation, intent, projectDesignContract };
}

test("objective authority separates photographer goal, capabilities, reference, and brand", () => {
  const objective = analyzeWebsiteRequestObjective(founderPrompt);
  assert.equal(objective.operation, "new_website");
  assert.equal(objective.subject, "photographer portfolio");
  assert.equal(objective.explicitBrandName, null);
  assert.equal(objective.attachmentRelationship, "design_reference");
  assert.deepEqual(objective.functionalRequirements, ["webgl", "scroll_interaction"]);
  assert.equal(buildIntentIntelligence({ prompt: founderPrompt }).brandName, null);
});

test("exact founder generation keeps reference-led WebGL but rejects instruction-shaped identity and commerce copy", async () => {
  const { generation, intent, projectDesignContract } = await generationFor(founderPrompt, true);
  const repaired = repairGeneratedWebsiteStructure(generation.files);
  const source = Object.values(repaired.files).join("\n");
  const publicHtml = Object.entries(repaired.files).filter(([path]) => path.endsWith(".html")).map(([, value]) => value).join("\n");
  const validation = validateWebsitePlanAndFiles({
    assets: generation.qualityBlueprint.assets,
    availableAssetPaths: [],
    cinematic: generation.qualityBlueprint.cinematic,
    experience: generation.qualityBlueprint.experience,
    experienceQuality: generation.qualityBlueprint.experienceQuality,
    files: repaired.files,
    plan: generation.plan
  });

  assert.equal(intent.brandName, null);
  assert.equal(generation.qualityBlueprint.brand.nameProvenance, "SAFE_INFERENCE");
  assert.equal(generation.qualityBlueprint.webgl.enabled, true);
  assert.equal("scene.js" in repaired.files, true);
  assert.match(repaired.files["index.html"] ?? "", /data-scene-id=/, JSON.stringify(generation.qualityBlueprint.experience.sections));
  assert.match(source, new RegExp(projectDesignContract.fingerprint));
  const contaminatedFiles = Object.entries(repaired.files).filter(([, value]) => /My Portfolio As A Photographer Use This/i.test(value)).map(([path, value]) => ({ path, excerpt: value.match(/.{0,90}My Portfolio As A Photographer Use This.{0,140}/i)?.[0] }));
  assert.deepEqual(contaminatedFiles, [], JSON.stringify(contaminatedFiles));
  assert.doesNotMatch(source, /portfolio as a photographer use this/i);
  assert.doesNotMatch(publicHtml, /Product category|clear buying guidance|current pricing, availability, timing, and terms/i);
  assert.match(publicHtml, /Portfolio Work|Project Stor|Selected Work|Galler|Film/i);
  assert.equal(validation.blockedReasons.some((reason) => /Duplicate HTML IDs/i.test(reason)), false);
  assert.equal(validation.passed, true, `${Object.keys(repaired.files).join(", ")} :: ${validation.blockedReasons.join("; ")}`);
  assert.match(repaired.files["HASSALI.md"] ?? "", /trustSignals:\s*(?:optional_unknown|\S+)/i);
});

test("portfolio semantics are capability-driven and WebGL is request-driven", async () => {
  const prompt = "Build a premium site for my portfolio as a photographer with galleries, films, and project stories.";
  const { generation } = await generationFor(prompt);
  const content = buildWebsiteContentContract({ prompt, semantic: inferSemanticDomain(prompt) });
  assert.equal(content.businessType, "photographer portfolio");
  assert.equal(content.commerceBehavior, "portfolio_inquiry");
  assert.deepEqual(generation.plan.pages, ["home", "work", "about", "contact"]);
  assert.equal(generation.qualityBlueprint.webgl.enabled, false);
  assert.equal("scene.js" in generation.files, false);
  const pricingLeak = Object.entries(generation.files).filter(([, value]) => /current pricing, availability, timing, and terms/i.test(value)).map(([path, value]) => ({ path, excerpt: value.match(/.{0,100}current pricing, availability, timing, and terms.{0,100}/i)?.[0] }));
  assert.deepEqual(pricingLeak, [], JSON.stringify(pricingLeak));
});

test("unseen manufacturer request remains product-led without portfolio contamination", async () => {
  const prompt = "Build a premium website for an air-conditioning manufacturer that sells residential and commercial AC systems. Make it modern, technical and product focused.";
  const { generation } = await generationFor(prompt);
  const semantic = inferSemanticDomain(prompt);
  const source = Object.values(generation.files).join("\n");
  assert.equal(semantic.businessModels.includes("manufacturing"), true);
  assert.match(generation.plan.pages.join(" "), /products.*capabilities/i);
  assert.match(source, /air conditioning|cooling|AC systems/i);
  assert.doesNotMatch(source, /photographer|project stories|galleries/i);
});

test("bounded structural repair uses role-aware identities and repairs close anchors", () => {
  const result = repairGeneratedWebsiteStructure({
    "index.html": '<main><section id="home-trust" data-section-role="trust"></section><section id="home-trust" data-section-role="process"></section><a href="#home-proces">Process</a><div id="home-process"></div></main>'
  });
  const html = result.files["index.html"] ?? "";
  assert.equal(result.repairs.some((repair) => repair.type === "duplicate_html_id" && repair.semanticRole === "process"), true);
  assert.equal(result.repairs.some((repair) => repair.type === "broken_anchor"), true);
  assert.equal((html.match(/id="home-trust"/g) ?? []).length, 1);
  assert.match(html, /id="home-process(?:-2)?"/);
  assert.match(html, /href="#home-process"/);
  assert.ok(result.attempts <= 2);
});

test("preview manifests are strict to active product mode in a mixed project", () => {
  const files = new Map<string, VfsFile>([
    ["index.html", { content: "<main>Website</main>", lastModified: 1, path: "index.html" }],
    ["styles.css", { content: "body{}", lastModified: 1, path: "styles.css" }],
    ["app.py", { content: "import streamlit", lastModified: 1, path: "app.py" }],
    ["requirements.txt", { content: "streamlit", lastModified: 1, path: "requirements.txt" }]
  ]);
  assert.equal(deriveManifest(files, "WEBSITE").type, "static_website");
  assert.equal(deriveManifest(files, "CODE").type, "python_app");
  assert.equal(deriveManifest(files, "ASK").type, null);
  const websiteOnly = new Map([...files].filter(([path]) => path === "index.html" || path === "styles.css"));
  assert.equal(deriveManifest(websiteOnly, "CODE").type, null);
});

test("severity classification separates generated defects from real safety and authority failures", () => {
  assert.equal(classifyProposalFailure("website_validation_block"), "generation_structural");
  assert.equal(isRepairableProposalFailure("website_structure_block"), true);
  assert.equal(isHardProposalFailure("website_validation_block"), false);
  assert.equal(classifyProposalFailure("path_traversal_detected"), "hard_safety");
  assert.equal(isHardProposalFailure("cross_project_ownership_violation"), true);
  assert.equal(classifyProposalFailure("stale_proposal_authority"), "authority_integrity");
});
