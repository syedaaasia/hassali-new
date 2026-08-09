import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  AutoIntelligenceRouter,
  type AutoInvocationResult,
  type IntelligenceRouteCandidate
} from "../auto-intelligence-router";
import {
  defaultIntelligenceBudgetPolicy,
  emptyIntelligenceBudgetUsage,
  evaluateBudgetCandidate
} from "../intelligence-budget";
import {
  createCapabilityProfile,
  type IntelligenceModelDescriptor,
  type IntelligenceRequest,
  type IntelligenceResult
} from "../intelligence-contract";
import { IntelligenceAdapterRegistry, type IntelligenceAdapter } from "../intelligence-adapter-registry";
import {
  assertLocalBridgeOrigin,
  defaultLocalResourcePolicy,
  localFoundationStatus,
  localModelInstallEligibility,
  normalizeLocalBridgeEndpoint,
  normalizeLocalBridgeInfo
} from "../hassali-local-contract";
import {
  buildIntelligenceUsageRecord,
  meterIntelligenceResult
} from "../intelligence-metering";
import {
  DurableIntelligenceSecretStore,
  IntelligenceSecretCipher,
  environmentIntelligenceSecretStore,
  resetEnvironmentIntelligenceSecretStoreForTests
} from "../intelligence-secret-store";

type TestCase = { name: string; run: () => Promise<void> | void };
const tests: TestCase[] = [];
const test = (name: string, run: TestCase["run"]) => tests.push({ name, run });

function secretFixture() {
  const records = new Map<string, { authTag: string; ciphertext: string; iv: string; keyVersion: string }>();
  const key = (userId: string, sourceId: string) => `${userId}:${sourceId}`;
  const backend = {
    delete: async (userId: string, sourceId: string) => records.delete(key(userId, sourceId)),
    exists: async (userId: string, sourceId: string) => records.has(key(userId, sourceId)),
    get: async (userId: string, sourceId: string) => records.get(key(userId, sourceId)) ?? null,
    put: async (userId: string, sourceId: string, envelope: { authTag: string; ciphertext: string; iv: string; keyVersion: string }) => {
      records.set(key(userId, sourceId), envelope);
    }
  };
  return {
    records,
    store: new DurableIntelligenceSecretStore(backend, new IntelligenceSecretCipher(Buffer.alloc(32, 7), "v1"))
  };
}

function candidate(input: Partial<IntelligenceRouteCandidate> = {}): IntelligenceRouteCandidate {
  return {
    adapterId: "managed",
    budgetWarnings: [],
    computeSource: "managed-cloud",
    costScope: "managed",
    estimatedRequestCostMicros: null,
    health: "ready",
    isLocal: false,
    knownCostPerMillion: null,
    modelId: "fixture/model",
    providerId: "fixture",
    reasonCodes: ["HEALTHY_SOURCE"],
    score: 100,
    ...input
  };
}

function successResult(costSource: "actual" | "estimated" | "not-applicable" | "unknown" = "unknown"): IntelligenceResult {
  return {
    ok: true,
    response: {
      citations: [],
      computeSource: "managed-cloud",
      content: [{ text: "answer", type: "text" }],
      finishReason: "stop",
      model: "fixture/model",
      providerId: "fixture",
      toolCalls: [],
      usage: {
        cost: { amount: costSource === "actual" ? 0.02 : null, currency: costSource === "actual" ? "USD" : null, source: costSource },
        inputTokens: 10,
        latencyMs: 20,
        model: "fixture/model",
        outputTokens: 5,
        providerId: "fixture",
        totalTokens: 15
      }
    }
  };
}

function request(): IntelligenceRequest {
  return {
    messages: [{ parts: [{ text: "private prompt that must never be metered", type: "text" }], role: "user" }],
    metadata: { projectId: "project-id", traceId: "trace-id" },
    mode: "ASK",
    requiredCapabilities: ["text"]
  };
}

