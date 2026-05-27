import type { IntentIntelligence } from "@/lib/server/ai/intent-intelligence";

export type CompositionStrategy = {
  audience: string[];
  brandPositioning: string[];
  businessGoals: string[];
  businessType: string;
  contentStrategy: {
    ctaStrategy: string[];
    heroGoal: string;
    trustSignals: string[];
  };
  implementationStrategy: {
    accessibilityFirst: boolean;
    avoidHeavyAnimations: boolean;
    lightweight: boolean;
    lowSpecFriendly: boolean;
    responsive: boolean;
  };
  reasoningSummary: string;
  sectionPlan: {
    page: string;
    sections: string[];
  }[];
  siteArchitecture: {
    pageCount: number;
    pages: string[];
  };
  visualLanguage: {
    motion: string[];
    palette: string[];
    shapeLanguage: string[];
    spacingTone: string[];
    style: string[];
    typography: string[];
  };
};

function lower(value: string) {
  return value.toLowerCase();
}

function includesAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function inferBusinessType(intent: IntentIntelligence) {
  const text = lower([intent.domain, intent.siteType ?? "", intent.brandName ?? "", intent.summary].join(" "));

  if (includesAny(text, ["fish", "seafood", "aquatic", "fresh catch"])) {
    return "seafood commerce / freshness brand";
  }

  if (includesAny(text, ["candle", "candles", "scent", "fragrance"])) {
    return "premium lifestyle commerce";
  }

  if (includesAny(text, ["beauty", "skincare", "skin care", "cream", "cosmetic", "hydration", "glow"])) {
    return "beauty cream / skincare";
  }

  if (includesAny(text, ["bakery", "bake", "cakes", "pastry", "bread"])) {
    return "bakery hospitality and ordering brand";
  }

  if (intent.domain === "youtube podcast" || intent.domain === "podcast" || intent.domain === "creator") {
    return "creator media brand";
  }

  if (intent.domain === "restaurant") {
    return "hospitality and reservations";
  }

  if (intent.domain === "car showroom") {
    return "premium automotive showroom";
  }

  if (intent.domain === "car rental") {
    return "automotive rental and booking";
  }

  if (intent.domain === "florist") {
    return "floral service and gifting";
  }

  if (intent.domain === "jewellery") {
    return "luxury jewellery collections";
  }

  if (intent.domain === "SaaS") {
    return "software product marketing";
  }

  if (intent.domain === "code/tooling") {
    return "developer tooling / engineering product";
  }

  if (intent.domain === "portfolio") {
    return "professional portfolio showcase";
  }

  if (intent.domain === "ecommerce") {
    return "product commerce";
  }

  return intent.siteType ?? `${intent.domain} business website`;
}

function inferAudience(businessType: string, intent: IntentIntelligence) {
  const type = lower(businessType);

  if (includesAny(type, ["seafood", "fish"])) {
    return ["restaurants", "families", "seafood buyers", "local food customers"];
  }

  if (includesAny(type, ["candle", "lifestyle commerce"])) {
    return ["gift shoppers", "home decor buyers", "wellness customers"];
  }

  if (includesAny(type, ["beauty", "skincare", "cream"])) {
    return ["skincare buyers", "beauty shoppers", "self-care customers"];
  }

  if (includesAny(type, ["bakery"])) {
    return ["families", "event planners", "local food customers"];
  }

  if (includesAny(type, ["creator", "podcast", "media"])) {
    return ["listeners", "subscribers", "sponsors", "guests"];
  }

  if (includesAny(type, ["hospitality", "restaurant"])) {
    return ["diners", "families", "event guests", "local customers"];
  }

  if (includesAny(type, ["automotive"])) {
    return ["buyers", "test-drive leads", "business travelers", "premium vehicle shoppers"];
  }

  if (includesAny(type, ["floral"])) {
    return ["gift buyers", "event planners", "couples", "local customers"];
  }

  if (includesAny(type, ["jewellery"])) {
    return ["luxury shoppers", "gift buyers", "couples", "collectors"];
  }

  if (includesAny(type, ["software"])) {
    return ["teams", "founders", "operators", "technical buyers"];
  }

  return unique([...intent.businessGoals, "customers", "visitors"]);
}

