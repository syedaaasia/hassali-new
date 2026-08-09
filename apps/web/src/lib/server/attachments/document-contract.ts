import type { HassaliAttachmentKind } from "@/lib/attachments";

export const documentProcessingLimits = {
  maxConcurrentOcrPages: 1,
  maxContextCharacters: 120 * 1024,
  maxFileBytes: 8 * 1024 * 1024,
  maxIndexChunks: 240,
  maxOcrPages: 24,
  maxPageCharacters: 24 * 1024,
  maxPages: 120,
  maxPageRenderPixels: 2_000_000,
  maxRetrievedCharacters: 48 * 1024,
  maxRetrievedChunks: 12,
  maxTableCells: 2_000,
  processingTimeoutMs: 30_000
} as const;

export type DocumentConfidence = "high" | "low" | "medium" | "unknown";
export type DocumentExtractionMethod = "mixed" | "native" | "ocr";
export type DocumentBlockKind =
  | "caption"
  | "footer"
  | "form_field"
  | "header"
  | "heading"
  | "list"
  | "paragraph"
  | "table"
  | "unknown";

export type DocumentFailureCode =
  | "corrupt-document"
  | "document-too-large"
  | "low-confidence-extraction"
  | "native-extraction-failed"
  | "ocr-failed"
  | "ocr-unavailable"
  | "page-limit-exceeded"
  | "password-protected"
  | "table-structure-uncertain"
  | "unsupported-file";

export type DocumentSourceBounds = {
  height?: number;
  width?: number;
  x?: number;
  y?: number;
};

export type DocumentBlock = {
  bounds?: DocumentSourceBounds;
  confidence: DocumentConfidence;
  id: string;
  kind: DocumentBlockKind;
  pageNumber: number;
  text: string;
};

export type DocumentTableCell = {
  confidence: DocumentConfidence;
  text: string;
  uncertain: boolean;
};

export type DocumentTable = {
  caption?: string;
  confidence: DocumentConfidence;
  headers: DocumentTableCell[];
  id: string;
  pageNumber: number;
  rows: DocumentTableCell[][];
  structureUncertain: boolean;
};

export type DocumentPage = {
  blocks: DocumentBlock[];
  confidence: DocumentConfidence;
  extractionMethod: DocumentExtractionMethod;
  pageNumber: number;
  tables: DocumentTable[];
  text: string;
  warnings: string[];
};

export type DocumentSection = {
  heading: string;
  id: string;
  pageEnd: number;
  pageStart: number;
  text: string;
};

export type DocumentCitation = {
  blockId?: string;
  documentId: string;
  evidenceText: string;
  filename: string;
  id: string;
  page: number;
  sectionId?: string;
  tableId?: string;
};

export type DocumentInspection = {
  fileType: HassaliAttachmentKind;
  imageCount: number | null;
  mixedContent: boolean;
  nativeTextQuality: DocumentConfidence;
  ocrPages: number[];
  pageCount: number;
  requiresOcr: boolean;
  scannedPageCount: number;
  tableLikelihood: DocumentConfidence;
  textLayerPresent: boolean;
};

export type DocumentArtifact = {
  citations: DocumentCitation[];
  extractionSummary: string;
  filename: string;
  id: string;
  inspection: DocumentInspection;
  pageCount: number;
  pages: DocumentPage[];
  provenance: {
    kind: "user-provided-document";
    private: true;
  };
  sections: DocumentSection[];
  tables: DocumentTable[];
  type: HassaliAttachmentKind;
  warnings: string[];
};

export type DocumentChunk = {
  citationIds: string[];
  documentId: string;
  id: string;
  pageEnd: number;
  pageStart: number;
  sectionId?: string;
  tableId?: string;
  text: string;
};

export class DocumentProcessingError extends Error {
  code: DocumentFailureCode;
  retryable: boolean;

  constructor(code: DocumentFailureCode, message: string, retryable = false) {
    super(message);
    this.code = code;
    this.retryable = retryable;
  }
}
