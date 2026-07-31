import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import {
  calculateMascotTrack,
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
  assert.equal(
    deriveAssistantActivity({
      hasVisibleOutput: true,
      isRequestActive: true,
      mode: "ASK"
    }).visibility,
    "hidden"
  );
});

for (const outcome of ["completion", "error", "cancellation"]) {
  test(`${outcome} removes inactive pre-output activity`, () => {
    assert.equal(
      deriveAssistantActivity({
        hasVisibleOutput: false,
        isRequestActive: false,
        mode: "ASK"
      }).visibility,
      "hidden"
    );
  });
}

test("CODE and WEBSITE reuse the same derived activity contract", () => {
  assert.equal(
    deriveAssistantActivity({
      hasVisibleOutput: false,
      isRequestActive: true,
      mode: "CODE"
    }).kind,
    "code_preparation"
  );
  assert.equal(
    deriveAssistantActivity({
      hasVisibleOutput: false,
      isRequestActive: true,
      mode: "WEBSITE"
    }).kind,
    "website_generation"
  );
});

const component = readFileSync(
  path.resolve(process.cwd(), "apps/web/src/components/ai/hassali-activity-mascot.tsx"),
  "utf8"
);
const css = readFileSync(path.resolve(process.cwd(), "apps/web/src/app/globals.css"), "utf8");

test("inactive rendering and accessible status stay explicit", () => {
  assert.match(component, /if \(!active\) return null/);
  assert.match(component, /aria-live="polite"/);
  assert.match(component, /role="status"/);
});

test("approved sprite sheet drives derived walk, throw, and coin strips", () => {
  assert.equal(
    HASSALI_ACTIVITY_MASCOT_ASSET.sourceSpritePath,
    "/mascots/hassali-mascot-sprite.png"
  );
  assert.equal(
    HASSALI_ACTIVITY_MASCOT_ASSET.referencePath,
    "/mascots/hassali-mascot-reference.png"
  );
  assert.equal(HASSALI_ACTIVITY_MASCOT_ASSET.walkFrames, 7);
  assert.equal(HASSALI_ACTIVITY_MASCOT_ASSET.throwFrames, 6);
  assert.equal(HASSALI_ACTIVITY_MASCOT_ASSET.coinFrames, 5);
  assert(!component.includes(HASSALI_ACTIVITY_MASCOT_ASSET.referencePath));

  for (const assetPath of [
    HASSALI_ACTIVITY_MASCOT_ASSET.walkStripPath,
    HASSALI_ACTIVITY_MASCOT_ASSET.throwStripPath,
    HASSALI_ACTIVITY_MASCOT_ASSET.coinStripPath
  ]) {
    const asset = path.resolve(process.cwd(), `apps/web/public${assetPath}`);
    assert(statSync(asset).size < 100_000);
    assert.deepEqual([...readFileSync(asset).subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  }
});

test("responsive track remains bounded and travels 72 percent of safe space", () => {
  for (const stageWidth of [120, 156, 220, 300, 420]) {
    const normalizedWidth = Math.max(
      0,
      Math.min(stageWidth, HASSALI_ACTIVITY_MASCOT_ASSET.stageMaxWidth)
    );
    const track = calculateMascotTrack(stageWidth);
    const safeSpace = Math.max(
      0,
      normalizedWidth - track.safePadding * 2 - HASSALI_ACTIVITY_MASCOT_ASSET.renderedSize
    );
    assert(track.travel >= 0);
    assert(
      track.safePadding + track.travel + HASSALI_ACTIVITY_MASCOT_ASSET.renderedSize <=
        normalizedWidth
    );
    assert(Math.abs(track.travel - safeSpace * 0.72) <= 1);
  }
});

test("CSS provides real sprite walking, calm travel, and natural turnaround", () => {
  assert.match(css, /@keyframes hassali-activity-patrol/);
  assert.match(css, /@keyframes hassali-activity-walk-frames/);
  assert.match(css, /background-size:\s*700%\s+100%/);
  assert.match(css, /steps\(6,\s*end\)/);
  assert.match(css, /hassali-activity-patrol\s+6\.8s\s+linear\s+infinite/);
  assert.match(css, /49\.5%[\s\S]*scaleX\(-1\)/);
  assert.match(css, /97\.5%[\s\S]*scaleX\(1\)/);
  assert.match(css, /animation-delay:\s*140ms/);
  assert.match(css, /translate3d\(var\(--hassali-mascot-travel\)/);
});

test("coin throws stay bounded and completed coins leave the DOM", () => {
  assert.equal([...component.matchAll(/className="hassali-activity-coin-flight"/g)].length, 1);
  assert.match(component, /data-coin-count=\{isThrowing \? 1 : 0\}/);
  assert.match(component, /onAnimationEnd=\{handleThrowComplete\}/);
  assert.match(component, /setIsThrowing\(false\)/);
  assert.match(css, /@keyframes hassali-activity-coin-arc/);
  assert.match(css, /hassali-activity-coin-spin/);
});

test("visible thinking copy is decorative and bound to the coin throw", () => {
  assert.match(component, /aria-label=\{label\}/);
  assert(!component.includes("Hassali is thinking"));
  assert.equal([...component.matchAll(/Thinking\.\.\./g)].length, 1);
  assert.match(
    component,
    /\{isThrowing \? \([\s\S]*hassali-activity-coin-flight[\s\S]*hassali-activity-coin-label[\s\S]*Thinking\.\.\.[\s\S]*\) : null\}/
  );
  assert.match(
    css,
    /\.hassali-activity-coin-label\s*\{[\s\S]*top:\s*18px[\s\S]*color:\s*#ffc755[\s\S]*text-shadow:/
  );
});

test("cleanup is event-driven with no orphaned animation timers", () => {
  assert.match(component, /observer\.disconnect\(\)/);
  assert.match(component, /removeEventListener\("change", stopThrowForReducedMotion\)/);
  assert(!/setInterval|setTimeout|requestAnimationFrame/.test(component));
});

test("reduced motion is stationary and suppresses throws", () => {
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(
    css,
    /prefers-reduced-motion:\s*reduce[\s\S]*\.hassali-activity-mascot[\s\S]*animation:\s*none/
  );
  assert.match(
    css,
    /prefers-reduced-motion:\s*reduce[\s\S]*\.hassali-activity-coin-flight[\s\S]*display:\s*none/
  );
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
