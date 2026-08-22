import assert from "node:assert/strict";
import { inferSemanticDomain } from "@/lib/server/ai/industry-taxonomy";
import { buildWebsiteContentContract } from "@/lib/server/ai/website-content-contract";
import {
  buildWebsiteGrowthHandoff,
  createWebsiteGrowthSourceSnapshot,
  parseWebsiteGrowthSourceSnapshot,
  renderWebsiteGrowthSourceSnapshot,
  WebsiteGrowthHandoffError,
  type WebsiteGrowthSourceSnapshot
} from "@/lib/server/ai/website-growth-handoff";
import { getOwnedWebsiteGrowthHandoff } from "@/lib/server/ai/website-growth-handoff-store";

type TestCase = { name: string; run: () => Promise<void> | void };
const tests: TestCase[] = [];

function test(name: string, run: TestCase["run"]) {
  tests.push({ name, run });
}

function snapshotFor(prompt: string, overrides: Partial<WebsiteGrowthSourceSnapshot> = {}) {
  const contentContract = buildWebsiteContentContract({ prompt, semantic: inferSemanticDomain(prompt) });
  const snapshot = createWebsiteGrowthSourceSnapshot({ contentContract });
  return {
    ...snapshot,
    ...overrides,
    business: { ...snapshot.business, ...overrides.business },
    composition: { ...snapshot.composition, ...overrides.composition },
    design: { ...snapshot.design, ...overrides.design }
  };
}

function projectFiles(snapshot: WebsiteGrowthSourceSnapshot, options: {
  body?: string;
  extra?: Record<string, string>;
  target?: string;
} = {}) {
  const target = options.target ?? "contact.html";
  return {
    "HASSALI.website.md": [
      "# HASSALI.website.md",
      "mode: WEBSITE",
      `domainId: ${snapshot.composition.authoritativeDomain ?? snapshot.business.businessType}`,
      "",
      renderWebsiteGrowthSourceSnapshot(snapshot)
    ].join("\n"),
    "index.html": `<!doctype html><html><head><title>${snapshot.business.displayName ?? "Project"}</title><meta name="description" content="Project website"></head><body><main><h1>${snapshot.business.coreOffer}</h1>${options.body ?? `<a href="${target}">${snapshot.business.primaryCta.label}</a>`}</main></body></html>`,
    ...(target === "contact.html" ? {
      "contact.html": "<!doctype html><html><head><title>Contact</title><meta name=\"description\" content=\"Contact the business\"></head><body><h1>Contact</h1></body></html>"
    } : {}),
    "styles.css": "body { margin: 0; }",
    ...options.extra
  };
}

function build(snapshot: WebsiteGrowthSourceSnapshot, files = projectFiles(snapshot)) {
  return buildWebsiteGrowthHandoff({
    authoritativeState: "applied",
    files,
    generatedAt: new Date("2026-08-21T00:00:00.000Z"),
    projectId: "project-a",
    revision: "revision-a"
  });
}

test("source snapshot round-trips without model-specific prompt state", () => {
  const snapshot = snapshotFor("Build a premium paint business called Aurelia Paints for homeowners.");
  const parsed = parseWebsiteGrowthSourceSnapshot(renderWebsiteGrowthSourceSnapshot(snapshot));
  assert.deepEqual(parsed, snapshot);
  assert.ok(parsed?.facts.every((fact) => fact.evidence !== "Build a premium paint business called Aurelia Paints for homeowners."));
  assert.doesNotMatch(JSON.stringify(parsed), /provider|modelPrompt|apiKey/i);
});

test("paint, hotel, restaurant, and SaaS business truth remains domain-specific", () => {
  const cases = [
    ["Build a premium paint brand called Aurelia Paints for homeowners.", "paint"],
    ["Build a hotel website called Harbor House for travelers.", "hotel"],
    ["Build a restaurant website called Saffron Table for diners.", "restaurant"],
    ["Build a SaaS website called Flow Ledger for operations teams.", "software"]
  ] as const;
  for (const [prompt, expected] of cases) {
    const snapshot = snapshotFor(prompt, { composition: { authoritativeDomain: expected } as WebsiteGrowthSourceSnapshot["composition"] });
    const handoff = build(snapshot);
    assert.equal(handoff.business.domain.value, expected);
    assert.doesNotMatch(
      `${handoff.business.type.value} ${handoff.business.description.value}`.toLowerCase(),
      new RegExp(cases.filter(([, domain]) => domain !== expected).map(([, domain]) => domain).join("|"))
    );
  }
});

