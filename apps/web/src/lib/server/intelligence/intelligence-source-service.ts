import {
  getPersistedIntelligencePreferences,
  listPersistedIntelligenceSources,
  upsertPersistedIntelligencePreferences,
  upsertPersistedIntelligenceSourceConfig
} from "@hassali/database";
import {
  configurableIntelligenceSourceIds,
  isConfigurableIntelligenceSourceId,
  type ConfigurableIntelligenceSourceId,
  type IntelligenceSourceSummary,
  type IntelligenceSourcesResponse
} from "@/lib/intelligence-sources";
import {
  defaultIntelligenceBudgetPolicy,
  dollarsToMicros,
  isIntelligenceBudgetMode,
  microsToDollars,
  type IntelligenceBudgetMode,
  type IntelligenceBudgetPolicy
} from "./intelligence-budget";
import { type IntelligenceHealth, type IntelligenceRequest } from "./intelligence-contract";
import {
  intelligenceSourceSessionVault,
  type StoredIntelligenceSource
} from "./intelligence-source-vault";
import { normalizeLocalIntelligenceEndpoint } from "./openai-compatible-adapter";
import { createConfiguredSourceAdapter, testConfiguredSource } from "./configured-source-adapters";
import type { IntelligenceFetch } from "./openai-compatible-adapter";
import { createCurrentIntelligenceRegistry } from "./current-provider-adapter";
import {
  AutoIntelligenceRouter,
  type AutoRoutingPreferences,
  type IntelligenceRoutingPrivacy
} from "./auto-intelligence-router";
import {
  environmentIntelligenceSecretStore,
  intelligenceSecretPersistenceState
} from "./intelligence-secret-store";
import {
  currentIntelligenceUsageSummary,
  meterIntelligenceResult,
  meterIntelligenceStream
} from "./intelligence-metering";
import { localFoundationStatus } from "./hassali-local-contract";

const sourceDetails: Record<ConfigurableIntelligenceSourceId, { description: string; label: string }> = {
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

const hydratedDurableUsers = new Set<string>();

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
  stored: StoredIntelligenceSource | null,
  persistence: "durable-encrypted" | "server-session"
): IntelligenceSourceSummary {
  const configured = sourceId === "openrouter-byok"
    ? Boolean(stored?.credentialConfigured)
    : Boolean(stored?.endpointUrl);
  const health = stored?.health ?? (configured
    ? {
        ...unconfiguredHealth(sourceId),
        reason: stored?.enabled === false
          ? "This provider connection is disabled."
          : "Connection saved. Test it to verify availability.",
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
    persistence
  };
}

function normalizedPreferences(row: Awaited<ReturnType<typeof getPersistedIntelligencePreferences>>) {
  return {
    budget: {
      byokMonthlyWarningLimitMicros: row?.byokMonthlyWarningLimitMicros ?? null,
      managedMonthlyLimitMicros: row?.managedMonthlyLimitMicros ?? null,
      managedPerRequestLimitMicros: row?.managedPerRequestLimitMicros ?? null,
      mode: isIntelligenceBudgetMode(row?.budgetMode) ? row.budgetMode : "off"
    } satisfies IntelligenceBudgetPolicy,
    privacy: isIntelligenceRoutingPrivacy(row?.routingPrivacy) ? row.routingPrivacy : "allow-cloud"
  };
}

async function ensureUserState(userId: string) {
  const persistedPreferences = await getPersistedIntelligencePreferences(userId).catch(() => null);
  const preferences = normalizedPreferences(persistedPreferences);
  intelligenceSourceSessionVault.setRoutingPrivacy(userId, preferences.privacy);

  const secretStore = environmentIntelligenceSecretStore();
  if (!secretStore || hydratedDurableUsers.has(userId)) return preferences;
  const persistedSources = await listPersistedIntelligenceSources(userId);
  for (const source of persistedSources) {
    if (!isConfigurableIntelligenceSourceId(source.sourceId)) continue;
    const apiKey = source.credentialConfigured
      ? await secretStore.get(userId, source.sourceId)
      : undefined;
    intelligenceSourceSessionVault.configure({
      apiKey: apiKey ?? undefined,
      defaultModel: source.defaultModel,
      enabled: source.enabled,
      endpointUrl: source.endpointUrl,
      sourceId: source.sourceId,
      userId
    });
  }
  hydratedDurableUsers.add(userId);
  return preferences;
}

async function usageSummaryOrEmpty(userId: string) {
  const now = new Date();
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  return currentIntelligenceUsageSummary(userId).catch(() => ({
    byokCostMicros: 0,
    byokRequests: 0,
    localRequests: 0,
    managedCostMicros: 0,
    managedUnknownCostRequests: 0,
    periodStart,
    requestCount: 0,
    totalTokens: 0
  }));
}

export async function listIntelligenceSources(userId: string): Promise<IntelligenceSourcesResponse> {
  const preferences = await ensureUserState(userId);
  const stored = new Map(intelligenceSourceSessionVault.list(userId).map((source) => [source.id, source]));
  const environmentConfigured = Boolean(process.env.OPENROUTER_API_KEY?.trim());
  const persistence = intelligenceSecretPersistenceState();
  const usage = await usageSummaryOrEmpty(userId);
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
    budget: {
      byokMonthlyWarningLimitUsd: microsToDollars(preferences.budget.byokMonthlyWarningLimitMicros),
      managedMonthlyLimitUsd: microsToDollars(preferences.budget.managedMonthlyLimitMicros),
      managedPerRequestLimitUsd: microsToDollars(preferences.budget.managedPerRequestLimitMicros),
      mode: preferences.budget.mode
    },
    disclosure: persistence.reason,
    local: localFoundationStatus(),
    routing: {
      mode: "auto",
      privacy: preferences.privacy
    },
    sources: [
      currentSource,
      ...configurableIntelligenceSourceIds.map((sourceId) => sourceSummary(
        sourceId,
        stored.get(sourceId) ?? null,
        persistence.mode
      ))
    ],
    usage: {
      byokCostUsd: usage.byokCostMicros / 1_000_000,
      byokRequests: usage.byokRequests,
      localRequests: usage.localRequests,
      managedCostUsd: usage.managedCostMicros / 1_000_000,
      managedUnknownCostRequests: usage.managedUnknownCostRequests,
      periodStart: usage.periodStart,
      requestCount: usage.requestCount,
      totalTokens: usage.totalTokens
    }
  };
}

