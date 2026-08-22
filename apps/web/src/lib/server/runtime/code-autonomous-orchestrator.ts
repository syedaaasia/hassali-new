import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { sanitizeUntrustedToolText } from "@/lib/server/intelligence/security-kernel";
import {
  applyCodeRepairAttempt,
  rollbackCodeRepairAttempt
} from "./code-attempt-snapshot";
import { runCodeCommandSuite } from "./code-command-executor";
import {
  clearCodeRepositoryInspectionCache,
  inspectCodeRepository
} from "./code-repository-inspector";
import { createOpenRouterCodeRepairProvider } from "./code-repair-provider";
import {
  normalizeCodeExecutionPolicy,
  repairBudgetForPolicy,
  type CodeCommandKind,
  type CodeCommandResult,
  type CodeCommandSpec,
  type CodeExecutionPolicy,
  type CodeExecutionReport,
  type CodeFailureEvidence,
  type CodeFailureType,
  type CodeProgressEvent,
  type CodeRepairAttempt,
  type CodeRepairProvider
} from "./code-execution-types";
import { isServerOwnedProjectWorkspaceRoot } from "./workspace-binding";
import { buildChangeLedger, fingerprintFileContents } from "./verification-recovery/change-safety";
import {
  buildDeliveryReadiness,
  buildVerificationPlan,
  commandResultsToEvidence,
  decideRepairEligibility,
  evaluateVerificationPlan,
  reviewImplementation,
  successClaim
} from "./verification-recovery/verification-engine";

const nonRepairableFailures = new Set<CodeFailureType>([
  "AUTH_ERROR",
  "ENVIRONMENT_ERROR",
  "EXTERNAL_SERVICE_ERROR",
  "NETWORK_ERROR",
  "PERMISSION_ERROR",
  "PROCESS_TEARDOWN_ERROR",
  "PROJECT_SCOPE_ERROR",
  "TEST_HARNESS_ERROR"
]);

export function selectCodeVerificationCommands(
  commands: CodeCommandSpec[],
  requestedKinds?: CodeCommandKind[]
) {
  if (!requestedKinds?.length) return commands;
  const allowed = new Set(requestedKinds);
  return commands.filter((command) => allowed.has(command.kind));
}
const severity: Record<CodeFailureType, number> = {
  API_ERROR: 5,
  AUTH_ERROR: 8,
  BROWSER_ERROR: 5,
  BUILD_ERROR: 5,
  CONSOLE_ERROR: 5,
  DEPENDENCY_ERROR: 7,
  ENVIRONMENT_ERROR: 8,
  EXTERNAL_SERVICE_ERROR: 8,
  NETWORK_ERROR: 7,
  PERMISSION_ERROR: 9,
  PROCESS_TEARDOWN_ERROR: 10,
  PROJECT_SCOPE_ERROR: 10,
  PROVIDER_ERROR: 7,
  RUNTIME_ERROR: 6,
  TEST_FAILURE: 5,
  TEST_HARNESS_ERROR: 7,
  TOOL_ERROR: 6,
  TYPE_ERROR: 4,
  UNKNOWN: 6
};

export function findNonRepairableCodeFailure(results: CodeCommandResult[]) {
  return results.find((result) =>
    nonRepairableFailures.has(result.failureType ?? "UNKNOWN")
  ) ?? null;
}

function now() {
  return new Date().toISOString();
}

function normalizePath(value: string) {
  return value.replace(/\\/g, "/").replace(/^\.\/+/, "");
}

function safePath(value: string) {
  const normalized = normalizePath(value);
  return normalized &&
    !normalized.startsWith("/") &&
    !/^[a-z]:/i.test(normalized) &&
    normalized.split("/").every((part) => Boolean(part) && part !== "..")
    ? normalized
    : null;
}

function progress(
  events: CodeProgressEvent[],
  state: CodeProgressEvent["state"],
  label: string,
  status: CodeProgressEvent["status"],
  onProgress?: (event: CodeProgressEvent) => void
) {
  const event = { at: now(), label, state, status };
  events.push(event);
  onProgress?.(event);
}

