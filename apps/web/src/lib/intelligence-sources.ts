import type {
  IntelligenceComputeSource,
  IntelligenceHealthStatus
} from "@/lib/server/intelligence/intelligence-contract";
import type { IntelligenceRoutingPrivacy } from "@/lib/server/intelligence/auto-intelligence-router";
import type { IntelligenceBudgetMode } from "@/lib/server/intelligence/intelligence-budget";

export const configurableIntelligenceSourceIds = [
  "openrouter-byok",
  "ollama",
  "llama-cpp"
] as const;

export type ConfigurableIntelligenceSourceId =
  (typeof configurableIntelligenceSourceIds)[number];
export type IntelligenceSourceId = "hassali-cloud" | ConfigurableIntelligenceSourceId;

export type IntelligenceSourceModelSummary = {
  capabilities: string[];
  contextLimit: number | null;
  displayName: string;
  format: string | null;
  modelId: string;
  parameterSize: string | null;
  quantization: string | null;
  sizeBytes: number | null;
};

export type IntelligenceSourceSummary = {
  computeSource: IntelligenceComputeSource;
  configured: boolean;
  credentialConfigured: boolean;
  defaultModel: string | null;
  description: string;
  enabled: boolean;
  endpointUrl: string | null;
  health: {
    checkedAt: string | null;
    latencyMs: number | null;
    reason: string | null;
    status: IntelligenceHealthStatus;
  };
  id: IntelligenceSourceId;
  label: string;
  modelCount: number;
  models: IntelligenceSourceModelSummary[];
  persistence: "durable-encrypted" | "environment" | "server-session";
};

export type IntelligenceSourcesResponse = {
  budget: {
    byokMonthlyWarningLimitUsd: number | null;
    managedMonthlyLimitUsd: number | null;
    managedPerRequestLimitUsd: number | null;
    mode: IntelligenceBudgetMode;
  };
  disclosure: string;
  local: {
    companionInstalled: false;
    companionPaired: false;
    modelsAvailable: 0;
    protocolVersion: string;
    status: "foundation-only";
  };
  persistence: {
    message: string;
    mode: "durable-encrypted" | "server-session";
    status: "degraded" | "ready" | "unavailable";
    warnings: string[];
  };
  routing: {
    mode: "auto";
    privacy: IntelligenceRoutingPrivacy;
  };
  sources: IntelligenceSourceSummary[];
  usage: {
    byokCostUsd: number;
    byokRequests: number;
    localRequests: number;
    managedCostUsd: number;
    managedUnknownCostRequests: number;
    periodStart: string;
    requestCount: number;
    totalTokens: number;
  };
};

export function isConfigurableIntelligenceSourceId(
  value: unknown
): value is ConfigurableIntelligenceSourceId {
  return typeof value === "string" && configurableIntelligenceSourceIds.includes(
    value as ConfigurableIntelligenceSourceId
  );
}
