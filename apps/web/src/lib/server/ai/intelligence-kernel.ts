import type { DecisionPlan } from "@/lib/server/ai/decision-engine";
import type { DiagnosticContext } from "@/lib/server/ai/diagnostic-context";
import type { BusinessBlueprint } from "@/lib/server/ai/blueprint-matcher";
import type { ContextPriorityResult } from "@/lib/server/ai/context-priority-engine";
import type { TranslatedIntentSpec } from "@/lib/server/ai/intent-translator";
import type { IntentIntelligence } from "@/lib/server/ai/intent-intelligence";
import type { CompositionStrategy } from "@/lib/server/ai/reasoning-composition";

export type KernelMode = "ASK" | "CODE" | "WEBSITE";
export type KernelMutationPolicy = "answer_only" | "proposal_required" | "safe_auto_apply_blocked";
export type KernelProviderProfileHint =
  | "cheap"
  | "coding"
  | "fast"
  | "local"
  | "long_context"
  | "privacy_sensitive"
  | "reasoning"
  | "vision";
export type KernelFrameworkHint =
  | "crewai_candidate"
  | "langchain_candidate"
  | "langgraph_candidate"
  | "llamaindex_candidate"
  | "multi_agent_candidate"
  | "none"
  | "rag_candidate";
type RiskLevel = "low" | "medium" | "high";
type RuntimeAction = "restart_runtime" | "reload_preview" | "stop_runtime";

export type TaskUnderstanding = {
  brandName: string | null;
  businessType: string;
  domain: string;
  mode: KernelMode;
  pageCount: number | null;
  requestedPages: string[];
  requiredFeatures: string[];
  summary: string;
  userIntent: IntentIntelligence["userIntent"];
};

export type ContextDiagnosis = {
  activePath: string;
  compositionBusinessType: string;
  editScope: DiagnosticContext["editScope"];
  fileList: string[];
  hasProject: boolean;
  hasWebFiles: boolean;
  inferredDomain: DiagnosticContext["inferredDomain"];
  projectId: string | null;
  promptIntent: DiagnosticContext["promptIntent"];
  runtimeStatus: string;
  summary: string;
};

export type ReasoningTrace = {
  assumptions: string[];
  confidenceFactors: string[];
  constraints: string[];
  observations: string[];
  strategy: string;
};

export type PlanCandidate = {
  confidence: number;
  expectedFiles: string[];
  id: string;
  rationale: string;
  riskLevel: RiskLevel;
  runtimeActions: RuntimeAction[];
  strategy: string;
  title: string;
};

export type RiskAssessment = {
  fileMutationRisk: number;
  notes: string[];
  overallRisk: number;
  overgenerationRisk: number;
  previewRuntimeRisk: number;
  projectIsolationRisk: number;
  riskLevel: RiskLevel;
  userIntentMismatchRisk: number;
  visualMismatchRisk: number;
  wrongDomainRisk: number;
};

export type CritiqueResult = {
  issues: string[];
  passed: boolean;
  score: number;
  strengths: string[];
};

export type VerificationPlan = {
  checks: string[];
  requiresManualVisualReview: boolean;
  requiresNoBlankFilesCheck: boolean;
  requiresPreviewReload: boolean;
  requiresProjectIsolationCheck: boolean;
  requiresTypecheck: boolean;
};

export type ExecutionProposal = {
  allowedRuntimeActions: RuntimeAction[];
  approvalRequired: true;
  canMutateFiles: boolean;
  canRunRuntimeActions: boolean;
  mutationScope: "none" | "selected_project";
  summary: string;
};

export type LearningSignal = {
  failureSignals: string[];
  nextMemoryHint: string | null;
  preferenceSignals: string[];
  qualitySignals: string[];
};

export type KernelRoutingDecision = {
  confidence: number;
  constraints: string[];
  frameworkHint?: KernelFrameworkHint;
  mode: KernelMode;
  mutationPolicy: KernelMutationPolicy;
  providerProfileHint?: KernelProviderProfileHint;
  requiredChecks: string[];
  risks: string[];
  routingExplanation: string;
  taskType: string;
};

