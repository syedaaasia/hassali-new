import { auth } from "@clerk/nextjs/server";
import { getRuntimeStreamSnapshot } from "@/lib/server/runtime/runtime-event-buffer";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const projectId = url.searchParams.get("projectId")?.trim();

  if (!projectId) {
    return Response.json({ error: "projectId is required." }, { status: 400 });
  }

  return Response.json(getRuntimeStreamSnapshot(projectId));
}
