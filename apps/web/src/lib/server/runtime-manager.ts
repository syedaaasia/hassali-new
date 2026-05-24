import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createServer } from "node:net";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";

type RuntimeFile = {
  content: string;
  path: string;
};

type RuntimeStatus = "error" | "running" | "starting" | "stopped";

type RuntimeState = {
  error: string | null;
  logs: string[];
  port: number | null;
  previewUrl: string | null;
  process: ChildProcessWithoutNullStreams | null;
  projectId: string | null;
  status: RuntimeStatus;
  workspacePath: string | null;
};

const folderPlaceholderFileName = ".hassali-folder";
const maxRuntimeLogs = 300;
const cwd = process.cwd().replace(/\\/g, "/");
const workspaceRoot = cwd.endsWith("/apps/web") ? resolve(process.cwd(), "../..") : process.cwd();
const runtimeRoot = resolve(workspaceRoot, ".hassali/runtime");

const staticServerScript = `
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(process.argv[1]);
const port = Number(process.argv[2]);
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp"
};
const server = http.createServer((request, response) => {
  const url = new URL(request.url || "/", "http://localhost");
  const requestedPath = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const filePath = path.resolve(root, "." + requestedPath);
  if (!filePath.startsWith(root + path.sep) && filePath !== root) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }
  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type": mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream"
    });
    response.end(data);
  });
});
server.listen(port, "127.0.0.1", () => {
  console.log("[runtime] static preview ready on http://127.0.0.1:" + port);
});
process.on("SIGTERM", () => {
  console.log("[runtime] stopping static preview");
  server.close(() => process.exit(0));
});
`;

let runtimeState: RuntimeState = {
  error: null,
  logs: [],
  port: null,
  previewUrl: null,
  process: null,
  projectId: null,
  status: "stopped",
  workspacePath: null
};

function serializeRuntimeState() {
  return {
    error: runtimeState.error,
    logs: runtimeState.logs,
    port: runtimeState.port,
    previewUrl: runtimeState.previewUrl,
    projectId: runtimeState.projectId,
    status: runtimeState.status,
    workspacePath: runtimeState.workspacePath
  };
}

function appendRuntimeLog(message: string) {
  const lines = message
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean);

  if (lines.length === 0) {
    return;
  }

  runtimeState = {
    ...runtimeState,
    logs: [...runtimeState.logs, ...lines].slice(-maxRuntimeLogs)
  };
}

function appendProcessLogs(stream: "stderr" | "stdout", chunk: Buffer | string) {
  appendRuntimeLog(
    String(chunk)
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => `[${stream}] ${line}`)
      .join("\n")
  );
}

function isSafeRuntimePath(path: string) {
  if (!path || isAbsolute(path) || path.includes("\\")) {
    return false;
  }

  return path.split("/").every((segment) => segment && segment !== "." && segment !== "..");
}

function projectRuntimePath(projectId: string) {
  return resolve(runtimeRoot, projectId);
}

function assertInsideRuntimeRoot(targetPath: string) {
  const resolvedRoot = `${runtimeRoot}${sep}`;
  const resolvedTarget = resolve(targetPath);

  if (!resolvedTarget.startsWith(resolvedRoot)) {
    throw new Error("Runtime path escaped the workspace root.");
  }
}

async function findAvailablePort() {
  return new Promise<number>((resolvePort, rejectPort) => {
    const server = createServer();

    server.once("error", rejectPort);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;

      server.close(() => {
        if (port) {
          resolvePort(port);
        } else {
          rejectPort(new Error("Unable to allocate preview port."));
        }
      });
    });
  });
}

