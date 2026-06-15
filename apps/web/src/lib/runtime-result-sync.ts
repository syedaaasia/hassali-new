"use client";

export type RuntimeProposalChange = {
  action: string;
  diffPreview?: string;
  path?: string;
  proposedContent?: string;
  summary: string;
};

export type RuntimeApprovalResponse = {
  appliedSteps?: string[];
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
  requestedWorkerType?: string;
  runnerId?: string | null;
  runnerStatus?: string;
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
  workerExecutionDurationMs?: number | null;
  workerExecutionExitCode?: number | null;
  workerExecutionFinishedAt?: string | null;
  workerExecutionStartedAt?: string | null;
  workerExecutionStatus?: string | null;
  workerExecutionStderr?: string | null;
  workerExecutionStdout?: string | null;
  workerFallbackReason?: string | null;
  workerResult?: unknown;
  workspaceBindingStatus?: string;
  workspaceCreated?: boolean;
  workspaceRoot?: string;
  workspaceWarnings?: string[];
  writtenFiles?: string[];
};

export type RuntimeSyncedFile = {
  content: string;
  path: string;
};

export type RuntimeSyncMetadata = {
  runtimeRunnerId?: string | null;
  runtimeRunnerStatus?: string | null;
  runtimeSnapshotId?: string | null;
  runtimeSnapshotStatus?: string | null;
  runtimeSyncStatus: RuntimeSyncStatus;
  runtimeSyncedAt: string;
  runtimeVerificationOk?: boolean | null;
  runtimeWrittenFiles: string[];
  selectedWorkerType?: string | null;
  workerExecutionDurationMs?: number | null;
  workerExecutionStatus?: string | null;
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
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value
    .trim()
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");

  if (!normalized || normalized.includes("../") || normalized === "..") {
    return null;
  }

  return normalized;
}

function writtenFilesFromEvents(runtimeResult: RuntimeApprovalResponse | null) {
  return (runtimeResult?.events ?? [])
    .filter((event) => event.type === "file_written")
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

    if (typeof change.proposedContent !== "string") {
      warnings.push(`Runtime wrote ${change.path}, but the proposal did not include local content to sync.`);
      return [];
    }

    return [{ content: change.proposedContent, path: change.path }];
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
      : fileChanges.length === 0
        ? "skipped"
        : syncedFiles.length === fileChanges.length
          ? "synced"
          : syncedFiles.length > 0
            ? "partial"
            : "failed";
  const runtimeMetadata: RuntimeSyncMetadata = {
    runtimeRunnerId: input.runtimeResult?.runnerId ?? null,
    runtimeRunnerStatus: input.runtimeResult?.runnerStatus ?? null,
    runtimeSnapshotId: input.runtimeResult?.snapshot?.snapshotId ?? null,
    runtimeSnapshotStatus: input.runtimeResult?.snapshot?.snapshotStatus ?? null,
    runtimeSyncStatus: syncStatus,
    runtimeSyncedAt: new Date().toISOString(),
    runtimeVerificationOk: input.runtimeResult?.verification?.ok ?? null,
    runtimeWrittenFiles: uniqueRuntimeWrittenFiles.length > 0 ? uniqueRuntimeWrittenFiles : syncedFiles,
    selectedWorkerType: input.runtimeResult?.selectedWorkerType ?? null,
    workerExecutionDurationMs: input.runtimeResult?.workerExecutionDurationMs ?? null,
    workerExecutionStatus: input.runtimeResult?.workerExecutionStatus ?? null
  };

  return {
    errors,
    fileUpdates,
    proposalApplied: syncStatus === "synced" || syncStatus === "skipped",
    refreshedPreview: fileUpdates.some((update) => previewFilePattern.test(update.path)),
    runtimeMetadata,
    selectedFileUpdated: Boolean(
      input.activePath && syncedFiles.includes(normalizePath(input.activePath) ?? "")
    ),
    syncStatus,
    syncedFiles,
    warnings
  };
}
