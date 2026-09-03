import { findHassaliModel } from "../../model-registry";
import type {
  IntelligenceFailure,
  IntelligenceRequest,
  IntelligenceResult
} from "./intelligence-contract";

export type IntelligenceResultQuality = {
  code: "EMPTY_RESPONSE" | "KNOWN_UNRELIABLE_SERVED_MODEL" | "MALFORMED_STRUCTURED_RESPONSE" | "MISSING_REQUIRED_RESEARCH_EVIDENCE" | "PROVIDER_SENTINEL" | "TRUNCATED_RESPONSE" | "USABLE";
  usable: boolean;
};

function responseText(result: Extract<IntelligenceResult, { ok: true }>) {
  return result.response.content.map((part) => part.text).join("").trim();
}

export function inspectIntelligenceResultQuality(
  request: IntelligenceRequest,
  result: IntelligenceResult
): IntelligenceResultQuality {
  if (!result.ok) return { code: "USABLE", usable: true };
  const servedModel = findHassaliModel(result.response.model);
  if (servedModel?.availability === "hidden_unstable" || servedModel?.availability === "unavailable") {
    return { code: "KNOWN_UNRELIABLE_SERVED_MODEL", usable: false };
  }
  const text = responseText(result);
  const toolOnlyAllowed = Boolean(request.tools?.length && result.response.toolCalls.length);
  if (!text && !toolOnlyAllowed) return { code: "EMPTY_RESPONSE", usable: false };
  if (/^(?:null|undefined|\[object Object\])$/i.test(text) ||
    /^(?:the selected model returned no usable answer|no compatible fallback completed|provider error|model unavailable)\b/i.test(text)) {
    return { code: "PROVIDER_SENTINEL", usable: false };
  }
  if (
    (request.requiredCapabilities.includes("webResearch") || Boolean(request.features?.webResearch)) &&
    result.response.citations.length === 0
  ) {
    return { code: "MISSING_REQUIRED_RESEARCH_EVIDENCE", usable: false };
  }
  if (request.responseFormat === "json_object") {
    try {
      const parsed = JSON.parse(text) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return { code: "MALFORMED_STRUCTURED_RESPONSE", usable: false };
      }
    } catch {
      return { code: "MALFORMED_STRUCTURED_RESPONSE", usable: false };
    }
  }
  if (result.response.finishReason === "length" && text.length < 40) {
    return { code: "TRUNCATED_RESPONSE", usable: false };
  }
  return { code: "USABLE", usable: true };
}

export function normalizeIntelligenceResultQuality(
  request: IntelligenceRequest,
  result: IntelligenceResult
): IntelligenceResult {
  const quality = inspectIntelligenceResultQuality(request, result);
  if (!result.ok || quality.usable) return result;
  const failure: IntelligenceFailure = {
    category: "malformed-provider-response",
    internal: { code: quality.code },
    model: result.response.model,
    providerId: result.response.providerId,
    retryable: true,
    safeUserMessage: "The intelligence source did not return a usable answer."
  };
  return { failure, ok: false };
}
