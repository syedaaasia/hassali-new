import type { BusinessBlueprint } from "@/lib/server/ai/blueprint-matcher";
import type { ContextPriorityResult } from "@/lib/server/ai/context-priority-engine";
import type { ExecutionPlan } from "@/lib/server/ai/execution-planner";
import type { TranslatedIntentSpec } from "@/lib/server/ai/intent-translator";
import type { ProjectContract } from "@/lib/server/ai/project-contract";
import type { TaskDecomposition } from "@/lib/server/ai/task-decomposer";

export type CompositionStatus = "answer_only" | "planned" | "targeted";
export type CompositionKind =
  | "answer_composition"
  | "app_composition"
  | "targeted_edit_composition"
  | "website_composition";

export type PagePlan = {
  acceptanceChecks: string[];
  contentGoal: string;
  entityFocus: string[];
  forbiddenContent: string[];
  pageId: string;
  primaryCTA: string | null;
  purpose: string;
  requiredSections: string[];
  route: string;
  title: string;
};

export type SectionPlan = {
  acceptanceChecks: string[];
  copyIntent: string;
  entities: string[];
  forbiddenTerms: string[];
  priority: number;
  purpose: string;
  requiredTerms: string[];
  sectionId: string;
  sectionType: string;
  title: string;
  visualIntent: string;
};

export type CompositionPlan = {
  acceptanceChecks: string[];
  assetIntent: string[];
  authoritativeDomain: string | null;
  compositionId: string;
  compositionKind: CompositionKind;
  compositionStatus: CompositionStatus;
  compositionWarnings: string[];
  confidence: number;
  contentAngles: string[];
  forbiddenSections: string[];
  globalSections: SectionPlan[];
  layoutIntent: string[];
  optionalSections: SectionPlan[];
  pageCount: number;
  pagePlans: PagePlan[];
  primaryCTA: string | null;
  productOrServiceEntities: string[];
  requiredSections: SectionPlan[];
  secondaryCTA: string | null;
  trustSignals: string[];
  visualIntent: string[];
};

type BuildCompositionInput = {
  businessBlueprint: BusinessBlueprint;
  contextPriority: ContextPriorityResult;
  currentPrompt: string;
  executionPlan: ExecutionPlan;
  productMode: "ASK" | "CODE" | "WEBSITE";
  projectContract: ProjectContract | null;
  taskDecomposition: TaskDecomposition;
  translatedIntent: TranslatedIntentSpec;
};

type DomainCompositionProfile = {
  assetIntent: string[];
  contentAngles: string[];
  domain: string;
  entities: string[];
  forbiddenSections: string[];
  layoutIntent: string[];
  optionalSections: string[];
  primaryCTA: string;
  requiredSections: string[];
  secondaryCTA: string;
  trustSignals: string[];
  visualIntent: string[];
};

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "section";
}

function pageToPath(page: string) {
  const normalized = page.toLowerCase().trim();
  const map: Record<string, string> = {
    about: "about.html",
    blog: "blog.html",
    contact: "contact.html",
    home: "index.html",
    products: "products.html",
    services: "services.html",
    shop: "products.html",
    story: "story.html"
  };

  return map[normalized] ?? `${slug(normalized)}.html`;
}

