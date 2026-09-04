import { auth } from "@clerk/nextjs/server";
import { getOwnedGrowthProjectState, ownsGrowthProject, upsertOwnedGrowthProjectState } from "@hassali/database";
import { getOwnedWebsiteGrowthHandoff } from "@/lib/server/ai/website-growth-handoff-store";
import { growthBusinessTruthFromWebsite } from "@/lib/server/growth-intelligence/growth-intelligence";
import { prepareGrowthState } from "@/lib/server/growth-intelligence/growth-route-state";
import { persistedGrowthTruth } from "@/lib/server/growth-intelligence/growth-state-validation";
import { boundedJsonFailure, productionRequestLimits, readBoundedJson } from "@/lib/server/production-hardening/request-guard";

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const projectId = new URL(request.url).searchParams.get("projectId")?.trim();
  if (!projectId) return Response.json({ error: "projectId is required" }, { status: 400 });
  if (!await ownsGrowthProject({ externalUserId: userId, projectId })) return Response.json({ error: "Project not found" }, { status: 404 });
  const state = await getOwnedGrowthProjectState({ externalUserId: userId, projectId });
  return Response.json({ state: state?.state ?? null, updatedAt: state?.updatedAt ?? null });
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = await readBoundedJson<Record<string, unknown>>(request, productionRequestLimits.settingsJsonBytes);
  if (!parsed.ok) return boundedJsonFailure(parsed);
  const body = parsed.value;
  const projectId = typeof body?.projectId === "string" ? body.projectId.trim() : "";
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim().slice(0, 4_000) : "";
  if (!projectId || !prompt) return Response.json({ error: "projectId and prompt are required" }, { status: 400 });
  let stage = "load";
  try {
    if (!await ownsGrowthProject({ externalUserId: userId, projectId })) return Response.json({ error: "Project not found" }, { status: 404 });
    const existing = await getOwnedGrowthProjectState({ externalUserId: userId, projectId });
    const existingTruth = persistedGrowthTruth(existing?.state);
    const handoff = existingTruth ? null : await getOwnedWebsiteGrowthHandoff({ externalUserId: userId, projectId });
    const enrichedTruth = existingTruth ?? (handoff ? growthBusinessTruthFromWebsite(handoff) : null);
    stage = "prepare";
    const state = prepareGrowthState({ businessTruth: enrichedTruth, ownerId: userId, projectId, prompt });
    stage = "persist";
    const saved = await upsertOwnedGrowthProjectState({ externalUserId: userId, projectId, state });
    if (!saved) return Response.json({ error: "Project not found" }, { status: 404 });
    return Response.json({ state });
  } catch {
    console.error("growth_request_failed", { stage });
    return Response.json({ error: stage === "prepare" ? "Growth could not interpret this business context." : "Growth project storage is unavailable. Your saved business context has not been replaced.", code: stage === "prepare" ? "GROWTH_PREPARATION_FAILED" : "GROWTH_STORAGE_FAILED" }, { status: stage === "prepare" ? 422 : 503 });
  }
}
