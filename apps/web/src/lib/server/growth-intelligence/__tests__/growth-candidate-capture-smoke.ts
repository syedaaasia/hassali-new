import assert from "node:assert/strict";
import { emptyGrowthDiscovery, growthCandidatesCsv } from "@/lib/growth-discovery";
import { readDiscoveryState } from "../growth-discovery-core";
import { claimDiscoveryWork, controlDiscoveryJob, executeDiscoveryWork } from "../growth-job-engine";
import { processGrowthJob } from "../growth-job-request";
import { runGrowthDiscovery, publicWebDiscovery, type GrowthDiscoveryDependencies, type ProspectDiscoveryProvider } from "../growth-discovery-service";
import { GrowthDiscoveryError } from "../growth-errors";

const tests: Array<[string, () => Promise<void>]> = [];
const test = (name: string, fn: () => Promise<void>) => tests.push([name, fn]);
const deps: GrowthDiscoveryDependencies = {
  infer: async () => { throw new GrowthDiscoveryError("GROWTH_QUOTA", "Unavailable"); },
  searchQuery: async () => ["https://one.test/", "https://www.one.test/about", "https://two.test/"],
  retrieve: async url => ({ url, title: "Public page", content: "This is a public page with a sufficiently long description of an organization and its services. No invented contact details are supplied here.", retrievedAt: "2026-09-14T00:00:00Z" })
};
const start = () => runGrowthDiscovery({ previous: emptyGrowthDiscovery(), truth: null, action: "discover", prompt: "Studios in Toronto", seed: { category: "Studios", location: "Toronto" } }, deps);
const advance = (state: Awaited<ReturnType<typeof start>>) => executeDiscoveryWork(claimDiscoveryWork(state), deps, publicWebDiscovery);
test("manual criteria use the existing plan/job without inference", async () => {
  const state = await start(); assert.deepEqual(state.plan!.organizationTypes, ["Studios"]); assert.deepEqual(state.plan!.geographies, ["Toronto"]); assert.equal(state.job!.captureOnly, true); assert.equal(state.job!.queries.length, 1);
});
test("search deduplicates and evidence capture never promotes candidates", async () => {
  const searched = await advance(await start()); assert.equal(searched.job!.candidates.length, 2);
  const state = await advance(searched); assert.equal(state.job!.status, "complete"); assert.equal(state.companies.length, 0);
  assert.ok(state.job!.candidates.every(c => c.evidence!.length > 0 && c.qualification === "unverified"));
  assert.deepEqual(readDiscoveryState(JSON.parse(JSON.stringify(state))), state);
});
test("qualification failure preserves captured evidence and permits later retry", async () => {
  const captured = await advance(await advance(await start()));
  const failed = await advance(controlDiscoveryJob(captured, "qualify"));
  assert.equal(failed.job!.status, "paused"); assert.equal(failed.companies.length, 0);
  assert.ok(failed.job!.candidates.every(c => c.evidence?.length && c.qualification === "unverified"));
  const ready = controlDiscoveryJob(failed, "qualify"); assert.equal(ready.job!.cursor, 0); assert.ok(ready.job!.candidates.every(c => c.attempts === 0));
});
test("normal verifier can promote saved candidates without rediscovery", async () => {
  const state = controlDiscoveryJob(await advance(await advance(await start())), "qualify");
  const verifier: ProspectDiscoveryProvider = { id: "fixture", discoverCompanies: async (plan, d) => ({ companies: (await d.search!(plan)).map(url => ({ id: url, name: "Fixture verified company", website: url, domain: new URL(url).hostname, location: null, organizationType: null, segment: "", fitScore: 0, fitReasons: [], evidence: [], lastVerifiedAt: "2026-09-14", targetRoles: [], recommendedAngle: "" })), people: [], discovery: { status: "complete", checked: 2, rejected: 0, message: "Fixture", searchedAt: null } }) };
  const result = await executeDiscoveryWork(claimDiscoveryWork(state), { ...deps, searchQuery: async () => { throw new Error("Must not rediscover"); } }, verifier);
  assert.equal(result.companies.length, 2); assert.ok(result.job!.candidates.every(c => c.qualification === "verified"));
});
test("candidate CSV carries evidence/status and excludes another project's pool", async () => {
  const a = await advance(await advance(await start())), b = emptyGrowthDiscovery();
  const csv = growthCandidatesCsv(a); assert.equal(csv.charCodeAt(0), 0xfeff); assert.match(csv, /"Qualification"/); assert.match(csv, /"unverified"/); assert.match(csv, /https:\/\/one.test\//);
  assert.doesNotMatch(growthCandidatesCsv(b), /one.test|two.test/); assert.doesNotMatch(csv, /"Fit score"|"Email"|"Phone"/);
});
test("foreign job request cannot read or mutate candidate pool", async () => {
  const state = await start(); await assert.rejects(() => processGrowthJob({ previous: state, action: "advance", jobId: "another-project-job", revision: state.revision, save: async () => { throw new Error("Must not persist"); } }, deps, publicWebDiscovery), /job has changed/);
});
test("failed source remains discovered with no fabricated evidence", async () => {
  const state = await advance(await start());
  const result = await executeDiscoveryWork(claimDiscoveryWork(state), { ...deps, retrieve: async () => { throw new Error("Unavailable"); } }, publicWebDiscovery);
  assert.ok(result.job!.candidates.every(c => !c.evidence && c.qualification === "unverified" && c.failureCode)); assert.equal(result.companies.length, 0);
});
test("stored evidence plus a later fetch failure is not a rejection", async () => {
  const captured = controlDiscoveryJob(await advance(await advance(await start())), "qualify");
  const result = await executeDiscoveryWork(claimDiscoveryWork(captured), { ...deps, retrieve: async () => { throw new Error("Unavailable"); } }, publicWebDiscovery);
  assert.ok(result.job!.candidates.every(c => c.evidence?.length && c.qualification === "unverified"));
});
test("one failed capture cannot discard a successful neighbor", async () => {
  const state = await advance(await start());
  const result = await executeDiscoveryWork(claimDiscoveryWork(state), { ...deps, retrieve: async (url, signal) => { if (url.includes("one.test")) throw new Error("Unavailable"); return deps.retrieve(url, signal); } }, publicWebDiscovery);
  assert.equal(result.job!.candidates.filter(c => c.evidence?.length).length, 1);
  assert.equal(result.job!.candidates.length, 2);
});
test("HTTP-success access denial is not business evidence", async () => {
  const state = await advance(await start());
  const result = await executeDiscoveryWork(claimDiscoveryWork(state), { ...deps, retrieve: async url => ({ url, title: "Directory", content: "Your IP address (192.0.2.1) is currently being denied access to certain parts of this site. Automated searches are not allowed.", retrievedAt: "2026-09-15T00:00:00Z" }) }, publicWebDiscovery);
  assert.ok(result.job!.candidates.every(c => !c.evidence?.length && c.qualification === "unverified" && c.failureCode === "GROWTH_SOURCE_BLOCKED"));
  assert.equal(result.job!.candidates.length, 2);
});
for (const [name, run] of tests) { await run(); console.log(`PASS ${name}`); }
console.log(`Growth candidate capture: ${tests.length}/${tests.length} PASS`);
