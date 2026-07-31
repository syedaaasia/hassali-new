"use client";

import { normalizeSafeProjectPath } from "@/lib/utils/path";

export type RuntimeProposalChange = {
  action: string;
  diffPreview?: string;
  path?: string;
  proposedContent?: string;
  summary: string;
};

export type RuntimeApprovalResponse = {
  applied?: boolean;
  appliedSteps?: string[];
  codeExecution?: {
    completionStatus: "BLOCKED" | "CANCELLED" | "COMPLETE_VERIFIED" | "COMPLETE_WITH_LIMITATIONS" | "FAILED";
    executionPolicy: "AUTOPILOT_EXPERIMENTAL" | "CALM" | "FLOW";
    limitations: string[];
    metrics: {
      commandsExecuted: number;
      repairAttempts: number;
      repairsApplied: number;
      rollbackUsed: boolean;
      successfulAttempt: number | null;
      verificationOutcome: "FAILED" | "LIMITED" | "PASSED";
    };
    progress: Array<{
      at: string;
      label: string;
      state: string;
      status: "active" | "complete" | "failed" | "pending";
    }>;
    state: string;
  } | null;
  duplicateSuppressed?: boolean;
  backendExecutionRuntime?: {
    apiStatus: "candidate" | "failed" | "running";
    endpointCount: number;
    error: string | null;
    framework: string;
    healthStatus: "blocked" | "healthy" | "unknown";
    logs: string[];
    port: number | null;
    previewUrl: string | null;
    projectId: string;
    routeCount: number;
    runtimeId: string | null;
    runtimeStatus: "blocked" | "error" | "running" | "starting" | "stopped";
    startedAt: string | null;
    workspaceRoot: string;
  } | null;
  blockedSteps?: Array<{
    reasons?: Array<{
      message?: string;
    }>;
    stepId?: string;
  }>;
  errors?: string[];
  events?: Array<{
    message?: string;
    metadata?: Record<string, unknown>;
    type?: string;
  }>;
  fileContents?: Record<string, string>;
  requestedWorkerType?: string;
  runnerId?: string | null;
  runnerStatus?: string;
  runtimeOptional?: boolean;
  runtimeStartAttempted?: boolean;
  runtimeStartError?: string | null;
  runtimeStartStatus?: "blocked" | "failed" | "not_started" | "planned" | "running" | "stopped";
  runtimeWarning?: string | null;
  selectedWorkerType?: string | null;
  skippedSteps?: string[];
  snapshot?: {
    snapshotId?: string | null;
    snapshotStatus?: string;
  } | null;
  verification?: {
    details?: string[];
    ok?: boolean;
  } | null;
  viteRuntime?: {
    error: string | null;
    logs: string[];
    port: number | null;
    previewUrl: string | null;
    projectId: string;
    runtimeId: string | null;
    runtimeStatus: "blocked" | "error" | "running" | "starting" | "stopped";
    startedAt: string | null;
    workspaceRoot: string;
  } | null;
  workerExecutionDurationMs?: number | null;
  workerExecutionExitCode?: number | null;
  workerExecutionFinishedAt?: string | null;
  workerExecutionStartedAt?: string | null;
  workerExecutionStatus?: string | null;
  workerExecutionStderr?: string | null;
  workerExecutionStdout?: string | null;
  workerFallbackReason?: string | null;
  workerResult?: unknown;
  liveRuntimePreview?: {
    liveRuntimePreviewSyncedAt?: string;
    previewRuntime?: {
      capabilities?: string[];
      classification?: Record<string, unknown>;
      metadata?: Record<string, unknown>;
      realPreview?: Record<string, unknown>;
      state?: string;
      warnings?: string[];
    };
    syncStatus?: string;
  } | null;
  nextRuntime?: {
    error: string | null;
    framework: "next_app";
    logs: string[];
    port: number | null;
    previewUrl: string | null;
    projectId: string;
    routerKind: "app_router" | "mixed" | "pages_router" | "unknown";
    runtimeId: string | null;
    runtimeStatus: "blocked" | "error" | "running" | "starting" | "stopped";
    startedAt: string | null;
    workspaceRoot: string;
  } | null;
  ok?: boolean;
  postApplyPreview?: {
    commandSource: string;
    existingProcessReused: boolean;
    failureClass: string;
    failureDetails: string | null;
    filesApplied: boolean;
    filesChanged: string[];
    httpStatus: number | null;
    packageManager: string;
    port: number | null;
    portSelectionResult: string;
    previewAttempted: boolean;
    previewReady: boolean;
    previewUrl: string | null;
    processStarted: boolean;
    readinessVerified: boolean;
    recoverySteps: string[];
    runnableTargetDetected: boolean;
    runtimeKind: string;
    runtimeStatus: string;
    selectedCommand: string | null;
    selectedScript: string | null;
    summary: string;
    validationWarnings: Array<{
      code: string;
      message: string;
    }>;
    verificationStatus: string;
    workspacePath: string | null;
  } | null;
  previewMetadata?: Record<string, unknown> | null;
  websitePreviewFidelity?: {
    assetPathsVerified: boolean;
    expectedIdentity: string | null;
    failureClass: string;
    failureDetails: string | null;
    filesApplied: boolean;
    generatedRouteVerified: boolean;
    generatedWorkspaceVerified: boolean;
    httpReadiness: "NOT_APPLICABLE_SRC_DOC";
    observedIdentity: string | null;
    previewAttempted: boolean;
    previewContentVerified: boolean;
    previewReady: boolean;
    previewType: "static_website";
    previewUrl: null;
    recoverySteps: string[];
    route: string;
    summary: string;
  } | null;
  mobileRuntime?: {
    candidateCommands: string[];
    capabilities: string[];
    deviceType: string;
    error: string | null;
    framework: string;
    logs: string[];
    navigation: string[];
    previewUrl: null;
    projectId: string;
    runtimeId: string;
    screens: string[];
    status: "blocked" | "candidate" | "metadata_only";
    workspaceRoot: string;
  } | null;
  workspaceBindingStatus?: string;
  workspaceCreated?: boolean;
  workspaceRoot?: string;
  workspaceWarnings?: string[];
  verificationOk?: boolean | null;
  writtenFiles?: string[];
  deletedFiles?: string[];
};

