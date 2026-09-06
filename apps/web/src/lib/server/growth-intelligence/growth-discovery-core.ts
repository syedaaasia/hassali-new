import { createHash } from "node:crypto";
import { emptyGrowthDiscovery, emptyGrowthPlan, type GrowthAudienceSegment, type GrowthDiscoveryState, type GrowthOutreachDraft, type GrowthProspectCompany, type GrowthSearchPlan, type GrowthSourceEvidence } from "@/lib/growth-discovery";
import { record } from "./growth-state-validation";
import { validGrowthJob } from "@/lib/growth-discovery-job";

export const text = (v: unknown, max = 600) => typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";
export const list = (v: unknown, max = 20) => Array.isArray(v) ? [...new Set(v.map((x) => text(x, 120)).filter(Boolean))].slice(0, max) : [];
export const id = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 16);
const key = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
const listFields = ["titles", "adjacentTitles", "excludedTitles", "seniority", "organizationTypes", "industries", "geographies", "buyingSignals", "exclusions"] as const;
type ListField = typeof listFields[number];

export function validSearchPlanShape(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const plan = record(value);
  if (Array.isArray(plan.titles) && Array.isArray(plan.organizationTypes)
    && plan.titles.some(title => typeof title === "string" && (plan.organizationTypes as unknown[]).some(org => typeof org === "string" && key(org) === key(title)))) return false;
  return listFields.every(field => plan[field] === undefined || (Array.isArray(plan[field]) && plan[field].every(item => typeof item === "string")))
    && ["companyCriteria", "reasoning"].every(field => plan[field] === undefined || typeof plan[field] === "string")
    && (plan.limit === undefined || (typeof plan.limit === "number" && Number.isFinite(plan.limit)))
    && (plan.verifiedContactsOnly === undefined || typeof plan.verifiedContactsOnly === "boolean");
}

export function normalizeSearchPlan(value: unknown): GrowthSearchPlan {
  const v = record(value), result = emptyGrowthPlan();
  for (const field of listFields) result[field] = list(v[field]);
  result.titles = result.titles.filter((t) => !result.excludedTitles.some((e) => key(e) === key(t)));
  result.adjacentTitles = result.adjacentTitles.filter((t) => ![...result.titles, ...result.excludedTitles].some((e) => key(e) === key(t)));
  result.companyCriteria = text(v.companyCriteria, 1200); result.reasoning = text(v.reasoning, 1000);
  result.limit = typeof v.limit === "number" && Number.isFinite(v.limit) ? Math.max(1, Math.min(500, Math.floor(v.limit))) : 100;
  result.verifiedContactsOnly = v.verifiedContactsOnly === true;
  return result;
}

export function enforceOrganizationAuthority(plan: GrowthSearchPlan, value: unknown, prompt: string): GrowthSearchPlan {
  const authority = record(value);
  if (typeof authority.exclusive !== "boolean") throw new Error("GROWTH_ORGANIZATION_AUTHORITY_REQUIRED");
  if (!authority.exclusive) return plan;
  const quote = text(authority.quote, 2000), values = list(authority.values);
  if (!quote || !text(prompt, 4000).toLowerCase().includes(quote.toLowerCase()) || !/\b(only|just|exclusively|nothing except)\b/i.test(quote)
    || !values.length || values.some(v => !quote.toLowerCase().includes(v.toLowerCase()))) throw new Error("GROWTH_ORGANIZATION_AUTHORITY_UNGROUNDED");
  // Search specialties may expand candidate retrieval, never the acceptance set.
  return { ...plan, organizationTypes: values };
}

