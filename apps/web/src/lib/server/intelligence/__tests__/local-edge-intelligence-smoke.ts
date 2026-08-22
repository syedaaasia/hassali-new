import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  AutoIntelligenceRouter,
  resetAutoIntelligenceRouterStateForTests,
  type AutoRoutingPreferences
} from "../auto-intelligence-router";
import { createConfiguredSourceAdapter } from "../configured-source-adapters";
import {
  IntelligenceAdapterRegistry,
  type IntelligenceAdapter
} from "../intelligence-adapter-registry";
import {
  createCapabilityProfile,
  unknownIntelligenceUsage,
  type IntelligenceCapabilityProfile,
  type IntelligenceComputeSource,
  type IntelligenceFailureCategory,
  type IntelligenceHealthStatus,
  type IntelligenceModelDescriptor,
  type IntelligenceRequest,
  type IntelligenceResult
} from "../intelligence-contract";
import {
  assessIntelligenceRuntimeFit,
  executionLocalityForComputeSource
} from "../local-edge-intelligence";
import {
  createOpenAICompatibleAdapter,
  normalizeLocalIntelligenceEndpoint
} from "../openai-compatible-adapter";
import { retrieveKnowledge } from "../../knowledge-memory/knowledge-memory";
import type { KnowledgeRecord } from "../../knowledge-memory/knowledge-types";

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
    messages: [{ parts: [{ text: "Explain this safely", type: "text" }], role: "user" }],
    mode: "ASK",
    requiredCapabilities: ["text"],
    ...overrides
  };
}

function preferences(overrides: Partial<AutoRoutingPreferences> = {}): AutoRoutingPreferences {
  return { privacy: "allow-cloud", scopeId: "run11", ...overrides };
}

function model(input: {
  capabilities?: Partial<IntelligenceCapabilityProfile>;
  computeSource?: IntelligenceComputeSource;
  contextLimit?: number | null;
  id: string;
  sizeBytes?: number;
}): IntelligenceModelDescriptor {
  const computeSource = input.computeSource ?? "free-cloud";
  return {
    availability: "available",
    capabilities: createCapabilityProfile({ text: "supported", ...input.capabilities }),
    computeSource,
    contextLimit: input.contextLimit ?? 32_000,
    displayName: input.id,
    inputModalities: input.capabilities?.vision === "supported" ? ["text", "image"] : ["text"],
    isLocal: computeSource === "local-endpoint" || computeSource === "hassali-local",
    modelId: input.id,
    outputModalities: ["text"],
    pricing: { currency: null, inputPerMillion: null, outputPerMillion: null, source: "unknown" },
    providerId: input.id.split("/")[0] ?? "fixture",
    rawProviderMetadata: input.sizeBytes ? { sizeBytes: input.sizeBytes } : undefined
  };
}

function success(providerId: string, modelId: string, computeSource: IntelligenceComputeSource, text = "Useful answer"): IntelligenceResult {
  return {
    ok: true,
    response: {
      citations: [],
      computeSource,
      executionLocality: executionLocalityForComputeSource(computeSource),
      content: text ? [{ text, type: "text" }] : [],
      finishReason: "stop",
      model: modelId,
      providerId,
      toolCalls: [],
      usage: unknownIntelligenceUsage({ latencyMs: 2, model: modelId, providerId })
    }
  };
}

function failure(category: IntelligenceFailureCategory, providerId: string, modelId: string): IntelligenceResult {
  return {
    ok: false,
    failure: {
      category,
      internal: { code: `RUN11_${category.toUpperCase().replaceAll("-", "_")}` },
      model: modelId,
      providerId,
      retryable: ["malformed-provider-response", "network", "provider-unavailable", "timeout"].includes(category),
      safeUserMessage: "The configured intelligence source could not complete this request."
    }
  };
}

function fixture(input: {
  capabilities?: Partial<IntelligenceCapabilityProfile>;
  computeSource?: IntelligenceComputeSource;
  health?: IntelligenceHealthStatus;
  id: string;
  invoke?: (value: IntelligenceRequest) => Promise<IntelligenceResult>;
  models: IntelligenceModelDescriptor[];
}) {
  let calls = 0;
  let lastRequest: IntelligenceRequest | null = null;
  const computeSource = input.computeSource ?? "free-cloud";
  const adapter: IntelligenceAdapter = {
    capabilities: createCapabilityProfile({ text: "supported", ...input.capabilities }),
    computeSource,
    executionLocality: executionLocalityForComputeSource(computeSource),
    health: async () => ({
      checkedAt: new Date().toISOString(),
      latencyMs: 2,
      providerId: input.id,
      reason: input.health === "ready" || !input.health ? null : "Fixture unavailable.",
      retryable: input.health !== "ready",
      status: input.health ?? "ready"
    }),
    id: input.id,
    invoke: async (value) => {
      calls += 1;
      lastRequest = value;
      return input.invoke
        ? input.invoke(value)
        : success(input.id, value.requestedModel ?? input.models[0]?.modelId ?? "unknown", computeSource);
    },
    models: async () => input.models,
    providerId: input.id
  };
  return { adapter, calls: () => calls, lastRequest: () => lastRequest };
}

