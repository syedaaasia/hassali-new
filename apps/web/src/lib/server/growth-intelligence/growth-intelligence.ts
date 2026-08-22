import { createHash } from "node:crypto";
import type { WebsiteGrowthClaim, WebsiteGrowthHandoff } from "@/lib/server/ai/website-growth-handoff";
import type { MemoryContextCapsule } from "@/lib/server/shared-memory/shared-memory";
import type { RichExperienceResult } from "@/lib/server/rich-experience";
import type {
  GrowthArtifactKind,
  GrowthAudience,
  GrowthBusinessTruth,
  GrowthCampaign,
  GrowthChannel,
  GrowthExperiment,
  GrowthHandoff,
  GrowthObjective,
  GrowthProject,
  GrowthRequest,
  GrowthStrategy,
  GrowthValidation,
  GrowthValidationIssue,
  GrowthWebsiteSourceCandidate
} from "./growth-types";

const maximumChannels = 3;
const maximumContextCharacters = 4_000;

function clean(value: string, limit = 400) {
  return value.replace(/\s+/g, " ").trim().slice(0, limit);
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "item";
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

export function selectCanonicalWebsiteGrowthHandoff(input: {
  candidates: GrowthWebsiteSourceCandidate[];
  currentRevision: string;
  websiteProjectId: string;
}) {
  return input.candidates.find((candidate) =>
    candidate.state === "applied" &&
    candidate.handoff.authoritativeState === "applied" &&
    candidate.handoff.projectId === input.websiteProjectId &&
    candidate.handoff.revision === input.currentRevision
  )?.handoff ?? null;
}

function audience(input: { segment: string; status: GrowthAudience["status"]; index: number }): GrowthAudience {
  return {
    buyingTriggers: [],
    decisionCriteria: [],
    geography: null,
    id: `audience-${slug(input.segment)}-${input.index + 1}`,
    needs: [],
    objections: [],
    organizationType: null,
    segment: clean(input.segment, 160),
    status: input.status
  };
}

export function growthBusinessTruthFromWebsite(handoff: WebsiteGrowthHandoff): GrowthBusinessTruth {
  const audienceValues = unique([
    ...(handoff.audience.primary.value ? [handoff.audience.primary.value] : []),
    ...(handoff.audience.secondary.value ?? [])
  ].flatMap((value) => value.split(/[,;]|\band\b/i).map((entry) => clean(entry, 160)).filter(Boolean)));
  return {
    audiences: audienceValues.map((segment, index) => audience({
      index,
      segment,
      status: index === 0 ? handoff.audience.primary.status : handoff.audience.secondary.status
    })),
    brandVoice: handoff.brand.voice.value ?? [],
    business: {
      category: handoff.business.type,
      description: handoff.business.description,
      geography: handoff.business.location,
      name: handoff.business.name
    },
    claims: handoff.claims,
    constraints: [...handoff.privacy.excludedCategories],
    evidence: handoff.evidence,
    offers: handoff.offers,
    positioning: {
      differentiators: handoff.positioning.differentiators,
      valueProposition: handoff.positioning.valueProposition
    },
    sourceWebsite: { projectId: handoff.projectId, revision: handoff.revision }
  };
}

export function createGrowthProject(input: {
  businessTruth: GrowthBusinessTruth;
  createdAt?: Date;
  ownerId: string;
  projectId: string;
}): GrowthProject {
  const sufficient = Boolean(
    input.businessTruth.business.name.value || input.businessTruth.business.category.value
  ) && input.businessTruth.audiences.length > 0 && input.businessTruth.offers.length > 0;
  return {
    businessTruth: input.businessTruth,
    createdAt: (input.createdAt ?? new Date()).toISOString(),
    ownerId: input.ownerId,
    projectId: input.projectId,
    status: sufficient ? "validated" : "needs_evidence",
    version: 1
  };
}

function objective(prompt: string): GrowthObjective {
  if (/\bseo|organic traffic|search traffic\b/i.test(prompt)) return "seo";
  if (/\bretention|reactivat|repeat purchase|upsell|cross.sell\b/i.test(prompt)) return "retention";
  if (/\blaunch|release|event promotion\b/i.test(prompt)) return "launch";
  if (/\bvalidate|test (?:the )?offer|offer validation\b/i.test(prompt)) return "validation";
  if (/\bsales (?:enablement|script|objection|demo)\b/i.test(prompt)) return "sales_enablement";
  if (/\brevenue|purchase|sales growth\b/i.test(prompt)) return "revenue_growth";
  if (/\bawareness|reach|brand recognition\b/i.test(prompt)) return "awareness";
  if (/\bleads?|quote requests?|demo requests?\b/i.test(prompt)) return "lead_generation";
  return "customer_acquisition";
}

function artifact(prompt: string): GrowthArtifactKind {
  if (/\bemail|nurture|welcome sequence\b/i.test(prompt)) return "email_sequence";
  if (/\bseo|keyword|topic cluster\b/i.test(prompt)) return "seo_brief";
  if (/\bsocial|post|content pack\b/i.test(prompt)) return "social_content_pack";
  if (/\blanding page|cta|conversion page\b/i.test(prompt)) return "landing_page_recommendation";
  if (/\bexperiment|a\/b|test plan\b/i.test(prompt)) return "experiment_plan";
  if (/\bsales|objection|discovery questions?\b/i.test(prompt)) return "sales_enablement_pack";
  if (/\bcampaign\b/i.test(prompt)) return "campaign_brief";
  return "strategy_document";
}

function requestedChannels(prompt: string): GrowthChannel[] {
  const patterns: Array<[GrowthChannel, RegExp]> = [
    ["email", /\bemail\b/i], ["seo", /\bseo|search\b/i], ["social", /\bsocial|instagram|linkedin|facebook\b/i],
    ["paid_ads", /\bpaid ads?|advertising|ppc\b/i], ["partnerships", /\bpartner|affiliate\b/i],
    ["referrals", /\breferrals?\b/i], ["communities", /\bcommunit(?:y|ies)\b/i],
    ["direct_outreach", /\boutreach|prospect\b/i], ["content", /\bcontent|blog\b/i], ["website", /\bwebsite|landing page\b/i]
  ];
  return patterns.filter(([, pattern]) => pattern.test(prompt)).map(([channel]) => channel);
}

export function understandGrowthRequest(input: {
  audiences?: GrowthAudience[];
  prompt: string;
}): GrowthRequest {
  const prompt = clean(input.prompt, 2_000);
  const requestedAudience = input.audiences?.find((item) =>
    new RegExp(`\\b${item.segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(prompt)
  )?.segment ?? null;
  const budgetText = prompt.match(/(?:budget(?:\s+is|\s+of)?\s*)?\$\s?([\d,]+(?:\.\d+)?)/i)?.[1];
  return {
    artifact: artifact(prompt),
    budget: budgetText ? Number.parseFloat(budgetText.replaceAll(",", "")) : null,
    channels: requestedChannels(prompt),
    constraints: [
      ...(/\bdo not (?:send|publish|launch)\b/i.test(prompt) ? ["prepare_only"] : []),
      ...(/\bwithout paid ads?\b/i.test(prompt) ? ["no_paid_ads"] : [])
    ],
    conversionEvent: prompt.match(/\b(?:increase|drive|get)\s+([a-z -]+?(?:requests?|signups?|purchases?|bookings?|leads?))\b/i)?.[1] ?? null,
    geographicScope: prompt.match(/\b(?:in|for|across)\s+([A-Z][A-Za-z ]{2,40})\b/)?.[1]?.trim() ?? null,
    objective: objective(prompt),
    prompt,
    requestedAudience,
    timeline: prompt.match(/\b(?:within|over|for)\s+(\d+\s+(?:days?|weeks?|months?))\b/i)?.[1] ?? null
  };
}

function isB2B(project: GrowthProject) {
  return project.businessTruth.audiences.some((item) => /business|buyer|planner|team|company|agency|professional|operator|venue|florist/i.test(item.segment));
}

function isLocalService(project: GrowthProject) {
  return /service|contractor|clean|repair|clinic|salon|hvac|construction/i.test(
    `${project.businessTruth.business.category.value ?? ""} ${project.businessTruth.business.description.value ?? ""}`
  );
}

export function selectGrowthChannels(project: GrowthProject, request: GrowthRequest) {
  const requested = request.channels.filter((channel) => !(request.constraints.includes("no_paid_ads") && channel === "paid_ads"));
  const candidates: Array<{ channel: GrowthChannel; rationale: string }> = requested.map((channel) => ({
    channel,
    rationale: "Explicitly requested and retained subject to truth, budget, and execution limits."
  }));
  if (!candidates.length && isLocalService(project)) {
    candidates.push(
      { channel: "website", rationale: "Captures high-intent local demand with a clear quote or booking path." },
      { channel: "seo", rationale: "Builds qualitative local intent coverage without requiring a large media budget." },
      { channel: "referrals", rationale: "Uses trust and customer fit without high fixed tooling cost." }
    );
  } else if (!candidates.length && isB2B(project)) {
    candidates.push(
      { channel: "direct_outreach", rationale: "Supports small, relevant, manually reviewed business prospecting." },
      { channel: "content", rationale: "Builds evidence-led authority for a considered business purchase." },
      { channel: "email", rationale: "Supports consent-based nurture and follow-up without automated sending." }
    );
  } else if (!candidates.length) {
    candidates.push(
      { channel: "website", rationale: "Provides a controlled conversion destination." },
      { channel: "social", rationale: "Tests audience response with bounded organic creative." },
      { channel: "email", rationale: "Supports permission-based follow-up and retention." }
    );
  }
  const limit = request.budget !== null && request.budget <= 1_000 ? 2 : maximumChannels;
  return candidates.filter((item, index, values) => values.findIndex((candidate) => candidate.channel === item.channel) === index).slice(0, limit);
}

function campaignAudience(project: GrowthProject, request: GrowthRequest) {
  return project.businessTruth.audiences.find((item) => item.segment === request.requestedAudience)
    ?? project.businessTruth.audiences[0]
    ?? null;
}

function primaryOffer(project: GrowthProject) {
  return project.businessTruth.offers[0] ?? null;
}

function ctaFor(project: GrowthProject, request: GrowthRequest) {
  const offer = primaryOffer(project);
  if (offer?.cta) return { destination: offer.cta.target, label: offer.cta.label };
  if (offer?.type === "service" || /quote|service|contractor/i.test(offer?.name ?? "")) return { destination: "contact", label: "Request a Quote" };
  if (offer?.type === "product") return { destination: "shop", label: "Shop Collection" };
  if (request.objective === "seo" || request.artifact === "seo_brief") return { destination: "guide", label: "Read the Guide" };
  return { destination: "contact", label: "Start a Conversation" };
}

export function createGrowthStrategy(project: GrowthProject, request: GrowthRequest): GrowthStrategy {
  const selectedAudience = campaignAudience(project, request);
  const offer = primaryOffer(project);
  const channels = selectGrowthChannels(project, request);
  const positioning = project.businessTruth.positioning.valueProposition.value
    ?? project.businessTruth.business.description.value
    ?? "Clarify the offer using confirmed business facts.";
  const campaign: GrowthCampaign = {
    artifact: request.artifact,
    audienceId: selectedAudience?.id ?? "audience-unknown",
    channel: channels[0]?.channel ?? "website",
    claims: [],
    cta: ctaFor(project, request),
    id: `campaign-${slug(`${project.projectId}-${request.objective}-${selectedAudience?.segment ?? "unknown"}`)}`,
    measurement: [{ baseline: null, metric: request.conversionEvent ?? "qualified conversions", target: null, unit: "count" }],
    message: clean(`${positioning} for ${selectedAudience?.segment ?? "the confirmed target audience"}.`, 500),
    objective: request.objective,
    offerId: offer?.id ?? "offer-unknown",
    projectId: project.projectId,
    provenance: { sourceRevision: project.businessTruth.sourceWebsite?.revision ?? null, type: "growth_project" },
    status: "draft"
  };
  return {
    assumptions: [
      ...(request.budget === null ? ["Budget is unknown; channel recommendations remain proportional and qualitative."] : []),
      ...(campaign.measurement[0]?.baseline === null ? ["Current performance baseline is unknown."] : [])
    ],
    businessAudienceIds: project.businessTruth.audiences.map((item) => item.id),
    campaign,
    channels,
    objective: request.objective,
    positioning,
    projectId: project.projectId,
    risks: ["External sending, publishing, advertising spend, and website or code mutation are outside this prepared strategy."]
  };
}

const riskyClaimPatterns = [
  /(?:^|\b)(?:#\s?1|best|leading|top-rated)(?:\b|$)/i,
  /\bguarantee(?:d|s)?\b/i,
  /\b\d+(?:\.\d+)?%\b/i,
  /\b\d[\d,]*\s+(?:customers?|clients?|planners?|users?|orders?|businesses?)\b/i,
  /\b\d+\s+years?\b/i,
  /\b(?:award(?:ed|-winning)?|certified|endorsed|partner(?:ed|ship)?)\b/i,
  /\b(?:clinically proven|legally compliant|roi|return on investment)\b/i,
  /\b(?:only \d+ left|ends? today|last chance|countdown)\b/i,
  /[“"][^”"]{10,}[”"]\s*[—-]\s*[A-Z][A-Za-z ]+/,
  /\b(?:customer|client) (?:said|says|testimonial)\b/i
];

function matchingSupportedClaim(candidate: string, claims: WebsiteGrowthClaim[]) {
  const normalized = clean(candidate).toLowerCase();
  return claims.find((claim) =>
    claim.status === "confirmed" && claim.reusableExternally &&
    (normalized.includes(clean(claim.text).toLowerCase()) || clean(claim.text).toLowerCase().includes(normalized))
  );
}

export function validateGrowthClaims(candidates: string[], authoritativeClaims: WebsiteGrowthClaim[]) {
  return candidates.map((text) => {
    const risky = riskyClaimPatterns.some((pattern) => pattern.test(text));
    const supported = matchingSupportedClaim(text, authoritativeClaims);
    return {
      evidenceIds: supported?.evidenceIds ?? [],
      status: !risky || supported ? "permitted" as const : "needs_evidence" as const,
      text
    };
  });
}

export function assessOutboundSafety(prompt: string) {
  const mass = /\b(?:email|message|dm|contact)\s+(?:\d[\d,]*|thousands?|everyone|random businesses?)/i.test(prompt);
  const automatic = /\bautomatically|auto-send|bulk send|scrape|harvest\b/i.test(prompt);
  return {
    blockedActions: mass || automatic ? ["bulk_send", "contact_scraping", "external_execution"] : [],
    safePlan: mass || automatic
      ? "Build a small, relevant ICP list from legitimate business context, draft a manually reviewed message, use a reasonable cadence, identify the sender, and respect opt-out and channel rules."
      : "Prepare relevant, proportionate outreach drafts for manual review; do not send or scrape contacts.",
    status: mass || automatic ? "redirected" as const : "allowed" as const
  };
}

function conversionMismatch(campaign: GrowthCampaign) {
  const pair = `${campaign.cta.label} ${campaign.cta.destination}`.toLowerCase();
  return (/download/.test(pair) && /pricing|contact|checkout/.test(campaign.cta.destination.toLowerCase())) ||
    (/quote|book demo|start trial/.test(campaign.cta.label.toLowerCase()) && /blog|guide|about/.test(campaign.cta.destination.toLowerCase()));
}

export function validateGrowthCampaign(project: GrowthProject, campaign: GrowthCampaign): GrowthValidation {
  const issues: GrowthValidationIssue[] = [];
  if (!project.businessTruth.business.name.value && !project.businessTruth.business.category.value) issues.push({ code: "BUSINESS_MISSING", message: "Business identity requires confirmation.", severity: "block" });
  if (!project.businessTruth.audiences.some((item) => item.id === campaign.audienceId)) issues.push({ code: "AUDIENCE_MISSING", message: "Campaign audience is not part of this Growth project.", severity: "block" });
  if (!project.businessTruth.offers.some((item) => item.id === campaign.offerId)) issues.push({ code: "OFFER_MISSING", message: "Campaign offer is not part of this Growth project.", severity: "block" });
  if (!campaign.cta.label || !campaign.cta.destination) issues.push({ code: "CTA_MISSING", message: "Campaign CTA and destination are required.", severity: "block" });
  if (conversionMismatch(campaign)) issues.push({ code: "CTA_DESTINATION_MISMATCH", message: "Campaign promise and destination do not match.", severity: "block" });
  if (!campaign.measurement.length || campaign.measurement.some((item) => !item.metric)) issues.push({ code: "MEASUREMENT_MISSING", message: "A measurable outcome is required.", severity: "block" });
  for (const result of validateGrowthClaims(campaign.claims, project.businessTruth.claims).filter((item) => item.status === "needs_evidence")) {
    issues.push({ code: "UNSUPPORTED_CLAIM", message: `Evidence is required before publishing: ${clean(result.text, 180)}`, severity: "needs_evidence" });
  }
  if (/fake testimonial|invent(?:ed)? review|false countdown|impersonat|hidden fees?/i.test(`${campaign.message} ${campaign.claims.join(" ")}`)) {
    issues.push({ code: "DECEPTIVE_GROWTH", message: "Deceptive or fabricated persuasion cannot become a validated Growth artifact.", severity: "block" });
  }
  return {
    issues,
    status: issues.some((issue) => issue.severity === "block") ? "blocked"
      : issues.some((issue) => issue.severity === "needs_evidence") ? "needs_evidence"
        : "validated"
  };
}

export function createQualitativeSeoBrief(project: GrowthProject, topics: string[]) {
  const normalizedTopics = unique(topics.map((topic) => clean(topic, 120)).filter(Boolean));
  return {
    dataAvailability: "qualitative_only" as const,
    fabricatedMetrics: false,
    intents: normalizedTopics.map((topic) => ({ intent: /buy|quote|service|near me/i.test(topic) ? "commercial" : "informational", topic })),
    measurement: ["organic visits", "qualified conversions", "indexed pages"],
    projectId: project.projectId,
    unavailableMetrics: ["search volume", "CPC", "keyword difficulty", "current ranking"]
  };
}

export function calculateFunnelMath(input: { customers: number; leads: number; visitors: number }) {
  const valid = [input.customers, input.leads, input.visitors].every((value) => Number.isFinite(value) && value >= 0) && input.visitors > 0 && input.leads <= input.visitors && input.customers <= input.leads;
  if (!valid) throw new Error("Funnel counts must be non-negative and ordered visitors >= leads >= customers.");
  return {
    customerFromLeadRate: input.leads ? input.customers / input.leads : null,
    customerFromVisitorRate: input.customers / input.visitors,
    leadConversionRate: input.leads / input.visitors
  };
}

export function createGrowthExperiment(input: Omit<GrowthExperiment, "result">): GrowthExperiment {
  return { ...input, result: "not_started" };
}

export function createGrowthHandoff(input:
  | { kind: "website"; cta: string; evidenceIds?: string[]; projectId: string; recommendation: string; targetPage: string }
  | { kind: "code"; acceptanceCriteria: string[]; projectId: string; requirement: string }
  | { kind: "live"; campaign: GrowthCampaign; limits: string[] }
): GrowthHandoff {
  if (input.kind === "website") return { approvalRequired: true, cta: input.cta, evidenceIds: input.evidenceIds ?? [], kind: "website_recommendation", mutatesWebsite: false, projectId: input.projectId, recommendation: input.recommendation, targetPage: input.targetPage };
  if (input.kind === "code") return { acceptanceCriteria: input.acceptanceCriteria, approvalRequired: true, kind: "code_recommendation", mutatesCode: false, projectId: input.projectId, requirement: input.requirement };
  return { approvalRequired: true, campaignId: input.campaign.id, channel: input.campaign.channel, executionStatus: "not_executed", kind: "live_execution_handoff", limits: input.limits, projectId: input.campaign.projectId };
}

export function buildGrowthContextPacket(input: {
  memoryCapsule?: MemoryContextCapsule | null;
  memoryProjectId?: string | null;
  project: GrowthProject;
  request: GrowthRequest;
}) {
  const truth = input.project.businessTruth;
  const memory = input.memoryProjectId === input.project.projectId && input.memoryCapsule?.policy.mode === "GROWTH"
    ? input.memoryCapsule.providerContext
    : "";
  const content = [
    `Growth project: ${input.project.projectId}`,
    `Objective: ${input.request.objective}`,
    `Business: ${truth.business.name.value ?? truth.business.category.value ?? "unknown"}`,
    `Audiences: ${truth.audiences.map((item) => item.segment).join(", ") || "unknown"}`,
    `Offers: ${truth.offers.map((item) => item.name).join(", ") || "unknown"}`,
    `Positioning: ${truth.positioning.valueProposition.value ?? "unknown"}`,
    `Confirmed reusable claims: ${truth.claims.filter((claim) => claim.status === "confirmed" && claim.reusableExternally).map((claim) => claim.text).join("; ") || "none"}`,
    memory ? `Relevant project memory:\n${memory}` : ""
  ].filter(Boolean).join("\n").slice(0, maximumContextCharacters);
  return {
    content,
    projectId: input.project.projectId,
    sourceRevision: truth.sourceWebsite?.revision ?? null,
    truncated: content.length >= maximumContextCharacters
  };
}

export function createGrowthArtifact(input: {
  campaign: GrowthCampaign;
  content: string;
  validation: GrowthValidation;
}) {
  const content = input.content.trim().slice(0, 20_000);
  const digest = createHash("sha256").update(content).digest("hex");
  const result: RichExperienceResult = {
    canonicalRevision: digest,
    download: { available: input.validation.status === "validated", reason: input.validation.status === "validated" ? undefined : "Growth validation requires attention before download." },
    media: [],
    mode: "GROWTH",
    outputKind: "markdown",
    preview: { available: true },
    primaryArtifact: {
      contentType: "text/markdown; charset=utf-8",
      id: `growth-${digest.slice(0, 16)}`,
      integrity: { algorithm: "sha256", value: digest },
      kind: "markdown",
      name: `${slug(input.campaign.id)}.md`,
      provenance: "generated",
      sizeBytes: Buffer.byteLength(content, "utf8")
    },
    status: input.validation.status === "validated" ? "valid" : "blocked",
    supportingArtifacts: [],
    unresolvedCapabilities: input.validation.issues.map((issue) => issue.code),
    warnings: input.validation.issues.map((issue) => issue.message)
  };
  return { content, result };
}
