export type RuntimeAuthorityStatus =
  | "blocked"
  | "failed"
  | "not_started"
  | "planned"
  | "running"
  | "stopped";

export type RuntimeAuthorityDecision = {
  runtimeOptional: true;
  runtimeStartAttempted: boolean;
  runtimeStartError: string | null;
  runtimeStartStatus: RuntimeAuthorityStatus;
  runtimeWarning: string | null;
};

type RuntimeCandidate = {
  error?: string | null;
  previewUrl?: string | null;
  runtimeStatus?: string | null;
  status?: string | null;
} | null | undefined;

function candidateStatus(candidate: RuntimeCandidate): RuntimeAuthorityStatus | null {
  const status = candidate?.runtimeStatus ?? candidate?.status ?? null;

  if (status === "running") return "running";
  if (status === "blocked") return "blocked";
  if (status === "error" || status === "failed") return "failed";
  if (status === "stopped") return "stopped";
  if (status === "candidate" || status === "metadata_only" || status === "starting") return "planned";

  return null;
}

export function buildRuntimeAuthorityDecision(input: {
  backendRuntime?: RuntimeCandidate;
  mobileRuntime?: RuntimeCandidate;
  nextRuntime?: RuntimeCandidate;
  runtimeWarnings?: string[];
  viteRuntime?: RuntimeCandidate;
}): RuntimeAuthorityDecision {
  const candidates = [
    input.viteRuntime,
    input.nextRuntime,
    input.backendRuntime,
    input.mobileRuntime
  ].filter(Boolean) as RuntimeCandidate[];
  const attempted = candidates.length > 0;
  const running = candidates.find((candidate) => candidateStatus(candidate) === "running");
  const failed = candidates.find((candidate) => candidateStatus(candidate) === "failed");
  const blocked = candidates.find((candidate) => candidateStatus(candidate) === "blocked");
  const planned = candidates.find((candidate) => candidateStatus(candidate) === "planned");
  const metadataWarning = input.runtimeWarnings?.find((warning) => warning.trim().length > 0) ?? null;

  if (running) {
    return {
      runtimeOptional: true,
      runtimeStartAttempted: true,
      runtimeStartError: null,
      runtimeStartStatus: "running",
      runtimeWarning: null
    };
  }

  if (blocked) {
    return {
      runtimeOptional: true,
      runtimeStartAttempted: true,
      runtimeStartError: blocked.error ?? "Runtime start is blocked by Hassali safety policy.",
      runtimeStartStatus: "blocked",
      runtimeWarning: "Runtime start is blocked by safety policy. Files are still applied."
    };
  }

  if (failed) {
    return {
      runtimeOptional: true,
      runtimeStartAttempted: true,
      runtimeStartError: failed.error ?? "Runtime start failed.",
      runtimeStartStatus: "failed",
      runtimeWarning: "Files applied successfully, but the optional runtime preview did not start."
    };
  }

  if (planned) {
    return {
      runtimeOptional: true,
      runtimeStartAttempted: true,
      runtimeStartError: null,
      runtimeStartStatus: "planned",
      runtimeWarning: "Runtime preview is planned only; files are still applied."
    };
  }

  return {
    runtimeOptional: true,
    runtimeStartAttempted: attempted,
    runtimeStartError: null,
    runtimeStartStatus: metadataWarning ? "not_started" : "not_started",
    runtimeWarning: metadataWarning
  };
}
