import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { findHassaliModel } from "@/lib/model-registry";
import { resolveAskFallbackProviders } from "@/lib/server/ai/provider-router";
import {
  createCurrentOpenRouterAdapter,
  createCurrentIntelligenceRegistry,
  normalizeRegisteredModel
} from "../current-provider-adapter";
import {
  IntelligenceAdapterRegistry,
  IntelligenceAdapterRegistryError,
  type IntelligenceAdapter
} from "../intelligence-adapter-registry";
import {
  createCapabilityProfile,
  normalizeIntelligenceRequest,
  unknownIntelligenceUsage,
  type IntelligenceRequest
} from "../intelligence-contract";
import {
  createOpenAICompatibleAdapter,
  type OpenAICompatibleAdapterConfig
} from "../openai-compatible-adapter";

type TestCase = { name: string; run: () => Promise<void> | void };
const tests: TestCase[] = [];

function test(name: string, run: TestCase["run"]) {
  tests.push({ name, run });
}

function request(overrides: Partial<IntelligenceRequest> = {}): IntelligenceRequest {
  return {
    messages: [{ parts: [{ text: "Hello", type: "text" }], role: "user" }],
    mode: "ASK",
    requestedModel: "fixture/model",
    requiredCapabilities: ["text"],
    ...overrides
  };
}

function jsonResponse(payload: unknown, status = 200, headers?: Record<string, string>) {
  return new Response(JSON.stringify(payload), {
    headers: { "Content-Type": "application/json", ...headers },
    status
  });
}

function successPayload(overrides: Record<string, unknown> = {}) {
  return {
    choices: [{ finish_reason: "stop", message: { content: "Normalized answer" } }],
    model: "served/model",
    usage: { completion_tokens: 5, prompt_tokens: 7, total_tokens: 12 },
    ...overrides
  };
}

function compatibleAdapter(overrides: Partial<OpenAICompatibleAdapterConfig> = {}) {
  return createOpenAICompatibleAdapter({
    baseUrl: "https://provider.example/v1",
    capabilities: { streaming: "supported", structuredOutput: "supported", text: "supported" },
    computeSource: "free-cloud",
    fetchImpl: async () => jsonResponse(successPayload()),
    getApiKey: () => "test-key",
    id: "fixture",
    providerId: "fixture",
    requiresApiKey: true,
    ...overrides
  });
}

test("request normalization preserves modes, parts, and implied capabilities", () => {
  const ask = normalizeIntelligenceRequest(request());
  assert.equal(ask.mode, "ASK");
  assert.deepEqual(ask.requiredCapabilities, ["text"]);

  const code = normalizeIntelligenceRequest(request({ mode: "CODE", responseFormat: "json_object" }));
  assert(code.requiredCapabilities.includes("structuredOutput"));

  const multimodal = normalizeIntelligenceRequest(request({
    messages: [{
      parts: [
        { text: "Describe this", type: "text" },
        { detail: "low", source: { kind: "url", url: "https://assets.example/image.png" }, type: "image" },
        { extractedText: "Document body", name: "brief.txt", referenceId: "attachment-1", type: "file" }
      ],
      role: "user"
    }]
  }));
  assert(multimodal.requiredCapabilities.includes("vision"));
  assert.equal(multimodal.messages[0]?.parts.length, 3);
});

test("adapter registry resolves deterministically and rejects duplicates", () => {
  const registry = new IntelligenceAdapterRegistry().register(compatibleAdapter());
  assert.equal(registry.get("FIXTURE").providerId, "fixture");
  assert.throws(
    () => registry.register(compatibleAdapter()),
    (error) => error instanceof IntelligenceAdapterRegistryError && error.code === "ADAPTER_ALREADY_REGISTERED"
  );
});