function outcome(input: {
  fallback?: IntelligenceRouteCandidate;
  primary?: IntelligenceRouteCandidate;
  primaryFailureCategory?: "timeout";
  result?: IntelligenceResult;
} = {}): AutoInvocationResult<IntelligenceResult> {
  const primary = input.primary ?? candidate();
  return {
    attempts: input.fallback ? 2 : 1,
    decision: {
      fallback: input.fallback ?? null,
      preferredCapabilities: [],
      primary,
      privacy: "allow-cloud",
      requiredCapabilities: ["text"],
      taskTier: "standard"
    },
    fallbackUsed: Boolean(input.fallback),
    primaryFailureCategory: input.primaryFailureCategory ?? null,
    result: input.result ?? successResult()
  };
}

function model(id: string, input: { capabilities?: Partial<ReturnType<typeof createCapabilityProfile>>; cost?: number; local?: boolean } = {}): IntelligenceModelDescriptor {
  return {
    availability: "available",
    capabilities: createCapabilityProfile({ streaming: "supported", text: "supported", ...input.capabilities }),
    computeSource: input.local ? "local-endpoint" : "managed-cloud",
    contextLimit: 32_000,
    displayName: id,
    inputModalities: ["text"],
    isLocal: Boolean(input.local),
    modelId: id,
    outputModalities: ["text"],
    pricing: input.cost === undefined
      ? { currency: null, inputPerMillion: null, outputPerMillion: null, source: "unknown" }
      : { currency: "USD", inputPerMillion: input.cost, outputPerMillion: input.cost, source: "actual" },
    providerId: id.split("/")[0] ?? id
  };
}

function adapter(id: string, models: IntelligenceModelDescriptor[], local = false): IntelligenceAdapter {
  return {
    capabilities: createCapabilityProfile({ streaming: "supported", text: "supported" }),
    computeSource: local ? "local-endpoint" : "managed-cloud",
    health: async () => ({ checkedAt: new Date().toISOString(), latencyMs: 1, providerId: id, reason: null, retryable: false, status: "ready" }),
    id,
    invoke: async (input) => ({ ...successResult(), response: { ...(successResult() as Extract<IntelligenceResult, { ok: true }>).response, model: input.requestedModel ?? models[0]!.modelId } }),
    models: async () => models,
    providerId: id
  };
}

test("SECRET-01 durable BYOK ciphertext never contains plaintext", async () => {
  const fixture = secretFixture();
  await fixture.store.put("user-a", "openrouter-byok", "private-api-key");
  assert(!JSON.stringify([...fixture.records.values()]).includes("private-api-key"));
  assert.equal(await fixture.store.get("user-a", "openrouter-byok"), "private-api-key");
});

test("SECRET-02 client settings contracts expose no encryption envelope", async () => {
  const root = path.basename(process.cwd()).toLowerCase() === "web" ? process.cwd() : path.resolve(process.cwd(), "apps/web");
  const clientContract = await readFile(path.join(root, "src/lib/intelligence-sources.ts"), "utf8");
  const route = await readFile(path.join(root, "src/app/api/settings/intelligence/route.ts"), "utf8");
  assert.doesNotMatch(clientContract, /ciphertext|authTag|credentialIv|masterKey/i);
  assert.doesNotMatch(route, /credentialCiphertext|credentialAuthTag|masterKey/i);
});

test("SECRET-03 another user cannot decrypt or retrieve a credential", async () => {
  const fixture = secretFixture();
  await fixture.store.put("user-a", "openrouter-byok", "user-a-key");
  assert.equal(await fixture.store.get("user-b", "openrouter-byok"), null);
});

test("SECRET-04 tampered ciphertext fails AES-GCM authentication", async () => {
  const fixture = secretFixture();
  await fixture.store.put("user-a", "openrouter-byok", "untampered-key");
  const record = fixture.records.get("user-a:openrouter-byok")!;
  record.ciphertext = Buffer.from("tampered").toString("base64");
  await assert.rejects(() => fixture.store.get("user-a", "openrouter-byok"));
});

