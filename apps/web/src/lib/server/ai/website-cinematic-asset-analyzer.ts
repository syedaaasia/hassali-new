export type WebsiteCinematicImageFormat = "avif" | "jpeg" | "jpg" | "png" | "webp";

export type WebsiteCinematicAssetInput = {
  content?: string | null;
  height?: number | null;
  path: string;
  sizeBytes?: number | null;
  width?: number | null;
};

export type WebsiteCinematicFrame = {
  estimatedDecodedBytes: number;
  format: WebsiteCinematicImageFormat;
  frameNumber: number;
  height: number | null;
  path: string;
  width: number | null;
};

export type WebsiteCinematicSequenceCandidate = {
  directory: string;
  duplicateNumbers: number[];
  estimatedDecodedBytes: number;
  firstFrame: string;
  format: WebsiteCinematicImageFormat | "mixed";
  frameCount: number;
  frames: WebsiteCinematicFrame[];
  height: number | null;
  lastFrame: string;
  missingNumbers: number[];
  orderingConfidence: "high" | "low" | "medium";
  representativeFrames: string[];
  sequenceId: string;
  sharedStem: string;
  warnings: string[];
  width: number | null;
};

export type WebsiteCinematicAssetAnalysis = {
  archives: string[];
  sequences: WebsiteCinematicSequenceCandidate[];
  unrelatedImages: string[];
  unsupportedImages: string[];
  warnings: string[];
};

const supportedExtensionPattern = /\.(avif|jpe?g|png|webp)$/i;
const archiveExtensionPattern = /\.zip$/i;

function normalizePath(value: string) {
  const path = value.trim().replace(/\\/g, "/").replace(/^\.\//, "");
  if (!path || path.startsWith("/") || path.split("/").some((segment) => segment === "..")) return null;
  return path.replace(/\/{2,}/g, "/");
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "sequence";
}

function naturalParts(value: string) {
  return value.toLowerCase().match(/\d+|\D+/g) ?? [value.toLowerCase()];
}

export function naturalCompareFramePaths(left: string, right: string) {
  const leftParts = naturalParts(left);
  const rightParts = naturalParts(right);
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const a = leftParts[index];
    const b = rightParts[index];
    if (a === undefined) return -1;
    if (b === undefined) return 1;
    if (a === b) continue;
    const aNumber = /^\d+$/.test(a) ? Number(a) : null;
    const bNumber = /^\d+$/.test(b) ? Number(b) : null;
    if (aNumber !== null && bNumber !== null && aNumber !== bNumber) return aNumber - bNumber;
    const lexical = a.localeCompare(b, "en", { sensitivity: "base" });
    if (lexical !== 0) return lexical;
  }

  return left.localeCompare(right, "en", { sensitivity: "variant" });
}

function bytesFromContent(content: string | null | undefined) {
  if (!content) return null;
  const match = content.trim().match(/^data:image\/[a-z0-9.+-]+;base64,([a-z0-9+/=\s]+)$/i);
  if (!match) return null;
  try {
    return new Uint8Array(Buffer.from(match[1].replace(/\s+/g, ""), "base64"));
  } catch {
    return null;
  }
}

function readUInt24LE(bytes: Uint8Array, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function pngDimensions(bytes: Uint8Array) {
  if (bytes.length < 24 || bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { height: view.getUint32(20), width: view.getUint32(16) };
}

function jpegDimensions(bytes: Uint8Array) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const sofMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let offset = 2;
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    const marker = bytes[offset + 1];
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x00 || marker === 0xff) { offset += 1; continue; }
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (length < 2 || offset + length + 2 > bytes.length) break;
    if (sofMarkers.has(marker)) {
      return {
        height: (bytes[offset + 5] << 8) | bytes[offset + 6],
        width: (bytes[offset + 7] << 8) | bytes[offset + 8]
      };
    }
    offset += length + 2;
  }
  return null;
}