export type IntelligenceKernelResult = {
  confidence: number;
  contextDiagnosis: ContextDiagnosis;
  critiqueResult: CritiqueResult;
  executionProposal: ExecutionProposal;
  learningSignal: LearningSignal;
  planCandidates: PlanCandidate[];
  reasoningTrace: ReasoningTrace;
  riskAssessment: RiskAssessment;
  routingDecision: KernelRoutingDecision;
  selectedPlan: PlanCandidate;
  shouldProceed: boolean;
  summary: string;
  taskUnderstanding: TaskUnderstanding;
  verificationPlan: VerificationPlan;
};

type IntelligenceKernelInput = {
  composition: CompositionStrategy;
  decision: DecisionPlan;
  diagnostic: DiagnosticContext;
  blueprint?: BusinessBlueprint;
  contextPriority?: ContextPriorityResult;
  intent: IntentIntelligence;
  mode: KernelMode;
  translatedIntent?: TranslatedIntentSpec;
};

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function riskLevel(score: number): RiskLevel {
  if (score >= 0.67) {
    return "high";
  }

  return score >= 0.34 ? "medium" : "low";
}

function isWebsiteRequest(decision: DecisionPlan) {
  return (
    decision.requestType === "multi_page_generation" ||
    decision.requestType === "website_generation"
  );
}

function promptText(input: IntelligenceKernelInput) {
  return [
    input.translatedIntent?.domain,
    input.translatedIntent?.businessType,
    input.translatedIntent?.style,
    input.translatedIntent?.visualLanguage,
    input.translatedIntent?.requestedFeatures.join(" "),
    input.translatedIntent?.constraints.join(" "),
    input.blueprint?.blueprintName,
    input.blueprint?.sections.join(" "),
    input.blueprint?.screens.join(" "),
    input.blueprint?.mustInclude.join(" "),
    input.contextPriority?.authoritativeDomain,
    input.contextPriority?.authoritativeBusinessType,
    input.contextPriority?.authoritativeIntentFamily,
    input.contextPriority?.authoritativeFeatures.join(" "),
    input.intent.summary,
    input.decision.reason,
    input.composition.businessType,
    input.intent.requiredFeatures.join(" "),
    input.intent.visualStyle.join(" "),
    input.intent.requestedPages.join(" ")
  ].join(" ").toLowerCase();
}

function includesPromptAny(input: IntelligenceKernelInput, terms: string[]) {
  const text = promptText(input);

  return terms.some((term) => text.includes(term));
}

function taskTypeFor(input: IntelligenceKernelInput) {
  const translatedFeatures = input.translatedIntent?.requestedFeatures ?? [];

  if (input.mode === "ASK" || input.decision.requestType === "ask" || input.intent.userIntent === "question") {
    return "explanation_or_guidance";
  }

  if (input.decision.requestType === "rename") {
    return "rename_text_replace";
  }

  if (input.decision.requestType === "visual_theme_edit") {
    return "visual_theme_edit";
  }

  if (input.decision.requestType === "visual_enhancement") {
    return "website_visual_polish";
  }

  if (input.decision.requestType === "data_tool_generation") {
    return "code_data_tool";
  }

  if (input.decision.requestType === "code_system_generation") {
    return "code_system_generation";
  }

  if (input.decision.requestType === "runtime_action") {
    return "preview_runtime_action";
  }

  if (input.mode === "CODE") {
    return input.translatedIntent?.domain === "crm" ||
      translatedFeatures.some((feature) => ["auth", "billing", "dashboard", "database", "inventory"].includes(feature)) ||
      includesPromptAny(input, ["crm", "erp", "api", "auth", "database", "dashboard", "billing", "automation", "desktop app", "python", "mobile app", "iot", "hardware"])
      ? "code_system_generation"
      : "code_change";
  }

  if (isWebsiteRequest(input.decision) || input.mode === "WEBSITE") {
    return input.decision.requestType === "multi_page_generation"
      ? "website_multi_page_generation"
      : "website_generation_or_edit";
  }

  return input.decision.requestType;
}

function mutationPolicyFor(input: IntelligenceKernelInput, taskType: string): KernelMutationPolicy {
  if (
    input.mode === "ASK" ||
    input.decision.requestType === "ask" ||
    input.intent.userIntent === "question" ||
    includesPromptAny(input, ["without changing files", "no file changes", "answer this", "explain only"])
  ) {
    return "answer_only";
  }

  return taskType === "preview_runtime_action" ? "proposal_required" : "proposal_required";
}

