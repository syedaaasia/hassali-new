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

function collectedFiles(input: PreviewRuntimeInput) {
  const normalizeKey = (path: string) => path.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^(?:\.\/)+/, "").replace(/^\/+/, "");

  return {
    ...Object.fromEntries(Object.entries(input.generatedFiles ?? {}).map(([path, content]) => [normalizeKey(path), content])),
    ...Object.fromEntries(
      (input.proposal?.changes ?? [])
        .filter((change) => typeof change.path === "string" && typeof change.proposedContent === "string")
        .map((change) => [normalizeKey(change.path as string), change.proposedContent as string])
    )
  };
}

function normalizedPath(path: string) {
  return path.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^(?:\.\/)+/, "").replace(/^\/+/, "").toLowerCase();
}

function fileEvidence(input: PreviewRuntimeInput) {
  const files = collectedFiles(input);
  const paths = Object.keys(files).map(normalizedPath);
  const text = Object.entries(files)
    .map(([path, content]) => `${path}\n${content.slice(0, 6000)}`)
    .join("\n")
    .toLowerCase();
  const packageJson = Object.entries(files).find(([path]) => normalizedPath(path).endsWith("package.json"))?.[1] ?? "";
  const packageText = packageJson.toLowerCase();
  const has = (pattern: RegExp) => paths.some((path) => pattern.test(path));
  const htmlPages = paths.filter((path) => path.endsWith(".html"));
  const hasPackageJson = has(/(^|\/)package\.json$/);
  const hasIndexHtml = has(/(^|\/)index\.html$/);
  const hasStylesCss = has(/(^|\/)styles\.css$/) || has(/(^|\/)src\/styles\.css$/);
  const hasViteConfig = has(/(^|\/)vite\.config\.(?:js|ts|mjs)$/);
  const hasNextConfig = has(/(^|\/)next\.config\.(?:js|ts|mjs)$/);
  const hasSrcMain = has(/(^|\/)src\/main\.(?:tsx|jsx|ts|js)$/);
  const hasSrcApp = has(/(^|\/)src\/app\.(?:tsx|jsx|ts|js)$/);
  const hasNextPage = has(/(^|\/)(?:app\/page|pages\/index)\.(?:tsx|jsx|ts|js)$/);
  const hasBackendFiles = has(/(^|\/)(?:api|routes|server)\/.*\.(?:ts|js|py|go)$/) || has(/(^|\/)server\.(?:ts|js|py)$/);
  const hasOnlyDocs = paths.length > 0 && paths.every((path) => /\.(?:md|mdx|txt)$/i.test(path));
  const hasNativeFolder = paths.some((path) => path.startsWith("android/") || path.startsWith("ios/"));
  const hasExpoConfig = has(/(^|\/)(?:app\.json|app\.config\.(?:js|ts))$/);
  const hasReactNativeDependency = /["']react-native["']/.test(packageText);
  const hasExpoDependency = /["']expo["']/.test(packageText);
  const importsReactNative = /from\s+["']react-native["']|require\(["']react-native["']\)/.test(text);
  const hasFlutter = has(/(^|\/)pubspec\.yaml$/) && has(/(^|\/)lib\/main\.dart$/);

  return {
    hasBackendFiles,
    hasFlutter,
    hasIndexHtml,
    hasNextConfig,
    hasNextPage,
    hasOnlyDocs,
    hasPackageJson,
    hasReactNativeEvidence: hasReactNativeDependency || importsReactNative || hasNativeFolder || hasExpoConfig || hasExpoDependency,
    hasSrcApp,
    hasSrcMain,
    hasStaticWebsite: hasIndexHtml && hasStylesCss && !hasViteConfig && !hasNextConfig && !hasSrcMain && !hasSrcApp,
    hasStylesCss,
    hasTrueMobileEvidence: hasFlutter || hasReactNativeDependency || importsReactNative || hasNativeFolder || hasExpoConfig || hasExpoDependency,
    hasViteConfig,
    htmlPages,
    packageMentionsNext: /["']next["']/.test(packageText),
    packageMentionsReact: /["']react["']/.test(packageText),
    packageMentionsVite: /["']vite["']/.test(packageText),
    paths,
    text
  };
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

  const evidence = fileEvidence(input);

  if (
    evidence.hasNextConfig ||
    evidence.hasNextPage ||
    (evidence.hasPackageJson && evidence.packageMentionsNext && evidence.hasNextPage)
  ) {
    return classification("application", 0.96, "Next.js app files were detected from generated file evidence.", ["next_file_evidence"]);
  }

  if (
    evidence.hasViteConfig &&
    evidence.hasIndexHtml &&
    evidence.hasSrcMain &&
    (evidence.hasSrcApp || evidence.packageMentionsReact)
  ) {
    return classification(
      includesAny(evidence.text, ["crm", "dashboard", "billing", "pipeline", "customer table"]) ? "dashboard" : "application",
      0.97,
      "React/Vite app files were detected from generated file evidence.",
      ["vite_config", "src_main", "index_html"]
    );
  }

  if (evidence.hasStaticWebsite || (input.productMode === "WEBSITE" && evidence.hasIndexHtml)) {
    return classification("website", 0.97, "Static website files were detected from generated file evidence.", ["static_html", "styles_css"]);
  }

  if (input.productMode === "CODE" && evidence.hasTrueMobileEvidence) {
    return classification("mobile", 0.94, "Mobile framework evidence was detected from package/native files.", ["mobile_file_evidence"]);
  }

  if (input.productMode === "CODE" && evidence.hasBackendFiles && !evidence.hasIndexHtml && !evidence.hasSrcMain) {
    return classification("architecture", 0.9, "Backend/API files were detected without a frontend preview surface.", ["backend_file_evidence"]);
  }

  if (input.productMode === "CODE" && evidence.hasOnlyDocs) {
    return classification("architecture", 0.88, "Only planning/architecture documents were detected.", ["docs_only"]);
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
