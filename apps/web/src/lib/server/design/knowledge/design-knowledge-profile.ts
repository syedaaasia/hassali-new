export type DesignKnowledgeSourceFormat = "legacy" | "structured-frontmatter";

export type DesignKnowledgeTypographyToken = {
  family: string | null;
  featureSettings: string | null;
  letterSpacing: string | null;
  lineHeight: string | null;
  name: string;
  size: string | null;
  weight: string | null;
};

export type DesignKnowledgeComponentToken = {
  name: string;
  properties: Record<string, string>;
  resolvedProperties: Record<string, string>;
};

export type DesignKnowledgeProfile = {
  aliases: string[];
  archetypes: string[];
  atmosphere: string[];
  canvasStrategy: string[];
  colors: Record<string, string>;
  components: Record<string, DesignKnowledgeComponentToken>;
  confidence: number;
  description: string;
  doRules: string[];
  dontRules: string[];
  fingerprint: string;
  geometry: Record<string, string>;
  id: string;
  imagery: string[];
  layout: string[];
  motion: string[];
  name: string;
  responsive: string[];
  sourceFormat: DesignKnowledgeSourceFormat;
  sourcePath: string;
  spacing: Record<string, string>;
  typography: Record<string, DesignKnowledgeTypographyToken>;
  version: string | null;
};

export type DesignKnowledgeIndex = {
  fingerprint: string;
  generatedAt: string;
  legacyCount: number;
  profiles: DesignKnowledgeProfile[];
  sourceLicense: "MIT";
  structuredCount: number;
  version: 1;
};

export type RetrievedDesignKnowledge = {
  matchedBy: Array<"alias" | "archetype" | "domain" | "name" | "style">;
  profile: DesignKnowledgeProfile;
  score: number;
};
