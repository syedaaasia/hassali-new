import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  AutoIntelligenceRouter,
  resetAutoIntelligenceRouterStateForTests,
  type AutoRoutingPreferences
} from "../auto-intelligence-router";
import {
  IntelligenceAdapterRegistry,
  type IntelligenceAdapter
} from "../intelligence-adapter-registry";
import {
  createCapabilityProfile,
  unknownIntelligenceUsage,
  type IntelligenceCapabilityProfile,
  type IntelligenceFailureCategory,
  type IntelligenceHealthStatus,
  type IntelligenceModelDescriptor,
  type IntelligenceRequest,
  type IntelligenceResult,
  type IntelligenceStreamResult
} from "../intelligence-contract";

type TestCase = { name: string; run: () => Promise<void> | void };
const tests: TestCase[] = [];
const test = (name: string, run: TestCase["run"]) => tests.push({
  name,
  run: async () => {
    resetAutoIntelligenceRouterStateForTests();
    await run();
  }
});

function request(overrides: Partial<IntelligenceRequest> = {}): IntelligenceRequest {
  return {
    messages: [{ parts: [{ text: "Help me", type: "text" }], role: "user" }],
    mode: "ASK",
    requestedModel: "cloud/default",
    requiredCapabilities: ["text"],
    ...overrides
  };
}

function preferences(overrides: Partial<AutoRoutingPreferences> = {}): AutoRoutingPreferences {
  return {
    privacy: "allow-cloud",
    scopeId: `test-${Math.random()}`,
    ...overrides
  };
}

function model(input: {
  automaticFallback?: boolean;
  capabilities?: Partial<IntelligenceCapabilityProfile>;
  codingTier?: "high" | "low" | "medium" | "unknown";
  computeSource?: "byok-cloud" | "free-cloud" | "local-endpoint";
  cost?: number | null;
  id: string;
  providerId?: string;
}): IntelligenceModelDescriptor {
  const computeSource = input.computeSource ?? "free-cloud";
  return {
    availability: "available",
    capabilities: createCapabilityProfile({ text: "supported", streaming: "supported", ...input.capabilities }),
    computeSource,
    contextLimit: 128_000,
    displayName: input.id,
    inputModalities: input.capabilities?.vision === "supported" ? ["text", "image"] : ["text"],
    isLocal: computeSource === "local-endpoint",
    modelId: input.id,
    outputModalities: ["text"],
    pricing: input.cost === null || input.cost === undefined
      ? { currency: null, inputPerMillion: null, outputPerMillion: null, source: "unknown" }
      : { currency: "USD", inputPerMillion: input.cost, outputPerMillion: input.cost, source: "actual" },
    providerId: input.providerId ?? input.id.split("/")[0] ?? "fixture",
    rawProviderMetadata: {
      automaticFallback: Boolean(input.automaticFallback),
      codingTier: input.codingTier ?? "unknown"
    }
  };
}

function failure(category: IntelligenceFailureCategory, providerId: string, modelId: string): IntelligenceResult {
  return {
    ok: false,
    failure: {
      category,
      internal: { code: `FIXTURE_${category.toUpperCase().replaceAll("-", "_")}` },
      model: modelId,
      providerId,
      retryable: ["model-unavailable", "network", "provider-unavailable", "rate-limit", "timeout"].includes(category),
      safeUserMessage: "Fixture provider failed safely."
    }
  };
}

function streamFailure(category: IntelligenceFailureCategory, providerId: string, modelId: string): IntelligenceStreamResult {
  const result = failure(category, providerId, modelId);
  if (result.ok) throw new Error("Expected fixture failure.");
  return { ok: false, failure: result.failure };
}

