import type { IntelligenceHealthStatus } from "@/lib/server/intelligence/intelligence-contract";

export const visualProcessingLimits = Object.freeze({
  maxComparisonImages: 4,
  maxGeneratedImages: 1,
  maxImageBytes: 8 * 1024 * 1024,
  maxImageDimension: 8_192,
  maxImagePixels: 20_000_000,
  maxImagesPerRequest: 5,
  maxPublicResults: 4,
  maxPublicSearchCandidates: 8,
  maxVideoFrames: 12,
  providerTimeoutMs: 30_000,
  publicSearchTimeoutMs: 7_000
});

export type VisualOrigin = "document-render" | "generated" | "public-web" | "user-upload" | "video-frame";
export type VisualLicenseStatus = "generated" | "known-reusable" | "restricted" | "unknown" | "user-supplied";
export type VisualConfidence = "high" | "low" | "medium" | "unknown";

export type VisualRegion = {
  boundingBox?: { height: number; width: number; x: number; y: number };
  confidence: VisualConfidence;
  label: string;
  sourceArtifactId: string;
  text?: string;
};

export type VisualArtifact = {
  chartInfo: Record<string, unknown> | null;
  confidence: VisualConfidence;
  contentHash: string;
  height: number | null;
  id: string;
  mimeType: string;
  objects: string[];
  ocrEvidence: string | null;
  orientation: 0 | 90 | 180 | 270 | null;
  origin: VisualOrigin;
  provenance: {
    generatedAt?: string;
    kind: VisualLicenseStatus;
    private: boolean;
    sourcePageUrl?: string;
  };
  regions: VisualRegion[];
  sourceType: "image" | "screenshot" | "visual-document";
  textRegions: VisualRegion[];
  visualDescription: string | null;
  warnings: string[];
  width: number | null;
};

export type VisualIntent = {
  needsChartUnderstanding: boolean;
  needsComparison: boolean;
  needsImageGeneration: boolean;
  needsPublicVisualSearch: boolean;
  needsSpatialReasoning: boolean;
  needsTextExtraction: boolean;
  needsVideoAnalysis: boolean;
  needsVisualUnderstanding: boolean;
  privacySensitivity: "private" | "public" | "unknown";
  sourcePreference: "generated" | "none" | "public" | "user-provided";
};

export type VisionAnalysis = {
  chartFacts: string[];
  confidence: VisualConfidence;
  objects: string[];
  provider: string;
  regions: VisualRegion[];
  relationships: string[];
  spatialFacts: string[];
  summary: string;
  visibleText: string[];
  warnings: string[];
};

export type VisualFailureCode =
  | "generation-failed"
  | "generation-unavailable"
  | "image-malformed"
  | "image-too-large"
  | "media-runtime-unavailable"
  | "provider-failed"
  | "provider-unavailable"
  | "public-search-failed"
  | "public-search-unavailable"
  | "unsafe-public-url"
  | "unsupported-capability";

export type VisualFailure = {
  code: VisualFailureCode;
  provider: string | null;
  retryable: boolean;
  safeMessage: string;
};

export type VisualProviderHealth = {
  checkedAt: string;
  provider: string;
  reason: string | null;
  retryable: boolean;
  status: IntelligenceHealthStatus;
};

export type VisionProviderInput = {
  artifacts: Array<{ artifact: VisualArtifact; bytes: Uint8Array }>;
  prompt: string;
  signal?: AbortSignal;
};

export interface VisionProvider {
  readonly id: string;
  analyzeImage(input: VisionProviderInput): Promise<{ analysis: VisionAnalysis | null; failure: VisualFailure | null }>;
  compareImages?(input: VisionProviderInput): Promise<{ analysis: VisionAnalysis | null; failure: VisualFailure | null }>;
  health(): Promise<VisualProviderHealth>;
}

export type VisualSearchResult = {
  creator: string | null;
  height: number | null;
  id: string;
  imageUrl: string;
  license: string | null;
  licenseStatus: VisualLicenseStatus;
  licenseUrl: string | null;
  provider: string;
  publishedAt: string | null;
  publisher: string;
  retrievedAt: string;
  sourcePageUrl: string;
  thumbnailUrl: string | null;
  title: string;
  width: number | null;
};

export type VisualCitation = {
  creator: string | null;
  imageUrl: string;
  license: string | null;
  publisher: string;
  retrievedAt: string;
  sourcePageUrl: string;
  title: string;
  visualArtifactId: string;
};

export interface VisualSearchProvider {
  readonly id: string;
  health(): Promise<VisualProviderHealth>;
  searchImages(query: string, options: { maxResults: number; signal?: AbortSignal }): Promise<VisualSearchResult[]>;
}

export type ImageGenerationRequest = {
  aspectRatio?: string;
  mustAvoid?: string[];
  mustInclude?: string[];
  negativeConstraints?: string[];
  prompt: string;
  referenceArtifacts?: VisualArtifact[];
  size?: "1024x1024" | "1024x1536" | "1536x1024";
  styleConstraints?: string[];
};

export type GeneratedVisual = {
  bytes: Uint8Array;
  generatedAt: string;
  height: number;
  imageId: string;
  mimeType: "image/png";
  model: string;
  provider: string;
  provenance: "generated";
  safetyStatus: "accepted" | "unknown";
  width: number;
};

export interface ImageGenerationProvider {
  readonly id: string;
  generate(request: ImageGenerationRequest, signal?: AbortSignal): Promise<{ failure: VisualFailure | null; image: GeneratedVisual | null }>;
  health(): Promise<VisualProviderHealth>;
}

export type VisualAssetDecision = {
  action: "GENERATE_IMAGE" | "NO_IMAGE_NEEDED" | "SOURCE_REAL_IMAGE" | "USER_SUPPLIED";
  reasonCode:
    | "CREATIVE_GENERATION_REQUEST"
    | "FACTUAL_REAL_WORLD_IMAGE"
    | "NO_VISUAL_REQUEST"
    | "PRIVATE_HISTORY_REQUIRES_EVIDENCE"
    | "USER_IMAGE_AVAILABLE";
};

export type MediaArtifact = {
  audioPresent: boolean | null;
  durationMs: number | null;
  frameRate: number | null;
  height: number | null;
  id: string;
  provenance: { kind: "user-provided-media"; private: true };
  type: "screen-recording" | "video";
  width: number | null;
};

export type MediaFrame = {
  imageArtifact: VisualArtifact;
  reasonSelected: "interval" | "ocr-change" | "scene-change" | "screen-change" | "user-timestamp";
  sceneId: string | null;
  timestampMs: number;
};

export class VisualProviderRegistry<T extends { readonly id: string }> {
  private readonly providers = new Map<string, T>();

  register(provider: T) {
    if (this.providers.has(provider.id)) throw new Error(`Visual provider '${provider.id}' is already registered.`);
    this.providers.set(provider.id, provider);
    return this;
  }

  get(providerId: string) {
    return this.providers.get(providerId) ?? null;
  }

  list() {
    return [...this.providers.values()];
  }
}

export class VisualIntelligenceError extends Error {
  readonly code: VisualFailureCode;

  constructor(code: VisualFailureCode, message: string) {
    super(message);
    this.name = "VisualIntelligenceError";
    this.code = code;
  }
}
