import assert from "node:assert/strict";
import {
  AutoIntelligenceRouter,
  resetAutoIntelligenceRouterStateForTests
} from "@/lib/server/intelligence/auto-intelligence-router";
import { IntelligenceAdapterRegistry, type IntelligenceAdapter } from "@/lib/server/intelligence/intelligence-adapter-registry";
import {
  createCapabilityProfile,
  unknownIntelligenceUsage,
  type IntelligenceModelDescriptor,
  type IntelligenceRequest,
  type IntelligenceResult
} from "@/lib/server/intelligence/intelligence-contract";
import type { MemoryContextCapsule } from "@/lib/server/shared-memory/shared-memory";
import type {
  GrowthAssertion,
  GrowthTruthStatus,
  WebsiteGrowthHandoff
} from "@/lib/server/ai/website-growth-handoff";
import {
  assessOutboundSafety,
  buildGrowthContextPacket,
  calculateFunnelMath,
  createGrowthArtifact,
  createGrowthExperiment,
  createGrowthHandoff,
  createGrowthProject,
  createGrowthStrategy,
  createQualitativeSeoBrief,
  growthBusinessTruthFromWebsite,
  selectCanonicalWebsiteGrowthHandoff,
  selectGrowthChannels,
  understandGrowthRequest,
  validateGrowthCampaign,
  validateGrowthClaims
} from "../growth-intelligence";
import { projectGrowthStrategy } from "../growth-graph";
import { generateGrowthCampaign } from "../growth-orchestrator";
import type { GrowthCampaign, GrowthProject } from "../growth-types";

type TestCase = { name: string; run: () => Promise<void> | void };
const tests: TestCase[] = [];
const test = (name: string, run: TestCase["run"]) => tests.push({
  name,
  run: async () => {
    resetAutoIntelligenceRouterStateForTests();
    await run();
  }
});

function assertion<T>(value: T | null, status: GrowthTruthStatus = "confirmed", evidenceIds = ["evidence-1"]): GrowthAssertion<T> {
  return { confidence: value === null ? 0 : 1, evidenceIds, status, value };
}

function websiteHandoff(input: {
  audiences?: string[];
  claims?: WebsiteGrowthHandoff["claims"];
  projectId?: string;
  revision?: string;
  business?: string;
} = {}): WebsiteGrowthHandoff {
  const audiences = input.audiences ?? ["local homeowners"];
  return {
    assets: [],
    audience: {
      primary: assertion(audiences[0] ?? null),
      secondary: assertion(audiences.slice(1)),
      type: assertion(/planner|business|florist/i.test(audiences.join(" ")) ? "B2B" : "B2C", "derived")
    },
    authoritativeState: "applied",
    brand: { designReference: assertion("quiet premium", "derived"), voice: assertion(["clear", "warm"], "derived") },
    business: {
      description: assertion("Reliable HVAC installation and repair service"),
      domain: assertion("hvac", "derived"),
      location: assertion("Lahore"),
      name: assertion(input.business ?? "Northstar HVAC"),
      type: assertion("local service business", "derived")
    },
    claims: input.claims ?? [],
    content: { pageTopics: [], reusableCopy: [] },
    conversion: {
      blockers: [],
      paths: [{ destinationExists: true, evidenceIds: ["evidence-1"], id: "contact", label: "Request a Quote", page: "index.html", target: "contact.html", type: "inquiry" }],
      primary: { destinationExists: true, evidenceIds: ["evidence-1"], id: "contact", label: "Request a Quote", page: "index.html", target: "contact.html", type: "inquiry" },
      secondary: []
    },
    evidence: [{ id: "evidence-1", kind: "structured_contract", location: "HASSALI.website.md", summary: "Applied business contract" }],
    generatedAt: "2026-08-22T00:00:00.000Z",
    offers: [{
      assetPaths: [], category: "HVAC", cta: { label: "Request a Quote", target: "contact.html" }, description: "HVAC service", evidenceIds: ["evidence-1"], features: [], id: "offer-service", name: "HVAC service", page: "index.html", price: assertion<string>(null, "unknown", []), status: "confirmed", type: "service"
    }],
    positioning: {
      brandPromise: assertion("Straightforward service", "derived"),
      differentiators: assertion(["clear scheduling"], "derived"),
      valueProposition: assertion("Reliable HVAC help with clear scheduling")
    },
    privacy: { excludedCategories: ["secrets", "unrelated memory"], projectBound: true, secretsIncluded: false },
    projectId: input.projectId ?? "website-a",
    readiness: { analyticsReady: false, blockers: [], channelReady: true, checks: [], contentReady: true, missingFields: [], recommendedInformation: [], status: "ready" },
    revision: input.revision ?? "website-r2",
    version: 1
  };
}

