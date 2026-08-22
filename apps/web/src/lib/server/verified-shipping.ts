import { createHash } from "node:crypto";
import { normalizeSafeProjectPath } from "@/lib/utils/path";
import {
  createStoredZip,
  prepareProjectExportFiles,
  type ProjectExportFile,
  type ProjectExportMode
} from "@/lib/server/project-export";

export const SHIPPING_MANIFEST_PATH = "HASSALI_SHIPPING_MANIFEST.json";

export type ShippingManifest = {
  artifactId: string;
  canonicalRevision: string;
  createdAt: string;
  files: Array<{
    contentType: string;
    path: string;
    sha256: string;
    sizeBytes: number;
  }>;
  mode: ProjectExportMode;
  packageId: string;
  primaryEntrypoint: string | null;
  projectName: string;
  provenance: "project_canonical";
  schemaVersion: 1;
  verification: {
    packageIntegrity: "verified";
    project: "not_recorded" | "verified";
  };
  warnings: string[];
};

export type VerifiedProjectPackage = {
  files: ProjectExportFile[];
  manifest: ShippingManifest;
  zip: Buffer;
};

function bytes(content: string | Uint8Array) {
  return typeof content === "string" ? Buffer.from(content, "utf8") : Buffer.from(content);
}

function sha256(content: string | Uint8Array) {
  return createHash("sha256").update(content).digest("hex");
}

function contentType(path: string) {
  const extension = path.toLowerCase().split(".").at(-1);
  const types: Record<string, string> = {
    css: "text/css", csv: "text/csv", gif: "image/gif", html: "text/html", jpeg: "image/jpeg", jpg: "image/jpeg",
    js: "text/javascript", json: "application/json", jsx: "text/javascript", md: "text/markdown", png: "image/png",
    py: "text/x-python", svg: "image/svg+xml", ts: "text/typescript", tsx: "text/typescript", txt: "text/plain", webp: "image/webp"
  };
  return types[extension ?? ""] ?? "application/octet-stream";
}

function primaryEntrypoint(mode: ProjectExportMode, files: ProjectExportFile[]) {
  const paths = new Set(files.map((file) => file.path));
  if (mode === "WEBSITE") return paths.has("index.html") ? "index.html" : null;
  for (const candidate of ["src/main.tsx", "src/main.jsx", "app.py", "src/index.ts", "src/index.js"]) {
    if (paths.has(candidate)) return candidate;
  }
  return null;
}

function containsHighConfidenceSecret(file: ProjectExportFile) {
  if (typeof file.content !== "string") return false;
  return /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/.test(file.content);
}

function logicalRevision(files: ProjectExportFile[]) {
  return sha256(files.map((file) => `${file.path}:${sha256(file.content)}`).join("\n"));
}

function parseStoredEntries(zip: Uint8Array) {
  const buffer = Buffer.from(zip);
  const entries = new Map<string, Buffer>();
  let endOffset = -1;
  const earliestEnd = Math.max(0, buffer.length - 65_557);
  for (let offset = buffer.length - 22; offset >= earliestEnd; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      endOffset = offset;
      break;
    }
  }
  if (endOffset < 0) throw new Error("Package integrity failed because the ZIP directory is missing.");
  const entryCount = buffer.readUInt16LE(endOffset + 10);
  const directorySize = buffer.readUInt32LE(endOffset + 12);
  const directoryOffset = buffer.readUInt32LE(endOffset + 16);
  if (entryCount > 2_501 || directoryOffset + directorySize > endOffset) {
    throw new Error("Package integrity failed because the ZIP directory is invalid.");
  }

  let directoryCursor = directoryOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (directoryCursor + 46 > buffer.length || buffer.readUInt32LE(directoryCursor) !== 0x02014b50) {
      throw new Error("Package integrity failed because the ZIP directory is malformed.");
    }
    const compressionMethod = buffer.readUInt16LE(directoryCursor + 10);
    const compressedSize = buffer.readUInt32LE(directoryCursor + 20);
    const uncompressedSize = buffer.readUInt32LE(directoryCursor + 24);
    const nameLength = buffer.readUInt16LE(directoryCursor + 28);
    const extraLength = buffer.readUInt16LE(directoryCursor + 30);
    const commentLength = buffer.readUInt16LE(directoryCursor + 32);
    const externalAttributes = buffer.readUInt32LE(directoryCursor + 38);
    const localHeaderOffset = buffer.readUInt32LE(directoryCursor + 42);
    const name = buffer.subarray(directoryCursor + 46, directoryCursor + 46 + nameLength).toString("utf8");
    const unixMode = externalAttributes >>> 16;
    if (normalizeSafeProjectPath(name) !== name || (unixMode & 0xf000) === 0xa000) {
      throw new Error("Package integrity failed because an unsafe entry was found.");
    }
    if (entries.has(name)) throw new Error(`Package integrity failed because ${name} is duplicated.`);
    if (compressionMethod !== 0) throw new Error("Package integrity only accepts the bounded stored ZIP format.");
    const offset = localHeaderOffset;
    if (offset + 30 > buffer.length || buffer.readUInt32LE(offset) !== 0x04034b50) {
      throw new Error(`Package integrity failed while reading ${name}.`);
    }
    const localNameLength = buffer.readUInt16LE(offset + 26);
    const localExtraLength = buffer.readUInt16LE(offset + 28);
    const localName = buffer.subarray(offset + 30, offset + 30 + localNameLength).toString("utf8");
    const start = offset + 30 + localNameLength + localExtraLength;
    const end = start + compressedSize;
    if (localName !== name || end > buffer.length || compressedSize !== uncompressedSize) {
      throw new Error(`Package integrity failed while reading ${name}.`);
    }
    entries.set(name, buffer.subarray(start, end));
    directoryCursor += 46 + nameLength + extraLength + commentLength;
  }
  if (directoryCursor !== directoryOffset + directorySize) {
    throw new Error("Package integrity failed because the ZIP directory size does not match.");
  }
  return entries;
}

