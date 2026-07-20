import type { BusinessBlueprint } from "@/lib/server/ai/blueprint-matcher";
import type { CompositionPlan } from "@/lib/server/ai/composition-engine";
import type { ContextPriorityResult } from "@/lib/server/ai/context-priority-engine";
import type { DomainValidationResult } from "@/lib/server/ai/domain-validator";
import type { ExecutionPlan } from "@/lib/server/ai/execution-planner";
import type { TranslatedIntentSpec } from "@/lib/server/ai/intent-translator";
import type { ProposalContext } from "@/lib/server/ai/proposal-context";
import type { ProjectContract } from "@/lib/server/ai/project-contract";
import type { TaskDecomposition } from "@/lib/server/ai/task-decomposer";

export type ProposalQualityStatus = "blocked" | "passed" | "review_required" | "warning";
export type ApprovalRecommendation = "approve" | "reject" | "review";
export type ProposalQualityIssueSeverity = "block" | "failure" | "warning";

export type ProposalQualityIssue = {
  category: string;
  evidence: string;
  id: string;
  message: string;
  repairHint: string;
  severity: ProposalQualityIssueSeverity;
};

export type ProposalQualityGateResult = {
  approvalDisabled: boolean;
  approvalRecommendation: ApprovalRecommendation;
  blocks: ProposalQualityIssue[];
  completenessScore: number;
  confidence: number;
  contentScore: number;
  fakeContentDetected: boolean;
  failures: ProposalQualityIssue[];
  loremDetected: boolean;
  missingContact: boolean;
  missingCTA: boolean;
  missingEntities: string[];
  missingFooter: boolean;
  missingHero: boolean;
  missingModules: string[];
  missingNavigation: boolean;
  missingPages: string[];
  missingSections: string[];
  missingTrustSignals: string[];
  placeholderDetected: boolean;
  passedChecks: string[];
  qualityId: string;
  qualityScore: number;
  qualityStatus: ProposalQualityStatus;
  repeatedContentDetected: boolean;
  repairHints: string[];
  requiredChecks: string[];
  structureScore: number;
  todoDetected: boolean;
  warnings: ProposalQualityIssue[];
};

type BuildProposalQualityGateInput = {
  businessBlueprint: BusinessBlueprint;
  compositionPlan: CompositionPlan;
  contextPriority: ContextPriorityResult;
  currentPrompt: string;
  domainValidation: DomainValidationResult;
  executionPlan: ExecutionPlan;
  productMode: "ASK" | "CODE" | "WEBSITE";
  proposalContext?: ProposalContext;
  projectContract: ProjectContract | null;
  proposedFiles?: Record<string, string>;
  proposalSummary?: string;
  taskDecomposition: TaskDecomposition;
  translatedIntent: TranslatedIntentSpec;
};

const placeholderPatterns = [
  "[placeholder]",
  "placeholder image",
  "insert content here",
  "replace me",
  "sample text",
  "example content",
  "insert copy",
  "your content",
  "image goes here",
  "Current Prompt Website",
  "contact / unknown",
  "domain-specific hero",
  "product proof / contact path",
  "unknown with clear guidance",
  "Support, warranty, shipping, and contact details for Current Prompt Website",
  "document dataset domain = Current Prompt Website"
];

const fakeContentPatterns = [
  "fake data",
  "dummy data",
  "mock payment live",
  "high quality images included",
  "production ready billing",
  "fully integrated auth"
];

