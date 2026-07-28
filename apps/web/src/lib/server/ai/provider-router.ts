import {
  findHassaliModel,
  findHassaliProvider,
  hassaliModelProviders,
  hassaliModelRegistry,
  type HassaliModelMetadata
} from "@/lib/model-registry";

export type HassaliProviderCapability =
  | "ASK"
  | "CODE"
  | "EMBEDDINGS"
  | "REASONING"
  | "REPAIR"
  | "SEARCH"
  | "VALIDATION"
  | "VISION"
  | "WEBSITE";

export type HassaliProviderRecord = {
  capabilities: HassaliProviderCapability[];
  envKeys: string[];
  id: string;
  name: string;
};

export type ConfiguredProviderInfo = {
  advancedProvidersRegistered: string[];
  capabilities: HassaliProviderCapability[];
  fallbackProviders: string[];
  isConfigured: boolean;
  liveSearchConnected: boolean;
  localModelsConfigured: boolean;
  modelMetadata: HassaliModelMetadata | null;
  modelName: string | null;
  providerName: string | null;
  requiredEnv: string[];
  source: "environment" | "request" | "unavailable";
};

export type AskProviderFailureCategory =
  | "model_unknown"
  | "provider_not_configured"
  | "provider_unsupported"
  | "test_model_blocked";

export type ResolvedAskProvider = {
  configured: boolean;
  credentialSource: "credential_inherited_from_parent_process" | "credential_loaded_from_application_environment" | "credential_missing";
  executionModelId: string | null;
  executionProvider: string | null;
  failureCategory: AskProviderFailureCategory | null;
  modelPublisher: string | null;
  requestedModelId: string;
  resolvedModelId: string | null;
  pricingClass: "credit_required" | "free" | null;
};

export type AskProviderCooldown = {
  active: boolean;
  failureCategory: string | null;
  remainingMs: number;
};

const automaticAskFallbackModelIds = ["openrouter/free"];
const providerHealth = new Map<string, {
  cooldownUntil: number;
  failureCategory: string;
}>();
const providerFailureStreaks = new Map<string, {
  count: number;
  lastFailureAt: number;
}>();

const capabilityDefaults: Record<string, HassaliProviderCapability[]> = {
  anthropic: ["ASK", "CODE", "WEBSITE", "REASONING", "VALIDATION", "REPAIR", "VISION"],
  "custom-openai-compatible": ["ASK", "CODE", "WEBSITE", "REASONING", "VALIDATION"],
  deepseek: ["ASK", "CODE", "REASONING"],
  fireworks: ["ASK", "CODE", "REASONING"],
  google: ["ASK", "CODE", "WEBSITE", "REASONING", "VISION"],
  groq: ["ASK", "CODE", "REASONING"],
  lmstudio: ["ASK", "CODE", "REASONING"],
  meta: ["ASK", "CODE", "REASONING"],
  mistral: ["ASK", "CODE", "REASONING"],
  ollama: ["ASK", "CODE", "REASONING"],
  openai: ["ASK", "CODE", "WEBSITE", "REASONING", "VALIDATION", "REPAIR", "VISION"],
  openrouter: ["ASK", "CODE", "WEBSITE", "REASONING", "VALIDATION", "REPAIR", "VISION"],
  qwen: ["ASK", "CODE", "REASONING"],
  "sakana-compatible": ["ASK", "CODE", "WEBSITE", "REASONING"],
  together: ["ASK", "CODE", "REASONING"],
  zai: ["ASK", "CODE", "WEBSITE", "REASONING", "VALIDATION"]
};

const envAliases: Record<string, string[]> = {
  google: ["GEMINI_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY"],
  "custom-openai-compatible": ["OPENAI_COMPATIBLE_API_KEY", "CUSTOM_OPENAI_API_KEY", "CUSTOM_OPENAI_KEY"],
  zai: ["ZAI_API_KEY", "GLM_API_KEY"],
  ollama: ["OLLAMA_BASE_URL"],
  lmstudio: ["LM_STUDIO_BASE_URL"]
};

export const providerRecords: HassaliProviderRecord[] = hassaliModelProviders.map((provider) => ({
  capabilities: capabilityDefaults[provider.providerId] ?? ["ASK", "CODE"],
  envKeys: [
    ...(provider.apiKeyEnv ? [provider.apiKeyEnv] : []),
    ...(provider.baseUrlEnv ? [provider.baseUrlEnv] : []),
    ...(envAliases[provider.providerId] ?? [])
  ],
  id: provider.providerId,
  name: provider.providerName
}));

