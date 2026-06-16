import type { PreviewMetadata, PreviewType } from "@/lib/server/preview/preview-types";
import type { RealPreviewAsset, RealPreviewKind } from "@/lib/server/preview/real-preview-types";
import { sanitizePreviewList, sanitizePreviewText } from "@/lib/server/preview/real-preview-sanitizer";

function asset(category: string, label: string, role: RealPreviewAsset["role"]): RealPreviewAsset {
  return {
    category,
    label: sanitizePreviewText(label),
    role
  };
}

export function realPreviewKindFor(type: PreviewType): RealPreviewKind {
  if (type === "website") return "static_website";
  if (type === "dashboard") return "dashboard_mock";
  if (type === "mobile") return "mobile_mock";
  if (type === "component") return "component_mock";
  if (type === "application") return "static_app_mock";
  if (type === "architecture") return "api_architecture";

  return "unavailable";
}

export function buildRealPreviewAssets(type: PreviewType, metadata: PreviewMetadata): RealPreviewAsset[] {
  if (type === "dashboard") {
    return [
      asset("dashboard", "metric cards", "mock_data"),
      asset("dashboard", "chart placeholders", "visual"),
      asset("dashboard", "table interface", "screen")
    ];
  }

  if (type === "mobile") {
    const screens = sanitizePreviewList(metadata.screens, ["Home", "Activity", "Settings"]);

    return screens.slice(0, 4).map((screen) => asset("mobile_screen", screen, "screen"));
  }

  if (type === "component") {
    return [
      asset("component", sanitizePreviewList(metadata.components, ["Component"])[0], "screen"),
      asset("component", "interactive states", "visual")
    ];
  }

  if (type === "application") {
    return [
      asset("application", "app shell", "screen"),
      asset("application", "navigation", "icon"),
      asset("application", "feature modules", "mock_data")
    ];
  }

  if (type === "architecture") {
    return [
      asset("architecture", "service map", "visual"),
      asset("architecture", "endpoint list", "mock_data"),
      asset("architecture", "data flow", "visual")
    ];
  }

  if (type === "website") {
    return [asset("website", "existing static iframe", "screen")];
  }

  return [];
}