const profiles: DomainCompositionProfile[] = [
  {
    assetIntent: ["room scenes", "sofas", "chairs", "tables", "cupboards", "showroom", "delivery"],
    contentAngles: ["room-by-room shopping", "materials and comfort", "showroom guidance", "delivery confidence"],
    domain: "furniture",
    entities: ["sofa", "cupboard", "chair", "table", "collection", "showroom"],
    forbiddenSections: ["Local Service", "clear services", "generic repair proof"],
    layoutIntent: ["product category grid", "collection rows", "room inspiration blocks", "delivery/trust strip"],
    optionalSections: ["materials guide", "room bundles", "new arrivals", "showroom visit"],
    primaryCTA: "Explore products",
    requiredSections: ["hero", "product categories", "featured products", "collections", "room categories", "delivery/showroom trust", "contact"],
    secondaryCTA: "Visit showroom",
    trustSignals: ["delivery support", "material quality", "showroom assistance", "secure ordering"],
    visualIntent: ["warm showroom", "premium catalog", "spacious product photography", "clean ecommerce"]
  },
  {
    assetIntent: ["bouquets", "wedding flowers", "fresh stems", "gift boxes", "delivery"],
    contentAngles: ["occasion-led shopping", "freshness promise", "bridal/event expertise", "gifting"],
    domain: "floral",
    entities: ["bouquets", "weddings", "events", "gifts", "delivery", "fresh flowers"],
    forbiddenSections: ["Local Service", "clear services", "developer", "electronics"],
    layoutIntent: ["occasion categories", "collection cards", "delivery notice", "freshness badges"],
    optionalSections: ["new arrivals", "gift add-ons", "event consultation", "seasonal flowers"],
    primaryCTA: "Order flowers",
    requiredSections: ["hero", "bouquets", "occasions", "weddings/events", "delivery/freshness", "gifting", "contact"],
    secondaryCTA: "Plan an event",
    trustSignals: ["freshness", "same-day delivery", "secure payment", "event care"],
    visualIntent: ["soft editorial", "premium warm", "fresh floral detail", "Apple Glass if requested"]
  },
  {
    assetIntent: ["clinic interior", "dentists", "smiles", "treatment rooms", "hygiene"],
    contentAngles: ["calm treatment journey", "doctor-led trust", "clear appointments", "patient safety"],
    domain: "dental",
    entities: ["treatments", "doctors", "appointments", "hygiene", "reviews", "location"],
    forbiddenSections: ["coffee", "cafe", "OLED", "QLED", "Local Service", "developer"],
    layoutIntent: ["clinic hero", "service cards", "doctor/team strip", "appointment panel", "location/contact"],
    optionalSections: ["emergency care", "insurance/payment info", "featured treatments"],
    primaryCTA: "Book appointment",
    requiredSections: ["hero", "treatments", "doctors/team", "appointment", "hygiene/safety", "reviews", "location/contact"],
    secondaryCTA: "View services",
    trustSignals: ["licensed dentists", "hygiene protocols", "patient reviews", "clear treatment plans"],
    visualIntent: ["premium clinic", "calm white/blue", "trustworthy", "accessible"]
  },
  {
    assetIntent: ["coffee cups", "espresso", "pastries", "counter", "pickup"],
    contentAngles: ["signature drinks", "daily menu", "pickup/order", "local community"],
    domain: "coffee",
    entities: ["signature drinks", "menu", "pastries", "hours", "pickup", "location"],
    forbiddenSections: ["dental", "doctor", "OLED", "QLED", "developer"],
    layoutIntent: ["menu/order flow", "category tabs", "popular items", "location/hours"],
    optionalSections: ["seasonal drinks", "roastery notes", "loyalty"],
    primaryCTA: "Order now",
    requiredSections: ["hero", "signature drinks", "menu highlights", "pastries/food", "pickup/order", "location/hours", "contact"],
    secondaryCTA: "View menu",
    trustSignals: ["freshly brewed", "secure payment", "pickup ready", "community reviews"],
    visualIntent: ["warm cafe", "editorial food", "cream/brown/black", "premium cozy"]
  },
  {
    assetIntent: ["TV showroom", "OLED display", "home cinema", "wall mounting", "soundbar"],
    contentAngles: ["display comparison", "home cinema setup", "installation confidence", "warranty support"],
    domain: "electronics_retail",
    entities: ["TVs", "OLED", "QLED", "LED", "HDMI", "installation", "warranty"],
    forbiddenSections: ["dental", "coffee", "bridal", "Local Service", "developer"],
    layoutIntent: ["product comparison", "screen size guide", "showroom panels", "support strip"],
    optionalSections: ["promotions", "brand wall", "soundbar/accessories"],
    primaryCTA: "Explore TVs",
    requiredSections: ["hero", "product categories", "OLED/QLED/LED comparison", "brands", "installation", "warranty", "delivery/promotions", "contact"],
    secondaryCTA: "Visit showroom",
    trustSignals: ["warranty", "installation", "delivery", "after-sales support"],
    visualIntent: ["tactical showroom", "cinematic display", "glass/HUD if requested", "high contrast"]
  },
  {
    assetIntent: ["CRM dashboard", "pipeline board", "contacts table", "billing panel"],
    contentAngles: ["pipeline clarity", "customer records", "team tasks", "billing visibility"],
    domain: "crm",
    entities: ["contacts", "companies", "leads", "deals", "tasks", "communication", "billing", "reports"],
    forbiddenSections: ["public cafe menu", "clinic services", "TV showroom"],
    layoutIntent: ["app shell", "dashboard cards", "sidebar navigation", "table/list modules", "empty states"],
    optionalSections: ["reports", "settings", "automation rules"],
    primaryCTA: "Review CRM plan",
    requiredSections: ["dashboard", "contacts", "companies", "leads/deals", "tasks", "communication", "billing/invoices", "reports/settings"],
    secondaryCTA: "Inspect data model",
    trustSignals: ["auth boundary", "data model clarity", "audit-friendly records", "billing placeholders"],
    visualIntent: ["serious app UI", "dense but readable", "workflow-first", "low-spec friendly"]
  },
  {
    assetIntent: ["product UI", "workflow diagram", "feature panels", "integration icons"],
    contentAngles: ["product value", "workflow clarity", "feature proof", "conversion"],
    domain: "saas",
    entities: ["features", "workflow", "integrations", "pricing", "FAQ", "CTA"],
    forbiddenSections: ["Local Service", "clinic doctors", "coffee pickup"],
    layoutIntent: ["hero/product preview", "feature grid", "workflow", "pricing/CTA", "FAQ"],
    optionalSections: ["comparison", "security", "logos"],
    primaryCTA: "Get started",
    requiredSections: ["hero", "features", "workflow", "integrations", "pricing", "FAQ", "CTA"],
    secondaryCTA: "View demo",
    trustSignals: ["security", "clear workflow", "customer proof", "pricing clarity"],
    visualIntent: ["modern product", "clean SaaS", "premium dark/light", "focused CTA"]
  },
  {
    assetIntent: ["food photography", "menu items", "dining room", "pickup/delivery"],
    contentAngles: ["menu confidence", "ordering flow", "hospitality", "location"],
    domain: "restaurant",
    entities: ["menu", "popular dishes", "pickup", "delivery", "hours", "contact"],
    forbiddenSections: ["developer", "OLED", "dental treatments"],
    layoutIntent: ["menu tabs", "popular grid", "order status", "location/contact"],
    optionalSections: ["chef story", "reservations", "catering"],
    primaryCTA: "Order now",
    requiredSections: ["hero", "menu/order flow", "category tabs", "popular items", "pickup/delivery", "hours/contact"],
    secondaryCTA: "View menu",
    trustSignals: ["secure payment", "fresh ingredients", "pickup/delivery clarity", "reviews"],
    visualIntent: ["appetite-driven", "warm premium", "clear ordering"]
  }
];

