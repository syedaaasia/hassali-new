"use client";

/*
Phase 31 audit before edits:
1. Static WEBSITE iframe srcDoc was built in this file by staticWebsiteSrcDoc(), then rendered directly in PreviewPanel.
2. Preview iframe sandbox attributes were set in this file: static used sandbox="allow-scripts"; runtime iframes used src without a sandbox.
3. Relative static links like about.html/contact.html were not handled; injected srcDoc had no click interception or page state.
4. Clicking About/Contact navigated the iframe to ./about.html on the Hassali/Next origin, so Next.js handled it and returned 404.
5. The Clerk/localStorage sandbox error came from the iframe navigating away from committed srcDoc into the Hassali/Next app surface.
6. Fake preview URLs were traced to runtime metadata: preview-panel displayed runtimePreviewUrl/previewUrl, and dev-server-runtime.ts created planning previewUrl metadata.
7. CODE React/Vite preview selected "Runtime not started" in this file when manifest.type was react_vite_app/next_app and runtimeStatus was not running.
8. The Start button click handler is in this file and calls runtime-store startPreview(projectId), which POSTs /api/runtime restart.
9. WEBSITE cola/soft-drink public copy is generated through domain-site-generator.ts -> website-planner.ts -> website-layout-engine.ts.
10. Abstract labels entered generated HTML from website-section-registry.ts ecommerce profile and website-layout-engine.ts using section titles, visualIntent, and layoutType text.
*/

import { useEffect, useMemo, useState } from "react";
import { Panel } from "@/components/ui/panel";
import { useCanonicalFiles, useCanonicalManifest } from "@/lib/canonical-project-state";
import { useChatStore } from "@/lib/chat-store";
import { useRuntimeStore } from "@/lib/runtime-store";
import { useWorkspaceStore } from "@/lib/workspace-store";
import type { PreviewManifest, VfsFile } from "@/lib/preview-manifest";

type UnifiedPreviewType = "application" | "architecture" | "component" | "dashboard" | "mobile" | "none" | "website";
type RealPreviewFrame = {
  columns?: string[];
  id: string;
  items: string[];
  kind: "api" | "app_shell" | "component" | "dashboard" | "mobile_screen" | "panel" | "table";
  rows?: string[][];
  title: string;
};
type RealPreviewResult = {
  description: string;
  frames: RealPreviewFrame[];
  kind:
    | "api_architecture"
    | "component_mock"
    | "dashboard_mock"
    | "mobile_mock"
    | "static_app_mock"
    | "static_website"
    | "unavailable";
  renderMode: string;
  safeHtml?: string;
  state: "ready" | "unavailable";
  title: string;
  warnings?: Array<{
    code: string;
    message: string;
    severity: "info" | "medium";
  }>;
};
type ExecutablePreviewResult = {
  canExecuteNow: boolean;
  commandPlan?: {
    defaultPort: number | null;
    devCommand: "npm run dev" | null;
    installCommand: null;
    renderMode: string;
    status: string;
  };
  confidence: number;
  devServerRuntime?: {
    canRun: boolean;
    frameworkDisplayName: string;
    plannedCommand: string | null;
    port: number | null;
    previewUrl: string | null;
    runtimeStatus: string;
    startCommand: string | null;
  };
  executablePreviewStatus: string;
  framework: string;
  frameworkMatch?: {
    displayName?: string;
    frameworkId?: string;
  };
  warnings?: string[];
};

function previewLabel(type: UnifiedPreviewType) {
  if (type === "website") return "Website preview";
  if (type === "application" || type === "dashboard") return "Web app preview";
  return type === "none" ? "No preview" : `${type.charAt(0).toUpperCase()}${type.slice(1)} preview`;
}

function metadataArray(metadata: Record<string, unknown> | undefined, key: string) {
  const value = metadata?.[key];

  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").slice(0, 6) : [];
}

function isRealPreviewFrame(value: unknown): value is RealPreviewFrame {
  if (!value || typeof value !== "object") {
    return false;
  }

  const frame = value as RealPreviewFrame;

  return (
    typeof frame.id === "string" &&
    typeof frame.title === "string" &&
    Array.isArray(frame.items) &&
    frame.items.every((item) => typeof item === "string")
  );
}

