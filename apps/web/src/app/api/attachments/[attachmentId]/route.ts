import { auth } from "@clerk/nextjs/server";
import { listUserProjectFiles } from "@hassali/database";
import {
  AttachmentPipelineError,
  loadStoredAttachment,
  removeStoredAttachment
} from "@/lib/server/attachments/attachment-pipeline";
import {
  isWorkspaceBindingError,
  resolveProjectWorkspace
} from "@/lib/server/runtime/project-workspace-registry";

export const runtime = "nodejs";

async function authorize(request: Request, attachmentId: string) {
  const { userId } = await auth();
  if (!userId) throw new AttachmentPipelineError("UPLOAD_FAILED", "Unauthorized", 401);
  const projectId = new URL(request.url).searchParams.get("projectId")?.trim() ?? "";
  if (!projectId) throw new AttachmentPipelineError("UPLOAD_FAILED", "A selected project is required.", 400);
  await listUserProjectFiles({ externalUserId: userId, projectId });
  const workspace = await resolveProjectWorkspace(projectId);
  if (isWorkspaceBindingError(workspace)) throw new AttachmentPipelineError("UPLOAD_FAILED", workspace.error, workspace.status);
  return { attachmentId, ownerId: userId, projectId, workspaceRoot: workspace.workspaceRoot };
}

function failure(error: unknown) {
  const safe = error instanceof AttachmentPipelineError
    ? error
    : new AttachmentPipelineError("UPLOAD_FAILED", "Attachment access failed safely.", 500);
  return Response.json({ code: safe.code, error: safe.message }, { status: safe.status });
}

export async function GET(request: Request, context: { params: Promise<{ attachmentId: string }> }) {
  try {
    const { attachmentId } = await context.params;
    const owned = await authorize(request, attachmentId);
    const attachment = await loadStoredAttachment(owned);
    return new Response(attachment.bytes, {
      headers: {
        "Cache-Control": "private, max-age=300",
        "Content-Disposition": `inline; filename="${attachment.metadata.safeName}"`,
        "Content-Type": attachment.metadata.mimeType,
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ attachmentId: string }> }) {
  try {
    const { attachmentId } = await context.params;
    const owned = await authorize(request, attachmentId);
    await removeStoredAttachment(owned);
    return Response.json({ removed: true });
  } catch (error) {
    return failure(error);
  }
}