function project(input: Parameters<typeof websiteHandoff>[0] = {}, projectId = "growth-a") {
  return createGrowthProject({ businessTruth: growthBusinessTruthFromWebsite(websiteHandoff(input)), createdAt: new Date("2026-08-22T00:00:00.000Z"), ownerId: "owner-a", projectId });
}

function campaign(base: GrowthProject): GrowthCampaign {
  return createGrowthStrategy(base, understandGrowthRequest({ audiences: base.businessTruth.audiences, prompt: "Create a lead generation campaign" })).campaign;
}

function model(providerId: string): IntelligenceModelDescriptor {
  return {
    availability: "available",
    capabilities: createCapabilityProfile({ reasoning: "supported", structuredOutput: "supported", text: "supported" }),
    computeSource: "free-cloud",
    contextLimit: 32_000,
    displayName: `${providerId} growth model`,
    inputModalities: ["text"],
    isLocal: false,
    modelId: `${providerId}/growth`,
    outputModalities: ["text"],
    pricing: { currency: null, inputPerMillion: null, outputPerMillion: null, source: "unknown" },
    providerId
  };
}

function adapter(input: { id: string; response: string; capture?: (request: IntelligenceRequest) => void }): IntelligenceAdapter {
  const descriptor = model(input.id);
  return {
    capabilities: descriptor.capabilities,
    computeSource: "free-cloud",
    defaultModelId: descriptor.modelId,
    health: async () => ({ checkedAt: new Date().toISOString(), latencyMs: 1, providerId: input.id, reason: null, retryable: false, status: "ready" }),
    id: input.id,
    invoke: async (request): Promise<IntelligenceResult> => {
      input.capture?.(request);
      return {
        ok: true,
        response: {
          citations: [], computeSource: "free-cloud", content: input.response ? [{ text: input.response, type: "text" }] : [], finishReason: "stop",
          model: descriptor.modelId, providerId: input.id, toolCalls: [], usage: unknownIntelligenceUsage({ latencyMs: 1, model: descriptor.modelId, providerId: input.id })
        }
      };
    },
    models: async () => [descriptor],
    providerId: input.id
  };
}

test("A canonical applied WEBSITE handoff is selected and rejected or stale revisions are excluded", () => {
  const current = websiteHandoff({ projectId: "website-a", revision: "r2" });
  const selected = selectCanonicalWebsiteGrowthHandoff({
    candidates: [
      { handoff: websiteHandoff({ projectId: "website-a", revision: "r3" }), state: "rejected" },
      { handoff: websiteHandoff({ projectId: "website-a", revision: "r1" }), state: "stale" },
      { handoff: current, state: "applied" }
    ],
    currentRevision: "r2",
    websiteProjectId: "website-a"
  });
  assert.equal(selected, current);
  const truth = growthBusinessTruthFromWebsite(selected!);
  assert.equal(truth.business.name.value, "Northstar HVAC");
  assert.equal(truth.claims.length, 0);
});