test("DESIGN.md reference names cannot replace paint business authority", () => {
  const snapshot = snapshotFor("Build a premium paint brand called Aurelia Paints for homeowners.", {
    composition: { authoritativeDomain: "paint", pageRoutes: ["index.html"], productOrServiceEntities: ["interior paint"] },
    design: { archetype: "commerce editorial", fingerprint: "design-1", personality: ["precise"], referenceNames: ["Shopify DESIGN.md"] }
  });
  const handoff = build(snapshot, projectFiles(snapshot, { extra: { "DESIGN.md": "# Shopify design language\nTypography and spacing reference only." } }));
  assert.equal(handoff.business.domain.value, "paint");
  assert.match(handoff.brand.designReference.value ?? "", /Shopify DESIGN\.md/);
  assert.doesNotMatch(`${handoff.business.type.value} ${handoff.offers.map((offer) => offer.name).join(" ")}`, /commerce platform|shopify business/i);
});

test("explicit user facts are confirmed while bounded contract values remain derived", () => {
  const snapshot = snapshotFor("Build a paint business called Aurelia Paints serving homeowners. We have 25 years experience.");
  const handoff = build(snapshot);
  assert.equal(handoff.business.name.status, "confirmed");
  assert.equal(handoff.business.description.status, "confirmed");
  assert.equal(handoff.audience.primary.status, "confirmed");
  assert.ok(handoff.claims.some((claim) => claim.status === "confirmed" && claim.reusableExternally));
  assert.equal(handoff.business.type.status, "derived");
});

test("unsupported objective website claims are not laundered into reusable Growth truth", () => {
  const snapshot = snapshotFor("Build a paint business called Aurelia Paints for homeowners.");
  const files = projectFiles(snapshot, { body: '<p>Trusted by 10,000 customers.</p><a href="contact.html">Request a quote</a>' });
  const handoff = build(snapshot, files);
  assert.ok(handoff.claims.some((claim) => claim.status === "unsupported" && !claim.reusableExternally));
  assert.equal(handoff.readiness.status, "needs_input");
});

test("structured offers retain identity without becoming confirmed inventory or price", () => {
  const snapshot = snapshotFor("Build a premium paint brand called Aurelia Paints for homeowners.");
  const handoff = build(snapshot);
  assert.ok(handoff.offers.length > 0);
  assert.ok(handoff.offers.every((offer) => offer.status === "derived"));
  assert.ok(handoff.offers.every((offer) => offer.price.status === "unknown" && offer.price.value === null));
});

test("imported sites receive preliminary inferred offers rather than fabricated confirmed products", () => {
  const files = {
    "index.html": '<!doctype html><html><head><title>Northstar Cleaning</title><meta name="description" content="Cleaning services"></head><body><section class="services"><h2>Deep cleaning</h2><p>A room-by-room cleaning service.</p><a href="contact.html">Book a clean</a></section></body></html>',
    "contact.html": '<!doctype html><html><head><title>Contact</title><meta name="description" content="Contact"></head><body><h1>Contact</h1></body></html>'
  };
  const handoff = buildWebsiteGrowthHandoff({ authoritativeState: "applied", files, projectId: "imported", revision: "r1" });
  assert.equal(handoff.offers[0]?.name, "Deep cleaning");
  assert.equal(handoff.offers[0]?.status, "inferred");
  assert.notEqual(handoff.readiness.status, "ready");
});

test("conversion map captures real destinations and flags dead CTAs", () => {
  const snapshot = snapshotFor("Build a hotel website called Harbor House for travelers.");
  const working = build(snapshot);
  assert.equal(working.conversion.primary?.destinationExists, true);
  const broken = build(snapshot, projectFiles(snapshot, { body: '<a href="#">Book now</a>', target: "#" }));
  assert.equal(broken.conversion.primary?.destinationExists, false);
  assert.match(broken.conversion.blockers[0] ?? "", /no valid destination/i);
});

test("an applied CTA edit changes conversion semantics", () => {
  const snapshot = snapshotFor("Build a hotel website called Harbor House for travelers.");
  const before = build(snapshot);
  const after = build(snapshot, projectFiles(snapshot, { body: '<a href="contact.html">Reserve a room</a>' }));
  assert.notEqual(before.conversion.primary?.label, after.conversion.primary?.label);
  assert.equal(after.conversion.primary?.label, "Reserve a room");
});

test("CSS-only edits do not rewrite business, offer, or conversion semantics", () => {
  const snapshot = snapshotFor("Build a restaurant website called Saffron Table for diners.");
  const beforeFiles = projectFiles(snapshot);
  const afterFiles = { ...beforeFiles, "styles.css": "body { margin: 0; color: #111; }" };
  const before = build(snapshot, beforeFiles);
  const after = build(snapshot, afterFiles);
  assert.deepEqual(before.business, after.business);
  assert.deepEqual(before.offers, after.offers);
  assert.deepEqual(before.conversion, after.conversion);
});

