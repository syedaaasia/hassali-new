import type { IntelligenceSourceModelSummary } from "@/lib/intelligence-sources";
import {
  createCapabilityProfile,
  intelligenceCapabilities,
  type IntelligenceCapabilityProfile,
  type IntelligenceHealth,
  type IntelligenceHealthStatus,
  type IntelligenceModelDescriptor
} from "./intelligence-contract";
import type { IntelligenceAdapter } from "./intelligence-adapter-registry";
import { executionLocalityForComputeSource } from "./local-edge-intelligence";
import type { StoredIntelligenceSource } from "./intelligence-source-vault";
import {
  createOpenAICompatibleAdapter,
  normalizeLocalIntelligenceEndpoint,
  type IntelligenceFetch
} from "./openai-compatible-adapter";

const openRouterBaseUrl = "https://openrouter.ai/api/v1/";

function localServiceRoot(value: string) {
  const url = new URL(normalizeLocalIntelligenceEndpoint(value));
  if (url.pathname.replace(/\/+$/, "").endsWith("/v1")) {
    url.pathname = url.pathname.replace(/v1\/+$/, "");
  }
  return url.toString().replace(/\/+$/, "") + "/";
}

type JsonProbe = {
  body: unknown;
  latencyMs: number;
  response: Response;
};

const maxDiscoveryResponseBytes = 4 * 1024 * 1024;

function boundedSourceTimeout(timeoutMs = 8_000) {
  return Math.max(1_000, Math.min(timeoutMs, 15_000));
}

async function fetchJson(input: {
  fetchImpl?: IntelligenceFetch;
  headers?: Readonly<Record<string, string>>;
  signal?: AbortSignal;
  timeoutMs?: number;
  url: string;
}): Promise<JsonProbe | null> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const abort = () => controller.abort(input.signal?.reason);
  input.signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => controller.abort(), boundedSourceTimeout(input.timeoutMs));
  try {
    const response = await (input.fetchImpl ?? fetch)(input.url, {
      headers: input.headers,
      method: "GET",
      redirect: "error",
      signal: controller.signal
    });
    const contentLength = Number.parseInt(response.headers.get("content-length") ?? "", 10);
    if (Number.isFinite(contentLength) && contentLength > maxDiscoveryResponseBytes) {
      await response.body?.cancel().catch(() => undefined);
      return { body: null, latencyMs: Date.now() - startedAt, response };
    }
    const reader = response.body?.getReader();
    if (!reader) return { body: null, latencyMs: Date.now() - startedAt, response };
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxDiscoveryResponseBytes) {
        await reader.cancel().catch(() => undefined);
        return { body: null, latencyMs: Date.now() - startedAt, response };
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const body = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    return { body, latencyMs: Date.now() - startedAt, response };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    input.signal?.removeEventListener("abort", abort);
  }
}

function healthStatus(status: number, body: unknown): IntelligenceHealthStatus {
  const reported = body && typeof body === "object" && !Array.isArray(body)
    ? String((body as Record<string, unknown>).status ?? "").toLowerCase()
    : "";
  if (reported === "loading") return "loading";
  if (status === 401 || status === 403) return "authentication-failed";
  if (status === 429) return "rate-limited";
  if (status >= 200 && status < 300) return "ready";
  if (status >= 400 && status < 500) return "degraded";
  return "unavailable";
}

function healthReason(status: IntelligenceHealthStatus) {
  const reasons: Record<IntelligenceHealthStatus, string | null> = {
    "authentication-failed": "The provider rejected the configured credentials.",
    degraded: "The provider responded, but its connection is not ready for use.",
    loading: "The local model server is still loading.",
    "rate-limited": "The provider is rate-limited. Try again later.",
    ready: null,
    unavailable: "Hassali could not reach the configured provider endpoint.",
    unconfigured: "This provider connection is not configured."
  };
  return reasons[status];
}

