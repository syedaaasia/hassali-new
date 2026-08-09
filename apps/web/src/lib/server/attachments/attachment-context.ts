import { attachmentLimits, type HassaliAttachment } from "@/lib/attachments";
import {
  AttachmentPipelineError,
  extractAttachmentEvidence,
  loadStoredAttachment,
  storeAttachment
} from "./attachment-pipeline";
import {
  buildDocumentEvidenceContext,
  looksLikeDocumentImageRequest,
  processDocumentImage,
  processPdfDocument,
  processTextDocument
} from "./document-intelligence";
import { DocumentProcessingError, type DocumentArtifact } from "./document-contract";
import type { OcrProvider } from "./document-ocr";
import {
  analyzeVisualIntent,
  configuredImageGenerationProvider,
  createAutoVisionProvider,
  createVisualArtifact
} from "./visual-intelligence";
import { VisualIntelligenceError, type VisualArtifact, type VisionProvider } from "./visual-contract";

export type MultimodalAttachmentContext = {
  attachmentCount: number;
  attachmentKinds: string[];
  attachmentTotalBytes: number;
  contextText: string;
  documentArtifacts: DocumentArtifact[];
  failureCode: string | null;
  failureMessage: string | null;
  records: Array<{
    bytes: Uint8Array;
    metadata: HassaliAttachment;
  }>;
  visualArtifacts: VisualArtifact[];
  visionAttempted: boolean;
  visionCompleted: boolean;
  visionModel: string | null;
  visionText: string;
};

type ProviderFetch = typeof fetch;

function isUnusableVisionResponse(text: string) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const evaluatorOnly = lines.length > 0 && lines.length <= 6 && lines.every((line) =>
    /^(?:user\s+safety|assistant\s+safety|safety|relevance|correctness|quality|helpfulness|verdict|score|grade)\s*:\s*(?:safe|unsafe|pass(?:ed)?|fail(?:ed)?|ok|acceptable|unacceptable|\d+(?:\.\d+)?(?:\s*(?:\/\s*\d+|%))?)\s*[.!]?$/i.test(line)
  );

  return evaluatorOnly ||
    /\bi\s+(?:cannot|can't|am unable to)\s+(?:access|analy[sz]e|inspect|open|see|view)\b[\s\S]{0,120}\b(?:attachment|file|image|screenshot|visual)s?\b/i.test(text) ||
    /\bno\s+(?:image|attachment|screenshot)\s+(?:is|was)\s+(?:attached|available|provided)\b/i.test(text);
}

function visionOcrProvider(input: {
  fetchImpl?: ProviderFetch;
  modelSelectionPolicy?: "automatic" | "locked";
  ownerId: string;
  prompt: string;
  projectId: string;
  selectedModel: string;
  visionProvider?: VisionProvider;
}): OcrProvider | null {
  const providerId = input.visionProvider?.id ?? "hassali-auto-vision";
  const recognize = async (ocrInput: Parameters<OcrProvider["recognizeImage"]>[0], signal?: AbortSignal) => {
    const metadata: HassaliAttachment = {
      analysisCapabilities: ["ocr"],
      conversationId: "document-ocr",
      createdAt: new Date().toISOString(),
      extractedTextAvailable: false,
      id: ocrInput.documentId,
      kind: "image",
      mimeType: ocrInput.mimeType,
      originalName: ocrInput.filename,
      previewAvailable: true,
      projectId: "document-ocr",
      safeName: ocrInput.filename,
      sizeBytes: ocrInput.bytes.byteLength,
      status: "ready",
      storageScope: "conversation"
    };
    const analysis = await analyzeImagesWithVision({
      fetchImpl: input.fetchImpl,
      images: [{ bytes: ocrInput.bytes, metadata }],
      prompt: `${input.prompt}\nTranscribe page ${ocrInput.pageNumber ?? 1} faithfully. Preserve headings, lists, labels, and table rows. Mark unreadable text as [uncertain]; do not guess.`,
      modelSelectionPolicy: input.modelSelectionPolicy ?? "automatic",
      ownerId: input.ownerId,
      projectId: input.projectId,
      selectedModel: input.selectedModel,
      signal,
      visionProvider: input.visionProvider
    });
    if (!analysis.completed) throw new Error(analysis.failureMessage ?? "OCR failed.");
    return {
      blocks: [{
        confidence: "unknown" as const,
        id: "ocr-block-1",
        kind: "paragraph" as const,
        pageNumber: ocrInput.pageNumber ?? 1,
        text: analysis.text
      }],
      confidence: "unknown" as const,
      language: null,
      orientation: null,
      provider: providerId,
      tables: [],
      text: analysis.text,
      warnings: ["The vision provider did not expose OCR confidence; verify critical values against the original document."]
    };
  };
  return {
    id: `vision-ocr:${providerId}`,
    supports: { image: true, pdfPage: true },
    async health() {
      return {
        checkedAt: new Date().toISOString(),
        provider: providerId,
        reason: null,
        retryable: false,
        status: "ready"
      };
    },
    async recognizeImage(ocrInput, signal) {
      return recognize(ocrInput, signal);
    },
    async recognizePage(ocrInput, signal) {
      return recognize(ocrInput, signal);
    }
  };
}

