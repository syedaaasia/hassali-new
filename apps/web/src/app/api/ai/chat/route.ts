import {
  resolveChatPersistenceContext,
  saveChatMessage,
  type AiMode as PersistedAiMode
} from "@hassali/database";
import { auth } from "@clerk/nextjs/server";
import {
  buildAskRuntimeContext,
  detectAskLiveIntent,
  formatAskRuntimeContext
} from "@/lib/server/ai/ask-context";
import {
  createAskBrainDebugHeaders,
  runAskBrain
} from "@/lib/server/ai/ask-brain-orchestrator";
import {
  applyApprovalDecision,
  buildApprovalDecision,
  type ApprovalDecision
} from "@/lib/server/ai/approval-authority";
import {
  validateAssetVisuals,
  type AssetVisualValidationResult
} from "@/lib/server/ai/asset-visual-validator";
import {
  matchBusinessBlueprint,
  summarizeBusinessBlueprint,
  type BusinessBlueprint
} from "@/lib/server/ai/blueprint-matcher";
import {
  buildContextPriority,
  summarizeContextPriority,
  type ContextPriorityResult
} from "@/lib/server/ai/context-priority-engine";
import {
  buildCompositionPlan,
  summarizeCompositionPlan,
  type CompositionPlan
} from "@/lib/server/ai/composition-engine";
import {
  buildDiagnosticContext,
  formatDiagnosticContext,
  type DiagnosticContext
} from "@/lib/server/ai/diagnostic-context";
import {
  buildDecisionPlan,
  scoreProposalQuality,
  shouldUseDeterministicDecision,
  type DecisionPlan
} from "@/lib/server/ai/decision-engine";
import {
  summarizeDomainValidation,
  validateDomain,
  type DomainValidationResult
} from "@/lib/server/ai/domain-validator";
import {
  buildProposalQualityGate,
  type ProposalQualityGateResult
} from "@/lib/server/ai/proposal-quality-gate";
import {
  generateDomainSite,
  generatePlannedWebsiteFiles,
  type SiteDomain
} from "@/lib/server/ai/domain-site-generator";
import {
  createReactProductPreviewMetadata,
  generateCrmPythonStreamlitSource,
  generateCrmViteSource,
  generateMobilePhoneInventoryStreamlitSource
} from "@/lib/server/ai/code-app-source-generator";
import {
  buildExecutionPlan,
  summarizeExecutionPlan,
  type ExecutionPlan
} from "@/lib/server/ai/execution-planner";
import {
  buildGeneratorContract,
  summarizeGeneratorContract,
  type GeneratorContract
} from "@/lib/server/ai/generator-contract";
import { createHassaliIdentityAnswer } from "@/lib/server/ai/hassali-identity";
import { routeLiveKnowledgeQuestion } from "@/lib/server/ai/live-knowledge-router";
import {
  buildProposalContext,
  decidePromptOwnership,
  enforceGeneratorContractWithProposalContext,
  type ProposalContext
} from "@/lib/server/ai/proposal-context";
import {
  repairProposal,
  type ProposalRepairResult
} from "@/lib/server/ai/proposal-repair-engine";
import {
  buildIntentIntelligence,
  type IntentIntelligence
} from "@/lib/server/ai/intent-intelligence";
import {
  summarizeTranslatedIntent,
  translateIntent,
  type TranslatedIntentSpec
} from "@/lib/server/ai/intent-translator";
import {
  decomposeTask,
  summarizeTaskDecomposition,
  type TaskDecomposition
} from "@/lib/server/ai/task-decomposer";
import {
  buildIntelligenceKernel,
  type IntelligenceKernelResult,
  type KernelRoutingDecision
} from "@/lib/server/ai/intelligence-kernel";
import {
  buildProposalRoutingDecision,
  type ProposalRoutingDecision
} from "@/lib/server/ai/proposal-routing";
import {
  buildUpdatedProjectContract,
  projectContractPath,
  projectContractSystemContext,
  readProjectContractFromWorkspace,
  renderProjectContract,
  summarizeProjectContract,
  type ProjectContract
} from "@/lib/server/ai/project-contract";
import { buildWebsiteSourceOfTruth } from "@/lib/server/ai/website-source-of-truth";
import {
  buildPromptSovereigntyContract,
  validatePromptSovereignty,
  type PromptAcceptanceResult
} from "@/lib/server/ai/prompt-sovereignty";
import { buildWebsiteEditContext } from "@/lib/server/ai/website-edit-context";
import {
  buildWorkspaceContext,
  extractCodeAppIdentityFromWorkspace,
  hasWorkspaceWebsiteFiles
} from "@/lib/server/ai/workspace-context-engine";
import {
  classifyWebsiteEditIntent,
  hasWebsiteEditSignal,
  type WebsiteEditIntent
} from "@/lib/server/ai/website-edit-intent";
import {
  planWebsiteEdit,
  type WebsiteEditPlan
} from "@/lib/server/ai/website-edit-planner";
import {
  runSelfReview,
  type SelfReviewFile,
  type SelfReviewSystemRisk
} from "@/lib/server/ai/self-review";
import {
  buildCompositionStrategy,
  type CompositionStrategy
} from "@/lib/server/ai/reasoning-composition";
import {
  buildPreviewRuntime
} from "@/lib/server/preview/preview-runtime";
import type {
  PreviewRuntimeResult,
  PreviewType
} from "@/lib/server/preview/preview-types";
import type {
  SelfReviewReport,
  SelfReviewStatus
} from "@/lib/self-review-types";
import { getRuntimeStatus } from "@/lib/server/runtime-manager";

export const runtime = "nodejs";

const fallbackModel = "openai/gpt-4o-mini";
const openRouterChatCompletionsUrl = "https://openrouter.ai/api/v1/chat/completions";

type ChatRequestMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

type AiMode = "ASK" | "SUGGEST" | "EXECUTE";
type ProductMode = "ASK" | "WEBSITE" | "CODE";

type WorkspaceContext = {
  activeFileContent: string;
  activePath: string;
  fileContents?: Record<string, string>;
  fileList: string[];
  projectName?: string | null;
};

type GeneratedSourceFile = {
  content: string;
  path: string;
  summary: string;
};

function workspaceHasWebsiteFiles(workspace: WorkspaceContext) {
  return hasWorkspaceWebsiteFiles(workspace);
}