function fixtureAdapter(input: {
  computeSource?: IntelligenceAdapter["computeSource"];
  defaultModelId?: string | null;
  health?: IntelligenceHealthStatus;
  id: string;
  invoke?: (request: IntelligenceRequest) => Promise<IntelligenceResult>;
  models: IntelligenceModelDescriptor[];
  stream?: (request: IntelligenceRequest) => Promise<IntelligenceStreamResult>;
}) {
  let invokeCount = 0;
  let streamCount = 0;
  const computeSource = input.computeSource ?? "free-cloud";
  const adapter: IntelligenceAdapter = {
    capabilities: createCapabilityProfile({
      reasoning: "supported",
      streaming: "supported",
      structuredOutput: "supported",
      text: "supported",
      tools: "supported",
      vision: "supported",
      webResearch: "supported"
    }),
    computeSource,
    defaultModelId: input.defaultModelId ?? null,
    health: async () => ({
      checkedAt: new Date().toISOString(),
      latencyMs: 10,
      providerId: input.id,
      reason: input.health === "loading" ? "Model is loading." : null,
      retryable: input.health === "loading" || input.health === "rate-limited",
      status: input.health ?? "ready"
    }),
    id: input.id,
    invoke: async (req) => {
      invokeCount += 1;
      if (input.invoke) return input.invoke(req);
      const servedModel = req.requestedModel ?? input.models[0]?.modelId ?? "unknown";
      return {
        ok: true,
        response: {
          citations: [],
          computeSource,
          content: [{ text: `${input.id} answer`, type: "text" }],
          finishReason: "stop",
          model: servedModel,
          providerId: input.id,
          toolCalls: [],
          usage: unknownIntelligenceUsage({ latencyMs: 1, model: servedModel, providerId: input.id })
        }
      };
    },
    models: async () => input.models,
    providerId: input.id,
    stream: async (req) => {
      streamCount += 1;
      if (input.stream) return input.stream(req);
      const servedModel = req.requestedModel ?? input.models[0]?.modelId ?? "unknown";
      return {
        ok: true,
        response: {
          computeSource,
          model: servedModel,
          providerId: input.id,
          stream: new ReadableStream({
            start(controller) {
              controller.enqueue({ text: `${input.id} stream`, type: "text" });
              controller.enqueue({ finishReason: "stop", type: "done" });
              controller.close();
            }
          })
        }
      };
    }
  };
  return { adapter, invokeCount: () => invokeCount, streamCount: () => streamCount };
}

function router(...adapters: IntelligenceAdapter[]) {
  const registry = new IntelligenceAdapterRegistry();
  adapters.forEach((adapter) => registry.register(adapter));
  return new AutoIntelligenceRouter(registry);
}

test("AUTO-01 default-only routing preserves the current preferred model", async () => {
  const cloud = fixtureAdapter({ id: "openrouter", models: [
    model({ id: "cloud/default" }),
    model({ automaticFallback: true, id: "cloud/free-fallback" }),
    model({ codingTier: "high", id: "cloud/paid-other" })
  ] });
  const result = await router(cloud.adapter).resolve(request(), preferences({ preferredModelId: "cloud/default" }));
  assert(result.ok);
  if (result.ok) {
    assert.equal(result.decision.primary.modelId, "cloud/default");
    assert.equal(result.decision.fallback?.modelId, "cloud/free-fallback");
  }
});

test("AUTO-02 prefer-local selects a healthy capable local model", async () => {
  const cloud = fixtureAdapter({ id: "openrouter", models: [model({ id: "cloud/default" })] });
  const local = fixtureAdapter({ computeSource: "local-endpoint", defaultModelId: "local/model", id: "ollama", models: [model({ computeSource: "local-endpoint", id: "local/model" })] });
  const result = await router(cloud.adapter, local.adapter).resolve(request(), preferences({ privacy: "prefer-local" }));
  assert(result.ok);
  if (result.ok) assert.equal(result.decision.primary.adapterId, "ollama");
});

test("AUTO-03 incapable local vision is rejected in favor of capable cloud", async () => {
  const local = fixtureAdapter({ computeSource: "local-endpoint", id: "ollama", models: [model({ capabilities: { vision: "unsupported" }, computeSource: "local-endpoint", id: "local/text" })] });
  const cloud = fixtureAdapter({ id: "openrouter", models: [model({ capabilities: { vision: "supported" }, id: "cloud/vision" })] });
  const result = await router(local.adapter, cloud.adapter).resolve(request({ requiredCapabilities: ["text", "vision"] }), preferences({ privacy: "prefer-local" }));
  assert(result.ok);
  if (result.ok) assert.equal(result.decision.primary.modelId, "cloud/vision");
});

test("AUTO-04 local-only capability failure makes zero cloud calls", async () => {
  const cloud = fixtureAdapter({ id: "openrouter", models: [model({ capabilities: { vision: "supported" }, id: "cloud/vision" })] });
  const local = fixtureAdapter({ computeSource: "local-endpoint", id: "ollama", models: [model({ capabilities: { vision: "unsupported" }, computeSource: "local-endpoint", id: "local/text" })] });
  const result = await router(cloud.adapter, local.adapter).invoke(
    request({ requiredCapabilities: ["text", "vision"] }),
    preferences({ privacy: "local-only" })
  );
  assert.equal(result.result.ok, false);
  assert.equal(cloud.invokeCount(), 0);
});

