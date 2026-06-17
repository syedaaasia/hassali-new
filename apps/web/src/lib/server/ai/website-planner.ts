import type { GeneratorContract } from "@/lib/server/ai/generator-contract";
import type { IntentIntelligence } from "@/lib/server/ai/intent-intelligence";
import type { CompositionStrategy } from "@/lib/server/ai/reasoning-composition";
import {
  getWebsiteIndustryProfile,
  type WebsiteIndustry,
  type WebsiteLayoutType,
  type WebsiteSectionDefinition
} from "@/lib/server/ai/website-section-registry";
import { generateDesignTokens } from "@/lib/server/design/tokens/design-token-generator";
import type {
  DesignTokenThemeId,
  GeneratedDesignTokens
} from "@/lib/server/design/tokens/design-token-types";

export type WebsitePlan = {
  audience: string;
  contentStrategy: string[];
  designTokenCount: number;
  designTokenTheme: DesignTokenThemeId;
  designTokenValidationPassed: boolean;
  designTokens: GeneratedDesignTokens;
  goal: string;
  industry: WebsiteIndustry;
  layoutStrategy: string;
  layoutType: WebsiteLayoutType;
  optionalSections: WebsiteSectionDefinition[];
  pages: string[];
  requiredSections: WebsiteSectionDefinition[];
  sectionRegistryVersion: "11.2B";
  sourceOfTruthDomain: string | null;
  sourceOfTruthPages: string[];
  tokensStudioExportAvailable: boolean;
  visualStrategy: string;
};

function includesAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

export function detectWebsiteIndustry(input: {
  composition: CompositionStrategy;
  generatorContract?: GeneratorContract;
  intent: IntentIntelligence;
}): WebsiteIndustry {
  const text = [
    input.intent.domain,
    input.intent.siteType ?? "",
    input.composition.businessType,
    input.composition.reasoningSummary,
    ...(input.generatorContract?.requiredCopySignals ?? []),
    ...(input.generatorContract?.requiredEntities ?? [])
  ].join(" ").toLowerCase();

  if (includesAny(text, ["ai product", "ai tool", "ai workspace", "automation ai", "assistant", "llm"])) return "ai_product";
  if (includesAny(text, ["real estate", "property", "properties", "realtor", "homes", "apartments"])) return "real_estate";
  if (includesAny(text, ["seafood", "fresh catch", "oyster", "lobster", "restaurant", "cafe", "coffee", "menu", "food", "pizza", "burger", "dining"])) return "restaurant";
  if (includesAny(text, ["clinic", "dental", "health", "healthcare", "doctor", "patient", "medical"])) return "healthcare";
  if (includesAny(text, ["portfolio", "photographer", "designer", "artist", "creator", "agency portfolio"])) return "portfolio";
  if (includesAny(text, ["marketplace", "buyers", "sellers", "vendors", "multi vendor", "listings"])) return "marketplace";
  if (includesAny(text, ["ecommerce", "e-commerce", "shop", "store", "products", "catalog", "controller", "furniture", "flower", "floral", "tv"])) return "ecommerce";

  return "saas";
}

function normalizePage(page: string) {
  const normalized = page.toLowerCase().trim();

  if (normalized === "home" || normalized === "index") return "home";
  if (normalized === "blogs") return "blog";
  if (normalized === "shop") return "products";

  return normalized.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "page";
}

function pagePlan(input: {
  generatorContract?: GeneratorContract;
  industry: WebsiteIndustry;
  requiredCount: number | null;
}) {
  const explicit = input.generatorContract?.generatorMode === "website_generation"
    ? input.generatorContract.requiredPages.map(normalizePage).filter(Boolean)
    : [];

  if (explicit.length) {
    return Array.from(new Set(explicit));
  }

  const industryPage: Record<WebsiteIndustry, string> = {
    ai_product: "workflow",
    ecommerce: "products",
    healthcare: "services",
    marketplace: "listings",
    portfolio: "work",
    real_estate: "listings",
    restaurant: "menu",
    saas: "features"
  };
  const base = ["home", industryPage[input.industry], "about", "contact"];
  if (input.industry === "restaurant") {
    const target = Math.max(input.requiredCount ?? 5, 4);
    return ["home", "menu", "about", "gallery", "contact"].slice(0, target);
  }
  const target = Math.max(input.requiredCount ?? base.length, base.length);
  const extras: Record<WebsiteIndustry, string[]> = {
    ai_product: ["security", "use-cases", "pricing"],
    ecommerce: ["collections", "support", "delivery"],
    healthcare: ["team", "appointments", "reviews"],
    marketplace: ["sell", "categories", "trust"],
    portfolio: ["case-studies", "services", "process"],
    real_estate: ["neighborhoods", "agents", "valuation"],
    restaurant: ["reservations", "catering", "popular"],
    saas: ["pricing", "integrations", "customers"]
  };

  return Array.from(new Set([...base, ...extras[input.industry]])).slice(0, target);
}

export function planWebsite(input: {
  composition: CompositionStrategy;
  generatorContract?: GeneratorContract;
  intent: IntentIntelligence;
}): WebsitePlan {
  const industry = detectWebsiteIndustry(input);
  const profile = getWebsiteIndustryProfile(industry);
  const requiredCount = input.generatorContract?.requiredPageCount ?? null;
  const pages = pagePlan({
    generatorContract: input.generatorContract,
    industry,
    requiredCount
  });
  const designTokens = generateDesignTokens({
    industry,
    intentText: [
      input.intent.domain,
      input.intent.siteType ?? "",
      input.composition.businessType,
      input.composition.reasoningSummary,
      input.generatorContract?.authoritativeDomain ?? "",
      input.generatorContract?.authoritativeBusinessType ?? ""
    ].join(" ")
  });

  return {
    audience: profile.audience,
    contentStrategy: profile.contentStrategy,
    designTokenCount: designTokens.tokenCount,
    designTokenTheme: designTokens.theme,
    designTokenValidationPassed: designTokens.validation.passed,
    designTokens,
    goal: profile.goal,
    industry,
    layoutStrategy: `${profile.layoutType} layout with industry-specific section rhythm and no generic hero/features/pricing repetition.`,
    layoutType: profile.layoutType,
    optionalSections: profile.optionalSections,
    pages,
    requiredSections: profile.requiredSections,
    sectionRegistryVersion: "11.2B",
    sourceOfTruthDomain: input.generatorContract?.authoritativeDomain ?? input.intent.domain,
    sourceOfTruthPages: pages,
    tokensStudioExportAvailable: true,
    visualStrategy: profile.visualStrategy
  };
}

export function summarizeWebsitePlan(plan: WebsitePlan) {
  return `${plan.industry} ${plan.layoutType}: ${plan.requiredSections.map((section) => section.id).join(", ")}`;
}