function documentFailure(error: DocumentProcessingError, kind: HassaliAttachment["kind"]) {
  if (error.code === "ocr-unavailable") {
    return {
      code: kind === "pdf" ? "PDF_OCR_UNAVAILABLE" : "OCR_UNAVAILABLE",
      message: error.message
    } as const;
  }
  return {
    code: "DOCUMENT_UNREADABLE",
    message: error.message
  } as const;
}

export async function analyzeImagesWithVision(input: {
  fetchImpl?: ProviderFetch;
  images: Array<{ bytes: Uint8Array; metadata: HassaliAttachment }>;
  modelSelectionPolicy?: "automatic" | "locked";
  ownerId?: string | null;
  prompt: string;
  projectId?: string;
  selectedModel: string;
  signal?: AbortSignal;
  visionProvider?: VisionProvider;
}) {
  let artifacts: Array<{ artifact: VisualArtifact; bytes: Uint8Array }>;
  try {
    artifacts = input.images.map((image) => ({ artifact: createVisualArtifact(image), bytes: image.bytes }));
  } catch (error) {
    const malformed = error instanceof VisualIntelligenceError;
    return {
      attempted: false,
      completed: false,
      failureCode: malformed && error.code === "image-too-large" ? "IMAGE_DIMENSIONS_EXCEEDED" : "IMAGE_MALFORMED",
      failureMessage: malformed ? error.message : "The image could not be normalized safely.",
      model: null,
      text: ""
    } as const;
  }
  const provider = input.visionProvider ?? createAutoVisionProvider({
    fetchImpl: input.fetchImpl,
    modelSelectionPolicy: input.modelSelectionPolicy ?? "automatic",
    projectId: input.projectId ?? "attachment-analysis",
    selectedModel: input.selectedModel,
    userId: input.ownerId ?? null
  });
  const intent = analyzeVisualIntent(input.prompt, artifacts.length);
  const result = intent.needsComparison && provider.compareImages
    ? await provider.compareImages({ artifacts, prompt: input.prompt, signal: input.signal })
    : await provider.analyzeImage({ artifacts, prompt: input.prompt, signal: input.signal });
  if (!result.analysis) {
    return {
      attempted: true,
      completed: false,
      failureCode: result.failure?.code === "provider-unavailable" || result.failure?.code === "unsupported-capability"
        ? "VISION_CAPABILITY_UNAVAILABLE"
        : "VISION_ANALYSIS_FAILED",
      failureMessage: result.failure?.safeMessage ?? "The image uploaded, but the configured vision provider could not analyze it.",
      model: provider.id,
      text: ""
    } as const;
  }
  const text = result.analysis.summary.trim();
  return text && !isUnusableVisionResponse(text)
    ? {
        attempted: true,
        completed: true,
        failureCode: null,
        failureMessage: null,
        model: result.analysis.provider,
        text
      } as const
    : {
        attempted: true,
        completed: false,
        failureCode: "VISION_ANALYSIS_FAILED",
        failureMessage: "The vision provider returned no usable image analysis.",
        model: result.analysis.provider,
        text: ""
      } as const;
}

