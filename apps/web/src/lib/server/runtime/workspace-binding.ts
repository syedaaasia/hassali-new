import { mkdir, stat } from "node:fs/promises";
import { dirname, join, normalize, resolve } from "node:path";

export type WorkspaceBindingStatus = "blocked" | "created" | "ready";

export type WorkspaceBindingResult = {
  baseRoot: string;
  created: boolean;
  projectId: string;
  registryStatus: WorkspaceBindingStatus;
  safeProjectId: string;
  warnings: string[];
  workspaceRoot: string;
};

export type WorkspaceBindingError = {
  error: string;
  registryStatus: "blocked";
  status: 400;
};

const unsafeProjectIdPattern = /[\\/]|(?:^|[.\s])\.\.(?:[.\s]|$)/;

function isInsidePath(target: string, base: string) {
  const normalizedBase = normalize(base);
  const normalizedTarget = normalize(target);

  return normalizedTarget === normalizedBase || normalizedTarget.startsWith(`${normalizedBase}\\`) || normalizedTarget.startsWith(`${normalizedBase}/`);
}

async function exists(path: string) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function findWorkspaceRoot(startDirectory = process.cwd()) {
  let current = resolve(startDirectory);

  while (true) {
    if (await exists(join(current, ".hassali"))) {
      return current;
    }

    if (await exists(join(current, "pnpm-workspace.yaml")) || await exists(join(current, "turbo.json"))) {
      return current;
    }

    const parent = dirname(current);

    if (parent === current) {
      return resolve(startDirectory);
    }

    current = parent;
  }
}

export function sanitizeProjectWorkspaceId(projectId: string) {
  const trimmed = projectId.trim();

  if (!trimmed || unsafeProjectIdPattern.test(trimmed)) {
    return null;
  }

  const safeProjectId = trimmed
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return safeProjectId || null;
}

export async function resolveWorkspaceBaseRoot() {
  const repoRoot = await findWorkspaceRoot();

  return resolve(repoRoot, ".hassali", "workspaces");
}

export async function isServerOwnedProjectWorkspaceRoot(workspaceRoot: string) {
  const baseRoot = await resolveWorkspaceBaseRoot();

  return isInsidePath(resolve(workspaceRoot), baseRoot);
}

export async function bindProjectWorkspace(projectId: string): Promise<WorkspaceBindingResult | WorkspaceBindingError> {
  const safeProjectId = sanitizeProjectWorkspaceId(projectId);

  if (!safeProjectId) {
    return {
      error: "projectId is not safe for workspace binding.",
      registryStatus: "blocked",
      status: 400
    };
  }

  const baseRoot = await resolveWorkspaceBaseRoot();
  const workspaceRoot = resolve(baseRoot, safeProjectId);

  if (!isInsidePath(workspaceRoot, baseRoot)) {
    return {
      error: "Resolved workspaceRoot escaped the Hassali workspace base.",
      registryStatus: "blocked",
      status: 400
    };
  }

  const existed = await exists(workspaceRoot);

  await mkdir(workspaceRoot, { recursive: true });

  return {
    baseRoot,
    created: !existed,
    projectId,
    registryStatus: existed ? "ready" : "created",
    safeProjectId,
    warnings: [],
    workspaceRoot
  };
}
