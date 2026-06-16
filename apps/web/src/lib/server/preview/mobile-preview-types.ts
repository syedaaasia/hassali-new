import type { RealPreviewResult } from "@/lib/server/preview/real-preview-types";

export type MobilePreviewFramework =
  | "android_xml"
  | "capacitor"
  | "expo"
  | "flutter"
  | "ionic"
  | "jetpack_compose"
  | "react_native"
  | "swiftui"
  | "unknown";

export type MobilePreviewCapability =
  | "activity_hierarchy"
  | "bottom_tabs"
  | "composable_tree"
  | "hybrid_container"
  | "material_routes"
  | "navigation_graph"
  | "navigation_stack"
  | "phone_frame"
  | "screen_hierarchy"
  | "swiftui_views";

export type MobilePreviewDetectionInput = {
  files: Record<string, string>;
};

export type MobilePreviewMatch = {
  capabilities: MobilePreviewCapability[];
  confidence: number;
  displayName: string;
  framework: MobilePreviewFramework;
  signals: string[];
};

export type MobilePreviewMetadata = {
  capabilities: MobilePreviewCapability[];
  confidence: number;
  deviceType: "android_phone" | "hybrid_phone" | "ios_phone" | "phone";
  features: string[];
  framework: MobilePreviewFramework;
  navigation: string[];
  previewType: "mobile";
  screens: string[];
};

export type MobilePreviewRuntimeResult = MobilePreviewMetadata & {
  detected: boolean;
  displayName: string;
  realPreview: RealPreviewResult | null;
  warnings: string[];
};
