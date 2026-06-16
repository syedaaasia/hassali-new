import { mapBackendArchitecturePreview } from "@/lib/server/runtime/backend-architecture-mapper";
import { detectBackendFramework } from "@/lib/server/runtime/backend-framework-registry";
import { analyzeBackendRuntime } from "@/lib/server/runtime/backend-runtime-analyzer";
import type { BackendRuntimeEngineResult } from "@/lib/server/runtime/backend-runtime-types";

export function buildBackendRuntimeEngine(files: Record<string, string>): BackendRuntimeEngineResult {
  const match = detectBackendFramework(files);
  const detected = match.framework !== "unknown";
  const analysis = analyzeBackendRuntime({ files, match });
  const realPreview = detected
    ? mapBackendArchitecturePreview({ analysis, match })
    : null;

  return {
    analysis,
    detected,
    match,
    metadata: {
      architectureStyle: analysis.architectureStyle,
      authenticationType: analysis.authenticationType,
      databaseCount: analysis.databaseCount,
      endpointCount: analysis.endpointCount,
      framework: match.framework,
      frameworkDisplayName: match.displayName,
      queueType: analysis.queueType,
      routeCount: analysis.routeCount,
      runtimeType: match.runtimeType,
      serviceCount: analysis.serviceCount
    },
    realPreview,
    warnings: detected
      ? ["Backend runtime metadata was derived from project files without executing the server."]
      : ["No supported backend framework was detected."]
  };
}
