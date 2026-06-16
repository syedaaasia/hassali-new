import type { PreviewRuntimeResult } from "@/lib/server/preview/preview-types";
import type { BackendRuntimeEngineResult } from "@/lib/server/runtime/backend-runtime-types";
import type { DatabaseRuntimeEngineResult } from "@/lib/server/runtime/database-runtime-types";

export type RuntimeFileAnalysisStatus = "empty" | "partial" | "ready";

export type RuntimeFileAnalysis = {
  analysisStatus: RuntimeFileAnalysisStatus;
  analyzedFiles: string[];
  charts: string[];
  components: string[];
  confidence: number;
  endpoints: string[];
  forms: string[];
  framework: string;
  generatedFiles: Record<string, string>;
  navigation: string[];
  pages: string[];
  routes: string[];
  screens: string[];
  services: string[];
  tables: string[];
  warnings: string[];
};

export type LiveRuntimeSyncInput = {
  productMode: "ASK" | "CODE" | "WEBSITE";
  projectId: string;
  writtenFiles: string[];
  workspaceRoot: string;
};

export type LiveRuntimePreviewMetadata = {
  analysis: RuntimeFileAnalysis;
  backendRuntime?: BackendRuntimeEngineResult;
  databaseRuntime?: DatabaseRuntimeEngineResult;
  liveRuntimePreviewSyncedAt: string;
  previewRuntime: PreviewRuntimeResult;
  syncStatus: "empty" | "failed" | "synced";
  warnings: string[];
};
