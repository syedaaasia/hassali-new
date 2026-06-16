import type { RealPreviewFrame, RealPreviewResult } from "@/lib/server/preview/real-preview-types";

export type FrameworkId =
  | "angular"
  | "astro"
  | "html"
  | "next"
  | "node_api"
  | "nuxt"
  | "react"
  | "remix"
  | "shadcn"
  | "svelte"
  | "sveltekit"
  | "tailwind"
  | "unknown"
  | "vite"
  | "vue";

export type FrameworkRuntimeType =
  | "component"
  | "content_site"
  | "meta_framework"
  | "spa"
  | "static"
  | "style_system"
  | "ui_system"
  | "server";

export type FrameworkPreviewCapability =
  | "app_shell_mock"
  | "component_inventory"
  | "component_tree"
  | "dashboard_mock"
  | "layout_tree"
  | "nested_routes"
  | "route_tree"
  | "style_system"
  | "site_structure";

export type FrameworkDetectionInput = {
  files: Record<string, string>;
};

export type FrameworkMatch = {
  confidence: number;
  displayName: string;
  frameworkId: FrameworkId;
  previewCapabilities: FrameworkPreviewCapability[];
  runtimeType: FrameworkRuntimeType;
  signals: string[];
};

export type FrameworkRegistryEntry = {
  confidenceScore: (input: FrameworkDetectionInput) => FrameworkMatch;
  displayName: string;
  frameworkId: FrameworkId;
  previewCapabilities: FrameworkPreviewCapability[];
  runtimeType: FrameworkRuntimeType;
  supportedFilePatterns: RegExp[];
};

export type FrameworkPreviewResult = RealPreviewResult & {
  frameworkDisplayName: string;
  frameworkId: FrameworkId;
  frameworkSignals: string[];
};

export type FrameworkPreviewPlan = {
  description: string;
  frames: RealPreviewFrame[];
  title: string;
};
