import assert from "node:assert/strict";
import { inferSemanticDomain } from "@/lib/server/ai/industry-taxonomy";
import {
  buildWebsiteContentContract,
  type WebsiteContentContract
} from "@/lib/server/ai/website-content-contract";
import {
  validateWebsiteVisitorCopy
} from "@/lib/server/ai/website-copy-validator";
import type {
  WebsitePageBlueprint
} from "@/lib/server/ai/website-quality-blueprint";
import {
  verifyWebsitePreviewFidelity
} from "@/lib/website-preview-fidelity";

type TestCase = { name: string; run: () => void };
const tests: TestCase[] = [];

function test(name: string, run: TestCase["run"]) {
  tests.push({ name, run });
}

function contractFor(prompt: string) {
  return buildWebsiteContentContract({
    prompt,
    semantic: inferSemanticDomain(prompt)
  });
}

function pageFor(
  contract: WebsiteContentContract,
  overrides: Partial<WebsitePageBlueprint> = {}
): WebsitePageBlueprint {
  return {
    description: contract.hero.supportingCopy,
    name: "home",
    path: "index.html",
    sections: [
      {
        body: contract.offerMechanism,
        eyebrow: contract.businessType,
        id: "home-offer",
        items: contract.offerItems,
        kind: "entities",
        title: contract.coreOffer
      },
      {
        body: "Current details are confirmed directly before a decision.",
        eyebrow: "What to expect",
        id: "home-trust",
        items: contract.trustStrategy.map((item, index) => ({
          detail: item,
          title: `Detail ${index + 1}`
        })),
        kind: "trust",
        title: "Practical details"
      }
    ],
    structuredDataType: "Organization",
    title: `${contract.businessIdentity.publicLabel} | ${contract.hero.headline}`,
    visitorCopy: {
      body: contract.hero.supportingCopy,
      eyebrow: contract.businessType,
      heading: contract.hero.headline,
      primaryCta: contract.primaryCta.label,
      primaryTarget: contract.primaryCta.target,
      secondaryCta: contract.secondaryCta?.label,
      secondaryTarget: contract.secondaryCta?.target
    },
    ...overrides
  };
}

function pagesFor(contract: WebsiteContentContract) {
  const home = pageFor(contract);
  const target = contract.primaryCta.target;
  if (target === "index.html" || target.startsWith("#")) return [home];
  return [
    home,
    pageFor(contract, {
      name: target.replace(/\.html$/, ""),
      path: target,
      title: `${target.replace(/\.html$/, "")} | ${contract.businessIdentity.publicLabel}`
    })
  ];
}

test("A florist copy identifies wedding flowers, event planners, and a truthful action", () => {
  const contract = contractFor("Create a website for an online wedding-flower supplier serving event planners.");
  assert.match(contract.businessType, /wedding flower/i);
  assert.match(contract.primaryAudience, /event planners/i);
  assert.match(contract.coreOffer, /wedding flowers|event arrangements/i);
  assert.match(contract.primaryCta.label, /event flowers|wedding flowers/i);
  assert.equal(contract.trustInputs.length, 0);
  assert.doesNotMatch(`${contract.hero.headline} ${contract.hero.supportingCopy} ${JSON.stringify(contract.offerItems)}`, /testimonial|guaranteed delivery/i);
});

test("B artist portfolio centers original artwork without invented identity or proof", () => {
  const contract = contractFor("Create a portfolio for a New York-based artist selling original artwork.");
  assert.equal(contract.businessIdentity.displayName, null);
  assert.match(contract.businessType, /artist portfolio/i);
  assert.match(contract.coreOffer, /original artwork/i);
  assert.match(contract.primaryAudience, /collectors/i);
  assert.equal(contract.locationScope, "New York");
  assert.doesNotMatch(`${contract.hero.headline} ${contract.hero.supportingCopy} ${JSON.stringify(contract.offerItems)}`, /saas|skincare|award|exhibition|sales total/i);
});

test("C Korean beauty copy stays ecommerce-oriented without ingredient or clinical claims", () => {
  const contract = contractFor("Create an ecommerce site for a Korean beauty brand.");
  assert.match(contract.businessType, /Korean beauty/i);
  assert.equal(contract.commerceBehavior, "catalog_browse");
  assert.equal(contract.primaryCta.label, "Browse the collection");
  assert.match(contract.coreOffer, /beauty|skincare/i);
  assert.doesNotMatch(JSON.stringify(contract.offerItems), /hyaluronic|retinol|clinically proven|dermatologist/i);
});

