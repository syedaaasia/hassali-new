import type { CompositionPlan } from "@/lib/server/ai/composition-engine";
import type { WebsiteAssetPlan } from "@/lib/server/ai/website-asset-plan";
import type { WebsiteContentContract, WebsiteContentFact } from "@/lib/server/ai/website-content-contract";
import type { ProjectDesignContract } from "@/lib/server/design/direction/project-design-contract";

export type GrowthTruthStatus = "confirmed" | "derived" | "inferred" | "unknown" | "unsupported";
export type GrowthEvidenceKind =
  | "bounded_inference"
  | "existing_project"
  | "existing_website_content"
  | "explicit_user_instruction"
  | "structured_contract"
  | "uploaded_file";

export type GrowthEvidence = {
  id: string;
  kind: GrowthEvidenceKind;
  location: string;
  summary: string;
};

export type GrowthAssertion<T> = {
  confidence: number;
  evidenceIds: string[];
  status: GrowthTruthStatus;
  value: T | null;
};

export type WebsiteGrowthClaim = {
  evidenceIds: string[];
  id: string;
  reusableExternally: boolean;
  status: GrowthTruthStatus;
  text: string;
};

export type WebsiteGrowthOffer = {
  assetPaths: string[];
  category: string | null;
  cta: { label: string; target: string } | null;
  description: string;
  evidenceIds: string[];
  features: string[];
  id: string;
  name: string;
  page: string;
  price: GrowthAssertion<string>;
  status: GrowthTruthStatus;
  type: "category" | "package" | "product" | "service" | "unknown";
};

export type WebsiteConversionPath = {
  destinationExists: boolean;
  evidenceIds: string[];
  id: string;
  label: string;
  page: string;
  target: string;
  type: "booking" | "contact" | "inquiry" | "purchase" | "signup" | "unknown";
};

export type GrowthReadinessCheck = {
  id: string;
  message: string;
  status: "ambiguous" | "missing" | "pass" | "unsupported";
};

export type GrowthReadinessReport = {
  analyticsReady: boolean;
  blockers: string[];
  channelReady: boolean;
  checks: GrowthReadinessCheck[];
  contentReady: boolean;
  missingFields: string[];
  recommendedInformation: string[];
  status: "blocked" | "needs_input" | "ready";
};

export type WebsiteGrowthHandoff = {
  assets: Array<{
    evidenceIds: string[];
    path: string;
    role: string;
    source: "existing_project" | "generated" | "user_upload";
  }>;
  audience: {
    primary: GrowthAssertion<string>;
    secondary: GrowthAssertion<string[]>;
    type: GrowthAssertion<"B2B" | "B2B2C" | "B2C" | "unknown">;
  };
  authoritativeState: "applied";
  brand: {
    designReference: GrowthAssertion<string>;
    voice: GrowthAssertion<string[]>;
  };
  business: {
    description: GrowthAssertion<string>;
    domain: GrowthAssertion<string>;
    location: GrowthAssertion<string>;
    name: GrowthAssertion<string>;
    type: GrowthAssertion<string>;
  };
  claims: WebsiteGrowthClaim[];
  content: {
    pageTopics: Array<{ page: string; topics: string[] }>;
    reusableCopy: Array<{ evidenceIds: string[]; page: string; text: string }>;
  };
  conversion: {
    blockers: string[];
    paths: WebsiteConversionPath[];
    primary: WebsiteConversionPath | null;
    secondary: WebsiteConversionPath[];
  };
  evidence: GrowthEvidence[];
  generatedAt: string;
  offers: WebsiteGrowthOffer[];
  positioning: {
    brandPromise: GrowthAssertion<string>;
    differentiators: GrowthAssertion<string[]>;
    valueProposition: GrowthAssertion<string>;
  };
  privacy: {
    excludedCategories: string[];
    projectBound: true;
    secretsIncluded: false;
  };
  projectId: string;
  readiness: GrowthReadinessReport;
  revision: string;
  version: 1;
};

