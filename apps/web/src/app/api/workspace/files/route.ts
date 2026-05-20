import { auth } from "@clerk/nextjs/server";
import { saveUserProjectFileContent } from "@hassali/database";

export async function PATCH(request: Request) {
  console.info("patch route entered");

  try {
    const { userId } = await auth();

    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as {
      content?: unknown;
      path?: unknown;
      projectId?: unknown;
    } | null;

    if (
      typeof body?.projectId !== "string" ||
      typeof body.path !== "string" ||
      typeof body.content !== "string"
    ) {
      return Response.json({ error: "projectId, path, and content are required." }, { status: 400 });
    }

    console.info("file id/path", body.projectId, body.path);

    const file = await saveUserProjectFileContent({
      content: body.content,
      externalUserId: userId,
      path: body.path,
      projectId: body.projectId
    });

    if (!file) {
      return Response.json({ error: "Project not found." }, { status: 404 });
    }

    console.info("db update success");
    console.info("file field types", {
      content: typeof file.content,
      id: typeof file.id,
      path: typeof file.path
    });

    const response = {
      file: {
        content: String(file.content),
        id: String(file.id),
        path: String(file.path)
      }
    };

    console.info("primitive response ready");

    return Response.json(response);
  } catch (error) {
    console.error("file save failed", error instanceof Error ? error.message : "Unknown error");

    return Response.json({ error: "File persistence failed." }, { status: 500 });
  }
}
