import { randomUUID } from "node:crypto";

export type ProductionFailureCategory =
  | "authentication"
  | "internal"
  | "limit"
  | "ownership"
  | "persistence"
  | "policy"
  | "stale_state"
  | "timeout"
  | "validation";

function requestId(request?: Request) {
  const supplied = request?.headers.get("x-request-id")?.trim() ?? "";
  return /^[A-Za-z0-9._-]{8,80}$/.test(supplied) ? supplied : randomUUID();
}

function categoryOf(error: unknown): ProductionFailureCategory {
  const message = error instanceof Error ? error.message : "";
  if (/unauthorized|authentication/i.test(message)) return "authentication";
  if (/not.?owned|access denied|ownership/i.test(message)) return "ownership";
  if (/stale|revision|already applied|conflict/i.test(message)) return "stale_state";
  if (/too large|limit|quota|rate/i.test(message)) return "limit";
  if (/timeout|timed out|abort/i.test(message)) return "timeout";
  if (/database|failed query|connection|ECONN|relation .* does not exist/i.test(message)) return "persistence";
  if (/policy|approval|required authority|blocked/i.test(message)) return "policy";
  if (/invalid|required|malformed|unsafe path|traversal/i.test(message)) return "validation";
  return "internal";
}

export function normalizeProductionFailure(error: unknown, fallback: string, request?: Request) {
  const category = categoryOf(error);
  const status = category === "authentication" ? 401
    : category === "ownership" ? 404
      : category === "stale_state" ? 409
        : category === "limit" ? 413
          : category === "validation" || category === "policy" ? 400
            : category === "timeout" || category === "persistence" ? 503
              : 500;
  return {
    category,
    code: `HASSALI_${category.toUpperCase()}`,
    message: fallback,
    requestId: requestId(request),
    retryable: category === "internal" || category === "persistence" || category === "timeout",
    status
  };
}

export function safeApiErrorResponse(error: unknown, fallback: string, request?: Request) {
  const failure = normalizeProductionFailure(error, fallback, request);
  return Response.json(
    { code: failure.code, error: failure.message, requestId: failure.requestId, retryable: failure.retryable },
    { headers: { "Cache-Control": "no-store" }, status: failure.status }
  );
}
