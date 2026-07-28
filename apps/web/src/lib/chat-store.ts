"use client";

import { create } from "zustand";
import { canonicalProjectState } from "@/lib/canonical-project-state";
import {
  handoffTargetDraft,
  parseModeHandoff,
  type ModeHandoff
} from "@/lib/mode-handoff";
import { hassaliDefaultModelId } from "@/lib/model-registry";
import type { RuntimeSyncMetadata } from "@/lib/runtime-result-sync";
import type {
  SelfReviewReport,
  SelfReviewStatus
} from "@/lib/self-review-types";
import { normalizeSafeProjectPath } from "@/lib/utils/path";

export type ChatRole = "user" | "assistant";
export type AiMode = "ASK" | "SUGGEST" | "EXECUTE";
export type ProductMode = "ASK" | "WEBSITE" | "CODE";
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

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  handoff?: ModeHandoff | null;
  providerFailureCategory?: string | null;
  responseKind?: "deterministic_answer" | "identity_response" | "mode_boundary" | "provider_failure" | "safety_response" | "substantive_answer";
};

export type WorkspaceContext = {
  activeFileContent: string;
  activePath: string;
  chatSessionId: string | null;
  fileContents: Record<string, string>;
  fileList: string[];
  projectId: string | null;
  projectName: string | null;
};

type FileProposalAction = "create" | "modify" | "update" | "write_file";
type DeleteProposalAction = "delete_file";
type RuntimeProposalAction = "restart_runtime" | "reload_preview" | "run_dev_server" | "start_runtime" | "stop_runtime";
type ProposalAction = DeleteProposalAction | FileProposalAction | RuntimeProposalAction;
type ProposalRoutingMode = "blocked" | "normal" | "review_required";
type UnifiedPreviewType = "application" | "architecture" | "component" | "dashboard" | "mobile" | "none" | "website";
type LegacyPreviewType = "code_app_preview" | "code_plan_preview" | "docs_preview" | "none" | "website_static_preview";
type ProposalPreviewType = LegacyPreviewType | UnifiedPreviewType;

export type ProposalRoutingReason = {
  code: string;
  message: string;
  severity: "high" | "info" | "medium";
};

export type ProposalRoutingWarning = {
  code: string;
  message: string;
  risk: "high" | "medium";
};

export type ApprovalDecision = {
  approvalAllowed: boolean;
  criticalIssues: string[];
  decisionSource: "client-normalized" | "server";
  hasCriticalIssues: boolean;
  hasWarnings: boolean;
  reviewItems: string[];
  warnings: string[];
};

export type KernelRoutingDecision = {
  confidence: number;
  constraints: string[];
  frameworkHint?: KernelFrameworkHint;
  mode: ProductMode;
  mutationPolicy: KernelMutationPolicy;
  providerProfileHint?: KernelProviderProfileHint;
  requiredChecks: string[];
  risks: string[];
  routingExplanation: string;
  taskType: string;
};

export type DiffProposal = {
  appPreview?: {
    appKind: string;
    appName: string;
    entities: string[];
    integrations: string[];
    mockDataNotice: string;
    screens: string[];
  };
  assetDriftDetected?: boolean;
  assetScore?: number;
  assetValidationStatus?: "blocked" | "passed" | "review_required" | "warning";
  blueprintConfidence?: number;
  blueprintId?: string;
  blueprintKind?: "answer" | "code_app" | "website";
  blueprintName?: string;
  blueprintPreviewType?: "code_app_preview" | "code_plan_preview" | "none" | "website_static_preview";
  blueprintStatus?: "fallback" | "matched" | "none";
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
  livePreviewCapabilities?: string[];
  livePreviewClassification?: Record<string, unknown>;
  livePreviewMetadata?: Record<string, unknown>;
  livePreviewRuntimeState?: string | null;
  livePreviewWarnings?: string[];
  liveRealPreview?: Record<string, unknown>;
  liveRuntimePreviewSyncedAt?: string | null;
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
    previewType: UnifiedPreviewType;
    reason: string;
    rendererId: string;
    signals: string[];
  };
  previewConfidence?: number;
  previewMetadata?: Record<string, unknown>;
  previewRuntimeState?: "empty" | "metadata_only" | "none" | "ready" | "unsupported";
  previewType?: ProposalPreviewType;
  previewWarnings?: string[];
  projectId: string | null;
  proposalRoutingMode?: ProposalRoutingMode;
  proposalRoutingReasons?: ProposalRoutingReason[];
  proposalRoutingWarnings?: ProposalRoutingWarning[];
  selfReview?: SelfReviewReport;
  selfReviewConfidence?: number;
  selfReviewFailureCount?: number;
  selfReviewStatus?: SelfReviewStatus;
  selfReviewWarningCount?: number;
  realPreview?: Record<string, unknown>;
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
  runtimeRunnerId?: string | null;
  runtimeRunnerStatus?: string | null;
  runtimeSnapshotId?: string | null;
  runtimeSnapshotStatus?: string | null;
  runtimeStartAttempted?: boolean;
  runtimeStartError?: string | null;
  runtimeStartStatus?: string | null;
  runtimeWarning?: string | null;
  runtimeSyncStatus?: "failed" | "partial" | "skipped" | "synced";
  runtimeSyncedAt?: string;
  runtimeVerificationOk?: boolean | null;
  runtimeWrittenFiles?: string[];
  sectionCopyQualityStatus?: "blocked" | "clean" | "review_required";
  shouldBlockExecution?: boolean;
  staleTermScanStatus?: "blocked" | "clean" | "review_required";
  structureScore?: number;
  status: "pending" | "approved" | "rejected";
  suppressedContextCount?: number;
  summary: string;
  todoDetected?: boolean;
  placeholderOnlyVisualDetected?: boolean;
  visualBlockCount?: number;
  visualDriftDetected?: boolean;
  visualFailureCount?: number;
  visualScore?: number;
  visualValidationStatus?: "blocked" | "passed" | "review_required" | "warning";
  visualWarningCount?: number;
  workerExecutionDurationMs?: number | null;
  workerExecutionStatus?: string | null;
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
  changes: Array<{
    action: ProposalAction;
    path?: string;
    summary: string;
    proposedContent?: string;
    diffPreview?: string;
  }>;
};

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isApprovalDecision(value: unknown): value is ApprovalDecision {
  if (!value || typeof value !== "object") {
    return false;
  }

  const decision = value as ApprovalDecision;

  return (
    typeof decision.approvalAllowed === "boolean" &&
    Array.isArray(decision.criticalIssues) &&
    decision.criticalIssues.every((item) => typeof item === "string") &&
    (decision.decisionSource === "client-normalized" || decision.decisionSource === "server") &&
    typeof decision.hasCriticalIssues === "boolean" &&
    typeof decision.hasWarnings === "boolean" &&
    Array.isArray(decision.reviewItems) &&
    decision.reviewItems.every((item) => typeof item === "string") &&
    Array.isArray(decision.warnings) &&
    decision.warnings.every((item) => typeof item === "string")
  );
}