function webpDimensions(bytes: Uint8Array) {
  if (bytes.length < 30 || String.fromCharCode(...bytes.slice(0, 4)) !== "RIFF" || String.fromCharCode(...bytes.slice(8, 12)) !== "WEBP") return null;
  const chunk = String.fromCharCode(...bytes.slice(12, 16));
  if (chunk === "VP8X") return { width: readUInt24LE(bytes, 24) + 1, height: readUInt24LE(bytes, 27) + 1 };
  if (chunk === "VP8L" && bytes[20] === 0x2f) {
    return {
      width: 1 + (((bytes[22] & 0x3f) << 8) | bytes[21]),
      height: 1 + (((bytes[24] & 0x0f) << 10) | (bytes[23] << 2) | ((bytes[22] & 0xc0) >> 6))
    };
  }
  for (let index = 20; index + 6 < bytes.length; index += 1) {
    if (bytes[index] === 0x9d && bytes[index + 1] === 0x01 && bytes[index + 2] === 0x2a) {
      return {
        width: (bytes[index + 3] | (bytes[index + 4] << 8)) & 0x3fff,
        height: (bytes[index + 5] | (bytes[index + 6] << 8)) & 0x3fff
      };
    }
  }
  return null;
}

function dimensionsFromContent(format: WebsiteCinematicImageFormat, content: string | null | undefined) {
  const bytes = bytesFromContent(content);
  if (!bytes) return { bytes: null, dimensions: null };
  const dimensions = format === "png"
    ? pngDimensions(bytes)
    : format === "jpg" || format === "jpeg"
      ? jpegDimensions(bytes)
      : format === "webp"
        ? webpDimensions(bytes)
        : null;
  return { bytes, dimensions };
}

function samples(frames: WebsiteCinematicFrame[]) {
  if (!frames.length) return [];
  const last = frames.length - 1;
  const indexes = [0, Math.round(last * 0.25), Math.round(last * 0.5), Math.round(last * 0.75), last];
  return Array.from(new Set(indexes)).map((index) => frames[index].path);
}