test("unknown adapters and unconfirmed capabilities fail explicitly", async () => {
  const missing = await new IntelligenceAdapterRegistry().invoke("missing", request());
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.failure.internal?.code, "ADAPTER_NOT_REGISTERED");

  const adapter = compatibleAdapter({
    baseUrl: "https://provider.example/v1",
    capabilities: { text: "supported", vision: "unknown" },
    computeSource: "free-cloud",
    fetchImpl: async () => jsonResponse(successPayload()),
    id: "uncertain",
    providerId: "uncertain"
  });
  const uncertain = await new IntelligenceAdapterRegistry().register(adapter).invoke("uncertain", request({
    messages: [{
      parts: [{ source: { kind: "url", url: "https://assets.example/image.png" }, type: "image" }],
      role: "user"
    }]
  }));
  assert.equal(uncertain.ok, false);
  if (!uncertain.ok) {
    assert.equal(uncertain.failure.category, "unsupported-capability");
    assert.equal(uncertain.failure.internal?.code, "CAPABILITY_SUPPORT_UNKNOWN");
  }
});

test("local-only privacy cannot silently use cloud compute", async () => {
  const registry = new IntelligenceAdapterRegistry().register(compatibleAdapter());
  const result = await registry.invoke("fixture", request({ privacy: { dataLocality: "local-only" } }));
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.failure.internal?.code, "LOCAL_ONLY_COMPUTE_REQUIRED");
});

test("health distinguishes configuration, authentication, rate limits, and loading", async () => {
  const unconfigured = compatibleAdapter({
    baseUrl: "https://provider.example/v1",
    computeSource: "byok-cloud",
    getApiKey: () => null,
    id: "unconfigured",
    providerId: "unconfigured",
    requiresApiKey: true
  });
  assert.equal((await unconfigured.health()).status, "unconfigured");
  assert.equal((await compatibleAdapter().health()).status, "ready");

  const healthAdapter = (id: string, status: number) => compatibleAdapter({
    baseUrl: "https://provider.example/v1",
    computeSource: "free-cloud",
    fetchImpl: async () => new Response(null, { status }),
    getApiKey: () => "test-key",
    healthProbe: { path: "health" },
    id,
    providerId: id,
    requiresApiKey: true
  });
  assert.equal((await healthAdapter("auth", 401).health()).status, "authentication-failed");
  assert.equal((await healthAdapter("limited", 429).health()).status, "rate-limited");
  assert.equal((await healthAdapter("down", 503).health()).status, "unavailable");

  const loadingAdapter: IntelligenceAdapter = {
    capabilities: createCapabilityProfile({ text: "supported" }),
    computeSource: "local-endpoint",
    health: async () => ({
      checkedAt: new Date().toISOString(),
      latencyMs: null,
      providerId: "loading",
      reason: "Model is loading.",
      retryable: true,
      status: "loading"
    }),
    id: "loading",
    invoke: async (input) => ({
      ok: true,
      response: {
        citations: [],
        computeSource: "local-endpoint",
        content: [{ text: "Ready", type: "text" }],
        finishReason: "stop",
        model: input.requestedModel ?? "fixture/model",
        providerId: "loading",
        toolCalls: [],
        usage: unknownIntelligenceUsage({ latencyMs: 0, model: input.requestedModel ?? "fixture/model", providerId: "loading" })
      }
    }),
    providerId: "loading"
  };
  assert.equal((await new IntelligenceAdapterRegistry().register(loadingAdapter).health("loading")).status, "loading");
});

test("provider HTTP failures normalize to stable categories without response-string matching", async () => {
  const fixtures = [
    [401, "authentication"],
    [403, "authorization"],
    [402, "quota"],
    [404, "model-unavailable"],
    [429, "rate-limit"],
    [504, "timeout"],
    [503, "provider-unavailable"],
    [400, "invalid-request"]
  ] as const;
  for (const [status, category] of fixtures) {
    const adapter = compatibleAdapter({
      baseUrl: "https://provider.example/v1",
      capabilities: { text: "supported" },
      computeSource: "free-cloud",
      fetchImpl: async () => new Response("provider details", {
        headers: status === 429 ? { "retry-after": "2" } : undefined,
        status
      }),
      id: `status-${status}`,
      providerId: `status-${status}`
    });
    const result = await adapter.invoke(request());
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.failure.category, category);
      assert(!result.failure.safeUserMessage.includes("provider details"));
      if (status === 429) assert.equal(result.failure.retryAfterMs, 2_000);
    }
  }
});

