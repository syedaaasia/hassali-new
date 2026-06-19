import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { deriveManifest, type PreviewManifest, type VfsFile } from "@/lib/preview-manifest";

type CanonicalEvent = {
  id: string;
  type: string;
  data: Record<string, unknown>;
  timestamp: number;
};

function randomId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function canonicalDir(workspaceRoot: string) {
  const dir = join(workspaceRoot, ".hassali");

  await mkdir(dir, { recursive: true });

  return dir;
}

export async function recordCanonicalEvent(
  workspaceRoot: string,
  type: string,
  data: Record<string, unknown>
) {
  const event: CanonicalEvent = {
    id: randomId(),
    type,
    data,
    timestamp: Date.now()
  };
  const dir = await canonicalDir(workspaceRoot);

  await appendFile(join(dir, "events.jsonl"), `${JSON.stringify(event)}\n`, "utf8");

  return event;
}

export async function persistCommittedFiles(
  workspaceRoot: string,
  committed: Map<string, VfsFile>
) {
  const dir = await canonicalDir(workspaceRoot);
  const files = [...committed.values()].sort((left, right) => left.path.localeCompare(right.path));

  await writeFile(
    join(dir, "committed-files.json"),
    JSON.stringify({ files, updatedAt: Date.now() }, null, 2),
    "utf8"
  );
}

export async function persistPreviewManifest(
  workspaceRoot: string,
  manifest: PreviewManifest
) {
  const dir = await canonicalDir(workspaceRoot);

  await writeFile(
    join(dir, "preview-manifest.json"),
    JSON.stringify({ manifest, updatedAt: Date.now() }, null, 2),
    "utf8"
  );
}

export async function persistCanonicalApprovalState(input: {
  files: Array<{ content: string; path: string }>;
  projectId: string;
  proposalId: string;
  workspaceRoot: string;
}) {
  const committed = new Map<string, VfsFile>();

  for (const file of input.files) {
    committed.set(file.path, {
      content: file.content,
      lastModified: Date.now(),
      path: file.path
    });
  }

  const manifest = deriveManifest(committed);

  await persistCommittedFiles(input.workspaceRoot, committed);
  await persistPreviewManifest(input.workspaceRoot, manifest);
  await recordCanonicalEvent(input.workspaceRoot, "PREVIEW_MANIFEST_UPDATED", {
    manifest,
    projectId: input.projectId,
    proposalId: input.proposalId
  });

  return manifest;
}
