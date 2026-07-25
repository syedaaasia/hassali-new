import { auth } from "@clerk/nextjs/server";
import {
  deleteUserProjectPath,
  listUserProjectFiles,
  saveUserProjectFileContent
} from "@hassali/database";
import {
  persistCanonicalApprovalState,
  recordCanonicalEvent
} from "@/lib/server/canonical-persistence";
import {
  isWorkspaceBindingError,
  resolveProjectWorkspace
} from "@/lib/server/runtime/project-workspace-registry";
import { createGitSnapshotSafety } from "@/lib/server/runtime/git-snapshot-safety";
import { buildLiveRuntimePreviewMetadata } from "@/lib/server/runtime/live-runtime-sync";
import { buildRuntimeAuthorityDecision } from "@/lib/server/runtime/runtime-authority";
import { selectRuntimeAdapter } from "@/lib/server/runtime/runtime-adapter-selector";
import { buildDevServerRuntime } from "@/lib/server/runtime/dev-server-runtime";
import { buildMobilePreviewRuntime } from "@/lib/server/preview/mobile-preview-runtime";
import { buildMobileRuntimeCandidate } from "@/lib/server/runtime/mobile-runtime-manager";
import {
  buildApprovedPlanFromProposal,
  validateRuntimeApprovalRequest,
  type RuntimeApprovalBody
} from "@/lib/server/runtime/runtime-approval-plan";
import { routeRuntimeWorker } from "@/lib/server/runtime/worker-router";
import type {
  RuntimeAdapterResult,
  RuntimeSnapshotMetadata
} from "@/lib/server/runtime/runtime-types";
import type {
  WorkerRouterProductMode,
  WorkerRouterRiskLevel,
  WorkerRouterSnapshotStatus
} from "@/lib/server/runtime/worker-router-types";
import { runApprovedRuntimePostflight } from "@/lib/server/intelligence/intelligence-postflight";

export const runtime = "nodejs";

function errorResponse(error: string, status = 400, extra?: Record<string, unknown>) {
  return Response.json({ error, ...extra }, { status });
}

function productModeFromBody(value: unknown): WorkerRouterProductMode {
  return value === "ASK" || value === "WEBSITE" || value === "CODE" ? value : "CODE";
}

function snapshotStatusFromBody(value: unknown): WorkerRouterSnapshotStatus | undefined {
  return value === "available" || value === "failed" || value === "missing" || value === "unavailable"
    ? value
    : undefined;
}

function riskLevelFromBody(value: unknown): WorkerRouterRiskLevel | undefined {
  return value === "high" || value === "medium" || value === "low" ? value : undefined;
}

