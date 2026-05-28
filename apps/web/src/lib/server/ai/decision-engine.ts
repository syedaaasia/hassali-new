import type { DiagnosticContext } from "@/lib/server/ai/diagnostic-context";
import type { IntentIntelligence } from "@/lib/server/ai/intent-intelligence";
import type { CompositionStrategy } from "@/lib/server/ai/reasoning-composition";

export type DecisionRequestType =
  | "ask"
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
    includesAny(promptText, ["website", "site", "landing page", "web page", "pages"])
  );
}

function isRenameRequest(promptText: string) {
  return (
    /\b(?:rename|replace)\b/i.test(promptText) ||
    /\bchange(?:\s+the)?\s+(?:name|text|brand|title)\b/i.test(promptText) ||
    /\bchange\s+["'`]?[a-z0-9][a-z0-9&' -]{0,80}["'`]?\s+to\s+["'`]?[a-z0-9][a-z0-9&' -]{0,80}["'`]?\b/i.test(promptText)
  );
}

function isVisualThemeEditRequest(promptText: string) {
  const colorTerms = "green|blue|pink|white|black|gold|brown|cream|teal|red";

  return (
    /\b(?:change|make|update|switch|turn)\b[\s\S]{0,80}\b(?:color|colors|colour|colours|theme|palette)\b/.test(promptText) ||
    /\b(?:color|colors|colour|colours|theme|palette)\b[\s\S]{0,80}\b(?:to|from|green|blue|pink|white|black|gold|brown|cream|teal|red)\b/.test(promptText) ||
    new RegExp(`\\b(?:make|turn|change|update|switch)\\b[\\s\\S]{0,100}\\b(?:${colorTerms})\\b`).test(promptText)
  );
}

function pageToPath(page: string) {
  const normalized = page.toLowerCase().trim();
  const pageMap: Record<string, string> = {
    blog: "blog.html",
    blogs: "blog.html",
    contact: "contact.html",
    episodes: "episodes.html",
    gallery: "gallery.html",
    home: "index.html",
    index: "index.html",
    menu: "menu.html",
    products: "products.html",
    services: "services.html",
    shop: "products.html"
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
  const explicitPageTerms: Record<string, string[]> = {
    "about.html": ["about", "about us"],
    "blog.html": ["blog", "blogs"],
    "contact.html": ["contact"],
    "episodes.html": ["episode", "episodes"],
    "gallery.html": ["gallery"],
    "index.html": ["home", "homepage", "landing"],
    "menu.html": ["menu"],
    "products.html": ["products", "shop", "store"],
    "services.html": ["services", "service"]
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

  if (includesAny(promptText, ["services", "sponsorship", "sponsor"]) || pageCount >= 2) {
    pages.push("services.html");
  }

  if (includesAny(promptText, ["about", "host", "hosts"]) && !pages.includes("about.html")) {
    pages.push("about.html");
  }

  if (includesAny(promptText, ["contact", "booking", "reservation"]) || pageCount >= 3) {
    pages.push("contact.html");
  }

  const fallbackPages = ["services.html", "about.html", "contact.html", "gallery.html", "blog.html"];

  for (const nextPage of fallbackPages) {
    if (pages.length >= pageCount) {
      break;
    }

    if (!pages.includes(nextPage)) {
      pages.push(nextPage);
    }
  }

  const uniquePages = Array.from(new Set(pages));

  return {
    pageCount: uniquePages.slice(0, pageCount).length,
    pages: uniquePages.slice(0, pageCount)
  };
}

function requestTypeForPrompt(promptText: string, diagnostic: DiagnosticContext): DecisionRequestType {
  if (/\binvoice\b/i.test(promptText)) {
    return "invoice";
  }

  if (isWebsiteCreationRequest(promptText)) {
    return requestedPageCount(promptText) > 1 ? "multi_page_generation" : "website_generation";
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

export function buildDecisionPlan(input: DecisionInput): DecisionPlan {
  const promptText = lower(input.prompt);
  const requestType = requestTypeForPrompt(promptText, input.diagnostic);
  const siteStructure = pagePlan(promptText, input.diagnostic.inferredDomain);
  const isWebsiteRequest = requestType === "website_generation" || requestType === "multi_page_generation";
  const requiredFiles = isWebsiteRequest
    ? [...siteStructure.pages, "styles.css", "main.js"]
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

    if (indexChange?.proposedContent && !/(images\.unsplash\.com|<img\s)/i.test(indexChange.proposedContent)) {
      score -= 10;
      issues.push("website proposal lacks relevant imagery");
    }

    if (cssChange?.proposedContent && !/@media/i.test(cssChange.proposedContent)) {
      score -= 10;
      issues.push("CSS lacks responsive media rules");
    }

    if (input.intent?.palette.length) {
      const cssContent = (cssChange?.proposedContent ?? "").toLowerCase();
      const missingPalette = input.intent.palette.filter((color) => !cssContent.includes(color.toLowerCase()));

      if (missingPalette.length > 0) {
        score -= 12;
        issues.push(`requested palette not reflected: ${missingPalette.join(", ")}`);
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
      const isTechnical =
        businessText.includes("ai tooling") ||
        businessText.includes("coding") ||
        businessText.includes("developer") ||
        businessText.includes("dev platform") ||
        businessText.includes("engineering product") ||
        businessText.includes("programming") ||
        businessText.includes("software product");
      const developerLeakTerms = [
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
