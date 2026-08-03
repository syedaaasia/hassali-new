import {
  buildDomainBlueprint,
  type CapabilityPath
} from "@/lib/server/ai/capability-domain-blueprint";
import type { DecisionPlan } from "@/lib/server/ai/decision-engine";
import type { IntentIntelligence } from "@/lib/server/ai/intent-intelligence";
import type { ProposalContext } from "@/lib/server/ai/proposal-context";
import type { CompositionStrategy } from "@/lib/server/ai/reasoning-composition";

export type PromptSovereigntyContract = {
  contradictoryTerms: string[];
  expectedCapability: CapabilityPath | "rename" | "small_edit" | "theme_edit";
  expectedDomain: string;
  expectedTerms: string[];
  isExplicitNewBuild: boolean;
  prompt: string;
  requiredFiles: string[];
  requestedPalette: string[];
};

export type PromptAcceptanceResult = {
  blocked: boolean;
  issues: string[];
  mode: "blocked" | "normal" | "review_required";
  warnings: string[];
};

export type PromptAcceptanceChange = {
  action: string;
  path?: string;
  proposedContent?: string;
  summary?: string;
};

function lower(value: string) {
  return value.toLowerCase();
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function pageToPath(page: string) {
  const normalized = page.toLowerCase().trim();
  const pageMap: Record<string, string> = {
    "about us": "about.html",
    about: "about.html",
    blog: "blog.html",
    blogs: "blog.html",
    contact: "contact.html",
    home: "index.html",
    menu: "menu.html",
    products: "products.html",
    service: "services.html",
    services: "services.html",
    "our story": "story.html",
    story: "story.html"
  };

  return pageMap[normalized] ?? `${normalized.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "page"}.html`;
}

function explicitNewBuild(prompt: string, intent: IntentIntelligence, decision: DecisionPlan) {
  const promptText = lower(prompt);

  return (
    intent.userIntent === "new_site" ||
    decision.requestType === "website_generation" ||
    decision.requestType === "multi_page_generation" ||
    /\b(?:create|build|generate|design|make)\b[\s\S]{0,80}\b(?:website|site|web app|system|app|tool)\b/.test(promptText)
  );
}

function expectedCapabilityFor(decision: DecisionPlan): PromptSovereigntyContract["expectedCapability"] {
  if (decision.requestType === "rename") {
    return "rename";
  }

  if (decision.requestType === "visual_theme_edit") {
    return "theme_edit";
  }

  if (decision.requestType === "targeted_edit") {
    return "small_edit";
  }

  if (decision.requestType === "data_tool_generation") {
    return "data_tool";
  }

  if (decision.requestType === "code_system_generation") {
    return "web_app";
  }

  if (decision.requestType === "website_generation" || decision.requestType === "multi_page_generation") {
    return "business_website";
  }

  return "business_website";
}

function expectedTermsForDomain(domain: string, baseTerms: string[]) {
  const domainText = lower(domain);
  const domainTerms: Record<string, string[]> = {
    inventory: ["inventory", "stock", "suppliers", "sales", "reports", "dashboard", "products"],
    crm: ["crm", "customers", "leads", "pipeline", "auth", "database", "dashboard", "billing"],
    "coffee shop": ["coffee", "cafe", "espresso", "latte", "cold brew", "barista", "menu", "pastries"],
    coffee: ["coffee", "cafe", "espresso", "latte", "cold brew", "barista", "menu", "pastries"],
    "ice cream": ["ice cream", "flavors", "scoops", "gelato", "cones", "sundaes", "store", "online order"],
    ice_cream: ["ice cream", "flavors", "scoops", "gelato", "cones", "sundaes", "brand", "store"],
    "dentist clinic": ["dental", "dentist", "clinic", "appointment", "hygiene", "treatment", "smile"],
    dental: ["dental", "dentist", "clinic", "appointment", "hygiene", "treatment", "smile"],
    perfume: ["perfume", "fragrance", "scent", "bottles", "oud", "floral", "citrus", "musk", "testers", "gift"],
    television: ["television", "tv", "smart tv", "lcd", "led", "oled", "qled", "display", "home cinema", "wall mounting", "warranty"],
    tv: ["television", "tv", "smart tv", "lcd", "led", "oled", "qled", "display", "home cinema", "wall mounting", "warranty"],
    bike: ["bike", "rider", "showroom", "service", "gear"],
    bicycle: ["bicycle", "cycling", "tune-up", "accessories", "rider fitting"],
    billing: ["billing", "invoice", "invoices", "payment", "payments", "dashboard"],
    motorbike: ["motorbike", "motorcycle", "helmet", "engine service", "spare parts", "test ride"]
  };

  for (const [key, terms] of Object.entries(domainTerms)) {
    if (domainText.includes(key)) {
      return terms;
    }
  }

  return baseTerms;
}

function contradictoryTermsFor(domain: string, capability: PromptSovereigntyContract["expectedCapability"]) {
  const domainText = lower(domain);
  const contradictions: string[] = [];

  const allowsInventoryTerms =
    domainText.includes("inventory") ||
    domainText.includes("crm") ||
    domainText.includes("electronics") ||
    domainText.includes("retail") ||
    domainText.includes("store") ||
    domainText.includes("shop") ||
    domainText.includes("mobile_phone_shop") ||
    domainText.includes("mobile phone") ||
    domainText.includes("phone shop");

  if (!allowsInventoryTerms) {
    contradictions.push(
      "inventory system studio",
      "inventory system",
      "purchase orders",
      "records table",
      "operations software",
      "stock",
      "suppliers"
    );
  }

  if (capability === "web_app" && !domainText.includes("crm")) {
    contradictions.push(
      "reduce manual work studio",
      "records services",
      "request detected"
    );
  }

  if (!domainText.includes("coffee") && !domainText.includes("cafe")) {
    contradictions.push("coffee shop", "espresso", "latte", "cold brew", "barista", "canadian coffee customers");

    if (!domainText.includes("bakery") && !domainText.includes("bake") && !domainText.includes("pastry")) {
      contradictions.push("pastries");
    }
  }

  if (!domainText.includes("dentist") && !domainText.includes("dental")) {
    contradictions.push("dentist clinic", "dental services", "root canal", "orthodontic", "hygiene visits");
  }

  if (!domainText.includes("perfume") && !domainText.includes("fragrance")) {
    contradictions.push("scent atelier", "fragrance notes", "perfume bottles", "signature scent");
  }

  if (!domainText.includes("television") && !domainText.includes("tv") && !domainText.includes("electronics")) {
    contradictions.push("vision house", "oled", "qled", "home cinema", "wall mounting");
  }

  if (capability === "business_website") {
    contradictions.push("merge_csv.py", "csv merger script");
  }

  return unique(contradictions);
}

function isScannableProposalFile(path: string | undefined) {
  if (!path) {
    return false;
  }

  return path !== "HASSALI.md" && /\.(?:html|css|js|ts|tsx|md)$/i.test(path);
}

function contentFor(changes: PromptAcceptanceChange[]) {
  return lower(
    changes
      .filter((change) => isScannableProposalFile(change.path))
      .map((change) => change.proposedContent ?? "")
      .join("\n")
  );
}

function visitorContentFor(changes: PromptAcceptanceChange[]) {
  return lower(
    changes
      .filter((change) => change.path?.toLowerCase().endsWith(".html"))
      .map((change) => (change.proposedContent ?? "")
        .replace(/<!--[\s\S]*?-->/g, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " "))
      .join("\n")
  );
}

function escapedPattern(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
}

function affirmativeTermCount(content: string, term: string) {
  const pattern = new RegExp(`\\b${escapedPattern(lower(term))}\\b`, "gi");
  return content
    .split(/(?<=[.!?;])\s+/)
    .reduce((count, sentence) => {
      const matches = [...sentence.matchAll(pattern)];
      return count + matches.filter((match) => {
        const prefix = sentence.slice(Math.max(0, (match.index ?? 0) - 70), match.index ?? 0);
        return !/\b(?:avoid|avoids|avoiding|do not|does not|doesn't|never|no|not|without)\b[^.!?;]{0,60}$/i.test(prefix);
      }).length;
    }, 0);
}

function contradictoryEvidence(content: string, terms: string[]) {
  const matches = terms
    .map((term) => ({ count: affirmativeTermCount(content, term), term }))
    .filter((entry) => entry.count > 0);
  const artifactSignals = new Set([
    "csv merger script",
    "inventory system studio",
    "merge_csv.py",
    "operations software",
    "reduce manual work studio",
    "request detected"
  ]);
  const hard = matches.length >= 2 || matches.some((entry) => artifactSignals.has(lower(entry.term)) || entry.count >= 3);

  return { hard, matches };
}

function publicCopyLeakIssues(content: string) {
  const patterns: Array<[RegExp, string]> = [
    [/\bexplain\s+[a-z0-9 /-]{2,80}\s+with domain-specific proof/i, "public copy contains internal explain/domain-proof wording"],
    [/\bconnect\s+[a-z0-9 ,/-]{2,120}\s+with\s+[a-z0-9 ,/-]{2,120}\s+through a practical next step/i, "public copy contains internal connect-through-step wording"],
    [/\bspecific offer clarity\b/i, "public copy contains specific offer clarity filler"],
    [/\bdomain-specific proof\b/i, "public copy contains domain-specific proof filler"],
    [/\bdomain-specific positioning\b/i, "public copy contains domain-specific positioning filler"],
    [/\brequest detected\b/i, "public copy contains request detected filler"],
    [/\bdetected\s+\d+-page\b/i, "public copy contains detected page-count filler"],
    [/\bhero for business\b/i, "public copy contains hero placeholder wording"],
    [/\bpage hero\b/i, "public copy contains page hero placeholder wording"],
    [/\bcustomer outcomes\b/i, "public copy contains generic customer outcomes filler"],
    [/\bcustomer proof\b/i, "public copy contains generic customer proof filler"]
  ];

  return patterns
    .filter(([pattern]) => pattern.test(content))
    .map(([, issue]) => issue);
}

function promptAllowsContradictoryTerm(prompt: string, term: string) {
  const promptText = lower(prompt);
  const normalizedTerm = lower(term);
  const inventoryPrompt = /\b(?:inventory|inventory management|inventory system|stock|products?|billing|invoice|invoices|cash in|cash out|sales|purchase records?|suppliers?)\b/.test(promptText);

  if (
    inventoryPrompt &&
    /\b(?:inventory system studio|inventory system|purchase orders|records table|operations software|stock|suppliers|products?|billing|cash in|cash out|sales|purchase records?)\b/.test(normalizedTerm)
  ) {
    return true;
  }

  return promptText.includes(normalizedTerm);
}

function contentContainsContradictoryTerm(content: string, term: string) {
  const normalizedTerm = lower(term);
  if (normalizedTerm === "stock") {
    const withoutMaterialStock = content.replace(/\b(?:paper|card)\s*stock\b/g, "");
    return /\bstock\b/.test(withoutMaterialStock);
  }
  return content.includes(normalizedTerm);
}

export function buildPromptSovereigntyContract(input: {
  composition: CompositionStrategy;
  decision: DecisionPlan;
  intent: IntentIntelligence;
  prompt: string;
  proposalContext?: ProposalContext;
}): PromptSovereigntyContract {
  const promptText = lower(input.prompt);
  const blueprint = buildDomainBlueprint({ prompt: input.prompt });
  const routedCapability = expectedCapabilityFor(input.decision);
  const promptAsWebsite = /\b(?:website|site|landing page|marketing page|product page)\b/.test(promptText);
  const expectedCapability =
    input.proposalContext?.mode === "CODE" && input.proposalContext.isNewBuild
      ? "web_app"
      : input.proposalContext?.mode === "CODE" && routedCapability === "business_website" && !promptAsWebsite
        ? "web_app"
        : routedCapability === "business_website" && blueprint.capabilityPath === "web_app" && !promptAsWebsite
          ? "web_app"
          : routedCapability;
  const explicitPages = input.intent.requestedPages.map(pageToPath);
  const requiredFiles =
    input.proposalContext?.requiredFiles.length
      ? input.proposalContext.requiredFiles
      : expectedCapability === "web_app"
        ? input.decision.requiredFiles
        : explicitPages.length > 0
          ? unique([...explicitPages, ...(expectedCapability === "business_website" ? ["styles.css", "main.js"] : [])])
          : input.decision.requiredFiles;
  const expectedDomain = input.proposalContext?.domain ?? blueprint.domainLabel;
  const baseTerms = input.proposalContext?.mode === "CODE"
    ? unique([
        expectedDomain,
        input.proposalContext.framework ?? "",
        ...input.proposalContext.entities,
        ...(input.proposalContext.codeGenerationBrief?.modules ?? []),
        ...(input.proposalContext.codeGenerationBrief?.filePlan.map((file) => file.purpose) ?? []),
        ...blueprint.validationTerms
      ])
    : unique([expectedDomain, blueprint.domainLabel, ...blueprint.validationTerms, ...input.composition.businessType.split(/[\s/]+/)])
        .filter((term) => term.length > 3);
  const expectedTerms = expectedTermsForDomain(
    expectedDomain,
    baseTerms.filter((term) => term.length > 3)
  );

  return {
    contradictoryTerms: contradictoryTermsFor(expectedDomain, expectedCapability),
    expectedCapability,
    expectedDomain,
    expectedTerms,
    isExplicitNewBuild: explicitNewBuild(promptText, input.intent, input.decision),
    prompt: input.prompt,
    requiredFiles,
    requestedPalette: input.intent.palette
  };
}

export function validatePromptSovereignty(input: {
  changes: PromptAcceptanceChange[];
  contract: PromptSovereigntyContract;
}): PromptAcceptanceResult {
  const issues: string[] = [];
  const warnings: string[] = [];
  const content = contentFor(input.changes);
  const visitorContent = visitorContentFor(input.changes);
  const paths = new Set(input.changes.map((change) => change.path).filter(Boolean) as string[]);
  const fileChanges = input.changes.filter((change) => change.path);
  const copyLeakIssues = publicCopyLeakIssues(visitorContent);

  warnings.push(...copyLeakIssues);

  if (input.contract.expectedCapability === "rename") {
    if (fileChanges.length === 0) {
      issues.push("rename request did not produce a text replacement file change");
    }

    if (input.changes.some((change) => change.action === "create")) {
      issues.push("rename request should not create new files");
    }
  }

  if (input.contract.expectedCapability === "small_edit") {
    if (input.changes.some((change) => change.action === "create")) {
      issues.push("small edit should not create new files");
    }

    if (/hassali suggestion:/i.test(content)) {
      issues.push("small edit must make the requested change instead of adding a Hassali suggestion comment");
    }
  }

  if (input.contract.expectedCapability === "theme_edit") {
    if (!fileChanges.some((change) => change.path?.endsWith(".css"))) {
      issues.push("theme edit did not produce a CSS mutation");
    }

    const htmlFiles = fileChanges.filter((change) => change.path?.endsWith(".html"));

    if (htmlFiles.length > 0) {
      issues.push("theme edit must not create or update website pages");
    }

    if (
      /reduce manual work studio|local service customers|customer proof|request detected|original request|previous proposal was blocked/i.test(content)
    ) {
      issues.push("theme edit leaked regeneration or generic website copy");
    }
  }

  if (input.contract.expectedCapability === "business_website" || input.contract.expectedCapability === "web_app") {
    for (const requiredFile of input.contract.requiredFiles) {
      if (!paths.has(requiredFile)) {
        issues.push(`missing prompt-required file ${requiredFile}`);
      }
    }
  }

  if (input.contract.expectedCapability === "business_website") {
    if (!paths.has("styles.css") || !paths.has("main.js")) {
      issues.push("website proposal must include styles.css and main.js");
    }
  }

  if (
    input.contract.expectedCapability === "web_app" &&
    paths.has("index.html") &&
    paths.has("styles.css") &&
    paths.has("main.js") &&
    !paths.has("vite.config.ts") &&
    !Array.from(paths).some((path) => path.startsWith("src/"))
  ) {
    issues.push("CODE/web app request was converted into a static website scaffold");
  }

  if (input.contract.isExplicitNewBuild) {
    const matchedTerms = input.contract.expectedTerms.filter((term) => visitorContent.includes(lower(term)));
    const minimumMatches = Math.min(3, Math.max(1, input.contract.expectedTerms.length));

    if (matchedTerms.length < minimumMatches) {
      warnings.push(`generated output may need stronger ${input.contract.expectedDomain} vocabulary`);
    }
  }

  const possibleContradictions = input.contract.contradictoryTerms.filter((term) => {
    const normalized = lower(term);

    return !promptAllowsContradictoryTerm(input.contract.prompt, normalized) && contentContainsContradictoryTerm(visitorContent, normalized);
  });
  const contradiction = contradictoryEvidence(visitorContent, possibleContradictions);
  const leakedTerms = contradiction.matches.map((entry) => entry.term);

  if (contradiction.hard) {
    issues.push(`generated output contains contradictory or stale-domain terms: ${leakedTerms.slice(0, 5).join(", ")}`);
  } else if (leakedTerms.length > 0) {
    warnings.push(`isolated ambiguous vocabulary needs review but does not prove stale-domain drift: ${leakedTerms.join(", ")}`);
  }

  if (
    input.contract.requestedPalette.length > 0 &&
    paths.has("styles.css") &&
    !input.contract.requestedPalette.some((color) => content.includes(lower(color)))
  ) {
    warnings.push("requested palette should be visible in CSS tokens or comments");
  }

  if (/<img[^>]+src=["']\s*["']/i.test(content) || content.includes("source.unsplash.com")) {
    issues.push("image request contains empty or unreliable image source patterns");
  }

  if (issues.length > 0) {
    return {
      blocked: true,
      issues,
      mode: "blocked",
      warnings
    };
  }

  return {
    blocked: false,
    issues,
    mode: warnings.length > 0 ? "review_required" : "normal",
    warnings
  };
}
