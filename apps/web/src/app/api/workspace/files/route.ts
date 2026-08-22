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
import {
  boundedJsonFailure,
  productionRequestLimits,
  readBoundedJson
} from "@/lib/server/production-hardening/request-guard";
import { safeApiErrorResponse } from "@/lib/server/production-hardening/safe-api-error";

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

    const parsedBody = await readBoundedJson<{
      action?: unknown;
      content?: unknown;
      path?: unknown;
      projectId?: unknown;
    }>(request, productionRequestLimits.mutationJsonBytes);
    if (!parsedBody.ok) return boundedJsonFailure(parsedBody);
    const body = parsedBody.value;

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
    return safeApiErrorResponse(error, "File creation could not be completed safely.", request);
  }
}

export async function PATCH(request: Request) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsedBody = await readBoundedJson<{
      action?: unknown;
      content?: unknown;
      kind?: unknown;
      newPath?: unknown;
      path?: unknown;
      projectId?: unknown;
    }>(request, productionRequestLimits.mutationJsonBytes);
    if (!parsedBody.ok) return boundedJsonFailure(parsedBody);
    const body = parsedBody.value;

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
    return safeApiErrorResponse(error, "File update could not be completed safely.", request);
  }
}

export async function DELETE(request: Request) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsedBody = await readBoundedJson<{
      kind?: unknown;
      path?: unknown;
      projectId?: unknown;
    }>(request, productionRequestLimits.memoryJsonBytes);
    if (!parsedBody.ok) return boundedJsonFailure(parsedBody);
    const body = parsedBody.value;

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
    return safeApiErrorResponse(error, "File deletion could not be completed safely.", request);
  }
}
