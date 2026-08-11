import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createSecureTaskArtifacts } from "../secure-execution/task-artifacts";
import type { ChangeLedger, ChangeLedgerEntry } from "./verification-types";

const maxCheckpointFiles = 40;
const maxCheckpointBytes = 2 * 1024 * 1024;

function normalize(value: string) {
  return value.replace(/\\/g, "/").replace(/^\.\/+/, "");
}

function resolveSafe(root: string, relativePath: string) {
  const normalized = normalize(relativePath);
  if (!normalized || normalized.startsWith("/") || /^[a-z]:/i.test(normalized) || normalized.split("/").some((part) => !part || part === "..")) return null;
  const resolvedRoot = path.resolve(root);
  const target = path.resolve(resolvedRoot, normalized);
  const relative = path.relative(resolvedRoot, target);
  return relative.startsWith("..") || path.isAbsolute(relative) ? null : { normalized, target };
}

function fingerprint(content: string | null) {
  return content === null ? null : createHash("sha256").update(content).digest("hex");
}

export function fingerprintFileContents(files: Record<string, string | null>) {
  const hash = createHash("sha256");
  for (const filePath of Object.keys(files).sort()) {
    hash.update(`${normalize(filePath)}\0${files[filePath] === null ? "<absent>" : files[filePath]}\0`);
  }
  return hash.digest("hex");
}

export function buildChangeLedger(input: {
  after: Record<string, string | null>;
  baseline: Record<string, string | null>;
  baselineRepositoryFingerprint: string;
  explicitUnexpectedPaths?: string[];
  plannedPaths: string[];
  preExistingDirtyPaths?: string[];
  taskId: string;
}): ChangeLedger {
  const explicitUnexpected = new Set((input.explicitUnexpectedPaths ?? []).map(normalize));
  const paths = [...new Set([...Object.keys(input.baseline), ...Object.keys(input.after), ...explicitUnexpected])].sort();
  const planned = new Set(input.plannedPaths.map(normalize));
  const dirty = new Set((input.preExistingDirtyPaths ?? []).map(normalize));
  const entries: ChangeLedgerEntry[] = paths.map((filePath) => {
    const normalized = normalize(filePath);
    const before = input.baseline[filePath] ?? null;
    const after = input.after[filePath] ?? null;
    const beforeHash = fingerprint(before);
    const afterHash = fingerprint(after);
    const operation: ChangeLedgerEntry["operation"] = beforeHash === afterHash
      ? "unchanged" : before === null ? "create" : after === null ? "delete" : "modify";
    const isPlanned = planned.has(normalized);
    const ownership: ChangeLedgerEntry["ownership"] = explicitUnexpected.has(normalized)
      ? "unexpected" : dirty.has(normalized)
      ? "pre-existing-user" : operation === "unchanged" ? "unknown" : isPlanned ? "hassali" : "unexpected";
    return { afterFingerprint: afterHash, beforeFingerprint: beforeHash, existedBefore: before !== null, operation, ownership, path: normalized, planned: isPlanned };
  });
  return {
    baselineRepositoryFingerprint: input.baselineRepositoryFingerprint,
    entries,
    taskId: input.taskId,
    unexpectedPaths: entries.filter((entry) => entry.ownership === "unexpected").map((entry) => entry.path)
  };
}

type CheckpointFile = {
  afterFingerprint: string | null;
  beforeContent: string | null;
  path: string;
};

export type TaskCheckpoint = {
  cleanup(): Promise<void>;
  files: CheckpointFile[];
  id: string;
  manifestPath: string;
  workspaceRoot: string;
};

async function currentContent(root: string, relativePath: string) {
  const safe = resolveSafe(root, relativePath);
  if (!safe) throw new Error(`Checkpoint path is outside the task workspace: ${relativePath}`);
  if (/(?:^|\/)(?:\.git|node_modules|\.next)(?:\/|$)|(?:^|\/)\.env(?:\.|$)/i.test(safe.normalized)) {
    throw new Error(`Checkpoint path is sensitive or generated: ${relativePath}`);
  }
  let cursor = path.resolve(root);
  for (const part of safe.normalized.split("/").slice(0, -1)) {
    cursor = path.join(cursor, part);
    const parent = await lstat(cursor).catch(() => null);
    if (parent?.isSymbolicLink()) throw new Error(`Checkpoint path crosses a symbolic link: ${relativePath}`);
    if (parent && !parent.isDirectory()) throw new Error(`Checkpoint parent is not a directory: ${relativePath}`);
  }
  const stats = await lstat(safe.target).catch(() => null);
  if (!stats) return null;
  if (stats.isSymbolicLink() || !stats.isFile()) throw new Error(`Checkpoint target is not a regular file: ${relativePath}`);
  return readFile(safe.target, "utf8");
}

export async function createTaskCheckpoint(input: {
  beforeContents: Record<string, string | null>;
  plannedPaths: string[];
  taskId: string;
  workspaceRoot: string;
}): Promise<TaskCheckpoint> {
  const paths = [...new Set(input.plannedPaths.map(normalize))];
  if (paths.length > maxCheckpointFiles) throw new Error(`Checkpoint exceeds the ${maxCheckpointFiles}-file task bound.`);
  const files: CheckpointFile[] = [];
  let bytes = 0;
  for (const filePath of paths) {
    const beforeContent = Object.prototype.hasOwnProperty.call(input.beforeContents, filePath)
      ? input.beforeContents[filePath] ?? null : await currentContent(input.workspaceRoot, filePath);
    const afterContent = await currentContent(input.workspaceRoot, filePath);
    bytes += Buffer.byteLength(beforeContent ?? "", "utf8");
    if (bytes > maxCheckpointBytes) throw new Error("Checkpoint exceeds the bounded content limit.");
    files.push({ afterFingerprint: fingerprint(afterContent), beforeContent, path: filePath });
  }
  const artifacts = await createSecureTaskArtifacts("verification-checkpoint");
  const id = `checkpoint-${randomUUID()}`;
  const manifestPath = path.join(artifacts.root, `${id}.json`);
  await writeFile(manifestPath, JSON.stringify({ files, id, taskId: input.taskId }), { encoding: "utf8", mode: 0o600 });
  return { cleanup: artifacts.cleanup, files, id, manifestPath, workspaceRoot: path.resolve(input.workspaceRoot) };
}

export async function recoverTaskCheckpoint(checkpoint: TaskCheckpoint) {
  const conflicts: string[] = [];
  const restored: string[] = [];
  for (const file of checkpoint.files) {
    const safe = resolveSafe(checkpoint.workspaceRoot, file.path);
    if (!safe) {
      conflicts.push(file.path);
      continue;
    }
    const current = await currentContent(checkpoint.workspaceRoot, file.path).catch(() => undefined);
    if (typeof current === "undefined" || fingerprint(current) !== file.afterFingerprint) {
      conflicts.push(file.path);
      continue;
    }
    if (file.beforeContent === null) {
      await rm(safe.target, { force: true });
    } else {
      await mkdir(path.dirname(safe.target), { recursive: true });
      await writeFile(safe.target, file.beforeContent, "utf8");
    }
    restored.push(file.path);
  }
  return {
    conflicts,
    state: conflicts.length ? restored.length ? "partial" as const : "conflict" as const : "recovered" as const,
    restored
  };
}

export function repositoryEvidenceIsStale(expectedFingerprint: string, observedFingerprint: string) {
  return expectedFingerprint !== observedFingerprint;
}