function inferDomain(input: BuildCompositionInput) {
  const text = input.currentPrompt.toLowerCase();

  if (text.includes("cola") || text.includes("soft drink") || text.includes("soda") || text.includes("beverage")) {
    return "cola company / soft drinks";
  }

  if (text.includes("furniture") || text.includes("sofa") || text.includes("cupboard") || text.includes("chair") || text.includes("table")) {
    return "furniture";
  }

  if (input.contextPriority.authoritativeDomain === "floral") return "floral";
  if (input.contextPriority.authoritativeDomain === "dental") return "dental";
  if (input.contextPriority.authoritativeDomain === "coffee") return "coffee";
  if (input.contextPriority.authoritativeDomain === "electronics_retail") return "electronics_retail";
  if (input.contextPriority.authoritativeDomain === "crm" && input.contextPriority.authoritativeMode === "CODE") return "crm";
  if (input.contextPriority.authoritativeDomain === "crm" && input.contextPriority.authoritativeMode === "WEBSITE") return "saas";
  if (input.contextPriority.authoritativeDomain === "saas") return "saas";
  if (input.contextPriority.authoritativeDomain === "restaurant" || input.contextPriority.authoritativeDomain === "bakery") return "restaurant";

  return input.contextPriority.authoritativeDomain ??
    input.translatedIntent.domain ??
    input.translatedIntent.businessType ??
    "unknown";
}

function profileFor(input: BuildCompositionInput) {
  const domain = inferDomain(input);

  const domainLabel = domain === "unknown" ? input.contextPriority.authoritativeBusinessType ?? "current request" : domain;

  return profiles.find((profile) => profile.domain === domain) ?? {
    assetIntent: [`${domainLabel} imagery`, "product proof", "contact path"],
    contentAngles: [`${domainLabel} offer`, "audience confidence", "trust", "contact"],
    domain,
    entities: unique([domainLabel, ...input.contextPriority.authoritativeFeatures]),
    forbiddenSections: ["Local Service", "clear services", "developer/coder fallback"],
    layoutIntent: ["hero", "offer detail", "trust", "action", "contact"],
    optionalSections: ["testimonials", "FAQ"],
    primaryCTA: "Contact us",
    requiredSections: ["hero", "offer detail", "trust", "action", "contact"],
    secondaryCTA: "Explore options",
    trustSignals: ["clear communication", `${domainLabel} relevance`, "customer trust"],
    visualIntent: [`${domainLabel} relevant`, "accessible", "brand-specific"]
  };
}

