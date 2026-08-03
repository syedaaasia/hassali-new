export const attachmentLimits = {
  archiveEntryCount: 200,
  archiveExpandedBytes: 20 * 1024 * 1024,
  extractedTextBytes: 120 * 1024,
  filesPerMessage: 5,
  individualFileBytes: 8 * 1024 * 1024,
  totalMessageBytes: 20 * 1024 * 1024
} as const;

export type HassaliAttachmentKind =
  | "archive"
  | "code"
  | "data"
  | "image"
  | "pdf"
  | "text"
  | "unsupported";

export type HassaliAttachmentStatus =
  | "failed"
  | "processed"
  | "processing"
  | "ready"
  | "removed"
  | "uploading";

export type AttachmentFailureCode =
  | "ARCHIVE_TOO_LARGE"
  | "ARCHIVE_UNSAFE"
  | "DOCUMENT_UNREADABLE"
  | "PDF_OCR_UNAVAILABLE"
  | "FILE_TOO_LARGE"
  | "MIME_MISMATCH"
  | "OCR_UNAVAILABLE"
  | "TOTAL_LIMIT_EXCEEDED"
  | "UNSUPPORTED_FORMAT"
  | "UPLOAD_FAILED"
  | "VISION_ANALYSIS_FAILED"
  | "VISION_CAPABILITY_UNAVAILABLE";

export type HassaliAttachment = {
  analysisCapabilities: string[];
  conversationId: string;
  createdAt: string;
  extractedTextAvailable: boolean;
  id: string;
  kind: HassaliAttachmentKind;
  mimeType: string;
  originalName: string;
  previewAvailable: boolean;
  projectId: string;
  safeName: string;
  sizeBytes: number;
  status: HassaliAttachmentStatus;
  storageScope: "conversation" | "project";
};

export type ComposerAttachment = HassaliAttachment & {
  error?: string;
  errorCode?: AttachmentFailureCode;
  progress: number;
};

export function attachmentKindLabel(kind: HassaliAttachmentKind) {
  if (kind === "archive") return "ZIP";
  if (kind === "code") return "Code";
  if (kind === "data") return "Data";
  if (kind === "image") return "Image";
  if (kind === "pdf") return "PDF";
  if (kind === "text") return "Text";
  return "File";
}

export function shouldRestorePreviousAttachments(prompt: string) {
  return /\b(?:same|previous|earlier|last)\b[\s\S]{0,40}\b(?:attachment|design|file|image|photo|screenshot)\b|\buse it again\b/i.test(prompt);
}
