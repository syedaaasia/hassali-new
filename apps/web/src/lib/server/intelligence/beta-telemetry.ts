import type { TaskComplexityClass } from "./task-complexity";
import type { IntelligenceProductMode } from "./skill-kernel";

export type BetaTelemetryEventName =
  | "handoff_created"
  | "handoff_opened"
  | "provider_fallback"
  | "task_cancelled"
  | "task_completed"
  | "task_failed"
  | "task_started";

export type BetaTelemetryEvent = {
  completionStatus?: "cancelled" | "completed" | "failed";
  complexityClass: TaskComplexityClass;
  durationMs?: number;
  event: BetaTelemetryEventName;
  failureCategory?: string | null;
  fallbackUsed?: boolean;
  mode: IntelligenceProductMode;
  providerId?: string | null;
  repairAttemptCount?: number;
  toolCount?: number;
};

export type BetaTelemetrySink = (event: Readonly<Record<string, unknown>>) => void;

function boundedInteger(value: number | undefined, maximum: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(Math.round(value ?? 0), maximum));
}

function safeCategory(value: string | null | undefined) {
  return (value ?? "none")
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "_")
    .slice(0, 80);
}

const allowedFailureCategories = new Set([
  "model_unknown",
  "none",
  "provider_auth_failed",
  "provider_insufficient_credits",
  "provider_model_unavailable",
  "provider_network_error",
  "provider_not_configured",
  "provider_rate_limited",
  "provider_request_rejected",
  "provider_response_invalid",
  "provider_timeout",
  "provider_unavailable",
  "provider_unsupported",
  "request_cancelled",
  "route_error",
  "test_model_blocked"
]);

function safeFailureCategory(value: string | null | undefined) {
  const normalized = safeCategory(value);
  if (normalized.startsWith("provider_cooldown_")) return "provider_cooldown";
  return allowedFailureCategories.has(normalized) ? normalized : "other";
}

function durationBucket(durationMs: number) {
  if (durationMs < 250) return "under_250ms";
  if (durationMs < 1_000) return "250ms_1s";
  if (durationMs < 5_000) return "1s_5s";
  if (durationMs < 20_000) return "5s_20s";
  return "over_20s";
}

export function sanitizeBetaTelemetryEvent(input: BetaTelemetryEvent) {
  const durationMs = boundedInteger(input.durationMs, 300_000);
  return {
    completionStatus: input.completionStatus ?? "not_applicable",
    complexityClass: input.complexityClass,
    durationBucket: durationBucket(durationMs),
    durationMs,
    event: input.event,
    failureCategory: safeFailureCategory(input.failureCategory),
    fallbackUsed: Boolean(input.fallbackUsed),
    mode: input.mode,
    providerId: safeCategory(input.providerId),
    repairAttemptCount: boundedInteger(input.repairAttemptCount, 3),
    toolCount: boundedInteger(input.toolCount, 20)
  };
}

const defaultSink: BetaTelemetrySink = (event) => {
  console.info("hassali_beta_event", JSON.stringify(event));
};

export function recordBetaTelemetry(
  input: BetaTelemetryEvent,
  sink: BetaTelemetrySink = defaultSink
) {
  try {
    sink(sanitizeBetaTelemetryEvent(input));
    return true;
  } catch {
    return false;
  }
}
