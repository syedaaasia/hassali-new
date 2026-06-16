import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { buildDevServerRuntime } from "@/lib/server/runtime/dev-server-runtime";
import { recordRuntimeStreamEvent } from "@/lib/server/runtime/runtime-event-buffer";
import {
  appendRuntimeLog,
  getRuntime,
  markRuntimeStatus,
  runtimeLogLines,
  startRuntime,
  stopRuntime
} from "@/lib/server/runtime/next-process-registry";
import { runtimeRecordToNextPreviewBridge } from "@/lib/server/runtime/next-preview-bridge";
import { isServerOwnedProjectWorkspaceRoot } from "@/lib/server/runtime/workspace-binding";
import type {
  NextRouterKind,
  NextRuntimeOperationResult,
  NextRuntimeStartInput,
  NextRuntimeValidation
} from "@/lib/server/runtime/next-runtime-types";

const startupProbeMs = 1800;

function blocked(input: NextRuntimeStartInput, reasons: string[], routerKind: NextRouterKind = "unknown"): NextRuntimeOperationResult {
  const runtimeId = `next-runtime-blocked-${Date.now()}`;

  recordRuntimeStreamEvent({
    error: reasons[0] ?? "Next.js runtime startup was blocked.",
    framework: "next",
    message: reasons[0] ?? "Next.js runtime startup was blocked.",
    projectId: input.projectId,
    runtimeId,
    status: "blocked",
    stream: "system",
    type: "error"
  });

  return {
    devServerRuntime: input.devServerRuntime ?? undefined,
    error: reasons[0] ?? "Next.js runtime startup was blocked.",
    framework: "next_app",
    logs: reasons.map((reason) => `[system] ${reason}`),
    port: null,
    previewUrl: null,
    projectId: input.projectId,
    routerKind,
    runtimeId,
    runtimeStatus: "blocked",
    startedAt: null,
    workspaceRoot: input.workspaceRoot
  };
}

function failed(input: NextRuntimeStartInput, error: string, logs: string[] = [], routerKind: NextRouterKind = "unknown"): NextRuntimeOperationResult {
  const runtimeId = `next-runtime-error-${Date.now()}`;

  recordRuntimeStreamEvent({
    error,
    framework: "next",
    message: error,
    projectId: input.projectId,
    runtimeId,
    status: "error",
    stream: "system",
    type: "error"
  });

  return {
    devServerRuntime: input.devServerRuntime ?? undefined,
    error,
    framework: "next_app",
    logs: logs.length ? logs : [`[system] ${error}`],
    port: null,
    previewUrl: null,
    projectId: input.projectId,
    routerKind,
    runtimeId,
    runtimeStatus: "error",
    startedAt: null,
    workspaceRoot: input.workspaceRoot
  };
}

async function fileExists(path: string) {
  try {
    const file = await stat(path);
    return file.isFile();
  } catch {
    return false;
  }
}

async function detectRouterKind(workspaceRoot: string): Promise<NextRouterKind> {
  const hasAppPage = await fileExists(resolve(workspaceRoot, "app", "page.tsx")) ||
    await fileExists(resolve(workspaceRoot, "app", "page.jsx")) ||
    await fileExists(resolve(workspaceRoot, "app", "page.ts")) ||
    await fileExists(resolve(workspaceRoot, "app", "page.js"));
  const hasAppLayout = await fileExists(resolve(workspaceRoot, "app", "layout.tsx")) ||
    await fileExists(resolve(workspaceRoot, "app", "layout.jsx")) ||
    await fileExists(resolve(workspaceRoot, "app", "layout.ts")) ||
    await fileExists(resolve(workspaceRoot, "app", "layout.js"));
  const hasPagesIndex = await fileExists(resolve(workspaceRoot, "pages", "index.tsx")) ||
    await fileExists(resolve(workspaceRoot, "pages", "index.jsx")) ||
    await fileExists(resolve(workspaceRoot, "pages", "index.ts")) ||
    await fileExists(resolve(workspaceRoot, "pages", "index.js"));
  const hasAppRouter = hasAppPage || hasAppLayout;

  if (hasAppRouter && hasPagesIndex) return "mixed";
  if (hasAppRouter) return "app_router";
  if (hasPagesIndex) return "pages_router";

  return "unknown";
}

function hasNextDependency(packageJson: {
  dependencies?: Record<string, unknown>;
  devDependencies?: Record<string, unknown>;
}) {
  return typeof packageJson.dependencies?.next === "string" ||
    typeof packageJson.devDependencies?.next === "string";
}

