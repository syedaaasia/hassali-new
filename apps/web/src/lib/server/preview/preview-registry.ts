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
    capabilities: ["dashboard_metadata"],
    description: "Dashboard proposals render structured dashboard metadata without executing code.",
    rendererId: "dashboard_metadata_renderer",
    type: "dashboard"
  },
  {
    capabilities: ["structured_app_metadata"],
    description: "Application proposals render routes, modules, and feature metadata.",
    rendererId: "structured_application_metadata_renderer",
    type: "application"
  },
  {
    capabilities: ["mobile_metadata"],
    description: "Mobile app proposals render screens, navigation, and user-flow metadata.",
    rendererId: "mobile_metadata_renderer",
    type: "mobile"
  },
  {
    capabilities: ["component_metadata"],
    description: "Component proposals render component, prop, and state metadata.",
    rendererId: "component_metadata_renderer",
    type: "component"
  },
  {
    capabilities: ["architecture_metadata"],
    description: "Backend/API/system proposals render architecture metadata.",
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
