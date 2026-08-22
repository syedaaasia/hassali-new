import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { deriveManifest, type VfsFile } from "@/lib/preview-manifest";
import { syncRuntimeApprovalResult } from "@/lib/runtime-result-sync";
import { defaultThemeMode, resolveThemeMode } from "@/lib/theme-mode";
import { buildWebsiteEditContext } from "@/lib/server/ai/website-edit-context";
import { classifyWebsiteEditIntent } from "@/lib/server/ai/website-edit-intent";
import { planWebsiteEdit } from "@/lib/server/ai/website-edit-planner";
import { extractExplicitWebsiteBrand } from "@/lib/server/ai/website-request-objective";
import { buildWebsite3DSceneSpec } from "@/lib/server/ai/website-webgl-scene-spec";
import { createStoredZip, prepareProjectExportFiles } from "@/lib/server/project-export";

const root = process.cwd().replace(/\\/g, "/").endsWith("/apps/web")
  ? path.resolve(process.cwd(), "../..")
  : process.cwd();

function websiteFiles() {
  const navigation = '<nav><a href="index.html">Home</a><a href="about.html">About</a><a href="contact.html">Contact</a></nav>';
  return {
    "DESIGN.md": "Project Design Contract\nfingerprint: apple-preserved",
    "HASSALI.md": "mode: WEBSITE\ndomainId: photography_studio",
    "about.html": `${navigation}<main><h1>About our studio</h1><p>About prose stays intact.</p></main>`,
    "contact.html": `${navigation}<main><h1>Contact</h1></main>`,
    "index.html": `${navigation}<main><section class="hero"><h1>Original heading</h1><p>Original copy</p></section></main>`,
    "styles.css": ":root { --bg: #f5f5f7; --surface: #ffffff; --ink: #241c19; --muted: #665f5b; --accent: #0066cc; --accent-alt: #4d76a8; --border: #d2d2d7; --color-bg: #f5f5f7; --color-surface: #ffffff; --color-text: #241c19; --color-muted: #665f5b; --color-primary: #0066cc; --color-accent: #4d76a8; --color-border: #d2d2d7; }"
  };
}

function edit(prompt: string) {
  const files = websiteFiles();
  const context = buildWebsiteEditContext({ fileContents: files, fileList: Object.keys(files) });
  const intent = classifyWebsiteEditIntent(prompt);
  return { files, intent, plan: planWebsiteEdit(context, intent) };
}

test("heading edit stays exact and canonical read-back drives preview and ZIP", () => {
  const value = "The NEW Hearts ❤️ and Stars⭐️";
  const planned = edit(`Change the hero heading to "${value}" Do not change anything else.`);
  assert.equal(planned.plan.mode, "planned");
  assert.deepEqual(planned.plan.changes.map((change) => change.path), ["index.html"]);
  const nextIndex = planned.plan.changes[0]?.content ?? "";
  assert.match(nextIndex, new RegExp(value));
  assert.equal(planned.files["DESIGN.md"], "Project Design Contract\nfingerprint: apple-preserved");

  const canonicalFiles = Object.entries({ ...planned.files, "index.html": nextIndex })
    .map(([filePath, content]) => ({ content, path: filePath }));
  const synced = syncRuntimeApprovalResult({
    currentFiles: Object.fromEntries(Object.entries(planned.files).map(([filePath, content]) => [filePath, { content }])),
    projectId: "project-1",
    proposalChanges: planned.plan.changes.map((change) => ({ action: "update", path: change.path, proposedContent: change.content, summary: change.summary })),
    proposalId: "proposal-1",
    runtimeResult: { applied: true, canonicalProjectFiles: canonicalFiles, canonicalProjectRevision: "revision-2", ok: true, runnerStatus: "completed", writtenFiles: ["index.html"] }
  });
  assert.equal(synced.proposalApplied, true);
  assert.match(synced.fileUpdates.find((file) => file.path === "index.html")?.content ?? "", new RegExp(value));
  const previewFiles = new Map(synced.fileUpdates.map((file) => [file.path, { ...file, lastModified: 2 } as VfsFile]));
  assert.equal(deriveManifest(previewFiles, "WEBSITE").type, "static_website");
  const zip = createStoredZip(prepareProjectExportFiles({ files: canonicalFiles, mode: "WEBSITE", projectName: "Portfolio" }));
  assert.match(zip.toString("utf8"), new RegExp(value));
});

test("About to About Us changes repeated navigation labels without rewriting prose", () => {
  const planned = edit("change About to About Us");
  assert.equal(planned.intent.editType, "navigation_label");
  assert.equal(planned.plan.mode, "planned");
  assert.deepEqual(planned.plan.changes.map((change) => change.path).sort(), ["about.html", "contact.html", "index.html"]);
  for (const change of planned.plan.changes) {
    assert.ok(change.content);
    assert.match(change.content, />About Us<\/a>/);
    assert.doesNotMatch(change.content, />About<\/a>/);
  }
  assert.match(planned.plan.changes.find((change) => change.path === "about.html")?.content ?? "", /About prose stays intact/);
});

