import type { GrowthAudienceSegment, GrowthCompanySize, GrowthSearchPlan, GrowthSizeConstraint, GrowthSizeResult, GrowthSourceEvidence } from "@/lib/growth-discovery";

export function extractCompanySize(text: string): GrowthCompanySize | null {
  const value = text.replace(/[\u2010-\u2015]/g, "-");
  const range = value.match(/\b(\d[\d,]*)\s*(?:-|to)\s*(\d[\d,]*)\s*(?:employees|staff|team members)\b/i);
  const exact = value.match(/\b(\d[\d,]*)\s+(?:employees|staff|team members)\b/i);
  if (range || exact) {
    const prefix = value.slice(0, (range ?? exact)!.index).trim();
    const qualifier = prefix.match(/\b(?:about|approximately|around|over|under|at least|up to|more than|less than)\s*$|[<>~]\s*$/i)?.[0].trim().toLowerCase();
    const minEmployees = Number((range?.[1] ?? exact![1]).replace(/,/g, ""));
    const maxEmployees = Number((range?.[2] ?? exact![1]).replace(/,/g, ""));
    if (!Number.isSafeInteger(minEmployees) || !Number.isSafeInteger(maxEmployees) || minEmployees < 1 || maxEmployees < minEmployees || maxEmployees > 100000000) return null;
    if (qualifier) {
      const label = `${qualifier} ${(range ?? exact)![0]}`;
      if (range || ["about", "approximately", "around", "~"].includes(qualifier)) return { label, minEmployees: null, maxEmployees: null };
      if (["over", "more than", ">", "at least"].includes(qualifier)) return { label, minEmployees: minEmployees + (qualifier === "at least" ? 0 : 1), maxEmployees: null };
      return { label, minEmployees: null, maxEmployees: maxEmployees - (qualifier === "up to" ? 0 : 1) };
    }
    return { label: (range ?? exact)![0], minEmployees, maxEmployees };
  }
  const label = value.match(/\b(?:SMBs?|small businesses|mid[- ]siz(?:e|ed)(?: companies| businesses| firms)?|large enterprises|enterprise(?: companies| businesses| firms)?)\b/i)?.[0];
  return label ? { label, minEmployees: null, maxEmployees: null } : null;
}

export function audiencePlanFields(audience: GrowthAudienceSegment): Partial<GrowthSearchPlan> {
  const source = structuredClone(audience);
  const sourceText = [source.name, source.problem, source.whyTheyBuy].join("\n");
  const size = extractCompanySize(sourceText);
  return {
    audienceContext: source, titles: [...source.buyerRoles], organizationTypes: [...source.organizationTypes],
    geographies: [...source.geography], buyingSignals: [...source.buyingSignals], exclusions: [...source.exclusions],
    companyCriteria: source.problem, reasoning: source.whyTheyBuy,
    ...(size ? { companySize: { value: size, status: "inferred", confidence: 0.5, evidenceIds: [`audience:${source.id}`], source: "audience", sourceText } satisfies GrowthSizeConstraint } : {})
  };
}

