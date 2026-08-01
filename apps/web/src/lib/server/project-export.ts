import { normalizeSafeProjectPath } from "../utils/path";
import { parseProjectBinaryAssetEnvelope } from "@/lib/project-binary-asset";

export type ProjectExportMode = "CODE" | "WEBSITE";

export type ProjectExportFile = {
  content: string | Uint8Array;
  path: string;
};

const maximumExportFiles = 2_500;
const maximumExportBytes = 25 * 1024 * 1024;
const excludedDirectoryNames = new Set([
  ".git",
  ".hassali",
  ".next",
  ".turbo",
  "build",
  "coverage",
  "dist",
  "logs",
  "node_modules",
  "out",
  "temp",
  "tmp"
]);

function isEnvironmentFile(fileName: string) {
  return fileName === ".env" || (fileName.startsWith(".env.") && fileName !== ".env.example");
}

function isSecretFile(fileName: string) {
  return /^(?:credentials|secrets?)(?:\.|$)/i.test(fileName) ||
    /\.(?:key|p12|pfx|pem)$/i.test(fileName) ||
    /(?:^|[-_.])private[-_.]?key(?:\.|$)/i.test(fileName);
}

export function shouldExcludeProjectExportPath(path: string) {
  const segments = path.split("/");
  const fileName = segments.at(-1)?.toLowerCase() ?? "";

  return segments.some((segment) => excludedDirectoryNames.has(segment.toLowerCase())) ||
    fileName === ".hassali-folder" ||
    fileName.endsWith(".log") ||
    isEnvironmentFile(fileName) ||
    isSecretFile(fileName);
}

function modeEvidence(mode: ProjectExportMode, files: ProjectExportFile[]) {
  const paths = new Set(files.map((file) => file.path.toLowerCase()));
  const contractText = files
    .filter((file) => /(?:^|\/)hassali(?:\.(?:code|website))?\.md$/i.test(file.path))
    .map((file) => typeof file.content === "string" ? file.content.toLowerCase() : "")
    .join("\n");

  if (mode === "WEBSITE") {
    return paths.has("index.html") || /(?:mode|project type)\s*:\s*website/.test(contractText);
  }

  return paths.has("package.json") ||
    paths.has("app.py") ||
    [...paths].some((path) => /^(?:src|app)\/.+\.(?:js|jsx|ts|tsx|py)$/.test(path)) ||
    /(?:mode|project type)\s*:\s*code/.test(contractText);
}

export function prepareProjectExportFiles(input: {
  files: ProjectExportFile[];
  mode: ProjectExportMode;
  projectName: string;
}) {
  const normalizedFiles: ProjectExportFile[] = [];
  let totalBytes = 0;

  for (const file of input.files) {
    const path = normalizeSafeProjectPath(file.path);

    if (!path) {
      throw new Error(`Project export stopped because an unsafe path was found: ${file.path || "unknown"}.`);
    }

    if (shouldExcludeProjectExportPath(path)) continue;

    const binaryAsset = typeof file.content === "string"
      ? parseProjectBinaryAssetEnvelope(file.content)
      : null;
    const content = binaryAsset
      ? new Uint8Array(Buffer.from(binaryAsset.base64, "base64"))
      : typeof file.content === "string"
        ? file.content
        : new Uint8Array(file.content);
    totalBytes += typeof content === "string" ? Buffer.byteLength(content, "utf8") : content.byteLength;
    normalizedFiles.push({ content, path });
  }

  if (normalizedFiles.length === 0) {
    throw new Error("This project has no exportable source files yet.");
  }

  if (normalizedFiles.length > maximumExportFiles || totalBytes > maximumExportBytes) {
    throw new Error("This project is too large for the bounded ZIP exporter. Remove generated caches or export a smaller project.");
  }

  if (!modeEvidence(input.mode, normalizedFiles)) {
    throw new Error(`The selected project does not contain a recognizable ${input.mode} project to export.`);
  }

  if (!normalizedFiles.some((file) => /^readme\.md$/i.test(file.path))) {
    normalizedFiles.push({
      content: `# ${input.projectName}\n\nExported from Hassali.ai.\n\nProject mode: ${input.mode}\n\nThis archive contains approved project source files only. Generated caches, logs, secrets, environment values, and runtime artifacts are excluded. Review the project files for framework-specific run instructions before starting a local runtime.\n`,
      path: "HASSALI_EXPORT_README.md"
    });
  }

  return normalizedFiles.sort((left, right) => left.path.localeCompare(right.path));
}

function crc32(data: Uint8Array) {
  let crc = 0xffffffff;

  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function dosTimestamp(date: Date) {
  const year = Math.max(1980, date.getFullYear());
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = (year - 1980) << 9 | (date.getMonth() + 1) << 5 | date.getDate();

  return { day, time };
}

export function createStoredZip(files: ProjectExportFile[], generatedAt = new Date()) {
  const localParts: Buffer[] = [];
  const directoryParts: Buffer[] = [];
  const { day, time } = dosTimestamp(generatedAt);
  let offset = 0;

  for (const file of files) {
    const name = Buffer.from(file.path, "utf8");
    const content = typeof file.content === "string"
      ? Buffer.from(file.content, "utf8")
      : Buffer.from(file.content);
    const checksum = crc32(content);
    const localHeader = Buffer.alloc(30);

    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(time, 10);
    localHeader.writeUInt16LE(day, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(content.length, 18);
    localHeader.writeUInt32LE(content.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localHeader.writeUInt16LE(0, 28);
    localParts.push(localHeader, name, content);

    const directoryHeader = Buffer.alloc(46);
    directoryHeader.writeUInt32LE(0x02014b50, 0);
    directoryHeader.writeUInt16LE(20, 4);
    directoryHeader.writeUInt16LE(20, 6);
    directoryHeader.writeUInt16LE(0x0800, 8);
    directoryHeader.writeUInt16LE(0, 10);
    directoryHeader.writeUInt16LE(time, 12);
    directoryHeader.writeUInt16LE(day, 14);
    directoryHeader.writeUInt32LE(checksum, 16);
    directoryHeader.writeUInt32LE(content.length, 20);
    directoryHeader.writeUInt32LE(content.length, 24);
    directoryHeader.writeUInt16LE(name.length, 28);
    directoryHeader.writeUInt16LE(0, 30);
    directoryHeader.writeUInt16LE(0, 32);
    directoryHeader.writeUInt16LE(0, 34);
    directoryHeader.writeUInt16LE(0, 36);
    directoryHeader.writeUInt32LE(0, 38);
    directoryHeader.writeUInt32LE(offset, 42);
    directoryParts.push(directoryHeader, name);

    offset += localHeader.length + name.length + content.length;
  }

  const directory = Buffer.concat(directoryParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, directory, end]);
}

export function projectExportFileName(projectName: string, mode: ProjectExportMode) {
  const slug = projectName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "project";

  return `hassali-${mode.toLowerCase()}-${slug}.zip`;
}
