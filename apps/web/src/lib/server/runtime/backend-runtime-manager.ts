import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import {
  appendRuntimeLog,
  getRuntime,
  markRuntimeStatus,
  runtimeLogLines,
  startRuntime,
  stopRuntime
} from "@/lib/server/runtime/backend-process-registry";
import { createCodeExecutionEnvironment } from "@/lib/server/runtime/code-command-executor";
import {
  isSafeDevelopmentScript,
  waitForOwnedLocalHttp
} from "@/lib/server/runtime/owned-runtime-safety";
import { runtimeRecordToBackendPreviewBridge } from "@/lib/server/runtime/backend-preview-bridge";
import { recordRuntimeStreamEvent } from "@/lib/server/runtime/runtime-event-buffer";
import { isServerOwnedProjectWorkspaceRoot } from "@/lib/server/runtime/workspace-binding";
import type {
  BackendFramework,
  BackendRuntimeCommand,
  BackendRuntimeOperationResult,
  BackendRuntimeStartInput,
  BackendExecutionValidation
} from "@/lib/server/runtime/backend-runtime-types";

const startupProbeMs = 1800;
const executableNodeFrameworks: BackendFramework[] = ["express", "fastify", "nestjs", "node"];

function blocked(input: BackendRuntimeStartInput, reasons: string[]): BackendRuntimeOperationResult {
  const runtimeId = `backend-runtime-blocked-${Date.now()}`;

  recordRuntimeStreamEvent({
    error: reasons[0] ?? "Backend runtime startup was blocked.",
    framework: "backend",
    message: reasons[0] ?? "Backend runtime startup was blocked.",
    projectId: input.projectId,
    runtimeId,
    status: "blocked",
    stream: "system",
    type: "error"
  });

  return {
    apiStatus: "failed",
    endpointCount: input.analysis.endpointCount,
    error: reasons[0] ?? "Backend runtime startup was blocked.",
    framework: input.match.framework,
    healthStatus: "blocked",
    logs: reasons.map((reason) => `[system] ${reason}`),
    port: null,
    previewUrl: null,
    projectId: input.projectId,
    routeCount: input.analysis.routeCount,
    runtimeId,
    runtimeStatus: "blocked",
    startedAt: null,
    workspaceRoot: input.workspaceRoot
  };
}

