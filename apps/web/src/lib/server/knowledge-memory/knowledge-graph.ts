import { GraphKernel, graphNode } from "@/lib/server/graph-kernel/graph-kernel";
import type { GraphMode, GraphScope } from "@/lib/server/graph-kernel/graph-types";
import type { KnowledgeRecord } from "./knowledge-types";

function graphScope(record: KnowledgeRecord): GraphScope {
  if (record.projectId) return { id: record.projectId, kind: "project" };
  if (record.scope.kind === "conversation") return { id: record.scope.id, kind: "conversation" };
  if (record.scope.kind === "source") return { id: record.scope.id, kind: "artifact" };
  return { id: record.ownerId, kind: "global" };
}

function graphMode(record: KnowledgeRecord): GraphMode {
  if (record.kind.startsWith("project_") || record.kind === "verified_outcome") return "SHARED";
  return "ASK";
}

export function projectKnowledgeRecordToGraph(input: {
  graph?: GraphKernel;
  previous?: KnowledgeRecord | null;
  record: KnowledgeRecord;
}) {
  const graph = input.graph ?? new GraphKernel();
  const scope = graphScope(input.record);
  const node = graph.upsertNode(graphNode({
    authority: input.record.authority.kind === "project_revision"
      ? { id: input.record.authority.id, kind: "project-revision", projectId: input.record.projectId ?? undefined, revision: input.record.authority.revision ?? undefined }
      : undefined,
    factState: input.record.factState,
    identity: input.record.id,
    kind: "claim",
    label: input.record.statement,
    metadata: { knowledgeId: input.record.id, knowledgeKind: input.record.kind, subject: input.record.subject, tags: input.record.tags },
    mode: graphMode(input.record),
    privacy: "private",
    provenance: input.record.provenance.kind === "verified" ? "verified" : input.record.provenance.kind === "project_state" ? "project_state" : "retrieval",
    scope,
    sourceRevision: input.record.provenance.revision ?? undefined,
    status: input.record.status === "active" ? "current" : input.record.status === "superseded" ? "historical" : "invalidated"
  }));
  if (input.previous && input.record.supersedesId === input.previous.id) {
    const previous = graph.upsertNode(graphNode({
      factState: input.previous.factState,
      identity: input.previous.id,
      kind: "claim",
      label: input.previous.statement,
      mode: graphMode(input.previous),
      privacy: "private",
      provenance: "retrieval",
      scope,
      status: "historical"
    }));
    graph.connect({ factState: input.record.factState, from: node.id, kind: "SUPERSEDES", mode: node.mode, provenance: "retrieval", scope, status: "current", to: previous.id });
  }
  return { graph, node };
}

export function graphRelatedKnowledgeIds(graph: GraphKernel, record: KnowledgeRecord, limit = 6) {
  const projected = projectKnowledgeRecordToGraph({ graph, record });
  return graph.traverse({ includePrivate: true, maxDepth: 2, maxNodes: Math.min(8, Math.max(1, limit)), scope: projected.node.scope, startNodeId: projected.node.id })
    .nodes.map((node) => node.metadata.knowledgeId ?? node.metadata.recordId ?? node.id);
}