test("standard provider error envelopes distinguish model availability capability and safety failures", async () => {
  const fixtures = [
    ["No endpoints found for this model", "model-unavailable"],
    ["This model does not support response_format", "unsupported-capability"],
    ["Request rejected by content safety policy", "content-safety"]
  ] as const;
  for (const [message, category] of fixtures) {
    const adapter = compatibleAdapter({
      fetchImpl: async () => new Response(JSON.stringify({ error: { message } }), {
        headers: { "content-type": "application/json" },
        status: 400
      })
    });
    const result = await adapter.invoke(request());
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.failure.category, category);
      assert(!result.failure.safeUserMessage.includes(message));
    }
  }
});

test("network and malformed responses normalize safely", async () => {
  const network = compatibleAdapter({
    baseUrl: "https://provider.example/v1",
    capabilities: { text: "supported" },
    computeSource: "free-cloud",
    fetchImpl: async () => { throw new TypeError("secret network detail"); },
    id: "network",
    providerId: "network"
  });
  const networkResult = await network.invoke(request());
  assert.equal(networkResult.ok, false);
  if (!networkResult.ok) {
    assert.equal(networkResult.failure.category, "network");
    assert(!networkResult.failure.safeUserMessage.includes("secret"));
  }

  const malformed = compatibleAdapter({
    baseUrl: "https://provider.example/v1",
    capabilities: { text: "supported" },
    computeSource: "free-cloud",
    fetchImpl: async () => new Response("not-json", { status: 200 }),
    id: "malformed",
    providerId: "malformed"
  });
  const malformedResult = await malformed.invoke(request());
  assert.equal(malformedResult.ok, false);
  if (!malformedResult.ok) assert.equal(malformedResult.failure.category, "malformed-provider-response");
});

test("response-body deadline is a timeout, not invalid JSON", async () => {
  const adapter = compatibleAdapter({
    fetchImpl: async (_url, init) => new Response(new ReadableStream({
      start(controller) {
        const signal = init?.signal;
        signal?.addEventListener("abort", () => controller.error(new DOMException("aborted", "AbortError")), { once: true });
      }
    }), { headers: { "content-type": "application/json" }, status: 200 }),
    timeoutMs: 1_000
  });
  const result = await adapter.invoke(request({ timeoutMs: 1_000 }));
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.failure.category, "timeout");
    assert.equal(result.failure.internal?.code, "PROVIDER_TIMEOUT");
  }
});

test("OpenAI-compatible requests preserve multimodal parts, tools, and normalized usage", async () => {
  let capturedBody: Record<string, unknown> | null = null;
  const adapter = compatibleAdapter({
    baseUrl: "https://provider.example/v1",
    capabilities: { structuredOutput: "supported", text: "supported", tools: "supported", vision: "supported" },
    computeSource: "byok-cloud",
    fetchImpl: async (_url, init) => {
      capturedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return jsonResponse(successPayload());
    },
    getApiKey: () => "private-test-key",
    id: "multimodal",
    providerId: "multimodal",
    requiresApiKey: true
  });
  const result = await adapter.invoke(request({
    messages: [{
      parts: [
        { text: "Inspect", type: "text" },
        { source: { data: "ZmFrZQ==", kind: "base64", mediaType: "image/png" }, type: "image" },
        { extractedText: "actual extracted body", name: "brief.md", type: "file" }
      ],
      role: "user"
    }],
    responseFormat: "json_object",
    tools: [{ inputSchema: { type: "object" }, name: "lookup" }]
  }));
  assert.equal(result.ok, true);
  const requestBody = capturedBody as Record<string, unknown> | null;
  assert(requestBody);
  assert.equal(requestBody.stream, false);
  assert.equal(typeof requestBody.response_format, "object");
  assert(Array.isArray(requestBody.messages));
  assert(Array.isArray(requestBody.tools));
  if (result.ok) {
    assert.equal(result.response.usage.inputTokens, 7);
    assert.equal(result.response.usage.outputTokens, 5);
    assert.equal(result.response.usage.totalTokens, 12);
    assert.equal(result.response.usage.cost.amount, null);
    assert.equal(result.response.usage.cost.source, "unknown");
  }
});

