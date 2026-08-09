import type {
  IntelligenceComputeSource,
  IntelligenceHealthStatus
} from "@/lib/server/intelligence/intelligence-contract";
import type { IntelligenceRoutingPrivacy } from "@/lib/server/intelligence/auto-intelligence-router";

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
  persistence: "environment" | "server-session";
};

export type IntelligenceSourcesResponse = {
  disclosure: string;
  routing: {
    mode: "auto";
    privacy: IntelligenceRoutingPrivacy;
  };
  sources: IntelligenceSourceSummary[];
};

export function isConfigurableIntelligenceSourceId(
  value: unknown
): value is ConfigurableIntelligenceSourceId {
  return typeof value === "string" && configurableIntelligenceSourceIds.includes(
    value as ConfigurableIntelligenceSourceId
  );
}
