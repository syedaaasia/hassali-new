import type {
  IntelligenceAdapter,
  IntelligenceAdapterRegistry
} from "./intelligence-adapter-registry";
import {
  normalizeIntelligenceRequest,
  type IntelligenceCapability,
  type IntelligenceCapabilitySupport,
  type IntelligenceFailure,
  type IntelligenceHealth,
  type IntelligenceModelDescriptor,
  type IntelligenceRequest,
  type IntelligenceResult,
  type IntelligenceStreamResult
} from "./intelligence-contract";
import {
  estimateRequestCostMicros,
  evaluateBudgetCandidate,
  intelligenceCostScope,
  type IntelligenceBudgetContext,
  type IntelligenceCostScope
} from "./intelligence-budget";
import { normalizeIntelligenceResultQuality } from "./intelligence-result-quality";
import {
  assessIntelligenceRuntimeFit,
  executionLocalityForComputeSource,
  isFreshnessDependentRequest,
  type EdgeRuntimeProfile,
  type IntelligenceRuntimeFit
} from "./local-edge-intelligence";

export type IntelligenceRoutingPrivacy = "allow-cloud" | "local-only" | "prefer-local";
export type IntelligenceTaskTier = "complex" | "simple" | "specialist" | "standard";
export type IntelligenceRoutingTaskType = "coding" | "general" | "reasoning" | "writing";

export type IntelligenceRoutingReasonCode =
  | "BYOK_AVAILABLE"
  | "CODE_MODE_FIT"
  | "CODING_TASK_FIT"
  | "DEFAULT_RELIABLE"
  | "FALLBACK_AFTER_MODEL_UNAVAILABLE"
  | "FALLBACK_AFTER_NETWORK"
  | "FALLBACK_AFTER_PROVIDER_UNAVAILABLE"
  | "FALLBACK_AFTER_RATE_LIMIT"
  | "FALLBACK_AFTER_TIMEOUT"
  | "GROWTH_MODE_FIT"
  | "HEALTHY_SOURCE"
  | "LOCAL_PREFERRED"
  | "LOCAL_RESOURCE_FIT"
  | "LOWER_KNOWN_COST"
  | "PRIVACY_LOCALITY_FIT"
  | "USER_OVERRIDE"
  | "VISION_REQUIRED"
  | "WEBSITE_MODE_FIT";

export type AutoRoutingPreferences = {
  allowFallback?: boolean;
  budget?: IntelligenceBudgetContext;
  explicitOverride?: {
    adapterId: string;
    modelId: string;
  } | null;
  preferredModelId?: string | null;
  privacy: IntelligenceRoutingPrivacy;
  runtimeProfile?: EdgeRuntimeProfile;
  scopeId?: string;
  taskTier?: IntelligenceTaskTier;
  taskType?: IntelligenceRoutingTaskType;
};

export type IntelligenceRouteCandidate = {
  adapterId: string;
  budgetWarnings: string[];
  computeSource: IntelligenceAdapter["computeSource"];
  costScope: IntelligenceCostScope;
  estimatedRequestCostMicros: number | null;
  executionLocality: ReturnType<typeof executionLocalityForComputeSource>;
  health: IntelligenceHealth["status"];
  isLocal: boolean;
  identity: string;
  knownCostPerMillion: number | null;
  modelId: string;
  providerId: string;
  reasonCodes: IntelligenceRoutingReasonCode[];
  runtimeFit: IntelligenceRuntimeFit;
  score: number;
};

export type AutoRoutingDecision = {
  fallback: IntelligenceRouteCandidate | null;
  preferredCapabilities: IntelligenceCapability[];
  primary: IntelligenceRouteCandidate;
  privacy: IntelligenceRoutingPrivacy;
  requiredCapabilities: IntelligenceCapability[];
  taskTier: IntelligenceTaskTier;
};

export type AutoRoutingResolution =
  | { decision: AutoRoutingDecision; ok: true }
  | { failure: IntelligenceFailure; ok: false };

export type AutoInvocationResult<T extends IntelligenceResult | IntelligenceStreamResult> = {
  attempts: number;
  decision: AutoRoutingDecision | null;
  fallbackUsed: boolean;
  primaryFailureCategory: IntelligenceFailure["category"] | null;
  result: T;
};