function router(...adapters: IntelligenceAdapter[]) {
  const registry = new IntelligenceAdapterRegistry();
  adapters.forEach((adapter) => registry.register(adapter));
  return new AutoIntelligenceRouter(registry);
}

function knowledgeRecord(input: Partial<KnowledgeRecord> & Pick<KnowledgeRecord, "id" | "subject" | "value">): KnowledgeRecord {
  const now = new Date("2026-08-22T00:00:00.000Z");
  return {
    authority: { id: input.id, kind: "user" },
    confidence: 1,
    createdAt: now,
    effectiveFrom: now,
    expiresAt: null,
    factState: "confirmed",
    kind: "preference",
    ownerId: "user-a",
    privacy: "standard",
    projectId: null,
    provenance: { kind: "user_statement", reference: input.id },
    scope: { id: "user-a", kind: "user" },
    statement: `${input.subject}: ${input.value}`,
    status: "active",
    supersedesId: null,
    tags: [],
    updatedAt: now,
    ...input
  };
}

test("A local runtime discovery normalizes exactly the reported Ollama models", async () => {
  const adapter = createConfiguredSourceAdapter({
    fetchImpl: async (url) => {
      assert.match(String(url), /\/api\/tags$/);
      return Response.json({ models: [
        { model: "local/alpha", size: 1_000 },
        { model: "local/beta", size: 2_000 }
      ] });
    },
    getApiKey: () => null,
    source: {
      credentialConfigured: false,
      defaultModel: null,
      enabled: true,
      endpointUrl: "http://127.0.0.1:11434",
      health: null,
      id: "ollama",
      models: [],
      updatedAt: new Date().toISOString()
    }
  });
  const discovered = await adapter.discoverModels?.();
  assert.deepEqual(discovered?.map((item) => item.modelId), ["local/alpha", "local/beta"]);
  assert.equal(adapter.executionLocality?.environment, "server-local");
  assert(discovered?.every((item) => item.computeSource === "local-endpoint"));
});

test("B no local configuration leaves normal cloud routing intact", async () => {
  const cloud = fixture({ id: "cloud", models: [model({ id: "cloud/default" })] });
  const result = await router(cloud.adapter).resolve(request(), preferences());
  assert(result.ok);
  if (result.ok) assert.equal(result.decision.primary.adapterId, "cloud");
});

test("C local-preferred selects the compatible healthy local route first", async () => {
  const local = fixture({ computeSource: "local-endpoint", id: "ollama", models: [model({ computeSource: "local-endpoint", id: "shared/model" })] });
  const cloud = fixture({ id: "cloud", models: [model({ id: "cloud/model" })] });
  const result = await router(cloud.adapter, local.adapter).resolve(request(), preferences({ privacy: "prefer-local" }));
  assert(result.ok);
  if (result.ok) assert.equal(result.decision.primary.adapterId, "ollama");
});

test("D unusable local output falls back once to an allowed cloud route", async () => {
  const local = fixture({ computeSource: "local-endpoint", id: "ollama", invoke: async () => success("ollama", "local/model", "local-endpoint", ""), models: [model({ computeSource: "local-endpoint", id: "local/model" })] });
  const cloud = fixture({ id: "cloud", models: [model({ id: "cloud/model" })] });
  const result = await router(local.adapter, cloud.adapter).invoke(request(), preferences({ privacy: "prefer-local" }));
  assert.equal(result.attempts, 2);
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.result.ok, true);
  assert.equal(local.calls(), 1);
  assert.equal(cloud.calls(), 1);
});

test("E local-only failure never calls cloud and stops truthfully", async () => {
  const local = fixture({ computeSource: "local-endpoint", id: "ollama", invoke: async () => failure("provider-unavailable", "ollama", "local/model"), models: [model({ computeSource: "local-endpoint", id: "local/model" })] });
  const cloud = fixture({ id: "cloud", models: [model({ id: "cloud/model" })] });
  const result = await router(local.adapter, cloud.adapter).invoke(request(), preferences({ privacy: "local-only" }));
  assert.equal(result.attempts, 1);
  assert.equal(result.result.ok, false);
  assert.equal(cloud.calls(), 0);
});

