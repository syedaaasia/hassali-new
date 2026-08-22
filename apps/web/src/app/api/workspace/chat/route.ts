import { auth } from "@clerk/nextjs/server";
import { createOwnedChatSession } from "@hassali/database";
import {
  boundedJsonFailure,
  productionRequestLimits,
  readBoundedJson
} from "@/lib/server/production-hardening/request-guard";

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const parsedBody = await readBoundedJson<{ projectId?: unknown; title?: unknown }>(request, productionRequestLimits.memoryJsonBytes);
  if (!parsedBody.ok) return boundedJsonFailure(parsedBody);
  const body = parsedBody.value;
  const projectId = typeof body?.projectId === "string" ? body.projectId : "";
  if (!projectId) return Response.json({ error: "Project is required." }, { status: 400 });
  try {
    const session = await createOwnedChatSession({
      externalUserId: userId,
      projectId,
      title: typeof body?.title === "string" ? body.title : undefined
    });
    return Response.json({ sessionId: session.id, title: session.title });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return Response.json(
      { error: message === "PROJECT_NOT_OWNED" ? "Project not found." : "Chat creation failed." },
      { status: message === "PROJECT_NOT_OWNED" ? 404 : 500 }
    );
  }
}
