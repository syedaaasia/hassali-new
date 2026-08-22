import { auth } from "@clerk/nextjs/server";
import { getOwnedGrowthProjectState, upsertOwnedGrowthProjectState } from "@hassali/database";
import { getOwnedWebsiteGrowthHandoff } from "@/lib/server/ai/website-growth-handoff-store";
import { growthBusinessTruthFromWebsite } from "@/lib/server/growth-intelligence/growth-intelligence";
import { prepareGrowthState } from "@/lib/server/growth-intelligence/growth-route-state";
import type { GrowthBusinessTruth } from "@/lib/server/growth-intelligence/growth-types";
import { boundedJsonFailure, productionRequestLimits, readBoundedJson } from "@/lib/server/production-hardening/request-guard";

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const projectId = new URL(request.url).searchParams.get("projectId")?.trim();
  if (!projectId) return Response.json({ error: "projectId is required" }, { status: 400 });
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
  try {
    const existing = await getOwnedGrowthProjectState({ externalUserId: userId, projectId });
    const existingTruth = ((existing?.state as { project?: { businessTruth?: GrowthBusinessTruth } } | null)?.project?.businessTruth) ?? null;
    const handoff = await getOwnedWebsiteGrowthHandoff({ externalUserId: userId, projectId }).catch(() => null);
    const enrichedTruth = existingTruth ?? (handoff ? growthBusinessTruthFromWebsite(handoff) : null);
    const state = prepareGrowthState({ businessTruth: enrichedTruth, ownerId: userId, projectId, prompt });
    await upsertOwnedGrowthProjectState({ externalUserId: userId, projectId, state });
    return Response.json({ state });
  } catch {
    return Response.json({ error: "Growth could not prepare this strategy from the current business context." }, { status: 409 });
  }
}
