import { buildDomainBlueprint } from "@/lib/server/ai/capability-domain-blueprint";

export type IntentIntelligence = {
  brandName: string | null;
  businessGoals: string[];
  confidence: number;
  constraints: {
    accessibility: boolean;
    calmUx: boolean;
    lowSpecFriendly: boolean;
    responsive: boolean;
  };
  domain: string;
  interactionExpectations: string[];
  motionStyle: string[];
  pageCount: number | null;
  pageConflict?: {
    listedPageCount: number;
    resolution: string;
    statedPageCount: number;
  };
  palette: string[];
  qualityExpectations: string[];
  requestedPages: string[];
  requiredFeatures: string[];
  shapeLanguage: string[];
  siteType: string | null;
  summary: string;
  typographyTone: string[];
  userIntent:
    | "add_feature"
    | "fix_bug"
    | "modify_site"
    | "new_site"
    | "question"
    | "rename"
    | "runtime_action"
    | "visual_theme_edit"
    | "visual_polish";
  visualStyle: string[];
};

type IntentInput = {
  fileList?: string[];
  prompt: string;
  projectName?: string | null;
};

const wordNumbers: Record<string, number> = {
  five: 5,
  four: 4,
  one: 1,
  single: 1,
  three: 3,
  two: 2
};

function lower(value: string) {
  return value.toLowerCase();
}

function includesAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

function isWebsiteCreationRequest(promptText: string) {
  return (
    (includesAny(promptText, ["create", "build", "design", "generate"]) ||
      /\bmake\s+(?:me|a|an|new)\b/.test(promptText)) &&
    includesAny(promptText, ["website", "site", "landing page", "web page", "pages"])
  );
}

