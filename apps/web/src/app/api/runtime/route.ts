import { auth } from "@clerk/nextjs/server";
import { listUserProjectFiles } from "@hassali/database";
import {
  clearRuntimeLogs,
  getRuntimeStatus,
  startRuntime,
  stopRuntime,
  syncRunningRuntimeWorkspace
} from "@/lib/server/runtime-manager";

export const runtime = "nodejs";

type RuntimeRouteFile = {
  content: string;
  path: string;
};

function runtimeResponse(state: ReturnType<typeof getRuntimeStatus>) {
  return Response.json({
    error: state.error,
    logs: state.logs,
    port: state.port,
    previewUrl: state.previewUrl,
    projectId: state.projectId,
    status: state.status,
    workspacePath: state.workspacePath
  });
}

function databaseUnavailableResponse() {
  return Response.json(
    { error: "Database unavailable. Start Docker/Postgres." },
    { status: 503 }
  );
}

export async function GET() {
  return runtimeResponse(getRuntimeStatus());
}

export async function POST(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    action?: unknown;
    projectId?: unknown;
  } | null;
  const action =
    body?.action === "clearLogs" ||
    body?.action === "restart" ||
    body?.action === "stop" ||
    body?.action === "sync"
      ? body.action
      : "start";

  if (action === "clearLogs") {
    return runtimeResponse(clearRuntimeLogs());
  }

  if (action === "stop") {
    return runtimeResponse(await stopRuntime());
  }

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
