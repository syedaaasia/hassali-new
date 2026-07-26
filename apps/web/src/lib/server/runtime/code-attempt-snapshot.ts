import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CodeRepairChange } from "./code-execution-types";

type FileBefore = {
  content: string;
  existed: boolean;
  path: string;
};

type FileAfter = {
  hash: string;
  path: string;
};

export type CodeAttemptSnapshot = {
  after: FileAfter[];
  before: FileBefore[];
  id: string;
  workspaceRoot: string;
};

function normalize(value: string) {
  return value.replace(/\\/g, "/").replace(/^\.\/+/, "");
}

function resolveSafe(root: string, relativePath: string) {
  const normalized = normalize(relativePath);
  if (!normalized || normalized.startsWith("/") || /^[a-z]:/i.test(normalized)) return null;
  if (normalized.split("/").some((part) => !part || part === "..")) return null;
  const resolvedRoot = path.resolve(root);
  const target = path.resolve(resolvedRoot, normalized);
  const relative = path.relative(resolvedRoot, target);
  return !relative.startsWith("..") && !path.isAbsolute(relative)
    ? { normalized, target }
    : null;
}

function hash(content: string) {
  return createHash("sha256").update(content).digest("hex");
}

async function capture(root: string, relativePath: string): Promise<FileBefore> {
  const safe = resolveSafe(root, relativePath);
  if (!safe) throw new Error(`Repair path is outside the approved workspace: ${relativePath}`);
  try {
    const file = await stat(safe.target);
    if (!file.isFile()) throw new Error(`Repair target is not a file: ${relativePath}`);
    return {
      content: await readFile(safe.target, "utf8"),
      existed: true,
      path: safe.normalized
    };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Repair target is not")) throw error;
    return { content: "", existed: false, path: safe.normalized };
  }
}

async function atomicWrite(root: string, change: CodeRepairChange) {
  const safe = resolveSafe(root, change.path);
  if (!safe) throw new Error(`Repair path is outside the approved workspace: ${change.path}`);
  await mkdir(path.dirname(safe.target), { recursive: true });
  const temporary = `${safe.target}.hassali-${randomUUID()}.tmp`;
  await writeFile(temporary, change.content, "utf8");
  try {
    await rename(temporary, safe.target);
  } catch {
    // Windows cannot atomically rename over an existing file. Keep the
    // existing target in place unless the replacement write itself succeeds.
    await writeFile(safe.target, change.content, "utf8");
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined);
  }
}

export async function applyCodeRepairAttempt(input: {
  changes: CodeRepairChange[];
  expectedContents?: Record<string, string>;
  workspaceRoot: string;
}): Promise<CodeAttemptSnapshot> {
  const uniqueChanges = [...new Map(
    input.changes.map((change) => [normalize(change.path), { ...change, path: normalize(change.path) }])
  ).values()];
  const before: FileBefore[] = [];
  const after: FileAfter[] = [];
  try {
    for (const change of uniqueChanges) before.push(await capture(input.workspaceRoot, change.path));
    for (const file of before) {
      const expected = input.expectedContents?.[file.path];
      if (typeof expected === "string" && (!file.existed || file.content !== expected)) {
        throw new Error(`Repair target changed after diagnosis: ${file.path}`);
      }
    }
    for (const change of uniqueChanges) {
      await atomicWrite(input.workspaceRoot, change);
      after.push({ hash: hash(change.content), path: change.path });
    }
  } catch (error) {
    for (const file of [...before].reverse()) {
      const safe = resolveSafe(input.workspaceRoot, file.path);
      if (!safe) continue;
      if (file.existed) await atomicWrite(input.workspaceRoot, { content: file.content, path: file.path });
      else await rm(safe.target, { force: true });
    }
    throw error;
  }
  return {
    after,
    before,
    id: `repair-snapshot-${randomUUID()}`,
    workspaceRoot: path.resolve(input.workspaceRoot)
  };
}

export async function rollbackCodeRepairAttempt(snapshot: CodeAttemptSnapshot) {
  const conflicts: string[] = [];
  const restored: string[] = [];
  for (const file of [...snapshot.before].reverse()) {
    const after = snapshot.after.find((candidate) => candidate.path === file.path);
    const safe = resolveSafe(snapshot.workspaceRoot, file.path);
    if (!safe || !after) continue;
    const current = await readFile(safe.target, "utf8").catch(() => null);
    if (current === null || hash(current) !== after.hash) {
      conflicts.push(file.path);
      continue;
    }
    if (file.existed) await atomicWrite(snapshot.workspaceRoot, { content: file.content, path: file.path });
    else await rm(safe.target, { force: true });
    restored.push(file.path);
  }
  return {
    conflicts,
    ok: conflicts.length === 0,
    restored
  };
}