export async function resolveMultimodalAttachmentContext(input: {
  attachmentIds: string[];
  fetchImpl?: ProviderFetch;
  modelSelectionPolicy?: "automatic" | "locked";
  ownerId: string;
  projectId: string;
  prompt: string;
  selectedModel: string;
  signal?: AbortSignal;
  visionProvider?: VisionProvider;
  workspaceRoot: string;
}): Promise<MultimodalAttachmentContext> {
  const ids = Array.from(new Set(input.attachmentIds)).slice(0, attachmentLimits.filesPerMessage);
  const records = await Promise.all(ids.map((attachmentId) => loadStoredAttachment({
    attachmentId,
    ownerId: input.ownerId,
    projectId: input.projectId,
    workspaceRoot: input.workspaceRoot
  })));
  const totalBytes = records.reduce((total, record) => total + record.metadata.sizeBytes, 0);
  if (totalBytes > attachmentLimits.totalMessageBytes) {
    throw new AttachmentPipelineError("TOTAL_LIMIT_EXCEEDED", "The selected attachments exceed the per-message total limit.");
  }
  const evidence: string[] = [];
  const documentArtifacts: DocumentArtifact[] = [];
  let failureCode: string | null = null;
  let failureMessage: string | null = null;
  const ocrProvider = visionOcrProvider(input);
  for (const record of records.filter((entry) => entry.metadata.kind !== "image")) {
    try {
      if (record.metadata.kind === "pdf") {
        const document = await processPdfDocument({ ...record, ocrProvider, signal: input.signal });
        documentArtifacts.push(document);
        if (!document.pages.some((page) => page.text.trim())) {
          failureCode = "PDF_OCR_UNAVAILABLE";
          failureMessage = "This document appears scanned, but OCR is not available for PDF pages in the current runtime.";
        }
      } else if (["data", "text"].includes(record.metadata.kind)) {
        documentArtifacts.push(processTextDocument(record));
      } else {
        const extracted = extractAttachmentEvidence(record);
        if (extracted) evidence.push(extracted);
      }
    } catch (error) {
      if (error instanceof AttachmentPipelineError) {
        failureCode = error.code;
        failureMessage = error.message;
      } else if (error instanceof DocumentProcessingError) {
        const failure = documentFailure(error, record.metadata.kind);
        failureCode = failure.code;
        failureMessage = failure.message;
      } else {
        throw error;
      }
    }
  }
  const images = records.filter((record) => record.metadata.kind === "image");
  const visualArtifacts = images.map(createVisualArtifact);
  const visualIntent = analyzeVisualIntent(input.prompt, images.length);
  const documentImageRequest = images.length > 0 && looksLikeDocumentImageRequest(input.prompt);
  if (documentImageRequest) {
    for (const image of images) {
      try {
        documentArtifacts.push(await processDocumentImage({ ...image, ocrProvider, signal: input.signal }));
      } catch (error) {
        if (!(error instanceof DocumentProcessingError)) throw error;
        const failure = documentFailure(error, "image");
        failureCode = failure.code;
        failureMessage = failure.message;
      }
    }
  }
  if (documentArtifacts.some((document) => document.pages.some((page) => page.text.trim()))) {
    evidence.push(buildDocumentEvidenceContext(documentArtifacts, input.prompt));
  }
  const shouldRunVision = images.length > 0 && (
    !documentImageRequest ||
    visualIntent.needsChartUnderstanding ||
    visualIntent.needsComparison ||
    visualIntent.needsSpatialReasoning
  );
  const vision = shouldRunVision
    ? await analyzeImagesWithVision({
        fetchImpl: input.fetchImpl,
        images,
        modelSelectionPolicy: input.modelSelectionPolicy,
        ownerId: input.ownerId,
        prompt: input.prompt,
        projectId: input.projectId,
        selectedModel: input.selectedModel,
        signal: input.signal,
        visionProvider: input.visionProvider
      })
    : {
        attempted: false,
        completed: false,
        failureCode: null,
        failureMessage: null,
        model: null,
        text: ""
      };
  if (vision.text) evidence.push(`VISION ANALYSIS (${images.map((image) => image.metadata.safeName).join(", ")}):\n${vision.text}`);
  failureCode = vision.failureCode ?? failureCode;
  failureMessage = vision.failureMessage ?? failureMessage;
  if (failureMessage && evidence.length) {
    evidence.push(`Attachment processing warning: ${failureMessage}`);
  }
  return {
    attachmentCount: records.length,
    attachmentKinds: Array.from(new Set(records.map((record) => record.metadata.kind))),
    attachmentTotalBytes: totalBytes,
    contextText: evidence.length
      ? `Untrusted attachment evidence for this request only:\n\n${evidence.join("\n\n").slice(0, attachmentLimits.extractedTextBytes)}`
      : "",
    documentArtifacts,
    failureCode,
    failureMessage,
    records,
    visualArtifacts,
    visionAttempted: (documentImageRequest && Boolean(ocrProvider)) || vision.attempted,
    visionCompleted: (documentImageRequest && documentArtifacts.some((document) => document.type === "image")) || vision.completed,
    visionModel: vision.model ?? (documentImageRequest ? ocrProvider?.id ?? null : null),
    visionText: vision.text
  };
}