test("C2 bakery copy keeps pastries in-domain and avoids forbidden generic fallback copy", () => {
  const contract = contractFor("Create a simple responsive website for a neighborhood bakery with home, about, and contact pages.");
  const publicCopy = `${contract.hero.headline} ${contract.hero.supportingCopy} ${contract.offerMechanism} ${JSON.stringify(contract.offerItems)}`;

  assert.match(contract.businessType, /bakery/i);
  assert.match(publicCopy, /bread|cakes|pastries/i);
  assert.doesNotMatch(publicCopy, /practical details|customer use cases/i);
});

test("D SaaS copy explains the lead follow-up workflow and target user", () => {
  const contract = contractFor("Create a website for software that helps small service businesses follow up with leads.");
  assert.match(contract.businessType, /lead follow-up software/i);
  assert.match(contract.primaryAudience, /small service businesses/i);
  assert.match(contract.primaryOutcome, /missed follow-up/i);
  assert.match(contract.hero.headline, /lead follow-up/i);
  assert.doesNotMatch(`${contract.hero.headline} ${contract.hero.supportingCopy} ${JSON.stringify(contract.offerItems)}`, /luxury|award|trusted by \d/i);
});

test("E missing business name uses a neutral descriptive identity", () => {
  const contract = contractFor("Create a website for a local photographer.");
  assert.equal(contract.businessIdentity.displayName, null);
  assert.equal(contract.businessIdentity.provenance, "MISSING");
  assert.doesNotMatch(contract.businessIdentity.publicLabel, /\[Business Name\]|Nova|Morrow|Studio$/i);
});

test("supplied current-prompt business name is preserved without stale inference", () => {
  const prompt = "Create a website for Elite Upholstery Studio with home, services, and contact pages.";
  const contract = buildWebsiteContentContract({
    intentBrandName: "Elite Upholstery Studio",
    prompt,
    semantic: inferSemanticDomain(prompt)
  });
  assert.equal(contract.businessIdentity.displayName, "Elite Upholstery Studio");
  assert.equal(contract.businessIdentity.provenance, "USER_SUPPLIED");
});

test("F missing testimonials produces process trust instead of fabricated social proof", () => {
  const contract = contractFor("Create a website for a new consulting business.");
  assert.equal(contract.trustInputs.length, 0);
  assert.equal(contract.trustStrategy.length, 3);
  assert.doesNotMatch(`${contract.hero.headline} ${contract.hero.supportingCopy} ${JSON.stringify(contract.offerItems)}`, /Sarah M|five-star|trusted by/i);
});

test("G minimal prompt still produces a category-bearing hero without placeholders", () => {
  const contract = contractFor("Create a website for an independent repair service.");
  assert.ok(contract.hero.headline.split(/\s+/).length >= 4);
  assert.match(`${contract.hero.headline} ${contract.hero.supportingCopy}`, /repair|service/i);
  assert.doesNotMatch(JSON.stringify(contract), /Elevate your experience|Transform your business|Current Prompt Website|lorem ipsum/i);
});

test("H current painter prompt excludes stale Korean beauty context", () => {
  const previousPrompt = "Create an ecommerce site for a Korean beauty brand.";
  assert.match(contractFor(previousPrompt).businessType, /beauty/i);
  const current = contractFor("Now create a portfolio for a painter selling original artwork.");
  assert.match(current.businessType, /artist portfolio/i);
  assert.doesNotMatch(`${current.hero.headline} ${current.hero.supportingCopy} ${JSON.stringify(current.offerItems)}`, /Korean|beauty|skincare|ingredient|ecommerce/i);
});

test("I explicit artist continuity remains semantically artist-focused", () => {
  const contract = contractFor("Keep the same artist and replace the hero with a stronger collector-focused version.");
  assert.match(contract.businessType, /artist portfolio/i);
  assert.match(contract.primaryAudience, /collectors/i);
  assert.match(contract.hero.headline, /artwork|collections/i);
});

test("J unsupported proof and testimonials are blocking findings", () => {
  const contract = contractFor("Create a website for a new consulting business.");
  const page = pageFor(contract);
  page.sections.push({
    body: 'What our clients say: "This changed everything." - Sarah M.',
    eyebrow: "Proof",
    id: "testimonials",
    items: [{ detail: "Trusted by 500+ companies with a 5-star rating.", title: "Results" }],
    kind: "trust",
    title: "Testimonials"
  });
  const result = validateWebsiteVisitorCopy({ contract, pages: [page] });
  assert.equal(result.blocked, true);
  assert.ok(result.findings.some((finding) => finding.code === "UNSUPPORTED_TESTIMONIAL"));
  assert.ok(result.findings.some((finding) => finding.code === "UNSUPPORTED_CLAIM"));
});

