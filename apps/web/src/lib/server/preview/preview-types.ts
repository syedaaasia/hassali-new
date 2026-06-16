import type { ExecutablePreviewRuntimeResult } from "@/lib/server/preview/executable-preview-types";
import type { RealPreviewResult } from "@/lib/server/preview/real-preview-types";

export type ProductPreviewMode = "ASK" | "CODE" | "WEBSITE";

export type PreviewType =
  | "application"
  | "architecture"
  | "component"
  | "dashboard"
  | "mobile"
  | "none"
  | "website";

export type PreviewState =
  | "empty"
  | "metadata_only"
  | "none"
  | "ready"
  | "unsupported";

export type PreviewMetadata = {
  charts?: string[];
  components?: string[];
  dataFlow?: string[];
  endpoints?: string[];
  executablePreview?: ExecutablePreviewRuntimeResult;
  features?: string[];
  flows?: string[];
  hero?: string | null;
  modules?: string[];
  navigation?: string[];
  pages?: string[];
  panels?: string[];
  props?: string[];
  routes?: string[];
  screens?: string[];
  sections?: string[];
  services?: string[];
  states?: string[];
  widgets?: string[];
};

export type PreviewCapability =
  | "architecture_metadata"
  | "api_architecture_preview"
  | "application_mock_preview"
  | "component_metadata"
  | "component_mock_preview"
  | "dashboard_metadata"
  | "dashboard_mock_preview"
  | "executable_preview_planning"
  | "mobile_metadata"
  | "mobile_mock_preview"
  | "no_visual_preview"
  | "static_website_iframe"
  | "structured_app_metadata";

export type PreviewClassification = {
  confidence: number;
  previewType: PreviewType;
  reason: string;
  signals: string[];
};

export type PreviewRendererId =
  | "architecture_metadata_renderer"
  | "component_metadata_renderer"
  | "dashboard_metadata_renderer"
  | "mobile_metadata_renderer"
  | "none"
  | "structured_application_metadata_renderer"
  | "website_static_iframe";

export type PreviewRegistryEntry = {
  capabilities: PreviewCapability[];
  description: string;
  rendererId: PreviewRendererId;
  type: PreviewType;
};

export type PreviewRuntimeInput = {
  generatedFiles?: Record<string, string>;
  productMode: ProductPreviewMode;
  projectType?: string | null;
  proposal?: {
    appPreview?: {
      appKind: string;
      appName: string;
      entities: string[];
      integrations: string[];
      mockDataNotice: string;
      screens: string[];
    };
    changes?: Array<{
      action?: string;
      path?: string;
      proposedContent?: string;
      summary?: string;
    }>;
    previewType?: string;
    summary?: string;
  } | null;
  runtimeMetadata?: Record<string, unknown>;
};

export type PreviewRuntimeResult = {
  capabilities: PreviewCapability[];
  classification: PreviewClassification;
  metadata: PreviewMetadata;
  realPreview: RealPreviewResult;
  registryEntry: PreviewRegistryEntry;
  state: PreviewState;
  warnings: string[];
};
