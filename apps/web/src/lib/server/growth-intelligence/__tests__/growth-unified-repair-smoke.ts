import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { emptyGrowthDiscovery } from "@/lib/growth-discovery";
import type { IntelligenceRequest, IntelligenceResponse } from "@/lib/server/intelligence/intelligence-contract";
import { type ResearchProvider } from "@/lib/server/ai/ask-research-engine";
import { growthStorageFailure, GrowthDiscoveryError } from "../growth-errors";
import { inferGrowthObject, parseGrowthObject } from "../growth-structured-output";
import { createGrowthSearchProvider, growthSearchQueries, researchGrowthCandidates } from "../growth-research-provider";
import { mutateSearchPlan, normalizeSearchPlan, validSearchPlanShape } from "../growth-discovery-core";
import { publicWebDiscovery, runGrowthDiscovery } from "../growth-discovery-service";

const tests: Array<[string, () => unknown | Promise<unknown>]> = [];
const test = (name: string, fn: () => unknown | Promise<unknown>) => tests.push([name, fn]);
function response(raw: string, finishReason = "stop"): IntelligenceResponse {
  return { citations: [], computeSource: "free-cloud", content: [{ type: "text", text: raw }], finishReason, model: "fixture", providerId: "fixture", toolCalls: [], usage: { cost: { amount: null, currency: null, source: "unknown" }, inputTokens: null, outputTokens: null, totalTokens: null, latencyMs: 0, model: "fixture", providerId: "fixture" } };
}
const valid = { plan: { organizationTypes: ["clinics"], geographies: ["Canada"] } };
const plan = normalizeSearchPlan(valid.plan);
const validate = (v: Record<string, unknown>) => typeof v.plan === "object" && v.plan !== null;
test("raw/fenced/prose-wrapped JSON share one parser", () => {
  for (const raw of [JSON.stringify(valid), `\`\`\`json\n${JSON.stringify(valid)}\n\`\`\``, `Result:\n${JSON.stringify(valid)}\nEnd.`]) assert.deepEqual(parseGrowthObject(raw), valid);
});
test("array output and oversized output rejected", () => { assert.throws(() => parseGrowthObject("[]")); assert.throws(() => parseGrowthObject('[{"plan":{}}]')); assert.throws(() => parseGrowthObject(" ".repeat(96001))); });
test("wrong typed criteria cannot silently drop geography", () => { assert.equal(validSearchPlanShape({ titles: ["Manager"], geographies: "Canada" }), false); assert.equal(validSearchPlanShape(valid.plan), true); });
test("provider safety finish is not retried", async () => { let calls = 0; await assert.rejects(() => inferGrowthObject({ instruction: "plan", data: {}, validate, infer: async () => { calls++; return response('{}', 'content_filter'); } }), { code: "GROWTH_SAFETY_REJECTION" }); assert.equal(calls, 1); });
test("Growth receives repairable structured text before its schema gate", async () => {
  const requests: IntelligenceRequest[] = [];
  const result = await inferGrowthObject({ instruction: "plan", data: {}, validate, infer: async request => {
    requests.push(request);
    return response(`\`\`\`json\n${JSON.stringify(valid)}\n\`\`\``);
  } });
  assert.deepEqual(result.data, valid);
  assert.equal(requests[0]?.responseFormat, "text");
  assert.deepEqual(requests[0]?.requiredCapabilities, ["text", "structuredOutput"]);
});
for (const [name, first] of [["syntax", response("{bad")], ["schema", response('{"unrelated":true}')], ["truncation", response(JSON.stringify(valid), "length")]] as const) {
  test(`${name} gets exactly one bounded structured repair`, async () => {
    const requests: IntelligenceRequest[] = [];
    const result = await inferGrowthObject({ instruction: "Return a plan", data: { request: "Canadian clinics" }, validate,
      infer: async request => { requests.push(request); return requests.length === 1 ? first : response(JSON.stringify(valid)); } });
    assert.deepEqual(result.data, valid); assert.equal(requests.length, 2);
    assert.match(JSON.stringify(requests[1].messages), /Canadian clinics/);
    assert.equal(requests[1].responseFormat, "text");
    if (name === "truncation") {
      assert.equal(requests[0].generation?.maxOutputTokens, 2_500);
      assert.equal(requests[1].generation?.maxOutputTokens, 3_100);
      assert.doesNotMatch(JSON.stringify(requests[1].messages), /invalidCandidate/);
    }
  });
}
test("truncated output is not echoed into the bounded repair request", async () => {
  const requests: IntelligenceRequest[] = [];
  const exclusions: Array<string[] | undefined> = [];
  const result = await inferGrowthObject({ instruction: "Return a plan", data: { request: "dense public page" }, validate,
    infer: async (request, options) => { requests.push(request); exclusions.push(options?.excludedModelIds); return requests.length === 1 ? response("x".repeat(20_000), "length") : response(JSON.stringify(valid)); } });
  assert.deepEqual(result.data, valid);
  assert.ok(JSON.stringify(requests[1].messages).length < 1_000);
  assert.deepEqual(exclusions[1], ["fixture"]);
});
test("unrepairable schema stops after two calls", async () => { let calls = 0; await assert.rejects(() => inferGrowthObject({ instruction: "plan", data: {}, validate, infer: async () => { calls++; return response('{}'); } }), /bounded repair/); assert.equal(calls, 2); });
test("transport/auth/policy errors do not enter semantic retry loop", async () => {
  for (const code of ["GROWTH_AUTHENTICATION", "GROWTH_MALFORMED_PROVIDER_RESPONSE", "GROWTH_SAFETY_REJECTION"]) {
    let calls = 0; await assert.rejects(() => inferGrowthObject({ instruction: "plan", data: {}, validate, infer: async () => { calls++; throw new GrowthDiscoveryError(code, "Unavailable"); } }), { code }); assert.equal(calls, 1);
  }
});
test("cancellation prevents calls and delivery", async () => { const controller = new AbortController(); controller.abort(); let calls = 0; await assert.rejects(() => inferGrowthObject({ signal: controller.signal, instruction: "plan", data: {}, validate, infer: async () => { calls++; return response('{}'); } }), /cancelled/); assert.equal(calls, 0); });
test("production service repairs invalid plan before discovery", async () => {
  let calls = 0, discoveries = 0;
  const result = await runGrowthDiscovery({ action: "search", previous: emptyGrowthDiscovery(), truth: null, prompt: "Find Canadian clinics" }, { infer: async () => { calls++; return response(JSON.stringify(calls === 1 ? { plan: {} } : valid)); }, retrieve: async () => { throw new Error("unused"); } }, {
    id: "fixture", discoverCompanies: async actual => { discoveries++; assert.deepEqual(actual.geographies, ["Canada"]); return { companies: [], people: [], discovery: { status: "unavailable", checked: 0, rejected: 0, searchedAt: null, message: "fixture" } }; }
  });
  assert.equal(calls, 2); assert.equal(discoveries, 1); assert.deepEqual(result.plan?.organizationTypes, ["clinics"]);
});
test("removing a title records durable exclusion", () => { const next = mutateSearchPlan(normalizeSearchPlan({ titles: ["Manager", "Director"], geographies: ["Canada"] }), [{ field: "titles", op: "remove", values: ["Director"] }]); assert.deepEqual(next.excludedTitles, ["Director"]); assert.deepEqual(next.geographies, ["Canada"]); });
test("malformed operation cannot silently clear a filter", () => assert.throws(() => mutateSearchPlan(plan, [{ field: "geographies", op: "set", values: "Germany" }])));
for (const [code, expected] of [["42P01", "TABLE_MISSING"], ["ECONNREFUSED", "UNREACHABLE"], ["28P01", "PERMISSION_DENIED"], ["42501", "PERMISSION_DENIED"], ["08006", "UNREACHABLE"]]) {
  test(`storage ${code} distinct and private`, () => { const result = growthStorageFailure({ cause: { code, message: "password=FAKE_PRIVATE_SENTINEL" } }); assert.equal(result.code, `GROWTH_STORAGE_${expected}`); assert.doesNotMatch(JSON.stringify(result), /FAKE_PRIVATE/); });
}
test("cyclic unknown database errors bounded", () => { const error = { cause: null as unknown }; error.cause = error; assert.equal(growthStorageFailure(error).code, "GROWTH_STORAGE_FAILED"); });
test("missing search configuration makes no network call", () => assert.equal(createGrowthSearchProvider(undefined, async () => { throw new Error("must not call"); }), null));
test("configured search uses fixed endpoint and bounded sanitized input", async () => {
  const provider = createGrowthSearchProvider("fixture-key", async (url, init) => {
    assert.equal(url, "https://api.tavily.com/search"); assert.equal(init?.redirect, "error");
    const body = JSON.parse(String(init?.body)); assert.equal(body.max_results, 5); assert.doesNotMatch(body.query, /PRIVATE_SENTINEL/);
    return Response.json({ results: [{ title: "Clinic", url: "https://clinic.example/about", content: "Public business information" }] });
  })!;
  assert.equal((await provider.search("clinics token=PRIVATE_SENTINEL", { maxResults: 500 })).length, 1);
});
test("search errors never return provider body or credentials", async () => {
  for (const status of [401, 429, 500]) {
    const provider = createGrowthSearchProvider("private-fixture", async () => new Response("private-fixture", { status }))!;
    await assert.rejects(() => provider.search("clinics", { maxResults: 5 }), error => error instanceof GrowthDiscoveryError && !error.message.includes("private-fixture"));
  }
});
test("search response limit enforced", async () => { const provider = createGrowthSearchProvider("fixture", async () => new Response("x".repeat(250001)))!; await assert.rejects(() => provider.search("clinics", { maxResults: 5 }), { code: "GROWTH_SEARCH_INVALID_RESPONSE" }); });
test("queries are bounded and retain structured business geography", () => { const queries = growthSearchQueries({ ...plan, organizationTypes: Array(20).fill("clinics") }); assert.equal(queries.length, 3); assert.ok(queries.every(q => q.includes("Canada"))); });

