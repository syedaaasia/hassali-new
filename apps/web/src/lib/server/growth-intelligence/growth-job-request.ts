import type { GrowthDiscoveryState } from "@/lib/growth-discovery";
import { claimDiscoveryWork, controlDiscoveryJob, executeDiscoveryWork } from "./growth-job-engine";
import type { GrowthDiscoveryDependencies, ProspectDiscoveryProvider } from "./growth-discovery-service";
import { GrowthDiscoveryError } from "./growth-errors";

export type GrowthJobAction = "advance" | "pause" | "resume" | "cancel";
export async function processGrowthJob(input: {
  previous: GrowthDiscoveryState; action: GrowthJobAction; jobId: string; revision: unknown; signal?: AbortSignal;
  // The route binds this CAS closure to the authenticated owner/project and
  // advances its timestamp after each write. Never accept a client-owned scope.
  save: (state: GrowthDiscoveryState) => Promise<boolean>;
}, deps: GrowthDiscoveryDependencies, verifier: ProspectDiscoveryProvider) {
  if (!input.previous.job || input.previous.job.id !== input.jobId) throw new GrowthDiscoveryError("GROWTH_JOB_CHANGED", "This discovery job has changed. Reload before continuing.");
  if (!["pause", "cancel"].includes(input.action) && input.revision !== input.previous.revision) throw new GrowthDiscoveryError("GROWTH_CONFLICT", "This project changed in another session. Reload to continue.");
  const claimed = input.action === "advance" ? claimDiscoveryWork(input.previous) : controlDiscoveryJob(input.previous, input.action);
  if (!await input.save(claimed)) throw new GrowthDiscoveryError("GROWTH_CONFLICT", "This project changed before the batch started. No new work was started.");
  if (input.action !== "advance" || !claimed.job?.lease) return claimed;
  const completed = await executeDiscoveryWork(claimed, deps, verifier, input.signal);
  if (!await input.save(completed)) throw new GrowthDiscoveryError("GROWTH_CONFLICT", "The batch was superseded or cancelled. Its output was not applied.");
  return completed;
}
