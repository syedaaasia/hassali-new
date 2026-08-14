import type {
  ReferenceEvidenceStatus,
  ReferenceFidelity,
  ReferenceRole,
  ReferenceSourceType
} from "@/lib/server/design/reference/design-reference-contract";

export type DesignContractStatus = "current" | "draft" | "superseded";
export type DesignConflictSeverity = "blocking" | "resolved" | "warning";
export type DesignValueOrigin =
  | "current-request"
  | "existing-project"
  | "professional-default"
  | "project-memory"
  | "project-note"
  | "reference-observed"
  | "reference-profile";

export type DesignEvidenceValue = {
  evidenceIds: string[];
  origin: DesignValueOrigin;
  status: ReferenceEvidenceStatus | "project-selected";
  value: string;
};

export type SemanticColorRole =
  | "accent"
  | "background"
  | "border"
  | "destructive"
  | "elevatedSurface"
  | "positive"
  | "primaryAction"
  | "secondaryAction"
  | "surface"
  | "textMuted"
  | "textPrimary"
  | "textSecondary"
  | "warning";

export type ProjectDesignReferenceRole = {
  fidelity: ReferenceFidelity;
  name: string;
  referenceId: string;
  role: ReferenceRole;
  scope: "global" | "section";
  sourceType: ReferenceSourceType;
  target: string | null;
};

export type ProjectDesignConflict = {
  dimension: string;
  resolution: string;
  severity: DesignConflictSeverity;
  sources: string[];
};

export type ProjectDesignContract = {
  accessibility: {
    contrast: string;
    focus: string;
    reducedMotion: string;
    semantics: string;
    touchTargets: string;
  };
  colors: Record<SemanticColorRole, DesignEvidenceValue>;
  components: {
    buttons: string;
    cards: string;
    footer: string;
    forms: string;
    navigation: string;
    sectionSpecific: Record<string, string>;
  };
  conflicts: ProjectDesignConflict[];
  contentHierarchy: {
    bodyWidth: string;
    primaryMessage: string;
    readingOrder: string;
    supportingMessage: string;
  };
  createdAt: string;
  doRules: string[];
  dontRules: string[];
  fidelity: {
    mode: ReferenceFidelity;
    strength: number;
    summary: string;
  };
  fingerprint: string;
  geometry: {
    borders: string;
    buttonRadius: string;
    cardRadius: string;
    imageMask: string;
    surfaceTreatment: string;
  };
  identity: {
    archetype: string;
    original: boolean;
    projectName: string;
    referenceBrands: string[];
    userBrand: string;
  };
  imagery: {
    aspectRatios: string[];
    crop: string;
    density: string;
    direction: string;
    provenancePolicy: string;
  };
  intent: {
    audience: string;
    personality: string[];
    purpose: string;
  };
  layout: {
    alignment: string;
    container: string;
    grid: string;
    hero: string;
    sectionRhythm: string[];
  };
  motion: {
    evidence: "observed" | "project-designed" | "unavailable";
    hover: string;
    personality: string;
    reveal: string;
    timing: string;
  };
  previousFingerprint: string | null;
  provenance: Array<{
    label: string;
    private: boolean;
    referenceId: string | null;
    role: ReferenceRole | "constraint" | "existing-project";
    status: string;
  }>;
  references: ProjectDesignReferenceRole[];
  responsive: {
    desktop: string[];
    evidence: "observed" | "project-designed" | "unavailable";
    mobile: string[];
    tablet: string[];
  };
  spacing: {
    componentGap: string;
    controlGap: string;
    pageGutter: string;
    scale: string[];
    sectionGap: string;
  };
  status: DesignContractStatus;
  typography: {
    body: string;
    display: string;
    fallbackPolicy: string;
    labels: string;
    lineHeight: string;
    scale: Record<"body" | "display" | "h1" | "h2" | "h3" | "small", string>;
  };
  unresolved: string[];
  version: number;
};

export type CompactProjectDesignContract = {
  archetype: string;
  colors: Record<"accent" | "background" | "surface" | "textPrimary", string>;
  conflicts: ProjectDesignConflict[];
  fidelity: ProjectDesignContract["fidelity"];
  fingerprint: string;
  geometry: ProjectDesignContract["geometry"];
  layout: ProjectDesignContract["layout"];
  references: ProjectDesignReferenceRole[];
  status: DesignContractStatus;
  typography: Pick<ProjectDesignContract["typography"], "body" | "display" | "scale">;
  userBrand: string;
  version: number;
};

export function compactProjectDesignContract(contract: ProjectDesignContract): CompactProjectDesignContract {
  return {
    archetype: contract.identity.archetype,
    colors: {
      accent: contract.colors.accent.value,
      background: contract.colors.background.value,
      surface: contract.colors.surface.value,
      textPrimary: contract.colors.textPrimary.value
    },
    conflicts: contract.conflicts,
    fidelity: contract.fidelity,
    fingerprint: contract.fingerprint,
    geometry: contract.geometry,
    layout: contract.layout,
    references: contract.references,
    status: contract.status,
    typography: {
      body: contract.typography.body,
      display: contract.typography.display,
      scale: contract.typography.scale
    },
    userBrand: contract.identity.userBrand,
    version: contract.version
  };
}
