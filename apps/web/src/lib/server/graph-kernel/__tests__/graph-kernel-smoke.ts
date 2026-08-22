import assert from "node:assert/strict";
import test from "node:test";
import { GraphKernel, graphNode } from "@/lib/server/graph-kernel/graph-kernel";
import {
  optionalGraphEnrichment,
  projectAskObjective,
  projectCodeVerification,
  projectShippingManifest,
  projectWebsiteState,
  representContradiction
} from "@/lib/server/graph-kernel/graph-projections";
import type { GraphSnapshot } from "@/lib/server/graph-kernel/graph-types";
import { createVerifiedProjectPackage } from "@/lib/server/verified-shipping";

test("A basic graph has deterministic objective, constraint, capability, and traversal", () => {
  const first = projectAskObjective({ capabilities: ["business comparison"], objective: "Start a bakery with a $500 budget and no inventory", scopeId: "conversation-a" });
  const second = projectAskObjective({ capabilities: ["business comparison"], objective: "Start a bakery with a $500 budget and no inventory", scopeId: "conversation-a" });
  assert.deepEqual(first.graph.snapshot(), second.graph.snapshot());
  const context = first.graph.traverse({ maxDepth: 2, scope: first.objective.scope, startNodeId: first.objective.id });
  assert(context.edges.some((edge) => edge.kind === "HAS_CONSTRAINT"));
  assert(context.edges.some((edge) => edge.kind === "REQUIRES"));
});

test("B duplicate authoritative project upsert retains one canonical node", () => {
  const graph = new GraphKernel();
  const scope = { id: "project-one", kind: "project" as const };
  const input = graphNode({ authority: { id: "project-one", kind: "project", projectId: "project-one" }, identity: "project-one", kind: "project", label: "Project One", mode: "WEBSITE", privacy: "private", provenance: "database", scope });
  assert.equal(graph.upsertNode(input).id, graph.upsertNode({ ...input, label: "Project One current" }).id);
  assert.equal(graph.queryNodes({ kind: "project", scope }).length, 1);
});

test("C same filenames in separate project scopes never cross", () => {
  const graph = new GraphKernel();
  projectWebsiteState({ graph, pages: ["index.html"], projectId: "project-a", revision: "a1" });
  projectWebsiteState({ graph, pages: ["index.html"], projectId: "project-b", revision: "b1" });
  const filesA = graph.queryNodes({ kind: "file", scope: { id: "project-a", kind: "project" } });
  const filesB = graph.queryNodes({ kind: "file", scope: { id: "project-b", kind: "project" } });
  assert.equal(filesA.length, 1);
  assert.equal(filesB.length, 1);
  assert.notEqual(filesA[0]?.id, filesB[0]?.id);
});

test("D WEBSITE revision lineage preserves history and advances current", () => {
  const first = projectWebsiteState({ pages: ["index.html"], projectId: "site", revision: "n" });
  const next = projectWebsiteState({ graph: first.graph, pages: ["index.html"], previousRevision: "n", projectId: "site", revision: "n+1" });
  const scope = { id: "site", kind: "project" as const };
  const current = next.graph.getNeighbors({ direction: "out", edgeKinds: ["CURRENT_REVISION_OF"], nodeId: next.project.id }).filter((edge) => edge.status === "current");
  assert.equal(current.length, 1);
  assert.equal(current[0]?.to, next.revision.id);
  assert(next.graph.getNeighbors({ direction: "out", edgeKinds: ["SUPERSEDES"], nodeId: next.revision.id }).some((edge) => edge.status === "current"));
  assert.equal(next.graph.queryNodes({ kind: "revision", scope }).find((node) => node.authority?.revision === "n")?.status, "historical");
});

test("E WEBSITE asset chain retains curated provenance without binary content", () => {
  const projected = projectWebsiteState({ assets: [{ id: "architecture-hero", provenance: "hassali_curated", role: "hero" }], projectId: "site-assets", revision: "r1" });
  const scope = { id: "site-assets", kind: "project" as const };
  const asset = projected.graph.queryNodes({ kind: "asset", scope })[0];
  assert.equal(asset?.provenance, "curated_asset");
  assert.equal(asset?.metadata.source, "hassali_curated");
  assert.doesNotMatch(JSON.stringify(asset), /base64|binary/i);
  assert(projected.graph.getNeighbors({ direction: "out", edgeKinds: ["USES"], nodeId: projected.revision.id }).some((edge) => edge.to === asset?.id));
});