export type RuntimeSyncedFile = {
  content: string;
  path: string;
};

export type RuntimeSyncMetadata = {
  postApplyCommandSource?: string | null;
  postApplyFailureClass?: string | null;
  postApplyPackageManager?: string | null;
  postApplyPortSelectionResult?: string | null;
  postApplyPreviewAttempted?: boolean;
  postApplyPreviewReady?: boolean;
  postApplyPreviewReused?: boolean;
  postApplyProcessStarted?: boolean;
  postApplyReadinessVerified?: boolean;
  postApplyRecoveryProvided?: boolean;
  postApplyRuntimeKind?: string | null;
  postApplyRuntimeStatus?: string | null;
  runtimeRunnerId?: string | null;
  runtimeRunnerStatus?: string | null;
  runtimeStartAttempted?: boolean;
  runtimeStartError?: string | null;
  runtimeStartStatus?: string | null;
  runtimeWarning?: string | null;
  runtimeNextPreviewUrl?: string | null;
  runtimeNextRouterKind?: string | null;
  runtimeNextStatus?: string | null;
  runtimeBackendPreviewUrl?: string | null;
  runtimeBackendStatus?: string | null;
  runtimeMobileFramework?: string | null;
  runtimeMobileStatus?: string | null;
  runtimeSnapshotId?: string | null;
  runtimeSnapshotStatus?: string | null;
  runtimeSyncStatus: RuntimeSyncStatus;
  runtimeSyncedAt: string;
  runtimeVerificationOk?: boolean | null;
  runtimeVitePreviewUrl?: string | null;
  runtimeViteStatus?: string | null;
  runtimeWrittenFiles: string[];
  selectedWorkerType?: string | null;
  workerExecutionDurationMs?: number | null;
  workerExecutionStatus?: string | null;
  livePreviewCapabilities?: string[];
  livePreviewClassification?: Record<string, unknown>;
  livePreviewMetadata?: Record<string, unknown>;
  livePreviewRuntimeState?: string | null;
  livePreviewWarnings?: string[];
  liveRealPreview?: Record<string, unknown>;
  liveRuntimePreviewSyncedAt?: string | null;
  websitePreviewContentVerified?: boolean;
  websitePreviewFailureClass?: string | null;
  websitePreviewReady?: boolean;
  websitePreviewRoute?: string | null;
};

export type RuntimeSyncStatus = "failed" | "partial" | "skipped" | "synced";

export type RuntimeResultSyncInput = {
  activePath?: string | null;
  currentFiles: Record<string, { content: string }>;
  projectId: string;
  proposalChanges: RuntimeProposalChange[];
  proposalId: string;
  runtimeResult: RuntimeApprovalResponse | null;
};

export type RuntimeResultSyncOutput = {
  deletedFiles: string[];
  errors: string[];
  fileUpdates: RuntimeSyncedFile[];
  proposalApplied: boolean;
  refreshedPreview: boolean;
  runtimeMetadata: RuntimeSyncMetadata;
  selectedFileUpdated: boolean;
  syncStatus: RuntimeSyncStatus;
  syncedFiles: string[];
  warnings: string[];
};