function providerHintFor(input: IntelligenceKernelInput, taskType: string): KernelProviderProfileHint {
  if (includesPromptAny(input, ["private", "privacy", "confidential", "local only", "offline"])) {
    return "privacy_sensitive";
  }

  if (includesPromptAny(input, ["read these docs", "documentation", "entire repo", "large codebase", "many files"])) {
    return "long_context";
  }

  if (taskType.startsWith("code") || input.mode === "CODE") {
    return includesPromptAny(input, ["complex", "architecture", "auth", "database", "billing", "crm", "erp"])
      ? "reasoning"
      : "coding";
  }

  if (input.mode === "WEBSITE") {
    return includesPromptAny(input, ["image", "images", "visual", "screenshot", "beautiful", "premium", "apple glass"])
      ? "vision"
      : "reasoning";
  }

  return includesPromptAny(input, ["quick", "simple", "short"]) ? "fast" : "cheap";
}

function frameworkHintFor(input: IntelligenceKernelInput, taskType: string): KernelFrameworkHint {
  if (includesPromptAny(input, ["read these docs", "documentation", "repo memory", "knowledge base", "many files"])) {
    return "rag_candidate";
  }

  if (includesPromptAny(input, ["multi agent", "multiple agents", "team of agents", "roles"])) {
    return "multi_agent_candidate";
  }

  if (
    input.mode === "CODE" &&
    includesPromptAny(input, ["crm", "erp", "auth", "database", "dashboard", "billing", "workflow", "approval", "state machine"])
  ) {
    return "langgraph_candidate";
  }

  if (input.mode === "CODE" && taskType === "code_system_generation") {
    return "multi_agent_candidate";
  }

  return "none";
}

function routingConstraints(input: IntelligenceKernelInput, taskType: string) {
  const translated = input.translatedIntent;
  const blueprint = input.blueprint;
  const priority = input.contextPriority;

  return Array.from(
    new Set([
      `mode:${input.mode}`,
      `task:${taskType}`,
      translated?.domain ? `translated-domain:${translated.domain}` : null,
      translated?.businessType ? `translated-business:${translated.businessType}` : null,
      translated?.style ? `translated-style:${translated.style}` : null,
      translated?.visualLanguage ? `translated-visual-language:${translated.visualLanguage}` : null,
      translated?.country ? `translated-country:${translated.country}` : null,
      translated?.pages.count ? `translated-pages:${translated.pages.count}` : null,
      translated?.pages.names.length ? `translated-page-names:${translated.pages.names.join(", ")}` : null,
      translated?.requestedFeatures.length ? `translated-features:${translated.requestedFeatures.slice(0, 8).join(", ")}` : null,
      blueprint ? `blueprint:${blueprint.blueprintId}` : null,
      blueprint ? `blueprint-kind:${blueprint.blueprintKind}` : null,
      blueprint ? `blueprint-preview:${blueprint.previewType}` : null,
      blueprint?.sections.length ? `blueprint-sections:${blueprint.sections.slice(0, 8).join(", ")}` : null,
      blueprint?.screens.length ? `blueprint-screens:${blueprint.screens.slice(0, 8).join(", ")}` : null,
      priority ? `authoritative-mode:${priority.authoritativeMode}` : null,
      priority?.authoritativeDomain ? `authoritative-domain:${priority.authoritativeDomain}` : null,
      priority ? `authoritative-intent:${priority.authoritativeIntentFamily}` : null,
      priority ? `authoritative-preview:${priority.authoritativePreviewType}` : null,
      priority?.conflicts.length ? `context-conflicts:${priority.conflicts.length}` : null,
      `domain:${input.intent.domain}`,
      `business:${input.composition.businessType}`,
      input.intent.pageCount ? `pages:${input.intent.pageCount}` : null,
      input.intent.requestedPages.length ? `requested-pages:${input.intent.requestedPages.join(", ")}` : null,
      input.intent.palette.length ? `palette:${input.intent.palette.join(", ")}` : null,
      input.intent.visualStyle.length ? `style:${input.intent.visualStyle.join(", ")}` : null,
      input.intent.requiredFeatures.length ? `features:${input.intent.requiredFeatures.slice(0, 6).join(", ")}` : null,
      input.mode === "ASK" ? "no-file-mutation-by-default" : "approval-required-before-mutation",
      "no-shell-execution",
      "no-package-install"
    ].filter(Boolean) as string[])
  );
}