export type WebsiteGrowthSourceSnapshot = {
  assets: Array<{
    path: string | null;
    role: string;
    source: string;
    status: string;
  }>;
  business: {
    audience: string;
    businessType: string;
    conversionGoal: string;
    coreOffer: string;
    differentiators: string[];
    displayName: string | null;
    locationScope: string | null;
    primaryCta: { label: string; target: string };
    secondaryCta: { label: string; target: string } | null;
    tone: string[];
  };
  composition: {
    authoritativeDomain: string | null;
    pageRoutes: string[];
    productOrServiceEntities: string[];
  };
  design: {
    archetype: string | null;
    fingerprint: string | null;
    personality: string[];
    referenceNames: string[];
  };
  facts: WebsiteContentFact[];
  offers: WebsiteContentContract["offerItems"];
  version: 1;
};

export class WebsiteGrowthHandoffError extends Error {
  constructor(
    message: string,
    readonly code: "NOT_AUTHORITATIVE" | "NOT_WEBSITE" | "OWNERSHIP_REQUIRED"
  ) {
    super(message);
    this.name = "WebsiteGrowthHandoffError";
  }
}

const sourceMarker = "HASSALI_GROWTH_SOURCE_V1";
const excludedPathPattern = /(^|\/)(?:\.git|\.next|node_modules|tmp|temp|logs?)(?:\/|$)|(^|\/)\.env(?:\.|$)/i;
const imagePathPattern = /\.(?:avif|gif|jpe?g|png|svg|webp)$/i;

function clean(value: string) {
  return value.replace(/<[^>]+>/g, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/\s+/g, " ").trim();
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "item";
}

function bounded(value: string, limit = 220) {
  const normalized = clean(value);
  return normalized.length <= limit ? normalized : `${normalized.slice(0, limit - 1).trimEnd()}…`;
}