function normalizeEvidence(value: string) {
  return value
    .replace(/[A-Z]:[\\/][^\s:]+/gi, "<path>")
    .replace(/\b\d+(?=:\d+)|\bline\s+\d+/gi, "<line>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(-800);
}

function failureEvidence(result: CodeCommandResult): CodeFailureEvidence {
  const failureType = result.failureType ?? "UNKNOWN";
  const evidence = normalizeEvidence(result.outputExcerpt || `${result.commandId} failed.`);
  return {
    affectedComponent: null,
    commandId: result.commandId,
    evidence,
    exitCode: result.exitCode,
    failureType,
    signature: createHash("sha256")
      .update(`${failureType}:${result.commandId}:${evidence}`)
      .digest("hex")
      .slice(0, 20),
    target: result.commandId
  };
}

function repairSignature(changes: Array<{ content: string; path: string }>) {
  const hash = createHash("sha256");
  for (const change of changes.slice().sort((a, b) => a.path.localeCompare(b.path))) {
    hash.update(`${normalizePath(change.path)}\0${change.content}\0`);
  }
  return hash.digest("hex").slice(0, 20);
}

function dependencyContract(content: string | undefined) {
  if (typeof content !== "string") return null;
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    return JSON.stringify({
      dependencies: parsed.dependencies ?? {},
      devDependencies: parsed.devDependencies ?? {},
      optionalDependencies: parsed.optionalDependencies ?? {},
      peerDependencies: parsed.peerDependencies ?? {}
    });
  } catch {
    return null;
  }
}

function repairChangesDependencyContract(
  changes: Array<{ content: string; path: string }>,
  beforeFiles: Record<string, string>
) {
  return changes.some((change) => {
    if (normalizePath(change.path).toLowerCase() !== "package.json") return false;
    const before = dependencyContract(beforeFiles[change.path]);
    const after = dependencyContract(change.content);
    return before !== null && after !== null && before !== after;
  });
}

function resultScore(results: CodeCommandResult[]) {
  return results
    .filter((result) => result.status === "FAILED")
    .reduce((score, result) => {
      const diagnosticCount = Math.max(
        1,
        (result.outputExcerpt.match(/\b(?:error TS\d+|FAIL(?:ED)?|AssertionError|TypeError)\b/gi) ?? []).length
      );
      return score + severity[result.failureType ?? "UNKNOWN"] + Math.min(diagnosticCount, 10);
    }, 0);
}

async function readApprovedFiles(workspaceRoot: string, approvedPaths: string[]) {
  const result: Record<string, string> = {};
  for (const relativePath of approvedPaths) {
    const target = path.resolve(workspaceRoot, relativePath);
    const relative = path.relative(path.resolve(workspaceRoot), target);
    if (relative.startsWith("..") || path.isAbsolute(relative)) continue;
    const content = await readFile(target, "utf8").catch(() => null);
    if (content !== null) result[relativePath] = content;
  }
  return result;
}

async function runScopedCodeCommandSuite(input: {
  abortSignal?: AbortSignal;
  commands: Parameters<typeof runCodeCommandSuite>[0]["commands"];
  executionGrantId: string;
  expectedWorkspaceFingerprint: string;
  externalUserId: string;
  onOutput?: Parameters<typeof runCodeCommandSuite>[0]["onOutput"];
  onResult?: Parameters<typeof runCodeCommandSuite>[0]["onResult"];
  projectId: string;
  workspaceRoot: string;
}) {
  return runCodeCommandSuite(input);
}

function compactResumableState(input: {
  approvedScope: string[];
  commandResults: CodeCommandResult[];
  objective: string;
  repairAttempts: CodeRepairAttempt[];
  state: string;
  taskId: string;
}) {
  const sanitized = sanitizeUntrustedToolText(JSON.stringify({
    approvedScope: input.approvedScope,
    commandResults: input.commandResults.map((result) => ({
      commandId: result.commandId,
      failureType: result.failureType,
      status: result.status
    })),
    objective: input.objective.slice(0, 1_000),
    repairAttempts: input.repairAttempts.map((attempt) => ({
      attempt: attempt.attempt,
      changedFiles: attempt.changedFiles,
      failureSignature: attempt.failureBefore.signature,
      outcome: attempt.outcome,
      repairSignature: attempt.repairSignature,
      rollbackUsed: attempt.rollbackUsed
    })),
    state: input.state,
    taskId: input.taskId
  }));
  return sanitized.sanitized.slice(0, 12_000);
}

