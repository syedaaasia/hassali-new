import type { ProjectContract } from "@/lib/server/ai/project-contract";

export type IntentTranslatorMode = "ASK" | "CODE" | "WEBSITE";

export type IntentPages = {
  count: number | null;
  kind: "multi_page" | "single_page" | "unknown";
  names: string[];
};

export type TranslatedIntentSpec = {
  businessType: string | null;
  confidence: number;
  constraints: string[];
  country: string | null;
  domain: string | null;
  extractedEntities: string[];
  mode: IntentTranslatorMode;
  pages: IntentPages;
  requestedFeatures: string[];
  style: string | null;
  theme: string | null;
  vibe: string | null;
  visualLanguage: string | null;
};

type TranslateIntentInput = {
  contract?: ProjectContract | null;
  mode: IntentTranslatorMode;
  prompt: string;
};

type DomainProfile = {
  businessType: string;
  domain: string;
  terms: string[];
};

const domainProfiles: DomainProfile[] = [
  {
    businessType: "Cola Company / Soft Drinks",
    domain: "cola company / soft drinks",
    terms: ["cola", "soft drink", "soft drinks", "soda", "beverage", "beverages", "fizzy drink"]
  },
  {
    businessType: "Seafood Restaurant",
    domain: "seafood_restaurant",
    terms: ["seafood restaurant", "seafood", "fresh catch", "oyster", "lobster", "fish grill", "daily catch"]
  },
  {
    businessType: "Dental Clinic",
    domain: "dental",
    terms: ["dental clinic", "dentist", "tooth", "teeth", "root canal", "orthodontic"]
  },
  {
    businessType: "Electronics Retail",
    domain: "electronics_retail",
    terms: ["television", "tv shop", "tv store", "electronics shop", "home cinema", "oled", "qled"]
  },
  {
    businessType: "Mobile Phone Shop",
    domain: "mobile_phone_shop",
    terms: [
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
      "phone repair shop"
    ]
  },
  {
    businessType: "Coffee Shop",
    domain: "coffee",
    terms: ["coffee shop", "cafe", "café", "espresso", "latte", "roastery"]
  },
  {
    businessType: "Ice Cream Brand",
    domain: "ice_cream",
    terms: ["ice cream", "gelato", "scoops", "sundae", "sundaes", "cones", "frozen dessert", "ice cream brand", "ice cream store"]
  },
  {
    businessType: "Floral / Bridal Flower Store",
    domain: "floral",
    terms: ["bridal flower", "flower shop", "florist", "floral", "bouquet", "wedding flowers"]
  },
  {
    businessType: "CRM System",
    domain: "crm",
    terms: ["crm", "customer relationship", "customers", "leads", "deals pipeline"]
  },
  {
    businessType: "Business System",
    domain: "business_system",
    terms: ["inventory system", "erp", "stock", "suppliers", "reports", "purchase orders"]
  },
  {
    businessType: "Perfume / Fragrance Shop",
    domain: "perfume",
    terms: ["perfume", "fragrance", "scent", "oud", "musk", "cologne"]
  },
  {
    businessType: "Restaurant",
    domain: "restaurant",
    terms: ["restaurant", "dining", "menu", "chef", "reserve table"]
  },
  {
    businessType: "Bakery",
    domain: "bakery",
    terms: ["bakery", "cake", "pastry", "bread", "dessert"]
  },
  {
    businessType: "Car Rental / Vehicle Rental",
    domain: "car_rental",
    terms: ["car rental", "rent a car", "rent-a-car", "vehicle rental", "car hire", "rental cars", "airport rentals", "fleet rental"]
  },
  {
    businessType: "Car Showroom",
    domain: "car_showroom",
    terms: ["car showroom", "vehicle showroom", "dealership", "test drive", "fleet"]
  },
  {
    businessType: "Software Product",
    domain: "saas",
    terms: ["saas", "software product", "dashboard app", "web app", "api platform"]
  }
];

const styleTerms = [
  "premium",
  "luxury",
  "modern",
  "minimal",
  "corporate",
  "editorial",
  "playful",
  "futuristic",
  "cinematic",
  "clean"
];

const visualLanguageTerms = [
  "apple glass",
  "glass",
  "glassmorphism",
  "tactical glass",
  "the division",
  "dark theme",
  "light theme",
  "gradient"
];