function envConfigured(keys: string[]) {
  return keys.some((key) => Boolean(process.env[key]));
}

function requiredEnvForModel(model: HassaliModelMetadata | null) {
  if (!model) return [];

  return [
    ...(model.apiKeyEnv ? [model.apiKeyEnv] : []),
    ...(model.baseUrlEnv ? [model.baseUrlEnv] : [])
  ];
}

function isModelConfigured(model: HassaliModelMetadata | null) {
  if (!model) return false;

  if (model.requiresApiKey && model.apiKeyEnv && model.baseUrlEnv) {
    return Boolean(process.env[model.apiKeyEnv]) && Boolean(process.env[model.baseUrlEnv]);
  }

  if (model.requiresApiKey && model.apiKeyEnv) {
    return Boolean(process.env[model.apiKeyEnv]);
  }

  if (!model.requiresApiKey && model.baseUrlEnv) {
    return Boolean(process.env[model.baseUrlEnv]);
  }

  return false;
}

function providerFromModel(modelName: string | null) {
  const registeredModel = findHassaliModel(modelName);

  if (registeredModel) {
    return providerRecords.find((provider) => provider.id === registeredModel.providerId) ?? null;
  }

  const model = modelName?.toLowerCase() ?? "";

  if (model.startsWith("openai/") || model.includes("gpt-")) return providerRecords.find((provider) => provider.id === "openai") ?? null;
  if (model.startsWith("anthropic/") || model.includes("claude")) return providerRecords.find((provider) => provider.id === "anthropic") ?? null;
  if (model.startsWith("google/") || model.includes("gemini")) return providerRecords.find((provider) => provider.id === "google") ?? null;
  if (model.startsWith("zai/") || model.includes("glm-")) return providerRecords.find((provider) => provider.id === "zai") ?? null;
  if (model.startsWith("deepseek/")) return providerRecords.find((provider) => provider.id === "deepseek") ?? null;
  if (model.startsWith("qwen/")) return providerRecords.find((provider) => provider.id === "qwen") ?? null;
  if (model.startsWith("mistral/")) return providerRecords.find((provider) => provider.id === "mistral") ?? null;
  if (model.startsWith("meta/") || model.includes("llama")) return providerRecords.find((provider) => provider.id === "meta") ?? null;
  if (model.startsWith("groq/")) return providerRecords.find((provider) => provider.id === "groq") ?? null;
  if (model.startsWith("together/")) return providerRecords.find((provider) => provider.id === "together") ?? null;
  if (model.startsWith("fireworks/")) return providerRecords.find((provider) => provider.id === "fireworks") ?? null;
  if (model.startsWith("ollama/")) return providerRecords.find((provider) => provider.id === "ollama") ?? null;
  if (model.startsWith("lmstudio/")) return providerRecords.find((provider) => provider.id === "lmstudio") ?? null;
  if (model.startsWith("custom-openai-compatible/")) return providerRecords.find((provider) => provider.id === "custom-openai-compatible") ?? null;
  if (model.startsWith("sakana-compatible/")) return providerRecords.find((provider) => provider.id === "sakana-compatible") ?? null;

  return null;
}

function customModelMetadata(modelName: string | null): HassaliModelMetadata | null {
  if (!modelName || findHassaliModel(modelName)) return findHassaliModel(modelName);
  const provider = providerFromModel(modelName);
  const providerMetadata = findHassaliProvider(provider?.id);

  if (!provider || !providerMetadata) {
    return null;
  }

  return {
    providerId: provider.id,
    providerName: provider.name,
    modelId: modelName,
    displayName: modelName,
    family: "custom",
    strengths: ["custom configured model ID"],
    weaknesses: ["availability depends on provider configuration"],
    costTier: "unknown",
    speedTier: "unknown",
    reasoningTier: "unknown",
    codingTier: "unknown",
    designTier: "unknown",
    contextWindow: null,
    supportsTools: true,
    supportsVision: false,
    supportsJson: true,
    supportsStreaming: true,
    isLocal: providerMetadata.isLocal,
    isOpenSource: false,
    isOpenAICompatible: providerMetadata.isOpenAICompatible,
    requiresApiKey: Boolean(providerMetadata.apiKeyEnv),
    baseUrlEnv: providerMetadata.baseUrlEnv,
    apiKeyEnv: providerMetadata.apiKeyEnv,
    executionModelId: modelName,
    executionProviderId: provider.id,
    isTestOnly: false,
    isUserSelectable: false,
    pricingClass: "credit_required",
    availability: "credit_required",
    expirationDate: null
  };
}