export async function runCodeAutonomousExecution(input: {
  acceptanceCriteria?: string[];
  abortSignal?: AbortSignal;
  approvedPaths: string[];
  baselineFileContents?: Record<string, string | null>;
  executionGrantId: string;
  executionPolicy?: CodeExecutionPolicy | string;
  externalUserId: string;
  objective: string;
  projectId: string;
  proposalId: string;
  repairProvider?: CodeRepairProvider;
  selectedModel: string;
  initiallyModifiedPaths?: string[];
  onCommandResult?: Parameters<typeof runCodeCommandSuite>[0]["onResult"];
  onOutput?: Parameters<typeof runCodeCommandSuite>[0]["onOutput"];
  onProgress?: (event: CodeProgressEvent) => void;
  workspaceRoot: string;
  taskId?: string;
  verificationKinds?: CodeCommandKind[];
}): Promise<CodeExecutionReport> {
  const startedAt = now();
  const taskId = input.taskId ?? `code-execution-${randomUUID()}`;
  const policy = normalizeCodeExecutionPolicy(input.executionPolicy);
  const progressEvents: CodeProgressEvent[] = [];
  const repairAttempts: CodeRepairAttempt[] = [];
  const modifiedFiles = new Set<string>();
  const limitations: string[] = [];
  const scopeExpansionRequired = new Set<string>();
  const approvedScope = Array.from(new Set(
    input.approvedPaths.map(safePath).filter((value): value is string => Boolean(value))
  ));
  const emitProgress = (
    state: CodeProgressEvent["state"],
    label: string,
    status: CodeProgressEvent["status"]
  ) => progress(progressEvents, state, label, status, input.onProgress);
  emitProgress("INSPECTING", "Inspecting the approved project", "active");

  if (!(await isServerOwnedProjectWorkspaceRoot(input.workspaceRoot)) || approvedScope.length !== input.approvedPaths.length) {
    const repository = await inspectCodeRepository(input.workspaceRoot).catch(() => ({
      architectureFacts: [],
      commands: [],
      dependencies: [],
      entrypoints: [],
      fingerprint: "unavailable",
      framework: "unknown",
      packageManager: "unknown" as const,
      relevantDirectories: [],
      scripts: {},
      sourceFileCount: 0,
      warnings: ["Repository inspection was blocked by project scope."]
    }));
    emitProgress("BLOCKED", "Project scope verification failed", "failed");
    return {
      approvedScope,
      commandResults: [],
      completionStatus: "BLOCKED",
      deliverySummary: null,
      executionPolicy: policy,
      finalFileContents: {},
      finishedAt: now(),
      limitations: ["CODE execution requires safe approved paths in a server-owned project workspace."],
      git: null,
      metrics: {
        commandsExecuted: 0,
        repairAttempts: 0,
        repairsApplied: 0,
        rollbackUsed: false,
        successfulAttempt: null,
        verificationOutcome: "FAILED"
      },
      modifiedFiles: [],
      objective: input.objective,
      progress: progressEvents,
      projectId: input.projectId,
      proposalId: input.proposalId,
      postExecution: null,
      repairAttempts,
      repository,
      resumableState: compactResumableState({
        approvedScope,
        commandResults: [],
        objective: input.objective,
        repairAttempts,
        state: "BLOCKED",
        taskId
      }),
      scopeExpansionRequired: [],
      startedAt,
      state: "BLOCKED",
      taskId,
      timeline: []
    };
  }

  let repository = await inspectCodeRepository(input.workspaceRoot);
  progressEvents[progressEvents.length - 1]!.status = "complete";
  emitProgress("VERIFYING", "Running bounded project verification", "active");
  let commandResults = await runScopedCodeCommandSuite({
    abortSignal: input.abortSignal,
    commands: selectCodeVerificationCommands(repository.commands, input.verificationKinds),
    executionGrantId: input.executionGrantId,
    expectedWorkspaceFingerprint: repository.fingerprint,
    externalUserId: input.externalUserId,
    onOutput: input.onOutput,
    onResult: input.onCommandResult,
    projectId: input.projectId,
    workspaceRoot: input.workspaceRoot
  });
  let cancelled = input.abortSignal?.aborted || commandResults.some((result) => result.status === "CANCELLED");
  let failures = commandResults.filter((result) => result.status === "FAILED");

  if (repository.commands.length === 0) {
    limitations.push("No safe typecheck, test, build, or lint script was available. No command was invented or installed.");
  }
  const repairProvider = input.repairProvider ?? createOpenRouterCodeRepairProvider();
  const repairBudget = repairBudgetForPolicy(policy);
  const repairSignatures = new Set<string>();
  const repairEvidenceSignatures = new Set<string>();

  for (let attempt = 1; !cancelled && failures.length > 0 && attempt <= repairBudget; attempt += 1) {
    const hardFailure = findNonRepairableCodeFailure(failures);
    if (hardFailure) {
      const failureType = hardFailure.failureType ?? "UNKNOWN";
      limitations.push(`${failureType} is external to approved source repair; Hassali stopped without speculative mutation.`);
      break;
    }
    const failure = failureEvidence(failures[0]!);
    progressEvents[progressEvents.length - 1]!.status = "failed";
    emitProgress("DIAGNOSING", `Diagnosing ${failure.failureType.toLowerCase().replace(/_/g, " ")}`, "active");
    const beforeFiles = await readApprovedFiles(input.workspaceRoot, approvedScope);
    const providerResult = await repairProvider.proposeRepair({
      approvedPaths: approvedScope,
      attempt,
      failure,
      files: beforeFiles,
      objective: input.objective,
      previousAttempts: repairAttempts,
      repository,
      selectedModel: input.selectedModel
    });
    progressEvents[progressEvents.length - 1]!.status = providerResult.ok ? "complete" : "failed";
    if (!providerResult.ok) {
      limitations.push(providerResult.message);
      break;
    }
    const normalizedChanges = providerResult.plan.changes.flatMap((change) => {
      const normalized = safePath(change.path);
      return normalized ? [{ ...change, path: normalized }] : [];
    });
    const outsideScope = normalizedChanges
      .map((change) => change.path)
      .filter((filePath) => !approvedScope.includes(filePath));
    if (outsideScope.length || normalizedChanges.length !== providerResult.plan.changes.length) {
      outsideScope.forEach((filePath) => scopeExpansionRequired.add(filePath));
      repairAttempts.push({
        attempt,
        changedFiles: normalizedChanges.map((change) => change.path),
        failureBefore: failure,
        finishedAt: now(),
        hypothesis: providerResult.plan.hypothesis,
        outcome: "SCOPE_EXPANSION_REQUIRED",
        repairSignature: repairSignature(normalizedChanges),
        rollbackUsed: false,
        startedAt: now(),
        verificationAfter: []
      });
      limitations.push("Repair requires files outside the approved scope. Hassali paused for expanded approval.");
      break;
    }
    if (
      providerResult.plan.risk === "high" ||
      repairChangesDependencyContract(normalizedChanges, beforeFiles)
    ) {
      const reason = providerResult.plan.risk === "high"
        ? "The proposed repair is high risk."
        : "The proposed repair changes the dependency contract.";
      scopeExpansionRequired.add(
        providerResult.plan.risk === "high"
          ? providerResult.plan.repairTarget
          : "package.json dependency contract"
      );
      repairAttempts.push({
        attempt,
        changedFiles: normalizedChanges.map((change) => change.path),
        failureBefore: failure,
        finishedAt: now(),
        hypothesis: providerResult.plan.hypothesis,
        outcome: "SCOPE_EXPANSION_REQUIRED",
        repairSignature: repairSignature(normalizedChanges),
        rollbackUsed: false,
        startedAt: now(),
        verificationAfter: []
      });
      limitations.push(`${reason} Hassali paused for expanded approval.`);
      break;
    }
    const currentRepairEvidenceSignature = createHash("sha256")
      .update(`${failure.signature}:${repairAttempts.at(-1)?.repairSignature ?? "initial"}`)
      .digest("hex")
      .slice(0, 20);
    const repairEligibility = decideRepairEligibility({
      approvedPaths: approvedScope,
      attemptedCycles: attempt - 1,
      currentEvidenceSignature: currentRepairEvidenceSignature,
      permissionValid: true,
      previousEvidenceSignatures: [...repairEvidenceSignatures],
      proposedPaths: normalizedChanges.map((change) => change.path),
      repositoryStale: false
    });
    if (!repairEligibility.eligible) {
      limitations.push(repairEligibility.reason);
      break;
    }
    repairEvidenceSignatures.add(currentRepairEvidenceSignature);
    const signature = repairSignature(normalizedChanges);
    if (repairSignatures.has(signature)) {
      repairAttempts.push({
        attempt,
        changedFiles: normalizedChanges.map((change) => change.path),
        failureBefore: failure,
        finishedAt: now(),
        hypothesis: providerResult.plan.hypothesis,
        outcome: "REJECTED_REPEAT",
        repairSignature: signature,
        rollbackUsed: false,
        startedAt: now(),
        verificationAfter: []
      });
      limitations.push("A previously ineffective repair was proposed again. Hassali did not reapply it.");
      break;
    }
    repairSignatures.add(signature);
    const attemptStartedAt = now();
    emitProgress("REPAIRING", `Applying bounded repair ${attempt}/${repairBudget}`, "active");
    const snapshot = await applyCodeRepairAttempt({
      changes: normalizedChanges,
      expectedContents: beforeFiles,
      workspaceRoot: input.workspaceRoot
    });
    clearCodeRepositoryInspectionCache(input.workspaceRoot);
    repository = await inspectCodeRepository(input.workspaceRoot);
    const verificationAfter = await runScopedCodeCommandSuite({
      abortSignal: input.abortSignal,
      commands: selectCodeVerificationCommands(repository.commands, input.verificationKinds),
      executionGrantId: input.executionGrantId,
      expectedWorkspaceFingerprint: repository.fingerprint,
      externalUserId: input.externalUserId,
      onOutput: input.onOutput,
      onResult: input.onCommandResult,
      projectId: input.projectId,
      workspaceRoot: input.workspaceRoot
    });
    cancelled = input.abortSignal?.aborted || verificationAfter.some((result) => result.status === "CANCELLED");
    const hardFailureAfterRepair = findNonRepairableCodeFailure(verificationAfter);
    const worse = resultScore(verificationAfter) > resultScore(commandResults);
    const succeeded = !cancelled && verificationAfter.every((result) => result.status === "PASSED");
    let outcome: CodeRepairAttempt["outcome"] = "FAILED";
    let rollbackUsed = false;
    if (!succeeded) {
      const rollback = await rollbackCodeRepairAttempt(snapshot);
      rollbackUsed = rollback.ok;
      outcome = cancelled
        ? "CANCELLED"
        : worse
          ? "ROLLED_BACK_WORSE"
          : "ROLLED_BACK_UNRESOLVED";
      limitations.push(
        rollback.ok
          ? worse
            ? "A worsening repair was rolled back without touching unrelated files."
            : cancelled
              ? "The cancelled repair was rolled back without touching unrelated files."
              : "An unresolved repair was rolled back before trying another strategy."
          : `A failed repair could not be fully rolled back because these files changed concurrently: ${rollback.conflicts.join(", ")}.`
      );
      clearCodeRepositoryInspectionCache(input.workspaceRoot);
      repository = await inspectCodeRepository(input.workspaceRoot);
    } else {
      outcome = "SUCCEEDED";
      normalizedChanges.forEach((change) => modifiedFiles.add(change.path));
    }
    repairAttempts.push({
      attempt,
      changedFiles: normalizedChanges.map((change) => change.path),
      failureBefore: failure,
      finishedAt: now(),
      hypothesis: providerResult.plan.hypothesis,
      outcome,
      repairSignature: signature,
      rollbackUsed,
      startedAt: attemptStartedAt,
      verificationAfter
    });
    progressEvents[progressEvents.length - 1]!.status = outcome === "SUCCEEDED"
      ? "complete"
      : outcome === "CANCELLED"
        ? "pending"
        : "failed";
    if (hardFailureAfterRepair) {
      const failureType = hardFailureAfterRepair.failureType ?? "UNKNOWN";
      limitations.push(`${failureType} occurred during repair verification; Hassali stopped before running more commands.`);
      commandResults = verificationAfter;
    } else if (!succeeded && !cancelled) {
      commandResults = await runScopedCodeCommandSuite({
        abortSignal: input.abortSignal,
        commands: selectCodeVerificationCommands(repository.commands, input.verificationKinds),
        executionGrantId: input.executionGrantId,
        expectedWorkspaceFingerprint: repository.fingerprint,
        externalUserId: input.externalUserId,
        onOutput: input.onOutput,
        onResult: input.onCommandResult,
        projectId: input.projectId,
        workspaceRoot: input.workspaceRoot
      });
    } else {
      commandResults = verificationAfter;
    }
    failures = commandResults.filter((result) => result.status === "FAILED");
    if (!failures.length || hardFailureAfterRepair) break;
  }

  failures = commandResults.filter((result) => result.status === "FAILED");
  emitProgress("REVIEWING", "Reviewing verified CODE outcome", "active");
  progressEvents[progressEvents.length - 1]!.status = "complete";
  const isUiProject = repository.framework === "react" ||
    repository.framework === "react_vite" ||
    repository.framework === "next";
  if (!failures.length && isUiProject) {
    limitations.push("Browser interaction evidence remains pending until the owned preview is inspected.");
  }
  if (failures.length && repairAttempts.length >= repairBudget) {
    limitations.push(`The ${policy} repair budget was exhausted after ${repairBudget} attempt(s).`);
  }
  const finalFileContents = await readApprovedFiles(input.workspaceRoot, approvedScope);
  const acceptanceCriteria = input.acceptanceCriteria ?? [];
  const verificationPlan = buildVerificationPlan({ acceptanceCriteria, taskId });
  const evidence = commandResultsToEvidence({ results: commandResults });
  if (!acceptanceCriteria.length && verificationPlan.criteria[0]) {
    evidence.push({
      criterionIds: [verificationPlan.criteria[0].id],
      id: `command-suite-${taskId}`,
      observed: commandResults.length
        ? `${commandResults.length} bounded verification command(s) completed.`
        : "No bounded verification command was available.",
      provenance: "secure-execution-command-suite",
      status: commandResults.length === 0
        ? "unavailable"
        : commandResults.every((result) => result.status === "PASSED") ? "passed" : "failed",
      type: "static"
    });
  }
  const repositoryCriterionIds = verificationPlan.criteria
    .filter((criterion) => criterion.requiredEvidence.includes("repository-state"))
    .map((criterion) => criterion.id);
  const unexpectedMutationPaths = commandResults
    .filter((result) => result.mutationState === "unexpected")
    .flatMap((result) => result.mutationPaths ?? []);
  const observedModifiedPaths = [...new Set([...(input.initiallyModifiedPaths ?? []), ...modifiedFiles, ...unexpectedMutationPaths])];
  if (repositoryCriterionIds.length) {
    evidence.push({
      criterionIds: repositoryCriterionIds,
      id: `scope-evidence-${taskId}`,
      observed: observedModifiedPaths.every((filePath) => approvedScope.includes(filePath))
        ? "All observed task changes remained inside the approved path set."
        : "One or more observed task changes fell outside the approved path set.",
      provenance: "execution-change-scope",
      status: observedModifiedPaths.every((filePath) => approvedScope.includes(filePath)) ? "passed" : "failed",
      type: "repository-state"
    });
  }
  for (const criterion of verificationPlan.criteria.filter((candidate) => candidate.requiredEvidence.includes("browser"))) {
    evidence.push({
      criterionIds: [criterion.id],
      id: `browser-unavailable-${criterion.id}`,
      observed: "Owned browser acceptance did not run during this server-side command verification.",
      provenance: "browser-verification-contract",
      status: "unavailable",
      type: "browser"
    });
  }
  const verification = evaluateVerificationPlan(verificationPlan, evidence);
  const baseline = Object.fromEntries(approvedScope.map((filePath) => [
    filePath,
    input.baselineFileContents
      ? input.baselineFileContents[filePath] ?? null
      : finalFileContents[filePath] ?? null
  ]));
  const after = Object.fromEntries(approvedScope.map((filePath) => [filePath, finalFileContents[filePath] ?? null]));
  const changeLedger = buildChangeLedger({
    after,
    baseline,
    baselineRepositoryFingerprint: fingerprintFileContents(baseline),
    explicitUnexpectedPaths: unexpectedMutationPaths,
    plannedPaths: approvedScope,
    taskId
  });
  const review = reviewImplementation({
    changes: [...approvedScope, ...unexpectedMutationPaths.filter((filePath) => !approvedScope.includes(filePath))].map((filePath) => ({
      after: after[filePath] ?? null,
      before: baseline[filePath] ?? null,
      path: filePath,
      planned: approvedScope.includes(filePath)
    })),
    securityEvidencePresent: commandResults.some((result) => /security|approval|secure/i.test(result.commandId) && result.status === "PASSED"),
    taskId
  });
  const manualChecks = verification.results
    .filter((result) => result.status === "inconclusive" || result.status === "partial" || result.status === "unavailable")
    .map((result) => result.criterion);
  const delivery = buildDeliveryReadiness({
    changedFiles: observedModifiedPaths,
    implementationComplete: !cancelled && !failures.length && scopeExpansionRequired.size === 0,
    manualChecks,
    review,
    verification
  });
  limitations.push(...verification.warnings);
  if (review.status === "blocked") limitations.push("Independent deterministic review found a blocking issue.");
  const state = cancelled
    ? "CANCELLED"
    : scopeExpansionRequired.size
      ? "BLOCKED"
      : failures.length || verification.state === "failed" || review.status === "blocked"
        ? "FAILED"
        : limitations.length || !delivery.readyForDelivery
          ? "COMPLETE_WITH_LIMITATIONS"
          : "COMPLETE";
  const completionStatus: CodeExecutionReport["completionStatus"] =
    state === "CANCELLED"
      ? "CANCELLED"
      : state === "BLOCKED"
        ? "BLOCKED"
        : state === "FAILED"
          ? "FAILED"
          : state === "COMPLETE_WITH_LIMITATIONS"
            ? "COMPLETE_WITH_LIMITATIONS"
            : "COMPLETE_VERIFIED";
  emitProgress(state, completionStatus.replace(/_/g, " ").toLowerCase(), state === "COMPLETE" || state === "COMPLETE_WITH_LIMITATIONS" ? "complete" : state === "CANCELLED" ? "pending" : "failed");
  const metrics = {
    commandsExecuted: commandResults.length + repairAttempts.reduce((count, attempt) => count + attempt.verificationAfter.length, 0),
    repairAttempts: repairAttempts.length,
    repairsApplied: repairAttempts.filter((attempt) => attempt.outcome === "SUCCEEDED").length,
    rollbackUsed: repairAttempts.some((attempt) => attempt.rollbackUsed),
    successfulAttempt: repairAttempts.find((attempt) => attempt.outcome === "SUCCEEDED")?.attempt ?? null,
    verificationOutcome: failures.length || verification.state === "failed" || review.status === "blocked"
      ? "FAILED" as const
      : limitations.length
        ? "LIMITED" as const
        : "PASSED" as const
  };
  return {
    approvedScope,
    commandResults,
    completionStatus,
    deliverySummary: null,
    executionPolicy: policy,
    finalFileContents,
    finishedAt: now(),
    limitations: Array.from(new Set(limitations)),
    git: null,
    metrics,
    modifiedFiles: [...modifiedFiles],
    objective: input.objective,
    progress: progressEvents,
    projectId: input.projectId,
    proposalId: input.proposalId,
    postExecution: {
      changeLedger,
      delivery,
      review,
      successClaim: successClaim({ delivery, attempted: true }),
      verification,
      verificationPlan
    },
    repairAttempts,
    repository,
    resumableState: compactResumableState({
      approvedScope,
      commandResults,
      objective: input.objective,
      repairAttempts,
      state,
      taskId
    }),
    scopeExpansionRequired: [...scopeExpansionRequired],
    startedAt,
    state,
    taskId,
    timeline: []
  };
}