export function verifyProjectPackage(zip: Uint8Array, expected?: ShippingManifest) {
  const entries = parseStoredEntries(zip);
  const manifestBytes = entries.get(SHIPPING_MANIFEST_PATH);
  if (!manifestBytes) throw new Error("Package integrity failed because the shipping manifest is missing.");

  let manifest: ShippingManifest;
  try {
    manifest = JSON.parse(manifestBytes.toString("utf8")) as ShippingManifest;
  } catch {
    throw new Error("Package integrity failed because the shipping manifest is malformed.");
  }
  if (manifest.schemaVersion !== 1 || (expected && manifest.packageId !== expected.packageId)) {
    throw new Error("Package integrity failed because the shipping manifest identity does not match.");
  }

  const expectedPaths = new Set(manifest.files.map((file) => file.path));
  const packagedPaths = [...entries.keys()].filter((path) => path !== SHIPPING_MANIFEST_PATH);
  if (packagedPaths.length !== expectedPaths.size || packagedPaths.some((path) => !expectedPaths.has(path))) {
    throw new Error("Package integrity failed because packaged paths do not match the manifest.");
  }
  for (const file of manifest.files) {
    const content = entries.get(file.path);
    if (!content || content.byteLength !== file.sizeBytes || sha256(content) !== file.sha256) {
      throw new Error(`Package integrity failed because ${file.path} does not match the current project.`);
    }
  }
  return manifest;
}

export function createVerifiedProjectPackage(input: {
  canonicalRevision?: string;
  createdAt?: Date;
  files: ProjectExportFile[];
  mode: ProjectExportMode;
  projectName: string;
  projectVerification?: "not_recorded" | "verified";
  warnings?: string[];
}): VerifiedProjectPackage {
  for (const file of input.files) {
    if (containsHighConfidenceSecret(file)) {
      throw new Error("Download preparation stopped because a private key was detected in the current project.");
    }
  }

  const files = prepareProjectExportFiles(input);
  const hasProjectReadme = input.files.some((file) => /^readme\.md$/i.test(file.path.replace(/\\/g, "/")));
  const canonicalFiles = hasProjectReadme
    ? files
    : files.filter((file) => file.path !== "HASSALI_EXPORT_README.md");
  const canonicalRevision = input.canonicalRevision ?? logicalRevision(canonicalFiles);
  const manifestFiles = files.map((file) => ({
    contentType: contentType(file.path),
    path: file.path,
    sha256: sha256(file.content),
    sizeBytes: bytes(file.content).byteLength
  }));
  const packageId = sha256(JSON.stringify({ canonicalRevision, files: manifestFiles, mode: input.mode })).slice(0, 32);
  const createdAt = input.createdAt ?? new Date();
  const manifest: ShippingManifest = {
    artifactId: `project-${packageId}`,
    canonicalRevision,
    createdAt: createdAt.toISOString(),
    files: manifestFiles,
    mode: input.mode,
    packageId,
    primaryEntrypoint: primaryEntrypoint(input.mode, files),
    projectName: input.projectName,
    provenance: "project_canonical",
    schemaVersion: 1,
    verification: { packageIntegrity: "verified", project: input.projectVerification ?? "not_recorded" },
    warnings: input.warnings ?? []
  };
  const packageFiles = [...files, { content: `${JSON.stringify(manifest, null, 2)}\n`, path: SHIPPING_MANIFEST_PATH }]
    .sort((left, right) => left.path.localeCompare(right.path));
  const zip = createStoredZip(packageFiles, createdAt);
  verifyProjectPackage(zip, manifest);
  return { files: packageFiles, manifest, zip };
}
