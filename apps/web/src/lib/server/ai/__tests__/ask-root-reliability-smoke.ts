import assert from "node:assert/strict";
import test from "node:test";
import { hassaliDefaultModelId } from "@/lib/model-registry";
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
import { resolveBehavioralDecision } from "../behavioral-intelligence";

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
        model: hassaliDefaultModelId,
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

test("production route completes bounded everyday arithmetic without a provider", async () => {
  const { answer, response } = await routeChat("If I have 17 apples and give away 6, how many remain?", []);
  assert.match(answer, /11 apples remain/i);
  assert.equal(response.headers.get("x-hassali-ask-response-kind"), "deterministic_answer");
  assert.equal(response.headers.get("x-hassali-ask-provider-call-count"), "0");
});

test("stable household explanations survive total provider failure through the epistemic foundation", async () => {
  for (const prompt of [
    "Briefly explain why detergent helps lift oil from dishes.",
    "Why does soap help wash grease from a pan?",
    "How can dishwashing liquid carry cooking oil away in water?"
  ]) {
    let providerCalls = 0;
    const messages = [{ content: prompt, role: "user" as const }];
    const result = await runAskBrain(brainInput(prompt, {
      conversationTranscript: { authoritative: true, messages, source: "owned_persistence", truncated: false },
      messages,
      providerCall: async () => {
        providerCalls += 1;
        return { status: "timeout", category: "provider_timeout", reason: "fixture timeout" };
      },
      providerCallOwnsRouting: true
    }));

    assert.equal(providerCalls, 0, prompt);
    assert.match(result.answer, /detergent molecules|grips oil|carry away/i, prompt);
    assert.doesNotMatch(result.answer, /couldn't|provider|recovery attempts/i, prompt);
    assert.equal(result.decision.completionMethod, "deterministic", prompt);
  }
});

test("ordinary narrative subtraction survives total provider failure", async () => {
  for (const [prompt, expected] of [
    ["A shelf had 96 books and 34 were borrowed. How many are still there?", "62 books remain."],
    ["A pantry contained 45 cans, and 12 were used. How many are left?", "33 cans remain."],
    ["The stall started with 70 tickets and 19 were sold. How many remain?", "51 tickets remain."]
  ] as const) {
    let providerCalls = 0;
    const messages = [{ content: prompt, role: "user" as const }];
    const result = await runAskBrain(brainInput(prompt, {
      conversationTranscript: { authoritative: true, messages, source: "owned_persistence", truncated: false },
      messages,
      providerCall: async () => {
        providerCalls += 1;
        return { status: "timeout", category: "provider_timeout", reason: "fixture timeout" };
      },
      providerCallOwnsRouting: true
    }));

    assert.equal(providerCalls, 0, prompt);
    assert.equal(result.answer, expected, prompt);
    assert.equal(result.decision.completionMethod, "deterministic", prompt);
  }
});

test("ordinary equal groups with number words complete without a provider", async () => {
  for (const [prompt, expected] of [
    ["Nine cartons hold six bottles each. How many bottles are there altogether?", "54 bottles altogether."],
    ["Eight baskets contain four apples each. How many apples in all?", "32 apples altogether."],
    ["Twelve trays with five cups in each tray. How many cups total?", "60 cups altogether."]
  ] as const) {
    let providerCalls = 0;
    const messages = [{ content: prompt, role: "user" as const }];
    const result = await runAskBrain(brainInput(prompt, {
      conversationTranscript: { authoritative: true, messages, source: "owned_persistence", truncated: false },
      messages,
      providerCall: async () => {
        providerCalls += 1;
        return { status: "failed", category: "provider_response_invalid", reason: "fixture invalid" };
      },
      providerCallOwnsRouting: true
    }));
    assert.equal(providerCalls, 0, prompt);
    assert.equal(result.answer, expected, prompt);
  }
});

test("conversational address does not make a concise correct answer fail its contract", async () => {
  await withConfiguredProvider(async () => {
    const prompt = "Mate, what's RAM for?";
    const messages = [{ role: "user" as const, content: prompt }];
    const behavior = resolveBehavioralDecision({
      messages,
      prompt,
      selectedMode: "ASK",
      workspace: { fileList: [] }
    });
    const { calls, providerCall } = providerSequence([{
      status: "ok",
      content: "RAM temporarily stores data and instructions your computer is actively using so the CPU can access them quickly.",
      servedModel: "test-model"
    }]);
    const result = await runAskBrain(brainInput(prompt, {
      behavior,
      conversationTranscript: { authoritative: true, messages, source: "owned_persistence", truncated: false },
      messages,
      providerCall
    }));

    assert.equal(calls.length, 1);
    assert.match(result.answer, /^RAM temporarily stores/i);
    assert.equal(result.decision.modelCallSucceeded, true);
    assert.equal(result.decision.failureStage, "none");
  });
});

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
  "write a summary",
  "summarize this chat",
  "write summary of the complete chat",
  "summarize everything we discussed",
  "give me a recap of this conversation",
  "what have we discussed so far?",
  "what did we talk about?",
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
  assert(classifyConversationHistoryIntent("write a summary", { hasConversationContext: true }));
  assert(classifyConversationHistoryIntent("what have we discussed so far?", { hasConversationContext: true }));
  assert(classifyConversationHistoryIntent("Create a handoff report of this conversation"));
  assert(classifyConversationHistoryIntent("Write a summary report of our discussion"));
  assert(classifyConversationHistoryIntent("Summarize our conversation for a report"));
  assert.equal(classifyConversationHistoryIntent("summarize this pasted article: hello world"), null);
  assert.equal(classifyConversationHistoryIntent("summarize this selected article"), null);
  assert.equal(classifyConversationHistoryIntent("summarize this file"), null);
  assert.equal(classifyConversationHistoryIntent("Pasted document: quarterly notes. Give me a summary"), null);
  assert.equal(classifyConversationHistoryIntent("write a summary", {
    artifactTargetAvailable: true,
    hasConversationContext: true
  }), null);
  assert.equal(prepareConversationSummary({
    artifactTargetAvailable: true,
    prompt: "write a summary",
    transcript: { authoritative: true, messages: baseConversation, source: "owned_persistence", truncated: false }
  }), null);
});

