import type { TaskComplexityClass } from "./task-complexity";
import type { IntelligenceProductMode } from "./skill-kernel";
import type {
  BehavioralIntentClass,
  FinalActionDisposition
} from "@/lib/server/ai/behavioral-intelligence";

export type BetaTelemetryEventName =
  | "handoff_created"
  | "handoff_opened"
  | "provider_fallback"
  | "task_cancelled"
  | "task_completed"
  | "task_failed"
  | "task_started";

export type BetaTelemetryEvent = {
  answerOnly?: boolean;
  approvalRequired?: boolean;
  approvalSatisfied?: boolean;
  completionStatus?: "cancelled" | "completed" | "failed";
  complexityClass: TaskComplexityClass;
  contextItemsExcluded?: number;
  contextItemsIncluded?: number;
  contextScope?: string[];
  durationMs?: number;
  event: BetaTelemetryEventName;
  executionCompleted?: boolean;
  executionStarted?: boolean;
  failureCategory?: string | null;
  fallbackUsed?: boolean;
  finalDisposition?: FinalActionDisposition;
  intentClass?: BehavioralIntentClass;
  mode: IntelligenceProductMode;
  mutationRequested?: boolean;
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
  const answerOnly = Boolean(input.answerOnly);
  const mutationRequested = answerOnly ? false : Boolean(input.mutationRequested);
  const approvalRequired = mutationRequested && Boolean(input.approvalRequired);
  const approvalSatisfied = approvalRequired && Boolean(input.approvalSatisfied);
  const executionStarted = mutationRequested && approvalSatisfied && Boolean(input.executionStarted);
  const executionCompleted = executionStarted && Boolean(input.executionCompleted);
  const completionStatus = input.event === "task_cancelled"
    ? "cancelled"
    : input.event === "task_failed"
      ? "failed"
      : input.event === "task_completed"
        ? "completed"
        : input.completionStatus ?? "not_applicable";
  const failureCategory = completionStatus === "completed"
    ? "none"
    : safeFailureCategory(input.failureCategory);
  return {
    answerOnly,
    approvalRequired,
    approvalSatisfied,
    completionStatus,
    complexityClass: input.complexityClass,
    contextItemsExcluded: boundedInteger(input.contextItemsExcluded, 100),
    contextItemsIncluded: boundedInteger(input.contextItemsIncluded, 100),
    contextScope: Array.from(new Set((input.contextScope ?? []).map(safeCategory))).filter(Boolean).slice(0, 8),
    durationBucket: durationBucket(durationMs),
    durationMs,
    event: input.event,
    executionCompleted,
    executionStarted,
    failureCategory,
    fallbackUsed: Boolean(input.fallbackUsed),
    finalDisposition: safeCategory(input.finalDisposition),
    intentClass: safeCategory(input.intentClass),
    mode: input.mode,
    mutationRequested,
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
