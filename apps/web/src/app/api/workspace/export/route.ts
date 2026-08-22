import { auth } from "@clerk/nextjs/server";
import { listUserProjectFiles, loadWorkspaceForExternalUser } from "@hassali/database";
import {
  projectExportFileName,
  type ProjectExportMode
} from "@/lib/server/project-export";
import { createVerifiedProjectPackage } from "@/lib/server/verified-shipping";

export const runtime = "nodejs";

function exportMode(value: string | null): ProjectExportMode | null {
  return value === "CODE" || value === "WEBSITE" ? value : null;
}

export async function GET(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const projectId = url.searchParams.get("projectId");
  const mode = exportMode(url.searchParams.get("mode"));

  if (!projectId || !mode) {
    return Response.json({ error: "A WEBSITE or CODE project is required for ZIP export." }, { status: 400 });
  }

  try {
    const files = await listUserProjectFiles({ externalUserId: userId, projectId });

    if (!files) {
      return Response.json({ error: "Project not found or access denied." }, { status: 404 });
    }

    const workspace = await loadWorkspaceForExternalUser(userId, projectId);
    if (workspace.project?.id !== projectId) {
      return Response.json({ error: "Project ownership could not be verified." }, { status: 403 });
    }

    const packaged = createVerifiedProjectPackage({
      files: files.map((file) => ({ content: String(file.content), path: String(file.path) })),
      mode,
      projectName: workspace.project.name,
      projectVerification: "not_recorded"
    });
    const fileName = projectExportFileName(workspace.project.name, mode);

    return new Response(packaged.zip, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Content-Length": String(packaged.zip.byteLength),
        "Content-Type": "application/zip",
        "X-Hassali-Canonical-Revision": packaged.manifest.canonicalRevision,
        "X-Hassali-Package-Id": packaged.manifest.packageId,
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ZIP export failed.";

    return Response.json({ error: message }, { status: 400 });
  }
}
