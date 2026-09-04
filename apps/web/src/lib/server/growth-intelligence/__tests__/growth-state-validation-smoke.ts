import assert from "node:assert/strict";
import { prepareGrowthState } from "../growth-route-state";
import { growthBusinessTruthFromPrompt } from "../growth-intelligence";
import { persistedGrowthTruth, validGrowthBusinessTruth } from "../growth-state-validation";
import type { GrowthBusinessTruth } from "../growth-types";

let count = 0;
function test(name: string, fn: () => void) { fn(); count++; console.log(`PASS ${name}`); }
test("legacy nested state rejected", () => assert.equal(persistedGrowthTruth({ project: { businessTruth: {} } }), null));
test("null state rejected", () => assert.equal(persistedGrowthTruth(null), null));
const truth = growthBusinessTruthFromPrompt("Grow a wholesale flower business selling to florists");
test("current truth preserved exactly", () => assert.equal(validGrowthBusinessTruth(truth), truth));
test("malformed offer rejected", () => assert.equal(validGrowthBusinessTruth({ ...truth, offers: [{}] }), null));
test("malformed assertion rejected", () => assert.equal(validGrowthBusinessTruth({ ...truth, business: { ...truth.business, name: "old" } }), null));
test("legacy data cannot crash preparation", () => assert.ok(prepareGrowthState({ businessTruth: {} as GrowthBusinessTruth, ownerId: "test", projectId: "test", prompt: "Find customers for a flower business" }).project));
test("valid canonical fallback survives invalid stored truth", () => {
  const fallback = { ...truth, sourceWebsite: { projectId: "site", revision: "r1" } };
  const selected = persistedGrowthTruth({ project: { businessTruth: { legacy: true } } }) ?? fallback;
  assert.equal(prepareGrowthState({ businessTruth: selected, ownerId: "test", projectId: "site", prompt: "Find customers" }).project.businessTruth.sourceWebsite?.revision, "r1");
});
console.log(`${count}/${count} PASS`);