export async function syncRuntimeWorkspace(projectId: string, files: RuntimeFile[]) {
  const workspacePath = projectRuntimePath(projectId);
  assertInsideRuntimeRoot(workspacePath);

  await mkdir(runtimeRoot, { recursive: true });
  await rm(workspacePath, { force: true, recursive: true });
  await mkdir(workspacePath, { recursive: true });

  for (const file of files) {
    if (file.path.endsWith(`/${folderPlaceholderFileName}`) || !isSafeRuntimePath(file.path)) {
      continue;
    }

    const filePath = join(workspacePath, ...file.path.split("/"));
    assertInsideRuntimeRoot(filePath);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, file.content, "utf8");
  }

  return workspacePath;
}

export async function syncRunningRuntimeWorkspace(projectId: string, files: RuntimeFile[]) {
  if (runtimeState.status !== "running" || runtimeState.projectId !== projectId) {
    return serializeRuntimeState();
  }

  await syncRuntimeWorkspace(projectId, files);
  appendRuntimeLog("[runtime] workspace synced");

  return serializeRuntimeState();
}

export function getRuntimeStatus() {
  return serializeRuntimeState();
}

export function clearRuntimeLogs() {
  runtimeState = {
    ...runtimeState,
    logs: []
  };

  return serializeRuntimeState();
}

export async function stopRuntime() {
  const existingProcess = runtimeState.process;

  if (existingProcess) {
    appendRuntimeLog("[runtime] stopping preview runtime");
    existingProcess.kill();
    existingProcess.stdout.removeAllListeners();
    existingProcess.stderr.removeAllListeners();
  }

  runtimeState = {
    error: null,
    logs: [...runtimeState.logs, "[runtime] preview runtime stopped"].slice(-maxRuntimeLogs),
    port: null,
    previewUrl: null,
    process: null,
    projectId: null,
    status: "stopped",
    workspacePath: null
  };

  return serializeRuntimeState();
}

export async function startRuntime(input: { files: RuntimeFile[]; projectId: string }) {
  const hasIndexHtml = input.files.some((file) => file.path === "index.html");

  if (!hasIndexHtml) {
    runtimeState = {
      ...runtimeState,
      error: "Plain HTML preview requires index.html.",
      logs: [
        ...runtimeState.logs,
        "[runtime] start failed: plain HTML preview requires index.html"
      ].slice(-maxRuntimeLogs),
      status: "error"
    };

    return serializeRuntimeState();
  }

  if (runtimeState.process) {
    await stopRuntime();
  }

  runtimeState = {
    ...runtimeState,
    error: null,
    logs: [...runtimeState.logs, "[runtime] starting local static preview"].slice(-maxRuntimeLogs),
    status: "starting"
  };

  const workspacePath = await syncRuntimeWorkspace(input.projectId, input.files);
  const port = await findAvailablePort();
  const child = spawn(process.execPath, ["-e", staticServerScript, workspacePath, String(port)], {
    stdio: "pipe",
    windowsHide: true
  });

  runtimeState = {
    error: null,
    logs: [...runtimeState.logs, `[runtime] synced project files to ${workspacePath}`].slice(
      -maxRuntimeLogs
    ),
    port,
    previewUrl: `http://127.0.0.1:${port}/`,
    process: child,
    projectId: input.projectId,
    status: "running",
    workspacePath
  };

  child.stdout.on("data", (chunk) => appendProcessLogs("stdout", chunk));
  child.stderr.on("data", (chunk) => appendProcessLogs("stderr", chunk));

  child.once("exit", () => {
    if (runtimeState.process === child) {
      runtimeState = {
        ...runtimeState,
        error: null,
        logs: [...runtimeState.logs, "[runtime] preview process exited"].slice(maxRuntimeLogs * -1),
        process: null,
        status: "stopped"
      };
    }
  });

  child.once("error", (error) => {
    if (runtimeState.process === child) {
      runtimeState = {
        ...runtimeState,
        error: error.message,
        logs: [...runtimeState.logs, `[runtime] process error: ${error.message}`].slice(
          maxRuntimeLogs * -1
        ),
        process: null,
        status: "error"
      };
    }
  });

  return serializeRuntimeState();
}