function sectionPlan(title: string, profile: DomainCompositionProfile, priority: number): SectionPlan {
  const sectionId = slug(title);

  return {
    acceptanceChecks: [
      `${title} uses ${profile.domain} vocabulary`,
      "no forbidden stale-domain wording",
      "copy intent is public-facing, not generator instructions"
    ],
    copyIntent: `Create public-facing ${profile.domain} copy for ${title}, focused on ${profile.contentAngles.slice(0, 3).join(", ")}.`,
    entities: profile.entities,
    forbiddenTerms: profile.forbiddenSections,
    priority,
    purpose: `Serve the ${title} composition need for the ${profile.domain} experience.`,
    requiredTerms: profile.entities.slice(0, 8),
    sectionId,
    sectionType: title.includes("hero") ? "hero" : title.includes("contact") ? "contact" : title.includes("product") || title.includes("menu") ? "catalog" : "content",
    title,
    visualIntent: profile.visualIntent.join(", ")
  };
}

function pageTitle(page: string) {
  if (page === "home") return "Home";
  if (page === "about") return "About";
  if (page === "blog") return "Blog";
  if (page === "products") return "Products";
  if (page === "services") return "Services";

  return page.charAt(0).toUpperCase() + page.slice(1).replace(/-/g, " ");
}

function pagePlans(input: BuildCompositionInput, profile: DomainCompositionProfile, requiredSections: SectionPlan[]): PagePlan[] {
  const pageNames = input.translatedIntent.pages.names.length
    ? input.translatedIntent.pages.names
    : input.productMode === "WEBSITE"
      ? ["home"]
      : [];

  return pageNames.map((page, index) => {
    const title = pageTitle(page);
    const route = pageToPath(page);
    const pageSections = index === 0
      ? requiredSections.slice(0, Math.min(5, requiredSections.length)).map((section) => section.title)
      : requiredSections.slice(index, index + 3).map((section) => section.title);

    return {
      acceptanceChecks: [
        `${title} page has a unique purpose`,
        `${title} page avoids repeated generic Local Service framing`,
        `${title} page matches ${profile.domain} composition`
      ],
      contentGoal: index === 0
        ? `Introduce the ${profile.domain} offer and move visitors toward ${profile.primaryCTA}.`
        : `Deepen ${profile.domain} context for ${title.toLowerCase()} without repeating the home page.`,
      entityFocus: index === 0 ? profile.entities.slice(0, 5) : profile.entities.slice(index, index + 4),
      forbiddenContent: profile.forbiddenSections,
      pageId: slug(page),
      primaryCTA: profile.primaryCTA,
      purpose: `${title} page for ${profile.domain}.`,
      requiredSections: pageSections.length ? pageSections : [requiredSections[index % requiredSections.length]?.title ?? "content"],
      route,
      title
    };
  });
}

function answerComposition(input: BuildCompositionInput): CompositionPlan {
  return {
    acceptanceChecks: ["answer directly", "do not assume file mutation", "state uncertainty when needed"],
    assetIntent: [],
    authoritativeDomain: input.contextPriority.authoritativeDomain,
    compositionId: "ask_answer_composition",
    compositionKind: "answer_composition",
    compositionStatus: "answer_only",
    compositionWarnings: [],
    confidence: Math.min(0.96, input.contextPriority.confidence + 0.03),
    contentAngles: ["direct explanation", "safe scope", "clear answer"],
    forbiddenSections: ["website page plan", "code module plan"],
    globalSections: [],
    layoutIntent: [],
    optionalSections: [],
    pageCount: 0,
    pagePlans: [],
    primaryCTA: null,
    productOrServiceEntities: [],
    requiredSections: [],
    secondaryCTA: null,
    trustSignals: [],
    visualIntent: []
  };
}

function targetedComposition(input: BuildCompositionInput): CompositionPlan {
  return {
    acceptanceChecks: ["target exact text only", "do not expand into page/section generation", "verify replacement"],
    assetIntent: [],
    authoritativeDomain: input.contextPriority.authoritativeDomain,
    compositionId: "targeted_edit_composition",
    compositionKind: "targeted_edit_composition",
    compositionStatus: "targeted",
    compositionWarnings: ["Composition expansion suppressed because this is a small edit."],
    confidence: Math.min(0.95, input.contextPriority.confidence + 0.04),
    contentAngles: ["exact replacement"],
    forbiddenSections: ["new hero", "new services", "full website regeneration"],
    globalSections: [],
    layoutIntent: [],
    optionalSections: [],
    pageCount: 0,
    pagePlans: [],
    primaryCTA: null,
    productOrServiceEntities: [],
    requiredSections: [],
    secondaryCTA: null,
    trustSignals: [],
    visualIntent: []
  };
}

