import type {
  MobilePreviewCapability,
  MobilePreviewDetectionInput,
  MobilePreviewFramework,
  MobilePreviewMatch
} from "@/lib/server/preview/mobile-preview-types";

type MobileRegistryEntry = {
  capabilities: MobilePreviewCapability[];
  displayName: string;
  framework: MobilePreviewFramework;
  patterns: RegExp[];
  terms: string[];
};

function normalizePath(path: string) {
  return path.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^(?:\.\/)+/, "").replace(/^\/+/, "").toLowerCase();
}

function paths(input: MobilePreviewDetectionInput) {
  return Object.keys(input.files).map(normalizePath);
}

function text(input: MobilePreviewDetectionInput) {
  return Object.entries(input.files)
    .map(([path, content]) => `${path}\n${content.slice(0, 5000)}`)
    .join("\n")
    .toLowerCase();
}

function hasPath(inputPaths: string[], pattern: RegExp) {
  return inputPaths.some((path) => pattern.test(path));
}

function hasMobileAuthority(input: MobilePreviewDetectionInput, framework: MobilePreviewFramework) {
  const inputPaths = paths(input);
  const inputText = text(input);
  const packageJson = Object.entries(input.files)
    .find(([path]) => normalizePath(path).endsWith("package.json"))?.[1]
    ?.toLowerCase() ?? "";

  if (framework === "react_native") {
    return (
      /["']react-native["']/.test(packageJson) ||
      /from\s+["']react-native["']|require\(["']react-native["']\)/.test(inputText) ||
      inputPaths.some((path) => path.startsWith("android/") || path.startsWith("ios/"))
    );
  }

  if (framework === "expo") {
    return (
      /["']expo["']/.test(packageJson) ||
      hasPath(inputPaths, /(^|\/)(?:app\.json|app\.config\.(?:js|ts))$/) ||
      inputText.includes("expo-router")
    );
  }

  if (framework === "flutter") {
    return hasPath(inputPaths, /(^|\/)pubspec\.yaml$/) && hasPath(inputPaths, /(^|\/)lib\/main\.dart$/);
  }

  if (framework === "android_xml" || framework === "jetpack_compose") {
    return inputPaths.some((path) => path.startsWith("android/") || path.includes("androidmanifest.xml") || path.includes("build.gradle"));
  }

  return true;
}

function scoreEntry(entry: MobileRegistryEntry, input: MobilePreviewDetectionInput): MobilePreviewMatch {
  const inputPaths = paths(input);
  const inputText = text(input);
  const fileSignals = entry.patterns
    .filter((pattern) => inputPaths.some((path) => pattern.test(path)))
    .map((pattern) => `file:${pattern.source}`);
  const termSignals = entry.terms
    .filter((term) => inputText.includes(term.toLowerCase()))
    .map((term) => `term:${term}`);
  const confidence = Math.min(0.98, fileSignals.length * 0.24 + termSignals.length * 0.16);

  return {
    capabilities: entry.capabilities,
    confidence,
    displayName: entry.displayName,
    framework: entry.framework,
    signals: [...fileSignals, ...termSignals]
  };
}

const registry: MobileRegistryEntry[] = [
  {
    capabilities: ["phone_frame", "navigation_stack", "bottom_tabs", "screen_hierarchy"],
    displayName: "Expo",
    framework: "expo",
    patterns: [/(^|\/)app\.json$/, /(^|\/)app\/.*\.(?:tsx|jsx)$/, /(^|\/)expo-router\/?/],
    terms: ['"expo"', "expo-router", "registerRootComponent"]
  },
  {
    capabilities: ["phone_frame", "navigation_stack", "bottom_tabs", "screen_hierarchy"],
    displayName: "React Native",
    framework: "react_native",
    patterns: [/(^|\/)app\.(?:tsx|jsx)$/, /(^|\/)index\.(?:js|tsx|jsx)$/],
    terms: ['"react-native"', "react-native", "SafeAreaView", "NavigationContainer"]
  },
  {
    capabilities: ["phone_frame", "material_routes", "navigation_stack", "screen_hierarchy"],
    displayName: "Flutter",
    framework: "flutter",
    patterns: [/(^|\/)pubspec\.yaml$/, /(^|\/)lib\/main\.dart$/, /\.dart$/],
    terms: ["flutter:", "MaterialApp", "Scaffold(", "StatelessWidget", "StatefulWidget"]
  },
  {
    capabilities: ["phone_frame", "composable_tree", "navigation_graph", "screen_hierarchy"],
    displayName: "Jetpack Compose",
    framework: "jetpack_compose",
    patterns: [/\.kt$/, /(^|\/)app\/src\/main\/.*\.kt$/],
    terms: ["@Composable", "androidx.compose", "NavHost(", "Scaffold("]
  },
  {
    capabilities: ["phone_frame", "activity_hierarchy", "navigation_graph", "screen_hierarchy"],
    displayName: "Android XML",
    framework: "android_xml",
    patterns: [
      /(^|\/)androidmanifest\.xml$/,
      /(^|\/)build\.gradle(?:\.kts)?$/,
      /(^|\/)app\/src\/main\/res\/layout\/.*\.xml$/,
      /(^|\/)app\/src\/main\/java\/.*\.(?:kt|java)$/
    ],
    terms: ["android.app", "MainActivity", "<LinearLayout", "<ConstraintLayout"]
  },
  {
    capabilities: ["phone_frame", "swiftui_views", "navigation_stack", "screen_hierarchy"],
    displayName: "SwiftUI",
    framework: "swiftui",
    patterns: [/contentview\.swift$/i, /\.swift$/i],
    terms: ["SwiftUI", "NavigationStack", "struct ContentView", "@State"]
  },
  {
    capabilities: ["phone_frame", "hybrid_container", "bottom_tabs", "screen_hierarchy"],
    displayName: "Ionic",
    framework: "ionic",
    patterns: [/(^|\/)ionic\.config\.(?:json|js)$/, /(^|\/)src\/app\/.*\.(?:tsx|jsx|ts|js)$/],
    terms: ["@ionic/react", "IonApp", "IonPage", "IonTabs"]
  },
  {
    capabilities: ["phone_frame", "hybrid_container", "navigation_stack", "screen_hierarchy"],
    displayName: "Capacitor",
    framework: "capacitor",
    patterns: [/(^|\/)capacitor\.config\.(?:ts|js|json)$/],
    terms: ["@capacitor/core", "Capacitor", "capacitor.config"]
  }
];

export function getMobilePreviewRegistry() {
  return registry;
}

export function detectMobilePreviewFramework(input: MobilePreviewDetectionInput): MobilePreviewMatch {
  const match = registry
    .map((entry) => scoreEntry(entry, input))
    .sort((a, b) => b.confidence - a.confidence)[0];

  if (!match || match.confidence < 0.24 || !hasMobileAuthority(input, match.framework)) {
    return {
      capabilities: [],
      confidence: 0.22,
      displayName: "Unknown mobile framework",
      framework: "unknown",
      signals: []
    };
  }

  return match;
}
