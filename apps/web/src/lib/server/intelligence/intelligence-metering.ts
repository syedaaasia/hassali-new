import { randomUUID } from "node:crypto";
import {
  persistIntelligenceUsageRecord,
  summarizeIntelligenceUsage,
  type PersistIntelligenceUsageInput
} from "@hassali/database";
import type { AutoInvocationResult, IntelligenceRouteCandidate } from "./auto-intelligence-router";
import { intelligenceCostScope } from "./intelligence-budget";
import type {
  IntelligenceRequest,
  IntelligenceResult,
  IntelligenceStreamEvent,
  IntelligenceStreamResult,
  IntelligenceUsage
} from "./intelligence-contract";

export type IntelligenceUsageSummary = Awaited<ReturnType<typeof summarizeIntelligenceUsage>> & {
  periodStart: string;
};

type UsageRecord = Omit<PersistIntelligenceUsageInput, "externalUserId">;
type PersistUsage = (input: PersistIntelligenceUsageInput) => Promise<void>;

function boundedInteger(value: number | null) {
  return value === null || !Number.isFinite(value) ? null : Math.max(0, Math.min(Math.round(value), 2_147_483_647));
}

function normalizedCost(usage: IntelligenceUsage | null, candidate: IntelligenceRouteCandidate | null) {
  const scope = candidate?.costScope ?? intelligenceCostScope(candidate?.computeSource ?? "managed-cloud");
  if (scope === "local" && (!usage || usage.cost.source === "unknown")) {
    return { amountMicros: null, currency: null, scope, source: "not-applicable" as const };
  }
  const amount = usage?.cost.amount ?? null;
  return {
    amountMicros: amount === null ? null : Math.max(0, Math.round(amount * 1_000_000)),
    currency: usage?.cost.currency ?? null,
    scope,
    source: usage?.cost.source ?? "unknown" as const
  };
}

function attempt(candidate: IntelligenceRouteCandidate, status: "failed" | "succeeded", failureCategory: string | null) {
  return {
    computeSource: candidate.computeSource,
    failureCategory,
    model: candidate.modelId,
    provider: candidate.providerId,
    sourceId: candidate.adapterId,
    status
  };
}

export function buildIntelligenceUsageRecord(input: {
  completedAt: Date;
  outcome: AutoInvocationResult<IntelligenceResult | IntelligenceStreamResult>;
  request: IntelligenceRequest;
  startedAt: Date;
  streamUsage?: IntelligenceUsage | null;
  streamStatus?: "failed" | "succeeded";
}): UsageRecord {
  const decision = input.outcome.decision;
  const finalCandidate = input.outcome.fallbackUsed ? decision?.fallback ?? null : decision?.primary ?? null;
  const finalResult = input.outcome.result;
  const usage = input.streamUsage ?? (finalResult.ok && "usage" in finalResult.response ? finalResult.response.usage : null);
  const succeeded = input.streamStatus
    ? input.streamStatus === "succeeded"
    : finalResult.ok;
  const finalFailureCategory = finalResult.ok ? null : finalResult.failure.category;
  const attempts = decision ? [
    attempt(
      decision.primary,
      input.outcome.fallbackUsed ? "failed" : succeeded ? "succeeded" : "failed",
      input.outcome.fallbackUsed ? input.outcome.primaryFailureCategory : finalFailureCategory
    ),
    ...(input.outcome.fallbackUsed && decision.fallback
      ? [attempt(decision.fallback, succeeded ? "succeeded" : "failed", finalFailureCategory)]
      : [])
  ] : [];
  const cost = normalizedCost(usage, finalCandidate);
  return {
    attemptCount: input.outcome.attempts,
    attempts,
    completedAt: input.completedAt,
    computeSource: finalCandidate?.computeSource ?? "managed-cloud",
    costAmountMicros: cost.amountMicros,
    costCurrency: cost.currency,
    costScope: cost.scope,
    costSource: cost.source,
    fallbackUsed: input.outcome.fallbackUsed,
    inputTokens: boundedInteger(usage?.inputTokens ?? null),
    latencyMs: Math.max(0, Math.min(input.completedAt.getTime() - input.startedAt.getTime(), 2_147_483_647)),
    mode: input.request.mode,
    model: finalCandidate?.modelId ?? (finalResult.ok ? finalResult.response.model : input.request.requestedModel ?? "unknown"),
    outputTokens: boundedInteger(usage?.outputTokens ?? null),
    projectId: input.request.metadata?.projectId ?? null,
    provider: finalCandidate?.providerId ?? (finalResult.ok ? finalResult.response.providerId : finalResult.failure.providerId),
    sourceId: finalCandidate?.adapterId ?? "auto",
    startedAt: input.startedAt,
    status: succeeded ? "succeeded" : finalFailureCategory === "cancelled" ? "cancelled" : "failed",
    totalTokens: boundedInteger(usage?.totalTokens ?? null),
    traceId: input.request.metadata?.traceId ?? input.request.metadata?.requestId ?? randomUUID()
  };
}

