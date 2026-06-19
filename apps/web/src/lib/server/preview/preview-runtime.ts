import { classifyPreview } from "@/lib/server/preview/preview-classifier";
import { buildExecutablePreviewRuntime } from "@/lib/server/preview/executable-preview-runtime";
import { renderFrameworkPreview } from "@/lib/server/preview/framework-preview-renderer";
import { buildMobilePreviewRuntime } from "@/lib/server/preview/mobile-preview-runtime";
import { getPreviewRegistryEntry } from "@/lib/server/preview/preview-registry";
import { renderRealPreview } from "@/lib/server/preview/real-preview-renderer";
import { normalizePath } from "@/lib/utils/path";
import type {
  PreviewClassification,
  PreviewMetadata,
  PreviewRuntimeInput,
  PreviewRuntimeResult,
  PreviewType
} from "@/lib/server/preview/preview-types";

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function fileNames(input: PreviewRuntimeInput) {
  return unique([
    ...Object.keys(input.generatedFiles ?? {}),
    ...(input.proposal?.changes ?? []).map((change) => change.path ?? "")
  ].map(normalizePath));
}

function proposalFiles(input: PreviewRuntimeInput) {
  return Object.fromEntries(
    (input.proposal?.changes ?? [])
      .filter((change) => typeof change.path === "string" && typeof change.proposedContent === "string")
      .map((change) => [
        normalizePath(change.path),
        change.proposedContent as string
      ])
  );
}

function pageNames(files: string[]) {
  return files
    .filter((path) => /\.html$/i.test(path))
    .map((path) => path.replace(/\\/g, "/").split("/").pop() ?? path);
}

function routeNames(files: string[]) {
  return files
    .filter((path) => /\.(?:tsx|ts|jsx|js|html)$/i.test(path))
    .map((path) => {
      const normalized = path.replace(/\\/g, "/");

      if (normalized.endsWith("index.html")) return "/";
      if (normalized.includes("/page.")) return `/${normalized.split("/").slice(-2, -1)[0] ?? ""}`;

      return normalized;
    })
    .slice(0, 8);
}

function termsFromText(text: string, terms: string[]) {
  const lower = text.toLowerCase();

  return terms.filter((term) => lower.includes(term.toLowerCase()));
}

function proposalText(input: PreviewRuntimeInput) {
  return [
    input.projectType ?? "",
    input.proposal?.summary ?? "",
    input.proposal?.appPreview?.appKind ?? "",
    ...(input.proposal?.appPreview?.screens ?? []),
    ...(input.proposal?.changes ?? []).map((change) => `${change.path ?? ""} ${change.summary ?? ""}`)
  ].join(" ");
}

function metadataFor(type: PreviewType, input: PreviewRuntimeInput): PreviewMetadata {
  const files = fileNames(input);
  const text = proposalText(input);
  const appPreview = input.proposal?.appPreview;

  if (type === "none") {
    return {};
  }

  if (type === "website") {
    return {
      hero: termsFromText(text, ["hero", "landing", "homepage"])[0] ?? null,
      pages: pageNames(files),
      routes: routeNames(files),
      sections: termsFromText(text, ["hero", "services", "products", "features", "about", "contact", "footer"])
    };
  }

  if (type === "dashboard") {
    return {
      charts: termsFromText(text, ["chart", "analytics", "report", "revenue", "pipeline"]),
      panels: termsFromText(text, ["customers", "deals", "billing", "settings", "records", "tasks"]),
      screens: appPreview?.screens ?? termsFromText(text, ["dashboard", "customers", "billing", "settings"]),
      widgets: termsFromText(text, ["card", "metric", "table", "kanban", "calendar"])
    };
  }

  if (type === "mobile") {
    return {
      flows: termsFromText(text, ["onboarding", "expense", "tracker", "login", "checkout", "profile"]),
      navigation: termsFromText(text, ["bottom tab", "tabs", "stack", "drawer"]),
      screens: appPreview?.screens ?? termsFromText(text, ["home", "dashboard", "expense", "settings", "profile"])
    };
  }

  if (type === "component") {
    return {
      components: termsFromText(text, ["pricing card", "card", "button", "modal", "table", "form"]),
      props: termsFromText(text, ["price", "title", "variant", "state", "disabled"]),
      states: termsFromText(text, ["hover", "active", "loading", "empty", "error"])
    };
  }

  if (type === "application") {
    return {
      features: appPreview?.integrations ?? termsFromText(text, ["auth", "billing", "dashboard", "settings", "workflow"]),
      modules: appPreview?.entities ?? termsFromText(text, ["user", "customer", "invoice", "project", "team"]),
      routes: routeNames(files)
    };
  }

  return {
    dataFlow: termsFromText(text, ["request", "response", "database", "queue", "auth", "billing"]),
    endpoints: termsFromText(text, ["rest", "graphql", "endpoint", "api", "webhook"]),
    services: termsFromText(text, ["service", "database", "auth", "billing", "worker", "cache"])
  };
}

