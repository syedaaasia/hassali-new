import { buildRealPreviewAssets, realPreviewKindFor } from "@/lib/server/preview/real-preview-assets";
import type { PreviewClassification, PreviewMetadata, PreviewRuntimeInput } from "@/lib/server/preview/preview-types";
import type { RealPreviewFrame, RealPreviewResult } from "@/lib/server/preview/real-preview-types";
import {
  escapePreviewHtml,
  sanitizePreviewList,
  sanitizePreviewText,
  sanitizeStaticPreviewHtml
} from "@/lib/server/preview/real-preview-sanitizer";

function proposalTitle(input: PreviewRuntimeInput, fallback: string) {
  return sanitizePreviewText(input.proposal?.appPreview?.appName ?? input.proposal?.summary, fallback);
}

function filesText(input: PreviewRuntimeInput) {
  return [
    ...Object.entries(input.generatedFiles ?? {}).map(([path, content]) => `${path}\n${content.slice(0, 5000)}`),
    ...(input.proposal?.changes ?? []).map((change) => `${change.path ?? ""}\n${change.proposedContent?.slice(0, 5000) ?? ""}`)
  ].join("\n");
}

function frame(
  id: string,
  title: string,
  kind: RealPreviewFrame["kind"],
  items: string[],
  extra?: Pick<RealPreviewFrame, "columns" | "rows">
): RealPreviewFrame {
  return {
    id,
    items: sanitizePreviewList(items, ["Preview item"]),
    kind,
    title: sanitizePreviewText(title),
    ...extra
  };
}

function dashboardFrames(metadata: PreviewMetadata, input: PreviewRuntimeInput) {
  const screens = sanitizePreviewList(metadata.screens, input.proposal?.appPreview?.screens ?? ["Dashboard", "Customers", "Billing"]);
  const panels = sanitizePreviewList(metadata.panels, ["Customers", "Pipeline", "Billing", "Settings"]);
  const widgets = sanitizePreviewList(metadata.widgets, ["Metric cards", "Recent activity", "Status table"]);

  return [
    frame("dashboard-overview", "Dashboard overview", "dashboard", widgets),
    frame("dashboard-nav", "Navigation", "app_shell", screens),
    frame("dashboard-table", "Operational table", "table", panels, {
      columns: ["Name", "Status", "Owner"],
      rows: panels.slice(0, 4).map((panel, index) => [panel, index % 2 === 0 ? "Active" : "Planned", "Hassali"])
    })
  ];
}

function mobileFrames(metadata: PreviewMetadata) {
  const screens = sanitizePreviewList(metadata.screens, ["Home", "Expenses", "Reports", "Settings"]);
  const flows = sanitizePreviewList(metadata.flows, ["Add item", "Review summary", "Sync data"]);

  return [
    frame("mobile-phone", "Phone preview", "mobile_screen", screens),
    frame("mobile-flow", "User flow", "panel", flows)
  ];
}

function componentFrames(metadata: PreviewMetadata, input: PreviewRuntimeInput) {
  const text = filesText(input).toLowerCase();
  const componentName = text.includes("pricing") ? "Pricing card" : sanitizePreviewList(metadata.components, ["Component card"])[0];
  const props = sanitizePreviewList(metadata.props, ["title", "description", "action"]);
  const states = sanitizePreviewList(metadata.states, ["default", "hover", "disabled"]);

  return [
    frame("component-card", componentName, "component", props),
    frame("component-states", "States", "panel", states)
  ];
}

function applicationFrames(metadata: PreviewMetadata, input: PreviewRuntimeInput) {
  const routes = sanitizePreviewList(metadata.routes, ["/", "/dashboard", "/settings"]);
  const modules = sanitizePreviewList(metadata.modules, input.proposal?.appPreview?.entities ?? ["Users", "Projects", "Billing"]);
  const features = sanitizePreviewList(metadata.features, input.proposal?.appPreview?.integrations ?? ["Auth", "Dashboard", "Settings"]);

  return [
    frame("application-shell", "Application shell", "app_shell", routes),
    frame("application-modules", "Modules", "dashboard", modules),
    frame("application-features", "Feature lanes", "panel", features)
  ];
}