type InternalCandidate = IntelligenceRouteCandidate & {
  adapter: IntelligenceAdapter;
  model: IntelligenceModelDescriptor;
};

type CachedHealth = {
  expiresAt: number;
  health: IntelligenceHealth;
};

type CachedModels = {
  expiresAt: number;
  models: IntelligenceModelDescriptor[];
};

const retryableFallbackCategories = new Set([
  "malformed-provider-response",
  "model-unavailable",
  "network",
  "provider-unavailable",
  "rate-limit",
  "timeout",
  "unsupported-capability"
]);

const providerLevelCapabilities = new Set<IntelligenceCapability>([
  "streaming",
  "text",
  "webResearch"
]);

const healthCache = new Map<string, CachedHealth>();
const modelCache = new Map<string, CachedModels>();
const failureCooldowns = new Map<string, number>();
const healthTtlMs = 30_000;
const maximumHealthEntries = 128;

function isLocal(adapter: IntelligenceAdapter) {
  return adapter.computeSource === "hassali-local" || adapter.computeSource === "local-endpoint";
}

function routingFailure(input: {
  code: string;
  details?: string;
  message: string;
  category?: IntelligenceFailure["category"];
  model?: string | null;
}): IntelligenceFailure {
  return {
    category: input.category ?? "provider-unavailable",
    internal: { code: input.code, details: input.details },
    model: input.model ?? null,
    providerId: "auto",
    retryable: false,
    safeUserMessage: input.message
  };
}

function preferredCapabilities(request: IntelligenceRequest): IntelligenceCapability[] {
  const preferred: IntelligenceCapability[] = ["reasoning"];
  if (request.mode === "CODE") preferred.push("tools", "structuredOutput");
  if (request.mode === "WEBSITE") preferred.push("structuredOutput");
  if (request.mode === "GROWTH") preferred.push("reasoning", "structuredOutput");
  return preferred.filter((capability) => !request.requiredCapabilities.includes(capability));
}

function taskTier(request: IntelligenceRequest, configured?: IntelligenceTaskTier): IntelligenceTaskTier {
  if (configured) return configured;
  if (request.requiredCapabilities.includes("vision") && request.mode !== "ASK") return "specialist";
  if (request.tools?.length || request.mode === "CODE") return "complex";
  const textLength = request.messages.reduce((sum, message) => sum + message.parts.reduce(
    (partSum, part) => partSum + (part.type === "text" ? part.text.length : part.type === "file" ? part.extractedText?.length ?? 0 : 0),
    0
  ), 0);
  return textLength < 240 ? "simple" : textLength > 4_000 ? "complex" : "standard";
}

function capabilitySupport(
  adapter: IntelligenceAdapter,
  model: IntelligenceModelDescriptor,
  capability: IntelligenceCapability
): IntelligenceCapabilitySupport {
  const modelSupport = model.capabilities[capability];
  if (modelSupport !== "unknown") return modelSupport;
  if (providerLevelCapabilities.has(capability)) return adapter.capabilities[capability];
  return "unknown";
}

function knownCost(model: IntelligenceModelDescriptor) {
  const values = [model.pricing.inputPerMillion, model.pricing.outputPerMillion]
    .filter((value): value is number => typeof value === "number");
  return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
}

function tierScore(value: unknown) {
  if (value === "high") return 28;
  if (value === "medium") return 18;
  if (value === "low") return 5;
  return 10;
}

function modeFitness(
  request: IntelligenceRequest,
  model: IntelligenceModelDescriptor,
  taskType: IntelligenceRoutingTaskType = "general"
) {
  const raw = model.rawProviderMetadata ?? {};
  if (request.mode === "CODE" || taskType === "coding") return tierScore(raw.codingTier);
  if (request.mode === "WEBSITE") return tierScore(raw.designTier);
  return tierScore(raw.reasoningTier);
}

function costScore(cost: number | null) {
  if (cost === null) return 0;
  if (cost <= 1) return 8;
  if (cost <= 5) return 6;
  if (cost <= 20) return 4;
  return 2;
}