test("AUTO-05 a disabled source is absent and cannot be selected", async () => {
  const cloud = fixtureAdapter({ id: "openrouter", models: [model({ id: "cloud/default" })] });
  const result = await router(cloud.adapter).resolve(request(), preferences({ privacy: "prefer-local" }));
  assert(result.ok);
  if (result.ok) assert.equal(result.decision.primary.adapterId, "openrouter");
});

test("AUTO-06 a healthy zero-model Ollama source is ineligible without being called", async () => {
  const local = fixtureAdapter({ computeSource: "local-endpoint", id: "ollama", models: [] });
  const cloud = fixtureAdapter({ id: "openrouter", models: [model({ id: "cloud/default" })] });
  const result = await router(local.adapter, cloud.adapter).invoke(request(), preferences({ privacy: "prefer-local" }));
  assert(result.result.ok);
  assert.equal(local.invokeCount(), 0);
});

test("AUTO-07 loading llama.cpp yields to a ready alternative", async () => {
  const loading = fixtureAdapter({ computeSource: "local-endpoint", health: "loading", id: "llama-cpp", models: [model({ computeSource: "local-endpoint", id: "local/loading" })] });
  const cloud = fixtureAdapter({ id: "openrouter", models: [model({ id: "cloud/default" })] });
  const result = await router(loading.adapter, cloud.adapter).resolve(request(), preferences({ privacy: "prefer-local" }));
  assert(result.ok);
  if (result.ok) assert.equal(result.decision.primary.adapterId, "openrouter");
});

test("AUTO-08 configured BYOK models participate in Auto", async () => {
  const cloud = fixtureAdapter({ id: "openrouter", models: [model({ id: "cloud/default" })] });
  const byok = fixtureAdapter({ computeSource: "byok-cloud", defaultModelId: "byok/model", id: "openrouter-byok", models: [model({ computeSource: "byok-cloud", id: "byok/model" })] });
  const result = await router(cloud.adapter, byok.adapter).resolve(request(), preferences({ preferredModelId: "byok/model" }));
  assert(result.ok);
  if (result.ok) assert.equal(result.decision.primary.adapterId, "openrouter-byok");
});

test("AUTO-09 unknown required vision is not treated as supported", async () => {
  const uncertain = fixtureAdapter({ computeSource: "local-endpoint", id: "ollama", models: [model({ capabilities: { vision: "unknown" }, computeSource: "local-endpoint", id: "local/unknown" })] });
  const cloud = fixtureAdapter({ id: "openrouter", models: [model({ capabilities: { vision: "supported" }, id: "cloud/vision" })] });
  const result = await router(uncertain.adapter, cloud.adapter).resolve(request({ requiredCapabilities: ["text", "vision"] }), preferences({ privacy: "prefer-local" }));
  assert(result.ok);
  if (result.ok) assert.equal(result.decision.primary.modelId, "cloud/vision");
});

test("AUTO-10 reliability outranks lower known cost", async () => {
  const cheap = fixtureAdapter({ health: "degraded", id: "cheap", models: [model({ cost: 0, id: "cheap/model" })] });
  const reliable = fixtureAdapter({ id: "reliable", models: [model({ cost: 12, id: "reliable/model" })] });
  const result = await router(cheap.adapter, reliable.adapter).resolve(request({ requestedModel: undefined }), preferences());
  assert(result.ok);
  if (result.ok) assert.equal(result.decision.primary.adapterId, "reliable");
});

test("AUTO-11 retryable primary failure uses exactly one valid fallback", async () => {
  const primary = fixtureAdapter({ defaultModelId: "primary/model", id: "primary", invoke: async (req) => failure("timeout", "primary", req.requestedModel ?? "primary/model"), models: [model({ id: "primary/model" })] });
  const alternate = fixtureAdapter({ id: "alternate", models: [model({ id: "alternate/model" })] });
  const result = await router(primary.adapter, alternate.adapter).invoke(request({ requestedModel: "primary/model" }), preferences({ preferredModelId: "primary/model" }));
  assert.equal(result.attempts, 2);
  assert.equal(result.fallbackUsed, true);
  assert.equal(alternate.invokeCount(), 1);
});

test("AUTO-12 fallback failure stops after two provider attempts", async () => {
  const first = fixtureAdapter({ defaultModelId: "first/model", id: "first", invoke: async (req) => failure("timeout", "first", req.requestedModel ?? "first/model"), models: [model({ id: "first/model" })] });
  const second = fixtureAdapter({ id: "second", invoke: async (req) => failure("network", "second", req.requestedModel ?? "second/model"), models: [model({ id: "second/model" })] });
  const result = await router(first.adapter, second.adapter).invoke(request({ requestedModel: "first/model" }), preferences({ preferredModelId: "first/model" }));
  assert.equal(result.attempts, 2);
  assert.equal(first.invokeCount() + second.invokeCount(), 2);
  assert.equal(result.result.ok, false);
});