export async function setIntelligenceRoutingPrivacy(userId: string, privacy: IntelligenceRoutingPrivacy) {
  const current = normalizedPreferences(await getPersistedIntelligencePreferences(userId));
  await upsertPersistedIntelligencePreferences({
    ...current.budget,
    budgetMode: current.budget.mode,
    externalUserId: userId,
    routingPrivacy: privacy
  });
  return intelligenceSourceSessionVault.setRoutingPrivacy(userId, privacy);
}

export async function setIntelligenceBudgetPolicy(input: {
  byokMonthlyWarningLimitUsd: unknown;
  managedMonthlyLimitUsd: unknown;
  managedPerRequestLimitUsd: unknown;
  mode: IntelligenceBudgetMode;
  userId: string;
}) {
  const current = normalizedPreferences(await getPersistedIntelligencePreferences(input.userId));
  await upsertPersistedIntelligencePreferences({
    budgetMode: input.mode,
    byokMonthlyWarningLimitMicros: dollarsToMicros(input.byokMonthlyWarningLimitUsd),
    externalUserId: input.userId,
    managedMonthlyLimitMicros: dollarsToMicros(input.managedMonthlyLimitUsd),
    managedPerRequestLimitMicros: dollarsToMicros(input.managedPerRequestLimitUsd),
    routingPrivacy: current.privacy
  });
}

export function isIntelligenceRoutingPrivacy(value: unknown): value is IntelligenceRoutingPrivacy {
  return value === "allow-cloud" || value === "prefer-local" || value === "local-only";
}

export { isIntelligenceBudgetMode };

