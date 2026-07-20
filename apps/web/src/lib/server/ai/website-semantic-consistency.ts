import type { WebsiteSemanticResolution } from "@/lib/server/ai/website-niche-resolver";

export type WebsiteSemanticConsistencyResult = {
  coverage: number;
  issues: string[];
  repairRecommended: boolean;
  status: "aligned" | "insufficient_context" | "repair_recommended";
};

const ignored = new Set([
  "and", "business", "company", "for", "from", "home", "offer", "page", "people", "service", "services",
  "site", "studio", "the", "this", "website", "with"
]);

function normalize(value: string) {
  return value.toLowerCase().replace(/[_-]+/g, " ").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function tokens(values: string[]) {
  return Array.from(new Set(values
    .flatMap((value) => normalize(value).split(/\s+/))
    .filter((value) => value.length > 3 && !ignored.has(value))));
}

export function evaluateWebsiteSemanticConsistency(input: {
  businessType: string;
  entities: string[];
  sceneSubject?: string | null;
  semantic: WebsiteSemanticResolution;
  visitorCopy: string[];
  visualSubjects: string[];
}): WebsiteSemanticConsistencyResult {
  if (input.semantic.source === "generic_fallback") {
    return {
      coverage: 0,
      issues: ["The request does not contain enough business information for semantic alignment."],
      repairRecommended: false,
      status: "insufficient_context"
    };
  }

  const expected = tokens([
    input.semantic.rawBusinessPhrase ?? "",
    input.semantic.niche ?? "",
    input.semantic.subNiche ?? "",
    ...input.semantic.capabilities.slice(0, 10),
    ...input.semantic.products.slice(0, 6),
    ...input.semantic.services.slice(0, 4)
  ]);
  const content = normalize([
    input.businessType,
    ...input.entities,
    ...input.visitorCopy,
    ...input.visualSubjects,
    input.sceneSubject ?? ""
  ].join(" "));
  const matched = expected.filter((token) => content.includes(token));
  const coverage = expected.length ? Number((matched.length / expected.length).toFixed(2)) : 1;
  const identityTokens = tokens([input.semantic.rawBusinessPhrase ?? input.semantic.semanticDomain]);
  const identityPresent = identityTokens.length === 0 || identityTokens.some((token) => content.includes(token));
  const visualTokens = tokens(input.semantic.visualSubjects.slice(0, 4));
  const visualPresent = visualTokens.length === 0 || visualTokens.some((token) => content.includes(token));
  const issues = [
    !identityPresent ? `Blueprint content lost the requested business identity: ${input.semantic.semanticDomain}.` : "",
    coverage < 0.22 ? `Blueprint entity coverage is too weak for ${input.semantic.semanticDomain}.` : "",
    !visualPresent ? `Visual subject is not aligned with ${input.semantic.semanticDomain}.` : ""
  ].filter(Boolean);

  return {
    coverage,
    issues,
    repairRecommended: issues.length > 0,
    status: issues.length ? "repair_recommended" : "aligned"
  };
}
