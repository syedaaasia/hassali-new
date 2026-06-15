import { auth } from "@clerk/nextjs/server";
import { createLocalApprovedFileRunnerAdapter } from "@/lib/server/runtime/local-approved-file-runner-adapter";
import {
  buildApprovedPlanFromProposal,
  validateRuntimeApprovalRequest,
  type RuntimeApprovalBody
} from "@/lib/server/runtime/runtime-approval-plan";

export const runtime = "nodejs";

function errorResponse(error: string, status = 400, extra?: Record<string, unknown>) {
  return Response.json({ error, ...extra }, { status });
}

export async function POST(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return errorResponse("Unauthorized", 401);
  }

  const body = (await request.json().catch(() => null)) as RuntimeApprovalBody | null;
  const parsed = validateRuntimeApprovalRequest(body);

  if ("error" in parsed) {
    return errorResponse(parsed.error, parsed.status ?? 400);
  }

  const { blockedReasons, plan, skippedSummaries } = buildApprovedPlanFromProposal({
    changes: parsed.changes,
    projectId: parsed.projectId,
    proposalId: parsed.proposalId,
    workspaceRoot: parsed.workspaceRoot
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
      skippedSteps: skippedSummaries,
      snapshot: null,
      verification: null,
      writtenFiles: []
    }, { status: 400 });
  }

  const adapter = createLocalApprovedFileRunnerAdapter();
  const session = await adapter.startSession({
    projectId: parsed.projectId,
    workspaceRoot: parsed.workspaceRoot
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
    runnerId: session.id,
    runnerStatus: result.ok ? "completed" : "blocked",
    skippedSteps: result.events
      .filter((event) => event.type === "step_skipped" && event.stepId)
      .map((event) => event.stepId),
    snapshot: result.snapshot ?? null,
    verification: result.verification ?? null,
    writtenFiles: result.events
      .filter((event) => event.type === "file_written")
      .map((event) => String(event.metadata?.path ?? ""))
      .filter(Boolean)
  }, { status: result.ok ? 200 : 400 });
}
