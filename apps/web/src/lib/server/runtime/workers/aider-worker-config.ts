import type { AiderWorkerConfig } from "@/lib/server/runtime/workers/aider-worker-types";

const defaultTimeoutMs = 5 * 60 * 1000;

function parseBoolean(value: string | undefined) {
  return value?.trim().toLowerCase() === "true";
}

function parseTimeout(value: string | undefined) {
  if (!value) {
    return defaultTimeoutMs;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultTimeoutMs;
}

function parseArgs(value: string | undefined) {
  return value?.split(/\s+/).map((item) => item.trim()).filter(Boolean) ?? [];
}

export function getAiderWorkerConfig(overrides: Partial<AiderWorkerConfig> = {}): AiderWorkerConfig {
  return {
    args: overrides.args ?? parseArgs(process.env.AIDER_WORKER_ARGS),
    command: overrides.command ?? process.env.AIDER_WORKER_COMMAND ?? "aider",
    enabled: overrides.enabled ?? parseBoolean(process.env.ENABLE_AIDER_WORKER),
    timeoutMs: overrides.timeoutMs ?? parseTimeout(process.env.AIDER_WORKER_TIMEOUT_MS)
  };
}

export function isAiderWorkerEnabled(overrides: Partial<AiderWorkerConfig> = {}) {
  return getAiderWorkerConfig(overrides).enabled;
}
