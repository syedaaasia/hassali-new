import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { isServerOwnedProjectWorkspaceRoot } from "./workspace-binding";

const hydrationIgnoredDirectories = new Set([
  ".git",
  ".hassali",
  ".next",
  ".turbo",
  "build",
  "coverage",
  "dist",
  "node_modules"
]);
const snapshotIgnoredDirectories = new Set([
  ".git",
  ".next",
  ".turbo",
  "build",
  "coverage",
  "dist",
  "node_modules"
]);
const generatedArtifactDirectories = [".next", ".turbo", "build", "coverage", "dist"];
const maxFiles = 2_000;

export type OwnedProjectWorkspaceSnapshot = {
  files: Array<{
    content: string;
    path: string;
  }>;
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

type WorkspaceScan = {
  files: string[];
  overflow: boolean;
  symlinks: string[];
};

async function scanWorkspace(
  root: string,
  ignoredDirectories: Set<string>,
  directory = "",
  result: WorkspaceScan = { files: [], overflow: false, symlinks: [] }
): Promise<WorkspaceScan> {
  if (result.files.length + result.symlinks.length >= maxFiles) {
    result.overflow = true;
    return result;
  }
  const entries = await readdir(path.resolve(root, directory), { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (result.files.length + result.symlinks.length >= maxFiles) {
      result.overflow = true;
      break;
    }
    const relative = normalize(path.join(directory, entry.name));
    if (entry.isSymbolicLink()) {
      result.symlinks.push(relative);
    } else if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name.toLowerCase())) {
        await scanWorkspace(root, ignoredDirectories, relative, result);
      }
    } else if (entry.isFile()) {
      result.files.push(relative);
    }
  }
  return result;
}

async function writeSnapshotFiles(snapshot: OwnedProjectWorkspaceSnapshot) {
  for (const file of snapshot.files) {
    const safe = resolveSafe(snapshot.workspaceRoot, file.path);
    if (!safe) throw new Error(`Workspace snapshot contains an unsafe path: ${file.path}`);
    await mkdir(path.dirname(safe.target), { recursive: true });
    await writeFile(safe.target, file.content, "utf8");
  }
}

async function resetOwnedWorkspaceToSnapshot(snapshot: OwnedProjectWorkspaceSnapshot) {
  await rm(snapshot.workspaceRoot, { force: true, recursive: true });
  await mkdir(snapshot.workspaceRoot, { recursive: true });
  await writeSnapshotFiles(snapshot);
}

export async function captureOwnedProjectWorkspaceSnapshot(
  workspaceRoot: string
): Promise<OwnedProjectWorkspaceSnapshot> {
  if (!(await isServerOwnedProjectWorkspaceRoot(workspaceRoot))) {
    throw new Error("Workspace snapshot requires a server-owned project root.");
  }
  const scan = await scanWorkspace(workspaceRoot, snapshotIgnoredDirectories);
  if (scan.overflow) {
    throw new Error(`Workspace snapshot stopped at the ${maxFiles}-file safety limit.`);
  }
  if (scan.symlinks.length > 0) {
    throw new Error(`Workspace snapshot found an unsupported symbolic link: ${scan.symlinks[0]}`);
  }
  const files = await Promise.all(scan.files.map(async (relativePath) => ({
    content: await readFile(path.resolve(workspaceRoot, relativePath), "utf8"),
    path: relativePath
  })));
  return {
    files,
    workspaceRoot: path.resolve(workspaceRoot)
  };
}

