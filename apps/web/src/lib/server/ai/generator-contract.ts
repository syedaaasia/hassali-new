import type { AssetVisualValidationResult } from "@/lib/server/ai/asset-visual-validator";
import type { BusinessBlueprint } from "@/lib/server/ai/blueprint-matcher";
import type { CompositionPlan } from "@/lib/server/ai/composition-engine";
import type { ContextPriorityResult } from "@/lib/server/ai/context-priority-engine";
import type { DomainValidationResult } from "@/lib/server/ai/domain-validator";
import type { ExecutionPlan } from "@/lib/server/ai/execution-planner";
import type { TranslatedIntentSpec } from "@/lib/server/ai/intent-translator";
import type { ProjectContract } from "@/lib/server/ai/project-contract";
import type { ProposalQualityGateResult } from "@/lib/server/ai/proposal-quality-gate";
import type { TaskDecomposition } from "@/lib/server/ai/task-decomposer";
import { buildWebsiteSourceOfTruth } from "@/lib/server/ai/website-source-of-truth";
import { classifyDomainIntent, getTaxonomyProfile } from "@/lib/server/ai/industry-taxonomy";

export type GeneratorContractStatus = "blocked" | "ready" | "warning";
export type GeneratorMode = "answer_only" | "code_generation" | "small_edit" | "website_generation";

export type GeneratorContract = {
  acceptanceChecks: string[];
  authoritativeBusinessType: string | null;
  authoritativeDomain: string | null;
  confidence: number;
  contractBlocks: string[];
  contractId: string;
  contractStatus: GeneratorContractStatus;
  contractWarnings: string[];
  copyRules: string[];
  enforcementPrompt: string;
  forbiddenFileStrategies: string[];
  forbiddenSections: string[];
  forbiddenTerms: string[];
  generatorMode: GeneratorMode;
  modeRules: string[];
  pageRules: string[];
  regenerationRules: string[];
  requiredCopySignals: string[];
  requiredEntities: string[];
  requiredFileStrategy: string[];
  requiredPageCount: number | null;
  requiredPages: string[];
  requiredSections: string[];
  requiredVisualSignals: string[];
  visualRules: string[];
};

type BuildGeneratorContractInput = {
  assetVisualValidation?: AssetVisualValidationResult | null;
  businessBlueprint: BusinessBlueprint;
  compositionPlan: CompositionPlan;
  contextPriority: ContextPriorityResult;
  currentPrompt: string;
  domainValidation: DomainValidationResult;
  executionPlan: ExecutionPlan;
  productMode: "ASK" | "CODE" | "WEBSITE";
  projectContract: ProjectContract | null;
  proposalQuality?: ProposalQualityGateResult | null;
  taskDecomposition: TaskDecomposition;
  translatedIntent: TranslatedIntentSpec;
};

const genericForbiddenTerms = [
  "Local Service",
  "Clear Services Studio",
  "clear services",
  "customer use cases",
  "detected services",
  "specific offer clarity",
  "domain-specific proof",
  "Help users understand",
  "CTA for Local Service",
  "X for Local Service",
  "Booking CTA"
];

