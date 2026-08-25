import assert from "node:assert/strict";
import test from "node:test";
import { buildAskRuntimeContext } from "../ask-context";
import {
  runAskBrain,
  type AskProviderCall,
  type ModelCallResult
} from "../ask-brain-orchestrator";
import {
  classifyConversationHistoryIntent,
  prepareConversationSummary,
  type ConversationHistoryMessage
} from "../conversation-history-analysis";

const observedFailure = "I couldn't complete that answer reliably right now. Please try again.";
const baseConversation: ConversationHistoryMessage[] = [
  { role: "user", content: "We are planning a small florist order dashboard." },
  { role: "assistant", content: "We agreed to start with bookings, delivery status, and payment tracking." },
  { role: "user", content: "Use PostgreSQL for the database." },
  { role: "assistant", content: "PostgreSQL is recorded as the current database choice." },
  { role: "user", content: "Correction: PostgreSQL is wrong; use SQLite for the first local version instead." },
  { role: "assistant", content: "Updated. SQLite is now the current database decision, and PostgreSQL is superseded." }
];

function brainInput(prompt: string, overrides: Partial<Parameters<typeof runAskBrain>[0]> = {}) {
  const messages = [...baseConversation, { role: "user" as const, content: prompt }];
  return {
    askRuntimeContext: buildAskRuntimeContext(new Date("2026-08-25T09:00:00.000Z")),
    conversationTranscript: {
      authoritative: true,
      messages,
      source: "owned_persistence" as const,
      truncated: false
    },
    messages,
    model: "tencent/hy3:free",
    modelSelectionPolicy: "locked" as const,
    productMode: "ASK" as const,
    prompt,
    workspace: { activePath: "", fileList: [] },
    ...overrides
  };
}

