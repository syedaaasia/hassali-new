import {
  IntelligenceContractError,
  createCapabilityProfile,
  unknownCapabilityProfile,
  unknownIntelligenceUsage,
  type IntelligenceCapabilityProfile,
  type IntelligenceCitation,
  type IntelligenceExecutionLocality,
  type IntelligenceComputeSource,
  type IntelligenceFailure,
  type IntelligenceFailureCategory,
  type IntelligenceHealth,
  type IntelligenceInputPart,
  type IntelligenceModelDescriptor,
  type IntelligenceRequest,
  type IntelligenceResult,
  type IntelligenceStreamEvent,
  type IntelligenceStreamResult,
  type IntelligenceUsage
} from "./intelligence-contract";
import type { IntelligenceAdapter } from "./intelligence-adapter-registry";

export type IntelligenceFetch = (
  input: string | URL,
  init?: RequestInit
) => Promise<Response>;

type OpenAICompatiblePayload = {
  choices?: Array<{
    finish_reason?: string | null;
    message?: {
      content?: string | Array<{ text?: string; type?: string }>;
      tool_calls?: Array<{
        function?: { arguments?: string; name?: string };
        id?: string;
      }>;
    };
  }>;
  created?: number;
  id?: string;
  model?: string;
  usage?: {
    completion_tokens?: number;
    prompt_tokens?: number;
    total_tokens?: number;
  };
};

export type OpenAICompatibleAdapterConfig = {
  allowInsecureLoopback?: boolean;
  baseUrl: string;
  capabilities?: Partial<IntelligenceCapabilityProfile>;
  chatCompletionsPath?: string;
  computeSource: IntelligenceComputeSource;
  defaultModelId?: string | null;
  configuredModels?: () => Promise<IntelligenceModelDescriptor[]>;
  extraRequestBody?: (request: IntelligenceRequest) => Record<string, unknown>;
  fetchImpl?: IntelligenceFetch;
  getApiKey?: () => string | null;
  getHeaders?: () => Readonly<Record<string, string>>;
  executionLocality?: IntelligenceExecutionLocality;
  healthProbe?: { method?: "GET" | "HEAD"; path: string; timeoutMs?: number };
  id: string;
  modelDiscoveryPath?: string;
  maxResponseBytes?: number;
  normalizeCitations?: (payload: unknown) => IntelligenceCitation[];
  normalizeCost?: (payload: unknown) => IntelligenceUsage["cost"];
  providerId: string;
  requiresApiKey?: boolean;
  timeoutMs?: number;
};

function isLoopbackHost(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

export function normalizeOpenAICompatibleBaseUrl(value: string, allowInsecureLoopback = false) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new IntelligenceContractError("ENDPOINT_URL_INVALID", "The provider endpoint is not a valid URL.");
  }
  if (url.username || url.password) {
    throw new IntelligenceContractError("ENDPOINT_CREDENTIALS_FORBIDDEN", "Credentials must not be embedded in an endpoint URL.");
  }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && allowInsecureLoopback && isLoopbackHost(url.hostname))) {
    throw new IntelligenceContractError("ENDPOINT_PROTOCOL_FORBIDDEN", "Provider endpoints require HTTPS unless an internal loopback policy is enabled.");
  }
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/+$/, "") + "/";
}

export function normalizeLocalIntelligenceEndpoint(value: string) {
  if (/(?:^|\/)(?:\.{1,2}|%2e(?:%2e)?)(?:\/|$)/i.test(value)) {
    throw new IntelligenceContractError("LOCAL_ENDPOINT_PATH_INVALID", "Local provider endpoints cannot contain traversal segments.");
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new IntelligenceContractError("ENDPOINT_URL_INVALID", "The provider endpoint is not a valid URL.");
  }
  if (!isLoopbackHost(url.hostname)) {
    throw new IntelligenceContractError(
      "LOCAL_ENDPOINT_LOOPBACK_REQUIRED",
      "Local provider endpoints must use localhost, 127.0.0.1, or ::1."
    );
  }
  return normalizeOpenAICompatibleBaseUrl(value, true);
}

function endpoint(baseUrl: string, path: string) {
  return new URL(path.replace(/^\/+/, ""), baseUrl).toString();
}

