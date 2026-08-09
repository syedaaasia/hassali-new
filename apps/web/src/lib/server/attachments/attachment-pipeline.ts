import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { inflateRawSync, inflateSync } from "node:zlib";
import {
  attachmentLimits,
  type AttachmentFailureCode,
  type HassaliAttachment,
  type HassaliAttachmentKind
} from "@/lib/attachments";
import { isServerOwnedProjectWorkspaceRoot } from "@/lib/server/runtime/workspace-binding";

const codeExtensions = new Set([
  "c", "cs", "css", "go", "html", "java", "js", "jsx", "php", "py", "rs", "scss", "sql", "ts", "tsx", "xml", "yaml", "yml"
]);
const textExtensions = new Set(["md", "markdown", "txt"]);
const dataExtensions = new Set(["csv", "json"]);
const imageMimeByExtension: Record<string, string> = {
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp"
};

type StoredAttachmentMetadata = HassaliAttachment & {
  contentFile: string;
  ownerHash: string;
};

export class AttachmentPipelineError extends Error {
  code: AttachmentFailureCode;
  status: number;

  constructor(code: AttachmentFailureCode, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function ownerHash(ownerId: string) {
  return createHash("sha256").update(ownerId).digest("hex");
}

function extension(name: string) {
  return name.toLowerCase().split(".").pop()?.replace(/[^a-z0-9]/g, "") ?? "";
}

export function safeAttachmentName(name: string) {
  const rawExtension = extension(name).slice(0, 12);
  const stem = name
    .replace(/\.[^.]+$/, "")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 72) || "attachment";
  return rawExtension ? `${stem}.${rawExtension}` : stem;
}

function hasSignature(bytes: Uint8Array, expected: number[]) {
  return expected.every((value, index) => bytes[index] === value);
}

function isProbablyText(bytes: Uint8Array) {
  const sample = bytes.subarray(0, Math.min(bytes.length, 4096));
  if (sample.includes(0)) return false;
  let controls = 0;
  for (const byte of sample) {
    if (byte < 9 || (byte > 13 && byte < 32)) controls += 1;
  }
  return controls / Math.max(1, sample.length) < 0.03;
}

export function classifyAttachment(input: {
  bytes: Uint8Array;
  mimeType: string;
  name: string;
}): { kind: HassaliAttachmentKind; mimeType: string } {
  const ext = extension(input.name);
  const claimedMime = input.mimeType.toLowerCase().split(";")[0].trim();
  const imageMime = imageMimeByExtension[ext];

  if (imageMime) {
    const valid = ext === "png"
      ? hasSignature(input.bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      : ext === "webp"
        ? hasSignature(input.bytes, [0x52, 0x49, 0x46, 0x46]) && String.fromCharCode(...input.bytes.subarray(8, 12)) === "WEBP"
        : hasSignature(input.bytes, [0xff, 0xd8, 0xff]);
    if (!valid || (claimedMime.startsWith("image/") && claimedMime !== imageMime)) {
      throw new AttachmentPipelineError("MIME_MISMATCH", "The image contents do not match its filename or MIME type.");
    }
    return { kind: "image", mimeType: imageMime };
  }

  if (ext === "pdf") {
    if (!hasSignature(input.bytes, [0x25, 0x50, 0x44, 0x46]) || (claimedMime && claimedMime !== "application/pdf" && claimedMime !== "application/octet-stream")) {
      throw new AttachmentPipelineError("MIME_MISMATCH", "The PDF contents do not match its filename or MIME type.");
    }
    return { kind: "pdf", mimeType: "application/pdf" };
  }

  if (ext === "zip") {
    const valid = hasSignature(input.bytes, [0x50, 0x4b, 0x03, 0x04]) || hasSignature(input.bytes, [0x50, 0x4b, 0x05, 0x06]);
    if (!valid || (claimedMime && !["application/zip", "application/x-zip-compressed", "application/octet-stream"].includes(claimedMime))) {
      throw new AttachmentPipelineError("MIME_MISMATCH", "The ZIP contents do not match its filename or MIME type.");
    }
    inspectZipArchive(input.bytes);
    return { kind: "archive", mimeType: "application/zip" };
  }

  const kind: HassaliAttachmentKind = codeExtensions.has(ext)
    ? "code"
    : dataExtensions.has(ext)
      ? "data"
      : textExtensions.has(ext)
        ? "text"
        : "unsupported";

  if (kind === "unsupported") {
    throw new AttachmentPipelineError("UNSUPPORTED_FORMAT", "This file format is not supported by the current attachment reader.");
  }
  if (!isProbablyText(input.bytes)) {
    throw new AttachmentPipelineError("MIME_MISMATCH", "This text-based file contains unsupported binary data.");
  }
  return {
    kind,
    mimeType: claimedMime && claimedMime !== "application/octet-stream" ? claimedMime : "text/plain"
  };
}

function attachmentDirectory(workspaceRoot: string, attachmentId: string) {
  return path.resolve(workspaceRoot, ".hassali", "attachments", attachmentId);
}

function metadataPath(workspaceRoot: string, attachmentId: string) {
  return path.resolve(attachmentDirectory(workspaceRoot, attachmentId), "metadata.json");
}

function contentPath(workspaceRoot: string, attachmentId: string) {
  return path.resolve(attachmentDirectory(workspaceRoot, attachmentId), "content.bin");
}

function publicMetadata(metadata: StoredAttachmentMetadata): HassaliAttachment {
  const { contentFile, ownerHash: storedOwnerHash, ...attachment } = metadata;
  void contentFile;
  void storedOwnerHash;
  return attachment;
}

export async function storeAttachment(input: {
  bytes: Uint8Array;
  conversationId: string;
  mimeType: string;
  name: string;
  ownerId: string;
  projectId: string;
  storageScope: "conversation" | "project";
  workspaceRoot: string;
}) {
  if (!(await isServerOwnedProjectWorkspaceRoot(input.workspaceRoot))) {
    throw new AttachmentPipelineError("UPLOAD_FAILED", "Attachment storage requires an owned project workspace.", 500);
  }
  if (input.bytes.byteLength === 0) {
    throw new AttachmentPipelineError("UPLOAD_FAILED", "The selected file is empty.");
  }
  if (input.bytes.byteLength > attachmentLimits.individualFileBytes) {
    throw new AttachmentPipelineError("FILE_TOO_LARGE", `Files are limited to ${attachmentLimits.individualFileBytes / 1024 / 1024} MB each.`);
  }
  const classification = classifyAttachment(input);
  const id = randomUUID();
  const directory = attachmentDirectory(input.workspaceRoot, id);
  const metadata: StoredAttachmentMetadata = {
    analysisCapabilities: classification.kind === "image"
      ? ["vision", "visible_text"]
      : classification.kind === "archive"
        ? ["archive_structure", "bounded_text_entries"]
        : classification.kind === "pdf"
          ? ["pdf_text", "ocr_if_available"]
          : ["text_extraction"],
    contentFile: "content.bin",
    conversationId: input.conversationId.slice(0, 160),
    createdAt: new Date().toISOString(),
    extractedTextAvailable: classification.kind !== "image",
    id,
    kind: classification.kind,
    mimeType: classification.mimeType,
    originalName: input.name.slice(0, 255),
    ownerHash: ownerHash(input.ownerId),
    previewAvailable: classification.kind === "image",
    projectId: input.projectId,
    safeName: safeAttachmentName(input.name),
    sizeBytes: input.bytes.byteLength,
    status: "ready",
    storageScope: input.storageScope
  };
  await mkdir(path.dirname(directory), { recursive: true });
  await mkdir(directory, { recursive: false });
  await writeFile(contentPath(input.workspaceRoot, id), input.bytes, { flag: "wx" });
  await writeFile(metadataPath(input.workspaceRoot, id), JSON.stringify(metadata), { encoding: "utf8", flag: "wx" });
  return publicMetadata(metadata);
}

export async function loadStoredAttachment(input: {
  attachmentId: string;
  ownerId: string;
  projectId: string;
  workspaceRoot: string;
}) {
  if (!/^[0-9a-f-]{36}$/i.test(input.attachmentId) || !(await isServerOwnedProjectWorkspaceRoot(input.workspaceRoot))) {
    throw new AttachmentPipelineError("UPLOAD_FAILED", "Attachment reference is invalid.", 404);
  }
  const raw = await readFile(metadataPath(input.workspaceRoot, input.attachmentId), "utf8").catch(() => null);
  if (!raw) throw new AttachmentPipelineError("UPLOAD_FAILED", "Attachment was not found.", 404);
  const metadata = JSON.parse(raw) as StoredAttachmentMetadata;
  if (metadata.ownerHash !== ownerHash(input.ownerId) || metadata.projectId !== input.projectId || metadata.id !== input.attachmentId) {
    throw new AttachmentPipelineError("UPLOAD_FAILED", "Attachment does not belong to this project.", 403);
  }
  const target = contentPath(input.workspaceRoot, input.attachmentId);
  const info = await lstat(target).catch(() => null);
  if (!info?.isFile() || info.isSymbolicLink() || info.size !== metadata.sizeBytes || info.size > attachmentLimits.individualFileBytes) {
    throw new AttachmentPipelineError("UPLOAD_FAILED", "Attachment storage verification failed.", 409);
  }
  return {
    bytes: new Uint8Array(await readFile(target)),
    metadata: publicMetadata(metadata)
  };
}

export async function removeStoredAttachment(input: {
  attachmentId: string;
  ownerId: string;
  projectId: string;
  workspaceRoot: string;
}) {
  await loadStoredAttachment(input);
  await rm(attachmentDirectory(input.workspaceRoot, input.attachmentId), { force: true, recursive: true });
}

function decodePdfLiteral(value: string) {
  return value
    .replace(/\\([()\\])/g, "$1")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\[0-7]{1,3}/g, (entry) => String.fromCharCode(Number.parseInt(entry.slice(1), 8)));
}

export function extractPdfText(bytes: Uint8Array) {
  if (bytes.byteLength > attachmentLimits.individualFileBytes) {
    throw new AttachmentPipelineError("FILE_TOO_LARGE", "The PDF exceeds the bounded reader limit.");
  }
  const source = Buffer.from(bytes).toString("latin1");
  const chunks = [source];
  for (const match of source.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    const raw = Buffer.from(match[1], "latin1");
    try {
      chunks.push(inflateSync(raw).toString("latin1"));
    } catch {
      // Unsupported stream compression is skipped; no text is invented.
    }
  }
  const textFragments: string[] = [];
  for (const chunk of chunks) {
    for (const match of chunk.matchAll(/\(([^)]*)\)\s*Tj/g)) {
      textFragments.push(decodePdfLiteral(match[1]));
    }
    for (const arrayMatch of chunk.matchAll(/\[([\s\S]*?)\]\s*TJ/g)) {
      for (const match of arrayMatch[1].matchAll(/\(([^)]*)\)/g)) {
        textFragments.push(decodePdfLiteral(match[1]));
      }
    }
  }
  const text = textFragments.join(" ").replace(/\s+/g, " ").trim();
  if (!text) {
    throw new AttachmentPipelineError("PDF_OCR_UNAVAILABLE", "No usable embedded text was found in this PDF. Scanned PDF OCR is not configured.");
  }
  return text.slice(0, attachmentLimits.extractedTextBytes);
}