test("every conversation-summary provider attempt receives canonical secret-sanitized context", async () => {
  await withConfiguredProvider(async () => {
    const secrets = [
      "sk-test-super-secret-123456",
      "hunter2-secret",
      "mango-db-secret",
      "token-secret-123456",
      "private-key-secret-material",
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJoYXNzYWxpLXRlc3QifQ.signature-secret"
    ];
    const messages: ConversationHistoryMessage[] = [
      { role: "user", content: "Mango uses Python, PostgreSQL, and React." },
      { role: "assistant", content: "Mango is recorded." },
      { role: "user", content: "Actually Mango now uses SQLite instead of PostgreSQL." },
      { role: "user", content: "API key: sk-test-super-secret-123456" },
      { role: "user", content: "password=hunter2-secret token=token-secret-123456" },
      { role: "user", content: "postgres://mango:mango-db-secret@localhost/app" },
      { role: "user", content: "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJoYXNzYWxpLXRlc3QifQ.signature-secret" },
      { role: "user", content: "-----BEGIN PRIVATE KEY-----\nprivate-key-secret-material\n-----END PRIVATE KEY-----" },
      { role: "user", content: "write summary of the complete chat" }
    ];
    const { calls, providerCall } = providerSequence([
      { status: "failed", category: "provider_model_unavailable", reason: "primary unavailable" },
      {
        status: "ok",
        content: "Conversation summary\n\nMain topics\n- Mango uses Python, React, and SQLite.\n\nCurrent state\n- SQLite supersedes PostgreSQL as the current database.",
        servedModel: "fallback-model"
      }
    ]);
    const result = await runAskBrain({
      ...brainInput("write summary of the complete chat", {
        conversationTranscript: { authoritative: true, messages, source: "owned_persistence", truncated: false },
        messages,
        modelSelectionPolicy: "automatic",
        providerCall
      })
    });
    assert.equal(calls.length, 2);
    const outbound = JSON.stringify(calls);
    for (const secret of secrets) assert(!outbound.includes(secret), `Outbound provider context leaked ${secret}`);
    assert.match(outbound, /Mango/);
    assert.match(outbound, /SQLite/);
    assert.match(result.answer, /SQLite/);
    assert.equal(result.decision.completionMethod, "alternate_model");
  });
});

