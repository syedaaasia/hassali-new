import type {
  PreviewClassification,
  PreviewRuntimeInput,
  PreviewType
} from "@/lib/server/preview/preview-types";

const legacyPreviewMap: Record<string, PreviewType> = {
  code_app_preview: "dashboard",
  code_plan_preview: "architecture",
  docs_preview: "architecture",
  none: "none",
  website_static_preview: "website"
};

function normalizedText(input: PreviewRuntimeInput) {
  const proposal = input.proposal;
  const fileNames = [
    ...Object.keys(input.generatedFiles ?? {}),
    ...(proposal?.changes ?? []).map((change) => change.path ?? "")
  ];
  const changeText = (proposal?.changes ?? [])
    .map((change) => [change.path, change.summary, change.proposedContent?.slice(0, 4000)].filter(Boolean).join(" "))
    .join(" ");

  return [
    input.productMode,
    input.projectType ?? "",
    proposal?.summary ?? "",
    proposal?.previewType ?? "",
    proposal?.appPreview?.appKind ?? "",
    proposal?.appPreview?.appName ?? "",
    ...(proposal?.appPreview?.screens ?? []),
    ...fileNames,
    changeText
  ]
    .join(" ")
    .toLowerCase();
}

function includesAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

function classification(previewType: PreviewType, confidence: number, reason: string, signals: string[]): PreviewClassification {
  return {
    confidence,
    previewType,
    reason,
    signals
  };
}

export function classifyPreview(input: PreviewRuntimeInput): PreviewClassification {
  if (input.productMode === "ASK") {
    return classification("none", 0.99, "ASK mode is answer-only and has no visual preview.", ["ask_mode"]);
  }

  const explicitLegacy = input.proposal?.previewType ? legacyPreviewMap[input.proposal.previewType] : undefined;
  const text = normalizedText(input);
  const hasIndexHtml = Boolean(input.generatedFiles?.["index.html"]) || text.includes("index.html");
  const hasWebsiteSignals = hasIndexHtml || includesAny(text, ["landing page", "homepage", "website", "hero section"]);

  if (input.productMode === "WEBSITE") {
    return classification("website", hasWebsiteSignals ? 0.94 : 0.86, "WEBSITE mode routes through the unified website preview lane.", ["website_mode"]);
  }

  if (explicitLegacy && explicitLegacy !== "none" && explicitLegacy !== "website") {
    return classification(explicitLegacy, 0.82, "Existing proposal metadata maps to a unified CODE preview lane.", [`legacy:${input.proposal?.previewType}`]);
  }

  if (includesAny(text, ["android", "ios", "react native", "flutter", "mobile app", "expense tracker", "bottom tab", "mobile screen"])) {
    return classification("mobile", 0.9, "CODE request describes a mobile application preview.", ["mobile_terms"]);
  }

  if (includesAny(text, ["pricing card", "reusable component", "component", "button", "card component", "props", "storybook"])) {
    return classification("component", 0.88, "CODE request describes a reusable UI component.", ["component_terms"]);
  }

  if (includesAny(text, ["dashboard", "admin", "analytics", "chart", "charts", "widgets", "crm", "kanban", "table", "pipeline"])) {
    return classification("dashboard", 0.9, "CODE request describes a dashboard or operational app surface.", ["dashboard_terms"]);
  }

  if (includesAny(text, ["node api", "rest api", "graphql", "endpoint", "endpoints", "backend", "service layer", "database schema", "server api"])) {
    return classification("architecture", 0.9, "CODE request describes backend/API architecture rather than a visual app.", ["architecture_terms"]);
  }

  if (includesAny(text, ["next.js", "nextjs", "react app", "saas app", "web app", "routes", "modules", "application"])) {
    return classification("application", 0.86, "CODE request describes a web application preview.", ["application_terms"]);
  }

  if (explicitLegacy) {
    return classification(explicitLegacy, 0.78, "Existing preview metadata supplied a unified preview lane.", [`legacy:${input.proposal?.previewType}`]);
  }

  return classification("architecture", 0.62, "CODE request has no runnable visual preview yet, so Hassali shows architecture metadata.", ["code_default"]);
}
