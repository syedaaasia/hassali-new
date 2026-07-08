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
  if (manifest.type === "react_vite_app" || manifest.type === "next_app" || manifest.type === "python_app") return "application";
  if (manifest.type === "mobile") return "mobile";
  if (manifest.type === "architecture") return "architecture";

  return null;
}

function frameworkLabelFromManifest(manifest: PreviewManifest) {
  if (manifest.framework === "static_html") return "Static HTML";
  if (manifest.framework === "react_vite") return "React + Vite";
  if (manifest.framework === "next_app") return "Next.js";
  if (manifest.framework === "python_streamlit") return "Python / Streamlit";
  if (manifest.type !== null) return manifest.framework ?? "Detecting...";

  return "No project";
}

function manifestFromApprovedMetadata(metadata: Record<string, unknown> | undefined): PreviewManifest | null {
  const previewType = typeof metadata?.previewType === "string" ? metadata.previewType : "";
  const framework = typeof metadata?.framework === "string" ? metadata.framework : "";
  const entryPoint = typeof metadata?.entryPoint === "string" ? metadata.entryPoint : null;

  if (previewType === "static_website") {
    return {
      type: "static_website",
      framework: "static_html",
      entryPoint: entryPoint ?? "index.html",
      requiredFiles: ["index.html"]
    };
  }

  if (previewType === "python_app_preview" || framework === "python_streamlit") {
    return {
      type: "python_app",
      framework: "python_streamlit",
      entryPoint: entryPoint ?? "app.py",
      requiredFiles: ["app.py", "requirements.txt"]
    };
  }

  if (previewType === "code_app_preview" && framework === "react_vite") {
    return {
      type: "react_vite_app",
      framework: "react_vite",
      entryPoint: entryPoint ?? "src/main.tsx",
      requiredFiles: ["package.json", "vite.config.ts", "index.html", "src/main.tsx", "src/App.tsx"]
    };
  }

  return null;
}

function manifestWithCommittedFallback(
  manifest: PreviewManifest,
  committedFiles: Map<string, VfsFile>,
  productMode: "ASK" | "CODE" | "WEBSITE",
  approvedPreviewMetadata: Record<string, unknown> | undefined
): PreviewManifest {
  const approvedManifest = manifestFromApprovedMetadata(approvedPreviewMetadata);

  if (approvedManifest) return approvedManifest;

  const paths = new Set([...committedFiles.keys()]);
  const pythonManifest = paths.has("app.py") && paths.has("requirements.txt")
    ? {
        type: "python_app" as const,
        framework: "python_streamlit" as const,
        entryPoint: "app.py",
        requiredFiles: ["app.py", "requirements.txt"]
      }
    : null;
  const hasViteConfig = paths.has("vite.config.ts") || paths.has("vite.config.js");
  const hasReactEntry = paths.has("src/main.tsx") || paths.has("src/main.jsx");
  const hasNextConfig = paths.has("next.config.ts") || paths.has("next.config.js");

  if (productMode === "WEBSITE" && paths.has("index.html")) {
    return {
      type: "static_website",
      framework: "static_html",
      entryPoint: "index.html",
      requiredFiles: ["index.html"]
    };
  }

  if (productMode === "CODE" && pythonManifest) {
    return pythonManifest;
  }

  if (manifest.type !== null) {
    return manifest;
  }

  if (productMode === "CODE" && hasViteConfig && hasReactEntry && paths.has("index.html")) {
    return {
      type: "react_vite_app",
      framework: "react_vite",
      entryPoint: "index.html",
      requiredFiles: ["package.json", "vite.config.ts", "index.html", "src/main.tsx", "src/App.tsx"]
    };
  }

  if (productMode === "CODE" && hasNextConfig) {
    return {
      type: "next_app",
      framework: "next_app",
      entryPoint: "app/page.tsx",
      requiredFiles: ["package.json", "next.config.ts"]
    };
  }

  if (pythonManifest) {
    return pythonManifest;
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

type ReactProductPreviewBlueprint = {
  appName: string;
  copyLines: string[];
  disclaimer: string;
  domain: string;
  excitementGate?: string;
  jobToBeDone: string;
  metricLabels: string[];
  records: Array<{
    amount: number;
    category: string;
    note: string;
    owner: string;
    status: string;
    title: string;
  }>;
  sections: string[];
  screens?: Array<{
    actions?: string[];
    domainVocabulary?: string[];
    emptyState?: string;
    fields?: string[];
    label: string;
    layoutKind: string;
    metrics?: string[];
    primaryEntity?: string;
    purpose?: string;
    screenId?: string;
    statusOptions?: string[];
  }>;
  targetUser: string;
  workflowMap: string[];
};

function extractReactProductBlueprint(committedFiles: Map<string, VfsFile>): ReactProductPreviewBlueprint | null {
  const appSource = committedFiles.get("src/App.tsx")?.content ?? committedFiles.get("src/App.jsx")?.content ?? "";
  const match = appSource.match(/const blueprint = ([\s\S]*?);\s+type DemoRecord/);

  if (!match?.[1]) return null;

  try {
    const parsed = JSON.parse(match[1]) as Partial<ReactProductPreviewBlueprint>;

    if (
      typeof parsed.appName === "string" &&
      Array.isArray(parsed.sections) &&
      Array.isArray(parsed.metricLabels) &&
      Array.isArray(parsed.records)
    ) {
      return {
        appName: parsed.appName,
        copyLines: Array.isArray(parsed.copyLines) ? parsed.copyLines.filter((item): item is string => typeof item === "string") : [],
        disclaimer: typeof parsed.disclaimer === "string" ? parsed.disclaimer : "Static product preview. Live runtime requires explicit enablement.",
        domain: typeof parsed.domain === "string" ? parsed.domain : "React app",
        excitementGate: typeof parsed.excitementGate === "string" ? parsed.excitementGate : undefined,
        jobToBeDone: typeof parsed.jobToBeDone === "string" ? parsed.jobToBeDone : "",
        metricLabels: parsed.metricLabels.filter((item): item is string => typeof item === "string"),
        records: parsed.records.filter((record): record is ReactProductPreviewBlueprint["records"][number] =>
          Boolean(record) &&
          typeof record === "object" &&
          typeof record.title === "string" &&
          typeof record.owner === "string" &&
          typeof record.status === "string"
        ),
        sections: parsed.sections.filter((item): item is string => typeof item === "string"),
        screens: Array.isArray(parsed.screens)
          ? parsed.screens
            .filter((screen): screen is NonNullable<ReactProductPreviewBlueprint["screens"]>[number] =>
              Boolean(screen) &&
              typeof screen === "object" &&
              typeof screen.label === "string" &&
              typeof screen.layoutKind === "string"
            )
            .map((screen) => ({
              actions: Array.isArray(screen.actions) ? screen.actions.filter((item): item is string => typeof item === "string") : [],
              domainVocabulary: Array.isArray(screen.domainVocabulary) ? screen.domainVocabulary.filter((item): item is string => typeof item === "string") : [],
              emptyState: typeof screen.emptyState === "string" ? screen.emptyState : "No records match this screen.",
              fields: Array.isArray(screen.fields) ? screen.fields.filter((item): item is string => typeof item === "string") : [],
              label: screen.label,
              layoutKind: screen.layoutKind,
              metrics: Array.isArray(screen.metrics) ? screen.metrics.filter((item): item is string => typeof item === "string") : [],
              primaryEntity: typeof screen.primaryEntity === "string" ? screen.primaryEntity : "",
              purpose: typeof screen.purpose === "string" ? screen.purpose : "",
              screenId: typeof screen.screenId === "string" ? screen.screenId : screen.label.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
              statusOptions: Array.isArray(screen.statusOptions) ? screen.statusOptions.filter((item): item is string => typeof item === "string") : []
            }))
          : undefined,
        targetUser: typeof parsed.targetUser === "string" ? parsed.targetUser : "",
        workflowMap: Array.isArray(parsed.workflowMap) ? parsed.workflowMap.filter((item): item is string => typeof item === "string") : []
      };
    }
  } catch {
    return null;
  }

  return null;
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency"
  }).format(Number.isFinite(value) ? value : 0);
}

