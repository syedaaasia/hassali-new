import { detectMobilePreviewFramework } from "@/lib/server/preview/mobile-preview-registry";
import { withMobileRealPreview } from "@/lib/server/preview/mobile-preview-renderer";
import type {
  MobilePreviewDetectionInput,
  MobilePreviewRuntimeResult
} from "@/lib/server/preview/mobile-preview-types";

function normalizeName(value: string) {
  return value
    .replace(/\\/g, "/")
    .split("/")
    .pop()
    ?.replace(/\.(?:tsx|jsx|ts|js|dart|kt|java|swift|xml)$/i, "")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .trim();
}

function fileText(input: MobilePreviewDetectionInput) {
  return Object.entries(input.files)
    .map(([path, content]) => `${path}\n${content.slice(0, 5000)}`)
    .join("\n")
    .toLowerCase();
}

function pathScreens(input: MobilePreviewDetectionInput) {
  const screens = Object.keys(input.files)
    .filter((path) => /(?:screen|page|view|activity|fragment|route|contentview)/i.test(path))
    .map((path) => normalizeName(path))
    .filter((name): name is string => Boolean(name))
    .slice(0, 6);

  return screens.length > 0 ? screens : ["Home", "Details", "Settings"];
}

function navigationFor(text: string, framework: MobilePreviewRuntimeResult["framework"]) {
  const navigation = [
    ...(text.includes("tab") || text.includes("bottomnavigation") || text.includes("iontabs")
      ? ["Bottom tabs"]
      : []),
    ...(text.includes("stack") || text.includes("navigationstack") || text.includes("navhost")
      ? ["Navigation stack"]
      : []),
    ...(text.includes("drawer") ? ["Drawer navigation"] : []),
    ...(framework === "android_xml" ? ["Activity navigation"] : []),
    ...(framework === "jetpack_compose" ? ["Compose NavHost"] : []),
    ...(framework === "capacitor" || framework === "ionic" ? ["Hybrid shell routes"] : [])
  ];

  return navigation.length > 0 ? navigation : ["Navigation stack", "Settings route"];
}

function featuresFor(text: string, framework: MobilePreviewRuntimeResult["framework"]) {
  const features = [
    ...(text.includes("form") || text.includes("textfield") || text.includes("input")
      ? ["Forms"]
      : []),
    ...(text.includes("list") || text.includes("flatlist") || text.includes("lazycolumn")
      ? ["Lists"]
      : []),
    ...(text.includes("settings") ? ["Settings page"] : []),
    ...(text.includes("auth") || text.includes("login") ? ["Authentication flow"] : []),
    ...(text.includes("camera") || text.includes("capacitor") ? ["Native bridge capability"] : []),
    ...(framework === "flutter" ? ["Material widgets"] : []),
    ...(framework === "swiftui" ? ["SwiftUI views"] : [])
  ];

  return features.length > 0 ? features : ["Home screen", "Detail cards", "Settings page"];
}

function deviceTypeFor(framework: MobilePreviewRuntimeResult["framework"]) {
  if (framework === "swiftui") return "ios_phone" as const;
  if (framework === "android_xml" || framework === "jetpack_compose") return "android_phone" as const;
  if (framework === "capacitor" || framework === "ionic") return "hybrid_phone" as const;

  return "phone" as const;
}

export function buildMobilePreviewRuntime(
  input: MobilePreviewDetectionInput
): MobilePreviewRuntimeResult {
  const match = detectMobilePreviewFramework(input);
  const detected = match.framework !== "unknown";
  const text = fileText(input);
  const metadata = {
    capabilities: match.capabilities,
    confidence: match.confidence,
    detected,
    deviceType: deviceTypeFor(match.framework),
    displayName: match.displayName,
    features: featuresFor(text, match.framework),
    framework: match.framework,
    navigation: navigationFor(text, match.framework),
    previewType: "mobile" as const,
    screens: pathScreens(input),
    warnings: detected
      ? ["Mobile preview is visual-only; no native tooling or emulator is started."]
      : ["No supported mobile framework was detected."]
  };

  return withMobileRealPreview(metadata);
}
