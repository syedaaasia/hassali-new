import { VisualIntelligenceError, visualProcessingLimits } from "./visual-contract";

function uint32be(bytes: Uint8Array, offset: number) {
  return ((bytes[offset] ?? 0) * 0x1000000) + ((bytes[offset + 1] ?? 0) << 16) + ((bytes[offset + 2] ?? 0) << 8) + (bytes[offset + 3] ?? 0);
}

function uint16(bytes: Uint8Array, offset: number, little: boolean) {
  return little
    ? (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8)
    : ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
}

function uint32(bytes: Uint8Array, offset: number, little: boolean) {
  if (!little) return uint32be(bytes, offset);
  return (bytes[offset] ?? 0) + ((bytes[offset + 1] ?? 0) << 8) + ((bytes[offset + 2] ?? 0) << 16) + ((bytes[offset + 3] ?? 0) * 0x1000000);
}

function jpegOrientation(bytes: Uint8Array, dataOffset: number, dataLength: number): 0 | 90 | 180 | 270 | null {
  if (dataLength < 14 || String.fromCharCode(...bytes.subarray(dataOffset, dataOffset + 6)) !== "Exif\0\0") return null;
  const tiff = dataOffset + 6;
  const endian = String.fromCharCode(bytes[tiff] ?? 0, bytes[tiff + 1] ?? 0);
  const little = endian === "II";
  if (!little && endian !== "MM") return null;
  const directory = tiff + uint32(bytes, tiff + 4, little);
  if (directory + 2 > dataOffset + dataLength) return null;
  const entries = Math.min(uint16(bytes, directory, little), 128);
  for (let index = 0; index < entries; index += 1) {
    const offset = directory + 2 + index * 12;
    if (offset + 12 > dataOffset + dataLength) break;
    if (uint16(bytes, offset, little) !== 0x0112) continue;
    const value = uint16(bytes, offset + 8, little);
    return value === 3 ? 180 : value === 6 ? 90 : value === 8 ? 270 : value === 1 ? 0 : null;
  }
  return null;
}

export function inspectVisualImage(bytes: Uint8Array, mimeType: string) {
  let width: number | null = null;
  let height: number | null = null;
  let orientation: 0 | 90 | 180 | 270 | null = null;

  if (mimeType === "image/png") {
    if (bytes.length < 24 || String.fromCharCode(...bytes.subarray(1, 4)) !== "PNG") throw new VisualIntelligenceError("image-malformed", "The image header is malformed.");
    width = uint32be(bytes, 16);
    height = uint32be(bytes, 20);
  } else if (mimeType === "image/jpeg") {
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new VisualIntelligenceError("image-malformed", "The image header is malformed.");
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset] !== 0xff) { offset += 1; continue; }
      const marker = bytes[offset + 1] ?? 0;
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0x00 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { offset += 2; continue; }
      const length = ((bytes[offset + 2] ?? 0) << 8) | (bytes[offset + 3] ?? 0);
      if (length < 2 || offset + 2 + length > bytes.length) throw new VisualIntelligenceError("image-malformed", "The JPEG segment table is malformed.");
      if (marker === 0xe1) orientation = jpegOrientation(bytes, offset + 4, length - 2) ?? orientation;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        height = ((bytes[offset + 5] ?? 0) << 8) | (bytes[offset + 6] ?? 0);
        width = ((bytes[offset + 7] ?? 0) << 8) | (bytes[offset + 8] ?? 0);
        break;
      }
      offset += 2 + length;
    }
  } else if (mimeType === "image/webp") {
    if (bytes.length < 30 || String.fromCharCode(...bytes.subarray(0, 4)) !== "RIFF" || String.fromCharCode(...bytes.subarray(8, 12)) !== "WEBP") {
      throw new VisualIntelligenceError("image-malformed", "The image header is malformed.");
    }
    const kind = String.fromCharCode(...bytes.subarray(12, 16));
    if (kind === "VP8X") {
      width = 1 + (bytes[24] ?? 0) + ((bytes[25] ?? 0) << 8) + ((bytes[26] ?? 0) << 16);
      height = 1 + (bytes[27] ?? 0) + ((bytes[28] ?? 0) << 8) + ((bytes[29] ?? 0) << 16);
    } else if (kind === "VP8L" && bytes.length >= 25) {
      width = 1 + (bytes[21] ?? 0) + (((bytes[22] ?? 0) & 0x3f) << 8);
      height = 1 + ((bytes[22] ?? 0) >> 6) + ((bytes[23] ?? 0) << 2) + (((bytes[24] ?? 0) & 0x0f) << 10);
    } else if (kind === "VP8 " && bytes.length >= 30) {
      width = ((bytes[26] ?? 0) | ((bytes[27] ?? 0) << 8)) & 0x3fff;
      height = ((bytes[28] ?? 0) | ((bytes[29] ?? 0) << 8)) & 0x3fff;
    }
  }

  if (!width || !height || width < 1 || height < 1) throw new VisualIntelligenceError("image-malformed", "The image dimensions could not be read safely.");
  if (width > visualProcessingLimits.maxImageDimension || height > visualProcessingLimits.maxImageDimension || width * height > visualProcessingLimits.maxImagePixels) {
    throw new VisualIntelligenceError("image-too-large", "The image dimensions exceed Hassali's safe visual-analysis limit.");
  }
  return { height, orientation, width };
}

