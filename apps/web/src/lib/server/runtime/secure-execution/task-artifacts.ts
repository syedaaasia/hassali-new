import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const taskRoot = path.join(os.tmpdir(), "hassali-secure-tasks");

export function resolveSecureTaskArtifactBaseRoot() {
  return path.resolve(taskRoot);
}

export async function createSecureTaskArtifacts(prefix: string) {
  await mkdir(taskRoot, { recursive: true });
  const root = await mkdtemp(path.join(taskRoot, `${prefix.replace(/[^a-z0-9-]/gi, "-")}-`));
  let cleaned = false;
  return {
    root,
    async cleanup() {
      if (cleaned) return;
      cleaned = true;
      await rm(root, { recursive: true, force: true });
    }
  };
}

export function isSecureTaskArtifactRoot(value: string) {
  const root = resolveSecureTaskArtifactBaseRoot();
  const target = path.resolve(value);
  const relative = path.relative(root, target);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}
