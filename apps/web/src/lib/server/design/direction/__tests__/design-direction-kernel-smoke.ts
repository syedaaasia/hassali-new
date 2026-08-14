import assert from "node:assert/strict";
import test from "node:test";
import { generatePlannedWebsiteFiles } from "@/lib/server/ai/domain-site-generator";
import { buildIntentIntelligence } from "@/lib/server/ai/intent-intelligence";
import type { ProposalContext } from "@/lib/server/ai/proposal-context";
import { buildCompositionStrategy } from "@/lib/server/ai/reasoning-composition";
import { buildDesignReferenceIntake } from "@/lib/server/design/reference/reference-intake";
import { buildProjectDesignContract } from "../design-direction-kernel";
import { reviewGeneratedWebsiteDesign, reviewProjectDesignContract } from "../design-quality-kernel";
import { renderProjectDesignMd } from "../project-design-md";

const now = () => new Date("2026-08-14T10:00:00.000Z");

async function contractFor(prompt: string, options?: {
  projectNotes?: string;
  workspace?: { fileContents: Record<string, string>; fileList: string[] };
}) {
  const request = await buildDesignReferenceIntake({
    now,
    projectNotes: options?.projectNotes,
    prompt,
    workspace: options?.workspace ? {
      activeFileContent: options.workspace.fileContents[options.workspace.fileList[0] ?? ""] ?? "",
      activePath: options.workspace.fileList[0] ?? "",
      ...options.workspace
    } : undefined
  });
  return buildProjectDesignContract({ domain: "automotive", now, request, workspace: options?.workspace });
}

test("DIRECTION preserves the user brand while translating Ferrari into a complete luxury system", async () => {
  const contract = await contractFor("Build a premium automotive website for Apex Motors very close to Ferrari's visual style.");
  assert.equal(contract.identity.userBrand, "Apex Motors");
  assert.equal(contract.identity.archetype, "cinematic luxury editorial");
  assert.equal(contract.fidelity.mode, "close-replica");
  assert(contract.fidelity.strength >= 0.8);
  assert.match(contract.layout.hero, /full-bleed cinematic/i);
  assert.match(contract.geometry.surfaceTreatment, /image-led/i);
  assert.equal(contract.colors.accent.value, "#d71920");
  assert.equal(reviewProjectDesignContract(contract).blocking, false);
});

test("DIRECTION creates materially different Ferrari and Snapchat systems", async () => {
  const ferrari = await contractFor("Build a site for Apex Motors like Ferrari.");
  const snapchat = await contractFor("Build a playful social site for Flick Friends like Snapchat.");
  assert.notEqual(ferrari.identity.archetype, snapchat.identity.archetype);
  assert.notEqual(ferrari.colors.background.value, snapchat.colors.background.value);
  assert.notEqual(ferrari.geometry.cardRadius, snapchat.geometry.cardRadius);
  assert.notDeepEqual(ferrari.layout.sectionRhythm, snapchat.layout.sectionRhythm);
});

test("HYBRID composes global, product-storytelling, and pricing references without global leakage", async () => {
  const contract = await contractFor("Build Apex Motors. Use Ferrari overall, Apple-like product sections, and Stripe-style pricing.");
  assert.equal(contract.identity.archetype, "cinematic luxury editorial");
  assert.match(contract.components.sectionSpecific["product-storytelling"] ?? "", /Apple/i);
  assert.match(contract.components.sectionSpecific.pricing ?? "", /Stripe/i);
  assert.equal(contract.colors.accent.value, "#d71920");
});

test("SCOPING keeps a pricing-only Stripe reference out of the global palette", async () => {
  const contract = await contractFor("Build an original premium site for Maison Bloom, but use Stripe-style pricing only.");
  assert.equal(contract.identity.archetype, "original premium editorial");
  assert.equal(contract.colors.accent.value, "#8e3d48");
  assert.match(contract.components.sectionSpecific.pricing ?? "", /Stripe/i);
});