function safeProjectPath(path: string) {
  const normalized = path.replace(/\\/g, "/").replace(/^\.\//, "");
  return Boolean(normalized) && !normalized.startsWith("/") && !/^[a-z]:\//i.test(normalized) && !normalized.split("/").includes("..") && !excludedPathPattern.test(normalized);
}

function assertion<T>(value: T | null, status: GrowthTruthStatus, evidenceIds: string[], confidence: number): GrowthAssertion<T> {
  return { confidence, evidenceIds, status, value };
}

function evidenceId(kind: GrowthEvidenceKind, location: string, value: string) {
  return `evidence-${slug(`${kind}-${location}-${value}`).slice(0, 80)}`;
}

function addEvidence(
  evidence: GrowthEvidence[],
  kind: GrowthEvidenceKind,
  location: string,
  summary: string
) {
  const normalized = bounded(summary);
  const id = evidenceId(kind, location, normalized);
  if (!evidence.some((entry) => entry.id === id)) evidence.push({ id, kind, location, summary: normalized });
  return id;
}

function factStatus(fact: WebsiteContentFact): GrowthTruthStatus {
  if (fact.classification === "USER_SUPPLIED_FACT") return "confirmed";
  if (fact.classification === "SAFE_INFERENCE" || fact.classification === "DESIGN_RECOMMENDATION") return "derived";
  if (fact.classification === "UNSUPPORTED_CLAIM") return "unsupported";
  return "unknown";
}

export function createWebsiteGrowthSourceSnapshot(input: {
  assetPlan?: WebsiteAssetPlan | null;
  authoritativeDomain?: string | null;
  compositionPlan?: CompositionPlan | null;
  contentContract: WebsiteContentContract;
  designContract?: ProjectDesignContract | null;
  displayName?: string | null;
  pageRoutes?: string[];
  productOrServiceEntities?: string[];
}): WebsiteGrowthSourceSnapshot {
  return {
    assets: (input.assetPlan?.assets ?? []).map((asset) => ({
      path: asset.sourcePath ?? null,
      role: asset.role,
      source: asset.source,
      status: asset.status
    })),
    business: {
      audience: input.contentContract.primaryAudience,
      businessType: input.contentContract.businessType,
      conversionGoal: input.contentContract.conversionGoal,
      coreOffer: input.contentContract.coreOffer,
      differentiators: input.contentContract.differentiators,
      displayName: input.contentContract.businessIdentity.displayName ?? input.displayName ?? null,
      locationScope: input.contentContract.locationScope,
      primaryCta: input.contentContract.primaryCta,
      secondaryCta: input.contentContract.secondaryCta,
      tone: input.contentContract.tone
    },
    composition: {
      authoritativeDomain: input.compositionPlan?.authoritativeDomain ?? input.authoritativeDomain ?? null,
      pageRoutes: input.compositionPlan?.pagePlans.map((page) => page.route) ?? input.pageRoutes ?? [],
      productOrServiceEntities: input.compositionPlan?.productOrServiceEntities ?? input.productOrServiceEntities ?? []
    },
    design: {
      archetype: input.designContract?.identity.archetype ?? null,
      fingerprint: input.designContract?.fingerprint ?? null,
      personality: input.designContract?.intent.personality ?? [],
      referenceNames: input.designContract?.references.map((reference) => reference.name) ?? []
    },
    facts: input.contentContract.availableFacts.map((fact) => ({
      ...fact,
      evidence: fact.classification === "USER_SUPPLIED_FACT"
        ? "explicit user instruction"
        : bounded(fact.evidence, 120)
    })),
    offers: input.contentContract.offerItems,
    version: 1
  };
}

export function renderWebsiteGrowthSourceSnapshot(snapshot: WebsiteGrowthSourceSnapshot) {
  return [
    `<!-- ${sourceMarker} -->`,
    "```json",
    JSON.stringify(snapshot),
    "```"
  ].join("\n");
}

export function parseWebsiteGrowthSourceSnapshot(content: string): WebsiteGrowthSourceSnapshot | null {
  const markerIndex = content.indexOf(`<!-- ${sourceMarker} -->`);
  if (markerIndex < 0) return null;
  const block = content.slice(markerIndex).match(/```json\s*([\s\S]*?)```/i)?.[1];
  if (!block) return null;
  try {
    const parsed = JSON.parse(block) as Partial<WebsiteGrowthSourceSnapshot>;
    if (parsed.version !== 1 || !parsed.business || !Array.isArray(parsed.facts) || !Array.isArray(parsed.offers)) return null;
    return parsed as WebsiteGrowthSourceSnapshot;
  } catch {
    return null;
  }
}

function htmlFiles(files: Record<string, string>) {
  return Object.entries(files)
    .filter(([path]) => /\.html?$/i.test(path) && safeProjectPath(path))
    .sort(([left], [right]) => left.localeCompare(right));
}

function visibleText(html: string) {
  return clean(html.replace(/<script\b[\s\S]*?<\/script>/gi, " ").replace(/<style\b[\s\S]*?<\/style>/gi, " "));
}

function headingTopics(html: string) {
  return Array.from(html.matchAll(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/gi))
    .map((match) => bounded(match[1], 100))
    .filter(Boolean)
    .slice(0, 12);
}

function conversionType(label: string, target: string): WebsiteConversionPath["type"] {
  const text = `${label} ${target}`.toLowerCase();
  if (/book|reserv|appointment/.test(text)) return "booking";
  if (/buy|cart|checkout|order|shop/.test(text)) return "purchase";
  if (/sign.?up|trial|register/.test(text)) return "signup";
  if (/contact|mailto:|tel:/.test(text)) return "contact";
  if (/request|inquir|quote|learn|explore|view/.test(text)) return "inquiry";
  return "unknown";
}

function pageDestinationExists(target: string, sourcePage: string, files: Record<string, string>) {
  const value = target.trim();
  if (/^(?:https?:|mailto:|tel:)/i.test(value)) return true;
  if (!value || value === "#" || /^javascript:/i.test(value)) return false;
  if (value.startsWith("#")) return new RegExp(`id=["']${value.slice(1).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`, "i").test(files[sourcePage] ?? "");
  const normalized = value.split(/[?#]/)[0]?.replace(/^\.\//, "").replace(/^\//, "") || "index.html";
  return Boolean(files[normalized] ?? files[`${normalized.replace(/\/$/, "")}/index.html`]);
}

function extractConversionPaths(files: Record<string, string>, evidence: GrowthEvidence[]) {
  const paths: WebsiteConversionPath[] = [];
  for (const [page, html] of htmlFiles(files)) {
    for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
      const target = match[1]?.trim() ?? "";
      const label = bounded(match[2] ?? "", 90);
      const type = conversionType(label, target);
      if (!label || type === "unknown") continue;
      const evidenceIdValue = addEvidence(evidence, "existing_website_content", `${page}:link`, `${label} -> ${target}`);
      paths.push({
        destinationExists: pageDestinationExists(target, page, files),
        evidenceIds: [evidenceIdValue],
        id: `conversion-${slug(`${page}-${label}-${target}`)}`,
        label,
        page,
        target,
        type
      });
    }
  }
  return paths.filter((path, index) => paths.findIndex((candidate) => candidate.label === path.label && candidate.target === path.target) === index);
}

function inferredOfferType(value: string): WebsiteGrowthOffer["type"] {
  const text = value.toLowerCase();
  if (/package|plan|tier/.test(text)) return "package";
  if (/service|consult|repair|clean|booking|installation/.test(text)) return "service";
  if (/product|collection|paint|room|dish|menu|software/.test(text)) return "product";
  return "unknown";
}

function extractImportedOffers(files: Record<string, string>, evidence: GrowthEvidence[]) {
  const offers: WebsiteGrowthOffer[] = [];
  for (const [page, html] of htmlFiles(files)) {
    const sections = Array.from(html.matchAll(/<(?:section|article)\b([^>]*)>([\s\S]*?)<\/(?:section|article)>/gi));
    for (const section of sections) {
      if (!/(?:product|service|package|offer|menu|room|pricing)/i.test(section[1] ?? "")) continue;
      const heading = bounded(section[2]?.match(/<h[2-4]\b[^>]*>([\s\S]*?)<\/h[2-4]>/i)?.[1] ?? "", 100);
      if (!heading) continue;
      const description = bounded(section[2]?.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i)?.[1] ?? "", 220);
      const evidenceIdValue = addEvidence(evidence, "existing_website_content", `${page}:offer`, `${heading}: ${description}`);
      offers.push({
        assetPaths: [],
        category: null,
        cta: null,
        description,
        evidenceIds: [evidenceIdValue],
        features: [],
        id: `offer-${slug(`${page}-${heading}`)}`,
        name: heading,
        page,
        price: assertion<string>(null, "unknown", [], 0),
        status: "inferred",
        type: inferredOfferType(`${section[1]} ${heading}`)
      });
    }
  }
  return offers;
}

function claimCandidates(files: Record<string, string>) {
  const pattern = /\b(?:#\s*1|number one|best in|award[- ]winning|certified|guaranteed|trusted by\s+\d[\d,]*|loved by\s+\d[\d,]*|\d+\+?\s+(?:customers|clients|years)(?:\s+of experience)?)\b[^.!?]{0,100}/gi;
  return htmlFiles(files).flatMap(([page, html]) =>
    Array.from(visibleText(html).matchAll(pattern)).map((match) => ({ page, text: bounded(match[0], 150) }))
  );
}

function audienceType(value: string): "B2B" | "B2B2C" | "B2C" | "unknown" {
  const text = value.toLowerCase();
  const business = /teams?|business|companies|operators|planners|buyers|organizations|agencies/.test(text);
  const consumer = /homeowners|families|individuals|guests|diners|couples|shoppers|customers/.test(text);
  return business && consumer ? "B2B2C" : business ? "B2B" : consumer ? "B2C" : "unknown";
}

function analyticsPresent(files: Record<string, string>) {
  return Object.values(files).some((content) => /\b(?:gtag|google-analytics|analytics\.track|plausible|dataLayer\.push)\b/i.test(content));
}

function seoPresent(files: Record<string, string>) {
  const pages = htmlFiles(files);
  return pages.length > 0 && pages.every(([, html]) => /<title\b[^>]*>[^<]+<\/title>/i.test(html) && /<meta\b[^>]*name=["']description["']/i.test(html));
}

function assetSource(path: string, snapshot: WebsiteGrowthSourceSnapshot | null) {
  const planned = snapshot?.assets.find((asset) => asset.path?.replace(/^\.\//, "") === path.replace(/^\.\//, ""));
  if (planned?.source === "user_upload") return "user_upload" as const;
  if (planned?.source === "generated" || /generated/i.test(path)) return "generated" as const;
  return "existing_project" as const;
}

export function buildWebsiteGrowthHandoff(input: {
  authoritativeState: "applied" | "failed" | "pending" | "rejected" | "stale";
  files: Record<string, string>;
  generatedAt?: Date;
  projectId: string;
  revision: string;
}): WebsiteGrowthHandoff {
  if (input.authoritativeState !== "applied") {
    throw new WebsiteGrowthHandoffError("Growth handoff requires authoritative applied WEBSITE state.", "NOT_AUTHORITATIVE");
  }
  const rootContract = input.files["HASSALI.website.md"] ?? input.files["HASSALI.md"] ?? "";
  const hasWebsite = htmlFiles(input.files).length > 0;
  if (!hasWebsite || (/\bmode:\s*CODE\b/i.test(rootContract) && !input.files["HASSALI.website.md"])) {
    throw new WebsiteGrowthHandoffError("The authoritative project does not contain an owned WEBSITE state.", "NOT_WEBSITE");
  }

  const snapshot = parseWebsiteGrowthSourceSnapshot(rootContract);
  const evidence: GrowthEvidence[] = [];
  const contractEvidenceId = snapshot
    ? addEvidence(evidence, "structured_contract", "HASSALI website contract", "Applied WEBSITE business contract and Growth source snapshot")
    : null;
  const pages = htmlFiles(input.files);
  for (const [page, html] of pages) addEvidence(evidence, "existing_website_content", page, visibleText(html).slice(0, 180));

  const facts = snapshot?.facts ?? [];
  const factEvidence = new Map<string, string[]>();
  for (const fact of facts) {
    const kind: GrowthEvidenceKind = fact.classification === "USER_SUPPLIED_FACT" ? "explicit_user_instruction" : "structured_contract";
    const id = addEvidence(evidence, kind, `business.${fact.field}`, `${fact.value} — ${fact.evidence}`);
    factEvidence.set(fact.field, [...(factEvidence.get(fact.field) ?? []), id]);
  }
  const statusForField = (field: string, fallback: GrowthTruthStatus = "derived") => {
    const matches = facts.filter((fact) => fact.field === field);
    return matches.some((fact) => factStatus(fact) === "confirmed") ? "confirmed" : matches[0] ? factStatus(matches[0]) : fallback;
  };
  const evidenceFor = (field: string) => factEvidence.get(field) ?? (contractEvidenceId ? [contractEvidenceId] : []);
  const business = snapshot?.business;
  const domainMatch = rootContract.match(/^domainId:\s*(.+)$/im)?.[1]?.trim() ?? snapshot?.composition.authoritativeDomain ?? null;
  const name = business?.displayName ?? rootContract.match(/^(?:displayName|brand\/app\/site name):\s*(.+)$/im)?.[1]?.trim() ?? null;
  const type = business?.businessType ?? rootContract.match(/^contentContractBusinessType:\s*(.+)$/im)?.[1]?.trim() ?? null;
  const offer = business?.coreOffer ?? rootContract.match(/^contentContractOffer:\s*(.+)$/im)?.[1]?.trim() ?? null;
  const audience = business?.audience ?? rootContract.match(/^contentContractAudience:\s*(.+)$/im)?.[1]?.trim() ?? null;
  const location = business?.locationScope ?? null;

  const conversionPaths = extractConversionPaths(input.files, evidence);
  const preferredPrimary = business?.primaryCta
    ? conversionPaths.find((path) => path.target === business.primaryCta.target || path.label === business.primaryCta.label)
    : null;
  const primary = preferredPrimary ?? conversionPaths[0] ?? null;
  const conversionBlockers = conversionPaths.filter((path) => !path.destinationExists).map((path) => `CTA “${path.label}” has no valid destination (${path.target}).`);

  const approvedAssets = Object.keys(input.files)
    .filter((path) => safeProjectPath(path) && imagePathPattern.test(path))
    .map((path) => {
      const planned = snapshot?.assets.find((asset) => asset.path?.replace(/^\.\//, "") === path.replace(/^\.\//, ""));
      const evidenceIdValue = addEvidence(evidence, planned?.source === "user_upload" ? "uploaded_file" : "existing_project", path, `Approved project asset: ${path}`);
      return { evidenceIds: [evidenceIdValue], path: path.replace(/\\/g, "/"), role: planned?.role ?? "website_asset", source: assetSource(path, snapshot) };
    });
  const plannedOffers: WebsiteGrowthOffer[] = (snapshot?.offers ?? []).map((item, index) => ({
    assetPaths: approvedAssets.filter((asset) => /product|service|gallery|hero/.test(asset.role)).map((asset) => asset.path),
    category: item.meta || null,
    cta: primary ? { label: primary.label, target: primary.target } : business?.primaryCta ?? null,
    description: item.detail,
    evidenceIds: contractEvidenceId ? [contractEvidenceId] : [],
    features: [],
    id: `offer-${slug(item.title)}-${index + 1}`,
    name: item.title,
    page: primary?.page ?? "index.html",
    price: assertion<string>(null, "unknown", [], 0),
    status: "derived",
    type: inferredOfferType(`${type ?? ""} ${item.title}`)
  }));
  const offers = plannedOffers.length ? plannedOffers : extractImportedOffers(input.files, evidence);

  const confirmedClaimText = facts.filter((fact) => fact.field === "claim" && fact.classification === "USER_SUPPLIED_FACT").map((fact) => clean(fact.value).toLowerCase());
  const claims: WebsiteGrowthClaim[] = facts
    .filter((fact) => fact.field === "claim")
    .map((fact, index) => ({
      evidenceIds: evidenceFor("claim"),
      id: `claim-contract-${index + 1}`,
      reusableExternally: factStatus(fact) === "confirmed",
      status: factStatus(fact),
      text: fact.value
    }));
  for (const candidate of claimCandidates(input.files)) {
    if (claims.some((claim) => clean(claim.text).toLowerCase() === candidate.text.toLowerCase())) continue;
    const confirmed = confirmedClaimText.some((value) => candidate.text.toLowerCase().includes(value) || value.includes(candidate.text.toLowerCase()));
    const id = addEvidence(evidence, "existing_website_content", candidate.page, candidate.text);
    claims.push({
      evidenceIds: [id],
      id: `claim-page-${slug(`${candidate.page}-${candidate.text}`)}`,
      reusableExternally: confirmed,
      status: confirmed ? "confirmed" : "unsupported",
      text: candidate.text
    });
  }

  const analyticsReady = analyticsPresent(input.files);
  const checks: GrowthReadinessCheck[] = [
    { id: "business_identity", message: name || type ? "Business identity is represented." : "Business identity is ambiguous.", status: name || type ? "pass" : "ambiguous" },
    { id: "offer", message: offers.length ? "At least one structured offer is represented." : "No reliable product or service offer was found.", status: offers.length ? "pass" : "missing" },
    { id: "audience", message: audience ? "Primary audience is represented." : "Primary audience is missing.", status: audience ? "pass" : "missing" },
    { id: "conversion", message: primary?.destinationExists ? "A working conversion path is represented." : "A working primary conversion path is missing.", status: primary?.destinationExists ? "pass" : "missing" },
    { id: "claims", message: claims.some((claim) => claim.status === "unsupported") ? "Unsupported objective claims require confirmation or removal." : "No unsupported objective claim was promoted to fact.", status: claims.some((claim) => claim.status === "unsupported") ? "unsupported" : "pass" },
    { id: "brand_voice", message: business?.tone.length ? "Brand voice is represented." : "Brand voice needs confirmation.", status: business?.tone.length ? "pass" : "ambiguous" },
    { id: "analytics", message: analyticsReady ? "Analytics instrumentation is present." : "Analytics instrumentation is absent.", status: analyticsReady ? "pass" : "missing" },
    { id: "seo", message: seoPresent(input.files) ? "Core page metadata is present." : "Core page metadata is incomplete.", status: seoPresent(input.files) ? "pass" : "missing" }
  ];
  const blockers = [
    ...conversionBlockers,
    ...(!name && !type ? ["Business identity is ambiguous."] : []),
    ...(!offers.length ? ["No reliable offer is represented."] : []),
    ...(claims.some((claim) => claim.status === "unsupported") ? ["Unsupported objective marketing claims require confirmation or removal."] : [])
  ];
  const missingFields = checks.filter((check) => check.status === "missing" || check.status === "ambiguous").map((check) => check.id);
  const criticalMissing = checks.some((check) => ["business_identity", "offer", "audience", "conversion"].includes(check.id) && check.status !== "pass");
  const readiness: GrowthReadinessReport = {
    analyticsReady,
    blockers,
    channelReady: !criticalMissing && blockers.length === 0,
    checks,
    contentReady: Boolean(offer && audience && pages.length),
    missingFields,
    recommendedInformation: [
      ...(!audience ? ["Confirm the primary buyer or user audience."] : []),
      ...(!primary?.destinationExists ? ["Provide a valid purchase, booking, signup, or contact destination."] : []),
      ...(!analyticsReady ? ["Choose approved analytics and conversion event instrumentation before campaign measurement."] : []),
      ...(claims.some((claim) => claim.status === "unsupported") ? ["Provide evidence for unsupported objective claims or remove them from public copy."] : [])
    ],
    status: criticalMissing ? "blocked" : blockers.length ? "needs_input" : "ready"
  };

  const voice = business?.tone ?? [];
  const designReference = snapshot?.design.referenceNames.join(", ") || snapshot?.design.archetype || null;
  return {
    assets: approvedAssets,
    audience: {
      primary: assertion(audience, statusForField("primaryAudience"), evidenceFor("primaryAudience"), audience ? 0.78 : 0),
      secondary: assertion<string[]>([], "unknown", [], 0),
      type: assertion(audience ? audienceType(audience) : "unknown", audience ? "inferred" : "unknown", evidenceFor("primaryAudience"), audience ? 0.58 : 0)
    },
    authoritativeState: "applied",
    brand: {
      designReference: assertion(designReference, designReference ? "derived" : "unknown", contractEvidenceId ? [contractEvidenceId] : [], designReference ? 0.8 : 0),
      voice: assertion(voice, voice.length ? "derived" : "unknown", contractEvidenceId ? [contractEvidenceId] : [], voice.length ? 0.76 : 0)
    },
    business: {
      description: assertion(offer, statusForField("coreOffer"), evidenceFor("coreOffer"), offer ? 0.84 : 0),
      domain: assertion(domainMatch, domainMatch ? "derived" : "unknown", contractEvidenceId ? [contractEvidenceId] : [], domainMatch ? 0.86 : 0),
      location: assertion(location, statusForField("locationScope", location ? "derived" : "unknown"), evidenceFor("locationScope"), location ? 0.9 : 0),
      name: assertion(name, statusForField("businessIdentity", name ? "derived" : "unknown"), evidenceFor("businessIdentity"), name ? 0.9 : 0),
      type: assertion(type, type ? "derived" : "unknown", contractEvidenceId ? [contractEvidenceId] : [], type ? 0.86 : 0)
    },
    claims,
    content: {
      pageTopics: pages.map(([page, html]) => ({ page, topics: headingTopics(html) })),
      reusableCopy: pages.map(([page, html]) => ({
        evidenceIds: [evidenceId("existing_website_content", page, visibleText(html).slice(0, 180))],
        page,
        text: bounded(visibleText(html), 240)
      }))
    },
    conversion: {
      blockers: conversionBlockers,
      paths: conversionPaths,
      primary,
      secondary: conversionPaths.filter((path) => path.id !== primary?.id)
    },
    evidence,
    generatedAt: (input.generatedAt ?? new Date()).toISOString(),
    offers,
    positioning: {
      brandPromise: assertion(business?.conversionGoal ?? null, business?.conversionGoal ? "derived" : "unknown", contractEvidenceId ? [contractEvidenceId] : [], business?.conversionGoal ? 0.7 : 0),
      differentiators: assertion(business?.differentiators ?? [], business?.differentiators.length ? "derived" : "unknown", contractEvidenceId ? [contractEvidenceId] : [], business?.differentiators.length ? 0.68 : 0),
      valueProposition: assertion(offer, statusForField("coreOffer"), evidenceFor("coreOffer"), offer ? 0.8 : 0)
    },
    privacy: {
      excludedCategories: ["API keys", "environment variables", "auth material", "private project notes", "unrelated memory", "unapproved proposal content"],
      projectBound: true,
      secretsIncluded: false
    },
    projectId: input.projectId,
    readiness,
    revision: input.revision,
    version: 1
  };
}

export function summarizeWebsiteGrowthHandoff(handoff: WebsiteGrowthHandoff) {
  return {
    audience: handoff.audience.primary.value,
    business: handoff.business.name.value ?? handoff.business.type.value,
    claimCount: handoff.claims.length,
    conversionBlockerCount: handoff.conversion.blockers.length,
    offerCount: handoff.offers.length,
    readiness: handoff.readiness.status,
    unsupportedClaimCount: handoff.claims.filter((claim) => claim.status === "unsupported").length
  };
}
