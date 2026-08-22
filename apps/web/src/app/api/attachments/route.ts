import { auth } from "@clerk/nextjs/server";
import { listUserProjectFiles } from "@hassali/database";
import { attachmentLimits } from "@/lib/attachments";
import {
  AttachmentPipelineError,
  storeAttachment
} from "@/lib/server/attachments/attachment-pipeline";
import {
  isWorkspaceBindingError,
  resolveProjectWorkspace
} from "@/lib/server/runtime/project-workspace-registry";
import {
  boundedJsonFailure,
  checkDeclaredRequestSize
} from "@/lib/server/production-hardening/request-guard";

export const runtime = "nodejs";

function attachmentError(error: unknown) {
  if (error instanceof AttachmentPipelineError) {
    return Response.json({ code: error.code, error: error.message }, { status: error.status });
  }
  return Response.json({ code: "UPLOAD_FAILED", error: "Attachment upload failed safely." }, { status: 500 });
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ code: "UPLOAD_FAILED", error: "Unauthorized" }, { status: 401 });
  try {
    const size = checkDeclaredRequestSize(request, attachmentLimits.individualFileBytes + 512 * 1024);
    if (!size.ok) return boundedJsonFailure(size);
    const form = await request.formData();
    const file = form.get("file");
    const projectId = String(form.get("projectId") ?? "").trim();
    const conversationId = String(form.get("conversationId") ?? "draft").trim();
    const storageScope = form.get("storageScope") === "project" ? "project" : "conversation";
    if (!(file instanceof File) || !projectId) {
      return Response.json({ code: "UPLOAD_FAILED", error: "A file and selected project are required." }, { status: 400 });
    }
    if (file.size > attachmentLimits.individualFileBytes) {
      return Response.json({ code: "FILE_TOO_LARGE", error: `Files are limited to ${attachmentLimits.individualFileBytes / 1024 / 1024} MB each.` }, { status: 413 });
    }
    await listUserProjectFiles({ externalUserId: userId, projectId });
    const workspace = await resolveProjectWorkspace(projectId);
    if (isWorkspaceBindingError(workspace)) {
      return Response.json({ code: "UPLOAD_FAILED", error: workspace.error }, { status: workspace.status });
    }
    const attachment = await storeAttachment({
      bytes: new Uint8Array(await file.arrayBuffer()),
      conversationId,
      mimeType: file.type || "application/octet-stream",
      name: file.name,
      ownerId: userId,
      projectId,
      storageScope,
      workspaceRoot: workspace.workspaceRoot
    });
    return Response.json({ attachment }, { status: 201 });
  } catch (error) {
    return attachmentError(error);
  }
}