const domainSignals: Record<string, {
  copy: string[];
  label: string;
  pages: string[];
  visual: string[];
}> = {
  crm: {
    copy: ["CRM", "dashboard", "contacts", "pipeline", "billing", "reports", "workflow"],
    label: "CRM app/system",
    pages: ["architecture", "data model", "dashboard", "customers", "billing"],
    visual: ["dashboard", "pipeline", "table UI", "charts", "business workflow"]
  },
  seafood_restaurant: {
    copy: ["seafood", "fresh catch", "seasonal catch", "oyster", "lobster", "grilled fish", "reservation", "chef", "sourcing", "sustainability", "ocean"],
    label: "Seafood restaurant website",
    pages: ["home", "menu", "about", "gallery", "contact"],
    visual: ["ocean-inspired hero", "seafood dish cards", "fresh catch gallery", "coastal dining atmosphere", "reservation panel"]
  },
  dental: {
    copy: ["dental", "dentist", "treatments", "appointment", "hygiene", "patient care"],
    label: "Dental clinic website",
    pages: ["home", "services", "doctors", "about", "contact"],
    visual: ["dental clinic", "smile", "treatment room", "doctor team"]
  },
  electronics_retail: {
    copy: ["TV", "smart TV", "OLED", "QLED", "LED", "installation", "warranty"],
    label: "TV/electronics retail website",
    pages: ["home", "products", "installation", "about", "contact"],
    visual: ["TV showroom", "OLED display", "home theater", "screen gallery"]
  },
  mobile_phone_shop: {
    copy: ["smartphones", "iPhone", "Samsung", "Android phones", "phone accessories", "cases", "chargers", "screen protectors", "unlocked phones", "trade-ins", "installment plans", "warranty", "repairs", "service counter", "device setup", "customer support"],
    label: "Mobile phone shop website",
    pages: ["home", "about", "services", "contact"],
    visual: ["smartphone display", "phone accessories shelf", "repair counter", "device comparison cards"]
  },
  upholstery: {
    copy: ["sofa reupholstery", "chair restoration", "fabric selection", "leather repair", "custom cushions", "furniture restoration", "free estimate", "before and after"],
    label: "Upholstery business website",
    pages: ["home", "about", "services", "blog", "contact"],
    visual: ["fabric texture", "before and after restoration", "warm craft studio", "premium home interior"]
  },
  bicycle_shop: {
    copy: ["bicycles", "cycling", "bike fitting", "helmets", "rider gear", "tune-up", "bicycle repair"],
    label: "Bicycle shop website",
    pages: ["home", "about", "services", "contact"],
    visual: ["cycling showroom", "repair stand", "rider gear"]
  },
  floral: {
    copy: ["flowers", "bouquet", "wedding", "event", "delivery", "gifting", "freshness"],
    label: "Floral/flower website",
    pages: ["home", "bouquets", "weddings", "about", "contact"],
    visual: ["bouquet gallery", "wedding flowers", "fresh flowers", "gift arrangement"]
  },
  furniture: {
    copy: ["sofa", "chair", "table", "cupboard", "collections", "showroom", "delivery"],
    label: "Furniture ecommerce website",
    pages: ["home", "products", "collections", "about", "contact"],
    visual: ["sofa", "chair", "living room", "showroom", "wood texture"]
  },
  gaming_controller: {
    copy: ["gaming controller", "controller", "console", "wireless", "pro gaming", "accessories", "compatibility", "grip", "low latency", "controller comparison", "gaming setup", "controller gallery", "warranty", "shipping", "support"],
    label: "Gaming controller product website",
    pages: ["home", "products", "controller-gallery", "about", "contact"],
    visual: ["controller hero visual", "gaming setup", "product gallery", "console accessory", "Apple Glass cards", "glass panels", "accent lighting"]
  },
  restaurant: {
    copy: ["menu", "food", "order", "delivery", "hours", "reservation"],
    label: "Restaurant/food website",
    pages: ["home", "menu", "order", "about", "contact"],
    visual: ["food", "menu", "restaurant interior", "dish", "chef"]
  },
  saas: {
    copy: ["features", "workflow", "integrations", "pricing", "CTA", "product"],
    label: "SaaS/product landing website",
    pages: ["home", "features", "pricing", "about", "contact"],
    visual: ["product UI", "dashboard", "workflow", "integration diagram"]
  }
};

