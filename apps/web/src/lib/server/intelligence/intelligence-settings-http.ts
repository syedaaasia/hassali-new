import { IntelligenceContractError } from "./intelligence-contract";

type SettingsError = {
  code: string;
  message: string;
  status: number;
};

function databaseErrorCode(error: unknown) {
  if (!error || typeof error !== "object") return null;
  const value = error as { cause?: unknown; code?: unknown };
  if (typeof value.code === "string") return value.code;
  if (value.cause && typeof value.cause === "object" && typeof (value.cause as { code?: unknown }).code === "string") {
    return (value.cause as { code: string }).code;
  }
  return null;
}

export function normalizeIntelligenceSettingsError(error: unknown, action: "load" | "mutation"): SettingsError {
  const code = databaseErrorCode(error);
  const persistenceMessage = error instanceof Error &&
    /(?:DATABASE_URL|database (?:connection|is not configured)|failed query|relation .+ does not exist)/i.test(error.message);
  if (persistenceMessage || ["3D000", "42P01", "ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT"].includes(code ?? "")) {
    return {
      code: "INTELLIGENCE_SETTINGS_PERSISTENCE_UNAVAILABLE",
      message: "Intelligence settings could not be loaded. The local database may need to be started or updated.",
      status: 503
    };
  }
  if (error instanceof IntelligenceContractError) {
    return { code: "INTELLIGENCE_SETTINGS_INVALID_REQUEST", message: error.message, status: 400 };
  }
  if (error instanceof Error) {
    const messages: Record<string, string> = {
      API_KEY_REQUIRED: "Enter an OpenRouter API key before saving this connection.",
      API_KEY_TOO_LONG: "The API key is longer than Hassali accepts.",
      BUDGET_LIMIT_INVALID: "Budget limits must be valid non-negative USD amounts.",
      MODEL_ID_TOO_LONG: "The selected model ID is too long.",
      SOURCE_NOT_CONFIGURED: "Configure this provider before testing it."
    };
    if (messages[error.message]) {
      return { code: "INTELLIGENCE_SETTINGS_INVALID_REQUEST", message: messages[error.message]!, status: 400 };
    }
  }
  return {
    code: action === "load" ? "INTELLIGENCE_SETTINGS_LOAD_FAILED" : "INTELLIGENCE_SETTINGS_MUTATION_FAILED",
    message: action === "load"
      ? "Unable to load Intelligence settings."
      : "The Intelligence settings action could not be completed.",
    status: 500
  };
}

export function intelligenceSettingsErrorResponse(error: unknown, action: "load" | "mutation") {
  const normalized = normalizeIntelligenceSettingsError(error, action);
  return Response.json({
    error: { code: normalized.code, message: normalized.message },
    ok: false
  }, {
    headers: { "Cache-Control": "no-store" },
    status: normalized.status
  });
}