test("a newer applied explicit audience correction outranks the earlier derived audience", () => {
  const beforeSnapshot = snapshotFor("Build a premium paint brand called Aurelia Paints.");
  const afterSnapshot = {
    ...beforeSnapshot,
    business: { ...beforeSnapshot.business, audience: "interior designers" },
    facts: [
      ...beforeSnapshot.facts.filter((fact) => fact.field !== "primaryAudience"),
      { classification: "USER_SUPPLIED_FACT" as const, evidence: "explicit user instruction", field: "primaryAudience", value: "interior designers" }
    ]
  };
  const before = build(beforeSnapshot);
  const after = build(afterSnapshot);
  assert.notEqual(before.audience.primary.value, after.audience.primary.value);
  assert.equal(after.audience.primary.value, "interior designers");
  assert.equal(after.audience.primary.status, "confirmed");
  assert.throws(() => buildWebsiteGrowthHandoff({ authoritativeState: "rejected", files: projectFiles(afterSnapshot), projectId: "project-a", revision: "rejected" }));
});

test("pending, rejected, failed, and stale proposals cannot produce authoritative handoffs", () => {
  const snapshot = snapshotFor("Build a paint business called Aurelia Paints.");
  for (const authoritativeState of ["pending", "rejected", "failed", "stale"] as const) {
    assert.throws(
      () => buildWebsiteGrowthHandoff({ authoritativeState, files: projectFiles(snapshot), projectId: "project-a", revision: "r1" }),
      (error) => error instanceof WebsiteGrowthHandoffError && error.code === "NOT_AUTHORITATIVE"
    );
  }
});

test("only applied canonical state can add or remove an offer", () => {
  const snapshot = snapshotFor("Build a paint business called Aurelia Paints.");
  const nextSnapshot = { ...snapshot, offers: [...snapshot.offers, { detail: "Low-sheen finish", meta: "Interior", title: "Residential matte" }] };
  const before = build(snapshot);
  const after = build(nextSnapshot);
  assert.equal(after.offers.length, before.offers.length + 1);
  assert.throws(() => buildWebsiteGrowthHandoff({ authoritativeState: "rejected", files: projectFiles(nextSnapshot), projectId: "project-a", revision: "rejected" }));
});

test("approved user-upload assets remain project-relative and rejected or absolute assets stay absent", () => {
  const snapshot = snapshotFor("Build a paint business called Aurelia Paints.", {
    assets: [{ path: "public/assets/hero-paint.jpg", role: "hero_product", source: "user_upload", status: "ready" }]
  });
  const handoff = build(snapshot, projectFiles(snapshot, {
    extra: {
      "C:/Users/private/secret.png": "not approved",
      "public/assets/hero-paint.jpg": "binary-placeholder"
    }
  }));
  assert.deepEqual(handoff.assets.map((asset) => asset.path), ["public/assets/hero-paint.jpg"]);
  assert.equal(handoff.assets[0]?.source, "user_upload");
  assert.doesNotMatch(JSON.stringify(handoff), /C:\/Users|private\/secret/);
});

test("secrets, private notes, and unrelated memory are excluded", () => {
  const snapshot = snapshotFor("Build a paint business called Aurelia Paints.");
  const handoff = build(snapshot, projectFiles(snapshot, {
    extra: {
      ".env": "OPENAI_API_KEY=secret-value",
      ".hassali/private-notes.md": "customer@example.com private note",
      "MEMORY.md": "unrelated personal memory"
    }
  }));
  const serialized = JSON.stringify(handoff);
  assert.doesNotMatch(serialized, /secret-value|customer@example\.com|unrelated personal memory/);
  assert.equal(handoff.privacy.secretsIncluded, false);
  assert.equal(handoff.privacy.projectBound, true);
});

test("owned handoff accessor rejects missing or cross-project ownership", async () => {
  await assert.rejects(
    getOwnedWebsiteGrowthHandoff(
      { externalUserId: "owner-a", projectId: "project-b" },
      { listFiles: async () => null, loadRevision: async () => null }
    ),
    (error) => error instanceof WebsiteGrowthHandoffError && error.code === "OWNERSHIP_REQUIRED"
  );
});