function normalize(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function includesAny(text: string, terms: string[]) {
  const normalized = normalize(text);

  return terms.some((term) => normalized.includes(normalize(term)));
}

function contentFromFiles(files?: Record<string, string>) {
  return Object.entries(files ?? {})
    .map(([path, content]) => `\nFILE:${path}\n${content}`)
    .join("\n");
}

function issue(input: {
  category: string;
  evidence: string;
  id: string;
  message: string;
  repairHint: string;
  severity: ProposalQualityIssueSeverity;
}): ProposalQualityIssue {
  return input;
}

function expectedPageRoutes(input: BuildProposalQualityGateInput) {
  if (input.contextPriority.authoritativeMode !== "WEBSITE") return [];
  if (input.contextPriority.authoritativeIntentFamily === "targeted_text_replacement") return [];
  if (input.proposalContext?.requiredFiles.length) {
    return unique(input.proposalContext.requiredFiles.filter((path) => path.endsWith(".html")));
  }

  return unique(input.compositionPlan.pagePlans.map((page) => page.route));
}

function isLandingPage(input: BuildProposalQualityGateInput) {
  return normalize(input.currentPrompt).includes("landing page");
}

function hasStaticTrio(files: Record<string, string>) {
  const hasRunnableAppSource = Object.keys(files).some((path) =>
    path === "vite.config.ts" ||
    path === "vite.config.js" ||
    path.startsWith("src/")
  );

  return ["index.html", "styles.css", "main.js"].every((path) => path in files) && !hasRunnableAppSource;
}

function visibleFileContent(files: Record<string, string>) {
  return Object.entries(files)
    .filter(([path]) => /\.(?:html|md|tsx?|jsx?|css)$/i.test(path))
    .map(([, content]) => content)
    .join("\n");
}

function visibleWebsiteContent(files: Record<string, string>) {
  return Object.entries(files)
    .filter(([path]) => path.toLowerCase().endsWith(".html"))
    .map(([, content]) => content
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " "))
    .join("\n");
}

function hasApplyUnsafeTemplateToken(files: Record<string, string>) {
  const content = Object.entries(files)
    .filter(([path]) => path !== "HASSALI.md" && /\.(?:html|css|js|ts|tsx|jsx)$/i.test(path))
    .map(([, fileContent]) => fileContent)
    .join("\n");
  return /\{\{\s*[a-z0-9_.-]+\s*\}\}|\bREPLACE_ME\b|\[\s*insert\s+(?:phone|email|address|content|name)[^\]]*\]|\bTODO\s*:/i.test(content);
}

function repeatedPageBodies(files: Record<string, string>) {
  const htmlBodies = Object.entries(files)
    .filter(([path]) => path.endsWith(".html"))
    .map(([path, content]) => {
      const body = content
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 900);

      return { body, path };
    })
    .filter((entry) => entry.body.length > 80);
  const seen = new Map<string, string>();

  for (const entry of htmlBodies) {
    const key = normalize(entry.body);
    const previous = seen.get(key);

    if (previous) return [`${previous} and ${entry.path}`];
    seen.set(key, entry.path);
  }

  return [];
}

function sectionTerms(plan: CompositionPlan) {
  return unique(plan.requiredSections.map((section) => section.title));
}

function moduleTerms(input: BuildProposalQualityGateInput) {
  return unique([
    ...input.compositionPlan.requiredSections.map((section) => section.title),
    ...input.businessBlueprint.screens,
    ...input.businessBlueprint.requiredComponents
  ]);
}

function entityTerms(input: BuildProposalQualityGateInput) {
  return unique([
    ...input.compositionPlan.productOrServiceEntities,
    ...input.businessBlueprint.dataEntities,
    ...input.taskDecomposition.milestones.flatMap((milestone) => milestone.requiredInputs)
  ]);
}

function score(input: {
  blocks: number;
  failures: number;
  missingCriticalStructure: number;
  placeholder: boolean;
  repeated: boolean;
  warnings: number;
}) {
  return Math.max(
    0,
    Math.min(
      100,
      100 -
        input.blocks * 35 -
        input.failures * 15 -
        input.warnings * 5 -
        input.missingCriticalStructure * 20 -
        (input.placeholder ? 35 : 0) -
        (input.repeated ? 15 : 0)
    )
  );
}

function statusFor(input: {
  blocks: ProposalQualityIssue[];
  failures: ProposalQualityIssue[];
  qualityScore: number;
  warnings: ProposalQualityIssue[];
}): ProposalQualityStatus {
  if (input.blocks.length > 0) return "blocked";
  if (input.failures.length > 0 || input.qualityScore < 70) return "review_required";
  if (input.warnings.length > 0 || input.qualityScore < 85) return "warning";

  return "passed";
}

