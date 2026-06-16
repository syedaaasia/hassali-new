import type { PreviewType } from "@/lib/server/preview/preview-types";

export type RealPreviewKind =
  | "api_architecture"
  | "component_mock"
  | "dashboard_mock"
  | "mobile_mock"
  | "static_app_mock"
  | "static_website"
  | "unavailable";

export type RealPreviewRenderMode =
  | "architecture_diagram"
  | "existing_iframe"
  | "safe_static_mock"
  | "structured_cards"
  | "unavailable";

export type RealPreviewAsset = {
  category: string;
  label: string;
  role: "background" | "icon" | "mock_data" | "screen" | "visual";
};

export type RealPreviewWarning = {
  code: string;
  message: string;
  severity: "info" | "medium";
};

export type RealPreviewFrame = {
  columns?: string[];
  id: string;
  items: string[];
  kind: "api" | "app_shell" | "component" | "dashboard" | "mobile_screen" | "panel" | "table";
  rows?: string[][];
  title: string;
};

export type RealPreviewResult = {
  assets: RealPreviewAsset[];
  confidence: number;
  description: string;
  frames: RealPreviewFrame[];
  kind: RealPreviewKind;
  previewType: PreviewType;
  renderMode: RealPreviewRenderMode;
  safeHtml?: string;
  state: "ready" | "unavailable";
  title: string;
  warnings: RealPreviewWarning[];
};