test("F CODE verification connects only passed evidence", () => {
  const projected = projectCodeVerification({
    actions: [{ files: [{ hash: "hash-one", path: "src/index.ts" }], id: "edit-one" }], projectId: "code-one", revision: "c2", taskId: "task-one",
    verification: { blockingFailures: ["build"], results: [
      { blocking: false, confidence: "high", criterion: "Focused test", criterionId: "test", evidence: [], expected: "pass", limitations: [], status: "passed" },
      { blocking: true, confidence: "high", criterion: "Build", criterionId: "build", evidence: [], expected: "pass", limitations: [], status: "failed" }
    ], state: "failed", taskId: "task-one", warnings: [] }
  });
  const actions = projected.graph.queryNodes({ kind: "action", scope: { id: "task-one", kind: "task" } });
  const verifiedEdges = projected.graph.getNeighbors({ direction: "out", edgeKinds: ["VERIFIED_BY"], nodeId: actions[0]!.id });
  assert.equal(verifiedEdges.length, 1);
  assert.match(projected.graph.getNode(verifiedEdges[0]!.to)?.label ?? "", /Focused test/);
  assert.doesNotMatch(JSON.stringify(projected.graph.snapshot({ includePrivate: true })), /Build.*VERIFIED_BY/);
});

test("G Run 8 shipping lineage references canonical revision, manifest, and files", () => {
  const packaged = createVerifiedProjectPackage({ canonicalRevision: "shipping-r2", files: [{ content: "<main />", path: "index.html" }], mode: "WEBSITE", projectName: "Shipping", projectVerification: "verified" });
  const projected = projectShippingManifest({ manifest: packaged.manifest });
  assert(projected.graph.getNeighbors({ direction: "out", edgeKinds: ["DERIVED_FROM"], nodeId: projected.artifact.id }).some((edge) => edge.to === projected.revision.id));
  assert(projected.graph.getNeighbors({ direction: "out", edgeKinds: ["PACKAGED_BY"], nodeId: projected.artifact.id }).some((edge) => edge.to === projected.manifest.id));
  assert.equal(projected.graph.getNeighbors({ direction: "out", edgeKinds: ["CONTAINS"], nodeId: projected.manifest.id }).length, packaged.manifest.files.length);
});

test("H ASK objective extracts budget and no-inventory constraints without memory", () => {
  const projected = projectAskObjective({ objective: "I have $500 and want to start an online business without holding inventory.", scopeId: "ask-budget" });
  const context = projected.graph.traverse({ maxDepth: 1, scope: projected.objective.scope, startNodeId: projected.objective.id });
  assert(context.nodes.some((node) => /budget \$500/i.test(node.label)));
  assert(context.nodes.some((node) => /without holding inventory/i.test(node.label)));
  assert(!context.nodes.some((node) => /memory/i.test(node.provenance)));
});

test("I follow-up context retrieves comparison entities and new bundle constraint only", () => {
  const first = projectAskObjective({ entities: ["React", "Vue"], objective: "Compare React and Vue for my dashboard", scopeId: "comparison" });
  const followup = projectAskObjective({ constraints: ["bundle size matters most"], entities: ["React", "Vue"], graph: first.graph, objective: "Which is better if bundle size matters most?", scopeId: "comparison" });
  const context = followup.graph.traverse({ maxDepth: 2, maxNodes: 12, scope: followup.objective.scope, startNodeId: followup.objective.id });
  assert(context.nodes.some((node) => node.label === "React"));
  assert(context.nodes.some((node) => node.label === "Vue"));
  assert(context.nodes.some((node) => /dashboard/i.test(node.label)));
  assert(context.nodes.some((node) => /bundle size/i.test(node.label)));
});

test("J ASK, WEBSITE, and CODE projections remain mode and scope isolated", () => {
  const ask = projectAskObjective({ objective: "Explain this", scopeId: "ask-scope" });
  const website = projectWebsiteState({ pages: ["index.html"], projectId: "web-scope", revision: "w1" });
  const code = projectCodeVerification({ actions: [], projectId: "code-scope", revision: "c1", taskId: "code-task", verification: { blockingFailures: [], results: [], state: "verified", taskId: "code-task", warnings: [] } });
  assert(ask.graph.snapshot({ includePrivate: true }).nodes.every((node) => node.mode === "ASK"));
  assert(website.graph.snapshot({ includePrivate: true }).nodes.every((node) => node.mode === "WEBSITE"));
  assert(code.graph.snapshot({ includePrivate: true }).nodes.every((node) => node.mode === "CODE"));
});

