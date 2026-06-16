import type { RealPreviewFrame, RealPreviewResult } from "@/lib/server/preview/real-preview-types";
import {
  escapePreviewHtml,
  sanitizePreviewList,
  sanitizePreviewText,
  sanitizeStaticPreviewHtml
} from "@/lib/server/preview/real-preview-sanitizer";
import type {
  DatabaseFrameworkMatch,
  DatabaseRuntimeAnalysis
} from "@/lib/server/runtime/database-runtime-types";

function frame(
  id: string,
  title: string,
  kind: RealPreviewFrame["kind"],
  items: string[],
  extra?: Pick<RealPreviewFrame, "columns" | "rows">
): RealPreviewFrame {
  return {
    id,
    items: sanitizePreviewList(items, ["Database preview item"]),
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
      const rows = previewFrame.rows?.length
        ? `<table><tbody>${previewFrame.rows
            .map((row) => `<tr>${row.map((cell) => `<td>${escapePreviewHtml(cell)}</td>`).join("")}</tr>`)
            .join("")}</tbody></table>`
        : "";
      const items = previewFrame.items.map((item) => `<li>${escapePreviewHtml(item)}</li>`).join("");

      return `<section><h2>${escapePreviewHtml(previewFrame.title)}</h2><ul>${items}</ul>${rows}</section>`;
    })
    .join("");

  return sanitizeStaticPreviewHtml(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body{margin:0;background:#060708;color:#f4f1e8;font-family:Inter,ui-sans-serif,system-ui;padding:24px}
      main{display:grid;gap:16px}
      section{border:1px solid rgba(255,255,255,.1);border-radius:18px;background:rgba(255,255,255,.045);padding:18px}
      h1{font-size:24px;margin:0 0 14px}
      h2{font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:#a9c9bd;margin:0 0 12px}
      ul{display:flex;flex-wrap:wrap;gap:8px;list-style:none;margin:0;padding:0}
      li{border:1px solid rgba(0,255,135,.24);border-radius:999px;padding:8px 10px;background:rgba(0,255,135,.07)}
      table{width:100%;margin-top:14px;border-collapse:collapse;font-size:13px}
      td{border-top:1px solid rgba(255,255,255,.08);padding:8px;color:#d9d7ce}
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

export function mapDatabaseRelationshipPreview(input: {
  analysis: DatabaseRuntimeAnalysis;
  match: DatabaseFrameworkMatch;
}): RealPreviewResult {
  const title = `${input.match.displayName} database runtime`;
  const relationshipItems = input.analysis.relationships.map((relationship) => {
    const from = relationship.fromColumn
      ? `${relationship.fromTable}.${relationship.fromColumn}`
      : relationship.fromTable;
    const to = relationship.toColumn
      ? `${relationship.toTable}.${relationship.toColumn}`
      : relationship.toTable;

    return `${from} -> ${to}`;
  });
  const tableRows = input.analysis.columns.slice(0, 24).map((column) => [
    column.tableName,
    column.name,
    column.type ?? "unknown",
    [
      column.isPrimaryKey ? "PK" : "",
      column.isForeignKey ? "FK" : "",
      column.isNullable === false ? "required" : ""
    ].filter(Boolean).join(", ") || "column"
  ]);
  const frames = [
    frame("database-erd", "ERD metadata", "dashboard", fallback(input.analysis.tables, input.analysis.models.length ? input.analysis.models : ["No tables detected yet"])),
    frame("database-relationship-graph", "Relationship graph", "app_shell", fallback(relationshipItems, ["No relationships detected yet"])),
    frame("database-table-explorer", "Table explorer", "table", fallback(input.analysis.tables, ["Tables pending"]), {
      columns: ["Table", "Column", "Type", "Role"],
      rows: tableRows.length ? tableRows : [["No table", "No column", "unknown", "pending"]]
    }),
    frame("database-column-explorer", "Column explorer", "table", fallback(input.analysis.columns.map((column) => `${column.tableName}.${column.name}`), ["No columns detected yet"]), {
      columns: ["Table", "Column", "Type", "Role"],
      rows: tableRows.length ? tableRows : [["No table", "No column", "unknown", "pending"]]
    }),
    frame("database-migrations", "Migration history", "panel", fallback(input.analysis.migrations, ["No migration files detected"])),
    frame("database-model-graph", "Model graph", "component", fallback(input.analysis.models, input.analysis.tables.length ? input.analysis.tables : ["No models detected"])),
    frame("database-query-graph", "Query graph", "api", fallback(input.analysis.queries, ["No static query patterns detected"]))
  ];

  return {
    assets: [
      {
        category: "database",
        label: `${input.match.displayName} schema architecture`,
        role: "visual"
      }
    ],
    confidence: input.match.confidence,
    description: `${input.match.displayName} rendered as tables, columns, relationships, migrations, models, and query architecture metadata.`,
    frames,
    kind: "api_architecture",
    previewType: "architecture",
    renderMode: "architecture_diagram",
    safeHtml: safeHtmlFor(title, frames),
    state: "ready",
    title,
    warnings: [
      {
        code: "database_analysis_only",
        message: "Database preview is file-analysis only; Hassali did not connect to a database or execute migrations.",
        severity: "info"
      }
    ]
  };
}
