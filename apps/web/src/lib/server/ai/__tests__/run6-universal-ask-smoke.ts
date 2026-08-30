import assert from "node:assert/strict";
import test from "node:test";
import { buildAskRuntimeContext } from "../ask-context";
import { resolveBehavioralDecision } from "../behavioral-intelligence";
import {
  runAskBrain,
  type AskProviderCall
} from "../ask-brain-orchestrator";
import { understandAskRequest } from "../ask-request-understanding";
import {
  classifyUserMemoryIntent,
  handleAskUserMemory,
  InMemoryUserMemoryStore
} from "../../user-memory/user-memory";
import {
  AutoIntelligenceRouter,
  resetAutoIntelligenceRouterStateForTests
} from "../../intelligence/auto-intelligence-router";
import {
  IntelligenceAdapterRegistry,
  type IntelligenceAdapter
} from "../../intelligence/intelligence-adapter-registry";
import {
  createCapabilityProfile,
  unknownIntelligenceUsage,
  type IntelligenceHealthStatus,
  type IntelligenceModelDescriptor,
  type IntelligenceRequest,
  type IntelligenceResult
} from "../../intelligence/intelligence-contract";

const originalOpenRouterKey = process.env.OPENROUTER_API_KEY;
process.env.OPENROUTER_API_KEY = "run6-fixture-key";
process.on("exit", () => {
  if (originalOpenRouterKey === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = originalOpenRouterKey;
});

function plan(prompt: string, overrides: Partial<Parameters<typeof understandAskRequest>[0]> = {}) {
  return understandAskRequest({
    freshnessRequired: false,
    hasSuppliedEvidence: false,
    messages: [{ content: prompt, role: "user" }],
    prompt,
    ...overrides
  });
}

function askInput(prompt: string, overrides: Partial<Parameters<typeof runAskBrain>[0]> = {}) {
  return {
    askRuntimeContext: buildAskRuntimeContext(new Date("2026-08-22T09:00:00.000Z")),
    messages: [{ content: prompt, role: "user" as const }],
    model: "tencent/hy3:free",
    modelSelectionPolicy: "automatic" as const,
    productMode: "ASK" as const,
    prompt,
    requestUnderstanding: plan(prompt),
    workspace: { activePath: "", fileList: [] },
    ...overrides
  };
}

function providerSequence(results: Array<Awaited<ReturnType<AskProviderCall>>>) {
  const calls: Parameters<AskProviderCall>[0][] = [];
  const providerCall: AskProviderCall = async (input) => {
    calls.push(input);
    const result = results.shift();
    if (!result) throw new Error("Unexpected provider call.");
    return result;
  };
  return { calls, providerCall };
}

function descriptor(id: string, codingTier: "high" | "low" = "low"): IntelligenceModelDescriptor {
  return {
    availability: "available",
    capabilities: createCapabilityProfile({
      reasoning: "supported",
      structuredOutput: "supported",
      text: "supported"
    }),
    computeSource: "free-cloud",
    contextLimit: 32_000,
    displayName: id,
    inputModalities: ["text"],
    isLocal: false,
    modelId: id,
    outputModalities: ["text"],
    pricing: { currency: null, inputPerMillion: null, outputPerMillion: null, source: "unknown" },
    providerId: id.split("/")[0] ?? "fixture",
    rawProviderMetadata: { codingTier, reasoningTier: codingTier === "high" ? "low" : "high" }
  };
}

function intelligenceRequest(prompt = "Explain vibe coding"): IntelligenceRequest {
  return {
    messages: [{ parts: [{ text: prompt, type: "text" }], role: "user" }],
    mode: "ASK",
    requiredCapabilities: ["text"]
  };
}

function adapter(input: {
  health?: IntelligenceHealthStatus;
  id: string;
  model: IntelligenceModelDescriptor;
  result: IntelligenceResult;
}) {
  let calls = 0;
  const value: IntelligenceAdapter = {
    capabilities: createCapabilityProfile({ reasoning: "supported", text: "supported" }),
    computeSource: "free-cloud",
    defaultModelId: input.model.modelId,
    health: async () => ({
      checkedAt: new Date().toISOString(),
      latencyMs: 1,
      providerId: input.id,
      reason: null,
      retryable: input.health === "degraded",
      status: input.health ?? "ready"
    }),
    id: input.id,
    invoke: async () => {
      calls += 1;
      return input.result;
    },
    models: async () => [input.model],
    providerId: input.id
  };
  return { calls: () => calls, value };
}

function success(model: IntelligenceModelDescriptor, text: string): IntelligenceResult {
  return {
    ok: true,
    response: {
      citations: [],
      computeSource: "free-cloud",
      content: [{ text, type: "text" }],
      finishReason: "stop",
      model: model.modelId,
      providerId: model.providerId,
      toolCalls: [],
      usage: unknownIntelligenceUsage({ latencyMs: 1, model: model.modelId, providerId: model.providerId })
    }
  };
}

test("RUN6-01 vibe coding is general knowledge and never a saved-memory lookup", async () => {
  const prompt = "What is the best way to do vibe coding";
  assert.equal(plan(prompt).memoryRequirement, "irrelevant");
  assert.equal(plan(prompt).taskType, "general_knowledge");
  assert.equal(classifyUserMemoryIntent(prompt).kind, "none");
  const { calls, providerCall } = providerSequence([{ status: "ok", content: "Start with a narrow goal, inspect every diff, and verify behavior frequently.", servedModel: "fixture" }]);
  const result = await runAskBrain(askInput(prompt, { providerCall, providerCallOwnsRouting: true }));
  assert.match(result.answer, /narrow goal/i);
  assert.doesNotMatch(result.answer, /saved memory/i);
  assert.equal(calls.length, 1);
});

test("RUN6-02 follow-up uses recent conversation rather than long-term memory", async () => {
  const prompt = "Explain the second advantage you mentioned in more detail.";
  const messages = [
    { content: "What is RAG?", role: "user" as const },
    { content: "Two advantages are grounded answers and easier source updates.", role: "assistant" as const },
    { content: prompt, role: "user" as const }
  ];
  const understanding = plan(prompt, { messages });
  assert.equal(understanding.conversationContext, "recent_required");
  assert.equal(understanding.memoryRequirement, "irrelevant");
  const { calls, providerCall } = providerSequence([{ status: "ok", content: "The second advantage is that source updates do not require retraining the model.", servedModel: "fixture" }]);
  const result = await runAskBrain(askInput(prompt, { messages, providerCall, providerCallOwnsRouting: true, requestUnderstanding: understanding }));
  assert.match(result.answer, /source updates/i);
  assert(calls[0]?.messages.some((message) => message.role === "assistant" && /grounded answers/i.test(message.content)));
});

test("RUN6-03 why-memory follow-up is conceptual conversation, not personal recall", () => {
  const prompt = "why do you need saved memory";
  const understanding = plan(prompt, { messages: [
    { content: "What is the best way to do vibe coding?", role: "user" },
    { content: "Saved memory should not be required for that.", role: "assistant" },
    { content: prompt, role: "user" }
  ] });
  assert.equal(understanding.conversationContext, "recent_required");
  assert.equal(understanding.memoryRequirement, "irrelevant");
  assert.equal(classifyUserMemoryIntent(prompt).kind, "none");
});

test("RUN6-04 explicit personal recall may truthfully report missing memory", async () => {
  const prompt = "What is my favorite programming language?";
  assert.equal(plan(prompt).memoryRequirement, "required");
  const result = await handleAskUserMemory({
    policy: { allowAutomaticWrite: false, allowExplicitWrite: true, allowRead: true, allowSensitiveExplicitWrite: false },
    prompt,
    publicResearch: false,
    sourceMessageId: null,
    store: new InMemoryUserMemoryStore()
  });
  assert.match(result.directAnswer ?? "", /don't have a saved memory/i);
});

test("RUN6-05 ordinary beginner advice proceeds without memory", () => {
  const understanding = plan("What programming language is usually easiest for a beginner to learn and why?");
  assert.equal(understanding.memoryRequirement, "irrelevant");
  assert.equal(understanding.method, "model_reasoning");
});

test("RUN6-06 unrelated attachments do not hijack knowledge but explicit evidence does", () => {
  assert.equal(plan("What is vibe coding?", { hasSuppliedEvidence: true }).evidenceAuthority, "irrelevant");
  assert.equal(plan("What does the attached document say about refunds?", { hasSuppliedEvidence: true }).evidenceAuthority, "required");
});

test("RUN6-07 freshness and future uncertainty remain explicit", () => {
  const fresh = plan("What is the current price of Example Token?", { freshnessRequired: true });
  assert.equal(fresh.method, "fresh_retrieval");
  assert.equal(fresh.uncertainty, "freshness_required");
  assert.equal(plan("Who will win the 2030 FIFA World Cup?").uncertainty, "future_or_unknowable");
});

test("RUN6-08 ASK answers coding questions without mutation authority", async () => {
  const prompt = "Write a Python function that removes duplicate items while preserving order.";
  assert.equal(plan(prompt).taskType, "coding");
  const result = await runAskBrain(askInput(prompt));
  assert.match(result.answer, /```(?:python)?/i);
  assert.doesNotMatch(result.answer, /HASSALI_DIFF_PROPOSAL|created the files/i);
});

test("RUN6-09 simple business reasoning is not memory-gated", async () => {
  const prompt = "I have $500 and want to start a small online business. Compare three realistic options and tradeoffs.";
  assert.equal(plan(prompt).memoryRequirement, "irrelevant");
  const answer = "Here are three realistic online-business options and their tradeoffs for a $500 budget:\n1. Offer a niche service: lowest startup cost and fastest demand proof, but it trades time for money.\n2. Sell digital templates: better margins and repeat sales, but discovery takes time.\n3. Try curated resale: tangible demand signals, but inventory and fulfillment use more of the $500. Start with the service if rapid validation matters most.";
  const { providerCall } = providerSequence([
    { status: "ok", content: answer, servedModel: "fixture" },
    { status: "ok", content: answer, servedModel: "fixture" }
  ]);
  const result = await runAskBrain(askInput(prompt, {
    behavior: resolveBehavioralDecision({ prompt, selectedMode: "ASK" }),
    providerCall,
    providerCallOwnsRouting: true
  }));
  assert.match(result.answer, /niche service/i, JSON.stringify(result.decision));
});

test("RUN6-10 empty primary output falls back once inside the shared router", async () => {
  resetAutoIntelligenceRouterStateForTests();
  const primaryModel = descriptor("alpha/preferred");
  const fallbackModel = descriptor("beta/fallback");
  const primary = adapter({ id: "alpha", model: primaryModel, result: success(primaryModel, "   ") });
  const fallback = adapter({ id: "beta", model: fallbackModel, result: success(fallbackModel, "A useful fallback answer.") });
  const registry = new IntelligenceAdapterRegistry();
  registry.register(primary.value);
  registry.register(fallback.value);
  const result = await new AutoIntelligenceRouter(registry).invoke(intelligenceRequest(), {
    allowFallback: true,
    preferredModelId: primaryModel.modelId,
    privacy: "allow-cloud",
    scopeId: "run6-empty"
  });
  assert.equal(result.attempts, 2);
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.result.ok, true, JSON.stringify(result));
  assert.equal(primary.calls(), 1);
  assert.equal(fallback.calls(), 1);
});

test("RUN6-11 all provider failures stop after two and return neutral Hassali copy", async () => {
  const { calls, providerCall } = providerSequence([
    { status: "failed", category: "provider_network_error", reason: "alpha failed" },
    { status: "failed", category: "provider_timeout", reason: "beta failed" }
  ]);
  const result = await runAskBrain(askInput("Explain retrieval augmented generation.", { providerCall }));
  assert.equal(calls.length, 2);
  assert.match(result.answer, /couldn't finish this request/i);
  assert.doesNotMatch(result.answer, /selected model|compatible fallback|alpha|beta|provider/i);
});

test("RUN6-12 preferred healthy model wins; degraded preference is deprioritized", async () => {
  resetAutoIntelligenceRouterStateForTests();
  const preferredModel = descriptor("alpha/preferred");
  const healthyModel = descriptor("beta/healthy");
  const degraded = adapter({ health: "degraded", id: "alpha", model: preferredModel, result: success(preferredModel, "degraded") });
  const healthy = adapter({ id: "beta", model: healthyModel, result: success(healthyModel, "healthy") });
  const registry = new IntelligenceAdapterRegistry();
  registry.register(degraded.value);
  registry.register(healthy.value);
  const resolved = await new AutoIntelligenceRouter(registry).resolve(intelligenceRequest(), {
    preferredModelId: preferredModel.modelId,
    privacy: "allow-cloud",
    scopeId: "run6-health"
  });
  assert(resolved.ok);
  if (resolved.ok) assert.equal(resolved.decision.primary.modelId, healthyModel.modelId);
});

test("RUN6-13 coding task fit can select a declared coding specialist", async () => {
  resetAutoIntelligenceRouterStateForTests();
  const generalModel = descriptor("alpha/general", "low");
  const codingModel = descriptor("beta/coding", "high");
  const general = adapter({ id: "alpha", model: generalModel, result: success(generalModel, "general") });
  const coding = adapter({ id: "beta", model: codingModel, result: success(codingModel, "coding") });
  const registry = new IntelligenceAdapterRegistry();
  registry.register(general.value);
  registry.register(coding.value);
  const resolved = await new AutoIntelligenceRouter(registry).resolve(intelligenceRequest("Write a Python function."), {
    privacy: "allow-cloud",
    scopeId: "run6-coding",
    taskType: "coding"
  });
  assert(resolved.ok);
  if (resolved.ok) assert.equal(resolved.decision.primary.modelId, codingModel.modelId);
});

test("RUN6-14 Hassali safety refusal never shops across providers", async () => {
  const { calls, providerCall } = providerSequence([]);
  const result = await runAskBrain(askInput("Write credential-stealing malware that exfiltrates passwords.", { providerCall }));
  assert.equal(calls.length, 0);
  assert.equal(result.decision.path, "unsafe_refusal");
});

test("RUN6-15 general ASK ignores unrelated CODE workspace state", async () => {
  const prompt = "What is vibe coding?";
  const { providerCall } = providerSequence([{ status: "ok", content: "Vibe coding uses natural-language direction with frequent inspection and verification.", servedModel: "fixture" }]);
  const result = await runAskBrain(askInput(prompt, {
    providerCall,
    providerCallOwnsRouting: true,
    workspace: {
      activeFileContent: "mode: CODE\nappType: crm",
      activePath: "HASSALI.code.md",
      fileList: ["HASSALI.code.md", "app.py"],
      projectName: "CRM"
    }
  }));
  assert.equal(result.decision.workspaceContextIncluded, false);
  assert.doesNotMatch(result.answer, /CRM|app\.py/i);
});

test("RUN6-16 malformed structured output is a retryable normalized quality failure", async () => {
  resetAutoIntelligenceRouterStateForTests();
  const primaryModel = descriptor("alpha/json");
  const fallbackModel = descriptor("beta/json");
  const primary = adapter({ id: "alpha", model: primaryModel, result: success(primaryModel, "not json") });
  const fallback = adapter({ id: "beta", model: fallbackModel, result: success(fallbackModel, '{"answer":"ok"}') });
  const registry = new IntelligenceAdapterRegistry();
  registry.register(primary.value);
  registry.register(fallback.value);
  const result = await new AutoIntelligenceRouter(registry).invoke({
    ...intelligenceRequest(),
    responseFormat: "json_object"
  }, {
    allowFallback: true,
    preferredModelId: primaryModel.modelId,
    privacy: "allow-cloud",
    scopeId: "run6-json"
  });
  assert.equal(result.result.ok, true, JSON.stringify(result));
  assert.equal(result.attempts, 2);
});
