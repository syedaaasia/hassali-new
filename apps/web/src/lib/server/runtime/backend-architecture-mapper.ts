import type { RealPreviewFrame, RealPreviewResult } from "@/lib/server/preview/real-preview-types";
import {
  escapePreviewHtml,
  sanitizePreviewList,
  sanitizePreviewText,
  sanitizeStaticPreviewHtml
} from "@/lib/server/preview/real-preview-sanitizer";
import type {
  BackendFrameworkMatch,
  BackendRuntimeAnalysis
} from "@/lib/server/runtime/backend-runtime-types";

function frame(
  id: string,
  title: string,
  kind: RealPreviewFrame["kind"],
  items: string[],
  extra?: Pick<RealPreviewFrame, "columns" | "rows">
): RealPreviewFrame {
  return {
    id,
    items: sanitizePreviewList(items, ["Backend preview item"]),
    kind,
    title: sanitizePreviewText(title),
    ...extra
  };
}

function fallback(values: string[], fallbackValues: string[]) {
  return values.length ? values : fallbackValues;
}

function safeHtmlFor(title: string, frames: RealPreviewFrame[]) {
  const sections = frames
    .map((previewFrame) => {
      const items = previewFrame.items.map((item) => `<li>${escapePreviewHtml(item)}</li>`).join("");

      return `<section><h2>${escapePreviewHtml(previewFrame.title)}</h2><ul>${items}</ul></section>`;
    })
    .join("");

  return sanitizeStaticPreviewHtml(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body{margin:0;background:#07070a;color:#f4f1e8;font-family:Inter,ui-sans-serif,system-ui;padding:24px}
      main{display:grid;gap:16px}
      section{border:1px solid rgba(255,255,255,.1);border-radius:18px;background:rgba(255,255,255,.045);padding:18px}
      h1{font-size:24px;margin:0 0 14px}
      h2{font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:#a9a3bd;margin:0 0 12px}
      ul{display:flex;flex-wrap:wrap;gap:8px;list-style:none;margin:0;padding:0}
      li{border:1px solid rgba(124,108,255,.24);border-radius:999px;padding:8px 10px;background:rgba(124,108,255,.08)}
    </style>
  </head>
  <body>
    <main>
      <h1>${escapePreviewHtml(title)}</h1>
      ${sections}
    </main>
  </body>
</html>`);
}

export function mapBackendArchitecturePreview(input: {
  analysis: BackendRuntimeAnalysis;
  match: BackendFrameworkMatch;
}): RealPreviewResult {
  const title = `${input.match.displayName} backend runtime`;
  const frames = [
    frame("backend-api-explorer", "API explorer", "api", fallback(input.analysis.endpoints, input.analysis.routes.length ? input.analysis.routes : ["No endpoints detected yet"])),
    frame("backend-route-tree", "Route tree", "app_shell", fallback(input.analysis.routes, ["Routes pending"])),
    frame("backend-request-flow", "Request / response flow", "panel", [
      "Request",
      ...(input.analysis.middleware.length ? ["Middleware"] : []),
      ...(input.analysis.authenticationType ? ["Authentication"] : []),
      "Controller / handler",
      ...(input.analysis.services.length ? ["Service"] : []),
      ...(input.analysis.databases.length ? ["Database"] : []),
      "Response"
    ]),
    frame("backend-service-graph", "Service graph", "dashboard", fallback(input.analysis.services, ["Service layer not detected"])),
    frame("backend-middleware-auth", "Middleware & auth", "panel", fallback([
      ...input.analysis.middleware,
      ...(input.analysis.authenticationType ? [`Auth: ${input.analysis.authenticationType}`] : []),
      ...input.analysis.authorization
    ], ["No auth middleware detected"])),
    frame("backend-database-view", "Database relationship view", "table", fallback([
      ...input.analysis.models,
      ...input.analysis.schemas,
      ...input.analysis.databases
    ], ["No database/schema files detected"]), {
      columns: ["Data object", "Role"],
      rows: fallback([
        ...input.analysis.models,
        ...input.analysis.schemas,
        ...input.analysis.databases
      ], ["No database/schema files detected"]).slice(0, 6).map((item) => [item, "runtime analysis"])
    })
  ];

  return {
    assets: [
      {
        category: "backend",
        label: `${input.match.displayName} API architecture`,
        role: "visual"
      }
    ],
    confidence: input.match.confidence,
    description: `${input.match.displayName} backend rendered as route, service, middleware, auth, and database architecture metadata.`,
    frames,
    kind: "api_architecture",
    previewType: "architecture",
    renderMode: "architecture_diagram",
    safeHtml: safeHtmlFor(title, frames),
    state: "ready",
    title,
    warnings: [
      {
        code: "backend_analysis_only",
        message: "Backend preview is file-analysis only; Hassali did not execute the server.",
        severity: "info"
      }
    ]
  };
}