const applyUnsafePlaceholderPatterns = [
  /\bCurrent Prompt Website\b/i,
  /\bcontact\s*\/\s*unknown\b/i,
  /\bdomain-specific hero\b/i,
  /\bproduct proof\s*\/\s*contact path\b/i,
  /\bunknown with clear guidance\b/i,
  /\bSupport, warranty, shipping, and contact details for Current Prompt Website\b/i,
  /\bdocument dataset domain\s*=\s*Current Prompt Website\b/i
];

function proposalFileContents(proposal: DiffProposal) {
  return proposal.changes
    .filter((change) => isFileProposalAction(change.action) && typeof change.proposedContent === "string")
    .map((change) => ({
      content: change.proposedContent as string,
      path: change.path ?? "unknown"
    }));
}

function proposalHtmlPages(proposal: DiffProposal) {
  return proposalFileContents(proposal)
    .map((file) => normalizeSafeProjectPath(file.path))
    .filter((path): path is string => Boolean(path?.endsWith(".html")));
}

function expectedHtmlPages(proposal: DiffProposal) {
  const sourcePages = proposal.sourceOfTruthPages?.length
    ? proposal.sourceOfTruthPages
    : [];

  return new Set(
    sourcePages
      .map((page) => page.toLowerCase().trim())
      .filter(Boolean)
      .map((page) => page === "home" || page === "index" ? "index.html" : `${page.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.html`)
  );
}

function legacyCriticalIssues(proposal: DiffProposal) {
  const issues: string[] = [];
  const criticalPattern = /\b(?:cross-project|another project|project isolation|unsafe path|invalid file path|missing required file|unexpected website page|wrong-domain|dangerous action|unsupported action|package install|shell execution|missing proposed content)\b/i;

  for (const change of proposal.changes) {
    if (isFileProposalAction(change.action) && (!change.path || typeof change.proposedContent !== "string")) {
      issues.push(`invalid file mutation for ${change.path ?? "unknown path"}`);
    }

    if (change.path && !normalizeSafeProjectPath(change.path)) {
      issues.push(`unsafe file path ${change.path}`);
    }
  }

  if (proposal.blockedReason && criticalPattern.test(proposal.blockedReason)) {
    issues.push(proposal.blockedReason);
  }

  for (const reason of proposal.proposalRoutingReasons ?? []) {
    if (criticalPattern.test(reason.message) || criticalPattern.test(reason.code)) {
      issues.push(reason.message);
    }
  }

  if (proposal.approvalDisabled) {
    issues.push(proposal.blockedReason ?? "This proposal failed validation and cannot be applied. Regenerate or fix the request.");
  }

  if (proposal.shouldBlockExecution) {
    issues.push(proposal.blockedReason ?? "This proposal is marked as blocked and cannot be applied.");
  }

  if (proposal.proposalRoutingMode === "blocked") {
    issues.push(proposal.blockedReason ?? "This proposal routing is blocked.");
  }

  if (proposal.selfReviewStatus === "FAIL") {
    issues.push("Self Review failed this proposal.");
  }

  if (proposal.proposalQualityStatus === "blocked") {
    issues.push(proposal.blockedReason ?? "Proposal quality gate blocked this proposal.");
  }

  if (proposal.domainValidationStatus === "blocked") {
    issues.push(proposal.blockedReason ?? "Domain validation blocked this proposal.");
  }

  if (
    proposal.contradictionStatus === "blocked" ||
    proposal.publicCopyCleanStatus === "blocked" ||
    proposal.sectionCopyQualityStatus === "blocked" ||
    proposal.staleTermScanStatus === "blocked" ||
    proposal.visualValidationStatus === "blocked" ||
    proposal.generatorContractStatus === "blocked"
  ) {
    issues.push(proposal.blockedReason ?? "One or more validation layers blocked this proposal.");
  }

  if (
    proposal.proposalRepairStatus === "failed" ||
    proposal.proposalRepairStatus === "keep_blocked" ||
    proposal.proposalRepairStatus === "partial_repair"
  ) {
    issues.push("Repair did not produce an apply-safe proposal.");
  }

  if ((proposal.qualityBlockCount ?? 0) > 0) {
    issues.push("Proposal quality gate reported blocking issues.");
  }

  for (const file of proposalFileContents(proposal)) {
    if (applyUnsafePlaceholderPatterns.some((pattern) => pattern.test(file.content))) {
      issues.push(`Apply-unsafe placeholder repair content detected in ${file.path}.`);
    }
  }

  const expectedPages = expectedHtmlPages(proposal);
  if (proposal.generatorMode === "website_generation" && expectedPages.size > 0) {
    const extraPages = proposalHtmlPages(proposal).filter((path) => !expectedPages.has(path));

    if (extraPages.length > 0) {
      issues.push(`Generated extra page(s) not requested: ${extraPages.join(", ")}.`);
    }
  }

  return Array.from(new Set(issues));
}

export function normalizeApprovalDecision(proposal: DiffProposal): ApprovalDecision {
  const criticalIssues = legacyCriticalIssues(proposal);
  const explicitCriticalIssues = [
    ...(proposal.approvalDecision?.criticalIssues ?? []),
    ...(proposal.approvalDecision?.approvalAllowed === false && !(proposal.approvalDecision?.criticalIssues ?? []).length
      ? ["This proposal failed validation and cannot be applied. Regenerate or fix the request."]
      : [])
  ];
  const combinedCriticalIssues = Array.from(new Set([...explicitCriticalIssues, ...criticalIssues]));
  const warnings = Array.from(new Set([
    ...(proposal.approvalDecision?.warnings ?? []),
    ...(proposal.proposalRoutingReasons ?? [])
      .filter((reason) => reason.severity !== "info")
      .map((reason) => reason.message),
    ...(proposal.proposalRoutingWarnings ?? []).map((warning) => warning.message)
  ]));

  return {
    approvalAllowed: proposal.approvalDecision?.approvalAllowed === false ? false : combinedCriticalIssues.length === 0,
    criticalIssues: combinedCriticalIssues,
    decisionSource: proposal.approvalDecision?.decisionSource ?? "client-normalized",
    hasCriticalIssues: combinedCriticalIssues.length > 0 || proposal.approvalDecision?.hasCriticalIssues === true,
    hasWarnings: warnings.length > 0,
    reviewItems: warnings,
    warnings
  };
}

export function isProposalApprovalBlocked(proposal: DiffProposal) {
  return normalizeApprovalDecision(proposal).hasCriticalIssues;
}