function healthKey(scopeId: string, adapterId: string) {
  return `${scopeId}:${adapterId}`.toLowerCase();
}

function trimHealthCache() {
  if (healthCache.size <= maximumHealthEntries) return;
  const oldest = [...healthCache.entries()]
    .sort((left, right) => Date.parse(left[1].health.checkedAt) - Date.parse(right[1].health.checkedAt))
    .slice(0, healthCache.size - maximumHealthEntries);
  oldest.forEach(([key]) => healthCache.delete(key));
}

function trimModelCache() {
  if (modelCache.size <= maximumHealthEntries) return;
  const oldest = [...modelCache.entries()]
    .sort((left, right) => left[1].expiresAt - right[1].expiresAt)
    .slice(0, modelCache.size - maximumHealthEntries);
  oldest.forEach(([key]) => modelCache.delete(key));
}

async function cachedHealth(adapter: IntelligenceAdapter, scopeId: string, now: number) {
  const key = healthKey(scopeId, adapter.id);
  const cached = healthCache.get(key);
  if (cached && cached.expiresAt > now) return cached.health;
  const health = await adapter.health();
  healthCache.set(key, { expiresAt: now + healthTtlMs, health });
  trimHealthCache();
  return health;
}

function candidateKey(scopeId: string, candidate: Pick<IntelligenceRouteCandidate, "adapterId" | "modelId">) {
  return `${scopeId}:${candidate.adapterId}:${candidate.modelId}`.toLowerCase();
}

function cooldownDuration(category: IntelligenceFailure["category"]) {
  if (category === "authentication" || category === "authorization" || category === "quota") return 120_000;
  if (category === "rate-limit") return 30_000;
  if (category === "model-unavailable" || category === "provider-unavailable") return 20_000;
  if (category === "malformed-provider-response" || category === "network" || category === "timeout") return 10_000;
  return 0;
}

function rememberFailure(scopeId: string, candidate: IntelligenceRouteCandidate, failure: IntelligenceFailure) {
  const duration = cooldownDuration(failure.category);
  if (duration) failureCooldowns.set(candidateKey(scopeId, candidate), Date.now() + duration);
  if (failure.category === "authentication" || failure.category === "authorization") {
    healthCache.set(healthKey(scopeId, candidate.adapterId), {
      expiresAt: Date.now() + duration,
      health: {
        checkedAt: new Date().toISOString(),
        latencyMs: null,
        providerId: candidate.providerId,
        reason: "Provider authentication failed.",
        retryable: false,
        status: "authentication-failed"
      }
    });
  }
}

function sameRoute(
  left: IntelligenceRouteCandidate,
  right: IntelligenceRouteCandidate | null
) {
  return Boolean(
    right &&
    left.adapterId === right.adapterId &&
    left.modelId === right.modelId
  );
}

function shouldRememberMetaRouterFailure(failure: IntelligenceFailure) {
  return ![
    "malformed-provider-response",
    "model-unavailable",
    "timeout"
  ].includes(failure.category);
}

function fallbackReason(category: IntelligenceFailure["category"]): IntelligenceRoutingReasonCode {
  if (category === "rate-limit") return "FALLBACK_AFTER_RATE_LIMIT";
  if (category === "timeout") return "FALLBACK_AFTER_TIMEOUT";
  if (category === "network") return "FALLBACK_AFTER_NETWORK";
  if (category === "model-unavailable") return "FALLBACK_AFTER_MODEL_UNAVAILABLE";
  return "FALLBACK_AFTER_PROVIDER_UNAVAILABLE";
}

async function adapterModels(
  adapter: IntelligenceAdapter,
  scopeId: string,
  health: IntelligenceHealth,
  now: number
) {
  const key = healthKey(scopeId, adapter.id);
  const cached = modelCache.get(key);
  if (cached && cached.expiresAt > now) return cached.models;
  try {
    const configured = adapter.models ? await adapter.models() : [];
    const models = configured.length || health.status !== "ready" || !adapter.discoverModels
      ? configured
      : await adapter.discoverModels();
    modelCache.set(key, { expiresAt: now + healthTtlMs, models });
    trimModelCache();
    return models;
  } catch {
    modelCache.set(key, { expiresAt: now + healthTtlMs, models: [] });
    return [];
  }
}