async function probeHealth(input: {
  fetchImpl?: IntelligenceFetch;
  headers?: Readonly<Record<string, string>>;
  providerId: string;
  signal?: AbortSignal;
  url: string;
}): Promise<IntelligenceHealth> {
  const result = await fetchJson(input);
  const status = result
    ? result.response.ok && result.body === null
      ? "degraded"
      : healthStatus(result.response.status, result.body)
    : "unavailable";
  return {
    checkedAt: new Date().toISOString(),
    latencyMs: result?.latencyMs ?? null,
    providerId: input.providerId,
    reason: healthReason(status),
    retryable: status === "loading" || status === "rate-limited" || status === "unavailable",
    status
  };
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function pricePerMillion(value: unknown) {
  const parsed = typeof value === "string" ? Number.parseFloat(value) : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed * 1_000_000 : null;
}

function modelDescriptor(input: {
  capabilities?: Partial<IntelligenceCapabilityProfile>;
  computeSource: "byok-cloud" | "local-endpoint";
  contextLimit?: number | null;
  displayName: string;
  inputModalities?: IntelligenceModelDescriptor["inputModalities"];
  modelId: string;
  outputModalities?: IntelligenceModelDescriptor["outputModalities"];
  pricing?: IntelligenceModelDescriptor["pricing"];
  providerId: string;
  rawProviderMetadata?: Readonly<Record<string, unknown>>;
}): IntelligenceModelDescriptor {
  return {
    availability: "available",
    capabilities: createCapabilityProfile(input.capabilities ?? {}),
    computeSource: input.computeSource,
    contextLimit: input.contextLimit ?? null,
    displayName: input.displayName,
    inputModalities: input.inputModalities ?? [],
    isLocal: input.computeSource === "local-endpoint",
    modelId: input.modelId,
    outputModalities: input.outputModalities ?? [],
    pricing: input.pricing ?? {
      currency: null,
      inputPerMillion: null,
      outputPerMillion: null,
      source: "unknown"
    },
    providerId: input.providerId,
    rawProviderMetadata: input.rawProviderMetadata
  };
}

function normalizeOpenRouterModels(body: unknown) {
  const records = body && typeof body === "object" && !Array.isArray(body)
    ? (body as { data?: unknown[] }).data ?? []
    : [];
  return records.slice(0, 100).flatMap((value): IntelligenceModelDescriptor[] => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const item = value as Record<string, unknown>;
    const modelId = typeof item.id === "string" ? item.id.trim() : "";
    if (!modelId) return [];
    const architecture = item.architecture && typeof item.architecture === "object"
      ? item.architecture as Record<string, unknown>
      : {};
    const input = stringArray(architecture.input_modalities);
    const output = stringArray(architecture.output_modalities);
    const parameters = stringArray(item.supported_parameters);
    const pricing = item.pricing && typeof item.pricing === "object"
      ? item.pricing as Record<string, unknown>
      : {};
    const hasParameterMetadata = Array.isArray(item.supported_parameters);
    const hasInputMetadata = Array.isArray(architecture.input_modalities);
    const inputModalities = input.filter((modality): modality is "audio" | "file" | "image" | "text" =>
      ["audio", "file", "image", "text"].includes(modality)
    );
    const outputModalities = output.filter((modality): modality is "audio" | "image" | "text" =>
      ["audio", "image", "text"].includes(modality)
    );
    const inputPrice = pricePerMillion(pricing.prompt);
    const outputPrice = pricePerMillion(pricing.completion);
    return [modelDescriptor({
      capabilities: {
        reasoning: parameters.some((parameter) => parameter === "reasoning" || parameter === "reasoning_effort")
          ? "supported" : hasParameterMetadata ? "unsupported" : "unknown",
        structuredOutput: parameters.some((parameter) => parameter === "response_format" || parameter === "structured_outputs")
          ? "supported" : hasParameterMetadata ? "unsupported" : "unknown",
        text: input.includes("text") && output.includes("text")
          ? "supported" : hasInputMetadata ? "unsupported" : "unknown",
        tools: parameters.includes("tools")
          ? "supported" : hasParameterMetadata ? "unsupported" : "unknown",
        vision: input.includes("image")
          ? "supported" : hasInputMetadata ? "unsupported" : "unknown"
      },
      computeSource: "byok-cloud",
      contextLimit: finiteNumber(item.context_length),
      displayName: typeof item.name === "string" && item.name.trim() ? item.name.trim() : modelId,
      inputModalities,
      modelId,
      outputModalities,
      pricing: inputPrice !== null || outputPrice !== null
        ? { currency: "USD", inputPerMillion: inputPrice, outputPerMillion: outputPrice, source: "actual" }
        : undefined,
      providerId: "openrouter-byok"
    })];
  });
}

