import type { GrowthTruthStatus } from "@/lib/server/ai/website-growth-handoff";

export const GRAPH_KERNEL_VERSION = 1 as const;

export type GraphMode = "ASK" | "CODE" | "GROWTH" | "SHARED" | "WEBSITE";
export type GraphFactState = GrowthTruthStatus;
export type GraphItemStatus = "current" | "historical" | "invalidated";
export type GraphPrivacy = "private" | "provider_eligible" | "public";
export type GraphScopeKind = "artifact" | "conversation" | "global" | "project" | "task";

export type GraphScope = {
  id: string;
  kind: GraphScopeKind;
};

export type GraphProvenance =
  | "conversation"
  | "current_user_input"
  | "curated_asset"
  | "database"
  | "derived"
  | "deterministic"
  | "generated"
  | "inferred"
  | "project_state"
  | "provider"
  | "retrieval"
  | "user_upload"
  | "verified";

export type GraphNodeKind =
  | "action"
  | "artifact"
  | "asset"
  | "capability"
  | "claim"
  | "constraint"
  | "entity"
  | "evidence"
  | "file"
  | "manifest"
  | "objective"
  | "project"
  | "result"
  | "revision"
  | "test"
  | "verification";

export type GraphEdgeKind =
  | "BELONGS_TO"
  | "CONTAINS"
  | "CONTRADICTS"
  | "CURRENT_REVISION_OF"
  | "DERIVED_FROM"
  | "HAS_CONSTRAINT"
  | "MODIFIES"
  | "PACKAGED_BY"
  | "PROMOTES"
  | "PRODUCED"
  | "RELATED_TO"
  | "REQUIRES"
  | "SUPERSEDES"
  | "SUPPORTED_BY"
  | "TARGETS"
  | "TESTS"
  | "USES"
  | "VERIFIED_BY";

export type GraphAuthorityReference = {
  hash?: string;
  id: string;
  kind: "artifact" | "conversation" | "manifest" | "project" | "project-file" | "project-revision" | "task";
  path?: string;
  projectId?: string;
  revision?: string;
};

export type GraphMetadataValue = boolean | null | number | string | string[];

export type GraphNode = {
  authority?: GraphAuthorityReference;
  factState: GraphFactState;
  id: string;
  kind: GraphNodeKind;
  label: string;
  metadata: Record<string, GraphMetadataValue>;
  mode: GraphMode;
  privacy: GraphPrivacy;
  provenance: GraphProvenance;
  scope: GraphScope;
  sourceRevision?: string;
  status: GraphItemStatus;
};

export type GraphEdge = {
  factState: GraphFactState;
  from: string;
  id: string;
  kind: GraphEdgeKind;
  metadata: Record<string, GraphMetadataValue>;
  mode: GraphMode;
  provenance: GraphProvenance;
  scope: GraphScope;
  sourceRevision?: string;
  status: GraphItemStatus;
  to: string;
};

export type GraphSnapshot = {
  edges: GraphEdge[];
  graphKernelVersion: typeof GRAPH_KERNEL_VERSION;
  nodes: GraphNode[];
};

export type GraphValidationIssue = {
  code: string;
  itemId: string | null;
  message: string;
};

export type GraphValidationResult = {
  issues: GraphValidationIssue[];
  valid: boolean;
};

export type GraphContext = {
  edges: GraphEdge[];
  facts: string[];
  nodes: GraphNode[];
  truncated: boolean;
};