function boundedTimeout(value: number) {
  return Math.max(1_000, Math.min(value, 120_000));
}

function boundedResponseBytes(value = 2 * 1024 * 1024) {
  return Math.max(64 * 1024, Math.min(value, 4 * 1024 * 1024));
}

async function readBoundedJsonResponse(response: Response, maximumBytes: number) {
  const declared = Number.parseInt(response.headers.get("content-length") ?? "", 10);
  if (Number.isFinite(declared) && declared > maximumBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw new IntelligenceContractError("PROVIDER_RESPONSE_TOO_LARGE", "The provider response exceeded Hassali's safe response limit.");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new IntelligenceContractError("PROVIDER_RESPONSE_MISSING", "The provider returned no readable response body.");
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximumBytes) {
      await reader.cancel().catch(() => undefined);
      throw new IntelligenceContractError("PROVIDER_RESPONSE_TOO_LARGE", "The provider response exceeded Hassali's safe response limit.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes)) as OpenAICompatiblePayload;
}

function retryAfterMs(response: Response) {
  const value = response.headers.get("retry-after")?.trim() ?? "";
  const seconds = Number.parseFloat(value.replace(/[^\d.]/g, "").slice(0, 16));
  return Number.isFinite(seconds) ? Math.min(Math.max(seconds * 1_000, 0), 120_000) : null;
}

function failureCategory(status: number): IntelligenceFailureCategory {
  if (status === 401) return "authentication";
  if (status === 403) return "authorization";
  if (status === 402) return "quota";
  if (status === 404) return "model-unavailable";
  if (status === 408 || status === 504) return "timeout";
  if (status === 429) return "rate-limit";
  if (status >= 500) return "provider-unavailable";
  return "invalid-request";
}

function safeFailureMessage(category: IntelligenceFailureCategory) {
  const messages: Record<IntelligenceFailureCategory, string> = {
    authentication: "The selected provider rejected its credentials.",
    authorization: "The selected provider did not authorize this request.",
    cancelled: "The intelligence request was cancelled.",
    "content-safety": "The selected provider declined this content.",
    internal: "Hassali could not complete the intelligence request.",
    "invalid-request": "The selected provider rejected the request.",
    "malformed-provider-response": "The selected provider returned an invalid response.",
    "model-unavailable": "The selected model is not available from this provider.",
    network: "Hassali could not reach the selected provider.",
    "provider-unavailable": "The selected provider is currently unavailable.",
    quota: "The selected provider account has insufficient quota or credits.",
    "rate-limit": "The selected provider is rate-limited. Try again later.",
    timeout: "The selected provider did not respond before the timeout.",
    unconfigured: "The selected provider is not configured.",
    "unsupported-capability": "The selected provider does not support a required capability."
  };
  return messages[category];
}

function providerFailure(input: {
  category: IntelligenceFailureCategory;
  code: string;
  details?: string;
  httpStatus?: number;
  model?: string | null;
  providerId: string;
  retryAfterMs?: number | null;
}): IntelligenceFailure {
  return {
    category: input.category,
    httpStatus: input.httpStatus,
    internal: { code: input.code, details: input.details },
    model: input.model ?? null,
    providerId: input.providerId,
    retryAfterMs: input.retryAfterMs,
    retryable: ["network", "provider-unavailable", "rate-limit", "timeout"].includes(input.category),
    safeUserMessage: safeFailureMessage(input.category)
  };
}

function requestHeaders(config: OpenAICompatibleAdapterConfig) {
  const apiKey = config.getApiKey?.()?.trim() || null;
  if (config.requiresApiKey && !apiKey) return null;
  return {
    "Content-Type": "application/json",
    ...(config.getHeaders?.() ?? {}),
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
  };
}

function openAIContentPart(part: IntelligenceInputPart) {
  if (part.type === "text") return { type: "text", text: part.text };
  if (part.type === "image") {
    const url = part.source.kind === "url"
      ? part.source.url
      : `data:${part.source.mediaType};base64,${part.source.data}`;
    return { type: "image_url", image_url: { detail: part.detail ?? "auto", url } };
  }
  if (!part.extractedText?.trim()) {
    throw new IntelligenceContractError(
      "FILE_CONTENT_UNAVAILABLE",
      `File ${part.name} has no extracted text for this OpenAI-compatible request.`
    );
  }
  return { type: "text", text: `[File: ${part.name}]\n${part.extractedText}` };
}

function openAIMessages(request: IntelligenceRequest) {
  const instructions = (request.instructions ?? []).map((content) => ({ role: "system", content }));
  const messages = request.messages.map((message) => {
    const content = message.parts.length === 1 && message.parts[0]?.type === "text"
      ? message.parts[0].text
      : message.parts.map(openAIContentPart);
    return {
      role: message.role,
      content,
      ...(message.toolCallId ? { tool_call_id: message.toolCallId } : {})
    };
  });
  return [...instructions, ...messages];
}

function openAITools(request: IntelligenceRequest) {
  return request.tools?.map((tool) => ({
    type: "function",
    function: {
      description: tool.description,
      name: tool.name,
      parameters: tool.inputSchema
    }
  }));
}

function responseText(payload: OpenAICompatiblePayload) {
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  return content
    .filter((part) => part.type === "text" || part.type === "output_text" || !part.type)
    .map((part) => part.text ?? "")
    .join("")
    .trim();
}

function responseToolCalls(payload: OpenAICompatiblePayload) {
  return (payload.choices?.[0]?.message?.tool_calls ?? []).flatMap((toolCall, index) => {
    const name = toolCall.function?.name?.trim();
    if (!name) return [];
    const rawArguments = toolCall.function?.arguments ?? "";
    let parsedArguments: unknown = rawArguments;
    try {
      parsedArguments = rawArguments ? JSON.parse(rawArguments) : {};
    } catch {
      // Keep malformed provider arguments inspectable without treating them as trusted JSON.
    }
    return [{
      arguments: parsedArguments,
      id: toolCall.id?.trim() || `tool-call-${index + 1}`,
      name,
      rawArguments
    }];
  });
}

function numberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function normalizedUsage(input: {
  config: OpenAICompatibleAdapterConfig;
  latencyMs: number;
  model: string;
  payload: OpenAICompatiblePayload;
}): IntelligenceUsage {
  const unknown = unknownIntelligenceUsage({
    latencyMs: input.latencyMs,
    model: input.model,
    providerId: input.config.providerId
  });
  return {
    ...unknown,
    cost: input.config.normalizeCost?.(input.payload) ?? unknown.cost,
    inputTokens: numberOrNull(input.payload.usage?.prompt_tokens),
    outputTokens: numberOrNull(input.payload.usage?.completion_tokens),
    totalTokens: numberOrNull(input.payload.usage?.total_tokens)
  };
}

function requestBody(config: OpenAICompatibleAdapterConfig, request: IntelligenceRequest, stream: boolean) {
  return {
    messages: openAIMessages(request),
    model: request.requestedModel,
    ...(request.generation?.maxOutputTokens ? { max_tokens: request.generation.maxOutputTokens } : {}),
    ...(typeof request.generation?.temperature === "number" ? { temperature: request.generation.temperature } : {}),
    ...(request.responseFormat === "json_object" ? { response_format: { type: "json_object" } } : {}),
    ...(request.tools?.length ? { tools: openAITools(request) } : {}),
    ...(config.extraRequestBody?.(request) ?? {}),
    stream
  };
}

async function fetchWithTimeout(input: {
  config: OpenAICompatibleAdapterConfig;
  init: RequestInit;
  path: string;
  requestSignal?: AbortSignal;
  timeoutMs: number;
}) {
  const startedAt = Date.now();
  const controller = new AbortController();
  let timedOut = false;
  const abortFromRequest = () => controller.abort(input.requestSignal?.reason);
  input.requestSignal?.addEventListener("abort", abortFromRequest, { once: true });
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, input.timeoutMs);
  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    clearTimeout(timeout);
    input.requestSignal?.removeEventListener("abort", abortFromRequest);
  };
  try {
    const response = await (input.config.fetchImpl ?? fetch)(endpoint(
      normalizeOpenAICompatibleBaseUrl(input.config.baseUrl, Boolean(input.config.allowInsecureLoopback)),
      input.path
    ), { ...input.init, redirect: "error", signal: controller.signal });
    return { cleanup, ok: true as const, latencyMs: Date.now() - startedAt, response };
  } catch (error) {
    const cancelled = Boolean(input.requestSignal?.aborted) && !timedOut;
    const category: IntelligenceFailureCategory = cancelled
      ? "cancelled"
      : error instanceof Error && error.name === "AbortError"
        ? "timeout"
        : "network";
    cleanup();
    return {
      ok: false as const,
      failure: providerFailure({
        category,
        code: cancelled ? "REQUEST_CANCELLED" : category === "timeout" ? "PROVIDER_TIMEOUT" : "PROVIDER_NETWORK_ERROR",
        details: error instanceof Error ? error.name : undefined,
        model: null,
        providerId: input.config.providerId
      }),
      latencyMs: Date.now() - startedAt
    };
  }
}

