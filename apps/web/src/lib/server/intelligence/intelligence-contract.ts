export const intelligenceCapabilities = [
  "reasoning",
  "streaming",
  "structuredOutput",
  "text",
  "tools",
  "vision",
  "webResearch"
] as const;

export type IntelligenceCapability = (typeof intelligenceCapabilities)[number];
export type IntelligenceCapabilitySupport = "supported" | "unknown" | "unsupported";
export type IntelligenceCapabilityProfile = Record<IntelligenceCapability, IntelligenceCapabilitySupport>;
export type IntelligenceComputeSource =
  | "byok-cloud"
  | "free-cloud"
  | "hassali-local"
  | "local-endpoint"
  | "managed-cloud";
export type IntelligenceMode = "ASK" | "CODE" | "WEBSITE";

export type IntelligenceTextInputPart = {
  text: string;
  type: "text";
};

export type IntelligenceImageInputPart = {
  detail?: "auto" | "high" | "low";
  source:
    | { kind: "base64"; data: string; mediaType: string }
    | { kind: "url"; url: string };
  type: "image";
};

export type IntelligenceFileInputPart = {
  extractedText?: string;
  mediaType?: string;
  name: string;
  referenceId?: string;
  type: "file";
};

export type IntelligenceInputPart =
  | IntelligenceFileInputPart
  | IntelligenceImageInputPart
  | IntelligenceTextInputPart;

export type IntelligenceConversationMessage = {
  parts: IntelligenceInputPart[];
  role: "assistant" | "system" | "tool" | "user";
  toolCallId?: string;
};

export type IntelligenceToolDefinition = {
  description?: string;
  inputSchema: Record<string, unknown>;
  name: string;
};

export type IntelligencePrivacyConstraints = {
  allowProviderLogging?: boolean;
  containsSensitiveData?: boolean;
  dataLocality?: "cloud-allowed" | "local-only";
  retention?: "no-retention-requested" | "provider-default";
};

export type IntelligenceRequest = {
  abortSignal?: AbortSignal;
  features?: {
    webResearch?: {
      maxResults?: number;
    };
  };
  instructions?: string[];
  generation?: {
    maxOutputTokens?: number;
    temperature?: number;
  };
  messages: IntelligenceConversationMessage[];
  metadata?: {
    projectId?: string;
    requestId?: string;
    traceId?: string;
  };
  mode: IntelligenceMode;
  privacy?: IntelligencePrivacyConstraints;
  requestedModel?: string;
  requiredCapabilities: IntelligenceCapability[];
  responseFormat?: "json_object" | "text";
  stream?: boolean;
  timeoutMs?: number;
  tools?: IntelligenceToolDefinition[];
};

export type IntelligenceModelAvailability =
  | "available"
  | "requires-configuration"
  | "unavailable"
  | "unknown";

export type IntelligenceModelDescriptor = {
  availability: IntelligenceModelAvailability;
  capabilities: IntelligenceCapabilityProfile;
  computeSource: IntelligenceComputeSource;
  contextLimit: number | null;
  displayName: string;
  inputModalities: Array<"audio" | "file" | "image" | "text" | "video">;
  isLocal: boolean;
  modelId: string;
  outputModalities: Array<"audio" | "image" | "text" | "video">;
  pricing: {
    currency: string | null;
    inputPerMillion: number | null;
    outputPerMillion: number | null;
    source: "actual" | "estimated" | "unknown";
  };
  providerId: string;
  publisherId?: string;
  rawProviderMetadata?: Readonly<Record<string, unknown>>;
};

export type IntelligenceHealthStatus =
  | "authentication-failed"
  | "degraded"
  | "loading"
  | "rate-limited"
  | "ready"
  | "unavailable"
  | "unconfigured";

export type IntelligenceHealth = {
  checkedAt: string;
  latencyMs: number | null;
  providerId: string;
  reason: string | null;
  retryable: boolean;
  status: IntelligenceHealthStatus;
};

export type IntelligenceFailureCategory =
  | "authentication"
  | "authorization"
  | "cancelled"
  | "content-safety"
  | "internal"
  | "invalid-request"
  | "malformed-provider-response"
  | "model-unavailable"
  | "network"
  | "provider-unavailable"
  | "quota"
  | "rate-limit"
  | "timeout"
  | "unconfigured"
  | "unsupported-capability";

export type IntelligenceFailure = {
  category: IntelligenceFailureCategory;
  httpStatus?: number;
  internal: {
    causeName?: string;
    code: string;
    details?: string;
  } | null;
  model: string | null;
  providerId: string;
  retryAfterMs?: number | null;
  retryable: boolean;
  safeUserMessage: string;
};

