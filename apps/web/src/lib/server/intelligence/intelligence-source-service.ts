import {
  configurableIntelligenceSourceIds,
  type ConfigurableIntelligenceSourceId,
  type IntelligenceSourceSummary,
  type IntelligenceSourcesResponse
} from "@/lib/intelligence-sources";
import { type IntelligenceHealth } from "./intelligence-contract";
import {
  intelligenceSourceSessionVault,
  type StoredIntelligenceSource
} from "./intelligence-source-vault";
import { normalizeLocalIntelligenceEndpoint } from "./openai-compatible-adapter";
import { createConfiguredSourceAdapter, testConfiguredSource } from "./configured-source-adapters";
import type { IntelligenceFetch } from "./openai-compatible-adapter";
import { createCurrentIntelligenceRegistry } from "./current-provider-adapter";

const sourceDetails: Record<ConfigurableIntelligenceSourceId, {
  description: string;
  label: string;
}> = {
  "llama-cpp": {
    description: "Connect to a running llama.cpp server on this computer. Hassali never starts or installs it.",
    label: "llama.cpp"
  },
  ollama: {
    description: "Use models already available from a running local Ollama service.",
    label: "Ollama"
  },
  "openrouter-byok": {
    description: "Use your own OpenRouter API key. Your provider account remains responsible for usage and billing.",
    label: "OpenRouter BYOK"
  }
};

const defaultEndpoints: Record<Exclude<ConfigurableIntelligenceSourceId, "openrouter-byok">, string> = {
  "llama-cpp": "http://127.0.0.1:8080/",
  ollama: "http://127.0.0.1:11434/"
};

function unconfiguredHealth(providerId: string): IntelligenceHealth {
  return {
    checkedAt: new Date().toISOString(),
    latencyMs: null,
    providerId,
    reason: "This provider connection is not configured.",
    retryable: false,
    status: "unconfigured"
  };
}

function sourceSummary(
  sourceId: ConfigurableIntelligenceSourceId,
  stored: StoredIntelligenceSource | null
): IntelligenceSourceSummary {
  const configured = sourceId === "openrouter-byok"
    ? Boolean(stored?.credentialConfigured)
    : Boolean(stored?.endpointUrl);
  const health = stored?.health ?? (configured
    ? {
        ...unconfiguredHealth(sourceId),
        reason: stored?.enabled === false
          ? "This provider connection is disabled."
          : "Connection saved for this server session. Test it to verify availability.",
        status: stored?.enabled === false ? "unconfigured" as const : "degraded" as const
      }
    : unconfiguredHealth(sourceId));
  return {
    computeSource: sourceId === "openrouter-byok" ? "byok-cloud" : "local-endpoint",
    configured,
    credentialConfigured: Boolean(stored?.credentialConfigured),
    defaultModel: stored?.defaultModel ?? null,
    description: sourceDetails[sourceId].description,
    enabled: stored?.enabled ?? false,
    endpointUrl: stored?.endpointUrl ?? (sourceId === "openrouter-byok" ? null : defaultEndpoints[sourceId]),
    health: {
      checkedAt: health.checkedAt,
      latencyMs: health.latencyMs,
      reason: health.reason,
      status: health.status
    },
    id: sourceId,
    label: sourceDetails[sourceId].label,
    modelCount: stored?.models.length ?? 0,
    models: stored?.models.slice(0, 40) ?? [],
    persistence: "server-session"
  };
}

export function listIntelligenceSources(userId: string): IntelligenceSourcesResponse {
  const stored = new Map(
    intelligenceSourceSessionVault.list(userId).map((source) => [source.id, source])
  );
  const environmentConfigured = Boolean(process.env.OPENROUTER_API_KEY?.trim());
  const currentSource: IntelligenceSourceSummary = {
    computeSource: "free-cloud",
    configured: environmentConfigured,
    credentialConfigured: environmentConfigured,
    defaultModel: null,
    description: "Hassali's current environment-managed provider path. Existing ASK, WEBSITE, and CODE behavior remains unchanged.",
    enabled: true,
    endpointUrl: null,
    health: {
      checkedAt: null,
      latencyMs: null,
      reason: environmentConfigured
        ? "Configured by the Hassali server environment."
        : "The current server environment has no default provider credential.",
      status: environmentConfigured ? "ready" : "unconfigured"
    },
    id: "hassali-cloud",
    label: "Hassali Cloud",
    modelCount: 0,
    models: [],
    persistence: "environment"
  };
  return {
    disclosure: "BYOK keys and local connections are encrypted in server memory for this session only. They are cleared on server restart and are never returned to the browser.",
    sources: [
      currentSource,
      ...configurableIntelligenceSourceIds.map((sourceId) => sourceSummary(
        sourceId,
        stored.get(sourceId) ?? null
      ))
    ]
  };
}

export function configureIntelligenceSource(input: {
  apiKey?: string;
  defaultModel?: string | null;
  enabled?: boolean;
  endpointUrl?: string | null;
  sourceId: ConfigurableIntelligenceSourceId;
  userId: string;
}) {
  const existing = intelligenceSourceSessionVault.get(input.userId, input.sourceId);
  const apiKey = input.apiKey?.trim();
  if (apiKey && apiKey.length > 512) {
    throw new Error("API_KEY_TOO_LONG");
  }
  if (input.sourceId === "openrouter-byok" && !apiKey && !existing?.credentialConfigured) {
    throw new Error("API_KEY_REQUIRED");
  }
  const defaultModel = input.defaultModel?.trim() || null;
  if (defaultModel && defaultModel.length > 240) {
    throw new Error("MODEL_ID_TOO_LONG");
  }
  const endpointUrl = input.sourceId === "openrouter-byok"
    ? null
    : normalizeLocalIntelligenceEndpoint(
        input.endpointUrl?.trim() || existing?.endpointUrl || defaultEndpoints[input.sourceId]
      );
  return intelligenceSourceSessionVault.configure({
    apiKey,
    defaultModel,
    enabled: input.enabled ?? existing?.enabled ?? true,
    endpointUrl,
    sourceId: input.sourceId,
    userId: input.userId
  });
}

export async function testIntelligenceSourceConnection(
  userId: string,
  sourceId: ConfigurableIntelligenceSourceId,
  fetchImpl?: IntelligenceFetch
) {
  const source = intelligenceSourceSessionVault.get(userId, sourceId);
  if (!source) throw new Error("SOURCE_NOT_CONFIGURED");
  const result = await testConfiguredSource({
    fetchImpl,
    getApiKey: () => intelligenceSourceSessionVault.getCredential(userId, sourceId),
    source
  });
  intelligenceSourceSessionVault.recordCheck({
    health: result.health,
    models: result.models,
    sourceId,
    userId
  });
  return result;
}

export function disconnectIntelligenceSource(userId: string, sourceId: ConfigurableIntelligenceSourceId) {
  return intelligenceSourceSessionVault.disconnect(userId, sourceId);
}

export function createAvailableIntelligenceRegistryForUser(
  userId: string,
  fetchImpl?: IntelligenceFetch
) {
  const registry = createCurrentIntelligenceRegistry();
  for (const source of intelligenceSourceSessionVault.list(userId)) {
    if (!source.enabled) continue;
    registry.register(createConfiguredSourceAdapter({
      fetchImpl,
      getApiKey: () => intelligenceSourceSessionVault.getCredential(userId, source.id),
      source
    }));
  }
  return registry;
}
