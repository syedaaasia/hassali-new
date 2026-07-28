import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import {
  deriveAssistantActivity,
  hasMeaningfulAssistantOutput,
  HASSALI_ACTIVITY_MASCOT_ASSET
} from "../assistant-activity";

type TestCase = {
  name: string;
  run: () => void;
};

const tests: TestCase[] = [];

function test(name: string, run: TestCase["run"]) {
  tests.push({ name, run });
}

test("ASK pre-output activity shows the thinking mascot", () => {
  const activity = deriveAssistantActivity({
    hasVisibleOutput: false,
    isRequestActive: true,
    mode: "ASK"
  });
  assert.equal(activity.visibility, "pre-output");
  assert.equal(activity.kind, "thinking");
});

test("first meaningful visible output hides the mascot", () => {
  assert.equal(hasMeaningfulAssistantOutput("   \n"), false);
  assert.equal(hasMeaningfulAssistantOutput("Hello"), true);
  assert.equal(deriveAssistantActivity({
    hasVisibleOutput: true,
    isRequestActive: true,
    mode: "ASK"
  }).visibility, "hidden");
});

for (const outcome of ["completion", "error", "cancellation"]) {
  test(`${outcome} removes inactive pre-output activity`, () => {
    assert.equal(deriveAssistantActivity({
      hasVisibleOutput: false,
      isRequestActive: false,
      mode: "ASK"
    }).visibility, "hidden");
  });
}

test("CODE and WEBSITE reuse the same derived activity contract", () => {
  assert.equal(deriveAssistantActivity({
    hasVisibleOutput: false,
    isRequestActive: true,
    mode: "CODE"
  }).kind, "code_preparation");
  assert.equal(deriveAssistantActivity({
    hasVisibleOutput: false,
    isRequestActive: true,
    mode: "WEBSITE"
  }).kind, "website_generation");
});

test("inactive rendering and accessible status stay explicit", () => {
  const component = readFileSync(
    path.resolve(
      process.cwd(),
      "apps/web/src/components/ai/hassali-activity-mascot.tsx"
    ),
    "utf8"
  );
  assert.match(component, /if \(!active\) return null/);
  assert.match(component, /aria-live="polite"/);
  assert.match(component, /role="status"/);
});

test("mascot policy stays tiny and uses the optimized local asset", () => {
  assert.equal(HASSALI_ACTIVITY_MASCOT_ASSET.renderedSize, 24);
  assert.equal(HASSALI_ACTIVITY_MASCOT_ASSET.sourceSize, 96);
  assert.equal(HASSALI_ACTIVITY_MASCOT_ASSET.stageWidth, 56);
  const asset = path.resolve(
    process.cwd(),
    "apps/web/public/mascots/hassali-thinking.webp"
  );
  assert(statSync(asset).size < 16_000);
  assert.equal(readFileSync(asset).subarray(0, 4).toString("ascii"), "RIFF");
});

test("CSS provides patrol, delayed reveal, and stationary reduced motion", () => {
  const css = readFileSync(
    path.resolve(process.cwd(), "apps/web/src/app/globals.css"),
    "utf8"
  );
  assert.match(css, /@keyframes hassali-activity-patrol/);
  assert.match(css, /animation-delay:\s*140ms/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /\.hassali-activity-mascot[\s\S]*animation:\s*none/);
});

test("the feature adds no Lottie runtime dependency", () => {
  const packageJson = readFileSync(
    path.resolve(process.cwd(), "apps/web/package.json"),
    "utf8"
  ).toLowerCase();
  assert(!packageJson.includes("lottie"));
});

let passed = 0;
for (const entry of tests) {
  entry.run();
  passed += 1;
  process.stdout.write(`PASS ${entry.name}\n`);
}

process.stdout.write(`\n${passed}/${tests.length} activity mascot checks passed.\n`);
