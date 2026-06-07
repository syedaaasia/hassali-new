import {
  buildDomainBlueprint,
  type CapabilityPath
} from "@/lib/server/ai/capability-domain-blueprint";
import type { DecisionPlan } from "@/lib/server/ai/decision-engine";
import type { IntentIntelligence } from "@/lib/server/ai/intent-intelligence";
import type { CompositionStrategy } from "@/lib/server/ai/reasoning-composition";

export type PromptSovereigntyContract = {
  contradictoryTerms: string[];
  expectedCapability: CapabilityPath | "rename" | "theme_edit";
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

function includesAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
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

  if (decision.requestType === "data_tool_generation") {
    return "data_tool";
  }

  if (decision.requestType === "website_generation" || decision.requestType === "multi_page_generation") {
    return "business_website";
  }

  return decision.domain === "code/tooling project" ? "web_app" : "business_website";
}

function expectedTermsForDomain(domain: string, baseTerms: string[]) {
  const domainText = lower(domain);
  const domainTerms: Record<string, string[]> = {
    inventory: ["inventory", "stock", "suppliers", "sales", "reports", "dashboard", "products"],
    perfume: ["perfume", "fragrance", "scent", "bottles", "oud", "floral", "citrus", "musk", "testers", "gift"],
    television: ["television", "tv", "smart tv", "oled", "qled", "home cinema", "wall mounting", "warranty"],
    tv: ["television", "tv", "smart tv", "oled", "qled", "home cinema", "wall mounting", "warranty"],
    bike: ["bike", "rider", "showroom", "service", "gear"],
    bicycle: ["bicycle", "cycling", "tune-up", "accessories", "rider fitting"],
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

  if (!domainText.includes("inventory")) {
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

  if (!domainText.includes("perfume") && !domainText.includes("fragrance")) {
    contradictions.push("scent atelier", "fragrance notes", "perfume bottles", "signature scent");
  }

  if (!domainText.includes("television") && !domainText.includes("tv")) {
    contradictions.push("vision house", "oled", "qled", "home cinema", "wall mounting");
  }

  if (capability === "business_website") {
    contradictions.push("merge_csv.py", "csv merger script");
  }

  return unique(contradictions);
}

function contentFor(changes: PromptAcceptanceChange[]) {
  return lower(
    changes
      .map((change) => `${change.path ?? ""}\n${change.summary ?? ""}\n${change.proposedContent ?? ""}`)
      .join("\n")
  );
}

export function buildPromptSovereigntyContract(input: {
  composition: CompositionStrategy;
  decision: DecisionPlan;
  intent: IntentIntelligence;
  prompt: string;
}): PromptSovereigntyContract {
  const promptText = lower(input.prompt);
  const blueprint = buildDomainBlueprint({ prompt: input.prompt });
  const routedCapability = expectedCapabilityFor(input.decision);
  const expectedCapability =
    routedCapability === "business_website" && blueprint.capabilityPath === "web_app"
      ? "web_app"
      : routedCapability;
  const explicitPages = input.intent.requestedPages.map(pageToPath);
  const requiredFiles =
    explicitPages.length > 0
      ? unique([...explicitPages, ...(expectedCapability === "business_website" || expectedCapability === "web_app" ? ["styles.css", "main.js"] : [])])
      : input.decision.requiredFiles;
  const expectedTerms = expectedTermsForDomain(
    blueprint.domainLabel,
    unique([blueprint.domainLabel, ...blueprint.validationTerms, ...input.composition.businessType.split(/[\s/]+/)])
      .filter((term) => term.length > 3)
  );

  return {
    contradictoryTerms: contradictoryTermsFor(blueprint.domainLabel, expectedCapability),
    expectedCapability,
    expectedDomain: blueprint.domainLabel,
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
  const paths = new Set(input.changes.map((change) => change.path).filter(Boolean) as string[]);
  const fileChanges = input.changes.filter((change) => change.path);

  if (input.contract.expectedCapability === "rename") {
    if (fileChanges.length === 0) {
      issues.push("rename request did not produce a text replacement file change");
    }

    if (input.changes.some((change) => change.action === "create")) {
      issues.push("rename request should not create new files");
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

    if (!paths.has("styles.css") || !paths.has("main.js")) {
      issues.push("website proposal must include styles.css and main.js");
    }
  }

  if (input.contract.isExplicitNewBuild) {
    const matchedTerms = input.contract.expectedTerms.filter((term) => content.includes(lower(term)));
    const minimumMatches = Math.min(3, Math.max(1, input.contract.expectedTerms.length));

    if (matchedTerms.length < minimumMatches) {
      issues.push(`generated output does not contain enough ${input.contract.expectedDomain} vocabulary`);
    }
  }

  const leakedTerms = input.contract.contradictoryTerms.filter((term) => {
    const normalized = lower(term);

    return !lower(input.contract.prompt).includes(normalized) && content.includes(normalized);
  });

  if (leakedTerms.length > 0) {
    issues.push(`generated output contains contradictory or stale-domain terms: ${leakedTerms.slice(0, 5).join(", ")}`);
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
