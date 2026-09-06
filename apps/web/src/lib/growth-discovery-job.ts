import type { GrowthFunnel } from "./growth-discovery";

export type GrowthDiscoveryProfile = {
  categories: Array<{ term: string; parent: string }>;
  geographies: string[];
  fitSignals: string[];
};
export type GrowthCandidate = { url: string; attempts: number };
export type GrowthJobWork = { kind: "search"; query: string } | { kind: "verify"; candidates: GrowthCandidate[] };
export type GrowthDiscoveryJob = {
  version: 1; id: string;
  status: "queued" | "running" | "paused" | "complete" | "exhausted" | "cancelled";
  reason: string | null; createdAt: string; updatedAt: string;
  target: number; profile: GrowthDiscoveryProfile;
  queries: Array<{ text: string; round: number }>; queryIndex: number;
  candidates: GrowthCandidate[]; cursor: number; domains: string[];
  limits: { queries: number; candidates: number; pageFetches: number; activeMs: number };
  activeMs: number; pageRequests?: number; funnel: GrowthFunnel;
  lease: { token: string; until: number; work: GrowthJobWork } | null;
};

export function validGrowthJob(value: unknown): value is GrowthDiscoveryJob {
  try {
  if (!value || typeof value !== "object") return false;
  const j = value as GrowthDiscoveryJob;
  const str = (v: unknown): v is string => typeof v === "string" && v.length <= 2000;
  const num = (v: unknown) => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
  const candidate = (v: GrowthCandidate) => !!v && str(v.url) && /^https?:\/\//.test(v.url) && num(v.attempts) && v.attempts <= 2;
  return j.version === 1 && str(j.id) && ["queued", "running", "paused", "complete", "exhausted", "cancelled"].includes(j.status)
    && (j.reason === null || str(j.reason)) && str(j.createdAt) && str(j.updatedAt) && num(j.target) && j.target >= 1 && j.target <= 500
    && !!j.profile && Array.isArray(j.profile.categories) && j.profile.categories.length <= 24 && j.profile.categories.every(c => str(c.term) && str(c.parent))
    && Array.isArray(j.profile.geographies) && j.profile.geographies.length <= 20 && j.profile.geographies.every(str)
    && Array.isArray(j.profile.fitSignals) && j.profile.fitSignals.length <= 20 && j.profile.fitSignals.every(str)
    && Array.isArray(j.queries) && j.queries.length <= 150 && j.queries.every(q => str(q.text) && num(q.round) && q.round <= 3)
    && num(j.queryIndex) && j.queryIndex <= j.queries.length && Array.isArray(j.candidates) && j.candidates.length <= 4000 && j.candidates.every(candidate)
    && num(j.cursor) && j.cursor <= j.candidates.length && Array.isArray(j.domains) && j.domains.length <= 4000 && j.domains.every(str)
    && !!j.limits && num(j.limits.queries) && j.limits.queries <= 150 && num(j.limits.candidates) && j.limits.candidates <= 4000
    && num(j.limits.pageFetches) && j.limits.pageFetches <= 6000 && num(j.limits.activeMs) && j.limits.activeMs <= 7200000 && num(j.activeMs)
    && (j.pageRequests === undefined || (num(j.pageRequests) && j.pageRequests <= 6000))
    && !!j.funnel && ["target", "rounds", "queries", "searchResults", "uniqueDomains", "duplicateDomains", "candidates", "preRetrievalRejected", "fetched", "fetchFailures", "recognized", "audienceMatches", "evidenceValid", "accepted"].every(k => num(j.funnel[k as keyof GrowthFunnel]))
    && Array.isArray(j.funnel.resultsPerQuery) && !!j.funnel.rejections && Object.entries(j.funnel).every(([k, v]) => k === "resultsPerQuery" ? Array.isArray(v) && v.length <= 150 && v.every(num) : k === "rejections" ? !!v && typeof v === "object" && Object.values(v).every(num) : num(v))
    && (j.lease === null || (!!j.lease && str(j.lease.token) && num(j.lease.until) && !!j.lease.work && (j.lease.work.kind === "search" ? str(j.lease.work.query) : j.lease.work.kind === "verify" && Array.isArray(j.lease.work.candidates) && j.lease.work.candidates.length <= 2 && j.lease.work.candidates.every(candidate))));
  } catch { return false; }
}
