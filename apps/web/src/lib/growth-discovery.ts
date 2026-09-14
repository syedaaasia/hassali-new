import type { GrowthDiscoveryJob } from "./growth-discovery-job";
import type { GrowthAssertion } from "./server/ai/website-growth-handoff";

export type GrowthCompanySize = { label: string; minEmployees: number | null; maxEmployees: number | null };
export type GrowthSizeConstraint = GrowthAssertion<GrowthCompanySize> & { sourceText: string; source: "audience" | "user" };
export type GrowthSizeResult = { match: "match" | "mismatch" | "unverified"; value: GrowthCompanySize | null; constraintStatus: GrowthSizeConstraint["status"]; evidence: GrowthSourceEvidence[] };

export type GrowthFunnel = {
  target: number; rounds: number; queries: number; resultsPerQuery: number[];
  searchResults: number; uniqueDomains: number; duplicateDomains: number;
  candidates: number; preRetrievalRejected: number; fetched: number; fetchFailures: number;
  recognized: number; audienceMatches: number; evidenceValid: number; accepted: number;
  companyTypeMatches?: number; geographyMatches?: number; sizeMatches?: number; sizeUnverified?: number;
  rejections: Record<string, number>;
};
export const emptyGrowthFunnel = (target: number): GrowthFunnel => ({ target, rounds: 0, queries: 0, resultsPerQuery: [], searchResults: 0, uniqueDomains: 0, duplicateDomains: 0, candidates: 0, preRetrievalRejected: 0, fetched: 0, fetchFailures: 0, recognized: 0, audienceMatches: 0, evidenceValid: 0, accepted: 0, companyTypeMatches: 0, geographyMatches: 0, sizeMatches: 0, sizeUnverified: 0, rejections: {} });
export type GrowthSearchPlan = {
  titles: string[]; adjacentTitles: string[]; excludedTitles: string[];
  seniority: string[]; organizationTypes: string[]; industries: string[];
  geographies: string[]; buyingSignals: string[]; exclusions: string[];
  companyCriteria: string; reasoning: string; limit: number; verifiedContactsOnly: boolean;
  audienceContext?: GrowthAudienceSegment;
  companySize?: GrowthSizeConstraint;
};
export type GrowthAudienceSegment = {
  id: string; name: string; problem: string; whyTheyBuy: string;
  buyerRoles: string[]; organizationTypes: string[]; geography: string[];
  buyingSignals: string[]; exclusions: string[]; status: "inferred";
};
export type GrowthSourceEvidence = { url: string; quote: string; checkedAt: string; field: string };
export type GrowthProspectCompany = {
  id: string; name: string; website: string; domain: string; location: string | null;
  organizationType: string | null; segment: string; fitScore: number;
  fitReasons: string[]; evidence: GrowthSourceEvidence[]; lastVerifiedAt: string;
  targetRoles: string[]; recommendedAngle: string;
  companySize?: GrowthSizeResult;
};
export type GrowthProspectPerson = {
  id: string; companyId: string; name: string; role: string; profileUrl: string | null;
  email: string | null; emailStatus: "unknown" | "public_unverified" | "verified";
  phone: string | null; evidence: GrowthSourceEvidence[];
};
export type GrowthOutreachDraft = {
  companyId: string; subject: string; body: string; recommendedAngle: string;
  personalizationEvidence: GrowthSourceEvidence[]; status: "draft";
  provenance?: { angle: string; evidenceIds: string[]; quality: "passed"; repairs: number; fingerprint: string };
};
export type GrowthDiscoveryState = {
  version: 1; revision: string;
  business: { name: string; description: string; offer: string; valueProposition: string; geography: string | null; website: string | null; evidence: GrowthSourceEvidence[]; status: "inferred" | "user_provided" | "website_handoff" | "source_only" } | null;
  analysis?: { status: "not_requested" | "provider_blocked" | "incomplete" | "complete"; failureCode?: string };
  audiences: GrowthAudienceSegment[]; plan: GrowthSearchPlan | null;
  companies: GrowthProspectCompany[]; people: GrowthProspectPerson[];
  drafts: GrowthOutreachDraft[];
  job?: GrowthDiscoveryJob;
  messages: Array<{ role: "user" | "assistant"; text: string }>;
  discovery: { status: "not_started" | "complete" | "partial" | "unavailable"; checked: number; rejected: number; message: string; searchedAt: string | null; funnel?: GrowthFunnel; seedQueries?: string[]; failureCode?: string; retryUrls?: string[]; rejectedUrls?: string[] };
};
export const emptyGrowthPlan = (): GrowthSearchPlan => ({ titles: [], adjacentTitles: [], excludedTitles: [], seniority: [], organizationTypes: [], industries: [], geographies: [], buyingSignals: [], exclusions: [], companyCriteria: "", reasoning: "", limit: 10, verifiedContactsOnly: false });
export const emptyGrowthDiscovery = (): GrowthDiscoveryState => ({ version: 1, revision: "", business: null, audiences: [], plan: null, companies: [], people: [], drafts: [], messages: [], discovery: { status: "not_started", checked: 0, rejected: 0, message: "", searchedAt: null } });

function csvCell(value: string) {
  const safe = /^[\s]*[=+@-]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}
export function growthCandidatesCsv(state: GrowthDiscoveryState) {
  const candidates = [...new Map((state.job?.candidates ?? []).map(c => [c.url, c])).values()];
  const header = ["Source URL", "Website", "Domain", "Page title", "Discovery source", "Discovered at", "Evidence state", "Qualification", "Evidence URLs", "Evidence quotes", "Checked at"];
  const rows = candidates.map(c => [c.url, c.canonicalUrl ?? "", new URL(c.canonicalUrl ?? c.url).hostname, c.title ?? "", c.source ?? "public-web-search", c.discoveredAt ?? "", c.evidence?.length ? "evidence_captured" : "discovered", c.qualification ?? "unverified", c.evidence?.map(e => e.url).join("; ") ?? "", c.evidence?.map(e => e.quote).join("; ") ?? "", c.evidence?.[0]?.checkedAt ?? ""]);
  return "\uFEFF" + [header, ...rows].map(row => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
export function growthProspectsCsv(state: GrowthDiscoveryState, selectedIds?: string[]) {
  const selected = selectedIds ? new Set(selectedIds) : null;
  const header = ["Company", "Website", "Domain", "Location", "Segment", "Fit score", "Fit reasons", "Person", "Role", "Email", "Email status", "Profile", "Evidence URLs", "Evidence quotes", "Checked at", "Recommended angle", "Outreach subject", "Outreach body"];
  const rows = state.companies.filter((c) => !selected || selected.has(c.id)).map((c) => {
    const p = state.people.find((person) => person.companyId === c.id);
    const draft = state.drafts.find(d => d.companyId === c.id);
    return [c.name, c.website, c.domain, c.location ?? "", c.segment, String(c.fitScore), c.fitReasons.join("; "), p?.name ?? "", p?.role ?? c.targetRoles.join("; "), p?.email ?? "", p?.emailStatus ?? "unknown", p?.profileUrl ?? "", c.evidence.map((e) => e.url).join("; "), c.evidence.map((e) => e.quote).join("; "), c.lastVerifiedAt, c.recommendedAngle, draft?.subject ?? "", draft?.body ?? ""];
  });
  return "\uFEFF" + [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