test("K stale derived nodes invalidate when their source revision is superseded", () => {
  const first = projectWebsiteState({ projectId: "stale-site", revision: "old" });
  const scope = { id: "stale-site", kind: "project" as const };
  const derived = first.graph.upsertNode(graphNode({ factState: "derived", identity: "derived-summary", kind: "claim", label: "Old derived summary", mode: "WEBSITE", privacy: "private", provenance: "derived", scope, sourceRevision: "old" }));
  projectWebsiteState({ graph: first.graph, previousRevision: "old", projectId: "stale-site", revision: "new" });
  assert.equal(first.graph.getNode(derived.id)?.status, "invalidated");
});

test("L equal inferred claims represent contradiction instead of overwriting", () => {
  const graph = new GraphKernel();
  const scope = { id: "conflict", kind: "conversation" as const };
  const left = graph.upsertNode(graphNode({ factState: "inferred", identity: "name-alpha", kind: "claim", label: "Business name is Alpha", mode: "ASK", provenance: "inferred", scope }));
  const right = graph.upsertNode(graphNode({ factState: "inferred", identity: "name-beta", kind: "claim", label: "Business name is Beta", mode: "ASK", provenance: "inferred", scope }));
  assert.equal(representContradiction({ graph, left, right }).kind, "CONTRADICTS");
  assert.equal(graph.queryNodes({ kind: "claim", scope }).length, 2);
});

test("M traversal enforces depth and node limits deterministically", () => {
  const graph = new GraphKernel();
  const scope = { id: "bounded", kind: "conversation" as const };
  let previous = graph.upsertNode(graphNode({ identity: "node-0", kind: "objective", label: "Node 0", mode: "ASK", provenance: "deterministic", scope }));
  const start = previous;
  for (let index = 1; index < 20; index += 1) {
    const next = graph.upsertNode(graphNode({ factState: "derived", identity: `node-${index}`, kind: "entity", label: `Node ${index}`, mode: "ASK", provenance: "deterministic", scope }));
    graph.connect({ factState: "derived", from: previous.id, kind: "RELATED_TO", mode: "ASK", provenance: "deterministic", scope, status: "current", to: next.id });
    previous = next;
  }
  const context = graph.traverse({ maxDepth: 3, maxNodes: 3, scope, startNodeId: start.id });
  assert.equal(context.nodes.length, 3);
  assert.equal(context.truncated, true);
});

test("N malformed snapshots and unknown schema versions reject", () => {
  const malformed: GraphSnapshot = { edges: [{ factState: "confirmed", from: "missing", id: "edge-one", kind: "USES", metadata: {}, mode: "ASK", provenance: "derived", scope: { id: "bad", kind: "conversation" }, status: "current", to: "also-missing" }], graphKernelVersion: 1, nodes: [] };
  assert.throws(() => GraphKernel.deserialize(JSON.stringify(malformed)), /endpoints/);
  assert.throws(() => GraphKernel.deserialize(JSON.stringify({ ...malformed, graphKernelVersion: 2 })), /schema version/);
});

test("O secret-like labels and metadata are redacted or excluded", () => {
  const graph = new GraphKernel();
  const scope = { id: "secret-safe", kind: "conversation" as const };
  graph.upsertNode(graphNode({ identity: "safe-reference", kind: "evidence", label: "API_KEY=sk-secretsecretsecret1234", metadata: { path: ".env", secret: "sk-secretsecretsecret1234" }, mode: "ASK", provenance: "current_user_input", scope }));
  const serialized = graph.serialize();
  assert.doesNotMatch(serialized, /sk-secretsecretsecret1234/);
  assert.doesNotMatch(serialized, /"secret"/);
});

test("P file nodes retain authority references rather than source bodies", () => {
  const projected = projectCodeVerification({ actions: [{ files: [{ hash: "sha-file", path: "src/app.ts" }], id: "change" }], projectId: "authority-code", revision: "r4", taskId: "authority-task", verification: { blockingFailures: [], results: [], state: "verified", taskId: "authority-task", warnings: [] } });
  const file = projected.graph.queryNodes({ kind: "file", scope: { id: "authority-task", kind: "task" } })[0];
  assert.deepEqual(file?.authority, { hash: "sha-file", id: "r4:src/app.ts", kind: "project-file", path: "src/app.ts", projectId: "authority-code", revision: "r4" });
  assert.equal("content" in (file?.metadata ?? {}), false);
});

test("Q optional graph enrichment failure preserves the core result", () => {
  const result = optionalGraphEnrichment({ answer: "Valid answer" }, () => { throw new Error("fixture graph failure"); });
  assert.deepEqual(result.coreResult, { answer: "Valid answer" });
  assert.equal(result.graphEnriched, false);
  assert.match(result.warning ?? "", /core result was preserved/);
});