export function buildProposalQualityGate(input: BuildProposalQualityGateInput): ProposalQualityGateResult {
  const files = input.proposedFiles ?? {};
  const fileNames = Object.keys(files);
  const content = [input.proposalSummary ?? "", contentFromFiles(files)].join("\n");
  const mode = input.contextPriority.authoritativeMode;
  const visibleContent = mode === "WEBSITE" ? visibleWebsiteContent(files) : visibleFileContent(files);
  const websiteSource = mode === "WEBSITE"
    ? Object.entries(files)
      .filter(([path]) => path.toLowerCase().endsWith(".html"))
      .map(([, fileContent]) => fileContent)
      .join("\n")
    : "";
  const intentFamily = input.contextPriority.authoritativeIntentFamily;
  const requiredChecks = unique([
    ...input.businessBlueprint.acceptanceChecks,
    ...input.compositionPlan.acceptanceChecks,
    ...input.taskDecomposition.validationChecks,
    ...input.executionPlan.completionChecks,
    ...input.domainValidation.acceptanceChecks
  ]);
  const blocks: ProposalQualityIssue[] = [];
  const failures: ProposalQualityIssue[] = [];
  const warnings: ProposalQualityIssue[] = [];

  if (input.domainValidation.shouldBlockProposal) {
    blocks.push(issue({
      category: "domain_validation",
      evidence: input.domainValidation.repairHints.join("; ") || input.domainValidation.validationStatus,
      id: "domain_validation_block",
      message: "Domain validation already blocked this proposal.",
      repairHint: "Repair domain, mode, and file-strategy drift before approval.",
      severity: "block"
    }));
  }

  if (mode === "ASK" && fileNames.length > 0) {
    blocks.push(issue({
      category: "mode",
      evidence: fileNames.join(", "),
      id: "ask_mutation",
      message: "ASK mode produced file mutations.",
      repairHint: "Return an answer-only response unless the user explicitly switches to WEBSITE or CODE.",
      severity: "block"
    }));
  }

  if (mode === "CODE" && hasStaticTrio(files) && !isLandingPage(input)) {
    blocks.push(issue({
      category: "mode",
      evidence: "index.html, styles.css, main.js",
      id: "code_static_trio",
      message: "CODE app/system proposal produced only static website files.",
      repairHint: "Use architecture, data model, app modules, docs, or source files that match the CODE request.",
      severity: "block"
    }));
  }

  if (intentFamily === "targeted_text_replacement" && fileNames.length > 1 && hasStaticTrio(files)) {
    blocks.push(issue({
      category: "scope",
      evidence: fileNames.join(", "),
      id: "small_edit_expanded",
      message: "Small edit expanded into full website generation.",
      repairHint: "Change only targeted files containing the source text.",
      severity: "block"
    }));
  }

  if (/hassali suggestion:/i.test(content)) {
    blocks.push(issue({
      category: "scope",
      evidence: "Hassali suggestion comment",
      id: "suggestion_comment_substitute",
      message: "Proposal used a suggestion comment instead of a real edit.",
      repairHint: "Apply the requested replacement directly in visible content.",
      severity: "block"
    }));
  }

  const unsafeTemplateTokenDetected = mode === "WEBSITE" && hasApplyUnsafeTemplateToken(files);
  const placeholderDetected = mode === "CODE"
    ? /\b(?:lorem ipsum|fix me|insert content here|placeholder image|image goes here)\b/i.test(content)
    : unsafeTemplateTokenDetected || includesAny(visibleContent, placeholderPatterns) || /\b(?:undefined|null)\b/i.test(visibleContent);
  const loremDetected = /\blorem ipsum\b/i.test(mode === "WEBSITE" ? visibleContent : content);
  const todoDetected = mode === "WEBSITE"
    ? unsafeTemplateTokenDetected
    : /\b(?:TODO|coming soon|TBD)\b/i.test(content);
  const fakeContentDetected = includesAny(mode === "WEBSITE" ? visibleContent : content, fakeContentPatterns);
  const repeatedEvidence = repeatedPageBodies(files);
  const repeatedContentDetected = repeatedEvidence.length > 0;

  if (placeholderDetected || loremDetected || todoDetected) {
    blocks.push(issue({
      category: "content",
      evidence: [placeholderDetected ? "placeholder" : "", loremDetected ? "lorem ipsum" : "", todoDetected ? "TODO/coming soon" : ""].filter(Boolean).join(", "),
      id: "placeholder_content",
      message: "Proposal contains placeholder or unfinished content.",
      repairHint: "Replace placeholder copy with real domain-specific content before approval.",
      severity: "block"
    }));
  }

  if (fakeContentDetected) {
    (mode === "WEBSITE" ? warnings : failures).push(issue({
      category: "trust",
      evidence: "overstated/fake capability claim",
      id: "fake_content_claim",
      message: "Proposal contains vague or overconfident capability claims.",
      repairHint: "Use honest wording and mark mock or placeholder integrations clearly.",
      severity: mode === "WEBSITE" ? "warning" : "failure"
    }));
  }

  if (repeatedContentDetected) {
    (mode === "WEBSITE" ? warnings : failures).push(issue({
      category: "content",
      evidence: repeatedEvidence.join("; "),
      id: "repeated_page_content",
      message: "Multiple pages appear to reuse identical body content.",
      repairHint: "Give each page a distinct purpose and copy structure.",
      severity: mode === "WEBSITE" ? "warning" : "failure"
    }));
  }

  const missingPages = expectedPageRoutes(input).filter((route) => !(route in files));
  const missingSections =
    mode === "WEBSITE" && intentFamily !== "targeted_text_replacement"
      ? sectionTerms(input.compositionPlan).filter((section) => !includesAny(visibleContent, [section]))
      : [];
  const missingEntities = entityTerms(input).filter((entity) => !includesAny(mode === "WEBSITE" ? visibleContent : content, [entity]));
  const hasRunnableCodeSource = mode === "CODE" && fileNames.some((path) =>
    path === "vite.config.ts" ||
    path === "vite.config.js" ||
    path === "app.py" ||
    path === "requirements.txt" ||
    path.endsWith(".py") ||
    path.startsWith("src/")
  );
  const missingModules =
    mode === "CODE" && !hasRunnableCodeSource
      ? moduleTerms(input).filter((module) => !includesAny(content, [module]))
      : [];
  const missingTrustSignals =
    mode === "WEBSITE" && intentFamily !== "targeted_text_replacement"
      ? input.compositionPlan.trustSignals.filter((signal) => !includesAny(visibleContent, [signal]))
      : [];
  const missingNavigation = mode === "WEBSITE" && intentFamily !== "targeted_text_replacement" && !/<nav\b|navigation|navbar/i.test(websiteSource);
  const missingHero = mode === "WEBSITE" && intentFamily !== "targeted_text_replacement" && !/\bhero\b|<h1\b/i.test(websiteSource);
  const missingCTA = mode === "WEBSITE" && intentFamily !== "targeted_text_replacement" && !/\b(?:book|order|shop|start|get|call|visit|request|schedule)\b/i.test(visibleContent);
  const missingContact = mode === "WEBSITE" && intentFamily !== "targeted_text_replacement" && !/\b(?:contact|email|phone|address|location|hours)\b/i.test(visibleContent);
  const missingFooter = mode === "WEBSITE" && intentFamily !== "targeted_text_replacement" && !/<footer\b|\bfooter\b/i.test(websiteSource);

  if (missingPages.length > 0) {
    blocks.push(issue({
      category: "completeness",
      evidence: missingPages.join(", "),
      id: "missing_pages",
      message: "Proposal is missing required page files.",
      repairHint: "Generate every route required by the canonical proposal context.",
      severity: "block"
    }));
  }

  if (missingSections.length > 0) {
    warnings.push(issue({
      category: "structure",
      evidence: missingSections.slice(0, 6).join(", "),
      id: "missing_sections",
      message: "Proposal may be missing expected website sections.",
      repairHint: "Include the required domain sections or explain why they are not needed.",
      severity: "warning"
    }));
  }

  if (missingModules.length > 0 && mode === "CODE") {
    failures.push(issue({
      category: "structure",
      evidence: missingModules.slice(0, 6).join(", "),
      id: "missing_code_modules",
      message: "CODE proposal is missing expected app modules or screens.",
      repairHint: "Include architecture/docs/source guidance for the missing modules.",
      severity: "failure"
    }));
  }

  if (missingEntities.length > 0 && mode !== "ASK") {
    warnings.push(issue({
      category: "content",
      evidence: missingEntities.slice(0, 8).join(", "),
      id: "missing_entities",
      message: "Proposal may be missing expected entities, products, or services.",
      repairHint: "Mention the important entities from the blueprint/composition plan.",
      severity: "warning"
    }));
  }

  const criticalStructureCount = [
    missingNavigation,
    missingHero,
    missingCTA,
    missingContact,
    missingFooter
  ].filter(Boolean).length;

  if (criticalStructureCount > 0) {
    warnings.push(issue({
      category: "structure",
      evidence: [
        missingNavigation ? "navigation" : "",
        missingHero ? "hero" : "",
        missingCTA ? "CTA" : "",
        missingContact ? "contact" : "",
        missingFooter ? "footer" : ""
      ].filter(Boolean).join(", "),
      id: "missing_critical_website_structure",
      message: "Website proposal is missing critical page structure.",
      repairHint: "Add navigation, hero, CTA, contact, and footer where appropriate.",
      severity: "warning"
    }));
  }

  if (missingTrustSignals.length > 0) {
    warnings.push(issue({
      category: "trust",
      evidence: missingTrustSignals.slice(0, 5).join(", "),
      id: "missing_trust_signals",
      message: "Proposal may be missing expected trust signals.",
      repairHint: "Add trust signals that match the domain and user request.",
      severity: "warning"
    }));
  }

  if (mode === "CODE" && input.translatedIntent.requestedFeatures.some((feature) => ["auth", "billing", "database"].includes(feature))) {
    const needs = [
      input.translatedIntent.requestedFeatures.includes("auth") && !includesAny(content, ["auth", "authentication", "login"]) ? "auth" : "",
      input.translatedIntent.requestedFeatures.includes("billing") && !includesAny(content, ["billing", "invoice", "subscription", "payment"]) ? "billing" : "",
      input.translatedIntent.requestedFeatures.includes("database") && !includesAny(content, ["database", "schema", "data model"]) ? "database" : ""
    ].filter(Boolean);

    if (needs.length > 0) {
      failures.push(issue({
        category: "code_completeness",
        evidence: needs.join(", "),
        id: "missing_requested_code_features",
        message: "CODE proposal is missing requested technical features.",
        repairHint: "Add explicit architecture and implementation notes for the missing features.",
        severity: "failure"
      }));
    }
  }

  const qualityScore = score({
    blocks: blocks.length,
    failures: failures.length,
    missingCriticalStructure: criticalStructureCount,
    placeholder: placeholderDetected || loremDetected || todoDetected,
    repeated: repeatedContentDetected,
    warnings: warnings.length
  });
  const completenessScore = Math.max(0, 100 - missingPages.length * 20 - missingSections.length * 8 - missingModules.length * 12 - missingEntities.length * 4);
  const structureScore = Math.max(0, 100 - criticalStructureCount * 20 - missingTrustSignals.length * 5);
  const contentScore = Math.max(0, 100 - (placeholderDetected || loremDetected || todoDetected ? 35 : 0) - (repeatedContentDetected ? 15 : 0) - (fakeContentDetected ? 15 : 0));
  const qualityStatus = statusFor({ blocks, failures, qualityScore, warnings });
  const approvalRecommendation: ApprovalRecommendation = qualityStatus === "blocked"
    ? "reject"
    : qualityStatus === "passed"
      ? "approve"
      : "review";

  return {
    approvalDisabled: qualityStatus === "blocked",
    approvalRecommendation,
    blocks,
    completenessScore,
    confidence: Math.min(0.95, Math.max(0.55, input.domainValidation.confidence)),
    contentScore,
    fakeContentDetected,
    failures,
    loremDetected,
    missingContact,
    missingCTA,
    missingEntities,
    missingFooter,
    missingHero,
    missingModules,
    missingNavigation,
    missingPages,
    missingSections,
    missingTrustSignals,
    placeholderDetected,
    passedChecks: requiredChecks.filter((check) => includesAny(content, [check])),
    qualityId: `${mode.toLowerCase()}_${intentFamily}_proposal_quality`,
    qualityScore,
    qualityStatus,
    repeatedContentDetected,
    repairHints: unique([...blocks, ...failures, ...warnings].map((item) => item.repairHint)),
    requiredChecks,
    structureScore,
    todoDetected,
    warnings
  };
}

export function summarizeProposalQualityGate(result: ProposalQualityGateResult) {
  return [
    result.qualityId,
    `status=${result.qualityStatus}`,
    `score=${result.qualityScore}`,
    `recommendation=${result.approvalRecommendation}`,
    `blocks=${result.blocks.length}`,
    `failures=${result.failures.length}`,
    `warnings=${result.warnings.length}`
  ].join("; ");
}