export function getConfiguredProviderInfo(input?: {
  requestedModel?: string | null;
}): ConfiguredProviderInfo {
  const requestedModel = input?.requestedModel?.trim() || process.env.HASSALI_DEFAULT_MODEL || null;
  const modelMetadata = customModelMetadata(requestedModel);
  const modelProvider = providerFromModel(requestedModel);

  if (modelProvider) {
    const requiredEnv = requiredEnvForModel(modelMetadata);

    return {
      advancedProvidersRegistered: providerRecords.map((provider) => provider.name),
      capabilities: modelProvider.capabilities,
      fallbackProviders: providerRecords.filter((provider) => provider.id !== modelProvider.id).map((provider) => provider.name),
      isConfigured: modelMetadata ? isModelConfigured(modelMetadata) : envConfigured(modelProvider.envKeys),
      liveSearchConnected: Boolean(process.env.TAVILY_API_KEY || process.env.SERPER_API_KEY),
      localModelsConfigured: Boolean(process.env.OLLAMA_BASE_URL || process.env.LM_STUDIO_BASE_URL),
      modelMetadata,
      modelName: requestedModel,
      providerName: modelProvider.name,
      requiredEnv,
      source: "request"
    };
  }

  const configuredProvider = providerRecords.find((provider) =>
    envConfigured(provider.envKeys)
  );

  return {
    advancedProvidersRegistered: providerRecords.map((provider) => provider.name),
    capabilities: configuredProvider?.capabilities ?? [],
    fallbackProviders: providerRecords
      .filter((provider) => provider.id !== configuredProvider?.id)
      .map((provider) => provider.name),
    isConfigured: Boolean(configuredProvider),
    liveSearchConnected: Boolean(process.env.TAVILY_API_KEY || process.env.SERPER_API_KEY),
    localModelsConfigured: Boolean(process.env.OLLAMA_BASE_URL || process.env.LM_STUDIO_BASE_URL),
    modelMetadata,
    modelName: requestedModel,
    providerName: configuredProvider?.name ?? null,
    requiredEnv: modelMetadata ? requiredEnvForModel(modelMetadata) : [],
    source: configuredProvider ? "environment" : "unavailable"
  };
}

export function resolveAskProvider(requestedModelId: string): ResolvedAskProvider {
  const requested = requestedModelId.trim();
  const credentialSource = process.env.HASSALI_OPENROUTER_ENV_SOURCE === "credential_inherited_from_parent_process"
    ? "credential_inherited_from_parent_process"
    : process.env.HASSALI_OPENROUTER_ENV_SOURCE === "credential_loaded_from_application_environment"
      ? "credential_loaded_from_application_environment"
      : "credential_missing";

  if (/^no-provider\//i.test(requested)) {
    const allowed = process.env.NODE_ENV !== "production" && process.env.HASSALI_ALLOW_TEST_MODELS === "1";
    return {
      configured: false,
      credentialSource,
      executionModelId: null,
      executionProvider: null,
      failureCategory: allowed ? "provider_not_configured" : "test_model_blocked",
      modelPublisher: null,
      requestedModelId: requested,
      resolvedModelId: null,
      pricingClass: null
    };
  }

  const model = findHassaliModel(requested);
  if (!model || model.isTestOnly) {
    return {
      configured: false,
      credentialSource,
      executionModelId: null,
      executionProvider: null,
      failureCategory: "model_unknown",
      modelPublisher: null,
      requestedModelId: requested,
      resolvedModelId: null,
      pricingClass: null
    };
  }

  const executionProvider = findHassaliProvider(model.executionProviderId);
  if (!executionProvider || model.executionProviderId !== "openrouter") {
    return {
      configured: false,
      credentialSource,
      executionModelId: model.executionModelId,
      executionProvider: model.executionProviderId,
      failureCategory: "provider_unsupported",
      modelPublisher: model.providerId,
      requestedModelId: requested,
      resolvedModelId: model.modelId,
      pricingClass: model.pricingClass
    };
  }

  const configured = Boolean(executionProvider.apiKeyEnv && process.env[executionProvider.apiKeyEnv]);
  return {
    configured,
    credentialSource,
    executionModelId: model.executionModelId,
    executionProvider: executionProvider.providerId,
    failureCategory: configured ? null : "provider_not_configured",
    modelPublisher: model.providerId,
    requestedModelId: requested,
    resolvedModelId: model.modelId,
    pricingClass: model.pricingClass
  };
}

