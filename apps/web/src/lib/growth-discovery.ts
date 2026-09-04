export type GrowthSearchPlan = {
  titles: string[]; adjacentTitles: string[]; excludedTitles: string[];
  seniority: string[]; organizationTypes: string[]; industries: string[];
  geographies: string[]; buyingSignals: string[]; exclusions: string[];
  companyCriteria: string; reasoning: string; limit: number; verifiedContactsOnly: boolean;
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
};
export type GrowthProspectPerson = {
  id: string; companyId: string; name: string; role: string; profileUrl: string | null;
  email: string | null; emailStatus: "unknown" | "public_unverified" | "verified";
  phone: string | null; evidence: GrowthSourceEvidence[];
};
export type GrowthOutreachDraft = {
  companyId: string; subject: string; body: string; recommendedAngle: string;
  personalizationEvidence: GrowthSourceEvidence[]; status: "draft";
};
export type GrowthDiscoveryState = {
  version: 1; revision: string;
  business: { name: string; description: string; offer: string; valueProposition: string; geography: string | null; website: string | null; evidence: GrowthSourceEvidence[]; status: "inferred" | "user_provided" | "website_handoff" } | null;
  audiences: GrowthAudienceSegment[]; plan: GrowthSearchPlan | null;
  companies: GrowthProspectCompany[]; people: GrowthProspectPerson[];
  drafts: GrowthOutreachDraft[];
  messages: Array<{ role: "user" | "assistant"; text: string }>;
  discovery: { status: "not_started" | "complete" | "partial" | "unavailable"; checked: number; rejected: number; message: string; searchedAt: string | null };
};
export const emptyGrowthPlan = (): GrowthSearchPlan => ({ titles: [], adjacentTitles: [], excludedTitles: [], seniority: [], organizationTypes: [], industries: [], geographies: [], buyingSignals: [], exclusions: [], companyCriteria: "", reasoning: "", limit: 10, verifiedContactsOnly: false });
export const emptyGrowthDiscovery = (): GrowthDiscoveryState => ({ version: 1, revision: "", business: null, audiences: [], plan: null, companies: [], people: [], drafts: [], messages: [], discovery: { status: "not_started", checked: 0, rejected: 0, message: "", searchedAt: null } });

function csvCell(value: string) {
  const safe = /^[\s]*[=+@-]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}
export function growthProspectsCsv(state: GrowthDiscoveryState, selectedIds?: string[]) {
  const selected = selectedIds ? new Set(selectedIds) : null;
  const header = ["Company", "Website", "Domain", "Location", "Segment", "Fit score", "Fit reasons", "Person", "Role", "Email", "Email status", "Profile", "Evidence URLs", "Evidence quotes", "Checked at", "Recommended angle"];
  const rows = state.companies.filter((c) => !selected || selected.has(c.id)).map((c) => {
    const p = state.people.find((person) => person.companyId === c.id);
    return [c.name, c.website, c.domain, c.location ?? "", c.segment, String(c.fitScore), c.fitReasons.join("; "), p?.name ?? "", p?.role ?? c.targetRoles.join("; "), p?.email ?? "", p?.emailStatus ?? "unknown", p?.profileUrl ?? "", c.evidence.map((e) => e.url).join("; "), c.evidence.map((e) => e.quote).join("; "), c.lastVerifiedAt, c.recommendedAngle];
  });
  return "\uFEFF" + [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
