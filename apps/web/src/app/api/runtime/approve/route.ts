import { auth } from "@clerk/nextjs/server";
import {
  applyUserProjectFileBatch,
  beginOwnedChatProposalApproval,
  completeOwnedChatProposalApproval,
  listUserProjectFiles,
  loadOwnedChatProposal,
  releaseOwnedChatProposalApproval
} from "@hassali/database";
import {
  persistCanonicalApprovalState,
  recordCanonicalEvent
} from "@/lib/server/canonical-persistence";
import { hassaliDefaultModelId } from "@/lib/model-registry";
import {
  isWorkspaceBindingError,
  resolveProjectWorkspace
} from "@/lib/server/runtime/project-workspace-registry";
import { createGitSnapshotSafety } from "@/lib/server/runtime/git-snapshot-safety";
import { buildLiveRuntimePreviewMetadata } from "@/lib/server/runtime/live-runtime-sync";
import { runPostApplyPreview } from "@/lib/server/runtime/post-apply-preview";
import { buildRuntimeAuthorityDecision } from "@/lib/server/runtime/runtime-authority";
import { selectRuntimeAdapter } from "@/lib/server/runtime/runtime-adapter-selector";
import { readApprovedFile } from "@/lib/server/runtime/approved-file-runner";
import { runCodeAutonomousExecution } from "@/lib/server/runtime/code-autonomous-orchestrator";
import { issueExecutionGrant, revokeExecutionGrant } from "@/lib/server/runtime/secure-execution/execution-grants";
import {
  codeExecutionKey,
  runCodeExecutionOnce
} from "@/lib/server/runtime/code-execution-registry";
import {
  clearOwnedProjectGeneratedArtifacts,
  synchronizeOwnedProjectWorkspace
} from "@/lib/server/runtime/owned-workspace-hydration";
import { verifyWebsitePreviewFidelity } from "@/lib/website-preview-fidelity";
import { buildMobilePreviewRuntime } from "@/lib/server/preview/mobile-preview-runtime";
import { buildMobileRuntimeCandidate } from "@/lib/server/runtime/mobile-runtime-manager";
import {
  buildApprovedPlanFromProposal,
  validateRuntimeApprovalRequest,
  type RuntimeApprovalBody,
  type RuntimeApprovalChange
} from "@/lib/server/runtime/runtime-approval-plan";
import { routeRuntimeWorker } from "@/lib/server/runtime/worker-router";
import type {
  RuntimeAdapterResult,
  RuntimeSnapshotMetadata
} from "@/lib/server/runtime/runtime-types";
import type {
  WorkerRouterProductMode,
  WorkerRouterSnapshotStatus
} from "@/lib/server/runtime/worker-router-types";
import { runApprovedRuntimePostflight } from "@/lib/server/intelligence/intelligence-postflight";
import {
  beginServerProposalApproval,
  completeServerProposalApproval,
  registerServerProposal,
  releaseServerProposalApproval,
  resolveServerProposal
} from "@/lib/server/runtime/server-proposal-registry";
import {
  canApplyWithProjectApprovalPolicy,
  isProjectApprovalPolicy
} from "@/lib/approval-policy";

export const runtime = "nodejs";

function errorResponse(error: string, status = 400, extra?: Record<string, unknown>) {
  return Response.json({ error, ...extra }, { status });
}

function snapshotStatusFromBody(value: unknown): WorkerRouterSnapshotStatus | undefined {
  return value === "available" || value === "failed" || value === "missing" || value === "unavailable"
    ? value
    : undefined;
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
    : [];
}

function compactDurableApprovalResult(result: Record<string, unknown>) {
  return {
    applied: result.applied === true,
    deletedFiles: stringList(result.deletedFiles),
    ok: result.ok === true,
    runnerStatus: typeof result.runnerStatus === "string" ? result.runnerStatus : "completed",
    runtimeStartStatus: typeof result.runtimeStartStatus === "string"
      ? result.runtimeStartStatus
      : "not_started",
    verificationOk: typeof result.verificationOk === "boolean" ? result.verificationOk : null,
    writtenFiles: stringList(result.writtenFiles)
  };
}

