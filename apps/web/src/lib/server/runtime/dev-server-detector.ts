import {
  getDevServerRegistry,
  scoreDevServerEntry
} from "@/lib/server/runtime/dev-server-registry";
import type {
  DevServerDetection,
  DevServerDetectionInput
} from "@/lib/server/runtime/dev-server-runtime-types";

function collectFileCount(input: DevServerDetectionInput) {
  return Object.keys({
    ...(input.generatedFiles ?? {}),
    ...(input.proposalFiles ?? {})
  }).length;
}

export function detectDevServerRuntime(input: DevServerDetectionInput): DevServerDetection {
  const best = getDevServerRegistry()
    .map((entry) => scoreDevServerEntry(entry, input))
    .sort((a, b) => b.confidence - a.confidence)[0];

  if (!best || best.confidence < 0.24) {
    return {
      confidence: collectFileCount(input) > 0 ? 0.28 : 0.1,
      framework: "unknown",
      signals: collectFileCount(input) > 0 ? ["unrecognized_runtime_files"] : ["no_runtime_files"]
    };
  }

  return best;
}