function isAppPreview(value: unknown): value is NonNullable<DiffProposal["appPreview"]> {
  if (!value || typeof value !== "object") {
    return false;
  }

  const preview = value as NonNullable<DiffProposal["appPreview"]>;

  return (
    typeof preview.appKind === "string" &&
    typeof preview.appName === "string" &&
    isStringArray(preview.entities) &&
    isStringArray(preview.integrations) &&
    typeof preview.mockDataNotice === "string" &&
    isStringArray(preview.screens)
  );
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isUnifiedPreviewType(value: unknown): value is UnifiedPreviewType {
  return (
    value === "application" ||
    value === "architecture" ||
    value === "component" ||
    value === "dashboard" ||
    value === "mobile" ||
    value === "none" ||
    value === "website"
  );
}

function isProposalPreviewType(value: unknown): value is ProposalPreviewType {
  return (
    isUnifiedPreviewType(value) ||
    value === "code_app_preview" ||
    value === "code_plan_preview" ||
    value === "docs_preview" ||
    value === "website_static_preview"
  );
}

function isPreviewClassification(value: unknown): value is NonNullable<DiffProposal["previewClassification"]> {
  if (!isPlainRecord(value)) {
    return false;
  }

  return (
    typeof value.confidence === "number" &&
    isUnifiedPreviewType(value.previewType) &&
    typeof value.reason === "string" &&
    typeof value.rendererId === "string" &&
    isStringArray(value.signals)
  );
}

type ChatState = {
  messages: ChatMessage[];
  input: string;
  model: string;
  modelSelectionPolicy: "automatic" | "locked";
  mode: AiMode;
  productMode: ProductMode;
  isStreaming: boolean;
  proposal: DiffProposal | null;
  pendingHandoff: ModeHandoff | null;
  chatSessionId: string | null;
  hydrateChat: (
    messages: Array<{
      content: string;
      handoff?: unknown;
      id: string;
      mode?: AiMode;
      providerFailureCategory?: string | null;
      responseKind?: string | null;
      role: ChatRole;
    }>,
    sessionId: string | null
  ) => void;
  setInput: (input: string) => void;
  setModel: (model: string) => void;
  setModelSelectionPolicy: (policy: "automatic" | "locked") => void;
  activateHandoff: (handoff: ModeHandoff) => void;
  setMode: (mode: AiMode) => void;
  setProductMode: (mode: ProductMode) => void;
  clearProposal: () => void;
  markProposalApproved: (metadata?: RuntimeSyncMetadata) => void;
  sendMessage: (workspaceContext: WorkspaceContext) => Promise<void>;
};

const defaultModel = hassaliDefaultModelId;
const proposalMarker = "HASSALI_DIFF_PROPOSAL:";
const handoffMarker = "HASSALI_MODE_HANDOFF:";

function productModeToAiMode(mode: ProductMode): AiMode {
  return mode === "ASK" ? "ASK" : "EXECUTE";
}

function aiModeToProductMode(mode: AiMode): ProductMode {
  if (mode === "ASK") {
    return "ASK";
  }

  return mode === "SUGGEST" ? "WEBSITE" : "CODE";
}

function createMessage(role: ChatRole, content: string): ChatMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    role,
    content
  };
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

function isDeleteProposalAction(action: unknown): action is DeleteProposalAction {
  return action === "delete_file";
}

function isProposalRoutingMode(value: unknown): value is ProposalRoutingMode {
  return value === "blocked" || value === "normal" || value === "review_required";
}

function isProposalRoutingWarning(value: unknown): value is ProposalRoutingWarning {
  if (!value || typeof value !== "object") {
    return false;
  }

  const warning = value as ProposalRoutingWarning;

  return (
    typeof warning.code === "string" &&
    typeof warning.message === "string" &&
    (warning.risk === "high" || warning.risk === "medium")
  );
}

function isProposalRoutingReason(value: unknown): value is ProposalRoutingReason {
  if (!value || typeof value !== "object") {
    return false;
  }

  const reason = value as ProposalRoutingReason;

  return (
    typeof reason.code === "string" &&
    typeof reason.message === "string" &&
    (reason.severity === "high" || reason.severity === "info" || reason.severity === "medium")
  );
}

function isSelfReviewStatus(value: unknown): value is SelfReviewStatus {
  return value === "FAIL" || value === "PASS" || value === "PASS_WITH_WARNINGS";
}

function isSelfReviewIssue(value: unknown) {
  if (!isPlainRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.ruleId === "string" &&
    typeof value.reviewer === "string" &&
    (value.mode === "ASK" || value.mode === "CODE" || value.mode === "WEBSITE") &&
    typeof value.category === "string" &&
    typeof value.severity === "string" &&
    typeof value.title === "string" &&
    typeof value.description === "string" &&
    Array.isArray(value.evidence) &&
    isPlainRecord(value.location) &&
    typeof value.confidence === "number" &&
    typeof value.repairable === "boolean" &&
    typeof value.repairStrategy === "string" &&
    typeof value.recommendedFix === "string" &&
    typeof value.timestamp === "number" &&
    Array.isArray(value.trace)
  );
}

function isSelfReviewReport(value: unknown): value is SelfReviewReport {
  if (!isPlainRecord(value)) {
    return false;
  }

  return (
    typeof value.reviewId === "string" &&
    typeof value.reviewer === "string" &&
    (value.mode === "ASK" || value.mode === "CODE" || value.mode === "WEBSITE") &&
    isSelfReviewStatus(value.overallStatus) &&
    typeof value.confidence === "number" &&
    typeof value.passed === "boolean" &&
    Array.isArray(value.warnings) &&
    value.warnings.every(isSelfReviewIssue) &&
    Array.isArray(value.failures) &&
    value.failures.every(isSelfReviewIssue) &&
    Array.isArray(value.recommendations) &&
    isPlainRecord(value.scores) &&
    isPlainRecord(value.metrics) &&
    typeof value.timestamp === "number" &&
    Array.isArray(value.trace)
  );
}

function isKernelRoutingDecision(value: unknown): value is KernelRoutingDecision {
  if (!value || typeof value !== "object") {
    return false;
  }

  const decision = value as KernelRoutingDecision;

  return (
    (decision.mode === "ASK" || decision.mode === "WEBSITE" || decision.mode === "CODE") &&
    typeof decision.taskType === "string" &&
    typeof decision.confidence === "number" &&
    (decision.mutationPolicy === "answer_only" ||
      decision.mutationPolicy === "proposal_required" ||
      decision.mutationPolicy === "safe_auto_apply_blocked") &&
    Array.isArray(decision.constraints) &&
    decision.constraints.every((item) => typeof item === "string") &&
    Array.isArray(decision.risks) &&
    decision.risks.every((item) => typeof item === "string") &&
    Array.isArray(decision.requiredChecks) &&
    decision.requiredChecks.every((item) => typeof item === "string") &&
    typeof decision.routingExplanation === "string" &&
    (typeof decision.providerProfileHint === "undefined" ||
      ["cheap", "coding", "fast", "local", "long_context", "privacy_sensitive", "reasoning", "vision"].includes(decision.providerProfileHint)) &&
    (typeof decision.frameworkHint === "undefined" ||
      [
        "crewai_candidate",
        "langchain_candidate",
        "langgraph_candidate",
        "llamaindex_candidate",
        "multi_agent_candidate",
        "none",
        "rag_candidate"
      ].includes(decision.frameworkHint))
  );
}

function createGreetingMessage() {
  return createMessage(
    "assistant",
    "Tell me what you want to build or understand. I will keep the response focused and careful."
  );
}

