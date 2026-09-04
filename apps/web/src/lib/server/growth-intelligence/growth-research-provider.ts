import { runBoundedWebResearch, sanitizeResearchQuery, type ResearchProvider } from "@/lib/server/ai/ask-research-engine";
import type { GrowthSearchPlan } from "@/lib/growth-discovery";
import { GrowthDiscoveryError } from "./growth-errors";
import { record } from "./growth-state-validation";
import { text } from "./growth-discovery-core";

// Official API contract: https://docs.tavily.com/documentation/api-reference/endpoint/search
export function createGrowthSearchProvider(apiKey: string | undefined, fetchImpl: typeof fetch = fetch): ResearchProvider | null {
  if (!apiKey?.trim()) return null;
  return {
    id: "tavily",
    async search(query, options) {
      const sanitized = sanitizeResearchQuery(query);
      if (sanitized.blocked) throw new GrowthDiscoveryError("GROWTH_SEARCH_QUERY_BLOCKED", "This search cannot be sent to a public source safely.");
      const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000);
      const response = await fetchImpl("https://api.tavily.com/search", {
        method: "POST", redirect: "error", signal,
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query: sanitized.query, max_results: Math.min(5, Math.max(1, options.maxResults)), search_depth: "basic", include_answer: false, include_raw_content: false })
      });
      if (!response.ok) {
        await response.body?.cancel();
        const code = response.status === 401 || response.status === 403 ? "AUTHENTICATION" : response.status === 429 ? "RATE_LIMIT" : "UNAVAILABLE";
        throw new GrowthDiscoveryError(`GROWTH_SEARCH_${code}`, "The public company search source is unavailable. No companies were invented.");
      }
      const reader = response.body?.getReader();
      if (!reader) throw new GrowthDiscoveryError("GROWTH_SEARCH_INVALID_RESPONSE", "The search source returned no readable response.");
      const chunks: Uint8Array[] = []; let bytes = 0;
      try {
        while (true) { const part = await reader.read(); if (part.done) break; bytes += part.value.length; if (bytes > 250000) throw new Error("size"); chunks.push(part.value); }
        const buffer = new Uint8Array(bytes); let offset = 0;
        for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length; }
        const payload = record(JSON.parse(new TextDecoder().decode(buffer)));
        if (!Array.isArray(payload.results)) throw new Error("schema");
        return payload.results.slice(0, 5).flatMap(value => {
          const result = record(value), url = text(result.url, 1500), title = text(result.title, 250);
          return /^https?:\/\//.test(url) && title ? [{ url, title, snippet: text(result.content, 2000) }] : [];
        });
      } catch {
        throw new GrowthDiscoveryError(signal.aborted ? "GROWTH_SEARCH_TIMEOUT" : "GROWTH_SEARCH_INVALID_RESPONSE", "The public search response could not be validated.");
      } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    }
  };
}

export function growthSearchQueries(plan: GrowthSearchPlan) {
  const organizations = plan.organizationTypes.length ? plan.organizationTypes : [plan.companyCriteria];
  return organizations.slice(0, 3).map(organization => sanitizeResearchQuery([
    organization, plan.geographies.join(" OR "), plan.industries.slice(0, 2).join(" "), plan.buyingSignals.slice(0, 2).join(" "), "official website"
  ].filter(Boolean).join(" "))).filter(value => !value.blocked).map(value => value.query);
}

export async function researchGrowthCandidates(plan: GrowthSearchPlan, provider: ResearchProvider, signal?: AbortSignal,
  options: Pick<Parameters<typeof runBoundedWebResearch>[0], "fetchImpl" | "resolver"> = {}) {
  const queries = growthSearchQueries(plan);
  const result = await runBoundedWebResearch({ ...options, provider, signal, prompt: queries.join(" "),
    decision: { mode: "WEB_RESEARCH", policy: "search-web", querySensitivity: "sanitized", reasonCodes: ["EXPLICIT_WEB_REQUEST"], researchRequired: true, sanitizedQueries: queries, sourcePreference: [], utilityRoute: "none" }
  });
  if (signal?.aborted) throw new GrowthDiscoveryError("GROWTH_CANCELLED", "Growth search was cancelled.");
  // The shared engine may retain snippets after retrieval failure. These are only
  // candidate URLs; discovery MUST fetch each original page again before acceptance.
  return [...new Set(result.sources.map(source => source.url).filter((url): url is string => !!url))].slice(0, 8);
}
