import type { MemoryContextCapsule } from "@/lib/server/shared-memory/shared-memory";
import type { DesignKnowledgeProfile } from "@/lib/server/design/knowledge/design-knowledge-profile";

export type ReferenceSourceType =
  | "existing-project"
  | "existing-project-page"
  | "external-design-reference"
  | "hassali-reference-catalog"
  | "internal-design-knowledge"
  | "multiple-reference"
  | "named-brand"
  | "public-url"
  | "uploaded-design-md"
  | "uploaded-image"
  | "uploaded-screenshot"
  | "user-description";

export type ReferenceFidelity = "close-replica" | "inspired" | "reference-clone" | "style-match";
export type ReferenceEvidenceStatus = "directly-specified" | "inferred" | "observed" | "stale" | "uncertain" | "unavailable";
export type ReferenceResolutionStatus = "ambiguous" | "not-found" | "partial" | "resolved" | "stale";
export type ReferenceRole =
  | "cards"
  | "color"
  | "dashboard"
  | "ecommerce"
  | "footer"
  | "global"
  | "hero"
  | "imagery"
  | "motion"
  | "navigation"
  | "pricing"
  | "product-storytelling"
  | "responsive"
  | "section-layout"
  | "typography";

export type ReferenceProvenance = {
  capturedAt: string | null;
  fingerprint: string | null;
  license: string | null;
  private: boolean;
  providerId: string;
  revision: string | null;
  sourceLabel: string;
  sourceUrl: string | null;
};

export type DesignReference = {
  canonicalUrl: string | null;
  confidence: number;
  fidelity: ReferenceFidelity;
  id: string;
  limitations: string[];
  name: string;
  pageTarget: string | null;
  provenance: ReferenceProvenance;
  resolutionStatus: ReferenceResolutionStatus;
  role: ReferenceRole;
  sourceAttachmentId?: string | null;
  sourceType: ReferenceSourceType;
  userSuppliedUrl: string | null;
};

export type ReferenceFact = {
  evidenceIds: string[];
  status: ReferenceEvidenceStatus;
  value: string;
};

export type ReferenceDesignProfile = {
  accessibility: ReferenceFact[];
  atmosphere: ReferenceFact[];
  colors: ReferenceFact[];
  components: ReferenceFact[];
  confidence: number;
  doRules: ReferenceFact[];
  dontRules: ReferenceFact[];
  evidenceStatus: ReferenceEvidenceStatus;
  id: string;
  imagery: ReferenceFact[];
  knowledge?: DesignKnowledgeProfile;
  layout: ReferenceFact[];
  limitations: string[];
  motion: ReferenceFact[];
  referenceId: string;
  responsive: ReferenceFact[];
  surfaces: ReferenceFact[];
  typography: ReferenceFact[];
};

export type ReferenceConflict = {
  dimension: string;
  referenceIds: string[];
  resolution: "defer-to-i2";
  summary: string;
};

export type DesignDirectionRequest = {
  conflicts: ReferenceConflict[];
  constraints: {
    currentRequest: string[];
    memory: string[];
    overriddenMemory: string[];
    projectNotes: string[];
  };
  createdAt: string;
  currentRequest: string;
  fidelity: ReferenceFidelity;
  profiles: ReferenceDesignProfile[];
  references: DesignReference[];
  security: {
    blocked: boolean;
    reason: string | null;
    referenceContentAuthority: "untrusted-data-only";
  };
  unknowns: string[];
  userBrand: string | null;
  version: 1;
};

export type DesignReferenceProviderInput = {
  memory?: MemoryContextCapsule | null;
  now: () => Date;
  projectNotes?: string;
  prompt: string;
  reference: DesignReference;
  signal?: AbortSignal;
  visionText?: string;
  visualEvidence?: Array<{
    artifactId: string;
    height: number | null;
    kind: "image" | "screenshot";
    warnings: string[];
    width: number | null;
  }>;
  workspace?: {
    activeFileContent: string;
    activePath: string;
    fileContents: Record<string, string>;
    fileList: string[];
  };
};

export type DesignReferenceProviderResult = {
  profile: ReferenceDesignProfile | null;
  reference: DesignReference;
};

export interface DesignReferenceProvider {
  readonly id: string;
  readonly sourceTypes: ReferenceSourceType[];
  resolve(input: DesignReferenceProviderInput): Promise<DesignReferenceProviderResult>;
}

export class DesignReferenceProviderRegistry {
  private readonly providers = new Map<string, DesignReferenceProvider>();

  register(provider: DesignReferenceProvider) {
    if (this.providers.has(provider.id)) throw new Error(`Design reference provider already registered: ${provider.id}`);
    this.providers.set(provider.id, provider);
    return this;
  }

  get(providerId: string) {
    const provider = this.providers.get(providerId);
    if (!provider) throw new Error(`Unknown design reference provider: ${providerId}`);
    return provider;
  }

  forSource(sourceType: ReferenceSourceType) {
    return [...this.providers.values()].find((provider) => provider.sourceTypes.includes(sourceType)) ?? null;
  }

  list() {
    return [...this.providers.values()];
  }
}

export const designReferenceLimits = Object.freeze({
  maxDesignMdBytes: 64 * 1024,
  maxDesignMdStatements: 120,
  maxProfiles: 6,
  maxPublicUrls: 2,
  maxReferences: 8,
  maxWorkspaceCharacters: 60_000,
  maxWorkspaceFiles: 24
});

export function compactDesignDirectionRequest(request: DesignDirectionRequest | null) {
  if (!request) return null;
  return {
    conflicts: request.conflicts.map((conflict) => conflict.summary),
    evidence: request.profiles.filter((profile) => !request.references.some((reference) => reference.id === profile.referenceId && reference.sourceType === "internal-design-knowledge")).map((profile) => ({
      confidence: profile.confidence,
      evidenceStatus: profile.evidenceStatus,
      referenceId: profile.referenceId
    })),
    fidelity: request.fidelity,
    references: request.references.filter((reference) => reference.sourceType !== "internal-design-knowledge").map((reference) => ({
      fidelity: reference.fidelity,
      name: reference.name,
      resolutionStatus: reference.resolutionStatus,
      role: reference.role,
      sourceType: reference.sourceType
    })),
    security: request.security,
    unknowns: request.unknowns,
    userBrand: request.userBrand,
    version: request.version
  };
}
