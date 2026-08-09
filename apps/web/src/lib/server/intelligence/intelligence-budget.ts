import type {
  IntelligenceComputeSource,
  IntelligenceModelDescriptor,
  IntelligenceRequest
} from "./intelligence-contract";

export type IntelligenceBudgetMode = "off" | "strict" | "warn";
export type IntelligenceCostScope = "byok" | "local" | "managed";

export type IntelligenceBudgetPolicy = {
  byokMonthlyWarningLimitMicros: number | null;
  managedMonthlyLimitMicros: number | null;
  managedPerRequestLimitMicros: number | null;
  mode: IntelligenceBudgetMode;
};

export type IntelligenceBudgetUsage = {
  byokCostMicros: number;
  managedCostMicros: number;
  managedUnknownCostRequests: number;
};

export type IntelligenceBudgetContext = {
  policy: IntelligenceBudgetPolicy;
  usage: IntelligenceBudgetUsage;
};

export const defaultIntelligenceBudgetPolicy: IntelligenceBudgetPolicy = {
  byokMonthlyWarningLimitMicros: null,
  managedMonthlyLimitMicros: null,
  managedPerRequestLimitMicros: null,
  mode: "off"
};

export const emptyIntelligenceBudgetUsage: IntelligenceBudgetUsage = {
  byokCostMicros: 0,
  managedCostMicros: 0,
  managedUnknownCostRequests: 0
};

export function intelligenceCostScope(computeSource: IntelligenceComputeSource): IntelligenceCostScope {
  if (computeSource === "byok-cloud") return "byok";
  if (computeSource === "hassali-local" || computeSource === "local-endpoint") return "local";
  return "managed";
}

function estimatedInputTokens(request: IntelligenceRequest) {
  const characters = request.messages.reduce((sum, message) => sum + message.parts.reduce(
    (partSum, part) => partSum + (
      part.type === "text"
        ? part.text.length
        : part.type === "file"
          ? part.extractedText?.length ?? 0
          : 0
    ),
    0
  ), 0);
  return Math.max(1, Math.ceil(characters / 4));
}

export function estimateRequestCostMicros(
  request: IntelligenceRequest,
  model: IntelligenceModelDescriptor
): number | null {
  const { inputPerMillion, outputPerMillion, currency } = model.pricing;
  if (currency !== "USD" || inputPerMillion === null || outputPerMillion === null) return null;
  const inputCost = estimatedInputTokens(request) * inputPerMillion / 1_000_000;
  const outputTokens = request.generation?.maxOutputTokens ?? 1_024;
  const outputCost = outputTokens * outputPerMillion / 1_000_000;
  return Math.max(0, Math.round((inputCost + outputCost) * 1_000_000));
}

export function evaluateBudgetCandidate(input: {
  context?: IntelligenceBudgetContext;
  estimatedCostMicros: number | null;
  scope: IntelligenceCostScope;
}) {
  const context = input.context ?? {
    policy: defaultIntelligenceBudgetPolicy,
    usage: emptyIntelligenceBudgetUsage
  };
  const { policy, usage } = context;
  const warnings: string[] = [];
  if (policy.mode === "off" || input.scope === "local") return { eligible: true, warnings };

  if (input.scope === "byok") {
    if (
      policy.byokMonthlyWarningLimitMicros !== null &&
      usage.byokCostMicros + (input.estimatedCostMicros ?? 0) > policy.byokMonthlyWarningLimitMicros
    ) {
      warnings.push("Your configured BYOK monthly warning level may be exceeded.");
    }
    return { eligible: true, warnings };
  }

  const hasPerRequestLimit = policy.managedPerRequestLimitMicros !== null;
  const hasMonthlyLimit = policy.managedMonthlyLimitMicros !== null;
  if (!hasPerRequestLimit && !hasMonthlyLimit) return { eligible: true, warnings };

  const estimatedCostMicros = input.estimatedCostMicros;
  const costUnknown = estimatedCostMicros === null;
  const cannotProveMonthly = hasMonthlyLimit && usage.managedUnknownCostRequests > 0;
  const exceedsPerRequest = hasPerRequestLimit && !costUnknown &&
    estimatedCostMicros! > policy.managedPerRequestLimitMicros!;
  const exceedsMonthly = hasMonthlyLimit && !costUnknown &&
    usage.managedCostMicros + estimatedCostMicros! > policy.managedMonthlyLimitMicros!;

  if (costUnknown) warnings.push("Managed provider pricing is unknown for this request.");
  if (cannotProveMonthly) warnings.push("Earlier managed usage has unknown cost, so the monthly total cannot be proven.");
  if (exceedsPerRequest) warnings.push("The estimated managed request cost exceeds your per-request limit.");
  if (exceedsMonthly) warnings.push("The estimated managed request cost would exceed your monthly limit.");

  return {
    eligible: policy.mode !== "strict" || !(costUnknown || cannotProveMonthly || exceedsPerRequest || exceedsMonthly),
    warnings
  };
}

export function isIntelligenceBudgetMode(value: unknown): value is IntelligenceBudgetMode {
  return value === "off" || value === "warn" || value === "strict";
}

export function dollarsToMicros(value: unknown) {
  if (value === null || value === "" || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1_000_000) throw new Error("BUDGET_LIMIT_INVALID");
  return Math.round(parsed * 1_000_000);
}

export function microsToDollars(value: number | null) {
  return value === null ? null : value / 1_000_000;
}
