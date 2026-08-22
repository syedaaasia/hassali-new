import { auth } from "@clerk/nextjs/server";
import { getOwnedProjectNotes, upsertOwnedProjectNotes } from "@hassali/database";
import { boundedJsonFailure, productionRequestLimits, readBoundedJson } from "@/lib/server/production-hardening/request-guard";

const maxNotes = 12_000;
const maxSummary = 2_000;

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const projectId = new URL(request.url).searchParams.get("projectId")?.trim();
  if (!projectId) return Response.json({ error: "projectId is required" }, { status: 400 });
  const notes = await getOwnedProjectNotes({ externalUserId: userId, projectId });
  return notes ? Response.json(notes) : Response.json({ error: "Project not found" }, { status: 404 });
}

export async function PUT(request: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = await readBoundedJson<Record<string, unknown>>(request, productionRequestLimits.settingsJsonBytes);
  if (!parsed.ok) return boundedJsonFailure(parsed);
  const body = parsed.value;
  const projectId = typeof body?.projectId === "string" ? body.projectId.trim() : "";
  if (!projectId) return Response.json({ error: "projectId is required" }, { status: 400 });
  const notes = await upsertOwnedProjectNotes({
    externalUserId: userId,
    hassaliSummary: typeof body?.hassaliSummary === "string" ? body.hassaliSummary.slice(0, maxSummary) : "",
    manualNotes: typeof body?.manualNotes === "string" ? body.manualNotes.slice(0, maxNotes) : "",
    projectId,
    useAsContext: body?.useAsContext === true
  });
  return notes ? Response.json(notes) : Response.json({ error: "Project not found" }, { status: 404 });
}
