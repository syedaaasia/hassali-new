const marker = "HASSALI_BINARY_ASSET_V1";
const maximumDecodedBytes = 8 * 1024 * 1024;
const maximumEncodedBytes = Math.ceil(maximumDecodedBytes / 3) * 4;

export type ProjectBinaryAsset = {
  base64: string;
  mimeType: string;
};

export class ProjectBinaryAssetError extends Error {
  readonly code = "ASSET_PROCESSING_FAILED";
}

function validMimeType(value: string) {
  const slash = value.indexOf("/");
  if (slash <= 0 || slash === value.length - 1 || value.indexOf("/", slash + 1) !== -1) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (index === slash) continue;
    const code = value.charCodeAt(index);
    const valid = code >= 97 && code <= 122 || code >= 48 && code <= 57 || code === 43 || code === 45 || code === 46;
    if (!valid) return false;
  }
  return true;
}

function normalizeAndValidateBase64(value: string) {
  if (typeof value !== "string" || value.length === 0 || value.length > maximumEncodedBytes) {
    throw new ProjectBinaryAssetError("Project binary asset payload is empty or exceeds the supported size.");
  }

  let hasWhitespace = false;
  let padding = 0;
  let significantLength = 0;

  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    const whitespace = code === 9 || code === 10 || code === 13 || code === 32;
    if (whitespace) {
      hasWhitespace = true;
      continue;
    }

    const alphabet = code >= 65 && code <= 90 || code >= 97 && code <= 122 || code >= 48 && code <= 57 || code === 43 || code === 47;
    if (code === 61) {
      padding += 1;
      if (padding > 2) throw new ProjectBinaryAssetError("Project binary asset Base64 padding is invalid.");
    } else {
      if (!alphabet || padding > 0) throw new ProjectBinaryAssetError("Project binary asset Base64 alphabet is invalid.");
    }
    significantLength += 1;
  }

  if (significantLength === 0 || significantLength > maximumEncodedBytes || significantLength % 4 !== 0) {
    throw new ProjectBinaryAssetError("Project binary asset Base64 length is invalid.");
  }
  const decodedLength = significantLength / 4 * 3 - padding;
  if (decodedLength <= 0 || decodedLength > maximumDecodedBytes) {
    throw new ProjectBinaryAssetError("Project binary asset decoded size is invalid.");
  }

  if (!hasWhitespace) return value;
  const parts: string[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code !== 9 && code !== 10 && code !== 13 && code !== 32) parts.push(value[index] ?? "");
  }
  return parts.join("");
}

export function createProjectBinaryAssetEnvelope(input: ProjectBinaryAsset) {
  const mimeType = input.mimeType.trim().toLowerCase();
  const base64 = normalizeAndValidateBase64(input.base64);

  if (!validMimeType(mimeType)) {
    throw new ProjectBinaryAssetError("Project binary asset MIME metadata is invalid.");
  }

  return `${marker}\nmime:${mimeType}\nbase64:${base64}`;
}

export function parseProjectBinaryAssetEnvelope(content: string): ProjectBinaryAsset | null {
  const mimePrefix = `${marker}\nmime:`;
  if (!content.startsWith(mimePrefix)) return null;
  const base64Marker = "\nbase64:";
  const base64Offset = content.indexOf(base64Marker, mimePrefix.length);
  if (base64Offset < 0 || content.indexOf("\n", base64Offset + base64Marker.length) !== -1) return null;
  const mimeType = content.slice(mimePrefix.length, base64Offset).trim().toLowerCase();
  if (!validMimeType(mimeType)) return null;
  try {
    return {
      base64: normalizeAndValidateBase64(content.slice(base64Offset + base64Marker.length)),
      mimeType
    };
  } catch {
    return null;
  }
}

export function projectFileDataUrl(content: string) {
  const asset = parseProjectBinaryAssetEnvelope(content);
  return asset ? `data:${asset.mimeType};base64,${asset.base64}` : null;
}