export class AutoIntelligenceRouter {
  constructor(private readonly registry: IntelligenceAdapterRegistry) {}

  async resolve(input: IntelligenceRequest, preferences: AutoRoutingPreferences): Promise<AutoRoutingResolution> {
    const request = normalizeIntelligenceRequest(input);
    const scopeId = preferences.scopeId?.trim() || "default";
    const now = Date.now();
    const preferred = preferredCapabilities(request);
    const effectivePrivacy = request.privacy?.dataLocality === "local-only" ? "local-only" : preferences.privacy;
    const resolvedTaskTier = taskTier(request, preferences.taskTier);
    const explicit = preferences.explicitOverride ?? null;
    const adapters = this.registry.list().filter((adapter) => {
      if (effectivePrivacy === "local-only" && !isLocal(adapter)) return false;
      if (explicit && adapter.id.toLowerCase() !== explicit.adapterId.toLowerCase()) return false;
      return true;
    });

    const sources = await Promise.all(adapters.map(async (adapter) => {
      const health = await cachedHealth(adapter, scopeId, now);
      return {
        adapter,
        health,
        models: await adapterModels(adapter, scopeId, health, now)
      };
    }));
    const automaticAskPreference = request.mode === "ASK" &&
      !explicit &&
      Boolean(preferences.preferredModelId) &&
      sources.some((source) => source.models.some((model) =>
        model.modelId.toLowerCase() === preferences.preferredModelId!.toLowerCase() &&
        Boolean(model.rawProviderMetadata?.automaticFallback)
      ));
    const rejectedCapabilities = new Set<IntelligenceCapability>();
    let rejectedByBudget = false;
    const candidates: InternalCandidate[] = [];

    for (const source of sources) {
      if (!["ready", "degraded"].includes(source.health.status)) continue;
      for (const model of source.models) {
        if (model.availability === "unavailable") continue;
        if (automaticAskPreference && model.rawProviderMetadata?.pricingClass !== "free") continue;
        if (explicit && model.modelId.toLowerCase() !== explicit.modelId.toLowerCase()) continue;
        const failedCapability = request.requiredCapabilities.find(
          (capability) => capabilitySupport(source.adapter, model, capability) !== "supported"
        );
        if (failedCapability) {
          rejectedCapabilities.add(failedCapability);
          continue;
        }
        if (request.stream && !source.adapter.stream) {
          rejectedCapabilities.add("streaming");
          continue;
        }
        const runtimeFit = assessIntelligenceRuntimeFit({ model, request, runtimeProfile: preferences.runtimeProfile });
        if (runtimeFit.status === "incompatible") continue;
        if (isLocal(source.adapter) && isFreshnessDependentRequest(request) && capabilitySupport(source.adapter, model, "webResearch") !== "supported") {
          rejectedCapabilities.add("webResearch");
          continue;
        }

        const routeBase = {
          adapterId: source.adapter.id,
          modelId: model.modelId
        };
        const cooldownUntil = failureCooldowns.get(candidateKey(scopeId, routeBase));
        if (cooldownUntil && cooldownUntil > now) continue;
        if (cooldownUntil) failureCooldowns.delete(candidateKey(scopeId, routeBase));

        const reasons: IntelligenceRoutingReasonCode[] = [];
        const isVariableAskMetaRoute = automaticAskPreference &&
          Boolean(model.rawProviderMetadata?.automaticFallback);
        let score = source.health.status === "ready" ? 60 : 20;
        if (isVariableAskMetaRoute) score += 5;
        score += request.requiredCapabilities.length * 12;
        score += preferred.filter(
          (capability) => capabilitySupport(source.adapter, model, capability) === "supported"
        ).length * 4;
        score += modeFitness(request, model, preferences.taskType);
        if (request.mode === "CODE") reasons.push("CODE_MODE_FIT");
        if (preferences.taskType === "coding") reasons.push("CODING_TASK_FIT");
        if (request.mode === "WEBSITE") reasons.push("WEBSITE_MODE_FIT");
        if (request.mode === "GROWTH") reasons.push("GROWTH_MODE_FIT");
        if (source.health.status === "ready") reasons.push("HEALTHY_SOURCE");
        if (request.requiredCapabilities.includes("vision")) reasons.push("VISION_REQUIRED");
        if (source.adapter.computeSource === "byok-cloud") reasons.push("BYOK_AVAILABLE");
        if (source.adapter.id === "openrouter" && !automaticAskPreference) {
          score += 10;
          reasons.push("DEFAULT_RELIABLE");
        }
        if (effectivePrivacy === "prefer-local" && isLocal(source.adapter)) {
          score += 45;
          reasons.push("LOCAL_PREFERRED");
        }
        if (effectivePrivacy === "allow-cloud" && isLocal(source.adapter)) score += 3;
        if (isLocal(source.adapter) && runtimeFit.status === "compatible") reasons.push("LOCAL_RESOURCE_FIT");
        if (isLocal(source.adapter) && request.privacy?.containsSensitiveData) {
          score += 20;
          reasons.push("PRIVACY_LOCALITY_FIT");
        }
        if (explicit) {
          score += 100;
          reasons.push("USER_OVERRIDE");
        } else if (
          source.health.status === "ready" &&
          preferences.preferredModelId?.toLowerCase() === model.modelId.toLowerCase() &&
          !isVariableAskMetaRoute
        ) {
          score += 80;
        }
        if (
          source.adapter.defaultModelId?.toLowerCase() === model.modelId.toLowerCase() &&
          !isVariableAskMetaRoute
        ) score += 20;
        const cost = knownCost(model);
        const scope = intelligenceCostScope(source.adapter.computeSource);
        const estimatedRequestCostMicros = estimateRequestCostMicros(request, model);
        const budget = evaluateBudgetCandidate({
          context: preferences.budget,
          estimatedCostMicros: estimatedRequestCostMicros,
          scope
        });
        if (!budget.eligible) {
          rejectedByBudget = true;
          continue;
        }
        const economicScore = costScore(cost);
        score += economicScore;
        if (economicScore) reasons.push("LOWER_KNOWN_COST");

        candidates.push({
          adapter: source.adapter,
          adapterId: source.adapter.id,
          budgetWarnings: budget.warnings,
          computeSource: source.adapter.computeSource,
          costScope: scope,
          estimatedRequestCostMicros,
          executionLocality: source.adapter.executionLocality ?? executionLocalityForComputeSource(source.adapter.computeSource),
          health: source.health.status,
          isLocal: isLocal(source.adapter),
          identity: `${source.adapter.id}:${source.adapter.computeSource}:${model.modelId}`.toLowerCase(),
          knownCostPerMillion: cost,
          model,
          modelId: model.modelId,
          providerId: source.adapter.providerId,
          reasonCodes: [...new Set(reasons)],
          runtimeFit,
          score
        });
      }
    }

    candidates.sort((left, right) =>
      right.score - left.score ||
      (left.knownCostPerMillion ?? Number.POSITIVE_INFINITY) - (right.knownCostPerMillion ?? Number.POSITIVE_INFINITY) ||
      left.adapterId.localeCompare(right.adapterId) ||
      left.modelId.localeCompare(right.modelId)
    );

    const primary = candidates[0];
    if (!primary) {
      const required = [...rejectedCapabilities][0];
      if (rejectedByBudget) {
        return {
          ok: false,
          failure: routingFailure({
            category: "invalid-request",
            code: "STRICT_BUDGET_NO_ELIGIBLE_MODEL",
            message: "No reliably capable managed model can prove it is within the configured strict budget."
          })
        };
      }
      if (effectivePrivacy === "local-only") {
        return {
          ok: false,
          failure: routingFailure({
            category: required ? "unsupported-capability" : "provider-unavailable",
            code: required ? "NO_CAPABLE_LOCAL_MODEL" : "NO_READY_LOCAL_MODEL",
            details: required ? `No local candidate confirmed ${required}.` : undefined,
            message: required
              ? `No local model currently available supports the required ${required} capability.`
              : "No ready local model is available for this request."
          })
        };
      }
      return {
        ok: false,
        failure: routingFailure({
          category: required ? "unsupported-capability" : "provider-unavailable",
          code: explicit ? "EXPLICIT_ROUTE_UNAVAILABLE" : required ? "NO_CAPABLE_AUTO_MODEL" : "NO_READY_AUTO_MODEL",
          details: required ? `No candidate confirmed ${required}.` : undefined,
          message: explicit
            ? "The selected intelligence source or model is unavailable or cannot satisfy this request."
            : required
              ? `No enabled model can confirm the required ${required} capability.`
              : "No enabled intelligence source is ready for this request.",
          model: explicit?.modelId ?? null
        })
      };
    }

    const publicCandidate = (candidate: InternalCandidate): IntelligenceRouteCandidate => ({
      adapterId: candidate.adapterId,
      budgetWarnings: candidate.budgetWarnings,
      computeSource: candidate.computeSource,
      costScope: candidate.costScope,
      estimatedRequestCostMicros: candidate.estimatedRequestCostMicros,
      executionLocality: candidate.executionLocality,
      health: candidate.health,
      isLocal: candidate.isLocal,
      identity: candidate.identity,
      knownCostPerMillion: candidate.knownCostPerMillion,
      modelId: candidate.modelId,
      providerId: candidate.providerId,
      reasonCodes: candidate.reasonCodes,
      runtimeFit: candidate.runtimeFit,
      score: candidate.score
    });
    const fallbackCandidates = candidates.slice(1).filter((candidate) =>
      candidate.adapterId !== primary.adapterId || candidate.modelId !== primary.modelId
    );
    if (
      !explicit &&
      preferences.allowFallback !== false &&
      primary.model.rawProviderMetadata?.automaticFallback
    ) {
      // A provider-managed meta-router can legitimately select a different
      // upstream model on the one bounded fallback attempt. Keep that retry
      // ahead of registry alternatives that may be stale or unavailable.
      fallbackCandidates.push(primary);
    }
    const primaryUsesMetaRoute = Boolean(primary.model.rawProviderMetadata?.automaticFallback);
    const preferConcreteFallback = automaticAskPreference && !primaryUsesMetaRoute;
    fallbackCandidates.sort((left, right) =>
      (preferConcreteFallback
        ? Number(Boolean(left.model.rawProviderMetadata?.automaticFallback)) - Number(Boolean(right.model.rawProviderMetadata?.automaticFallback))
        : Number(Boolean(right.model.rawProviderMetadata?.automaticFallback)) - Number(Boolean(left.model.rawProviderMetadata?.automaticFallback))) ||
      right.score - left.score ||
      left.adapterId.localeCompare(right.adapterId) ||
      left.modelId.localeCompare(right.modelId)
    );
    const fallback = !explicit && preferences.allowFallback !== false
      ? fallbackCandidates[0] ?? null
      : null;
    return {
      ok: true,
      decision: {
        fallback: fallback ? publicCandidate(fallback) : null,
        preferredCapabilities: preferred,
        primary: publicCandidate(primary),
        privacy: effectivePrivacy,
        requiredCapabilities: request.requiredCapabilities,
        taskTier: resolvedTaskTier
      }
    };
  }

