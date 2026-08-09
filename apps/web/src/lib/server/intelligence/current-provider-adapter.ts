import {
  hassaliModelRegistry,
  type HassaliModelMetadata
} from "@/lib/model-registry";
import { IntelligenceAdapterRegistry } from "./intelligence-adapter-registry";
import {
  createCapabilityProfile,
  type IntelligenceComputeSource,
  type IntelligenceFailure,
  type IntelligenceModelDescriptor,
  type IntelligenceRequest
} from "./intelligence-contract";
import {
  createOpenAICompatibleAdapter,
  type IntelligenceFetch
} from "./openai-compatible-adapter";

export const currentIntelligenceAdapterId = "openrouter";

function computeSourceForModel(model: HassaliModelMetadata): IntelligenceComputeSource {
  if (model.isLocal) return "local-endpoint";
  if (model.executionProviderId === "openrouter" && model.pricingClass === "free") return "free-cloud";
  return "byok-cloud";
}

function modelAvailability(model: HassaliModelMetadata): IntelligenceModelDescriptor["availability"] {
  if (model.availability === "verified") return "available";
  if (model.availability === "unavailable" || model.availability === "hidden_unstable") return "unavailable";
  if (model.availability === "credit_required") return "requires-configuration";
  return "unknown";
}

export function normalizeRegisteredModel(model: HassaliModelMetadata): IntelligenceModelDescriptor {
  return {
    availability: modelAvailability(model),
    capabilities: createCapabilityProfile({
      streaming: model.supportsStreaming ? "supported" : "unsupported",
      structuredOutput: model.supportsJson ? "supported" : "unsupported",
      text: "supported",
      tools: model.supportsTools ? "supported" : "unsupported",
      vision: model.supportsVision ? "supported" : "unsupported"
    }),
    computeSource: computeSourceForModel(model),
    contextLimit: model.contextWindow,
    displayName: model.displayName,
    inputModalities: model.supportsVision ? ["text", "image"] : ["text"],
    isLocal: model.isLocal,
    modelId: model.executionModelId,
    outputModalities: ["text"],
    pricing: {
      currency: null,
      inputPerMillion: null,
      outputPerMillion: null,
      source: "unknown"
    },
    providerId: model.executionProviderId,
    publisherId: model.providerId,
    rawProviderMetadata: {
      availability: model.availability,
      pricingClass: model.pricingClass,
      registryModelId: model.modelId
    }
  };
}

function openRouterCitations(payload: unknown) {
  const annotations = (payload as {
    choices?: Array<{
      message?: {
        annotations?: Array<{
          type?: string;
          url_citation?: { content?: string; title?: string; url?: string };
        }>;
      };
    }>;
  }).choices?.[0]?.message?.annotations ?? [];

  return annotations.flatMap((annotation) => {
    const citation = annotation.type === "url_citation" ? annotation.url_citation : null;
    const url = citation?.url?.trim();
    if (!url || !/^https?:\/\//i.test(url)) return [];
    return [{
      content: citation?.content?.trim() || undefined,
      title: citation?.title?.trim() || undefined,
      url
    }];
  });
}

export function createCurrentOpenRouterAdapter(options?: {
  fetchImpl?: IntelligenceFetch;
  getApiKey?: () => string | null;
}) {
  return createOpenAICompatibleAdapter({
    baseUrl: "https://openrouter.ai/api/v1",
    capabilities: {
      reasoning: "unknown",
      streaming: "supported",
      structuredOutput: "supported",
      text: "supported",
      tools: "supported",
      vision: "supported",
      webResearch: "supported"
    },
    computeSource: "free-cloud",
    configuredModels: async () => hassaliModelRegistry
      .filter((model) => model.executionProviderId === "openrouter" && !model.isTestOnly)
      .map(normalizeRegisteredModel),
    extraRequestBody: (request) => request.features?.webResearch
      ? { plugins: [{ id: "web", max_results: Math.min(Math.max(request.features.webResearch.maxResults ?? 3, 1), 5) }] }
      : {},
    fetchImpl: options?.fetchImpl,
    getApiKey: options?.getApiKey ?? (() => process.env.OPENROUTER_API_KEY ?? null),
    id: currentIntelligenceAdapterId,
    normalizeCitations: openRouterCitations,
    providerId: "openrouter",
    requiresApiKey: true,
    timeoutMs: 30_000
  });
}

export function createCurrentIntelligenceRegistry(options?: {
  fetchImpl?: IntelligenceFetch;
  getApiKey?: () => string | null;
}) {
  return new IntelligenceAdapterRegistry().register(createCurrentOpenRouterAdapter(options));
}

let currentRegistry: IntelligenceAdapterRegistry | null = null;

export function getCurrentIntelligenceRegistry() {
  currentRegistry ??= createCurrentIntelligenceRegistry();
  return currentRegistry;
}

export function resetCurrentIntelligenceRegistryForTests() {
  currentRegistry = null;
}

export function invokeCurrentIntelligence(request: IntelligenceRequest) {
  return getCurrentIntelligenceRegistry().invoke(currentIntelligenceAdapterId, request);
}

export function streamCurrentIntelligence(request: IntelligenceRequest) {
  return getCurrentIntelligenceRegistry().stream(currentIntelligenceAdapterId, request);
}

export function legacyProviderFailureCategory(failure: IntelligenceFailure) {
  const categories: Record<IntelligenceFailure["category"], string> = {
    authentication: "provider_auth_failed",
    authorization: "provider_auth_failed",
    cancelled: "request_cancelled",
    "content-safety": "provider_safety_rejected",
    internal: "provider_internal_error",
    "invalid-request": "provider_request_rejected",
    "malformed-provider-response": "provider_response_invalid",
    "model-unavailable": "provider_model_unavailable",
    network: "provider_network_error",
    "provider-unavailable": "provider_unavailable",
    quota: "provider_insufficient_credits",
    "rate-limit": "provider_rate_limited",
    timeout: "provider_timeout",
    unconfigured: "provider_not_configured",
    "unsupported-capability": "provider_unsupported"
  };
  return categories[failure.category];
}

export function intelligenceResponseText(content: Array<{ text: string; type: "text" }>) {
  return content.map((part) => part.text).join("").trim();
}
