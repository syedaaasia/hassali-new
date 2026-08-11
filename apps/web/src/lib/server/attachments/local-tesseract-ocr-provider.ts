import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { detectLocalToolCapabilities } from "@/lib/server/capabilities/local-tool-detector";
import { executeWithBroker } from "@/lib/server/runtime/secure-execution/execution-broker";
import { issueExecutionGrant, revokeExecutionGrant } from "@/lib/server/runtime/secure-execution/execution-grants";
import { createSecureTaskArtifacts } from "@/lib/server/runtime/secure-execution/task-artifacts";
import { tesseractOcrRequest } from "@/lib/server/runtime/secure-execution/tool-adapters";
import { DocumentProcessingError, documentProcessingLimits } from "./document-contract";
import type { OcrInput, OcrProvider, OcrResult } from "./document-ocr";

function extensionFor(mimeType: string) {
  if (mimeType === "image/jpeg") return ".jpg";
  if (mimeType === "image/webp") return ".webp";
  if (mimeType === "image/tiff") return ".tiff";
  return ".png";
}

export function createLocalTesseractOcrProvider(input: {
  externalUserId: string;
  language?: string;
}): OcrProvider {
  const recognize = async (ocrInput: OcrInput, signal?: AbortSignal): Promise<OcrResult> => {
    if (ocrInput.bytes.byteLength > documentProcessingLimits.maxFileBytes) {
      throw new DocumentProcessingError("document-too-large", "The OCR artifact exceeds the bounded local processing limit.");
    }
    const artifacts = await createSecureTaskArtifacts("tesseract-ocr");
    const inputName = `page-${ocrInput.pageNumber ?? 1}${extensionFor(ocrInput.mimeType)}`;
    const outputBase = `ocr-${randomUUID()}`;
    await writeFile(path.join(artifacts.root, inputName), ocrInput.bytes);
    const grantId = issueExecutionGrant({
      approvalPolicy: "ask",
      approvalSource: "inline_approval",
      capabilities: ["ocr.extract"],
      externalUserId: input.externalUserId,
      maxUses: 1,
      mode: "ASK",
      projectId: null,
      riskCeiling: "medium",
      scopeKind: "task-temp",
      scopeRoot: artifacts.root
    });
    try {
      const execution = await executeWithBroker(tesseractOcrRequest({
        abortSignal: signal,
        externalUserId: input.externalUserId,
        grantId,
        inputPath: inputName,
        language: input.language,
        mode: "ASK",
        outputBasePath: outputBase,
        projectId: null,
        scopeRoot: artifacts.root
      }));
      if (execution.status === "unavailable") {
        throw new DocumentProcessingError("ocr-unavailable", "Local Tesseract OCR is not available in the current runtime.");
      }
      if (execution.status !== "passed") {
        throw new DocumentProcessingError("ocr-failed", execution.failure?.message ?? "Local OCR did not complete.", execution.status === "timed-out");
      }
      const text = (await readFile(path.join(artifacts.root, `${outputBase}.txt`), "utf8")).trim();
      return {
        blocks: text ? [{ confidence: "unknown", id: `${ocrInput.documentId}-local-ocr-${ocrInput.pageNumber ?? 1}`, kind: "paragraph", pageNumber: ocrInput.pageNumber ?? 1, text }] : [],
        confidence: text ? "unknown" : "low",
        language: input.language ?? null,
        orientation: null,
        provider: "local-tesseract",
        tables: [],
        text,
        warnings: ["Tesseract text confidence and layout structure are not available from this bounded adapter path."]
      };
    } finally {
      revokeExecutionGrant(grantId);
      await artifacts.cleanup();
    }
  };
  return {
    id: "local-tesseract",
    supports: { image: true, pdfPage: true },
    async health() {
      const tool = (await detectLocalToolCapabilities()).find((entry) => entry.id === "tesseract");
      const ready = tool?.status === "available" || tool?.status === "detected";
      return {
        checkedAt: tool?.checkedAt ?? new Date().toISOString(),
        provider: "local-tesseract",
        reason: ready ? null : tool?.evidence[0]?.detail ?? "Tesseract was not detected.",
        retryable: tool?.status === "degraded",
        status: ready ? "ready" : "unavailable"
      };
    },
    recognizeImage: recognize,
    recognizePage: recognize
  };
}
