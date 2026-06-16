import type {
  PreviewRegistryEntry,
  PreviewType
} from "@/lib/server/preview/preview-types";

const registry: PreviewRegistryEntry[] = [
  {
    capabilities: ["no_visual_preview"],
    description: "No visual preview is shown for answer-only ASK flows.",
    rendererId: "none",
    type: "none"
  },
  {
    capabilities: ["static_website_iframe"],
    description: "Static WEBSITE output uses the existing local iframe preview runtime.",
    rendererId: "website_static_iframe",
    type: "website"
  },
  {
    capabilities: ["dashboard_metadata", "dashboard_mock_preview"],
    description: "Dashboard proposals render a safe static dashboard mock without executing code.",
    rendererId: "dashboard_metadata_renderer",
    type: "dashboard"
  },
  {
    capabilities: ["structured_app_metadata", "application_mock_preview"],
    description: "Application proposals render routes, modules, features, and a static app-shell mock.",
    rendererId: "structured_application_metadata_renderer",
    type: "application"
  },
  {
    capabilities: ["mobile_metadata", "mobile_mock_preview"],
    description: "Mobile app proposals render screens, navigation, and a phone-frame mock.",
    rendererId: "mobile_metadata_renderer",
    type: "mobile"
  },
  {
    capabilities: ["component_metadata", "component_mock_preview"],
    description: "Component proposals render component, prop, state metadata, and a static component mock.",
    rendererId: "component_metadata_renderer",
    type: "component"
  },
  {
    capabilities: ["architecture_metadata", "api_architecture_preview"],
    description: "Backend/API/system proposals render endpoint and architecture previews.",
    rendererId: "architecture_metadata_renderer",
    type: "architecture"
  }
];

export function getPreviewRegistry() {
  return registry;
}

export function getPreviewRegistryEntry(previewType: PreviewType): PreviewRegistryEntry {
  return registry.find((entry) => entry.type === previewType) ?? registry[0];
}
