import { auth } from "@clerk/nextjs/server";
import {
  createUserProjectFile,
  createUserProjectFolder,
  deleteUserProjectPath,
  listUserProjectFiles,
  renameUserProjectPath,
  saveUserProjectFileContent
} from "@hassali/database";
import { normalizeSafeProjectPath } from "@/lib/utils/path";

const folderPlaceholderFileName = ".hassali-folder";

type FileKind = "file" | "folder";

function normalizeWorkspacePath(value: unknown, kind: FileKind) {
  const normalized = normalizeSafeProjectPath(value);

  if (!normalized) return null;

  const segments = normalized.split("/");

  if (kind === "file" && segments.at(-1) === folderPlaceholderFileName) {
    return null;
  }

  return normalized;
}

function readFileKind(value: unknown): FileKind {
  return value === "folder" ? "folder" : "file";
}

function filesResponse(files: Awaited<ReturnType<typeof listUserProjectFiles>>) {
  if (!files) {
    return Response.json({ error: "Project not found." }, { status: 404 });
  }

  return Response.json({
    files: files.map((file) => ({
      content: String(file.content),
      id: String(file.id),
      path: String(file.path)
    }))
  });
}

export async function POST(request: Request) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as {
      action?: unknown;
      content?: unknown;
      path?: unknown;
      projectId?: unknown;
    } | null;

    if (typeof body?.projectId !== "string") {
      return Response.json({ error: "projectId is required." }, { status: 400 });
    }

    if (body.action === "createFolder") {
      const folderPath = normalizeWorkspacePath(body.path, "folder");

      if (!folderPath) {
        return Response.json({ error: "A valid folder path is required." }, { status: 400 });
      }

      const files = await createUserProjectFolder({
        externalUserId: userId,
        folderPath,
        placeholderFileName: folderPlaceholderFileName,
        projectId: body.projectId
      });

      return filesResponse(files);
    }

    const path = normalizeWorkspacePath(body.path, "file");

    if (!path) {
      return Response.json({ error: "A valid file path is required." }, { status: 400 });
    }

    const files = await createUserProjectFile({
      content: typeof body.content === "string" ? body.content : "",
      externalUserId: userId,
      path,
      projectId: body.projectId
    });

    return filesResponse(files);
  } catch (error) {
    const message = error instanceof Error ? error.message : "File creation failed.";

    return Response.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as {
      action?: unknown;
      content?: unknown;
      kind?: unknown;
      newPath?: unknown;
      path?: unknown;
      projectId?: unknown;
    } | null;

    if (typeof body?.projectId !== "string") {
      return Response.json({ error: "projectId is required." }, { status: 400 });
    }

    if (body.action === "rename") {
      const kind = readFileKind(body.kind);
      const path = normalizeWorkspacePath(body.path, kind);
      const newPath = normalizeWorkspacePath(body.newPath, kind);

      if (!path || !newPath) {
        return Response.json({ error: "Valid source and target paths are required." }, { status: 400 });
      }

      const files = await renameUserProjectPath({
        externalUserId: userId,
        kind,
        newPath,
        path,
        projectId: body.projectId
      });

      return filesResponse(files);
    }

    const path = normalizeWorkspacePath(body.path, "file");

    if (!path || typeof body.content !== "string") {
      return Response.json({ error: "path and content are required." }, { status: 400 });
    }

    const file = await saveUserProjectFileContent({
      content: body.content,
      externalUserId: userId,
      path,
      projectId: body.projectId
    });

    if (!file) {
      return Response.json({ error: "Project not found." }, { status: 404 });
    }

    const files = await listUserProjectFiles({
      externalUserId: userId,
      projectId: body.projectId
    });

    return filesResponse(files);
  } catch (error) {
    const message = error instanceof Error ? error.message : "File update failed.";

    return Response.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as {
      kind?: unknown;
      path?: unknown;
      projectId?: unknown;
    } | null;

    if (typeof body?.projectId !== "string") {
      return Response.json({ error: "projectId is required." }, { status: 400 });
    }

    const kind = readFileKind(body.kind);
    const path = normalizeWorkspacePath(body.path, kind);

    if (!path) {
      return Response.json({ error: "A valid path is required." }, { status: 400 });
    }

    const files = await deleteUserProjectPath({
      externalUserId: userId,
      kind,
      path,
      projectId: body.projectId
    });

    return filesResponse(files);
  } catch (error) {
    const message = error instanceof Error ? error.message : "File delete failed.";

    return Response.json({ error: message }, { status: 400 });
  }
}
