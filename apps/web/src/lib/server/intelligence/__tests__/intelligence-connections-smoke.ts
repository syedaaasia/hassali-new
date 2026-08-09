import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  configureIntelligenceSource,
  createAvailableIntelligenceRegistryForUser,
  disconnectIntelligenceSource,
  listIntelligenceSources,
  testIntelligenceSourceConnection
} from "../intelligence-source-service";
import { IntelligenceSourceSessionVault, intelligenceSourceSessionVault } from "../intelligence-source-vault";
import { createConfiguredSourceAdapter } from "../configured-source-adapters";
import {
  normalizeLocalIntelligenceEndpoint,
  normalizeOpenAICompatibleBaseUrl,
  type IntelligenceFetch
} from "../openai-compatible-adapter";

type TestCase = { name: string; run: () => Promise<void> | void };
const tests: TestCase[] = [];
const test = (name: string, run: TestCase["run"]) => tests.push({ name, run });

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status
  });
}

test("local endpoint policy accepts loopback and rejects credentials, remote hosts, and invalid URLs", () => {
  assert.equal(normalizeLocalIntelligenceEndpoint("http://localhost:11434"), "http://localhost:11434/");
  assert.equal(normalizeLocalIntelligenceEndpoint("http://[::1]:8080/v1"), "http://[::1]:8080/v1/");
  assert.throws(() => normalizeLocalIntelligenceEndpoint("http://192.168.1.10:11434"), /localhost/);
  assert.throws(() => normalizeLocalIntelligenceEndpoint("https://provider.example/v1"), /localhost/);
  assert.throws(() => normalizeLocalIntelligenceEndpoint("http://user:secret@localhost:11434"), /Credentials/);
  assert.throws(() => normalizeOpenAICompatibleBaseUrl("not a url"), /valid URL/);
});

test("session vault encrypts credentials, isolates users, and emits client-safe records only", () => {
  const vault = new IntelligenceSourceSessionVault();
  vault.configure({
    apiKey: "private-user-a-key",
    enabled: true,
    endpointUrl: null,
    sourceId: "openrouter-byok",
    userId: "user-a"
  });
  assert.equal(vault.getCredential("user-a", "openrouter-byok"), "private-user-a-key");
  assert.equal(vault.getCredential("user-b", "openrouter-byok"), null);
  const serialized = JSON.stringify(vault.list("user-a"));
  assert(!serialized.includes("private-user-a-key"));
  assert(!serialized.includes("ciphertext"));
  assert.equal(vault.list("user-a")[0]?.credentialConfigured, true);
  assert.equal(vault.getRoutingPrivacy("user-a"), "allow-cloud");
  vault.setRoutingPrivacy("user-a", "local-only");
  assert.equal(vault.getRoutingPrivacy("user-a"), "local-only");
  assert.equal(vault.getRoutingPrivacy("user-b"), "allow-cloud");
  assert.equal(vault.disconnect("user-a", "openrouter-byok"), true);
  assert.equal(vault.getCredential("user-a", "openrouter-byok"), null);
});

test("OpenRouter BYOK health and model metadata stay normalized without returning the key", async () => {
  intelligenceSourceSessionVault.reset();
  await configureIntelligenceSource({ apiKey: "secret-openrouter-key", enabled: true, sourceId: "openrouter-byok", userId: "route-user" });
  let calls = 0;
  const fetchImpl: IntelligenceFetch = async (url, init) => {
    calls += 1;
    assert.equal(String(url), "https://openrouter.ai/api/v1/models");
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer secret-openrouter-key");
    assert.equal(init?.redirect, "error");
    return jsonResponse({
      data: [{
        architecture: { input_modalities: ["text", "image"], output_modalities: ["text"] },
        context_length: 128000,
        id: "fixture/vision",
        name: "Fixture Vision",
        pricing: { completion: "0.000002", prompt: "0.000001" },
        supported_parameters: ["tools", "response_format", "reasoning"]
      }]
    });
  };
  const result = await testIntelligenceSourceConnection("route-user", "openrouter-byok", fetchImpl);
  assert.equal(result.health.status, "ready");
  assert.equal(result.models[0]?.contextLimit, 128000);
  assert(result.models[0]?.capabilities.includes("vision"));
  assert(calls >= 2);
  const clientPayload = JSON.stringify(await listIntelligenceSources("route-user"));
  assert(!clientPayload.includes("secret-openrouter-key"));
  assert(!clientPayload.includes("Authorization"));
});