function normalizeOllamaModels(body: unknown) {
  const records = body && typeof body === "object" && !Array.isArray(body)
    ? (body as { models?: unknown[] }).models ?? []
    : [];
  return records.slice(0, 100).flatMap((value): IntelligenceModelDescriptor[] => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const item = value as Record<string, unknown>;
    const modelId = typeof item.model === "string" ? item.model.trim()
      : typeof item.name === "string" ? item.name.trim() : "";
    if (!modelId) return [];
    const details = item.details && typeof item.details === "object"
      ? item.details as Record<string, unknown>
      : {};
    return [modelDescriptor({
      capabilities: { streaming: "supported", text: "supported" },
      computeSource: "local-endpoint",
      displayName: modelId,
      inputModalities: ["text"],
      modelId,
      outputModalities: ["text"],
      providerId: "ollama",
      rawProviderMetadata: {
        format: typeof details.format === "string" ? details.format : null,
        parameterSize: typeof details.parameter_size === "string" ? details.parameter_size : null,
        quantization: typeof details.quantization_level === "string" ? details.quantization_level : null,
        sizeBytes: finiteNumber(item.size)
      }
    })];
  });
}

function normalizeLlamaModels(body: unknown) {
  const records = body && typeof body === "object" && !Array.isArray(body)
    ? (body as { data?: unknown[] }).data ?? []
    : [];
  return records.slice(0, 100).flatMap((value): IntelligenceModelDescriptor[] => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const item = value as Record<string, unknown>;
    const modelId = typeof item.id === "string" ? item.id.trim() : "";
    if (!modelId) return [];
    const architecture = item.architecture && typeof item.architecture === "object"
      ? item.architecture as Record<string, unknown>
      : {};
    const input = stringArray(architecture.input_modalities);
    const output = stringArray(architecture.output_modalities);
    const hasArchitecture = Array.isArray(architecture.input_modalities);
    return [modelDescriptor({
      capabilities: {
        streaming: "supported",
        text: input.includes("text") ? "supported" : hasArchitecture ? "unsupported" : "supported",
        vision: input.includes("image") ? "supported" : hasArchitecture ? "unsupported" : "unknown"
      },
      computeSource: "local-endpoint",
      displayName: modelId,
      inputModalities: input.filter((modality): modality is "audio" | "file" | "image" | "text" =>
        ["audio", "file", "image", "text"].includes(modality)
      ),
      modelId,
      outputModalities: output.filter((modality): modality is "audio" | "image" | "text" =>
        ["audio", "image", "text"].includes(modality)
      ),
      providerId: "llama-cpp"
    })];
  });
}

export function summarizeDiscoveredModel(model: IntelligenceModelDescriptor): IntelligenceSourceModelSummary {
  const raw = model.rawProviderMetadata ?? {};
  return {
    capabilities: Object.entries(model.capabilities)
      .filter(([, support]) => support === "supported")
      .map(([capability]) => capability),
    contextLimit: model.contextLimit,
    displayName: model.displayName,
    format: typeof raw.format === "string" ? raw.format : null,
    modelId: model.modelId,
    parameterSize: typeof raw.parameterSize === "string" ? raw.parameterSize : null,
    quantization: typeof raw.quantization === "string" ? raw.quantization : null,
    sizeBytes: finiteNumber(raw.sizeBytes),
  };
}

function storedModelDescriptor(
  source: StoredIntelligenceSource,
  model: IntelligenceSourceModelSummary
): IntelligenceModelDescriptor {
  const supported = new Set(model.capabilities);
  return modelDescriptor({
    capabilities: Object.fromEntries(
      intelligenceCapabilities.map((capability) => [
        capability,
        supported.has(capability) ? "supported" : "unknown"
      ])
    ) as IntelligenceCapabilityProfile,
    computeSource: source.id === "openrouter-byok" ? "byok-cloud" : "local-endpoint",
    contextLimit: model.contextLimit,
    displayName: model.displayName,
    inputModalities: [
      ...(supported.has("text") ? ["text" as const] : []),
      ...(supported.has("vision") ? ["image" as const] : [])
    ],
    modelId: model.modelId,
    outputModalities: supported.has("text") ? ["text"] : [],
    providerId: source.id,
    rawProviderMetadata: {
      format: model.format,
      parameterSize: model.parameterSize,
      quantization: model.quantization,
      sizeBytes: model.sizeBytes
    }
  });
}