  private candidate(decision: IntelligenceRouteCandidate) {
    return this.registry.get(decision.adapterId);
  }

  async invoke(input: IntelligenceRequest, preferences: AutoRoutingPreferences): Promise<AutoInvocationResult<IntelligenceResult>> {
    const request = normalizeIntelligenceRequest(input);
    const resolution = await this.resolve(request, preferences);
    if (!resolution.ok) return { attempts: 0, decision: null, fallbackUsed: false, primaryFailureCategory: null, result: { ok: false, failure: resolution.failure } };
    const scopeId = preferences.scopeId?.trim() || "default";
    const invokeCandidate = (candidate: IntelligenceRouteCandidate) => this.candidate(candidate).invoke({
      ...request,
      privacy: {
        ...request.privacy,
        dataLocality: resolution.decision.privacy === "local-only" ? "local-only" : request.privacy?.dataLocality
      },
      requestedModel: candidate.modelId
    });
    const primaryResult = normalizeIntelligenceResultQuality(
      request,
      await invokeCandidate(resolution.decision.primary)
    );
    const providerManagedRetry = sameRoute(resolution.decision.primary, resolution.decision.fallback);
    if (primaryResult.ok || !retryableFallbackCategories.has(primaryResult.failure.category) || !resolution.decision.fallback) {
      if (!primaryResult.ok) rememberFailure(scopeId, resolution.decision.primary, primaryResult.failure);
      return { attempts: 1, decision: resolution.decision, fallbackUsed: false, primaryFailureCategory: null, result: primaryResult };
    }
    if (!providerManagedRetry || shouldRememberMetaRouterFailure(primaryResult.failure)) {
      rememberFailure(scopeId, resolution.decision.primary, primaryResult.failure);
    }
    const fallback = {
      ...resolution.decision.fallback,
      reasonCodes: [...resolution.decision.fallback.reasonCodes, fallbackReason(primaryResult.failure.category)]
    };
    const fallbackResult = normalizeIntelligenceResultQuality(request, await invokeCandidate(fallback));
    if (
      !fallbackResult.ok &&
      (!providerManagedRetry || shouldRememberMetaRouterFailure(fallbackResult.failure))
    ) {
      rememberFailure(scopeId, fallback, fallbackResult.failure);
    }
    return {
      attempts: 2,
      decision: { ...resolution.decision, fallback },
      fallbackUsed: true,
      primaryFailureCategory: primaryResult.failure.category,
      result: fallbackResult
    };
  }