test("company queries separate buyer signals from organization identity", () => {
  for (const [organization, signal] of [["creative agencies", "searching laptop specifications"], ["clinics", "buying appointment software"], ["architects", "comparing printer prices"], ["hotels", "ordering cleaning supplies"]]) {
    const queries = growthSearchQueries({ ...plan, organizationTypes: [organization], buyingSignals: [signal] });
    assert.ok(queries.every(query => query.includes(organization) && !query.includes(signal)));
  }
});

test("search network and cancellation failures are typed without leaking causes", async () => {
  const provider = createGrowthSearchProvider("private-fixture", async () => { throw new TypeError("private-fixture transport failure"); })!;
  await assert.rejects(() => provider.search("clinics", { maxResults: 5 }), error => error instanceof GrowthDiscoveryError && error.code === "GROWTH_SEARCH_NETWORK" && !error.message.includes("private-fixture"));
  const controller = new AbortController(); controller.abort();
  await assert.rejects(() => provider.search("clinics", { maxResults: 5, signal: controller.signal }), { code: "GROWTH_CANCELLED" });
});
test("provider-neutral candidate search defers evidence to original-page verification", async () => {
  let searches = 0;
  const provider: ResearchProvider = { id: "fixture", search: async () => { searches++; return [{ title: "Clinic", url: "https://clinic.example/about" }]; } };
  const urls = await researchGrowthCandidates(plan, provider);
  assert.equal(searches, 1); assert.deepEqual(urls, ["https://clinic.example/about"]);
});