test("tool calls normalize without requiring text content", async () => {
  const adapter = compatibleAdapter({
    baseUrl: "https://provider.example/v1",
    capabilities: { text: "supported", tools: "supported" },
    computeSource: "free-cloud",
    fetchImpl: async () => jsonResponse(successPayload({
      choices: [{
        finish_reason: "tool_calls",
        message: {
          content: null,
          tool_calls: [{ function: { arguments: "{\"city\":\"Lahore\"}", name: "weather" }, id: "call-1" }]
        }
      }]
    })),
    id: "tools",
    providerId: "tools"
  });
  const result = await adapter.invoke(request({
    tools: [{ inputSchema: { type: "object" }, name: "weather" }]
  }));
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.response.content.length, 0);
    assert.equal(result.response.toolCalls[0]?.name, "weather");
    assert.deepEqual(result.response.toolCalls[0]?.arguments, { city: "Lahore" });
  }
});

test("stream events normalize text, usage, tool deltas, and completion", async () => {
  const sse = [
    'data: {"model":"served/model","choices":[{"delta":{"content":"Hello "}}]}',
    'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-1","function":{"name":"lookup","arguments":"{\\"id\\":"}}]}}]}',
    'data: {"model":"served/model","usage":{"prompt_tokens":2,"completion_tokens":3,"total_tokens":5},"choices":[{"delta":{},"finish_reason":"stop"}]}',
    "data: [DONE]",
    ""
  ].join("\n\n");
  const adapter = compatibleAdapter({
    baseUrl: "https://provider.example/v1",
    capabilities: { streaming: "supported", text: "supported", tools: "supported" },
    computeSource: "free-cloud",
    fetchImpl: async () => new Response(sse, { headers: { "Content-Type": "text/event-stream" } }),
    id: "stream",
    providerId: "stream"
  });
  const result = await new IntelligenceAdapterRegistry().register(adapter).stream("stream", request({
    stream: true,
    tools: [{ inputSchema: { type: "object" }, name: "lookup" }]
  }));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const events = [];
  for await (const event of result.response.stream) events.push(event);
  assert(events.some((event) => event.type === "text" && event.text === "Hello "));
  assert(events.some((event) => event.type === "tool-call-delta" && event.id === "call-1"));
  assert(events.some((event) => event.type === "usage" && event.usage.totalTokens === 5));
  assert(events.some((event) => event.type === "done" && event.finishReason === "stop"));
});

