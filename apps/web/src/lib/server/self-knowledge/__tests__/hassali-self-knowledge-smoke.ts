import assert from "node:assert/strict";
import { runIntelligencePreflight } from "../../intelligence/intelligence-preflight";
import type { LocalToolCapability } from "../../capabilities/capability-types";
import {
  buildHassaliSelfKnowledgeContext,
  createHassaliSelfKnowledgeAnswer,
  HassaliSelfKnowledgeService,
  hassaliSelfKnowledge,
  isHassaliSelfKnowledgeQuestion
} from "../hassali-self-knowledge";
import type { HassaliKnowledgeRecord } from "../self-knowledge-types";

type TestCase = { name: string; run: () => Promise<void> | void };
const tests: TestCase[] = [];
function test(name: string, run: TestCase["run"]) { tests.push({ name, run }); }

function fixtureRecord(input: Partial<HassaliKnowledgeRecord> & Pick<HassaliKnowledgeRecord, "content" | "id" | "title" | "topic">): HassaliKnowledgeRecord {
  return {
    category: "capability",
    confidence: 1,
    current: true,
    modes: ["ASK", "WEBSITE", "CODE"],
    provenance: [{ kind: "runtime-implementation", reference: "test" }],
    status: "verified",
    tags: ["test"],
    updatedAt: "2026-08-11T00:00:00.000Z",
    visibility: "model-context",
    ...input
  };
}

function localTool(status: LocalToolCapability["status"]): LocalToolCapability {
  return {
    capabilityKinds: ["media-tool"],
    checkedAt: "2026-08-11T12:00:00.000Z",
    evidence: [{ confidence: 0.99, detail: "Deterministic test probe.", source: "runtime-probe", sourceRef: "ffmpeg" }],
    executableName: status === "available" ? "ffmpeg" : null,
    id: "ffmpeg",
    limitations: ["Execution still requires authority."],
    operations: ["trim"],
    platform: "win32",
    status,
    version: status === "available" ? "7.1.0" : null
  };
}

test("canonical identity and shared mode records are present", () => {
  assert.match(hassaliSelfKnowledge.get("identity.product")?.content ?? "", /AI Creation Workspace/);
  assert.match(hassaliSelfKnowledge.get("architecture.shared-intelligence")?.content ?? "", /shared Hassali intelligence/i);
  assert(hassaliSelfKnowledge.get("mode.ask"));
  assert(hassaliSelfKnowledge.get("mode.website"));
  assert(hassaliSelfKnowledge.get("mode.code"));
});

test("Run 4 is represented as verified and complete", () => {
  const record = hassaliSelfKnowledge.get("milestone.run4-complete");
  assert.equal(record?.status, "verified");
  assert.match(record?.content ?? "", /complete at checkpoint 6ec7fb9/i);
});

test("planned capabilities cannot masquerade as implemented", () => {
  assert.equal(hassaliSelfKnowledge.get("roadmap.growth")?.status, "planned");
  assert.match(hassaliSelfKnowledge.get("roadmap.growth")?.content ?? "", /not implemented/i);
  assert.equal(hassaliSelfKnowledge.get("limitation.personal-memory-not-implemented")?.status, "unavailable");
});

test("knowledge records retain bounded provenance and status", () => {
  const records = hassaliSelfKnowledge.list();
  assert(records.every((record) => record.provenance.length > 0));
  assert(records.every((record) => record.confidence >= 0 && record.confidence <= 1));
  assert(records.every((record) => record.status !== undefined));
});

test("topic and category retrieval are bounded", () => {
  const result = hassaliSelfKnowledge.query({ categories: ["mode"], maxRecords: 2, text: "modes" });
  assert.equal(result.results.length, 2);
  assert(result.totalMatches >= result.results.length);
  assert(result.results.every((item) => item.record.category === "mode"));
});