test("SECRET-05 missing master key never creates a durable plaintext fallback", () => {
  const previous = process.env.HASSALI_INTELLIGENCE_MASTER_KEY;
  delete process.env.HASSALI_INTELLIGENCE_MASTER_KEY;
  resetEnvironmentIntelligenceSecretStoreForTests();
  assert.equal(environmentIntelligenceSecretStore(), null);
  if (previous === undefined) delete process.env.HASSALI_INTELLIGENCE_MASTER_KEY;
  else process.env.HASSALI_INTELLIGENCE_MASTER_KEY = previous;
  resetEnvironmentIntelligenceSecretStoreForTests();
});

test("SECRET-06 disconnect removes the persisted credential", async () => {
  const fixture = secretFixture();
  await fixture.store.put("user-a", "openrouter-byok", "delete-me");
  assert.equal(await fixture.store.delete("user-a", "openrouter-byok"), true);
  assert.equal(await fixture.store.exists("user-a", "openrouter-byok"), false);
});

test("METER-01 one success creates one normalized metadata-only request record", () => {
  const record = buildIntelligenceUsageRecord({ completedAt: new Date(200), outcome: outcome(), request: request(), startedAt: new Date(100) });
  assert.equal(record.attemptCount, 1);
  assert.equal(record.attempts.length, 1);
  assert.equal(record.totalTokens, 15);
});

test("METER-02 fallback success records two attempts and one final request", () => {
  const fallback = candidate({ adapterId: "fallback", modelId: "fallback/model", providerId: "fallback" });
  const record = buildIntelligenceUsageRecord({
    completedAt: new Date(200),
    outcome: outcome({ fallback, primaryFailureCategory: "timeout" }),
    request: request(),
    startedAt: new Date(100)
  });
  assert.equal(record.attemptCount, 2);
  assert.equal(record.attempts.length, 2);
  assert.equal(record.attempts[0]?.failureCategory, "timeout");
  assert.equal(record.sourceId, "fallback");
});

test("METER-03 unknown provider cost remains unknown rather than zero", () => {
  const record = buildIntelligenceUsageRecord({ completedAt: new Date(2), outcome: outcome(), request: request(), startedAt: new Date(1) });
  assert.equal(record.costSource, "unknown");
  assert.equal(record.costAmountMicros, null);
});

test("METER-04 prompts and file contents are absent from usage records", () => {
  const record = buildIntelligenceUsageRecord({ completedAt: new Date(2), outcome: outcome(), request: request(), startedAt: new Date(1) });
  assert(!JSON.stringify(record).includes("private prompt"));
});

test("METER-05 local inference records no external token-provider charge", () => {
  const local = candidate({ adapterId: "ollama", computeSource: "local-endpoint", costScope: "local", isLocal: true });
  const record = buildIntelligenceUsageRecord({ completedAt: new Date(2), outcome: outcome({ primary: local }), request: request(), startedAt: new Date(1) });
  assert.equal(record.costScope, "local");
  assert.equal(record.costSource, "not-applicable");
  assert.equal(record.costAmountMicros, null);
});

test("METER-06 persistence failure does not convert successful inference into failure", async () => {
  const originalWarn = console.warn;
  console.warn = () => undefined;
  try {
    const result = await meterIntelligenceResult({
      externalUserId: "user-a",
      outcome: outcome(),
      persist: async () => { throw new Error("database unavailable"); },
      request: request(),
      startedAt: new Date()
    });
    assert.equal(result.result.ok, true);
  } finally {
    console.warn = originalWarn;
  }
});

test("BUDGET-01 Off preserves candidate eligibility", () => {
  assert.equal(evaluateBudgetCandidate({ estimatedCostMicros: null, scope: "managed" }).eligible, true);
});

