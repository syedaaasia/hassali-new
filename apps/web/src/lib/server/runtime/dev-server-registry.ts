import type {
  DevServerDetectionInput,
  DevServerFramework,
  DevServerRegistryEntry
} from "@/lib/server/runtime/dev-server-runtime-types";

function normalizePath(path: string) {
  return path.replace(/\\/g, "/").toLowerCase();
}

function collectFiles(input: DevServerDetectionInput) {
  return {
    ...(input.generatedFiles ?? {}),
    ...(input.proposalFiles ?? {})
  };
}

function filePaths(input: DevServerDetectionInput) {
  return Object.keys(collectFiles(input)).map(normalizePath);
}

function allText(input: DevServerDetectionInput) {
  return Object.entries(collectFiles(input))
    .map(([path, content]) => `${path}\n${content.slice(0, 5000)}`)
    .join("\n")
    .toLowerCase();
}

const registry: DevServerRegistryEntry[] = [
  {
    displayName: "Next.js",
    framework: "next_app",
    patterns: [
      /(^|\/)next\.config\.(?:js|ts|mjs)$/,
      /(^|\/)app\/page\.(?:tsx|jsx|ts|js)$/,
      /(^|\/)pages\/index\.(?:tsx|jsx|ts|js)$/
    ],
    port: 3000,
    startCommand: "npm run dev",
    terms: ['"next"', "next/navigation", "next/link"]
  },
  {
    displayName: "React Vite",
    framework: "react_vite",
    patterns: [
      /(^|\/)vite\.config\.(?:js|ts|mjs)$/,
      /(^|\/)src\/app\.(?:tsx|jsx)$/,
      /(^|\/)src\/main\.(?:tsx|jsx)$/
    ],
    port: 5173,
    startCommand: "npm run dev",
    terms: ['"vite"', '"@vitejs/plugin-react"', "import.meta.env", '"react"']
  },
  {
    displayName: "Static HTML",
    framework: "static_html",
    patterns: [/(^|\/)index\.html$/],
    port: null,
    startCommand: "serve index.html",
    terms: ["<!doctype html", "<html"]
  }
];

export function getDevServerRegistry() {
  return registry;
}

export function frameworkDisplayName(framework: DevServerFramework) {
  const entry = registry.find((item) => item.framework === framework);

  return entry?.displayName ?? "Unsupported runtime";
}

export function registryEntryFor(framework: DevServerFramework) {
  return registry.find((entry) => entry.framework === framework) ?? null;
}

export function scoreDevServerEntry(
  entry: DevServerRegistryEntry,
  input: DevServerDetectionInput
) {
  const paths = filePaths(input);
  const text = allText(input);
  const fileSignals = entry.patterns
    .filter((pattern) => paths.some((path) => pattern.test(path)))
    .map((pattern) => `file:${pattern.source}`);
  const termSignals = entry.terms
    .filter((term) => text.includes(term.toLowerCase()))
    .map((term) => `term:${term}`);

  return {
    confidence: Math.min(0.98, fileSignals.length * 0.24 + termSignals.length * 0.12),
    framework: entry.framework,
    signals: [...fileSignals, ...termSignals]
  };
}
