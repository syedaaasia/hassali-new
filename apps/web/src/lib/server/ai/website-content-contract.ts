import type { WebsiteGenerationBrief } from "@/lib/server/ai/generation-brief";
import type { SemanticDomainEvidence } from "@/lib/server/ai/industry-taxonomy";

export type WebsiteFactClassification =
  | "DESIGN_RECOMMENDATION"
  | "PLACEHOLDER_REQUIRED"
  | "SAFE_INFERENCE"
  | "UNSUPPORTED_CLAIM"
  | "USER_SUPPLIED_FACT";

export type WebsiteContentFact = {
  classification: WebsiteFactClassification;
  evidence: string;
  field: string;
  value: string;
};

export type WebsiteCommerceBehavior =
  | "catalog_browse"
  | "inquiry_only"
  | "portfolio_inquiry"
  | "product_information"
  | "service_inquiry";

export type WebsiteContentContract = {
  audienceProblem: string;
  availableFacts: WebsiteContentFact[];
  businessIdentity: {
    displayName: string | null;
    provenance: "MISSING" | "USER_SUPPLIED";
    publicLabel: string;
  };
  businessType: string;
  commerceBehavior: WebsiteCommerceBehavior;
  contentDensity: "focused" | "standard";
  conversionGoal: string;
  coreOffer: string;
  differentiators: string[];
  displayNameRequired: boolean;
  hero: {
    headline: string;
    supportingCopy: string;
  };
  locationScope: string | null;
  offerItems: Array<{
    detail: string;
    meta: string;
    title: string;
  }>;
  offerMechanism: string;
  optionalSections: string[];
  primaryAudience: string;
  primaryCta: {
    label: string;
    target: string;
  };
  primaryOutcome: string;
  prohibitedClaims: string[];
  requiredSections: string[];
  secondaryCta: {
    label: string;
    target: string;
  } | null;
  tone: string[];
  trustInputs: WebsiteContentFact[];
  trustStrategy: string[];
};

type OfferFamily =
  | "artwork"
  | "bakery"
  | "beauty"
  | "electronics"
  | "floral"
  | "professional_service"
  | "retail"
  | "software"
  | "unknown";