type ZipEntry = {
  compressedSize: number;
  compressionMethod: number;
  externalAttributes: number;
  localHeaderOffset: number;
  name: string;
  uncompressedSize: number;
};

function unsafeArchivePath(name: string) {
  const normalized = name.replace(/\\/g, "/");
  return !normalized || normalized.startsWith("/") || /^[a-z]:/i.test(normalized) || normalized.split("/").some((part) => part === "..");
}

export function inspectZipArchive(bytes: Uint8Array) {
  const buffer = Buffer.from(bytes);
  const entries: ZipEntry[] = [];
  let offset = 0;
  let expandedBytes = 0;
  while (offset + 46 <= buffer.length) {
    const signature = buffer.readUInt32LE(offset);
    if (signature !== 0x02014b50) {
      offset += 1;
      continue;
    }
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    const entry: ZipEntry = {
      compressedSize: buffer.readUInt32LE(offset + 20),
      compressionMethod: buffer.readUInt16LE(offset + 10),
      externalAttributes: buffer.readUInt32LE(offset + 38),
      localHeaderOffset: buffer.readUInt32LE(offset + 42),
      name,
      uncompressedSize: buffer.readUInt32LE(offset + 24)
    };
    const unixMode = entry.externalAttributes >>> 16;
    if (unsafeArchivePath(name) || (unixMode & 0xf000) === 0xa000) {
      throw new AttachmentPipelineError("ARCHIVE_UNSAFE", `Unsafe ZIP entry rejected: ${name.slice(0, 120)}`);
    }
    entries.push(entry);
    expandedBytes += entry.uncompressedSize;
    if (entries.length > attachmentLimits.archiveEntryCount || expandedBytes > attachmentLimits.archiveExpandedBytes) {
      throw new AttachmentPipelineError("ARCHIVE_TOO_LARGE", "The ZIP exceeds the bounded entry or expanded-size limit.");
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  if (entries.length === 0 && buffer.length > 22) {
    throw new AttachmentPipelineError("ARCHIVE_UNSAFE", "The ZIP directory could not be read safely.");
  }
  return { entries, expandedBytes };
}

function readZipEntry(bytes: Uint8Array, entry: ZipEntry) {
  const buffer = Buffer.from(bytes);
  const offset = entry.localHeaderOffset;
  if (offset + 30 > buffer.length || buffer.readUInt32LE(offset) !== 0x04034b50) return null;
  const nameLength = buffer.readUInt16LE(offset + 26);
  const extraLength = buffer.readUInt16LE(offset + 28);
  const start = offset + 30 + nameLength + extraLength;
  const compressed = buffer.subarray(start, start + entry.compressedSize);
  try {
    if (entry.compressionMethod === 0) return compressed;
    if (entry.compressionMethod === 8) return inflateRawSync(compressed);
  } catch {
    return null;
  }
  return null;
}

export function extractAttachmentEvidence(input: {
  bytes: Uint8Array;
  metadata: HassaliAttachment;
}) {
  if (input.metadata.kind === "image") return null;
  if (input.metadata.kind === "pdf") {
    return `PDF ${input.metadata.safeName}:\n${extractPdfText(input.bytes)}`;
  }
  if (input.metadata.kind === "archive") {
    const archive = inspectZipArchive(input.bytes);
    const textEntries = archive.entries
      .filter((entry) => !entry.name.endsWith("/") && (codeExtensions.has(extension(entry.name)) || textExtensions.has(extension(entry.name)) || dataExtensions.has(extension(entry.name))))
      .slice(0, 20)
      .flatMap((entry) => {
        const content = readZipEntry(input.bytes, entry);
        return content && isProbablyText(content)
          ? [`${entry.name}:\n${content.toString("utf8").slice(0, 4_000)}`]
          : [];
      });
    return `ZIP ${input.metadata.safeName}: ${archive.entries.length} entries, ${archive.expandedBytes} expanded bytes.\nPaths:\n${archive.entries.slice(0, 80).map((entry) => `- ${entry.name}`).join("\n")}${textEntries.length ? `\nBounded text excerpts:\n${textEntries.join("\n\n")}` : ""}`;
  }
  return `${input.metadata.kind.toUpperCase()} ${input.metadata.safeName}:\n${Buffer.from(input.bytes).toString("utf8").slice(0, attachmentLimits.extractedTextBytes)}`;
}
