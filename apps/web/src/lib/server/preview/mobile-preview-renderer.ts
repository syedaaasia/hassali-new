import type { MobilePreviewMetadata, MobilePreviewRuntimeResult } from "@/lib/server/preview/mobile-preview-types";
import type { RealPreviewFrame, RealPreviewResult } from "@/lib/server/preview/real-preview-types";
import {
  escapePreviewHtml,
  sanitizePreviewList,
  sanitizePreviewText,
  sanitizeStaticPreviewHtml
} from "@/lib/server/preview/real-preview-sanitizer";

function frame(
  id: string,
  title: string,
  kind: RealPreviewFrame["kind"],
  items: string[]
): RealPreviewFrame {
  return {
    id,
    items: sanitizePreviewList(items, ["Mobile preview item"]),
    kind,
    title: sanitizePreviewText(title)
  };
}

function safeHtmlFor(metadata: MobilePreviewMetadata, title: string) {
  const sections = [
    ["Screens", metadata.screens],
    ["Navigation", metadata.navigation],
    ["Features", metadata.features]
  ]
    .map(([sectionTitle, items]) => {
      const list = (items as string[]).map((item) => `<li>${escapePreviewHtml(item)}</li>`).join("");

      return `<section><h2>${escapePreviewHtml(sectionTitle)}</h2><ul>${list}</ul></section>`;
    })
    .join("");

  return sanitizeStaticPreviewHtml(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body{margin:0;background:#07070a;color:#f4f1e8;font-family:Inter,ui-sans-serif,system-ui;padding:24px}
      main{max-width:320px;margin:auto;border:1px solid rgba(255,255,255,.14);border-radius:34px;background:#101119;padding:18px}
      .speaker{width:72px;height:6px;border-radius:99px;background:rgba(255,255,255,.2);margin:0 auto 18px}
      section{border:1px solid rgba(255,255,255,.1);border-radius:18px;background:rgba(255,255,255,.045);padding:14px;margin-bottom:12px}
      h1{font-size:20px;margin:0 0 14px}
      h2{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#a9a3bd;margin:0 0 10px}
      ul{display:grid;gap:8px;list-style:none;margin:0;padding:0}
      li{border:1px solid rgba(124,108,255,.24);border-radius:14px;padding:9px 10px;background:rgba(124,108,255,.08)}
    </style>
  </head>
  <body>
    <main>
      <div class="speaker"></div>
      <h1>${escapePreviewHtml(title)}</h1>
      ${sections}
    </main>
  </body>
</html>`);
}

export function renderMobilePreview(
  metadata: MobilePreviewMetadata,
  displayName: string
): RealPreviewResult {
  const title = `${displayName} mobile preview`;
  const frames = [
    frame("mobile-screens", "Screen hierarchy", "mobile_screen", metadata.screens),
    frame("mobile-navigation", "Navigation", "panel", metadata.navigation),
    frame("mobile-features", "Features", "dashboard", metadata.features)
  ];

  return {
    assets: [
      {
        category: "mobile",
        label: `${displayName} phone frame`,
        role: "screen"
      }
    ],
    confidence: metadata.confidence,
    description: `${displayName} rendered as a deterministic phone-frame preview. No emulator or native build is started.`,
    frames,
    kind: "mobile_mock",
    previewType: "mobile",
    renderMode: "structured_cards",
    safeHtml: safeHtmlFor(metadata, title),
    state: "ready",
    title,
    warnings: [
      {
        code: "mobile_mock_only",
        message: "Mobile preview is visual-only; Hassali did not run Expo, Flutter, Android Studio, Xcode, or emulators.",
        severity: "info"
      }
    ]
  };
}

export function withMobileRealPreview(
  result: Omit<MobilePreviewRuntimeResult, "realPreview">
): MobilePreviewRuntimeResult {
  return {
    ...result,
    realPreview: result.detected ? renderMobilePreview(result, result.displayName) : null
  };
}
