import type { IntelligenceProductMode } from "../intelligence/skill-kernel";

export type HassaliKnowledgeStatus =
  | "deprecated"
  | "degraded"
  | "implemented"
  | "limited"
  | "live-verified"
  | "planned"
  | "unavailable"
  | "verified";

export type HassaliKnowledgeCategory =
  | "approval"
  | "architecture"
  | "brand"
  | "capability"
  | "identity"
  | "limitation"
  | "milestone"
  | "mode"
  | "model-strategy"
  | "roadmap"
  | "security";

export type HassaliKnowledgeProvenance = {
  kind:
    | "canonical-documentation"
    | "design-token"
    | "roadmap"
    | "runtime-capability-registry"
    | "runtime-implementation"
    | "security-policy"
    | "verified-checkpoint";
  reference: string;
};

export type HassaliKnowledgeRecord = {
  capabilityId?: string;
  category: HassaliKnowledgeCategory;
  confidence: number;
  content: string;
  current: boolean;
  effectiveFrom?: string;
  id: string;
  modes: IntelligenceProductMode[];
  provenance: HassaliKnowledgeProvenance[];
  roadmapPhase?: string;
  status: HassaliKnowledgeStatus;
  supersededBy?: string;
  supersedes?: string[];
  tags: string[];
  title: string;
  topic: string;
  updatedAt: string;
  visibility: "internal" | "model-context" | "public";
};

export type HassaliKnowledgeQuery = {
  capabilityId?: string;
  categories?: HassaliKnowledgeCategory[];
  includeSuperseded?: boolean;
  maxChars?: number;
  maxRecords?: number;
  mode?: IntelligenceProductMode;
  roadmapPhase?: string;
  statuses?: HassaliKnowledgeStatus[];
  text: string;
};

export type HassaliKnowledgeResult = {
  confidence: number;
  current: boolean;
  provenance: HassaliKnowledgeProvenance[];
  record: HassaliKnowledgeRecord;
  relevance: number;
  status: HassaliKnowledgeStatus;
};

export type HassaliKnowledgeContext = {
  content: string;
  fingerprint: string;
  records: HassaliKnowledgeResult[];
  totalMatches: number;
  truncated: boolean;
};
