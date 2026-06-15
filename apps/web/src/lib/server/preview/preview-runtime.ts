import { classifyPreview } from "@/lib/server/preview/preview-classifier";
import { getPreviewRegistryEntry } from "@/lib/server/preview/preview-registry";
import type {
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
  ]);
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
  const classification = classifyPreview(input);
  const registryEntry = getPreviewRegistryEntry(classification.previewType);
  const metadata = metadataFor(classification.previewType, input);
  const state = stateFor(classification.previewType, metadata, input);
  const warnings: string[] = [];

  if (classification.previewType === "website" && state !== "ready") {
    warnings.push("Website preview needs index.html before the iframe runtime can start.");
  }

  if (classification.previewType !== "website" && classification.previewType !== "none") {
    warnings.push("CODE preview is metadata-only in this phase; no code is executed.");
  }

  return {
    capabilities: registryEntry.capabilities,
    classification,
    metadata,
    registryEntry,
    state,
    warnings
  };
}