function stateFor(type: PreviewType, metadata: PreviewMetadata, input: PreviewRuntimeInput) {
  if (type === "none") return "none";
  if (type === "website") return metadata.pages?.length || input.generatedFiles?.["index.html"] ? "ready" : "empty";

  const hasMetadata = Object.values(metadata).some((value) => Array.isArray(value) ? value.length > 0 : Boolean(value));

  return hasMetadata ? "metadata_only" : "empty";
}

export function buildPreviewRuntime(input: PreviewRuntimeInput): PreviewRuntimeResult {
  const baseClassification = classifyPreview(input);
  const proposedFiles = proposalFiles(input);
  const mobilePreview = buildMobilePreviewRuntime({
    files: {
      ...(input.generatedFiles ?? {}),
      ...proposedFiles
    }
  });
  const classification: PreviewClassification =
    input.productMode === "CODE" &&
    mobilePreview.detected &&
    baseClassification.previewType !== "none" &&
    baseClassification.previewType !== "website"
      ? {
          confidence: Math.max(baseClassification.confidence, mobilePreview.confidence),
          previewType: "mobile",
          reason: `${mobilePreview.displayName} mobile project detected by the mobile preview runtime.`,
          signals: mobilePreview.framework === "unknown" ? baseClassification.signals : [mobilePreview.framework, ...baseClassification.signals]
        }
      : baseClassification;
  const registryEntry = getPreviewRegistryEntry(classification.previewType);
  const executablePreview = buildExecutablePreviewRuntime({
    generatedFiles: input.generatedFiles,
    proposalFiles: proposedFiles
  });
  const metadata = {
    ...metadataFor(classification.previewType, input),
    executablePreview,
    mobilePreview
  };
  const realPreview =
    mobilePreview.realPreview ??
    renderFrameworkPreview(input, classification, metadata, executablePreview) ??
    renderRealPreview(input, classification, metadata);
  const state =
    classification.previewType !== "website" && realPreview.state === "ready"
      ? "ready"
      : stateFor(classification.previewType, metadata, input);
  const warnings: string[] = [];

  if (classification.previewType === "website" && state !== "ready") {
    warnings.push("Website preview needs index.html before the iframe runtime can start.");
  }

  if (classification.previewType !== "website" && classification.previewType !== "none") {
    warnings.push("CODE preview is a safe static approximation; no code is executed.");
  }

  if (
    executablePreview.framework === "react_vite" ||
    executablePreview.framework === "next_app"
  ) {
    warnings.push(
      `Executable preview detected: ${executablePreview.framework.replace(/_/g, " ")}. Runtime start is blocked until safe enablement.`
    );
  }

  if (mobilePreview.detected) {
    warnings.push(`${mobilePreview.displayName} mobile preview is visual-only; no emulator or native toolchain was started.`);
  }

  return {
    capabilities: [
      ...registryEntry.capabilities,
      "executable_preview_planning",
      ...(mobilePreview.detected ? ["mobile_framework_preview" as const] : [])
    ],
    classification,
    metadata,
    realPreview,
    registryEntry,
    state,
    warnings: [...warnings, ...realPreview.warnings.map((warning) => warning.message)]
  };
}