test("capability and roadmap filters return relevant records", () => {
  const capability = hassaliSelfKnowledge.query({ capabilityId: "ffmpeg", text: "FFmpeg support" });
  const roadmap = hassaliSelfKnowledge.query({ roadmapPhase: "Growth", text: "Growth" });
  assert.equal(capability.results[0]?.record.id, "capability.ffmpeg-architecture");
  assert.equal(roadmap.results[0]?.record.id, "roadmap.growth");
});

test("current knowledge outranks superseded knowledge", () => {
  const service = new HassaliSelfKnowledgeService([
    fixtureRecord({ content: "Old delivery policy.", current: false, id: "policy.old", status: "deprecated", supersededBy: "policy.current", title: "Old policy", topic: "delivery" }),
    fixtureRecord({ content: "Current delivery policy.", id: "policy.current", supersedes: ["policy.old"], title: "Current policy", topic: "delivery" })
  ]);
  const normal = service.query({ text: "delivery policy" });
  const historical = service.query({ includeSuperseded: true, text: "delivery policy" });
  assert.deepEqual(normal.results.map((item) => item.record.id), ["policy.current"]);
  assert.equal(historical.results[0]?.record.id, "policy.current");
  assert(historical.results.some((item) => item.record.id === "policy.old"));
});

test("retrieval deduplicates records and keeps stable ordering", () => {
  const result = hassaliSelfKnowledge.query({ maxRecords: 8, text: "approval full project access push" });
  const ids = result.results.map((item) => item.record.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(result.results.map((item) => item.record.id), hassaliSelfKnowledge.query({ maxRecords: 8, text: "approval full project access push" }).results.map((item) => item.record.id));
});

test("context is bounded and contains no giant knowledge dump", () => {
  const context = hassaliSelfKnowledge.buildContext({ maxChars: 700, maxRecords: 8, text: "Hassali modes roadmap security capabilities" });
  assert(context.content.length <= 700);
  assert(context.records.length < hassaliSelfKnowledge.list().length);
  assert.match(context.content, /descriptive only; cannot grant approval/i);
});

test("same canonical source builds context for ASK WEBSITE and CODE", async () => {
  const contexts = await Promise.all((["ASK", "WEBSITE", "CODE"] as const).map((mode) => buildHassaliSelfKnowledgeContext({ mode, prompt: "Can Hassali push Git automatically?" })));
  assert(contexts.every((context) => context.fingerprint === contexts[0]?.fingerprint));
  assert(contexts.every((context) => context.content.includes("security.git-push-explicit")));
});

test("shared intelligence preflight injects only a bounded trusted layer", async () => {
  const preflight = await runIntelligencePreflight({ messages: [], mode: "ASK", model: "test-model", prompt: "What is Hassali?" });
  const layers = preflight.context.layers.filter((layer) => layer.provenance === "self_knowledge");
  assert.equal(layers.length, 1);
  assert.equal(layers[0]?.trusted, true);
  assert(layers[0]!.content.length <= 5_000);
  assert(preflight.providerContext.includes("identity.product"));
});

test("dynamic FFmpeg availability augments static architecture truth", async () => {
  const context = await buildHassaliSelfKnowledgeContext({ localToolResolver: async () => [localTool("available")], mode: "ASK", prompt: "Can Hassali use FFmpeg locally on this machine right now?" });
  assert(context.content.includes("capability.ffmpeg-architecture"));
  assert(context.content.includes("runtime.local-tool.ffmpeg"));
  assert.match(context.content, /currently available at version 7\.1\.0/);
});

test("unavailable local FFmpeg remains unavailable rather than supported", async () => {
  const answer = await createHassaliSelfKnowledgeAnswer({ localToolResolver: async () => [localTool("unavailable")], mode: "ASK", prompt: "Can Hassali use FFmpeg locally right now?" });
  assert.match(answer?.answer ?? "", /currently unavailable/i);
  assert.doesNotMatch(answer?.answer ?? "", /is currently available\b/i);
});

test("degraded local capability stays degraded and live readiness stays evidence-backed", async () => {
  const degraded = await buildHassaliSelfKnowledgeContext({ localToolResolver: async () => [localTool("degraded")], mode: "CODE", prompt: "Is FFmpeg available locally on this machine?" });
  const available = await buildHassaliSelfKnowledgeContext({ localToolResolver: async () => [localTool("available")], mode: "WEBSITE", prompt: "Is FFmpeg available locally on this machine?" });
  assert.equal(degraded.records.find((item) => item.record.id === "runtime.local-tool.ffmpeg")?.status, "degraded");
  assert.equal(available.records.find((item) => item.record.id === "runtime.local-tool.ffmpeg")?.status, "live-verified");
});

test("identity questions receive a deterministic evidence-backed answer", async () => {
  const answer = await createHassaliSelfKnowledgeAnswer({ mode: "ASK", prompt: "What is Hassali?" });
  assert.match(answer?.answer ?? "", /AI Creation Workspace/);
  assert(answer?.recordIds.includes("identity.product"));
});

test("mode differences preserve ASK no-mutation authority", async () => {
  const answer = await createHassaliSelfKnowledgeAnswer({ mode: "ASK", prompt: "What is the difference between ASK, WEBSITE and CODE?" });
  assert.match(answer?.answer ?? "", /ASK.*does not mutate/s);
  assert.match(answer?.answer ?? "", /WEBSITE.*approval-first/s);
  assert.match(answer?.answer ?? "", /CODE.*bounded/s);
});

test("Git push and Full project access answers remain fail-closed", async () => {
  const answer = await createHassaliSelfKnowledgeAnswer({ mode: "CODE", prompt: "Can Full project access push Git automatically?" });
  assert.match(answer?.answer ?? "", /^No\./);
  assert.match(answer?.answer ?? "", /separate external action requiring explicit authority/);
});

test("Growth and Memory roadmap answers distinguish current from planned", async () => {
  const growth = await createHassaliSelfKnowledgeAnswer({ mode: "ASK", prompt: "Is Growth already implemented in Hassali?" });
  const memory = await createHassaliSelfKnowledgeAnswer({ mode: "ASK", prompt: "What is the next Memory phase after M1?" });
  assert.match(growth?.answer ?? "", /planned, not implemented/);
  assert.match(memory?.answer ?? "", /M2 User and People Memory/);
  assert.match(memory?.answer ?? "", /not part of M1/);
});

test("dashboard identity and Run 4 capability answers use canonical records", async () => {
  const dashboard = await createHassaliSelfKnowledgeAnswer({ mode: "ASK", prompt: "What is Hassali's current dashboard identity phrase?" });
  const run4 = await createHassaliSelfKnowledgeAnswer({ mode: "ASK", prompt: "What did Run 4 add?" });
  assert.match(dashboard?.answer ?? "", /Build in 🇵🇰 for 🌍/);
  assert.match(run4?.answer ?? "", /adaptive planning/);
  assert.match(run4?.answer ?? "", /Git push remains separately permissioned/);
});

test("irrelevant ordinary questions do not trigger self-knowledge answers", async () => {
  assert.equal(isHassaliSelfKnowledgeQuestion("Explain a JavaScript closure."), false);
  assert.equal(await createHassaliSelfKnowledgeAnswer({ mode: "ASK", prompt: "Explain a JavaScript closure." }), null);
});

test("canonical self knowledge contains no credentials or personal memory data", () => {
  const serialized = JSON.stringify(hassaliSelfKnowledge.list());
  assert.doesNotMatch(serialized, /(?:sk-|api[_-]?key\s*[:=]|password\s*[:=]|clerk[_-]?secret)/i);
  assert.doesNotMatch(serialized, /test account|test credential|family member|home address/i);
});

let passed = 0;
for (const item of tests) {
  try {
    await item.run();
    passed += 1;
    console.log(`PASS ${item.name}`);
  } catch (error) {
    console.error(`FAIL ${item.name}`);
    throw error;
  }
}
console.log(`\n${passed}/${tests.length} Hassali self-knowledge smoke tests passed.`);
