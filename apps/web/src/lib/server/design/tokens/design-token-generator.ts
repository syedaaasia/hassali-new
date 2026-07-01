import type { WebsiteIndustry } from "@/lib/server/ai/website-section-registry";
import type {
  DesignTokenThemeId,
  GeneratedDesignTokens
} from "@/lib/server/design/tokens/design-token-types";
import { getDesignTokenTheme } from "@/lib/server/design/tokens/design-token-registry";
import { validateDesignTokens } from "@/lib/server/design/tokens/design-token-validator";
import {
  exportTokensStudioJson,
  tokensToCssVariables
} from "@/lib/server/design/tokens/tokens-studio-exporter";

const industryThemeMap: Record<WebsiteIndustry, DesignTokenThemeId> = {
  ai_product: "ai_product",
  beverage: "default_dark",
  bicycle_shop: "luxury_ecommerce",
  car_rental: "real_estate",
  crm_software: "saas",
  dental_clinic: "healthcare",
  ecommerce: "luxury_ecommerce",
  healthcare: "healthcare",
  marketplace: "marketplace",
  mobile_phone_shop: "luxury_ecommerce",
  portfolio: "portfolio",
  real_estate: "real_estate",
  restaurant: "restaurant",
  seafood_restaurant: "restaurant",
  upholstery: "portfolio",
  saas: "saas"
};

export function selectDesignTokenTheme(input: {
  industry: WebsiteIndustry;
  intentText?: string;
}): DesignTokenThemeId {
  const text = input.intentText?.toLowerCase() ?? "";

  if (text.includes("dark") || text.includes("apple glass") || text.includes("glass ui")) {
    if (input.industry === "healthcare" || input.industry === "real_estate") {
      return industryThemeMap[input.industry];
    }

    return input.industry === "ecommerce" ? "luxury_ecommerce" : "default_dark";
  }

  if (text.includes("seafood") || text.includes("ocean") || text.includes("fresh catch")) {
    return "default_dark";
  }

  return industryThemeMap[input.industry] ?? "default_dark";
}

export function generateDesignTokens(input: {
  industry: WebsiteIndustry;
  intentText?: string;
  theme?: DesignTokenThemeId;
}): GeneratedDesignTokens {
  const theme = input.theme ?? selectDesignTokenTheme(input);
  const definition = getDesignTokenTheme(theme);
  const validation = validateDesignTokens({ theme, tokens: definition.tokens });

  return {
    cssVariables: tokensToCssVariables(definition.tokens),
    theme,
    themeName: definition.name,
    tokenCount: validation.tokenCount,
    tokens: definition.tokens,
    tokensStudioExport: exportTokensStudioJson(definition.tokens),
    validation
  };
}
