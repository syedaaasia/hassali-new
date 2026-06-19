import { normalizePath } from "@/lib/utils/path";

export type HassaliMode = "ASK" | "WEBSITE" | "CODE";

export type PreviewManifest = {
  type: "static_website" | "react_vite_app" | "next_app" | "mobile" | "architecture" | null;
  framework: "static_html" | "react_vite" | "next_app" | "unknown" | null;
  entryPoint: string | null;
  requiredFiles: string[];
};

export type VfsFile = {
  path: string;
  content: string;
  lastModified: number;
};

export const emptyPreviewManifest: PreviewManifest = {
  type: null,
  framework: "unknown",
  entryPoint: null,
  requiredFiles: []
};

export function deriveManifest(committedFiles: Map<string, VfsFile>): PreviewManifest {
  const paths = [...committedFiles.keys()].map(normalizePath).filter(Boolean);
  const pathSet = new Set(paths);

  if (pathSet.has("src/main.tsx") && pathSet.has("vite.config.ts")) {
    return {
      type: "react_vite_app",
      framework: "react_vite",
      entryPoint: "index.html",
      requiredFiles: ["package.json", "vite.config.ts", "index.html", "src/main.tsx", "src/App.tsx"]
    };
  }

  if (pathSet.has("next.config.ts") || pathSet.has("next.config.js")) {
    return {
      type: "next_app",
      framework: "next_app",
      entryPoint: "app/page.tsx",
      requiredFiles: ["package.json", "next.config.ts"]
    };
  }

  if (pathSet.has("index.html") && paths.some((path) => path.endsWith(".css"))) {
    return {
      type: "static_website",
      framework: "static_html",
      entryPoint: "index.html",
      requiredFiles: ["index.html"]
    };
  }

  return emptyPreviewManifest;
}

export function manifestPreviewLabel(manifest: PreviewManifest) {
  if (manifest.type === "static_website") return "Website preview";
  if (manifest.type === "react_vite_app") return "Web app preview";
  if (manifest.type === "next_app") return "Web app preview";

  return "No preview";
}