test("AUTO-13 invalid requests never trigger fallback", async () => {
  const primary = fixtureAdapter({ defaultModelId: "primary/model", id: "primary", invoke: async (req) => failure("invalid-request", "primary", req.requestedModel ?? "primary/model"), models: [model({ id: "primary/model" })] });
  const alternate = fixtureAdapter({ id: "alternate", models: [model({ id: "alternate/model" })] });
  const result = await router(primary.adapter, alternate.adapter).invoke(request({ requestedModel: "primary/model" }), preferences({ preferredModelId: "primary/model" }));
  assert.equal(result.attempts, 1);
  assert.equal(alternate.invokeCount(), 0);
});

test("AUTO-13B runtime capability mismatch uses one capable fallback", async () => {
  const primary = fixtureAdapter({ defaultModelId: "primary/model", id: "primary", invoke: async (req) => failure("unsupported-capability", "primary", req.requestedModel ?? "primary/model"), models: [model({ id: "primary/model" })] });
  const alternate = fixtureAdapter({ id: "alternate", models: [model({ id: "alternate/model" })] });
  const result = await router(primary.adapter, alternate.adapter).invoke(request({ requestedModel: "primary/model" }), preferences({ preferredModelId: "primary/model" }));
  assert.equal(result.attempts, 2);
  assert.equal(result.fallbackUsed, true);
  assert.equal(alternate.invokeCount(), 1);
});

test("AUTO-13C required research evidence gets one bounded meta-router retry", async () => {
  let attempt = 0;
  const automatic = fixtureAdapter({
    defaultModelId: "openrouter/free",
    id: "openrouter",
    invoke: async () => {
      attempt += 1;
      const servedModel = attempt === 1 ? "free/first" : "free/second";
      return {
        ok: true,
        response: {
          citations: attempt === 1 ? [] : [{ title: "Official evidence", url: "https://example.com/current" }],
          computeSource: "free-cloud",
          content: [{ text: "Current answer", type: "text" }],
          finishReason: "stop",
          model: servedModel,
          providerId: "openrouter",
          toolCalls: [],
          usage: unknownIntelligenceUsage({ latencyMs: 1, model: servedModel, providerId: "openrouter" })
        }
      };
    },
    models: [model({ automaticFallback: true, id: "openrouter/free" })]
  });
  const result = await router(automatic.adapter).invoke(request({
    features: { webResearch: { maxResults: 3 } },
    requestedModel: "openrouter/free",
    requiredCapabilities: ["text", "webResearch"]
  }), preferences({ preferredModelId: "openrouter/free" }));
  assert.equal(result.attempts, 2);
  assert.equal(result.fallbackUsed, true);
  assert.equal(automatic.invokeCount(), 2);
  assert(result.result.ok);
  if (result.result.ok) assert.equal(result.result.response.citations.length, 1);
});

test("AUTO-14 authentication failure temporarily excludes BYOK without a retry storm", async () => {
  const byok = fixtureAdapter({
    computeSource: "byok-cloud",
    defaultModelId: "byok/model",
    id: "openrouter-byok",
    invoke: async (req) => failure("authentication", "openrouter-byok", req.requestedModel ?? "byok/model"),
    models: [model({ computeSource: "byok-cloud", id: "byok/model" })]
  });
  const cloud = fixtureAdapter({ id: "openrouter", models: [model({ id: "cloud/default" })] });
  const auto = router(byok.adapter, cloud.adapter);
  const prefs = preferences({ preferredModelId: "byok/model", scopeId: "auth-failure" });
  const first = await auto.invoke(request(), prefs);
  const second = await auto.invoke(request(), prefs);
  assert.equal(first.result.ok, false);
  assert(second.result.ok);
  assert.equal(byok.invokeCount(), 1);
  assert.equal(cloud.invokeCount(), 1);
});

test("AUTO-15 a valid explicit override is honored", async () => {
  const cloud = fixtureAdapter({ id: "openrouter", models: [model({ id: "cloud/default" })] });
  const local = fixtureAdapter({ computeSource: "local-endpoint", id: "ollama", models: [model({ computeSource: "local-endpoint", id: "local/manual" })] });
  const result = await router(cloud.adapter, local.adapter).resolve(request(), preferences({ explicitOverride: { adapterId: "ollama", modelId: "local/manual" } }));
  assert(result.ok);
  if (result.ok) assert.equal(result.decision.primary.modelId, "local/manual");
});