export async function configureIntelligenceSource(input: {
  apiKey?: string;
  defaultModel?: string | null;
  enabled?: boolean;
  endpointUrl?: string | null;
  sourceId: ConfigurableIntelligenceSourceId;
  userId: string;
}) {
  await ensureUserState(input.userId);
  const existing = intelligenceSourceSessionVault.get(input.userId, input.sourceId);
  const apiKey = input.apiKey?.trim();
  if (apiKey && apiKey.length > 512) throw new Error("API_KEY_TOO_LONG");
  if (input.sourceId === "openrouter-byok" && !apiKey && !existing?.credentialConfigured) {
    throw new Error("API_KEY_REQUIRED");
  }
  const defaultModel = input.defaultModel?.trim() || null;
  if (defaultModel && defaultModel.length > 240) throw new Error("MODEL_ID_TOO_LONG");
  const endpointUrl = input.sourceId === "openrouter-byok"
    ? null
    : normalizeLocalIntelligenceEndpoint(
        input.endpointUrl?.trim() || existing?.endpointUrl || defaultEndpoints[input.sourceId]
      );
  const enabled = input.enabled ?? existing?.enabled ?? true;
  const secretStore = environmentIntelligenceSecretStore();
  if (secretStore) {
    await upsertPersistedIntelligenceSourceConfig({
      defaultModel,
      enabled,
      endpointUrl,
      externalUserId: input.userId,
      sourceId: input.sourceId
    });
    if (apiKey) await secretStore.put(input.userId, input.sourceId, apiKey);
    hydratedDurableUsers.add(input.userId);
  }
  return intelligenceSourceSessionVault.configure({
    apiKey,
    defaultModel,
    enabled,
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
  await ensureUserState(userId);
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

export async function disconnectIntelligenceSource(userId: string, sourceId: ConfigurableIntelligenceSourceId) {
  const secretStore = environmentIntelligenceSecretStore();
  if (secretStore) await secretStore.delete(userId, sourceId);
  return intelligenceSourceSessionVault.disconnect(userId, sourceId);
}

export async function createAvailableIntelligenceRegistryForUser(userId: string, fetchImpl?: IntelligenceFetch) {
  await ensureUserState(userId);
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

async function routingPreferences(input: {
  allowFallback?: boolean;
  explicitOverride?: AutoRoutingPreferences["explicitOverride"];
  preferredModelId?: string | null;
  taskTier?: AutoRoutingPreferences["taskTier"];
  userId: string | null;
}): Promise<AutoRoutingPreferences> {
  if (!input.userId) {
    return {
      allowFallback: input.allowFallback,
      budget: { policy: defaultIntelligenceBudgetPolicy, usage: { byokCostMicros: 0, managedCostMicros: 0, managedUnknownCostRequests: 0 } },
      explicitOverride: input.explicitOverride,
      preferredModelId: input.preferredModelId,
      privacy: "allow-cloud",
      scopeId: "environment-default",
      taskTier: input.taskTier
    };
  }
  const preferences = await ensureUserState(input.userId);
  const usage = await usageSummaryOrEmpty(input.userId);
  return {
    allowFallback: input.allowFallback,
    budget: {
      policy: preferences.budget,
      usage: {
        byokCostMicros: usage.byokCostMicros,
        managedCostMicros: usage.managedCostMicros,
        managedUnknownCostRequests: usage.managedUnknownCostRequests
      }
    },
    explicitOverride: input.explicitOverride,
    preferredModelId: input.preferredModelId,
    privacy: preferences.privacy,
    scopeId: input.userId,
    taskTier: input.taskTier
  };
}

export async function invokeAutoIntelligence(input: {
  allowFallback?: boolean;
  explicitOverride?: AutoRoutingPreferences["explicitOverride"];
  fetchImpl?: IntelligenceFetch;
  preferredModelId?: string | null;
  request: IntelligenceRequest;
  taskTier?: AutoRoutingPreferences["taskTier"];
  userId: string | null;
}) {
  const registry = input.userId
    ? await createAvailableIntelligenceRegistryForUser(input.userId, input.fetchImpl)
    : createCurrentIntelligenceRegistry({ fetchImpl: input.fetchImpl });
  const startedAt = new Date();
  const outcome = await new AutoIntelligenceRouter(registry).invoke(input.request, await routingPreferences(input));
  return meterIntelligenceResult({
    externalUserId: input.userId,
    outcome,
    request: input.request,
    startedAt
  });
}

export async function streamAutoIntelligence(input: {
  allowFallback?: boolean;
  explicitOverride?: AutoRoutingPreferences["explicitOverride"];
  fetchImpl?: IntelligenceFetch;
  preferredModelId?: string | null;
  request: IntelligenceRequest;
  taskTier?: AutoRoutingPreferences["taskTier"];
  userId: string | null;
}) {
  const registry = input.userId
    ? await createAvailableIntelligenceRegistryForUser(input.userId, input.fetchImpl)
    : createCurrentIntelligenceRegistry({ fetchImpl: input.fetchImpl });
  const startedAt = new Date();
  const outcome = await new AutoIntelligenceRouter(registry).stream(input.request, await routingPreferences(input));
  return meterIntelligenceStream({
    externalUserId: input.userId,
    outcome,
    request: input.request,
    startedAt
  });
}

export function resetIntelligenceSourceServiceForTests() {
  hydratedDurableUsers.clear();
}
