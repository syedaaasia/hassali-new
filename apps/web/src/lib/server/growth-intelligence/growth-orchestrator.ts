import type {
  AutoIntelligenceRouter,
  AutoRoutingPreferences
} from "@/lib/server/intelligence/auto-intelligence-router";
import type { IntelligenceResult } from "@/lib/server/intelligence/intelligence-contract";
import {
  buildGrowthContextPacket,
  createGrowthStrategy,
  validateGrowthCampaign
} from "./growth-intelligence";
import type {
  GrowthCampaign,
  GrowthProject,
  GrowthRequest,
  GrowthValidation
} from "./growth-types";

type ProviderCampaignCandidate = {
  channel?: string;
  claims?: string[];
  cta?: { destination?: string; label?: string };
  message?: string;
};

function responseText(result: IntelligenceResult) {
  return result.ok ? result.response.content.map((part) => part.text).join("").trim() : "";
}

function parseCandidate(result: IntelligenceResult): ProviderCampaignCandidate | null {
  const text = responseText(result);
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as ProviderCampaignCandidate : null;
  } catch {
    return null;
  }
}

function applyCandidate(base: GrowthCampaign, candidate: ProviderCampaignCandidate): GrowthCampaign {
  const claims = Array.isArray(candidate.claims)
    ? candidate.claims.filter((item): item is string => typeof item === "string").slice(0, 8)
    : [];
  return {
    ...base,
    claims,
    cta: {
      destination: typeof candidate.cta?.destination === "string" && candidate.cta.destination.trim()
        ? candidate.cta.destination.trim().slice(0, 200)
        : base.cta.destination,
      label: typeof candidate.cta?.label === "string" && candidate.cta.label.trim()
        ? candidate.cta.label.trim().slice(0, 80)
        : base.cta.label
    },
    message: typeof candidate.message === "string" && candidate.message.trim()
      ? candidate.message.replace(/\s+/g, " ").trim().slice(0, 1_200)
      : base.message
  };
}

export type GrowthGenerationResult = {
  attempts: number;
  campaign: GrowthCampaign | null;
  failure: string | null;
  fallbackUsed: boolean;
  validation: GrowthValidation | null;
};

export async function generateGrowthCampaign(input: {
  project: GrowthProject;
  request: GrowthRequest;
  router: AutoIntelligenceRouter;
  routing: AutoRoutingPreferences;
}): Promise<GrowthGenerationResult> {
  const base = createGrowthStrategy(input.project, input.request);
  const context = buildGrowthContextPacket({ project: input.project, request: input.request });
  const invocation = await input.router.invoke({
    instructions: [
      "Return one JSON object with message, claims, and cta. Preserve supplied business, audience, offer, and project truth.",
      "Do not claim sending, publishing, launch, live execution, unsupported proof, or fabricated metrics."
    ],
    messages: [{ parts: [{ text: `${context.content}\n\nCurrent request: ${input.request.prompt}`, type: "text" }], role: "user" }],
    mode: "GROWTH",
    privacy: { dataLocality: input.routing.privacy === "local-only" ? "local-only" : "cloud-allowed" },
    requiredCapabilities: ["text", "structuredOutput"],
    responseFormat: "json_object"
  }, input.routing);
  if (!invocation.result.ok) {
    return {
      attempts: invocation.attempts,
      campaign: null,
      failure: invocation.result.failure.safeUserMessage,
      fallbackUsed: invocation.fallbackUsed,
      validation: null
    };
  }
  const candidate = parseCandidate(invocation.result);
  if (!candidate) {
    return {
      attempts: invocation.attempts,
      campaign: null,
      failure: "The intelligence source did not return a valid Growth campaign candidate.",
      fallbackUsed: invocation.fallbackUsed,
      validation: null
    };
  }
  const campaign = applyCandidate(base.campaign, candidate);
  const validation = validateGrowthCampaign(input.project, campaign);
  campaign.status = validation.status === "validated" ? "ready_for_approval" : validation.status === "needs_evidence" ? "needs_evidence" : "draft";
  return {
    attempts: invocation.attempts,
    campaign,
    failure: validation.status === "blocked" ? "The generated campaign failed deterministic Growth validation." : null,
    fallbackUsed: invocation.fallbackUsed,
    validation
  };
}
