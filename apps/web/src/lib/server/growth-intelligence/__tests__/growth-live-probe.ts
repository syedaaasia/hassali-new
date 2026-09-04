// Explicit opt-in integration probe. Uses configured environment sources and
// public inputs only; does not save projects or count as browser acceptance.
import { emptyGrowthDiscovery } from "@/lib/growth-discovery";
import { liveGrowthDependencies, runGrowthDiscovery } from "../growth-discovery-service";

const [action, ...words] = process.argv.slice(2);
if (!['analyze', 'search'].includes(action ?? "") || !words.length) throw new Error("Usage: growth-live-probe.ts analyze|search <public input>");
try {
  const state = await runGrowthDiscovery({ previous: emptyGrowthDiscovery(), truth: null, action: action as "analyze" | "search", prompt: words.join(" "), signal: AbortSignal.timeout(180000) }, liveGrowthDependencies(null));
  console.log(JSON.stringify({ business: state.business, audiences: state.audiences, plan: state.plan, discovery: state.discovery, companies: state.companies }, null, 2));
  process.exit(state.discovery.status === "unavailable" ? 2 : 0);
} catch (error) {
  console.error(error instanceof Error ? error.message : "Growth probe failed");
  process.exit(1);
}