export function analyzeWebsiteCinematicAssets(assets: WebsiteCinematicAssetInput[]): WebsiteCinematicAssetAnalysis {
  const archives: string[] = [];
  const unsupportedImages: string[] = [];
  const ungroupedImages: string[] = [];
  const groups = new Map<string, { directory: string; sharedStem: string; frames: WebsiteCinematicFrame[] }>();

  for (const asset of assets) {
    const path = normalizePath(asset.path);
    if (!path) { unsupportedImages.push(asset.path); continue; }
    if (archiveExtensionPattern.test(path)) { archives.push(path); continue; }
    const extension = path.match(supportedExtensionPattern)?.[1]?.toLowerCase() as WebsiteCinematicImageFormat | undefined;
    if (!extension) continue;
    const fileName = path.split("/").at(-1) ?? path;
    const directory = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
    const match = fileName.match(/^(.*?)(\d+)\.(avif|jpe?g|png|webp)$/i);
    if (!match) { ungroupedImages.push(path); continue; }
    const sharedStem = match[1].replace(/[-_.\s]+$/g, "") || "frame";
    const frameNumber = Number(match[2]);
    if (!Number.isSafeInteger(frameNumber)) { unsupportedImages.push(path); continue; }
    const measured = dimensionsFromContent(extension, asset.content);
    const width = asset.width ?? measured.dimensions?.width ?? null;
    const height = asset.height ?? measured.dimensions?.height ?? null;
    const sourceBytes = asset.sizeBytes ?? measured.bytes?.byteLength ?? null;
    const estimatedDecodedBytes = width && height ? width * height * 4 : sourceBytes ? Math.max(sourceBytes * 4, 256 * 1024) : 8 * 1024 * 1024;
    const key = `${directory.toLowerCase()}|${sharedStem.toLowerCase()}`;
    const group = groups.get(key) ?? { directory, frames: [], sharedStem };
    group.frames.push({ estimatedDecodedBytes, format: extension, frameNumber, height, path, width });
    groups.set(key, group);
  }

  const sequences: WebsiteCinematicSequenceCandidate[] = [];
  for (const group of groups.values()) {
    if (group.frames.length < 2) { ungroupedImages.push(...group.frames.map((frame) => frame.path)); continue; }
    const frames = [...group.frames].sort((left, right) => left.frameNumber - right.frameNumber || naturalCompareFramePaths(left.path, right.path));
    const counts = new Map<number, number>();
    frames.forEach((frame) => counts.set(frame.frameNumber, (counts.get(frame.frameNumber) ?? 0) + 1));
    const duplicateNumbers = [...counts.entries()].filter(([, count]) => count > 1).map(([number]) => number).sort((a, b) => a - b);
    const firstNumber = frames[0].frameNumber;
    const lastNumber = frames.at(-1)?.frameNumber ?? firstNumber;
    const missingNumbers: number[] = [];
    if (lastNumber - firstNumber <= 10_000) {
      for (let number = firstNumber; number <= lastNumber && missingNumbers.length < 256; number += 1) {
        if (!counts.has(number)) missingNumbers.push(number);
      }
    }
    const knownDimensions = frames.filter((frame) => frame.width && frame.height);
    const dimensionKeys = new Set(knownDimensions.map((frame) => `${frame.width}x${frame.height}`));
    const formats = new Set(frames.map((frame) => frame.format));
    const gapRatio = missingNumbers.length / Math.max(1, lastNumber - firstNumber + 1);
    const orderingConfidence = duplicateNumbers.length || gapRatio > 0.2
      ? "low" as const
      : frames.length >= 4 && gapRatio <= 0.05 && formats.size === 1 && dimensionKeys.size <= 1
        ? "high" as const
        : "medium" as const;
    const warnings = [
      ...(missingNumbers.length ? [`Sequence has ${missingNumbers.length} missing frame number(s).`] : []),
      ...(duplicateNumbers.length ? [`Sequence has duplicate frame number(s): ${duplicateNumbers.join(", ")}.`] : []),
      ...(dimensionKeys.size > 1 ? ["Sequence contains mixed image dimensions."] : []),
      ...(formats.size > 1 ? ["Sequence contains mixed image formats."] : []),
      ...(frames.length < 4 ? ["Sequence is short and may behave better as a static gallery."] : [])
    ];
    sequences.push({
      directory: group.directory,
      duplicateNumbers,
      estimatedDecodedBytes: frames.reduce((total, frame) => total + frame.estimatedDecodedBytes, 0),
      firstFrame: frames[0].path,
      format: formats.size === 1 ? frames[0].format : "mixed",
      frameCount: frames.length,
      frames,
      height: knownDimensions[0]?.height ?? null,
      lastFrame: frames.at(-1)?.path ?? frames[0].path,
      missingNumbers,
      orderingConfidence,
      representativeFrames: samples(frames),
      sequenceId: slug(`${group.directory}-${group.sharedStem}`),
      sharedStem: group.sharedStem,
      warnings,
      width: knownDimensions[0]?.width ?? null
    });
  }

  sequences.sort((left, right) => naturalCompareFramePaths(left.sequenceId, right.sequenceId));
  const warnings = [
    ...(archives.length ? ["ZIP archives require extraction by the upload layer before WEBSITE can inspect their frames."] : []),
    ...sequences.flatMap((sequence) => sequence.warnings.map((warning) => `${sequence.sequenceId}: ${warning}`))
  ];
  return {
    archives: archives.sort(naturalCompareFramePaths),
    sequences,
    unrelatedImages: ungroupedImages.sort(naturalCompareFramePaths),
    unsupportedImages: unsupportedImages.sort(naturalCompareFramePaths),
    warnings
  };
}