export function mutateSearchPlan(previous: GrowthSearchPlan, operations: unknown): GrowthSearchPlan {
  if (!Array.isArray(operations) || !operations.length || operations.length > 30) throw new Error("GROWTH_INVALID_MUTATION");
  const next = structuredClone(previous);
  for (const item of operations) {
    const op = record(item), field = String(op.field);
    if (field === "limit" && op.op === "set" && typeof op.value === "number" && Number.isFinite(op.value)) next.limit = op.value;
    else if (field === "verifiedContactsOnly" && op.op === "set" && typeof op.value === "boolean") next.verifiedContactsOnly = op.value;
    else if (field === "companyCriteria" && op.op === "set" && typeof op.value === "string") next.companyCriteria = text(op.value, 1200);
    else if (listFields.includes(field as ListField)) {
      if (!Array.isArray(op.values) || !op.values.every(v => typeof v === "string") || (op.op !== "set" && !op.values.length)) throw new Error("GROWTH_INVALID_MUTATION");
      const f = field as ListField, values = list(op.values);
      if (op.op === "add") next[f] = [...next[f], ...values];
      else if (op.op === "remove") {
        next[f] = next[f].filter((x) => !values.some((y) => key(x) === key(y)));
        if (f === "titles" || f === "adjacentTitles") next.excludedTitles.push(...values);
      }
      else if (op.op === "set") next[f] = values;
      else throw new Error("GROWTH_INVALID_MUTATION");
    } else throw new Error("GROWTH_INVALID_MUTATION");
  }
  return normalizeSearchPlan(next);
}

export function normalizeAudiences(value: unknown): GrowthAudienceSegment[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 4).flatMap((item) => {
    const a = record(item), name = text(a.name, 120);
    if (!name || !text(a.problem) || !text(a.whyTheyBuy)) return [];
    return [{ id: id(name), name, problem: text(a.problem), whyTheyBuy: text(a.whyTheyBuy), buyerRoles: list(a.buyerRoles), organizationTypes: list(a.organizationTypes), geography: list(a.geography), buyingSignals: list(a.buyingSignals), exclusions: list(a.exclusions), status: "inferred" as const }];
  });
}