async function routeChat(prompt: string, history = baseConversation) {
  const previousKey = process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  try {
    const { hassaliChatContractVersion } = await import("@/lib/chat-contract");
    const { POST } = await import("@/app/api/ai/chat/route");
    const messages = [...history, { role: "user" as const, content: prompt }];
    const response = await POST(new Request("http://localhost/api/ai/chat", {
      body: JSON.stringify({
        clientContractVersion: hassaliChatContractVersion,
        messages,
        mode: "ASK",
        model: "tencent/hy3:free",
        productMode: "ASK",
        projectId: null,
        workspace: { activeFileContent: "", activePath: "", fileContents: {}, fileList: [], projectName: null },
        workspaceProjectId: null
      }),
      headers: { "content-type": "application/json" },
      method: "POST"
    }));
    return { answer: await response.text(), response };
  } finally {
    if (previousKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previousKey;
  }
}

function providerSequence(results: ModelCallResult[]) {
  const calls: Parameters<AskProviderCall>[0][] = [];
  const providerCall: AskProviderCall = async (input) => {
    calls.push(input);
    const result = results.shift();
    if (!result) throw new Error("Unexpected provider call");
    return result;
  };
  return { calls, providerCall };
}

async function withConfiguredProvider(run: () => Promise<void>) {
  const previousKey = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = "test-key";
  try {
    await run();
  } finally {
    if (previousKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previousKey;
  }
}

for (const prompt of [
  "summarize this chat",
  "write summary of the complete chat",
  "give me a chronological recap of everything we've discussed"
]) {
  test(`production route completes conversation request: ${prompt}`, async () => {
    const { answer, response } = await routeChat(prompt);
    assert.doesNotMatch(answer, /couldn't complete that answer reliably/i);
    assert.match(answer, /SQLite/i);
    assert.match(answer, /Conversation summary/i);
    assert.equal(response.headers.get("x-hassali-ask-response-kind"), "deterministic_answer");
  });
}

test("last-N conversation summaries use only the requested bounded range", async () => {
  const history = Array.from({ length: 14 }, (_, index): ConversationHistoryMessage => ({
    role: index % 2 ? "assistant" : "user",
    content: `Unique turn ${index + 1} about topic-${index + 1}.`
  }));
  const { answer } = await routeChat("summarize the last 10 messages", history);
  assert.doesNotMatch(answer, /topic-1\b|topic-2\b|topic-3\b|topic-4\b/i);
  assert.match(answer, /topic-13|topic-14/i);
});

test("long conversations are chunked hierarchically without dropping the beginning", () => {
  const messages = Array.from({ length: 90 }, (_, index): ConversationHistoryMessage => ({
    role: index % 2 ? "assistant" : "user",
    content: `${index === 0 ? "Original launch objective. " : ""}Turn ${index + 1} ${"bounded detail ".repeat(35)}`
  }));
  const prepared = prepareConversationSummary({
    prompt: "summarize our complete conversation",
    transcript: { authoritative: true, messages, source: "owned_persistence", truncated: false }
  });
  assert(prepared);
  assert(prepared.chunkCount > 1);
  assert.match(prepared.modelContext, /Original launch objective/i);
  assert(prepared.modelContext.length < 80_000);
});

test("corrections supersede earlier decisions in deterministic fallback", () => {
  const prepared = prepareConversationSummary({
    prompt: "what decisions have we made in this conversation?",
    transcript: { authoritative: true, messages: baseConversation, source: "owned_persistence", truncated: false }
  });
  assert(prepared);
  assert.match(prepared.deterministicSummary, /SQLite/i);
  assert.match(prepared.deterministicSummary, /correction|current/i);
});

test("unrelated topics are organized and attachment metadata remains visible", () => {
  const messages: ConversationHistoryMessage[] = [
    { role: "user", content: "Plan the florist dashboard.", attachmentLabels: ["orders.csv (document)"] },
    { role: "assistant", content: "The dashboard plan is ready." },
    { role: "user", content: "Now discuss the launch email." },
    { role: "assistant", content: "A short launch email was drafted." }
  ];
  const prepared = prepareConversationSummary({
    prompt: "recap everything in this chat",
    transcript: { authoritative: true, messages, source: "owned_persistence", truncated: false }
  });
  assert(prepared);
  assert.match(prepared.deterministicSummary, /florist dashboard/i);
  assert.match(prepared.deterministicSummary, /launch email/i);
  assert.match(prepared.deterministicSummary, /orders\.csv/i);
});

test("conversation intent is semantic and does not capture pasted-text summaries", () => {
  assert(classifyConversationHistoryIntent("write summary of the complete chat"));
  assert(classifyConversationHistoryIntent("create a handoff from everything we discussed"));
  assert.equal(classifyConversationHistoryIntent("summarize this pasted article: hello world"), null);
});

for (const [name, failure] of [
  ["empty response", { status: "ok", content: " ", servedModel: "selected" }],
  ["malformed response", { status: "ok", content: "null", servedModel: "selected" }],
  ["timeout", { status: "timeout", category: "provider_timeout", reason: "Timed out" }],
  ["rate limit", { status: "failed", category: "provider_rate_limited", reason: "429" }],
  ["provider unavailable", { status: "failed", category: "provider_unavailable", reason: "503" }]
] as const) {
  test(`conversation summary survives selected-model ${name}`, async () => {
    await withConfiguredProvider(async () => {
      const { calls, providerCall } = providerSequence([failure as ModelCallResult]);
      const result = await runAskBrain(brainInput("write summary of the complete chat", { providerCall }));
      assert.equal(calls.length, 1);
      assert.doesNotMatch(result.answer, /couldn't complete that answer reliably/i);
      assert.match(result.answer, /SQLite/i);
      assert.equal(result.decision.completionMethod, "deterministic_conversation_summary");
      assert.equal(result.decision.responseKind, "deterministic_answer");
    });
  });
}

test("missing optional provider configuration uses the deterministic safety net", async () => {
  const previousKey = process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  try {
    const result = await runAskBrain(brainInput("summarize this conversation"));
    assert.match(result.answer, /SQLite/i);
    assert.equal(result.decision.completionMethod, "deterministic_conversation_summary");
  } finally {
    if (previousKey !== undefined) process.env.OPENROUTER_API_KEY = previousKey;
  }
});

test("automatic policy uses one alternate capable model before deterministic fallback", async () => {
  await withConfiguredProvider(async () => {
    const { calls, providerCall } = providerSequence([
      { status: "failed", category: "provider_model_unavailable", reason: "selected unavailable" },
      { status: "ok", content: "The conversation planned a florist dashboard and changed the database decision from PostgreSQL to SQLite.", servedModel: "fallback-model" }
    ]);
    const result = await runAskBrain(brainInput("summarize our conversation", {
      modelSelectionPolicy: "automatic",
      providerCall
    }));
    assert.equal(calls.length, 2);
    assert.equal(result.decision.completionMethod, "alternate_model");
    assert.match(result.answer, /SQLite/i);
  });
});

test("quality rejection recovers to a usable deterministic summary", async () => {
  await withConfiguredProvider(async () => {
    const { calls, providerCall } = providerSequence([
      { status: "ok", content: "Safe: pass", servedModel: "selected" },
      { status: "failed", category: "provider_response_invalid", reason: "bad revision" }
    ]);
    const result = await runAskBrain(brainInput("summarize this chat", { providerCall }));
    assert(calls.length <= 2);
    assert.match(result.answer, /SQLite/i);
    assert.equal(result.decision.completionMethod, "deterministic_conversation_summary");
  });
});

test("cancellation stops cleanly without a retry loop", async () => {
  await withConfiguredProvider(async () => {
    const controller = new AbortController();
    controller.abort();
    const { calls, providerCall } = providerSequence([
      { status: "cancelled", category: "request_cancelled", reason: "Cancelled" }
    ]);
    const result = await runAskBrain(brainInput("summarize this chat", {
      abortSignal: controller.signal,
      providerCall
    }));
    assert(calls.length <= 1);
    assert.match(result.answer, /Request stopped/i);
    assert.equal(result.decision.failureStage, "cancelled");
  });
});

test("provider failure is not Hassali failure when local evidence is sufficient", async () => {
  const result = await runAskBrain(brainInput("write summary of the complete chat", {
    providerCall: async () => ({ status: "failed", category: "provider_network_error", reason: "offline" })
  }));
  assert.notEqual(result.answer, observedFailure);
  assert.match(result.answer, /Conversation summary/i);
  assert(result.decision.fallbackMethodsAttempted.includes("deterministic_conversation_summary"));
});