function isolateCodeContractForMixedWorkspace(files: GeneratedSourceFile[], workspace: WorkspaceContext) {
  if (!workspaceHasWebsiteFiles(workspace)) return files;

  return files.map((file) => {
    if (file.path !== "HASSALI.md") return file;

    return {
      ...file,
      content: file.content.replace(/^# HASSALI\.md/im, "# HASSALI.code.md"),
      path: "HASSALI.code.md",
      summary: file.summary.replace(/HASSALI\.md/g, "HASSALI.code.md")
    };
  });
}

function codeContractPathForWorkspace(workspace: WorkspaceContext) {
  const context = buildWorkspaceContext({
    mode: "CODE",
    projectName: workspace.projectName,
    workspace
  });

  return context.selectedContractPath === "HASSALI.code.md" ? "HASSALI.code.md" : projectContractPath;
}

function isolateProposalContextForMixedCodeWorkspace(context: ProposalContext, workspace: WorkspaceContext): ProposalContext {
  if (context.mode !== "CODE" || !workspaceHasWebsiteFiles(workspace)) {
    return context;
  }

  const requiredFiles = context.requiredFiles.map((path) =>
    path === projectContractPath ? "HASSALI.code.md" : path
  );

  return {
    ...context,
    codeGenerationBrief: context.codeGenerationBrief
      ? {
          ...context.codeGenerationBrief,
          filePlan: context.codeGenerationBrief.filePlan.map((file) =>
            file.path === projectContractPath ? { ...file, path: "HASSALI.code.md" } : file
          )
        }
      : context.codeGenerationBrief,
    requiredFiles,
    validationRules: context.validationRules.map((rule) =>
      rule.replace(/\bHASSALI\.md\b/g, "HASSALI.code.md")
    )
  };
}

type ExistingCodeAppIdentity = {
  appName: string;
  appType: string | null;
  contractPath: string | null;
  entryPoint: string | null;
  framework: string | null;
  previewType: string | null;
};

type RequestedCodeAppIdentity = {
  appName: string;
  framework: "python_streamlit" | "react_vite";
  requestKind: "create_new_app" | "edit_existing_app" | "replace_current_app";
};

function extractExistingCodeAppIdentity(workspace: WorkspaceContext): ExistingCodeAppIdentity | null {
  const identity = extractCodeAppIdentityFromWorkspace(workspace);

  if (!identity?.appName) return null;

  return {
    appName: identity.appName,
    appType: identity.appType ?? null,
    contractPath: identity.contractPath ?? null,
    entryPoint: identity.entryPoint ?? null,
    framework: identity.framework ?? null,
    previewType: identity.previewType ?? null
  };
}

function normalizeCodeAppName(value: string | null | undefined) {
  return cleanRenameValue(value ?? "")
    .toLowerCase()
    .replace(/\b(?:app|application|dashboard|system|software)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function namesMeaningfullyDifferent(existing: string, requested: string) {
  const left = normalizeCodeAppName(existing);
  const right = normalizeCodeAppName(requested);

  if (!left || !right) return false;
  if (left === right) return false;
  return !left.includes(right) && !right.includes(left);
}

function hasExplicitReplaceIntent(prompt: string) {
  return /\b(?:replace current app|replace this app|replace the current app|start over with|overwrite this project|overwrite current app|replace current project)\b/i.test(prompt);
}

function hasCodeAppCreateIntent(prompt: string) {
  return /\b(?:create|build|generate|make)\b[\s\S]{0,90}\b(?:react app|web app|browser app|dashboard app|dashboard|tracker|tool|single-page app|spa|frontend app|app)\b/i.test(prompt);
}

function hasCodeAppEditIntent(prompt: string, existingAppName?: string | null) {
  const hasEditVerb = /\b(?:add|improve|update|change|tweak|refine|extend|include|make|polish)\b/i.test(prompt);
  if (!hasEditVerb) return false;
  if (/\b(?:create|build|generate)\b/i.test(prompt)) return false;

  const existing = normalizeCodeAppName(existingAppName);
  const promptName = normalizeCodeAppName(prompt);
  return !existing || promptName.includes(existing) || /\b(?:this app|current app|dashboard|section|tab|colors?|filters?|reports?|payments?)\b/i.test(prompt);
}

function requestedCodeAppIdentity(input: {
  appPreviewName: string;
  existingAppName?: string | null;
  isPythonPreview: boolean;
  prompt: string;
}): RequestedCodeAppIdentity {
  const prompt = input.prompt;
  const framework = input.isPythonPreview ? "python_streamlit" : "react_vite";
  const metadataName = input.isPythonPreview
    ? input.appPreviewName
    : createReactProductPreviewMetadata({
        appName: input.appPreviewName,
        prompt
      }).appName;
  const requestKind = hasExplicitReplaceIntent(prompt)
    ? "replace_current_app"
    : hasCodeAppEditIntent(prompt, input.existingAppName)
      ? "edit_existing_app"
      : hasCodeAppCreateIntent(prompt)
        ? "create_new_app"
        : "edit_existing_app";

  return {
    appName: metadataName,
    framework,
    requestKind
  };
}

function createCodeAppCollisionProposal(input: {
  existing: ExistingCodeAppIdentity;
  mode: "SUGGEST" | "EXECUTE";
  projectId: string | null;
  requested: RequestedCodeAppIdentity;
}): DiffProposal {
  const summary =
    `This project already contains a CODE app: ${input.existing.appName}. ` +
    `Your new request looks like a different app: ${input.requested.appName}.\n\n` +
    `To avoid overwriting your current app, choose one:\n` +
    `1. Replace the current app\n` +
    `2. Create/open a new project and run this prompt there\n` +
    `3. Cancel and keep editing ${input.existing.appName}\n\n` +
    `If you want to replace it, reply: Replace current app with ${input.requested.appName}.`;

  return {
    approvalDisabled: true,
    approvalRecommendation: "reject",
    blockedReason: "CODE_APP_COLLISION: Different CODE app detected in the same project.",
    changes: [],
    id: `proposal-${Date.now()}`,
    mode: input.mode,
    previewMode: "answer_only",
    previewMetadata: {
      activeMode: "CODE",
      previewType: "none",
      runtimePolicy: "not_applicable_collision_guard"
    },
    projectId: input.projectId,
    proposalRoutingMode: "blocked",
    proposalRoutingReasons: [{
      code: "code_app_collision",
      message: `Existing CODE app ${input.existing.appName} would be overwritten by ${input.requested.appName}.`,
      severity: "high"
    }],
    shouldBlockExecution: true,
    status: "pending",
    summary
  };
}

function cleanCodeAppCollisionSummary(proposal: DiffProposal): DiffProposal {
  if (!proposal.summary.includes("This project already contains a CODE app:")) {
    return proposal;
  }

  const match = proposal.summary.match(/This project already contains a CODE app:[\s\S]*?If you want to replace it, reply: Replace current app with [^.]+[.]/);
  const summary = match?.[0] ?? proposal.summary;

  return {
    ...proposal,
    blockedReason: "CODE_APP_COLLISION: Different CODE app detected in the same project.",
    summary
  };
}

type ChatPersistenceContext = {
  mode: PersistedAiMode;
  projectId: string;
  sessionId: string | null;
  userId: string;
};

type FileProposalAction = "create" | "modify" | "update" | "write_file";
type RuntimeProposalAction = "restart_runtime" | "reload_preview" | "run_dev_server" | "start_runtime" | "stop_runtime";
type ProposalAction = FileProposalAction | RuntimeProposalAction;

type ProposalChange = {
  action: ProposalAction;
  path?: string;
  summary: string;
  proposedContent?: string;
  diffPreview?: string;
};

type ProposalRoutingMode = "blocked" | "normal" | "review_required";

type ProposalRoutingReason = {
  code: string;
  message: string;
  severity: "high" | "info" | "medium";
};

type ProposalRoutingWarning = {
  code: string;
  message: string;
  risk: "high" | "medium";
};

type LegacyPreviewType = "code_app_preview" | "code_plan_preview" | "docs_preview" | "none" | "website_static_preview";
type ProposalPreviewType = LegacyPreviewType | PreviewType;

type DiffProposal = {
  appPreview?: CodeAppPreview;
  assetDriftDetected?: boolean;
  assetScore?: number;
  assetValidationStatus?: "blocked" | "passed" | "review_required" | "warning";
  blueprintConfidence?: number;
  blueprintId?: string;
  blueprintKind?: "answer" | "code_app" | "website";
  blueprintName?: string;
  blueprintPreviewType?: "code_app_preview" | "code_plan_preview" | "none" | "website_static_preview";
  blueprintStatus?: "fallback" | "matched" | "none";
  changes: ProposalChange[];
  blockedReason?: string;
  authoritativeDomain?: string | null;
  authoritativeIntentFamily?: string;
  authoritativeMode?: "ASK" | "CODE" | "WEBSITE";
  authoritativePreviewType?: "code_app_preview" | "code_plan_preview" | "none" | "website_static_preview";
  contextConflictCount?: number;
  contextPriorityStatus?: "clear" | "conflicts_resolved" | "low_confidence";
  contradictionStatus?: "blocked" | "clear" | "review_required";
  compositionEntityCount?: number;
  compositionId?: string;
  compositionKind?: "answer_composition" | "app_composition" | "targeted_edit_composition" | "website_composition";
  compositionPageCount?: number;
  compositionRequiredSectionCount?: number;
  compositionStatus?: "answer_only" | "planned" | "targeted";
  compositionWarningCount?: number;
  decompositionId?: string;
  decompositionStatus?: "answer_only" | "decomposed" | "targeted";
  detectedDomain?: string;
  domainDriftDetected?: boolean;
  domainConfidence?: number;
  domainSource?: "current_user_prompt" | "existing_project" | "inferred" | "unknown";
  domainValidationScore?: number;
  domainValidationSeverity?: "critical" | "major" | "minor";
  domainValidationStatus?: "blocked" | "passed" | "review_required";
  executionMode?: "ASK" | "CODE" | "WEBSITE";
  executionPlanId?: string;
  executionPlanStatus?: "answer_only" | "planned" | "targeted";
  executionRiskLevel?: "high" | "low" | "medium";
  executionStageCount?: number;
  id: string;
  intentConfidence?: number;
  intentTranslationStatus?: "available" | "low_confidence" | "unavailable";
  intelligenceKernelSummary?: string;
  kernelRoutingDecision?: KernelRoutingDecision;
  genericCopyDetected?: boolean;
  generatorContractBlockCount?: number;
  generatorContractId?: string;
  generatorContractStatus?: "blocked" | "ready" | "warning";
  generatorContractWarningCount?: number;
  generatorForbiddenTermCount?: number;
  generatorMode?: "answer_only" | "code_generation" | "small_edit" | "website_generation";
  generatorRequiredSectionCount?: number;
  modeObedienceStatus?: "blocked" | "obeyed" | "review_required";
  modeDriftDetected?: boolean;
  mode: "SUGGEST" | "EXECUTE";
  previewMode?: "answer_only" | "code_plan" | "static_preview";
  previewCapabilities?: string[];
  previewClassification?: {
    confidence: number;
    previewType: PreviewType;
    reason: string;
    rendererId: string;
    signals: string[];
  };
  previewConfidence?: number;
  previewMetadata?: Record<string, unknown>;
  previewRuntimeState?: "empty" | "metadata_only" | "none" | "ready" | "unsupported";
  previewType?: ProposalPreviewType;
  previewWarnings?: string[];
  realPreview?: Record<string, unknown>;
  projectId: string | null;
  proposalRoutingMode?: ProposalRoutingMode;
  proposalRoutingReasons?: ProposalRoutingReason[];
  proposalRoutingWarnings?: ProposalRoutingWarning[];
  previewDriftDetected?: boolean;
  requiredPageCount?: number | null;
  heroAssetMismatch?: boolean;
  approvalDecision?: ApprovalDecision;
  approvalDisabled?: boolean;
  approvalRecommendation?: "approve" | "reject" | "review";
  completenessScore?: number;
  contentScore?: number;
  fakeContentDetected?: boolean;
  loremDetected?: boolean;
  placeholderDetected?: boolean;
  proposalQualityScore?: number;
  proposalQualityStatus?: "blocked" | "passed" | "review_required" | "warning";
  proposalRepairActionCount?: number;
  proposalRepairApplied?: boolean;
  proposalRepairAttempted?: boolean;
  proposalRepairConfidence?: number;
  proposalRepairStatus?: "failed" | "keep_blocked" | "not_needed" | "partial_repair" | "repaired";
  proposalRepairStrategy?: string;
  proposalRevalidationPassed?: boolean;
  proposalUnresolvedIssueCount?: number;
  qualityBlockCount?: number;
  qualityFailureCount?: number;
  qualityWarningCount?: number;
  publicCopyCleanStatus?: "blocked" | "clean" | "review_required";
  requiresExtraReview?: boolean;
  repeatedContentDetected?: boolean;
  sectionCopyQualityStatus?: "blocked" | "clean" | "review_required";
  shouldBlockExecution?: boolean;
  selfReview?: SelfReviewReport;
  selfReviewConfidence?: number;
  selfReviewFailureCount?: number;
  selfReviewStatus?: SelfReviewStatus;
  selfReviewWarningCount?: number;
  staleTermScanStatus?: "blocked" | "clean" | "review_required";
  structureScore?: number;
  status: "pending";
  suppressedContextCount?: number;
  todoDetected?: boolean;
  summary: string;
  placeholderOnlyVisualDetected?: boolean;
  visualBlockCount?: number;
  visualDriftDetected?: boolean;
  visualFailureCount?: number;
  visualScore?: number;
  visualValidationStatus?: "blocked" | "passed" | "review_required" | "warning";
  visualWarningCount?: number;
  executionStrategy?: "answer_only" | "docs_first_then_source" | "phased_code_plan" | "phased_proposal" | "single_proposal" | "single_targeted_edit" | "single_targeted_patch" | "static_site_build";
  milestoneCount?: number;
  recommendedExecutionPolicy?: "answer_only" | "docs_first_then_source" | "phased_proposal" | "single_proposal" | "single_targeted_patch";
  recommendedPhasePolicy?: "multi_phase" | "single_pass" | "targeted_only";
  taskKind?: "answer_plan" | "code_app_build" | "targeted_text_replacement" | "visual_edit" | "website_generation";
  translatedBusinessType?: string | null;
  translatedDomain?: string | null;
  translatedFeatures?: string[];
  translatedStyle?: string | null;
  validationIssueCount?: number;
  designTokenCount?: number;
  designTokenTheme?: string;
  designTokenValidationPassed?: boolean;
  tokensStudioExportAvailable?: boolean;
  memoryIgnoredForNewProject?: boolean;
  plannerGeneratorAligned?: boolean;
  sourceOfTruthDomain?: string | null;
  sourceOfTruthPages?: string[];
  sourceOfTruthPrompt?: string;
  validatorPlanAligned?: boolean;
  websiteAudience?: string;
  websiteGoal?: string;
  websiteIndustry?: string;
  websiteLayoutType?: string;
  websiteSectionCount?: number;
  websiteValidationPassed?: boolean;
  websiteVisualStrategy?: string;
};

type CodeAppPreview = {
  appKind: string;
  appName: string;
  entities: string[];
  integrations: string[];
  mockDataNotice: string;
  screens: string[];
};

type DiffProposalPayload = {
  changes: ProposalChange[];
  summary: string;
};

const proposalMarker = "HASSALI_DIFF_PROPOSAL:";

function isChatMessage(value: unknown): value is ChatRequestMessage {
  if (!value || typeof value !== "object") {
    return false;
  }

  const message = value as ChatRequestMessage;

  return (
    (message.role === "user" || message.role === "assistant" || message.role === "system") &&
    typeof message.content === "string" &&
    message.content.trim().length > 0
  );
}

function isWorkspaceContext(value: unknown): value is WorkspaceContext {
  if (!value || typeof value !== "object") {
    return false;
  }

  const workspace = value as WorkspaceContext;

  return (
    typeof workspace.activeFileContent === "string" &&
    typeof workspace.activePath === "string" &&
    Array.isArray(workspace.fileList) &&
    workspace.fileList.every((path) => typeof path === "string") &&
    (typeof workspace.fileContents === "undefined" ||
      (workspace.fileContents &&
        typeof workspace.fileContents === "object" &&
        Object.values(workspace.fileContents).every((content) => typeof content === "string"))) &&
    (typeof workspace.projectName === "undefined" ||
      workspace.projectName === null ||
      typeof workspace.projectName === "string")
  );
}

function isProductMode(value: unknown): value is ProductMode {
  return value === "ASK" || value === "WEBSITE" || value === "CODE";
}

function productModeFromRequest(value: unknown, legacyMode: AiMode): ProductMode {
  if (isProductMode(value)) {
    return value;
  }

  if (legacyMode === "ASK") {
    return "ASK";
  }

  return legacyMode === "SUGGEST" ? "WEBSITE" : "CODE";
}

function createDiffPreview(action: FileProposalAction, path: string, proposedContent: string) {
  return [
    action === "create" ? `create ${path}` : `update ${path}`,
    `--- ${path}`,
    `+++ ${path}`,
    ...proposedContent.split("\n").map((line) => `+ ${line}`)
  ].join("\n");
}

function isRuntimeProposalAction(action: unknown): action is RuntimeProposalAction {
  return action === "restart_runtime" ||
    action === "reload_preview" ||
    action === "run_dev_server" ||
    action === "start_runtime" ||
    action === "stop_runtime";
}

function isFileProposalAction(action: unknown): action is FileProposalAction {
  return action === "create" || action === "modify" || action === "update" || action === "write_file";
}

function shouldRestartPreview(prompt: string) {
  const lowerPrompt = prompt.toLowerCase();

  return (
    lowerPrompt.includes("preview") ||
    lowerPrompt.includes("start") ||
    lowerPrompt.includes("restart") ||
    lowerPrompt.includes("run")
  );
}

function hasStandardWebFiles(fileList: string[]) {
  return (
    fileList.includes("index.html") ||
    fileList.includes("styles.css") ||
    fileList.includes("main.js")
  );
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cleanRenameValue(value: string) {
  return value
    .trim()
    .replace(/^["'`]/, "")
    .replace(/["'`.,!?]$/, "")
    .trim();
}

function detectRenameRequest(prompt: string) {
  if (/\b(?:do not|don't|dont|no)\s+rename\b/i.test(prompt)) {
    return null;
  }

  if (/\b(?:color|colors|colour|colours|theme|palette)\b/i.test(prompt)) {
    return null;
  }

  const colorTerms = "green|blue|pink|white|black|gold|golden|yellow|brown|cream|teal|red|maroon|gradient";
  if (
    new RegExp(`\\b(?:change|update|switch|turn|replace)\\b\\s+(?:${colorTerms})(?:\\s+(?:color|colors|colour|colours|theme|palette|gradient))?\\s+(?:to|into|with)\\s+(?:${colorTerms})\\b`, "i").test(prompt)
  ) {
    return null;
  }

  const match =
    prompt.match(/(?:rename|change(?:\s+the)?\s+name)\s+from\s+(.+?)\s+to\s+(.+?)(?:$|[.!?])/i) ??
    prompt.match(/\brename\s+["'`]?(.+?)["'`]?\s+with\s+["'`]?(.+?)["'`]?(?:$|[.!?])/i) ??
    prompt.match(/\brename\s+["'`]?(.+?)["'`]?\s+to\s+["'`]?(.+?)["'`]?(?:$|[.!?])/i) ??
    prompt.match(/(?:replace|change(?:\s+the)?\s+text)\s+["'`]?(.+?)["'`]?\s+(?:with|to)\s+["'`]?(.+?)["'`]?(?:$|[.!?])/i) ??
    prompt.match(/\bchange\s+["'`]?([a-z0-9][a-z0-9&' -]{0,80}?)["'`]?\s+(?:to|with)\s+["'`]?([a-z0-9][a-z0-9&' -]{0,80}?)["'`]?(?:$|[.!?])/i);

  if (!match?.[1] || !match[2]) {
    return null;
  }

  const from = cleanRenameValue(match[1]);
  const to = cleanRenameValue(match[2]);

  return from && to && from.toLowerCase() !== to.toLowerCase() ? { from, to } : null;
}

function extractRequestedAppName(prompt: string, fallback: string) {
  const match =
    prompt.match(/\b(?:call it|called|named|name it)\s+([a-z0-9][a-z0-9&' -]{1,60}?)(?=\s+(?:with|and|using|that|which|for|to|it|should|as)\b|[,.!?]|$)/i) ??
    prompt.match(/\b(?:app|system|crm)\s+name\s+(?:is\s+)?([a-z0-9][a-z0-9&' -]{1,60}?)(?=\s+(?:with|and|using|that|which|for|to|it|should|as)\b|[,.!?]|$)/i);

  return cleanRenameValue(match?.[1] ?? fallback);
}

function titleCaseWords(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function createCodeAppPreview(prompt: string): CodeAppPreview {
  const promptText = prompt.toLowerCase();
  const appKind = promptText.includes("crm")
    ? "CRM"
    : promptText.includes("inventory")
      ? "Inventory system"
      : promptText.includes("erp")
        ? "ERP"
        : promptText.includes("pos")
          ? "POS system"
          : "software app";
  const appName = extractRequestedAppName(prompt, appKind === "CRM" ? "Hello CRM" : titleCaseWords(appKind));

  return {
    appKind,
    appName,
    entities:
      appKind === "CRM"
        ? ["User", "Customer", "Deal/Record", "Invoice/Subscription"]
        : ["User", "Record", "Activity", "Report"],
    integrations: [
      "Auth placeholder",
      "Database placeholder",
      promptText.includes("billing") ? "Billing provider placeholder" : "Integration placeholder"
    ],
    mockDataNotice: "Preview uses mock dashboard data only; no database, auth provider, billing provider, or file mutation runs before approval.",
    screens:
      appKind === "CRM"
        ? ["Login/Auth", "Dashboard", "Customers", "Records/Deals", "Billing", "Settings"]
        : ["Login/Auth", "Dashboard", "Records", "Reports", "Settings"]
  };
}

function extractEffectiveUserRequest(prompt: string) {
  const originalRequestMatch = prompt.match(
    /Original request:\s*\n([\s\S]*?)(?:\n\nPrevious proposal was blocked because:|\n\nWarnings:|\n\nRequired corrections:|$)/i
  );

  return originalRequestMatch?.[1]?.trim() || prompt;
}

function isEnhancementRequest(prompt: string) {
  const lowerPrompt = prompt.toLowerCase();

  return [
    "animation",
    "animate",
    "apple glass",
    "beautiful",
    "carousel",
    "glass style",
    "glassmorphism",
    "make premium",
    "premium",
    "slider"
  ].some((term) => lowerPrompt.includes(term));
}

function isInvoiceRequest(prompt: string) {
  return /\binvoice\b/i.test(prompt);
}

const colorThemes: Record<
  string,
  {
    accent: string;
    accentSoft: string;
    canvas: string;
    ink: string;
    secondary: string;
    surface: string;
    search: RegExp[];
  }
> = {
  black: {
    accent: "#111827",
    accentSoft: "rgba(17, 24, 39, 0.16)",
    canvas: "#f8fafc",
    ink: "#0b1120",
    secondary: "#6b7280",
    surface: "rgba(255, 255, 255, 0.78)",
    search: [/\bblack\b/gi, /#0b1120/gi, /#111827/gi, /#050505/gi]
  },
  blue: {
    accent: "#0ea5e9",
    accentSoft: "rgba(125, 211, 252, 0.32)",
    canvas: "#f5fbff",
    ink: "#0f2637",
    secondary: "#00a3af",
    surface: "rgba(255, 255, 255, 0.74)",
    search: [
      /\bblue\b/gi,
      /#0ea5e9/gi,
      /#38bdf8/gi,
      /#00a3af/gi,
      /rgba\(\s*125\s*,\s*211\s*,\s*252\s*,\s*[^)]+\)/gi
    ]
  },
  brown: {
    accent: "#8b5e34",
    accentSoft: "rgba(196, 142, 86, 0.28)",
    canvas: "#fff8ed",
    ink: "#2a1b12",
    secondary: "#c48e56",
    surface: "rgba(255, 255, 255, 0.76)",
    search: [/\bbrown\b/gi, /#8b5e34/gi, /#92400e/gi, /#c48e56/gi]
  },
  cream: {
    accent: "#c48e56",
    accentSoft: "rgba(196, 142, 86, 0.22)",
    canvas: "#fff8ed",
    ink: "#2a1b12",
    secondary: "#8b5e34",
    surface: "rgba(255, 255, 255, 0.82)",
    search: [/\bcream\b/gi, /#fff8ed/gi, /#fff7ed/gi, /#fef3c7/gi]
  },
  gold: {
    accent: "#d97706",
    accentSoft: "rgba(245, 158, 11, 0.28)",
    canvas: "#fff8e6",
    ink: "#2b1a05",
    secondary: "#f59e0b",
    surface: "rgba(255, 255, 255, 0.78)",
    search: [
      /\bgold(?:en)?\b/gi,
      /#d97706/gi,
      /#c6923e/gi,
      /#d6b16d/gi,
      /#f0c56c/gi,
      /rgba\(\s*214\s*,\s*177\s*,\s*109\s*,\s*[^)]+\)/gi
    ]
  },
  maroon: {
    accent: "#8a1538",
    accentSoft: "rgba(138, 21, 56, 0.28)",
    canvas: "#fbf7f8",
    ink: "#251018",
    secondary: "#b91c1c",
    surface: "rgba(255, 255, 255, 0.78)",
    search: [
      /\bmaroon\b/gi,
      /#7f1d1d/gi,
      /#7f1d2d/gi,
      /#8a1538/gi,
      /#9f1239/gi,
      /#b91c1c/gi,
      /rgba\(\s*138\s*,\s*21\s*,\s*56\s*,\s*[^)]+\)/gi,
      /rgba\(\s*127\s*,\s*29\s*,\s*(?:29|45)\s*,\s*[^)]+\)/gi
    ]
  },
  green: {
    accent: "#16a34a",
    accentSoft: "rgba(34, 197, 94, 0.28)",
    canvas: "#f4fff7",
    ink: "#102318",
    secondary: "#10b981",
    surface: "rgba(255, 255, 255, 0.74)",
    search: [
      /\bgreen\b/gi,
      /#16a34a/gi,
      /#22c55e/gi,
      /#10b981/gi,
      /rgba\(\s*34\s*,\s*197\s*,\s*94\s*,\s*[^)]+\)/gi
    ]
  },
  pink: {
    accent: "#db2777",
    accentSoft: "rgba(249, 168, 212, 0.34)",
    canvas: "#fff7fb",
    ink: "#21121a",
    secondary: "#f472b6",
    surface: "rgba(255, 255, 255, 0.72)",
    search: [
      /\bpink\b/gi,
      /\brose\b/gi,
      /#db2777/gi,
      /#f472b6/gi,
      /#f9a8d4/gi,
      /#fff7fb/gi,
      /rgba\(\s*249\s*,\s*168\s*,\s*212\s*,\s*[^)]+\)/gi
    ]
  },
  red: {
    accent: "#dc2626",
    accentSoft: "rgba(220, 38, 38, 0.24)",
    canvas: "#fff7f7",
    ink: "#2a0d0d",
    secondary: "#b91c1c",
    surface: "rgba(255, 255, 255, 0.74)",
    search: [/\bred\b/gi, /#dc2626/gi, /#b91c1c/gi, /#ef4444/gi, /rgba\(\s*220\s*,\s*38\s*,\s*38\s*,\s*[^)]+\)/gi]
  },
  teal: {
    accent: "#00a3af",
    accentSoft: "rgba(0, 163, 175, 0.28)",
    canvas: "#f4fffd",
    ink: "#102322",
    secondary: "#10b981",
    surface: "rgba(255, 255, 255, 0.72)",
    search: [/\bteal\b/gi, /#00a3af/gi, /#14b8a6/gi]
  },
  white: {
    accent: "#e2e8f0",
    accentSoft: "rgba(226, 232, 240, 0.44)",
    canvas: "#f8fafc",
    ink: "#0f172a",
    secondary: "#94a3b8",
    surface: "rgba(255, 255, 255, 0.86)",
    search: [/\bwhite\b/gi, /#fff(?:fff)?/gi, /#f8fafc/gi]
  },
  yellow: {
    accent: "#eab308",
    accentSoft: "rgba(234, 179, 8, 0.28)",
    canvas: "#fffbea",
    ink: "#261b05",
    secondary: "#f59e0b",
    surface: "rgba(255, 255, 255, 0.8)",
    search: [
      /\byellow\b/gi,
      /#eab308/gi,
      /#facc15/gi,
      /#f59e0b/gi,
      /rgba\(\s*234\s*,\s*179\s*,\s*8\s*,\s*[^)]+\)/gi
    ]
  }
};

const knownColorNames = Object.keys(colorThemes);
const colorAliases: Record<string, string> = {
  golden: "gold",
  yellowish: "yellow"
};

function normalizeColorName(value: string | undefined | null) {
  if (!value) {
    return null;
  }

  const normalized = value.toLowerCase().trim();
  const color = colorAliases[normalized] ?? normalized;

  return colorThemes[color] ? color : null;
}

function extractThemeEdit(prompt: string) {
  const promptText = prompt.toLowerCase();
  const colorAlternation = [...knownColorNames, ...Object.keys(colorAliases)].join("|");
  const fromToMatch = promptText.match(
    new RegExp(`\\b(?:change|update|switch|turn|replace)\\b[\\s\\S]{0,60}?\\b(?:color|colors|colour|colours|theme|palette)?\\s*from\\s+(${colorAlternation})(?:\\s+(?:color|colors|colour|colours|theme|palette|gradient))?\\s+to\\s+(?:gradient\\s+)?(${colorAlternation})\\b`)
  );
  const directChangeMatch = promptText.match(
    new RegExp(`\\b(?:change|update|switch|turn|replace)\\b\\s+(${colorAlternation})(?:\\s+(?:color|colors|colour|colours|theme|palette|gradient))?\\s+(?:to|into|with)\\s+(?:gradient\\s+)?(${colorAlternation})\\b`)
  );
  const mentionedColors = [...knownColorNames, ...Object.keys(colorAliases)]
    .filter((color) => new RegExp(`\\b${color}\\b`, "i").test(promptText))
    .map((color) => normalizeColorName(color))
    .filter((color): color is string => Boolean(color));
  const oldColor =
    normalizeColorName(fromToMatch?.[1]) ?? normalizeColorName(directChangeMatch?.[1]);
  const targetColors =
    normalizeColorName(fromToMatch?.[2])
      ? [normalizeColorName(fromToMatch?.[2]) as string]
      : normalizeColorName(directChangeMatch?.[2])
        ? [normalizeColorName(directChangeMatch?.[2]) as string]
        : mentionedColors.length > 1 && /\b(?:change|update|switch|turn|replace)\b/.test(promptText)
          ? [mentionedColors[mentionedColors.length - 1]]
          : mentionedColors;

  return {
    fullTheme:
      !oldColor &&
      /\b(?:make|set|turn|update)\b[\s\S]{0,80}\b(?:theme|palette|site|website)\b/.test(promptText),
    oldColor,
    targetColors: Array.from(new Set(targetColors.filter((color) => color !== oldColor)))
  };
}

function replaceKnownColorTokens(css: string, oldColor: string | null, targetColor: string) {
  const target = colorThemes[targetColor];
  const oldTheme = oldColor ? colorThemes[oldColor] : null;
  let nextCss = css;
  let replacements = 0;
  const searchPatterns = oldTheme
    ? oldTheme.search
    : [
        ...colorThemes.pink.search,
        ...colorThemes.red.search,
        ...colorThemes.maroon.search,
        ...colorThemes.gold.search,
        ...colorThemes.yellow.search,
        ...colorThemes.green.search,
        ...colorThemes.blue.search,
        ...colorThemes.teal.search,
        ...colorThemes.brown.search
      ];

  for (const pattern of searchPatterns) {
    nextCss = nextCss.replace(pattern, () => {
      replacements += 1;
      return target.accent;
    });
  }

  return { css: nextCss, replacements };
}

function upsertCssVariable(css: string, variable: string, value: string) {
  const pattern = new RegExp(`(${variable}\\s*:\\s*)[^;]+;`, "i");

  if (pattern.test(css)) {
    return css.replace(pattern, `$1${value};`);
  }

  if (/:root\s*{/.test(css)) {
    return css.replace(/:root\s*{/, `:root {\n  ${variable}: ${value};`);
  }

  return `:root {\n  ${variable}: ${value};\n}\n\n${css}`;
}

function hasCssVariable(css: string, variable: string) {
  return new RegExp(`${variable}\\s*:`, "i").test(css);
}

function applyThemeToCss(css: string, targetColors: string[], oldColor: string | null, fullTheme: boolean) {
  const primary = targetColors[0] ?? "green";
  const secondary = targetColors[1] ?? primary;
  const primaryTheme = colorThemes[primary] ?? colorThemes.green;
  const secondaryTheme = colorThemes[secondary] ?? primaryTheme;
  const replaced = replaceKnownColorTokens(css, oldColor, primary);
  let nextCss = replaced.css;

  if (fullTheme) {
    nextCss = upsertCssVariable(nextCss, "--canvas", primaryTheme.canvas);
    nextCss = upsertCssVariable(nextCss, "--surface", primaryTheme.surface);
    nextCss = upsertCssVariable(nextCss, "--ink", primaryTheme.ink);
  } else {
    if (!hasCssVariable(nextCss, "--canvas")) {
      nextCss = upsertCssVariable(nextCss, "--canvas", "#f8fafc");
    }

    if (!hasCssVariable(nextCss, "--surface")) {
      nextCss = upsertCssVariable(nextCss, "--surface", "rgba(255, 255, 255, 0.78)");
    }

    if (!hasCssVariable(nextCss, "--ink")) {
      nextCss = upsertCssVariable(nextCss, "--ink", "#111827");
    }
  }

  nextCss = upsertCssVariable(nextCss, "--accent", primaryTheme.accent);
  nextCss = upsertCssVariable(nextCss, "--accent-2", secondaryTheme.secondary);
  nextCss = upsertCssVariable(nextCss, "--accent-soft", primaryTheme.accentSoft);

  const themeNote = `\n\n/* Hassali visual theme edit: ${targetColors.join(" and ")} ${fullTheme ? "theme" : "accent"} palette applied to tokens, buttons, glows, and highlights while preserving readable surfaces. */\n`;

  return {
    changedTokenCount: replaced.replacements,
    css: `${nextCss.trimEnd()}${nextCss.includes("Hassali visual theme edit") ? "" : themeNote}`,
    primary
  };
}

function contentForPath(workspace: WorkspaceContext, path: string) {
  return workspace.fileContents?.[path] ?? (workspace.activePath === path ? workspace.activeFileContent : "");
}

function safeFileContent(workspace: WorkspaceContext, path: string, fallback: string) {
  const content = contentForPath(workspace, path);

  return content.trim().length > 0 ? content : fallback;
}

function isLegacySiteDomain(domain: string): domain is SiteDomain {
  return [
    "car rental",
    "car showroom",
    "code/tooling project",
    "florist",
    "generic website",
    "jewellery",
    "media brand",
    "podcast",
    "portfolio",
    "restaurant",
    "SaaS",
    "youtube podcast"
  ].includes(domain);
}

function createStaticWebsiteContent(domain: DiagnosticContext["inferredDomain"]) {
  return generateDomainSite(isLegacySiteDomain(domain) ? domain : "generic website");
}

function createEnhancementChanges(
  prompt: string,
  workspace: WorkspaceContext,
  diagnostic: DiagnosticContext
) {
  const websiteContent = createStaticWebsiteContent(diagnostic.inferredDomain);
  const currentHtml = safeFileContent(workspace, "index.html", websiteContent.indexHtml);
  const currentCss = safeFileContent(workspace, "styles.css", websiteContent.stylesCss);
  const currentJs = safeFileContent(workspace, "main.js", websiteContent.mainJs);
  const needsCarousel = /\b(carousel|slider)\b/i.test(prompt);
  const hasCarousel = currentHtml.includes("hassali-carousel");
  const carouselHtml = `
      <section class="hassali-carousel" aria-label="Featured highlights">
        <div class="carousel-copy">
          <p class="eyebrow">Featured</p>
          <h2>Soft motion, clear focus, and a more premium rhythm.</h2>
        </div>
        <div class="carousel-track">
          <article class="carousel-card is-active">
            <span>01</span>
            <strong>Calm first impression</strong>
            <p>Layered glass surfaces and spacious content keep the page easy to scan.</p>
          </article>
          <article class="carousel-card">
            <span>02</span>
            <strong>Polished interaction</strong>
            <p>Subtle slider behavior adds life without making the page feel heavy.</p>
          </article>
          <article class="carousel-card">
            <span>03</span>
            <strong>Responsive detail</strong>
            <p>The section stacks cleanly on smaller screens and preserves the layout.</p>
          </article>
        </div>
        <div class="carousel-controls" aria-label="Carousel controls">
          <button class="carousel-button" data-carousel="prev" type="button">Prev</button>
          <button class="carousel-button" data-carousel="next" type="button">Next</button>
        </div>
      </section>
`;
  const htmlWithCarousel =
    needsCarousel && !hasCarousel
      ? currentHtml.includes("</main>")
        ? currentHtml.replace("</main>", `${carouselHtml}    </main>`)
        : `${currentHtml.trimEnd()}\n${carouselHtml}`
      : currentHtml;
  const enhancementCss = `

/* Hassali safe enhancement: Apple Glass-inspired motion without a full rewrite */
:where(.hero, section, article, .card, .product-card, .feature-card, .collection-card, .carousel-card) {
  transition:
    transform 220ms ease,
    border-color 220ms ease,
    box-shadow 220ms ease,
    opacity 240ms ease;
}

:where(article, .card, .product-card, .feature-card, .collection-card, .carousel-card):hover {
  transform: translateY(-4px);
  border-color: rgba(255, 255, 255, 0.18);
  box-shadow: 0 24px 72px rgba(0, 0, 0, 0.26);
}

.hassali-reveal {
  opacity: 0;
  transform: translateY(14px);
  transition: opacity 540ms ease, transform 540ms ease;
}

.hassali-reveal.is-visible {
  opacity: 1;
  transform: translateY(0);
}

.hassali-carousel {
  display: grid;
  gap: 1rem;
  margin-top: clamp(2rem, 5vw, 4rem);
}

.carousel-copy {
  max-width: 620px;
}

.carousel-track {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1rem;
}

.carousel-card {
  min-height: 12rem;
  opacity: 0.58;
}

.carousel-card.is-active {
  opacity: 1;
  transform: translateY(-3px);
  border-color: rgba(214, 177, 109, 0.38);
}

.carousel-card span {
  color: #d6b16d;
  font-size: 0.78rem;
  font-weight: 800;
}

.carousel-card strong {
  display: block;
  margin-top: 0.85rem;
}

.carousel-controls {
  display: flex;
  gap: 0.6rem;
}

.carousel-button {
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  color: inherit;
  cursor: pointer;
  padding: 0.65rem 0.9rem;
}

@media (max-width: 760px) {
  .carousel-track {
    grid-template-columns: 1fr;
  }
}
`;
  const enhancementJs = `

const revealTargets = document.querySelectorAll(".hero, section, article, .card, .product-card, .feature-card, .collection-card");

if ("IntersectionObserver" in window) {
  revealTargets.forEach((element) => element.classList.add("hassali-reveal"));

  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.14 });

  revealTargets.forEach((element) => revealObserver.observe(element));
}

const carouselCards = Array.from(document.querySelectorAll(".carousel-card"));
let carouselIndex = Math.max(0, carouselCards.findIndex((card) => card.classList.contains("is-active")));

function showCarouselCard(nextIndex) {
  if (carouselCards.length === 0) {
    return;
  }

  carouselIndex = (nextIndex + carouselCards.length) % carouselCards.length;
  carouselCards.forEach((card, index) => {
    card.classList.toggle("is-active", index === carouselIndex);
  });
}

document.querySelector('[data-carousel="prev"]')?.addEventListener("click", () => {
  showCarouselCard(carouselIndex - 1);
});

document.querySelector('[data-carousel="next"]')?.addEventListener("click", () => {
  showCarouselCard(carouselIndex + 1);
});
`;

  return [
    ...(htmlWithCarousel !== currentHtml || !diagnostic.fileList.includes("index.html")
      ? [
          {
            action: diagnostic.fileList.includes("index.html") ? ("update" as const) : ("create" as const),
            path: "index.html",
            proposedContent: htmlWithCarousel,
            summary: "Adds a small carousel section while preserving the existing HTML structure."
          }
        ]
      : []),
    {
      action: diagnostic.fileList.includes("styles.css") ? ("update" as const) : ("create" as const),
      path: "styles.css",
      proposedContent: `${currentCss.trimEnd()}${enhancementCss}`,
      summary: "Adds responsive Apple Glass-inspired surfaces, hover states, reveal motion, and carousel styling."
    },
    {
      action: diagnostic.fileList.includes("main.js") ? ("update" as const) : ("create" as const),
      path: "main.js",
      proposedContent: `${currentJs.trimEnd()}${enhancementJs}`,
      summary: "Adds lightweight reveal and carousel controls without shell execution or external packages."
    }
  ];
}

function createInvoiceContent() {
  return {
    html: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Invoice</title>
    <link rel="stylesheet" href="./invoice.css" />
  </head>
  <body>
    <main class="invoice-page">
      <section class="invoice">
        <header class="invoice-header">
          <div>
            <p class="eyebrow">Invoice</p>
            <h1>Professional Service Invoice</h1>
            <p class="muted">Use the button below to print or save this invoice as a PDF.</p>
          </div>
          <button class="print-button" id="print-invoice" type="button">Save as PDF</button>
        </header>
        <section class="invoice-grid">
          <div>
            <h2>From</h2>
            <p>Your Company Name</p>
            <p>hello@example.com</p>
          </div>
          <div>
            <h2>Bill To</h2>
            <p>Client Name</p>
            <p>client@example.com</p>
          </div>
          <div>
            <h2>Invoice No.</h2>
            <p>INV-001</p>
          </div>
          <div>
            <h2>Date</h2>
            <p>May 24, 2026</p>
          </div>
        </section>
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>Description</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Website Design</td>
              <td>Premium static website design and implementation.</td>
              <td>$500.00</td>
            </tr>
            <tr>
              <td>Revision</td>
              <td>Final polish, responsive checks, and handoff.</td>
              <td>$100.00</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td colspan="2">Total</td>
              <td>$600.00</td>
            </tr>
          </tfoot>
        </table>
        <section class="terms">
          <h2>Payment Terms</h2>
          <p>Payment is due within 7 days. Thank you for your business.</p>
        </section>
      </section>
    </main>
    <script src="./invoice.js"></script>
  </body>
</html>
`,
    js: `document.querySelector("#print-invoice")?.addEventListener("click", () => {
  window.print();
});
`,
    css: `:root {
  color-scheme: light;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: #f3f5f9;
  color: #162033;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
}

.invoice-page {
  min-height: 100vh;
  padding: clamp(1rem, 4vw, 3rem);
}

.invoice {
  max-width: 900px;
  margin: 0 auto;
  border: 1px solid rgba(22, 32, 51, 0.1);
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 28px 90px rgba(15, 23, 42, 0.12);
  padding: clamp(1.5rem, 5vw, 3rem);
}

.invoice-header,
.invoice-grid,
tfoot tr {
  display: grid;
  gap: 1rem;
}

.invoice-header {
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  border-bottom: 1px solid rgba(22, 32, 51, 0.12);
  padding-bottom: 1.5rem;
}

.eyebrow {
  color: #e6004c;
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

h1,
h2,
p {
  margin: 0;
}

h1 {
  font-size: clamp(2rem, 6vw, 4rem);
  letter-spacing: -0.04em;
}

h2 {
  font-size: 0.8rem;
  text-transform: uppercase;
  color: #64748b;
}

.muted,
.terms p {
  margin-top: 0.7rem;
  color: #64748b;
}

.print-button {
  border: 0;
  border-radius: 999px;
  background: #e6004c;
  color: #fff;
  cursor: pointer;
  padding: 0.8rem 1rem;
  font-weight: 800;
}

.invoice-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin: 1.5rem 0;
}

table {
  width: 100%;
  border-collapse: collapse;
  overflow: hidden;
  border-radius: 18px;
}

th,
td {
  border-bottom: 1px solid rgba(22, 32, 51, 0.1);
  padding: 1rem;
  text-align: left;
}

th {
  background: #e2e8f0;
  color: #334155;
  font-size: 0.78rem;
  text-transform: uppercase;
}

td:last-child,
th:last-child {
  text-align: right;
}

tfoot td {
  border-bottom: 0;
  font-size: 1.1rem;
  font-weight: 800;
}

.terms {
  margin-top: 1.5rem;
}

@media (max-width: 720px) {
  .invoice-header,
  .invoice-grid {
    grid-template-columns: 1fr;
  }
}

@media print {
  body {
    background: #fff;
  }

  .invoice-page {
    padding: 0;
  }

  .invoice {
    border: 0;
    box-shadow: none;
  }

  .print-button {
    display: none;
  }
}
`
  };
}

function promptRequestsPythonStack(prompt: string) {
  return /\b(?:python|py|streamlit|flask|fastapi|django|tkinter|pyside|pyqt)\b/i.test(prompt);
}

function promptRequestsReactFrontendStack(prompt: string) {
  return /\b(?:react|vite|tsx|frontend react|react frontend|typescript frontend)\b/i.test(prompt);
}

function compositionForCurrentWebsiteBrief(
  composition: CompositionStrategy,
  proposalContext?: ProposalContext
): CompositionStrategy {
  const brief = proposalContext?.websiteGenerationBrief;

  if (!brief) return composition;

  const pages = brief.requestedPages.length ? brief.requestedPages : composition.siteArchitecture.pages;
  const vocabulary = brief.expectedVocabulary.slice(0, 8);
  const audience = vocabulary.length
    ? vocabulary.map((term) => `${brief.displayName} ${term}`)
    : composition.audience;
  const businessGoals = [
    brief.conversionGoal,
    ...brief.ctaPatterns.slice(0, 2)
  ].filter(Boolean);
  const trustSignals = brief.trustSignals.length ? brief.trustSignals : brief.expectedVocabulary.slice(0, 4);

  return {
    ...composition,
    audience,
    businessGoals: businessGoals.length ? businessGoals : composition.businessGoals,
    businessType: `${brief.domainId} / ${brief.displayName}`,
    brandPositioning: brief.expectedVocabulary.length
      ? brief.expectedVocabulary.slice(0, 4)
      : composition.brandPositioning,
    contentStrategy: {
      ...composition.contentStrategy,
      ctaStrategy: brief.ctaPatterns.length ? brief.ctaPatterns : composition.contentStrategy.ctaStrategy,
      heroGoal: brief.conversionGoal,
      trustSignals
    },
    reasoningSummary:
      `${brief.displayName} website derived from the current prompt contract. ` +
      `Domain=${brief.domainId}; pages=${pages.join(", ")}; requiredFiles=${brief.requiredFiles.join(", ")}.`,
    sectionPlan: pages.map((page) => ({
      page,
      sections: brief.pageIntentMap?.[page] ?? brief.expectedSections.slice(0, 4)
    })),
    siteArchitecture: {
      pageCount: pages.length,
      pages
    }
  };
}

function decisionForProposalContext(decision: DecisionPlan, proposalContext?: ProposalContext): DecisionPlan {
  if (proposalContext?.mode === "CODE" && proposalContext.codeGenerationBrief && decision.requestType !== "code_system_generation") {
    return {
      ...decision,
      reason: `${decision.reason} CODE proposal context overrides stale ${decision.requestType} routing.`,
      requestType: "code_system_generation",
      requiredFiles: proposalContext.requiredFiles,
      siteStructure: {
        pageCount: 0,
        pages: [],
        sections: proposalContext.codeGenerationBrief.modules
      }
    };
  }

  return decision;
}

function createLocalProposal(
  prompt: string,
  workspace: WorkspaceContext,
  mode: "SUGGEST" | "EXECUTE",
  diagnostic: DiagnosticContext,
  decision: DecisionPlan,
  intent: IntentIntelligence,
  composition: CompositionStrategy,
  generatorContract?: GeneratorContract,
  proposalContext?: ProposalContext
): DiffProposal {
  const renameRequest = detectRenameRequest(prompt);

  if (decision.requestType === "code_system_generation" || (proposalContext?.mode === "CODE" && proposalContext.codeGenerationBrief)) {
    const promptText = prompt.toLowerCase();
    const rawAppPreview = createCodeAppPreview(prompt);
    const systemName = promptText.includes("crm")
      ? "CRM"
      : promptText.includes("inventory")
        ? "inventory system"
        : promptText.includes("erp")
          ? "ERP"
          : promptText.includes("pos")
            ? "POS system"
            : "software system";
    const requestedCapabilities = Array.from(
      new Set([
        promptText.includes("auth") || promptText.includes("authentication") ? "authentication and role-aware access" : null,
        promptText.includes("database") ? "database-backed persistence" : null,
        promptText.includes("dashboard") ? "dashboard and reporting surfaces" : null,
        promptText.includes("billing") ? "billing/payment integration planning" : null,
        promptText.includes("crm") ? "customers, leads, pipeline, notes, and activity tracking" : null,
        "API/service layer",
        "environment variables",
        "security and test plan"
      ].filter(Boolean) as string[])
    );
    const usePythonStack = promptRequestsPythonStack(prompt) && !promptRequestsReactFrontendStack(prompt);
    const codeBrief = proposalContext?.codeGenerationBrief ?? null;
    const promptRequestsReactApp = promptRequestsReactFrontendStack(prompt) || codeBrief?.requestedStack === "react_vite" || codeBrief?.preferredFramework === "react_vite";
    const promptMentionsPhoneInventory = /\b(?:mobile phone shop|phone shop|smartphone store|mobile store|cellphone shop|phone retail|phone accessories|iphone|samsung|android phones?|unlocked phones?|phone repair shop)\b/.test(promptText);
    const isMobilePhoneInventory =
      !promptRequestsReactApp &&
      codeBrief?.domainId === "mobile_phone_shop" &&
      promptMentionsPhoneInventory &&
      codeBrief.modules.some((moduleName) => ["products", "stock", "sales", "suppliers", "repairs"].includes(moduleName));
    const isPythonPreview = isMobilePhoneInventory || usePythonStack || (!promptRequestsReactApp && codeBrief?.preferredFramework === "streamlit");
    const existingCodeApp = extractExistingCodeAppIdentity(workspace);
    const requestedCodeApp = requestedCodeAppIdentity({
      appPreviewName: rawAppPreview.appName,
      existingAppName: existingCodeApp?.appName,
      isPythonPreview,
      prompt
    });
    const isEditExistingCodeApp = requestedCodeApp.requestKind === "edit_existing_app" && Boolean(existingCodeApp?.appName);
    const effectiveAppName = isEditExistingCodeApp ? existingCodeApp?.appName ?? rawAppPreview.appName : rawAppPreview.appName;
    const effectiveGenerationPrompt = isEditExistingCodeApp
      ? `${prompt}\n\nExisting CODE app context: appName=${existingCodeApp?.appName}; appType=${existingCodeApp?.appType ?? "unknown"}; framework=${existingCodeApp?.framework ?? "unknown"}; previewType=${existingCodeApp?.previewType ?? "unknown"}. Preserve this app identity and add the requested capability without replacing it with a new unrelated app.`
      : prompt;
    const appPreview: CodeAppPreview = isEditExistingCodeApp
      ? {
          ...rawAppPreview,
          appName: effectiveAppName
        }
      : rawAppPreview;
    const isDifferentNewCodeApp =
      existingCodeApp &&
      requestedCodeApp.requestKind === "create_new_app" &&
      namesMeaningfullyDifferent(existingCodeApp.appName, requestedCodeApp.appName);

    if (isDifferentNewCodeApp) {
      return createCodeAppCollisionProposal({
        existing: existingCodeApp,
        mode,
        projectId: diagnostic.projectId,
        requested: requestedCodeApp
      });
    }

    const sourceFiles = isolateCodeContractForMixedWorkspace(isMobilePhoneInventory
      ? generateMobilePhoneInventoryStreamlitSource({
          appName: effectiveAppName,
          brief: codeBrief,
          prompt: effectiveGenerationPrompt
        })
      : usePythonStack || (!promptRequestsReactApp && codeBrief?.preferredFramework === "streamlit")
      ? generateCrmPythonStreamlitSource({
          appName: effectiveAppName,
          brief: codeBrief,
          prompt: effectiveGenerationPrompt
        })
      : generateCrmViteSource({
          appName: effectiveAppName,
          brief: codeBrief,
          prompt: effectiveGenerationPrompt
        }), workspace);
    const reactProductPreview = isPythonPreview
      ? null
      : createReactProductPreviewMetadata({
          appName: effectiveAppName,
          prompt: effectiveGenerationPrompt
        });

    return {
      changes: sourceFiles.map((file) => ({
        action: diagnostic.fileList.includes(file.path) ? ("update" as const) : ("create" as const),
        diffPreview: createDiffPreview(
          diagnostic.fileList.includes(file.path) ? "update" : "create",
          file.path,
          file.content
        ),
        path: file.path,
        proposedContent: file.content,
        summary: file.summary
      })),
      appPreview,
      id: `proposal-${Date.now()}`,
      mode,
      previewMode: "code_plan",
      previewType: "code_app_preview",
      previewMetadata: isPythonPreview
        ? {
            activeMode: "CODE",
            entryPoint: "app.py",
            framework: "python_streamlit",
            previewType: "python_app_preview",
            runtimePolicy: "summary_only"
          }
        : {
            activeMode: "CODE",
            entryPoint: "index.html",
            framework: "react_vite",
            previewType: "code_app_preview",
            productPreview: reactProductPreview,
            runtimePolicy: "explicit_enablement_required"
          },
      projectId: diagnostic.projectId,
      status: "pending",
      summary:
        isMobilePhoneInventory
            ? `Detected CODE-mode inventory management software for a mobile phone shop. I will create a Python / Streamlit inventory scaffold with products, stock, suppliers, sales, repairs, billing, and documentation. No package install or runtime command runs before approval.`
          : usePythonStack || codeBrief?.preferredFramework === "streamlit"
          ? `Detected a CODE-mode ${appPreview.appName} ${systemName} request with explicit Python stack intent and ${requestedCapabilities.join(", ")}. I will create a Python / Streamlit CRM scaffold with mock data, dashboard metrics, billing charts, and documentation. No package install or runtime command runs before approval.`
          : `${requestedCodeApp.requestKind === "replace_current_app" && existingCodeApp ? `This will replace the existing CODE app in this project (${existingCodeApp.appName}) with ${requestedCodeApp.appName}. ` : ""}Detected a CODE-mode ${appPreview.appName} React mini-product request. I will create a Product Intelligence Blueprint-driven Vite React app with tabs, local state, forms, computed metrics, realistic mock data, README, architecture, data model, and security docs. No package install or runtime command runs before approval.`
    };
    const architecture = `# ${systemName.toUpperCase()} Architecture Plan

Source request:
${prompt}

Kernel mode:
CODE

Purpose:
Create a serious ${systemName} plan instead of a fake static website. This proposal does not install packages, run shell commands, or bypass approval-first safety.

Core modules:
${requestedCapabilities.map((item) => `- ${item}`).join("\n")}

Architecture direction:
- Frontend app shell with authenticated dashboard routes.
- Server/API layer for customers, records, activity, billing state, and reports.
- Database-backed source of truth with explicit ownership checks.
- Safe environment variable contract for auth, database, billing provider, and app URLs.
- Review-first execution: each implementation phase should be proposed and approved separately.

Non-goals for this proposal:
- No static marketing-site substitution.
- No index.html/styles.css/main.js scaffold unless the user explicitly asks for a landing page or frontend mockup.
- No package installs or database migrations in this step.
`;
    const dataModel = `# ${systemName.toUpperCase()} Data Model Draft

Primary entities:
- users: authenticated account identity and role metadata
- organizations/workspaces: tenant boundary for project or company data
- customers: CRM contacts or accounts
- leads: pipeline stage, source, priority, owner, expected value
- activities: notes, calls, emails, meetings, follow-ups
- invoices/subscriptions: billing status, plan, renewal, provider reference
- audit_events: important user actions and sensitive state changes

Ownership and isolation:
- Every mutable record must belong to a workspace/organization.
- API routes must verify authenticated user access before reads or writes.
- Billing records should never be trusted from client-only state.
`;
    const implementationPlan = `# ${systemName.toUpperCase()} Implementation Plan

Phase 1 - Product skeleton:
- Define routes, dashboard layout, navigation, empty states, and data-loading boundaries.
- Add typed module contracts for customers, leads, activity, reports, and billing.

Phase 2 - Data and API:
- Add database schema and migration proposal.
- Add API/service functions with validation and ownership checks.
- Add seed-safe examples only if explicitly requested.

Phase 3 - Auth and permissions:
- Wire protected routes.
- Add role checks for owner/admin/member access.
- Confirm no sensitive data is exposed client-side.

Phase 4 - Billing:
- Plan provider integration, webhook handling, subscription status, and failure states.
- Keep payment secrets server-side.

Phase 5 - Verification:
- Typecheck source changes.
- Test critical create/update/read flows.
- Manually review dashboard states and error messages.
`;
    const securityPlan = `# ${systemName.toUpperCase()} Security And Testing Checklist

Required checks before approval:
- Proposal projectId matches the selected project.
- No cross-project file edits.
- No shell execution or package installation.
- No secrets added to client files.
- API validation uses typed schemas before mutation.
- Database writes enforce ownership and workspace scope.
- Billing logic treats webhooks/server state as authority.
- Typecheck should run after source code phases.
- Manual review should verify dashboard, auth, billing, and empty/error states.
`;
    const files = [
      {
        content: architecture,
        path: "ARCHITECTURE.md",
        summary: `Creates a serious CODE architecture plan for the ${systemName}.`
      },
      {
        content: dataModel,
        path: "DATA_MODEL.md",
        summary: "Defines the first-pass entities, ownership boundaries, and persistence model."
      },
      {
        content: implementationPlan,
        path: "IMPLEMENTATION_PLAN.md",
        summary: "Breaks the system into safe approval-first implementation phases."
      },
      {
        content: securityPlan,
        path: "SECURITY_AND_TESTING.md",
        summary: "Captures security, isolation, billing, and verification checks."
      }
    ];

    return {
      changes: files.map((file) => ({
        action: diagnostic.fileList.includes(file.path) ? ("update" as const) : ("create" as const),
        diffPreview: createDiffPreview(
          diagnostic.fileList.includes(file.path) ? "update" : "create",
          file.path,
          file.content
        ),
        path: file.path,
        proposedContent: file.content,
        summary: file.summary
      })),
      appPreview,
      id: `proposal-${Date.now()}`,
      mode,
      previewMode: "code_plan",
      previewType: "code_app_preview",
      projectId: diagnostic.projectId,
      status: "pending",
      summary:
        `Detected a CODE-mode ${appPreview.appName} ${systemName} request. I will create a serious architecture, data model, implementation, security plan, and lightweight app preview metadata instead of a static website.`
    };
  }

  if (decision.requestType === "data_tool_generation") {
    const script = `#!/usr/bin/env python3
"""Merge many CSV files into one long CSV file.

Designed for low-spec laptops: it streams rows, preserves the first header,
logs skipped files, and avoids loading every CSV into memory at once.
"""

from __future__ import annotations

import argparse
import csv
from pathlib import Path


def merge_csv_files(input_dir: Path, output_file: Path) -> None:
    csv_files = sorted(input_dir.glob("*.csv"))
    if not csv_files:
        raise SystemExit(f"No CSV files found in {input_dir}")

    output_file.parent.mkdir(parents=True, exist_ok=True)
    header_written = False
    expected_header: list[str] | None = None
    merged_rows = 0
    skipped_files: list[str] = []

    with output_file.open("w", newline="", encoding="utf-8") as target:
        writer = csv.writer(target)

        for csv_path in csv_files:
            try:
                with csv_path.open("r", newline="", encoding="utf-8-sig") as source:
                    reader = csv.reader(source)
                    header = next(reader, None)

                    if not header:
                        skipped_files.append(f"{csv_path.name}: empty file")
                        continue

                    if expected_header is None:
                        expected_header = header
                        writer.writerow(header)
                        header_written = True
                    elif header != expected_header:
                        skipped_files.append(f"{csv_path.name}: header mismatch")
                        continue

                    for row in reader:
                        writer.writerow(row)
                        merged_rows += 1
            except UnicodeDecodeError:
                skipped_files.append(f"{csv_path.name}: could not decode as UTF-8")

    print(f"Merged {merged_rows} rows into {output_file}")
    if not header_written:
        print("No header was written.")
    if skipped_files:
        print("Skipped files:")
        for item in skipped_files:
            print(f"  - {item}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Merge many CSV files into one long CSV file.")
    parser.add_argument("input_dir", help="Folder containing CSV files")
    parser.add_argument("output_file", help="Merged output CSV path")
    args = parser.parse_args()

    merge_csv_files(Path(args.input_dir), Path(args.output_file))


if __name__ == "__main__":
    main()
`;
    const readme = `# CSV Merger

A lightweight Python tool for merging hundreds of CSV files into one long file.

## What it does

- Reads CSV files from a folder
- Writes one merged output CSV
- Preserves the first file header
- Skips files with mismatched headers
- Logs skipped files clearly
- Streams rows so it stays friendly on low-spec laptops

## Run

\`\`\`bash
python merge_csv.py ./input-csv ./merged/output.csv
\`\`\`

No package install is required.
`;
    const files = [
      {
        content: script,
        path: "merge_csv.py",
        summary: "Creates a lightweight Python CSV merge script with streaming row handling."
      },
      {
        content: readme,
        path: "README.md",
        summary: "Documents the CSV merger workflow, run command, and skipped-file behavior."
      }
    ];

    return {
      changes: files.map((file) => ({
        action: diagnostic.fileList.includes(file.path) ? ("update" as const) : ("create" as const),
        diffPreview: createDiffPreview(
          diagnostic.fileList.includes(file.path) ? "update" : "create",
          file.path,
          file.content
        ),
        path: file.path,
        proposedContent: file.content,
        summary: file.summary
      })),
      id: `proposal-${Date.now()}`,
      mode,
      projectId: diagnostic.projectId,
      status: "pending",
      summary:
        "Detected a Python CSV data-tool request. I will create a lightweight local merger script and README, not a website."
    };
  }

  if (mode === "EXECUTE" && isInvoiceRequest(prompt)) {
    const invoiceContent = createInvoiceContent();
    const files = [
      {
        content: invoiceContent.html,
        path: "invoice.html",
        summary: "Creates printable invoice wording and structure."
      },
      {
        content: invoiceContent.css,
        path: "invoice.css",
        summary: "Styles the invoice for screen and print/PDF output."
      },
      {
        content: invoiceContent.js,
        path: "invoice.js",
        summary: "Adds a Save as PDF button using the browser print dialog."
      }
    ];

    return {
      changes: files.map((file) => ({
        action: diagnostic.fileList.includes(file.path) ? ("update" as const) : ("create" as const),
        diffPreview: createDiffPreview(
          diagnostic.fileList.includes(file.path) ? "update" : "create",
          file.path,
          file.content
        ),
        path: file.path,
        proposedContent: file.content,
        summary: file.summary
      })),
      id: `proposal-${Date.now()}`,
      mode,
      projectId: diagnostic.projectId,
      status: "pending",
      summary:
        "Detected an invoice request. I will create invoice wording plus a print-ready invoice page that can be saved as PDF after approval."
    };
  }

  if (renameRequest) {
    const candidatePaths = workspace.fileList.filter((path) =>
      /\.(css|html|js|json|md|txt|tsx?|jsx?)$/i.test(path)
    );
    const changes = candidatePaths.flatMap((path) => {
      const currentContent = contentForPath(workspace, path);

      if (!currentContent || !new RegExp(escapeRegExp(renameRequest.from), "i").test(currentContent)) {
        return [];
      }

      const proposedContent = currentContent.replace(
        new RegExp(escapeRegExp(renameRequest.from), "gi"),
        renameRequest.to
      );

      return [
        {
          action: "update" as const,
          diffPreview: createDiffPreview("update", path, proposedContent),
          path,
          proposedContent,
          summary: `Replaces "${renameRequest.from}" with "${renameRequest.to}" in ${path}.`
        }
      ];
    });

    return {
      changes,
      id: `proposal-${Date.now()}`,
      mode,
      projectId: diagnostic.projectId,
      status: "pending",
      summary:
        changes.length > 0
          ? `Detected a rename request. I will only replace matching text from "${renameRequest.from}" to "${renameRequest.to}" and leave the structure untouched.`
          : `Detected a rename request, but I could not find "${renameRequest.from}" in the current project files. No file changes are proposed.`,
    };
  }

  if (decision.requestType === "image_fix") {
    const websiteContent = createStaticWebsiteContent(diagnostic.inferredDomain);
    const currentHtml = safeFileContent(workspace, "index.html", websiteContent.indexHtml);
    const imageSources = Array.from(websiteContent.indexHtml.matchAll(/<img\s+src="([^"]+)"/gi)).map(
      (match) => match[1]
    );
    let imageIndex = 0;
    const proposedHtml = currentHtml.includes("<img")
      ? currentHtml.replace(/<img([^>]*?)src="[^"]+"([^>]*?)>/gi, (match, before, after) => {
          const nextSource = imageSources[imageIndex % Math.max(1, imageSources.length)] ?? "";
          imageIndex += 1;

          return nextSource ? `<img${before}src="${nextSource}"${after}>` : match;
        })
      : websiteContent.indexHtml;
    const currentCss = safeFileContent(workspace, "styles.css", websiteContent.stylesCss);
    const imageCss = `

/* Hassali image safety: keep remote images responsive and cropped cleanly */
img {
  display: block;
  max-width: 100%;
  object-fit: cover;
}
`;

    return {
      changes: [
        {
          action: diagnostic.fileList.includes("index.html") ? "update" : "create",
          diffPreview: createDiffPreview(
            diagnostic.fileList.includes("index.html") ? "update" : "create",
            "index.html",
            proposedHtml
          ),
          path: "index.html",
          proposedContent: proposedHtml,
          summary: `Replaces broken or generic imagery with safe ${diagnostic.inferredDomain} image sources.`
        },
        {
          action: diagnostic.fileList.includes("styles.css") ? "update" : "create",
          diffPreview: createDiffPreview(
            diagnostic.fileList.includes("styles.css") ? "update" : "create",
            "styles.css",
            `${currentCss.trimEnd()}${imageCss}`
          ),
          path: "styles.css",
          proposedContent: `${currentCss.trimEnd()}${imageCss}`,
          summary: "Ensures images remain responsive and do not break the layout."
        },
        ...(mode === "EXECUTE"
          ? [
              {
                action: "reload_preview" as const,
                summary: "Reload the local preview after approved image fixes."
              }
            ]
          : [])
      ],
      id: `proposal-${Date.now()}`,
      mode,
      projectId: diagnostic.projectId,
      status: "pending",
      summary: `Detected an image fix request for a ${diagnostic.inferredDomain} project. I will update imagery only and avoid regenerating unrelated layout.`
    };
  }

  if (decision.requestType === "visual_theme_edit") {
    const themeEdit = extractThemeEdit(prompt);
    const targetColors = themeEdit.targetColors.length ? themeEdit.targetColors : intent.palette;
    const cssPaths = workspace.fileList.filter((path) => path.endsWith(".css"));
    const targetCssPaths = cssPaths.length ? cssPaths : ["styles.css"];
    const changes = targetCssPaths.map((path) => {
      const currentCss = contentForPath(workspace, path);
      const baseCss = currentCss.trim().length > 0
        ? currentCss
        : `:root {\n  --canvas: #ffffff;\n  --surface: rgba(255, 255, 255, 0.78);\n  --ink: #111827;\n  --accent: #db2777;\n  --accent-2: #f472b6;\n  --accent-soft: rgba(249, 168, 212, 0.34);\n}\n\n.button, button, a {\n  color: var(--accent);\n}\n`;
      const themed = applyThemeToCss(baseCss, targetColors, themeEdit.oldColor, themeEdit.fullTheme);
      const action = workspace.fileList.includes(path) ? ("update" as const) : ("create" as const);

      return {
        action,
        diffPreview: createDiffPreview(action, path, themed.css),
        path,
        proposedContent: themed.css,
        summary:
          themed.changedTokenCount > 0
            ? `Updates ${path} from ${themeEdit.oldColor ?? "the closest existing accent colors"} to ${targetColors.join(" and ")} across CSS tokens, accents, buttons, glows, and interactive color wells.`
            : `Applies ${targetColors.join(" and ")} theme tokens in ${path}; no exact ${themeEdit.oldColor ?? "old"} color token was found, so the closest palette variables are updated.`
      };
    });

    return {
      changes: [
        ...changes,
        ...(mode === "EXECUTE"
          ? [
              {
                action: "reload_preview" as const,
                summary: "Reload the local preview after the approved theme edit."
              }
            ]
          : [])
      ],
      id: `proposal-${Date.now()}`,
      mode,
      projectId: diagnostic.projectId,
      status: "pending",
      summary:
        `Detected a visual theme edit. I will preserve the current content/layout and change the CSS palette ` +
        `${themeEdit.oldColor ? `from ${themeEdit.oldColor} ` : ""}to ${targetColors.join(" and ")}.`
    };
  }

  if (
    isEnhancementRequest(prompt) &&
    decision.requestType !== "website_generation" &&
    decision.requestType !== "multi_page_generation"
  ) {
    const changes = createEnhancementChanges(prompt, workspace, diagnostic).map((change) => ({
      ...change,
      diffPreview: createDiffPreview(change.action, change.path, change.proposedContent)
    }));

    return {
      changes: [
        ...changes,
        ...(mode === "EXECUTE"
          ? [
              {
                action: shouldRestartPreview(prompt) ? ("restart_runtime" as const) : ("reload_preview" as const),
                summary: shouldRestartPreview(prompt)
                  ? "Restart the local static preview after the approved enhancement."
                  : "Reload the local preview after the approved enhancement."
              }
            ]
          : [])
      ],
      id: `proposal-${Date.now()}`,
      mode,
      projectId: diagnostic.projectId,
      status: "pending",
      summary: `Detected an existing ${diagnostic.inferredDomain} project. I will add targeted animation, carousel/slider support when requested, and Apple Glass-inspired polish without blanking or rewriting the whole site.`
    };
  }

  if (diagnostic.promptIntent === "animation_or_interaction") {
    const existingCss = diagnostic.keyFiles.stylesCss ?? "";
    const existingJs = diagnostic.keyFiles.mainJs ?? "";
    const hasMainJs = diagnostic.fileList.includes("main.js") || Boolean(diagnostic.keyFiles.mainJs);
    const animationCss = `

/* Hassali diagnostic polish: subtle ${diagnostic.inferredDomain} motion */
:where(.hero, .card, .product-card, .feature-card, .collection-card, .gallery-card) {
  transition: transform 220ms ease, border-color 220ms ease, box-shadow 220ms ease, opacity 220ms ease;
}

:where(.card, .product-card, .feature-card, .collection-card, .gallery-card):hover {
  transform: translateY(-4px);
  border-color: rgba(214, 177, 109, 0.42);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.24);
}

.hassali-reveal {
  opacity: 0;
  transform: translateY(14px);
  transition: opacity 520ms ease, transform 520ms ease;
}

.hassali-reveal.is-visible {
  opacity: 1;
  transform: translateY(0);
}
`;
    const animationJs = `

const revealTargets = document.querySelectorAll(".hero, section, .card, .product-card, .feature-card, .collection-card, .gallery-card");

if ("IntersectionObserver" in window) {
  revealTargets.forEach((element) => element.classList.add("hassali-reveal"));

  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.14 });

  revealTargets.forEach((element) => revealObserver.observe(element));
}
`;
    const changes: ProposalChange[] = [
      {
        action: diagnostic.fileList.includes("styles.css") ? "update" : "create",
        diffPreview: createDiffPreview(
          diagnostic.fileList.includes("styles.css") ? "update" : "create",
          "styles.css",
          `${existingCss.trimEnd()}${animationCss}`
        ),
        path: "styles.css",
        proposedContent: `${existingCss.trimEnd()}${animationCss}`,
        summary: `Adds subtle ${diagnostic.inferredDomain} hover and reveal motion without changing the page structure.`
      },
      {
        action: hasMainJs ? "update" : "create",
        diffPreview: createDiffPreview(
          hasMainJs ? "update" : "create",
          "main.js",
          `${existingJs.trimEnd()}${animationJs}`
        ),
        path: "main.js",
        proposedContent: `${existingJs.trimEnd()}${animationJs}`,
        summary: "Adds a tiny IntersectionObserver reveal behavior for existing sections and cards."
      }
    ];

    return {
      changes,
      id: `proposal-${Date.now()}`,
      mode,
      projectId: diagnostic.projectId,
      status: "pending",
      summary: `Detected a ${diagnostic.inferredDomain} project. I will add targeted CSS/JS animation polish while preserving the existing structure.`
    };
  }

  if (
    diagnostic.promptIntent === "small_style_improvement" &&
    diagnostic.keyFiles.stylesCss &&
    diagnostic.fileList.includes("styles.css")
  ) {
    const proposedContent = `${diagnostic.keyFiles.stylesCss.trimEnd()}

/* Hassali diagnostic polish: restrained premium refinement */
:where(a, button, .button, .btn) {
  transition: transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease;
}

:where(a, button, .button, .btn):hover {
  transform: translateY(-1px);
}

:where(.card, .product-card, .feature-card, .collection-card) {
  backdrop-filter: saturate(115%);
}
`;

    return {
      changes: [
        {
          action: "update",
          diffPreview: createDiffPreview("update", "styles.css", proposedContent),
          path: "styles.css",
          proposedContent,
          summary: "Refines existing styling with restrained premium hover states."
        }
      ],
      id: `proposal-${Date.now()}`,
      mode,
      projectId: diagnostic.projectId,
      status: "pending",
      summary: `Detected a ${diagnostic.inferredDomain} project. I will make a targeted style improvement in CSS without restructuring the site.`
    };
  }

  if (decision.requestType === "website_generation" || decision.requestType === "multi_page_generation" || (proposalContext?.mode === "WEBSITE" && proposalContext.websiteGenerationBrief)) {
    if (generatorContract?.contractBlocks.length) {
      return {
        changes: [],
        id: `proposal-${Date.now()}`,
        mode,
        projectId: diagnostic.projectId,
        proposalRoutingMode: "blocked",
        proposalRoutingReasons: generatorContract.contractBlocks.map((block) => ({
          code: "generator_contract_block",
          message: block,
          severity: "high"
        })),
        requiresExtraReview: true,
        shouldBlockExecution: true,
        status: "pending",
        summary: `Generator contract blocked local website generation: ${generatorContract.contractBlocks.join("; ")}.`
      };
    }

    const websiteComposition = compositionForCurrentWebsiteBrief(composition, proposalContext);
    const websiteGeneration = generatePlannedWebsiteFiles({
      composition: websiteComposition,
      generatorContract,
      intent,
      proposalContext
    });
    const websiteFiles = websiteGeneration.files;

    if (!websiteGeneration.validation.passed) {
      return {
        changes: [],
        id: `proposal-${Date.now()}`,
        mode,
        projectId: diagnostic.projectId,
        proposalRoutingMode: "blocked",
        proposalRoutingReasons: websiteGeneration.validation.blockedReasons.map((reason) => ({
          code: "website_validation_block",
          message: reason,
          severity: "high"
        })),
        requiresExtraReview: true,
        shouldBlockExecution: true,
        status: "pending",
        summary: `Website validator blocked local website generation: ${websiteGeneration.validation.blockedReasons.join("; ")}.`,
        designTokenCount: websiteGeneration.designTokenCount,
        designTokenTheme: websiteGeneration.designTokenTheme,
        designTokenValidationPassed: websiteGeneration.designTokenValidationPassed,
        memoryIgnoredForNewProject: true,
        plannerGeneratorAligned: websiteGeneration.plannerGeneratorAligned,
        sourceOfTruthDomain: websiteGeneration.sourceOfTruthDomain,
        sourceOfTruthPages: websiteGeneration.sourceOfTruthPages,
        sourceOfTruthPrompt: prompt,
        tokensStudioExportAvailable: websiteGeneration.tokensStudioExportAvailable,
        validatorPlanAligned: websiteGeneration.validatorPlanAligned,
        websiteAudience: websiteGeneration.plan.audience,
        websiteGoal: websiteGeneration.plan.goal,
        websiteIndustry: websiteGeneration.plan.industry,
        websiteLayoutType: websiteGeneration.plan.layoutType,
        websiteSectionCount: websiteGeneration.plan.requiredSections.length,
        websiteValidationPassed: false,
        websiteVisualStrategy: websiteGeneration.plan.visualStrategy
      };
    }

    const publicWebsiteFiles = Object.entries(websiteFiles)
      .filter(([path]) => path.toLowerCase().endsWith(".html"))
      .map(([, content]) => content.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<script[\s\S]*?<\/script>/gi, ""));
    const forbiddenHits = generatorContract
      ? generatorContract.forbiddenTerms.filter((term) =>
          !proposalContext?.requiredFiles.some((path) => path.toLowerCase().includes(term.toLowerCase())) &&
          !proposalContext?.pages.some((page) => page.toLowerCase() === term.toLowerCase()) &&
          !proposalContext?.websiteGenerationBrief?.ctaPatterns.some((cta) => cta.toLowerCase().includes(term.toLowerCase())) &&
          publicWebsiteFiles.some((content) => content.toLowerCase().includes(term.toLowerCase()))
        )
      : [];

    if (forbiddenHits.length > 0) {
      return {
        changes: [],
        id: `proposal-${Date.now()}`,
        mode,
        projectId: diagnostic.projectId,
        proposalRoutingMode: "blocked",
        proposalRoutingReasons: [{
          code: "generator_contract_block",
          message: `Generated content still contained forbidden terms: ${forbiddenHits.slice(0, 8).join(", ")}.`,
          severity: "high"
        }],
        requiresExtraReview: true,
        shouldBlockExecution: true,
        status: "pending",
        summary: `Generator contract blocked local website generation because forbidden terms remained in the proposed output: ${forbiddenHits.slice(0, 8).join(", ")}.`,
        designTokenCount: websiteGeneration.designTokenCount,
        designTokenTheme: websiteGeneration.designTokenTheme,
        designTokenValidationPassed: websiteGeneration.designTokenValidationPassed,
        memoryIgnoredForNewProject: true,
        plannerGeneratorAligned: websiteGeneration.plannerGeneratorAligned,
        sourceOfTruthDomain: websiteGeneration.sourceOfTruthDomain,
        sourceOfTruthPages: websiteGeneration.sourceOfTruthPages,
        sourceOfTruthPrompt: prompt,
        tokensStudioExportAvailable: websiteGeneration.tokensStudioExportAvailable,
        validatorPlanAligned: websiteGeneration.validatorPlanAligned,
        websiteAudience: websiteGeneration.plan.audience,
        websiteGoal: websiteGeneration.plan.goal,
        websiteIndustry: websiteGeneration.plan.industry,
        websiteLayoutType: websiteGeneration.plan.layoutType,
        websiteSectionCount: websiteGeneration.plan.requiredSections.length,
        websiteValidationPassed: false,
        websiteVisualStrategy: websiteGeneration.plan.visualStrategy
      };
    }
    const generatedFileNames = Object.keys(websiteFiles);
    const websiteBriefName = proposalContext?.websiteGenerationBrief?.displayName ?? websiteComposition.businessType;
    const standardFiles = Object.entries(websiteFiles).map(([path, content]) => ({
      content,
      path,
      summary:
        path === "styles.css"
          ? "Adds responsive premium styling for the static website."
          : path === "main.js"
            ? "Adds lightweight interactions for motion, hover polish, and reveal behavior."
            : `Creates the ${path.replace(".html", "")} page for the ${websiteBriefName} website.`
    }));
    const changes = [
      ...standardFiles.filter((file) => file.content.trim().length > 0).map((file) => ({
        action: diagnostic.fileList.includes(file.path) ? ("update" as const) : ("create" as const),
        path: file.path,
        proposedContent: file.content,
        summary: file.summary
      }))
    ];

    return {
      id: `proposal-${Date.now()}`,
      mode,
      projectId: diagnostic.projectId,
      status: "pending",
      summary:
        mode === "EXECUTE"
          ? hasStandardWebFiles(diagnostic.fileList)
            ? `Using contract-driven generation for ${websiteBriefName}. I will update ${generatedFileNames.join(", ")} and prepare the preview runtime.`
            : `Using contract-driven generation for ${websiteBriefName}. I will create ${generatedFileNames.join(", ")} and prepare the preview runtime.`
          : hasStandardWebFiles(diagnostic.fileList)
            ? `Using contract-driven generation for ${websiteBriefName}. I will update ${generatedFileNames.join(", ")}.`
            : `Using contract-driven generation for ${websiteBriefName}. I will create ${generatedFileNames.join(", ")}.`,
      websiteAudience: websiteGeneration.plan.audience,
      designTokenCount: websiteGeneration.designTokenCount,
      designTokenTheme: websiteGeneration.designTokenTheme,
      designTokenValidationPassed: websiteGeneration.designTokenValidationPassed,
      memoryIgnoredForNewProject: true,
      plannerGeneratorAligned: websiteGeneration.plannerGeneratorAligned,
      sourceOfTruthDomain: websiteGeneration.sourceOfTruthDomain,
      sourceOfTruthPages: websiteGeneration.sourceOfTruthPages,
      sourceOfTruthPrompt: prompt,
      tokensStudioExportAvailable: websiteGeneration.tokensStudioExportAvailable,
      validatorPlanAligned: websiteGeneration.validatorPlanAligned,
      websiteGoal: websiteGeneration.plan.goal,
      websiteIndustry: websiteGeneration.plan.industry,
      websiteLayoutType: websiteGeneration.plan.layoutType,
      websiteSectionCount: websiteGeneration.plan.requiredSections.length,
      websiteValidationPassed: websiteGeneration.validation.passed,
      websiteVisualStrategy: websiteGeneration.plan.visualStrategy,
      changes: [
        ...changes.map((change) => ({
          ...change,
          diffPreview: createDiffPreview(change.action, change.path, change.proposedContent)
        })),
        ...(mode === "EXECUTE" || shouldRestartPreview(prompt)
          ? [
              {
                action: "restart_runtime" as const,
                summary: "Restart the local static preview after files are approved."
              }
            ]
          : [])
      ]
    };
  }

  const targetPath = workspace.activePath || "notes.md";
  const action = workspace.fileList.includes(targetPath) ? "update" : "create";
  const proposedContent = `${workspace.activeFileContent.trimEnd()}\n\n// Hassali suggestion: ${prompt}\n`;

  return {
    id: `proposal-${Date.now()}`,
    mode,
    projectId: diagnostic.projectId,
    status: "pending",
    summary: `${action === "create" ? "Create" : "Update"} ${targetPath}.`,
    changes: [
      {
        action,
        path: targetPath,
        proposedContent,
        summary: "Adds a local suggestion note without changing files automatically.",
        diffPreview: createDiffPreview(action, targetPath, proposedContent)
      }
    ]
  };
}

function isDiffProposalPayload(value: unknown): value is DiffProposalPayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const payload = value as DiffProposalPayload;

  return (
    typeof payload.summary === "string" &&
    Array.isArray(payload.changes) &&
    payload.changes.every(
      (change) => {
        if (!change || typeof change !== "object" || typeof change.summary !== "string") {
          return false;
        }

        if (isRuntimeProposalAction(change.action)) {
          return true;
        }

        return (
          isFileProposalAction(change.action) &&
          typeof change.path === "string" &&
          typeof change.proposedContent === "string" &&
          (typeof change.diffPreview === "undefined" || typeof change.diffPreview === "string")
        );
      }
    )
  );
}

function parseDiffProposalContent(content: string) {
  const trimmedContent = content.trim();

  if (!trimmedContent) {
    return null;
  }

  const fencedJsonMatch = trimmedContent.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedJsonMatch?.[1]?.trim() ?? trimmedContent;

  try {
    const parsed = JSON.parse(candidate) as unknown;

    return isDiffProposalPayload(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function createResponseHeaders(sessionId?: string | null) {
  const headers: Record<string, string> = {
    "Cache-Control": "no-store",
    "Content-Type": "text/plain; charset=utf-8"
  };

  if (sessionId) {
    headers["x-hassali-chat-session-id"] = sessionId;
  }

  return headers;
}

function createTextStream(content: string, sessionId?: string | null, extraHeaders?: Record<string, string>) {
  const encoder = new TextEncoder();

  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(content));
        controller.close();
      }
    }),
    {
      headers: {
        ...createResponseHeaders(sessionId),
        ...(extraHeaders ?? {})
      }
    }
  );
}

async function createPersistenceContext(input: {
  mode: AiMode;
  projectId?: string | null;
  sessionId?: string | null;
}) {
  if (!input.projectId) {
    return null;
  }

  try {
    const { userId } = await auth();

    if (!userId) {
      console.info("chat persistence skipped", { reason: "no_clerk_user" });
      return null;
    }

    const context = await resolveChatPersistenceContext({
      externalUserId: userId,
      mode: input.mode,
      projectId: input.projectId,
      sessionId: input.sessionId ?? null
    });

    console.info("chat persistence context", {
      hasContext: Boolean(context),
      projectId: input.projectId,
      sessionId: context?.sessionId ?? null
    });

    return context satisfies ChatPersistenceContext | null;
  } catch (error) {
    console.error(
      "chat persistence context failed",
      error instanceof Error ? error.message : "Unknown error"
    );
    return null;
  }
}

async function persistChatMessage(
  context: ChatPersistenceContext | null,
  input: {
    content: string;
    metadata?: Record<string, unknown>;
    role: "user" | "assistant";
  }
) {
  if (!context || input.content.trim().length === 0) {
    console.info("chat message persistence skipped", {
      hasContext: Boolean(context),
      role: input.role
    });
    return context;
  }

  try {
    const saved = await saveChatMessage({
      content: input.content,
      metadata: input.metadata,
      mode: context.mode,
      projectId: context.projectId,
      role: input.role,
      sessionId: context.sessionId,
      userId: context.userId
    });

    console.info("chat message saved", {
      role: input.role,
      sessionId: saved.session.id
    });

    return {
      ...context,
      sessionId: saved.session.id
    };
  } catch (error) {
    console.error(
      "chat message save failed",
      error instanceof Error ? error.message : "Unknown error"
    );
    return context;
  }
}

function createProposalStream(proposal: DiffProposal, sessionId?: string | null) {
  const encoder = new TextEncoder();
  const visibleSummary =
    proposal.mode === "EXECUTE"
      ? "I prepared an execution proposal for review. Nothing runs until you approve it.\n\n"
      : "I prepared a diff proposal for review. It will only apply if you approve it.\n\n";
  const payload = `${proposalMarker}${JSON.stringify(proposal)}`;

  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(visibleSummary));
        controller.enqueue(encoder.encode(payload));
        controller.close();
      }
    }),
    {
      headers: createResponseHeaders(sessionId)
    }
  );
}

function createHassaliReadyPromptAnswer(input: {
  projectContract: ProjectContract | null;
  prompt: string;
  translatedIntent: TranslatedIntentSpec;
}) {
  if (!/\b(?:write|create|make|generate)\b[\s\S]{0,80}\bprompt\b/i.test(input.prompt)) {
    return null;
  }

  const source = buildWebsiteSourceOfTruth({
    contract: input.projectContract,
    prompt: input.prompt,
    translatedIntent: input.translatedIntent
  });
  const domain = source.businessType ?? input.translatedIntent.businessType ?? "brand";
  const isIceCream = input.translatedIntent.domain === "ice_cream" || /ice cream|gelato|scoops/i.test(input.prompt);
  const pages = source.pages.length
    ? source.pages
    : isIceCream
      ? ["home", "flavors", "about", "visit", "contact"]
      : ["home", "about", "contact"];
  const design = source.domain === "seafood_restaurant"
    ? "premium ocean-inspired dark design with deep navy, aqua/cyan highlights, pearl surfaces, elegant seafood photography intent, glass panels, and calm reservation-first hierarchy"
    : isIceCream
      ? "premium playful brand design with creamy pastels, rich contrast, flavor-forward cards, polished product photography intent, and clear store/order CTAs"
      : source.visualStrategy;
  const vocabulary = source.domain === "seafood_restaurant"
    ? "fresh catch, seasonal catch, oysters, lobster, grilled fish, chef sourcing, sustainability, ocean atmosphere, reservations, hours, location"
    : isIceCream
      ? "ice cream, gelato, scoops, flavors, cones, sundaes, family treats, seasonal specials, store visit, online order"
      : "domain-specific products or services, trust, conversion, visual identity, responsive layout";
  const primaryAction = isIceCream ? "order or visit the store" : "reservation";

  return `Here is a Hassali-ready WEBSITE mode prompt:

\`\`\`text
Build me a beautiful premium ${domain.toLowerCase()} website with exactly ${pages.length} pages: ${pages.join(", ")}.

Use this design direction:
- ${design}
- Use Hassali design tokens instead of random Tailwind values.
- Make the first screen immediately communicate the brand/domain, the offer, and the main CTA.

Required page behavior:
- Home: premium hero, signature offer, trust/atmosphere, ${primaryAction} CTA.
- Domain page(s): category cards, product/service highlights, pricing/details where useful, seasonal highlights.
- About: brand story, sourcing/craft, values, atmosphere.
- Visual page if requested: safe domain-specific visual grid with local-safe image markup.
- Contact/Visit: contact form, hours, location block, ${primaryAction} CTA.

Use this vocabulary and content direction:
- ${vocabulary}

Conversion goals:
- Encourage ${primaryAction}.
- Make offer exploration easy.
- Build trust through sourcing, reviews, hours, and location.

Forbidden mistakes:
- Do not generate products.html or collections.html unless I explicitly ask for ecommerce.
- Do not mention CRM, television, electronics, Local Service, generic services, or stale project memory.
- Do not use placeholder text like lorem ipsum, TODO, or generic internal generator phrases.
- Do not add upload features or fake image systems unless explicitly requested.
\`\`\``;
}

function compactIntelligenceKernel(kernel: IntelligenceKernelResult) {
  return {
    confidence: kernel.confidence,
    critiquePassed: kernel.critiqueResult.passed,
    routingDecision: kernel.routingDecision,
    riskLevel: kernel.riskAssessment.riskLevel,
    shouldProceed: kernel.shouldProceed,
    summary: kernel.summary,
    verificationChecks: kernel.verificationPlan.checks
  };
}

function compactTranslatedIntent(translatedIntent: TranslatedIntentSpec) {
  return {
    businessType: translatedIntent.businessType,
    confidence: translatedIntent.confidence,
    constraints: translatedIntent.constraints,
    country: translatedIntent.country,
    domain: translatedIntent.domain,
    extractedEntities: translatedIntent.extractedEntities,
    features: translatedIntent.requestedFeatures,
    mode: translatedIntent.mode,
    pages: translatedIntent.pages,
    status: translatedIntent.confidence >= 0.55 ? "available" : "low_confidence",
    style: translatedIntent.style,
    theme: translatedIntent.theme,
    vibe: translatedIntent.vibe,
    visualLanguage: translatedIntent.visualLanguage
  };
}

function compactBusinessBlueprint(blueprint: BusinessBlueprint) {
  return {
    acceptanceChecks: blueprint.acceptanceChecks,
    blueprintId: blueprint.blueprintId,
    blueprintKind: blueprint.blueprintKind,
    blueprintName: blueprint.blueprintName,
    blueprintStatus: blueprint.blueprintStatus,
    confidence: blueprint.confidence,
    dataEntities: blueprint.dataEntities,
    fileStrategy: blueprint.fileStrategy,
    integrations: blueprint.integrations,
    matchedDomain: blueprint.matchedDomain,
    mustAvoid: blueprint.mustAvoid,
    mustInclude: blueprint.mustInclude,
    previewType: blueprint.previewType,
    requiredComponents: blueprint.requiredComponents,
    requiredCopyBlocks: blueprint.requiredCopyBlocks,
    screens: blueprint.screens,
    sections: blueprint.sections
  };
}

function compactContextPriority(contextPriority: ContextPriorityResult) {
  return {
    authoritativeBusinessType: contextPriority.authoritativeBusinessType,
    authoritativeConstraints: contextPriority.authoritativeConstraints,
    authoritativeDomain: contextPriority.authoritativeDomain,
    authoritativeFeatures: contextPriority.authoritativeFeatures,
    authoritativeIntentFamily: contextPriority.authoritativeIntentFamily,
    authoritativeMode: contextPriority.authoritativeMode,
    authoritativePreviewType: contextPriority.authoritativePreviewType,
    confidence: contextPriority.confidence,
    conflictCount: contextPriority.conflicts.length,
    conflicts: contextPriority.conflicts,
    priorityNotes: contextPriority.priorityNotes,
    priorityStatus: contextPriority.priorityStatus,
    suppressedContextCount: contextPriority.suppressedContext.length,
    suppressedContext: contextPriority.suppressedContext
  };
}

function compactTaskDecomposition(decomposition: TaskDecomposition) {
  return {
    blockedUntil: decomposition.blockedUntil,
    confidence: decomposition.confidence,
    decompositionId: decomposition.decompositionId,
    decompositionStatus: decomposition.decompositionStatus,
    dependencies: decomposition.dependencies,
    executionStrategy: decomposition.executionStrategy,
    fileTargets: decomposition.fileTargets,
    milestoneCount: decomposition.milestones.length,
    milestones: decomposition.milestones,
    orderedTasks: decomposition.orderedTasks,
    recommendedPhasePolicy: decomposition.recommendedPhasePolicy,
    riskNotes: decomposition.riskNotes,
    taskKind: decomposition.taskKind,
    validationChecks: decomposition.validationChecks
  };
}

function compactExecutionPlan(executionPlan: ExecutionPlan) {
  return {
    approvalCheckpoints: executionPlan.approvalCheckpoints,
    blockers: executionPlan.blockers,
    completionChecks: executionPlan.completionChecks,
    confidence: executionPlan.confidence,
    executionMode: executionPlan.executionMode,
    executionPlanId: executionPlan.executionPlanId,
    executionPlanStatus: executionPlan.executionPlanStatus,
    executionStageCount: executionPlan.executionStages.length,
    executionStages: executionPlan.executionStages,
    executionStrategy: executionPlan.executionStrategy,
    parallelTasks: executionPlan.parallelTasks,
    prerequisites: executionPlan.prerequisites,
    recommendedExecutionPolicy: executionPlan.recommendedExecutionPolicy,
    riskLevel: executionPlan.riskLevel,
    rollbackChecks: executionPlan.rollbackChecks,
    sequentialTasks: executionPlan.sequentialTasks
  };
}

function compactCompositionPlan(compositionPlan: CompositionPlan) {
  return {
    acceptanceChecks: compositionPlan.acceptanceChecks,
    assetIntent: compositionPlan.assetIntent,
    authoritativeDomain: compositionPlan.authoritativeDomain,
    compositionId: compositionPlan.compositionId,
    compositionKind: compositionPlan.compositionKind,
    compositionStatus: compositionPlan.compositionStatus,
    compositionWarnings: compositionPlan.compositionWarnings,
    confidence: compositionPlan.confidence,
    contentAngles: compositionPlan.contentAngles,
    forbiddenSections: compositionPlan.forbiddenSections,
    globalSections: compositionPlan.globalSections,
    layoutIntent: compositionPlan.layoutIntent,
    optionalSections: compositionPlan.optionalSections,
    pageCount: compositionPlan.pageCount,
    pagePlans: compositionPlan.pagePlans,
    primaryCTA: compositionPlan.primaryCTA,
    productOrServiceEntities: compositionPlan.productOrServiceEntities,
    requiredSections: compositionPlan.requiredSections,
    secondaryCTA: compositionPlan.secondaryCTA,
    trustSignals: compositionPlan.trustSignals,
    visualIntent: compositionPlan.visualIntent
  };
}

function compactPreviewClassification(previewRuntime: PreviewRuntimeResult) {
  return {
    confidence: previewRuntime.classification.confidence,
    previewType: previewRuntime.classification.previewType,
    reason: previewRuntime.classification.reason,
    rendererId: previewRuntime.registryEntry.rendererId,
    signals: previewRuntime.classification.signals
  };
}

function compactPreviewRuntime(previewRuntime: PreviewRuntimeResult) {
  return {
    capabilities: previewRuntime.capabilities,
    classification: compactPreviewClassification(previewRuntime),
    metadata: previewRuntime.metadata,
    realPreview: previewRuntime.realPreview,
    state: previewRuntime.state,
    warnings: previewRuntime.warnings
  };
}

function buildProposalPreviewRuntime(
  proposal: DiffProposal,
  productMode: "ASK" | "CODE" | "WEBSITE",
  projectType?: string | null
) {
  return buildPreviewRuntime({
    generatedFiles: proposedFilesFromChanges(proposal.changes),
    productMode,
    projectType,
    proposal: {
      appPreview: proposal.appPreview,
      changes: proposal.changes,
      previewType: proposal.previewType,
      summary: proposal.summary
    }
  });
}

function isPythonCodePreviewContext(context?: ProposalContext) {
  return context?.mode === "CODE" && (
    context.framework === "python_streamlit" ||
    context.runtimeType === "python" ||
    context.previewType === "python_app_preview" ||
    context.codeGenerationBrief?.preferredFramework === "streamlit" ||
    context.codeGenerationBrief?.requestedStack === "python"
  );
}

function normalizeProposalPreviewMetadata(
  metadata: PreviewRuntimeResult["metadata"],
  productMode: "ASK" | "CODE" | "WEBSITE",
  proposalContext?: ProposalContext
): Record<string, unknown> {
  if (productMode === "CODE" && !isPythonCodePreviewContext(proposalContext)) {
    return {
      ...(metadata as Record<string, unknown>),
      activeMode: "CODE",
      entryPoint: "src/main.tsx",
      framework: "react_vite",
      previewType: "code_app_preview",
      runtimePolicy: "explicit_enablement_required"
    };
  }

  if (productMode !== "CODE" || !isPythonCodePreviewContext(proposalContext)) {
    return metadata as Record<string, unknown>;
  }

  const executablePreview = metadata.executablePreview
    ? {
        ...metadata.executablePreview,
        canExecuteNow: false,
        commandPlan: {
          ...metadata.executablePreview.commandPlan,
          defaultPort: null,
          devCommand: null,
          renderMode: "none"
        },
        framework: "python_streamlit",
        renderUrl: null,
        warnings: ["Python app preview is summary-only. Hassali did not install packages or start Streamlit."]
      }
    : undefined;

  return {
    ...metadata,
    activeMode: "CODE",
    entryPoint: "app.py",
    executablePreview,
    framework: "python_streamlit",
    previewType: "python_app_preview",
    runtimePolicy: "summary_only"
  };
}

function compactDomainValidation(domainValidation: DomainValidationResult) {
  return {
    acceptanceChecks: domainValidation.acceptanceChecks,
    authoritativeDomain: domainValidation.authoritativeDomain,
    confidence: domainValidation.confidence,
    detectedContractContamination: domainValidation.detectedContractContamination,
    detectedDomainDrift: domainValidation.detectedDomainDrift,
    detectedForbiddenSignals: domainValidation.detectedForbiddenSignals,
    detectedGenericCopy: domainValidation.detectedGenericCopy,
    detectedModeDrift: domainValidation.detectedModeDrift,
    detectedPreviewDrift: domainValidation.detectedPreviewDrift,
    expectedSignals: domainValidation.expectedSignals,
    fileStrategyIssues: domainValidation.fileStrategyIssues,
    forbiddenSignals: domainValidation.forbiddenSignals,
    missingSignals: domainValidation.missingSignals,
    pageIssues: domainValidation.pageIssues,
    repairHints: domainValidation.repairHints,
    requiredSignals: domainValidation.requiredSignals,
    sectionIssues: domainValidation.sectionIssues,
    severity: domainValidation.severity,
    shouldBlockProposal: domainValidation.shouldBlockProposal,
    validationId: domainValidation.validationId,
    validationMode: domainValidation.validationMode,
    validationScore: domainValidation.validationScore,
    validationStatus: domainValidation.validationStatus
  };
}

function compactProposalQualityGate(qualityGate: ProposalQualityGateResult) {
  return {
    approvalDisabled: qualityGate.approvalDisabled,
    approvalRecommendation: qualityGate.approvalRecommendation,
    blocks: qualityGate.blocks,
    completenessScore: qualityGate.completenessScore,
    confidence: qualityGate.confidence,
    contentScore: qualityGate.contentScore,
    fakeContentDetected: qualityGate.fakeContentDetected,
    failures: qualityGate.failures,
    loremDetected: qualityGate.loremDetected,
    missingContact: qualityGate.missingContact,
    missingCTA: qualityGate.missingCTA,
    missingEntities: qualityGate.missingEntities,
    missingFooter: qualityGate.missingFooter,
    missingHero: qualityGate.missingHero,
    missingModules: qualityGate.missingModules,
    missingNavigation: qualityGate.missingNavigation,
    missingPages: qualityGate.missingPages,
    missingSections: qualityGate.missingSections,
    missingTrustSignals: qualityGate.missingTrustSignals,
    placeholderDetected: qualityGate.placeholderDetected,
    qualityId: qualityGate.qualityId,
    qualityScore: qualityGate.qualityScore,
    qualityStatus: qualityGate.qualityStatus,
    repeatedContentDetected: qualityGate.repeatedContentDetected,
    repairHints: qualityGate.repairHints,
    requiredChecks: qualityGate.requiredChecks,
    structureScore: qualityGate.structureScore,
    todoDetected: qualityGate.todoDetected,
    warnings: qualityGate.warnings
  };
}

function compactAssetVisualValidation(assetValidation: AssetVisualValidationResult) {
  return {
    acceptanceChecks: assetValidation.acceptanceChecks,
    allowedAssetCategories: assetValidation.allowedAssetCategories,
    assetDriftDetected: assetValidation.assetDriftDetected,
    assetScore: assetValidation.assetScore,
    assetValidationId: assetValidation.assetValidationId,
    assetValidationStatus: assetValidation.assetValidationStatus,
    blockedAssetCategories: assetValidation.blockedAssetCategories,
    confidence: assetValidation.confidence,
    detectedVisualSignals: assetValidation.detectedVisualSignals,
    expectedVisualSignals: assetValidation.expectedVisualSignals,
    galleryAssetMismatch: assetValidation.galleryAssetMismatch,
    heroAssetMismatch: assetValidation.heroAssetMismatch,
    logoMismatch: assetValidation.logoMismatch,
    mismatchedAssets: assetValidation.mismatchedAssets,
    missingAssets: assetValidation.missingAssets,
    placeholderOnlyVisualDetected: assetValidation.placeholderOnlyVisualDetected,
    productAssetMismatch: assetValidation.productAssetMismatch,
    repairHints: assetValidation.repairHints,
    shouldBlockVisualApproval: assetValidation.shouldBlockVisualApproval,
    visualBlocks: assetValidation.visualBlocks,
    visualDriftDetected: assetValidation.visualDriftDetected,
    visualFailures: assetValidation.visualFailures,
    visualScore: assetValidation.visualScore,
    visualValidationStatus: assetValidation.visualValidationStatus,
    visualWarnings: assetValidation.visualWarnings
  };
}

function compactProposalRepair(repair: ProposalRepairResult) {
  return {
    originalBlockReasons: repair.originalBlockReasons,
    repairActions: repair.repairActions,
    repairApplied: repair.repairApplied,
    repairAttempted: repair.repairAttempted,
    repairConfidence: repair.repairConfidence,
    repairId: repair.repairId,
    repairSeverity: repair.repairSeverity,
    repairStatus: repair.repairStatus,
    repairStrategy: repair.repairStrategy,
    repairWarnings: repair.repairWarnings,
    revalidationPassed: repair.revalidationPassed,
    revalidationRequired: repair.revalidationRequired,
    shouldKeepBlocked: repair.shouldKeepBlocked,
    shouldPresentRepairedProposal: repair.shouldPresentRepairedProposal,
    unresolvedIssues: repair.unresolvedIssues
  };
}

function compactSelfReview(review: SelfReviewReport) {
  return {
    reviewId: review.reviewId,
    reviewer: review.reviewer,
    mode: review.mode,
    overallStatus: review.overallStatus,
    confidence: review.confidence,
    passed: review.passed,
    warningCount: review.warnings.length,
    failureCount: review.failures.length,
    recommendations: review.recommendations,
    scores: review.scores,
    topIssues: [...review.failures, ...review.warnings].slice(0, 3).map((issue) => ({
      category: issue.category,
      description: issue.description,
      id: issue.id,
      recommendedFix: issue.recommendedFix,
      ruleId: issue.ruleId,
      severity: issue.severity,
      title: issue.title
    })),
    metrics: review.metrics,
    timestamp: review.timestamp,
    reviewerReports: review.reviewerReports?.map((report) => ({
      reviewId: report.reviewId,
      reviewer: report.reviewer,
      overallStatus: report.overallStatus,
      confidence: report.confidence,
      warningCount: report.warnings.length,
      failureCount: report.failures.length,
      metrics: report.metrics
    }))
  };
}

function compactGeneratorContract(generatorContract: GeneratorContract) {
  return {
    acceptanceChecks: generatorContract.acceptanceChecks,
    authoritativeBusinessType: generatorContract.authoritativeBusinessType,
    authoritativeDomain: generatorContract.authoritativeDomain,
    confidence: generatorContract.confidence,
    contractBlocks: generatorContract.contractBlocks,
    contractId: generatorContract.contractId,
    contractStatus: generatorContract.contractStatus,
    contractWarnings: generatorContract.contractWarnings,
    copyRules: generatorContract.copyRules,
    forbiddenFileStrategies: generatorContract.forbiddenFileStrategies,
    forbiddenSections: generatorContract.forbiddenSections,
    forbiddenTerms: generatorContract.forbiddenTerms,
    generatorMode: generatorContract.generatorMode,
    modeRules: generatorContract.modeRules,
    pageRules: generatorContract.pageRules,
    regenerationRules: generatorContract.regenerationRules,
    requiredCopySignals: generatorContract.requiredCopySignals,
    requiredEntities: generatorContract.requiredEntities,
    requiredFileStrategy: generatorContract.requiredFileStrategy,
    requiredPageCount: generatorContract.requiredPageCount,
    requiredPages: generatorContract.requiredPages,
    requiredSections: generatorContract.requiredSections,
    requiredVisualSignals: generatorContract.requiredVisualSignals,
    visualRules: generatorContract.visualRules
  };
}

function compactProposalRouting(
  kernel: IntelligenceKernelResult,
  routing: ProposalRoutingDecision
) {
  return {
    intelligenceKernelSummary: kernel.summary,
    kernelRoutingDecision: kernel.routingDecision,
    proposalRoutingMode: routing.mode,
    proposalRoutingReasons: routing.reasons,
    proposalRoutingWarnings: routing.warnings,
    requiresExtraReview: routing.shouldRequireExtraReview,
    shouldBlockExecution: routing.shouldBlockExecution
  };
}

function intentRoutingWarnings(
  intent: IntentIntelligence,
  composition: CompositionStrategy,
  prompt?: string
): ProposalRoutingWarning[] {
  const warnings: ProposalRoutingWarning[] = [];
  const blueprint = composition.businessType.toLowerCase();
  const promptText = prompt?.toLowerCase() ?? "";

  if (intent.pageConflict) {
    warnings.push({
      code: "page_count_conflict",
      message: `${intent.pageConflict.resolution} Stated count: ${intent.pageConflict.statedPageCount}; listed pages: ${intent.requestedPages.join(", ")}.`,
      risk: "medium"
    });
  }

  if (blueprint.includes("ambiguous rider") || intent.domain === "bike shop") {
    warnings.push({
      code: "ambiguous_bike_domain",
      message: "Bike can mean bicycle or motorbike. This proposal keeps bike-shop wording balanced unless the user clarifies.",
      risk: "medium"
    });
  }

  if (
    promptText.match(/\b(?:image|images|photo|photos)\s+of\s+(bike|bicycle|motorbike|motorcycle)\b/) &&
    (blueprint.includes("perfume") || blueprint.includes("fragrance"))
  ) {
    warnings.push({
      code: "image_domain_mismatch",
      message: "The image request mentions bikes, but the detected business is perfume/fragrance. This proposal uses fragrance visuals and should be reviewed before approval.",
      risk: "medium"
    });
  }

  return warnings;
}

function attachProposalRoutingMetadata(
  proposal: DiffProposal,
  kernel: IntelligenceKernelResult,
  routing: ProposalRoutingDecision,
  intent?: IntentIntelligence,
  composition?: CompositionStrategy,
  prompt?: string,
  translatedIntent?: TranslatedIntentSpec,
  blueprint?: BusinessBlueprint,
  contextPriority?: ContextPriorityResult,
  decomposition?: TaskDecomposition,
  executionPlan?: ExecutionPlan,
  compositionPlan?: CompositionPlan,
  domainValidation?: DomainValidationResult,
  generatorContract?: GeneratorContract,
  proposalContext?: ProposalContext
): DiffProposal {
  const extraWarnings = intent && composition ? intentRoutingWarnings(intent, composition, prompt) : [];
  const detectedDomain = translatedIntent?.businessType ?? composition?.businessType ?? intent?.domain;
  const domainSource =
    translatedIntent?.domain
      ? "current_user_prompt"
      : intent?.domain && intent.domain !== "generic website"
      ? "current_user_prompt"
      : detectedDomain
        ? "inferred"
        : "unknown";
  const previewRuntime = buildPreviewRuntime({
    generatedFiles: proposedFilesFromChanges(proposal.changes),
    productMode: kernel.routingDecision.mode,
    projectType: contextPriority?.authoritativeIntentFamily ?? blueprint?.blueprintKind ?? null,
    proposal: {
      appPreview: proposal.appPreview,
      changes: proposal.changes,
      previewType: proposal.previewType,
      summary: proposal.summary
    },
    runtimeMetadata: {
      authoritativePreviewType: contextPriority?.authoritativePreviewType,
      blueprintPreviewType: blueprint?.previewType
    }
  });
  const previewMetadata = normalizeProposalPreviewMetadata(
    previewRuntime.metadata,
    kernel.routingDecision.mode,
    proposalContext
  );
  const mergedPreviewMetadata = proposalContext?.mode === "CODE" && proposal.previewMetadata?.productPreview
    ? {
        ...previewMetadata,
        productPreview: proposal.previewMetadata.productPreview
      }
    : previewMetadata;
  const criticalRoutingReasons = routing.reasons.filter((reason) =>
    reason.code === "welcome_ts_pollution" ||
    reason.message.toLowerCase().includes("cross-project") ||
    reason.message.toLowerCase().includes("another project") ||
    reason.message.toLowerCase().includes("project isolation")
  );
  const routingMode: ProposalRoutingMode = criticalRoutingReasons.length > 0
    ? "blocked"
    : routing.mode === "blocked"
      ? "review_required"
      : routing.mode;
  const routingShouldBlock = criticalRoutingReasons.length > 0;

  return {
    ...proposal,
    ...compactProposalRouting(kernel, {
      ...routing,
      mode: routingMode,
      reasons: criticalRoutingReasons.length > 0 ? routing.reasons : routing.reasons.map((reason) => ({
        ...reason,
        severity: reason.severity === "high" ? "medium" : reason.severity
      })),
      shouldBlockExecution: routingShouldBlock,
      shouldRequireExtraReview: routing.shouldRequireExtraReview || routing.mode === "blocked"
    }),
    blueprintConfidence: blueprint?.confidence,
    blueprintId: blueprint?.blueprintId,
    blueprintKind: blueprint?.blueprintKind,
    blueprintName: blueprint?.blueprintName,
    blueprintPreviewType: blueprint?.previewType,
    blueprintStatus: blueprint?.blueprintStatus,
    authoritativeDomain: contextPriority?.authoritativeDomain,
    authoritativeIntentFamily: contextPriority?.authoritativeIntentFamily,
    authoritativeMode: contextPriority?.authoritativeMode,
    authoritativePreviewType: contextPriority?.authoritativePreviewType,
    contextConflictCount: contextPriority?.conflicts.length,
    contextPriorityStatus: contextPriority?.priorityStatus,
    contradictionStatus: "clear",
    compositionEntityCount: compositionPlan?.productOrServiceEntities.length,
    compositionId: compositionPlan?.compositionId,
    compositionKind: compositionPlan?.compositionKind,
    compositionPageCount: compositionPlan?.pageCount,
    compositionRequiredSectionCount: compositionPlan?.requiredSections.length,
    compositionStatus: compositionPlan?.compositionStatus,
    compositionWarningCount: compositionPlan?.compositionWarnings.length,
    decompositionId: decomposition?.decompositionId,
    decompositionStatus: decomposition?.decompositionStatus,
    detectedDomain,
    domainDriftDetected: domainValidation ? domainValidation.detectedDomainDrift.length > 0 : undefined,
    domainConfidence: translatedIntent?.confidence ?? intent?.confidence,
    domainSource,
    domainValidationScore: domainValidation?.validationScore,
    domainValidationSeverity: domainValidation?.severity,
    domainValidationStatus: domainValidation?.validationStatus,
    executionMode: executionPlan?.executionMode,
    executionPlanId: executionPlan?.executionPlanId,
    executionPlanStatus: executionPlan?.executionPlanStatus,
    executionRiskLevel: executionPlan?.riskLevel,
    executionStageCount: executionPlan?.executionStages.length,
    intentConfidence: translatedIntent?.confidence,
    intentTranslationStatus: translatedIntent
      ? translatedIntent.confidence >= 0.55
        ? "available"
        : "low_confidence"
      : "unavailable",
    modeObedienceStatus: "obeyed",
    genericCopyDetected: domainValidation ? domainValidation.detectedGenericCopy.length > 0 : undefined,
    generatorContractBlockCount: generatorContract?.contractBlocks.length,
    generatorContractId: generatorContract?.contractId,
    generatorContractStatus: generatorContract?.contractStatus,
    generatorContractWarningCount: generatorContract?.contractWarnings.length,
    generatorForbiddenTermCount: generatorContract?.forbiddenTerms.length,
    generatorMode: generatorContract?.generatorMode,
    generatorRequiredSectionCount: generatorContract?.requiredSections.length,
    modeDriftDetected: domainValidation ? domainValidation.detectedModeDrift.length > 0 : undefined,
    previewCapabilities: previewRuntime.capabilities,
    previewClassification: compactPreviewClassification(previewRuntime),
    previewConfidence: previewRuntime.classification.confidence,
    previewMetadata: mergedPreviewMetadata,
    previewMode: previewRuntime.classification.previewType === "none"
      ? "answer_only"
      : previewRuntime.classification.previewType === "website"
        ? "static_preview"
        : "code_plan",
    previewRuntimeState: previewRuntime.state,
    previewType: proposalContext?.mode === "CODE" && proposal.previewType === "code_app_preview"
      ? "code_app_preview"
      : previewRuntime.classification.previewType,
    previewWarnings: previewRuntime.warnings,
    realPreview: previewRuntime.realPreview,
    proposalRoutingWarnings: [...routing.warnings, ...extraWarnings],
    previewDriftDetected: domainValidation ? domainValidation.detectedPreviewDrift.length > 0 : undefined,
    requiredPageCount: generatorContract?.requiredPageCount,
    memoryIgnoredForNewProject: proposalContext?.isNewBuild,
    sourceOfTruthDomain: proposalContext?.domain ?? proposal.sourceOfTruthDomain,
    sourceOfTruthPages: proposalContext?.pages.length ? proposalContext.pages : proposal.sourceOfTruthPages,
    sourceOfTruthPrompt: proposalContext?.sourcePrompt ?? proposal.sourceOfTruthPrompt,
    publicCopyCleanStatus: "clean",
    proposalRoutingMode:
      extraWarnings.length > 0 && routing.mode === "normal" ? "review_required" : routing.mode,
    requiresExtraReview: routing.shouldRequireExtraReview || extraWarnings.length > 0,
    sectionCopyQualityStatus: "clean",
    staleTermScanStatus: "clean",
    suppressedContextCount: contextPriority?.suppressedContext.length,
    translatedBusinessType: translatedIntent?.businessType,
    translatedDomain: translatedIntent?.domain,
    translatedFeatures: translatedIntent?.requestedFeatures,
    translatedStyle: translatedIntent?.style,
    validationIssueCount: domainValidation
      ? domainValidation.detectedDomainDrift.length +
        domainValidation.detectedModeDrift.length +
        domainValidation.detectedPreviewDrift.length +
        domainValidation.detectedGenericCopy.length +
        domainValidation.fileStrategyIssues.length +
        domainValidation.pageIssues.length +
        domainValidation.sectionIssues.length
      : undefined,
    executionStrategy: executionPlan?.executionStrategy ?? decomposition?.executionStrategy,
    milestoneCount: decomposition?.milestones.length,
    recommendedExecutionPolicy: executionPlan?.recommendedExecutionPolicy,
    recommendedPhasePolicy: decomposition?.recommendedPhasePolicy,
    taskKind: decomposition?.taskKind
  };
}

function applyPromptAcceptanceMetadata(
  proposal: DiffProposal,
  acceptance: PromptAcceptanceResult
): DiffProposal {
  const acceptanceWarnings: ProposalRoutingWarning[] = acceptance.warnings.map((warning) => ({
    code: "prompt_sovereignty_warning",
    message: warning,
    risk: "medium"
  }));
  const acceptanceReasons: ProposalRoutingReason[] = acceptance.issues.map((issue) => ({
    code: "prompt_sovereignty_block",
    message: issue,
    severity: "high"
  }));

  return {
    ...proposal,
    blockedReason: acceptance.blocked ? acceptance.issues.join("; ") : proposal.blockedReason,
    contradictionStatus: acceptance.blocked
      ? "blocked"
      : acceptance.mode === "review_required"
        ? "review_required"
        : proposal.contradictionStatus ?? "clear",
    modeObedienceStatus: acceptance.blocked
      ? "blocked"
      : acceptance.mode === "review_required"
        ? "review_required"
        : proposal.modeObedienceStatus ?? "obeyed",
    publicCopyCleanStatus: acceptance.blocked
      ? "blocked"
      : acceptance.mode === "review_required"
        ? "review_required"
        : proposal.publicCopyCleanStatus ?? "clean",
    proposalRoutingMode: acceptance.blocked
      ? "blocked"
      : acceptance.mode === "review_required" && proposal.proposalRoutingMode === "normal"
        ? "review_required"
        : proposal.proposalRoutingMode,
    proposalRoutingReasons: [
      ...(proposal.proposalRoutingReasons ?? []),
      ...acceptanceReasons
    ],
    proposalRoutingWarnings: [
      ...(proposal.proposalRoutingWarnings ?? []),
      ...acceptanceWarnings
    ],
    requiresExtraReview:
      proposal.requiresExtraReview || acceptance.mode === "review_required" || acceptance.blocked,
    sectionCopyQualityStatus: acceptance.blocked
      ? "blocked"
      : acceptance.mode === "review_required"
        ? "review_required"
        : proposal.sectionCopyQualityStatus ?? "clean",
    shouldBlockExecution: proposal.shouldBlockExecution || acceptance.blocked,
    staleTermScanStatus: acceptance.blocked
      ? "blocked"
      : acceptance.mode === "review_required"
        ? "review_required"
        : proposal.staleTermScanStatus ?? "clean",
    summary:
      acceptance.blocked
        ? `${proposal.summary} Prompt sovereignty blocked this proposal: ${acceptance.issues.join("; ")}.`
        : proposal.summary
  };
}

function applyDomainValidationMetadata(
  proposal: DiffProposal,
  validation: DomainValidationResult
): DiffProposal {
  const reasons: ProposalRoutingReason[] = validation.shouldBlockProposal
    ? [
        {
          code: "domain_validation_block",
          message: [
            ...validation.detectedDomainDrift,
            ...validation.detectedModeDrift,
            ...validation.fileStrategyIssues,
            ...validation.detectedGenericCopy
          ].join("; ") || "Domain validation blocked this proposal.",
          severity: "high"
        }
      ]
    : [];
  const warnings: ProposalRoutingWarning[] = validation.validationStatus === "review_required"
    ? validation.repairHints.map((hint) => ({
        code: "domain_validation_warning",
        message: hint,
        risk: "medium"
      }))
    : [];

  return {
    ...proposal,
    blockedReason: validation.shouldBlockProposal
      ? validation.repairHints.join("; ") || "Domain validation blocked this proposal."
      : proposal.blockedReason,
    contradictionStatus: validation.shouldBlockProposal
      ? "blocked"
      : validation.validationStatus === "review_required"
        ? "review_required"
        : proposal.contradictionStatus,
    domainDriftDetected: validation.detectedDomainDrift.length > 0,
    domainValidationScore: validation.validationScore,
    domainValidationSeverity: validation.severity,
    domainValidationStatus: validation.validationStatus,
    genericCopyDetected: validation.detectedGenericCopy.length > 0,
    modeDriftDetected: validation.detectedModeDrift.length > 0,
    previewDriftDetected: validation.detectedPreviewDrift.length > 0,
    proposalRoutingMode: validation.shouldBlockProposal
      ? "blocked"
      : validation.validationStatus === "review_required" && proposal.proposalRoutingMode === "normal"
        ? "review_required"
        : proposal.proposalRoutingMode,
    proposalRoutingReasons: [...(proposal.proposalRoutingReasons ?? []), ...reasons],
    proposalRoutingWarnings: [...(proposal.proposalRoutingWarnings ?? []), ...warnings],
    requiresExtraReview: proposal.requiresExtraReview || validation.validationStatus !== "passed",
    shouldBlockExecution: proposal.shouldBlockExecution || validation.shouldBlockProposal,
    validationIssueCount:
      validation.detectedDomainDrift.length +
      validation.detectedModeDrift.length +
      validation.detectedPreviewDrift.length +
      validation.detectedGenericCopy.length +
      validation.fileStrategyIssues.length +
      validation.pageIssues.length +
      validation.sectionIssues.length,
    summary: validation.shouldBlockProposal
      ? `${proposal.summary} Domain validation blocked this proposal: ${reasons[0]?.message ?? "domain drift detected"}.`
      : proposal.summary
  };
}

function applyProposalQualityMetadata(
  proposal: DiffProposal,
  qualityGate: ProposalQualityGateResult
): DiffProposal {
  const reasons: ProposalRoutingReason[] = qualityGate.blocks.map((block) => ({
    code: "proposal_quality_block",
    message: `${block.message} ${block.evidence}`.trim(),
    severity: "high"
  }));
  const warnings: ProposalRoutingWarning[] = [
    ...qualityGate.failures,
    ...qualityGate.warnings
  ].map((item) => ({
    code: "proposal_quality_warning",
    message: `${item.message} ${item.repairHint}`.trim(),
    risk: item.severity === "failure" ? "high" : "medium"
  }));

  return {
    ...proposal,
    approvalRecommendation: qualityGate.approvalRecommendation,
    blockedReason: qualityGate.approvalDisabled
      ? qualityGate.repairHints.join("; ") || "Proposal quality gate blocked this proposal."
      : proposal.blockedReason,
    completenessScore: qualityGate.completenessScore,
    contentScore: qualityGate.contentScore,
    fakeContentDetected: qualityGate.fakeContentDetected,
    loremDetected: qualityGate.loremDetected,
    placeholderDetected: qualityGate.placeholderDetected,
    proposalQualityScore: qualityGate.qualityScore,
    proposalQualityStatus: qualityGate.qualityStatus,
    proposalRoutingMode: qualityGate.approvalDisabled
      ? "blocked"
      : qualityGate.qualityStatus === "review_required" && proposal.proposalRoutingMode === "normal"
        ? "review_required"
        : proposal.proposalRoutingMode,
    proposalRoutingReasons: [...(proposal.proposalRoutingReasons ?? []), ...reasons],
    proposalRoutingWarnings: [...(proposal.proposalRoutingWarnings ?? []), ...warnings],
    qualityBlockCount: qualityGate.blocks.length,
    qualityFailureCount: qualityGate.failures.length,
    qualityWarningCount: qualityGate.warnings.length,
    repeatedContentDetected: qualityGate.repeatedContentDetected,
    requiresExtraReview: proposal.requiresExtraReview || qualityGate.qualityStatus !== "passed",
    shouldBlockExecution: proposal.shouldBlockExecution || qualityGate.approvalDisabled,
    structureScore: qualityGate.structureScore,
    todoDetected: qualityGate.todoDetected,
    summary: qualityGate.approvalDisabled
      ? `${proposal.summary} Proposal quality gate blocked this proposal: ${qualityGate.blocks[0]?.message ?? "quality issues detected"}.`
      : proposal.summary
  };
}

function applyAssetVisualValidationMetadata(
  proposal: DiffProposal,
  validation: AssetVisualValidationResult
): DiffProposal {
  const reasons: ProposalRoutingReason[] = validation.visualBlocks.map((block) => ({
    code: "proposal_visual_block",
    message: `${block.message} ${block.evidence}`.trim(),
    severity: "high"
  }));
  const warnings: ProposalRoutingWarning[] = [
    ...validation.visualFailures,
    ...validation.visualWarnings
  ].map((item) => ({
    code: "proposal_visual_warning",
    message: `${item.message} ${item.repairHint}`.trim(),
    risk: item.severity === "failure" ? "high" : "medium"
  }));

  return {
    ...proposal,
    assetDriftDetected: validation.assetDriftDetected,
    assetScore: validation.assetScore,
    assetValidationStatus: validation.assetValidationStatus,
    blockedReason: validation.shouldBlockVisualApproval
      ? validation.repairHints.join("; ") || "Asset visual validator blocked this proposal."
      : proposal.blockedReason,
    heroAssetMismatch: validation.heroAssetMismatch,
    placeholderOnlyVisualDetected: validation.placeholderOnlyVisualDetected,
    proposalRoutingMode: validation.shouldBlockVisualApproval
      ? "blocked"
      : validation.visualValidationStatus === "review_required" && proposal.proposalRoutingMode === "normal"
        ? "review_required"
        : proposal.proposalRoutingMode,
    proposalRoutingReasons: [...(proposal.proposalRoutingReasons ?? []), ...reasons],
    proposalRoutingWarnings: [...(proposal.proposalRoutingWarnings ?? []), ...warnings],
    requiresExtraReview: proposal.requiresExtraReview || validation.visualValidationStatus !== "passed",
    shouldBlockExecution: proposal.shouldBlockExecution || validation.shouldBlockVisualApproval,
    summary: validation.shouldBlockVisualApproval
      ? `${proposal.summary} Asset visual validator blocked this proposal: ${validation.visualBlocks[0]?.message ?? "visual mismatch detected"}.`
      : proposal.summary,
    visualBlockCount: validation.visualBlocks.length,
    visualDriftDetected: validation.visualDriftDetected,
    visualFailureCount: validation.visualFailures.length,
    visualScore: validation.visualScore,
    visualValidationStatus: validation.visualValidationStatus,
    visualWarningCount: validation.visualWarnings.length
  };
}

function proposedFilesFromChanges(changes: DiffProposal["changes"]) {
  return Object.fromEntries(
    changes
      .filter((change) => isFileProposalAction(change.action) && change.path && change.proposedContent)
      .map((change) => [change.path as string, change.proposedContent as string])
  );
}

function selfReviewFilesFromChanges(changes: DiffProposal["changes"]): SelfReviewFile[] {
  return changes
    .filter((change) => isFileProposalAction(change.action) && change.path && typeof change.proposedContent === "string")
    .map((change) => ({
      content: change.proposedContent as string,
      path: change.path as string
    }));
}

function applySelfReviewMetadata(
  proposal: DiffProposal,
  selfReview: SelfReviewReport
): DiffProposal {
  const failed = selfReview.overallStatus === "FAIL";
  const topFailure = selfReview.failures[0];
  const failureReason = topFailure
    ? `${topFailure.ruleId}: ${topFailure.title} - ${topFailure.description}`
    : "Self Review failed this proposal.";

  return {
    ...proposal,
    approvalDisabled: proposal.approvalDisabled || failed,
    approvalRecommendation: failed ? "reject" : proposal.approvalRecommendation,
    blockedReason: failed
      ? failureReason
      : proposal.blockedReason,
    proposalRoutingMode: failed ? "blocked" : proposal.proposalRoutingMode,
    proposalRoutingReasons: failed
      ? [
          ...(proposal.proposalRoutingReasons ?? []),
          {
            code: "self_review_failed",
            message: failureReason,
            severity: "high"
          }
        ]
      : proposal.proposalRoutingReasons,
    requiresExtraReview: proposal.requiresExtraReview || selfReview.overallStatus !== "PASS",
    selfReview,
    selfReviewConfidence: selfReview.confidence,
    selfReviewFailureCount: selfReview.failures.length,
    selfReviewStatus: selfReview.overallStatus,
    selfReviewWarningCount: selfReview.warnings.length,
    shouldBlockExecution: proposal.shouldBlockExecution || failed
  };
}

function staleTermEvidence(message: string) {
  const match = message.match(/stale-domain terms:\s*(.+)$/i) ?? message.match(/contradictory or stale-domain terms:\s*(.+)$/i);

  return match?.[1]?.trim() ?? message;
}

function selfReviewSystemRisksFromProposal(proposal: DiffProposal): SelfReviewSystemRisk[] {
  const risks: SelfReviewSystemRisk[] = [];

  for (const reason of proposal.proposalRoutingReasons ?? []) {
    if (reason.code === "prompt_sovereignty_block") {
      const isStaleDomain = /stale-domain|contradictory/i.test(reason.message);
      risks.push({
        category: isStaleDomain ? "domain_consistency" : "prompt_sovereignty",
        code: reason.code,
        description: isStaleDomain
          ? `Prompt sovereignty detected unrelated stale-domain term: ${staleTermEvidence(reason.message)}.`
          : reason.message,
        evidence: staleTermEvidence(reason.message),
        recommendedFix: isStaleDomain
          ? "Remove unrelated stale-domain vocabulary from the generated output."
          : "Regenerate the proposal so it follows the current prompt and project mode.",
        repairStrategy: isStaleDomain
          ? "remove_stale_domain_terms_and_regenerate_domain_copy"
          : "regenerate_output_to_match_current_prompt_sovereignty_contract",
        ruleId: isStaleDomain ? "SOV001" : "SOV002",
        severity: "high",
        title: isStaleDomain ? "Stale Domain Contradiction" : "Prompt Sovereignty Risk"
      });
      continue;
    }

    if (reason.code === "domain_validation_block") {
      risks.push({
        category: "validator_risk",
        code: reason.code,
        description: reason.message || "Domain validator blocked this proposal.",
        evidence: reason.message,
        recommendedFix: "Use validator repair hints to regenerate domain-correct files.",
        repairStrategy: "regenerate_output_to_satisfy_domain_validator",
        ruleId: "VAL001",
        severity: reason.severity === "high" ? "high" : "medium",
        title: "Validator Risk"
      });
      continue;
    }

    if (reason.severity === "high") {
      risks.push({
        category: "proposal_risk",
        code: reason.code,
        description: reason.message,
        evidence: reason.message,
        recommendedFix: "Review the high-severity proposal risk before approval.",
        repairStrategy: "resolve_high_severity_proposal_risk",
        ruleId: "RISK001",
        severity: "high",
        title: "High Severity Proposal Risk"
      });
    }
  }

  for (const warning of proposal.proposalRoutingWarnings ?? []) {
    const isRepair = warning.code.includes("repair");
    risks.push({
      category: isRepair ? "repair_warning" : "validator_warning",
      code: warning.code,
      description: warning.message,
      evidence: warning.message,
      recommendedFix: isRepair
        ? "Review repair warnings and regenerate if the repair was partial."
        : "Review validator warning before approval.",
      repairStrategy: isRepair
        ? "resolve_repair_warning_before_approval"
        : "resolve_validator_warning_before_approval",
      ruleId: isRepair ? "REPAIR001" : "VAL001",
      severity: warning.risk === "high" ? "high" : "medium",
      title: isRepair ? "Repair Warning" : "Validator Warning"
    });
  }

  if (
    proposal.requiresExtraReview &&
    risks.length === 0
  ) {
    risks.push({
      category: "proposal_risk",
      code: "requires_extra_review",
      description: "Proposal metadata marks this proposal as needing review.",
      evidence: proposal.blockedReason ?? proposal.summary,
      recommendedFix: "Inspect proposal review notes before approval.",
      repairStrategy: "inspect_review_metadata_before_approval",
      ruleId: "RISK001",
      severity: "medium",
      title: "Proposal Needs Review"
    });
  }

  if (
    proposal.shouldBlockExecution &&
    risks.every((risk) => risk.severity !== "high" && risk.severity !== "critical")
  ) {
    risks.push({
      category: "metadata_consistency",
      code: "should_block_execution",
      description: "Proposal metadata marks execution as blocked, but no high-severity risk was bridged.",
      evidence: proposal.blockedReason ?? "shouldBlockExecution=true",
      recommendedFix: "Preserve the blocking reason in review metadata before presenting a perfect self-review score.",
      repairStrategy: "align_self_review_with_existing_blocking_metadata",
      ruleId: "META001",
      severity: "high",
      title: "Blocking Metadata Mismatch"
    });
  }

  return risks;
}

function validateProposalContent(input: {
  blueprint: BusinessBlueprint;
  compositionPlan: CompositionPlan;
  contextPriority: ContextPriorityResult;
  decomposition: TaskDecomposition;
  executionPlan: ExecutionPlan;
  productMode: "ASK" | "CODE" | "WEBSITE";
  proposalContext: ProposalContext;
  projectContract: ProjectContract | null;
  prompt: string;
  proposal: DiffProposal;
  translatedIntent: TranslatedIntentSpec;
}) {
  return validateDomain({
    businessBlueprint: input.blueprint,
    compositionPlan: input.compositionPlan,
    contextPriority: input.contextPriority,
    currentPrompt: input.prompt,
    executionPlan: input.executionPlan,
    productMode: input.productMode,
    proposalContext: input.proposalContext,
    projectContract: input.projectContract,
    proposalSummary: input.proposal.summary,
    proposedFiles: proposedFilesFromChanges(input.proposal.changes),
    taskDecomposition: input.decomposition,
    translatedIntent: input.translatedIntent,
    validationMode: "proposal_content"
  });
}

function validateProposalQuality(input: {
  blueprint: BusinessBlueprint;
  compositionPlan: CompositionPlan;
  contextPriority: ContextPriorityResult;
  decomposition: TaskDecomposition;
  domainValidation: DomainValidationResult;
  executionPlan: ExecutionPlan;
  productMode: "ASK" | "CODE" | "WEBSITE";
  proposalContext: ProposalContext;
  projectContract: ProjectContract | null;
  prompt: string;
  proposal: DiffProposal;
  translatedIntent: TranslatedIntentSpec;
}) {
  return buildProposalQualityGate({
    businessBlueprint: input.blueprint,
    compositionPlan: input.compositionPlan,
    contextPriority: input.contextPriority,
    currentPrompt: input.prompt,
    domainValidation: input.domainValidation,
    executionPlan: input.executionPlan,
    productMode: input.productMode,
    proposalContext: input.proposalContext,
    projectContract: input.projectContract,
    proposedFiles: proposedFilesFromChanges(input.proposal.changes),
    proposalSummary: input.proposal.summary,
    taskDecomposition: input.decomposition,
    translatedIntent: input.translatedIntent
  });
}

function validateProposalAssets(input: {
  blueprint: BusinessBlueprint;
  compositionPlan: CompositionPlan;
  contextPriority: ContextPriorityResult;
  decomposition: TaskDecomposition;
  domainValidation: DomainValidationResult;
  executionPlan: ExecutionPlan;
  productMode: "ASK" | "CODE" | "WEBSITE";
  proposalContext: ProposalContext;
  projectContract: ProjectContract | null;
  prompt: string;
  proposal: DiffProposal;
  proposalQuality: ProposalQualityGateResult;
  translatedIntent: TranslatedIntentSpec;
}) {
  return validateAssetVisuals({
    businessBlueprint: input.blueprint,
    compositionPlan: input.compositionPlan,
    contextPriority: input.contextPriority,
    currentPrompt: input.prompt,
    domainValidation: input.domainValidation,
    executionPlan: input.executionPlan,
    productMode: input.productMode,
    proposalContext: input.proposalContext,
    projectContract: input.projectContract,
    proposalQuality: input.proposalQuality,
    proposalSummary: input.proposal.summary,
    proposedFiles: proposedFilesFromChanges(input.proposal.changes),
    taskDecomposition: input.decomposition,
    translatedIntent: input.translatedIntent
  });
}

function applyProposalRepairMetadata(
  proposal: DiffProposal,
  repair: ProposalRepairResult
): DiffProposal {
  const repairWarnings: ProposalRoutingWarning[] = repair.repairWarnings.map((warning) => ({
    code: "proposal_repair_warning",
    message: warning,
    risk: "medium"
  }));
  const unresolvedReasons: ProposalRoutingReason[] = repair.unresolvedIssues.map((issue) => ({
    code: "proposal_repair_unresolved",
    message: issue,
    severity: "high"
  }));

  return {
    ...proposal,
    blockedReason: repair.shouldKeepBlocked && repair.unresolvedIssues.length
      ? repair.unresolvedIssues.join("; ")
      : proposal.blockedReason,
    proposalRepairActionCount: repair.repairActions.length,
    proposalRepairApplied: repair.repairApplied,
    proposalRepairAttempted: repair.repairAttempted,
    proposalRepairConfidence: repair.repairConfidence,
    proposalRepairStatus: repair.repairStatus,
    proposalRepairStrategy: repair.repairStrategy,
    proposalRevalidationPassed: repair.revalidationPassed,
    proposalUnresolvedIssueCount: repair.unresolvedIssues.length,
    proposalRoutingMode: repair.shouldKeepBlocked ? "blocked" : proposal.proposalRoutingMode,
    proposalRoutingReasons: [
      ...(proposal.proposalRoutingReasons ?? []),
      ...unresolvedReasons
    ],
    proposalRoutingWarnings: [
      ...(proposal.proposalRoutingWarnings ?? []),
      ...repairWarnings
    ],
    requiresExtraReview: proposal.requiresExtraReview || repair.repairApplied || repair.shouldKeepBlocked,
    shouldBlockExecution: proposal.shouldBlockExecution || repair.shouldKeepBlocked,
    summary: repair.repairApplied ? repair.repairedSummary : proposal.summary
  };
}

function applyRepairedFilesToProposal(
  proposal: DiffProposal,
  repair: ProposalRepairResult
): DiffProposal {
  if (!repair.repairApplied) {
    return proposal;
  }

  const shouldReplaceFileSet =
    repair.repairStrategy === "ask_mutation_suppression" ||
    repair.repairStrategy === "code_file_strategy_repair" ||
    repair.repairStrategy === "small_edit_scope_repair";
  const nextChanges: DiffProposal["changes"] = [];
  const seen = new Set<string>();

  for (const change of proposal.changes) {
    if (!isFileProposalAction(change.action) || !change.path) {
      if (!shouldReplaceFileSet) {
        nextChanges.push(change);
      }
      continue;
    }

    const repairedContent = repair.repairedFiles[change.path];

    if (typeof repairedContent === "string") {
      nextChanges.push({
        ...change,
        diffPreview: createDiffPreview(change.action, change.path, repairedContent),
        proposedContent: repairedContent,
        summary: `${change.summary} Repaired before approval.`
      });
      seen.add(change.path);
    } else if (!shouldReplaceFileSet) {
      nextChanges.push(change);
    }
  }

  for (const [path, content] of Object.entries(repair.repairedFiles)) {
    if (seen.has(path)) {
      continue;
    }

    const action: FileProposalAction = proposal.changes.some((change) => change.path === path)
      ? "update"
      : "create";
    nextChanges.push({
      action,
      diffPreview: createDiffPreview(action, path, content),
      path,
      proposedContent: content,
      summary: "Adds repaired proposal content required by the generator contract."
    });
  }

  return {
    ...proposal,
    changes: nextChanges,
    summary: repair.repairedSummary
  };
}

function applyFinalApprovalAuthority(
  proposal: DiffProposal,
  proposalContext: ProposalContext
): DiffProposal {
  return applyApprovalDecision(
    proposal,
    buildApprovalDecision({
      proposal,
      proposalContext
    })
  );
}

function runSelfReviewForProposal(input: {
  generatorContract: GeneratorContract;
  productMode: "ASK" | "CODE" | "WEBSITE";
  prompt: string;
  proposal: DiffProposal;
  proposalContext: ProposalContext;
}) {
  return runSelfReview({
    domain: input.proposalContext.domain,
    files: selfReviewFilesFromChanges(input.proposal.changes),
    generator: input.generatorContract.contractId,
    manifest: {
      framework: input.proposalContext.framework ?? null,
      requiredFiles: input.proposalContext.requiredFiles,
      type: input.productMode === "WEBSITE"
        ? "static_website"
        : input.proposalContext.framework === "python_streamlit"
          ? "python_app"
        : input.proposalContext.framework === "react_vite"
          ? "react_vite_app"
          : null
    },
    intentContract: input.proposalContext.intentContract ?? null,
    mode: input.productMode,
    projectId: input.proposal.projectId,
    prompt: input.prompt,
    requestedPages: input.proposalContext.pages,
    requiredFiles: input.proposalContext.requiredFiles,
    systemRisks: selfReviewSystemRisksFromProposal(input.proposal)
  });
}

function runSelfReviewForAskAnswer(input: {
  answer: string;
  generator: string;
  projectId?: string | null;
  prompt: string;
}) {
  return runSelfReview({
    answer: input.answer,
    files: [],
    generator: input.generator,
    mode: "ASK",
    projectId: input.projectId ?? null,
    prompt: input.prompt
  });
}

function selfReviewSystemRisksFromWebsiteEdit(plan: WebsiteEditPlan): SelfReviewSystemRisk[] {
  if (plan.mode !== "blocked" || !plan.blockedReason) return [];

  return [{
    category: "website_edit",
    code: "WEBSITE_EDIT_BLOCKED",
    description: plan.blockedReason,
    evidence: plan.summary,
    recommendedFix: "Clarify the edit request or use a supported website edit action.",
    repairStrategy: "clarify_or_use_supported_website_edit",
    ruleId: "VAL001",
    severity: "high",
    title: "Website Edit Blocked"
  }];
}

function createWebsiteEditProposal(input: {
  context: ReturnType<typeof buildWebsiteEditContext>;
  generatorContract: GeneratorContract;
  intent: WebsiteEditIntent;
  mode: "SUGGEST" | "EXECUTE";
  plan: WebsiteEditPlan;
  projectId: string | null;
  prompt: string;
  proposalContext: ProposalContext;
}): DiffProposal {
  const finalFiles = { ...input.context.files };
  const baseProposal: DiffProposal = {
    changes: input.plan.changes.map((change) => {
      finalFiles[change.path] = change.content;

      return {
        action: input.context.files[change.path] ? ("update" as const) : ("create" as const),
        diffPreview: createDiffPreview(input.context.files[change.path] ? "update" : "create", change.path, change.content),
        path: change.path,
        proposedContent: change.content,
        summary: change.summary
      };
    }),
    detectedDomain: input.context.domainId,
    domainSource: "existing_project",
    id: `proposal-${Date.now()}`,
    mode: input.mode,
    previewMode: "static_preview",
    previewMetadata: {
      activeMode: "WEBSITE",
      entryPoint: "index.html",
      framework: "static_html",
      ignoredContractReason: input.context.ignoredContractReason ?? null,
      previewType: "static_website",
      source: input.context.mixedModeConflict ? "website_files_over_code_contract" : "website_contract"
    },
    previewType: "website_static_preview",
    projectId: input.projectId,
    proposalRoutingMode: input.plan.mode === "blocked" ? "blocked" : "review_required",
    proposalRoutingReasons: input.plan.mode === "blocked"
      ? [{
          code: "website_edit_blocked",
          message: input.plan.blockedReason ?? "Website edit was blocked.",
          severity: "high"
        }]
      : [{
          code: "website_edit",
          message: input.plan.summary,
          severity: "info"
        }],
    requiredPageCount: input.context.exactPageCount ?? (input.context.requestedPages.length || null),
    requiresExtraReview: input.plan.mode === "blocked",
    shouldBlockExecution: input.plan.mode === "blocked",
    sourceOfTruthDomain: input.context.domainId,
    sourceOfTruthPages: input.context.requestedPages,
    sourceOfTruthPrompt: input.prompt,
    status: "pending",
    summary: input.plan.summary,
    websiteValidationPassed: input.plan.mode !== "blocked"
  };
  const selfReview = runSelfReview({
    domain: input.context.domainId ?? input.proposalContext.domain,
    files: Object.entries(finalFiles).map(([path, content]) => ({ content, path })),
    generator: `${input.generatorContract.contractId}_website_edit`,
    manifest: {
      framework: "static_html",
      requiredFiles: input.context.requiredFiles,
      type: "static_website"
    },
    intentContract: null,
    mode: "WEBSITE",
    projectId: input.projectId,
    prompt: input.prompt,
    requestedPages: input.context.requestedPages,
    requiredFiles: input.context.requiredFiles,
    systemRisks: selfReviewSystemRisksFromWebsiteEdit(input.plan)
  });
  const proposalWithSelfReview = applySelfReviewMetadata(baseProposal, selfReview);
  const editApprovalContext: ProposalContext = {
    ...input.proposalContext,
    domain: input.context.domainId ?? input.proposalContext.domain,
    pages: input.context.requestedPages.length ? input.context.requestedPages : input.proposalContext.pages,
    requiredFiles: input.plan.mode === "blocked"
      ? []
      : baseProposal.changes
          .filter((change) => isFileProposalAction(change.action) && change.path)
          .map((change) => change.path as string)
  };

  return applyFinalApprovalAuthority(proposalWithSelfReview, editApprovalContext);
}

function evaluateAndRepairProposal(input: {
  blueprint: BusinessBlueprint;
  compositionPlan: CompositionPlan;
  contextPriority: ContextPriorityResult;
  decomposition: TaskDecomposition;
  executionPlan: ExecutionPlan;
  generatorContract: GeneratorContract;
  productMode: "ASK" | "CODE" | "WEBSITE";
  proposalContext: ProposalContext;
  projectContract: ProjectContract | null;
  prompt: string;
  proposal: DiffProposal;
  translatedIntent: TranslatedIntentSpec;
}) {
  const domainValidation = validateProposalContent({
    blueprint: input.blueprint,
    compositionPlan: input.compositionPlan,
    contextPriority: input.contextPriority,
    decomposition: input.decomposition,
    executionPlan: input.executionPlan,
    productMode: input.productMode,
    proposalContext: input.proposalContext,
    projectContract: input.projectContract,
    prompt: input.prompt,
    proposal: input.proposal,
    translatedIntent: input.translatedIntent
  });
  const proposalWithValidation = applyDomainValidationMetadata(input.proposal, domainValidation);
  const proposalQuality = validateProposalQuality({
    blueprint: input.blueprint,
    compositionPlan: input.compositionPlan,
    contextPriority: input.contextPriority,
    decomposition: input.decomposition,
    domainValidation,
    executionPlan: input.executionPlan,
    productMode: input.productMode,
    proposalContext: input.proposalContext,
    projectContract: input.projectContract,
    prompt: input.prompt,
    proposal: proposalWithValidation,
    translatedIntent: input.translatedIntent
  });
  const proposalWithQuality = applyProposalQualityMetadata(proposalWithValidation, proposalQuality);
  const assetVisualValidation = validateProposalAssets({
    blueprint: input.blueprint,
    compositionPlan: input.compositionPlan,
    contextPriority: input.contextPriority,
    decomposition: input.decomposition,
    domainValidation,
    executionPlan: input.executionPlan,
    productMode: input.productMode,
    proposalContext: input.proposalContext,
    projectContract: input.projectContract,
    prompt: input.prompt,
    proposal: proposalWithQuality,
    proposalQuality,
    translatedIntent: input.translatedIntent
  });
  const proposalWithAssets = applyAssetVisualValidationMetadata(proposalWithQuality, assetVisualValidation);
  const skipRepairForCodeAppCollision =
    input.proposal.blockedReason?.startsWith("CODE_APP_COLLISION") ||
    proposalWithAssets.blockedReason?.startsWith("CODE_APP_COLLISION") ||
    input.proposal.proposalRoutingReasons?.some((reason) => reason.code === "code_app_collision") ||
    proposalWithAssets.proposalRoutingReasons?.some((reason) => reason.code === "code_app_collision") ||
    input.proposal.summary.includes("This project already contains a CODE app:") ||
    proposalWithAssets.summary.includes("This project already contains a CODE app:");
  const repairSkippedForCollision: ProposalRepairResult = {
    originalBlockReasons: [input.proposal.blockedReason, proposalWithAssets.blockedReason].filter((reason): reason is string => Boolean(reason)),
    repairActions: [],
    repairApplied: false,
    repairAttempted: false,
    repairConfidence: 0.95,
    repairId: `repair-skip-${Date.now()}`,
    repairedFiles: {},
    repairedSummary: proposalWithAssets.summary,
    repairSeverity: "high",
    repairStatus: "keep_blocked",
    repairStrategy: "none",
    repairWarnings: ["CODE app collision guard blocked repair so no placeholder or replacement files are added."],
    revalidationPassed: false,
    revalidationRequired: false,
    shouldKeepBlocked: true,
    shouldPresentRepairedProposal: false,
    unresolvedIssues: [input.proposal.blockedReason, proposalWithAssets.blockedReason].filter((reason): reason is string => Boolean(reason))
  };
  const repair = repairProposal({
    assetVisualValidation,
    businessBlueprint: input.blueprint,
    compositionPlan: input.compositionPlan,
    contextPriority: input.contextPriority,
    currentPrompt: input.prompt,
    domainValidation,
    executionPlan: input.executionPlan,
    generatorContract: input.generatorContract,
    productMode: input.productMode,
    proposalContext: input.proposalContext,
    projectContract: input.projectContract,
    proposalQuality,
    proposalSummary: proposalWithAssets.summary,
    proposedFiles: proposedFilesFromChanges(proposalWithAssets.changes),
    taskDecomposition: input.decomposition,
    translatedIntent: input.translatedIntent
  });
  const effectiveRepair = skipRepairForCodeAppCollision ? repairSkippedForCollision : repair;

  if (!effectiveRepair.repairApplied) {
    const proposalWithRepair = applyProposalRepairMetadata(proposalWithAssets, effectiveRepair);
    const proposalWithApproval = applyFinalApprovalAuthority(proposalWithRepair, input.proposalContext);
    const selfReview = runSelfReviewForProposal({
      generatorContract: input.generatorContract,
      productMode: input.productMode,
      prompt: input.prompt,
      proposal: proposalWithApproval,
      proposalContext: input.proposalContext
    });

    return {
      assetVisualValidation,
      domainValidation,
      proposal: cleanCodeAppCollisionSummary(applySelfReviewMetadata(proposalWithApproval, selfReview)),
      proposalQuality,
      proposalRepair: effectiveRepair,
      selfReview
    };
  }

  const repairedProposal = applyRepairedFilesToProposal(input.proposal, repair);
  const repairedDomainValidation = validateProposalContent({
    ...input,
    proposal: repairedProposal
  });
  const repairedWithValidation = applyDomainValidationMetadata(repairedProposal, repairedDomainValidation);
  const repairedProposalQuality = validateProposalQuality({
    ...input,
    domainValidation: repairedDomainValidation,
    proposal: repairedWithValidation
  });
  const repairedWithQuality = applyProposalQualityMetadata(repairedWithValidation, repairedProposalQuality);
  const repairedAssetValidation = validateProposalAssets({
    ...input,
    domainValidation: repairedDomainValidation,
    proposal: repairedWithQuality,
    proposalQuality: repairedProposalQuality
  });
  const repairedWithAssets = applyAssetVisualValidationMetadata(repairedWithQuality, repairedAssetValidation);
  const revalidationPassed = !repairedWithAssets.shouldBlockExecution;
  const finalizedRepair: ProposalRepairResult = {
    ...repair,
    repairStatus: revalidationPassed ? "repaired" : "partial_repair",
    revalidationPassed,
    shouldKeepBlocked: !revalidationPassed,
    shouldPresentRepairedProposal: revalidationPassed,
    unresolvedIssues: revalidationPassed
      ? []
      : [
          ...(repairedWithAssets.proposalRoutingReasons ?? [])
            .filter((reason) => reason.severity === "high")
            .map((reason) => reason.message)
        ]
  };

  const proposalWithApproval = applyFinalApprovalAuthority(
    applyProposalRepairMetadata(repairedWithAssets, finalizedRepair),
    input.proposalContext
  );
  const selfReview = runSelfReviewForProposal({
    generatorContract: input.generatorContract,
    productMode: input.productMode,
    prompt: input.prompt,
    proposal: proposalWithApproval,
    proposalContext: input.proposalContext
  });

  return {
    assetVisualValidation: repairedAssetValidation,
    domainValidation: repairedDomainValidation,
    proposal: applySelfReviewMetadata(proposalWithApproval, selfReview),
    proposalQuality: repairedProposalQuality,
    proposalRepair: finalizedRepair,
    selfReview
  };
}

function enforcePromptSovereignty(input: {
  composition: CompositionStrategy;
  decision: DecisionPlan;
  intent: IntentIntelligence;
  prompt: string;
  proposalContext?: ProposalContext;
  proposal: DiffProposal;
}) {
  const contract = buildPromptSovereigntyContract({
    composition: input.composition,
    decision: input.decision,
    intent: input.intent,
    prompt: input.prompt,
    proposalContext: input.proposalContext
  });
  const acceptance = validatePromptSovereignty({
    changes: input.proposal.changes,
    contract
  });

  return applyPromptAcceptanceMetadata(input.proposal, acceptance);
}

function addCompositionDebugSummary(
  proposal: DiffProposal,
  intent: IntentIntelligence,
  composition: CompositionStrategy,
  kernel?: IntelligenceKernelResult
): DiffProposal {
  if (proposal.previewType === "code_app_preview" || proposal.previewMetadata?.activeMode === "CODE") {
    const framework = typeof proposal.previewMetadata?.framework === "string"
      ? proposal.previewMetadata.framework
      : "react_vite";
    const previewType = typeof proposal.previewMetadata?.previewType === "string"
      ? proposal.previewMetadata.previewType
      : "code_app_preview";
    const appType = framework === "python_streamlit" ? "python_app" : "react_single_page_app";
    const kernelSummary = ` Kernel: CODE; intent=create_code_app; appType=${appType}; framework=${framework}; task=code_app_generation; mutationPolicy=approval_required; runtimePolicy=explicit_user_start_only; previewType=${previewType}.`;

    return {
      ...proposal,
      summary: `CODE product proposal active. Current prompt is source of truth. ${proposal.summary}${kernelSummary}`
    };
  }

  const palette = intent.palette.length
    ? intent.palette.join("/")
    : composition.visualLanguage.palette.join("/");
  const style = intent.visualStyle.length
    ? intent.visualStyle.join(", ")
    : composition.visualLanguage.style.join(", ");
  const kernelSummary = kernel ? ` Kernel: ${kernel.summary}` : "";
  const imageRequested = intent.requiredFeatures.some((feature) => /\b(?:image|images|photo|photos)\b/i.test(feature));
  const businessText = composition.businessType.toLowerCase();
  const usesPanelFirstVisuals =
    businessText.includes("television") ||
    businessText.includes("home cinema") ||
    businessText.includes("electronics") ||
    businessText.includes("perfume") ||
    businessText.includes("fragrance");
  const visualTruth =
    imageRequested && (businessText.includes("perfume") || businessText.includes("fragrance"))
      ? " Visuals: the image-domain mismatch is flagged and the proposal uses fragrance-specific visual panels instead of unsafe bike images."
      : imageRequested && usesPanelFirstVisuals
        ? " Visuals: this proposal uses premium domain-specific visual panels rather than claiming unverified remote images."
      : imageRequested
        ? " Visuals: safe remote images are used only when reliable; otherwise the proposal uses honest domain-specific visual panels."
        : "";

  return {
    ...proposal,
    summary:
      `Composition-driven generation active. Business: ${composition.businessType}. ` +
      `Audience: ${composition.audience.join(", ")}. Pages: ${composition.siteArchitecture.pageCount}. ` +
      `Palette: ${palette}. Style: ${style}. ` +
      `Intent: ${intent.summary} Composition: ${composition.reasoningSummary}.${kernelSummary}${visualTruth} ${proposal.summary}`
  };
}

function shouldUpdateProjectContract(decision: DecisionPlan) {
  return (
    decision.requestType === "code_system_generation" ||
    decision.requestType === "multi_page_generation" ||
    decision.requestType === "website_generation"
  );
}

function withProjectContractUpdate(input: {
  composition: CompositionStrategy;
  contract: ProjectContract | null;
  decision: DecisionPlan;
  generatorContract: GeneratorContract;
  intent: IntentIntelligence;
  kernel: IntelligenceKernelResult;
  prompt: string;
  proposal: DiffProposal;
  workspace: WorkspaceContext;
}): DiffProposal {
  if (!shouldUpdateProjectContract(input.decision) || input.proposal.shouldBlockExecution) {
    return input.proposal;
  }

  const updatedContract = buildUpdatedProjectContract({
    composition: input.composition,
    contract: input.contract,
    decision: input.decision,
    generatorContract: input.generatorContract,
    intent: input.intent,
    kernel: input.kernel,
    prompt: input.prompt
  });
  const proposedContent = renderProjectContract(updatedContract);
  const contractPath = input.decision.requestType === "code_system_generation"
    ? codeContractPathForWorkspace(input.workspace)
    : projectContractPath;
  const action = input.workspace.fileList.includes(contractPath) ? "update" : "create";
  const alreadyIncluded = input.proposal.changes.some((change) => change.path === contractPath);

  if (alreadyIncluded) {
    return input.proposal;
  }

  return {
    ...input.proposal,
    changes: [
      ...input.proposal.changes,
      {
        action,
        diffPreview: createDiffPreview(action, contractPath, proposedContent),
        path: contractPath,
        proposedContent: contractPath === "HASSALI.code.md"
          ? proposedContent.replace(/^# HASSALI\.md/im, "# HASSALI.code.md")
          : proposedContent,
        summary: contractPath === "HASSALI.code.md"
          ? "Updates the CODE project contract separately because this workspace also contains WEBSITE files."
          : "Updates Hassali's project contract with current mode, domain, preview type, constraints, and do-not rules."
      }
    ],
    summary: `${input.proposal.summary} Project contract will be ${action === "create" ? "created" : "updated"} in ${contractPath}.`
  };
}

async function createFallbackProposalResponse(input: {
  composition: CompositionStrategy;
  diagnostic: DiagnosticContext;
  decision: DecisionPlan;
  intent: IntentIntelligence;
  kernel: IntelligenceKernelResult;
  mode: "SUGGEST" | "EXECUTE";
  model: string;
  persistence: ChatPersistenceContext | null;
  prompt: string;
  projectContract: ProjectContract | null;
  reason: string;
  routing: ProposalRoutingDecision;
  translatedIntent: TranslatedIntentSpec;
  blueprint: BusinessBlueprint;
  compositionPlan: CompositionPlan;
  contextPriority: ContextPriorityResult;
  decomposition: TaskDecomposition;
  domainValidation: DomainValidationResult;
  executionPlan: ExecutionPlan;
  generatorContract: GeneratorContract;
  proposalContext: ProposalContext;
  workspace: WorkspaceContext;
}) {
  const proposalComposition = compositionForCurrentWebsiteBrief(input.composition, input.proposalContext);
  const proposalDecision = decisionForProposalContext(input.decision, input.proposalContext);
  const proposal = createLocalProposal(
    input.prompt,
    input.workspace,
    input.mode,
    input.diagnostic,
    proposalDecision,
    input.intent,
    proposalComposition,
    input.generatorContract,
    input.proposalContext
  );
  const proposalWithIntent = addCompositionDebugSummary(
    withProjectContractUpdate({
      composition: proposalComposition,
      contract: input.projectContract,
      decision: proposalDecision,
      generatorContract: input.generatorContract,
      intent: input.intent,
      kernel: input.kernel,
      prompt: input.prompt,
      proposal,
      workspace: input.workspace
    }),
    input.intent,
    proposalComposition,
    input.kernel
  );
  const proposalWithRouting = enforcePromptSovereignty({
    composition: proposalComposition,
    decision: proposalDecision,
    intent: input.intent,
    prompt: input.prompt,
    proposalContext: input.proposalContext,
    proposal: attachProposalRoutingMetadata(
      proposalWithIntent,
      input.kernel,
      input.routing,
      input.intent,
      proposalComposition,
      input.prompt,
      input.translatedIntent,
      input.blueprint,
      input.contextPriority,
      input.decomposition,
      input.executionPlan,
      input.compositionPlan,
      input.domainValidation,
      input.generatorContract,
      input.proposalContext
    )
  });
  const evaluatedProposal = evaluateAndRepairProposal({
    blueprint: input.blueprint,
    compositionPlan: input.compositionPlan,
    contextPriority: input.contextPriority,
    decomposition: input.decomposition,
    executionPlan: input.executionPlan,
    productMode: input.contextPriority.authoritativeMode,
    generatorContract: input.generatorContract,
    proposalContext: input.proposalContext,
    projectContract: input.projectContract,
    prompt: input.prompt,
    proposal: proposalWithRouting,
    translatedIntent: input.translatedIntent
  });
  let persistence = input.persistence;
  const visibleSummary =
    input.mode === "EXECUTE"
      ? "I prepared a safe local execution proposal for review. Nothing runs until you approve it."
      : "I prepared a safe local diff proposal for review. It will only apply if you approve it.";

  persistence = await persistChatMessage(persistence, {
    content: visibleSummary,
    metadata: {
      fallbackReason: input.reason,
      composition: proposalComposition,
      intent: input.intent,
      intelligenceKernel: compactIntelligenceKernel(input.kernel),
      intentTranslation: compactTranslatedIntent(input.translatedIntent),
      blueprint: compactBusinessBlueprint(input.blueprint),
      contextPriority: compactContextPriority(input.contextPriority),
      taskDecomposition: compactTaskDecomposition(input.decomposition),
      executionPlan: compactExecutionPlan(input.executionPlan),
      compositionPlan: compactCompositionPlan(input.compositionPlan),
      domainValidation: compactDomainValidation(evaluatedProposal.domainValidation),
      generatorContract: compactGeneratorContract(input.generatorContract),
      proposalQuality: compactProposalQualityGate(evaluatedProposal.proposalQuality),
      assetVisualValidation: compactAssetVisualValidation(evaluatedProposal.assetVisualValidation),
      proposalRepair: compactProposalRepair(evaluatedProposal.proposalRepair),
      selfReview: compactSelfReview(evaluatedProposal.selfReview),
      previewRuntime: compactPreviewRuntime(buildProposalPreviewRuntime(
        evaluatedProposal.proposal,
        input.contextPriority.authoritativeMode,
        input.contextPriority.authoritativeIntentFamily
      )),
      projectContract: summarizeProjectContract(input.projectContract),
      ...compactProposalRouting(input.kernel, input.routing),
      qualityDecision: input.decision,
      model: input.model,
      proposal: evaluatedProposal.proposal
    },
    role: "assistant"
  });

  return createProposalStream(evaluatedProposal.proposal, persistence?.sessionId);
}

function createOpenRouterTextStream(
  response: Response,
  options?: {
    onComplete?: (content: string) => Promise<void>;
    sessionId?: string | null;
  }
) {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const reader = response.body?.getReader();

  if (!reader) {
    return createPlaceholderStream(fallbackModel, options);
  }

  let buffer = "";
  let streamedContent = "";

  return new Response(
    new ReadableStream({
      async start(controller) {
        try {
          while (true) {
            const { done, value } = await reader.read();

            if (done) {
              break;
            }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
              const trimmedLine = line.trim();

              if (!trimmedLine.startsWith("data:")) {
                continue;
              }

              const data = trimmedLine.slice(5).trim();

              if (data === "[DONE]") {
                continue;
              }

              try {
                const parsed = JSON.parse(data) as {
                  choices?: Array<{
                    delta?: {
                      content?: string;
                    };
                  }>;
                };
                const content = parsed.choices?.[0]?.delta?.content;

                if (content) {
                  streamedContent += content;
                  controller.enqueue(encoder.encode(content));
                }
              } catch {
                continue;
              }
            }
          }
        } finally {
          await options?.onComplete?.(streamedContent);
          controller.close();
          reader.releaseLock();
        }
      }
    }),
    {
      headers: createResponseHeaders(options?.sessionId)
    }
  );
}

function createPlaceholderStream(
  model: string,
  options?: {
    onComplete?: (content: string) => Promise<void>;
    sessionId?: string | null;
  }
) {
  const encoder = new TextEncoder();
  const chunks = [
    `Streaming placeholder active for ${model}.\n\n`,
    "Add OPENROUTER_API_KEY to enable live OpenRouter responses. ",
    "Usage tracking hooks are reserved for a later phase."
  ];

  return new Response(
    new ReadableStream({
      async start(controller) {
        let content = "";

        for (const chunk of chunks) {
          content += chunk;
          controller.enqueue(encoder.encode(chunk));
        }

        await options?.onComplete?.(content);
        controller.close();
      }
    }),
    {
      headers: createResponseHeaders(options?.sessionId)
    }
  );
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    chatSessionId?: unknown;
    messages?: unknown;
    mode?: unknown;
    model?: unknown;
    productMode?: unknown;
    projectId?: unknown;
    workspace?: unknown;
  } | null;

  const messages = Array.isArray(body?.messages)
    ? body.messages.filter(isChatMessage).map<ChatRequestMessage>((message) => ({
        role: message.role,
        content: message.content
      }))
    : [];

  if (messages.length === 0) {
    return Response.json({ error: "A user message is required." }, { status: 400 });
  }

  const model =
    typeof body?.model === "string" && body.model.trim().length > 0
      ? body.model.trim()
      : process.env.HASSALI_DEFAULT_MODEL || fallbackModel;
  const mode: AiMode =
    body?.mode === "SUGGEST" || body?.mode === "EXECUTE" || body?.mode === "ASK"
      ? body.mode
      : "ASK";
  const productMode = productModeFromRequest(body?.productMode, mode);
  const workspace = isWorkspaceContext(body?.workspace)
    ? body.workspace
    : {
        activeFileContent: "",
        activePath: "welcome.ts",
        fileContents: {},
        fileList: [],
        projectName: null
      };
  const projectContract = readProjectContractFromWorkspace(workspace);
  const latestUserPrompt = [...messages].reverse().find((message) => message.role === "user")?.content ?? "";
  const effectiveUserPrompt = extractEffectiveUserRequest(latestUserPrompt);
  const promptOwnership = decidePromptOwnership({
    mode: productMode,
    prompt: effectiveUserPrompt
  });
  const activeProjectContract = promptOwnership.useContractMemory ? projectContract : null;
  const projectContractContext = promptOwnership.useCurrentPromptOnly
    ? "HASSALI.md exists, but this is a new generation request. Ignore stale contract facts unless the user explicitly says continue/refine/edit the existing project."
    : projectContractSystemContext(projectContract);
  const translatedIntent = translateIntent({
    contract: activeProjectContract,
    mode: productMode,
    prompt: effectiveUserPrompt
  });
  const blueprint = matchBusinessBlueprint({
    contract: activeProjectContract,
    productMode,
    prompt: effectiveUserPrompt,
    translatedIntent
  });
  const contextPriority = buildContextPriority({
    businessBlueprint: blueprint,
    currentPrompt: effectiveUserPrompt,
    fallbackDefaults: ["approval-first", "selected-project-only", "no shell execution", "no package installs"],
    previousProposalContext: null,
    productMode,
    projectContract: activeProjectContract,
    regenerationContext: latestUserPrompt.includes("Previous proposal was blocked") ? latestUserPrompt : null,
    translatedIntent,
    workspaceContextSummary: `${workspace.fileList.length} file(s); active=${workspace.activePath}; project=${workspace.projectName ?? "unknown"}`
  });
  const decomposition = decomposeTask({
    businessBlueprint: blueprint,
    contextPriority,
    currentPrompt: effectiveUserPrompt,
    productMode,
    projectContract: activeProjectContract,
    translatedIntent
  });
  const executionPlan = buildExecutionPlan({
    businessBlueprint: blueprint,
    contextPriority,
    currentPrompt: effectiveUserPrompt,
    productMode,
    projectContract: activeProjectContract,
    taskDecomposition: decomposition,
    translatedIntent
  });
  const compositionPlan = buildCompositionPlan({
    businessBlueprint: blueprint,
    contextPriority,
    currentPrompt: effectiveUserPrompt,
    executionPlan,
    productMode,
    projectContract: activeProjectContract,
    taskDecomposition: decomposition,
    translatedIntent
  });
  const domainValidation = validateDomain({
    businessBlueprint: blueprint,
    compositionPlan,
    contextPriority,
    currentPrompt: effectiveUserPrompt,
    executionPlan,
    productMode,
    projectContract: activeProjectContract,
    taskDecomposition: decomposition,
    translatedIntent,
    validationMode: "pre_proposal_context"
  });
  const initialGeneratorContract = buildGeneratorContract({
    businessBlueprint: blueprint,
    compositionPlan,
    contextPriority,
    currentPrompt: effectiveUserPrompt,
    domainValidation,
    executionPlan,
    productMode,
    projectContract: activeProjectContract,
    taskDecomposition: decomposition,
    translatedIntent
  });
  const proposalContext = isolateProposalContextForMixedCodeWorkspace(buildProposalContext({
    contract: activeProjectContract,
    generatorContract: initialGeneratorContract,
    mode: productMode,
    prompt: effectiveUserPrompt,
    translatedIntent
  }), workspace);
  const generatorContract = enforceGeneratorContractWithProposalContext(
    initialGeneratorContract,
    proposalContext
  );

  const requestedProjectId = typeof body?.projectId === "string" ? body.projectId : null;
  const diagnostic = buildDiagnosticContext({
    projectId: requestedProjectId,
    projectName: workspace.projectName ?? null,
    prompt: effectiveUserPrompt,
    runtime: getRuntimeStatus(),
    workspace
  });
  const decision = buildDecisionPlan({
    diagnostic,
    prompt: effectiveUserPrompt
  });
  const intent = buildIntentIntelligence({
    fileList: workspace.fileList,
    projectName: workspace.projectName ?? null,
    prompt: effectiveUserPrompt
  });
  const composition = buildCompositionStrategy(intent);
  const kernel = buildIntelligenceKernel({
    blueprint,
    composition,
    compositionPlan,
    contextPriority,
    decision,
    decomposition,
    diagnostic,
    domainValidation,
    executionPlan,
    intent,
    mode: productMode,
    translatedIntent
  });
  const routing = buildProposalRoutingDecision(kernel);
  const askRuntimeContext = buildAskRuntimeContext();
  const askLiveIntent = detectAskLiveIntent(effectiveUserPrompt);

  if (mode === "SUGGEST" || mode === "EXECUTE") {
    console.info("intent intelligence", intent);
    console.info("intent translation", summarizeTranslatedIntent(translatedIntent));
    console.info("business blueprint", summarizeBusinessBlueprint(blueprint));
    console.info("context priority", summarizeContextPriority(contextPriority));
    console.info("task decomposition", summarizeTaskDecomposition(decomposition));
    console.info("execution plan", summarizeExecutionPlan(executionPlan));
    console.info("composition plan", summarizeCompositionPlan(compositionPlan));
    console.info("domain validation", summarizeDomainValidation(domainValidation));
    console.info("generator contract", summarizeGeneratorContract(generatorContract));
    console.info("composition strategy", composition);
    console.info("intelligence kernel", kernel.summary);
    console.info("kernel routing decision", kernel.routingDecision);
    console.info("proposal routing", routing.metadataSummary);
  }

  const formattedDiagnostic = formatDiagnosticContext(diagnostic);
  const requestedSessionId = typeof body?.chatSessionId === "string" ? body.chatSessionId : null;
  let persistence = await createPersistenceContext({
    mode,
    projectId: requestedProjectId,
    sessionId: requestedSessionId
  });

  persistence = await persistChatMessage(persistence, {
    content: latestUserPrompt,
    metadata: {
      model,
      askRuntimeContext: mode === "ASK" ? askRuntimeContext : undefined,
      askLiveIntent: mode === "ASK" ? askLiveIntent : undefined,
      workspace: {
        activePath: workspace.activePath,
        blueprint: compactBusinessBlueprint(blueprint),
        composition,
        projectContract: summarizeProjectContract(projectContract),
        diagnosis: diagnostic.diagnosis,
        decision,
        editScope: diagnostic.editScope,
        fileList: workspace.fileList,
        inferredDomain: diagnostic.inferredDomain,
        intent,
        intentTranslation: compactTranslatedIntent(translatedIntent),
        intelligenceKernel: compactIntelligenceKernel(kernel),
        kernelRoutingDecision: kernel.routingDecision,
        proposalRouting: compactProposalRouting(kernel, routing),
        productMode,
        taskDecomposition: compactTaskDecomposition(decomposition),
        executionPlan: compactExecutionPlan(executionPlan),
        compositionPlan: compactCompositionPlan(compositionPlan),
        domainValidation: compactDomainValidation(domainValidation),
        generatorContract: compactGeneratorContract(generatorContract),
        promptIntent: diagnostic.promptIntent
      }
    },
    role: "user"
  });

  if (mode === "ASK") {
    const identityAnswer = createHassaliIdentityAnswer({
      model,
      prompt: effectiveUserPrompt
    });

    if (identityAnswer) {
      const selfReview = runSelfReviewForAskAnswer({
        answer: identityAnswer,
        generator: "hassali_identity",
        projectId: requestedProjectId,
        prompt: effectiveUserPrompt
      });

      persistence = await persistChatMessage(persistence, {
        content: identityAnswer,
        metadata: {
          deterministic: true,
          identityResponse: true,
          intentTranslation: compactTranslatedIntent(translatedIntent),
          model,
          projectContract: summarizeProjectContract(projectContract),
          selfReview: compactSelfReview(selfReview)
        },
        role: "assistant"
      });

      return createTextStream(identityAnswer, persistence?.sessionId);
    }

    const askBrain = await runAskBrain({
      askRuntimeContext,
      messages,
      model,
      productMode,
      prompt: effectiveUserPrompt,
      projectName: workspace.projectName ?? null,
      workspace
    });

    if (askBrain.answer) {
      const selfReview = runSelfReviewForAskAnswer({
        answer: askBrain.answer,
        generator: "ask_brain_orchestrator",
        projectId: requestedProjectId,
        prompt: effectiveUserPrompt
      });

      persistence = await persistChatMessage(persistence, {
        content: askBrain.answer,
        metadata: {
          askLiveIntent,
          askRuntimeContext,
          askBrain: askBrain.decision,
          askBrainIntent: askBrain.classification.intent,
          deterministic: askBrain.decision.path === "deterministic_required" || askBrain.decision.path === "deterministic_preferred",
          model,
          projectContract: summarizeProjectContract(projectContract),
          selfReview: compactSelfReview(selfReview)
        },
        role: "assistant"
      });

      return createTextStream(askBrain.answer, persistence?.sessionId, createAskBrainDebugHeaders(askBrain.decision));
    }

    const liveKnowledgeAnswer = routeLiveKnowledgeQuestion(effectiveUserPrompt);

    if (liveKnowledgeAnswer.answer) {
      const selfReview = runSelfReviewForAskAnswer({
        answer: liveKnowledgeAnswer.answer,
        generator: "live_knowledge_router",
        projectId: requestedProjectId,
        prompt: effectiveUserPrompt
      });

      persistence = await persistChatMessage(persistence, {
        content: liveKnowledgeAnswer.answer,
        metadata: {
          deterministic: true,
          liveKnowledge: {
            confidence: liveKnowledgeAnswer.confidence,
            requiresLiveSearch: liveKnowledgeAnswer.requiresLiveSearch,
            status: liveKnowledgeAnswer.status
          },
          model,
          projectContract: summarizeProjectContract(projectContract),
          selfReview: compactSelfReview(selfReview)
        },
        role: "assistant"
      });

      return createTextStream(liveKnowledgeAnswer.answer, persistence?.sessionId);
    }

    const hassaliPromptAnswer = createHassaliReadyPromptAnswer({
      projectContract: activeProjectContract,
      prompt: effectiveUserPrompt,
      translatedIntent
    });

    if (hassaliPromptAnswer) {
      const selfReview = runSelfReviewForAskAnswer({
        answer: hassaliPromptAnswer,
        generator: "hassali_ready_prompt",
        projectId: requestedProjectId,
        prompt: effectiveUserPrompt
      });

      persistence = await persistChatMessage(persistence, {
        content: hassaliPromptAnswer,
        metadata: {
          deterministic: true,
          intentTranslation: compactTranslatedIntent(translatedIntent),
          model,
          projectContract: summarizeProjectContract(projectContract),
          selfReview: compactSelfReview(selfReview)
        },
        role: "assistant"
      });

      return createTextStream(hassaliPromptAnswer, persistence?.sessionId);
    }

  }

  if (productMode === "ASK" && kernel.routingDecision.mutationPolicy === "answer_only") {
    const askBrain = await runAskBrain({
      askRuntimeContext,
      messages,
      model,
      productMode,
      prompt: effectiveUserPrompt,
      projectName: workspace.projectName ?? null,
      workspace
    });
    const answerOnlyContent = askBrain.answer;
    const selfReview = runSelfReviewForAskAnswer({
      answer: answerOnlyContent,
      generator: "ask_brain_orchestrator",
      projectId: requestedProjectId,
      prompt: effectiveUserPrompt
    });

    persistence = await persistChatMessage(persistence, {
      content: answerOnlyContent,
      metadata: {
        askLiveIntent,
        askRuntimeContext,
        askBrain: askBrain.decision,
        askBrainIntent: askBrain.classification.intent,
        deterministic: askBrain.decision.path === "deterministic_required" || askBrain.decision.path === "deterministic_preferred",
        intelligenceKernel: compactIntelligenceKernel(kernel),
        kernelRoutingDecision: kernel.routingDecision,
        model,
        productMode,
        projectContract: summarizeProjectContract(projectContract),
        selfReview: compactSelfReview(selfReview)
      },
      role: "assistant"
    });

    return createTextStream(answerOnlyContent, persistence?.sessionId, createAskBrainDebugHeaders(askBrain.decision));
  }

  if (
    (mode === "SUGGEST" || mode === "EXECUTE") &&
    productMode === "WEBSITE" &&
    hasWebsiteEditSignal(effectiveUserPrompt)
  ) {
    const websiteEditContext = buildWebsiteEditContext(workspace);

    if (websiteEditContext.hasWebsiteFiles) {
      const websiteEditIntent = classifyWebsiteEditIntent(effectiveUserPrompt);
      const websiteEditPlan = planWebsiteEdit(websiteEditContext, websiteEditIntent);
      const proposal = createWebsiteEditProposal({
        context: websiteEditContext,
        generatorContract,
        intent: websiteEditIntent,
        mode,
        plan: websiteEditPlan,
        projectId: requestedProjectId,
        prompt: effectiveUserPrompt,
        proposalContext
      });
      const visibleSummary =
        websiteEditPlan.mode === "blocked"
          ? "I reviewed the existing website edit request, but it is not safe to apply as-is."
          : "I prepared a contract-aware website edit proposal for review. It will only apply if you approve it.";

      persistence = await persistChatMessage(persistence, {
        content: visibleSummary,
        metadata: {
          deterministic: true,
          generatorContract: compactGeneratorContract(generatorContract),
          intentTranslation: compactTranslatedIntent(translatedIntent),
          model,
          previewRuntime: compactPreviewRuntime(buildProposalPreviewRuntime(
            proposal,
            "WEBSITE",
            "full_generation"
          )),
          projectContract: summarizeProjectContract(projectContract),
          proposal,
          selfReview: proposal.selfReview ? compactSelfReview(proposal.selfReview) : undefined,
          websiteEditContext: {
            activeMode: websiteEditContext.activeMode,
            contractPath: websiteEditContext.contractPath,
            domainId: websiteEditContext.domainId,
            exactPageCount: websiteEditContext.exactPageCount,
            ignoredContractReason: websiteEditContext.ignoredContractReason,
            mixedModeConflict: websiteEditContext.mixedModeConflict,
            requestedPages: websiteEditContext.requestedPages,
            requiredFiles: websiteEditContext.requiredFiles
          },
          websiteEditIntent,
          websiteEditPlan: {
            mode: websiteEditPlan.mode,
            preserved: websiteEditPlan.preserved,
            targetFiles: websiteEditPlan.targetFiles
          }
        },
        role: "assistant"
      });

      return createProposalStream(proposal, persistence?.sessionId);
    }

    const hasCodeProjectFiles = Boolean(workspace.fileList.includes("app.py") || workspace.fileContents?.["app.py"] || workspace.fileList.includes("requirements.txt"));
    const blockedReason = hasCodeProjectFiles
      ? "I found a CODE project, not a WEBSITE project. Please switch to CODE or generate/select a website project before making a WEBSITE edit."
      : "I could not find an existing WEBSITE project to edit. Please generate a website first or select the project files.";
    const blockedPlan: WebsiteEditPlan = {
      blockedReason,
      changes: [],
      mode: "blocked",
      preserved: [],
      summary: hasCodeProjectFiles
        ? "Website edit blocked: existing project files look like CODE, not WEBSITE."
        : "Website edit blocked: no existing website files were available.",
      targetFiles: []
    };
    const websiteEditIntent = classifyWebsiteEditIntent(effectiveUserPrompt);
    const proposal = createWebsiteEditProposal({
      context: websiteEditContext,
      generatorContract,
      intent: websiteEditIntent,
      mode,
      plan: blockedPlan,
      projectId: requestedProjectId,
      prompt: effectiveUserPrompt,
      proposalContext
    });

    persistence = await persistChatMessage(persistence, {
      content: blockedReason,
      metadata: {
        deterministic: true,
        model,
        proposal,
        selfReview: proposal.selfReview ? compactSelfReview(proposal.selfReview) : undefined,
        websiteEditIntent,
        websiteEditPlan: {
          mode: blockedPlan.mode,
          targetFiles: blockedPlan.targetFiles
        }
      },
      role: "assistant"
    });

    return createProposalStream(proposal, persistence?.sessionId);
  }

  if (mode !== "ASK" && kernel.routingDecision.mutationPolicy === "answer_only") {
    const answerOnlyContent =
      "I can answer this without changing files. " +
      `${kernel.routingDecision.routingExplanation} ` +
      "No proposal was created and no project files were touched.";

    persistence = await persistChatMessage(persistence, {
      content: answerOnlyContent,
      metadata: {
        intelligenceKernel: compactIntelligenceKernel(kernel),
        kernelRoutingDecision: kernel.routingDecision,
        model,
        productMode,
        projectContract: summarizeProjectContract(projectContract)
      },
      role: "assistant"
    });

    return createTextStream(answerOnlyContent, persistence?.sessionId);
  }

  const shouldUseDeterministicProposal =
    (mode === "SUGGEST" || mode === "EXECUTE") &&
    (shouldUseDeterministicDecision(decision) ||
      isEnhancementRequest(effectiveUserPrompt) ||
      Boolean(detectRenameRequest(effectiveUserPrompt)) ||
      (mode === "EXECUTE" && isInvoiceRequest(effectiveUserPrompt)));

  if (
    (mode === "SUGGEST" || mode === "EXECUTE") &&
    (shouldUseDeterministicProposal || !process.env.OPENROUTER_API_KEY)
  ) {
    const proposalComposition = compositionForCurrentWebsiteBrief(composition, proposalContext);
    const proposalDecision = decisionForProposalContext(decision, proposalContext);
    const localProposal = createLocalProposal(
      effectiveUserPrompt,
      workspace,
      mode,
      diagnostic,
      proposalDecision,
      intent,
      proposalComposition,
      generatorContract,
      proposalContext
    );
    const proposalWithContract = withProjectContractUpdate({
      composition: proposalComposition,
      contract: activeProjectContract,
      decision: proposalDecision,
      generatorContract,
      intent,
      kernel,
      prompt: effectiveUserPrompt,
      proposal: localProposal,
      workspace
    });
    const routedProposal = enforcePromptSovereignty({
      composition: proposalComposition,
      decision: proposalDecision,
      intent,
      prompt: effectiveUserPrompt,
      proposalContext,
      proposal: attachProposalRoutingMetadata(
        addCompositionDebugSummary(
          proposalWithContract,
          intent,
          proposalComposition,
          kernel
        ),
        kernel,
        routing,
        intent,
        proposalComposition,
        effectiveUserPrompt,
        translatedIntent,
        blueprint,
        contextPriority,
        decomposition,
        executionPlan,
        compositionPlan,
        domainValidation,
        generatorContract,
        proposalContext
      )
    });
    const evaluatedProposal = evaluateAndRepairProposal({
      blueprint,
      compositionPlan,
      contextPriority,
      decomposition,
      executionPlan,
      productMode,
      generatorContract,
      proposalContext,
      projectContract: activeProjectContract,
      prompt: effectiveUserPrompt,
      proposal: routedProposal,
      translatedIntent
    });
    const proposal = evaluatedProposal.proposal;
    const visibleSummary =
      mode === "EXECUTE"
        ? "I prepared an execution proposal for review. Nothing runs until you approve it."
        : "I prepared a diff proposal for review. It will only apply if you approve it.";

    persistence = await persistChatMessage(persistence, {
      content: visibleSummary,
      metadata: {
        composition: proposalComposition,
        model,
        intent,
        intentTranslation: compactTranslatedIntent(translatedIntent),
        blueprint: compactBusinessBlueprint(blueprint),
        contextPriority: compactContextPriority(contextPriority),
        taskDecomposition: compactTaskDecomposition(decomposition),
        executionPlan: compactExecutionPlan(executionPlan),
        compositionPlan: compactCompositionPlan(compositionPlan),
        domainValidation: compactDomainValidation(evaluatedProposal.domainValidation),
        generatorContract: compactGeneratorContract(generatorContract),
        proposalQuality: compactProposalQualityGate(evaluatedProposal.proposalQuality),
        assetVisualValidation: compactAssetVisualValidation(evaluatedProposal.assetVisualValidation),
        proposalRepair: compactProposalRepair(evaluatedProposal.proposalRepair),
        selfReview: compactSelfReview(evaluatedProposal.selfReview),
        previewRuntime: compactPreviewRuntime(buildProposalPreviewRuntime(
          proposal,
          contextPriority.authoritativeMode,
          contextPriority.authoritativeIntentFamily
        )),
        intelligenceKernel: compactIntelligenceKernel(kernel),
        projectContract: summarizeProjectContract(projectContract),
        ...compactProposalRouting(kernel, routing),
        proposal
      },
      role: "assistant"
    });

    return createProposalStream(proposal, persistence?.sessionId);
  }

  if (!process.env.OPENROUTER_API_KEY) {
    return createPlaceholderStream(model, {
      onComplete: async (content) => {
        const selfReview = runSelfReviewForAskAnswer({
          answer: content,
          generator: "ask_placeholder_stream",
          projectId: requestedProjectId,
          prompt: effectiveUserPrompt
        });

        persistence = await persistChatMessage(persistence, {
          content,
          metadata: {
            askLiveIntent,
            askRuntimeContext,
            model,
            selfReview: compactSelfReview(selfReview)
          },
          role: "assistant"
        });
      },
      sessionId: persistence?.sessionId
    });
  }

  if (mode === "SUGGEST" || mode === "EXECUTE") {
    let response: Response;

    try {
      response = await fetch(openRouterChatCompletionsUrl, {
        body: JSON.stringify({
          messages: [
            {
              role: "system",
              content:
                `You are Hassali.ai in ${mode} mode. Return only one JSON object with this exact shape: ` +
                `{ "summary": string, "changes": [{ "path": string, "action": "create" | "update", "summary": string, "proposedContent": string } | { "action": "restart_runtime" | "reload_preview" | "stop_runtime", "summary": string }] }. ` +
                `You may include multiple file changes. Use action "create" for new files and "update" for existing files. ` +
                `Only include safe runtime actions when the user asks to start, restart, reload, or stop preview. Do not include shell commands, package installs, Docker, or destructive deletes. ` +
                `Do not use markdown. Do not mutate files. Use the diagnostic context. For vague prompts, preserve existing structure and prefer targeted edits. ` +
                `If Product mode is CODE or kernel task is code_system_generation, do not create a fake static website or index.html/styles.css/main.js unless the user explicitly asks for a static landing page. Prefer architecture, implementation, data model, and security plan files. ` +
                `Proposal context: ${JSON.stringify(proposalContext)}. If proposalContext.framework is python_streamlit or runtimeType is python, generate Python files such as app.py, requirements.txt, data/mock_crm_data.py, README.md, ARCHITECTURE.md, SECURITY_AND_TESTING.md, and HASSALI.md; do not generate package.json, vite.config.ts, or React/Vite files unless the prompt explicitly asks for a React frontend. ` +
                `For vague create/build website requests without clear web files, propose standard static files: index.html, styles.css, and main.js. ` +
                `For multi-page requests, satisfy the required page files exactly. Decision plan: ${JSON.stringify(decision)}. ` +
                `Intent translator spec from current prompt, higher priority than project contract: ${JSON.stringify(translatedIntent)}. ` +
                `Business/app blueprint matched from translated intent: ${JSON.stringify(blueprint)}. Use it for sections, screens, components, copy blocks, file strategy, must-include, must-avoid, and acceptance checks. ` +
                `Context priority result: ${JSON.stringify(contextPriority)}. Obey authoritativeMode, authoritativeDomain, authoritativeIntentFamily, authoritativePreviewType, suppressedContext, and conflicts. Current prompt and selected product mode outrank HASSALI.md, old proposals, fallback defaults, and examples. ` +
                `Task decomposition: ${JSON.stringify(decomposition)}. Obey orderedTasks, milestones, fileTargets, recommendedPhasePolicy, validationChecks, and blockedUntil. Small edits must remain targeted; CODE apps should be phased; ASK should not mutate files. ` +
                `Execution plan: ${JSON.stringify(executionPlan)}. Obey executionStages, sequentialTasks, parallelTasks, approvalCheckpoints, completionChecks, rollbackChecks, blockers, and recommendedExecutionPolicy. Do not skip approval-first safety. ` +
                `Composition plan: ${JSON.stringify(compositionPlan)}. Obey pagePlans, requiredSections, forbiddenSections, productOrServiceEntities, visualIntent, assetIntent, layoutIntent, CTAs, trustSignals, and acceptanceChecks. This is guidance only; do not invent stale domains. ` +
                `Domain validation pre-check: ${JSON.stringify(domainValidation)}. Obey requiredSignals, forbiddenSignals, repairHints, and acceptanceChecks. Proposal content that violates these signals may be blocked before approval. ` +
                `${generatorContract.enforcementPrompt} ` +
                `Intent intelligence: ${JSON.stringify(intent)}. ` +
                `Reasoning composition: ${JSON.stringify(composition)}. ` +
                `Product mode: ${productMode}. Intelligence kernel: ${kernel.summary}. ` +
                `Kernel routing decision: ${JSON.stringify(kernel.routingDecision)}. Obey the kernel mutation policy and required checks. ` +
                `Project contract: ${projectContractContext} ` +
                `The proposal summary must mention what you detected and the safe treatment. Diagnostic context:\n${formattedDiagnostic}`
            },
            ...messages
          ],
          model,
          stream: false
        }),
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json"
        },
        method: "POST"
      });
    } catch {
      return createFallbackProposalResponse({
        composition,
        diagnostic,
        decision,
        intent,
        kernel,
        mode,
        model,
        persistence,
        prompt: effectiveUserPrompt,
        projectContract: activeProjectContract,
        reason: "openrouter_network_error",
        routing,
        translatedIntent,
        blueprint,
        compositionPlan,
        contextPriority,
        decomposition,
        domainValidation,
        executionPlan,
        generatorContract,
        proposalContext,
        workspace
      });
    }

    if (!response.ok) {
      return createFallbackProposalResponse({
        composition,
        diagnostic,
        decision,
        intent,
        kernel,
        mode,
        model,
        persistence,
        prompt: effectiveUserPrompt,
        projectContract: activeProjectContract,
        reason: `openrouter_${response.status}`,
        routing,
        translatedIntent,
        blueprint,
        compositionPlan,
        contextPriority,
        decomposition,
        domainValidation,
        executionPlan,
        generatorContract,
        proposalContext,
        workspace
      });
    }

    const completion = (await response.json()) as {
      choices?: Array<{
        message?: {
          content?: string;
        };
      }>;
    };
    const content = completion.choices?.[0]?.message?.content ?? "";
    const parsed = parseDiffProposalContent(content);

    if (
      !parsed ||
      parsed.changes.some(
        (change) =>
          isFileProposalAction(change.action) &&
          (!change.path || !change.proposedContent || change.proposedContent.trim().length === 0)
      )
    ) {
      return createFallbackProposalResponse({
        composition,
        diagnostic,
        decision,
        intent,
        kernel,
        mode,
        model,
        persistence,
        prompt: effectiveUserPrompt,
        projectContract: activeProjectContract,
        reason: "invalid_or_empty_model_proposal",
        routing,
        translatedIntent,
        blueprint,
        compositionPlan,
        contextPriority,
        decomposition,
        domainValidation,
        executionPlan,
        generatorContract,
        proposalContext,
        workspace
      });
    }

    const proposalComposition = compositionForCurrentWebsiteBrief(composition, proposalContext);
    const proposalDecision = decisionForProposalContext(decision, proposalContext);
    const routedProposal: DiffProposal = enforcePromptSovereignty({
      composition: proposalComposition,
      decision: proposalDecision,
      intent,
      prompt: effectiveUserPrompt,
      proposalContext,
      proposal: attachProposalRoutingMetadata(
        addCompositionDebugSummary(withProjectContractUpdate({
          composition: proposalComposition,
          contract: activeProjectContract,
          decision: proposalDecision,
          generatorContract,
          intent,
          kernel,
          prompt: effectiveUserPrompt,
          proposal: {
          id: `proposal-${Date.now()}`,
          mode,
          projectId: requestedProjectId,
          status: "pending",
          summary: `${diagnostic.diagnosis} ${parsed.summary}`,
          changes: parsed.changes.map((change) => {
            if (isRuntimeProposalAction(change.action)) {
              return {
                action: change.action,
                summary: change.summary
              };
            }

            return {
              action: change.action,
              diffPreview:
                change.diffPreview ??
                createDiffPreview(
                  change.action,
                  change.path ?? "untitled.txt",
                  change.proposedContent ?? ""
                ),
              path: change.path,
              proposedContent: change.proposedContent,
              summary: change.summary
            };
          })
          },
          workspace
        }), intent, proposalComposition, kernel),
        kernel,
        routing,
        intent,
        proposalComposition,
        effectiveUserPrompt,
        translatedIntent,
        blueprint,
        contextPriority,
        decomposition,
        executionPlan,
        compositionPlan,
        domainValidation,
        generatorContract,
        proposalContext
      )
    });
    const evaluatedProposal = evaluateAndRepairProposal({
      blueprint,
      compositionPlan,
      contextPriority,
      decomposition,
      executionPlan,
      productMode,
      generatorContract,
      proposalContext,
      projectContract: activeProjectContract,
      prompt: effectiveUserPrompt,
      proposal: routedProposal,
      translatedIntent
    });
    const proposal: DiffProposal = evaluatedProposal.proposal;

    if (
      proposal.shouldBlockExecution &&
      proposal.proposalRoutingReasons?.some((reason) => reason.code === "prompt_sovereignty_block") &&
      shouldUseDeterministicDecision(decision)
    ) {
      return createFallbackProposalResponse({
        composition,
        diagnostic,
        decision,
        intent,
        kernel,
        mode,
        model,
        persistence,
        prompt: effectiveUserPrompt,
        projectContract: activeProjectContract,
        reason: "prompt_sovereignty_repair",
        routing,
        translatedIntent,
        blueprint,
        compositionPlan,
        contextPriority,
        decomposition,
        domainValidation,
        executionPlan,
        generatorContract,
        proposalContext,
        workspace
      });
    }

    const quality = scoreProposalQuality({
      changes: proposal.changes,
      composition: proposalComposition,
      decision: proposalDecision,
      existingFileList: workspace.fileList,
      intent
    });

    if (!quality.passed) {
      return createFallbackProposalResponse({
        composition,
        diagnostic,
        decision,
        intent,
        kernel,
        mode,
        model,
        persistence,
        prompt: effectiveUserPrompt,
        projectContract: activeProjectContract,
        reason: `quality_score_${quality.score}_${quality.issues.join(",")}`,
        routing,
        translatedIntent,
        blueprint,
        compositionPlan,
        contextPriority,
        decomposition,
        domainValidation,
        executionPlan,
        generatorContract,
        proposalContext,
        workspace
      });
    }

    persistence = await persistChatMessage(persistence, {
      content: proposal.summary,
      metadata: {
        composition: proposalComposition,
        intent,
        intentTranslation: compactTranslatedIntent(translatedIntent),
        blueprint: compactBusinessBlueprint(blueprint),
        contextPriority: compactContextPriority(contextPriority),
        taskDecomposition: compactTaskDecomposition(decomposition),
        executionPlan: compactExecutionPlan(executionPlan),
        compositionPlan: compactCompositionPlan(compositionPlan),
        domainValidation: compactDomainValidation(evaluatedProposal.domainValidation),
        generatorContract: compactGeneratorContract(generatorContract),
        proposalQuality: compactProposalQualityGate(evaluatedProposal.proposalQuality),
        assetVisualValidation: compactAssetVisualValidation(evaluatedProposal.assetVisualValidation),
        proposalRepair: compactProposalRepair(evaluatedProposal.proposalRepair),
        selfReview: compactSelfReview(evaluatedProposal.selfReview),
        previewRuntime: compactPreviewRuntime(buildProposalPreviewRuntime(
          proposal,
          contextPriority.authoritativeMode,
          contextPriority.authoritativeIntentFamily
        )),
        intelligenceKernel: compactIntelligenceKernel(kernel),
        model,
        projectContract: summarizeProjectContract(projectContract),
        ...compactProposalRouting(kernel, routing),
        proposal
      },
      role: "assistant"
    });

    return createProposalStream(proposal, persistence?.sessionId);
  }

  const response = await fetch(openRouterChatCompletionsUrl, {
    body: JSON.stringify({
      messages: [
        {
          role: "system",
          content:
            `You are Hassali.ai in ASK mode. Keep answers concise and do not edit files from chat. ` +
            `ASK is a universal assistant mode for explanation, planning, learning, debugging, and general help. ` +
            `If the user asks to build or edit files, explain that WEBSITE or CODE mode should be used for approval-first file changes. ` +
            `${formatAskRuntimeContext(askRuntimeContext, askLiveIntent)}\n` +
            `${projectContractContext}\n` +
            `Current mode: ${mode}. Active file: ${workspace.activePath}. Files: ${workspace.fileList.join(", ")}.`
        },
        ...messages
      ],
      model,
      stream: true
    }),
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json"
    },
    method: "POST"
  });

  if (!response.ok) {
    return Response.json({ error: "OpenRouter chat request failed." }, { status: response.status });
  }

  return createOpenRouterTextStream(response, {
    onComplete: async (content) => {
      const selfReview = runSelfReviewForAskAnswer({
        answer: content,
        generator: "openrouter_ask_stream",
        projectId: requestedProjectId,
        prompt: effectiveUserPrompt
      });

      persistence = await persistChatMessage(persistence, {
        content,
        metadata: {
          askLiveIntent,
          askRuntimeContext,
          model,
          projectContract: summarizeProjectContract(projectContract),
          selfReview: compactSelfReview(selfReview)
        },
        role: "assistant"
      });
    },
    sessionId: persistence?.sessionId
  });
}

