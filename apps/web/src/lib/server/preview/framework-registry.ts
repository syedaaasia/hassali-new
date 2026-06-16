import type {
  FrameworkDetectionInput,
  FrameworkId,
  FrameworkMatch,
  FrameworkPreviewCapability,
  FrameworkRegistryEntry,
  FrameworkRuntimeType
} from "@/lib/server/preview/framework-preview-types";

function normalizePath(path: string) {
  return path.replace(/\\/g, "/").toLowerCase();
}

function files(input: FrameworkDetectionInput) {
  return Object.keys(input.files).map(normalizePath);
}

function text(input: FrameworkDetectionInput) {
  return Object.entries(input.files)
    .map(([path, content]) => `${path}\n${content.slice(0, 5000)}`)
    .join("\n")
    .toLowerCase();
}

function countPatterns(paths: string[], patterns: RegExp[]) {
  return patterns.reduce((score, pattern) => score + (paths.some((path) => pattern.test(path)) ? 1 : 0), 0);
}

function countTerms(value: string, terms: string[]) {
  return terms.reduce((score, term) => score + (value.includes(term.toLowerCase()) ? 1 : 0), 0);
}

function match(
  entry: Omit<FrameworkRegistryEntry, "confidenceScore">,
  input: FrameworkDetectionInput,
  terms: string[] = []
): FrameworkMatch {
  const inputFiles = files(input);
  const inputText = text(input);
  const patternScore = countPatterns(inputFiles, entry.supportedFilePatterns);
  const termScore = countTerms(inputText, terms);
  const rawScore = patternScore * 0.18 + termScore * 0.14;
  const confidence = Math.min(0.98, rawScore);
  const signals = [
    ...entry.supportedFilePatterns
      .filter((pattern) => inputFiles.some((path) => pattern.test(path)))
      .map((pattern) => `file:${pattern.source}`),
    ...terms.filter((term) => inputText.includes(term.toLowerCase())).map((term) => `term:${term}`)
  ];

  return {
    confidence,
    displayName: entry.displayName,
    frameworkId: entry.frameworkId,
    previewCapabilities: entry.previewCapabilities,
    runtimeType: entry.runtimeType,
    signals
  };
}

function entry(config: {
  displayName: string;
  frameworkId: FrameworkId;
  previewCapabilities: FrameworkPreviewCapability[];
  runtimeType: FrameworkRuntimeType;
  supportedFilePatterns: RegExp[];
  terms?: string[];
}): FrameworkRegistryEntry {
  const base = {
    displayName: config.displayName,
    frameworkId: config.frameworkId,
    previewCapabilities: config.previewCapabilities,
    runtimeType: config.runtimeType,
    supportedFilePatterns: config.supportedFilePatterns
  };

  return {
    ...base,
    confidenceScore: (input) => match(base, input, config.terms)
  };
}

