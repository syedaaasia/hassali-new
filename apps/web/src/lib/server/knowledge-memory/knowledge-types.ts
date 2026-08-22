import type { GraphFactState, GraphMode } from "@/lib/server/graph-kernel/graph-types";

export type KnowledgeScopeKind = "conversation" | "ephemeral" | "project" | "source" | "user";
export type KnowledgeRecordStatus = "active" | "deleted" | "superseded";
export type KnowledgePrivacy = "sensitive" | "standard";
export type KnowledgeKind =
  | "conversation_summary"
  | "derived_context"
  | "instruction"
  | "personal_fact"
  | "preference"
  | "project_constraint"
  | "project_decision"
  | "project_state"
  | "relationship"
  | "source_claim"
  | "verified_outcome";

export type KnowledgeProvenance = {
  chunkId?: string | null;
  kind: "conversation" | "derived" | "project_memory" | "project_state" | "source_document" | "user_statement" | "verified";
  reference: string;
  revision?: string | null;
  section?: string | null;
  sourceId?: string | null;
};

export type KnowledgeAuthority = {
  id: string;
  kind: "conversation" | "project" | "project_revision" | "source" | "user" | "verification";
  revision?: string | null;
};

export type KnowledgeRecord = {
  authority: KnowledgeAuthority;
  confidence: number;
  createdAt: Date;
  effectiveFrom: Date;
  expiresAt: Date | null;
  factState: GraphFactState;
  id: string;
  kind: KnowledgeKind;
  ownerId: string;
  privacy: KnowledgePrivacy;
  projectId: string | null;
  provenance: KnowledgeProvenance;
  scope: { id: string; kind: KnowledgeScopeKind };
  statement: string;
  status: KnowledgeRecordStatus;
  subject: string;
  supersedesId: string | null;
  tags: string[];
  updatedAt: Date;
  value: string;
};

export type KnowledgeWriteDecision =
  | { action: "do_not_store"; reason: "ephemeral" | "secret" | "sensitive_requires_explicit" | "unsupported_inference" }
  | { action: "store"; reason: "explicit_save" | "project_fact" | "stable_useful_fact"; scope: "project" | "user" };

export type KnowledgeQuery = {
  conversationId?: string | null;
  currentRevision?: string | null;
  freshnessRequired?: boolean;
  includeSensitive?: boolean;
  limit?: number;
  maxCharacters?: number;
  mode: GraphMode;
  ownerId: string;
  projectId?: string | null;
  relatedRecordIds?: string[];
  subject?: string | null;
  tags?: string[];
  text: string;
};

export type KnowledgeRetrievalResult = {
  context: string;
  diagnostics: {
    candidates: number;
    conflicts: Array<{ recordIds: string[]; subject: string }>;
    deduplicated: number;
    excluded: number;
    returned: number;
    truncated: boolean;
  };
  records: KnowledgeRecord[];
};
