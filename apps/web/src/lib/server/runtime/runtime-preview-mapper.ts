import type { PreviewRuntimeInput } from "@/lib/server/preview/preview-types";
import type { RuntimeFileAnalysis } from "@/lib/server/runtime/live-runtime-types";

function summaryFor(analysis: RuntimeFileAnalysis) {
  return [
    `Live runtime file analysis detected ${analysis.framework}.`,
    analysis.routes.length ? `Routes: ${analysis.routes.join(", ")}.` : "",
    analysis.components.length ? `Components: ${analysis.components.join(", ")}.` : "",
    analysis.endpoints.length ? `Endpoints: ${analysis.endpoints.join(", ")}.` : ""
  ]
    .filter(Boolean)
    .join(" ");
}

export function mapRuntimeAnalysisToPreviewInput(input: {
  analysis: RuntimeFileAnalysis;
  productMode: "ASK" | "CODE" | "WEBSITE";
}): PreviewRuntimeInput {
  const changes = Object.entries(input.analysis.generatedFiles).map(([filePath, content]) => ({
    action: "runtime_file",
    path: filePath,
    proposedContent: content,
    summary: `Runtime file ${filePath}`
  }));

  return {
    generatedFiles: input.analysis.generatedFiles,
    productMode: input.productMode,
    projectType: input.analysis.framework,
    proposal: {
      changes,
      previewType:
        input.productMode === "WEBSITE"
          ? "website"
          : input.analysis.screens.length
            ? "mobile"
            : input.analysis.endpoints.length
              ? "architecture"
              : "application",
      summary: summaryFor(input.analysis)
    },
    runtimeMetadata: {
      liveRuntimeAnalysis: true
    }
  };
}