function failed(input: BackendRuntimeStartInput, error: string, logs: string[] = []): BackendRuntimeOperationResult {
  const runtimeId = `backend-runtime-error-${Date.now()}`;

  recordRuntimeStreamEvent({
    error,
    framework: "backend",
    message: error,
    projectId: input.projectId,
    runtimeId,
    status: "error",
    stream: "system",
    type: "error"
  });

  return {
    apiStatus: "failed",
    endpointCount: input.analysis.endpointCount,
    error,
    framework: input.match.framework,
    healthStatus: "unknown",
    logs: logs.length ? logs : [`[system] ${error}`],
    port: null,
    previewUrl: null,
    projectId: input.projectId,
    routeCount: input.analysis.routeCount,
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

function commandToSpawn(command: BackendRuntimeCommand) {
  if (command.command === "node") {
    return {
      args: command.args,
      command: process.execPath
    };
  }

  return {
    args: command.args,
    command: process.execPath
  };
}

async function commandFromPackageJson(workspaceRoot: string): Promise<BackendRuntimeCommand | null> {
  const packageJsonPath = resolve(workspaceRoot, "package.json");

  if (!(await fileExists(packageJsonPath))) {
    return null;
  }

  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as {
    scripts?: Record<string, unknown>;
  };
  const dev = typeof packageJson.scripts?.dev === "string" ? packageJson.scripts.dev : null;
  const startDev = typeof packageJson.scripts?.["start:dev"] === "string"
    ? packageJson.scripts["start:dev"]
    : null;

  if (dev && isSafeDevelopmentScript(dev, "backend_node")) {
    const target = dev.trim().split(/\s+/)[1];
    return target
      ? { args: [resolve(workspaceRoot, target)], command: "node", label: dev }
      : null;
  }

  if (startDev && isSafeDevelopmentScript(startDev, "backend_node")) {
    const target = startDev.trim().split(/\s+/)[1];
    return target
      ? { args: [resolve(workspaceRoot, target)], command: "node", label: startDev }
      : null;
  }

  return null;
}

async function validateBackendRuntime(input: BackendRuntimeStartInput): Promise<BackendExecutionValidation> {
  const reasons: string[] = [];

  if (input.productMode !== "CODE") {
    reasons.push("Backend runtime execution is only enabled for CODE mode.");
  }

  if (input.workerType !== "local") {
    reasons.push("Backend runtime execution is only enabled for the local approved runner.");
  }

  if (!(await isServerOwnedProjectWorkspaceRoot(input.workspaceRoot))) {
    reasons.push("Backend runtime workspace must be a server-owned Hassali project workspace.");
  }

  if (!executableNodeFrameworks.includes(input.match.framework)) {
    reasons.push(`${input.match.displayName} runtime is detection-only in this phase.`);
  }

  const packageJsonPath = resolve(input.workspaceRoot, "package.json");
  const packageJsonExists = await fileExists(packageJsonPath);

  if (!packageJsonExists) {
    reasons.push("Backend runtime requires package.json for Node-family execution.");
  }

  let command: BackendRuntimeCommand | null = null;

  if (packageJsonExists) {
    try {
      command = await commandFromPackageJson(input.workspaceRoot);
    } catch {
      reasons.push("Backend runtime could not parse package.json.");
    }
  }

  if (!command && await fileExists(resolve(input.workspaceRoot, "server.js"))) {
    command = { args: [resolve(input.workspaceRoot, "server.js")], command: "node", label: "node server.js" };
  }

  if (!command) {
    reasons.push("Backend runtime requires scripts.dev, scripts.start:dev, or server.js.");
  }

  return {
    command,
    ok: reasons.length === 0,
    reasons
  };
}

async function findAvailablePort(startPort = 4000) {
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

  throw new Error("Unable to allocate a local backend preview port.");
}

export async function startBackendRuntime(
  input: BackendRuntimeStartInput
): Promise<BackendRuntimeOperationResult> {
  const validation = await validateBackendRuntime(input);

  if (!validation.ok || !validation.command) {
    return blocked(input, validation.reasons);
  }

  let port: number;

  try {
    const existing = getRuntime(input.projectId);

    if (existing?.status === "running" || existing?.status === "starting") {
      await stopRuntime(input.projectId);
    }

    port = await findAvailablePort();
  } catch (error) {
    return failed(input, error instanceof Error ? error.message : "Unable to prepare backend runtime.");
  }

  const spawnCommand = commandToSpawn(validation.command);
  const previewUrl = `http://127.0.0.1:${port}/`;
  const runtimeId = `backend-runtime-${Date.now()}`;
  const child = spawn(spawnCommand.command, spawnCommand.args, {
    cwd: input.workspaceRoot,
    env: createCodeExecutionEnvironment({
      HOST: "127.0.0.1",
      PORT: String(port)
    }),
    shell: false,
    stdio: "pipe",
    windowsHide: true
  });

  startRuntime({
    child,
    framework: input.match.framework,
    port,
    previewUrl,
    projectId: input.projectId,
    runtimeId,
    workspaceRoot: input.workspaceRoot
  });
  appendRuntimeLog(input.projectId, "system", `Backend command: ${validation.command.label}`);

  child.stdout.on("data", (chunk) => appendRuntimeLog(input.projectId, "stdout", String(chunk)));
  child.stderr.on("data", (chunk) => appendRuntimeLog(input.projectId, "stderr", String(chunk)));
  child.once("error", (error) => {
    appendRuntimeLog(input.projectId, "system", `Backend runtime error: ${error.message}`);
    markRuntimeStatus(input.projectId, "error", error.message);
  });
  child.once("exit", (code) => {
    const current = getRuntime(input.projectId);

    appendRuntimeLog(input.projectId, "system", `Backend runtime exited with code ${code ?? "unknown"}.`);

    if (current?.runtimeId === runtimeId) {
      markRuntimeStatus(input.projectId, code === 0 ? "stopped" : "error", code === 0 ? null : `Backend exited with code ${code ?? "unknown"}.`);
    }
  });

  const readiness = await waitForOwnedLocalHttp({
    timeoutMs: Math.max(10_000, startupProbeMs),
    url: previewUrl
  });
  if (!readiness.ok) {
    const logs = runtimeLogLines(getRuntime(input.projectId));
    await stopRuntime(input.projectId);
    return failed(input, readiness.error ?? "Backend runtime did not become ready.", logs);
  }
  const current = markRuntimeStatus(input.projectId, "running");
  if (!current) return failed(input, "Backend runtime registry did not return a running process.");
  appendRuntimeLog(input.projectId, "system", `Backend runtime ready at ${previewUrl}`);
  return {
    ...runtimeRecordToBackendPreviewBridge({
      analysis: input.analysis,
      record: current
    }),
    logs: runtimeLogLines(getRuntime(input.projectId)),
    runtimeStatus: "running"
  };
}

export async function stopBackendRuntime(projectId: string) {
  const stopped = await stopRuntime(projectId);

  return stopped;
}
