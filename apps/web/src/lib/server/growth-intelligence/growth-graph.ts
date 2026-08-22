import { GraphKernel, graphNode } from "@/lib/server/graph-kernel/graph-kernel";
import type { GraphScope } from "@/lib/server/graph-kernel/graph-types";
import type { GrowthProject, GrowthStrategy } from "./growth-types";

export function projectGrowthStrategy(input: {
  artifactId: string;
  graph?: GraphKernel;
  project: GrowthProject;
  strategy: GrowthStrategy;
}) {
  if (input.strategy.projectId !== input.project.projectId || input.strategy.campaign.projectId !== input.project.projectId) {
    throw new Error("Growth graph projection cannot cross project scope.");
  }
  const graph = input.graph ?? new GraphKernel();
  const scope: GraphScope = { id: input.project.projectId, kind: "project" };
  const revision = input.project.businessTruth.sourceWebsite?.revision;
  const common = { mode: "GROWTH" as const, privacy: "private" as const, scope, sourceRevision: revision };
  const objective = graph.upsertNode(graphNode({ ...common, identity: `objective:${input.strategy.objective}`, kind: "objective", label: input.strategy.objective, provenance: "current_user_input" }));
  const audience = input.project.businessTruth.audiences.find((item) => item.id === input.strategy.campaign.audienceId);
  const audienceNode = graph.upsertNode(graphNode({ ...common, factState: audience?.status ?? "unknown", identity: input.strategy.campaign.audienceId, kind: "entity", label: audience?.segment ?? "Unknown audience", provenance: "project_state" }));
  const offer = input.project.businessTruth.offers.find((item) => item.id === input.strategy.campaign.offerId);
  const offerNode = graph.upsertNode(graphNode({ ...common, factState: offer?.status ?? "unknown", identity: input.strategy.campaign.offerId, kind: "entity", label: offer?.name ?? "Unknown offer", provenance: "project_state" }));
  const campaign = graph.upsertNode(graphNode({ ...common, factState: "derived", identity: input.strategy.campaign.id, kind: "action", label: input.strategy.campaign.id, provenance: "derived" }));
  const channel = graph.upsertNode(graphNode({ ...common, factState: "derived", identity: `channel:${input.strategy.campaign.channel}`, kind: "entity", label: input.strategy.campaign.channel, provenance: "deterministic" }));
  const artifact = graph.upsertNode(graphNode({ ...common, authority: { id: input.artifactId, kind: "artifact", projectId: input.project.projectId, revision }, factState: "derived", identity: input.artifactId, kind: "artifact", label: input.strategy.campaign.artifact, provenance: "generated" }));
  graph.connect({ ...common, factState: "confirmed", from: objective.id, kind: "TARGETS", provenance: "current_user_input", status: "current", to: audienceNode.id });
  graph.connect({ ...common, factState: "derived", from: audienceNode.id, kind: "RELATED_TO", provenance: "derived", status: "current", to: offerNode.id });
  graph.connect({ ...common, factState: "derived", from: campaign.id, kind: "PROMOTES", provenance: "derived", status: "current", to: offerNode.id });
  graph.connect({ ...common, factState: "derived", from: objective.id, kind: "PRODUCED", provenance: "derived", status: "current", to: campaign.id });
  graph.connect({ ...common, factState: "derived", from: campaign.id, kind: "USES", provenance: "derived", status: "current", to: channel.id });
  graph.connect({ ...common, factState: "derived", from: campaign.id, kind: "PRODUCED", provenance: "generated", status: "current", to: artifact.id });

  for (const claimText of input.strategy.campaign.claims) {
    const claimTruth = input.project.businessTruth.claims.find((claim) => claim.text === claimText);
    const claim = graph.upsertNode(graphNode({ ...common, factState: claimTruth?.status ?? "unsupported", identity: `claim:${claimText}`, kind: "claim", label: claimText, provenance: claimTruth?.status === "confirmed" ? "project_state" : "provider" }));
    for (const evidenceId of claimTruth?.evidenceIds ?? []) {
      const source = input.project.businessTruth.evidence.find((item) => item.id === evidenceId);
      const evidence = graph.upsertNode(graphNode({ ...common, factState: "confirmed", identity: `evidence:${evidenceId}`, kind: "evidence", label: source?.summary ?? evidenceId, provenance: "project_state" }));
      graph.connect({ ...common, factState: "confirmed", from: claim.id, kind: "SUPPORTED_BY", provenance: "project_state", status: "current", to: evidence.id });
    }
  }
  return { artifact, campaign, graph, objective };
}