export function createConfiguredSourceAdapter(input: {
  fetchImpl?: IntelligenceFetch;
  getApiKey: () => string | null;
  source: StoredIntelligenceSource;
}): IntelligenceAdapter {
  if (input.source.id === "openrouter-byok") {
    const adapter = createOpenAICompatibleAdapter({
      baseUrl: openRouterBaseUrl,
      capabilities: { streaming: "supported", structuredOutput: "supported", text: "supported", tools: "supported", vision: "supported" },
      computeSource: "byok-cloud",
      executionLocality: executionLocalityForComputeSource("byok-cloud"),
      configuredModels: async () => input.source.models.map((model) => storedModelDescriptor(input.source, model)),
      defaultModelId: input.source.defaultModel,
      fetchImpl: input.fetchImpl,
      getApiKey: input.getApiKey,
      id: input.source.id,
      providerId: input.source.id,
      requiresApiKey: true,
      timeoutMs: 15_000
    });
    adapter.health = (signal) => {
      const key = input.getApiKey();
      if (!key) {
        return Promise.resolve({
          checkedAt: new Date().toISOString(),
          latencyMs: null,
          providerId: input.source.id,
          reason: "Required provider credentials are not configured.",
          retryable: false,
          status: "unconfigured"
        });
      }
      return probeHealth({
        fetchImpl: input.fetchImpl,
        headers: { Authorization: `Bearer ${key}` },
        providerId: input.source.id,
        signal,
        url: new URL("models", openRouterBaseUrl).toString()
      });
    };
    adapter.discoverModels = async (signal) => {
      const key = input.getApiKey();
      if (!key) return [];
      const result = await fetchJson({
        fetchImpl: input.fetchImpl,
        headers: { Authorization: `Bearer ${key}` },
        signal,
        url: new URL("models", openRouterBaseUrl).toString()
      });
      return result?.response.ok ? normalizeOpenRouterModels(result.body) : [];
    };
    return adapter;
  }

  const localRoot = localServiceRoot(input.source.endpointUrl ?? "");
  const inferenceBase = new URL("v1/", localRoot).toString();
  const adapter = createOpenAICompatibleAdapter({
    allowInsecureLoopback: true,
    baseUrl: inferenceBase,
    capabilities: { streaming: "supported", text: "supported" },
    computeSource: "local-endpoint",
    executionLocality: executionLocalityForComputeSource("local-endpoint"),
    configuredModels: async () => input.source.models.map((model) => storedModelDescriptor(input.source, model)),
    defaultModelId: input.source.defaultModel,
    fetchImpl: input.fetchImpl,
    id: input.source.id,
    providerId: input.source.id,
    timeoutMs: 15_000
  });

  if (input.source.id === "ollama") {
    const tagsUrl = new URL("api/tags", localRoot).toString();
    adapter.health = (signal) => probeHealth({
      fetchImpl: input.fetchImpl,
      providerId: input.source.id,
      signal,
      url: tagsUrl
    });
    adapter.discoverModels = async (signal) => {
      const result = await fetchJson({ fetchImpl: input.fetchImpl, signal, url: tagsUrl });
      return result?.response.ok ? normalizeOllamaModels(result.body) : [];
    };
    return adapter;
  }

  const healthUrl = new URL("health", localRoot).toString();
  const modelsUrl = new URL("v1/models", localRoot).toString();
  adapter.health = (signal) => probeHealth({
    fetchImpl: input.fetchImpl,
    providerId: input.source.id,
    signal,
    url: healthUrl
  });
  adapter.discoverModels = async (signal) => {
    const result = await fetchJson({ fetchImpl: input.fetchImpl, signal, url: modelsUrl });
    return result?.response.ok ? normalizeLlamaModels(result.body) : [];
  };
  return adapter;
}

export async function testConfiguredSource(input: {
  fetchImpl?: IntelligenceFetch;
  getApiKey: () => string | null;
  source: StoredIntelligenceSource;
}) {
  if (!input.source.enabled) {
    return {
      health: {
        checkedAt: new Date().toISOString(),
        latencyMs: null,
        providerId: input.source.id,
        reason: "This provider connection is disabled.",
        retryable: false,
        status: "unconfigured"
      } satisfies IntelligenceHealth,
      models: [] as IntelligenceSourceModelSummary[]
    };
  }
  const adapter = createConfiguredSourceAdapter(input);
  const health = await adapter.health();
  const discovered = health.status === "ready" && adapter.discoverModels
    ? await adapter.discoverModels()
    : [];
  return {
    health,
    models: discovered.map(summarizeDiscoveredModel)
  };
}