export async function restoreOwnedProjectWorkspaceSnapshot(
  snapshot: OwnedProjectWorkspaceSnapshot
) {
  if (!(await isServerOwnedProjectWorkspaceRoot(snapshot.workspaceRoot))) {
    throw new Error("Workspace snapshot restore requires a server-owned project root.");
  }
  const expected = new Map(snapshot.files.map((file) => [normalize(file.path), file.content]));
  const scan = await scanWorkspace(snapshot.workspaceRoot, snapshotIgnoredDirectories);
  if (scan.overflow || scan.symlinks.length > 0) {
    await resetOwnedWorkspaceToSnapshot(snapshot);
    return {
      recoveredByReset: true,
      restored: [
        ...(scan.symlinks.length > 0 ? scan.symlinks.slice(0, 20) : []),
        ...(scan.overflow ? ["<workspace-file-limit-exceeded>"] : [])
      ]
    };
  }
  const restored = new Set<string>();
  for (const relativePath of scan.files) {
    if (expected.has(relativePath)) continue;
    const safe = resolveSafe(snapshot.workspaceRoot, relativePath);
    if (safe) {
      await rm(safe.target, { force: true });
      restored.add(relativePath);
    }
  }
  for (const [relativePath, content] of expected) {
    const safe = resolveSafe(snapshot.workspaceRoot, relativePath);
    if (!safe) throw new Error(`Workspace snapshot contains an unsafe path: ${relativePath}`);
    const current = await readFile(safe.target, "utf8").catch(() => null);
    if (current === content) continue;
    await mkdir(path.dirname(safe.target), { recursive: true });
    await writeFile(safe.target, content, "utf8");
    restored.add(relativePath);
  }
  return {
    recoveredByReset: false,
    restored: [...restored].sort((left, right) => left.localeCompare(right))
  };
}

export async function clearOwnedProjectGeneratedArtifacts(workspaceRoot: string) {
  if (!(await isServerOwnedProjectWorkspaceRoot(workspaceRoot))) {
    throw new Error("Generated artifact cleanup requires a server-owned project root.");
  }
  for (const directory of generatedArtifactDirectories) {
    const target = path.resolve(workspaceRoot, directory);
    const relative = path.relative(path.resolve(workspaceRoot), target);
    if (!relative.startsWith("..") && !path.isAbsolute(relative)) {
      await rm(target, { force: true, recursive: true });
    }
  }
}

export async function synchronizeOwnedProjectWorkspace(input: {
  files: Array<{ content: string; path: string }>;
  workspaceRoot: string;
}) {
  if (!(await isServerOwnedProjectWorkspaceRoot(input.workspaceRoot))) {
    throw new Error("Workspace hydration requires a server-owned project root.");
  }
  if (input.files.length >= maxFiles) {
    throw new Error(`Workspace hydration stopped at the ${maxFiles}-file safety limit.`);
  }
  const canonical = new Map<string, string>();
  for (const file of input.files) {
    const safe = resolveSafe(input.workspaceRoot, file.path);
    if (!safe) throw new Error(`Canonical project contains an unsafe path: ${file.path}`);
    canonical.set(safe.normalized, String(file.content));
  }
  const scan = await scanWorkspace(input.workspaceRoot, hydrationIgnoredDirectories);
  if (scan.overflow) {
    throw new Error(`Workspace hydration stopped at the ${maxFiles}-file safety limit.`);
  }
  if (scan.symlinks.length > 0) {
    throw new Error(`Workspace hydration found an unsupported symbolic link: ${scan.symlinks[0]}`);
  }
  for (const relativePath of scan.files) {
    if (!canonical.has(relativePath)) {
      const safe = resolveSafe(input.workspaceRoot, relativePath);
      if (safe) await rm(safe.target, { force: true });
    }
  }
  let written = 0;
  for (const [relativePath, content] of canonical) {
    const safe = resolveSafe(input.workspaceRoot, relativePath)!;
    const current = await readFile(safe.target, "utf8").catch(() => null);
    if (current === content) continue;
    await mkdir(path.dirname(safe.target), { recursive: true });
    await writeFile(safe.target, content, "utf8");
    written += 1;
  }
  return {
    removed: scan.files.filter((relativePath) => !canonical.has(relativePath)),
    written
  };
}
