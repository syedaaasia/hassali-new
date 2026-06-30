import type { GeneratorContract } from "@/lib/server/ai/generator-contract";
import type { IntentIntelligence } from "@/lib/server/ai/intent-intelligence";
import type { ProposalContext } from "@/lib/server/ai/proposal-context";
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

export function selectLayoutTemplate(domain: string): WebsiteLayoutType | "brand_marketing" {
  const d = domain.toLowerCase();

  if (
    d.includes("car rental") ||
    d.includes("rent a car") ||
    d.includes("vehicle rental") ||
    d.includes("car hire") ||
    d.includes("rental cars") ||
    d.includes("fleet rental") ||
    d.includes("airport rentals")
  ) {
    return "property_showcase";
  }

  if (
    d.includes("mobile phone shop") ||
    d.includes("phone shop") ||
    d.includes("smartphone store") ||
    d.includes("mobile store") ||
    d.includes("cellphone shop") ||
    d.includes("phone retail") ||
    d.includes("phone accessories") ||
    d.includes("unlocked phones") ||
    d.includes("phone repair")
  ) {
    return "catalog_commerce";
  }

  if (
    d.includes("cola") ||
    d.includes("soft drink") ||
    d.includes("beverage") ||
    d.includes("drink") ||
    d.includes("soda")
  ) {
    return "beverage_brand";
  }

  if (
    d.includes("restaurant") ||
    d.includes("cafe") ||
    d.includes("dining") ||
    d.includes("food") ||
    d.includes("seafood")
  ) {
    return "table_to_order";
  }

  if (
    d.includes("shop") ||
    d.includes("store") ||
    d.includes("ecommerce") ||
    d.includes("retail")
  ) {
    return "catalog_commerce";
  }

  return "brand_marketing";
}

export function detectWebsiteIndustry(input: {
  composition: CompositionStrategy;
  generatorContract?: GeneratorContract;
  intent: IntentIntelligence;
  proposalContext?: ProposalContext;
}): WebsiteIndustry {
  const text = [
    input.intent.domain,
    input.intent.siteType ?? "",
    input.composition.businessType,
    input.composition.reasoningSummary,
    input.proposalContext?.domain ?? "",
    input.proposalContext?.sourcePrompt ?? "",
    ...(input.generatorContract?.requiredCopySignals ?? []),
    ...(input.generatorContract?.requiredEntities ?? [])
  ].join(" ").toLowerCase();
  const layoutTemplate = selectLayoutTemplate(text);

  if (includesAny(text, ["car rental", "rent a car", "vehicle rental", "car hire", "rental cars", "fleet rental", "airport rentals", "car_rental"])) return "car_rental";
  if (includesAny(text, [
    "mobile phone shop",
    "phone shop",
    "smartphone store",
    "mobile store",
    "cellphone shop",
    "phone retail",
    "phone accessories",
    "iphone shop",
    "samsung phone shop",
    "android phone shop",
    "unlocked phones",
    "phone repair shop",
    "mobile_phone_shop"
  ])) return "mobile_phone_shop";
  if (layoutTemplate === "beverage_brand") return "beverage";
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
  proposalContext?: ProposalContext;
  requiredCount: number | null;
}) {
  if (input.proposalContext?.mode === "WEBSITE" && input.proposalContext.pages.length) {
    return Array.from(new Set(input.proposalContext.pages.map(normalizePage).filter(Boolean)));
  }

  const explicit = input.generatorContract?.generatorMode === "website_generation"
    ? input.generatorContract.requiredPages.map(normalizePage).filter(Boolean)
    : [];

  if (explicit.length) {
    return Array.from(new Set(explicit));
  }

  const industryPage: Record<WebsiteIndustry, string> = {
    ai_product: "workflow",
    beverage: "lineup",
    car_rental: "services",
    ecommerce: "products",
    healthcare: "services",
    marketplace: "listings",
    mobile_phone_shop: "services",
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
    beverage: ["campaigns", "distribution", "retail"],
    car_rental: ["fleet", "booking", "blog"],
    ecommerce: ["collections", "support", "delivery"],
    healthcare: ["team", "appointments", "reviews"],
    marketplace: ["sell", "categories", "trust"],
    mobile_phone_shop: ["accessories", "repairs", "support"],
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
  proposalContext?: ProposalContext;
}): WebsitePlan {
  const industry = detectWebsiteIndustry(input);
  const profile = getWebsiteIndustryProfile(industry);
  const requiredCount = input.generatorContract?.requiredPageCount ?? null;
  const pages = pagePlan({
    generatorContract: input.generatorContract,
    industry,
    proposalContext: input.proposalContext,
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
    sourceOfTruthDomain: input.proposalContext?.domain ?? input.generatorContract?.authoritativeDomain ?? input.intent.domain,
    sourceOfTruthPages: pages,
    tokensStudioExportAvailable: true,
    visualStrategy: profile.visualStrategy
  };
}

export function summarizeWebsitePlan(plan: WebsitePlan) {
  return `${plan.industry} ${plan.layoutType}: ${plan.requiredSections.map((section) => section.id).join(", ")}`;
}