test("F sensitive relevant context prefers local without adding unrelated context", async () => {
  const local = fixture({ computeSource: "local-endpoint", id: "ollama", models: [model({ computeSource: "local-endpoint", id: "local/model" })] });
  const cloud = fixture({ id: "cloud", models: [model({ id: "cloud/model" })] });
  const result = await router(local.adapter, cloud.adapter).invoke(request({
    messages: [{ parts: [{ text: "Relevant preference: concise replies", type: "text" }], role: "user" }],
    privacy: { containsSensitiveData: true }
  }), preferences({ privacy: "prefer-local" }));
  assert(result.result.ok);
  assert.equal(local.lastRequest()?.messages[0]?.parts[0]?.type, "text");
  assert.doesNotMatch(JSON.stringify(local.lastRequest()), /unrelated secret/i);
});

test("G request-level local-only privacy cannot be weakened by allow-cloud preferences", async () => {
  const local = fixture({ computeSource: "local-endpoint", id: "ollama", invoke: async () => failure("timeout", "ollama", "local/model"), models: [model({ computeSource: "local-endpoint", id: "local/model" })] });
  const cloud = fixture({ id: "cloud", models: [model({ id: "cloud/model" })] });
  const result = await router(local.adapter, cloud.adapter).invoke(request({ privacy: { dataLocality: "local-only" } }), preferences({ privacy: "allow-cloud" }));
  assert.equal(result.decision?.privacy, "local-only");
  assert.equal(cloud.calls(), 0);
});

test("H a text-only local model is skipped for vision", async () => {
  const local = fixture({ capabilities: { vision: "unsupported" }, computeSource: "local-endpoint", id: "ollama", models: [model({ capabilities: { vision: "unsupported" }, computeSource: "local-endpoint", id: "local/text" })] });
  const cloud = fixture({ capabilities: { vision: "supported" }, id: "cloud", models: [model({ capabilities: { vision: "supported" }, id: "cloud/vision" })] });
  const result = await router(local.adapter, cloud.adapter).resolve(request({ requiredCapabilities: ["text", "vision"] }), preferences({ privacy: "prefer-local" }));
  assert(result.ok);
  if (result.ok) assert.equal(result.decision.primary.adapterId, "cloud");
});

test("I declared local context overflow is skipped before invocation", async () => {
  const localModel = model({ computeSource: "local-endpoint", contextLimit: 100, id: "local/tiny" });
  const fit = assessIntelligenceRuntimeFit({ model: localModel, request: request({ messages: [{ parts: [{ text: "x".repeat(2_000), type: "text" }], role: "user" }] }) });
  assert.equal(fit.reason, "context_limit");
  const resourceFit = assessIntelligenceRuntimeFit({
    model: model({ computeSource: "local-endpoint", id: "local/large", sizeBytes: 8_000 }),
    request: request(),
    runtimeProfile: { availableMemoryBytes: 5_000, environment: "server" }
  });
  assert.equal(resourceFit.reason, "resource_limit");
  const local = fixture({ computeSource: "local-endpoint", id: "ollama", models: [localModel] });
  const cloud = fixture({ id: "cloud", models: [model({ id: "cloud/large" })] });
  const result = await router(local.adapter, cloud.adapter).invoke(request({ messages: [{ parts: [{ text: "x".repeat(2_000), type: "text" }], role: "user" }] }), preferences({ privacy: "prefer-local" }));
  assert(result.result.ok);
  assert.equal(local.calls(), 0);
});

test("J failing local route enters bounded cooldown and can recover after state refresh", async () => {
  const local = fixture({ computeSource: "local-endpoint", id: "ollama", invoke: async () => failure("timeout", "ollama", "local/model"), models: [model({ computeSource: "local-endpoint", id: "local/model" })] });
  const cloud = fixture({ id: "cloud", models: [model({ id: "cloud/model" })] });
  const auto = router(local.adapter, cloud.adapter);
  await auto.invoke(request(), preferences({ privacy: "prefer-local", scopeId: "cooldown" }));
  const duringCooldown = await auto.resolve(request(), preferences({ privacy: "prefer-local", scopeId: "cooldown" }));
  assert(duringCooldown.ok);
  if (duringCooldown.ok) assert.equal(duringCooldown.decision.primary.adapterId, "cloud");
  resetAutoIntelligenceRouterStateForTests();
  const recovered = await auto.resolve(request(), preferences({ privacy: "prefer-local", scopeId: "cooldown" }));
  assert(recovered.ok);
  if (recovered.ok) assert.equal(recovered.decision.primary.adapterId, "ollama");
});

