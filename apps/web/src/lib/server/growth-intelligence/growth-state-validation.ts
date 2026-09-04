import type { GrowthBusinessTruth } from "./growth-types";

export function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");
const status = (v: unknown) => ["confirmed", "derived", "inferred", "unknown", "unsupported"].includes(String(v));
function assertion(v: unknown, list = false) {
  const a = record(v);
  return status(a.status) && typeof a.confidence === "number" && Number.isFinite(a.confidence)
    && strings(a.evidenceIds) && (a.value === null || (list ? strings(a.value) : typeof a.value === "string"));
}

// Persisted JSON is not a type assertion. Reject incomplete legacy records as a
// whole so they cannot suppress a valid canonical Website handoff.
export function validGrowthBusinessTruth(value: unknown): GrowthBusinessTruth | null {
  const v = record(value), business = record(v.business), positioning = record(v.positioning);
  if (!["category", "description", "geography", "name"].every((k) => assertion(business[k]))
    || !assertion(positioning.differentiators, true) || !assertion(positioning.valueProposition)
    || !strings(v.brandVoice) || !strings(v.constraints)) return null;
  if (!Array.isArray(v.audiences) || !v.audiences.every((item) => {
    const a = record(item);
    return typeof a.id === "string" && typeof a.segment === "string" && status(a.status)
      && [a.buyingTriggers, a.decisionCriteria, a.needs, a.objections].every(strings)
      && [a.geography, a.organizationType].every((x) => x === null || typeof x === "string");
  })) return null;
  if (!Array.isArray(v.offers) || !v.offers.every((item) => {
    const o = record(item), c = record(o.cta);
    return [o.id, o.name, o.description, o.page].every((x) => typeof x === "string")
      && [o.assetPaths, o.evidenceIds, o.features].every(strings) && assertion(o.price) && status(o.status)
      && ["category", "package", "product", "service", "unknown"].includes(String(o.type))
      && (o.category === null || typeof o.category === "string")
      && (o.cta === null || (typeof c.label === "string" && typeof c.target === "string"));
  })) return null;
  if (!Array.isArray(v.claims) || !v.claims.every((item) => {
    const c = record(item);
    return typeof c.id === "string" && typeof c.text === "string" && typeof c.reusableExternally === "boolean" && strings(c.evidenceIds) && status(c.status);
  })) return null;
  if (!Array.isArray(v.evidence) || !v.evidence.every((item) => {
    const e = record(item);
    return [e.id, e.kind, e.location, e.summary].every((x) => typeof x === "string");
  })) return null;
  const source = record(v.sourceWebsite);
  if (v.sourceWebsite !== null && !(typeof source.projectId === "string" && typeof source.revision === "string")) return null;
  return value as GrowthBusinessTruth;
}

export function persistedGrowthTruth(state: unknown) {
  return validGrowthBusinessTruth(record(record(state).project).businessTruth);
}
