import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(testDirectory, "../../../..");
const page = readFileSync(path.join(webRoot, "src/app/page.tsx"), "utf8");
const homepageStyles = readFileSync(path.join(webRoot, "src/app/home.module.css"), "utf8");
const footer = readFileSync(
  path.join(webRoot, "src/components/marketing/interactive-spotlight-footer.tsx"),
  "utf8"
);

const tests: Array<{ name: string; run: () => void }> = [];

function test(name: string, run: () => void) {
  tests.push({ name, run });
}

test("the existing homepage structure and core copy remain present", () => {
  assert.equal((page.match(/<section\b/g) ?? []).length, 7);
  assert.match(page, /Build apps, websites, and tools from one clear idea\./);
  assert.match(page, /Start with one idea\. Keep control of every change\./);
  assert.match(page, /<ProductPreview \/>/);
  assert.match(page, /<GlobeSection \/>/);
  assert.match(page, /<InteractiveSpotlightFooter \/>/);
  assert.doesNotMatch(page, /pricing|testimonial|customer logo|comparison table/i);
});

test("the existing calls to action retain their wording and destinations", () => {
  assert.match(page, /href="\/dashboard" tone="primary">Open workspace/);
  assert.match(page, /href="\/dashboard" tone="primary">Start building/);
  assert.match(page, /href="#workflow">See review-first flow/);
  assert.match(page, /href="\/dashboard" tone="primary">Open Hassali workspace/);
});

test("the giant spotlight footer remains the existing footer", () => {
  assert.match(footer, /aria-label="Hassali spotlight footer"/);
  assert.match(footer, />\s*HASSALI\s*<\/h2>/);
  assert.match(footer, /hassali spotlight footer/i);
  assert.doesNotMatch(footer, /newsletter|social|copyright|pricing/i);
});

test("premium colors are scoped to the homepage with dark and light palettes", () => {
  assert.match(page, /styles\.homepage/);
  assert.match(homepageStyles, /\.homepage\s*\{/);
  assert.match(homepageStyles, /background:\s*#0b0d10/);
  assert.match(homepageStyles, /--premium-panel:\s*214 22% 13%/);
  assert.match(homepageStyles, /--premium-accent:\s*12 67% 60%/);
  assert.match(homepageStyles, /--home-interactive-foreground:\s*#0b0d10/);
  assert.match(homepageStyles, /--home-interactive-foreground:\s*#1a2433/);
  assert.match(homepageStyles, /:global\(\.light\) \.homepage/);
  assert.match(homepageStyles, /background:\s*#f3f5f8/);
  assert.doesNotMatch(homepageStyles, /dashboard|app-shell|right-sidebar|preview-panel/);
});

test("metadata preserves every value and wraps long paths safely", () => {
  for (const value of [
    "home/services/contact",
    "Domain",
    "Pages",
    "Style",
    "Mutation"
  ]) {
    assert.match(page, new RegExp(value.replaceAll("/", "\\/")));
  }
  assert.match(page, /data-home-metadata/);
  assert.match(homepageStyles, /\.metadataItem[\s\S]*min-width:\s*0/);
  assert.match(homepageStyles, /\.metadataItem[\s\S]*max-width:\s*100%/);
  assert.match(homepageStyles, /\.metadataValue[\s\S]*overflow-wrap:\s*anywhere/);
  assert.match(homepageStyles, /\.metadataValue[\s\S]*word-break:\s*break-word/);
  assert.match(homepageStyles, /\.pathSegment[\s\S]*white-space:\s*nowrap/);
  assert.match(page, /item\.value\.split\("\/"\)/);
  assert.match(homepageStyles, /@media \(max-width: 639px\)[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(homepageStyles, /@media \(min-width: 640px\)[\s\S]*grid-template-columns:\s*minmax\(0, 0\.72fr\) minmax\(0, 1\.28fr\)/);
  assert.match(homepageStyles, /@media \(min-width: 1280px\)[\s\S]*minmax\(0, 0\.64fr\)[\s\S]*minmax\(0, 0\.91fr\)/);
});

test("mode identity remains restrained and semantically distinct", () => {
  assert.match(page, /mode\.label === "CODE" \? "code"/);
  assert.match(page, /mode\.label === "WEBSITE" \? "website" : "ask"/);
  assert.match(homepageStyles, /--home-ask:\s*#57a8ff/);
  assert.match(homepageStyles, /--home-website:\s*#9d7bff/);
  assert.match(homepageStyles, /--home-code:\s*#ff7a3c/);
});

let passed = 0;
for (const entry of tests) {
  entry.run();
  passed += 1;
  process.stdout.write(`PASS ${entry.name}\n`);
}

process.stdout.write(`\n${passed}/${tests.length} homepage polish checks passed.\n`);
