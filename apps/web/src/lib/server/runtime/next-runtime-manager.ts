import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { buildDevServerRuntime } from "@/lib/server/runtime/dev-server-runtime";
import { createCodeExecutionEnvironment } from "@/lib/server/runtime/code-command-executor";
import { resolveSafeProjectScriptInvocation } from "@/lib/server/runtime/code-repository-inspector";
import {
  isSafeDevelopmentScript,
  waitForOwnedLocalHttp
} from "@/lib/server/runtime/owned-runtime-safety";
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
    existingProcessReused: false,
    framework: "next_app",
    httpStatus: null,
    logs: reasons.map((reason) => `[system] ${reason}`),
    port: null,
    previewUrl: null,
    processStarted: false,
    projectId: input.projectId,
    readinessVerified: false,
    routerKind,
    runtimeId,
    runtimeStatus: "blocked",
    startedAt: null,
    workspaceRoot: input.workspaceRoot
  };
}

function failed(
  input: NextRuntimeStartInput,
  error: string,
  logs: string[] = [],
  routerKind: NextRouterKind = "unknown",
  options?: { httpStatus?: number | null; processStarted?: boolean }
): NextRuntimeOperationResult {
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
    existingProcessReused: false,
    framework: "next_app",
    httpStatus: options?.httpStatus ?? null,
    logs: logs.length ? logs : [`[system] ${error}`],
    port: null,
    previewUrl: null,
    processStarted: options?.processStarted ?? false,
    projectId: input.projectId,
    readinessVerified: false,
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
  } else if (!isSafeDevelopmentScript(devScript, "next")) {
    reasons.push("Next.js runtime only starts a single bounded Next development script.");
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

export async function startNextRuntime(
  input: NextRuntimeStartInput
): Promise<NextRuntimeOperationResult> {
  const validation = await validateNextRuntime(input);

  if (!validation.ok) {
    return blocked(input, validation.reasons, validation.routerKind);
  }

  const existing = getRuntime(input.projectId);
  if (
    (existing?.status === "running" || existing?.status === "starting") &&
    existing.workspaceRoot === input.workspaceRoot &&
    existing.previewUrl
  ) {
    const existingRuntimeId = existing.runtimeId;
    const readiness = await waitForOwnedLocalHttp({
      abortSignal: input.abortSignal,
      isProcessAlive: () => {
        const current = getRuntime(input.projectId);
        return Boolean(
          current &&
          current.runtimeId === existingRuntimeId &&
          (current.status === "running" || current.status === "starting")
        );
      },
      requestTimeoutMs: 800,
      timeoutMs: 2_500,
      url: existing.previewUrl
    });
    if (readiness.ok) {
      const healthy = markRuntimeStatus(input.projectId, "running");
      if (healthy) {
        appendRuntimeLog(input.projectId, "system", `Reused verified Next.js runtime at ${existing.previewUrl}`);
        return {
          ...runtimeRecordToNextPreviewBridge(healthy),
          devServerRuntime: input.devServerRuntime ?? undefined,
          existingProcessReused: true,
          httpStatus: readiness.status,
          logs: runtimeLogLines(getRuntime(input.projectId)),
          processStarted: false,
          readinessVerified: true,
          runtimeStatus: "running"
        };
      }
    }
    if (readiness.outcome === "cancelled") {
      return failed(
        input,
        readiness.error ?? "Next.js runtime reuse validation was cancelled.",
        runtimeLogLines(getRuntime(input.projectId)),
        validation.routerKind,
        { httpStatus: readiness.status, processStarted: false }
      );
    }
    await stopRuntime(input.projectId);
  } else if (existing?.status === "running" || existing?.status === "starting") {
    await stopRuntime(input.projectId);
  }

  const invocation = validation.devScript
    ? resolveSafeProjectScriptInvocation(
        input.workspaceRoot,
        validation.devScript,
        {
          allowHostFallback: false,
          dependencyRoots: [input.workspaceRoot, input.projectRoot ?? input.workspaceRoot]
        }
      )
    : null;
  if (!invocation) {
    return blocked(input, ["Next.js executable is not available in the approved project dependency tree."], validation.routerKind);
  }

  let port: number;

  try {
    port = await findAvailablePort(input.devServerRuntime?.port ?? 3000);
  } catch (error) {
    return failed(input, error instanceof Error ? error.message : "Unable to prepare Next.js runtime.", [], validation.routerKind);
  }

  const previewUrl = `http://127.0.0.1:${port}/`;
  const runtimeId = `next-runtime-${Date.now()}`;
  const child = spawn(
    invocation.command,
    [...invocation.args, "-H", "127.0.0.1", "-p", String(port)],
    {
      cwd: input.workspaceRoot,
      env: createCodeExecutionEnvironment(),
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

  const readiness = await waitForOwnedLocalHttp({
    abortSignal: input.abortSignal,
    isProcessAlive: () => {
      const current = getRuntime(input.projectId);
      return Boolean(
        current &&
        current.runtimeId === runtimeId &&
        (current.status === "running" || current.status === "starting")
      );
    },
    timeoutMs: Math.max(12_000, startupProbeMs),
    url: previewUrl
  });
  if (!readiness.ok) {
    const logs = runtimeLogLines(getRuntime(input.projectId));
    await stopRuntime(input.projectId);
    return failed(
      input,
      readiness.error ?? "Next.js runtime did not become ready.",
      logs,
      validation.routerKind,
      { httpStatus: readiness.status, processStarted: true }
    );
  }
  const current = markRuntimeStatus(input.projectId, "running");
  if (!current) return failed(input, "Next.js runtime registry did not return a running process.", [], validation.routerKind);
  appendRuntimeLog(input.projectId, "system", `Next.js runtime ready at ${previewUrl}`);
  return {
    ...runtimeRecordToNextPreviewBridge(current),
    devServerRuntime: input.devServerRuntime ?? undefined,
    existingProcessReused: false,
    httpStatus: readiness.status,
    logs: runtimeLogLines(getRuntime(input.projectId)),
    processStarted: true,
    readinessVerified: true,
    runtimeStatus: "running"
  };
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
