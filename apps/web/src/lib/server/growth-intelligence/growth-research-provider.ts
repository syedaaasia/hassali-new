import { sanitizeResearchQuery, type ResearchProvider } from "@/lib/server/ai/ask-research-engine";
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
      let response: Response;
      try {
        response = await fetchImpl("https://api.tavily.com/search", {
          method: "POST", redirect: "error", signal,
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ query: sanitized.query, max_results: Math.min(5, Math.max(1, options.maxResults)), search_depth: "basic", include_answer: false, include_raw_content: false })
        });
      } catch {
        const cancelled = options.signal?.aborted;
        throw new GrowthDiscoveryError(cancelled ? "GROWTH_CANCELLED" : signal.aborted ? "GROWTH_SEARCH_TIMEOUT" : "GROWTH_SEARCH_NETWORK",
          cancelled ? "Growth search was cancelled." : signal.aborted ? "The public company search source timed out. Your criteria were saved; no companies were invented." : "The public company search source could not be reached. Your criteria were saved; no companies were invented.");
      }
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
  // Find organizations first. Intent signals belong to fit verification, not
  // search terms that redirect a company search toward the seller's products.
  return organizations.slice(0, 3).map(organization => sanitizeResearchQuery([
    organization, plan.geographies.join(" OR "), plan.industries.slice(0, 2).join(" "), "official website"
  ].filter(Boolean).join(" "))).filter(value => !value.blocked).map(value => value.query);
}

export async function researchGrowthCandidates(plan: GrowthSearchPlan, provider: ResearchProvider, signal?: AbortSignal) {
  const queries = growthSearchQueries(plan);
  const batches: string[][] = [];
  let failure: unknown;
  for (const query of queries) {
    if (signal?.aborted) throw new GrowthDiscoveryError("GROWTH_CANCELLED", "Growth search was cancelled.");
    try {
      const results = await provider.search(query, { maxResults: 5, signal });
      batches.push(results.slice(0, 5).map(result => result.url));
    } catch (error) { failure = error; }
  }
  if (signal?.aborted) throw new GrowthDiscoveryError("GROWTH_CANCELLED", "Growth search was cancelled.");
  if (!batches.length && failure) throw failure;
  // Balance organization queries rather than applying article/research ranking.
  // URLs and snippets are leads only: discoverCompanies owns SSRF-safe original
  // retrieval and evidence validation before any company is accepted.
  const candidates: string[] = [], hosts = new Set<string>();
  for (let rank = 0; rank < 5 && candidates.length < 8; rank++) {
    for (const batch of batches) {
      try {
        const url = new URL(batch[rank]);
        const host = url.hostname.replace(/^www\./, "");
        if (!/^https?:$/.test(url.protocol) || url.username || url.password || hosts.has(host)) continue;
        hosts.add(host); candidates.push(url.href);
        if (candidates.length === 8) break;
      } catch { /* Invalid candidate URLs are not eligible for retrieval. */ }
    }
  }
  return candidates;
}