function metadataFromBody(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function previewMetadataFromApproval(input: {
  metadata: Record<string, unknown> | undefined;
  productMode: WorkerRouterProductMode;
}) {
  const raw = input.metadata?.previewMetadata && typeof input.metadata.previewMetadata === "object" && !Array.isArray(input.metadata.previewMetadata)
    ? input.metadata.previewMetadata as Record<string, unknown>
    : {};
  const rawPreviewType = typeof raw.previewType === "string"
    ? raw.previewType
    : typeof input.metadata?.previewType === "string"
      ? input.metadata.previewType
      : "";
  const now = new Date().toISOString();

  if (input.productMode === "WEBSITE" || rawPreviewType === "static_website" || rawPreviewType === "website_static_preview") {
    return {
      ...raw,
      entryPoint: typeof raw.entryPoint === "string" ? raw.entryPoint : "index.html",
      framework: "static_html",
      lastApprovedAt: now,
      mode: "WEBSITE",
      previewType: "static_website",
      source: "website_approval",
      status: "ready"
    };
  }

  if (rawPreviewType === "python_app_preview" || raw.framework === "python_streamlit") {
    return {
      ...raw,
      entryPoint: typeof raw.entryPoint === "string" ? raw.entryPoint : "app.py",
      framework: "python_streamlit",
      lastApprovedAt: now,
      mode: "CODE",
      previewType: "python_app_preview",
      source: "code_approval",
      status: "stopped"
    };
  }

  return Object.keys(raw).length
    ? {
        ...raw,
        lastApprovedAt: now,
        mode: input.productMode,
        status: input.productMode === "CODE" ? "stopped" : "ready"
      }
    : null;
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

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function booleanValue(value: unknown) {
  return value === true;
}

function stringArrayValue(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function pageToHtmlPath(page: string) {
  const normalized = page.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  return normalized === "home" || normalized === "index" ? "index.html" : `${normalized}.html`;
}

function proposalApplyBlockReasons(input: {
  changes: RuntimeApprovalBody["changes"];
  metadata: Record<string, unknown> | undefined;
}) {
  const reasons: string[] = [];
  const metadata = input.metadata ?? {};
  const approvalDecision = metadata.approvalDecision && typeof metadata.approvalDecision === "object" && !Array.isArray(metadata.approvalDecision)
    ? metadata.approvalDecision as Record<string, unknown>
    : null;
  const criticalIssues = stringArrayValue(approvalDecision?.criticalIssues);

  if (booleanValue(approvalDecision?.hasCriticalIssues) || approvalDecision?.approvalAllowed === false) {
    reasons.push(...criticalIssues, "This proposal failed validation and cannot be applied. Regenerate or fix the request.");
  }

  if (booleanValue(metadata.approvalDisabled)) reasons.push("Proposal metadata disabled approval.");
  if (booleanValue(metadata.shouldBlockExecution)) reasons.push("Proposal metadata marked execution as blocked.");
  if (stringValue(metadata.proposalRoutingMode) === "blocked") reasons.push("Proposal routing is blocked.");
  if (stringValue(metadata.selfReviewStatus) === "FAIL") reasons.push("Self Review failed this proposal.");
  if (stringValue(metadata.proposalQualityStatus) === "blocked") reasons.push("Proposal quality gate blocked this proposal.");
  if (stringValue(metadata.domainValidationStatus) === "blocked") reasons.push("Domain validation blocked this proposal.");
  if (stringValue(metadata.generatorContractStatus) === "blocked") reasons.push("Generator contract blocked this proposal.");
  if (stringValue(metadata.contradictionStatus) === "blocked") reasons.push("Prompt sovereignty blocked this proposal.");
  if (stringValue(metadata.publicCopyCleanStatus) === "blocked") reasons.push("Public copy validation blocked this proposal.");
  if (stringValue(metadata.sectionCopyQualityStatus) === "blocked") reasons.push("Section copy validation blocked this proposal.");
  if (stringValue(metadata.staleTermScanStatus) === "blocked") reasons.push("Stale-domain validation blocked this proposal.");
  if (stringValue(metadata.visualValidationStatus) === "blocked") reasons.push("Visual validation blocked this proposal.");

  const repairStatus = stringValue(metadata.proposalRepairStatus);
  if (repairStatus === "failed" || repairStatus === "keep_blocked" || repairStatus === "partial_repair") {
    reasons.push("Repair did not produce an apply-safe proposal.");
  }

  const changes = Array.isArray(input.changes) ? input.changes as Array<Record<string, unknown>> : [];

  for (const change of changes) {
    const content = stringValue(change.proposedContent);
    const path = stringValue(change.path);

    if (content && applyUnsafePlaceholderPatterns.some((pattern) => pattern.test(content))) {
      reasons.push(`Apply-unsafe placeholder repair content detected in ${path || "a proposed file"}.`);
    }
  }

  const expectedPages = new Set(stringArrayValue(metadata.sourceOfTruthPages).map(pageToHtmlPath));
  if (stringValue(metadata.generatorMode) === "website_generation" && expectedPages.size > 0) {
    const extraPages = changes
      .map((change) => stringValue(change.path).replace(/\\/g, "/").replace(/^\.?\//, ""))
      .filter((path) => path.endsWith(".html") && !expectedPages.has(path));

    if (extraPages.length > 0) {
      reasons.push(`Generated extra page(s) not requested: ${Array.from(new Set(extraPages)).join(", ")}.`);
    }
  }

  return Array.from(new Set(reasons.filter(Boolean)));
}

function workerTypeFromBody(value: unknown) {
  return typeof value === "string" ? value : null;
}

async function recordBestEffortEvent(
  workspaceRoot: string,
  type: string,
  data: Record<string, unknown>
) {
  try {
    await recordCanonicalEvent(workspaceRoot, type, data);
  } catch {
    // Event persistence is best-effort; approval success is still governed by file and DB persistence.
  }
}

function isExternalWorkerRequest(value: string | null) {
  return value === "aider" || value === "opencode" || value === "openhands" || value === "goose";
}

function toSnapshotMetadata(snapshot: Awaited<ReturnType<typeof createGitSnapshotSafety>>): RuntimeSnapshotMetadata {
  return {
    afterRef: snapshot.afterRef,
    beforeRef: snapshot.beforeRef,
    changedFiles: snapshot.changedFiles,
    rollbackApplied: snapshot.rollbackApplied,
    rollbackAvailable: snapshot.rollbackAvailable,
    snapshotId: snapshot.snapshotId,
    snapshotStatus: snapshot.snapshotStatus
  };
}

async function resolveServerSnapshotStatus(input: {
  clientSnapshotStatus?: WorkerRouterSnapshotStatus;
  planId: string;
  productMode: WorkerRouterProductMode;
  projectId: string;
  requestedWorkerType: string | null;
  workspaceRoot: string;
}): Promise<{
  snapshot: RuntimeSnapshotMetadata | null;
  snapshotStatus?: WorkerRouterSnapshotStatus;
}> {
  if (input.productMode !== "CODE" || !isExternalWorkerRequest(input.requestedWorkerType)) {
    return {
      snapshot: null,
      snapshotStatus: input.clientSnapshotStatus
    };
  }

  const snapshot = await createGitSnapshotSafety({
    planId: input.planId,
    projectId: input.projectId,
    runnerId: `runtime-worker-router-preflight-${Date.now()}`,
    workspaceRoot: input.workspaceRoot
  });

  return {
    snapshot: toSnapshotMetadata(snapshot),
    snapshotStatus: snapshot.snapshotStatus
  };
}

function workerResultRecord(result: RuntimeAdapterResult): Record<string, unknown> | null {
  return result.workerResult && typeof result.workerResult === "object" && !Array.isArray(result.workerResult)
    ? result.workerResult as Record<string, unknown>
    : null;
}

function buildWorkerExecutionMetadata(input: {
  finishedAt: string;
  result: RuntimeAdapterResult;
  startedAt: string;
}) {
  const workerResult = workerResultRecord(input.result);
  const duration = typeof workerResult?.durationMs === "number"
    ? workerResult.durationMs
    : Math.max(0, Date.parse(input.finishedAt) - Date.parse(input.startedAt));

  return {
    workerExecutionDurationMs: duration,
    workerExecutionExitCode: typeof workerResult?.exitCode === "number" ? workerResult.exitCode : null,
    workerExecutionFinishedAt: input.finishedAt,
    workerExecutionStartedAt: input.startedAt,
    workerExecutionStatus: typeof workerResult?.status === "string"
      ? workerResult.status
      : input.result.ok
        ? "completed"
        : "failed",
    workerExecutionStderr: typeof workerResult?.stderr === "string" ? workerResult.stderr : "",
    workerExecutionStdout: typeof workerResult?.stdout === "string" ? workerResult.stdout : ""
  };
}

const blockedWorkerExecutionMetadata = {
  workerExecutionDurationMs: 0,
  workerExecutionExitCode: null,
  workerExecutionFinishedAt: null,
  workerExecutionStartedAt: null,
  workerExecutionStatus: "blocked",
  workerExecutionStderr: "",
  workerExecutionStdout: ""
};

export async function POST(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return errorResponse("Unauthorized", 401);
  }

  const body = (await request.json().catch(() => null)) as RuntimeApprovalBody | null;

  if (!body) {
    return errorResponse("Invalid runtime approval request.", 400);
  }

  const parsed = validateRuntimeApprovalRequest(body);

  if ("error" in parsed) {
    return errorResponse(parsed.error, parsed.status ?? 400);
  }

  const proposalMetadata = metadataFromBody(body.proposalMetadata);
  const proposalBlockReasons = proposalApplyBlockReasons({
    changes: body.changes,
    metadata: proposalMetadata
  });

  if (proposalBlockReasons.length > 0) {
    return errorResponse("This proposal failed validation and cannot be applied. Regenerate or fix the request.", 400, {
      errors: proposalBlockReasons,
      runnerStatus: "blocked",
      runtimeStartAttempted: false,
      runtimeStartStatus: "not_started",
      writtenFiles: []
    });
  }

  let ownedProjectFiles;
  try {
    ownedProjectFiles = await listUserProjectFiles({
      externalUserId: userId,
      projectId: parsed.projectId
    });
  } catch {
    return errorResponse("Project ownership could not be verified.", 503, {
      runnerStatus: "blocked",
      runtimeStartAttempted: false,
      runtimeStartStatus: "not_started",
      writtenFiles: []
    });
  }

  if (!ownedProjectFiles) {
    return errorResponse("Project not found or access denied.", 404, {
      runnerStatus: "blocked",
      runtimeStartAttempted: false,
      runtimeStartStatus: "not_started",
      writtenFiles: []
    });
  }

  const workspaceBinding = await resolveProjectWorkspace(parsed.projectId);

  if (isWorkspaceBindingError(workspaceBinding)) {
    return errorResponse(workspaceBinding.error, workspaceBinding.status);
  }

  const workspaceWarnings = [
    ...workspaceBinding.warnings,
    ...(typeof body.workspaceRoot === "string" && body.workspaceRoot.trim().length > 0
      ? ["Client-supplied workspaceRoot was ignored; Hassali resolved the project workspace server-side."]
      : [])
  ];
  const { blockedReasons, plan, runtimeWarnings, skippedSummaries } = buildApprovedPlanFromProposal({
    changes: parsed.changes,
    productMode: productModeFromBody(body.productMode),
    projectId: parsed.projectId,
    proposalId: parsed.proposalId,
    workspaceRoot: workspaceBinding.workspaceRoot
  });
  const productMode = productModeFromBody(body.productMode);
  const latestApprovalPreviewMetadata = previewMetadataFromApproval({
    metadata: proposalMetadata,
    productMode
  });
  const requestedWorkerType = workerTypeFromBody(body.workerType);
  const preflightSnapshot = await resolveServerSnapshotStatus({
    clientSnapshotStatus: snapshotStatusFromBody(body.snapshotStatus),
    planId: plan.id,
    productMode,
    projectId: parsed.projectId,
    requestedWorkerType,
    workspaceRoot: workspaceBinding.workspaceRoot
  });
  const workerRouter = routeRuntimeWorker({
    plan,
    productMode,
    projectId: parsed.projectId,
    proposalMetadata,
    requestedWorkerType,
    riskLevel: riskLevelFromBody(body.riskLevel),
    snapshotStatus: preflightSnapshot.snapshotStatus,
    taskKind: typeof body.taskKind === "string" ? body.taskKind : undefined,
    workspaceRoot: workspaceBinding.workspaceRoot
  });

  if (blockedReasons.length > 0) {
    return Response.json({
      appliedSteps: [],
      blockedSteps: blockedReasons.map((reason, index) => ({
        reasons: [reason],
        stepId: `request-change-${index}`
      })),
      errors: blockedReasons.map((reason) => reason.message),
      events: [],
      runnerId: null,
      runnerStatus: "blocked",
      runtimeOptional: true,
      runtimeStartAttempted: false,
      runtimeStartError: blockedReasons[0]?.message ?? null,
      runtimeStartStatus: "not_started",
      runtimeWarning: null,
      ...blockedWorkerExecutionMetadata,
      rejectedWorkers: workerRouter.rejectedWorkers,
      requestedWorkerType: workerRouter.requestedWorkerType ?? parsed.workerType,
      selectedWorkerType: null,
      skippedSteps: skippedSummaries,
      snapshot: preflightSnapshot.snapshot,
      verification: null,
      workerRouterStatus: workerRouter.routerStatus,
      workerRouterWarnings: workerRouter.routerWarnings,
      workerSelectionReason: workerRouter.selectionReason,
      workerFallbackReason: null,
      workerResult: null,
      workspaceBindingStatus: workspaceBinding.registryStatus,
      workspaceCreated: workspaceBinding.created,
      workspaceRoot: workspaceBinding.workspaceRoot,
      workspaceWarnings,
      writtenFiles: []
    }, { status: 400 });
  }

  const adapterSelection = selectRuntimeAdapter(workerRouter);
  const adapter = adapterSelection.adapter;
  const session = await adapter.startSession({
    projectId: parsed.projectId,
    workspaceRoot: workspaceBinding.workspaceRoot
  });
  const workerExecutionStartedAt = new Date().toISOString();
  const result = await adapter.sendApprovedPlan(session, plan);
  const workerExecutionFinishedAt = new Date().toISOString();
  const workerExecutionMetadata = buildWorkerExecutionMetadata({
    finishedAt: workerExecutionFinishedAt,
    result,
    startedAt: workerExecutionStartedAt
  });
  const writtenFiles = result.events
    .filter((event) => event.type === "file_written")
    .map((event) => String(event.metadata?.path ?? ""))
    .filter(Boolean);
  const deletedFiles = result.events
    .filter((event) => event.type === "file_deleted")
    .map((event) => String(event.metadata?.path ?? ""))
    .filter(Boolean);

  if (result.ok) {
    try {
      for (const step of plan.steps) {
        if (step.tool === "delete_file" && step.path) {
          const remaining = await deleteUserProjectPath({
            externalUserId: userId,
            kind: "file",
            path: step.path,
            projectId: parsed.projectId
          });
          if (!remaining) {
            throw new Error(`Persistence verification failed for deleted file: ${step.path}`);
          }
          continue;
        }

        if (step.tool !== "write_file" || !step.path || typeof step.content !== "string") {
          continue;
        }

        await recordBestEffortEvent(workspaceBinding.workspaceRoot, "FILE_WRITE_STARTED", {
          path: step.path,
          projectId: parsed.projectId,
          proposalId: parsed.proposalId
        });
        const saved = await saveUserProjectFileContent({
          content: step.content,
          externalUserId: userId,
          path: step.path,
          projectId: parsed.projectId
        });

        if (!saved || saved.content !== step.content) {
          throw new Error(`Persistence verification failed for: ${step.path}`);
        }

        await recordBestEffortEvent(workspaceBinding.workspaceRoot, "FILE_WRITTEN", {
          path: step.path,
          projectId: parsed.projectId,
          proposalId: parsed.proposalId
        });
      }

      const persistedFiles = await listUserProjectFiles({
        externalUserId: userId,
        projectId: parsed.projectId
      });

      if (!persistedFiles) {
        throw new Error("Project not found during approval persistence.");
      }

      await persistCanonicalApprovalState({
        files: persistedFiles.map((file) => ({
          content: String(file.content),
          path: String(file.path)
        })),
        projectId: parsed.projectId,
        proposalId: parsed.proposalId,
        workspaceRoot: workspaceBinding.workspaceRoot
      });
      await recordBestEffortEvent(workspaceBinding.workspaceRoot, "PROPOSAL_APPROVED", {
        filesDeleted: deletedFiles,
        filesWritten: writtenFiles,
        projectId: parsed.projectId,
        proposalId: parsed.proposalId
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Approval persistence failed.";

      await recordBestEffortEvent(workspaceBinding.workspaceRoot, "PERSIST_FAILURE", {
        error: message,
        filesWrittenBeforeFailure: writtenFiles,
        projectId: parsed.projectId,
        proposalId: parsed.proposalId
      });
      await recordBestEffortEvent(workspaceBinding.workspaceRoot, "PROJECT_CRASH_BACKUP", {
        reason: "File runner completed, but canonical persistence failed.",
        projectId: parsed.projectId,
        proposalId: parsed.proposalId
      });

      return Response.json({
        applied: false,
        appliedSteps: result.events
          .filter((event) => (event.type === "file_written" || event.type === "file_deleted") && event.stepId)
          .map((event) => event.stepId),
        blockedSteps: [],
        errors: [`${message} Event PERSIST_FAILURE recorded; proposal remains pending.`],
        events: result.events,
        deletedFiles,
        ok: false,
        persistenceWarning: "File write completed but canonical persistence failed. Hassali did not mark the proposal successful.",
        runnerId: session.id,
        runnerStatus: "failed",
        runtimeOptional: true,
        runtimeStartAttempted: false,
        runtimeStartError: message,
        runtimeStartStatus: "failed",
        runtimeWarning: "Persistence failed after file write; refresh may not show the new files until this proposal is approved again.",
        verification: result.verification ?? null,
        workspaceBindingStatus: workspaceBinding.registryStatus,
        workspaceCreated: workspaceBinding.created,
        workspaceRoot: workspaceBinding.workspaceRoot,
        workspaceWarnings: [...workspaceWarnings, "Canonical persistence failed after file write."],
        writtenFiles
      }, { status: 500 });
    }
  }

  const liveRuntimePreview = result.ok
    ? await buildLiveRuntimePreviewMetadata({
        productMode,
        projectId: parsed.projectId,
        workspaceRoot: workspaceBinding.workspaceRoot,
        writtenFiles
      })
    : null;
  const devServerRuntime = liveRuntimePreview
    ? buildDevServerRuntime({
        generatedFiles: liveRuntimePreview.analysis.generatedFiles
      })
    : null;
  const mobilePreview = liveRuntimePreview
    ? buildMobilePreviewRuntime({
        files: liveRuntimePreview.analysis.generatedFiles
      })
    : null;
  const viteRuntime = null;
  const nextRuntime = null;
  const backendExecutionRuntime = null;
  const mobileRuntime =
    result.ok &&
    productMode === "CODE" &&
    workerRouter.selectedWorkerType === "local" &&
    mobilePreview?.detected
      ? await buildMobileRuntimeCandidate({
          mobilePreview,
          productMode,
          projectId: parsed.projectId,
          workerType: workerRouter.selectedWorkerType,
          workspaceRoot: workspaceBinding.workspaceRoot
        })
      : null;
  const runtimeAuthority = buildRuntimeAuthorityDecision({
    backendRuntime: backendExecutionRuntime,
    mobileRuntime,
    nextRuntime,
    runtimeWarnings: [
      ...runtimeWarnings,
      ...(devServerRuntime?.warnings ?? []),
      "Approval recorded runtime metadata only; no runtime process was started."
    ],
    viteRuntime
  });
  const fileApprovalSucceeded = result.ok;
  const intelligencePostflight = runApprovedRuntimePostflight({
    changedFiles: plan.steps
      .filter((change) => change.tool === "write_file" && change.path && typeof change.content === "string")
      .map((change) => ({
        content: change.content ?? "",
        path: change.path ?? ""
      })),
    implementationSucceeded: fileApprovalSucceeded,
    productMode,
    taskDescription: typeof body.taskKind === "string"
      ? body.taskKind
      : plan.steps.map((change) => change.summary).join(" "),
    verification: result.verification
  });

  return Response.json({
    applied: fileApprovalSucceeded,
    appliedSteps: result.events
      .filter((event) => (event.type === "file_written" || event.type === "file_deleted") && event.stepId)
      .map((event) => event.stepId),
    blockedSteps: result.blockedReasons.map((reason, index) => ({
      reasons: [reason],
      stepId: `runtime-block-${index}`
    })),
    errors: result.blockedReasons.map((reason) => reason.message),
    events: result.events,
    intelligenceCompletion: intelligencePostflight.completion,
    intelligencePostflight,
    deletedFiles,
    rejectedWorkers: workerRouter.rejectedWorkers,
    runnerId: session.id,
    runnerStatus: fileApprovalSucceeded ? "completed" : "failed",
    ...runtimeAuthority,
    ...workerExecutionMetadata,
    requestedWorkerType: workerRouter.requestedWorkerType ?? adapterSelection.requestedWorkerType,
    selectedWorkerType: workerRouter.selectedWorkerType,
    skippedSteps: result.events
      .filter((event) => event.type === "step_skipped" && event.stepId)
      .map((event) => event.stepId),
    snapshot: result.snapshot ?? preflightSnapshot.snapshot,
    verification: result.verification ?? null,
    workerRouterStatus: workerRouter.routerStatus,
    workerRouterWarnings: workerRouter.routerWarnings,
    workerSelectionReason: workerRouter.selectionReason,
    workerFallbackReason: adapterSelection.fallbackReason,
    workerResult: result.workerResult ?? null,
    workspaceBindingStatus: workspaceBinding.registryStatus,
    workspaceCreated: workspaceBinding.created,
    workspaceRoot: workspaceBinding.workspaceRoot,
    workspaceWarnings: [...workspaceWarnings, ...runtimeWarnings],
    backendExecutionRuntime,
    liveRuntimePreview,
    mobileRuntime,
    nextRuntime,
    ok: fileApprovalSucceeded,
    previewMetadata: liveRuntimePreview?.previewRuntime ?? latestApprovalPreviewMetadata,
    viteRuntime,
    verificationOk: result.verification?.ok ?? null,
    writtenFiles
  }, { status: fileApprovalSucceeded ? 200 : 400 });
}