test("BUDGET-02 Warn reports a limit issue without blocking", () => {
  const evaluation = evaluateBudgetCandidate({
    context: {
      policy: { ...defaultIntelligenceBudgetPolicy, managedPerRequestLimitMicros: 1, mode: "warn" },
      usage: emptyIntelligenceBudgetUsage
    },
    estimatedCostMicros: 2,
    scope: "managed"
  });
  assert.equal(evaluation.eligible, true);
  assert(evaluation.warnings.length > 0);
});

test("BUDGET-03 Strict excludes a provably over-limit managed candidate", () => {
  assert.equal(evaluateBudgetCandidate({
    context: {
      policy: { ...defaultIntelligenceBudgetPolicy, managedPerRequestLimitMicros: 1, mode: "strict" },
      usage: emptyIntelligenceBudgetUsage
    },
    estimatedCostMicros: 2,
    scope: "managed"
  }).eligible, false);
});

test("BUDGET-04 capability remains a hard gate before economics", async () => {
  const registry = new IntelligenceAdapterRegistry();
  registry.register(adapter("cheap", [model("cheap/model", { cost: 0 })]));
  registry.register(adapter("capable", [model("capable/model", { capabilities: { structuredOutput: "supported" }, cost: 20 })]));
  const resolved = await new AutoIntelligenceRouter(registry).resolve({ ...request(), requiredCapabilities: ["text", "structuredOutput"] }, { privacy: "allow-cloud" });
  assert.equal(resolved.ok, true);
  if (resolved.ok) assert.equal(resolved.decision.primary.adapterId, "capable");
});

test("BUDGET-05 Strict never treats unknown managed price as zero", () => {
  assert.equal(evaluateBudgetCandidate({
    context: {
      policy: { ...defaultIntelligenceBudgetPolicy, managedMonthlyLimitMicros: 100, mode: "strict" },
      usage: emptyIntelligenceBudgetUsage
    },
    estimatedCostMicros: null,
    scope: "managed"
  }).eligible, false);
});

test("BUDGET-06 local execution remains eligible without an external token charge", () => {
  assert.equal(evaluateBudgetCandidate({
    context: {
      policy: { ...defaultIntelligenceBudgetPolicy, managedMonthlyLimitMicros: 0, mode: "strict" },
      usage: emptyIntelligenceBudgetUsage
    },
    estimatedCostMicros: null,
    scope: "local"
  }).eligible, true);
});

test("BUDGET-07 Strict reports budget when a capable model cannot satisfy the limit", async () => {
  const registry = new IntelligenceAdapterRegistry();
  registry.register(adapter("incapable", [model("incapable/model", { cost: 0 })]));
  registry.register(adapter("capable", [model("capable/model", {
    capabilities: { structuredOutput: "supported" },
    cost: 20
  })]));
  const resolved = await new AutoIntelligenceRouter(registry).resolve(
    { ...request(), requiredCapabilities: ["text", "structuredOutput"] },
    {
      budget: {
        policy: { ...defaultIntelligenceBudgetPolicy, managedPerRequestLimitMicros: 1, mode: "strict" },
        usage: emptyIntelligenceBudgetUsage
      },
      privacy: "allow-cloud"
    }
  );
  assert.equal(resolved.ok, false);
  if (!resolved.ok) assert.equal(resolved.failure.internal?.code, "STRICT_BUDGET_NO_ELIGIBLE_MODEL");
});

test("LOCAL-01 unpaired foundation has no eligible models", () => {
  assert.deepEqual(localFoundationStatus(), {
    companionInstalled: false,
    companionPaired: false,
    modelsAvailable: 0,
    protocolVersion: "1",
    status: "foundation-only"
  });
});

test("LOCAL-02 protocol mismatch fails clearly", () => {
  assert.throws(() => normalizeLocalBridgeInfo({ companionVersion: "0.1", endpoint: "http://127.0.0.1:45831", hardware: null, paired: false, protocolVersion: "2", runtimes: [] }), /incompatible/);
});