export type IntelligenceUsage = {
  cost: {
    amount: number | null;
    currency: string | null;
    source: "actual" | "estimated" | "not-applicable" | "unknown";
  };
  inputTokens: number | null;
  latencyMs: number;
  model: string;
  outputTokens: number | null;
  providerId: string;
  totalTokens: number | null;
};

export type IntelligenceCitation = {
  content?: string;
  title?: string;
  url: string;
};

export type IntelligenceToolCall = {
  arguments: unknown;
  id: string;
  name: string;
  rawArguments: string;
};

export type IntelligenceResponse = {
  citations: IntelligenceCitation[];
  computeSource: IntelligenceComputeSource;
  content: Array<{ text: string; type: "text" }>;
  finishReason: string | null;
  model: string;
  providerId: string;
  rawProviderMetadata?: Readonly<Record<string, unknown>>;
  toolCalls: IntelligenceToolCall[];
  usage: IntelligenceUsage;
};

export type IntelligenceResult =
  | { ok: false; failure: IntelligenceFailure }
  | { ok: true; response: IntelligenceResponse };

export type IntelligenceStreamEvent =
  | { text: string; type: "text" }
  | { argumentsDelta: string; id: string; index: number; name?: string; type: "tool-call-delta" }
  | { finishReason: string | null; type: "done" }
  | { type: "usage"; usage: IntelligenceUsage };

export type IntelligenceStreamResponse = {
  computeSource: IntelligenceComputeSource;
  model: string;
  providerId: string;
  stream: ReadableStream<IntelligenceStreamEvent>;
};

export type IntelligenceStreamResult =
  | { ok: false; failure: IntelligenceFailure }
  | { ok: true; response: IntelligenceStreamResponse };

export class IntelligenceContractError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "IntelligenceContractError";
    this.code = code;
  }
}

export function unknownCapabilityProfile(): IntelligenceCapabilityProfile {
  return Object.fromEntries(
    intelligenceCapabilities.map((capability) => [capability, "unknown"])
  ) as IntelligenceCapabilityProfile;
}

export function createCapabilityProfile(
  input: Partial<IntelligenceCapabilityProfile>
): IntelligenceCapabilityProfile {
  return { ...unknownCapabilityProfile(), ...input };
}

function impliedCapabilities(request: IntelligenceRequest) {
  const implied: IntelligenceCapability[] = ["text"];
  if (request.stream) implied.push("streaming");
  if (request.responseFormat === "json_object") implied.push("structuredOutput");
  if (request.tools?.length) implied.push("tools");
  if (request.features?.webResearch) implied.push("webResearch");
  if (request.messages.some((message) => message.parts.some((part) => part.type === "image"))) {
    implied.push("vision");
  }
  return implied;
}

export function normalizeIntelligenceRequest(request: IntelligenceRequest): IntelligenceRequest {
  if (!request.messages.length) {
    throw new IntelligenceContractError("INTELLIGENCE_MESSAGES_REQUIRED", "At least one conversation message is required.");
  }
  if (request.messages.some((message) => !message.parts.length)) {
    throw new IntelligenceContractError("INTELLIGENCE_PARTS_REQUIRED", "Every conversation message needs at least one input part.");
  }

  const requiredCapabilities = Array.from(new Set([
    ...request.requiredCapabilities,
    ...impliedCapabilities(request)
  ]));

  return {
    ...request,
    generation: request.generation
      ? {
          maxOutputTokens: typeof request.generation.maxOutputTokens === "number"
            ? Math.min(Math.max(Math.floor(request.generation.maxOutputTokens), 1), 200_000)
            : undefined,
          temperature: typeof request.generation.temperature === "number"
            ? Math.min(Math.max(request.generation.temperature, 0), 2)
            : undefined
        }
      : undefined,
    instructions: request.instructions?.map((instruction) => instruction.trim()).filter(Boolean),
    requestedModel: request.requestedModel?.trim() || undefined,
    requiredCapabilities,
    responseFormat: request.responseFormat ?? "text",
    stream: Boolean(request.stream)
  };
}

export function unknownIntelligenceUsage(input: {
  latencyMs: number;
  model: string;
  providerId: string;
}): IntelligenceUsage {
  return {
    cost: { amount: null, currency: null, source: "unknown" },
    inputTokens: null,
    latencyMs: input.latencyMs,
    model: input.model,
    outputTokens: null,
    providerId: input.providerId,
    totalTokens: null
  };
}
