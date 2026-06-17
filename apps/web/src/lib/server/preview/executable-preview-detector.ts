import { detectFramework } from "@/lib/server/preview/framework-registry";
import type {
  ExecutablePreviewDetection,
  ExecutablePreviewDetectionInput,
  ExecutablePreviewFramework
} from "@/lib/server/preview/executable-preview-types";

function normalizePath(path: string) {
  return path.replace(/\\/g, "/").toLowerCase();
}

function collectFiles(input: ExecutablePreviewDetectionInput) {
  return {
    ...(input.generatedFiles ?? {}),
    ...(input.proposalFiles ?? {})
  };
}

function fileNames(input: ExecutablePreviewDetectionInput) {
  return Object.keys(collectFiles(input)).map(normalizePath);
}

function allText(input: ExecutablePreviewDetectionInput) {
  return Object.entries(collectFiles(input))
    .map(([path, content]) => `${path}\n${content.slice(0, 3000)}`)
    .join("\n")
    .toLowerCase();
}

function hasFile(files: string[], matcher: RegExp) {
  return files.some((path) => matcher.test(path));
}

function hasText(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

function detection(
  framework: ExecutablePreviewFramework,
  confidence: number,
  signals: string[],
  frameworkMatch?: ExecutablePreviewDetection["frameworkMatch"]
): ExecutablePreviewDetection {
  return {
    confidence,
    framework,
    frameworkMatch,
    signals
  };
}

export function detectExecutablePreviewFramework(
  input: ExecutablePreviewDetectionInput
): ExecutablePreviewDetection {
  const registryMatch = detectFramework({
    files: collectFiles(input)
  });

  if (registryMatch.frameworkId !== "unknown") {
    const collectedFiles = fileNames(input);
    const collectedText = allText(input);

    if (
      registryMatch.frameworkId === "vite" &&
      (hasFile(collectedFiles, /(^|\/)src\/main\.(?:tsx|jsx)$/) ||
        hasFile(collectedFiles, /(^|\/)src\/app\.(?:tsx|jsx)$/) ||
        hasText(collectedText, ['"react"', "'react'", "react-dom/client"]))
    ) {
      return detection("react_vite", Math.max(0.92, registryMatch.confidence), ["registry:vite", "react_source"], registryMatch);
    }

    return detection(
      registryMatch.frameworkId,
      registryMatch.confidence,
      registryMatch.signals,
      registryMatch
    );
  }

  const files = fileNames(input);
  const text = allText(input);
  const hasPackageJson = hasFile(files, /(^|\/)package\.json$/);
  const hasIndexHtml = hasFile(files, /(^|\/)index\.html$/);
  const hasViteConfig = hasFile(files, /(^|\/)vite\.config\.(?:js|ts|mjs)$/);
  const hasNextConfig = hasFile(files, /(^|\/)next\.config\.(?:js|ts|mjs)$/);
  const hasAppPage = hasFile(files, /(^|\/)app\/page\.(?:tsx|jsx|ts|js)$/);
  const hasPagesIndex = hasFile(files, /(^|\/)pages\/index\.(?:tsx|jsx|ts|js)$/);
  const hasSrcApp = hasFile(files, /(^|\/)src\/app\.(?:tsx|jsx)$/);
  const hasTsxOrJsx = hasFile(files, /\.(?:tsx|jsx)$/);
  const hasApiFiles = hasFile(files, /(^|\/)(api|routes|server)\/.*\.(?:ts|js)$/);
  const packageMentionsNext = hasPackageJson && hasText(text, ['"next"', "'next'"]);
  const packageMentionsVite = hasPackageJson && hasText(text, ['"vite"', "'vite'"]);
  const packageMentionsReact = hasPackageJson && hasText(text, ['"react"', "'react'"]);

  if (hasNextConfig || hasAppPage || hasPagesIndex || packageMentionsNext) {
    return detection("next_app", 0.92, [
      ...(hasNextConfig ? ["next_config"] : []),
      ...(hasAppPage ? ["app_page"] : []),
      ...(hasPagesIndex ? ["pages_index"] : []),
      ...(packageMentionsNext ? ["package_next"] : [])
    ]);
  }

  if (hasViteConfig || (hasSrcApp && packageMentionsVite) || (hasIndexHtml && hasSrcApp)) {
    return detection("react_vite", 0.9, [
      ...(hasViteConfig ? ["vite_config"] : []),
      ...(hasSrcApp ? ["src_app"] : []),
      ...(packageMentionsVite ? ["package_vite"] : []),
      ...(hasIndexHtml ? ["index_html"] : [])
    ]);
  }

  if (hasApiFiles || hasText(text, ["express", "fastify", "router.", "app.get(", "app.post("])) {
    return detection("node_api", 0.82, [
      ...(hasApiFiles ? ["api_route_files"] : []),
      ...(hasText(text, ["express", "fastify"]) ? ["server_framework_terms"] : [])
    ]);
  }

  if (hasTsxOrJsx && packageMentionsReact) {
    return detection("react_component", 0.78, ["tsx_jsx", "package_react"]);
  }

  if (hasTsxOrJsx) {
    return detection("react_component", 0.68, ["tsx_jsx"]);
  }

  if (hasIndexHtml) {
    return detection("static_html", 0.86, ["index_html"]);
  }

  return detection("unknown", 0.35, files.length > 0 ? ["unrecognized_files"] : ["no_files"]);
}