function codeComposition(input: BuildCompositionInput, profile: DomainCompositionProfile): CompositionPlan {
  const requiredSections = profile.requiredSections.map((title, index) => sectionPlan(title, profile, index + 1));

  return {
    acceptanceChecks: [
      ...input.businessBlueprint.acceptanceChecks,
      "CODE composition uses app screens/modules, not public marketing sections",
      "CRM/app entities are represented as modules, tables, dashboards, and empty states"
    ],
    assetIntent: profile.assetIntent,
    authoritativeDomain: input.contextPriority.authoritativeDomain,
    compositionId: `${profile.domain}_app_composition`,
    compositionKind: "app_composition",
    compositionStatus: "planned",
    compositionWarnings: input.contextPriority.conflicts.map((conflict) => `Suppressed ${conflict.suppressed}.`),
    confidence: Math.min(0.95, (input.executionPlan.confidence + input.contextPriority.confidence) / 2 + 0.05),
    contentAngles: profile.contentAngles,
    forbiddenSections: profile.forbiddenSections,
    globalSections: requiredSections,
    layoutIntent: profile.layoutIntent,
    optionalSections: profile.optionalSections.map((title, index) => sectionPlan(title, profile, requiredSections.length + index + 1)),
    pageCount: 0,
    pagePlans: [],
    primaryCTA: profile.primaryCTA,
    productOrServiceEntities: profile.entities,
    requiredSections,
    secondaryCTA: profile.secondaryCTA,
    trustSignals: profile.trustSignals,
    visualIntent: profile.visualIntent
  };
}

function websiteComposition(input: BuildCompositionInput, profile: DomainCompositionProfile): CompositionPlan {
  const requiredSections = profile.requiredSections.map((title, index) => sectionPlan(title, profile, index + 1));
  const optionalSections = profile.optionalSections.map((title, index) => sectionPlan(title, profile, requiredSections.length + index + 1));
  const pages = pagePlans(input, profile, requiredSections);

  return {
    acceptanceChecks: [
      ...input.businessBlueprint.acceptanceChecks,
      "page plans have unique content goals",
      "required sections match authoritative domain",
      "forbidden sections/terms are absent"
    ],
    assetIntent: profile.assetIntent,
    authoritativeDomain: input.contextPriority.authoritativeDomain,
    compositionId: `${profile.domain}_website_composition`,
    compositionKind: "website_composition",
    compositionStatus: "planned",
    compositionWarnings: input.contextPriority.conflicts.map((conflict) => `Suppressed ${conflict.suppressed}.`),
    confidence: Math.min(0.96, (input.executionPlan.confidence + input.contextPriority.confidence) / 2 + 0.06),
    contentAngles: profile.contentAngles,
    forbiddenSections: profile.forbiddenSections,
    globalSections: requiredSections,
    layoutIntent: profile.layoutIntent,
    optionalSections,
    pageCount: pages.length || input.translatedIntent.pages.count || 1,
    pagePlans: pages,
    primaryCTA: profile.primaryCTA,
    productOrServiceEntities: profile.entities,
    requiredSections,
    secondaryCTA: profile.secondaryCTA,
    trustSignals: profile.trustSignals,
    visualIntent: unique([...profile.visualIntent, input.translatedIntent.style ?? "", input.translatedIntent.visualLanguage ?? "", input.translatedIntent.theme ?? ""])
  };
}

export function buildCompositionPlan(input: BuildCompositionInput): CompositionPlan {
  if (input.contextPriority.authoritativeMode === "ASK") {
    return answerComposition(input);
  }

  if (input.contextPriority.authoritativeIntentFamily === "targeted_text_replacement") {
    return targetedComposition(input);
  }

  const profile = profileFor(input);

  if (input.contextPriority.authoritativeMode === "CODE") {
    return codeComposition(input, profile);
  }

  return websiteComposition(input, profile);
}

export function summarizeCompositionPlan(plan: CompositionPlan) {
  return [
    `${plan.compositionId}`,
    `kind=${plan.compositionKind}`,
    `status=${plan.compositionStatus}`,
    `pages=${plan.pageCount}`,
    `sections=${plan.requiredSections.length}`,
    `entities=${plan.productOrServiceEntities.length}`,
    `warnings=${plan.compositionWarnings.length}`,
    `confidence=${plan.confidence.toFixed(2)}`
  ].join("; ");
}