test("OpenRouter authentication failure is reported as authentication-failed", async () => {
  intelligenceSourceSessionVault.reset();
  await configureIntelligenceSource({ apiKey: "bad-key", enabled: true, sourceId: "openrouter-byok", userId: "auth-user" });
  const result = await testIntelligenceSourceConnection(
    "auth-user",
    "openrouter-byok",
    async () => jsonResponse({ error: "invalid key detail" }, 401)
  );
  assert.equal(result.health.status, "authentication-failed");
  assert(!String(result.health.reason).includes("invalid key detail"));
});

test("OpenRouter BYOK inference uses the configured adapter without exposing its credential", async () => {
  intelligenceSourceSessionVault.reset();
  await configureIntelligenceSource({ apiKey: "inference-key", enabled: true, sourceId: "openrouter-byok", userId: "inference-user" });
  const source = intelligenceSourceSessionVault.get("inference-user", "openrouter-byok");
  assert(source);
  const adapter = createConfiguredSourceAdapter({
    fetchImpl: async (url, init) => {
      assert.equal(String(url), "https://openrouter.ai/api/v1/chat/completions");
      assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer inference-key");
      return jsonResponse({ choices: [{ finish_reason: "stop", message: { content: "BYOK answer" } }], model: "fixture/byok" });
    },
    getApiKey: () => intelligenceSourceSessionVault.getCredential("inference-user", "openrouter-byok"),
    source
  });
  const result = await adapter.invoke({
    messages: [{ parts: [{ text: "Hello", type: "text" }], role: "user" }],
    mode: "ASK",
    requestedModel: "fixture/byok",
    requiredCapabilities: ["text"]
  });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.response.content[0]?.text, "BYOK answer");
});

test("oversized discovery responses fail closed as degraded without parsing the payload", async () => {
  intelligenceSourceSessionVault.reset();
  await configureIntelligenceSource({ apiKey: "bounded-key", enabled: true, sourceId: "openrouter-byok", userId: "bounded-user" });
  const result = await testIntelligenceSourceConnection("bounded-user", "openrouter-byok", async () => new Response("{}", {
    headers: { "content-length": String(5 * 1024 * 1024), "content-type": "application/json" },
    status: 200
  }));
  assert.equal(result.health.status, "degraded");
  assert.equal(result.models.length, 0);
});

test("Ollama discovery preserves local format, size, and quantization without installing or starting anything", async () => {
  intelligenceSourceSessionVault.reset();
  await configureIntelligenceSource({
    enabled: true,
    endpointUrl: "http://127.0.0.1:11434",
    sourceId: "ollama",
    userId: "local-user"
  });
  const result = await testIntelligenceSourceConnection("local-user", "ollama", async (url, init) => {
    assert.equal(String(url), "http://127.0.0.1:11434/api/tags");
    assert.equal(init?.redirect, "error");
    return jsonResponse({
      models: [{
        details: { format: "gguf", parameter_size: "4.3B", quantization_level: "Q4_K_M" },
        model: "gemma3:4b",
        size: 3338801804
      }]
    });
  });
  assert.equal(result.health.status, "ready");
  assert.equal(result.models[0]?.modelId, "gemma3:4b");
  assert.equal(result.models[0]?.format, "gguf");
  assert.equal(result.models[0]?.quantization, "Q4_K_M");
  assert.equal(result.models[0]?.sizeBytes, 3338801804);
});

test("llama.cpp normalizes loading and discovers models from an endpoint ending in v1", async () => {
  intelligenceSourceSessionVault.reset();
  await configureIntelligenceSource({
    enabled: true,
    endpointUrl: "http://localhost:8080/v1",
    sourceId: "llama-cpp",
    userId: "llama-user"
  });
  const loading = await testIntelligenceSourceConnection("llama-user", "llama-cpp", async (url) => {
    assert.equal(String(url), "http://localhost:8080/health");
    return jsonResponse({ status: "loading" }, 503);
  });
  assert.equal(loading.health.status, "loading");

  const ready = await testIntelligenceSourceConnection("llama-user", "llama-cpp", async (url) => {
    if (String(url).endsWith("/health")) return jsonResponse({ status: "ok" });
    assert.equal(String(url), "http://localhost:8080/v1/models");
    return jsonResponse({ data: [{ architecture: { input_modalities: ["text"], output_modalities: ["text"] }, id: "local-model" }] });
  });
  assert.equal(ready.health.status, "ready");
  assert.equal(ready.models[0]?.modelId, "local-model");
});