function joinBytes(parts: Uint8Array[]) {
  const output = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  parts.forEach((part) => { output.set(part, offset); offset += part.length; });
  return output;
}

export function sanitizeVisualBytes(bytes: Uint8Array, mimeType: string) {
  if (mimeType === "image/jpeg") {
    const parts = [bytes.subarray(0, 2)];
    let offset = 2;
    while (offset < bytes.length) {
      if (bytes[offset] !== 0xff || offset + 1 >= bytes.length) { parts.push(bytes.subarray(offset)); break; }
      const marker = bytes[offset + 1] ?? 0;
      if (marker === 0xda) { parts.push(bytes.subarray(offset)); break; }
      if (marker === 0xd9) { parts.push(bytes.subarray(offset, offset + 2)); break; }
      const length = ((bytes[offset + 2] ?? 0) << 8) | (bytes[offset + 3] ?? 0);
      if (length < 2 || offset + 2 + length > bytes.length) return bytes;
      if (marker !== 0xe1 && marker !== 0xed && marker !== 0xfe) parts.push(bytes.subarray(offset, offset + 2 + length));
      offset += 2 + length;
    }
    return joinBytes(parts);
  }
  if (mimeType === "image/png") {
    if (bytes.length < 12) return bytes;
    const parts = [bytes.subarray(0, 8)];
    let offset = 8;
    while (offset + 12 <= bytes.length) {
      const length = uint32be(bytes, offset);
      const end = offset + 12 + length;
      if (end > bytes.length) return bytes;
      const kind = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
      if (!["eXIf", "iTXt", "tEXt", "tIME", "zTXt"].includes(kind)) parts.push(bytes.subarray(offset, end));
      offset = end;
      if (kind === "IEND") break;
    }
    return joinBytes(parts);
  }
  if (mimeType === "image/webp" && bytes.length >= 12) {
    const chunks: Uint8Array[] = [];
    let offset = 12;
    while (offset + 8 <= bytes.length) {
      const kind = String.fromCharCode(...bytes.subarray(offset, offset + 4));
      const length = uint32(bytes, offset + 4, true);
      const end = offset + 8 + length + (length % 2);
      if (end > bytes.length) return bytes;
      if (kind !== "EXIF" && kind !== "XMP ") chunks.push(bytes.subarray(offset, end));
      offset = end;
    }
    const body = joinBytes(chunks);
    const header = bytes.slice(0, 12);
    const riffSize = body.length + 4;
    header[4] = riffSize & 0xff;
    header[5] = (riffSize >>> 8) & 0xff;
    header[6] = (riffSize >>> 16) & 0xff;
    header[7] = (riffSize >>> 24) & 0xff;
    return joinBytes([header, body]);
  }
  return bytes;
}
