import type { GrowthDiscoveryState } from "@/lib/growth-discovery";
import type { RetrievedGrowthPage } from "./growth-discovery-core";
import { GrowthDiscoveryError } from "./growth-errors";

export function growthBusinessUrl(input: string): string | null {
  const match = input.match(/https?:\/\/[^\s<>]+/i)?.[0];
  if (!match) return null;
  let url: URL;
  try { url = new URL(match); }
  catch { throw new GrowthDiscoveryError("GROWTH_INVALID_URL", "Enter a valid public website URL."); }
  if (url.username || url.password) throw new GrowthDiscoveryError("GROWTH_INVALID_URL", "Use a public website URL without credentials.");
  url.hash = "";
  return url.href;
}

// These are source excerpts, not inferred offers, customer types or verified claims.
export function capturedGrowthBusiness(page: RetrievedGrowthPage): NonNullable<GrowthDiscoveryState["business"]> {
  const lines = page.content.split(/\n+/).map(line => line.trim());
  // Prefer paragraph-sized text over menus; retain verbatim evidence, not a summary.
  const paragraphs = lines.filter(line => line.length >= 120);
  const excerpts = (paragraphs.length ? paragraphs : lines.filter(line => line.length >= 40)).slice(0, 4);
  if (!excerpts.length && page.content.trim()) excerpts.push(page.content.trim());
  if (!excerpts.length) throw new GrowthDiscoveryError("GROWTH_PAGE_UNREADABLE", "No readable source text was returned.");
  const evidence = excerpts.map(quote => ({ field: "source_excerpt", quote: quote.slice(0, 600), url: page.url, checkedAt: page.retrievedAt }));
  if (page.title?.trim()) evidence.unshift({ field: "page_title", quote: page.title.trim().slice(0, 140), url: page.url, checkedAt: page.retrievedAt });
  return { name: page.title?.trim().slice(0, 140) || new URL(page.url).hostname, description: "", offer: "", valueProposition: "", geography: null, website: page.url, evidence, status: "source_only" };
}