test("B wholesale floral business preserves all audiences while targeting one campaign segment", () => {
  const flower = project({ audiences: ["florists", "event planners", "wedding planners", "business buyers"], business: "Dahlia Wholesale" }, "growth-floral");
  const request = understandGrowthRequest({ audiences: flower.businessTruth.audiences, prompt: "Create a business-focused Dahlia campaign for event planners." });
  const strategy = createGrowthStrategy(flower, request);
  assert.equal(strategy.businessAudienceIds.length, 4);
  assert.equal(strategy.campaign.audienceId, flower.businessTruth.audiences.find((item) => item.segment === "event planners")?.id);
  assert(!flower.businessTruth.audiences.some((item) => /brides/i.test(item.segment)));
});

test("C unsupported ranking and customer-count claims require evidence", () => {
  const result = validateGrowthClaims(["America's #1 flower supplier trusted by 20,000 planners."], []);
  assert.equal(result[0]?.status, "needs_evidence");
  const base = project();
  const draft = { ...campaign(base), claims: [result[0]!.text] };
  assert.equal(validateGrowthCampaign(base, draft).status, "needs_evidence");
});

test("D confirmed shipping claim is permitted with provenance", () => {
  const claim = { evidenceIds: ["shipping-policy"], id: "claim-shipping", reusableExternally: true, status: "confirmed" as const, text: "Free shipping on orders over $500" };
  const result = validateGrowthClaims(["Free shipping on orders over $500"], [claim]);
  assert.equal(result[0]?.status, "permitted");
  assert.deepEqual(result[0]?.evidenceIds, ["shipping-policy"]);
});

test("E limited-budget local service selects a bounded realistic channel set", () => {
  const base = project();
  const request = understandGrowthRequest({ prompt: "Create a customer acquisition plan with a $500 monthly budget." });
  const channels = selectGrowthChannels(base, request);
  assert(channels.length <= 2);
  assert.deepEqual(channels.map((item) => item.channel), ["website", "seo"]);
  assert.doesNotMatch(JSON.stringify(channels), /ROI|\d+%/i);
});

test("F email campaign is aligned and prepared without sending", () => {
  const base = project();
  const request = understandGrowthRequest({ audiences: base.businessTruth.audiences, prompt: "Prepare an email lead generation campaign." });
  const strategy = createGrowthStrategy(base, request);
  assert.equal(strategy.campaign.artifact, "email_sequence");
  assert.equal(strategy.campaign.channel, "email");
  assert(strategy.campaign.audienceId);
  assert(strategy.campaign.message);
  assert(strategy.campaign.cta.label);
  assert(strategy.campaign.measurement.length > 0);
  assert.equal(validateGrowthCampaign(base, strategy.campaign).status, "validated");
  assert.doesNotMatch(JSON.stringify(strategy), /"sent"|"published"|"launched"/i);
});

test("G SEO planning remains qualitative without fabricated tool metrics", () => {
  const brief = createQualitativeSeoBrief(project(), ["HVAC repair near me", "how to maintain an air conditioner"]);
  assert.equal(brief.dataAvailability, "qualitative_only");
  assert.equal(brief.fabricatedMetrics, false);
  assert.deepEqual(brief.unavailableMetrics, ["search volume", "CPC", "keyword difficulty", "current ranking"]);
  assert.doesNotMatch(JSON.stringify(brief.intents), /volume|difficulty|cpc/i);
});

test("H mass automated outbound is redirected to safe relevant manual planning", () => {
  const safety = assessOutboundSafety("Email 100,000 random businesses automatically.");
  assert.equal(safety.status, "redirected");
  assert(safety.blockedActions.includes("bulk_send"));
  assert(safety.blockedActions.includes("contact_scraping"));
  assert.match(safety.safePlan, /small, relevant ICP list|manually reviewed/i);
});

test("I invented testimonial is rejected without genuine evidence", () => {
  const result = validateGrowthClaims(['“They doubled our revenue overnight.” — Sarah Customer'], []);
  assert.equal(result[0]?.status, "needs_evidence");
});

test("J high-intent service CTA fits and obvious CTA destination mismatch blocks", () => {
  const base = project();
  const valid = campaign(base);
  assert.equal(valid.cta.label, "Request a Quote");
  assert.equal(validateGrowthCampaign(base, valid).status, "validated");
  const invalid = { ...valid, cta: { destination: "blog/guide", label: "Request a Quote" } };
  assert(validateGrowthCampaign(base, invalid).issues.some((issue) => issue.code === "CTA_DESTINATION_MISMATCH"));
});