test("candidate budget balances queries and deduplicates company domains", async () => {
  let calls = 0;
  const provider: ResearchProvider = { id: "fixture", search: async () => {
    const group = ++calls;
    return Array.from({ length: 5 }, (_, rank) => ({ title: "Candidate", url: `https://company-${group}-${rank}.example/about` }));
  } };
  const urls = await researchGrowthCandidates({ ...plan, organizationTypes: ["clinics", "hospitals", "labs", "ignored"] }, provider);
  assert.equal(calls, 3); assert.equal(urls.length, 8);
  assert.deepEqual(urls.slice(0, 3), [1, 2, 3].map(group => `https://company-${group}-0.example/about`));
  const duplicate: ResearchProvider = { id: "fixture", search: async () => [{ title: "One", url: "https://company.example/about" }, { title: "Two", url: "https://www.company.example/services" }] };
  assert.equal((await researchGrowthCandidates(plan, duplicate)).length, 1);
});

test("candidate search retains successful query results and bounds total failures", async () => {
  let calls = 0;
  const network = new GrowthDiscoveryError("GROWTH_SEARCH_NETWORK", "Source unreachable");
  const mixed: ResearchProvider = { id: "fixture", search: async () => {
    if (++calls === 1) throw network;
    return [{ title: "Clinic", url: "https://clinic.example/" }];
  } };
  const multiple = { ...plan, organizationTypes: ["clinics", "hospitals", "labs"] };
  assert.deepEqual(await researchGrowthCandidates(multiple, mixed), ["https://clinic.example/"]);
  assert.equal(calls, 3);
  calls = 0;
  const failed: ResearchProvider = { id: "fixture", search: async () => { calls++; throw network; } };
  await assert.rejects(() => researchGrowthCandidates(multiple, failed), { code: "GROWTH_SEARCH_NETWORK" });
  assert.equal(calls, 3);
});