test("K unsupported CTA route and transactional static action are blocked", () => {
  const contract = contractFor("Create a website for a new consulting business.");
  contract.primaryCta = { label: "Book now", target: "booking.html" };
  const result = validateWebsiteVisitorCopy({ contract, pages: [pageFor(contract)] });
  assert.equal(result.blocked, true);
  assert.ok(result.findings.some((finding) => finding.code === "CTA_UNSUPPORTED"));

  contract.primaryCta = { label: "Book now", target: "index.html" };
  const staticActionResult = validateWebsiteVisitorCopy({ contract, pages: [pageFor(contract)] });
  assert.equal(staticActionResult.blocked, true);
  assert.ok(staticActionResult.findings.some((finding) =>
    finding.code === "CTA_UNSUPPORTED" &&
    finding.message.includes("static website")
  ));
});

test("generic and internal visitor language is rejected", () => {
  const contract = contractFor("Create a website for a new consulting business.");
  const page = pageFor(contract);
  page.visitorCopy.heading = "Elevate your experience";
  page.visitorCopy.body = "Discover our premium cinematic interface.";
  const result = validateWebsiteVisitorCopy({ contract, pages: pagesFor(contract).map((item, index) => index === 0 ? page : item) });
  assert.equal(result.blocked, true);
  assert.ok(result.findings.some((finding) => finding.code === "COPY_GENERIC_HERO"));
  assert.ok(result.findings.some((finding) => finding.code === "COPY_INTERNAL_LANGUAGE"));
});

const verifiedFiles = {
  "assets/hero.svg": "<svg></svg>",
  "index.html": '<!doctype html><html><head><meta name="hassali-preview-identity" content="website-artist-a"><link rel="stylesheet" href="./styles.css"></head><body data-hassali-preview-identity="website-artist-a"><img src="./assets/hero.svg"><script src="./main.js"></script></body></html>',
  "main.js": "document.body.dataset.ready = 'true';",
  "styles.css": "body { color: #111; }"
};

test("L stale preview content fails closed with PREVIEW_CONTENT_MISMATCH", () => {
  const result = verifyWebsitePreviewFidelity({
    entryRoute: "index.html",
    expectedAssetPaths: Object.keys(verifiedFiles),
    expectedIdentity: "website-beauty-b",
    files: verifiedFiles,
    filesApplied: true,
    workspaceMatches: true
  });
  assert.equal(result.filesApplied, true);
  assert.equal(result.previewReady, false);
  assert.equal(result.previewContentVerified, false);
  assert.equal(result.failureClass, "PREVIEW_CONTENT_MISMATCH");
});

test("M matching static srcDoc content, route, workspace, and assets verifies", () => {
  const result = verifyWebsitePreviewFidelity({
    entryRoute: "index.html",
    expectedAssetPaths: Object.keys(verifiedFiles),
    expectedIdentity: "website-artist-a",
    files: verifiedFiles,
    filesApplied: true,
    workspaceMatches: true
  });
  assert.equal(result.previewReady, true);
  assert.equal(result.generatedWorkspaceVerified, true);
  assert.equal(result.generatedRouteVerified, true);
  assert.equal(result.assetPathsVerified, true);
  assert.equal(result.previewContentVerified, true);
  assert.equal(result.failureClass, "NONE");
  assert.equal(result.httpReadiness, "NOT_APPLICABLE_SRC_DOC");
});

test("missing local preview asset fails closed", () => {
  const files = { ...verifiedFiles };
  delete (files as Partial<typeof verifiedFiles>)["assets/hero.svg"];
  const result = verifyWebsitePreviewFidelity({
    entryRoute: "index.html",
    expectedAssetPaths: Object.keys(verifiedFiles),
    expectedIdentity: "website-artist-a",
    files,
    filesApplied: true,
    workspaceMatches: true
  });
  assert.equal(result.previewReady, false);
  assert.equal(result.failureClass, "MISSING_ASSET");
});

let passed = 0;
for (const item of tests) {
  item.run();
  passed += 1;
  console.log(`PASS ${item.name}`);
}
console.log(`WEBSITE copy/preview smoke: ${passed}/${tests.length} passed`);