const featureTerms: Record<string, string[]> = {
  analytics: ["analytics", "metrics", "reports"],
  appointments: ["appointments", "appointment", "schedule", "booking"],
  auth: ["auth", "authentication", "login", "signup", "sign up"],
  billing: ["billing", "subscription", "subscriptions", "invoice", "payment"],
  blog: ["blog", "blogs", "articles"],
  checkout: ["checkout", "cart", "add to cart", "ecommerce", "e-commerce"],
  contact: ["contact", "contact form"],
  dashboard: ["dashboard", "admin panel"],
  database: ["database", "db", "postgres"],
  inventory: ["inventory", "stock", "warehouse"],
  search: ["search", "filter", "filters"]
};

const countryTerms: Record<string, string[]> = {
  Canada: ["canada", "toronto", "vancouver", "montreal"],
  India: ["india", "delhi", "mumbai", "hyderabad india"],
  Pakistan: ["pakistan", "karachi", "lahore", "islamabad", "hyderabad pakistan"],
  "United Arab Emirates": ["uae", "dubai", "abu dhabi"],
  "United Kingdom": ["united kingdom", "uk", "london"],
  "United States": ["united states", "usa", "america", "new york"]
};

const pageAliases: Record<string, string> = {
  "about us": "about",
  articles: "blog",
  blogs: "blog",
  gallery: "gallery",
  home: "home",
  menu: "menu",
  "our story": "story",
  service: "services"
};