test("AUTO-16 an incapable explicit override fails without substitution", async () => {
  const local = fixtureAdapter({ computeSource: "local-endpoint", id: "ollama", models: [model({ capabilities: { vision: "unsupported" }, computeSource: "local-endpoint", id: "local/manual" })] });
  const cloud = fixtureAdapter({ id: "openrouter", models: [model({ capabilities: { vision: "supported" }, id: "cloud/vision" })] });
  const result = await router(cloud.adapter, local.adapter).invoke(
    request({ requiredCapabilities: ["text", "vision"] }),
    preferences({ explicitOverride: { adapterId: "ollama", modelId: "local/manual" } })
  );
  assert.equal(result.result.ok, false);
  assert.equal(cloud.invokeCount(), 0);
});

test("AUTO-17 streaming failure before output may use one fallback", async () => {
  const primary = fixtureAdapter({
    defaultModelId: "primary/model",
    id: "primary",
    models: [model({ id: "primary/model" })],
    stream: async (req) => streamFailure("timeout", "primary", req.requestedModel ?? "primary/model")
  });
  const alternate = fixtureAdapter({ id: "alternate", models: [model({ id: "alternate/model" })] });
  const result = await router(primary.adapter, alternate.adapter).stream(request({ requestedModel: "primary/model", stream: true }), preferences({ preferredModelId: "primary/model" }));
  assert.equal(result.attempts, 2);
  assert.equal(alternate.streamCount(), 1);
});

test("AUTO-18 streaming output is never silently replaced after it begins", async () => {
  const primary = fixtureAdapter({
    defaultModelId: "primary/model",
    id: "primary",
    models: [model({ id: "primary/model" })],
    stream: async () => ({
      ok: true,
      response: {
        computeSource: "free-cloud",
        model: "primary/model",
        providerId: "primary",
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({ text: "partial", type: "text" });
            controller.error(new Error("interrupted"));
          }
        })
      }
    })
  });
  const alternate = fixtureAdapter({ id: "alternate", models: [model({ id: "alternate/model" })] });
  const result = await router(primary.adapter, alternate.adapter).stream(request({ requestedModel: "primary/model", stream: true }), preferences({ preferredModelId: "primary/model" }));
  assert.equal(result.attempts, 1);
  assert.equal(alternate.streamCount(), 0);
});

test("AUTO-19 CODE mode favors verified coding fitness", async () => {
  const generic = fixtureAdapter({ id: "generic", models: [model({ codingTier: "low", id: "generic/model" })] });
  const coding = fixtureAdapter({ id: "coding", models: [model({ codingTier: "high", id: "coding/model" })] });
  const result = await router(generic.adapter, coding.adapter).resolve(request({ mode: "CODE" }), preferences());
  assert(result.ok);
  if (result.ok) assert.equal(result.decision.primary.modelId, "coding/model");
});

test("AUTO-20 identical inputs produce the same stable route", async () => {
  const left = fixtureAdapter({ id: "alpha", models: [model({ id: "alpha/model" })] });
  const right = fixtureAdapter({ id: "beta", models: [model({ id: "beta/model" })] });
  const auto = router(left.adapter, right.adapter);
  const prefs = preferences({ scopeId: "deterministic" });
  const first = await auto.resolve(request({ requestedModel: undefined }), prefs);
  const second = await auto.resolve(request({ requestedModel: undefined }), prefs);
  assert(first.ok && second.ok);
  if (first.ok && second.ok) assert.deepEqual(first.decision.primary, second.decision.primary);
});

test("ASK Project Notes default remains collapsed while manual controls remain", async () => {
  const root = path.basename(process.cwd()).toLowerCase() === "web"
    ? process.cwd()
    : path.resolve(process.cwd(), "apps/web");
  const store = await readFile(path.join(root, "src/lib/project-notes-store.ts"), "utf8");
  const panel = await readFile(path.join(root, "src/components/shell/project-notes-panel.tsx"), "utf8");
  assert(store.includes("isOpen: false"));
  assert(!panel.includes("setIsOpen(desktop)"));
  assert(panel.includes("setIsOpen(true)"));
  assert(panel.includes("setIsOpen(false)"));
});

let passed = 0;
for (const entry of tests) {
  await entry.run();
  passed += 1;
  process.stdout.write(`PASS ${entry.name}\n`);
}
process.stdout.write(`\n${passed}/${tests.length} automatic routing checks passed.\n`);
