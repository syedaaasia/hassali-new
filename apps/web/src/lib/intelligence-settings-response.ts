import type { IntelligenceSourcesResponse } from "@/lib/intelligence-sources";

export type IntelligenceSettingsErrorPayload = {
  error?: string | { code?: string; message?: string };
  ok?: false;
};

export class IntelligenceSettingsResponseError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "IntelligenceSettingsResponseError";
    this.code = code;
  }
}

function statusError(response: Pick<Response, "status">) {
  if (response.status === 401) return ["INTELLIGENCE_SETTINGS_UNAUTHORIZED", "Sign in again to load Intelligence settings."] as const;
  if (response.status === 403) return ["INTELLIGENCE_SETTINGS_FORBIDDEN", "This account cannot change Intelligence settings."] as const;
  if (response.status === 404) return ["INTELLIGENCE_SETTINGS_NOT_FOUND", "Intelligence settings are not available in this build."] as const;
  if (response.status >= 500) return ["INTELLIGENCE_SETTINGS_LOAD_FAILED", "Intelligence settings could not be loaded. Retry, then check the local database setup if the problem continues."] as const;
  return ["INTELLIGENCE_SETTINGS_REQUEST_FAILED", "The Intelligence settings request could not be completed."] as const;
}

function isSourcesResponse(value: unknown): value is IntelligenceSourcesResponse {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<IntelligenceSourcesResponse>;
  return Array.isArray(candidate.sources) &&
    Boolean(candidate.routing && typeof candidate.routing === "object") &&
    Boolean(candidate.budget && typeof candidate.budget === "object") &&
    Boolean(candidate.usage && typeof candidate.usage === "object") &&
    Boolean(candidate.local && typeof candidate.local === "object") &&
    Boolean(candidate.persistence && typeof candidate.persistence === "object") &&
    (candidate.persistence?.status === "ready" || candidate.persistence?.status === "degraded" || candidate.persistence?.status === "unavailable");
}

function errorFromPayload(payload: IntelligenceSettingsErrorPayload | null) {
  if (typeof payload?.error === "string" && payload.error.trim()) {
    return { code: "INTELLIGENCE_SETTINGS_REQUEST_FAILED", message: payload.error.trim() };
  }
  if (payload?.error && typeof payload.error === "object") {
    return {
      code: typeof payload.error.code === "string" ? payload.error.code : "INTELLIGENCE_SETTINGS_REQUEST_FAILED",
      message: typeof payload.error.message === "string" && payload.error.message.trim()
        ? payload.error.message.trim()
        : null
    };
  }
  return null;
}

export async function readIntelligenceSettingsResponse(
  response: Pick<Response, "ok" | "status" | "text">
): Promise<IntelligenceSourcesResponse> {
  let raw = "";
  try {
    raw = await response.text();
  } catch {
    const [code, message] = statusError(response);
    throw new IntelligenceSettingsResponseError(code, message);
  }

  let payload: unknown = null;
  if (raw.trim()) {
    try {
      payload = JSON.parse(raw);
    } catch {
      const [code, message] = statusError(response);
      throw new IntelligenceSettingsResponseError(code, message);
    }
  }

  if (!response.ok) {
    const safePayload = errorFromPayload(payload && typeof payload === "object" ? payload as IntelligenceSettingsErrorPayload : null);
    const [statusCode, statusMessage] = statusError(response);
    const trustedApplicationError = Boolean(
      safePayload?.code && /^(?:INTELLIGENCE_SETTINGS_|INVALID_|UNKNOWN_|UNAUTHORIZED)/.test(safePayload.code)
    );
    throw new IntelligenceSettingsResponseError(
      trustedApplicationError ? safePayload!.code : statusCode,
      trustedApplicationError ? safePayload?.message ?? statusMessage : statusMessage
    );
  }
  if (!isSourcesResponse(payload)) {
    throw new IntelligenceSettingsResponseError(
      "INTELLIGENCE_SETTINGS_INVALID_RESPONSE",
      "Intelligence settings returned an invalid response. Retry the request."
    );
  }
  return payload;
}

export async function requestIntelligenceSettings(
  url: string,
  init: RequestInit = {},
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 10_000
) {
  const controller = new AbortController();
  const onAbort = () => controller.abort(init.signal?.reason);
  init.signal?.addEventListener("abort", onAbort, { once: true });
  const timeout = setTimeout(() => controller.abort(new Error("INTELLIGENCE_SETTINGS_TIMEOUT")), timeoutMs);
  try {
    const response = await fetchImpl(url, { ...init, signal: controller.signal });
    return await readIntelligenceSettingsResponse(response);
  } catch (error) {
    if (error instanceof IntelligenceSettingsResponseError) throw error;
    if (controller.signal.aborted && !init.signal?.aborted) {
      throw new IntelligenceSettingsResponseError(
        "INTELLIGENCE_SETTINGS_TIMEOUT",
        "Intelligence settings took too long to respond. Retry the request."
      );
    }
    if (init.signal?.aborted) throw error;
    throw new IntelligenceSettingsResponseError(
      "INTELLIGENCE_SETTINGS_NETWORK_FAILED",
      "Intelligence settings could not reach the server. Check the connection and retry."
    );
  } finally {
    clearTimeout(timeout);
    init.signal?.removeEventListener("abort", onAbort);
  }
}
