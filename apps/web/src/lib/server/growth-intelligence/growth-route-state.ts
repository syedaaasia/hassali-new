import {
  createGrowthArtifact,
  createGrowthProject,
  createGrowthStrategy,
  growthBusinessTruthFromPrompt,
  understandGrowthRequest,
  validateGrowthCampaign
} from "./growth-intelligence";
import type { GrowthBusinessTruth } from "./growth-types";

export function prepareGrowthState(input: {
  businessTruth: GrowthBusinessTruth | null;
  ownerId: string;
  projectId: string;
  prompt: string;
}) {
  const project = createGrowthProject({
    businessTruth: growthBusinessTruthFromPrompt(input.prompt, input.businessTruth),
    ownerId: input.ownerId,
    projectId: input.projectId
  });
  const requestPlan = understandGrowthRequest({ audiences: project.businessTruth.audiences, prompt: input.prompt });
  const strategy = createGrowthStrategy(project, requestPlan);
  const validation = validateGrowthCampaign(project, strategy.campaign);
  const content = [
    `# ${project.businessTruth.business.name.value ?? project.businessTruth.business.category.value ?? "Growth"} strategy`,
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
  return { artifact, project, prompt: input.prompt, request: requestPlan, strategy, validation };
}