function isRenameRequest(promptText: string) {
  if (/\b(?:do not|don't|dont|no)\s+rename\b/i.test(promptText)) {
    return false;
  }

  return (
    /\b(?:rename|replace)\b/i.test(promptText) ||
    /\bchange(?:\s+the)?\s+(?:name|text|brand|title)\b/i.test(promptText) ||
    /\bchange\s+["'`]?[a-z0-9][a-z0-9&' -]{0,80}["'`]?\s+to\s+["'`]?[a-z0-9][a-z0-9&' -]{0,80}["'`]?\b/i.test(promptText)
  );
}

function isVisualThemeEditRequest(promptText: string) {
  const colorTerms = "green|blue|pink|white|black|gold|golden|yellow|brown|cream|teal|red|maroon|gradient";

  return (
    /\b(?:change|make|update|switch|turn)\b[\s\S]{0,80}\b(?:color|colors|colour|colours|theme|palette)\b/.test(promptText) ||
    /\b(?:color|colors|colour|colours|theme|palette)\b[\s\S]{0,80}\b(?:to|from|green|blue|pink|white|black|gold|golden|yellow|brown|cream|teal|red|maroon)\b/.test(promptText) ||
    new RegExp(`\\b(?:make|turn|change|update|switch)\\b[\\s\\S]{0,100}\\b(?:${colorTerms})\\b`).test(promptText)
  );
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function extractBrandName(prompt: string) {
  const match =
    prompt.match(/\b(?:named|called)\s+([a-z0-9][a-z0-9&' -]{1,60}?)(?=\s+(?:with|and|using|that|which|for|to|it|should|as)\b|[,.!?]|$)/i) ??
    prompt.match(/\bname\s+([a-z0-9][a-z0-9&' -]{1,60}?)(?=\s+(?:with|and|using|that|which|for|to|it|should|as)\b|[,.!?]|$)/i) ??
    prompt.match(/\b(?:brand|business|company)\s+name\s+(?:is\s+)?([a-z0-9][a-z0-9&' -]{1,60}?)(?=\s+(?:with|and|using|that|which|for|to|it|should|as)\b|[,.!?]|$)/i) ??
    prompt.match(/\b(?:website|site|landing page)\s+for\s+([A-Z][A-Za-z0-9&' -]{1,60}?)(?=\s+(?:with|and|using|that|which|for|to|it|should|as)\b|[,.!?]|$)/) ??
    prompt.match(/\bfor\s+([A-Z][A-Za-z0-9&' -]{1,60}?)(?=\s+(?:with|and|using|that|which|in|it|should|as)\b|[,.!?]|$)/);

  const value = match?.[1]?.trim().replace(/\s+/g, " ") ?? null;
  const locationOnly = new Set([
    "canada",
    "toronto",
    "pakistan",
    "india",
    "bangladesh",
    "dubai",
    "uae",
    "london",
    "uk",
    "new york",
    "usa",
    "karachi",
    "lahore"
  ]);

  return value && !locationOnly.has(value.toLowerCase()) ? value : null;
}

function extractPageCount(promptText: string) {
  const numericMatch = promptText.match(/\b(\d+)\s*(?:page|pages)\b/);

  if (numericMatch?.[1]) {
    return Math.max(1, Math.min(8, Number(numericMatch[1]) || 1));
  }

  for (const [word, value] of Object.entries(wordNumbers)) {
    if (new RegExp(`\\b${word}\\s+(?:page|pages|page website)\\b`).test(promptText)) {
      return value;
    }
  }

  if (includesAny(promptText, ["multi page", "multipage", "multiple pages"])) {
    return 3;
  }

  return null;
}

function inferDomain(promptText: string, projectText: string) {
  const text = `${promptText}\n${projectText}`;
  const blueprint = buildDomainBlueprint({ prompt: promptText });

  if (blueprint.domainLabel && blueprint.domainLabel !== "business") {
    return blueprint.domainLabel;
  }

  if (includesAny(promptText, ["youtube podcast", "youtube show", "video podcast"])) {
    return "youtube podcast";
  }

  if (includesAny(promptText, ["podcast", "episode", "host", "spotify", "listen now", "microphone"])) {
    return "podcast";
  }

  if (includesAny(promptText, ["creator", "content creator", "media brand", "content studio"])) {
    return "creator";
  }

  if (includesAny(promptText, ["fish", "seafood", "fresh catch", "aquatic", "daily catch"])) {
    return "seafood";
  }

  if (includesAny(promptText, ["candle", "candles", "scent", "fragrance"])) {
    return "candle";
  }

  if (includesAny(promptText, ["bakery", "bake", "cakes", "pastry", "bread"])) {
    return "bakery";
  }

  if (includesAny(promptText, ["shoe", "shoes", "footwear", "sneaker", "sneakers", "boots"])) {
    return "shoe/footwear";
  }

  if (includesAny(promptText, ["beauty", "skincare", "skin care", "beauty cream", "cosmetic", "hydration", "glow"])) {
    return "beauty/skincare";
  }

  if (includesAny(promptText, ["car showroom", "dealership", "test drive"])) {
    return "car showroom";
  }

  if (includesAny(promptText, ["car rental", "fleet", "chauffeur", "vehicle rental"])) {
    return "car rental";
  }

  if (includesAny(promptText, ["florist", "flower", "bouquet", "petal", "rose"])) {
    return "florist";
  }

  if (includesAny(promptText, ["jewellery", "jewelry", "ring", "necklace", "diamond", "gemstone"])) {
    return "jewellery";
  }

  if (includesAny(promptText, ["restaurant", "menu", "chef", "dining", "reservation"])) {
    return "restaurant";
  }

  if (includesAny(text, ["youtube podcast", "youtube show", "video podcast"])) {
    return "youtube podcast";
  }

  if (includesAny(text, ["podcast", "episode", "host", "spotify", "listen now", "microphone"])) {
    return "podcast";
  }

  if (includesAny(text, ["creator", "content creator", "media brand", "content studio"])) {
    return "creator";
  }

  if (includesAny(text, ["fish", "seafood", "fresh catch", "aquatic", "daily catch"])) {
    return "seafood";
  }

  if (includesAny(text, ["beauty", "skincare", "skin care", "beauty cream", "cosmetic", "hydration", "glow"])) {
    return "beauty/skincare";
  }

  if (includesAny(text, ["shoe", "shoes", "footwear", "sneaker", "sneakers", "boots"])) {
    return "shoe/footwear";
  }

  if (includesAny(text, ["candle", "candles", "scent", "fragrance"])) {
    return "candle";
  }

  if (includesAny(text, ["bakery", "bake", "cakes", "pastry", "bread"])) {
    return "bakery";
  }

  if (includesAny(text, ["car showroom", "dealership", "test drive"])) {
    return "car showroom";
  }

  if (includesAny(text, ["car rental", "fleet", "chauffeur", "vehicle rental"])) {
    return "car rental";
  }

  if (includesAny(text, ["florist", "flower", "bouquet", "petal", "rose"])) {
    return "florist";
  }

  if (includesAny(text, ["jewellery", "jewelry", "ring", "necklace", "diamond", "gemstone"])) {
    return "jewellery";
  }

  if (includesAny(text, ["restaurant", "menu", "chef", "dining", "reservation"])) {
    return "restaurant";
  }

  if (
    includesAny(text, [
      "ai tooling",
      "coding",
      "developer tool",
      "dev platform",
      "engineering product",
      "programming",
      "software builder"
    ])
  ) {
    return "code/tooling";
  }

  if (includesAny(text, ["saas", "software", "dashboard", "platform", "startup"])) {
    return "SaaS";
  }

  if (includesAny(text, ["portfolio", "case study", "projects", "resume"])) {
    return "portfolio";
  }

  if (includesAny(text, ["ecommerce", "e-commerce", "shop", "store", "product grid"])) {
    return "ecommerce";
  }

  return includesAny(promptText, ["website", "site", "landing page"]) ? "generic website" : "generic website";
}

function inferSiteType(domain: string) {
  if (domain.includes("csv")) {
    return "Python data tool";
  }

  if (domain.includes("television")) {
    return "electronics and home cinema website";
  }

  if (domain.includes("motorbike") || domain.includes("motorcycle")) {
    return "motorcycle showroom and service website";
  }

  if (domain === "bike shop") {
    return "ambiguous bike retail and service website";
  }

  if (domain.includes("bicycle")) {
    return "cycling retail and service website";
  }

  if (domain.includes("perfume") || domain.includes("fragrance")) {
    return "fragrance retail and gifting website";
  }

  const map: Record<string, string> = {
    "car rental": "automotive booking site",
    "car showroom": "premium automotive lead-generation site",
    "beauty/skincare": "skincare and beauty commerce website",
    bakery: "bakery hospitality and ordering website",
    candle: "premium lifestyle commerce website",
    "code/tooling": "developer tooling website",
    creator: "creator media brand",
    ecommerce: "commerce storefront",
    florist: "local service and product website",
    "generic website": "responsive marketing website",
    jewellery: "luxury ecommerce/editorial website",
    podcast: "creator media brand",
    portfolio: "portfolio showcase",
    restaurant: "reservation-focused hospitality website",
    SaaS: "software marketing site",
    seafood: "seafood commerce and freshness website",
    "shoe/footwear": "footwear retail website",
    "youtube podcast": "creator media brand"
  };

  return map[domain] ?? `${domain} ${domain.includes("system") || domain.includes("app") ? "interface" : "website"}`;
}

function inferUserIntent(promptText: string): IntentIntelligence["userIntent"] {
  if (
    isWebsiteCreationRequest(promptText) ||
    (/\b(?:create|build|generate|design|make)\b/.test(promptText) &&
      /\b(?:system|web app|app|dashboard|inventory|crm|erp|pos|tool)\b/.test(promptText))
  ) {
    return "new_site";
  }

  if (isVisualThemeEditRequest(promptText)) {
    return "visual_theme_edit";
  }

  if (isRenameRequest(promptText)) {
    return "rename";
  }

  if (includesAny(promptText, ["restart preview", "reload preview", "stop preview", "start preview"])) {
    return "runtime_action";
  }

  if (promptText.endsWith("?") || includesAny(promptText, ["explain", "what is", "how do", "why"])) {
    return "question";
  }

  if (includesAny(promptText, ["bug", "error", "broken", "not working", "fix issue"])) {
    return "fix_bug";
  }

  if (includesAny(promptText, ["carousel", "slider", "search", "filter", "contact form", "newsletter", "chat"])) {
    return "add_feature";
  }

  if (includesAny(promptText, ["animation", "beautiful", "premium", "modern", "apple glass", "improve", "polish"])) {
    return "visual_polish";
  }

  return "modify_site";
}

function extractRequestedPages(promptText: string, domain: string, pageCount: number | null) {
  const pages: string[] = [];
  const pageTerms: Record<string, string[]> = {
    about: ["about"],
    blog: ["blog"],
    bikes: ["bikes", "motorcycles", "motorbike", "motorbikes"],
    contact: ["contact"],
    distributors: ["distributor", "distributors", "retailer", "retailers"],
    episodes: ["episode", "episodes"],
    gallery: ["gallery"],
    home: ["home", "landing"],
    menu: ["menu"],
    portfolio: ["portfolio", "work"],
    pricing: ["pricing"],
    products: ["product", "products", "lineup"],
    services: ["services", "service"],
    shop: ["shop page", "store page"],
    story: ["story", "our story"]
  };

  for (const [page, terms] of Object.entries(pageTerms)) {
    if (includesAny(promptText, terms)) {
      pages.push(page);
    }
  }

  if (domain === "youtube podcast" || domain === "podcast") {
    pages.push("home", "episodes", "about", "services", "contact");
  }

  if (pageCount && pageCount > 1) {
    pages.push("home");
  }

  const fallbackOrder = ["home", "services", "about", "contact", "gallery", "blog", "pricing", "shop"];

  for (const page of fallbackOrder) {
    if (!pageCount || pages.length >= pageCount) {
      break;
    }

    pages.push(page);
  }

  const orderedPages =
    pageCount || pages.length > 0
      ? unique(["home", ...pages]).filter((page) => pages.includes(page) || page === "home")
      : [];

  return orderedPages.slice(0, Math.max(pageCount ?? orderedPages.length, orderedPages.length));
}

function findPageConflict(pageCount: number | null, requestedPages: string[]) {
  if (!pageCount || requestedPages.length <= pageCount) {
    return undefined;
  }

  return {
    listedPageCount: requestedPages.length,
    resolution: "The prompt lists more page names than the stated count. Use the explicit listed pages instead of dropping them.",
    statedPageCount: pageCount
  };
}

function extractMatches(promptText: string, dictionary: Record<string, string[]>) {
  return Object.entries(dictionary).flatMap(([label, terms]) =>
    includesAny(promptText, terms) ? [label] : []
  );
}

function isCreamPaletteRequest(promptText: string) {
  return /\b(?:in|with|using|palette|theme|colors?|colours?)\s+cream\b/.test(promptText) ||
    /\bcream\s+(?:and|&|palette|theme|colors?|colours?)\b/.test(promptText) ||
    /\b(?:and|&)\s+cream\b/.test(promptText);
}

function inferBusinessGoals(domain: string) {
  const goals: Record<string, string[]> = {
    "car rental": ["premium presentation", "vehicle reservations", "lead capture"],
    "car showroom": ["premium presentation", "test drive leads", "buyer trust"],
    "beauty/skincare": ["product trust", "routine confidence", "beauty conversion"],
    bakery: ["orders", "freshness trust", "event inquiries"],
    candle: ["product desire", "gift conversion", "lifestyle trust"],
    "code/tooling": ["developer clarity", "technical trust", "workflow confidence"],
    creator: ["subscriptions", "authority", "sponsors"],
    ecommerce: ["product conversion", "trust", "repeat purchases"],
    florist: ["trust", "bouquet orders", "event inquiries"],
    "generic website": ["clarity", "trust", "conversion"],
    jewellery: ["luxury trust", "collection discovery", "consultation requests"],
    podcast: ["subscriptions", "authority", "sponsors"],
    portfolio: ["showcase credibility", "client inquiries", "hiring signal"],
    restaurant: ["reservations", "menu confidence", "local trust"],
    SaaS: ["signup", "clarity", "product trust"],
    seafood: ["freshness trust", "orders", "delivery credibility"],
    "shoe/footwear": ["product discovery", "retail conversion", "style trust"],
    "youtube podcast": ["subscriptions", "authority", "sponsors"]
  };

  return goals[domain] ?? buildDomainBlueprint({ prompt: domain }).businessGoals;
}

function createSummary(intent: IntentIntelligence) {
  const pageText = intent.pageCount ? `${intent.pageCount}-page ` : "";
  const brandText = intent.brandName ? ` called ${intent.brandName}` : "";
  const styleText = intent.visualStyle.length ? ` with ${intent.visualStyle.join(", ")} inspiration` : "";
  const paletteText = intent.palette.length ? `, ${intent.palette.join("/")} palette` : "";
  const shapeText = intent.shapeLanguage.length ? `, ${intent.shapeLanguage.join(", ")} interaction language` : "";
  const featureText = intent.requiredFeatures.length ? `, ${intent.requiredFeatures.join(", ")} requirements` : "";
  const siteType = intent.siteType ?? "website";
  const domainText = intent.domain.toLowerCase();
  const typeText = siteType.toLowerCase().includes(domainText)
    ? siteType
    : `${intent.domain} ${siteType}`;

  return `Detected a ${pageText}${typeText}${brandText}${styleText}${paletteText}${shapeText}${featureText}, ${intent.qualityExpectations.join(", ")} expectations, responsive and lightweight constraints.`;
}

export function buildIntentIntelligence(input: IntentInput): IntentIntelligence {
  const promptText = lower(input.prompt);
  const projectText = lower([input.projectName ?? "", ...(input.fileList ?? [])].join(" "));
  const blueprint = buildDomainBlueprint({ prompt: input.prompt });
  const domain = inferDomain(promptText, projectText);
  const pageCount = extractPageCount(promptText);
  const visualStyle = unique(
    extractMatches(promptText, {
      "Apple Glass": ["apple glass", "liquid glass"],
      bold: ["bold"],
      calm: ["calm"],
      cinematic: ["cinematic"],
      clean: ["clean"],
      dark: ["dark mode", "dark"],
      editorial: ["editorial"],
      enterprise: ["enterprise"],
      fashion: ["fashion"],
      glass: ["glass", "glassmorphism"],
      light: ["light mode", "light"],
      luxury: ["luxury"],
      minimal: ["minimal", "minimalist"],
      modern: ["modern"],
      playful: ["playful"],
      premium: ["premium"]
      ,
      "tactical glass HUD": ["the division", "ubisoft", "tactical glass", "hud", "scanline"]
    })
  );
  const palette = unique(
    extractMatches(promptText, {
      black: ["black"],
      blue: ["blue"],
      brown: ["brown"],
      cream: ["cream"],
      gold: ["gold", "golden"],
      gradient: ["gradient"],
      green: ["green"],
      maroon: ["maroon"],
      neutral: ["neutral"],
      pink: ["pink"],
      red: ["red"],
      teal: ["teal"],
      white: ["white"],
      yellow: ["yellow"]
    })
      .filter((color) => color !== "cream" || isCreamPaletteRequest(promptText))
  );
  const typographyTone = unique(
    extractMatches(promptText, {
      bold: ["bold typography", "bold text"],
      clean: ["clean typography", "clean"],
      editorial: ["editorial"],
      modern: ["modern"],
      premium: ["premium"],
      warm: ["warm"]
    })
  );
  const motionStyle = unique(
    extractMatches(promptText, {
      lightweight: ["lightweight", "low spec", "fast"],
      smooth: ["smooth", "animation", "animated", "motion"],
      subtle: ["subtle", "calm"],
      transition: ["transition", "hover"]
    })
  );
  const shapeLanguage = unique(
    extractMatches(promptText, {
      glass: ["glass"],
      rounded: ["round", "rounded", "pill"],
      sharp: ["sharp"],
      soft: ["soft"]
    })
  );
  const requiredFeatures = unique(
    extractMatches(promptText, {
      authentication: ["authentication", "auth", "login"],
      carousel: ["carousel"],
      chat: ["chat"],
      "contact form": ["contact form"],
      CTA: ["cta", "call to action"],
      dashboard: ["dashboard"],
      filters: ["filter", "filters"],
      "high quality images": ["high quality image", "high quality images", "images of", "photo", "photos"],
      newsletter: ["newsletter", "subscribe"],
      search: ["search"],
      slider: ["slider"]
    })
  );
  const interactionExpectations = unique([
    ...extractMatches(promptText, {
      "clear CTA": ["cta", "call to action"],
      "rounded buttons": ["round button", "rounded button", "rounded buttons"],
      "smooth lightweight animations": ["animation", "animated", "smooth", "motion"],
      "simple navigation": ["navigation", "nav"]
    }),
    "fast response",
    "low-distraction interaction"
  ]);
  const qualityExpectations = unique([
    ...extractMatches(promptText, {
      beautiful: ["beautiful"],
      modern: ["modern"],
      premium: ["premium", "apple glass", "luxury"],
      responsive: ["responsive"],
      unique: ["unique"]
    }),
    "premium modern",
    "responsive"
  ]);
  const requestedPages = extractRequestedPages(promptText, domain, pageCount);
  const intent: IntentIntelligence = {
    brandName: extractBrandName(input.prompt),
    businessGoals: inferBusinessGoals(domain),
    confidence: 0,
    constraints: {
      accessibility: true,
      calmUx: true,
      lowSpecFriendly: true,
      responsive: true
    },
    domain,
    interactionExpectations,
    motionStyle: motionStyle.length ? motionStyle : ["lightweight"],
    pageCount,
    pageConflict: findPageConflict(pageCount, requestedPages),
    palette,
    qualityExpectations,
    requestedPages,
    requiredFeatures,
    shapeLanguage,
    siteType: inferSiteType(domain),
    summary: "",
    typographyTone: typographyTone.length ? typographyTone : ["clean", "modern"],
    userIntent: inferUserIntent(promptText),
    visualStyle
  };
  if (blueprint.domainLabel !== "business" && domain === blueprint.domainLabel) {
    intent.businessGoals = unique([...blueprint.businessGoals, ...intent.businessGoals]);
    intent.requiredFeatures = unique([...intent.requiredFeatures, ...blueprint.modules.slice(0, 3)]);
    intent.qualityExpectations = unique([
      ...intent.qualityExpectations,
      "domain-specific output",
      "no generic developer fallback"
    ]);
  }

  const signalCount = [
    intent.domain !== "generic website",
    Boolean(intent.brandName),
    Boolean(intent.pageCount),
    intent.visualStyle.length > 0,
    intent.palette.length > 0,
    intent.requiredFeatures.length > 0,
    intent.requestedPages.length > 0
  ].filter(Boolean).length;

  intent.confidence = Math.min(0.96, 0.58 + signalCount * 0.06);
  intent.summary = createSummary(intent);

  return intent;
}
