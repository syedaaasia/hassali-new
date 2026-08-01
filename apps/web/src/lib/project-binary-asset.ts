const marker = "HASSALI_BINARY_ASSET_V1";
const envelopePattern = /^HASSALI_BINARY_ASSET_V1\nmime:([^\n]+)\nbase64:([A-Za-z0-9+/=]+)$/;

export type ProjectBinaryAsset = {
  base64: string;
  mimeType: string;
};

export function createProjectBinaryAssetEnvelope(input: ProjectBinaryAsset) {
  const mimeType = input.mimeType.trim().toLowerCase();
  const base64 = input.base64.replace(/\s+/g, "");

  if (!/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(mimeType) || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
    throw new Error("Project binary asset metadata is invalid.");
  }

  return `${marker}\nmime:${mimeType}\nbase64:${base64}`;
}

export function parseProjectBinaryAssetEnvelope(content: string): ProjectBinaryAsset | null {
  const match = content.match(envelopePattern);

  return match
    ? {
        base64: match[2],
        mimeType: match[1]
      }
    : null;
}

export function projectFileDataUrl(content: string) {
  const asset = parseProjectBinaryAssetEnvelope(content);
  return asset ? `data:${asset.mimeType};base64,${asset.base64}` : null;
}