function scriptJson(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

function buildReactProductPreviewDoc(
  blueprint: ReactProductPreviewBlueprint,
  css: string,
  framework: string | null
) {
  const screens = blueprint.screens?.length
    ? blueprint.screens
    : blueprint.sections.map((section, index) => ({
      actions: blueprint.workflowMap.slice(0, 4),
      domainVocabulary: [blueprint.domain],
      emptyState: "No records match this screen.",
      fields: ["Title", "Owner", "Amount", "Status"],
      label: section,
      layoutKind: index === 0 ? "dashboard_overview" : index === 1 ? "records_table" : index === 2 ? "kanban_status_board" : "people_roster",
      metrics: blueprint.metricLabels,
      primaryEntity: "record",
      purpose: `${section} workspace for ${blueprint.appName}.`,
      screenId: section.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      statusOptions: []
    }));
  const records = blueprint.records.slice(0, 4);
  const total = blueprint.records.reduce((sum, record) => sum + Number(record.amount || 0), 0);
  const pending = blueprint.records.filter((record) => /pending|overdue|unpaid|watch|review/i.test(record.status));
  const top = [...blueprint.records].sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0))[0];
  const metrics = [
    {
      detail: "mock local total",
      label: blueprint.metricLabels[0] ?? "Total",
      value: money(total)
    },
    {
      detail: `${pending.length} needs action`,
      label: blueprint.metricLabels[1] ?? "Needs action",
      value: money(pending.reduce((sum, record) => sum + Number(record.amount || 0), 0))
    },
    {
      detail: top?.title ?? "No records yet",
      label: blueprint.metricLabels[2] ?? "Top record",
      value: top?.owner ?? "None"
    },
    {
      detail: "static product preview",
      label: blueprint.metricLabels[3] ?? "Tracked",
      value: String(blueprint.records.length)
    }
  ];
  const sectionButtons = screens.map((screen, index) =>
    `<button class="tab ${index === 0 ? "active" : ""}" data-section="${escapeHtml(screen.label)}" type="button">${escapeHtml(screen.label)}</button>`
  ).join("");
  const metricCards = metrics.map((metric) => `
    <article class="metric-card">
      <span>${escapeHtml(metric.label)}</span>
      <strong>${escapeHtml(metric.value)}</strong>
      <small>${escapeHtml(metric.detail)}</small>
    </article>
  `).join("");
  const recordCards = records.map((record) => `
    <article class="record-card">
      <div class="record-topline">
        <span class="status-chip">${escapeHtml(record.status)}</span>
        <strong>${escapeHtml(money(record.amount))}</strong>
      </div>
      <h4>${escapeHtml(record.title)}</h4>
      <p>${escapeHtml(record.owner)} - ${escapeHtml(record.category)}</p>
      <small>${escapeHtml(record.note)}</small>
    </article>
  `).join("");
  const workflows = blueprint.workflowMap.slice(0, 7).map((item) => `<span>${escapeHtml(item)}</span>`).join("");
  const statusOptions = Array.from(new Set([
    ...blueprint.records.map((record) => record.status),
    "pending",
    "paid",
    "completed",
    "watch",
    "review"
  ].filter(Boolean))).slice(0, 8);
  const statusOptionHtml = statusOptions.map((status) => `<option value="${escapeHtml(status)}">${escapeHtml(status)}</option>`).join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>${css}</style>
  <style>
    body { margin: 0; }
    .hassali-preview-banner {
      position: fixed; inset: 0 0 auto 0; z-index: 9999;
      background: rgba(0,0,0,0.88); color: #d8fff7;
      font: 700 11px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
      letter-spacing: .06em; padding: 7px 14px; text-transform: uppercase;
    }
    .app-shell { padding-top: 38px; }
    .preview-static-note { margin-top: .75rem; color: inherit; opacity: .78; }
    .preview-control-row { display: flex; flex-wrap: wrap; gap: .55rem; align-items: center; }
    .preview-control-row select { min-width: 10rem; }
    .preview-live-note { margin-top: .85rem; border: 1px solid rgba(255,255,255,.16); border-radius: 16px; padding: .75rem .9rem; background: rgba(255,255,255,.08); }
    .screen-preview { display: block; }
    .screen-overview, .revenue-layout { display: grid; gap: 1rem; grid-template-columns: minmax(0,1fr) minmax(18rem,.9fr); }
    .overview-copy, .docs-summary, .revenue-total { border-radius: 22px; padding: 1rem; background: rgba(255,255,255,.72); }
    .mini-metric-grid, .people-roster, .package-grid, .issue-list, .schedule-list, .payment-list { display: grid; gap: .8rem; grid-template-columns: repeat(2,minmax(0,1fr)); }
    .mini-metric, .person-card, .package-card, .issue-card, .schedule-row, .kanban-column, .payment-list p { border-radius: 20px; padding: .9rem; background: rgba(255,255,255,.72); }
    .data-table-wrap { overflow-x: auto; }
    .data-table { border-collapse: collapse; min-width: 42rem; width: 100%; }
    .data-table th, .data-table td { border-bottom: 1px solid rgba(0,0,0,.08); padding: .75rem; text-align: left; }
    .kanban-board { display: grid; gap: .8rem; grid-template-columns: repeat(4,minmax(0,1fr)); }
    .kanban-card { border-radius: 15px; padding: .7rem; background: rgba(0,0,0,.05); display: grid; gap: .2rem; }
    .person-card { align-items: flex-start; display: flex; gap: .8rem; }
    .avatar { align-items: center; border-radius: 16px; background: rgba(0,0,0,.82); color: white; display: grid; flex: 0 0 2.8rem; font-weight: 900; height: 2.8rem; place-items: center; }
    .revenue-total { color: inherit; font-size: 1.8rem; font-weight: 900; }
    .revenue-total span { display: block; font-size: .85rem; font-weight: 700; opacity: .75; }
    @media (max-width: 760px) { .screen-overview, .revenue-layout, .mini-metric-grid, .people-roster, .package-grid, .issue-list, .schedule-list, .payment-list, .kanban-board { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <div class="hassali-preview-banner">
    Interactive product preview - ${escapeHtml(blueprint.appName)} - ${escapeHtml(framework ?? "react_vite")} source generated - runtime not started
  </div>
  <main class="app-shell">
    <aside class="sidebar">
      <div class="brand-mark">${escapeHtml(blueprint.appName.slice(0, 2))}</div>
      <div>
        <p class="eyebrow">${escapeHtml(blueprint.domain)}</p>
        <h1>${escapeHtml(blueprint.appName)}</h1>
        <p>${escapeHtml(blueprint.targetUser)}</p>
      </div>
      <nav class="tab-list" aria-label="${escapeHtml(blueprint.appName)} sections">${sectionButtons}</nav>
    </aside>
    <section class="workspace">
      <header class="hero">
        <div>
          <p class="eyebrow" id="active-section-label">Interactive static preview</p>
          <h2>${escapeHtml(blueprint.copyLines[0] ?? blueprint.appName)}</h2>
          <p>${escapeHtml(blueprint.jobToBeDone)}</p>
          <p class="preview-static-note">This is an interactive static preview generated from the product blueprint. Hassali did not install packages or start Vite.</p>
        </div>
        <div class="hero-card">
          <strong>First 10 seconds</strong>
          <span>${escapeHtml(blueprint.excitementGate ?? blueprint.copyLines[1] ?? blueprint.disclaimer)}</span>
        </div>
      </header>
      <section class="metrics" aria-label="Dashboard metrics" id="preview-metrics">${metricCards}</section>
      <section class="control-grid">
        <article class="panel form-panel">
          <div class="panel-heading">
            <p class="eyebrow">Action preview</p>
            <h3>${escapeHtml(blueprint.workflowMap[0] ?? "Add local record")}</h3>
          </div>
          <div class="form-grid">
            <label>Title<input id="preview-title" value="${escapeHtml(records[0]?.title ?? "")}" /></label>
            <label>Owner / client<input id="preview-owner" value="${escapeHtml(records[0]?.owner ?? "")}" /></label>
            <label>Amount<input id="preview-amount" type="number" value="${escapeHtml(String(records[0]?.amount ?? ""))}" /></label>
            <label>Status<select id="preview-status">${statusOptionHtml}</select></label>
            <label class="wide-field">Note<textarea id="preview-note">${escapeHtml(records[0]?.note ?? "")}</textarea></label>
          </div>
          <div class="actions preview-control-row">
            <button id="preview-add" type="button">${escapeHtml(blueprint.workflowMap[0] ?? "Add record")}</button>
            <button class="secondary" id="preview-reset" type="button">Reset demo data</button>
          </div>
        </article>
        <article class="panel">
          <div class="panel-heading">
            <p class="eyebrow">Workflow map</p>
            <h3>What users can actually do</h3>
          </div>
          <div class="workflow-list">${workflows}</div>
          <p class="disclaimer">${escapeHtml(blueprint.disclaimer)}</p>
        </article>
      </section>
      <section class="panel">
        <div class="panel-heading split">
          <div>
            <p class="eyebrow" id="record-section-label">${escapeHtml(screens[0]?.label ?? "Dashboard")}</p>
            <h3>Realistic local demo records</h3>
          </div>
          <div class="preview-control-row">
            <select id="preview-filter">
              <option value="all">All statuses</option>
              ${statusOptionHtml}
            </select>
          </div>
        </div>
        <div class="record-grid" id="preview-records">${recordCards}</div>
        <div class="empty-state" id="preview-empty" hidden>
          <strong>No records match this filter.</strong>
          <p>Add a local preview record or reset demo data.</p>
        </div>
      </section>
    </section>
  </main>
  <script>
    (function () {
      var blueprint = ${scriptJson(blueprint)};
      blueprint.screens = ${scriptJson(screens)};
      var records = [];
      var activeSection = (blueprint.screens[0] && blueprint.screens[0].label) || "Dashboard";
      var storageKey = "hassali-interactive-preview:" + (blueprint.appName || "app").toLowerCase().replace(/[^a-z0-9]+/g, "-");

      function cloneDemoRecords() {
        return (blueprint.records || []).map(function (record) {
          return {
            amount: Number(record.amount || 0),
            category: String(record.category || "General"),
            note: String(record.note || ""),
            owner: String(record.owner || ""),
            status: String(record.status || "pending"),
            title: String(record.title || "Untitled")
          };
        });
      }

      function loadRecords() {
        try {
          var raw = window.localStorage.getItem(storageKey);
          records = raw ? JSON.parse(raw) : cloneDemoRecords();
        } catch (error) {
          records = cloneDemoRecords();
        }
      }

      function saveRecords() {
        try {
          window.localStorage.setItem(storageKey, JSON.stringify(records));
        } catch (error) {
          // Preview stays interactive even if browser storage is blocked.
        }
      }

      function money(value) {
        return new Intl.NumberFormat("en-US", { currency: "USD", maximumFractionDigits: 0, style: "currency" }).format(Number(value || 0));
      }

      function setText(element, value) {
        if (element) element.textContent = value;
      }

      function create(tag, className, text) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        if (typeof text === "string") node.textContent = text;
        return node;
      }

      function activeScreen() {
        return (blueprint.screens || []).find(function (screen) { return screen.label === activeSection; }) || (blueprint.screens || [])[0] || {
          actions: blueprint.workflowMap || [],
          domainVocabulary: [blueprint.domain || "local app"],
          emptyState: "No records match this screen.",
          fields: ["Title", "Owner", "Amount", "Status"],
          label: activeSection,
          layoutKind: "records_table",
          metrics: blueprint.metricLabels || [],
          primaryEntity: "record",
          purpose: activeSection + " workspace"
        };
      }

      function renderMetrics() {
        var root = document.getElementById("preview-metrics");
        if (!root) return;
        root.textContent = "";
        var total = records.reduce(function (sum, record) { return sum + Number(record.amount || 0); }, 0);
        var pending = records.filter(function (record) { return /pending|overdue|unpaid|watch|review/i.test(record.status); });
        var top = records.slice().sort(function (a, b) { return Number(b.amount || 0) - Number(a.amount || 0); })[0];
        var metrics = [
          { label: blueprint.metricLabels[0] || "Total", value: money(total), detail: "preview local total" },
          { label: blueprint.metricLabels[1] || "Needs action", value: money(pending.reduce(function (sum, record) { return sum + Number(record.amount || 0); }, 0)), detail: pending.length + " needs action" },
          { label: blueprint.metricLabels[2] || "Top record", value: top ? top.owner : "None", detail: top ? top.title : "No records yet" },
          { label: blueprint.metricLabels[3] || "Tracked", value: String(records.length), detail: "interactive preview records" }
        ];
        metrics.forEach(function (metric) {
          var card = create("article", "metric-card");
          card.appendChild(create("span", "", metric.label));
          card.appendChild(create("strong", "", metric.value));
          card.appendChild(create("small", "", metric.detail));
          root.appendChild(card);
        });
      }

      function renderRecords() {
        var root = document.getElementById("preview-records");
        var empty = document.getElementById("preview-empty");
        if (!root) return;
        var filter = document.getElementById("preview-filter");
        var value = filter ? filter.value : "all";
        var visible = value === "all" ? records : records.filter(function (record) { return record.status === value; });
        var screen = activeScreen();
        root.textContent = "";
        root.className = "screen-preview layout-" + String(screen.layoutKind || "records_table").replace(/[^a-z0-9_-]+/g, "-");
        if (empty) empty.hidden = visible.length > 0;
        if (!visible.length) {
          var detail = empty ? empty.querySelector("p") : null;
          if (detail) detail.textContent = screen.emptyState || "No records match this screen.";
          return;
        }
        if (screen.layoutKind === "dashboard_overview") {
          var overview = create("div", "screen-overview");
          var copy = create("div", "overview-copy");
          copy.appendChild(create("p", "eyebrow", screen.primaryEntity || "overview"));
          copy.appendChild(create("h3", "", screen.purpose || "Product overview"));
          copy.appendChild(create("p", "", (screen.domainVocabulary || []).join(" / ")));
          overview.appendChild(copy);
          var mini = create("div", "mini-metric-grid");
          (screen.metrics || blueprint.metricLabels || []).slice(0, 4).forEach(function (metric, index) {
            var card = create("article", "mini-metric");
            card.appendChild(create("span", "", metric));
            card.appendChild(create("strong", "", index === 0 ? money(records.reduce(function (sum, record) { return sum + Number(record.amount || 0); }, 0)) : index === 1 ? String(records.filter(function (record) { return /pending|unpaid|overdue|watch/i.test(record.status); }).length) : index === 2 ? (records[0] ? records[0].owner : "None") : String(records.length)));
            mini.appendChild(card);
          });
          overview.appendChild(mini);
          root.appendChild(overview);
          return;
        }
        if (screen.layoutKind === "records_table") {
          var tableWrap = create("div", "data-table-wrap");
          var table = create("table", "data-table");
          var thead = create("thead");
          var headRow = create("tr");
          (screen.fields || ["Title", "Owner", "Amount", "Status"]).slice(0, 4).forEach(function (field) { headRow.appendChild(create("th", "", field)); });
          thead.appendChild(headRow);
          table.appendChild(thead);
          var body = create("tbody");
          visible.forEach(function (record) {
            var row = create("tr");
            [record.title, record.owner, money(record.amount), record.status].forEach(function (cell) { row.appendChild(create("td", "", cell)); });
            body.appendChild(row);
          });
          table.appendChild(body);
          tableWrap.appendChild(table);
          root.appendChild(tableWrap);
          return;
        }
        if (screen.layoutKind === "kanban_status_board") {
          var board = create("div", "kanban-board");
          (blueprint.statusOptions || []).slice(0, 4).forEach(function (status) {
            var column = create("article", "kanban-column");
            column.appendChild(create("h4", "", status));
            records.filter(function (record) { return record.status === status; }).slice(0, 4).forEach(function (record) {
              var item = create("div", "kanban-card");
              item.appendChild(create("strong", "", record.title));
              item.appendChild(create("span", "", record.owner));
              column.appendChild(item);
            });
            board.appendChild(column);
          });
          root.appendChild(board);
          return;
        }
        if (screen.layoutKind === "people_roster") {
          var people = create("div", "people-roster");
          visible.forEach(function (record) {
            var card = create("article", "person-card");
            card.appendChild(create("div", "avatar", String(record.owner || "?").slice(0, 2)));
            var body = create("div");
            body.appendChild(create("strong", "", record.owner));
            body.appendChild(create("span", "", record.title));
            body.appendChild(create("small", "", record.note));
            card.appendChild(body);
            people.appendChild(card);
          });
          root.appendChild(people);
          return;
        }
        if (screen.layoutKind === "package_or_pricing_cards") {
          var packages = create("div", "package-grid");
          visible.forEach(function (record) {
            var card = create("article", "package-card");
            card.appendChild(create("span", "", record.category));
            card.appendChild(create("strong", "", money(record.amount)));
            card.appendChild(create("p", "", record.note));
            packages.appendChild(card);
          });
          root.appendChild(packages);
          return;
        }
        if (screen.layoutKind === "payments_revenue") {
          var revenue = create("div", "revenue-layout");
          var total = create("div", "revenue-total", money(visible.reduce(function (sum, record) { return sum + Number(record.amount || 0); }, 0)));
          total.appendChild(create("span", "", (screen.metrics || ["Revenue"])[0]));
          revenue.appendChild(total);
          var list = create("div", "payment-list");
          visible.forEach(function (record) {
            var row = create("p");
            row.appendChild(create("strong", "", record.owner));
            row.appendChild(create("span", "", money(record.amount) + " - " + record.status));
            list.appendChild(row);
          });
          revenue.appendChild(list);
          root.appendChild(revenue);
          return;
        }
        if (screen.layoutKind === "quality_issues") {
          var issues = create("div", "issue-list");
          visible.forEach(function (record) {
            var card = create("article", "issue-card");
            card.appendChild(create("span", "status-chip", record.status));
            card.appendChild(create("strong", "", record.title));
            card.appendChild(create("p", "", record.note));
            issues.appendChild(card);
          });
          root.appendChild(issues);
          return;
        }
        if (screen.layoutKind === "calendar_or_schedule") {
          var schedule = create("div", "schedule-list");
          visible.forEach(function (record, index) {
            var row = create("article", "schedule-row");
            row.appendChild(create("time", "", "Day " + (index + 1)));
            row.appendChild(create("strong", "", record.title));
            row.appendChild(create("span", "", record.status));
            schedule.appendChild(row);
          });
          root.appendChild(schedule);
          return;
        }
        var docs = create("div", "docs-summary");
        docs.appendChild(create("h3", "", screen.purpose || "Local demo notes"));
        var list = create("ul");
        (screen.actions || blueprint.workflowMap || []).forEach(function (action) { list.appendChild(create("li", "", action)); });
        docs.appendChild(list);
        docs.appendChild(create("p", "", blueprint.disclaimer || "Local demo only."));
        root.appendChild(docs);
        return;
      }

      function renderTabs() {
        document.querySelectorAll("[data-section]").forEach(function (button) {
          var section = button.getAttribute("data-section") || "";
          button.classList.toggle("active", section === activeSection);
          button.addEventListener("click", function () {
            activeSection = section;
            render();
          });
        });
        setText(document.getElementById("active-section-label"), activeSection + " preview");
        var screen = activeScreen();
        setText(document.getElementById("record-section-label"), (screen.layoutKind || "screen") + " - " + activeSection);
      }

      function addRecord() {
        var title = document.getElementById("preview-title");
        var owner = document.getElementById("preview-owner");
        var amount = document.getElementById("preview-amount");
        var status = document.getElementById("preview-status");
        var note = document.getElementById("preview-note");
        if (!title || !owner || !String(title.value).trim() || !String(owner.value).trim()) return;
        records.unshift({
          amount: Number(amount ? amount.value : 0),
          category: activeSection,
          note: note ? note.value || "Added in interactive static preview." : "Added in interactive static preview.",
          owner: owner.value,
          status: status ? status.value : "pending",
          title: title.value
        });
        saveRecords();
        if (title) title.value = "";
        if (owner) owner.value = "";
        if (amount) amount.value = "";
        if (note) note.value = "";
        render();
      }

      function resetDemoData() {
        records = cloneDemoRecords();
        saveRecords();
        var filter = document.getElementById("preview-filter");
        if (filter) filter.value = "all";
        render();
      }

      function render() {
        renderTabs();
        renderMetrics();
        renderRecords();
      }

      loadRecords();
      var addButton = document.getElementById("preview-add");
      var resetButton = document.getElementById("preview-reset");
      var filter = document.getElementById("preview-filter");
      if (addButton) addButton.addEventListener("click", addRecord);
      if (resetButton) resetButton.addEventListener("click", resetDemoData);
      if (filter) filter.addEventListener("change", render);
      render();
    })();
  </script>
</body>
</html>`;
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
  const productBlueprint = extractReactProductBlueprint(committedFiles);

  if (css && productBlueprint) {
    const previewDoc = buildReactProductPreviewDoc(productBlueprint, css, manifest.framework);

    return (
      <iframe
        className="h-full min-h-0 w-full rounded-2xl border border-[hsl(var(--premium-border))] bg-white"
        sandbox="allow-scripts"
        srcDoc={previewDoc}
        title="CODE app static product preview"
      />
    );
  }

  const generatedFiles = [...committedFiles.keys()]
    .filter((path) =>
      ["package.json", "vite.config.ts", "index.html", "src/main.tsx", "src/App.tsx", "src/styles.css", "src/lib/mock-data.ts"].includes(path)
    )
    .sort((left, right) => left.localeCompare(right));

  return (
    <div className="h-full overflow-auto rounded-xl border border-[hsl(var(--premium-border))] bg-[#0b0b0b] p-6 text-sm leading-6 text-[#F4F3EE]">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#DE7356]">
        React app preview fallback
      </p>
      <h3 className="mt-2 text-xl font-semibold text-white">
        React app preview metadata is missing.
      </h3>
      <p className="mt-3 max-w-xl text-[#F4F3EE]/78">
        Files were generated, but Hassali cannot render the interactive static preview yet. This fallback is shown instead of a blank preview.
      </p>
      <div className="mt-5 grid gap-3 rounded-2xl border border-white/10 bg-white/[0.045] p-4">
        <p><span className="text-[#F4F3EE]/55">App:</span> {appName}</p>
        <p><span className="text-[#F4F3EE]/55">Framework:</span> {manifest.framework ?? "react_vite"}</p>
        <p><span className="text-[#F4F3EE]/55">Entry point:</span> {manifest.entryPoint ?? "src/main.tsx"}</p>
      </div>
      <section className="mt-5 rounded-2xl border border-white/10 bg-white/[0.035] p-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#F4F3EE]/60">
          Generated files
        </p>
        <ul className="mt-3 list-inside list-disc font-mono text-xs text-[#F4F3EE]/78">
          {(generatedFiles.length ? generatedFiles : sourceFiles).map((file) => (
            <li key={file}>{file}</li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-[#F4F3EE]/58">
          {componentFiles.length} component file(s) detected. Runtime is not started and no packages were installed.
        </p>
      </section>
    </div>
  );
}

function PythonAppSourceSummary({ committedFiles }: { committedFiles: Map<string, VfsFile> }) {
  const generatedFiles = [
    "app.py",
    "requirements.txt",
    "data/mock_crm_data.py",
    "README.md",
    "ARCHITECTURE.md",
    "SECURITY_AND_TESTING.md",
    "HASSALI.md"
  ].filter((path) => committedFiles.has(path));

  const hasMockData = committedFiles.has("data/mock_crm_data.py") || committedFiles.has("src/mock_data.py");

  return (
    <div className="h-full overflow-auto rounded-xl border border-[hsl(var(--royal-border-soft))] bg-[hsl(var(--royal-panel)/0.55)] p-5 text-xs leading-6 text-foreground">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        Python app preview
      </p>
      <h3 className="mt-2 text-lg font-semibold">
        Runtime not started
      </h3>
      <p className="mt-2 text-muted-foreground">
        Python / Streamlit scaffold generated. Package installation and Python runtime execution require an explicit approved runtime flow.
      </p>

      <div className="mt-5 grid gap-3">
        <section className="rounded-xl border border-white/10 bg-black/20 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            Stack
          </p>
          <p className="mt-2">Python / Streamlit</p>
        </section>

        <section className="rounded-xl border border-white/10 bg-black/20 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            Generated files
          </p>
          <ul className="mt-2 list-inside list-disc font-mono text-[11px] text-muted-foreground">
            {generatedFiles.map((file) => (
              <li key={file}>{file}</li>
            ))}
          </ul>
        </section>

        <section className="rounded-xl border border-white/10 bg-black/20 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            What was created
          </p>
          <ul className="mt-2 list-inside list-disc text-muted-foreground">
            <li>CRM dashboard metrics</li>
            <li>Customer table{hasMockData ? " backed by mock data" : ""}</li>
            <li>Pipeline summary</li>
            <li>Billing/cost table</li>
            <li>Revenue and billing charts</li>
          </ul>
        </section>

        <section className="rounded-xl border border-amber-300/20 bg-amber-300/10 p-3 text-amber-100">
          Streamlit runtime is not started. Hassali did not run <span className="font-mono">streamlit run</span>, install packages, or execute shell commands.
        </section>
      </div>
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
  const applyRuntimePayload = useRuntimeStore((state) => state.applyRuntimePayload);
  const startPreview = useRuntimeStore((state) => state.startPreview);
  const stopPreview = useRuntimeStore((state) => state.stopPreview);
  const syncPreview = useRuntimeStore((state) => state.syncPreview);
  const [localPreviewVersion, setLocalPreviewVersion] = useState(0);
  const [staticPreviewStopped, setStaticPreviewStopped] = useState(false);
  const committedFileMap = useMemo(
    () => new Map(canonicalFiles.map((file) => [normalizePreviewPath(file.path), { ...file, path: normalizePreviewPath(file.path) }])),
    [canonicalFiles]
  );
  const committedPaths = canonicalFiles.map((file) => normalizePreviewPath(file.path));
  const hasIndexHtml = committedPaths.some((path) => path === "index.html");
  const approvedPreviewMetadata = proposal?.status === "approved"
    ? proposal.livePreviewMetadata ?? proposal.previewMetadata
    : undefined;
  const effectiveManifest = manifestWithCommittedFallback(canonicalManifest, committedFileMap, productMode, approvedPreviewMetadata);
  const unifiedPreviewType = previewTypeFromManifest(effectiveManifest) ?? "none";
  const activePreviewMetadata = effectiveManifest.type === "architecture"
    ? proposal?.livePreviewMetadata ?? proposal?.previewMetadata
    : undefined;
  const realPreview = realPreviewFrom(proposal?.liveRealPreview) ?? realPreviewFrom(proposal?.realPreview);
  const executablePreview = executablePreviewFrom(activePreviewMetadata?.executablePreview);
  const canStartStaticPreview = effectiveManifest.type === "static_website" && hasIndexHtml;
  const isPythonPreviewType = effectiveManifest.type === "python_app";
  const isRuntimePreviewType = effectiveManifest.type === "react_vite_app" || effectiveManifest.type === "next_app";
  const livePreviewUrl = effectiveManifest.type === "static_website" ? null : runtimePreviewUrl ?? previewUrl;
  const iframeSource = livePreviewUrl ? `${livePreviewUrl}?v=${iframeVersion}` : null;
  const startDisabledReason = !projectId
    ? "Create or select a project before starting preview."
    : isLoading
      ? "Preview is already updating."
      : isRuntimePreviewType
        ? "Runtime execution requires explicit enablement. Vite cannot start until npm install is approved and runtime is enabled in project settings."
        : isPythonPreviewType
          ? "Python / Streamlit runtime requires explicit approved support. Hassali will not install packages or start Streamlit automatically."
        : canStartStaticPreview
          ? "Static srcDoc preview is already available; no local server is started."
          : !canStartStaticPreview
          ? "Preview needs index.html in the committed project files."
          : null;
  const startButtonLabel = isRuntimePreviewType || isPythonPreviewType ? "Enable Runtime" : "Start";
  const panelPreviewLabel = effectiveManifest.type === "static_website"
    ? "Static srcDoc preview"
    : isPythonPreviewType
      ? "Python app preview"
      : previewLabel(unifiedPreviewType);
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
    setStaticPreviewStopped(false);
    setLocalPreviewVersion((version) => version + 1);
  }, [effectiveManifest.type, effectiveManifest.framework, productMode, canonicalFiles.length]);

  const markPreviewStopped = () => {
    applyRuntimePayload({
      error: null,
      logs: [],
      port: null,
      previewUrl: null,
      projectId,
      status: "stopped",
      workspacePath: null
    });
  };

  const reloadPreview = () => {
    if (effectiveManifest.type === "react_vite_app" || effectiveManifest.type === "next_app") {
      setLocalPreviewVersion((version) => version + 1);
      void refreshRuntimeStatus(projectId);
      return;
    }

    if (effectiveManifest.type === "static_website") {
      setStaticPreviewStopped(false);
      setLocalPreviewVersion((version) => version + 1);
      markPreviewStopped();
      return;
    }

    if (effectiveManifest.type === "python_app") {
      setLocalPreviewVersion((version) => version + 1);
      void refreshRuntimeStatus(projectId);
      return;
    }

    if (runtimeStatus === "running" || status === "running") {
      void syncPreview(projectId);
      return;
    }

    void refreshRuntimeStatus(projectId);
  };

  const stopActivePreview = () => {
    if ((effectiveManifest.type === "react_vite_app" || effectiveManifest.type === "next_app") && runtimeStatus !== "running" && status !== "running") {
      markPreviewStopped();
      return;
    }

    if (effectiveManifest.type === "static_website") {
      setStaticPreviewStopped(true);
      markPreviewStopped();
      return;
    }

    if (effectiveManifest.type === "python_app" && runtimeStatus !== "running" && status !== "running") {
      markPreviewStopped();
      return;
    }

    void stopPreview();
  };

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
          className="rounded-full border border-[hsl(var(--premium-accent)/0.35)] bg-[hsl(var(--premium-accent))] px-3.5 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
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
          disabled={isLoading || !projectId}
          onClick={() => {
            reloadPreview();
          }}
          title={effectiveManifest.type === "static_website" ? "Reload static srcDoc preview" : "Refresh preview status"}
          type="button"
        >
          Reload
        </button>
        <button
          className="rounded-full border border-white/10 px-3.5 py-1.5 text-xs text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          disabled={isLoading || (effectiveManifest.type === "static_website" && staticPreviewStopped)}
          onClick={() => {
            stopActivePreview();
          }}
          title={effectiveManifest.type === "static_website" ? "Stop static srcDoc preview" : "Stop preview runtime if one is running"}
          type="button"
        >
          Stop
        </button>
      </div>

      {!isPythonPreviewType && (runtimeLogs.length || runtimeErrors.length || runtimePort || livePreviewUrl) ? (
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
        {isPythonPreviewType ? (
          <PythonAppSourceSummary committedFiles={committedFileMap} key={`python-${localPreviewVersion}`} />
        ) : effectiveManifest.type === "static_website" && hasIndexHtml && !staticPreviewStopped ? (
          <StaticWebsitePreview committedFiles={committedFileMap} key={`static-${localPreviewVersion}`} />
        ) : effectiveManifest.type === "static_website" && staticPreviewStopped ? (
          <div className="flex h-full items-center justify-center rounded-2xl border border-[hsl(var(--premium-border))] bg-black/40 p-6 text-center text-sm text-muted-foreground">
            Static preview stopped. Click Reload to rebuild the srcDoc preview from committed files.
          </div>
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
