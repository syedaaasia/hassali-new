import { auth } from "@clerk/nextjs/server";
import { getOwnedGrowthProjectState, ownsGrowthProject, upsertOwnedGrowthProjectState } from "@hassali/database";
import { WebsiteGrowthHandoffError } from "@/lib/server/ai/website-growth-handoff";
import { loadGrowthBusinessContext } from "@/lib/server/growth-intelligence/growth-business-context";
import { prepareGrowthState } from "@/lib/server/growth-intelligence/growth-route-state";
import { persistedGrowthTruth } from "@/lib/server/growth-intelligence/growth-state-validation";
import { record } from "@/lib/server/growth-intelligence/growth-state-validation";
import { readDiscoveryState } from "@/lib/server/growth-intelligence/growth-discovery-core";
import { GrowthDiscoveryError, liveGrowthDependencies, publicWebDiscovery, runGrowthDiscovery } from "@/lib/server/growth-intelligence/growth-discovery-service";
import { processGrowthJob, type GrowthJobAction } from "@/lib/server/growth-intelligence/growth-job-request";
import { growthProspectsCsv } from "@/lib/growth-discovery";
import { growthStorageFailure } from "@/lib/server/growth-intelligence/growth-errors";
import { boundedJsonFailure, productionRequestLimits, readBoundedJson } from "@/lib/server/production-hardening/request-guard";

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const projectId = new URL(request.url).searchParams.get("projectId")?.trim();
  if (!projectId) return Response.json({ error: "projectId is required" }, { status: 400 });
  try {
  if (!await ownsGrowthProject({ externalUserId: userId, projectId })) return Response.json({ error: "Project not found", code: "GROWTH_OWNERSHIP_DENIED" }, { status: 404 });
  const state = await getOwnedGrowthProjectState({ externalUserId: userId, projectId });
  if (new URL(request.url).searchParams.get("format") === "csv") {
    const discovery = readDiscoveryState(record(state?.state).discovery);
    const ids = new URL(request.url).searchParams.get("ids")?.split(",").filter(Boolean).slice(0, 500);
    return new Response(growthProspectsCsv(discovery, ids), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="hassali-growth-prospects.csv"', "Cache-Control": "private, no-store" } });
  }
  return Response.json({ state: state?.state ? { ...record(state.state), discovery: readDiscoveryState(record(state.state).discovery) } : null, updatedAt: state?.updatedAt ?? null });
  } catch (error) {
    const failure = growthStorageFailure(error);
    console.error("growth_request_failed", { stage: "load", code: failure.code });
    return Response.json(failure, { status: 503 });
  }
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = await readBoundedJson<Record<string, unknown>>(request, productionRequestLimits.settingsJsonBytes);
  if (!parsed.ok) return boundedJsonFailure(parsed);
  const body = parsed.value;
  const projectId = typeof body?.projectId === "string" ? body.projectId.trim() : "";
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim().slice(0, 4_000) : "";
  const action = typeof body.action === "string" ? body.action : "strategy";
  const jobAction = ["advance", "pause", "resume", "cancel"].includes(action);
  if (!projectId || (!prompt && !jobAction && !["outreach", "audience"].includes(action))) return Response.json({ error: "projectId and prompt are required" }, { status: 400 });
  if (!jobAction && !["strategy", "capture", "analyze", "search", "refine", "audience", "outreach"].includes(action)) return Response.json({ error: "Unknown Growth action" }, { status: 400 });
  if (body.target !== undefined && (typeof body.target !== "number" || !Number.isInteger(body.target) || body.target < 1 || body.target > 500)) return Response.json({ error: "Target must be an integer from 1 to 500." }, { status: 400 });
  let stage = "load";
  try {
    if (!await ownsGrowthProject({ externalUserId: userId, projectId })) return Response.json({ error: "Project not found", code: "GROWTH_OWNERSHIP_DENIED" }, { status: 404 });
    const existing = await getOwnedGrowthProjectState({ externalUserId: userId, projectId });
    if (jobAction) {
      stage = "prepare";
      let expectedUpdatedAt = existing?.updatedAt ? new Date(existing.updatedAt).toISOString() : null;
      const discovery = await processGrowthJob({ previous: readDiscoveryState(record(existing?.state).discovery), action: action as GrowthJobAction,
        jobId: typeof body.jobId === "string" ? body.jobId : "", revision: body.revision,
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(90000)]),
        save: async next => {
          stage = "persist";
          const saved = await upsertOwnedGrowthProjectState({ externalUserId: userId, projectId, state: { ...record(existing?.state), discovery: next }, expectedUpdatedAt });
          stage = "prepare";
          if (!saved) return false;
          expectedUpdatedAt = new Date(saved.updatedAt).toISOString();
          return true;
        }
      }, liveGrowthDependencies(userId), publicWebDiscovery);
      return Response.json({ state: { ...record(existing?.state), discovery } });
    }
    const existingTruth = persistedGrowthTruth(existing?.state);
    if (record(record(existing?.state).project).businessTruth && !existingTruth) console.info("growth_state_recovered", { code: "GROWTH_STALE_BUSINESS_TRUTH" });
    stage = "business-context";
    const enrichedTruth = await loadGrowthBusinessContext({ externalUserId: userId, projectId, state: existing?.state });
    stage = "prepare";
    const previousDiscovery = readDiscoveryState(record(existing?.state).discovery);
    if (action !== "strategy" && body.revision !== previousDiscovery.revision) return Response.json({ error: "This Growth project changed in another session. Reload it before continuing.", code: "GROWTH_CONFLICT" }, { status: 409 });
    const state = action === "strategy" ? { ...record(existing?.state), ...prepareGrowthState({ businessTruth: enrichedTruth, ownerId: userId, projectId, prompt }) } : {
      ...record(existing?.state),
      project: { ...record(record(existing?.state).project), ownerId: userId, projectId, businessTruth: enrichedTruth },
      discovery: await runGrowthDiscovery({ previous: previousDiscovery, truth: enrichedTruth,
        action: action as "capture" | "analyze" | "search" | "refine" | "audience" | "outreach", prompt,
        checkpointDiscovery: true, target: typeof body.target === "number" ? body.target : undefined,
        audienceId: typeof body.audienceId === "string" ? body.audienceId : undefined,
        selectedIds: Array.isArray(body.selectedIds) ? body.selectedIds.filter((x): x is string => typeof x === "string").slice(0, 500) : [],
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(180000)])
      }, liveGrowthDependencies(userId))
    };
    stage = "persist";
    if (request.signal.aborted) return Response.json({ error: "Growth request cancelled" }, { status: 499 });
    const saved = await upsertOwnedGrowthProjectState({ externalUserId: userId, projectId, state, expectedUpdatedAt: existing?.updatedAt ? new Date(existing.updatedAt).toISOString() : null });
    if (!saved) return Response.json({ error: "This project changed while Growth was working. Reload before trying again.", code: "GROWTH_CONFLICT" }, { status: 409 });
    return Response.json({ state });
  } catch (error) {
    const storage = growthStorageFailure(error);
    if (stage === "business-context" && error instanceof WebsiteGrowthHandoffError) {
      console.error("growth_request_failed", { stage, code: error.code });
      return Response.json({ error: "Growth could not load the authorized project context.", code: `GROWTH_CONTEXT_${error.code}` }, { status: error.code === "OWNERSHIP_REQUIRED" ? 404 : 409 });
    }
    if (stage === "business-context" && storage.code === "GROWTH_STORAGE_FAILED") {
      console.error("growth_request_failed", { stage, code: "GROWTH_CONTEXT_INVALID" });
      return Response.json({ error: "Growth could not interpret the saved project context. Your saved data has not been replaced.", code: "GROWTH_CONTEXT_INVALID" }, { status: 422 });
    }
    console.error("growth_request_failed", { stage, code: error instanceof GrowthDiscoveryError ? error.code : stage === "prepare" ? "GROWTH_PREPARATION_FAILED" : storage.code });
    if (error instanceof GrowthDiscoveryError) return Response.json({ error: error.message, code: error.code }, { status: 422 });
    if (stage !== "prepare") return Response.json(storage, { status: 503 });
    return Response.json({ error: stage === "prepare" ? "Growth could not interpret this business context." : "Growth project storage is unavailable. Your saved business context has not been replaced.", code: stage === "prepare" ? "GROWTH_PREPARATION_FAILED" : "GROWTH_STORAGE_FAILED" }, { status: stage === "prepare" ? 422 : 503 });
  }
}
