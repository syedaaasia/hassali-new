import { auth } from "@clerk/nextjs/server";
import {
  isWorkspaceBindingError,
  resolveProjectWorkspace
} from "@/lib/server/runtime/project-workspace-registry";
import { createGitSnapshotSafety } from "@/lib/server/runtime/git-snapshot-safety";
import { selectRuntimeAdapter } from "@/lib/server/runtime/runtime-adapter-selector";
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

function workerTypeFromBody(value: unknown) {
  return typeof value === "string" ? value : null;
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
  const { blockedReasons, plan, skippedSummaries } = buildApprovedPlanFromProposal({
    changes: parsed.changes,
    projectId: parsed.projectId,
    proposalId: parsed.proposalId,
    workspaceRoot: workspaceBinding.workspaceRoot
  });
  const productMode = productModeFromBody(body.productMode);
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
    proposalMetadata: metadataFromBody(body.proposalMetadata),
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

  return Response.json({
    appliedSteps: result.events
      .filter((event) => event.type === "file_written" && event.stepId)
      .map((event) => event.stepId),
    blockedSteps: result.blockedReasons.map((reason, index) => ({
      reasons: [reason],
      stepId: `runtime-block-${index}`
    })),
    errors: result.blockedReasons.map((reason) => reason.message),
    events: result.events,
    rejectedWorkers: workerRouter.rejectedWorkers,
    runnerId: session.id,
    runnerStatus: result.ok ? "completed" : "failed",
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
    workspaceWarnings,
    writtenFiles: result.events
      .filter((event) => event.type === "file_written")
      .map((event) => String(event.metadata?.path ?? ""))
      .filter(Boolean)
  }, { status: result.ok ? 200 : 400 });
}