function architectureFrames(metadata: PreviewMetadata) {
  const endpoints = sanitizePreviewList(metadata.endpoints, ["GET /api/health", "POST /api/resource"]);
  const services = sanitizePreviewList(metadata.services, ["API service", "Database", "Auth"]);
  const dataFlow = sanitizePreviewList(metadata.dataFlow, ["Request", "Validate", "Persist", "Respond"]);

  return [
    frame("architecture-services", "Services", "api", services),
    frame("architecture-endpoints", "Endpoints", "table", endpoints, {
      columns: ["Route", "Purpose"],
      rows: endpoints.map((endpoint) => [endpoint, "Planned endpoint"])
    }),
    frame("architecture-flow", "Data flow", "panel", dataFlow)
  ];
}

function websiteHtml(input: PreviewRuntimeInput) {
  const indexHtml =
    input.generatedFiles?.["index.html"] ??
    input.proposal?.changes?.find((change) => change.path === "index.html")?.proposedContent;

  return typeof indexHtml === "string" ? sanitizeStaticPreviewHtml(indexHtml) : undefined;
}

function safeHtmlFor(result: Omit<RealPreviewResult, "safeHtml">) {
  const cards = result.frames
    .map((previewFrame) => {
      const items = previewFrame.items
        .map((item) => `<li>${escapePreviewHtml(item)}</li>`)
        .join("");

      return `<section><h2>${escapePreviewHtml(previewFrame.title)}</h2><ul>${items}</ul></section>`;
    })
    .join("");

  return sanitizeStaticPreviewHtml(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body{margin:0;background:#08080b;color:#f4f1e8;font-family:Inter,ui-sans-serif,system-ui;padding:24px}
      main{display:grid;gap:16px}
      section{border:1px solid rgba(255,255,255,.1);border-radius:18px;background:rgba(255,255,255,.045);padding:18px}
      h1{font-size:24px;margin:0 0 14px}
      h2{font-size:14px;text-transform:uppercase;letter-spacing:.08em;color:#a9a3bd;margin:0 0 12px}
      ul{display:flex;flex-wrap:wrap;gap:8px;list-style:none;margin:0;padding:0}
      li{border:1px solid rgba(124,108,255,.25);border-radius:999px;padding:8px 10px;background:rgba(124,108,255,.08)}
    </style>
  </head>
  <body>
    <main>
      <h1>${escapePreviewHtml(result.title)}</h1>
      ${cards}
    </main>
  </body>
</html>`);
}

export function renderRealPreview(
  input: PreviewRuntimeInput,
  classification: PreviewClassification,
  metadata: PreviewMetadata
): RealPreviewResult {
  const previewType = classification.previewType;
  const kind = realPreviewKindFor(previewType);
  const warnings = [
    {
      code: "no_code_execution",
      message: "Preview is rendered from approved files and metadata without running packages or scripts.",
      severity: "info" as const
    }
  ];

  if (kind === "unavailable") {
    return {
      assets: [],
      confidence: classification.confidence,
      description: "No visual preview is available for this request.",
      frames: [],
      kind,
      previewType,
      renderMode: "unavailable",
      state: "unavailable",
      title: "No preview",
      warnings
    };
  }

  if (kind === "static_website") {
    return {
      assets: buildRealPreviewAssets(previewType, metadata),
      confidence: classification.confidence,
      description: "WEBSITE mode continues to use the existing local static iframe runtime.",
      frames: [],
      kind,
      previewType,
      renderMode: "existing_iframe",
      safeHtml: websiteHtml(input),
      state: "ready",
      title: "Website preview",
      warnings: []
    };
  }

  const frames =
    kind === "dashboard_mock"
      ? dashboardFrames(metadata, input)
      : kind === "mobile_mock"
        ? mobileFrames(metadata)
        : kind === "component_mock"
          ? componentFrames(metadata, input)
          : kind === "static_app_mock"
            ? applicationFrames(metadata, input)
            : architectureFrames(metadata);
  const partialResult = {
    assets: buildRealPreviewAssets(previewType, metadata),
    confidence: classification.confidence,
    description: `${kind.replace(/_/g, " ")} rendered as a safe static approximation.`,
    frames,
    kind,
    previewType,
    renderMode: kind === "api_architecture" ? "architecture_diagram" as const : "structured_cards" as const,
    state: "ready" as const,
    title: proposalTitle(input, kind.replace(/_/g, " ")),
    warnings
  };

  return {
    ...partialResult,
    safeHtml: safeHtmlFor(partialResult)
  };
}