export function applyExplicitSize(plan: GrowthSearchPlan, prompt: string): GrowthSearchPlan {
  // The caller distinguishes audience selection from explicit user requests by
  // action, not by matching the UI's generated message wording.
  const clauses = prompt.split(/[.!?;\n]/).filter(clause => !/\b(?:exclude|without|avoid|no longer|not|don't|keep|preserve|unchanged)\b/i.test(clause));
  const sourceText = clauses.find(clause => /\b(?:companies|businesses|firms|organizations|employee|employees|staff)\b/i.test(clause) && extractCompanySize(clause));
  if (!sourceText) return plan;
  return { ...plan, companySize: { value: extractCompanySize(sourceText)!, status: "confirmed", confidence: 1, evidenceIds: ["explicit_user_instruction:company_size"], source: "user", sourceText: sourceText.trim().slice(0, 2000) } };
}

export function validSizeConstraint(value: unknown): value is GrowthSizeConstraint {
  if (!value || typeof value !== "object") return false;
  const c = value as GrowthSizeConstraint, v = c.value;
  const bound = (n: unknown) => n === null || (typeof n === "number" && Number.isSafeInteger(n) && n > 0 && n <= 100000000);
  return !!v && typeof v.label === "string" && v.label.length <= 2000 && bound(v.minEmployees) && bound(v.maxEmployees)
    && (v.minEmployees === null || v.maxEmployees === null || v.minEmployees <= v.maxEmployees)
    && ["inferred", "confirmed"].includes(c.status) && ["audience", "user"].includes(c.source)
    && typeof c.sourceText === "string" && c.sourceText.length <= 4000 && c.confidence >= 0 && c.confidence <= 1
    && Array.isArray(c.evidenceIds) && c.evidenceIds.length <= 10 && c.evidenceIds.every(id => typeof id === "string");
}

export function validAudienceContext(value: unknown): value is GrowthAudienceSegment {
  if (!value || typeof value !== "object") return false;
  const a = value as GrowthAudienceSegment;
  return [a.id, a.name, a.problem, a.whyTheyBuy].every(v => typeof v === "string" && v.length <= 2000)
    && [a.buyerRoles, a.organizationTypes, a.geography, a.buyingSignals, a.exclusions].every(v => Array.isArray(v) && v.length <= 50 && v.every(x => typeof x === "string" && x.length <= 2000)) && a.status === "inferred";
}

export function validSizeResult(value: unknown): value is GrowthSizeResult {
  if (!value || typeof value !== "object") return false;
  const r = value as GrowthSizeResult;
  return ["match", "mismatch", "unverified"].includes(r.match) && ["confirmed", "inferred"].includes(r.constraintStatus)
    && (r.value === null || validSizeConstraint({ value: r.value, status: "inferred", source: "audience", confidence: 0, evidenceIds: [], sourceText: "" }))
    && Array.isArray(r.evidence) && r.evidence.length <= 20 && r.evidence.every(e => e && [e.url,e.quote,e.field,e.checkedAt].every(v => typeof v === "string") && /^https?:\/\//.test(e.url));
}

export function companySizeResult(plan: GrowthSearchPlan, evidence: GrowthSourceEvidence[]): GrowthSizeResult | undefined {
  if (!plan.companySize?.value) return undefined;
  const constraint = plan.companySize;
  const proofs = evidence.filter(e => e.field === "companySize");
  const values = proofs.map(e => extractCompanySize(e.quote)).filter((v): v is GrowthCompanySize => v !== null);
  const expected = constraint.value!;
  const classify = (actual: GrowthCompanySize): GrowthSizeResult["match"] => {
    if (expected.minEmployees !== null || expected.maxEmployees !== null) {
      if ((expected.minEmployees === null || (actual.minEmployees !== null && actual.minEmployees >= expected.minEmployees)) && (expected.maxEmployees === null || (actual.maxEmployees !== null && actual.maxEmployees <= expected.maxEmployees))) return "match";
      if ((expected.minEmployees !== null && actual.maxEmployees !== null && actual.maxEmployees < expected.minEmployees) || (expected.maxEmployees !== null && actual.minEmployees !== null && actual.minEmployees > expected.maxEmployees)) return "mismatch";
      return "unverified";
    }
    return expected.label.toLowerCase() === actual.label.toLowerCase() ? "match" : "unverified";
  };
  const states = values.map(classify);
  const match = !states.length || new Set(states).size > 1 ? "unverified" : states[0];
  return { match, value: values.length === 1 ? values[0] : null, constraintStatus: constraint.status, evidence: proofs };
}

export function sizeRejection(result: GrowthSizeResult | undefined): string | null {
  if (!result || result.constraintStatus !== "confirmed" || result.match === "match") return null;
  return result.match === "mismatch" ? "GROWTH_DISCOVERY_WRONG_COMPANY_SIZE" : "GROWTH_DISCOVERY_SIZE_UNVERIFIED";
}
