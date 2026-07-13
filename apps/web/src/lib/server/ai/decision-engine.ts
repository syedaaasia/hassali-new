import { buildDomainBlueprint, isTechnicalBlueprint } from "@/lib/server/ai/capability-domain-blueprint";
import type { DiagnosticContext } from "@/lib/server/ai/diagnostic-context";
import type { IntentIntelligence } from "@/lib/server/ai/intent-intelligence";
import type { CompositionStrategy } from "@/lib/server/ai/reasoning-composition";
import { isFullWebsiteReplacementRequest } from "@/lib/server/ai/website-edit-intent";

export type DecisionRequestType =
  | "ask"
  | "code_system_generation"
  | "data_tool_generation"
  | "image_fix"
  | "invoice"
  | "multi_page_generation"
  | "rename"
  | "runtime_action"
  | "targeted_edit"
  | "visual_enhancement"
  | "visual_theme_edit"
  | "website_generation";

export type DecisionPlan = {
  changeStrategy: string;
  confidence: number;
  domain: DiagnosticContext["inferredDomain"];
  qualityCriteria: string[];
  reason: string;
  requestType: DecisionRequestType;
  requiredFiles: string[];
  siteStructure: {
    pageCount: number;
    pages: string[];
    sections: string[];
  };
};

type DecisionInput = {
  diagnostic: DiagnosticContext;
  prompt: string;
};

type ProposalQualityInput = {
  changes: Array<{
    action: string;
    path?: string;
    proposedContent?: string;
  }>;
  composition?: CompositionStrategy;
  decision: DecisionPlan;
  existingFileList?: string[];
  intent?: IntentIntelligence;
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
    (includesAny(promptText, ["website", "site", "landing page", "web page", "pages"]) ||
      /\b(?:ecommerce|e-commerce|online store|storefront)\b/.test(promptText))
  );
}

function isCodeSystemRequest(promptText: string) {
  return (
    /\b(?:create|build|generate|design|make)\b/.test(promptText) &&
    /\b(?:inventory system|management system|web app|dashboard app|dashboard|crm|erp|pos|api|backend|auth|authentication|database|billing|automation|mobile app|desktop app|iot|hardware)\b/.test(promptText) &&
    !/\b(?:website|site|landing page|static website|marketing page)\b/.test(promptText)
  );
}