function routingRisks(input: IntelligenceKernelInput, riskAssessment: RiskAssessment, critiqueResult: CritiqueResult) {
  return Array.from(
    new Set([
      riskAssessment.projectIsolationRisk >= 0.34 ? "project isolation must be verified" : null,
      riskAssessment.fileMutationRisk >= 0.34 ? "file mutation requires approval" : null,
      riskAssessment.overgenerationRisk >= 0.34 ? "overgeneration risk" : null,
      riskAssessment.wrongDomainRisk >= 0.34 ? "wrong-domain risk" : null,
      riskAssessment.visualMismatchRisk >= 0.2 ? "visual/style mismatch risk" : null,
      riskAssessment.userIntentMismatchRisk >= 0.34 ? "user intent mismatch risk" : null,
      input.mode === "WEBSITE" && input.decision.requestType === "data_tool_generation" ? "website mode received code/tool request" : null,
      input.mode === "WEBSITE" && input.decision.requestType === "code_system_generation" ? "website mode received software/system request" : null,
      input.mode === "CODE" && isWebsiteRequest(input.decision) && !includesPromptAny(input, ["web app", "crm", "dashboard", "api", "database"]) ? "code mode may be receiving website-style generation" : null,
      ...critiqueResult.issues
    ].filter(Boolean) as string[])
  );
}

export function buildKernelRoutingDecision(
  input: IntelligenceKernelInput,
  riskAssessment: RiskAssessment,
  critiqueResult: CritiqueResult,
  verificationPlan: VerificationPlan,
  confidence: number
): KernelRoutingDecision {
  const taskType = taskTypeFor(input);
  const mutationPolicy = mutationPolicyFor(input, taskType);
  const constraints = routingConstraints(input, taskType);
  const risks = routingRisks(input, riskAssessment, critiqueResult);
  const requiredChecks = Array.from(
    new Set([
      ...verificationPlan.checks,
      input.mode === "WEBSITE" ? "check website domain, visuals, responsiveness, colors, images, and requested pages" : null,
      input.mode === "CODE" ? "check architecture, data model, auth/security impact, state, tests, and maintainability" : null,
      mutationPolicy === "answer_only" ? "confirm no file mutation proposal is created" : null,
      confidence < 0.7 ? "low confidence requires explicit review before approval" : null
    ].filter(Boolean) as string[])
  );
  const providerProfileHint = providerHintFor(input, taskType);
  const frameworkHint = frameworkHintFor(input, taskType);

  return {
    confidence,
    constraints,
    frameworkHint,
    mode: input.mode,
    mutationPolicy,
    providerProfileHint,
    requiredChecks,
    risks,
    routingExplanation:
      mutationPolicy === "answer_only"
        ? `Kernel classified this as ${taskType}; Hassali should answer without proposing file changes.`
        : `Kernel classified this as ${taskType}; Hassali should create an approval-first ${input.mode.toLowerCase()} proposal with the listed checks.`,
    taskType
  };
}

function isTechnicalBusiness(composition: CompositionStrategy) {
  const businessType = composition.businessType.toLowerCase();

  return [
    "ai tooling",
    "code",
    "coding",
    "developer",
    "dev platform",
    "engineering product",
    "programming",
    "software product"
  ].some((term) => businessType.includes(term));
}

