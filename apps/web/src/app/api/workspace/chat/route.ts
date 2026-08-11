import { auth } from "@clerk/nextjs/server";
import { createOwnedChatSession } from "@hassali/database";

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null) as { projectId?: unknown; title?: unknown } | null;
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