function normalizeText(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function includesAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

function extractDomain(text: string, contract?: ProjectContract | null) {
  const profile = domainProfiles.find((candidate) => includesAny(text, candidate.terms));

  if (profile) {
    return {
      businessType: profile.businessType,
      domain: profile.domain,
      fromPrompt: true
    };
  }

  return {
    businessType: contract?.domain ?? null,
    domain: null,
    fromPrompt: false
  };
}

function extractStyle(text: string) {
  return styleTerms.find((term) => text.includes(term)) ?? null;
}

function extractVisualLanguage(text: string) {
  const visual = visualLanguageTerms.find((term) => text.includes(term));

  if (visual === "the division") {
    return "tactical glass";
  }

  return visual ?? null;
}

function extractFeatures(text: string) {
  return Object.entries(featureTerms)
    .filter(([, terms]) => includesAny(text, terms))
    .map(([feature]) => feature);
}

function extractCountry(text: string) {
  const match = Object.entries(countryTerms).find(([, terms]) => includesAny(text, terms));

  return match?.[0] ?? null;
}

function wordNumber(value: string) {
  const map: Record<string, number> = {
    five: 5,
    four: 4,
    one: 1,
    six: 6,
    three: 3,
    two: 2
  };

  return map[value] ?? null;
}

function normalizePageName(value: string) {
  const normalized = normalizeText(value).replace(/[^a-z0-9 ]+/g, " ").trim();

  return pageAliases[normalized] ?? normalized.replace(/\s+/g, "-");
}

function extractPages(text: string): IntentPages {
  const countMatch = text.match(/\b(\d+|one|two|three|four|five|six)\s+(?:page|pages)\b/);
  const count = countMatch
    ? Number.isNaN(Number(countMatch[1]))
      ? wordNumber(countMatch[1])
      : Number(countMatch[1])
    : text.includes("single page")
      ? 1
      : null;
  const listedPagesMatch = text.match(/\b(?:pages?|with)\s*:?\s*,?\s+((?:home|about us|about|services?|blogs?|blog|contact|story|our story|products?|menu|pricing|gallery|shop)(?:\s*,?\s*(?:and\s+)?(?:home|about us|about|services?|blogs?|blog|contact|story|our story|products?|menu|pricing|gallery|shop))*)/);
  const names = listedPagesMatch?.[1]
    ?.split(/\s*,\s*|\s+and\s+/)
    .map(normalizePageName)
    .filter(Boolean) ?? [];
  const directNames = listedPagesMatch ? [] : unique(
    ["home", "menu", "about", "gallery", "contact", "services", "pricing", "products", "blog"]
      .filter((page) => new RegExp(`\\b${page}\\b`).test(text))
      .map(normalizePageName)
  );
  const mergedNames = unique([...names, ...directNames]);

  return {
    count: mergedNames.length || count ? Math.max(count ?? 0, mergedNames.length) || null : null,
    kind: (count && count > 1) || mergedNames.length > 1 ? "multi_page" : count === 1 ? "single_page" : "unknown",
    names: mergedNames
  };
}

function extractTheme(text: string) {
  const colors = [
    "black",
    "blue",
    "brown",
    "cream",
    "gold",
    "golden",
    "green",
    "maroon",
    "pink",
    "red",
    "teal",
    "white",
    "yellow"
  ].filter((color) => text.includes(color));
  const normalized = colors.map((color) => (color === "golden" ? "gold" : color));

  return normalized.length ? unique(normalized).join(" / ") : null;
}

function extractConstraints(text: string, country: string | null, pages: IntentPages, theme: string | null) {
  return unique([
    country ? `country:${country}` : "",
    pages.count ? `pages:${pages.count}` : "",
    pages.names.length ? `page-names:${pages.names.join(", ")}` : "",
    theme ? `theme:${theme}` : "",
    text.includes("responsive") ? "responsive" : "",
    text.includes("mobile first") || text.includes("mobile-first") ? "mobile-first" : "",
    text.includes("dark theme") ? "dark-theme" : "",
    text.includes("light theme") ? "light-theme" : ""
  ]);
}

function extractEntities(input: {
  businessType: string | null;
  domain: string | null;
  mode: IntentTranslatorMode;
  requestedFeatures: string[];
  text: string;
}) {
  if (input.mode === "ASK") {
    return includesAny(input.text, ["what is", "explain", "how does", "why"])
      ? ["explanation_topic"]
      : ["general_question"];
  }

  if (input.domain === "crm") {
    return unique(["User", "Customer", "Lead", "Deal", "Invoice", ...input.requestedFeatures]);
  }

  if (input.domain === "business_system") {
    return unique(["Product", "Stock", "Supplier", "Sale", "Report", ...input.requestedFeatures]);
  }

  if (input.mode === "WEBSITE") {
    return unique([input.businessType ?? "Business", "Brand", "Pages", "CTA", ...input.requestedFeatures]);
  }

  return unique(input.requestedFeatures);
}

function confidenceFor(input: {
  country: string | null;
  domainFromPrompt: boolean;
  pages: IntentPages;
  requestedFeatures: string[];
  style: string | null;
  theme: string | null;
  visualLanguage: string | null;
}) {
  let score = 0.38;

  if (input.domainFromPrompt) score += 0.24;
  if (input.requestedFeatures.length) score += 0.12;
  if (input.style) score += 0.08;
  if (input.visualLanguage) score += 0.06;
  if (input.theme) score += 0.06;
  if (input.country) score += 0.04;
  if (input.pages.count || input.pages.names.length) score += 0.08;

  return Math.min(0.96, Number(score.toFixed(2)));
}

export function translateIntent(input: TranslateIntentInput): TranslatedIntentSpec {
  const text = normalizeText(input.prompt);
  const domain = extractDomain(text, input.contract);
  const style = extractStyle(text);
  const visualLanguage = extractVisualLanguage(text);
  const requestedFeatures = extractFeatures(text);
  const country = extractCountry(text);
  const pages = extractPages(text);
  const theme = extractTheme(text);
  const constraints = extractConstraints(text, country, pages, theme);
  const extractedEntities = extractEntities({
    businessType: domain.businessType,
    domain: domain.domain,
    mode: input.mode,
    requestedFeatures,
    text
  });

  return {
    businessType: domain.businessType,
    confidence: confidenceFor({
      country,
      domainFromPrompt: domain.fromPrompt,
      pages,
      requestedFeatures,
      style,
      theme,
      visualLanguage
    }),
    constraints,
    country,
    domain: domain.domain,
    extractedEntities,
    mode: input.mode,
    pages,
    requestedFeatures,
    style,
    theme,
    vibe: style,
    visualLanguage
  };
}

export function summarizeTranslatedIntent(spec: TranslatedIntentSpec) {
  return [
    `domain=${spec.domain ?? "unknown"}`,
    `businessType=${spec.businessType ?? "unknown"}`,
    spec.style ? `style=${spec.style}` : null,
    spec.visualLanguage ? `visualLanguage=${spec.visualLanguage}` : null,
    spec.country ? `country=${spec.country}` : null,
    spec.pages.count ? `pages=${spec.pages.count}` : null,
    spec.requestedFeatures.length ? `features=${spec.requestedFeatures.join(", ")}` : null,
    `confidence=${spec.confidence.toFixed(2)}`
  ].filter(Boolean).join("; ");
}