function normalize(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function promptRequestsPythonStack(prompt: string) {
  return /\b(?:python|py|streamlit|flask|fastapi|django|tkinter|pyside|pyqt)\b/i.test(prompt);
}

function promptRequestsReactFrontendStack(prompt: string) {
  return /\b(?:react|vite|tsx|frontend react|react frontend|typescript frontend)\b/i.test(prompt);
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function inferDomain(input: BuildGeneratorContractInput) {
  const prompt = normalize(input.currentPrompt);
  const taxonomy = classifyDomainIntent(input.currentPrompt);

  if (taxonomy.profile && taxonomy.confidence >= 0.58) {
    return taxonomy.profile.id;
  }

  if (taxonomy.ambiguous) {
    return null;
  }

  const domain =
    input.compositionPlan.authoritativeDomain ??
    input.contextPriority.authoritativeDomain ??
    input.translatedIntent.domain ??
    input.translatedIntent.businessType;

  if (prompt.includes("gaming control") || prompt.includes("gaming controller") || prompt.includes("controler")) {
    return "gaming_controller";
  }

  if (prompt.includes("seafood") || prompt.includes("fresh catch") || prompt.includes("oyster") || prompt.includes("lobster")) {
    return "seafood_restaurant";
  }

  if (prompt.includes("cola") || prompt.includes("soft drink") || prompt.includes("soda") || prompt.includes("beverage")) {
    return "cola company / soft drinks";
  }

  if (
    prompt.includes("mobile phone shop") ||
    prompt.includes("phone shop") ||
    prompt.includes("smartphone store") ||
    prompt.includes("mobile store") ||
    prompt.includes("cellphone shop") ||
    prompt.includes("phone retail") ||
    prompt.includes("phone accessories") ||
    prompt.includes("iphone shop") ||
    prompt.includes("samsung phone shop") ||
    prompt.includes("android phone shop") ||
    prompt.includes("unlocked phones") ||
    prompt.includes("phone repair shop")
  ) {
    return "mobile_phone_shop";
  }

  return domain && !["generic_local_service", "Generic Local Service Website"].includes(domain) ? domain : null;
}

function generatorMode(input: BuildGeneratorContractInput): GeneratorMode {
  if (input.contextPriority.authoritativeMode === "ASK") return "answer_only";
  if (input.contextPriority.authoritativeIntentFamily === "targeted_text_replacement") return "small_edit";
  if (input.contextPriority.authoritativeMode === "CODE") return "code_generation";

  return "website_generation";
}

function requiredPages(input: BuildGeneratorContractInput, domain: string | null, mode: GeneratorMode) {
  if (mode !== "website_generation") return [];
  const sourceOfTruth = buildWebsiteSourceOfTruth({
    contract: input.projectContract,
    prompt: input.currentPrompt,
    translatedIntent: input.translatedIntent
  });
  const namedPages = sourceOfTruth.pages.length
    ? sourceOfTruth.pages
    : input.compositionPlan.pagePlans.map((page) => page.title);
  const inferredPages = domain ? domainSignals[domain]?.pages ?? [] : [];
  const count = input.translatedIntent.pages.count ?? (input.compositionPlan.pageCount || null);
  const pages = unique(namedPages.length ? namedPages : inferredPages);

  if (count && pages.length < count) {
    const fallback = domain === "restaurant" || domain === "seafood_restaurant"
      ? ["home", "menu", "about", "gallery", "contact"]
      : ["home", "products", "collections", "gallery", "services", "support", "about", "contact"];

    for (const page of fallback) {
      if (pages.length >= count) break;
      if (!pages.includes(page)) pages.push(page);
    }
  }

  return count ? pages.slice(0, count) : pages;
}

function fileStrategy(input: BuildGeneratorContractInput, mode: GeneratorMode, pages: string[]) {
  if (mode === "answer_only") return [];
  if (mode === "small_edit") return ["single_targeted_patch", "only files containing source text"];
  if (mode === "code_generation") {
    if (promptRequestsPythonStack(input.currentPrompt) && !promptRequestsReactFrontendStack(input.currentPrompt)) {
      return [
        "python_streamlit_app",
        "app.py",
        "requirements.txt",
        "data/mock_crm_data.py or data/mock_inventory_data.py",
        "README.md",
        "ARCHITECTURE.md",
        "SECURITY_AND_TESTING.md",
        "HASSALI.md"
      ];
    }

    return [
      "runnable_vite_react_app",
      "package.json",
      "vite.config.ts",
      "index.html",
      "src/main.tsx",
      "src/App.tsx",
      "src/styles.css",
      "src/lib/mock-data.ts",
      "src/components/*",
      "architecture/data/security docs"
    ];
  }

  return unique(["styles.css", "main.js", ...pages.map((page) => (page === "home" ? "index.html" : `${page.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.html`))]);
}

export function buildGeneratorContract(input: BuildGeneratorContractInput): GeneratorContract {
  const taxonomy = classifyDomainIntent(input.currentPrompt);
  const domain = inferDomain(input);
  const profile = domain ? domainSignals[domain] : null;
  const taxonomyProfile = getTaxonomyProfile(domain);
  const mode = generatorMode(input);
  const pages = requiredPages(input, domain, mode);
  const requiredPageCount = mode === "website_generation"
    ? input.translatedIntent.pages.count ?? (pages.length || input.compositionPlan.pageCount || null)
    : null;
  const requiredSections = mode === "website_generation"
    ? unique(input.compositionPlan.requiredSections.map((section) => section.title))
    : mode === "code_generation"
      ? unique(input.businessBlueprint.screens.length ? input.businessBlueprint.screens : input.compositionPlan.requiredSections.map((section) => section.title))
      : [];
  const requiredEntities = unique([
    ...(profile?.copy ?? taxonomyProfile?.websiteVocabulary ?? []),
    ...input.compositionPlan.productOrServiceEntities,
    ...input.businessBlueprint.mustInclude
  ]);
  const requiredVisualSignals = unique([
    ...(profile?.visual ?? taxonomyProfile?.visualHints ?? []),
    ...input.compositionPlan.assetIntent,
    ...input.compositionPlan.visualIntent,
    ...(input.assetVisualValidation?.expectedVisualSignals ?? [])
  ]);
  const blockedTerms = unique([
    ...genericForbiddenTerms,
    ...input.domainValidation.forbiddenSignals,
    ...input.assetVisualValidation?.blockedAssetCategories ?? [],
    ...input.proposalQuality?.repairHints.flatMap((hint) => genericForbiddenTerms.filter((term) => normalize(hint).includes(normalize(term)))) ?? []
  ]);
  const contractBlocks = [
    mode === "website_generation" && taxonomy.ambiguous
      ? `ambiguous domain classification: ${taxonomy.ambiguityNotes.join("; ")}`
      : "",
    mode === "website_generation" && requiredPageCount && pages.length < requiredPageCount
      ? `required page count ${requiredPageCount} could not be satisfied`
      : "",
    mode === "code_generation" && input.contextPriority.authoritativePreviewType === "website_static_preview"
      ? "CODE request has static website preview strategy"
      : ""
  ].filter(Boolean);
  const contractWarnings = [
    !domain ? "No authoritative domain was available; use conservative neutral copy." : "",
    mode === "website_generation" && requiredVisualSignals.length === 0 ? "No required visual signals were available." : ""
  ].filter(Boolean);
  const copyRules = [
    `Use authoritative domain: ${profile?.label ?? taxonomyProfile?.displayName ?? domain ?? "unknown"}.`,
    "Public copy must be customer-facing, not internal generator language.",
    "Do not use generic Local Service filler when a domain is known.",
    "Each page needs unique purpose and copy."
  ];
  const visualRules = [
    "Use domain-specific visual labels, alt text, and placeholders.",
    "Do not use generic hero/image/visual placeholder labels alone.",
    ...requiredVisualSignals.map((signal) => `Include visual signal: ${signal}`)
  ];
  const pageRules = mode === "website_generation"
    ? [
        requiredPageCount ? `Generate exactly ${requiredPageCount} page(s).` : "Generate only requested/necessary pages.",
        pages.length ? `Required pages: ${pages.join(", ")}.` : "Use composition pages if no explicit pages exist."
      ]
    : [];
  const usePythonCodeStack = mode === "code_generation" &&
    promptRequestsPythonStack(input.currentPrompt) &&
    !promptRequestsReactFrontendStack(input.currentPrompt);
  const modeRules = mode === "code_generation"
    ? usePythonCodeStack
      ? [
          "For explicit Python app-building requests, create Python / Streamlit source files plus docs.",
          "Do not generate package.json, vite.config.ts, index.html, src/main.tsx, src/App.tsx, or React/Vite files unless the prompt explicitly asks for a React frontend.",
          "Do not create a public marketing website in place of CODE app source."
        ]
      : [
          "For app-building requests, create runnable app source files plus docs.",
          "A Vite React app may include package.json, vite.config.ts, index.html, src/main.tsx, src/App.tsx, and src/styles.css.",
          "Do not create a public marketing website in place of CODE app source."
        ]
    : mode === "small_edit"
      ? ["Use a single targeted patch.", "Do not regenerate pages or assets."]
      : mode === "answer_only"
        ? ["Do not create file changes."]
        : ["Use website static preview files and page routes."];
  const regenerationRules = [
    "If regenerating after a block, convert blocked reasons into hard forbidden terms.",
    "Do not repeat blocked Local Service/Clear Services Studio/generic copy."
  ];
  const acceptanceChecks = unique([
    ...input.domainValidation.acceptanceChecks,
    ...input.compositionPlan.acceptanceChecks,
    ...(input.proposalQuality?.requiredChecks ?? []),
    ...(input.assetVisualValidation?.acceptanceChecks ?? []),
    "generator output obeys required pages, sections, domain signals, forbidden terms, and visual rules"
  ]);
  const enforcementPrompt = [
    "GENERATOR CONTRACT - HIGH PRIORITY:",
    `Mode: ${mode}.`,
    `Authoritative domain: ${profile?.label ?? domain ?? "unknown"}.`,
    requiredPageCount ? `Required page count: ${requiredPageCount}.` : null,
    pages.length ? `Required pages: ${pages.join(", ")}.` : null,
    requiredSections.length ? `Required sections/modules: ${requiredSections.join(", ")}.` : null,
    requiredEntities.length ? `Required copy signals: ${requiredEntities.slice(0, 20).join(", ")}.` : null,
    requiredVisualSignals.length ? `Required visual signals: ${requiredVisualSignals.slice(0, 20).join(", ")}.` : null,
    blockedTerms.length ? `Forbidden public terms/strategies: ${blockedTerms.slice(0, 40).join(", ")}.` : null,
    `Required file strategy: ${fileStrategy(input, mode, pages).join(", ") || "none"}.`,
    `Copy rules: ${copyRules.join(" ")}`,
    `Visual rules: ${visualRules.slice(0, 12).join(" ")}`,
    `Mode rules: ${modeRules.join(" ")}`,
    `Regeneration rules: ${regenerationRules.join(" ")}`
  ].filter(Boolean).join("\n");

  return {
    acceptanceChecks,
    authoritativeBusinessType: profile?.label ?? input.contextPriority.authoritativeBusinessType ?? input.translatedIntent.businessType,
    authoritativeDomain: domain,
    confidence: Math.min(0.96, Math.max(0.58, input.domainValidation.confidence)),
    contractBlocks,
    contractId: `${mode}_${domain ?? "unknown"}_generator_contract`,
    contractStatus: contractBlocks.length ? "blocked" : contractWarnings.length ? "warning" : "ready",
    contractWarnings,
    copyRules,
    enforcementPrompt,
    forbiddenFileStrategies: mode === "code_generation" ? ["public static marketing website without runnable app source"] : [],
    forbiddenSections: unique([...input.compositionPlan.forbiddenSections, "Local Service"]),
    forbiddenTerms: blockedTerms,
    generatorMode: mode,
    modeRules,
    pageRules,
    regenerationRules,
    requiredCopySignals: requiredEntities,
    requiredEntities,
    requiredFileStrategy: fileStrategy(input, mode, pages),
    requiredPageCount,
    requiredPages: pages,
    requiredSections,
    requiredVisualSignals,
    visualRules
  };
}

export function summarizeGeneratorContract(contract: GeneratorContract) {
  return [
    contract.contractId,
    `status=${contract.contractStatus}`,
    `mode=${contract.generatorMode}`,
    `domain=${contract.authoritativeDomain ?? "unknown"}`,
    `pages=${contract.requiredPageCount ?? contract.requiredPages.length}`,
    `forbidden=${contract.forbiddenTerms.length}`,
    `blocks=${contract.contractBlocks.length}`
  ].join("; ");
}
