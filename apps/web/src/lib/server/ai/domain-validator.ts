import type { BusinessBlueprint } from "@/lib/server/ai/blueprint-matcher";
import type { CompositionPlan } from "@/lib/server/ai/composition-engine";
import type { ContextPriorityResult } from "@/lib/server/ai/context-priority-engine";
import type { ExecutionPlan } from "@/lib/server/ai/execution-planner";
import type { TranslatedIntentSpec } from "@/lib/server/ai/intent-translator";
import type {
  ProposalContext,
  ValidationSeverity
} from "@/lib/server/ai/proposal-context";
import type { ProjectContract } from "@/lib/server/ai/project-contract";
import type { TaskDecomposition } from "@/lib/server/ai/task-decomposer";

export type DomainValidationMode = "pre_proposal_context" | "proposal_content";
export type DomainValidationSeverity = ValidationSeverity;
export type DomainValidationStatus = "blocked" | "passed" | "review_required";

export type DomainValidationResult = {
  acceptanceChecks: string[];
  authoritativeDomain: string | null;
  confidence: number;
  detectedContractContamination: string[];
  detectedDomainDrift: string[];
  detectedForbiddenSignals: string[];
  detectedGenericCopy: string[];
  detectedModeDrift: string[];
  detectedPreviewDrift: string[];
  expectedSignals: string[];
  fileStrategyIssues: string[];
  forbiddenSignals: string[];
  missingSignals: string[];
  pageIssues: string[];
  repairHints: string[];
  requiredSignals: string[];
  sectionIssues: string[];
  severity: DomainValidationSeverity;
  shouldBlockProposal: boolean;
  validationId: string;
  validationMode: DomainValidationMode;
  validationScore: number;
  validationStatus: DomainValidationStatus;
};

type ValidateDomainInput = {
  businessBlueprint: BusinessBlueprint;
  compositionPlan: CompositionPlan;
  contextPriority: ContextPriorityResult;
  currentPrompt: string;
  executionPlan: ExecutionPlan;
  productMode: "ASK" | "CODE" | "WEBSITE";
  proposalContext?: ProposalContext;
  projectContract: ProjectContract | null;
  proposalSummary?: string;
  proposedFiles?: Record<string, string>;
  taskDecomposition: TaskDecomposition;
  translatedIntent: TranslatedIntentSpec;
  validationMode: DomainValidationMode;
};

type ValidationProfile = {
  forbidden: string[];
  required: string[];
};

const genericForbidden = [
  "Local Service",
  "Clear Services Studio",
  "clear services",
  "detected services",
  "request detected",
  "specific offer clarity",
  "domain-specific proof",
  "practical details",
  "customer use cases",
  "Help users understand",
  "Help gift buyers understand floral, service, gifting",
  "CTA for Local Service",
  "Services for Local Service",
  "Contact Details for Local Service",
  "Form for Local Service",
  "Hero for Local Service"
];

const profiles: Record<string, ValidationProfile> = {
  coffee: {
    forbidden: ["dental", "dentist", "doctor", "OLED", "QLED", "wall mounting"],
    required: ["coffee", "cafe", "menu", "drinks", "pickup", "hours"]
  },
  crm: {
    forbidden: ["Local Service", "Clear Services Studio", "public marketing website"],
    required: ["dashboard", "contacts", "deals", "tasks", "billing", "auth", "data model"]
  },
  dental: {
    forbidden: ["cafe", "coffee", "pickup", "sofa", "cupboard", "OLED", "QLED"],
    required: ["dental", "dentist", "treatments", "appointment", "hygiene", "doctors", "patient"]
  },
  electronics_retail: {
    forbidden: ["dental", "dentist", "doctor", "bouquet", "floral", "coffee", "cafe", "sofa"],
    required: ["TV", "smart TV", "OLED", "QLED", "LED", "installation", "warranty", "delivery"]
  },
  mobile_phone_shop: {
    forbidden: ["dental", "dentist", "coffee", "cafe", "seafood", "car rental", "cycling", "bicycle", "SaaS", "dashboard conversion"],
    required: ["smartphones", "iPhone", "Samsung", "Android phones", "phone accessories", "warranty", "repairs", "customer support"]
  },
  floral: {
    forbidden: ["Local Service", "Clear Services Studio", "developer", "OLED", "QLED", "dental"],
    required: ["bouquet", "flowers", "wedding", "event", "delivery", "gifting", "freshness", "arrangements"]
  },
  furniture: {
    forbidden: ["Local Service", "Clear Services Studio", "booking CTA", "dental", "doctor", "coffee", "cafe"],
    required: ["sofa", "chair", "table", "cupboard", "wardrobe", "products", "collections", "showroom", "delivery"]
  },
  restaurant: {
    forbidden: ["developer", "OLED", "QLED", "dental treatments", "television", "electronics", "CRM", "Local Service"],
    required: ["menu", "food", "reservation", "hours", "contact"]
  },
  seafood_restaurant: {
    forbidden: ["television", "TV", "electronics", "OLED", "QLED", "CRM", "products.html", "collections.html", "Local Service"],
    required: ["seafood", "menu", "reservation", "fresh catch", "gallery", "contact"]
  },
  saas: {
    forbidden: ["Local Service", "clinic doctors", "coffee pickup"],
    required: ["features", "workflow", "integrations", "pricing", "CTA"]
  }
};

