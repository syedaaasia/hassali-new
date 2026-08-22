import { createHash } from "node:crypto";
import { redactWorkspaceSecrets } from "@/lib/server/ai/workspace-context-engine";
import {
  GRAPH_KERNEL_VERSION,
  type GraphContext,
  type GraphEdge,
  type GraphEdgeKind,
  type GraphFactState,
  type GraphItemStatus,
  type GraphMetadataValue,
  type GraphMode,
  type GraphNode,
  type GraphNodeKind,
  type GraphPrivacy,
  type GraphProvenance,
  type GraphScope,
  type GraphSnapshot,
  type GraphValidationIssue,
  type GraphValidationResult
} from "./graph-types";

const blockedMetadataKey = /^(?:body|content|credential|password|private.?key|prompt|raw|secret|source.?code|token)$/i;

function stableHash(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

function scopeKey(scope: GraphScope) {
  return `${scope.kind}:${scope.id}`;
}

function cleanText(value: string, maximum = 500) {
  return redactWorkspaceSecrets(value).redacted.replace(/\s+/g, " ").trim().slice(0, maximum);
}

function cleanMetadata(metadata: Record<string, GraphMetadataValue> | undefined) {
  const output: Record<string, GraphMetadataValue> = {};
  for (const [key, value] of Object.entries(metadata ?? {}).sort(([left], [right]) => left.localeCompare(right)).slice(0, 24)) {
    if (blockedMetadataKey.test(key)) continue;
    if (typeof value === "string") output[key] = cleanText(value);
    else if (Array.isArray(value)) output[key] = value.slice(0, 20).map((entry) => cleanText(entry));
    else output[key] = value;
  }
  return output;
}

function modesCompatible(left: GraphMode, right: GraphMode) {
  return left === right || left === "SHARED" || right === "SHARED";
}

export function graphNodeId(scope: GraphScope, kind: GraphNodeKind, authoritativeIdentity: string) {
  return `${kind}:${stableHash(`${scopeKey(scope)}:${kind}:${cleanText(authoritativeIdentity, 1_000)}`)}`;
}

export function graphEdgeId(scope: GraphScope, from: string, kind: GraphEdgeKind, to: string) {
  return `edge:${stableHash(`${scopeKey(scope)}:${from}:${kind}:${to}`)}`;
}

export class GraphKernel {
  private readonly nodes = new Map<string, GraphNode>();
  private readonly edges = new Map<string, GraphEdge>();
  private readonly outgoing = new Map<string, Set<string>>();
  private readonly incoming = new Map<string, Set<string>>();

  constructor(snapshot?: GraphSnapshot) {
    if (!snapshot) return;
    if (snapshot.graphKernelVersion !== GRAPH_KERNEL_VERSION) throw new Error("Unsupported Graph Kernel schema version.");
    for (const node of snapshot.nodes) this.upsertNode({ ...node, authoritativeIdentity: node.authority?.id ?? node.id, id: node.id });
    for (const edge of snapshot.edges) this.connect(edge);
    const validation = this.validate();
    if (!validation.valid) throw new Error(`Malformed Graph Kernel snapshot: ${validation.issues[0]?.message ?? "unknown error"}`);
  }

  upsertNode(input: Omit<GraphNode, "id" | "metadata"> & { authoritativeIdentity: string; id?: string; metadata?: Record<string, GraphMetadataValue> }) {
    const id = input.id ?? graphNodeId(input.scope, input.kind, input.authoritativeIdentity);
    const existing = this.nodes.get(id);
    const node: GraphNode = {
      authority: input.authority,
      factState: input.factState,
      id,
      kind: input.kind,
      label: cleanText(input.label, 300),
      metadata: { ...(existing?.metadata ?? {}), ...cleanMetadata(input.metadata) },
      mode: input.mode,
      privacy: input.privacy,
      provenance: input.provenance,
      scope: input.scope,
      sourceRevision: input.sourceRevision,
      status: input.status
    };
    if (existing && (existing.kind !== node.kind || scopeKey(existing.scope) !== scopeKey(node.scope))) {
      throw new Error(`Graph node identity collision: ${id}.`);
    }
    this.nodes.set(id, node);
    return node;
  }

  connect(input: Omit<GraphEdge, "id" | "metadata"> & { id?: string; metadata?: Record<string, GraphMetadataValue> }) {
    const from = this.nodes.get(input.from);
    const to = this.nodes.get(input.to);
    if (!from || !to) throw new Error("Graph edge endpoints must exist before they are connected.");
    if (input.from === input.to && input.kind !== "RELATED_TO") throw new Error("This graph relationship cannot point to itself.");
    if (scopeKey(from.scope) !== scopeKey(input.scope) || scopeKey(to.scope) !== scopeKey(input.scope)) {
      throw new Error("Cross-scope graph relationships are not allowed.");
    }
    if (!modesCompatible(from.mode, to.mode) || !modesCompatible(input.mode, from.mode) || !modesCompatible(input.mode, to.mode)) {
      throw new Error("Cross-mode graph relationships require an explicit shared node.");
    }
    const id = input.id ?? graphEdgeId(input.scope, input.from, input.kind, input.to);
    const edge: GraphEdge = { ...input, id, metadata: cleanMetadata(input.metadata) };
    this.edges.set(id, edge);
    if (!this.outgoing.has(edge.from)) this.outgoing.set(edge.from, new Set());
    if (!this.incoming.has(edge.to)) this.incoming.set(edge.to, new Set());
    this.outgoing.get(edge.from)!.add(id);
    this.incoming.get(edge.to)!.add(id);
    return edge;
  }

  getNode(id: string) {
    return this.nodes.get(id) ?? null;
  }

  getEdge(id: string) {
    return this.edges.get(id) ?? null;
  }

  queryNodes(input: { kind?: GraphNodeKind; mode?: GraphMode; scope: GraphScope; status?: GraphItemStatus }) {
    return [...this.nodes.values()]
      .filter((node) => scopeKey(node.scope) === scopeKey(input.scope))
      .filter((node) => !input.kind || node.kind === input.kind)
      .filter((node) => !input.mode || node.mode === input.mode)
      .filter((node) => !input.status || node.status === input.status)
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  getNeighbors(input: { direction?: "both" | "in" | "out"; edgeKinds?: GraphEdgeKind[]; nodeId: string }) {
    const direction = input.direction ?? "both";
    const ids = new Set<string>();
    if (direction !== "in") for (const id of this.outgoing.get(input.nodeId) ?? []) ids.add(id);
    if (direction !== "out") for (const id of this.incoming.get(input.nodeId) ?? []) ids.add(id);
    return [...ids]
      .map((id) => this.edges.get(id)!)
      .filter((edge) => !input.edgeKinds || input.edgeKinds.includes(edge.kind))
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  traverse(input: {
    allowedEdgeKinds?: GraphEdgeKind[];
    includePrivate?: boolean;
    maxDepth?: number;
    maxNodes?: number;
    mode?: GraphMode;
    scope: GraphScope;
    startNodeId: string;
  }): GraphContext {
    const maxDepth = Math.max(0, Math.min(3, input.maxDepth ?? 2));
    const maxNodes = Math.max(1, Math.min(60, input.maxNodes ?? 40));
    const start = this.nodes.get(input.startNodeId);
    if (!start || scopeKey(start.scope) !== scopeKey(input.scope)) return { edges: [], facts: [], nodes: [], truncated: false };
    const queue = [{ depth: 0, id: start.id }];
    const visited = new Set<string>();
    const selectedEdges = new Map<string, GraphEdge>();
    let truncated = false;

    while (queue.length) {
      const current = queue.shift()!;
      if (visited.has(current.id)) continue;
      const node = this.nodes.get(current.id);
      if (!node || node.status === "invalidated" || scopeKey(node.scope) !== scopeKey(input.scope)) continue;
      if (input.mode && node.mode !== input.mode && node.mode !== "SHARED") continue;
      if (!input.includePrivate && node.privacy === "private") continue;
      if (visited.size >= maxNodes) { truncated = true; break; }
      visited.add(node.id);
      if (current.depth >= maxDepth) continue;
      for (const edge of this.getNeighbors({ direction: "both", edgeKinds: input.allowedEdgeKinds, nodeId: node.id })) {
        if (edge.status === "invalidated") continue;
        const nextId = edge.from === node.id ? edge.to : edge.from;
        const next = this.nodes.get(nextId);
        if (!next || (!input.includePrivate && next.privacy === "private")) continue;
        selectedEdges.set(edge.id, edge);
        if (!visited.has(nextId)) queue.push({ depth: current.depth + 1, id: nextId });
      }
    }

    const nodes = [...visited].map((id) => this.nodes.get(id)!).sort((left, right) => left.id.localeCompare(right.id));
    const nodeIds = new Set(nodes.map((node) => node.id));
    const edges = [...selectedEdges.values()]
      .filter((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to))
      .sort((left, right) => left.id.localeCompare(right.id));
    const facts = edges.map((edge) => `${this.nodes.get(edge.from)!.label} ${edge.kind.replace(/_/g, " ")} ${this.nodes.get(edge.to)!.label}`);
    return { edges, facts, nodes, truncated };
  }

  setCurrentRevision(input: { previousRevisionNodeId?: string | null; projectNodeId: string; revisionNode: GraphNode }) {
    const project = this.nodes.get(input.projectNodeId);
    if (!project || project.kind !== "project") throw new Error("A project node is required to set the current revision.");
    const revision = this.upsertNode({ ...input.revisionNode, authoritativeIdentity: input.revisionNode.authority?.id ?? input.revisionNode.id });
    for (const edge of this.getNeighbors({ direction: "out", edgeKinds: ["CURRENT_REVISION_OF"], nodeId: project.id })) {
      this.edges.set(edge.id, { ...edge, status: "historical" });
    }
    if (input.previousRevisionNodeId) {
      const previous = this.nodes.get(input.previousRevisionNodeId);
      if (previous) {
        this.nodes.set(previous.id, { ...previous, status: "historical" });
        this.connect({ factState: "confirmed", from: revision.id, kind: "SUPERSEDES", mode: project.mode, provenance: "project_state", scope: project.scope, status: "current", to: previous.id });
        this.invalidateSourceRevision(project.scope, previous.authority?.revision ?? previous.sourceRevision ?? previous.id);
      }
    }
    this.connect({ factState: "confirmed", from: project.id, kind: "CURRENT_REVISION_OF", mode: project.mode, provenance: "project_state", scope: project.scope, sourceRevision: revision.authority?.revision, status: "current", to: revision.id });
    return revision;
  }

  invalidateSourceRevision(scope: GraphScope, revision: string) {
    for (const [id, node] of this.nodes) {
      if (scopeKey(node.scope) === scopeKey(scope) && node.sourceRevision === revision && ["derived", "inferred"].includes(node.factState)) {
        this.nodes.set(id, { ...node, status: "invalidated" });
      }
    }
    for (const [id, edge] of this.edges) {
      if (scopeKey(edge.scope) === scopeKey(scope) && edge.sourceRevision === revision && ["derived", "inferred"].includes(edge.factState)) {
        this.edges.set(id, { ...edge, status: "invalidated" });
      }
    }
  }

  validate(): GraphValidationResult {
    const issues: GraphValidationIssue[] = [];
    const currentRevisionByProject = new Map<string, number>();
    for (const node of this.nodes.values()) {
      if (node.factState === "unsupported" && node.provenance === "verified") {
        issues.push({ code: "UNSUPPORTED_VERIFIED", itemId: node.id, message: "Unsupported graph facts cannot claim verified provenance." });
      }
      if (node.kind === "file" && node.authority?.kind === "project-file" && (!node.authority.projectId || !node.authority.revision || !node.authority.path)) {
        issues.push({ code: "FILE_AUTHORITY_INCOMPLETE", itemId: node.id, message: "Project file references require project, revision, and relative path authority." });
      }
    }
    for (const edge of this.edges.values()) {
      const from = this.nodes.get(edge.from);
      const to = this.nodes.get(edge.to);
      if (!from || !to) issues.push({ code: "EDGE_ENDPOINT_MISSING", itemId: edge.id, message: "Graph edge endpoint is missing." });
      else if (scopeKey(from.scope) !== scopeKey(edge.scope) || scopeKey(to.scope) !== scopeKey(edge.scope)) issues.push({ code: "EDGE_SCOPE_INVALID", itemId: edge.id, message: "Graph edge crosses its declared scope." });
      if (edge.kind === "CURRENT_REVISION_OF" && edge.status === "current") currentRevisionByProject.set(edge.from, (currentRevisionByProject.get(edge.from) ?? 0) + 1);
    }
    for (const [projectId, count] of currentRevisionByProject) {
      if (count > 1) issues.push({ code: "MULTIPLE_CURRENT_REVISIONS", itemId: projectId, message: "A project may have only one current revision relationship." });
    }
    return { issues, valid: issues.length === 0 };
  }

  snapshot(input: { includePrivate?: boolean } = {}): GraphSnapshot {
    const nodes = [...this.nodes.values()]
      .filter((node) => input.includePrivate || node.privacy !== "private")
      .sort((left, right) => left.id.localeCompare(right.id));
    const ids = new Set(nodes.map((node) => node.id));
    const edges = [...this.edges.values()].filter((edge) => ids.has(edge.from) && ids.has(edge.to)).sort((left, right) => left.id.localeCompare(right.id));
    return { edges, graphKernelVersion: GRAPH_KERNEL_VERSION, nodes };
  }

  serialize(input: { includePrivate?: boolean } = {}) {
    const validation = this.validate();
    if (!validation.valid) throw new Error(`Graph Kernel validation failed: ${validation.issues[0]?.message}`);
    return JSON.stringify(this.snapshot(input));
  }

  static deserialize(serialized: string) {
    const parsed = JSON.parse(serialized) as GraphSnapshot;
    return new GraphKernel(parsed);
  }
}

export function graphNode(input: {
  authority?: GraphNode["authority"];
  factState?: GraphFactState;
  identity: string;
  kind: GraphNodeKind;
  label: string;
  metadata?: Record<string, GraphMetadataValue>;
  mode: GraphMode;
  privacy?: GraphPrivacy;
  provenance: GraphProvenance;
  scope: GraphScope;
  sourceRevision?: string;
  status?: GraphItemStatus;
}): Omit<GraphNode, "id" | "metadata"> & { authoritativeIdentity: string; metadata?: Record<string, GraphMetadataValue> } {
  return {
    authority: input.authority,
    authoritativeIdentity: input.identity,
    factState: input.factState ?? "confirmed",
    kind: input.kind,
    label: input.label,
    metadata: input.metadata,
    mode: input.mode,
    privacy: input.privacy ?? "provider_eligible",
    provenance: input.provenance,
    scope: input.scope,
    sourceRevision: input.sourceRevision,
    status: input.status ?? "current"
  };
}