function realPreviewFrom(value: unknown): RealPreviewResult | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const preview = value as RealPreviewResult;

  if (
    typeof preview.title !== "string" ||
    typeof preview.description !== "string" ||
    !Array.isArray(preview.frames) ||
    !preview.frames.every(isRealPreviewFrame)
  ) {
    return null;
  }

  return preview;
}

function executablePreviewFrom(value: unknown): ExecutablePreviewResult | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const preview = value as ExecutablePreviewResult;

  if (
    typeof preview.framework !== "string" ||
    typeof preview.executablePreviewStatus !== "string" ||
    typeof preview.canExecuteNow !== "boolean"
  ) {
    return null;
  }

  return preview;
}

function normalizePreviewPath(path: string) {
  return path.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^(?:\.\/)+/, "").replace(/^\/+/, "");
}

function normalizePreviewHref(href: string) {
  return href
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\.?\//, "")
    .replace(/\/+$/, "")
    .replace(/\/{2,}/g, "/");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function previewTypeFromManifest(manifest: PreviewManifest): UnifiedPreviewType | null {
  if (manifest.type === "static_website") return "website";
  if (manifest.type === "react_vite_app" || manifest.type === "next_app") return "application";
  if (manifest.type === "mobile") return "mobile";
  if (manifest.type === "architecture") return "architecture";

  return null;
}

function frameworkLabelFromManifest(manifest: PreviewManifest) {
  if (manifest.framework === "static_html") return "Static HTML";
  if (manifest.framework === "react_vite") return "React + Vite";
  if (manifest.framework === "next_app") return "Next.js";
  if (manifest.type !== null) return manifest.framework ?? "Detecting...";

  return "No project";
}

function manifestWithCommittedFallback(manifest: PreviewManifest, committedPaths: string[]): PreviewManifest {
  if (manifest.type !== null) {
    return manifest;
  }

  const paths = new Set(committedPaths);
  const hasViteConfig = paths.has("vite.config.ts") || paths.has("vite.config.js");
  const hasReactEntry = paths.has("src/main.tsx") || paths.has("src/main.jsx");
  const hasNextConfig = paths.has("next.config.ts") || paths.has("next.config.js");

  if (hasViteConfig && hasReactEntry && paths.has("index.html")) {
    return {
      type: "react_vite_app",
      framework: "react_vite",
      entryPoint: "index.html",
      requiredFiles: ["package.json", "vite.config.ts", "index.html", "src/main.tsx", "src/App.tsx"]
    };
  }

  if (hasNextConfig) {
    return {
      type: "next_app",
      framework: "next_app",
      entryPoint: "app/page.tsx",
      requiredFiles: ["package.json", "next.config.ts"]
    };
  }

  if (paths.has("index.html")) {
    return {
      type: "static_website",
      framework: "static_html",
      entryPoint: "index.html",
      requiredFiles: ["index.html"]
    };
  }

  return manifest;
}

function missingPreviewDocument(path: string) {
  return `<!doctype html>
<html>
<body style="font-family:sans-serif;padding:2rem;background:#090909;color:#fff">
  <h2>Missing preview file: ${escapeHtml(path)}</h2>
  <p>This file was not found in committed VFS.</p>
</body>
</html>`;
}

function buildStaticSrcDoc(committedFiles: Map<string, VfsFile>, pagePath: string) {
  const normalizedPage = normalizePreviewHref(pagePath || "index.html") || "index.html";
  const file = committedFiles.get(normalizedPage);

  if (!file) {
    return missingPreviewDocument(normalizedPage);
  }

  const css = committedFiles.get("styles.css")?.content ?? "";
  const js = committedFiles.get("main.js")?.content ?? "";
  const interceptScript = `<script>
document.addEventListener("click", function(event) {
  var target = event.target;
  var anchor = target && target.closest ? target.closest("a[href]") : null;
  if (!anchor) return;
  var href = anchor.getAttribute("href");
  if (!href) return;
  if (
    href.startsWith("http://") ||
    href.startsWith("https://") ||
    href.startsWith("mailto:") ||
    href.startsWith("tel:") ||
    href.startsWith("#")
  ) {
    return;
  }
  event.preventDefault();
  var normalized = href.trim()
    .replace(/\\\\/g, "/")
    .replace(/^\\.?\\//, "")
    .replace(/\\/+$/, "")
    .replace(/\\/{2,}/g, "/");
  window.parent.postMessage({
    type: "HASSALI_STATIC_PREVIEW_NAVIGATE",
    href: normalized
  }, "*");
});
</script>`;
  let srcDoc = file.content;

  if (css) {
    srcDoc = srcDoc.replace(/<link[^>]+rel=["']stylesheet["'][^>]*>/gi, `<style>${css}</style>`);
  }

  if (js) {
    srcDoc = srcDoc.replace(/<script[^>]+src=["'][./]*main\.js["'][^>]*><\/script>/gi, `<script>${js}</script>`);
  }

  return /<\/body>/i.test(srcDoc)
    ? srcDoc.replace(/<\/body>/i, `${interceptScript}</body>`)
    : `${srcDoc}${interceptScript}`;
}

function StaticWebsitePreview({ committedFiles }: { committedFiles: Map<string, VfsFile> }) {
  const [currentPage, setCurrentPage] = useState("index.html");

  useEffect(() => {
    setCurrentPage("index.html");
  }, [committedFiles]);

  useEffect(() => {
    const messageTarget = globalThis as unknown as {
      addEventListener: (type: "message", handler: (event: MessageEvent) => void) => void;
      removeEventListener: (type: "message", handler: (event: MessageEvent) => void) => void;
    };
    const handler = (event: MessageEvent) => {
      if (event.data?.type !== "HASSALI_STATIC_PREVIEW_NAVIGATE") return;

      const target = normalizePreviewHref(String(event.data.href ?? ""));

      if (!target || target === "/") {
        setCurrentPage("index.html");
        return;
      }

      setCurrentPage(target.endsWith(".html") ? target : `${target}.html`);
    };

    messageTarget.addEventListener("message", handler);
    return () => messageTarget.removeEventListener("message", handler);
  }, []);

  return (
    <iframe
      className="h-full min-h-0 w-full rounded-2xl border border-[hsl(var(--premium-border))] bg-white"
      sandbox="allow-scripts allow-forms"
      srcDoc={buildStaticSrcDoc(committedFiles, currentPage)}
      title="Static srcDoc preview"
    />
  );
}

function codeAppName(committedFiles: Map<string, VfsFile>) {
  try {
    const pkg = committedFiles.get("package.json");
    if (pkg) {
      const parsed = JSON.parse(pkg.content) as { name?: unknown };
      if (typeof parsed.name === "string" && parsed.name.trim()) return parsed.name;
    }
  } catch {
    // package.json is user-provided; fall back to a neutral name if it is invalid.
  }

  return "App";
}

function CodeAppSourceSummary({
  committedFiles,
  manifest
}: {
  committedFiles: Map<string, VfsFile>;
  manifest: PreviewManifest;
}) {
  const appName = codeAppName(committedFiles);
  const sourceFiles = [...committedFiles.keys()].filter((path) => /\.(?:tsx|ts|jsx|js)$/.test(path));
  const componentFiles = sourceFiles.filter((path) => path.includes("/components/"));
  const css = committedFiles.get("src/styles.css")?.content ?? committedFiles.get("src/index.css")?.content ?? "";

  if (css) {
    const previewDoc = `<!doctype html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>${css}</style>
</head>
<body>
  <div style="position:fixed;top:0;left:0;right:0;background:rgba(0,0,0,0.85);color:#60efff;font-size:0.72rem;padding:6px 14px;z-index:9999;font-family:monospace;letter-spacing:0.05em">
    CSS preview - ${escapeHtml(appName)} - ${escapeHtml(manifest.framework ?? "React + Vite")} - Runtime not started
  </div>
  <div style="padding-top:34px">
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand">${escapeHtml(appName)}</div>
        <nav class="nav">
          <a class="active" href="#">Dashboard</a>
          <a href="#">Customers</a>
          <a href="#">Pipeline</a>
          <a href="#">Billing</a>
        </nav>
      </aside>
      <main class="content">
        <section class="hero-panel">
          <div>
            <p class="eyebrow">CSS preview only</p>
            <h1>Layout ready. Start runtime for React interactivity.</h1>
            <p class="muted">Source files committed. Vite requires explicit runtime enablement.</p>
          </div>
        </section>
      </main>
    </div>
  </div>
</body>
</html>`;

    return (
      <iframe
        className="h-full min-h-0 w-full rounded-2xl border border-[hsl(var(--premium-border))] bg-white"
        sandbox="allow-scripts"
        srcDoc={previewDoc}
        title="CODE app CSS preview"
      />
    );
  }

  return (
    <div className="h-full overflow-auto rounded-xl border border-[hsl(var(--royal-border-soft))] bg-[hsl(var(--royal-panel)/0.5)] p-8 font-mono text-xs leading-6 text-muted-foreground">
      <p className="text-[#60efff]">
        {appName} - {manifest.framework ?? "React + Vite"}
      </p>
      <p className="mt-2">
        Runtime not started. Source files committed and ready.
      </p>
      <ul className="mt-4 list-inside list-disc">
        {sourceFiles.map((file) => (
          <li key={file}>{file}</li>
        ))}
      </ul>
      <p className="mt-4">
        {componentFiles.length} component(s) detected.
      </p>
    </div>
  );
}

function RealPreviewMock({ preview }: { preview: RealPreviewResult }) {
  const isMobile = preview.kind === "mobile_mock";
  const isArchitecture = preview.kind === "api_architecture";

  return (
    <div className="flex h-full min-h-0 flex-col overflow-auto rounded-xl border border-[hsl(var(--royal-border-soft))] bg-[hsl(var(--royal-panel)/0.55)] p-4 text-xs text-foreground">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            Real preview
          </p>
          <h3 className="mt-1 text-lg font-semibold">{preview.title}</h3>
          <p className="mt-1 max-w-md text-muted-foreground">{preview.description}</p>
        </div>
        <span className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] uppercase text-muted-foreground">
          {preview.kind.replace(/_/g, " ")}
        </span>
      </div>

      {isMobile ? (
        <div className="mx-auto flex w-full max-w-[18rem] flex-1 flex-col rounded-[2rem] border border-white/15 bg-black p-3 shadow-[0_24px_70px_rgba(0,0,0,0.35)]">
          <div className="mx-auto mb-3 h-1.5 w-16 rounded-full bg-white/20" />
          <div className="min-h-[24rem] flex-1 rounded-[1.5rem] border border-white/10 bg-[#11131a] p-4">
            {preview.frames.map((frame) => (
              <section className="mb-4 last:mb-0" key={frame.id}>
                <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  {frame.title}
                </h4>
                <div className="space-y-2">
                  {frame.items.map((item) => (
                    <div className="rounded-2xl border border-white/10 bg-white/[0.045] px-3 py-2" key={`${frame.id}-${item}`}>
                      {item}
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      ) : (
        <div className={`grid gap-3 ${isArchitecture ? "" : "md:grid-cols-2"}`}>
          {preview.frames.map((frame) => (
            <section
              className="rounded-xl border border-white/10 bg-black/20 p-3"
              key={frame.id}
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <h4 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  {frame.title}
                </h4>
                <span className="rounded-full border border-white/10 px-2 py-0.5 text-[9px] uppercase text-muted-foreground">
                  {frame.kind}
                </span>
              </div>
              {frame.rows?.length ? (
                <div className="overflow-hidden rounded-lg border border-white/10">
                  <div className="grid grid-cols-2 bg-white/[0.04] text-muted-foreground">
                    {(frame.columns ?? ["Name", "Status"]).slice(0, 2).map((column) => (
                      <div className="px-2 py-1.5" key={column}>
                        {column}
                      </div>
                    ))}
                  </div>
                  {frame.rows.slice(0, 4).map((row, index) => (
                    <div className="grid grid-cols-2 border-t border-white/10" key={`${frame.id}-row-${index}`}>
                      {row.slice(0, 2).map((cell) => (
                        <div className="px-2 py-1.5" key={cell}>
                          {cell}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {frame.items.map((item) => (
                    <span className="rounded-full border border-white/10 bg-white/[0.035] px-2.5 py-1" key={`${frame.id}-${item}`}>
                      {item}
                    </span>
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}

      {preview.warnings?.length ? (
        <p className="mt-3 rounded-xl border border-amber-300/20 bg-amber-300/10 p-3 text-amber-100">
          {preview.warnings[0]?.message}
        </p>
      ) : null}
    </div>
  );
}

export function PreviewPanel() {
  const canonicalFiles = useCanonicalFiles();
  const canonicalManifest = useCanonicalManifest();
  const productMode = useChatStore((state) => state.productMode);
  const proposal = useChatStore((state) => state.proposal);
  const projectId = useWorkspaceStore((state) => state.projectId);
  const error = useRuntimeStore((state) => state.error);
  const iframeVersion = useRuntimeStore((state) => state.iframeVersion);
  const isLoading = useRuntimeStore((state) => state.isLoading);
  const previewUrl = useRuntimeStore((state) => state.previewUrl);
  const refreshRuntimeStatus = useRuntimeStore((state) => state.refreshRuntimeStatus);
  const runtimeErrors = useRuntimeStore((state) => state.runtimeErrors);
  const runtimeHealth = useRuntimeStore((state) => state.runtimeHealth);
  const runtimeLastUpdatedAt = useRuntimeStore((state) => state.runtimeLastUpdatedAt);
  const runtimeLogs = useRuntimeStore((state) => state.runtimeLogs);
  const runtimePort = useRuntimeStore((state) => state.runtimePort);
  const runtimePreviewUrl = useRuntimeStore((state) => state.runtimePreviewUrl);
  const runtimeStatus = useRuntimeStore((state) => state.runtimeStatus);
  const setPreviewOpen = useRuntimeStore((state) => state.setPreviewOpen);
  const status = useRuntimeStore((state) => state.status);
  const startPreview = useRuntimeStore((state) => state.startPreview);
  const stopPreview = useRuntimeStore((state) => state.stopPreview);
  const syncPreview = useRuntimeStore((state) => state.syncPreview);
  const committedFileMap = useMemo(
    () => new Map(canonicalFiles.map((file) => [normalizePreviewPath(file.path), { ...file, path: normalizePreviewPath(file.path) }])),
    [canonicalFiles]
  );
  const committedPaths = canonicalFiles.map((file) => normalizePreviewPath(file.path));
  const hasIndexHtml = committedPaths.some((path) => path === "index.html");
  const effectiveManifest = manifestWithCommittedFallback(canonicalManifest, committedPaths);
  const unifiedPreviewType = previewTypeFromManifest(effectiveManifest) ?? "none";
  const activePreviewMetadata = effectiveManifest.type === "architecture"
    ? proposal?.livePreviewMetadata ?? proposal?.previewMetadata
    : undefined;
  const realPreview = realPreviewFrom(proposal?.liveRealPreview) ?? realPreviewFrom(proposal?.realPreview);
  const executablePreview = executablePreviewFrom(activePreviewMetadata?.executablePreview);
  const canStartStaticPreview = effectiveManifest.type === "static_website" && hasIndexHtml;
  const isRuntimePreviewType = effectiveManifest.type === "react_vite_app" || effectiveManifest.type === "next_app";
  const livePreviewUrl = effectiveManifest.type === "static_website" ? null : runtimePreviewUrl ?? previewUrl;
  const iframeSource = livePreviewUrl ? `${livePreviewUrl}?v=${iframeVersion}` : null;
  const startDisabledReason = !projectId
    ? "Create or select a project before starting preview."
    : isLoading
      ? "Preview is already updating."
      : isRuntimePreviewType
        ? "Runtime execution requires explicit enablement. Vite cannot start until npm install is approved and runtime is enabled in project settings."
        : canStartStaticPreview
          ? "Static srcDoc preview is already available; no local server is started."
          : !canStartStaticPreview
          ? "Preview needs index.html in the committed project files."
          : null;
  const startButtonLabel = isRuntimePreviewType ? "Enable Runtime" : "Start";
  const panelPreviewLabel = effectiveManifest.type === "static_website" ? "Static srcDoc preview" : previewLabel(unifiedPreviewType);
  const missingManifestFile = effectiveManifest.requiredFiles.find(
    (requiredFile) => !committedPaths.includes(normalizePreviewPath(requiredFile))
  );
  const proposalDocFiles =
    proposal?.changes
      .map((change) => change.path)
      .filter((path): path is string => typeof path === "string" && /\.(?:md|mdx|txt)$/i.test(path))
      .slice(0, 4) ?? [];
  const appPreview = proposal?.appPreview;
  const isCodePreviewContext = productMode === "CODE" || unifiedPreviewType === "application" || unifiedPreviewType === "architecture";
  const structuredPreviewFields =
    unifiedPreviewType === "dashboard"
      ? ["screens", "widgets", "charts", "panels"]
      : unifiedPreviewType === "mobile"
        ? ["screens", "navigation", "flows"]
        : unifiedPreviewType === "component"
          ? ["components", "props", "states"]
          : unifiedPreviewType === "application"
            ? ["routes", "modules", "features"]
            : ["services", "endpoints", "dataFlow"];
  const structuredPreviewItems = structuredPreviewFields
    .map((field) => ({
      field,
      values: metadataArray(activePreviewMetadata, field)
    }))
    .filter((item) => item.values.length > 0);
  const missingPreviewMessage = isCodePreviewContext
    ? `${previewLabel(unifiedPreviewType)} ready. Review the proposal files and metadata. Live iframe preview is available for WEBSITE/static outputs.${
        proposalDocFiles.length ? ` Planning docs: ${proposalDocFiles.join(", ")}.` : ""
      }`
    : "Preview needs index.html. Use WEBSITE mode to create a static website.";

  useEffect(() => {
    if (!projectId) {
      return;
    }

    void refreshRuntimeStatus(projectId);

    const interval = setInterval(() => {
      void refreshRuntimeStatus(projectId);
    }, 2500);

    return () => clearInterval(interval);
  }, [projectId, refreshRuntimeStatus]);

  return (
    <Panel className="fixed bottom-2 right-2 top-[3.5rem] z-30 hidden w-[30rem] max-w-[calc(100vw-1rem)] flex-col rounded-[24px] border border-[hsl(var(--premium-border))] bg-[hsl(var(--premium-panel)/0.82)] shadow-[0_24px_90px_rgba(0,0,0,0.55)] backdrop-blur-xl lg:flex xl:w-[34rem] 2xl:w-[38rem]">
      <div className="flex items-center justify-between gap-3 border-b border-[hsl(var(--premium-border))] px-4 py-3.5">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Preview
          </div>
          <div className="mt-1 text-xs text-foreground">
            {status === "running" && isRuntimePreviewType ? "Local runtime" : panelPreviewLabel}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={`rounded-full border px-2 py-1 text-[10px] uppercase ${
              status === "running"
                ? "border-emerald-400/35 text-emerald-300"
                : status === "error"
                  ? "border-destructive/35 text-destructive"
                  : "border-[hsl(var(--royal-border-soft))] text-muted-foreground"
            }`}
          >
            {isLoading ? "loading" : status}
          </span>
          <button
            className="rounded-full border border-white/10 bg-white/[0.035] px-2.5 py-1 text-[10px] uppercase text-muted-foreground hover:text-foreground"
            onClick={() => setPreviewOpen(false)}
            type="button"
          >
            Close
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 border-b border-[hsl(var(--premium-border))] p-3">
        <button
          className="rounded-full border border-[#7c6cff]/35 bg-[#7c6cff] px-3.5 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          disabled={Boolean(startDisabledReason)}
          onClick={() => {
            void startPreview(projectId);
          }}
          title={startDisabledReason ?? "Start static preview"}
          type="button"
        >
          {startButtonLabel}
        </button>
        <button
          className="rounded-full border border-white/10 px-3.5 py-1.5 text-xs text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          disabled={isLoading || status !== "running"}
          onClick={() => {
            void syncPreview(projectId);
          }}
          type="button"
        >
          Reload
        </button>
        <button
          className="rounded-full border border-white/10 px-3.5 py-1.5 text-xs text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          disabled={isLoading || status === "stopped"}
          onClick={() => {
            void stopPreview();
          }}
          type="button"
        >
          Stop
        </button>
      </div>

      {runtimeLogs.length || runtimeErrors.length || runtimePort || livePreviewUrl ? (
        <div className="border-b border-[hsl(var(--premium-border))] px-4 py-3 text-[11px] leading-5 text-muted-foreground">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-2 py-0.5 uppercase ${
              runtimeStatus === "running"
                ? "border-emerald-400/35 text-emerald-300"
                : runtimeStatus === "error" || runtimeStatus === "blocked"
                  ? "border-red-400/35 text-red-200"
                  : "border-white/10 text-muted-foreground"
            }`}>
              {runtimeStatus}
            </span>
            <span>Framework: {frameworkLabelFromManifest(effectiveManifest)}</span>
            {runtimePort ? <span>Port: {runtimePort}</span> : null}
            {livePreviewUrl ? <span className="truncate">URL: {livePreviewUrl}</span> : null}
          </div>
          {runtimeErrors.at(-1) ? (
            <div className="mt-2 rounded-lg border border-red-400/20 bg-red-400/10 px-2 py-1 text-red-100">
              {runtimeErrors.at(-1)}
            </div>
          ) : null}
          {runtimeLogs.length ? (
            <details className="mt-2">
              <summary className="cursor-pointer text-foreground/80">
                Recent runtime logs
              </summary>
              <pre className="mt-2 max-h-24 overflow-auto whitespace-pre-wrap rounded-lg border border-white/10 bg-black/35 p-2 font-mono text-[10px] leading-4">
                {runtimeLogs.slice(-10).join("\n")}
              </pre>
            </details>
          ) : null}
          <div className="mt-2 text-[10px] text-muted-foreground">
            {runtimeHealth ? `Health: ${runtimeHealth}` : null}
            {runtimeLastUpdatedAt ? `${runtimeHealth ? " · " : ""}Updated: ${runtimeLastUpdatedAt}` : null}
          </div>
        </div>
      ) : null}

      {effectiveManifest.type === "architecture" && executablePreview && executablePreview.framework !== "unknown" ? (
          <div className="border-b border-[hsl(var(--premium-border))] px-4 py-2 text-[11px] leading-5 text-muted-foreground">
          {executablePreview.devServerRuntime ? (
            <>
              Framework: {executablePreview.devServerRuntime.frameworkDisplayName}. Runtime:{" "}
              {executablePreview.devServerRuntime.runtimeStatus.replace(/_/g, " ")}.
              {executablePreview.devServerRuntime.port
                ? ` Port: ${executablePreview.devServerRuntime.port}.`
                : null}
              {executablePreview.devServerRuntime.startCommand
                ? ` Command: ${executablePreview.devServerRuntime.startCommand}.`
                : null}
            </>
          ) : (
            <>
              Framework: {(executablePreview.frameworkMatch?.displayName ?? executablePreview.framework).replace(/_/g, " ")}.
              {executablePreview.canExecuteNow
                ? " Runtime: static, no dev server required."
                : " Runtime start is blocked until safe enablement."}
              {executablePreview.commandPlan?.devCommand
                ? ` Planned command metadata: ${executablePreview.commandPlan.devCommand} on port ${executablePreview.commandPlan.defaultPort}.`
                : null}
            </>
          )}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-hidden bg-black/35 p-2">
        {effectiveManifest.type === "static_website" && hasIndexHtml ? (
          <StaticWebsitePreview committedFiles={committedFileMap} />
        ) : isRuntimePreviewType && runtimeStatus === "running" && iframeSource ? (
          <iframe
            className="h-full min-h-0 w-full rounded-2xl border border-[hsl(var(--premium-border))] bg-white"
            key={iframeSource}
            src={iframeSource}
            title="Hassali local preview"
          />
        ) : isRuntimePreviewType ? (
          <CodeAppSourceSummary committedFiles={committedFileMap} manifest={effectiveManifest} />
        ) : effectiveManifest.type === "architecture" && realPreview?.state === "ready" && realPreview.kind === "api_architecture" ? (
          <RealPreviewMock preview={realPreview} />
        ) : effectiveManifest.type === "mobile" && appPreview && isCodePreviewContext ? (
          <div className="flex h-full min-h-0 flex-col overflow-auto rounded-xl border border-[hsl(var(--royal-border-soft))] bg-[hsl(var(--royal-panel)/0.55)] p-4 text-xs text-foreground">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  CODE app preview
                </p>
                <h3 className="mt-1 text-lg font-semibold">{appPreview.appName}</h3>
                <p className="mt-1 text-muted-foreground">{appPreview.appKind} dashboard concept</p>
              </div>
              <span className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] uppercase text-muted-foreground">
                Mock data
              </span>
            </div>
            <div className="grid min-h-0 gap-3 md:grid-cols-[8rem_1fr]">
              <aside className="rounded-xl border border-white/10 bg-black/25 p-3">
                <p className="mb-2 text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Screens</p>
                <div className="space-y-1.5">
                  {appPreview.screens.map((screen) => (
                    <div className="rounded-full bg-white/[0.04] px-2.5 py-1" key={screen}>
                      {screen}
                    </div>
                  ))}
                </div>
              </aside>
              <section className="space-y-3">
                <div className="grid gap-2 sm:grid-cols-3">
                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <p className="text-muted-foreground">Customers</p>
                    <strong className="mt-2 block text-lg">128</strong>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <p className="text-muted-foreground">Open deals</p>
                    <strong className="mt-2 block text-lg">24</strong>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <p className="text-muted-foreground">Billing</p>
                    <strong className="mt-2 block text-lg">Planned</strong>
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <p className="mb-2 text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Entities</p>
                  <div className="flex flex-wrap gap-2">
                    {appPreview.entities.map((entity) => (
                      <span className="rounded-full border border-white/10 px-2.5 py-1" key={entity}>
                        {entity}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <p className="mb-2 text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Integrations</p>
                  <div className="space-y-1.5">
                    {appPreview.integrations.map((integration) => (
                      <div className="flex items-center justify-between gap-2" key={integration}>
                        <span>{integration}</span>
                        <span className="text-muted-foreground">placeholder</span>
                      </div>
                    ))}
                  </div>
                </div>
                <p className="rounded-xl border border-amber-300/20 bg-amber-300/10 p-3 text-amber-100">
                  {appPreview.mockDataNotice}
                </p>
              </section>
            </div>
          </div>
        ) : effectiveManifest.type === "architecture" && proposal && isCodePreviewContext && unifiedPreviewType !== "none" ? (
          <div className="flex h-full min-h-0 flex-col overflow-auto rounded-xl border border-[hsl(var(--royal-border-soft))] bg-[hsl(var(--royal-panel)/0.55)] p-4 text-xs text-foreground">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  Unified preview
                </p>
                <h3 className="mt-1 text-lg font-semibold">{previewLabel(unifiedPreviewType)}</h3>
                <p className="mt-1 text-muted-foreground">
                  {proposal.previewClassification?.reason ?? "Metadata-only preview is available for this CODE proposal."}
                </p>
              </div>
              <span className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] uppercase text-muted-foreground">
                {proposal.previewRuntimeState ?? "metadata"}
              </span>
            </div>
            {structuredPreviewItems.length ? (
              <div className="space-y-3">
                {structuredPreviewItems.map((item) => (
                  <div className="rounded-xl border border-white/10 bg-black/20 p-3" key={item.field}>
                    <p className="mb-2 text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                      {item.field}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {item.values.map((value) => (
                        <span className="rounded-full border border-white/10 px-2.5 py-1" key={`${item.field}-${value}`}>
                          {value}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-xl border border-white/10 bg-black/20 p-3 text-muted-foreground">
                Preview metadata is empty. Review the proposal files for architecture details.
              </p>
            )}
            {proposal.previewWarnings?.length ? (
              <p className="mt-3 rounded-xl border border-amber-300/20 bg-amber-300/10 p-3 text-amber-100">
                {proposal.previewWarnings[0]}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center rounded-xl border border-[hsl(var(--royal-border-soft))] bg-[hsl(var(--royal-panel)/0.5)] p-6 text-center text-xs leading-5 text-muted-foreground">
            {!projectId
              ? "Create or select a project before starting preview."
              : missingManifestFile
                ? `Missing required file: ${missingManifestFile}`
                : hasIndexHtml || effectiveManifest.type === "react_vite_app" || effectiveManifest.type === "next_app"
                ? "Start preview when you are ready."
                : missingPreviewMessage}
          </div>
        )}
      </div>

      {error ? (
        <div className="border-t border-white/10 px-4 py-3 text-xs leading-5 text-destructive">
          {error}
        </div>
      ) : null}
    </Panel>
  );
}