test("candidate URLs cannot carry embedded credentials or executable schemes", async () => {
  const provider: ResearchProvider = { id: "fixture", search: async () => [
    { title: "Private", url: "https://user:fake-secret@company.example/" },
    { title: "Script", url: "javascript:alert(1)" },
    { title: "Company", url: "https://company.example/" }
  ] };
  assert.deepEqual(await researchGrowthCandidates(plan, provider), ["https://company.example/"]);
});
test("snippet-only candidates cannot become companies", async () => {
  let calls = 0;
  const result = await publicWebDiscovery.discoverCompanies(plan, { search: async () => ["https://clinic.example/about"], retrieve: async () => { throw new Error("unreadable"); }, infer: async () => { calls++; return response('{}'); } });
  assert.equal(result.companies.length, 0); assert.equal(calls, 0);
});
test("route classifies ownership before inference and storage separately", async () => {
  const source = await readFile("src/app/api/growth/route.ts", "utf8");
  assert.ok(source.indexOf("await ownsGrowthProject") < source.indexOf("await runGrowthDiscovery"));
  assert.match(source, /GROWTH_OWNERSHIP_DENIED/); assert.match(source, /GROWTH_STALE_BUSINESS_TRUTH/); assert.match(source, /growthStorageFailure\(error\)/);
});
test("local migration command reads only original Growth statements", async () => {
  const source = await readFile("../../packages/database/drizzle/0006_overconfident_legion.sql", "utf8");
  const selected = source.split('--> statement-breakpoint').map(s => s.trim()).filter(s => /^(?:CREATE TABLE|ALTER TABLE) "growth_project_states"\s/.test(s));
  assert.equal(selected.length, 3); assert.doesNotMatch(selected.join("\n"), /github_project_connections|project_notes|DROP|DELETE\s+FROM/);
});
for (const [name, run] of tests) { await run(); console.log(`PASS ${name}`); }
console.log(`Growth unified repair: ${tests.length}/${tests.length} PASS`);
