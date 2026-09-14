import assert from "node:assert/strict";
import { emptyGrowthDiscovery, growthProspectsCsv } from "@/lib/growth-discovery";
import { capturedGrowthBusiness, growthBusinessUrl } from "../growth-business-source";
import { readDiscoveryState } from "../growth-discovery-core";
import { GrowthDiscoveryError, runGrowthDiscovery, type GrowthDiscoveryDependencies } from "../growth-discovery-service";

const page = { url: "https://example.test/", title: "Example workspace", content: "Our workspace helps teams organize projects and share progress.\nTeams can keep their project documents together in one place.", retrievedAt: "2026-09-14T10:00:00Z" };
const tests: Array<[string, () => unknown | Promise<unknown>]> = [];
const test = (name: string, run: () => unknown | Promise<unknown>) => tests.push([name, run]);
const deps: GrowthDiscoveryDependencies = { retrieve: async () => page, infer: async () => { throw new Error("Capture must not invoke inference"); } };
const capture = (previous = emptyGrowthDiscovery()) => runGrowthDiscovery({ previous, truth: null, action: "capture", prompt: page.url }, deps);

test("URL normalizes fragments and rejects credentials/malformed hosts", () => {
  assert.equal(growthBusinessUrl("https://example.test/#about"), page.url);
  assert.equal(growthBusinessUrl("A business description"), null);
  assert.throws(() => growthBusinessUrl("https://user:password@example.test"), /credentials/);
  assert.throws(() => growthBusinessUrl("https://["), /valid public/);
});
test("capture completes without inference and never invents audiences/prospects", async () => {
  const result = await capture();
  assert.equal(result.business?.status, "source_only");
  assert.equal(result.analysis?.status, "not_requested");
  assert.deepEqual(result.audiences, []); assert.deepEqual(result.companies, []); assert.deepEqual(result.people, []);
  assert.match(result.messages.at(-1)!.text, /No customers were discovered/);
});
test("source quotes retain provenance and unknown business fields stay unknown", () => {
  const business = capturedGrowthBusiness(page);
  assert.equal(business.offer, ""); assert.equal(business.valueProposition, ""); assert.equal(business.geography, null);
  for (const evidence of business.evidence) {
    assert.equal(evidence.url, page.url); assert.equal(evidence.checkedAt, page.retrievedAt);
    assert.ok((evidence.field === "page_title" ? page.title : page.content).includes(evidence.quote));
  }
});
test("bounded snippets and empty source rejection", () => {
  const result = capturedGrowthBusiness({ ...page, content: Array(100).fill("X".repeat(1000)).join("\n") });
  assert.equal(result.evidence.length, 5); assert.ok(result.evidence.every(e => e.quote.length <= 600));
  assert.throws(() => capturedGrowthBusiness({ ...page, content: "" }), /readable source/);
});
test("paragraph evidence takes priority over navigation", () => {
  const paragraph = "This public product page describes the team's document and project organization workflow with shared progress updates, useful history and collaboration.";
  const result = capturedGrowthBusiness({ ...page, content: `Pricing and plans - compare all of our available options\n${paragraph}` });
  assert.equal(result.evidence[1].quote, paragraph);
});
test("saved capture survives validated serialization", async () => {
  const result = await capture();
  assert.deepEqual(readDiscoveryState(JSON.parse(JSON.stringify(result))), result);
});
test("capture does not mutate its input state", async () => {
  const before = emptyGrowthDiscovery(), snapshot = structuredClone(before);
  await capture(before); assert.deepEqual(before, snapshot);
});
test("provider failure saves actual source with explicit blocked status", async () => {
  const result = await runGrowthDiscovery({ previous: emptyGrowthDiscovery(), truth: null, action: "analyze", prompt: page.url }, { ...deps, infer: async () => { throw new GrowthDiscoveryError("GROWTH_QUOTA", "Unavailable"); } });
  assert.equal(result.analysis?.status, "provider_blocked"); assert.equal(result.analysis?.failureCode, "GROWTH_QUOTA");
  assert.equal(result.business?.website, page.url); assert.equal(result.audiences.length, 0);
});
test("validation failure is not mislabeled provider outage", async () => {
  const result = await runGrowthDiscovery({ previous: emptyGrowthDiscovery(), truth: null, action: "analyze", prompt: page.url }, { ...deps, infer: async () => { throw new GrowthDiscoveryError("GROWTH_SCHEMA_MISMATCH", "Invalid"); } });
  assert.equal(result.analysis?.status, "incomplete");
});
test("same-business capture preserves established interpretation and results", async () => {
  const before = await capture();
  before.business = { ...before.business!, status: "inferred", offer: "Supported offer" };
  before.analysis = { status: "complete" };
  before.drafts = [{ companyId: "saved", subject: "Saved draft", body: "Existing", recommendedAngle: "Existing", personalizationEvidence: [], status: "draft" }];
  const after = await capture(before);
  assert.deepEqual(after.business, before.business); assert.deepEqual(after.drafts, before.drafts); assert.deepEqual(after.analysis, before.analysis);
});
test("different-business capture cannot inherit prior audiences or outreach", async () => {
  const before = await capture();
  before.business!.website = "https://other.test/";
  before.drafts = [{ companyId: "old", subject: "Old", body: "Old", recommendedAngle: "Old", personalizationEvidence: [], status: "draft" }];
  const after = await capture(before); assert.deepEqual(after.drafts, []); assert.equal(before.drafts.length, 1);
});
test("failed reanalysis preserves the same business's established data", async () => {
  const before = await capture();
  before.business = { ...before.business!, status: "inferred", offer: "Supported offer" };
  before.drafts = [{ companyId: "saved", subject: "Saved draft", body: "Existing", recommendedAngle: "Existing", personalizationEvidence: [], status: "draft" }];
  const after = await runGrowthDiscovery({ previous: before, truth: null, action: "analyze", prompt: page.url }, { ...deps, infer: async () => { throw new GrowthDiscoveryError("GROWTH_QUOTA", "Unavailable"); } });
  assert.deepEqual(after.business, before.business); assert.deepEqual(after.drafts, before.drafts);
  assert.match(after.messages.at(-1)!.text, /Existing business and source evidence preserved/);
});
test("fetch errors, internal bugs and policy refusals are not success", async () => {
  await assert.rejects(() => runGrowthDiscovery({ previous: emptyGrowthDiscovery(), truth: null, action: "capture", prompt: page.url }, { ...deps, retrieve: async () => { throw new Error("Fetch failed"); } }), /Fetch failed/);
  for (const code of ["GROWTH_INTERNAL", "GROWTH_SAFETY_REJECTION", "GROWTH_AUTHORIZATION"]) {
    await assert.rejects(() => runGrowthDiscovery({ previous: emptyGrowthDiscovery(), truth: null, action: "analyze", prompt: page.url }, { ...deps, infer: async () => { throw new GrowthDiscoveryError(code, code); } }), new RegExp(code));
  }
});
test("cancellation after fetch prevents delivery/persistence", async () => {
  const controller = new AbortController();
  await assert.rejects(() => runGrowthDiscovery({ previous: emptyGrowthDiscovery(), truth: null, action: "capture", prompt: page.url, signal: controller.signal }, { ...deps, retrieve: async () => { controller.abort(); return page; } }), /cancel/i);
});
test("capture without a URL fails specifically; export has no invented rows", async () => {
  await assert.rejects(() => runGrowthDiscovery({ previous: emptyGrowthDiscovery(), truth: null, action: "capture", prompt: "Business description" }, deps), /public https/);
  assert.equal(growthProspectsCsv(await capture()).trim().split(/\r?\n/).length, 1);
});

async function main() {
  for (const [name, run] of tests) { await run(); console.log(`PASS ${name}`); }
  console.log(`Growth business source: ${tests.length}/${tests.length} PASS`);
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