function normalize(value: string) {
  return value.toLowerCase();
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function includesSignal(text: string, signal: string) {
  return normalize(text).includes(normalize(signal));
}

function domainVocabulary(domain: string | null) {
  if (!domain || normalize(domain) === "unknown") {
    return [];
  }

  const domainText = normalize(domain);
  const words = domainText
    .split(/[^a-z0-9+]+/i)
    .map((word) => word.trim())
    .filter((word) => word.length > 2 && !["and", "the", "for", "with"].includes(word));
  const expanded = [...words];

  if (domainText.includes("cola") || domainText.includes("soft drink") || domainText.includes("soda") || domainText.includes("beverage")) {
    expanded.push("cola", "soft drink", "soda", "beverage", "flavor", "refresh");
  }

  if (domainText.includes("mobile phone") || domainText.includes("phone shop") || domainText.includes("smartphone") || domainText.includes("cellphone")) {
    expanded.push("smartphones", "iPhone", "Samsung", "Android phones", "phone accessories", "cases", "chargers", "screen protectors", "unlocked phones", "warranty", "repairs", "device setup");
  }

  return unique(expanded);
}

function contentFromFiles(files?: Record<string, string>) {
  return Object.entries(files ?? {})
    .map(([path, content]) => `\nFILE:${path}\n${content}`)
    .join("\n");
}

function profileFor(domain: string | null) {
  const normalizedDomain = domain ? normalize(domain) : null;
  if (domain && profiles[domain]) return profiles[domain];
  if (normalizedDomain?.includes("seafood") || normalizedDomain?.includes("restaurant")) return profiles.seafood_restaurant;
  if (normalizedDomain?.includes("crm")) return profiles.crm;
  if (normalizedDomain?.includes("dental")) return profiles.dental;
  if (normalizedDomain?.includes("coffee") || normalizedDomain?.includes("cafe")) return profiles.coffee;
  if (normalizedDomain?.includes("furniture")) return profiles.furniture;
  if (normalizedDomain?.includes("floral") || normalizedDomain?.includes("flower")) return profiles.floral;
  if (normalizedDomain?.includes("mobile_phone") || normalizedDomain?.includes("mobile phone") || normalizedDomain?.includes("phone shop") || normalizedDomain?.includes("smartphone")) return profiles.mobile_phone_shop;
  if (normalizedDomain?.includes("tv") || normalizedDomain?.includes("electronics")) return profiles.electronics_retail;

  return {
    forbidden: ["developer/coder fallback", "keyword-chain copy patterns"],
    required: domainVocabulary(domain)
  };
}

function detectGenericCopy(text: string) {
  const generic = genericForbidden.filter((signal) => includesSignal(text, signal));
  const localServicePattern = text.match(/\b[A-Z][A-Za-z ]+\s+for Local Service\b/g) ?? [];
  const keywordChainPattern = text.match(/\bHelp [^.]{0,80} understand [a-z]+,\s*[a-z]+,\s*[a-z]+/gi) ?? [];

  return unique([...generic, ...localServicePattern, ...keywordChainPattern]);
}

function detectForbidden(text: string, forbiddenSignals: string[]) {
  return forbiddenSignals.filter((signal) => includesSignal(text, signal));
}

function detectMissing(text: string, requiredSignals: string[], mode: DomainValidationMode) {
  if (mode === "pre_proposal_context") return [];

  return requiredSignals.filter((signal) => !includesSignal(text, signal));
}

function fileStrategyIssues(input: ValidateDomainInput) {
  const fileNames = Object.keys(input.proposedFiles ?? {});
  const hasStaticTrio = ["index.html", "styles.css", "main.js"].every((path) => fileNames.includes(path));
  const hasRunnableAppSource = fileNames.some((path) => path === "vite.config.ts" || path === "vite.config.js" || path.startsWith("src/"));
  const issues: string[] = [];

  if (input.contextPriority.authoritativeMode === "CODE" && hasStaticTrio && !hasRunnableAppSource && !input.currentPrompt.toLowerCase().includes("landing page")) {
    issues.push("CODE request produced static website trio.");
  }

  if (
    input.contextPriority.authoritativeIntentFamily === "targeted_text_replacement" &&
    fileNames.some((path) => ["index.html", "styles.css", "main.js"].includes(path)) &&
    fileNames.length > 1
  ) {
    issues.push("Small edit expanded into broad website files.");
  }

  if (input.contextPriority.authoritativeMode === "ASK" && fileNames.length > 0) {
    issues.push("ASK request produced file mutation proposal.");
  }

  if (input.validationMode === "proposal_content" && input.proposalContext?.requiredFiles.length) {
    const missingRequiredFiles = input.proposalContext.requiredFiles.filter((path) => !fileNames.includes(path));
    for (const path of missingRequiredFiles) {
      issues.push(`missing required file ${path}`);
    }

    if (input.proposalContext.mode === "WEBSITE") {
      const allowed = new Set(input.proposalContext.requiredFiles);
      const extraPages = fileNames.filter((path) => path.endsWith(".html") && !allowed.has(path));
      for (const path of extraPages) {
        issues.push(`unexpected page file ${path}`);
      }
    }
  }

  return issues;
}

function previewIssues(input: ValidateDomainInput) {
  const issues: string[] = [];

  if (input.contextPriority.authoritativeMode === "CODE" && input.contextPriority.authoritativePreviewType === "website_static_preview") {
    issues.push("CODE request has website static preview type.");
  }

  if (input.contextPriority.authoritativeMode === "ASK" && input.contextPriority.authoritativePreviewType !== "none") {
    issues.push("ASK request has non-answer preview type.");
  }

  return issues;
}

function contractContamination(input: ValidateDomainInput) {
  const contractDomain = input.projectContract?.domain;

  if (
    contractDomain &&
    input.contextPriority.authoritativeDomain &&
    normalize(contractDomain) !== normalize(input.contextPriority.authoritativeDomain)
  ) {
    return [`contract domain ${contractDomain} differs from authoritative domain ${input.contextPriority.authoritativeDomain}`];
  }

  return [];
}

function score(input: {
  forbidden: number;
  generic: number;
  missing: number;
  mode: number;
  preview: number;
  strategy: number;
}) {
  return Math.max(
    0,
    100 -
      input.forbidden * 18 -
      input.generic * 22 -
      input.missing * 4 -
      input.mode * 28 -
      input.preview * 16 -
      input.strategy * 26
  );
}

export function validateDomain(input: ValidateDomainInput): DomainValidationResult {
  const domain =
    input.proposalContext?.domain ??
    input.compositionPlan.authoritativeDomain ??
    input.contextPriority.authoritativeDomain ??
    input.translatedIntent.domain ??
    input.translatedIntent.businessType ??
    null;
  const profile = profileFor(domain);
  const requiredSignals = unique([
    ...profile.required,
    ...input.compositionPlan.productOrServiceEntities,
    ...input.businessBlueprint.mustInclude
  ]);
  const forbiddenSignals = unique([
    ...genericForbidden,
    ...profile.forbidden,
    ...input.compositionPlan.forbiddenSections,
    ...input.businessBlueprint.mustAvoid
  ]);
  const combinedContent = input.validationMode === "proposal_content"
    ? contentFromFiles(input.proposedFiles)
    : input.currentPrompt;
  const detectedForbiddenSignals = detectForbidden(combinedContent, forbiddenSignals);
  const detectedGenericCopy = detectGenericCopy(combinedContent);
  const missingSignals = detectMissing(combinedContent, requiredSignals, input.validationMode);
  const strategyIssues = fileStrategyIssues(input);
  const detectedPreviewDrift = previewIssues(input);
  const detectedModeDrift = [
    input.contextPriority.authoritativeMode === "CODE" &&
    detectedGenericCopy.some((signal) => includesSignal(signal, "Local Service"))
      ? "CODE proposal contains public local-service website copy."
      : "",
    input.contextPriority.authoritativeMode === "ASK" && Object.keys(input.proposedFiles ?? {}).length
      ? "ASK proposal contains file mutations."
      : ""
  ].filter(Boolean);
  const detectedDomainDrift = unique([...detectedForbiddenSignals, ...detectedGenericCopy]);
  const detectedContractContamination = contractContamination(input);
  const pageIssues =
    input.validationMode === "proposal_content" &&
    input.contextPriority.authoritativeMode === "WEBSITE" &&
    input.proposedFiles
      ? (input.proposalContext?.requiredFiles.filter((path) => path.endsWith(".html")) ??
          input.compositionPlan.pagePlans.map((page) => page.route))
          .filter((route) => !input.proposedFiles?.[route])
          .map((route) => `missing expected page ${route}`)
      : [];
  const sectionIssues =
    input.validationMode === "proposal_content" && detectedGenericCopy.length
      ? ["public section copy contains generic/internal wording"]
      : [];
  const validationScore = score({
    forbidden: detectedForbiddenSignals.length,
    generic: detectedGenericCopy.length,
    missing: missingSignals.length,
    mode: detectedModeDrift.length,
    preview: detectedPreviewDrift.length,
    strategy: strategyIssues.length
  });
  const criticalIssueCount = input.validationMode === "proposal_content"
    ? pageIssues.length + strategyIssues.length + detectedModeDrift.length + detectedForbiddenSignals.length
    : 0;
  const severity: DomainValidationSeverity = criticalIssueCount
    ? "critical"
    : validationScore < 82 || detectedPreviewDrift.length > 0 || missingSignals.length > 4 || detectedGenericCopy.length > 0
      ? "major"
      : "minor";
  const shouldBlockProposal = input.validationMode === "proposal_content" && severity === "critical";

  return {
    acceptanceChecks: unique([
      ...input.compositionPlan.acceptanceChecks,
      "proposal content matches authoritative domain",
      "forbidden generic public copy is absent",
      "file strategy matches selected mode and intent"
    ]),
    authoritativeDomain: domain,
    confidence: Math.min(0.96, input.compositionPlan.confidence + 0.02),
    detectedContractContamination,
    detectedDomainDrift,
    detectedForbiddenSignals,
    detectedGenericCopy,
    detectedModeDrift,
    detectedPreviewDrift,
    expectedSignals: unique([...requiredSignals, ...input.compositionPlan.contentAngles]),
    fileStrategyIssues: strategyIssues,
    forbiddenSignals,
    missingSignals,
    pageIssues,
    repairHints: unique([
      detectedGenericCopy.length ? "Remove generic Local Service/internal generator phrases from public copy." : "",
      detectedForbiddenSignals.length ? "Rewrite proposal around authoritative domain vocabulary." : "",
      strategyIssues.length ? "Use file strategy that matches selected mode and small-edit/full-generation intent." : "",
      detectedPreviewDrift.length ? "Align preview type with context priority and mode." : ""
    ]),
    requiredSignals,
    sectionIssues,
    severity,
    shouldBlockProposal,
    validationId: `${input.validationMode}_${domain ?? "unknown"}_domain_validation`,
    validationMode: input.validationMode,
    validationScore,
    validationStatus: shouldBlockProposal ? "blocked" : severity === "major" ? "review_required" : "passed"
  };
}

export function summarizeDomainValidation(validation: DomainValidationResult) {
  return [
    `${validation.validationId}`,
    `mode=${validation.validationMode}`,
    `status=${validation.validationStatus}`,
    `score=${validation.validationScore}`,
    `severity=${validation.severity}`,
    `drift=${validation.detectedDomainDrift.length}`,
    `generic=${validation.detectedGenericCopy.length}`,
    `block=${validation.shouldBlockProposal ? "yes" : "no"}`
  ].join("; ");
}