export function resolveAskFallbackProviders(requestedModelId: string) {
  const requested = requestedModelId.trim().toLowerCase();

  return automaticAskFallbackModelIds
    .filter((modelId) => modelId.toLowerCase() !== requested)
    .map((modelId) => resolveAskProvider(modelId))
    .filter((provider) =>
      provider.configured &&
      provider.executionProvider === "openrouter" &&
      Boolean(provider.executionModelId) &&
      provider.pricingClass === "free"
    )
    .slice(0, 1);
}

function modelHealthKey(provider: ResolvedAskProvider) {
  if (!provider.executionProvider || !provider.executionModelId) return null;
  return `model:${provider.executionProvider}:${provider.executionModelId}`.toLowerCase();
}

function providerHealthKey(provider: ResolvedAskProvider) {
  if (!provider.executionProvider) return null;
  return `provider:${provider.executionProvider}`.toLowerCase();
}

function healthKeys(provider: ResolvedAskProvider) {
  return [providerHealthKey(provider), modelHealthKey(provider)].filter(
    (key): key is string => Boolean(key)
  );
}

function isProviderWideFailure(category: string) {
  return category === "provider_auth_failed" ||
    category === "provider_insufficient_credits";
}

function needsRepeatedFailure(category: string) {
  return category === "provider_timeout" ||
    category === "provider_network_error";
}

function cooldownDurationMs(category: string, retryAfter?: string | null) {
  const retryAfterSeconds = Number.parseFloat(retryAfter ?? "");
  if (category === "provider_rate_limited") {
    return Number.isFinite(retryAfterSeconds)
      ? Math.min(Math.max(retryAfterSeconds * 1_000, 5_000), 120_000)
      : 30_000;
  }
  if (category === "provider_auth_failed" || category === "provider_insufficient_credits") return 120_000;
  if (category === "provider_model_unavailable") return 45_000;
  if (category === "provider_timeout" || category === "provider_network_error") return 20_000;
  return 0;
}

export function getAskProviderCooldown(
  provider: ResolvedAskProvider,
  now = Date.now()
): AskProviderCooldown {
  const activeStates = healthKeys(provider).flatMap((key) => {
    const state = providerHealth.get(key);
    if (!state) return [];
    if (state.cooldownUntil <= now) {
      providerHealth.delete(key);
      return [];
    }
    return [state];
  }).sort((left, right) => right.cooldownUntil - left.cooldownUntil);
  const state = activeStates[0];
  if (!state) {
    return { active: false, failureCategory: null, remainingMs: 0 };
  }
  return {
    active: true,
    failureCategory: state.failureCategory,
    remainingMs: state.cooldownUntil - now
  };
}

export function recordAskProviderHealth(input: {
  category?: string | null;
  ok: boolean;
  provider: ResolvedAskProvider;
  retryAfter?: string | null;
  now?: number;
}) {
  if (input.ok) {
    healthKeys(input.provider).forEach((key) => {
      providerHealth.delete(key);
      providerFailureStreaks.delete(key);
    });
    return;
  }
  if (!input.category || input.category === "request_cancelled") return;
  const durationMs = cooldownDurationMs(input.category, input.retryAfter);
  if (!durationMs) return;
  const key = isProviderWideFailure(input.category)
    ? providerHealthKey(input.provider)
    : modelHealthKey(input.provider);
  if (!key) return;
  const now = input.now ?? Date.now();
  if (needsRepeatedFailure(input.category)) {
    const previous = providerFailureStreaks.get(key);
    const count = previous && now - previous.lastFailureAt <= 60_000
      ? previous.count + 1
      : 1;
    providerFailureStreaks.set(key, { count, lastFailureAt: now });
    if (count < 2) return;
  } else {
    providerFailureStreaks.delete(key);
  }
  providerHealth.set(key, {
    cooldownUntil: now + durationMs,
    failureCategory: input.category
  });
}

export function resetAskProviderHealthForTests() {
  providerHealth.clear();
  providerFailureStreaks.clear();
}

export function getRegisteredModelMetadata() {
  return hassaliModelRegistry;
}
