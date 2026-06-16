import { buildPreviewRuntime } from "@/lib/server/preview/preview-runtime";
import { buildBackendRuntimeEngine } from "@/lib/server/runtime/backend-runtime-engine";
import { buildDatabaseRuntimeEngine } from "@/lib/server/runtime/database-runtime-engine";
import { analyzeRuntimeFiles } from "@/lib/server/runtime/runtime-file-analyzer";
import { mapRuntimeAnalysisToPreviewInput } from "@/lib/server/runtime/runtime-preview-mapper";
import type {
  LiveRuntimePreviewMetadata,
  LiveRuntimeSyncInput
} from "@/lib/server/runtime/live-runtime-types";

export async function buildLiveRuntimePreviewMetadata(
  input: LiveRuntimeSyncInput
): Promise<LiveRuntimePreviewMetadata> {
  try {
    const analysis = await analyzeRuntimeFiles({
      workspaceRoot: input.workspaceRoot,
      writtenFiles: input.writtenFiles
    });
    const previewRuntime = buildPreviewRuntime(
      mapRuntimeAnalysisToPreviewInput({
        analysis,
        productMode: input.productMode
      })
    );
    const backendRuntime = buildBackendRuntimeEngine(analysis.generatedFiles);
    const databaseRuntime = buildDatabaseRuntimeEngine(analysis.generatedFiles);
    const livePreviewRuntime = databaseRuntime.detected && databaseRuntime.realPreview
      ? {
          ...previewRuntime,
          capabilities: [...previewRuntime.capabilities, "database_runtime_analysis" as const],
          classification: {
            confidence: Math.max(previewRuntime.classification.confidence, databaseRuntime.match.confidence),
            previewType: "architecture" as const,
            reason: `${databaseRuntime.match.displayName} database runtime detected from project files.`,
            signals: databaseRuntime.match.signals
          },
          metadata: {
            ...previewRuntime.metadata,
            backendRuntime: backendRuntime.detected ? backendRuntime : undefined,
            databaseRuntime
          },
          realPreview: databaseRuntime.realPreview,
          state: "ready" as const,
          warnings: [...previewRuntime.warnings, ...databaseRuntime.warnings]
        }
      : backendRuntime.detected && backendRuntime.realPreview
      ? {
          ...previewRuntime,
          capabilities: [...previewRuntime.capabilities, "backend_runtime_analysis" as const],
          classification: {
            confidence: Math.max(previewRuntime.classification.confidence, backendRuntime.match.confidence),
            previewType: "architecture" as const,
            reason: `${backendRuntime.match.displayName} backend runtime detected from project files.`,
            signals: backendRuntime.match.signals
          },
          metadata: {
            ...previewRuntime.metadata,
            backendRuntime,
            databaseRuntime: databaseRuntime.detected ? databaseRuntime : undefined
          },
          realPreview: backendRuntime.realPreview,
          state: "ready" as const,
          warnings: [...previewRuntime.warnings, ...backendRuntime.warnings]
        }
      : previewRuntime;

    return {
      analysis,
      backendRuntime: backendRuntime.detected ? backendRuntime : undefined,
      databaseRuntime: databaseRuntime.detected ? databaseRuntime : undefined,
      liveRuntimePreviewSyncedAt: new Date().toISOString(),
      previewRuntime: livePreviewRuntime,
      syncStatus: analysis.analysisStatus === "empty" ? "empty" : "synced",
      warnings: [
        ...analysis.warnings,
        ...(backendRuntime.detected ? backendRuntime.warnings : []),
        ...(databaseRuntime.detected ? databaseRuntime.warnings : [])
      ]
    };
  } catch (error) {
    return {
      analysis: {
        analysisStatus: "empty",
        analyzedFiles: [],
        charts: [],
        components: [],
        confidence: 0,
        endpoints: [],
        forms: [],
        framework: "unknown",
        generatedFiles: {},
        navigation: [],
        pages: [],
        routes: [],
        screens: [],
        services: [],
        tables: [],
        warnings: [error instanceof Error ? error.message : "Live runtime preview sync failed."]
      },
      liveRuntimePreviewSyncedAt: new Date().toISOString(),
      previewRuntime: buildPreviewRuntime({
        generatedFiles: {},
        productMode: input.productMode,
        proposal: null
      }),
      syncStatus: "failed",
      warnings: [error instanceof Error ? error.message : "Live runtime preview sync failed."]
    };
  }
}