export function readDiscoveryState(value: unknown): GrowthDiscoveryState {
  const v = record(value);
  // Only the versioned product slice is accepted. Historical strategy artifacts
  // remain separately available and never masquerade as prospect records.
  const str = (x: unknown) => typeof x === "string";
  const nullable = (x: unknown) => x === null || str(x);
  const strings = (x: unknown) => Array.isArray(x) && x.length <= 50 && x.every(str);
  const array = (x: unknown, validate: (item: unknown) => boolean, limit = 500) => Array.isArray(x) && x.length <= limit && x.every(validate);
  const evidence = (x: unknown) => array(x, (item) => { const e = record(item); return [e.url, e.quote, e.field, e.checkedAt].every(str) && /^https?:\/\//.test(String(e.url)); }, 20);
  const validBusiness = v.business === null || (() => { const b = record(v.business); return [b.name, b.offer, b.description, b.valueProposition].every(str) && nullable(b.geography) && nullable(b.website) && evidence(b.evidence) && ["inferred", "user_provided", "website_handoff"].includes(String(b.status)); })();
  const validPlan = v.plan === null || (() => { const p = record(v.plan); return listFields.every((f) => strings(p[f])) && str(p.companyCriteria) && str(p.reasoning) && typeof p.limit === "number" && p.limit >= 1 && p.limit <= 500 && typeof p.verifiedContactsOnly === "boolean"; })();
  const d = record(v.discovery);
  if (v.version !== 1 || typeof v.revision !== "string" || !validBusiness || !validPlan
    || !array(v.companies, (item) => { const c = record(item); return [c.id, c.name, c.website, c.domain, c.segment, c.lastVerifiedAt, c.recommendedAngle].every(str) && /^https?:\/\//.test(String(c.website)) && nullable(c.location) && nullable(c.organizationType) && strings(c.targetRoles) && strings(c.fitReasons) && evidence(c.evidence) && typeof c.fitScore === "number" && c.fitScore >= 0 && c.fitScore <= 100; })
    || !array(v.audiences, (item) => { const a = record(item); return [a.id, a.name, a.problem, a.whyTheyBuy].every(str) && [a.buyerRoles, a.organizationTypes, a.geography, a.buyingSignals, a.exclusions].every(strings) && a.status === "inferred"; }, 4)
    || !array(v.people, (item) => { const p = record(item); return [p.id, p.companyId, p.name, p.role].every(str) && [p.profileUrl, p.email, p.phone].every(nullable) && evidence(p.evidence) && ["unknown", "public_unverified", "verified"].includes(String(p.emailStatus)); })
    || !array(v.messages, (item) => { const m = record(item); return ["user", "assistant"].includes(String(m.role)) && str(m.text); }, 20)
    || !array(v.drafts, (item) => { const draft = record(item); return [draft.companyId, draft.subject, draft.body, draft.recommendedAngle].every(str) && evidence(draft.personalizationEvidence) && draft.status === "draft"; })
    || !["not_started", "complete", "partial", "unavailable"].includes(String(d.status)) || !str(d.message) || !nullable(d.searchedAt) || typeof d.checked !== "number" || typeof d.rejected !== "number") return emptyGrowthDiscovery();
  const state = { ...value as GrowthDiscoveryState };
  if (state.job && !validGrowthJob(state.job)) delete state.job;
  return state;
}

export type RetrievedGrowthPage = { url: string; title?: string; content: string; retrievedAt: string };
const normalized = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
export function groundedEvidence(value: unknown, page: RetrievedGrowthPage): GrowthSourceEvidence[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 8).flatMap((item) => {
    const e = record(item), quote = text(e.quote, 600), field = text(e.field, 100);
    return quote.length >= 12 && field && normalized(page.content).includes(normalized(quote))
      ? [{ url: page.url, quote, field, checkedAt: page.retrievedAt }] : [];
  });
}

export function normalizeProspect(value: unknown, page: RetrievedGrowthPage, plan: GrowthSearchPlan): GrowthProspectCompany | null {
  const v = record(value), name = text(v.name, 140), evidence = groundedEvidence(v.evidence, page);
  if (!name || !normalized(`${page.title ?? ""} ${page.content}`).includes(normalized(name)) || !evidence.length) return null;
  const supported = (field: string, raw: unknown) => {
    const s = text(raw, 150);
    return s && evidence.some((e) => e.field === field && normalized(e.quote).includes(normalized(s))) ? s : null;
  };
  const matches = Array.isArray(v.matches) ? v.matches.flatMap((item) => {
    const m = record(item), field = String(m.field), criterion = text(m.criterion, 120), quote = text(m.quote, 600);
    if (!listFields.includes(field as ListField) || ["adjacentTitles", "excludedTitles", "exclusions"].includes(field)) return [];
    if (!plan[field as ListField].some((x) => key(x) === key(criterion)) || !normalized(page.content).includes(normalized(quote)) || quote.length < 12) return [];
    return [{ field, criterion, quote }];
  }).slice(0, 8) : [];
  if (!matches.length || v.isCompany !== true || v.excluded === true) return null;
  for (const match of matches) if (!evidence.some((e) => e.quote === match.quote && e.field === match.field)) evidence.push({ url: page.url, quote: match.quote, field: match.field, checkedAt: page.retrievedAt });
  const fields = new Set(matches.map((m) => m.field));
  // Coarse evidence coverage, not a probability of purchase.
  const fitScore = Math.min(90, 30 + fields.size * 15);
  const location = supported("location", v.location), organizationType = supported("organizationType", v.organizationType);
  return { id: id(new URL(page.url).hostname.replace(/^www\./, "")), name, website: page.url, domain: new URL(page.url).hostname.replace(/^www\./, ""), location, organizationType, segment: plan.organizationTypes.join(" / ") || plan.companyCriteria, fitScore, fitReasons: matches.map((m) => `${m.criterion}: ${m.quote}`), evidence, lastVerifiedAt: page.retrievedAt, targetRoles: plan.titles, recommendedAngle: matches[0].quote };
}

export function draftOutreach(company: GrowthProspectCompany, business: GrowthDiscoveryState["business"]): GrowthOutreachDraft {
  if (!business?.offer) throw new Error("GROWTH_OFFER_REQUIRED");
  const proof = company.evidence.find((e) => e.field === "buyingSignals") ?? company.evidence[0];
  if (!proof) throw new Error("GROWTH_EVIDENCE_REQUIRED");
  return { companyId: company.id, subject: `${business.offer.slice(0, 65)} for ${company.name}`, recommendedAngle: company.recommendedAngle, body: `Hello ${company.name} team,\n\nYour website describes your work this way: "${proof.quote}"\n\nAt ${business.name}, we offer ${business.offer}. ${business.valueProposition}\n\nWould the person responsible for ${company.targetRoles.join(" / ") || "this area"} be open to a short conversation about whether this could fit your needs?`, personalizationEvidence: [proof], status: "draft" };
}
