import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { hassaliChatContractVersion } from "@/lib/chat-contract";
import { buildDeterministicAskSummary, parseProjectNoteAction } from "@/lib/project-notes-intelligence";
import { prepareGrowthState } from "@/lib/server/growth-intelligence/growth-route-state";
import { decideAskFreshness } from "../ask-source-reliability";
import { buildAskRuntimeContext } from "../ask-context";

type Message = { content: string; role: "assistant" | "user" };

async function chat(prompt: string, messages: Message[] = [{ content: prompt, role: "user" }]) {
  const { POST } = await import("@/app/api/ai/chat/route");
  const response = await POST(new Request("http://localhost/api/ai/chat", {
    body: JSON.stringify({
      clientContractVersion: hassaliChatContractVersion,
      messages,
      mode: "ASK",
      model: "tencent/hy3:free",
      productMode: "ASK"
    }),
    headers: { "content-type": "application/json" },
    method: "POST"
  }));
  assert.equal(response.status, 200, await response.clone().text());
  return response.text();
}

function wordCount(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

test("production ASK route handles ordinary recommendations", async () => {
  const answer = await chat("What is the best tool to start freelancing");
  assert.match(answer, /marketplace|Upwork|portfolio/i);
  assert.doesNotMatch(answer, /couldn't complete/i);
});

test("production ASK route uses deterministic weekday offsets", async () => {
  const answer = await chat("If yesterday was two days before Thursday, what day is today?");
  assert.match(answer, /today is Wednesday/i);
  assert.doesNotMatch(answer, /today is Thursday/i);
});

test("production ASK route preserves pills and handshake reasoning", async () => {
  assert.match(await chat("A doctor gives me three pills, one every half hour. How long until all are taken?"), /one hour|60 minutes/i);
  assert.match(await chat("How many handshakes happen among 10 people if everyone shakes hands once?"), /45/);
});

test("final delivered ASK payload has exactly twenty words and no provider prefix", async () => {
  const previousKey = process.env.OPENROUTER_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.OPENROUTER_API_KEY = "test-key";
  globalThis.fetch = async () => Response.json({
    choices: [{ message: { content: "Referenced. The sky appears blue because atmospheric molecules scatter shorter blue light wavelengths more efficiently than other visible colors during daylight." } }],
    model: "tencent/hy3:free"
  });
  try {
    const answer = await chat("Give me an answer that is exactly 20 words long explaining why the sky appears blue.");
    assert.equal(wordCount(answer), 20, answer);
    assert.doesNotMatch(answer, /^Referenced[.:]/i);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previousKey;
  }
});

test("next-turn constraint is acknowledged then applied once", async () => {
  const instruction = "Answer my next question using only three words.";
  const acknowledgement = await chat(instruction);
  assert.match(acknowledgement, /understood/i);
  const prompt = "Why do humans dream?";
  const answer = await chat(prompt, [
    { content: instruction, role: "user" },
    { content: acknowledgement, role: "assistant" },
    { content: prompt, role: "user" }
  ]);
  assert.equal(wordCount(answer), 3, answer);
  assert.equal(decideAskFreshness({ prompt, runtime: buildAskRuntimeContext(new Date("2026-08-22T09:00:00Z")) }).researchRequired, false);
});

test("production ASK route retains and corrects conversation-only facts", async () => {
  const setup = "My imaginary project is called Mango. It uses Python, PostgreSQL and React. Remember that only for this conversation.";
  const setupAnswer = await chat(setup);
  const firstQuestion = "What database does Mango use?";
  const firstAnswer = await chat(firstQuestion, [
    { content: setup, role: "user" }, { content: setupAnswer, role: "assistant" }, { content: firstQuestion, role: "user" }
  ]);
  assert.equal(firstAnswer.trim(), "PostgreSQL");
  const correction = "Actually Mango now uses SQLite instead of PostgreSQL.";
  const correctionAnswer = await chat(correction, [
    { content: setup, role: "user" }, { content: setupAnswer, role: "assistant" },
    { content: firstQuestion, role: "user" }, { content: firstAnswer, role: "assistant" },
    { content: correction, role: "user" }
  ]);
  const finalQuestion = "What database does Mango use now?";
  const finalAnswer = await chat(finalQuestion, [
    { content: setup, role: "user" }, { content: setupAnswer, role: "assistant" },
    { content: firstQuestion, role: "user" }, { content: firstAnswer, role: "assistant" },
    { content: correction, role: "user" }, { content: correctionAnswer, role: "assistant" },
    { content: finalQuestion, role: "user" }
  ]);
  assert.equal(finalAnswer.trim(), "SQLite");
  assert.equal(decideAskFreshness({ prompt: finalQuestion, runtime: buildAskRuntimeContext(new Date("2026-08-22T09:00:00Z")) }).researchRequired, false);
});

test("today AI news remains a real research request", () => {
  const decision = decideAskFreshness({
    prompt: "What happened in the world today that could affect AI companies the most?",
    runtime: buildAskRuntimeContext(new Date("2026-08-22T09:00:00Z"))
  });
  assert.equal(decision.researchRequired, true);
  assert.equal(decision.freshnessClass, "live_event");
});

test("production Growth preparation works without WEBSITE and preserves optional enrichment", () => {
  const prompt = "Create a growth strategy for a wholesale flower business selling to florists and event planners.";
  const standalone = prepareGrowthState({ businessTruth: null, ownerId: "owner", projectId: "growth", prompt });
  assert.equal(standalone.project.businessTruth.business.category.value, "wholesale flower business");
  assert.deepEqual(standalone.project.businessTruth.audiences.map((item) => item.segment), ["florists", "event planners"]);
  assert.match(standalone.artifact.content, /wholesale flower business|florists/i);
  assert.doesNotMatch(standalone.artifact.content, /needs an applied WEBSITE/i);
  const enriched = prepareGrowthState({ businessTruth: standalone.project.businessTruth, ownerId: "owner", projectId: "growth", prompt: "Create a retention plan." });
  assert.equal(enriched.project.businessTruth.business.category.value, "wholesale flower business");
  const unrelatedWebsiteTruth = {
    ...standalone.project.businessTruth,
    business: {
      ...standalone.project.businessTruth.business,
      category: { confidence: 1, evidenceIds: ["website"], status: "confirmed" as const, value: "beauty cosmetics" },
      name: { confidence: 1, evidenceIds: ["website"], status: "confirmed" as const, value: "Apple Beauty" }
    },
    sourceWebsite: { projectId: "website", revision: "old" }
  };
  const isolated = prepareGrowthState({ businessTruth: unrelatedWebsiteTruth, ownerId: "owner", projectId: "growth", prompt });
  assert.equal(isolated.project.businessTruth.business.name.value, null);
  assert.equal(isolated.project.businessTruth.sourceWebsite, null);
});

test("Notes mutate only for explicit actions and requested summaries stay bounded", async () => {
  for (const prompt of ["Hello", "Explain cash flow", "Give an example", "Make it shorter", "Thanks"]) {
    assert.equal(parseProjectNoteAction(prompt), null);
  }
  assert.equal(parseProjectNoteAction("Summarize this conversation into Notes in five bullets.")?.kind, "summarize");
  const summary = buildDeterministicAskSummary(Array.from({ length: 12 }, (_, index) => ({
    content: `Meaningful ${index % 2 ? "answer" : "request"} number ${index} with enough useful context for a project checkpoint.`,
    role: index % 2 ? "assistant" as const : "user" as const
  })));
  assert(summary.split("\n").length >= 4 && summary.split("\n").length <= 5);
  const panel = await readFile(new URL("../../../../components/shell/project-notes-panel.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(panel, /useChatStore|buildDeterministicAskSummary\(messages\)/);
});

test("GitHub and Darker product surfaces use the repaired production UI", async () => {
  const sidebar = await readFile(new URL("../../../../components/shell/left-sidebar.tsx", import.meta.url), "utf8");
  const github = await readFile(new URL("../../../../components/shell/github-project-panel.tsx", import.meta.url), "utf8");
  const workspace = await readFile(new URL("../../../../components/shell/workspace.module.css", import.meta.url), "utf8");
  const composer = await readFile(new URL("../../../../components/shell/right-sidebar.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(sidebar, /Chevron direction=\{githubOpen/);
  assert.doesNotMatch(github, /Attaching reads bounded repository metadata|push is never automatic/);
  assert.match(github, /location\.href = "\/api\/github\/connect"/);
  assert.match(github, /GitHub connection needs to be configured/);
  assert.match(workspace, /:global\(\.darker\) \.workspace[\s\S]*--premium-panel: 0 0% 4%/);
  assert.match(workspace, /:global\(\.darker\) \.ambient/);
  assert.doesNotMatch(composer, /bg-\[#12161C\]|bg-\[#1A2029\]|bg-\[#0B0D10\]/);
});