function responseFailure(config: OpenAICompatibleAdapterConfig, response: Response, model: string | null) {
  const category = failureCategory(response.status);
  return providerFailure({
    category,
    code: `PROVIDER_HTTP_${response.status}`,
    httpStatus: response.status,
    model,
    providerId: config.providerId,
    retryAfterMs: category === "rate-limit" ? retryAfterMs(response) : null
  });
}

async function releaseFailedResponse(
  config: OpenAICompatibleAdapterConfig,
  response: Response,
  model: string | null
) {
  const failure = responseFailure(config, response, model);
  await response.body?.cancel().catch(() => undefined);
  return failure;
}

function textStream(input: {
  cleanup: () => void;
  config: OpenAICompatibleAdapterConfig;
  latencyMs: number;
  model: string;
  response: Response;
}) {
  const reader = input.response.body?.getReader();
  if (!reader) return null;
  const decoder = new TextDecoder();
  let buffer = "";
  let finishReason: string | null = null;
  return new ReadableStream<IntelligenceStreamEvent>({
    async start(controller) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const data = trimmed.slice(5).trim();
            if (!data || data === "[DONE]") continue;
            try {
              const payload = JSON.parse(data) as {
                choices?: Array<{
                  delta?: {
                    content?: string;
                    tool_calls?: Array<{
                      function?: { arguments?: string; name?: string };
                      id?: string;
                      index?: number;
                    }>;
                  };
                  finish_reason?: string | null;
                }>;
                model?: string;
                usage?: OpenAICompatiblePayload["usage"];
              };
              const choice = payload.choices?.[0];
              if (choice?.delta?.content) controller.enqueue({ text: choice.delta.content, type: "text" });
              for (const toolCall of choice?.delta?.tool_calls ?? []) {
                controller.enqueue({
                  argumentsDelta: toolCall.function?.arguments ?? "",
                  id: toolCall.id ?? `tool-call-${toolCall.index ?? 0}`,
                  index: toolCall.index ?? 0,
                  name: toolCall.function?.name,
                  type: "tool-call-delta"
                });
              }
              if (choice?.finish_reason) finishReason = choice.finish_reason;
              if (payload.usage) {
                controller.enqueue({
                  type: "usage",
                  usage: normalizedUsage({
                    config: input.config,
                    latencyMs: input.latencyMs,
                    model: payload.model ?? input.model,
                    payload: { model: payload.model, usage: payload.usage }
                  })
                });
              }
            } catch {
              // Ignore malformed individual SSE events; the stream remains bounded by the provider response.
            }
          }
        }
        controller.enqueue({ finishReason, type: "done" });
        controller.close();
      } catch {
        controller.error(new Error("Provider stream was interrupted."));
      } finally {
        input.cleanup();
        reader.releaseLock();
      }
    },
    async cancel() {
      await reader.cancel().catch(() => undefined);
      input.cleanup();
    }
  });
}