test("requested palettes preserve both colors and repair black-background contrast", () => {
  const yellowBlack = edit("Change color to Yellow and Black");
  const yellowBlackCss = yellowBlack.plan.changes.find((change) => change.path === "styles.css")?.content ?? "";
  assert.match(yellowBlackCss, /#d9a514/i);
  assert.match(yellowBlackCss, /#111111/i);
  assert.match(yellowBlackCss, /#f7f7f7/i);
  assert.equal(yellowBlack.plan.changes.some((change) => change.path.endsWith(".html")), false);

  const black = edit("change background to black");
  const blackCss = black.plan.changes.find((change) => change.path === "styles.css")?.content ?? "";
  assert.match(blackCss, /--(?:bg|color-bg): #111111/i);
  assert.match(blackCss, /--(?:ink|color-text): #f7f7f7/i);

  const red = edit("change color to red and make it look premium");
  assert.match(red.plan.changes.find((change) => change.path === "styles.css")?.content ?? "", /#c43d4d/i);
  assert.equal(red.plan.changes.some((change) => change.path.endsWith(".html")), false);
});

test("Applied fails closed without canonical revision proof and rejection leaves bytes untouched", () => {
  const files = websiteFiles();
  const before = JSON.stringify(files);
  const unverified = syncRuntimeApprovalResult({
    currentFiles: Object.fromEntries(Object.entries(files).map(([filePath, content]) => [filePath, { content }])),
    projectId: "project-1",
    proposalChanges: [{ action: "update", path: "index.html", proposedContent: "changed", summary: "change" }],
    proposalId: "proposal-1",
    runtimeResult: { applied: true, ok: true, runnerStatus: "completed", writtenFiles: ["index.html"] }
  });
  assert.equal(unverified.proposalApplied, false);
  assert.equal(unverified.syncStatus, "failed");
  assert.equal(JSON.stringify(files), before);
});

test("approval, persistence, preview, and export source require one canonical revision", () => {
  const approvalRoute = readFileSync(path.resolve(root, "apps/web/src/app/api/runtime/approve/route.ts"), "utf8");
  const persistence = readFileSync(path.resolve(root, "packages/database/src/persistence.ts"), "utf8");
  const exportRoute = readFileSync(path.resolve(root, "apps/web/src/app/api/workspace/export/route.ts"), "utf8");
  assert.match(approvalRoute, /productMode === "WEBSITE"[\s\S]*?\? step\.content/);
  assert.match(approvalRoute, /canonicalProjectFiles: authoritativeProjectFiles/);
  assert.match(approvalRoute, /canonicalProjectRevision: authoritativeProjectRevision/);
  assert.match(persistence, /nextRevision === currentRevision[\s\S]*?status: "unchanged"/);
  assert.match(persistence, /currentRevision !== input\.expectedProjectRevision[\s\S]*?status: "stale"/);
  assert.match(exportRoute, /listUserProjectFiles\(\{ externalUserId: userId, projectId \}\)/);
});

test("ordinary edits ignore unrelated attachments as design authority", () => {
  const route = readFileSync(path.resolve(root, "apps/web/src/app/api/ai/chat/route.ts"), "utf8");
  assert.match(route, /const websiteEditPlan = plannedWebsiteEdit;/);
  assert.doesNotMatch(route, /const websiteEditPlan = plannedWebsiteEdit\.mode === "planned" && projectDesignContract && designDirectionRequest/);
});

test("paint request keeps instruction text out of brand and selects material WebGL semantics", () => {
  const prompt = "build me a site for paint company using the file I attached for typography, colors, fonts, webgl and scroll effects";
  assert.equal(extractExplicitWebsiteBrand(prompt), null);
  const scene = buildWebsite3DSceneSpec({ businessType: "paint company", domainId: "paint_coatings", palette: ["#111111", "#facc15"], projectName: "Paint portfolio", prompt });
  assert.equal(scene.enabled, true);
  assert.equal(scene.recipe, "material_orbit");
  assert.doesNotMatch(`${scene.subject} ${scene.narrative}`, /structural frames|building assemblies|site grids/i);
});

test("Darker replaces Light as the default while existing Dark remains selectable", () => {
  assert.equal(defaultThemeMode, "darker");
  assert.equal(resolveThemeMode("dark"), "dark");
  assert.equal(resolveThemeMode("light"), "darker");
  assert.equal(resolveThemeMode(undefined), "darker");
  assert.equal(resolveThemeMode("invalid"), "darker");
  const layout = readFileSync(path.resolve(root, "apps/web/src/app/layout.tsx"), "utf8");
  const settings = readFileSync(path.resolve(root, "apps/web/src/components/shell/sidebar-settings.tsx"), "utf8");
  const css = readFileSync(path.resolve(root, "apps/web/src/app/globals.css"), "utf8");
  assert.match(layout, /<html lang="en" className="darker">/);
  assert.match(settings, /value === "dark" \? "Dark" : "Darker"/);
  assert.doesNotMatch(settings, />Light</);
  assert.match(css, /\.darker\s*\{[\s\S]*?--background: 0 0% 0%;[\s\S]*?--foreground: 0 0% 98%;/);
  assert.match(css, /\.dark\s*\{/);
  assert.doesNotMatch(css, /\.light\s*\{/);
});