function isRenameRequest(promptText: string) {
  if (/\b(?:do not|don't|dont|no)\s+rename\b/i.test(promptText)) {
    return false;
  }

  return (
    /\b(?:rename|replace)\b/i.test(promptText) ||
    /\bchange(?:\s+the)?\s+(?:name|text|brand|title)\b/i.test(promptText) ||
    /\bchange\s+["'`]?[a-z0-9][a-z0-9&' -]{0,80}["'`]?\s+(?:to|with)\s+["'`]?[a-z0-9][a-z0-9&' -]{0,80}["'`]?\b/i.test(promptText)
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

function pageToPath(page: string) {
  const normalized = page.toLowerCase().trim();
  const pageMap: Record<string, string> = {
    blog: "blog.html",
    blogs: "blog.html",
    bikes: "bikes.html",
    contact: "contact.html",
    distributors: "distributors.html",
    episodes: "episodes.html",
    gallery: "gallery.html",
    home: "index.html",
    index: "index.html",
    menu: "menu.html",
    products: "products.html",
    services: "services.html",
    shop: "products.html",
    story: "story.html"
  };

  return pageMap[normalized] ?? `${normalized.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "page"}.html`;
}

function requestedPageCount(promptText: string) {
  const numericMatch = promptText.match(/\b(\d+)\s*(?:page|pages)\b/i);

  if (numericMatch?.[1]) {
    return Math.max(1, Math.min(6, Number(numericMatch[1]) || 1));
  }

  if (/\bthree\s+(?:page|pages)\b/i.test(promptText)) {
    return 3;
  }

  if (/\btwo\s+(?:page|pages)\b/i.test(promptText)) {
    return 2;
  }

  return includesAny(promptText, ["multi page", "multipage", "multiple pages"]) ? 3 : 1;
}

function sectionsForDomain(domain: DiagnosticContext["inferredDomain"]) {
  const blueprint = buildDomainBlueprint({ prompt: domain });
  if (domain !== "generic website" && !["car rental", "car showroom", "code/tooling project", "florist", "jewellery", "media brand", "podcast", "portfolio", "restaurant", "SaaS", "youtube podcast"].includes(domain)) {
    return blueprint.sections;
  }

  const sections: Record<DiagnosticContext["inferredDomain"], string[]> = {
    "car rental": ["hero", "fleet showcase", "premium experience", "reservation CTA"],
    "car showroom": ["hero", "featured cars", "showroom experience", "test drive CTA"],
    "code/tooling project": ["hero", "workflow", "control", "reliability"],
    florist: ["hero", "bouquets", "seasonal flowers", "events", "booking"],
    "generic website": ["hero", "features", "trust", "contact"],
    jewellery: ["hero", "collections", "craftsmanship", "consultation"],
    "media brand": ["hero", "stories", "audience", "partnerships"],
    podcast: ["hero", "episodes", "hosts", "services", "listen CTA"],
    portfolio: ["hero", "projects", "experience", "contact"],
    restaurant: ["hero", "featured dishes", "chef story", "reservations"],
    SaaS: ["hero", "features", "integrations", "pricing", "CTA"],
    "youtube podcast": ["hero", "episodes", "hosts/about", "listen/watch CTA", "sponsorship/contact"]
  };

  return sections[domain] ?? sections["generic website"];
}

function pagePlan(promptText: string, domain: DiagnosticContext["inferredDomain"]) {
  const pageCount = requestedPageCount(promptText);
  const blueprint = buildDomainBlueprint({ prompt: `${promptText} ${domain}` });
  const isCommercePrompt = /\b(?:ecommerce|e-commerce|online store|toy shop|toy store|product store|shop|store)\b/.test(promptText);
  const hasExplicitServicesPage = /\b(?:services page|services pages|page(?:s)?\s*:?[^\n.]{0,120}\bservices\b|include[^\n.]{0,120}\bservices\b[^\n.]{0,80}\bpages?)\b/.test(promptText);
  const explicitPageTerms: Record<string, string[]> = {
    "about.html": ["about", "about us"],
    "bikes.html": ["bikes", "motorbikes", "motorcycles"],
    "blog.html": ["blog", "blogs"],
    "contact.html": ["contact"],
    "distributors.html": ["distributor", "distributors", "retailer", "retailers"],
    "episodes.html": ["episode", "episodes"],
    "gallery.html": ["gallery"],
    "index.html": ["home", "homepage", "landing"],
    "menu.html": ["menu"],
    "products.html": ["products", "product page", "shop page", "store page"],
    "services.html": hasExplicitServicesPage ? ["services"] : [],
    "story.html": ["story", "our story"]
  };
  const pages = ["index.html"];

  for (const [path, terms] of Object.entries(explicitPageTerms)) {
    if (!pages.includes(path) && includesAny(promptText, terms)) {
      pages.push(path);
    }
  }

  if (domain === "youtube podcast" || domain === "podcast" || includesAny(promptText, ["episode", "episodes"])) {
    pages.push("episodes.html");
  }

  if (isCommercePrompt && !pages.includes("products.html")) {
    pages.push("products.html");
  }

  if (hasExplicitServicesPage || includesAny(promptText, ["sponsorship", "sponsor"]) || (!isCommercePrompt && pageCount >= 2)) {
    pages.push("services.html");
  }

  if (includesAny(promptText, ["about", "host", "hosts"]) && !pages.includes("about.html")) {
    pages.push("about.html");
  }

  if (includesAny(promptText, ["contact", "booking", "reservation"]) || pageCount >= 3) {
    pages.push("contact.html");
  }

  const blueprintPages = blueprint.modules
    .filter((moduleName) => /^[a-z0-9 -]+$/i.test(moduleName))
    .map((moduleName) => pageToPath(moduleName));
  const fallbackPages = isCommercePrompt
    ? [...blueprintPages, "products.html", "about.html", "contact.html", "cart.html", "gallery.html", "blog.html"]
    : [...blueprintPages, "services.html", "about.html", "contact.html", "gallery.html", "blog.html"];
  const effectivePageCount = Math.max(pageCount, pages.length);

  for (const nextPage of fallbackPages) {
    if (pages.length >= effectivePageCount) {
      break;
    }

    if (!pages.includes(nextPage)) {
      pages.push(nextPage);
    }
  }

  const uniquePages = Array.from(new Set(pages));

  return {
    pageCount: uniquePages.slice(0, effectivePageCount).length,
    pages: uniquePages.slice(0, effectivePageCount)
  };
}

function requestTypeForPrompt(promptText: string, diagnostic: DiagnosticContext): DecisionRequestType {
  if (/\binvoice\b/i.test(promptText)) {
    return "invoice";
  }

  if (
    includesAny(promptText, ["csv", "spreadsheet"]) &&
    includesAny(promptText, ["merge", "merger", "combine", "desktop app", "python"])
  ) {
    return "data_tool_generation";
  }

  if (isFullWebsiteReplacementRequest(promptText) || isWebsiteCreationRequest(promptText)) {
    return requestedPageCount(promptText) > 1 ? "multi_page_generation" : "website_generation";
  }

  if (
    isCodeSystemRequest(promptText)
  ) {
    return "code_system_generation";
  }

  if (diagnostic.promptIntent === "visual_theme_edit" || isVisualThemeEditRequest(promptText)) {
    return "visual_theme_edit";
  }

  if (diagnostic.promptIntent === "text_rename" || isRenameRequest(promptText)) {
    return "rename";
  }

  if (diagnostic.promptIntent === "runtime_action") {
    return "runtime_action";
  }

  if (diagnostic.promptIntent === "image_fix") {
    return "image_fix";
  }

  if (includesAny(promptText, ["3 page", "three page", "multi page", "multipage", "multiple pages", "services page"])) {
    return "multi_page_generation";
  }

  if (diagnostic.promptIntent === "full_generation") {
    return requestedPageCount(promptText) > 1 ? "multi_page_generation" : "website_generation";
  }

  if (diagnostic.promptIntent === "animation_or_interaction" || diagnostic.promptIntent === "small_style_improvement") {
    return "visual_enhancement";
  }

  if (diagnostic.promptIntent === "ask_question") {
    return "ask";
  }

  return "targeted_edit";
}

function changeStrategyForType(type: DecisionRequestType, hasIndexHtml: boolean) {
  if (type === "rename") {
    return "Text replacement only across matching selected-project files. Do not regenerate the site.";
  }

  if (type === "image_fix") {
    return "Update image sources and alt text only, with CSS only when object-fit or sizing is missing.";
  }

  if (type === "visual_theme_edit") {
    return "Inspect CSS and update existing palette tokens, accents, gradients, buttons, shadows, and interactive color wells without rewriting content or layout.";
  }

  if (type === "visual_enhancement") {
    return hasIndexHtml
      ? "Preserve existing structure and make targeted CSS/JS enhancements."
      : "Create standard web files only if the project has no runnable static website yet.";
  }

  if (type === "data_tool_generation") {
    return "Create a lightweight local Python data tool with a clear script, README, safe file handling, and no package installs.";
  }

  if (type === "code_system_generation") {
    return "Create a serious CODE proposal with architecture, data model, security, implementation phases, environment needs, and verification plan. Do not create a fake static website.";
  }

  if (type === "multi_page_generation") {
    return "Create or update the requested static HTML pages plus shared CSS and JavaScript.";
  }

  if (type === "website_generation") {
    return "Create or update index.html, styles.css, and main.js. Never write website code into welcome.ts.";
  }

  if (type === "runtime_action") {
    return "Use approved preview runtime operations only.";
  }

  return "Use the smallest safe file change that satisfies the request.";
}

function repeatedOccurrences(content: string, pattern: RegExp) {
  return content.match(pattern)?.length ?? 0;
}

function unrelatedCategoryTerms(businessText: string) {
  const categories = [
    {
      match: ["beauty", "skincare", "cream", "cosmetic"],
      terms: ["shoe", "shoes", "sneaker", "sneakers", "footwear", "bakery", "pastry", "bread", "developer", "code editor"]
    },
    {
      match: ["bakery", "bread", "pastry"],
      terms: ["shoe", "shoes", "sneaker", "sneakers", "footwear", "skincare", "cosmetic", "developer", "code editor"]
    },
    {
      match: ["footwear", "shoe", "sneaker"],
      terms: ["skincare", "cosmetic", "bakery", "pastry", "bread", "developer", "code editor"]
    }
  ];
  const category = categories.find((item) => item.match.some((term) => businessText.includes(term)));

  return category?.terms ?? ["developer", "code editor", "terminal", "repository"];
}

function hasDuplicatedAdjacentWords(content: string) {
  return /\b([a-z][a-z0-9-]{2,})\s+\1\b/i.test(content);
}

export function buildDecisionPlan(input: DecisionInput): DecisionPlan {
  const promptText = lower(input.prompt);
  const requestType = requestTypeForPrompt(promptText, input.diagnostic);
  const siteStructure = pagePlan(promptText, input.diagnostic.inferredDomain);
  const isWebsiteRequest = requestType === "website_generation" || requestType === "multi_page_generation";
  const requiredFiles = isWebsiteRequest
    ? [...siteStructure.pages, "styles.css", "main.js"]
    : requestType === "code_system_generation"
      ? ["ARCHITECTURE.md", "DATA_MODEL.md", "IMPLEMENTATION_PLAN.md", "SECURITY_AND_TESTING.md"]
    : requestType === "data_tool_generation"
      ? ["merge_csv.py", "README.md"]
    : requestType === "visual_theme_edit"
      ? ["styles.css"]
    : requestType === "visual_enhancement"
      ? ["styles.css", "main.js"]
      : [];
  const hasIndexHtml = input.diagnostic.fileList.includes("index.html");

  return {
    changeStrategy: changeStrategyForType(requestType, hasIndexHtml),
    confidence:
      input.diagnostic.inferredDomain === "generic website" && isWebsiteRequest && !includesAny(promptText, ["website", "site", "landing"])
        ? 0.68
        : 0.88,
    domain: input.diagnostic.inferredDomain,
    qualityCriteria: [
      "domain match",
      "requested file/page count match",
      "no welcome.ts pollution",
      "no blank files",
      "no unrelated rewrite",
      "preview readiness",
      "visual quality baseline",
      "responsiveness",
      "image relevance"
    ],
    reason: `Detected ${requestType.replaceAll("_", " ")} for ${input.diagnostic.inferredDomain}; ${changeStrategyForType(requestType, hasIndexHtml)}`,
    requestType,
    requiredFiles,
    siteStructure: {
      ...siteStructure,
      sections: sectionsForDomain(input.diagnostic.inferredDomain)
    }
  };
}

export function shouldUseDeterministicDecision(decision: DecisionPlan) {
  return [
    "image_fix",
    "invoice",
    "code_system_generation",
    "data_tool_generation",
    "multi_page_generation",
    "rename",
    "runtime_action",
    "visual_theme_edit",
    "visual_enhancement",
    "website_generation"
  ].includes(decision.requestType);
}

export function scoreProposalQuality(input: ProposalQualityInput) {
  let score = 100;
  const issues: string[] = [];
  const changedPaths = new Set(input.changes.map((change) => change.path).filter(Boolean) as string[]);
  const availablePaths = new Set([...(input.existingFileList ?? []), ...changedPaths]);
  const compositionRequiredFiles = input.composition
    ? [...input.composition.siteArchitecture.pages.map(pageToPath), "styles.css", "main.js"]
    : null;
  const allContent = input.changes
    .map((change) => change.proposedContent ?? "")
    .join("\n")
    .toLowerCase();
  const isWebsiteRequest =
    input.decision.requestType === "website_generation" ||
    input.decision.requestType === "multi_page_generation";
  const isThemeEdit = input.decision.requestType === "visual_theme_edit";
  const genericFillerPhrases = [
    "business offers, services, proof, customer outcomes",
    "built around trust",
    "clear offer studio",
    "domain-specific positioning",
    "hero for business",
    "hero shaped around",
    "page hero",
    "specific offer clarity studio",
    "detected 6-page",
    "detected 5-page",
    "detected 4-page",
    "local service",
    "with smart context",
    "with bike context",
    "trust / trust",
    "trust proof",
    "build faster with our platform",
    "ship faster with our platform",
    "all-in-one platform for teams"
  ];

  if (genericFillerPhrases.some((phrase) => allContent.includes(phrase))) {
    score -= 45;
    issues.push("proposal contains generic filler copy");
  }

  if (hasDuplicatedAdjacentWords(allContent)) {
    score -= 18;
    issues.push("proposal contains duplicated adjacent words or brand terms");
  }

  if (isWebsiteRequest && /\bbg-blue-500\b|\btext-gray-700\b|\bfrom-blue-500\b|\bto-purple-500\b/.test(allContent)) {
    score -= 18;
    issues.push("website proposal contains generic Tailwind color defaults");
  }

  if (isWebsiteRequest && repeatedOccurrences(allContent, /\brounded-md\b/g) >= 5) {
    score -= 12;
    issues.push("website proposal overuses generic rounded-md card styling");
  }

  if (
    isWebsiteRequest &&
    repeatedOccurrences(allContent, /grid-template-columns:\s*repeat\(3,\s*1fr\)|grid-cols-3/g) >= 3
  ) {
    score -= 12;
    issues.push("website proposal repeats equal three-card grid patterns");
  }

  if (/<img[^>]+src=["']\s*["']/i.test(allContent) || allContent.includes("source.unsplash.com")) {
    score -= 25;
    issues.push("proposal contains empty or unreliable image source patterns");
  }

  for (const change of input.changes) {
    if (change.path === "welcome.ts" && isWebsiteRequest) {
      score -= 35;
      issues.push("website request targets welcome.ts");
    }

    if (
      (change.action === "create" || change.action === "update") &&
      (!change.proposedContent || change.proposedContent.trim().length === 0)
    ) {
      score -= 45;
      issues.push(`${change.path ?? "unknown file"} has blank content`);
    }

    if (
      typeof change.proposedContent === "string" &&
      (repeatedOccurrences(change.proposedContent, /const\s+revealTargets\s*=/g) > 1 ||
        repeatedOccurrences(change.proposedContent, /\/\*\s*Hassali safe enhancement:/g) > 1 ||
        repeatedOccurrences(change.proposedContent, /function\s+showCarouselCard\s*\(/g) > 1)
    ) {
      score -= 25;
      issues.push(`${change.path ?? "unknown file"} contains repeated generated CSS/JS blocks`);
    }
  }

  if (isWebsiteRequest) {
    for (const requiredFile of compositionRequiredFiles ?? input.decision.requiredFiles) {
      if (!availablePaths.has(requiredFile)) {
        score -= 20;
        issues.push(`missing required file ${requiredFile}`);
      }
    }

    const htmlPageCount = [...availablePaths].filter((path) => path.endsWith(".html")).length;
    const expectedPageCount =
      input.composition?.siteArchitecture.pageCount ?? input.decision.siteStructure.pageCount;

    if (htmlPageCount < expectedPageCount) {
      score -= 30;
      issues.push("requested page count is not satisfied");
    }

    const indexChange = input.changes.find((change) => change.path === "index.html");
    const cssChange = input.changes.find((change) => change.path === "styles.css");

    if (indexChange?.proposedContent && !/<html[\s>]/i.test(indexChange.proposedContent)) {
      score -= 25;
      issues.push("index.html is not a full HTML document");
    }

    if (
      indexChange?.proposedContent &&
      !/(images\.unsplash\.com|<img\s|domain-visual-placeholder|role="img")/i.test(indexChange.proposedContent)
    ) {
      score -= 10;
      issues.push("website proposal lacks relevant imagery");
    }

    if (
      input.intent?.requiredFeatures.some((feature) => feature.includes("image")) &&
      indexChange?.proposedContent &&
      !/(images\.unsplash\.com|<img\s|domain-visual-placeholder|role="img")/i.test(indexChange.proposedContent)
    ) {
      score -= 24;
      issues.push("image request does not include a reliable image or domain visual panel");
    }

    if (cssChange?.proposedContent && !/@media/i.test(cssChange.proposedContent)) {
      score -= 10;
      issues.push("CSS lacks responsive media rules");
    }

    if (
      cssChange?.proposedContent &&
      !/(auto-fit|minmax\(min\(100%,|grid-template-columns:\s*1fr|flex-wrap:\s*wrap)/i.test(cssChange.proposedContent)
    ) {
      score -= 14;
      issues.push("CSS lacks narrow-preview layout safety");
    }

    if (input.intent?.palette.length) {
      const cssContent = (cssChange?.proposedContent ?? "").toLowerCase();
      const missingPalette = input.intent.palette.filter((color) => !cssContent.includes(color.toLowerCase()));

      if (missingPalette.length > 0) {
        score -= 12;
        issues.push(`requested palette not reflected: ${missingPalette.join(", ")}`);
      }

      if (
        input.intent.palette.includes("maroon") &&
        /#d97706|#f0c56c|#c6923e|\bgold\b|\borange\b/i.test(cssChange?.proposedContent ?? "")
      ) {
        score -= 30;
        issues.push("maroon request leaks gold/orange accent tokens");
      }
    }

    if (input.intent?.visualStyle.length) {
      const expectedGlass =
        input.intent.visualStyle.some((style) => style.toLowerCase().includes("glass")) ||
        input.intent.visualStyle.some((style) => style.toLowerCase().includes("apple glass"));

      if (expectedGlass && !/(glass|backdrop-filter|blur)/i.test(cssChange?.proposedContent ?? "")) {
        score -= 12;
        issues.push("requested glass visual language not reflected");
      }
    }

    if (input.composition) {
      const businessText = input.composition.businessType.toLowerCase();
      const blueprint = buildDomainBlueprint({
        prompt: `${input.intent?.domain ?? ""} ${input.composition.businessType} ${input.composition.reasoningSummary}`
      });
      const isTechnical =
        businessText.includes("ai tooling") ||
        businessText.includes("coding") ||
        businessText.includes("developer") ||
        businessText.includes("dev platform") ||
        businessText.includes("engineering product") ||
        businessText.includes("programming") ||
        businessText.includes("software product") ||
        isTechnicalBlueprint(blueprint);
      const developerLeakTerms = blueprint.forbiddenTerms.length
        ? blueprint.forbiddenTerms
        : [
            "api",
            "build faster",
            "code editor",
            "coding",
            "developer",
            "engineering",
            "programming",
            "repository",
            "terminal"
          ];

      if (!isTechnical && developerLeakTerms.some((term) => allContent.includes(term))) {
        score -= 40;
        issues.push("non-technical business proposal contains developer/tooling wording");
      }

      const domainSignals = blueprint.validationTerms
        .map((term) => term.toLowerCase())
        .filter((term) => term.length > 3 && !["business", "website", "services"].includes(term));
      const matchedDomainSignals = domainSignals.filter((signal) => allContent.includes(signal));

      if (domainSignals.length > 0 && matchedDomainSignals.length < Math.min(2, domainSignals.length)) {
        score -= 32;
        issues.push(
          `proposal does not contain enough domain-specific terms for ${blueprint.domainLabel}: ${domainSignals.slice(0, 5).join(", ")}`
        );
      }

      if (
        blueprint.ambiguity.isAmbiguous &&
        (allContent.includes("bicycle") || allContent.includes("cycling") || allContent.includes("motorcycle") || allContent.includes("motorbike"))
      ) {
        score -= 24;
        issues.push("ambiguous bike request overcommits to bicycle or motorbike language");
      }

      if (
        (businessText.includes("perfume") || businessText.includes("fragrance")) &&
        !/(fragrance|scent|oud|floral|citrus|musk|perfume bottle|tester|gift set|signature scent)/i.test(allContent)
      ) {
        score -= 32;
        issues.push("perfume proposal lacks fragrance-specific vocabulary");
      }

      const unrelatedTerms = unrelatedCategoryTerms(businessText).filter((term) =>
        allContent.includes(term)
      );

      if (unrelatedTerms.length > 0) {
        score -= 25;
        issues.push(`proposal contains unrelated category terms: ${Array.from(new Set(unrelatedTerms)).join(", ")}`);
      }

      const businessSignals = [
        ...input.composition.businessType.split(/[\s/]+/),
        ...input.composition.brandPositioning,
        ...input.composition.businessGoals
      ]
        .map((signal) => signal.toLowerCase())
        .filter((signal) => signal.length > 3);

      if (businessSignals.length > 0 && !businessSignals.some((signal) => allContent.includes(signal))) {
        score -= 18;
        issues.push("composition business context is not reflected");
      }

      if (repeatedOccurrences(allContent, /\bconnect [^.]{0,120} through a practical next step/gi) > 2) {
        score -= 18;
        issues.push("proposal repeats the same section copy pattern");
      }
    }
  }

  if (isThemeEdit) {
    const cssChanges = input.changes.filter((change) => change.path?.endsWith(".css"));
    const cssContent = cssChanges.map((change) => change.proposedContent ?? "").join("\n").toLowerCase();

    if (cssChanges.length === 0 || cssContent.trim().length === 0) {
      score -= 60;
      issues.push("visual theme edit does not include a CSS mutation");
    }

    if (input.intent?.palette.length) {
      const paletteApplied = input.intent.palette.some((color) => cssContent.includes(color.toLowerCase()));

      if (!paletteApplied) {
        score -= 30;
        issues.push(`visual theme edit does not apply requested palette: ${input.intent.palette.join(", ")}`);
      }
    }
  }

  return {
    issues,
    passed: score >= 75,
    score
  };
}
