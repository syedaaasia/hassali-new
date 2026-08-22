import { auth } from "@clerk/nextjs/server";
import { listUserProjectFiles } from "@hassali/database";
import {
  getRuntimeStreamEvents,
  getRuntimeStreamSnapshot
} from "@/lib/server/runtime/runtime-event-buffer";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const projectId = url.searchParams.get("projectId")?.trim();
  const runtimeId = url.searchParams.get("runtimeId")?.trim() || null;

  if (!projectId) {
    return Response.json({ error: "projectId is required." }, { status: 400 });
  }

  try {
    const files = await listUserProjectFiles({ externalUserId: userId, projectId });
    if (!files) return Response.json({ error: "Project not found or access denied." }, { status: 404 });
  } catch {
    return Response.json({ error: "Project ownership could not be verified." }, { status: 503 });
  }

  const snapshot = getRuntimeStreamSnapshot(projectId);

  return Response.json({
    ...snapshot,
    events: getRuntimeStreamEvents({ projectId, runtimeId }).slice(-120),
    logs: getRuntimeStreamEvents({ projectId, runtimeId })
      .filter((event) => event.type === "log" || event.stream)
      .map((event) => `[${event.stream ?? "system"}] ${event.message}`)
      .slice(-120)
  });
}
