import type {
  GooseDelegationConfig,
  GooseDelegationMode
} from "@/lib/server/runtime/workers/goose-delegation-types";

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

function parseDelegationMode(value: string | undefined): GooseDelegationMode {
  return value === "planned_agent_delegation"
    || value === "planned_mcp_delegation"
    || value === "planned_worker_chain"
    ? value
    : "dry_run";
}

export function getGooseDelegationConfig(
  overrides: Partial<GooseDelegationConfig> = {}
): GooseDelegationConfig {
  return {
    delegationMode: overrides.delegationMode ?? parseDelegationMode(process.env.GOOSE_DELEGATION_MODE),
    enabled: overrides.enabled ?? parseBoolean(process.env.ENABLE_GOOSE_DELEGATION),
    policy: overrides.policy ?? {
      externalWorkspace: "deny",
      mcpToolExecution: "deny",
      network: "deny",
      packageInstall: "deny",
      shell: "deny"
    },
    timeoutMs: overrides.timeoutMs ?? parseTimeout(process.env.GOOSE_DELEGATION_TIMEOUT_MS)
  };
}

export function isGooseDelegationEnabled(overrides: Partial<GooseDelegationConfig> = {}) {
  return getGooseDelegationConfig(overrides).enabled;
}