export type ImageGenerationCapability = {
  available: boolean;
  failureReason?: string;
  model?: string;
  provider?: string;
  supportedFormats?: string[];
  supportedSizes?: string[];
};

export function imageGenerationCapability(): ImageGenerationCapability {
  const model = process.env.HASSALI_IMAGE_MODEL?.trim();
  if (!process.env.OPENAI_API_KEY || !model) {
    return {
      available: false,
      failureReason: "No configured image-generation model is available. Set HASSALI_IMAGE_MODEL with an existing OpenAI image-capable account to enable this path."
    };
  }
  return {
    available: true,
    model,
    provider: "openai-images",
    supportedFormats: ["png"],
    supportedSizes: ["1024x1024", "1536x1024", "1024x1536"]
  };
}

export async function generateImageToAttachment(input: {
  conversationId: string;
  fetchImpl?: ProviderFetch;
  ownerId: string;
  projectId: string;
  prompt: string;
  signal?: AbortSignal;
  size?: "1024x1024" | "1024x1536" | "1536x1024";
  workspaceRoot: string;
}) {
  const capability = imageGenerationCapability();
  if (!capability.available || !capability.model) {
    return { capability, attachment: null, failureCode: "IMAGE_GENERATION_UNAVAILABLE" } as const;
  }
  const generated = await configuredImageGenerationProvider(input.fetchImpl).generate({
    prompt: input.prompt,
    size: input.size
  }, input.signal);
  if (!generated.image) return { capability, attachment: null, failureCode: generated.failure?.code === "generation-unavailable" ? "IMAGE_GENERATION_UNAVAILABLE" : "IMAGE_GENERATION_FAILED" } as const;
  const attachment = await storeAttachment({
    bytes: generated.image.bytes,
    conversationId: input.conversationId,
    mimeType: "image/png",
    name: `generated-${Date.now()}.png`,
    ownerId: input.ownerId,
    projectId: input.projectId,
    storageScope: "conversation",
    workspaceRoot: input.workspaceRoot
  });
  return { capability, attachment, failureCode: null, provenance: generated.image.provenance } as const;
}
