import type { OpenCodeWorkerConfig } from "@/lib/server/runtime/workers/opencode-worker-types";

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

export function getOpenCodeWorkerConfig(overrides: Partial<OpenCodeWorkerConfig> = {}): OpenCodeWorkerConfig {
  return {
    args: overrides.args ?? parseArgs(process.env.OPENCODE_WORKER_ARGS),
    command: overrides.command ?? process.env.OPENCODE_WORKER_COMMAND ?? "opencode",
    enabled: overrides.enabled ?? parseBoolean(process.env.ENABLE_OPENCODE_WORKER),
    timeoutMs: overrides.timeoutMs ?? parseTimeout(process.env.OPENCODE_WORKER_TIMEOUT_MS)
  };
}

export function isOpenCodeWorkerEnabled(overrides: Partial<OpenCodeWorkerConfig> = {}) {
  return getOpenCodeWorkerConfig(overrides).enabled;
}