test("K trusted loopback endpoints are accepted and remain server-local", () => {
  assert.equal(normalizeLocalIntelligenceEndpoint("http://localhost:11434"), "http://localhost:11434/");
  assert.equal(normalizeLocalIntelligenceEndpoint("http://127.0.0.1:8080/v1"), "http://127.0.0.1:8080/v1/");
  assert.equal(executionLocalityForComputeSource("local-endpoint").environment, "server-local");
});

test("L public file malformed credential and traversal endpoints fail before fetch", () => {
  const unsafe = [
    "https://example.com/v1",
    "file:///tmp/model",
    "not-a-url",
    "http://user:secret@localhost:11434",
    "http://localhost:11434/../admin",
    "http://localhost:11434/%2e%2e/admin"
  ];
  for (const value of unsafe) assert.throws(() => normalizeLocalIntelligenceEndpoint(value));
});

test("M loopback redirect escape fails and fetch is configured not to follow", async () => {
  let redirectMode: string | undefined;
  const adapter = createOpenAICompatibleAdapter({
    allowInsecureLoopback: true,
    baseUrl: "http://localhost:8080/v1",
    capabilities: { text: "supported" },
    computeSource: "local-endpoint",
    fetchImpl: async (_url, init) => {
      redirectMode = init?.redirect;
      return new Response(null, { headers: { location: "https://example.com/escape" }, status: 302 });
    },
    id: "local-openai",
    providerId: "local-openai"
  });
  const result = await adapter.invoke(request({ requestedModel: "local/model" }));
  assert.equal(redirectMode, "error");
  assert.equal(result.ok, false);
});

test("N empty discovery never pulls a model and cloud policy decides next route", async () => {
  const urls: string[] = [];
  const adapter = createConfiguredSourceAdapter({
    fetchImpl: async (url) => { urls.push(String(url)); return Response.json({ models: [] }); },
    getApiKey: () => null,
    source: { credentialConfigured: false, defaultModel: null, enabled: true, endpointUrl: "http://localhost:11434", health: null, id: "ollama", models: [], updatedAt: new Date().toISOString() }
  });
  assert.deepEqual(await adapter.discoverModels?.(), []);
  assert(urls.every((url) => !/pull|install/i.test(url)));
  const cloud = fixture({ id: "cloud", models: [model({ id: "cloud/model" })] });
  const resolution = await router(adapter, cloud.adapter).resolve(request(), preferences({ privacy: "prefer-local" }));
  assert(resolution.ok);
  if (resolution.ok) assert.equal(resolution.decision.primary.adapterId, "cloud");
});

test("O compatible local ASK works while cloud is offline", async () => {
  const local = fixture({ computeSource: "local-endpoint", id: "ollama", models: [model({ computeSource: "local-endpoint", id: "local/model" })] });
  const cloud = fixture({ health: "unavailable", id: "cloud", models: [model({ id: "cloud/model" })] });
  const result = await router(cloud.adapter, local.adapter).invoke(request(), preferences());
  assert(result.result.ok);
  if (result.result.ok) assert.equal(result.result.response.executionLocality?.environment, "server-local");
});

test("P local static generation cannot satisfy offline freshness", async () => {
  const local = fixture({ capabilities: { webResearch: "unsupported" }, computeSource: "local-endpoint", id: "ollama", models: [model({ capabilities: { webResearch: "unsupported" }, computeSource: "local-endpoint", id: "local/model" })] });
  const result = await router(local.adapter).invoke(request({ features: { webResearch: { maxResults: 3 } }, requiredCapabilities: ["text", "webResearch"] }), preferences({ privacy: "local-only" }));
  assert.equal(result.attempts, 0);
  assert.equal(result.result.ok, false);
  if (!result.result.ok) assert.equal(result.result.failure.category, "unsupported-capability");
  assert.equal(local.calls(), 0);
});

test("Q Run 10 retrieval sends only relevant non-secret memory to local inference", async () => {
  const records = [
    knowledgeRecord({ id: "relevant", subject: "writing style", value: "concise" }),
    knowledgeRecord({ id: "unrelated", subject: "favorite meal", value: "biryani" }),
    knowledgeRecord({ id: "secret", privacy: "sensitive", subject: "API token", value: "secret-value" })
  ];
  const packet = retrieveKnowledge(records, { mode: "ASK", ownerId: "user-a", text: "Use my concise writing style" });
  assert.match(packet.context, /concise/);
  assert.doesNotMatch(packet.context, /biryani|secret-value/);
  const local = fixture({ computeSource: "local-endpoint", id: "ollama", models: [model({ computeSource: "local-endpoint", id: "local/model" })] });
  await router(local.adapter).invoke(request({ messages: [{ parts: [{ text: packet.context, type: "text" }], role: "system" }, ...request().messages] }), preferences({ privacy: "local-only" }));
  assert.doesNotMatch(JSON.stringify(local.lastRequest()), /biryani|secret-value/);
});

