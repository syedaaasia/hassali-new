import type { TranslatedIntentSpec } from "@/lib/server/ai/intent-translator";
import type { ProjectContract } from "@/lib/server/ai/project-contract";

export type WebsiteSourceOfTruth = {
  businessType: string | null;
  domain: string | null;
  memoryIgnoredForNewProject: boolean;
  pages: string[];
  prompt: string;
  visualStrategy: string;
};

const pageAliases: Record<string, string> = {
  index: "home",
  products: "products",
  product: "products",
  services: "services",
  service: "services",
  story: "about",
  "our-story": "about"
};

const domainDefaults: Record<string, string[]> = {
  car_rental: ["home", "about", "services", "blog", "contact"],
  car_showroom: ["home", "about", "services", "blog", "contact"],
  mobile_phone_shop: ["home", "about", "services", "contact"],
  upholstery: ["home", "about", "services", "blog", "contact"],
  restaurant: ["home", "menu", "about", "gallery", "contact"],
  seafood_restaurant: ["home", "menu", "about", "gallery", "contact"]
};

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => pageAliases[normalize(value)] ?? normalize(value)).filter(Boolean)));
}

export function isNewWebsiteRequest(prompt: string) {
  return /\b(?:build|create|generate|design|make)\b[\s\S]{0,80}\b(?:website|site|web page|landing page)\b/i.test(prompt);
}

export function buildWebsiteSourceOfTruth(input: {
  contract?: ProjectContract | null;
  prompt: string;
  translatedIntent: TranslatedIntentSpec;
}) {
  const domain = input.translatedIntent.domain;
  const count = input.translatedIntent.pages.count;
  const fromPrompt = unique(input.translatedIntent.pages.names);
  const defaults = domain ? domainDefaults[domain] ?? [] : [];
  const seed = fromPrompt.length ? fromPrompt : defaults;
  const pages = [...seed];

  if (count && pages.length < count) {
    for (const page of ["home", "menu", "about", "gallery", "contact", "services", "pricing", "blog"]) {
      if (pages.length >= count) break;
      if (!pages.includes(page)) pages.push(page);
    }
  }

  const fallbackPages = pages.length
    ? pages
    : input.contract?.projectType === "WEBSITE" && !isNewWebsiteRequest(input.prompt)
      ? []
      : ["home", "about", "contact"];

  const source: WebsiteSourceOfTruth = {
    businessType: input.translatedIntent.businessType,
    domain,
    memoryIgnoredForNewProject: isNewWebsiteRequest(input.prompt),
    pages: count ? fallbackPages.slice(0, count) : fallbackPages,
    prompt: input.prompt,
    visualStrategy: domain === "seafood_restaurant"
      ? "premium ocean-inspired seafood restaurant design with deep navy, aqua, pearl, fresh catch imagery, reservation CTAs, and warm dining atmosphere"
      : input.translatedIntent.visualLanguage ?? input.translatedIntent.style ?? "domain-specific responsive website"
  };

  return source;
}

export function pageToHtmlPath(page: string) {
  const normalized = normalize(page);

  return normalized === "home" ? "index.html" : `${normalized}.html`;
}
