import { auth } from "@clerk/nextjs/server";
import { listUserProjectFiles } from "@hassali/database";
import {
  appendLiveTaskTimeline,
  attachLiveTaskDelivery,
  cancelLiveExecutionTask,
  getLatestLiveExecutionTask,
  getLiveExecutionTask,
  getLiveExecutionTaskInternal
} from "@/lib/server/runtime/live-execution/live-execution-manager";
import {
  createTaskLocalCommit,
  inspectGitDeliveryState
} from "@/lib/server/runtime/live-execution/git-delivery";

export const runtime = "nodejs";

type OwnershipStatus = "denied" | "owned" | "unavailable";
const ownershipCache = new Map<string, { expiresAt: number; status: Exclude<OwnershipStatus, "unavailable"> }>();
const ownershipCacheTtlMs = 5_000;

async function verifyOwnership(externalUserId: string, projectId: string, fresh = false) {
  const key = `${externalUserId}:${projectId}`;
  const cached = ownershipCache.get(key);
  if (!fresh && cached && cached.expiresAt > Date.now()) return cached.status;
  try {
    const owned = Boolean(await listUserProjectFiles({ externalUserId, projectId }));
    const status = owned ? "owned" : "denied";
    ownershipCache.set(key, { expiresAt: Date.now() + ownershipCacheTtlMs, status });
    if (ownershipCache.size > 200) ownershipCache.delete(ownershipCache.keys().next().value as string);
    return status;
  } catch {
    return "unavailable";
  }
}

function ownershipError(status: OwnershipStatus) {
  return status === "unavailable"
    ? Response.json({ error: "Project ownership could not be verified." }, { status: 503 })
    : Response.json({ error: "Project not found or access denied." }, { status: 404 });
}

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const projectId = url.searchParams.get("projectId")?.trim();
  const taskId = url.searchParams.get("taskId")?.trim() || null;
  const proposalId = url.searchParams.get("proposalId")?.trim() || null;
  if (!projectId) return Response.json({ error: "projectId is required." }, { status: 400 });
  const ownership = await verifyOwnership(userId, projectId);
  if (ownership !== "owned") return ownershipError(ownership);
  const task = taskId
    ? getLiveExecutionTask({ externalUserId: userId, projectId, taskId })
    : getLatestLiveExecutionTask({ externalUserId: userId, projectId, proposalId });
  return Response.json({ task });
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null) as {
    action?: "cancel" | "local_commit";
    commitMessage?: string;
    projectId?: string;
    taskId?: string;
  } | null;
  const projectId = body?.projectId?.trim();
  const taskId = body?.taskId?.trim();
  if (!projectId || !taskId || !body?.action) {
    return Response.json({ error: "projectId, taskId, and action are required." }, { status: 400 });
  }
  const ownership = await verifyOwnership(userId, projectId, true);
  if (ownership !== "owned") return ownershipError(ownership);
  if (body.action === "cancel") {
    const cancelled = cancelLiveExecutionTask({ externalUserId: userId, projectId, taskId });
    return cancelled
      ? Response.json({ ok: true, task: getLiveExecutionTask({ externalUserId: userId, projectId, taskId }) })
      : Response.json({ error: "This task is not active or does not belong to this project." }, { status: 409 });
  }
  const internal = getLiveExecutionTaskInternal({ externalUserId: userId, projectId, taskId });
  if (!internal || !internal.deliveryContext || !internal.snapshot.git) {
    return Response.json({ error: "Verified Git delivery evidence is unavailable for this task." }, { status: 409 });
  }
  const result = await createTaskLocalCommit({
    authorizationSource: "inline_git_commit",
    changeLedger: internal.deliveryContext.changeLedger,
    commitMessage: body.commitMessage ?? `Hassali task: ${internal.snapshot.objective}`,
    delivery: internal.deliveryContext.delivery,
    git: internal.snapshot.git,
    workspaceRoot: internal.workspaceRoot
  });
  if (!result.ok) return Response.json({ error: result.error }, { status: 409 });
  const git = await inspectGitDeliveryState({
    changeLedger: internal.deliveryContext.changeLedger,
    delivery: internal.deliveryContext.delivery,
    workspaceRoot: internal.workspaceRoot
  });
  attachLiveTaskDelivery({
    context: internal.deliveryContext,
    delivery: internal.snapshot.delivery!,
    externalUserId: userId,
    git,
    projectId,
    taskId
  });
  appendLiveTaskTimeline({
    artifact: result.commitHash ? { kind: "git-commit", label: result.commitHash } : null,
    detail: result.message,
    externalUserId: userId,
    projectId,
    source: "git",
    stage: "git",
    status: "complete",
    taskId,
    title: "Local commit created"
  });
  return Response.json({ ok: true, result, task: getLiveExecutionTask({ externalUserId: userId, projectId, taskId }) });
}