test("provider revision calls also receive sanitized context", async () => {
  await withConfiguredProvider(async () => {
    const messages: ConversationHistoryMessage[] = [
      { role: "user", content: "API key: sk-test-revision-secret-123456" },
      { role: "user", content: "Mango uses SQLite." },
      { role: "user", content: "write summary of the complete chat" }
    ];
    const { calls, providerCall } = providerSequence([
      { status: "ok", content: "Too short. API key: sk-test-revision-secret-123456", servedModel: "primary" },
      {
        status: "ok",
        content: "Conversation summary\n\nMain topics\n- Mango uses SQLite.\n\nCurrent state\n- SQLite is the current database.",
        servedModel: "primary"
      }
    ]);
    await runAskBrain(brainInput("write summary of the complete chat", {
      conversationTranscript: { authoritative: true, messages, source: "owned_persistence", truncated: false },
      messages,
      providerCall
    }));
    assert.equal(calls.length, 2);
    assert.doesNotMatch(JSON.stringify(calls), /sk-test-revision-secret-123456/);
  });
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

test("dependent follow-up uses relevant visible conversation evidence after all providers fail", async () => {
  const messages = [
    { role: "user" as const, content: "Explain database indexes." },
    { role: "assistant" as const, content: "A database index locates matching rows without scanning the entire table, which speeds up read queries. Maintaining the index adds work to inserts and updates." },
    { role: "user" as const, content: "Give me a customer email lookup example." },
    { role: "assistant" as const, content: "A CRM can search customer records by email address to retrieve the matching account and order history." },
    { role: "user" as const, content: "How would the database index we just discussed help that customer email lookup? Use two sentences." }
  ];
  const result = await runAskBrain(brainInput(messages.at(-1)!.content, {
    conversationTranscript: { authoritative: true, messages, source: "owned_persistence", truncated: false },
    messages,
    modelSelectionPolicy: "automatic",
    providerCall: async () => ({ status: "timeout", category: "provider_timeout", reason: "offline" }),
    providerCallOwnsRouting: true,
    requestUnderstanding: {
      conversationContext: "recent_required",
      evidenceAuthority: "irrelevant",
      freshnessRequirement: "timeless",
      memoryRequirement: "irrelevant",
      method: "conversation_reasoning",
      taskType: "follow_up",
      uncertainty: "ordinary"
    }
  }));

  assert.doesNotMatch(result.answer, /couldn't|provider|selected model/i);
  assert.match(result.answer, /database index/i);
  assert.match(result.answer, /customer|email/i);
  assert.equal(result.answer.match(/[.!?](?:\s|$)/g)?.length, 2);
});

test("conversation-grounded recovery does not answer a self-contained new topic from stale history", async () => {
  const messages = [
    { role: "user" as const, content: "Explain database indexes." },
    { role: "assistant" as const, content: "A database index speeds up row lookup while adding write maintenance." },
    { role: "user" as const, content: "Now explain photosynthesis." }
  ];
  const result = await runAskBrain(brainInput("Now explain photosynthesis.", {
    conversationTranscript: { authoritative: true, messages, source: "owned_persistence", truncated: false },
    messages,
    providerCall: async () => ({ status: "timeout", category: "provider_timeout", reason: "offline" }),
    providerCallOwnsRouting: true,
    requestUnderstanding: {
      conversationContext: "current_turn_only",
      evidenceAuthority: "irrelevant",
      freshnessRequirement: "timeless",
      memoryRequirement: "irrelevant",
      method: "model_reasoning",
      taskType: "general_knowledge",
      uncertainty: "ordinary"
    }
  }));

  assert.doesNotMatch(result.answer, /database index|row lookup|write maintenance/i);
  assert.match(result.answer, /couldn't finish|trustworthy result|available capabilities/i);
});
