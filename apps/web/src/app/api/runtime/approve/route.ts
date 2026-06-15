import { auth } from "@clerk/nextjs/server";
import {
  isWorkspaceBindingError,
  resolveProjectWorkspace
} from "@/lib/server/runtime/project-workspace-registry";
import { selectRuntimeAdapter } from "@/lib/server/runtime/runtime-adapter-selector";
import {
  buildApprovedPlanFromProposal,
  validateRuntimeApprovalRequest,
  type RuntimeApprovalBody
} from "@/lib/server/runtime/runtime-approval-plan";
import { routeRuntimeWorker } from "@/lib/server/runtime/worker-router";
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
  const workerRouter = routeRuntimeWorker({
    plan,
    productMode: productModeFromBody(body.productMode),
    projectId: parsed.projectId,
    proposalMetadata: metadataFromBody(body.proposalMetadata),
    requestedWorkerType: workerTypeFromBody(body.workerType),
    riskLevel: riskLevelFromBody(body.riskLevel),
    snapshotStatus: snapshotStatusFromBody(body.snapshotStatus),
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
      rejectedWorkers: workerRouter.rejectedWorkers,
      requestedWorkerType: workerRouter.requestedWorkerType ?? parsed.workerType,
      selectedWorkerType: null,
      skippedSteps: skippedSummaries,
      snapshot: null,
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
  const result = await adapter.sendApprovedPlan(session, plan);

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
    runnerStatus: result.ok ? "completed" : "blocked",
    requestedWorkerType: workerRouter.requestedWorkerType ?? adapterSelection.requestedWorkerType,
    selectedWorkerType: workerRouter.selectedWorkerType,
    skippedSteps: result.events
      .filter((event) => event.type === "step_skipped" && event.stepId)
      .map((event) => event.stepId),
    snapshot: result.snapshot ?? null,
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