test("owned handoff accessor binds output to the canonical project revision", async () => {
  const snapshot = snapshotFor("Build a paint business called Aurelia Paints.");
  const files = projectFiles(snapshot);
  const handoff = await getOwnedWebsiteGrowthHandoff(
    { externalUserId: "owner-a", projectId: "project-a" },
    {
      listFiles: async () => Object.entries(files).map(([path, content]) => ({ path, content })),
      loadRevision: async () => "canonical-revision-7"
    }
  );
  assert.equal(handoff.projectId, "project-a");
  assert.equal(handoff.revision, "canonical-revision-7");
  assert.equal(handoff.authoritativeState, "applied");
});

test("image-light websites can be Growth-ready without invented assets", () => {
  const snapshot = snapshotFor("Build a SaaS website called Flow Ledger for operations teams.", {
    composition: { authoritativeDomain: "software", pageRoutes: ["index.html", "contact.html"], productOrServiceEntities: ["workflow software"] }
  });
  const handoff = build(snapshot);
  assert.equal(handoff.assets.length, 0);
  assert.equal(handoff.readiness.status, "ready");
  assert.equal(handoff.readiness.analyticsReady, false);
  assert.ok(handoff.readiness.missingFields.includes("analytics"));
});

test("beautiful visual markup alone is insufficient for Growth readiness", () => {
  const handoff = buildWebsiteGrowthHandoff({
    authoritativeState: "applied",
    files: {
      "index.html": '<!doctype html><html><head><title>Beautiful</title><meta name="description" content="A beautiful site"></head><body><main><h1>Beautiful experiences</h1><p>Elegant and cinematic.</p></main></body></html>',
      "styles.css": ".hero { min-height: 100vh; }"
    },
    projectId: "visual-only",
    revision: "r1"
  });
  assert.equal(handoff.readiness.status, "blocked");
  assert.ok(handoff.readiness.missingFields.includes("offer"));
  assert.ok(handoff.readiness.missingFields.includes("conversion"));
});

test("multi-page topics remain page-specific instead of flattening into one blob", () => {
  const snapshot = snapshotFor("Build a hotel website called Harbor House for travelers.");
  const files = projectFiles(snapshot, {
    extra: {
      "rooms.html": '<!doctype html><html><head><title>Rooms</title><meta name="description" content="Rooms"></head><body><h1>Rooms and suites</h1><h2>Harbor suite</h2></body></html>',
      "faq.html": '<!doctype html><html><head><title>FAQ</title><meta name="description" content="FAQ"></head><body><h1>Guest questions</h1><h2>Arrival times</h2></body></html>'
    }
  });
  const handoff = build(snapshot, files);
  assert.ok(handoff.content.pageTopics.some((page) => page.page === "rooms.html" && page.topics.includes("Rooms and suites")));
  assert.ok(handoff.content.pageTopics.some((page) => page.page === "faq.html" && page.topics.includes("Guest questions")));
});

test("Run 5 handoff preserves business, design, asset, visual-repair, and applied-state boundaries", () => {
  const snapshot = snapshotFor("Build a premium paint brand called Aurelia Paints for homeowners. We have 25 years experience.", {
    assets: [{ path: "public/assets/paint-hero.jpg", role: "hero_product", source: "user_upload", status: "ready" }],
    composition: { authoritativeDomain: "paint", pageRoutes: ["index.html", "contact.html"], productOrServiceEntities: ["interior paint", "exterior paint"] },
    design: { archetype: "editorial commerce", fingerprint: "shopify-derived-geometry", personality: ["premium", "clear"], referenceNames: ["Shopify DESIGN.md"] }
  });
  const files = projectFiles(snapshot, {
    extra: {
      "public/assets/paint-hero.jpg": "binary-placeholder",
      "styles.css": "/* HASSALI_VISUAL_REPAIR:1 */ .hero { min-width: 0; }"
    }
  });
  const handoff = build(snapshot, files);
  assert.equal(handoff.business.domain.value, "paint");
  assert.equal(handoff.audience.primary.status, "confirmed");
  assert.match(handoff.brand.designReference.value ?? "", /Shopify/);
  assert.equal(handoff.assets[0]?.source, "user_upload");
  assert.ok(handoff.claims.some((claim) => claim.status === "confirmed"));
  assert.equal(handoff.authoritativeState, "applied");
  assert.equal(handoff.readiness.status, "ready");
  assert.doesNotMatch(JSON.stringify(handoff.business), /HASSALI_VISUAL_REPAIR/);
});

let passed = 0;
for (const testCase of tests) {
  try {
    await testCase.run();
    passed += 1;
    console.log(`PASS ${testCase.name}`);
  } catch (error) {
    console.error(`FAIL ${testCase.name}`);
    throw error;
  }
}
console.log(`WEBSITE Growth handoff smoke: ${passed}/${tests.length} passed`);
