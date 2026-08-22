import type {
  IntelligenceComputeSource,
  IntelligenceExecutionLocality,
  IntelligenceModelDescriptor,
  IntelligenceRequest
} from "./intelligence-contract";

export type EdgeRuntimeProfile = {
  availableMemoryBytes?: number | null;
  environment: "browser" | "server" | "unknown";
  hardwareConcurrency?: number | null;
  webGpuAvailable?: boolean | null;
};

export type IntelligenceRuntimeFit = {
  estimatedInputTokens: number;
  estimatedTotalTokens: number;
  reason: "context_limit" | "resource_limit" | null;
  status: "compatible" | "incompatible" | "unknown";
};

export function executionLocalityForComputeSource(
  computeSource: IntelligenceComputeSource
): IntelligenceExecutionLocality {
  if (computeSource === "local-endpoint") {
    return {
      environment: "server-local",
      network: "loopback",
      trust: "configured-loopback"
    };
  }
  if (computeSource === "hassali-local") {
    return {
      environment: "server-local",
      network: "loopback",
      trust: "configured-trusted"
    };
  }
  return {
    environment: "cloud",
    network: "internet",
    trust: "provider-managed"
  };
}

export function estimateIntelligenceRequestTokens(request: IntelligenceRequest) {
  const characters = request.messages.reduce((sum, message) => sum + message.parts.reduce((parts, part) => {
    if (part.type === "text") return parts + part.text.length;
    if (part.type === "file") return parts + (part.extractedText?.length ?? 0) + part.name.length;
    return parts + (part.source.kind === "base64" ? Math.ceil(part.source.data.length * 0.75) : part.source.url.length);
  }, 0), 0) + (request.instructions ?? []).join("\n").length + JSON.stringify(request.tools ?? []).length;
  return Math.max(1, Math.ceil(characters / 4));
}

function modelSizeBytes(model: IntelligenceModelDescriptor) {
  const size = model.rawProviderMetadata?.sizeBytes;
  return typeof size === "number" && Number.isFinite(size) && size > 0 ? size : null;
}

export function assessIntelligenceRuntimeFit(input: {
  model: IntelligenceModelDescriptor;
  request: IntelligenceRequest;
  runtimeProfile?: EdgeRuntimeProfile;
}): IntelligenceRuntimeFit {
  const estimatedInputTokens = estimateIntelligenceRequestTokens(input.request);
  const estimatedTotalTokens = estimatedInputTokens + Math.max(0, input.request.generation?.maxOutputTokens ?? 1_024);
  if (input.model.contextLimit !== null && estimatedTotalTokens > Math.floor(input.model.contextLimit * 0.9)) {
    return { estimatedInputTokens, estimatedTotalTokens, reason: "context_limit", status: "incompatible" };
  }
  const availableMemory = input.runtimeProfile?.availableMemoryBytes;
  const sizeBytes = modelSizeBytes(input.model);
  if (input.model.isLocal && typeof availableMemory === "number" && availableMemory > 0 && sizeBytes !== null && sizeBytes > availableMemory * 0.8) {
    return { estimatedInputTokens, estimatedTotalTokens, reason: "resource_limit", status: "incompatible" };
  }
  const known = input.model.contextLimit !== null || (typeof availableMemory === "number" && sizeBytes !== null);
  return { estimatedInputTokens, estimatedTotalTokens, reason: null, status: known ? "compatible" : "unknown" };
}

export function isFreshnessDependentRequest(request: IntelligenceRequest) {
  return request.requiredCapabilities.includes("webResearch") || Boolean(request.features?.webResearch);
}