function rebuildDurableApprovalResult(
  result: Record<string, unknown>,
  files: Array<{ content: string; path: string }>
) {
  const writtenFiles = stringList(result.writtenFiles);
  const contentByPath = new Map(files.map((file) => [file.path, file.content]));
  return {
    ...result,
    duplicateSuppressed: true,
    fileContents: Object.fromEntries(
      writtenFiles.flatMap((path) => {
        const content = contentByPath.get(path);
        return typeof content === "string" ? [[path, content]] : [];
      })
    ),
    writtenFiles
  };
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
  changes: RuntimeApprovalChange[];
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

  let authorizedProposal = resolveServerProposal({
    projectId: parsed.projectId,
    proposalId: parsed.proposalId
  });

  if (!authorizedProposal) {
    try {
      const persistedProposal = await loadOwnedChatProposal({
        externalUserId: userId,
        projectId: parsed.projectId,
        proposalId: parsed.proposalId
      });

      if (persistedProposal) {
        registerServerProposal(persistedProposal);
        authorizedProposal = resolveServerProposal({
          projectId: parsed.projectId,
          proposalId: parsed.proposalId
        });
      }
    } catch {
      return errorResponse("Proposal authority could not be verified.", 503, {
        runnerStatus: "blocked",
        runtimeStartAttempted: false,
        runtimeStartStatus: "not_started",
        writtenFiles: []
      });
    }
  }

  if (!authorizedProposal) {
    return errorResponse(
      "This proposal is no longer available on the server. Regenerate it before approval.",
      409,
      {
        runnerStatus: "blocked",
        runtimeStartAttempted: false,
        runtimeStartStatus: "not_started",
        writtenFiles: []
      }
    );
  }

  const productMode = authorizedProposal.mode;
  const proposalMetadata = authorizedProposal.metadata;
  const proposalApprovalPolicy = isProjectApprovalPolicy(proposalMetadata.approvalPolicy)
    ? proposalMetadata.approvalPolicy
    : "ask";
  if (
    parsed.approvalSource === "standing_policy" &&
    (
      parsed.approvalPolicy === "ask" ||
      proposalApprovalPolicy !== parsed.approvalPolicy ||
      !canApplyWithProjectApprovalPolicy(
        parsed.approvalPolicy,
        proposalMetadata as Parameters<typeof canApplyWithProjectApprovalPolicy>[1]
      )
    )
  ) {
    return errorResponse("Standing approval is not valid for this proposal. Review it inline before applying.", 403, {
      runnerStatus: "blocked",
      runtimeStartAttempted: false,
      runtimeStartStatus: "not_started",
      writtenFiles: []
    });
  }
  const proposalBlockReasons = proposalApplyBlockReasons({
    changes: authorizedProposal.changes,
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

  const expectedProjectRevision = typeof proposalMetadata.serverProjectRevision === "string"
    ? proposalMetadata.serverProjectRevision
    : "";
  if (!expectedProjectRevision) {
    return errorResponse("This proposal predates revision-safe approval. Regenerate it before applying files.", 409, {
      runnerStatus: "blocked",
      runtimeStartAttempted: false,
      runtimeStartStatus: "not_started",
      writtenFiles: []
    });
  }
  let durableApprovalClaim;
  try {
    durableApprovalClaim = await beginOwnedChatProposalApproval({
      expectedProjectRevision,
      externalUserId: userId,
      projectId: parsed.projectId,
      proposalId: parsed.proposalId
    });
  } catch {
    return errorResponse("The durable proposal approval claim could not be created.", 503, {
      runnerStatus: "blocked",
      runtimeStartAttempted: false,
      runtimeStartStatus: "not_started",
      writtenFiles: []
    });
  }

  if (durableApprovalClaim.status === "completed") {
    return Response.json(
      rebuildDurableApprovalResult(durableApprovalClaim.result, ownedProjectFiles),
      { status: 200 }
    );
  }

  if (durableApprovalClaim.status === "executing") {
    return errorResponse("This approved proposal is already executing.", 409, {
      duplicateSuppressed: true,
      runnerStatus: "running",
      runtimeStartAttempted: false,
      runtimeStartStatus: "not_started",
      writtenFiles: []
    });
  }

  if (durableApprovalClaim.status === "project_busy") {
    return errorResponse("Another approved task is already executing for this project.", 409, {
      duplicateSuppressed: true,
      runnerStatus: "running",
      runtimeStartAttempted: false,
      runtimeStartStatus: "not_started",
      writtenFiles: []
    });
  }

  if (durableApprovalClaim.status === "stale") {
    return errorResponse("The project changed after this proposal was created. Regenerate the proposal before approval.", 409, {
      runnerStatus: "blocked",
      runtimeStartAttempted: false,
      runtimeStartStatus: "not_started",
      writtenFiles: []
    });
  }

  if (durableApprovalClaim.status !== "acquired") {
    return errorResponse("The durable proposal authority could not be claimed for execution.", 409, {
      runnerStatus: "blocked",
      runtimeStartAttempted: false,
      runtimeStartStatus: "not_started",
      writtenFiles: []
    });
  }

  const durableClaimToken = durableApprovalClaim.claimToken;
  const releaseApprovalClaims = async () => {
    releaseServerProposalApproval({
      projectId: parsed.projectId,
      proposalId: parsed.proposalId
    });
    await releaseOwnedChatProposalApproval({
      claimToken: durableClaimToken,
      externalUserId: userId,
      projectId: parsed.projectId,
      proposalId: parsed.proposalId
    }).catch(() => false);
  };
  const approvalClaim = beginServerProposalApproval({
    projectId: parsed.projectId,
    proposalId: parsed.proposalId
  });

  if (approvalClaim.status === "completed") {
    await completeOwnedChatProposalApproval({
      claimToken: durableClaimToken,
      externalUserId: userId,
      projectId: parsed.projectId,
      proposalId: parsed.proposalId,
      result: compactDurableApprovalResult(approvalClaim.result)
    }).catch(() => false);
    return Response.json({
      ...approvalClaim.result,
      duplicateSuppressed: true
    }, { status: 200 });
  }

  if (approvalClaim.status === "executing") {
    await releaseApprovalClaims();
    return errorResponse("This approved proposal is already executing.", 409, {
      duplicateSuppressed: true,
      runnerStatus: "running",
      runtimeStartAttempted: false,
      runtimeStartStatus: "not_started",
      writtenFiles: []
    });
  }

  if (approvalClaim.status !== "acquired") {
    await releaseApprovalClaims();
    return errorResponse("The server-authoritative proposal could not be claimed for execution.", 409, {
      runnerStatus: "blocked",
      runtimeStartAttempted: false,
      runtimeStartStatus: "not_started",
      writtenFiles: []
    });
  }

  const workspaceBinding = await resolveProjectWorkspace(parsed.projectId);
  if (isWorkspaceBindingError(workspaceBinding)) {
    await releaseApprovalClaims();
    return errorResponse(workspaceBinding.error, workspaceBinding.status);
  }
  try {
    await synchronizeOwnedProjectWorkspace({
      files: ownedProjectFiles,
      workspaceRoot: workspaceBinding.workspaceRoot
    });
  } catch {
    await releaseApprovalClaims();
    return errorResponse("The owned project workspace could not be synchronized safely.", 503, {
      runnerStatus: "blocked",
      runtimeStartAttempted: false,
      runtimeStartStatus: "not_started",
      writtenFiles: []
    });
  }

  const workspaceWarnings = [
    ...workspaceBinding.warnings,
    ...(typeof body.productMode === "string" && body.productMode !== productMode
      ? ["Client productMode differed from the server-authoritative proposal mode and was ignored."]
      : []),
    ...(typeof body.workspaceRoot === "string" && body.workspaceRoot.trim().length > 0
      ? ["Client-supplied workspaceRoot was ignored; Hassali resolved the project workspace server-side."]
      : []),
    ...(body.workerType && body.workerType !== "local"
      ? ["Client worker selection was ignored; approved CODE I1 execution is local and server-owned."]
      : [])
  ];
  const { blockedReasons, plan, runtimeWarnings, skippedSummaries } = buildApprovedPlanFromProposal({
    changes: authorizedProposal.changes,
    productMode,
    projectId: parsed.projectId,
    proposalId: parsed.proposalId,
    workspaceRoot: workspaceBinding.workspaceRoot
  });
  const latestApprovalPreviewMetadata = previewMetadataFromApproval({
    metadata: proposalMetadata,
    productMode
  });
  const requestedWorkerType = "local" as const;
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
    snapshotStatus: preflightSnapshot.snapshotStatus,
    taskKind: typeof proposalMetadata.taskType === "string" ? proposalMetadata.taskType : undefined,
    workspaceRoot: workspaceBinding.workspaceRoot
  });

  if (blockedReasons.length > 0) {
    await releaseApprovalClaims();
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
      requestedWorkerType: workerRouter.requestedWorkerType ?? requestedWorkerType,
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
  let session: Awaited<ReturnType<typeof adapter.startSession>>;
  let result: Awaited<ReturnType<typeof adapter.sendApprovedPlan>>;
  const workerExecutionStartedAt = new Date().toISOString();

  try {
    session = await adapter.startSession({
      projectId: parsed.projectId,
      workspaceRoot: workspaceBinding.workspaceRoot
    });
    result = await adapter.sendApprovedPlan(session, plan);
  } catch (error) {
    await releaseApprovalClaims();
    return errorResponse(
      error instanceof Error ? error.message : "Approved CODE execution could not start.",
      500,
      {
        runnerStatus: "failed",
        runtimeStartAttempted: false,
        runtimeStartStatus: "failed",
        writtenFiles: []
      }
    );
  }
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
  const selectedModel = typeof proposalMetadata.serverSelectedModel === "string" &&
      proposalMetadata.serverSelectedModel.trim()
    ? proposalMetadata.serverSelectedModel.trim()
    : hassaliDefaultModelId;
  const taskObjective = typeof proposalMetadata.serverTaskObjective === "string" &&
      proposalMetadata.serverTaskObjective.trim()
    ? proposalMetadata.serverTaskObjective.trim()
    : authorizedProposal.summary;
  const executionPolicy = /\bautopilot\b/i.test(taskObjective)
    ? "AUTOPILOT_EXPERIMENTAL"
    : /\bcalm mode\b/i.test(taskObjective)
      ? "CALM"
      : "FLOW";
  let codeExecutionResult = null;
  try {
    codeExecutionResult =
      result.ok &&
      productMode === "CODE" &&
      authorizedProposal.approvalMode === "EXECUTE"
      ? await runCodeExecutionOnce({
          execute: async (abortSignal) => {
            const executionGrantId = issueExecutionGrant({
              approvalPolicy: parsed.approvalPolicy,
              approvalSource: parsed.approvalSource,
              capabilities: ["repository.verify"],
              externalUserId: userId,
              maxUses: 32,
              mode: "CODE",
              projectId: parsed.projectId,
              riskCeiling: "medium",
              scopeKind: "project",
              scopeRoot: workspaceBinding.workspaceRoot
            });
            try {
              return await runCodeAutonomousExecution({
                abortSignal,
                approvedPaths: plan.steps
                  .filter((step) => step.tool === "write_file" && step.path)
                  .map((step) => step.path!),
                executionGrantId,
                executionPolicy,
                externalUserId: userId,
                objective: taskObjective,
                projectId: parsed.projectId,
                proposalId: parsed.proposalId,
                selectedModel,
                workspaceRoot: workspaceBinding.workspaceRoot
              });
            } finally {
              revokeExecutionGrant(executionGrantId);
            }
          },
          key: codeExecutionKey(parsed.projectId, parsed.proposalId)
        })
      : null;
  } catch (error) {
    await synchronizeOwnedProjectWorkspace({
      files: ownedProjectFiles,
      workspaceRoot: workspaceBinding.workspaceRoot
    }).catch(() => undefined);
    await releaseApprovalClaims();
    return errorResponse(
      error instanceof Error ? error.message : "Autonomous CODE verification could not complete.",
      500,
      {
        runnerStatus: "failed",
        runtimeStartAttempted: false,
        runtimeStartStatus: "failed",
        writtenFiles: []
      }
    );
  }
  const codeExecution = codeExecutionResult?.report ?? null;
  const finalFileContents = codeExecution?.finalFileContents ?? {};
  let workspaceCanonicalizedForRuntime = false;

  if (result.ok) {
    try {
      const persistenceWrites: Array<{ content: string; path: string }> = [];
      const persistenceDeletes: string[] = [];
      for (const step of plan.steps) {
        if (step.tool === "delete_file" && step.path) {
          persistenceDeletes.push(step.path);
          continue;
        }

        if (step.tool !== "write_file" || !step.path || typeof step.content !== "string") {
          continue;
        }

        const finalContent = finalFileContents[step.path] ??
          await readApprovedFile(workspaceBinding.workspaceRoot, step.path);
        persistenceWrites.push({ content: finalContent, path: step.path });
      }
      const persistenceResult = await applyUserProjectFileBatch({
        deletes: persistenceDeletes,
        expectedProjectRevision,
        externalUserId: userId,
        projectId: parsed.projectId,
        proposalApproval: {
          claimToken: durableClaimToken,
          proposalId: parsed.proposalId,
          result: compactDurableApprovalResult({
            applied: true,
            deletedFiles,
            ok: true,
            runnerStatus: "completed",
            runtimeStartStatus: "not_started",
            verificationOk: result.verification?.ok ?? null,
            writtenFiles
          })
        },
        writes: persistenceWrites
      });

      if (persistenceResult.status !== "applied") {
        const reason = persistenceResult.status === "stale"
          ? "The project changed during execution. Hassali preserved the newer project state."
          : persistenceResult.status === "claim_lost"
            ? "The durable proposal claim was lost before persistence."
            : "Project ownership was lost during approval persistence.";
        throw new Error(reason);
      }
      const persistedFiles = persistenceResult.files;
      const persistedByPath = new Map(persistedFiles.map((file) => [file.path, file.content]));
      for (const file of persistenceWrites) {
        if (persistedByPath.get(file.path) !== file.content) {
          throw new Error(`Persistence verification failed for: ${file.path}`);
        }
        await recordBestEffortEvent(workspaceBinding.workspaceRoot, "FILE_WRITTEN", {
          path: file.path,
          projectId: parsed.projectId,
          proposalId: parsed.proposalId
        });
      }
      for (const deletedPath of persistenceDeletes) {
        if (persistedByPath.has(deletedPath)) {
          throw new Error(`Persistence verification failed for deleted file: ${deletedPath}`);
        }
      }

      try {
        await persistCanonicalApprovalState({
          files: persistedFiles.map((file) => ({
            content: String(file.content),
            path: String(file.path)
          })),
          projectId: parsed.projectId,
          proposalId: parsed.proposalId,
          workspaceRoot: workspaceBinding.workspaceRoot
        });
      } catch {
        workspaceWarnings.push(
          "Database persistence succeeded, but local canonical preview metadata must be rebuilt on the next refresh."
        );
        await recordBestEffortEvent(workspaceBinding.workspaceRoot, "PERSIST_FAILURE", {
          error: "Local canonical preview metadata could not be updated.",
          projectId: parsed.projectId,
          proposalId: parsed.proposalId
        });
      }
      try {
        if (codeExecution) {
          await clearOwnedProjectGeneratedArtifacts(workspaceBinding.workspaceRoot);
        }
        await synchronizeOwnedProjectWorkspace({
          files: persistedFiles,
          workspaceRoot: workspaceBinding.workspaceRoot
        });
        workspaceCanonicalizedForRuntime = true;
      } catch {
        workspaceWarnings.push(
          "Verified files were persisted, but the local runtime mirror could not be canonicalized. Hassali did not start a runtime."
        );
      }
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
      const latestOwnedFiles = await listUserProjectFiles({
        externalUserId: userId,
        projectId: parsed.projectId
      }).catch(() => null);
      if (latestOwnedFiles) {
        await synchronizeOwnedProjectWorkspace({
          files: latestOwnedFiles,
          workspaceRoot: workspaceBinding.workspaceRoot
        }).catch(() => undefined);
      }
      await releaseApprovalClaims();

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

  const liveRuntimePreview = result.ok && workspaceCanonicalizedForRuntime
    ? await buildLiveRuntimePreviewMetadata({
        productMode,
        projectId: parsed.projectId,
        workspaceRoot: workspaceBinding.workspaceRoot,
        writtenFiles
      })
    : null;
  const websitePreviewFidelity = result.ok && workspaceCanonicalizedForRuntime && productMode === "WEBSITE"
    ? await (async () => {
        const canonicalFiles = await listUserProjectFiles({
          externalUserId: userId,
          projectId: parsed.projectId
        }).catch(() => null);
        const expectedAssetPaths = stringArrayValue(proposalMetadata.websitePreviewAssetPaths);
        const entryRoute = stringValue(proposalMetadata.websitePreviewEntryRoute) || "index.html";
        const expectedIdentity = stringValue(proposalMetadata.websitePreviewIdentity) || null;
        return verifyWebsitePreviewFidelity({
          entryRoute,
          expectedAssetPaths,
          expectedIdentity,
          files: Object.fromEntries(
            (canonicalFiles ?? []).map((file) => [file.path, file.content])
          ),
          filesApplied: true,
          workspaceMatches: Boolean(canonicalFiles)
        });
      })()
    : null;
  const mobilePreview = liveRuntimePreview
    ? buildMobilePreviewRuntime({
        files: liveRuntimePreview.analysis.generatedFiles
      })
    : null;
  const codeRuntimeExecutionAllowed = Boolean(
    result.ok &&
    productMode === "CODE" &&
    authorizedProposal.approvalMode === "EXECUTE" &&
    workerRouter.selectedWorkerType === "local" &&
    result.verification?.ok !== false &&
    (
      !codeExecution ||
      (
        codeExecution.commandResults.every((command) => command.status === "PASSED") &&
        codeExecution.scopeExpansionRequired.length === 0
      )
    )
  );
  const fileApprovalSucceeded = result.ok;
  const codeOutcomeSucceeded = !codeExecution ||
    codeExecution.completionStatus === "COMPLETE_VERIFIED" ||
    codeExecution.completionStatus === "COMPLETE_WITH_LIMITATIONS";
  const postApplyPreview = liveRuntimePreview && productMode === "CODE"
    ? await runPostApplyPreview({
        abortSignal: request.signal,
        approvalSatisfied: true,
        filesApplied: fileApprovalSucceeded,
        filesChanged: writtenFiles,
        generatedFiles: liveRuntimePreview.analysis.generatedFiles,
        projectId: parsed.projectId,
        runtimeStartAllowed: codeRuntimeExecutionAllowed,
        verificationStatus: result.verification?.ok === false
          ? "FAILED"
          : result.verification?.ok === true
            ? "PASSED"
            : "NOT_RUN",
        workerType: workerRouter.selectedWorkerType,
        workspaceRoot: workspaceBinding.workspaceRoot
      })
    : null;
  const viteRuntime = postApplyPreview?.discovery.selectedTarget?.framework === "react_vite"
    ? postApplyPreview.operation
    : null;
  const nextRuntime = postApplyPreview?.discovery.selectedTarget?.framework === "next_app"
    ? postApplyPreview.operation
    : null;
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
    postApplyPreview: postApplyPreview?.result,
    runtimeWarnings: [
      ...runtimeWarnings,
      ...(postApplyPreview?.discovery.warnings ?? [])
    ],
    viteRuntime
  });
  const intelligencePostflight = runApprovedRuntimePostflight({
    changedFiles: plan.steps
      .filter((change) => change.tool === "write_file" && change.path && typeof change.content === "string")
      .map((change) => ({
        content: finalFileContents[change.path ?? ""] ?? change.content ?? "",
        path: change.path ?? ""
      })),
    implementationSucceeded: fileApprovalSucceeded && codeOutcomeSucceeded,
    productMode,
    taskDescription: taskObjective,
    verification: result.verification
  });

  const responsePayload = {
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
    codeExecution,
    duplicateSuppressed: codeExecutionResult?.duplicateSuppressed ?? false,
    fileContents: finalFileContents,
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
    workspaceWarnings: [
      ...workspaceWarnings,
      ...runtimeWarnings,
      ...(postApplyPreview?.discovery.warnings ?? [])
    ],
    backendExecutionRuntime,
    liveRuntimePreview,
    mobileRuntime,
    nextRuntime,
    ok: fileApprovalSucceeded,
    postApplyPreview: postApplyPreview?.result ?? null,
    previewMetadata: websitePreviewFidelity && latestApprovalPreviewMetadata
      ? {
          ...latestApprovalPreviewMetadata,
          assetPathsVerified: websitePreviewFidelity.assetPathsVerified,
          contentIdentity: websitePreviewFidelity.expectedIdentity,
          generatedRouteVerified: websitePreviewFidelity.generatedRouteVerified,
          generatedWorkspaceVerified: websitePreviewFidelity.generatedWorkspaceVerified,
          httpReadiness: websitePreviewFidelity.httpReadiness,
          previewContentVerified: websitePreviewFidelity.previewContentVerified,
          previewFailureClass: websitePreviewFidelity.failureClass,
          previewReady: websitePreviewFidelity.previewReady,
          status: websitePreviewFidelity.previewReady ? "ready" : "blocked"
        }
      : liveRuntimePreview?.previewRuntime ?? latestApprovalPreviewMetadata,
    viteRuntime,
    verificationOk: result.verification?.ok ?? null,
    websitePreviewFidelity,
    writtenFiles
  };

  if (postApplyPreview) {
    await recordBestEffortEvent(workspaceBinding.workspaceRoot, "CODE_POST_APPLY_PREVIEW", {
      commandSource: postApplyPreview.result.commandSource,
      failureClass: postApplyPreview.result.failureClass,
      filesApplied: postApplyPreview.result.filesApplied,
      packageManager: postApplyPreview.result.packageManager,
      portSelectionResult: postApplyPreview.result.portSelectionResult,
      previewAttempted: postApplyPreview.result.previewAttempted,
      previewReady: postApplyPreview.result.previewReady,
      previewReused: postApplyPreview.result.existingProcessReused,
      processStarted: postApplyPreview.result.processStarted,
      projectId: parsed.projectId,
      proposalId: parsed.proposalId,
      readinessVerified: postApplyPreview.result.readinessVerified,
      recoveryProvided: postApplyPreview.result.recoverySteps.length > 0,
      runtimeKind: postApplyPreview.result.runtimeKind,
      runtimeStatus: postApplyPreview.result.runtimeStatus
    });
  }
  if (websitePreviewFidelity) {
    await recordBestEffortEvent(workspaceBinding.workspaceRoot, "WEBSITE_PREVIEW_FIDELITY", {
      assetPathsVerified: websitePreviewFidelity.assetPathsVerified,
      failureClass: websitePreviewFidelity.failureClass,
      filesApplied: websitePreviewFidelity.filesApplied,
      generatedRouteVerified: websitePreviewFidelity.generatedRouteVerified,
      generatedWorkspaceVerified: websitePreviewFidelity.generatedWorkspaceVerified,
      httpReadiness: websitePreviewFidelity.httpReadiness,
      previewContentVerified: websitePreviewFidelity.previewContentVerified,
      previewReady: websitePreviewFidelity.previewReady,
      projectId: parsed.projectId,
      proposalId: parsed.proposalId,
      route: websitePreviewFidelity.route
    });
  }

  if (fileApprovalSucceeded) {
    completeServerProposalApproval({
      projectId: parsed.projectId,
      proposalId: parsed.proposalId,
      result: responsePayload
    });
  } else {
    await releaseApprovalClaims();
  }

  return Response.json(responsePayload, { status: fileApprovalSucceeded ? 200 : 400 });
}