function inferBusinessGoals(businessType: string, intent: IntentIntelligence) {
  const type = lower(businessType);

  if (includesAny(type, ["seafood", "fish"])) {
    return ["freshness trust", "orders", "delivery credibility", "quality proof"];
  }

  if (includesAny(type, ["candle", "commerce"])) {
    return ["product desire", "trust", "gift conversion", "repeat purchases"];
  }

  if (includesAny(type, ["beauty", "skincare", "cream"])) {
    return ["product trust", "routine confidence", "beauty conversion", "ingredient clarity"];
  }

  if (includesAny(type, ["bakery"])) {
    return ["orders", "menu confidence", "event inquiries", "local trust"];
  }

  if (includesAny(type, ["creator", "podcast", "media"])) {
    return ["subscriptions", "authority", "retention", "sponsors"];
  }

  if (includesAny(type, ["hospitality", "restaurant"])) {
    return ["reservations", "menu confidence", "trust", "repeat visits"];
  }

  return unique(intent.businessGoals.length ? intent.businessGoals : ["trust", "clarity", "conversion"]);
}

function inferBrandPositioning(businessType: string, intent: IntentIntelligence) {
  const type = lower(businessType);

  if (includesAny(type, ["seafood", "fish"])) {
    return ["fresh", "clean", "reliable", "premium food quality"];
  }

  if (includesAny(type, ["candle"])) {
    return ["sensory", "calm", "giftable", "lifestyle-led"];
  }

  if (includesAny(type, ["beauty", "skincare", "cream"])) {
    return ["soft", "glowing", "clean", "confidence-led"];
  }

  if (includesAny(type, ["bakery"])) {
    return ["warm", "fresh-made", "local", "welcoming"];
  }

  if (includesAny(type, ["creator", "podcast"])) {
    return ["recognizable show identity", "credible voices", "sponsor-ready", "subscriber-focused"];
  }

  if (includesAny(type, ["automotive"])) {
    return ["confident", "premium", "trustworthy", "lead-focused"];
  }

  if (includesAny(type, ["floral"])) {
    return ["emotional", "soft", "event-ready", "trustworthy"];
  }

  if (includesAny(type, ["jewellery"])) {
    return ["luxury", "editorial", "craft-led", "consultative"];
  }

  return unique(["clear", "trustworthy", ...intent.qualityExpectations.slice(0, 2)]);
}

function inferPages(intent: IntentIntelligence, businessType: string) {
  const requested = intent.requestedPages.length ? intent.requestedPages : ["home"];
  const pageCount = intent.pageCount ?? Math.max(1, requested.length);
  const pages = [...requested];
  const type = lower(businessType);

  const businessPage = includesAny(type, ["creator", "podcast", "media"])
    ? "episodes"
    : includesAny(type, ["commerce", "jewellery", "candle", "fish", "seafood", "beauty", "skincare", "cream"])
      ? "products"
      : includesAny(type, ["hospitality", "restaurant", "bakery"])
        ? "menu"
        : "services";
  const fallback = ["home", businessPage, "about", "gallery", "contact"];

  for (const page of fallback) {
    if (pages.length >= pageCount) {
      break;
    }

    pages.push(page);
  }

  return unique(pages).slice(0, pageCount);
}

function sectionsForPage(page: string, businessType: string) {
  const type = lower(businessType);

  if (page === "home") {
    if (includesAny(type, ["seafood", "fish"])) {
      return ["hero", "featured fish", "freshness promise", "delivery/services", "testimonials", "CTA"];
    }

    if (includesAny(type, ["creator", "podcast", "media"])) {
      return ["hero", "featured content", "episode highlights", "social proof", "newsletter", "CTA"];
    }

    if (includesAny(type, ["commerce", "candle", "jewellery", "beauty", "skincare", "cream"])) {
      return ["hero", "featured products", "categories", "trust", "reviews", "CTA"];
    }

    if (includesAny(type, ["hospitality", "restaurant", "bakery"])) {
      return ["hero", "menu/services", "testimonials", "booking/contact"];
    }

    return ["hero", "offerings", "trust", "CTA", "contact"];
  }

  if (page === "episodes") {
    return ["episode list", "featured video", "host notes", "subscribe CTA"];
  }

  if (page === "products") {
    return ["product grid", "categories", "quality promise", "reviews", "purchase CTA"];
  }

  if (page === "services") {
    return ["services overview", "process", "proof", "CTA"];
  }

  if (page === "menu") {
    return ["menu highlights", "specials", "freshness/story", "reservation CTA"];
  }

  if (page === "gallery") {
    return ["visual gallery", "featured details", "CTA"];
  }

  if (page === "about") {
    return ["story", "values", "trust signals", "CTA"];
  }

  if (page === "contact") {
    return ["contact details", "form", "location/service area", "CTA"];
  }

  return ["page hero", "main content", "trust", "CTA"];
}