async function persistSafely(input: {
  externalUserId: string;
  persist?: PersistUsage;
  record: UsageRecord;
}) {
  try {
    await (input.persist ?? persistIntelligenceUsageRecord)({
      ...input.record,
      externalUserId: input.externalUserId
    });
  } catch {
    console.warn("intelligence usage persistence failed", {
      code: "PERSISTENCE_ERROR",
      traceId: input.record.traceId
    });
  }
}

export async function meterIntelligenceResult(input: {
  externalUserId: string | null;
  outcome: AutoInvocationResult<IntelligenceResult>;
  persist?: PersistUsage;
  request: IntelligenceRequest;
  startedAt: Date;
}) {
  if (!input.externalUserId) return input.outcome;
  await persistSafely({
    externalUserId: input.externalUserId,
    persist: input.persist,
    record: buildIntelligenceUsageRecord({
      completedAt: new Date(),
      outcome: input.outcome,
      request: input.request,
      startedAt: input.startedAt
    })
  });
  return input.outcome;
}

export function meterIntelligenceStream(input: {
  externalUserId: string | null;
  outcome: AutoInvocationResult<IntelligenceStreamResult>;
  persist?: PersistUsage;
  request: IntelligenceRequest;
  startedAt: Date;
}) {
  if (!input.externalUserId || !input.outcome.result.ok) {
    if (input.externalUserId) {
      void persistSafely({
        externalUserId: input.externalUserId,
        persist: input.persist,
        record: buildIntelligenceUsageRecord({
          completedAt: new Date(),
          outcome: input.outcome,
          request: input.request,
          startedAt: input.startedAt
        })
      });
    }
    return input.outcome;
  }

  const original = input.outcome.result.response.stream;
  let activeReader: ReadableStreamDefaultReader<IntelligenceStreamEvent> | null = null;
  let usage: IntelligenceUsage | null = null;
  let persisted = false;
  const persistOnce = (status: "failed" | "succeeded") => {
    if (persisted) return;
    persisted = true;
    void persistSafely({
      externalUserId: input.externalUserId!,
      persist: input.persist,
      record: buildIntelligenceUsageRecord({
        completedAt: new Date(),
        outcome: input.outcome,
        request: input.request,
        startedAt: input.startedAt,
        streamStatus: status,
        streamUsage: usage
      })
    });
  };
  const stream = new ReadableStream<IntelligenceStreamEvent>({
    async start(controller) {
      const reader = original.getReader();
      activeReader = reader;
      try {
        while (true) {
          const next = await reader.read();
          if (next.done) break;
          if (next.value.type === "usage") usage = next.value.usage;
          controller.enqueue(next.value);
        }
        controller.close();
        persistOnce("succeeded");
      } catch (error) {
        controller.error(error);
        persistOnce("failed");
      } finally {
        activeReader = null;
        reader.releaseLock();
      }
    },
    cancel(reason) {
      persistOnce("failed");
      return activeReader?.cancel(reason);
    }
  });
  return {
    ...input.outcome,
    result: {
      ok: true as const,
      response: { ...input.outcome.result.response, stream }
    }
  };
}

export async function currentIntelligenceUsageSummary(externalUserId: string): Promise<IntelligenceUsageSummary> {
  const now = new Date();
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return {
    ...(await summarizeIntelligenceUsage(externalUserId, periodStart)),
    periodStart: periodStart.toISOString()
  };
}