async function validateNextRuntime(input: NextRuntimeStartInput): Promise<NextRuntimeValidation> {
  const reasons: string[] = [];
  const routerKind = await detectRouterKind(input.workspaceRoot);

  if (input.productMode !== "CODE") {
    reasons.push("Next.js runtime execution is only enabled for CODE mode.");
  }

  if (input.workerType !== "local") {
    reasons.push("Next.js runtime execution is only enabled for the local approved runner.");
  }

  if (!(await isServerOwnedProjectWorkspaceRoot(input.workspaceRoot))) {
    reasons.push("Next.js runtime workspace must be a server-owned Hassali project workspace.");
  }

  const devServerRuntime = input.devServerRuntime ??
    buildDevServerRuntime({ generatedFiles: {} });

  if (devServerRuntime.framework !== "next_app") {
    reasons.push("Next.js runtime execution requires a detected Next.js project.");
  }

  const packageJsonPath = resolve(input.workspaceRoot, "package.json");
  const packageJsonExists = await fileExists(packageJsonPath);

  if (!packageJsonExists) {
    reasons.push("Next.js runtime requires package.json in the project workspace.");
    return { devScript: null, hasNextDependency: false, ok: false, reasons, routerKind };
  }

  let devScript: string | null = null;
  let nextDependency = false;

  try {
    const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as {
      dependencies?: Record<string, unknown>;
      devDependencies?: Record<string, unknown>;
      scripts?: Record<string, unknown>;
    };
    devScript = typeof packageJson.scripts?.dev === "string" ? packageJson.scripts.dev : null;
    nextDependency = hasNextDependency(packageJson);
  } catch {
    reasons.push("Next.js runtime could not parse package.json.");
  }

  if (!devScript) {
    reasons.push("Next.js runtime requires an approved package.json scripts.dev entry.");
  } else if (!/\bnext\b/i.test(devScript)) {
    reasons.push("Next.js runtime only starts scripts.dev when it runs Next.js.");
  }

  if (!nextDependency) {
    reasons.push("Next.js runtime requires a next dependency in package.json.");
  }

  if (routerKind === "unknown") {
    reasons.push("Next.js runtime could not identify App Router or Pages Router entry files.");
  }

  return {
    devScript,
    hasNextDependency: nextDependency,
    ok: reasons.length === 0,
    reasons,
    routerKind
  };
}

async function findAvailablePort(startPort = 3000) {
  for (let port = startPort; port < startPort + 100; port += 1) {
    const available = await new Promise<boolean>((resolveAvailable) => {
      const server = createServer();

      server.once("error", () => resolveAvailable(false));
      server.listen(port, "127.0.0.1", () => {
        server.close(() => resolveAvailable(true));
      });
    });

    if (available) {
      return port;
    }
  }

  throw new Error("Unable to allocate a local Next.js preview port.");
}

function npmExecutable() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

export async function startNextRuntime(
  input: NextRuntimeStartInput
): Promise<NextRuntimeOperationResult> {
  const validation = await validateNextRuntime(input);

  if (!validation.ok) {
    return blocked(input, validation.reasons, validation.routerKind);
  }

  let port: number;

  try {
    const existing = getRuntime(input.projectId);

    if (existing?.status === "running" || existing?.status === "starting") {
      await stopRuntime(input.projectId);
    }

    port = await findAvailablePort(input.devServerRuntime?.port ?? 3000);
  } catch (error) {
    return failed(input, error instanceof Error ? error.message : "Unable to prepare Next.js runtime.", [], validation.routerKind);
  }

  const previewUrl = `http://127.0.0.1:${port}/`;
  const runtimeId = `next-runtime-${Date.now()}`;
  const child = spawn(
    npmExecutable(),
    ["run", "dev", "--", "-H", "127.0.0.1", "-p", String(port)],
    {
      cwd: input.workspaceRoot,
      env: {
        ...process.env,
        BROWSER: "none"
      },
      shell: false,
      stdio: "pipe",
      windowsHide: true
    }
  );

  startRuntime({
    child,
    port,
    previewUrl,
    projectId: input.projectId,
    routerKind: validation.routerKind,
    runtimeId,
    workspaceRoot: input.workspaceRoot
  });

  child.stdout.on("data", (chunk) => appendRuntimeLog(input.projectId, "stdout", String(chunk)));
  child.stderr.on("data", (chunk) => appendRuntimeLog(input.projectId, "stderr", String(chunk)));
  child.once("error", (error) => {
    appendRuntimeLog(input.projectId, "system", `Next.js runtime error: ${error.message}`);
    markRuntimeStatus(input.projectId, "error", error.message);
  });
  child.once("exit", (code) => {
    const current = getRuntime(input.projectId);

    appendRuntimeLog(input.projectId, "system", `Next.js runtime exited with code ${code ?? "unknown"}.`);

    if (current?.runtimeId === runtimeId) {
      markRuntimeStatus(input.projectId, code === 0 ? "stopped" : "error", code === 0 ? null : `Next.js exited with code ${code ?? "unknown"}.`);
    }
  });

  return await new Promise<NextRuntimeOperationResult>((resolveStart) => {
    let resolved = false;

    const finish = (result: NextRuntimeOperationResult) => {
      if (resolved) return;
      resolved = true;
      resolveStart(result);
    };

    child.once("error", (error) => {
      finish(failed(input, error.message, runtimeLogLines(getRuntime(input.projectId)), validation.routerKind));
    });
    child.once("exit", (code) => {
      const logs = runtimeLogLines(getRuntime(input.projectId));
      finish(failed(input, `Next.js runtime exited before startup completed with code ${code ?? "unknown"}.`, logs, validation.routerKind));
    });

    setTimeout(() => {
      const current = markRuntimeStatus(input.projectId, "running");

      if (!current) {
        finish(failed(input, "Next.js runtime registry did not return a running process.", [], validation.routerKind));
        return;
      }

      appendRuntimeLog(input.projectId, "system", `Next.js runtime ready at ${previewUrl}`);
      finish({
        ...runtimeRecordToNextPreviewBridge(current),
        devServerRuntime: input.devServerRuntime ?? undefined,
        logs: runtimeLogLines(getRuntime(input.projectId)),
        runtimeStatus: "running"
      });
    }, startupProbeMs);
  });
}

export async function stopNextRuntime(projectId: string) {
  const stopped = await stopRuntime(projectId);

  return stopped ? runtimeRecordToNextPreviewBridge(stopped) : null;
}

export async function restartNextRuntime(input: NextRuntimeStartInput) {
  await stopRuntime(input.projectId);

  return startNextRuntime(input);
}

export function getNextRuntime(projectId: string) {
  const runtime = getRuntime(projectId);

  return runtime ? runtimeRecordToNextPreviewBridge(runtime) : null;
}
