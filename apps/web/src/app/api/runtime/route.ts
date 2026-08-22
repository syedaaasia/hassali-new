import { auth } from "@clerk/nextjs/server";
import { listUserProjectFiles } from "@hassali/database";
import {
  clearRuntimeLogs,
  getRuntimeStatus,
  startRuntime,
  stopRuntime,
  syncRunningRuntimeWorkspace
} from "@/lib/server/runtime-manager";
import { sanitizeRuntimeText } from "@/lib/server/runtime/runtime-event-buffer";
import {
  boundedJsonFailure,
  productionRequestLimits,
  readBoundedJson
} from "@/lib/server/production-hardening/request-guard";

export const runtime = "nodejs";

type RuntimeRouteFile = {
  content: string;
  path: string;
};

function runtimeResponse(state: ReturnType<typeof getRuntimeStatus>) {
  return Response.json({
    error: state.error ? sanitizeRuntimeText(state.error) : null,
    logs: state.logs.map(sanitizeRuntimeText),
    port: state.port,
    previewUrl: state.previewUrl,
    projectId: state.projectId,
    status: state.status,
    workspacePath: null
  });
}

function databaseUnavailableResponse() {
  return Response.json(
    { error: "Database unavailable. Start Docker/Postgres." },
    { status: 503 }
  );
}

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const projectId = new URL(request.url).searchParams.get("projectId")?.trim() ?? "";
  if (!projectId) return Response.json({ error: "projectId is required." }, { status: 400 });
  try {
    const files = await listUserProjectFiles({ externalUserId: userId, projectId });
    if (!files) return Response.json({ error: "Project not found." }, { status: 404 });
  } catch {
    return databaseUnavailableResponse();
  }
  const state = getRuntimeStatus();
  if (state.projectId !== projectId) return Response.json({ error: "Runtime not found." }, { status: 404 });
  return runtimeResponse(state);
}

export async function POST(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsedBody = await readBoundedJson<{
    action?: unknown;
    projectId?: unknown;
  }>(request, productionRequestLimits.memoryJsonBytes);
  if (!parsedBody.ok) return boundedJsonFailure(parsedBody);
  const body = parsedBody.value;
  const action =
    body?.action === "clearLogs" ||
    body?.action === "restart" ||
    body?.action === "stop" ||
    body?.action === "sync"
      ? body.action
      : "start";

  if (typeof body?.projectId !== "string" || body.projectId.trim().length === 0) {
    return Response.json(
      { error: "Create or select a project before starting preview." },
      { status: 400 }
    );
  }

  let files: RuntimeRouteFile[] | null = null;

  try {
    files = await listUserProjectFiles({
      externalUserId: userId,
      projectId: body.projectId
    });
  } catch (error) {
    console.error(
      "runtime database unavailable",
      error instanceof Error ? error.message : "Unknown error"
    );
    return databaseUnavailableResponse();
  }

  if (!files) {
    return Response.json({ error: "Project not found." }, { status: 404 });
  }

  const current = getRuntimeStatus();
  if (current.projectId && current.projectId !== body.projectId) {
    return Response.json({ error: "Another project runtime is active. Stop it from its owning project first." }, { status: 409 });
  }

  if (action === "clearLogs") {
    return runtimeResponse(clearRuntimeLogs());
  }

  if (action === "stop") {
    return runtimeResponse(await stopRuntime());
  }

  const runtimeFiles = files.map((file) => ({
    content: String(file.content),
    path: String(file.path)
  }));

  if (action === "sync") {
    return runtimeResponse(await syncRunningRuntimeWorkspace(body.projectId, runtimeFiles));
  }

  return runtimeResponse(
    await startRuntime({
      files: runtimeFiles,
      projectId: body.projectId
    })
  );
}