test("K experiment contract contains measurable learning and no fabricated result", () => {
  const experiment = createGrowthExperiment({
    assumptions: ["Current headline is not audience-specific."],
    change: "Replace the general hero with a B2B value proposition.",
    control: "Current general headline.",
    duration: "two weeks or until sufficient traffic",
    hypothesis: "Clarifying the B2B value proposition will increase quote requests.",
    metric: "quote-request conversion",
    successCriterion: "A pre-agreed improvement over the current measured baseline.",
    targetAudience: "event planners"
  });
  assert.equal(experiment.result, "not_started");
  assert(experiment.hypothesis && experiment.change && experiment.metric && experiment.successCriterion && experiment.assumptions.length);
});

test("L funnel math is deterministic and does not invent missing inputs", () => {
  const result = calculateFunnelMath({ customers: 10, leads: 50, visitors: 1_000 });
  assert.equal(result.leadConversionRate, 0.05);
  assert.equal(result.customerFromLeadRate, 0.2);
  assert.equal(result.customerFromVisitorRate, 0.01);
  assert.throws(() => calculateFunnelMath({ customers: 10, leads: 5, visitors: 1_000 }));
});

test("M Growth memory is project-scoped and only matching capsule context is included", () => {
  const base = project({}, "growth-hvac");
  const memory = {
    diagnostics: { excludedCount: 0, includedCount: 1, requestedLayers: ["project"], sourceScopes: ["growth-hvac"], totalCharacters: 28 },
    policy: { mode: "GROWTH" },
    providerContext: "Positioning: clear scheduling",
    sections: { conversations: [], people: [], project: [], user: [] }
  } as unknown as MemoryContextCapsule;
  const request = understandGrowthRequest({ prompt: "Create a campaign using current positioning." });
  assert.match(buildGrowthContextPacket({ memoryCapsule: memory, memoryProjectId: "growth-hvac", project: base, request }).content, /clear scheduling/);
  assert.doesNotMatch(buildGrowthContextPacket({ memoryCapsule: memory, memoryProjectId: "growth-hotel", project: base, request }).content, /Relevant project memory/);
});

test("N Graph projects objective audience offer campaign channel artifact and claim evidence", () => {
  const supported = { evidenceIds: ["evidence-1"], id: "claim-1", reusableExternally: true, status: "confirmed" as const, text: "Clear scheduling" };
  const base = project({ claims: [supported] });
  const strategy = createGrowthStrategy(base, understandGrowthRequest({ prompt: "Create a campaign" }));
  strategy.campaign.claims = [supported.text];
  const projection = projectGrowthStrategy({ artifactId: "artifact-1", project: base, strategy });
  const snapshot = projection.graph.snapshot({ includePrivate: true });
  assert(snapshot.nodes.some((node) => node.kind === "objective"));
  assert(snapshot.nodes.some((node) => node.kind === "artifact" && node.mode === "GROWTH"));
  assert(snapshot.edges.some((edge) => edge.kind === "TARGETS"));
  assert(snapshot.edges.some((edge) => edge.kind === "PROMOTES"));
  assert(snapshot.edges.some((edge) => edge.kind === "USES"));
  assert(snapshot.edges.some((edge) => edge.kind === "SUPPORTED_BY"));
  assert.equal(projection.graph.validate().valid, true);
});

test("O Growth to WEBSITE creates a typed recommendation without mutation authority", () => {
  const handoff = createGrowthHandoff({ kind: "website", cta: "Request a Quote", projectId: "website-a", recommendation: "Clarify the hero CTA", targetPage: "index.html" });
  assert.equal(handoff.kind, "website_recommendation");
  if (handoff.kind === "website_recommendation") {
    assert.equal(handoff.mutatesWebsite, false);
    assert.equal(handoff.approvalRequired, true);
  }
});

