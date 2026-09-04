import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { loadGrowthBusinessContext } from "../growth-business-context";
import { buildWebsiteGrowthHandoff, WebsiteGrowthHandoffError } from "@/lib/server/ai/website-growth-handoff";
import { growthBusinessTruthFromPrompt } from "../growth-intelligence";

const cases: Array<[string, () => unknown | Promise<unknown>]> = [];
const test = (name: string, run: () => unknown | Promise<unknown>) => cases.push([name, run]);
const input = { externalUserId: "fixture-owner", projectId: "fixture-project" };
const notWebsite = async () => { throw new WebsiteGrowthHandoffError("No website", "NOT_WEBSITE"); };
for (const state of [null, {}, { project: {} }, { project: { businessTruth: {} } }, { project: { businessTruth: { business: {} } }, campaigns: ["preserve"] }]) {
  test(`standalone or old-shape context ${cases.length + 1} does not require WEBSITE`, async () => {
    const before = JSON.stringify(state);
    assert.equal(await loadGrowthBusinessContext({ ...input, state }, notWebsite), null);
    assert.equal(JSON.stringify(state), before);
  });
}
for (const code of ["OWNERSHIP_REQUIRED", "NOT_AUTHORITATIVE"] as const) test(`never suppress ${code}`, async () => {
  await assert.rejects(() => loadGrowthBusinessContext({ ...input, state: {} }, async () => { throw new WebsiteGrowthHandoffError("Unavailable", code); }), { code });
});
test("genuine SQL failure remains distinguishable", async () => {
  const error = Object.assign(new Error("database unavailable"), { code: "ECONNREFUSED" });
  await assert.rejects(() => loadGrowthBusinessContext({ ...input, state: {} }, async () => { throw error; }), error);
});
test("unexpected context TypeError is not treated as optional enrichment", async () => {
  await assert.rejects(() => loadGrowthBusinessContext({ ...input, state: {} }, async () => { throw new TypeError("bad shape"); }), TypeError);
});
test("valid existing truth avoids unnecessary Website lookup", async () => {
  const truth = growthBusinessTruthFromPrompt("We sell handmade ceramic mugs to independent coffee shops.");
  const actual = await loadGrowthBusinessContext({ ...input, state: { project: { businessTruth: truth } } }, async () => { throw new Error("must not query"); });
  assert.deepEqual(actual, truth);
});
test("valid Website still enriches an older Growth project", async () => {
  const handoff = buildWebsiteGrowthHandoff({ authoritativeState: "applied", projectId: input.projectId, revision: "fixture-revision", files: { "index.html": '<html><head><title>Studio Example</title><meta name="description" content="Interior design services"></head><body><h1>Studio Example</h1><p>Interior design services for independent hotels.</p></body></html>' } });
  const actual = await loadGrowthBusinessContext({ ...input, state: { project: { businessTruth: {} } } }, async () => handoff);
  assert.ok(actual); assert.equal(actual.sourceWebsite?.projectId, input.projectId);
});
test("POST distinguishes SQL load from optional business context", async () => {
  const source = await readFile("src/app/api/growth/route.ts", "utf8");
  assert.ok(source.indexOf('await ownsGrowthProject') < source.indexOf('await loadGrowthBusinessContext'));
  assert.ok(source.indexOf('stage = "business-context"') < source.indexOf('await loadGrowthBusinessContext'));
  assert.match(source, /GROWTH_CONTEXT_INVALID/);
});
for (const [name, run] of cases) { await run(); console.log(`PASS ${name}`); }
console.log(`Growth business context: ${cases.length}/${cases.length} PASS`);