test("R local empty result receives the same quality gate and bounded fallback", async () => {
  const local = fixture({ computeSource: "local-endpoint", id: "ollama", invoke: async () => success("ollama", "local/model", "local-endpoint", ""), models: [model({ computeSource: "local-endpoint", id: "local/model" })] });
  const cloud = fixture({ id: "cloud", models: [model({ id: "cloud/model" })] });
  const result = await router(local.adapter, cloud.adapter).invoke(request(), preferences({ privacy: "prefer-local" }));
  assert.equal(result.primaryFailureCategory, "malformed-provider-response");
  assert.equal(result.attempts, 2);
  assert(result.result.ok);

  const oversized = createOpenAICompatibleAdapter({
    allowInsecureLoopback: true,
    baseUrl: "http://localhost:8080/v1",
    capabilities: { text: "supported" },
    computeSource: "local-endpoint",
    fetchImpl: async () => Response.json({ choices: [{ message: { content: "x".repeat(70_000) } }] }),
    id: "oversized-local",
    maxResponseBytes: 64 * 1024,
    providerId: "oversized-local"
  });
  const oversizedResult = await oversized.invoke(request({ requestedModel: "local/model" }));
  assert.equal(oversizedResult.ok, false);
  if (!oversizedResult.ok) assert.equal(oversizedResult.failure.internal?.code, "PROVIDER_RESPONSE_TOO_LARGE");
});

test("S CODE local inference remains separated from approval and execution authority", async () => {
  const root = path.basename(process.cwd()).toLowerCase() === "web" ? process.cwd() : path.resolve(process.cwd(), "apps/web");
  const planner = await readFile(path.join(root, "src/lib/server/ai/adaptive-code-planner.ts"), "utf8");
  const approval = await readFile(path.join(root, "src/app/api/runtime/approve/route.ts"), "utf8");
  const executionPolicy = await readFile(path.join(root, "src/lib/server/runtime/secure-execution/execution-policy.ts"), "utf8");
  assert.match(planner, /APPROVAL_REQUIRED/);
  assert.match(executionPolicy, /execution broker/);
  assert.match(approval, /loadOwnedChatProposalApprovalState/);
});

test("T WEBSITE local inference remains proposal and revision gated", async () => {
  const root = path.basename(process.cwd()).toLowerCase() === "web" ? process.cwd() : path.resolve(process.cwd(), "apps/web");
  const approval = await readFile(path.join(root, "src/app/api/runtime/approve/route.ts"), "utf8");
  assert.match(approval, /website_approval/);
  assert.match(approval, /serverProjectRevision/);
  assert.match(approval, /This proposal failed validation and cannot be applied/);
});

test("U identical local and cloud model names retain distinct execution identities", async () => {
  const local = fixture({ computeSource: "local-endpoint", id: "ollama", models: [model({ computeSource: "local-endpoint", id: "qwen/shared" })] });
  const cloud = fixture({ id: "cloud", models: [model({ id: "qwen/shared" })] });
  const result = await router(local.adapter, cloud.adapter).resolve(request(), preferences({ privacy: "prefer-local" }));
  assert(result.ok);
  if (result.ok) {
    assert.notEqual(result.decision.primary.identity, result.decision.fallback?.identity);
    assert.match(result.decision.primary.identity, /ollama:local-endpoint/);
    assert.match(result.decision.fallback?.identity ?? "", /cloud:free-cloud/);
  }
});

test("V optional local failure does not invalidate deterministic memory retrieval", async () => {
  const core = retrieveKnowledge([knowledgeRecord({ id: "preference", subject: "writing style", value: "concise" })], {
    mode: "ASK", ownerId: "user-a", text: "my writing style"
  });
  const optionalLocal = fixture({ computeSource: "local-endpoint", health: "unavailable", id: "ollama", models: [] });
  const enrichment = await router(optionalLocal.adapter).invoke(request(), preferences({ privacy: "local-only" }));
  assert.equal(enrichment.result.ok, false);
  assert.match(core.context, /concise/);
});

let passed = 0;
for (const entry of tests) {
  await entry.run();
  passed += 1;
  process.stdout.write(`PASS ${entry.name}\n`);
}
process.stdout.write(`\n${passed}/${tests.length} local and edge intelligence checks passed.\n`);