function inferVisualLanguage(intent: IntentIntelligence, businessType: string) {
  const type = lower(businessType);
  const palette = intent.palette.length
    ? intent.palette
    : includesAny(type, ["seafood", "fish"])
      ? ["white", "blue", "teal"]
      : includesAny(type, ["beauty", "skincare", "cream"])
        ? ["white", "pink", "soft neutral"]
      : includesAny(type, ["bakery", "restaurant"])
        ? ["warm neutral", "cream", "accent"]
        : ["neutral", "accent"];

  return {
    motion: unique([...intent.motionStyle, "CSS transitions", "IntersectionObserver reveals"]),
    palette,
    shapeLanguage: intent.shapeLanguage.length ? intent.shapeLanguage : ["rounded", "soft"],
    spacingTone: includesAny(type, ["luxury", "jewellery"]) ? ["generous", "editorial"] : ["balanced", "breathable"],
    style: intent.visualStyle.length ? intent.visualStyle : ["modern", "premium", "calm"],
    typography: intent.typographyTone.length ? intent.typographyTone : ["clean", "readable", "premium"]
  };
}

function inferContentStrategy(businessType: string) {
  const type = lower(businessType);

  if (includesAny(type, ["seafood", "fish"])) {
    return {
      ctaStrategy: ["Order fresh fish", "Request delivery", "Contact for today's catch"],
      heroGoal: "Immediately communicate freshness, cleanliness, and order confidence.",
      trustSignals: ["freshness promise", "delivery reliability", "quality sourcing", "customer reviews"]
    };
  }

  if (includesAny(type, ["creator", "podcast", "media"])) {
    return {
      ctaStrategy: ["Watch latest episode", "Subscribe", "Sponsor the show", "Contact the host"],
      heroGoal: "Make the show identity memorable and push visitors toward watching or subscribing.",
      trustSignals: ["featured episodes", "host credibility", "subscriber proof", "sponsor clarity"]
    };
  }

  if (includesAny(type, ["beauty", "skincare", "cream"])) {
    return {
      ctaStrategy: ["Shop the glow", "Explore skincare", "Start your routine"],
      heroGoal: "Communicate softness, skincare confidence, ingredient care, and visible glow.",
      trustSignals: ["ingredient clarity", "routine benefits", "customer reviews", "gentle formulation"]
    };
  }

  if (includesAny(type, ["hospitality", "restaurant", "bakery"])) {
    return {
      ctaStrategy: ["Reserve", "Order now", "View menu", "Contact"],
      heroGoal: "Create appetite and booking confidence quickly.",
      trustSignals: ["menu highlights", "reviews", "fresh preparation", "location/contact clarity"]
    };
  }

  if (includesAny(type, ["automotive"])) {
    return {
      ctaStrategy: ["Book a test drive", "Explore inventory", "Contact sales"],
      heroGoal: "Create premium confidence and move visitors toward qualified leads.",
      trustSignals: ["featured models", "inspection promise", "financing/support", "testimonials"]
    };
  }

  return {
    ctaStrategy: ["Get started", "Contact", "Explore services"],
    heroGoal: "Explain the offer quickly and make the next step obvious.",
    trustSignals: ["clear offerings", "reviews", "process", "contact clarity"]
  };
}

function createReasoningSummary(strategy: Omit<CompositionStrategy, "reasoningSummary">) {
  return `Composed ${strategy.businessType} for ${strategy.audience.join(", ")} with goals of ${strategy.businessGoals.join(", ")}. Architecture: ${strategy.siteArchitecture.pageCount} page(s) (${strategy.siteArchitecture.pages.join(", ")}). Visual language: ${strategy.visualLanguage.style.join(", ")} with ${strategy.visualLanguage.palette.join("/")} palette, ${strategy.visualLanguage.shapeLanguage.join(", ")} shapes, and lightweight motion.`;
}

export function buildCompositionStrategy(intent: IntentIntelligence): CompositionStrategy {
  const businessType = inferBusinessType(intent);
  const pages = inferPages(intent, businessType);
  const strategy: Omit<CompositionStrategy, "reasoningSummary"> = {
    audience: inferAudience(businessType, intent),
    brandPositioning: inferBrandPositioning(businessType, intent),
    businessGoals: inferBusinessGoals(businessType, intent),
    businessType,
    contentStrategy: inferContentStrategy(businessType),
    implementationStrategy: {
      accessibilityFirst: true,
      avoidHeavyAnimations: true,
      lightweight: true,
      lowSpecFriendly: true,
      responsive: true
    },
    sectionPlan: pages.map((page) => ({
      page,
      sections: sectionsForPage(page, businessType)
    })),
    siteArchitecture: {
      pageCount: pages.length,
      pages
    },
    visualLanguage: inferVisualLanguage(intent, businessType)
  };

  return {
    ...strategy,
    reasoningSummary: createReasoningSummary(strategy)
  };
}
