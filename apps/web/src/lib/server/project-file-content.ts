import path from "node:path";
import {
  createProjectBinaryAssetEnvelope,
  parseProjectBinaryAssetEnvelope
} from "@/lib/project-binary-asset";

const binaryMimeByExtension: Record<string, string> = {
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp"
};

export function materializeProjectFileContent(content: string) {
  const asset = parseProjectBinaryAssetEnvelope(content);
  return asset ? Buffer.from(asset.base64, "base64") : Buffer.from(content, "utf8");
}

export function canonicalizeWorkspaceFileContent(filePath: string, content: Uint8Array) {
  const mimeType = binaryMimeByExtension[path.extname(filePath).toLowerCase()];
  return mimeType
    ? createProjectBinaryAssetEnvelope({
        base64: Buffer.from(content).toString("base64"),
        mimeType
      })
    : Buffer.from(content).toString("utf8");
}
