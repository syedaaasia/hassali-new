import { getOwnedWebsiteGrowthHandoff } from "@/lib/server/ai/website-growth-handoff-store";
import { WebsiteGrowthHandoffError } from "@/lib/server/ai/website-growth-handoff";
import { growthBusinessTruthFromWebsite } from "./growth-intelligence";
import { persistedGrowthTruth } from "./growth-state-validation";

// Call only after project ownership succeeds. WEBSITE is optional enrichment,
// not a prerequisite for a standalone Growth project.
export async function loadGrowthBusinessContext(input: {
  externalUserId: string; projectId: string; state: unknown;
}, loadHandoff = getOwnedWebsiteGrowthHandoff) {
  const truth = persistedGrowthTruth(input.state);
  if (truth) return truth;
  try {
    const handoff = await loadHandoff({ externalUserId: input.externalUserId, projectId: input.projectId });
    return growthBusinessTruthFromWebsite(handoff);
  } catch (error) {
    if (error instanceof WebsiteGrowthHandoffError && error.code === "NOT_WEBSITE") return null;
    // Ownership, database and unexpected parsing failures remain failures.
    throw error;
  }
}
