import { auth } from "@clerk/nextjs/server";
import { getOwnedGrowthProjectState, upsertOwnedGrowthProjectState } from "@hassali/database";
import { getOwnedWebsiteGrowthHandoff } from "@/lib/server/ai/website-growth-handoff-store";
import { createGrowthArtifact, createGrowthProject, createGrowthStrategy, growthBusinessTruthFromWebsite, understandGrowthRequest, validateGrowthCampaign } from "@/lib/server/growth-intelligence/growth-intelligence";
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
    const handoff = await getOwnedWebsiteGrowthHandoff({ externalUserId: userId, projectId });
    const project = createGrowthProject({ businessTruth: growthBusinessTruthFromWebsite(handoff), ownerId: userId, projectId });
    const requestPlan = understandGrowthRequest({ audiences: project.businessTruth.audiences, prompt });
    const strategy = createGrowthStrategy(project, requestPlan);
    const validation = validateGrowthCampaign(project, strategy.campaign);
    const content = [
      `# ${project.businessTruth.business.name.value ?? "Growth"} strategy`,
      `## Objective\n${strategy.objective.replace(/_/g, " ")}`,
      `## Positioning\n${strategy.positioning}`,
      `## Audience\n${project.businessTruth.audiences.find((audience) => audience.id === strategy.campaign.audienceId)?.segment ?? "Needs confirmation"}`,
      `## Recommended channels\n${strategy.channels.map((channel) => `- ${channel.channel.replace(/_/g, " ")}: ${channel.rationale}`).join("\n")}`,
      `## Campaign direction\n${strategy.campaign.message}`,
      `## CTA\n${strategy.campaign.cta.label} → ${strategy.campaign.cta.destination}`,
      `## Measurement\n${strategy.campaign.measurement.map((metric) => `- ${metric.metric}: establish a baseline before setting a target`).join("\n")}`,
      strategy.assumptions.length ? `## Assumptions\n${strategy.assumptions.map((item) => `- ${item}`).join("\n")}` : "",
      "## Authority\nPrepared for review only. Nothing was sent, published, purchased, or applied to WEBSITE/CODE files."
    ].filter(Boolean).join("\n\n");
    const artifact = createGrowthArtifact({ campaign: strategy.campaign, content, validation });
    const state = { artifact, project, prompt, request: requestPlan, strategy, validation };
    await upsertOwnedGrowthProjectState({ externalUserId: userId, projectId, state });
    return Response.json({ state });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Growth context is unavailable.";
    return Response.json({ error: /authoritative|website|owned/i.test(message) ? "Growth needs an applied WEBSITE project with a current Growth handoff. Approve the website first, then return here." : "Growth could not prepare this strategy from the current project truth." }, { status: 409 });
  }
}