test("LOCAL-03 unknown hardware fields remain unknown", () => {
  const bridge = normalizeLocalBridgeInfo({ companionVersion: "0.1", endpoint: "http://127.0.0.1:45831", hardware: null, paired: false, protocolVersion: "1", runtimes: [] });
  assert.equal(bridge.hardware, null);
});

test("LOCAL-04 browser hardware values are never fabricated", async () => {
  const source = await readFile(path.resolve(process.cwd(), "src/lib/server/intelligence/hassali-local-contract.ts"), "utf8");
  assert.doesNotMatch(source, /navigator\.(hardwareConcurrency|deviceMemory)|webgl/i);
});

test("LOCAL-05 resource defaults disable hidden background work and downloads", () => {
  assert.equal(defaultLocalResourcePolicy.allowBackgroundInference, false);
  assert.equal(defaultLocalResourcePolicy.allowModelDownloads, false);
  assert.equal(defaultLocalResourcePolicy.allowModelAutoLoad, false);
  assert.equal(defaultLocalResourcePolicy.pauseOnBattery, true);
});

const unknownLicenseArtifact = {
  artifactUrl: "https://models.example/fixture.gguf",
  capabilities: ["text"],
  checksum: null,
  creator: "Fixture",
  format: "gguf",
  license: { commercialUseVerified: null, identifier: null, redistributionVerified: null, sourceUrl: null, verifiedAt: null },
  minimumMemoryBytes: null,
  modelId: "fixture/model",
  quantization: "Q4_K_M",
  recommendedMemoryBytes: null,
  runtime: "llama-cpp" as const,
  sizeBytes: 1_000
};

test("LOCAL-06 missing checksum is not install eligible", () => {
  assert.equal(localModelInstallEligibility(unknownLicenseArtifact).eligible, false);
});

test("LOCAL-07 unknown license never becomes commercially safe", () => {
  const result = localModelInstallEligibility(unknownLicenseArtifact);
  assert.equal(result.licenseCommercialUse, null);
  assert.equal(result.licenseRedistribution, null);
});

test("LOCAL-08 fake paired companion metadata normalizes without creating models", () => {
  const bridge = normalizeLocalBridgeInfo({ companionVersion: "0.1", endpoint: "http://localhost:45831", hardware: null, paired: true, protocolVersion: "1", runtimes: [{ id: "runtime", kind: "hassali", state: "stopped", version: "0.1" }] });
  assert.equal(bridge.paired, true);
  assert.equal(bridge.runtimes[0]?.state, "stopped");
});

test("LOCAL-09 pairing credentials are rejected in URLs and wildcard origins", () => {
  assert.throws(() => normalizeLocalBridgeEndpoint("http://localhost:45831/?token=secret"), /must not be placed/);
  assert.throws(() => assertLocalBridgeOrigin("*", "https://hassali.example"), /unexpected web origin/);
});

test("LOCAL-10 Ollama and llama.cpp remain represented as independent source IDs", async () => {
  const source = await readFile(path.resolve(process.cwd(), "src/lib/intelligence-sources.ts"), "utf8");
  assert(source.includes('"ollama"'));
  assert(source.includes('"llama-cpp"'));
});

test("workspace defaults keep Project Panel and ASK Project Notes collapsed with manual controls", async () => {
  const sidebar = await readFile(path.resolve(process.cwd(), "src/components/shell/left-sidebar.tsx"), "utf8");
  const notes = await readFile(path.resolve(process.cwd(), "src/components/shell/project-notes-panel.tsx"), "utf8");
  assert.match(sidebar, /projects:\s*false/);
  assert(sidebar.includes("toggleSection"));
  assert(!notes.includes("matchMedia"));
  assert(notes.includes("setIsOpen(true)"));
  assert(notes.includes("setIsOpen(false)"));
});

let passed = 0;
for (const entry of tests) {
  await entry.run();
  passed += 1;
  process.stdout.write(`PASS ${entry.name}\n`);
}
process.stdout.write(`\n${passed}/${tests.length} intelligence control-plane checks passed.\n`);
