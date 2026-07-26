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
import { isServerOwnedProjectWorkspaceRoot } from "@/lib/server/runtime/workspace-binding";
import {
  appendRuntimeLog,
  getRuntime,
  markRuntimeStatus,
  runtimeLogLines,
  startRuntime,
  stopRuntime
} from "@/lib/server/runtime/vite-process-registry";
import { runtimeRecordToPreviewBridge } from "@/lib/server/runtime/vite-preview-bridge";
import type {
  ViteRuntimeOperationResult,
  ViteRuntimeStartInput,
  ViteRuntimeValidation
} from "@/lib/server/runtime/vite-runtime-types";

const startupTimeoutMs = 12_000;

function blocked(input: ViteRuntimeStartInput, reasons: string[]): ViteRuntimeOperationResult {
  const runtimeId = `vite-runtime-blocked-${Date.now()}`;

  recordRuntimeStreamEvent({
    error: reasons[0] ?? "Vite runtime startup was blocked.",
    framework: "vite",
    message: reasons[0] ?? "Vite runtime startup was blocked.",
    projectId: input.projectId,
    runtimeId,
    status: "blocked",
    stream: "system",
    type: "error"
  });

  return {
    devServerRuntime: input.devServerRuntime ?? undefined,
    error: reasons[0] ?? "Vite runtime startup was blocked.",
    logs: reasons.map((reason) => `[system] ${reason}`),
    port: null,
    previewUrl: null,
    projectId: input.projectId,
    runtimeId,
    runtimeStatus: "blocked",
    startedAt: null,
    workspaceRoot: input.workspaceRoot
  };
}

function failed(input: ViteRuntimeStartInput, error: string, logs: string[] = []): ViteRuntimeOperationResult {
  const runtimeId = `vite-runtime-error-${Date.now()}`;

  recordRuntimeStreamEvent({
    error,
    framework: "vite",
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
    logs: logs.length ? logs : [`[system] ${error}`],
    port: null,
    previewUrl: null,
    projectId: input.projectId,
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

async function validateViteRuntime(input: ViteRuntimeStartInput): Promise<ViteRuntimeValidation> {
  const reasons: string[] = [];

  if (input.productMode !== "CODE") {
    reasons.push("Vite runtime execution is only enabled for CODE mode.");
  }

  if (input.workerType !== "local") {
    reasons.push("Vite runtime execution is only enabled for the local approved runner.");
  }

  if (!(await isServerOwnedProjectWorkspaceRoot(input.workspaceRoot))) {
    reasons.push("Vite runtime workspace must be a server-owned Hassali project workspace.");
  }

  const devServerRuntime = input.devServerRuntime ??
    buildDevServerRuntime({ generatedFiles: {} });

  if (devServerRuntime.framework !== "react_vite") {
    reasons.push("Vite runtime execution requires a React/Vite project.");
  }

  if (devServerRuntime.runtimeStatus !== "blocked_until_explicit_enablement") {
    reasons.push("Vite runtime policy must explicitly identify a blocked dev-server plan before startup.");
  }

  const packageJsonPath = resolve(input.workspaceRoot, "package.json");
  const packageJsonExists = await fileExists(packageJsonPath);

  if (!packageJsonExists) {
    reasons.push("Vite runtime requires package.json in the project workspace.");
    return { devScript: null, ok: false, reasons };
  }

  let devScript: string | null = null;

  try {
    const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as {
      scripts?: Record<string, unknown>;
    };
    devScript = typeof packageJson.scripts?.dev === "string" ? packageJson.scripts.dev : null;
  } catch {
    reasons.push("Vite runtime could not parse package.json.");
  }

  if (!devScript) {
    reasons.push("Vite runtime requires an approved package.json scripts.dev entry.");
  } else if (!isSafeDevelopmentScript(devScript, "vite")) {
    reasons.push("Vite runtime only starts a single bounded Vite development script.");
  }

  return {
    devScript,
    ok: reasons.length === 0,
    reasons
  };
}

async function findAvailablePort(startPort = 5173) {
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

  throw new Error("Unable to allocate a local Vite preview port.");
}

export async function startViteRuntime(
  input: ViteRuntimeStartInput
): Promise<ViteRuntimeOperationResult> {
  const validation = await validateViteRuntime(input);

  if (!validation.ok) {
    return blocked(input, validation.reasons);
  }

  let port: number;

  try {
    const existing = getRuntime(input.projectId);

    if (existing?.status === "running" || existing?.status === "starting") {
      await stopRuntime(input.projectId);
    }

    port = await findAvailablePort(input.devServerRuntime?.port ?? 5173);
  } catch (error) {
    return failed(input, error instanceof Error ? error.message : "Unable to prepare Vite runtime.");
  }

  const previewUrl = `http://127.0.0.1:${port}/`;
  const runtimeId = `vite-runtime-${Date.now()}`;
  const invocation = validation.devScript
    ? resolveSafeProjectScriptInvocation(input.workspaceRoot, validation.devScript)
    : null;
  if (!invocation) {
    return blocked(input, ["Vite executable is not available in the approved project dependency tree."]);
  }
  const child = spawn(
    invocation.command,
    [...invocation.args, "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
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
    runtimeId,
    workspaceRoot: input.workspaceRoot
  });

  child.stdout.on("data", (chunk) => appendRuntimeLog(input.projectId, "stdout", String(chunk)));
  child.stderr.on("data", (chunk) => appendRuntimeLog(input.projectId, "stderr", String(chunk)));
  child.once("error", (error) => {
    appendRuntimeLog(input.projectId, "system", `Vite runtime error: ${error.message}`);
    markRuntimeStatus(input.projectId, "error", error.message);
  });
  child.once("exit", (code) => {
    const current = getRuntime(input.projectId);

    appendRuntimeLog(input.projectId, "system", `Vite runtime exited with code ${code ?? "unknown"}.`);

    if (current?.runtimeId === runtimeId) {
      markRuntimeStatus(input.projectId, code === 0 ? "stopped" : "error", code === 0 ? null : `Vite exited with code ${code ?? "unknown"}.`);
    }
  });

  const readiness = await waitForOwnedLocalHttp({
    timeoutMs: startupTimeoutMs,
    url: previewUrl
  });
  if (!readiness.ok) {
    const logs = runtimeLogLines(getRuntime(input.projectId));
    await stopRuntime(input.projectId);
    return failed(input, readiness.error ?? "Vite runtime did not become ready.", logs);
  }
  const current = markRuntimeStatus(input.projectId, "running");
  if (!current) return failed(input, "Vite runtime registry did not return a running process.");
  appendRuntimeLog(input.projectId, "system", `Vite runtime ready at ${previewUrl}`);
  return {
    ...runtimeRecordToPreviewBridge(current),
    devServerRuntime: input.devServerRuntime ?? undefined,
    logs: runtimeLogLines(getRuntime(input.projectId)),
    runtimeStatus: "running"
  };
}

export async function stopViteRuntime(projectId: string) {
  const stopped = await stopRuntime(projectId);

  return stopped ? runtimeRecordToPreviewBridge(stopped) : null;
}

export async function restartViteRuntime(input: ViteRuntimeStartInput) {
  await stopRuntime(input.projectId);

  return startViteRuntime(input);
}

export function getViteRuntime(projectId: string) {
  const runtime = getRuntime(projectId);

  return runtime ? runtimeRecordToPreviewBridge(runtime) : null;
}