function normalizeHydratedMessages(
  messages: Array<{
    content: string;
    handoff?: unknown;
    id: string;
    mode?: AiMode;
    providerFailureCategory?: string | null;
    responseKind?: string | null;
    role: ChatRole;
  }>
) {
  return messages
    .filter(
      (message) =>
        typeof message.id === "string" &&
        typeof message.content === "string" &&
        (message.role === "user" || message.role === "assistant")
    )
    .map((message) => ({
      content: message.content,
      handoff: parseModeHandoff(message.handoff),
      id: message.id,
      role: message.role,
      providerFailureCategory: "providerFailureCategory" in message && typeof message.providerFailureCategory === "string" ? message.providerFailureCategory : null,
      responseKind: "responseKind" in message && typeof message.responseKind === "string" ? message.responseKind as ChatMessage["responseKind"] : undefined
    }));
}

function isDiffProposal(value: unknown): value is DiffProposal {
  if (!value || typeof value !== "object") {
    return false;
  }

  const proposal = value as DiffProposal;

  return (
    typeof proposal.id === "string" &&
    (typeof proposal.appPreview === "undefined" || isAppPreview(proposal.appPreview)) &&
    (typeof proposal.assetDriftDetected === "undefined" ||
      typeof proposal.assetDriftDetected === "boolean") &&
    (typeof proposal.assetScore === "undefined" ||
      typeof proposal.assetScore === "number") &&
    (typeof proposal.assetValidationStatus === "undefined" ||
      proposal.assetValidationStatus === "blocked" ||
      proposal.assetValidationStatus === "passed" ||
      proposal.assetValidationStatus === "review_required" ||
      proposal.assetValidationStatus === "warning") &&
    (typeof proposal.blueprintConfidence === "undefined" ||
      typeof proposal.blueprintConfidence === "number") &&
    (typeof proposal.blueprintId === "undefined" || typeof proposal.blueprintId === "string") &&
    (typeof proposal.blueprintKind === "undefined" ||
      proposal.blueprintKind === "answer" ||
      proposal.blueprintKind === "code_app" ||
      proposal.blueprintKind === "website") &&
    (typeof proposal.blueprintName === "undefined" || typeof proposal.blueprintName === "string") &&
    (typeof proposal.blueprintPreviewType === "undefined" ||
      proposal.blueprintPreviewType === "code_app_preview" ||
      proposal.blueprintPreviewType === "code_plan_preview" ||
      proposal.blueprintPreviewType === "none" ||
      proposal.blueprintPreviewType === "website_static_preview") &&
    (typeof proposal.blueprintStatus === "undefined" ||
      proposal.blueprintStatus === "fallback" ||
      proposal.blueprintStatus === "matched" ||
      proposal.blueprintStatus === "none") &&
    (typeof proposal.authoritativeDomain === "undefined" ||
      proposal.authoritativeDomain === null ||
      typeof proposal.authoritativeDomain === "string") &&
    (typeof proposal.authoritativeIntentFamily === "undefined" ||
      typeof proposal.authoritativeIntentFamily === "string") &&
    (typeof proposal.authoritativeMode === "undefined" ||
      proposal.authoritativeMode === "ASK" ||
      proposal.authoritativeMode === "CODE" ||
      proposal.authoritativeMode === "WEBSITE") &&
    (typeof proposal.authoritativePreviewType === "undefined" ||
      proposal.authoritativePreviewType === "code_app_preview" ||
      proposal.authoritativePreviewType === "code_plan_preview" ||
      proposal.authoritativePreviewType === "none" ||
      proposal.authoritativePreviewType === "website_static_preview") &&
    (typeof proposal.contextConflictCount === "undefined" ||
      typeof proposal.contextConflictCount === "number") &&
    (typeof proposal.contextPriorityStatus === "undefined" ||
      proposal.contextPriorityStatus === "clear" ||
      proposal.contextPriorityStatus === "conflicts_resolved" ||
      proposal.contextPriorityStatus === "low_confidence") &&
    (typeof proposal.compositionEntityCount === "undefined" ||
      typeof proposal.compositionEntityCount === "number") &&
    (typeof proposal.compositionId === "undefined" ||
      typeof proposal.compositionId === "string") &&
    (typeof proposal.compositionKind === "undefined" ||
      proposal.compositionKind === "answer_composition" ||
      proposal.compositionKind === "app_composition" ||
      proposal.compositionKind === "targeted_edit_composition" ||
      proposal.compositionKind === "website_composition") &&
    (typeof proposal.compositionPageCount === "undefined" ||
      typeof proposal.compositionPageCount === "number") &&
    (typeof proposal.compositionRequiredSectionCount === "undefined" ||
      typeof proposal.compositionRequiredSectionCount === "number") &&
    (typeof proposal.compositionStatus === "undefined" ||
      proposal.compositionStatus === "answer_only" ||
      proposal.compositionStatus === "planned" ||
      proposal.compositionStatus === "targeted") &&
    (typeof proposal.compositionWarningCount === "undefined" ||
      typeof proposal.compositionWarningCount === "number") &&
    (typeof proposal.decompositionId === "undefined" ||
      typeof proposal.decompositionId === "string") &&
    (typeof proposal.decompositionStatus === "undefined" ||
      proposal.decompositionStatus === "answer_only" ||
      proposal.decompositionStatus === "decomposed" ||
      proposal.decompositionStatus === "targeted") &&
    (typeof proposal.executionMode === "undefined" ||
      proposal.executionMode === "ASK" ||
      proposal.executionMode === "CODE" ||
      proposal.executionMode === "WEBSITE") &&
    (typeof proposal.executionPlanId === "undefined" ||
      typeof proposal.executionPlanId === "string") &&
    (typeof proposal.executionPlanStatus === "undefined" ||
      proposal.executionPlanStatus === "answer_only" ||
      proposal.executionPlanStatus === "planned" ||
      proposal.executionPlanStatus === "targeted") &&
    (typeof proposal.executionRiskLevel === "undefined" ||
      proposal.executionRiskLevel === "high" ||
      proposal.executionRiskLevel === "low" ||
      proposal.executionRiskLevel === "medium") &&
    (typeof proposal.executionStageCount === "undefined" ||
      typeof proposal.executionStageCount === "number") &&
    (typeof proposal.projectId === "string" || proposal.projectId === null) &&
    typeof proposal.summary === "string" &&
    (typeof proposal.blockedReason === "undefined" || typeof proposal.blockedReason === "string") &&
    (typeof proposal.contradictionStatus === "undefined" ||
      proposal.contradictionStatus === "blocked" ||
      proposal.contradictionStatus === "clear" ||
      proposal.contradictionStatus === "review_required") &&
    (typeof proposal.detectedDomain === "undefined" || typeof proposal.detectedDomain === "string") &&
    (typeof proposal.domainDriftDetected === "undefined" ||
      typeof proposal.domainDriftDetected === "boolean") &&
    (typeof proposal.domainConfidence === "undefined" || typeof proposal.domainConfidence === "number") &&
    (typeof proposal.domainSource === "undefined" ||
      proposal.domainSource === "current_user_prompt" ||
      proposal.domainSource === "existing_project" ||
      proposal.domainSource === "inferred" ||
      proposal.domainSource === "unknown") &&
    (typeof proposal.domainValidationScore === "undefined" ||
      typeof proposal.domainValidationScore === "number") &&
    (typeof proposal.domainValidationSeverity === "undefined" ||
      proposal.domainValidationSeverity === "critical" ||
      proposal.domainValidationSeverity === "major" ||
      proposal.domainValidationSeverity === "minor") &&
    (typeof proposal.domainValidationStatus === "undefined" ||
      proposal.domainValidationStatus === "blocked" ||
      proposal.domainValidationStatus === "passed" ||
      proposal.domainValidationStatus === "review_required") &&
    (typeof proposal.intelligenceKernelSummary === "undefined" ||
      typeof proposal.intelligenceKernelSummary === "string") &&
    (typeof proposal.intentConfidence === "undefined" ||
      typeof proposal.intentConfidence === "number") &&
    (typeof proposal.intentTranslationStatus === "undefined" ||
      proposal.intentTranslationStatus === "available" ||
      proposal.intentTranslationStatus === "low_confidence" ||
      proposal.intentTranslationStatus === "unavailable") &&
    (typeof proposal.kernelRoutingDecision === "undefined" ||
      isKernelRoutingDecision(proposal.kernelRoutingDecision)) &&
    (typeof proposal.livePreviewCapabilities === "undefined" ||
      (Array.isArray(proposal.livePreviewCapabilities) &&
        proposal.livePreviewCapabilities.every((capability) => typeof capability === "string"))) &&
    (typeof proposal.livePreviewClassification === "undefined" ||
      isPlainRecord(proposal.livePreviewClassification)) &&
    (typeof proposal.livePreviewMetadata === "undefined" ||
      isPlainRecord(proposal.livePreviewMetadata)) &&
    (typeof proposal.livePreviewRuntimeState === "undefined" ||
      proposal.livePreviewRuntimeState === null ||
      typeof proposal.livePreviewRuntimeState === "string") &&
    (typeof proposal.livePreviewWarnings === "undefined" ||
      (Array.isArray(proposal.livePreviewWarnings) &&
        proposal.livePreviewWarnings.every((warning) => typeof warning === "string"))) &&
    (typeof proposal.liveRealPreview === "undefined" ||
      isPlainRecord(proposal.liveRealPreview)) &&
    (typeof proposal.liveRuntimePreviewSyncedAt === "undefined" ||
      proposal.liveRuntimePreviewSyncedAt === null ||
      typeof proposal.liveRuntimePreviewSyncedAt === "string") &&
    (typeof proposal.genericCopyDetected === "undefined" ||
      typeof proposal.genericCopyDetected === "boolean") &&
    (typeof proposal.generatorContractBlockCount === "undefined" ||
      typeof proposal.generatorContractBlockCount === "number") &&
    (typeof proposal.generatorContractId === "undefined" ||
      typeof proposal.generatorContractId === "string") &&
    (typeof proposal.generatorContractStatus === "undefined" ||
      proposal.generatorContractStatus === "blocked" ||
      proposal.generatorContractStatus === "ready" ||
      proposal.generatorContractStatus === "warning") &&
    (typeof proposal.generatorContractWarningCount === "undefined" ||
      typeof proposal.generatorContractWarningCount === "number") &&
    (typeof proposal.generatorForbiddenTermCount === "undefined" ||
      typeof proposal.generatorForbiddenTermCount === "number") &&
    (typeof proposal.generatorMode === "undefined" ||
      proposal.generatorMode === "answer_only" ||
      proposal.generatorMode === "code_generation" ||
      proposal.generatorMode === "small_edit" ||
      proposal.generatorMode === "website_generation") &&
    (typeof proposal.generatorRequiredSectionCount === "undefined" ||
      typeof proposal.generatorRequiredSectionCount === "number") &&
    (typeof proposal.modeObedienceStatus === "undefined" ||
      proposal.modeObedienceStatus === "blocked" ||
      proposal.modeObedienceStatus === "obeyed" ||
      proposal.modeObedienceStatus === "review_required") &&
    (typeof proposal.modeDriftDetected === "undefined" ||
      typeof proposal.modeDriftDetected === "boolean") &&
    (typeof proposal.proposalRoutingMode === "undefined" ||
      isProposalRoutingMode(proposal.proposalRoutingMode)) &&
    (typeof proposal.previewMode === "undefined" ||
      proposal.previewMode === "answer_only" ||
      proposal.previewMode === "code_plan" ||
      proposal.previewMode === "static_preview") &&
    (typeof proposal.previewCapabilities === "undefined" ||
      (Array.isArray(proposal.previewCapabilities) &&
        proposal.previewCapabilities.every((capability) => typeof capability === "string"))) &&
    (typeof proposal.previewClassification === "undefined" ||
      isPreviewClassification(proposal.previewClassification)) &&
    (typeof proposal.previewConfidence === "undefined" ||
      typeof proposal.previewConfidence === "number") &&
    (typeof proposal.previewMetadata === "undefined" ||
      isPlainRecord(proposal.previewMetadata)) &&
    (typeof proposal.previewRuntimeState === "undefined" ||
      proposal.previewRuntimeState === "empty" ||
      proposal.previewRuntimeState === "metadata_only" ||
      proposal.previewRuntimeState === "none" ||
      proposal.previewRuntimeState === "ready" ||
      proposal.previewRuntimeState === "unsupported") &&
    (typeof proposal.previewType === "undefined" ||
      isProposalPreviewType(proposal.previewType)) &&
    (typeof proposal.previewWarnings === "undefined" ||
      (Array.isArray(proposal.previewWarnings) &&
        proposal.previewWarnings.every((warning) => typeof warning === "string"))) &&
    (typeof proposal.proposalRoutingWarnings === "undefined" ||
      (Array.isArray(proposal.proposalRoutingWarnings) &&
        proposal.proposalRoutingWarnings.every(isProposalRoutingWarning))) &&
    (typeof proposal.proposalRoutingReasons === "undefined" ||
      (Array.isArray(proposal.proposalRoutingReasons) &&
        proposal.proposalRoutingReasons.every(isProposalRoutingReason))) &&
    (typeof proposal.selfReview === "undefined" ||
      isSelfReviewReport(proposal.selfReview)) &&
    (typeof proposal.selfReviewConfidence === "undefined" ||
      typeof proposal.selfReviewConfidence === "number") &&
    (typeof proposal.selfReviewFailureCount === "undefined" ||
      typeof proposal.selfReviewFailureCount === "number") &&
    (typeof proposal.selfReviewStatus === "undefined" ||
      isSelfReviewStatus(proposal.selfReviewStatus)) &&
    (typeof proposal.selfReviewWarningCount === "undefined" ||
      typeof proposal.selfReviewWarningCount === "number") &&
    (typeof proposal.realPreview === "undefined" ||
      isPlainRecord(proposal.realPreview)) &&
    (typeof proposal.previewDriftDetected === "undefined" ||
      typeof proposal.previewDriftDetected === "boolean") &&
    (typeof proposal.requiredPageCount === "undefined" ||
      proposal.requiredPageCount === null ||
      typeof proposal.requiredPageCount === "number") &&
    (typeof proposal.heroAssetMismatch === "undefined" ||
      typeof proposal.heroAssetMismatch === "boolean") &&
    (typeof proposal.approvalDecision === "undefined" ||
      isApprovalDecision(proposal.approvalDecision)) &&
    (typeof proposal.approvalDisabled === "undefined" ||
      typeof proposal.approvalDisabled === "boolean") &&
    (typeof proposal.approvalRecommendation === "undefined" ||
      proposal.approvalRecommendation === "approve" ||
      proposal.approvalRecommendation === "reject" ||
      proposal.approvalRecommendation === "review") &&
    (typeof proposal.completenessScore === "undefined" ||
      typeof proposal.completenessScore === "number") &&
    (typeof proposal.contentScore === "undefined" ||
      typeof proposal.contentScore === "number") &&
    (typeof proposal.fakeContentDetected === "undefined" ||
      typeof proposal.fakeContentDetected === "boolean") &&
    (typeof proposal.loremDetected === "undefined" ||
      typeof proposal.loremDetected === "boolean") &&
    (typeof proposal.placeholderDetected === "undefined" ||
      typeof proposal.placeholderDetected === "boolean") &&
    (typeof proposal.proposalQualityScore === "undefined" ||
      typeof proposal.proposalQualityScore === "number") &&
    (typeof proposal.proposalQualityStatus === "undefined" ||
      proposal.proposalQualityStatus === "blocked" ||
      proposal.proposalQualityStatus === "passed" ||
      proposal.proposalQualityStatus === "review_required" ||
      proposal.proposalQualityStatus === "warning") &&
    (typeof proposal.proposalRepairActionCount === "undefined" ||
      typeof proposal.proposalRepairActionCount === "number") &&
    (typeof proposal.proposalRepairApplied === "undefined" ||
      typeof proposal.proposalRepairApplied === "boolean") &&
    (typeof proposal.proposalRepairAttempted === "undefined" ||
      typeof proposal.proposalRepairAttempted === "boolean") &&
    (typeof proposal.proposalRepairConfidence === "undefined" ||
      typeof proposal.proposalRepairConfidence === "number") &&
    (typeof proposal.proposalRepairStatus === "undefined" ||
      proposal.proposalRepairStatus === "failed" ||
      proposal.proposalRepairStatus === "keep_blocked" ||
      proposal.proposalRepairStatus === "not_needed" ||
      proposal.proposalRepairStatus === "partial_repair" ||
      proposal.proposalRepairStatus === "repaired") &&
    (typeof proposal.proposalRepairStrategy === "undefined" ||
      typeof proposal.proposalRepairStrategy === "string") &&
    (typeof proposal.proposalRevalidationPassed === "undefined" ||
      typeof proposal.proposalRevalidationPassed === "boolean") &&
    (typeof proposal.proposalUnresolvedIssueCount === "undefined" ||
      typeof proposal.proposalUnresolvedIssueCount === "number") &&
    (typeof proposal.qualityBlockCount === "undefined" ||
      typeof proposal.qualityBlockCount === "number") &&
    (typeof proposal.qualityFailureCount === "undefined" ||
      typeof proposal.qualityFailureCount === "number") &&
    (typeof proposal.qualityWarningCount === "undefined" ||
      typeof proposal.qualityWarningCount === "number") &&
    (typeof proposal.requiresExtraReview === "undefined" ||
      typeof proposal.requiresExtraReview === "boolean") &&
    (typeof proposal.repeatedContentDetected === "undefined" ||
      typeof proposal.repeatedContentDetected === "boolean") &&
    (typeof proposal.runtimeStartAttempted === "undefined" ||
      typeof proposal.runtimeStartAttempted === "boolean") &&
    (typeof proposal.runtimeStartError === "undefined" ||
      proposal.runtimeStartError === null ||
      typeof proposal.runtimeStartError === "string") &&
    (typeof proposal.runtimeStartStatus === "undefined" ||
      proposal.runtimeStartStatus === null ||
      typeof proposal.runtimeStartStatus === "string") &&
    (typeof proposal.runtimeWarning === "undefined" ||
      proposal.runtimeWarning === null ||
      typeof proposal.runtimeWarning === "string") &&
    (typeof proposal.publicCopyCleanStatus === "undefined" ||
      proposal.publicCopyCleanStatus === "blocked" ||
      proposal.publicCopyCleanStatus === "clean" ||
      proposal.publicCopyCleanStatus === "review_required") &&
    (typeof proposal.sectionCopyQualityStatus === "undefined" ||
      proposal.sectionCopyQualityStatus === "blocked" ||
      proposal.sectionCopyQualityStatus === "clean" ||
      proposal.sectionCopyQualityStatus === "review_required") &&
    (typeof proposal.shouldBlockExecution === "undefined" ||
      typeof proposal.shouldBlockExecution === "boolean") &&
    (typeof proposal.staleTermScanStatus === "undefined" ||
      proposal.staleTermScanStatus === "blocked" ||
      proposal.staleTermScanStatus === "clean" ||
      proposal.staleTermScanStatus === "review_required") &&
    (typeof proposal.structureScore === "undefined" ||
      typeof proposal.structureScore === "number") &&
    (typeof proposal.suppressedContextCount === "undefined" ||
      typeof proposal.suppressedContextCount === "number") &&
    (typeof proposal.executionStrategy === "undefined" ||
      proposal.executionStrategy === "answer_only" ||
      proposal.executionStrategy === "docs_first_then_source" ||
      proposal.executionStrategy === "phased_code_plan" ||
      proposal.executionStrategy === "phased_proposal" ||
      proposal.executionStrategy === "single_proposal" ||
      proposal.executionStrategy === "single_targeted_edit" ||
      proposal.executionStrategy === "single_targeted_patch" ||
      proposal.executionStrategy === "static_site_build") &&
    (typeof proposal.milestoneCount === "undefined" ||
      typeof proposal.milestoneCount === "number") &&
    (typeof proposal.recommendedExecutionPolicy === "undefined" ||
      proposal.recommendedExecutionPolicy === "answer_only" ||
      proposal.recommendedExecutionPolicy === "docs_first_then_source" ||
      proposal.recommendedExecutionPolicy === "phased_proposal" ||
      proposal.recommendedExecutionPolicy === "single_proposal" ||
      proposal.recommendedExecutionPolicy === "single_targeted_patch") &&
    (typeof proposal.recommendedPhasePolicy === "undefined" ||
      proposal.recommendedPhasePolicy === "multi_phase" ||
      proposal.recommendedPhasePolicy === "single_pass" ||
      proposal.recommendedPhasePolicy === "targeted_only") &&
    (typeof proposal.taskKind === "undefined" ||
      proposal.taskKind === "answer_plan" ||
      proposal.taskKind === "code_app_build" ||
      proposal.taskKind === "targeted_text_replacement" ||
      proposal.taskKind === "visual_edit" ||
      proposal.taskKind === "website_generation") &&
    (typeof proposal.translatedBusinessType === "undefined" ||
      proposal.translatedBusinessType === null ||
      typeof proposal.translatedBusinessType === "string") &&
    (typeof proposal.translatedDomain === "undefined" ||
      proposal.translatedDomain === null ||
      typeof proposal.translatedDomain === "string") &&
    (typeof proposal.translatedFeatures === "undefined" ||
      (Array.isArray(proposal.translatedFeatures) &&
        proposal.translatedFeatures.every((feature) => typeof feature === "string"))) &&
    (typeof proposal.translatedStyle === "undefined" ||
      proposal.translatedStyle === null ||
      typeof proposal.translatedStyle === "string") &&
    (typeof proposal.todoDetected === "undefined" ||
      typeof proposal.todoDetected === "boolean") &&
    (typeof proposal.placeholderOnlyVisualDetected === "undefined" ||
      typeof proposal.placeholderOnlyVisualDetected === "boolean") &&
    (typeof proposal.visualBlockCount === "undefined" ||
      typeof proposal.visualBlockCount === "number") &&
    (typeof proposal.visualDriftDetected === "undefined" ||
      typeof proposal.visualDriftDetected === "boolean") &&
    (typeof proposal.visualFailureCount === "undefined" ||
      typeof proposal.visualFailureCount === "number") &&
    (typeof proposal.visualScore === "undefined" ||
      typeof proposal.visualScore === "number") &&
    (typeof proposal.visualValidationStatus === "undefined" ||
      proposal.visualValidationStatus === "blocked" ||
      proposal.visualValidationStatus === "passed" ||
      proposal.visualValidationStatus === "review_required" ||
      proposal.visualValidationStatus === "warning") &&
    (typeof proposal.visualWarningCount === "undefined" ||
      typeof proposal.visualWarningCount === "number") &&
    (typeof proposal.validationIssueCount === "undefined" ||
      typeof proposal.validationIssueCount === "number") &&
    (typeof proposal.designTokenCount === "undefined" ||
      typeof proposal.designTokenCount === "number") &&
    (typeof proposal.designTokenTheme === "undefined" ||
      typeof proposal.designTokenTheme === "string") &&
    (typeof proposal.designTokenValidationPassed === "undefined" ||
      typeof proposal.designTokenValidationPassed === "boolean") &&
    (typeof proposal.tokensStudioExportAvailable === "undefined" ||
      typeof proposal.tokensStudioExportAvailable === "boolean") &&
    (typeof proposal.memoryIgnoredForNewProject === "undefined" ||
      typeof proposal.memoryIgnoredForNewProject === "boolean") &&
    (typeof proposal.plannerGeneratorAligned === "undefined" ||
      typeof proposal.plannerGeneratorAligned === "boolean") &&
    (typeof proposal.sourceOfTruthDomain === "undefined" ||
      proposal.sourceOfTruthDomain === null ||
      typeof proposal.sourceOfTruthDomain === "string") &&
    (typeof proposal.sourceOfTruthPages === "undefined" ||
      isStringArray(proposal.sourceOfTruthPages)) &&
    (typeof proposal.sourceOfTruthPrompt === "undefined" ||
      typeof proposal.sourceOfTruthPrompt === "string") &&
    (typeof proposal.validatorPlanAligned === "undefined" ||
      typeof proposal.validatorPlanAligned === "boolean") &&
    (typeof proposal.websiteAudience === "undefined" ||
      typeof proposal.websiteAudience === "string") &&
    (typeof proposal.websiteGoal === "undefined" ||
      typeof proposal.websiteGoal === "string") &&
    (typeof proposal.websiteIndustry === "undefined" ||
      typeof proposal.websiteIndustry === "string") &&
    (typeof proposal.websiteLayoutType === "undefined" ||
      typeof proposal.websiteLayoutType === "string") &&
    (typeof proposal.websiteSectionCount === "undefined" ||
      typeof proposal.websiteSectionCount === "number") &&
    (typeof proposal.websiteValidationPassed === "undefined" ||
      typeof proposal.websiteValidationPassed === "boolean") &&
    (typeof proposal.websiteVisualStrategy === "undefined" ||
      typeof proposal.websiteVisualStrategy === "string") &&
    Array.isArray(proposal.changes) &&
    proposal.changes.every(
      (change) => {
        if (!change || typeof change !== "object" || typeof change.summary !== "string") {
          return false;
        }

        if (isRuntimeProposalAction(change.action)) {
          return true;
        }

        if (isDeleteProposalAction(change.action)) {
          return typeof change.path === "string";
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

function normalizeProposalFiles(proposal: DiffProposal): DiffProposal {
  const dedupedChanges = new Map<string, DiffProposal["changes"][number]>();
  const nextChanges: DiffProposal["changes"] = [];

  for (const change of proposal.changes) {
    if (isDeleteProposalAction(change.action)) {
      const path = normalizeSafeProjectPath(change.path);
      if (path) nextChanges.push({ ...change, path });
      continue;
    }

    if (!isFileProposalAction(change.action)) {
      nextChanges.push(change);
      continue;
    }

    const path = normalizeSafeProjectPath(change.path);

    if (!path || typeof change.proposedContent !== "string" || change.proposedContent.length === 0) {
      continue;
    }

    dedupedChanges.set(path, {
      ...change,
      path
    });
  }

  return {
    ...proposal,
    changes: [...nextChanges, ...dedupedChanges.values()]
  };
}

function proposalFromFileBlocks(files: Array<{ content: string; path: string }>): DiffProposal | null {
  const deduped = new Map<string, string>();

  for (const file of files) {
    const path = normalizeSafeProjectPath(file.path);

    if (!path || typeof file.content !== "string" || file.content.length === 0) {
      continue;
    }

    deduped.set(path, file.content);
  }

  if (deduped.size === 0) {
    return null;
  }

  return {
    changes: [...deduped.entries()].map(([path, proposedContent]) => ({
      action: "update",
      path,
      proposedContent,
      summary: `Update ${path}`
    })),
    id: `proposal-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    mode: "EXECUTE",
    projectId: null,
    status: "pending",
    summary: `Prepared ${deduped.size} file change(s).`
  };
}

function parseJsonProposal(value: unknown) {
  if (isDiffProposal(value)) {
    return normalizeProposalFiles(value);
  }

  if (Array.isArray(value)) {
    const files = value.flatMap((item) => {
      if (!item || typeof item !== "object") return [];

      const record = item as { content?: unknown; path?: unknown };

      return typeof record.path === "string" && typeof record.content === "string"
        ? [{ content: record.content, path: record.path }]
        : [];
    });

    return proposalFromFileBlocks(files);
  }

  return null;
}

function extractXmlFileBlocks(content: string) {
  return Array.from(content.matchAll(/<file\b[^>]*path=["']([^"']+)["'][^>]*>([\s\S]*?)(?:<\/file>|$)/gi))
    .map((match) => ({
      content: match[2] ?? "",
      path: match[1] ?? ""
    }));
}

function extractMarkdownFileBlocks(content: string) {
  return Array.from(content.matchAll(/```[^\n]*\n([\s\S]*?)```/g)).flatMap((match) => {
    const block = match[1] ?? "";
    const lines = block.split(/\r?\n/);
    const pathMatch = lines[0]?.match(/^\s*(?:\/\/|#|<!--)\s*path:\s*([^->\s]+)\s*(?:-->)?\s*$/i);

    if (!pathMatch?.[1]) {
      return [];
    }

    return [{
      content: lines.slice(1).join("\n"),
      path: pathMatch[1]
    }];
  });
}

function parseDiffProposal(content: string) {
  if (!content.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(content) as unknown;
    const proposal = parseJsonProposal(parsed);

    if (proposal) {
      return proposal;
    }
  } catch {
    // Continue with tolerant extraction below.
  }

  const jsonArrayMatch = content.match(/\[[\s\S]*\]/);

  if (jsonArrayMatch) {
    try {
      const proposal = parseJsonProposal(JSON.parse(jsonArrayMatch[0]) as unknown);

      if (proposal) {
        return proposal;
      }
    } catch {
      // Continue with file block extraction.
    }
  }

  return proposalFromFileBlocks([
    ...extractXmlFileBlocks(content),
    ...extractMarkdownFileBlocks(content)
  ]);
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [createGreetingMessage()],
  input: "",
  model: defaultModel,
  modelSelectionPolicy: "automatic",
  mode: "ASK",
  productMode: "ASK",
  isStreaming: false,
  proposal: null,
  pendingHandoff: null,
  chatSessionId: null,
  hydrateChat: (messages, sessionId) => {
    const hydratedMessages = normalizeHydratedMessages(messages);

    console.info("hydrate chat input", {
      messages: messages.length,
      normalizedMessages: hydratedMessages.length,
      sessionId
    });

    set({
      chatSessionId: sessionId,
      messages: hydratedMessages.length > 0 ? hydratedMessages : [createGreetingMessage()]
    });
  },
  setInput: (input) => set({ input }),
  setModel: (model) => set({ model, modelSelectionPolicy: "locked" }),
  setModelSelectionPolicy: (modelSelectionPolicy) => set({ modelSelectionPolicy }),
  activateHandoff: (handoff) => {
    canonicalProjectState.setMode(handoff.targetMode);
    set({
      input: handoffTargetDraft(handoff),
      mode: productModeToAiMode(handoff.targetMode),
      pendingHandoff: handoff,
      productMode: handoff.targetMode,
      proposal: null
    });
  },
  setMode: (mode) => {
    canonicalProjectState.setMode(aiModeToProductMode(mode));
    set({ mode, pendingHandoff: null, productMode: aiModeToProductMode(mode), proposal: null });
  },
  setProductMode: (productMode) => {
    canonicalProjectState.setMode(productMode);
    set({ mode: productModeToAiMode(productMode), pendingHandoff: null, productMode, proposal: null });
  },
  clearProposal: () => {
    canonicalProjectState.clearProposalState();
    set({ proposal: null });
  },
  markProposalApproved: (metadata) => {
    canonicalProjectState.clearProposalState();
    set((state) => ({
      proposal: state.proposal
        ? {
            ...state.proposal,
            ...(metadata ?? {}),
            status: "approved"
          }
        : null
    }));
  },
  sendMessage: async (workspaceContext) => {
    const prompt = get().input.trim();
    const mode = get().mode;
    const pendingHandoff = get().pendingHandoff;

    if (!prompt || get().isStreaming) {
      return;
    }

    const userMessage = createMessage("user", prompt);
    const assistantMessage = createMessage("assistant", "");
    const nextMessages = [...get().messages, userMessage, assistantMessage];

    set({ input: "", isStreaming: true, messages: nextMessages, pendingHandoff: null, proposal: null });

    try {
      const response = await fetch("/api/ai/chat", {
        body: JSON.stringify({
          messages: nextMessages
            .filter((message) => message.content.trim().length > 0)
            .map(({ role, content, providerFailureCategory, responseKind }) => ({ role, content, providerFailureCategory, responseKind })),
          chatSessionId: workspaceContext.chatSessionId,
          handoff: pendingHandoff,
          mode,
          model: get().model,
          modelSelectionPolicy: get().modelSelectionPolicy,
          productMode: get().productMode,
          projectId: workspaceContext.projectId,
          workspace: {
            activeFileContent: workspaceContext.activeFileContent,
            activePath: workspaceContext.activePath,
            fileContents: workspaceContext.fileContents,
            fileList: workspaceContext.fileList,
            projectName: workspaceContext.projectName
          }
        }),
        headers: {
          "Content-Type": "application/json"
        },
        method: "POST"
      });

      if (!response.ok || !response.body) {
        throw new Error("Unable to start assistant stream.");
      }

      const responseSessionId = response.headers.get("x-hassali-chat-session-id");
      const responseKind = response.headers.get("x-hassali-ask-response-kind") as ChatMessage["responseKind"] | null;
      const providerFailureCategory = response.headers.get("x-hassali-ask-provider-failure");

      if (responseSessionId) {
        set({ chatSessionId: responseSessionId });
      }

      if (responseKind) {
        set((state) => ({
          messages: state.messages.map((message) => message.id === assistantMessage.id
            ? {
                ...message,
                responseKind,
                providerFailureCategory: providerFailureCategory && providerFailureCategory !== "none" ? providerFailureCategory : null
              }
            : message)
        }));
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantContent = "";

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        assistantContent += chunk;

        set((state) => ({
          messages: state.messages.map((message) =>
            message.id === assistantMessage.id
              ? { ...message, content: `${message.content}${chunk}` }
              : message
          )
        }));
      }

      const handoffIndex = assistantContent.indexOf(handoffMarker);

      if (handoffIndex !== -1) {
        const visibleContent = assistantContent.slice(0, handoffIndex).trim();
        const handoff = parseModeHandoff(assistantContent.slice(handoffIndex + handoffMarker.length).trim());

        set((state) => ({
          messages: state.messages.map((message) =>
            message.id === assistantMessage.id
              ? {
                  ...message,
                  content: visibleContent || message.content,
                  handoff
                }
              : message
          )
        }));
        assistantContent = visibleContent;
      }

      if (mode === "SUGGEST" || mode === "EXECUTE") {
        const markerIndex = assistantContent.indexOf(proposalMarker);

        if (markerIndex !== -1) {
          const visibleContent = assistantContent.slice(0, markerIndex).trim();
          const proposalContent = assistantContent.slice(markerIndex + proposalMarker.length).trim();
          const parsedProposal = parseDiffProposal(proposalContent);

          if (!parsedProposal) {
            set((state) => ({
              messages: state.messages.map((message) =>
                message.id === assistantMessage.id
                  ? {
                      ...message,
                      content:
                        visibleContent ||
                        "I could not turn the model response into a safe diff proposal. Try a smaller, more specific change."
                    }
                  : message
              ),
              proposal: null
            }));

            return;
          }

          set((state) => ({
            messages: state.messages.map((message) =>
              message.id === assistantMessage.id
                ? {
                    ...message,
                    content: visibleContent || parsedProposal.summary
                  }
                : message
            ),
            proposal: {
              ...parsedProposal,
              status: "pending"
            }
          }));
          canonicalProjectState.stageProposal({
            ...parsedProposal,
            status: "pending"
          });
        }
      }
    } catch {
      set((state) => ({
        messages: state.messages.map((message) =>
          message.id === assistantMessage.id
            ? {
                ...message,
                content: "The assistant stream could not start. Check the server configuration."
              }
            : message
        )
      }));
    } finally {
      set({ isStreaming: false });
    }
  }
}));
