import { IntelligenceContractError } from "./intelligence-contract";
import { normalizeLocalIntelligenceEndpoint } from "./openai-compatible-adapter";

export const hassaliLocalProtocolVersion = "1";

export type LocalRuntimeState =
  | "busy"
  | "degraded"
  | "loading-model"
  | "not-installed"
  | "ready"
  | "starting"
  | "stopped"
  | "unavailable";

export type LocalRuntimeInfo = {
  id: string;
  kind: "hassali" | "llama-cpp" | "ollama";
  state: LocalRuntimeState;
  version: string | null;
};

export type LocalHardwareProfile = {
  architecture: string | null;
  cpu: {
    logicalCores: number | null;
    model: string | null;
    physicalCores: number | null;
  };
  gpu: Array<{
    model: string | null;
    runtime: string | null;
    vendor: string | null;
    vramBytes: number | null;
  }>;
  memory: {
    availableBytes: number | null;
    totalBytes: number | null;
  };
  operatingSystem: string | null;
  power: {
    onAcPower: boolean | null;
  };
  runtimes: LocalRuntimeInfo[];
  storage: {
    freeBytes: number | null;
    totalBytes: number | null;
  };
};

export type LocalBenchmarkResult = {
  completedAt: string;
  durationMs: number;
  errorCode: string | null;
  generationTokensPerSecond: number | null;
  modelId: string;
  peakMemoryBytes: number | null;
  peakVramBytes: number | null;
  promptTokensPerSecond: number | null;
  runtimeId: string;
  status: "failed" | "succeeded";
};

export type LocalResourcePolicy = {
  allowBackgroundInference: boolean;
  allowGpu: boolean;
  allowModelAutoLoad: boolean;
  allowModelDownloads: boolean;
  idleShutdownMinutes: number;
  maxMemoryBytes: number | null;
  maxThreads: number | null;
  minimumFreeDiskBytes: number;
  pauseDuringHighLoad: boolean;
  pauseOnBattery: boolean;
};

export type LocalModelLicense = {
  commercialUseVerified: boolean | null;
  identifier: string | null;
  redistributionVerified: boolean | null;
  sourceUrl: string | null;
  verifiedAt: string | null;
};

export type LocalModelArtifact = {
  artifactUrl: string;
  capabilities: string[];
  checksum: { algorithm: "sha256"; value: string } | null;
  creator: string;
  format: string;
  license: LocalModelLicense;
  minimumMemoryBytes: number | null;
  modelId: string;
  quantization: string | null;
  recommendedMemoryBytes: number | null;
  runtime: "hassali" | "llama-cpp" | "ollama";
  sizeBytes: number;
};

export type LocalPackManifest = {
  artifacts: LocalModelArtifact[];
  displayName: string;
  packId: string;
  version: string;
};

export type LocalPackState = {
  installedArtifactIds: string[];
  packId: string;
  state: "available" | "downloading" | "failed" | "installed" | "not-installed";
};

export type LocalBridgeInfo = {
  companionVersion: string;
  endpoint: string;
  hardware: LocalHardwareProfile | null;
  paired: boolean;
  protocolVersion: string;
  runtimes: LocalRuntimeInfo[];
};

export type LocalPairingChallenge = {
  challengeId: string;
  expiresAt: string;
  protocolVersion: string;
  requestedOrigin: string;
  userCode: string;
};

export const defaultLocalResourcePolicy: LocalResourcePolicy = {
  allowBackgroundInference: false,
  allowGpu: false,
  allowModelAutoLoad: false,
  allowModelDownloads: false,
  idleShutdownMinutes: 10,
  maxMemoryBytes: null,
  maxThreads: null,
  minimumFreeDiskBytes: 5_000_000_000,
  pauseDuringHighLoad: true,
  pauseOnBattery: true
};

export function normalizeLocalBridgeEndpoint(value: string) {
  let rawUrl: URL;
  try {
    rawUrl = new URL(value);
  } catch {
    throw new IntelligenceContractError("ENDPOINT_URL_INVALID", "The local bridge endpoint is not a valid URL.");
  }
  for (const key of rawUrl.searchParams.keys()) {
    if (/token|secret|auth|key/i.test(key)) {
      throw new IntelligenceContractError(
        "LOCAL_BRIDGE_CREDENTIAL_URL_FORBIDDEN",
        "Pairing credentials must not be placed in a local bridge URL."
      );
    }
  }
  const normalized = normalizeLocalIntelligenceEndpoint(value);
  return normalized;
}

export function assertLocalBridgeOrigin(actualOrigin: string, expectedOrigin: string) {
  if (!actualOrigin || actualOrigin === "*" || actualOrigin !== expectedOrigin) {
    throw new IntelligenceContractError(
      "LOCAL_BRIDGE_ORIGIN_FORBIDDEN",
      "The local bridge rejected an unexpected web origin."
    );
  }
}

export function assertLocalProtocolVersion(version: string) {
  if (version !== hassaliLocalProtocolVersion) {
    throw new IntelligenceContractError(
      "LOCAL_PROTOCOL_VERSION_MISMATCH",
      `Hassali Local protocol ${version || "unknown"} is incompatible with this Hassali version.`
    );
  }
}

export function normalizeLocalBridgeInfo(input: LocalBridgeInfo): LocalBridgeInfo {
  assertLocalProtocolVersion(input.protocolVersion);
  const endpoint = normalizeLocalBridgeEndpoint(input.endpoint);
  return {
    companionVersion: input.companionVersion || "unknown",
    endpoint,
    hardware: input.hardware ?? null,
    paired: Boolean(input.paired),
    protocolVersion: hassaliLocalProtocolVersion,
    runtimes: input.paired ? input.runtimes.slice(0, 20) : []
  };
}

export function localModelInstallEligibility(artifact: LocalModelArtifact) {
  const checksumValid = artifact.checksum?.algorithm === "sha256" &&
    /^[a-f0-9]{64}$/i.test(artifact.checksum.value);
  const licenseVerified = Boolean(
    artifact.license.identifier &&
    artifact.license.sourceUrl &&
    artifact.license.verifiedAt
  );
  return {
    eligible: Boolean(checksumValid && licenseVerified && artifact.sizeBytes > 0),
    licenseCommercialUse: artifact.license.commercialUseVerified,
    licenseRedistribution: artifact.license.redistributionVerified,
    reasons: [
      ...(!checksumValid ? ["A verified SHA-256 checksum is required."] : []),
      ...(!licenseVerified ? ["Verified license source metadata is required."] : [])
    ]
  };
}

export function localFoundationStatus() {
  return {
    companionInstalled: false as const,
    companionPaired: false as const,
    modelsAvailable: 0 as const,
    protocolVersion: hassaliLocalProtocolVersion,
    status: "foundation-only" as const
  };
}