test("P Growth to CODE creates a recommendation and preserves Run 7 authority", () => {
  const handoff = createGrowthHandoff({ acceptanceCriteria: ["Emit signup_completed only after verified signup"], kind: "code", projectId: "code-a", requirement: "Add a signup completion analytics event" });
  assert.equal(handoff.kind, "code_recommendation");
  if (handoff.kind === "code_recommendation") {
    assert.equal(handoff.mutatesCode, false);
    assert.equal(handoff.approvalRequired, true);
  }
});

test("Q Growth to LIVE remains an unexecuted future handoff", () => {
  const draft = campaign(project());
  const handoff = createGrowthHandoff({ campaign: draft, kind: "live", limits: ["manual approval", "no bulk send"] });
  assert.equal(handoff.kind, "live_execution_handoff");
  if (handoff.kind === "live_execution_handoff") {
    assert.equal(handoff.executionStatus, "not_executed");
    assert.equal(handoff.approvalRequired, true);
  }
});

test("R project isolation excludes another business audience offer and memory", () => {
  const hvac = project({ business: "Northstar HVAC", audiences: ["homeowners"] }, "growth-hvac");
  const hotel = project({ business: "Harbor Hotel", audiences: ["travelers"] }, "growth-hotel");
  const packet = buildGrowthContextPacket({ project: hvac, request: understandGrowthRequest({ prompt: "Create a local service campaign" }) });
  assert.match(packet.content, /Northstar HVAC|homeowners/);
  assert.doesNotMatch(packet.content, /Harbor Hotel|travelers/);
  assert.notEqual(hvac.projectId, hotel.projectId);
});

test("S Growth artifact retains Growth ownership and Run 8 integrity metadata", () => {
  const base = project();
  const draft = campaign(base);
  const validation = validateGrowthCampaign(base, draft);
  const artifact = createGrowthArtifact({ campaign: draft, content: "# Campaign\n\nPrepared campaign brief.", validation });
  assert.equal(artifact.result.mode, "GROWTH");
  assert.equal(artifact.result.status, "valid");
  assert.equal(artifact.result.primaryArtifact?.integrity?.algorithm, "sha256");
  assert.notEqual(artifact.result.mode, "ASK");
});

test("T Run 6 fallback preserves Growth context and reruns deterministic validation", async () => {
  const seen: IntelligenceRequest[] = [];
  const registry = new IntelligenceAdapterRegistry();
  registry.register(adapter({ id: "a-primary", response: "", capture: (request) => seen.push(request) }));
  registry.register(adapter({ id: "b-fallback", response: JSON.stringify({ claims: [], message: "Reliable HVAC help with clear scheduling.", cta: { destination: "contact.html", label: "Request a Quote" } }), capture: (request) => seen.push(request) }));
  const result = await generateGrowthCampaign({
    project: project(),
    request: understandGrowthRequest({ prompt: "Prepare a customer acquisition campaign" }),
    router: new AutoIntelligenceRouter(registry),
    routing: { privacy: "allow-cloud", scopeId: "growth-fallback" }
  });
  assert.equal(result.attempts, 2);
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.validation?.status, "validated");
  assert(seen.every((request) => request.mode === "GROWTH"));
  assert(seen.every((request) => JSON.stringify(request).includes("Northstar HVAC")));
});

test("U prepared artifact never claims sent published or launched execution", () => {
  const base = project();
  const draft = campaign(base);
  const artifact = createGrowthArtifact({ campaign: draft, content: "Campaign prepared and validated for approval.", validation: validateGrowthCampaign(base, draft) });
  assert.match(artifact.content, /prepared and validated/i);
  assert.doesNotMatch(`${artifact.content} ${JSON.stringify(artifact.result)}`, /\b(?:sent|published|launched)\b/i);
});

let passed = 0;
for (const entry of tests) {
  await entry.run();
  passed += 1;
  process.stdout.write(`PASS ${entry.name}\n`);
}
process.stdout.write(`\n${passed}/${tests.length} Growth intelligence checks passed.\n`);