const registry: FrameworkRegistryEntry[] = [
  entry({
    displayName: "Next.js",
    frameworkId: "next",
    previewCapabilities: ["route_tree", "layout_tree", "app_shell_mock"],
    runtimeType: "meta_framework",
    supportedFilePatterns: [
      /(^|\/)next\.config\.(?:js|ts|mjs)$/,
      /(^|\/)app\/layout\.(?:tsx|jsx|ts|js)$/,
      /(^|\/)app\/page\.(?:tsx|jsx|ts|js)$/,
      /(^|\/)pages\/index\.(?:tsx|jsx|ts|js)$/
    ],
    terms: ['"next"', "next/navigation", "next/link"]
  }),
  entry({
    displayName: "Remix",
    frameworkId: "remix",
    previewCapabilities: ["nested_routes", "route_tree", "app_shell_mock"],
    runtimeType: "meta_framework",
    supportedFilePatterns: [
      /(^|\/)remix\.config\.(?:js|ts|mjs)$/,
      /(^|\/)app\/routes\/.*\.(?:tsx|jsx|ts|js)$/,
      /(^|\/)app\/root\.(?:tsx|jsx)$/
    ],
    terms: ['"@remix-run/react"', "loader(", "action("]
  }),
  entry({
    displayName: "Nuxt",
    frameworkId: "nuxt",
    previewCapabilities: ["route_tree", "component_tree", "app_shell_mock"],
    runtimeType: "meta_framework",
    supportedFilePatterns: [
      /(^|\/)nuxt\.config\.(?:js|ts|mjs)$/,
      /(^|\/)pages\/.*\.vue$/,
      /(^|\/)app\.vue$/
    ],
    terms: ['"nuxt"', "defineNuxtConfig"]
  }),
  entry({
    displayName: "SvelteKit",
    frameworkId: "sveltekit",
    previewCapabilities: ["route_tree", "component_tree", "app_shell_mock"],
    runtimeType: "meta_framework",
    supportedFilePatterns: [
      /(^|\/)svelte\.config\.(?:js|ts|mjs)$/,
      /(^|\/)src\/routes\/\+page\.svelte$/,
      /(^|\/)src\/routes\/\+layout\.svelte$/
    ],
    terms: ['"@sveltejs/kit"', "sveltekit"]
  }),
  entry({
    displayName: "Astro",
    frameworkId: "astro",
    previewCapabilities: ["site_structure", "component_tree", "layout_tree"],
    runtimeType: "content_site",
    supportedFilePatterns: [
      /(^|\/)astro\.config\.(?:js|ts|mjs)$/,
      /(^|\/)src\/pages\/.*\.astro$/,
      /\.astro$/
    ],
    terms: ['"astro"', "Astro.props"]
  }),
  entry({
    displayName: "Angular",
    frameworkId: "angular",
    previewCapabilities: ["component_tree", "layout_tree", "app_shell_mock"],
    runtimeType: "spa",
    supportedFilePatterns: [
      /(^|\/)angular\.json$/,
      /(^|\/)src\/app\/app\.module\.ts$/,
      /(^|\/)src\/app\/.*\.component\.ts$/
    ],
    terms: ['"@angular/core"', "@Component", "NgModule"]
  }),
  entry({
    displayName: "Vue",
    frameworkId: "vue",
    previewCapabilities: ["component_tree", "app_shell_mock"],
    runtimeType: "spa",
    supportedFilePatterns: [
      /\.vue$/,
      /(^|\/)src\/main\.(?:js|ts)$/,
      /(^|\/)src\/app\.vue$/
    ],
    terms: ['"vue"', "createApp(", "<template>"]
  }),
  entry({
    displayName: "Svelte",
    frameworkId: "svelte",
    previewCapabilities: ["component_tree", "component_inventory"],
    runtimeType: "component",
    supportedFilePatterns: [/\.svelte$/, /(^|\/)src\/app\.svelte$/],
    terms: ['"svelte"', "<script>", "{#if"]
  }),
  entry({
    displayName: "Vite",
    frameworkId: "vite",
    previewCapabilities: ["component_tree", "app_shell_mock"],
    runtimeType: "spa",
    supportedFilePatterns: [
      /(^|\/)vite\.config\.(?:js|ts|mjs)$/,
      /(^|\/)src\/app\.(?:tsx|jsx|vue|svelte)$/
    ],
    terms: ['"vite"', "import.meta.env"]
  }),
  entry({
    displayName: "React",
    frameworkId: "react",
    previewCapabilities: ["dashboard_mock", "component_tree", "app_shell_mock"],
    runtimeType: "spa",
    supportedFilePatterns: [
      /\.(?:tsx|jsx)$/,
      /(^|\/)src\/app\.(?:tsx|jsx)$/,
      /(^|\/)src\/main\.(?:tsx|jsx)$/
    ],
    terms: ['"react"', "useState", "useEffect", "jsx"]
  }),
  entry({
    displayName: "shadcn/ui",
    frameworkId: "shadcn",
    previewCapabilities: ["component_inventory", "dashboard_mock", "style_system"],
    runtimeType: "ui_system",
    supportedFilePatterns: [
      /(^|\/)components\.json$/,
      /(^|\/)components\/ui\/.*\.(?:tsx|jsx)$/,
      /(^|\/)src\/components\/ui\/.*\.(?:tsx|jsx)$/
    ],
    terms: ["@/components/ui/", "class-variance-authority", "radix-ui", "cn("]
  }),
  entry({
    displayName: "Tailwind CSS",
    frameworkId: "tailwind",
    previewCapabilities: ["style_system"],
    runtimeType: "style_system",
    supportedFilePatterns: [
      /(^|\/)tailwind\.config\.(?:js|ts|mjs)$/,
      /(^|\/)postcss\.config\.(?:js|mjs)$/
    ],
    terms: ["tailwindcss", "bg-", "text-", "rounded-", "grid-cols-"]
  }),
  entry({
    displayName: "HTML",
    frameworkId: "html",
    previewCapabilities: ["site_structure"],
    runtimeType: "static",
    supportedFilePatterns: [/(^|\/)index\.html$/, /\.html$/],
    terms: ["<!doctype html", "<html"]
  }),
  entry({
    displayName: "Node API",
    frameworkId: "node_api",
    previewCapabilities: ["route_tree"],
    runtimeType: "server",
    supportedFilePatterns: [
      /(^|\/)(api|routes|server)\/.*\.(?:ts|js)$/,
      /(^|\/)server\.(?:ts|js)$/
    ],
    terms: ["express", "fastify", "app.get(", "router."]
  })
];

export function getFrameworkRegistry() {
  return registry;
}

export function detectFramework(input: FrameworkDetectionInput): FrameworkMatch {
  const matches = registry
    .map((registryEntry) => registryEntry.confidenceScore(input))
    .sort((a, b) => b.confidence - a.confidence);
  const best = matches[0];

  if (!best || best.confidence < 0.18) {
    return {
      confidence: 0.25,
      displayName: "Unknown",
      frameworkId: "unknown",
      previewCapabilities: [],
      runtimeType: "static",
      signals: []
    };
  }

  return best;
}