function cleanText(value: string) {
  return value.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function sentence(value: string) {
  const cleaned = cleanText(value).replace(/\s+([,.;:!?])/g, "$1");
  return cleaned ? `${cleaned[0]?.toUpperCase() ?? ""}${cleaned.slice(1)}` : cleaned;
}

function titleCase(value: string) {
  return cleanText(value)
    .split(" ")
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1).toLowerCase()}`)
    .join(" ");
}

function explicitBusinessName(prompt: string) {
  const match =
    prompt.match(/\b(?:named|called)\s+([a-z0-9][a-z0-9&' -]{1,60}?)(?=\s+(?:with|and|using|that|which|for|to|it|should|as)\b|[,.!?]|$)/i) ??
    prompt.match(/\b(?:brand|business|company)\s+name\s+(?:is\s+)?([a-z0-9][a-z0-9&' -]{1,60}?)(?=\s+(?:with|and|using|that|which|for|to|it|should|as)\b|[,.!?]|$)/i);
  const value = cleanText(match?.[1] ?? "");

  return value && !/^(?:business|company|website|site|brand|unknown)$/i.test(value) ? value : null;
}

function currentPromptBusinessName(prompt: string, intentBrandName: string | null | undefined) {
  const candidate = cleanText(intentBrandName ?? "");
  if (!candidate || !prompt.toLowerCase().includes(candidate.toLowerCase())) return null;
  if (candidate.split(/\s+/).length > 6) return null;
  if (/\b(?:artist|brand|business|portfolio|service|shop|store|supplier|website)\b/i.test(candidate) && !/\b(?:co|company|collective|house|llc|studio|works)\b/i.test(candidate)) {
    return null;
  }
  return candidate;
}

function offerFamily(prompt: string, semantic: SemanticDomainEvidence): OfferFamily {
  const text = cleanText([
    prompt,
    semantic.label,
    semantic.industry ?? "",
    semantic.niche ?? "",
    ...semantic.products,
    ...semantic.services,
    ...semantic.capabilities
  ].join(" ")).toLowerCase();

  if (/\b(?:artist|painter|artwork|painting|paintings|sculptor|illustrator|art portfolio)\b/.test(text)) return "artwork";
  if (/\b(?:bakery|bake|baked|bread|cake|cakes|pastry|pastries)\b/.test(text)) return "bakery";
  if (/\b(?:flower|flowers|floral|florist|bouquet|wedding flower)\b/.test(text)) return "floral";
  if (/\b(?:beauty|skincare|skin care|cosmetic|makeup|korean beauty)\b/.test(text)) return "beauty";
  if (/\b(?:electronics|television|tv shop|tv store|smart tv|lcd|led|oled|qled|display|home cinema|soundbar)\b/.test(text)) return "electronics";
  if (/\b(?:software|saas|platform|workflow|automation|lead follow[ -]?up)\b/.test(text)) return "software";
  if (semantic.businessModels.some((model) => model === "retail" || model === "wholesale") || /\b(?:shop|store|ecommerce|e-commerce|retail)\b/.test(text)) return "retail";
  if (semantic.services.length > 0 || semantic.businessModels.includes("service")) return "professional_service";
  return "unknown";
}

function explicitLocation(prompt: string) {
  const match =
    prompt.match(/\b(?:based in|located in|serving)\s+([A-Z][A-Za-z .'-]{1,50}?)(?=\s+(?:and|with|who|that|selling|offering)\b|[,.!?]|$)/) ??
    prompt.match(/\b([A-Z][A-Za-z'.-]*(?:\s+[A-Z][A-Za-z'.-]*){0,3})-based\b/);

  return cleanText(match?.[1] ?? "") || null;
}

function explicitAudience(prompt: string) {
  const match =
    prompt.match(/\bserving\s+(.+?)(?=[,.!?]|\s+(?:with|who|that|while)\b|$)/i) ??
    prompt.match(/\bhelps?\s+(.+?)\s+(?:to\s+)?(?:follow|manage|track|plan|find|sell|buy|book|compare)\b/i) ??
    prompt.match(/\bfor\s+(.+?)(?=\s+(?:who|that|looking|seeking|needing)\b|[,.!?]|$)/i);
  const candidate = cleanText(match?.[1] ?? "");

  if (!candidate || /^(?:a|an|the)?\s*(?:website|site|software|portfolio|business|brand)$/i.test(candidate)) return null;
  if (/^(?:a|an|the)\s+[\s\S]*\b(?:artist|brand|business|company|painter|portfolio|service|shop|store|supplier|website)\b/i.test(candidate)) return null;
  return candidate;
}

function pagePath(page: string) {
  const normalized = cleanText(page).toLowerCase();
  if (normalized === "home" || normalized === "index") return "index.html";
  if (normalized === "blogs") return "blog.html";
  return `${normalized.replace(/[^a-z0-9]+/g, "-") || "page"}.html`;
}

function findPageTarget(pages: string[], terms: RegExp, fallback = "index.html") {
  const page = pages.find((candidate) => terms.test(candidate));
  return page ? pagePath(page) : fallback;
}

function familyDetails(input: {
  family: OfferFamily;
  prompt: string;
  semantic: SemanticDomainEvidence;
}) {
  const products = input.semantic.products.map(cleanText).filter(Boolean);
  const services = input.semantic.services.map(cleanText).filter(Boolean);
  const semanticLabel = cleanText(input.semantic.niche ?? input.semantic.label)
    .replace(/\b(?:business|website)$/i, "")
    .trim();

  if (input.family === "floral") {
    return {
      audience: "event planners and couples preparing wedding celebrations",
      businessType: "wedding flower supplier",
      coreOffer: "wedding flowers, event arrangements, and floral planning support",
      mechanism: "browse floral options, compare event needs, and send an inquiry for current details",
      outcome: "plan event flowers with a clearer view of styles, quantities, and next steps",
      offerItems: [
        { detail: "Explore ceremony flowers in relation to venue, palette, season, and event scale.", meta: "Wedding flowers", title: "Ceremony arrangements" },
        { detail: "Compare reception pieces by table setting, room layout, and the atmosphere you want to create.", meta: "Event florals", title: "Reception flowers" },
        { detail: "Share the date, setting, quantities, and visual direction so current options can be confirmed.", meta: "Planning", title: "Floral inquiry" }
      ],
      publicLabel: "Wedding Flower Supplier"
    };
  }
  if (input.family === "artwork") {
    return {
      audience: "collectors and people looking for original artwork",
      businessType: "artist portfolio",
      coreOffer: "original artwork and a direct path for collection inquiries",
      mechanism: "view selected work, understand the artist's focus, and ask about available pieces",
      outcome: "discover artwork that fits a collection and inquire without invented availability claims",
      offerItems: [
        { detail: "View a focused selection of original work with the details available for each piece.", meta: "Original artwork", title: "Selected work" },
        { detail: "Read the visual themes and medium details that are available for each piece.", meta: "Artwork context", title: "About the work" },
        { detail: "Ask directly about availability, dimensions, pricing, or commissions where applicable.", meta: "Collector inquiry", title: "Collecting information" }
      ],
      publicLabel: "Artist Portfolio"
    };
  }
  if (input.family === "bakery") {
    return {
      audience: "local customers choosing fresh bread, cakes, and pastries",
      businessType: "neighborhood bakery",
      coreOffer: "fresh bread, cakes, pastries, and bakery orders",
      mechanism: "browse daily bakes, compare celebration options, and contact the bakery about current availability or custom orders",
      outcome: "choose the right bake and confirm pickup or custom-order details",
      offerItems: [
        { detail: "See the breads and pastries prepared for everyday pickup.", meta: "Fresh baking", title: "Daily bakes" },
        { detail: "Explore cakes and celebration options, then confirm current designs and availability directly.", meta: "Celebrations", title: "Cakes and custom orders" },
        { detail: "Ask about current availability, pickup timing, dietary needs, or a custom request.", meta: "Order help", title: "Plan an order" }
      ],
      publicLabel: "Neighborhood Bakery"
    };
  }
  if (input.family === "beauty") {
    return {
      audience: "shoppers comparing skincare and beauty products",
      businessType: "Korean beauty ecommerce brand",
      coreOffer: "Korean beauty and skincare product discovery",
      mechanism: "browse product categories and compare routines without unverified ingredient or clinical claims",
      outcome: "find relevant beauty products and understand what to confirm before purchase",
      offerItems: [
        { detail: "Browse skincare and beauty categories using the product details currently available.", meta: "Product discovery", title: "Explore the collection" },
        { detail: "Compare product purpose, format, and routine position using the details that are actually available.", meta: "Routine context", title: "Build a clearer routine" },
        { detail: "Review current product, delivery, and returns information before making a purchase decision.", meta: "Shopping details", title: "Confirm the details" }
      ],
      publicLabel: "Korean Beauty Collection"
    };
  }
  if (input.family === "electronics") {
    return {
      audience: "local shoppers comparing televisions and home entertainment options",
      businessType: "television and electronics retailer",
      coreOffer: "LCD, LED, OLED, QLED, and smart television guidance",
      mechanism: "compare display types and screen sizes, then ask about current stock, delivery, installation, and warranty support",
      outcome: "choose a television that fits the room, viewing needs, and budget",
      offerItems: [
        { detail: "Compare LCD, LED, OLED, and QLED displays by viewing environment, size, and everyday use.", meta: "Displays", title: "Find the right screen" },
        { detail: "Ask about current models, delivery options, wall mounting, setup, and home cinema accessories.", meta: "Setup support", title: "Plan delivery and installation" },
        { detail: "Confirm current pricing, stock, and warranty details directly before purchase.", meta: "Buying guidance", title: "Check current details" }
      ],
      publicLabel: "Television & Electronics Store"
    };
  }
  if (input.family === "software") {
    const followsLeads = /\bleads?\b[\s\S]{0,50}\bfollow[ -]?up\b|\bfollow[ -]?up\b[\s\S]{0,50}\bleads?\b/i.test(input.prompt);
    return {
      audience: followsLeads ? "small service businesses managing new leads" : "teams improving a repeatable workflow",
      businessType: followsLeads ? "lead follow-up software" : "business workflow software",
      coreOffer: followsLeads ? "software for organizing lead follow-up" : "software for organizing operational work",
      mechanism: followsLeads ? "bring lead status, reminders, and next actions into one clear workflow" : "organize the key records, actions, and handoffs in one place",
      outcome: followsLeads ? "respond consistently and reduce missed follow-up" : "make recurring work easier to track and complete",
      offerItems: followsLeads
        ? [
            { detail: "Keep new leads, owners, and current status visible in one practical view.", meta: "Lead workflow", title: "Organized lead list" },
            { detail: "Track the next contact date and the action each lead needs.", meta: "Follow-up", title: "Next-action reminders" },
            { detail: "See which conversations are new, active, waiting, or complete.", meta: "Pipeline clarity", title: "Clear lead status" }
          ]
        : [
            { detail: "Keep the records that drive daily work visible and organized.", meta: "Workflow", title: "Shared work view" },
            { detail: "Track ownership, status, and the next practical action.", meta: "Operations", title: "Action tracking" },
            { detail: "Review product boundaries and implementation needs before making a decision.", meta: "Product details", title: "Clear implementation path" }
          ],
      publicLabel: followsLeads ? "Lead Follow-Up Software" : "Business Workflow Software"
    };
  }

  const offerTerms = [...products, ...services].slice(0, 3);
  const businessType = semanticLabel && !/^current prompt/i.test(semanticLabel)
    ? semanticLabel.toLowerCase()
    : "independent business";
  const coreOffer = offerTerms.length > 0
    ? offerTerms.join(", ")
    : `information and inquiry support for this ${businessType}`;
  return {
    audience: input.semantic.audiences[0] ?? "people comparing relevant options",
    businessType,
    coreOffer,
    mechanism: "compare the available options, understand what is included, and use a direct inquiry path",
    outcome: `make a more informed ${businessType} decision`,
    offerItems: offerTerms.slice(0, 4).map((term) => ({
      detail: `Review the available ${term.toLowerCase()} details and confirm current scope, availability, pricing, or terms directly.`,
      meta: products.includes(term) ? "Product" : "Service",
      title: titleCase(term)
    })).concat(offerTerms.length === 0 ? [{
      detail: `Understand the practical offer and confirm the details that matter before choosing this ${businessType}.`,
      meta: "Offer",
      title: detailsLabel(businessType)
    }] : []),
    publicLabel: titleCase(businessType)
  };
}

function detailsLabel(businessType: string) {
  return `${titleCase(businessType)} details`;
}

function userSuppliedClaims(prompt: string): WebsiteContentFact[] {
  const patterns = [
    /\b\d+(?:\.\d+)?\s*(?:\+|percent|%|years?|customers?|clients?|projects?|locations?)\b[^,.!?]*/gi,
    /\b(?:award[- ]winning|certified|licensed|five[- ]star|5[- ]star|guaranteed)\b[^,.!?]*/gi
  ];
  return patterns.flatMap((pattern) =>
    Array.from(prompt.matchAll(pattern)).map((match) => ({
      classification: "USER_SUPPLIED_FACT" as const,
      evidence: match[0].trim(),
      field: "claim",
      value: match[0].trim()
    }))
  );
}

export function buildWebsiteContentContract(input: {
  brief?: WebsiteGenerationBrief | null;
  intentBrandName?: string | null;
  prompt: string;
  semantic: SemanticDomainEvidence;
}): WebsiteContentContract {
  const family = offerFamily(input.prompt, input.semantic);
  const details = familyDetails({ family, prompt: input.prompt, semantic: input.semantic });
  const displayName = explicitBusinessName(input.prompt) ??
    currentPromptBusinessName(input.prompt, input.intentBrandName);
  const locationScope = explicitLocation(input.prompt);
  const audience = explicitAudience(input.prompt) ?? details.audience;
  const pages = input.brief?.requestedPages.length ? input.brief.requestedPages : input.semantic.suggestedPages;
  const hasContact = pages.some((page) => /contact|inquir|appointment/.test(page));
  const isCommerce = family === "beauty" || family === "retail" || input.semantic.businessModels.includes("retail");
  const isPortfolio = family === "artwork";
  const primaryTarget = isCommerce
    ? findPageTarget(pages, /product|shop|collection|catalog/, hasContact ? findPageTarget(pages, /contact/) : "index.html")
    : isPortfolio
      ? findPageTarget(pages, /work|portfolio|gallery/, hasContact ? findPageTarget(pages, /contact/) : "index.html")
      : hasContact
        ? findPageTarget(pages, /contact|inquir|appointment/)
        : "index.html";
  const primaryLabel = family === "floral"
    ? hasContact ? "Plan your event flowers" : "Explore wedding flowers"
    : family === "artwork"
      ? primaryTarget === "index.html" ? "View original artwork" : "See available artwork"
      : family === "beauty"
        ? "Browse the collection"
        : family === "software"
          ? hasContact ? "Request product information" : "See the workflow"
          : isCommerce
            ? "Browse the collection"
            : hasContact
              ? "Request information"
              : `Explore ${details.publicLabel.toLowerCase()}`;
  const secondaryTarget = hasContact && primaryTarget !== findPageTarget(pages, /contact/)
    ? findPageTarget(pages, /contact/)
    : findPageTarget(pages, /about|story/, "index.html");
  const explicitFacts: WebsiteContentFact[] = [
    {
      classification: "USER_SUPPLIED_FACT",
      evidence: input.prompt,
      field: "coreOffer",
      value: details.coreOffer
    },
    ...(displayName ? [{
      classification: "USER_SUPPLIED_FACT" as const,
      evidence: displayName,
      field: "businessIdentity",
      value: displayName
    }] : []),
    ...(locationScope ? [{
      classification: "USER_SUPPLIED_FACT" as const,
      evidence: locationScope,
      field: "locationScope",
      value: locationScope
    }] : []),
    ...userSuppliedClaims(input.prompt)
  ];
  const publicLabel = displayName ?? details.publicLabel;
  const headline = family === "floral"
    ? "Wedding flowers planned around the occasion"
    : family === "artwork"
      ? "Original artwork for thoughtful collections"
      : family === "beauty"
        ? "Explore Korean beauty with clearer product context"
        : family === "software"
          ? "Keep every lead follow-up moving"
          : `${details.publicLabel} with a clear next step`;
  const supportingCopy = `${sentence(details.coreOffer)} for ${audience}. ${sentence(details.mechanism)}.`;

  return {
    audienceProblem: family === "software"
      ? "important leads and next actions can be missed when follow-up is scattered"
      : `visitors need enough relevant detail to judge whether ${details.coreOffer} fits their needs`,
    availableFacts: explicitFacts,
    businessIdentity: {
      displayName,
      provenance: displayName ? "USER_SUPPLIED" : "MISSING",
      publicLabel
    },
    businessType: details.businessType,
    commerceBehavior: isPortfolio
      ? "portfolio_inquiry"
      : isCommerce
        ? "catalog_browse"
        : family === "software"
          ? "product_information"
          : input.semantic.services.length > 0
            ? "service_inquiry"
            : "inquiry_only",
    contentDensity: pages.length > 4 ? "standard" : "focused",
    conversionGoal: input.brief?.conversionGoal ?? `help visitors ${details.outcome}`,
    coreOffer: details.coreOffer,
    differentiators: [
      sentence(details.mechanism),
      "Current pricing, availability, timing, and terms are confirmed directly",
      "Clear next steps without assumptions about current availability"
    ],
    displayNameRequired: false,
    hero: {
      headline,
      supportingCopy
    },
    locationScope,
    offerItems: details.offerItems,
    offerMechanism: details.mechanism,
    optionalSections: ["faq", "about", ...(explicitFacts.some((fact) => fact.field === "claim") ? ["proof"] : [])],
    primaryAudience: audience,
    primaryCta: {
      label: primaryLabel,
      target: primaryTarget
    },
    primaryOutcome: details.outcome,
    prohibitedClaims: [
      "unsupplied customer counts, ratings, awards, certifications, revenue, or years in business",
      "invented testimonials, clients, locations, ingredients, guarantees, delivery promises, or medical outcomes",
      "booking, checkout, public sharing, or live service behavior not present in the generated site"
    ],
    requiredSections: [
      "hero",
      isCommerce || isPortfolio ? "offer" : "services",
      family === "software" ? "workflow" : "process",
      hasContact ? "contact" : "next_action"
    ],
    secondaryCta: {
      label: hasContact && primaryTarget !== secondaryTarget ? "Ask a question" : "How it works",
      target: secondaryTarget
    },
    tone: input.brief?.contentTone
      ? input.brief.contentTone.split(",").map(cleanText).filter(Boolean)
      : family === "artwork"
        ? ["expressive", "clear", "collector-focused"]
        : family === "software"
          ? ["practical", "accessible", "work-focused"]
          : ["clear", "warm", "specific"],
    trustInputs: explicitFacts.filter((fact) => fact.field === "claim"),
    trustStrategy: [
      "Explain the offer and decision process clearly",
      "Show representative products, services, or work without claiming availability",
      "Invite direct confirmation of pricing, timing, availability, and terms"
    ]
  };
}

export function summarizeWebsiteContentContract(contract: WebsiteContentContract) {
  return {
    audience: contract.primaryAudience,
    businessIdentity: contract.businessIdentity.displayName ?? "not supplied",
    businessType: contract.businessType,
    claimCount: contract.trustInputs.length,
    commerceBehavior: contract.commerceBehavior,
    conversionGoal: contract.conversionGoal,
    coreOffer: contract.coreOffer,
    primaryCta: `${contract.primaryCta.label} -> ${contract.primaryCta.target}`
  };
}