test("ORIGINAL requests produce a coherent named system without an external brand dependency", async () => {
  const contract = await contractFor("Build an original premium floral website for Maison Bloom. Do not copy another brand.");
  assert.equal(contract.identity.original, true);
  assert.equal(contract.identity.userBrand, "Maison Bloom");
  assert.equal(contract.references.some((reference) => reference.sourceType === "named-brand"), false);
  assert(contract.layout.sectionRhythm.length >= 4);
});

test("CURRENT REQUEST overrides saved-like constraints only for the requested target", async () => {
  const request = await buildDesignReferenceIntake({ now, prompt: "Use rounded cards for the pricing section." });
  request.constraints.memory = ["Keep cards square throughout the project."];
  request.constraints.overriddenMemory = ["Keep cards square throughout the project."];
  request.constraints.currentRequest = ["Use rounded cards for the pricing section."];
  const contract = buildProjectDesignContract({ now, request });
  assert.match(contract.geometry.cardRadius, /rounded target only/i);
  assert(contract.conflicts.some((conflict) => conflict.dimension === "saved-preference" && conflict.severity === "resolved"));
});

test("MEMORY geometry participates before a current scoped override supersedes it", async () => {
  const baselineRequest = await buildDesignReferenceIntake({ now, prompt: "Build an original premium gallery website." });
  baselineRequest.constraints.memory = ["Keep cards square throughout the project."];
  const baseline = buildProjectDesignContract({ now, request: baselineRequest });
  assert.equal(baseline.geometry.cardRadius, "2px");

  const overrideRequest = await buildDesignReferenceIntake({ now, prompt: "For the gallery cards use rounded corners." });
  overrideRequest.constraints.memory = ["Keep cards square throughout the project."];
  overrideRequest.constraints.overriddenMemory = ["Keep cards square throughout the project."];
  overrideRequest.constraints.currentRequest = ["For the gallery cards use rounded corners."];
  const overridden = buildProjectDesignContract({ now, request: overrideRequest });
  assert.match(overridden.geometry.cardRadius, /18px.*rounded target only/i);
  assert(overridden.conflicts.some((conflict) => conflict.dimension === "saved-preference" && conflict.severity === "resolved"));
  assert(overridden.provenance.some((source) => source.status === "historical-overridden" && /square/i.test(source.label)));
  const markdown = renderProjectDesignMd(overridden);
  assert.match(markdown, /saved-preference \[resolved\]/i);
  assert.match(markdown, /square throughout the project.*historical-overridden/i);
});

test("PROJECT NOTES influence the contract while remaining explicit private provenance", async () => {
  const contract = await contractFor("Build an original premium site for Maison Bloom.", {
    projectNotes: "Client approved cream backgrounds and serif display headings."
  });
  assert.equal(contract.colors.background.value, "#f6f0e7");
  assert.equal(contract.colors.background.origin, "project-note");
  assert.match(contract.typography.display, /serif/i);
  assert(contract.doRules.some((rule) => /serif display headings/i.test(rule)));
  assert(contract.provenance.some((source) => source.private && source.role === "constraint"));
});

test("EXISTING DESIGN increments the contract and preserves explicit project rules", async () => {
  const workspace = {
    fileContents: {
      "DESIGN.md": "version: 3\nfingerprint: prior-design\n- Keep the navigation compact.\n- Avoid decorative gradients.\n",
      "styles.css": ":root { --brand: #143642; --canvas: #f1ede4; --surface: #fffaf2; --ink: #1c2528; --space: 1rem; } .card { border-radius: 3px; }"
    },
    fileList: ["DESIGN.md", "styles.css"]
  };
  const contract = await contractFor("Refine the current website and preserve its established visual system.", { workspace });
  assert.equal(contract.version, 4);
  assert.equal(contract.previousFingerprint, "prior-design");
  assert.equal(contract.geometry.cardRadius, "3px");
  assert.equal(contract.colors.accent.value, "#143642");
  assert.equal(contract.colors.background.value, "#f1ede4");
  assert(contract.doRules.some((rule) => /navigation compact/i.test(rule)));
});