  async stream(input: IntelligenceRequest, preferences: AutoRoutingPreferences): Promise<AutoInvocationResult<IntelligenceStreamResult>> {
    const request = normalizeIntelligenceRequest({ ...input, stream: true });
    const resolution = await this.resolve(request, preferences);
    if (!resolution.ok) return { attempts: 0, decision: null, fallbackUsed: false, primaryFailureCategory: null, result: { ok: false, failure: resolution.failure } };
    const scopeId = preferences.scopeId?.trim() || "default";
    const streamCandidate = (candidate: IntelligenceRouteCandidate): Promise<IntelligenceStreamResult> => {
      const adapter = this.candidate(candidate);
      if (!adapter.stream) {
        return Promise.resolve({
          ok: false,
          failure: routingFailure({
            category: "unsupported-capability",
            code: "STREAM_METHOD_UNAVAILABLE",
            message: "The selected provider does not expose streaming through Hassali.",
            model: candidate.modelId
          })
        });
      }
      return adapter.stream({
        ...request,
        privacy: {
          ...request.privacy,
          dataLocality: resolution.decision.privacy === "local-only" ? "local-only" : request.privacy?.dataLocality
        },
        requestedModel: candidate.modelId
      });
    };
    const primaryResult = await streamCandidate(resolution.decision.primary);
    const providerManagedRetry = sameRoute(resolution.decision.primary, resolution.decision.fallback);
    if (primaryResult.ok || !retryableFallbackCategories.has(primaryResult.failure.category) || !resolution.decision.fallback) {
      if (!primaryResult.ok) rememberFailure(scopeId, resolution.decision.primary, primaryResult.failure);
      return { attempts: 1, decision: resolution.decision, fallbackUsed: false, primaryFailureCategory: null, result: primaryResult };
    }
    if (!providerManagedRetry || shouldRememberMetaRouterFailure(primaryResult.failure)) {
      rememberFailure(scopeId, resolution.decision.primary, primaryResult.failure);
    }
    const fallback = {
      ...resolution.decision.fallback,
      reasonCodes: [...resolution.decision.fallback.reasonCodes, fallbackReason(primaryResult.failure.category)]
    };
    const fallbackResult = await streamCandidate(fallback);
    if (
      !fallbackResult.ok &&
      (!providerManagedRetry || shouldRememberMetaRouterFailure(fallbackResult.failure))
    ) {
      rememberFailure(scopeId, fallback, fallbackResult.failure);
    }
    return {
      attempts: 2,
      decision: { ...resolution.decision, fallback },
      fallbackUsed: true,
      primaryFailureCategory: primaryResult.failure.category,
      result: fallbackResult
    };
  }
}

export function resetAutoIntelligenceRouterStateForTests() {
  healthCache.clear();
  modelCache.clear();
  failureCooldowns.clear();
}
