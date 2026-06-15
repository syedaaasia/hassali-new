import type {
  OpenHandsSandboxConfig,
  OpenHandsSandboxIsolationMode
} from "@/lib/server/runtime/workers/openhands-sandbox-types";

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

function parseIsolationMode(value: string | undefined): OpenHandsSandboxIsolationMode {
  return value === "none" || value === "planned_process" || value === "planned_remote"
    ? value
    : "planned_container";
}

export function getOpenHandsSandboxConfig(
  overrides: Partial<OpenHandsSandboxConfig> = {}
): OpenHandsSandboxConfig {
  const timeoutMs = overrides.timeoutMs ?? parseTimeout(process.env.OPENHANDS_SANDBOX_TIMEOUT_MS);

  return {
    commandPolicy: overrides.commandPolicy ?? "deny",
    enabled: overrides.enabled ?? parseBoolean(process.env.ENABLE_OPENHANDS_SANDBOX),
    isolationMode: overrides.isolationMode ?? parseIsolationMode(process.env.OPENHANDS_SANDBOX_ISOLATION_MODE),
    networkPolicy: overrides.networkPolicy ?? "deny",
    resourceLimits: overrides.resourceLimits ?? {
      cpuCores: 2,
      memoryMb: 2048,
      timeoutMs
    },
    timeoutMs
  };
}

export function isOpenHandsSandboxEnabled(overrides: Partial<OpenHandsSandboxConfig> = {}) {
  return getOpenHandsSandboxConfig(overrides).enabled;
}