test("stream cancellation stays connected after response headers arrive", async () => {
  let providerAbortObserved = false;
  const adapter = compatibleAdapter({
    baseUrl: "https://provider.example/v1",
    capabilities: { streaming: "supported", text: "supported" },
    computeSource: "free-cloud",
    fetchImpl: async (_url, init) => new Response(new ReadableStream({
      start(controller) {
        init?.signal?.addEventListener("abort", () => {
          providerAbortObserved = true;
          controller.error(new DOMException("Aborted", "AbortError"));
        }, { once: true });
      }
    })),
    id: "cancel-stream",
    providerId: "cancel-stream"
  });
  const abortController = new AbortController();
  const result = await new IntelligenceAdapterRegistry().register(adapter).stream(
    "cancel-stream",
    request({ abortSignal: abortController.signal, stream: true })
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const reader = result.response.stream.getReader();
  const pendingRead = reader.read().catch(() => null);
  abortController.abort();
  await pendingRead;
  assert.equal(providerAbortObserved, true);
});

test("model discovery keeps undisclosed capabilities and pricing unknown", async () => {
  const adapter = compatibleAdapter({
    baseUrl: "https://provider.example/v1",
    computeSource: "local-endpoint",
    fetchImpl: async () => jsonResponse({ data: [{ id: "local-model", name: "Local Model" }] }),
    id: "discovery",
    modelDiscoveryPath: "models",
    providerId: "discovery"
  });
  const models = await adapter.discoverModels?.();
  assert.equal(models?.[0]?.modelId, "local-model");
  assert.equal(models?.[0]?.capabilities.vision, "unknown");
  assert.equal(models?.[0]?.pricing.source, "unknown");
});

test("endpoint configuration rejects embedded credentials and insecure remote HTTP", () => {
  assert.throws(() => compatibleAdapter({
    baseUrl: "https://user:secret@provider.example/v1",
    computeSource: "byok-cloud",
    id: "credentials",
    providerId: "credentials"
  }));
  assert.throws(() => compatibleAdapter({
    baseUrl: "http://provider.example/v1",
    computeSource: "byok-cloud",
    id: "insecure",
    providerId: "insecure"
  }));
  assert.doesNotThrow(() => compatibleAdapter({
    allowInsecureLoopback: true,
    baseUrl: "http://127.0.0.1:11434/v1",
    computeSource: "local-endpoint",
    id: "loopback",
    providerId: "loopback"
  }));
});

test("the current provider path invokes through the normalized registry", async () => {
  let authorization = "";
  const registry = createCurrentIntelligenceRegistry({
    fetchImpl: async (_url, init) => {
      authorization = new Headers(init?.headers).get("authorization") ?? "";
      return jsonResponse(successPayload());
    },
    getApiKey: () => "current-test-key"
  });
  const result = await registry.invoke("openrouter", request({ requestedModel: "tencent/hy3:free" }));
  assert.equal(result.ok, true);
  assert.equal(authorization, "Bearer current-test-key");
  if (result.ok) {
    assert.equal(result.response.providerId, "openrouter");
    assert.equal(result.response.computeSource, "free-cloud");
  }

  const model = findHassaliModel("tencent/hy3:free");
  assert(model);
  const descriptor = normalizeRegisteredModel(model);
  assert.equal(descriptor.providerId, "openrouter");
  assert.equal(descriptor.publisherId, "tencent");
  assert.equal(descriptor.pricing.source, "unknown");
});

test("the environment-managed free-cloud adapter exposes only verified free routes", async () => {
  const adapter = createCurrentOpenRouterAdapter({ getApiKey: () => "current-test-key" });
  const models = await adapter.models?.();
  assert(models?.length);
  assert(models.every((entry) => entry.rawProviderMetadata?.pricingClass === "free"));
  assert(models.every((entry) => entry.rawProviderMetadata?.availability === "verified"));
  assert(models.some((entry) => entry.modelId === "openrouter/free"));
  assert(!models.some((entry) => entry.modelId === "anthropic/claude-next"));
});

test("empty OpenAI-compatible responses retain the concrete served model", async () => {
  const adapter = compatibleAdapter({
    fetchImpl: async () => jsonResponse(successPayload({
      choices: [{ finish_reason: "stop", message: { content: "" } }],
      model: "free/concrete-empty"
    }))
  });
  const result = await adapter.invoke(request({ requestedModel: "openrouter/free" }));
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.failure.internal?.code, "PROVIDER_TEXT_EMPTY");
    assert.equal(result.failure.model, "free/concrete-empty");
  }
});

test("ASK and proposal entry points no longer parse provider HTTP shapes", async () => {
  const root = path.basename(process.cwd()).toLowerCase() === "web"
    ? process.cwd()
    : path.resolve(process.cwd(), "apps/web");
  const route = await readFile(path.join(root, "src/app/api/ai/chat/route.ts"), "utf8");
  const ask = await readFile(path.join(root, "src/lib/server/ai/ask-brain-orchestrator.ts"), "utf8");
  assert(route.includes("invokeAutoIntelligence"));
  assert(route.includes("streamAutoIntelligence"));
  assert(ask.includes("createAutoAskProviderCall"));
  assert(ask.includes("invokeAutoIntelligence"));
  assert(!route.includes("openrouter.ai/api/v1/chat/completions"));
  assert(!ask.includes("openrouter.ai/api/v1/chat/completions"));
  assert(!route.includes("choices?.[0]?.message"));
});

test("existing automatic fallback remains bounded to one secondary provider", () => {
  const originalKey = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = "contract-test-key";
  try {
    assert(resolveAskFallbackProviders("tencent/hy3:free").length <= 1);
  } finally {
    if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = originalKey;
  }
});

let passed = 0;
for (const entry of tests) {
  await entry.run();
  passed += 1;
  process.stdout.write(`PASS ${entry.name}\n`);
}

process.stdout.write(`\n${passed}/${tests.length} intelligence contract checks passed.\n`);