test("local adapters execute text inference through the I1 OpenAI-compatible contract", async () => {
  const source = {
    credentialConfigured: false,
    defaultModel: "local-model",
    enabled: true,
    endpointUrl: "http://127.0.0.1:8080/",
    health: null,
    id: "llama-cpp" as const,
    models: [],
    updatedAt: new Date().toISOString()
  };
  let inferenceUrl = "";
  const adapter = createConfiguredSourceAdapter({
    fetchImpl: async (url) => {
      inferenceUrl = String(url);
      return jsonResponse({ choices: [{ finish_reason: "stop", message: { content: "Local answer" } }], model: "local-model" });
    },
    getApiKey: () => null,
    source
  });
  const result = await adapter.invoke({
    messages: [{ parts: [{ text: "Hello", type: "text" }], role: "user" }],
    mode: "ASK",
    requestedModel: "local-model",
    requiredCapabilities: ["text"]
  });
  assert.equal(result.ok, true);
  assert.equal(inferenceUrl, "http://127.0.0.1:8080/v1/chat/completions");
  if (result.ok) assert.equal(result.response.content[0]?.text, "Local answer");
});

test("disable, reconnect, and disconnect stay deterministic and user-scoped", async () => {
  intelligenceSourceSessionVault.reset();
  await configureIntelligenceSource({ enabled: false, endpointUrl: "http://localhost:11434", sourceId: "ollama", userId: "owner" });
  assert.equal((await listIntelligenceSources("owner")).sources.find((source) => source.id === "ollama")?.enabled, false);
  assert.equal((await listIntelligenceSources("other")).sources.find((source) => source.id === "ollama")?.configured, false);
  await configureIntelligenceSource({ enabled: true, endpointUrl: "http://localhost:11434", sourceId: "ollama", userId: "owner" });
  assert.equal((await listIntelligenceSources("owner")).sources.find((source) => source.id === "ollama")?.enabled, true);
  await disconnectIntelligenceSource("owner", "ollama");
  assert.equal((await listIntelligenceSources("owner")).sources.find((source) => source.id === "ollama")?.configured, false);
});

test("enabled connections register beside the unchanged current provider without changing selection", async () => {
  intelligenceSourceSessionVault.reset();
  await configureIntelligenceSource({ apiKey: "registry-key", enabled: true, sourceId: "openrouter-byok", userId: "registry-user" });
  await configureIntelligenceSource({ enabled: true, endpointUrl: "http://localhost:11434", sourceId: "ollama", userId: "registry-user" });
  await configureIntelligenceSource({ enabled: false, endpointUrl: "http://localhost:8080", sourceId: "llama-cpp", userId: "registry-user" });
  const ids = (await createAvailableIntelligenceRegistryForUser("registry-user")).list().map((adapter) => adapter.id).sort();
  assert.deepEqual(ids, ["ollama", "openrouter", "openrouter-byok"]);
});

test("settings API and UI keep auth, no-store responses, and secret-safe controls at the boundary", async () => {
  const root = path.basename(process.cwd()).toLowerCase() === "web"
    ? process.cwd()
    : path.resolve(process.cwd(), "apps/web");
  const route = await readFile(path.join(root, "src/app/api/settings/intelligence/route.ts"), "utf8");
  const dialog = await readFile(path.join(root, "src/components/settings/intelligence-settings-dialog.tsx"), "utf8");
  assert(route.includes("await auth()"));
  assert(route.includes('"Cache-Control": "no-store"'));
  assert(route.includes("sameOrigin(request)"));
  assert(route.includes("export async function PATCH"));
  assert(dialog.includes('type="password"'));
  assert(dialog.includes('apiKey: ""'));
  assert(dialog.includes("Loopback addresses only"));
  assert(dialog.includes("Prefer local"));
  assert(dialog.includes("Local only"));
  assert(!dialog.includes("localStorage"));
});

let passed = 0;
for (const entry of tests) {
  await entry.run();
  passed += 1;
  process.stdout.write(`PASS ${entry.name}\n`);
}
intelligenceSourceSessionVault.reset();
process.stdout.write(`\n${passed}/${tests.length} intelligence connection checks passed.\n`);