const fileActions = new Set(["create", "modify", "update", "write_file"]);
const previewFilePattern = /\.(css|html|js|jsx|mjs|tsx?)$/i;

function normalizePath(value: unknown) {
  return normalizeSafeProjectPath(value);
}

function writtenFilesFromEvents(runtimeResult: RuntimeApprovalResponse | null) {
  return (runtimeResult?.events ?? [])
    .filter((event) => event.type === "file_written")
    .map((event) => normalizePath(event.metadata?.path))
    .filter((path): path is string => Boolean(path));
}

function deletedFilesFromEvents(runtimeResult: RuntimeApprovalResponse | null) {
  return (runtimeResult?.events ?? [])
    .filter((event) => event.type === "file_deleted")
    .map((event) => normalizePath(event.metadata?.path))
    .filter((path): path is string => Boolean(path));
}

export function syncRuntimeApprovalResult(
  input: RuntimeResultSyncInput
): RuntimeResultSyncOutput {
  const warnings: string[] = [];
  const errors: string[] = [];
  const runtimeWrittenFiles = [
    ...(input.runtimeResult?.writtenFiles ?? []),
    ...writtenFilesFromEvents(input.runtimeResult)
  ]
    .map(normalizePath)
    .filter((path): path is string => Boolean(path));
  const uniqueRuntimeWrittenFiles = Array.from(new Set(runtimeWrittenFiles));
  const deletedFiles = Array.from(new Set([
    ...(input.runtimeResult?.deletedFiles ?? []),
    ...deletedFilesFromEvents(input.runtimeResult)
  ].map(normalizePath).filter((path): path is string => Boolean(path))));
  const fileChanges = input.proposalChanges
    .filter((change) => fileActions.has(change.action))
    .map((change) => ({
      ...change,
      path: normalizePath(change.path)
    }))
    .filter((change): change is RuntimeProposalChange & { path: string } => Boolean(change.path));

  if (input.runtimeResult?.runnerStatus === "failed" || input.runtimeResult?.verification?.ok === false) {
    errors.push("Runtime approval did not complete verification.");
  }

  if (input.runtimeResult?.runtimeWarning) {
    warnings.push(input.runtimeResult.runtimeWarning);
  }

  const writtenFileSet = new Set(uniqueRuntimeWrittenFiles);
  const shouldUseFallback = fileChanges.length > 0 && writtenFileSet.size === 0;

  if (shouldUseFallback) {
    warnings.push("Runtime response did not include writtenFiles; using approved proposal changes as the sync source.");
    fileChanges.forEach((change) => writtenFileSet.add(change.path));
  }

  const fileUpdates = fileChanges.flatMap((change) => {
    if (!writtenFileSet.has(change.path)) {
      return [];
    }

    const authoritativeContent = input.runtimeResult?.fileContents?.[change.path];
    const content = typeof authoritativeContent === "string"
      ? authoritativeContent
      : change.proposedContent;

    if (typeof content !== "string") {
      warnings.push(`Runtime wrote ${change.path}, but the proposal did not include local content to sync.`);
      return [];
    }

    return [{ content, path: change.path }];
  });

  for (const path of writtenFileSet) {
    if (!fileUpdates.some((update) => update.path === path)) {
      warnings.push(`Runtime reported ${path}, but Hassali could not match it to a proposal change.`);
    }
  }

  const syncedFiles = fileUpdates.map((update) => update.path);
  const syncStatus: RuntimeSyncStatus =
    errors.length > 0
      ? "failed"
      : fileChanges.length === 0 && deletedFiles.length === 0
        ? "skipped"
        : syncedFiles.length === fileChanges.length
          ? "synced"
          : syncedFiles.length > 0
            ? "partial"
            : "failed";
  const runtimeMetadata: RuntimeSyncMetadata = {
    livePreviewCapabilities: input.runtimeResult?.liveRuntimePreview?.previewRuntime?.capabilities ?? [],
    livePreviewClassification: input.runtimeResult?.liveRuntimePreview?.previewRuntime?.classification,
    livePreviewMetadata: input.runtimeResult?.previewMetadata ??
      input.runtimeResult?.liveRuntimePreview?.previewRuntime?.metadata,
    livePreviewRuntimeState: input.runtimeResult?.liveRuntimePreview?.previewRuntime?.state ?? null,
    livePreviewWarnings: input.runtimeResult?.liveRuntimePreview?.previewRuntime?.warnings ?? [],
    liveRealPreview: input.runtimeResult?.liveRuntimePreview?.previewRuntime?.realPreview,
    liveRuntimePreviewSyncedAt: input.runtimeResult?.liveRuntimePreview?.liveRuntimePreviewSyncedAt ?? null,
    websitePreviewContentVerified: input.runtimeResult?.websitePreviewFidelity?.previewContentVerified ?? false,
    websitePreviewFailureClass: input.runtimeResult?.websitePreviewFidelity?.failureClass ?? null,
    websitePreviewReady: input.runtimeResult?.websitePreviewFidelity?.previewReady ?? false,
    websitePreviewRoute: input.runtimeResult?.websitePreviewFidelity?.route ?? null,
    postApplyCommandSource: input.runtimeResult?.postApplyPreview?.commandSource ?? null,
    postApplyFailureClass: input.runtimeResult?.postApplyPreview?.failureClass ?? null,
    postApplyPackageManager: input.runtimeResult?.postApplyPreview?.packageManager ?? null,
    postApplyPortSelectionResult: input.runtimeResult?.postApplyPreview?.portSelectionResult ?? null,
    postApplyPreviewAttempted: input.runtimeResult?.postApplyPreview?.previewAttempted ?? false,
    postApplyPreviewReady: input.runtimeResult?.postApplyPreview?.previewReady ?? false,
    postApplyPreviewReused: input.runtimeResult?.postApplyPreview?.existingProcessReused ?? false,
    postApplyProcessStarted: input.runtimeResult?.postApplyPreview?.processStarted ?? false,
    postApplyReadinessVerified: input.runtimeResult?.postApplyPreview?.readinessVerified ?? false,
    postApplyRecoveryProvided: Boolean(input.runtimeResult?.postApplyPreview?.recoverySteps.length),
    postApplyRuntimeKind: input.runtimeResult?.postApplyPreview?.runtimeKind ?? null,
    postApplyRuntimeStatus: input.runtimeResult?.postApplyPreview?.runtimeStatus ?? null,
    runtimeRunnerId: input.runtimeResult?.runnerId ?? null,
    runtimeRunnerStatus: input.runtimeResult?.runnerStatus ?? null,
    runtimeStartAttempted: input.runtimeResult?.runtimeStartAttempted ?? false,
    runtimeStartError: input.runtimeResult?.runtimeStartError ?? null,
    runtimeStartStatus: input.runtimeResult?.runtimeStartStatus ?? null,
    runtimeWarning: input.runtimeResult?.runtimeWarning ?? null,
    runtimeNextPreviewUrl: input.runtimeResult?.nextRuntime?.previewUrl ?? null,
    runtimeNextRouterKind: input.runtimeResult?.nextRuntime?.routerKind ?? null,
    runtimeNextStatus: input.runtimeResult?.nextRuntime?.runtimeStatus ?? null,
    runtimeBackendPreviewUrl: input.runtimeResult?.backendExecutionRuntime?.previewUrl ?? null,
    runtimeBackendStatus: input.runtimeResult?.backendExecutionRuntime?.runtimeStatus ?? null,
    runtimeMobileFramework: input.runtimeResult?.mobileRuntime?.framework ?? null,
    runtimeMobileStatus: input.runtimeResult?.mobileRuntime?.status ?? null,
    runtimeSnapshotId: input.runtimeResult?.snapshot?.snapshotId ?? null,
    runtimeSnapshotStatus: input.runtimeResult?.snapshot?.snapshotStatus ?? null,
    runtimeSyncStatus: syncStatus,
    runtimeSyncedAt: new Date().toISOString(),
    runtimeVerificationOk: input.runtimeResult?.verification?.ok ?? null,
    runtimeVitePreviewUrl: input.runtimeResult?.viteRuntime?.previewUrl ?? null,
    runtimeViteStatus: input.runtimeResult?.viteRuntime?.runtimeStatus ?? null,
    runtimeWrittenFiles: uniqueRuntimeWrittenFiles.length > 0 ? uniqueRuntimeWrittenFiles : syncedFiles,
    selectedWorkerType: input.runtimeResult?.selectedWorkerType ?? null,
    workerExecutionDurationMs: input.runtimeResult?.workerExecutionDurationMs ?? null,
    workerExecutionStatus: input.runtimeResult?.workerExecutionStatus ?? null
  };

  return {
    deletedFiles,
    errors,
    fileUpdates,
    proposalApplied: syncStatus === "synced" || syncStatus === "skipped",
    refreshedPreview: fileUpdates.some((update) => previewFilePattern.test(update.path)) || deletedFiles.some((path) => previewFilePattern.test(path)),
    runtimeMetadata,
    selectedFileUpdated: Boolean(
      input.activePath && syncedFiles.includes(normalizePath(input.activePath) ?? "")
    ),
    syncStatus,
    syncedFiles,
    warnings
  };
}