function healthStatus(category: IntelligenceFailureCategory): IntelligenceHealth["status"] {
  if (category === "authentication" || category === "authorization") return "authentication-failed";
  if (category === "rate-limit") return "rate-limited";
  if (category === "invalid-request" || category === "model-unavailable") return "degraded";
  return "unavailable";
}

export function createOpenAICompatibleAdapter(config: OpenAICompatibleAdapterConfig): IntelligenceAdapter {
  const baseUrl = normalizeOpenAICompatibleBaseUrl(config.baseUrl, Boolean(config.allowInsecureLoopback));
  const capabilities = createCapabilityProfile(config.capabilities ?? {});
  const timeoutMs = boundedTimeout(config.timeoutMs ?? 30_000);
  const chatPath = config.chatCompletionsPath ?? "chat/completions";
  const maxResponseBytes = boundedResponseBytes(config.maxResponseBytes);

  const adapter: IntelligenceAdapter = {
    capabilities,
    computeSource: config.computeSource,
    executionLocality: config.executionLocality,
    defaultModelId: config.defaultModelId ?? null,
    id: config.id,
    providerId: config.providerId,
    async health(signal) {
      const headers = requestHeaders(config);
      if (!headers) {
        return {
          checkedAt: new Date().toISOString(),
          latencyMs: null,
          providerId: config.providerId,
          reason: "Required provider credentials are not configured.",
          retryable: false,
          status: "unconfigured"
        };
      }
      if (!config.healthProbe) {
        return {
          checkedAt: new Date().toISOString(),
          latencyMs: null,
          providerId: config.providerId,
          reason: "Configuration is present; no live health probe is configured.",
          retryable: false,
          status: "ready"
        };
      }
      const result = await fetchWithTimeout({
        config: { ...config, baseUrl },
        init: { headers, method: config.healthProbe.method ?? "GET" },
        path: config.healthProbe.path,
        requestSignal: signal,
        timeoutMs: config.healthProbe.timeoutMs ?? Math.min(timeoutMs, 10_000)
      });
      if (!result.ok) {
        return {
          checkedAt: new Date().toISOString(),
          latencyMs: result.latencyMs,
          providerId: config.providerId,
          reason: result.failure.safeUserMessage,
          retryable: result.failure.retryable,
          status: healthStatus(result.failure.category)
        };
      }
      if (!result.response.ok) {
        const failure = await releaseFailedResponse(config, result.response, null);
        result.cleanup();
        return {
          checkedAt: new Date().toISOString(),
          latencyMs: result.latencyMs,
          providerId: config.providerId,
          reason: failure.safeUserMessage,
          retryable: failure.retryable,
          status: healthStatus(failure.category)
        };
      }
      await result.response.body?.cancel().catch(() => undefined);
      result.cleanup();
      return {
        checkedAt: new Date().toISOString(),
        latencyMs: result.latencyMs,
        providerId: config.providerId,
        reason: null,
        retryable: false,
        status: "ready"
      };
    },
    async invoke(request): Promise<IntelligenceResult> {
      const headers = requestHeaders(config);
      if (!headers) {
        return { ok: false, failure: providerFailure({ category: "unconfigured", code: "PROVIDER_NOT_CONFIGURED", model: request.requestedModel, providerId: config.providerId }) };
      }
      let body: Record<string, unknown>;
      try {
        body = requestBody(config, request, false);
      } catch (error) {
        return {
          ok: false,
          failure: providerFailure({
            category: "invalid-request",
            code: error instanceof IntelligenceContractError ? error.code : "REQUEST_SERIALIZATION_FAILED",
            details: error instanceof Error ? error.message : undefined,
            model: request.requestedModel,
            providerId: config.providerId
          })
        };
      }
      const result = await fetchWithTimeout({
        config: { ...config, baseUrl },
        init: { body: JSON.stringify(body), headers, method: "POST" },
        path: chatPath,
        requestSignal: request.abortSignal,
        timeoutMs: boundedTimeout(request.timeoutMs ?? timeoutMs)
      });
      if (!result.ok) return { ok: false, failure: { ...result.failure, model: request.requestedModel ?? null } };
      if (!result.response.ok) {
        const failure = await releaseFailedResponse(config, result.response, request.requestedModel ?? null);
        result.cleanup();
        return { ok: false, failure };
      }
      let payload: OpenAICompatiblePayload;
      try {
        payload = await readBoundedJsonResponse(result.response, maxResponseBytes);
      } catch (error) {
        result.cleanup();
        return { ok: false, failure: providerFailure({
          category: "malformed-provider-response",
          code: error instanceof IntelligenceContractError ? error.code : "PROVIDER_JSON_INVALID",
          model: request.requestedModel,
          providerId: config.providerId
        }) };
      }
      result.cleanup();
      const content = responseText(payload);
      const toolCalls = responseToolCalls(payload);
      if (!content && !toolCalls.length) {
        return { ok: false, failure: providerFailure({ category: "malformed-provider-response", code: "PROVIDER_TEXT_EMPTY", model: request.requestedModel, providerId: config.providerId }) };
      }
      const model = payload.model?.trim() || request.requestedModel || "unknown";
      return {
        ok: true,
        response: {
          citations: config.normalizeCitations?.(payload) ?? [],
          computeSource: config.computeSource,
          executionLocality: config.executionLocality,
          content: content ? [{ text: content, type: "text" }] : [],
          finishReason: payload.choices?.[0]?.finish_reason ?? null,
          model,
          providerId: config.providerId,
          rawProviderMetadata: {
            ...(payload.id ? { responseId: payload.id } : {}),
            ...(typeof payload.created === "number" ? { created: payload.created } : {})
          },
          toolCalls,
          usage: normalizedUsage({ config, latencyMs: result.latencyMs, model, payload })
        }
      };
    },
    ...(config.configuredModels ? { models: config.configuredModels } : {}),
    async stream(request): Promise<IntelligenceStreamResult> {
      const headers = requestHeaders(config);
      if (!headers) {
        return { ok: false, failure: providerFailure({ category: "unconfigured", code: "PROVIDER_NOT_CONFIGURED", model: request.requestedModel, providerId: config.providerId }) };
      }
      let body: Record<string, unknown>;
      try {
        body = requestBody(config, request, true);
      } catch (error) {
        return { ok: false, failure: providerFailure({ category: "invalid-request", code: error instanceof IntelligenceContractError ? error.code : "REQUEST_SERIALIZATION_FAILED", details: error instanceof Error ? error.message : undefined, model: request.requestedModel, providerId: config.providerId }) };
      }
      const result = await fetchWithTimeout({
        config: { ...config, baseUrl },
        init: { body: JSON.stringify(body), headers, method: "POST" },
        path: chatPath,
        requestSignal: request.abortSignal,
        timeoutMs: boundedTimeout(request.timeoutMs ?? timeoutMs)
      });
      if (!result.ok) return { ok: false, failure: { ...result.failure, model: request.requestedModel ?? null } };
      if (!result.response.ok) {
        const failure = await releaseFailedResponse(config, result.response, request.requestedModel ?? null);
        result.cleanup();
        return { ok: false, failure };
      }
      const stream = textStream({
        cleanup: result.cleanup,
        config,
        latencyMs: result.latencyMs,
        model: request.requestedModel ?? "unknown",
        response: result.response
      });
      if (!stream) {
        result.cleanup();
        return { ok: false, failure: providerFailure({ category: "malformed-provider-response", code: "PROVIDER_STREAM_MISSING", model: request.requestedModel, providerId: config.providerId }) };
      }
      return {
        ok: true,
        response: {
          computeSource: config.computeSource,
          executionLocality: config.executionLocality,
          model: request.requestedModel ?? "unknown",
          providerId: config.providerId,
          stream
        }
      };
    }
  };

  if (config.modelDiscoveryPath) {
    adapter.discoverModels = async (signal) => {
      const headers = requestHeaders(config);
      if (!headers) return [];
      const result = await fetchWithTimeout({
        config: { ...config, baseUrl },
        init: { headers, method: "GET" },
        path: config.modelDiscoveryPath ?? "models",
        requestSignal: signal,
        timeoutMs: Math.min(timeoutMs, 15_000)
      });
      if (!result.ok) return [];
      if (!result.response.ok) {
        await result.response.body?.cancel().catch(() => undefined);
        result.cleanup();
        return [];
      }
      const payload = await result.response.json().catch(() => null) as { data?: Array<{ id?: string; name?: string }> } | null;
      result.cleanup();
      return (payload?.data ?? []).flatMap((model): IntelligenceModelDescriptor[] => {
        const modelId = model.id?.trim();
        if (!modelId) return [];
        return [{
          availability: "available",
          capabilities: unknownCapabilityProfile(),
          computeSource: config.computeSource,
          contextLimit: null,
          displayName: model.name?.trim() || modelId,
          inputModalities: [],
          isLocal: config.computeSource === "local-endpoint" || config.computeSource === "hassali-local",
          modelId,
          outputModalities: [],
          pricing: { currency: null, inputPerMillion: null, outputPerMillion: null, source: "unknown" },
          providerId: config.providerId
        }];
      });
    };
  }

  return adapter;
}