function pageToPath(page: string) {
  const normalized = page.toLowerCase().trim();
  const map: Record<string, string> = {
    about: "about.html",
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

  return map[normalized] ?? `${normalized.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "page"}.html`;
}

function expectedFilesFromComposition(composition: CompositionStrategy, decision: DecisionPlan) {
  if (!isWebsiteRequest(decision)) {
    return decision.requiredFiles;
  }

  return Array.from(
    new Set([...composition.siteArchitecture.pages.map(pageToPath), "styles.css", "main.js"])
  );
}

export function buildTaskUnderstanding(input: IntelligenceKernelInput): TaskUnderstanding {
  const translatedPages = input.translatedIntent?.pages.names ?? [];
  const requiredFeatures = Array.from(
    new Set([...(input.translatedIntent?.requestedFeatures ?? []), ...input.intent.requiredFeatures])
  );
  const taskUnderstanding: TaskUnderstanding = {
    brandName: input.intent.brandName,
    businessType: input.contextPriority?.authoritativeBusinessType ?? input.translatedIntent?.businessType ?? input.composition.businessType,
    domain: input.contextPriority?.authoritativeDomain ?? input.translatedIntent?.domain ?? input.intent.domain,
    mode: input.mode,
    pageCount: input.translatedIntent?.pages.count ?? input.intent.pageCount,
    requestedPages: translatedPages.length ? translatedPages : input.intent.requestedPages,
    requiredFeatures,
    summary: "",
    userIntent: input.intent.userIntent
  };

  taskUnderstanding.summary =
    `${input.mode} request understood as ${input.intent.userIntent} for ` +
    `${taskUnderstanding.businessType}. ${input.intent.summary}`;

  return taskUnderstanding;
}

export function buildContextDiagnosis(input: IntelligenceKernelInput): ContextDiagnosis {
  const hasWebFiles = ["index.html", "styles.css", "main.js"].some((path) =>
    input.diagnostic.fileList.includes(path)
  );

  return {
    activePath: input.diagnostic.activePath,
    compositionBusinessType: input.composition.businessType,
    editScope: input.diagnostic.editScope,
    fileList: input.diagnostic.fileList,
    hasProject: Boolean(input.diagnostic.projectId),
    hasWebFiles,
    inferredDomain: input.diagnostic.inferredDomain,
    projectId: input.diagnostic.projectId,
    promptIntent: input.diagnostic.promptIntent,
    runtimeStatus: input.diagnostic.runtime.status,
    summary:
      `${input.diagnostic.diagnosis} Active file is ${input.diagnostic.activePath || "none"} ` +
      `with ${input.diagnostic.fileList.length} selected-project file(s).`
  };
}

export function buildReasoningTrace(
  taskUnderstanding: TaskUnderstanding,
  contextDiagnosis: ContextDiagnosis,
  input: IntelligenceKernelInput
): ReasoningTrace {
  const websiteRequest = isWebsiteRequest(input.decision);

  return {
    assumptions: [
      "Approval is required before any file or runtime mutation.",
      contextDiagnosis.hasProject
        ? "The selected project is the only valid mutation scope."
        : "No selected project means mutation should remain blocked by downstream approval/apply logic.",
      websiteRequest
        ? "Website generation should satisfy the composed business architecture."
        : "The safest treatment should stay as small as the request allows."
    ],
    confidenceFactors: [
      `intent=${input.intent.confidence.toFixed(2)}`,
      input.translatedIntent ? `translated=${input.translatedIntent.confidence.toFixed(2)}` : "translated=none",
      `decision=${input.decision.confidence.toFixed(2)}`,
      `domain=${taskUnderstanding.domain}`,
      `editScope=${contextDiagnosis.editScope}`
    ],
    constraints: [
      "no shell execution",
      "no package installation",
      "no database mutation inside kernel",
      "no runtime mutation inside kernel",
      "low-spec friendly reasoning only"
    ],
    observations: [
      taskUnderstanding.summary,
      contextDiagnosis.summary,
      input.translatedIntent
        ? `Intent translator normalized current prompt as domain=${input.translatedIntent.domain ?? "unknown"}, business=${input.translatedIntent.businessType ?? "unknown"}, features=${input.translatedIntent.requestedFeatures.join(", ") || "none"}, constraints=${input.translatedIntent.constraints.join(", ") || "none"}.`
        : "Intent translator was not available for this request.",
      input.blueprint
        ? `Blueprint matcher selected ${input.blueprint.blueprintName} (${input.blueprint.blueprintId}) with ${input.blueprint.blueprintStatus} status and preview ${input.blueprint.previewType}.`
        : "Blueprint matcher was not available for this request.",
      input.contextPriority
        ? `Context priority selected mode=${input.contextPriority.authoritativeMode}, domain=${input.contextPriority.authoritativeDomain ?? "unknown"}, intent=${input.contextPriority.authoritativeIntentFamily}, preview=${input.contextPriority.authoritativePreviewType}, suppressed=${input.contextPriority.suppressedContext.length}.`
        : "Context priority engine was not available for this request.",
      input.composition.reasoningSummary,
      input.decision.reason
    ],
    strategy:
      `${input.decision.changeStrategy} Use composition context for business tone, ` +
      `page count, visual language, and safety checks.`
  };
}

export function buildPlanCandidates(
  taskUnderstanding: TaskUnderstanding,
  contextDiagnosis: ContextDiagnosis,
  reasoningTrace: ReasoningTrace,
  input: IntelligenceKernelInput
): PlanCandidate[] {
  const expectedFiles = expectedFilesFromComposition(input.composition, input.decision);
  const runtimeActions: RuntimeAction[] =
      input.mode !== "ASK" && input.decision.requestType === "runtime_action"
      ? ["restart_runtime", "reload_preview", "stop_runtime"]
      : input.mode === "WEBSITE" && isWebsiteRequest(input.decision)
        ? ["reload_preview"]
        : [];
  const baseConfidence = average([input.intent.confidence, input.decision.confidence]);
  const primaryRisk =
    input.mode !== "ASK" || runtimeActions.length > 0
      ? "medium"
      : expectedFiles.length > 0
        ? "low"
        : "low";
  const primary: PlanCandidate = {
    confidence: clamp01(baseConfidence),
    expectedFiles,
    id: "primary-safe-plan",
    rationale: reasoningTrace.strategy,
    riskLevel: primaryRisk,
    runtimeActions,
    strategy: input.decision.changeStrategy,
    title: `${taskUnderstanding.userIntent.replaceAll("_", " ")} plan`
  };
  const conservative: PlanCandidate = {
    confidence: clamp01(baseConfidence - 0.12),
    expectedFiles: expectedFiles.filter((path) => path !== "welcome.ts"),
    id: "conservative-targeted-plan",
    rationale:
      "Fallback plan that preserves existing structure, avoids broad regeneration, and keeps approval-first safety.",
    riskLevel: "low",
    runtimeActions: [],
    strategy: "Preserve structure and make the smallest selected-project change that satisfies intent.",
    title: "conservative targeted plan"
  };

  return contextDiagnosis.promptIntent === "ask_question" ? [conservative] : [primary, conservative];
}

export function selectPlan(planCandidates: PlanCandidate[]) {
  return [...planCandidates].sort((a, b) => b.confidence - a.confidence)[0] ?? planCandidates[0];
}

export function assessRisk(
  taskUnderstanding: TaskUnderstanding,
  contextDiagnosis: ContextDiagnosis,
  selectedPlan: PlanCandidate,
  input: IntelligenceKernelInput
): RiskAssessment {
  const websiteRequest = isWebsiteRequest(input.decision);
  const technicalBusiness = isTechnicalBusiness(input.composition);
  const projectIsolationRisk = contextDiagnosis.hasProject ? 0.1 : 0.75;
  const fileMutationRisk =
    input.mode === "ASK" ? 0.05 : selectedPlan.expectedFiles.length > 0 ? 0.42 : 0.2;
  const previewRuntimeRisk = selectedPlan.runtimeActions.length > 0 ? 0.46 : 0.12;
  const overgenerationRisk =
    input.decision.requestType === "rename" || input.decision.requestType === "image_fix"
      ? 0.14
      : websiteRequest && contextDiagnosis.hasWebFiles
        ? 0.34
        : 0.22;
  const wrongDomainRisk =
    !technicalBusiness &&
    contextDiagnosis.inferredDomain === "code/tooling project" &&
    websiteRequest &&
    taskUnderstanding.userIntent !== "new_site"
      ? 0.58
      : input.intent.domain === "generic website"
        ? 0.28
        : 0.16;
  const visualMismatchRisk =
    input.intent.palette.length > 0 || input.intent.visualStyle.length > 0 ? 0.24 : 0.14;
  const userIntentMismatchRisk =
    taskUnderstanding.userIntent === "new_site" && !websiteRequest
      ? 0.42
      : taskUnderstanding.userIntent === "rename" && input.decision.requestType !== "rename"
        ? 0.52
        : 0.16;
  const overallRisk = clamp01(
    average([
      projectIsolationRisk,
      fileMutationRisk,
      previewRuntimeRisk,
      overgenerationRisk,
      wrongDomainRisk,
      visualMismatchRisk,
      userIntentMismatchRisk
    ])
  );
  const notes = [
    projectIsolationRisk >= 0.5 ? "selected project is missing or unclear" : null,
    wrongDomainRisk >= 0.5 ? "non-technical business could be mistaken for developer tooling" : null,
    overgenerationRisk >= 0.3 ? "broad generation should be checked against existing structure" : null,
    visualMismatchRisk >= 0.2 ? "requested palette/style must be reflected in generated files" : null
  ].filter(Boolean) as string[];

  return {
    fileMutationRisk,
    notes,
    overallRisk,
    overgenerationRisk,
    previewRuntimeRisk,
    projectIsolationRisk,
    riskLevel: riskLevel(overallRisk),
    userIntentMismatchRisk,
    visualMismatchRisk,
    wrongDomainRisk
  };
}

export function critiquePlan(
  taskUnderstanding: TaskUnderstanding,
  contextDiagnosis: ContextDiagnosis,
  selectedPlan: PlanCandidate,
  riskAssessment: RiskAssessment,
  input: IntelligenceKernelInput
): CritiqueResult {
  const issues: string[] = [];
  const strengths: string[] = [
    "approval-first safety preserved",
    "kernel performs no mutation",
    "selected-project context is explicit"
  ];
  const websiteRequest = isWebsiteRequest(input.decision);
  const technicalBusiness = isTechnicalBusiness(input.composition);

  if (!contextDiagnosis.hasProject && input.mode !== "ASK") {
    issues.push("selected project is missing for a mutation-capable mode");
  }

  if (websiteRequest && selectedPlan.expectedFiles.includes("welcome.ts")) {
    issues.push("website generation plan must not target welcome.ts");
  }

  if (
    websiteRequest &&
    input.composition.siteArchitecture.pageCount > 1 &&
    selectedPlan.expectedFiles.filter((path) => path.endsWith(".html")).length <
      input.composition.siteArchitecture.pageCount
  ) {
    issues.push("plan does not satisfy requested/composed page count");
  }

  if (
    !technicalBusiness &&
    contextDiagnosis.inferredDomain === "code/tooling project" &&
    websiteRequest &&
    taskUnderstanding.userIntent !== "new_site"
  ) {
    issues.push("wrong-domain risk: non-technical website could fall back to developer aesthetics");
  }

  if (taskUnderstanding.userIntent === "rename" && input.decision.requestType !== "rename") {
    issues.push("rename intent was not routed to text replacement");
  }

  if (taskUnderstanding.userIntent === "new_site" && !websiteRequest) {
    issues.push("new website intent was not routed to website generation");
  }

  if (riskAssessment.riskLevel === "high") {
    issues.push("risk assessment is high; proposal should not proceed without repair");
  }

  if (input.composition.businessType && taskUnderstanding.businessType === input.composition.businessType) {
    strengths.push("composition business type is represented");
  }

  if (input.intent.pageCount === null || input.intent.pageCount === input.composition.siteArchitecture.pageCount) {
    strengths.push("page count understanding is consistent");
  }

  const score = Math.max(0, 100 - issues.length * 18 - Math.round(riskAssessment.overallRisk * 20));

  return {
    issues,
    passed: issues.length === 0 && score >= 70,
    score,
    strengths
  };
}

export function buildVerificationPlan(
  taskUnderstanding: TaskUnderstanding,
  contextDiagnosis: ContextDiagnosis,
  selectedPlan: PlanCandidate,
  input: IntelligenceKernelInput
): VerificationPlan {
  const touchedSourceCode = selectedPlan.expectedFiles.some((path) => /\.(ts|tsx|js|jsx)$/i.test(path));
  const touchedWebFiles = selectedPlan.expectedFiles.some((path) => /\.(html|css|js)$/i.test(path));
  const websiteRequest = isWebsiteRequest(input.decision);
  const checks = [
    "confirm proposal projectId matches current selected project before approval",
    "confirm proposed file contents are not blank",
    touchedSourceCode ? "run typecheck when source code changes are applied" : null,
    touchedWebFiles ? "reload preview after approved web file changes" : null,
    websiteRequest ? "manual visual review for generated website quality and responsiveness" : null,
    taskUnderstanding.requestedPages.length > 0 ? "confirm requested pages are represented" : null,
    contextDiagnosis.hasProject ? "confirm no cross-project file mutation" : "block mutation until project exists"
  ].filter(Boolean) as string[];

  return {
    checks,
    requiresManualVisualReview: websiteRequest,
    requiresNoBlankFilesCheck: true,
    requiresPreviewReload: touchedWebFiles,
    requiresProjectIsolationCheck: true,
    requiresTypecheck: touchedSourceCode
  };
}

export function buildLearningSignal(
  taskUnderstanding: TaskUnderstanding,
  critiqueResult: CritiqueResult,
  riskAssessment: RiskAssessment,
  input: IntelligenceKernelInput
): LearningSignal {
  return {
    failureSignals: [
      ...critiqueResult.issues,
      ...riskAssessment.notes
    ],
    nextMemoryHint:
      critiqueResult.passed && input.intent.brandName
        ? `Remember ${input.intent.brandName} as a ${taskUnderstanding.businessType} preference signal later.`
        : null,
    preferenceSignals: [
      ...input.intent.palette.map((color) => `palette:${color}`),
      ...input.intent.visualStyle.map((style) => `style:${style}`),
      ...input.intent.shapeLanguage.map((shape) => `shape:${shape}`)
    ],
    qualitySignals: [
      ...input.decision.qualityCriteria,
      `risk:${riskAssessment.riskLevel}`,
      `critique:${critiqueResult.passed ? "passed" : "needs_attention"}`
    ]
  };
}

export function buildIntelligenceKernel(input: IntelligenceKernelInput): IntelligenceKernelResult {
  const taskUnderstanding = buildTaskUnderstanding(input);
  const contextDiagnosis = buildContextDiagnosis(input);
  const reasoningTrace = buildReasoningTrace(taskUnderstanding, contextDiagnosis, input);
  const planCandidates = buildPlanCandidates(taskUnderstanding, contextDiagnosis, reasoningTrace, input);
  const selectedPlan = selectPlan(planCandidates);
  const riskAssessment = assessRisk(taskUnderstanding, contextDiagnosis, selectedPlan, input);
  const critiqueResult = critiquePlan(
    taskUnderstanding,
    contextDiagnosis,
    selectedPlan,
    riskAssessment,
    input
  );
  const verificationPlan = buildVerificationPlan(taskUnderstanding, contextDiagnosis, selectedPlan, input);
  const executionProposal: ExecutionProposal = {
    allowedRuntimeActions: ["restart_runtime", "reload_preview", "stop_runtime"],
    approvalRequired: true,
    canMutateFiles: input.mode !== "ASK" && selectedPlan.expectedFiles.length > 0,
    canRunRuntimeActions: input.mode !== "ASK" && selectedPlan.runtimeActions.length > 0,
    mutationScope: input.mode === "ASK" ? "none" : "selected_project",
    summary:
      input.mode === "ASK"
        ? "ASK mode remains explanation-only."
        : `${input.mode} may propose selected-project file changes and approved safe runtime actions only.`
  };
  const learningSignal = buildLearningSignal(taskUnderstanding, critiqueResult, riskAssessment, input);
  const confidence = clamp01(
    average([
      input.intent.confidence,
      input.translatedIntent?.confidence ?? input.intent.confidence,
      input.decision.confidence,
      selectedPlan.confidence,
      critiqueResult.score / 100,
      1 - riskAssessment.overallRisk
    ])
  );
  const shouldProceed = critiqueResult.passed && riskAssessment.riskLevel !== "high";
  const routingDecision = buildKernelRoutingDecision(
    input,
    riskAssessment,
    critiqueResult,
    verificationPlan,
    confidence
  );
  const summary =
    `${input.mode}; ${taskUnderstanding.businessType}; intent=${taskUnderstanding.userIntent}; ` +
    `plan=${selectedPlan.title}; risk=${riskAssessment.riskLevel}; ` +
    `policy=${routingDecision.mutationPolicy}; task=${routingDecision.taskType}; ` +
    `confidence=${confidence.toFixed(2)}; proceed=${shouldProceed ? "yes" : "needs review"}.`;

  return {
    confidence,
    contextDiagnosis,
    critiqueResult,
    executionProposal,
    learningSignal,
    planCandidates,
    reasoningTrace,
    riskAssessment,
    routingDecision,
    selectedPlan,
    shouldProceed,
    summary,
    taskUnderstanding,
    verificationPlan
  };
}
