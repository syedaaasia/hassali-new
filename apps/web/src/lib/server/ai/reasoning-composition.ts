import { buildDomainBlueprint } from "@/lib/server/ai/capability-domain-blueprint";
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
  const blueprint = buildDomainBlueprint({ prompt: text });

  if (includesAny(text, ["fish", "seafood", "aquatic", "fresh catch"])) {
    return "seafood commerce / freshness brand";
  }

  if (includesAny(text, ["perfume", "fragrance", "scent", "oud", "musk", "cologne", "attar"])) {
    return "perfume shop / fragrance retail and gifting";
  }

  if (includesAny(text, ["candle", "candles"])) {
    return "premium lifestyle commerce";
  }

  if (includesAny(text, ["television", "smart tv", "oled", "qled", "home cinema", "soundbar", "wall mounting"])) {
    return "television shop / electronics and home cinema retail";
  }

  if (includesAny(text, ["motorbike", "motorcycle", "engine service", "oil change", "helmet", "spare parts"])) {
    return "motorbike shop / motorcycle retail and service";
  }

  if (includesAny(text, ["bike shop", "bike business"]) && !includesAny(text, ["bicycle", "cycling", "motorbike", "motorcycle"])) {
    return "bike shop / ambiguous rider retail and service";
  }

  if (includesAny(text, ["ice cream", "icecream", "gelato", "scoop", "sundae", "frozen dessert", "kulfi"])) {
    return "ice cream shop / frozen dessert brand";
  }

  if (includesAny(text, ["bakery", "bake", "cakes", "pastry", "bread"])) {
    return "bakery hospitality and ordering brand";
  }

  if (includesAny(text, ["shoe", "shoes", "footwear", "sneaker", "sneakers", "boots"])) {
    return "footwear retail";
  }

  if (includesAny(text, ["beauty", "skincare", "skin care", "beauty cream", "cosmetic", "hydration", "glow"])) {
    return "beauty cream / skincare";
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

  if (blueprint.domainLabel !== "business") {
    return `${blueprint.domainLabel} / ${blueprint.productCategory}`;
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

  if (includesAny(type, ["ice cream", "frozen dessert", "gelato", "scoop"])) {
    return ["families", "dessert lovers", "local visitors", "event customers"];
  }

  if (includesAny(type, ["perfume", "fragrance", "scent"])) {
    return ["fragrance lovers", "gift buyers", "luxury shoppers", "scent explorers"];
  }

  if (includesAny(type, ["television", "home cinema", "electronics"])) {
    return ["families upgrading their living room", "home cinema buyers", "showroom visitors", "installation customers"];
  }

  if (includesAny(type, ["motorbike", "motorcycle"])) {
    return ["riders", "commuters", "touring customers", "service customers"];
  }

  if (includesAny(type, ["ambiguous rider", "bike shop"])) {
    return ["riders", "commuters", "families", "service customers"];
  }

  if (includesAny(type, ["beauty", "skincare", "cream"])) {
    return ["skincare buyers", "beauty shoppers", "self-care customers"];
  }

  if (includesAny(type, ["bakery"])) {
    return ["families", "event planners", "local food customers"];
  }

  if (includesAny(type, ["footwear", "shoe", "sneaker"])) {
    return ["style-conscious shoppers", "sneaker buyers", "everyday customers"];
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

  return unique([...intent.businessGoals, ...buildDomainBlueprint({ prompt: type }).audience, "customers", "visitors"]);
}

function inferBusinessGoals(businessType: string, intent: IntentIntelligence) {
  const type = lower(businessType);

  if (includesAny(type, ["seafood", "fish"])) {
    return ["freshness trust", "orders", "delivery credibility", "quality proof"];
  }

  if (includesAny(type, ["candle", "commerce"])) {
    return ["product desire", "trust", "gift conversion", "repeat purchases"];
  }

  if (includesAny(type, ["ice cream", "frozen dessert", "gelato", "scoop"])) {
    return ["flavor discovery", "shop visits", "seasonal special orders", "catering inquiries"];
  }

  if (includesAny(type, ["perfume", "fragrance", "scent"])) {
    return ["signature scent discovery", "gift conversion", "luxury collection trust", "consultation bookings"];
  }

  if (includesAny(type, ["television", "home cinema", "electronics"])) {
    return ["product comparison", "showroom visits", "installation bookings", "warranty confidence"];
  }

  if (includesAny(type, ["motorbike", "motorcycle"])) {
    return ["motorcycle sales", "engine service bookings", "rider gear sales", "test ride leads"];
  }

  if (includesAny(type, ["ambiguous rider", "bike shop"])) {
    return ["rider confidence", "service bookings", "parts and gear discovery", "showroom visits"];
  }

  if (includesAny(type, ["beauty", "skincare", "cream"])) {
    return ["product trust", "routine confidence", "beauty conversion", "ingredient clarity"];
  }

  if (includesAny(type, ["bakery"])) {
    return ["orders", "menu confidence", "event inquiries", "local trust"];
  }

  if (includesAny(type, ["footwear", "shoe", "sneaker"])) {
    return ["product discovery", "retail conversion", "style trust", "repeat purchases"];
  }

  if (includesAny(type, ["creator", "podcast", "media"])) {
    return ["subscriptions", "authority", "retention", "sponsors"];
  }

  if (includesAny(type, ["hospitality", "restaurant"])) {
    return ["reservations", "menu confidence", "trust", "repeat visits"];
  }

  return unique(
    intent.businessGoals.length
      ? intent.businessGoals
      : buildDomainBlueprint({ prompt: type }).businessGoals
  );
}

function inferBrandPositioning(businessType: string, intent: IntentIntelligence) {
  const type = lower(businessType);

  if (includesAny(type, ["seafood", "fish"])) {
    return ["fresh", "clean", "reliable", "premium food quality"];
  }

  if (includesAny(type, ["candle"])) {
    return ["sensory", "calm", "giftable", "lifestyle-led"];
  }

  if (includesAny(type, ["ice cream", "frozen dessert", "gelato", "scoop"])) {
    return ["joyful", "creamy", "fresh", "family-friendly", "treat-led"];
  }

  if (includesAny(type, ["perfume", "fragrance", "scent"])) {
    return ["luxury editorial", "sensory", "gift-ready", "consultative"];
  }

  if (includesAny(type, ["television", "home cinema", "electronics"])) {
    return ["cinematic", "comparison-led", "install-ready", "warranty-backed"];
  }

  if (includesAny(type, ["motorbike", "motorcycle"])) {
    return ["rider-focused", "mechanical", "showroom-ready", "safety-led"];
  }

  if (includesAny(type, ["ambiguous rider", "bike shop"])) {
    return ["balanced rider language", "service-ready", "showroom-aware", "safety-led"];
  }

  if (includesAny(type, ["beauty", "skincare", "cream"])) {
    return ["soft", "glowing", "clean", "confidence-led"];
  }

  if (includesAny(type, ["bakery"])) {
    return ["warm", "fresh-made", "local", "welcoming"];
  }

  if (includesAny(type, ["footwear", "shoe", "sneaker"])) {
    return ["stylish", "durable", "retail-ready", "collection-led"];
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

  return unique([
    ...buildDomainBlueprint({ prompt: type }).visualMood,
    "clear",
    "trustworthy",
    ...intent.qualityExpectations.slice(0, 2)
  ]);
}

function inferPages(intent: IntentIntelligence, businessType: string) {
  const requested = intent.requestedPages.length ? intent.requestedPages : ["home"];
  const pageCount = Math.max(intent.pageCount ?? 1, requested.length);
  const pages = [...requested];
  const type = lower(businessType);

  const businessPage = includesAny(type, ["creator", "podcast", "media"])
    ? "episodes"
    : includesAny(type, ["television", "electronics"])
      ? "services"
    : includesAny(type, ["motorbike", "motorcycle", "ambiguous rider", "bike shop"])
      ? "bikes"
    : includesAny(type, ["commerce", "jewellery", "candle", "fish", "seafood", "beauty", "skincare", "cream", "ice cream", "gelato", "scoop", "perfume", "fragrance", "scent", "footwear", "shoe", "sneaker"])
      ? "products"
      : includesAny(type, ["hospitality", "restaurant", "bakery"])
        ? "menu"
        : "services";
  const blueprintPages = buildDomainBlueprint({ prompt: type }).modules.filter((item) =>
    ["home", "flavors", "products", "services", "about", "gallery", "contact", "catering", "bikes", "blog", "story"].includes(item)
  );
  const fallback = unique(["home", businessPage, ...blueprintPages, "about", "gallery", "contact"]);

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
    if (includesAny(type, ["television", "home cinema", "electronics"])) {
      return ["hero", "smart TV showroom", "OLED QLED LED comparison", "home cinema setup", "wall mounting installation", "warranty support CTA"];
    }

    if (includesAny(type, ["motorbike", "motorcycle"])) {
      return ["hero", "motorcycle showroom", "engine service", "helmets and rider gear", "spare parts", "test ride CTA"];
    }

    if (includesAny(type, ["ambiguous rider", "bike shop"])) {
      return ["hero", "bike showroom", "service and parts", "rider safety gear", "test rides or fittings", "booking CTA"];
    }

    if (includesAny(type, ["ice cream", "frozen dessert", "gelato", "scoop"])) {
      return ["hero", "signature flavors", "scoops and cones", "seasonal specials", "catering", "store visit CTA"];
    }

    if (includesAny(type, ["perfume", "fragrance", "scent"])) {
      return ["hero", "signature scent collections", "fragrance notes", "bottle and tester experience", "gifting sets", "scent consultation CTA"];
    }

    if (includesAny(type, ["seafood", "fish"])) {
      return ["hero", "featured fish", "freshness promise", "delivery/services", "testimonials", "CTA"];
    }

    if (includesAny(type, ["creator", "podcast", "media"])) {
      return ["hero", "featured content", "episode highlights", "social proof", "newsletter", "CTA"];
    }

    if (includesAny(type, ["commerce", "candle", "jewellery", "beauty", "skincare", "cream", "perfume", "fragrance", "scent", "footwear", "shoe", "sneaker"])) {
      return ["hero", "featured products", "categories", "trust", "reviews", "CTA"];
    }

    if (includesAny(type, ["hospitality", "restaurant", "bakery"])) {
      return ["hero", "menu/services", "testimonials", "booking/contact"];
    }

    return buildDomainBlueprint({ prompt: type }).sections;
  }

  if (page === "flavors") {
    return ["flavor grid", "seasonal specials", "cones and cups", "family favorites", "order CTA"];
  }

  if (page === "episodes") {
    return ["episode list", "featured video", "host notes", "subscribe CTA"];
  }

  if (page === "products") {
    return includesAny(type, ["perfume", "fragrance", "scent"])
      ? ["scent collection cards", "note families", "bottle testers", "gift sets", "signature scent CTA"]
      : ["product grid", "categories", "quality promise", "reviews", "purchase CTA"];
  }

  if (page === "story") {
    return includesAny(type, ["perfume", "fragrance", "scent"])
      ? ["fragrance origin", "scent families", "bottle ritual", "consultation CTA"]
      : ["origin story", "values", "customer next step", "CTA"];
  }

  if (page === "bikes") {
    return includesAny(type, ["motorbike", "motorcycle"])
      ? ["motorcycle lineup", "test ride options", "rider gear", "spare parts", "service CTA"]
      : includesAny(type, ["ambiguous rider", "bike shop"])
        ? ["bike lineup", "rider fit or test ride", "parts and gear", "service CTA"]
        : ["bicycle lineup", "rider fitting", "accessories", "rental options", "service CTA"];
  }

  if (page === "services") {
    return ["service choices", "how booking works", "support details", "CTA"];
  }

  if (page === "menu") {
    return ["menu highlights", "specials", "freshness/story", "reservation CTA"];
  }

  if (page === "gallery") {
    return ["visual gallery", "featured details", "CTA"];
  }

  if (page === "about") {
    return ["origin story", "specialist values", "support standards", "CTA"];
  }

  if (page === "contact") {
    return ["contact details", "form", "location/service area", "CTA"];
  }

  return ["focused introduction", "practical details", "customer next step", "CTA"];
}

function inferVisualLanguage(intent: IntentIntelligence, businessType: string) {
  const type = lower(businessType);
  const palette = intent.palette.length
    ? intent.palette
    : includesAny(type, ["television", "home cinema", "motorbike", "motorcycle", "ambiguous rider", "bike shop"])
      ? ["maroon", "white", "dark neutral"]
    : includesAny(type, ["ice cream", "frozen dessert", "gelato", "scoop"])
      ? ["cream", "pink", "blue", "white"]
      : includesAny(type, ["perfume", "fragrance", "scent"])
        ? ["yellow", "white", "soft gold"]
      : includesAny(type, ["seafood", "fish"])
      ? ["white", "blue", "teal"]
      : includesAny(type, ["beauty", "skincare", "cream"])
        ? ["white", "pink", "soft neutral"]
        : includesAny(type, ["footwear", "shoe", "sneaker"])
          ? ["black", "white", "neutral"]
      : includesAny(type, ["bakery", "restaurant"])
        ? ["warm neutral", "cream", "accent"]
        : ["neutral", "accent"];

  return {
    motion: unique([...intent.motionStyle, "CSS transitions", "IntersectionObserver reveals"]),
    palette,
    shapeLanguage: intent.shapeLanguage.length ? intent.shapeLanguage : ["rounded", "soft"],
    spacingTone: includesAny(type, ["luxury", "jewellery"]) ? ["generous", "editorial"] : ["balanced", "breathable"],
    style: intent.visualStyle.length
      ? intent.visualStyle
      : includesAny(type, ["television", "home cinema", "motorbike", "motorcycle", "ambiguous rider", "bike shop"])
        ? ["tactical glass HUD", "cinematic", "premium"]
        : ["modern", "premium", "calm"],
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

  if (includesAny(type, ["ice cream", "frozen dessert", "gelato", "scoop"])) {
    return {
      ctaStrategy: ["Explore flavors", "Visit the shop", "Book catering"],
      heroGoal: "Make visitors crave fresh scoops, cones, sundaes, seasonal specials, and an easy shop visit.",
      trustSignals: ["fresh daily flavors", "family-friendly service", "seasonal specials", "event catering"]
    };
  }

  if (includesAny(type, ["perfume", "fragrance", "scent"])) {
    return {
      ctaStrategy: ["Explore scents", "Find your signature", "Book a scent consultation"],
      heroGoal: "Invite visitors into fragrance notes, perfume bottles, testers, gift sets, oud, floral, citrus, and musk collections with a luxury editorial feel.",
      trustSignals: ["fragrance notes", "tester guidance", "gift packaging", "signature scent consultation"]
    };
  }

  if (includesAny(type, ["television", "home cinema", "electronics"])) {
    return {
      ctaStrategy: ["Compare TVs", "Book installation", "Visit showroom"],
      heroGoal: "Help customers compare smart TVs, OLED/QLED/LED displays, screen sizes, home cinema bundles, and installation options with confidence.",
      trustSignals: ["warranty support", "wall mounting", "delivery and installation", "showroom comparison"]
    };
  }

  if (includesAny(type, ["motorbike", "motorcycle"])) {
    return {
      ctaStrategy: ["Schedule a test ride", "Book engine service", "Explore rider gear"],
      heroGoal: "Present motorcycles, rider gear, spare parts, engine service, and test rides with a confident showroom feel.",
      trustSignals: ["engine service", "helmets and gear", "spare parts", "road safety support"]
    };
  }

  if (includesAny(type, ["ambiguous rider", "bike shop"])) {
    return {
      ctaStrategy: ["Explore bikes", "Book service", "Ask for guidance"],
      heroGoal: "Focus on showroom support, service, parts, safety, and fit guidance while leaving room for the customer's exact bike type.",
      trustSignals: ["service support", "parts guidance", "rider safety", "showroom advice"]
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

  if (includesAny(type, ["footwear", "shoe", "sneaker"])) {
    return {
      ctaStrategy: ["Shop new arrivals", "Explore footwear", "Find your fit"],
      heroGoal: "Present footwear collections with style, durability, and easy product discovery.",
      trustSignals: ["fit guidance", "quality materials", "customer reviews", "easy returns"]
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
    ctaStrategy: buildDomainBlueprint({ prompt: businessType }).ctaStrategy,
    heroGoal: `Explain ${businessType} with domain-specific proof, useful offers, and a clear next step.`,
    trustSignals: buildDomainBlueprint({ prompt: businessType }).contentTerms.slice(0, 4)
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