test("CURRENT light-editorial revision overrides a prior dark background while keeping image-led direction", async () => {
  const prompt = "Change the current direction to light editorial while keeping the strong photography.";
  const workspace = {
    fileContents: {
      "DESIGN.md": "version: 1\nfingerprint: prior-dark\nuserBrand: Maison Bloom\n- Keep strong image-led photography.\n",
      "styles.css": ":root { --canvas: #0b0b0c; --brand: #d71920; }"
    },
    fileList: ["DESIGN.md", "styles.css"]
  };
  const contract = await contractFor(prompt, { workspace });
  assert.equal(buildIntentIntelligence({ prompt }).userIntent, "visual_theme_edit");
  assert.equal(contract.colors.background.origin, "current-request");
  assert.equal(contract.colors.background.value, "#f6f0e7");
  assert.equal(contract.identity.userBrand, "Maison Bloom");
  assert(contract.doRules.some((rule) => /strong image-led photography/i.test(rule)));
  assert.equal(contract.previousFingerprint, "prior-dark");
});

test("PORTABLE DESIGN.md is bounded, versioned, traceable, and explicitly non-authoritative", async () => {
  const contract = await contractFor("Build a site for Apex Motors like Ferrari.");
  const markdown = renderProjectDesignMd(contract);
  assert(markdown.length < 28_000);
  assert.match(markdown, /authority: untrusted-design-data-only/);
  assert.match(markdown, new RegExp(`fingerprint: ${contract.fingerprint}`));
  assert.match(markdown, /## Responsive & Accessibility/);
  assert.match(markdown, /Do not copy reference trademarks/i);
});

test("WEBSITE BUILDER consumes the same contract and emits DESIGN.md plus fingerprinted output", async () => {
  const prompt = "Build a premium automotive website for Apex Motors like Ferrari with pages home, about, services, contact.";
  const contract = await contractFor(prompt);
  const intent = buildIntentIntelligence({ prompt });
  const composition = buildCompositionStrategy(intent);
  const proposalContext: ProposalContext = {
    domain: intent.domain,
    entities: [],
    isNewBuild: true,
    isRefinement: false,
    mode: "WEBSITE",
    pages: ["home", "about", "services", "contact"],
    projectDesignContract: contract,
    projectType: "website",
    requiredFiles: ["index.html", "about.html", "services.html", "contact.html", "styles.css", "main.js", "HASSALI.md", "DESIGN.md"],
    sourcePrompt: prompt,
    validationRules: []
  };
  const generated = generatePlannedWebsiteFiles({ composition, intent, proposalContext });
  assert.match(generated.files["DESIGN.md"] ?? "", new RegExp(contract.fingerprint));
  assert.match(generated.files["styles.css"] ?? "", new RegExp(contract.fingerprint));
  assert.match(generated.files["styles.css"] ?? "", /#d71920/i);
  assert.match(generated.files["index.html"] ?? "", /Apex Motors/);
  assert.match(generated.files["HASSALI.md"] ?? "", /Brand\/App\/Site Name:\*\* Apex Motors/);
  assert.equal(generated.designQualityReview?.blocking, false);
});

test("QUALITY blocks fabricated proof and contract drift", async () => {
  const contract = await contractFor("Build an original premium website for Maison Bloom.");
  const review = reviewGeneratedWebsiteDesign({
    contract,
    files: {
      "index.html": "<h1>Maison Bloom</h1><p>Trusted by 10,000 customers</p>",
      "styles.css": `body { color: #111; background: #fff; } /* ${contract.fingerprint} */`
    }
  });
  assert.equal(review.blocking, true);
  assert(review.findings.some((finding) => finding.code === "FAKE_SOCIAL_PROOF"));
  assert(review.findings.some((finding) => finding.code === "CONTRACT_COLOR_DRIFT"));
});

test("MOTION and responsive claims distinguish missing evidence from designed behavior", async () => {
  const contract = await contractFor("Build a site for Apex Motors like Ferrari.");
  assert.notEqual(contract.motion.evidence, "observed");
  assert.notEqual(contract.responsive.evidence, "observed");
  assert.match(contract.accessibility.reducedMotion, /prefers-reduced-motion/i);
});
