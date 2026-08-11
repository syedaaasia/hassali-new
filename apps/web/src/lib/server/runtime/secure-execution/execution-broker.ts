import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { access, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { sanitizeUntrustedToolText } from "@/lib/server/intelligence/security-kernel";
import { clearCodeRepositoryInspectionCache, inspectCodeRepository } from "../code-repository-inspector";
import { captureOwnedProjectWorkspaceSnapshot, type OwnedProjectWorkspaceSnapshot } from "../owned-workspace-hydration";
import { stopOwnedChild } from "../owned-runtime-safety";
import { isServerOwnedProjectWorkspaceRoot, resolveWorkspaceBaseRoot } from "../workspace-binding";
import { consumeExecutionGrant } from "./execution-grants";
import { evaluateExecutionPolicy } from "./execution-policy";
import { isSecureTaskArtifactRoot, resolveSecureTaskArtifactBaseRoot } from "./task-artifacts";
import type {
  ExecutionAuditEvent,
  ExecutionFailureCode,
  ExecutionIsolation,
  ExecutionRequest,
  ExecutionResult
} from "./execution-types";

const defaultMaxOutputBytes = 48_000;
const maxAllowedOutputBytes = 96_000;
const maxAllowedTimeoutMs = 120_000;
const sensitiveEnvironmentName = /(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD|DATABASE_URL|PRIVATE_KEY|CLERK|OPENROUTER)/i;
const sensitivePathPart = /^(?:\.env(?:\..*)?|\.git|\.ssh|\.npmrc|\.pypirc|credentials?|secrets?)$/i;
const allowedBareExecutables = new Set(["ffmpeg", "ffmpeg.exe", "ffprobe", "ffprobe.exe", "git", "git.exe", "py", "py.exe", "python", "python.exe", "python3", "python3.exe", "tesseract", "tesseract.exe"]);
const osEnvironmentNames = new Set([
  "NUMBER_OF_PROCESSORS", "OS", "PATH", "PATHEXT", "PROCESSOR_ARCHITECTURE",
  "SYSTEMDRIVE", "SYSTEMROOT", "TEMP", "TMP", "WINDIR"
]);
const allowedExtraEnvironmentNames = new Set(["HOST", "PORT"]);
const ownedProcesses = new Set<ChildProcessWithoutNullStreams>();
const isolation: ExecutionIsolation = {
  environment: "allowlist",
  filesystem: "validated-paths",
  level: "process-bounded",
  network: "policy-only",
  osEnforced: false,
  processTree: "owned-process-tree"
};

function now() {
  return new Date().toISOString();
}

function audit(events: ExecutionAuditEvent[], requestId: string, code: string, summary: string) {
  events.push({ at: now(), code, requestId, summary });
}

function createEnvironment(extra: Record<string, string> = {}) {
  const environment: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value && osEnvironmentNames.has(key.toUpperCase()) && !sensitiveEnvironmentName.test(key)) {
      environment[key] = value;
    }
  }
  for (const [key, value] of Object.entries(extra)) {
    if (allowedExtraEnvironmentNames.has(key.toUpperCase()) && !sensitiveEnvironmentName.test(key)) environment[key] = value;
  }
  return {
    ...environment,
    BROWSER: "none",
    CI: "1",
    HASSALI_CODE_EXECUTION: "1",
    HASSALI_SECURE_EXECUTION: "1",
    NODE_ENV: process.env.NODE_ENV ?? "development",
    NO_UPDATE_NOTIFIER: "1",
    PYTHON_MANAGER_AUTOMATIC_INSTALL: "0"
  };
}

export function createSecureExecutionEnvironment(extra: Record<string, string> = {}) {
  return createEnvironment(extra);
}

function pathInside(root: string, target: string) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function containsSensitivePath(root: string, target: string) {
  const relative = path.relative(root, target);
  return relative.split(/[\\/]+/).some((part) => sensitivePathPart.test(part));
}

async function canonicalExistingPath(target: string) {
  return realpath(path.resolve(target));
}

async function canonicalOutputPath(root: string, target: string) {
  const resolved = path.resolve(target);
  const existing = await stat(resolved).then(() => true).catch(() => false);
  if (existing) return realpath(resolved);
  const parent = await realpath(path.dirname(resolved));
  return path.resolve(parent, path.basename(resolved));
}

async function resolveExecutable(executable: string) {
  if (path.isAbsolute(executable)) {
    await access(executable);
    const resolved = await realpath(executable);
    const nodeExecutable = await realpath(process.execPath);
    return process.platform === "win32"
      ? resolved.toLowerCase() === nodeExecutable.toLowerCase() ? resolved : null
      : resolved === nodeExecutable ? resolved : null;
  }
  const name = executable.toLowerCase();
  if (!allowedBareExecutables.has(name) || /[\\/]/.test(executable)) return null;
  const pathValue = process.env.PATH ?? process.env.Path ?? "";
  const extensions = process.platform === "win32"
    ? [".EXE"]
    : [""];
  const hasExtension = path.extname(executable) !== "";
  for (const directory of pathValue.split(path.delimiter).filter(Boolean)) {
    for (const extension of hasExtension ? [""] : extensions) {
      const candidate = path.resolve(directory, `${executable}${extension.toLowerCase()}`);
      if (await stat(candidate).then((entry) => entry.isFile()).catch(() => false)) return realpath(candidate);
      const originalCase = path.resolve(directory, `${executable}${extension}`);
      if (originalCase !== candidate && await stat(originalCase).then((entry) => entry.isFile()).catch(() => false)) return realpath(originalCase);
    }
  }
  return null;
}

function blockedResult(input: {
  audit: ExecutionAuditEvent[];
  code: ExecutionFailureCode;
  message: string;
  request: ExecutionRequest;
  startedAt: string;
  status?: ExecutionResult["status"];
}): ExecutionResult {
  audit(input.audit, input.request.id, input.code, input.message);
  const outputLimitBytes = Math.min(input.request.maxOutputBytes ?? defaultMaxOutputBytes, maxAllowedOutputBytes);
  return {
    audit: input.audit,
    command: { ...input.request.command, executable: path.basename(input.request.command.executable) },
    durationMs: Date.now() - Date.parse(input.startedAt),
    exitCode: null,
    failure: { code: input.code, message: input.message },
    finishedAt: now(),
    isolation,
    mutation: { afterFingerprint: null, beforeFingerprint: input.request.expectedWorkspaceFingerprint ?? null, changedPaths: [], state: "unknown" },
    output: { stderr: "", stdout: "", truncated: false },
    requestId: input.request.id,
    resources: { cpuLimit: null, memoryLimitBytes: null, outputLimitBytes, timeoutMs: Math.min(input.request.timeoutMs, maxAllowedTimeoutMs) },
    signal: null,
    startedAt: input.startedAt,
    status: input.status ?? "blocked",
    tool: { executable: path.basename(input.request.command.executable), version: null },
    warnings: ["Filesystem and network restrictions are policy-enforced; this host does not provide an OS sandbox for child processes."]
  };
}

async function validateScope(request: ExecutionRequest) {
  if (request.scope.kind === "project" && !(await isServerOwnedProjectWorkspaceRoot(request.scope.root))) return null;
  if (request.scope.kind === "task-temp" && !isSecureTaskArtifactRoot(request.scope.root)) return null;
  const root = await canonicalExistingPath(request.scope.root);
  const canonicalBase = request.scope.kind === "project"
    ? await canonicalExistingPath(await resolveWorkspaceBaseRoot())
    : await canonicalExistingPath(resolveSecureTaskArtifactBaseRoot());
  if (!pathInside(canonicalBase, root) || root === canonicalBase) return null;
  const cwd = await canonicalExistingPath(request.cwd);
  if (!pathInside(root, cwd) || containsSensitivePath(root, cwd)) return null;
  for (const value of request.scope.allowedInputs) {
    const target = await canonicalExistingPath(path.resolve(root, value)).catch(() => null);
    if (!target || !pathInside(root, target) || containsSensitivePath(root, target)) return null;
  }
  for (const value of request.scope.allowedOutputs) {
    const target = await canonicalOutputPath(root, path.resolve(root, value)).catch(() => null);
    if (!target || !pathInside(root, target) || containsSensitivePath(root, target)) return null;
  }
  return { cwd, root };
}

async function repositoryFingerprint(request: ExecutionRequest) {
  if (request.scope.kind !== "project") return null;
  clearCodeRepositoryInspectionCache(request.scope.root);
  return (await inspectCodeRepository(request.scope.root)).fingerprint;
}

function snapshotMap(snapshot: OwnedProjectWorkspaceSnapshot | null) {
  return new Map(snapshot?.files.map((file) => [file.path.replace(/\\/g, "/"), file.content]) ?? []);
}

function changedSnapshotPaths(before: OwnedProjectWorkspaceSnapshot | null, after: OwnedProjectWorkspaceSnapshot | null) {
  if (!before || !after) return null;
  const previous = snapshotMap(before);
  const current = snapshotMap(after);
  return [...new Set([...previous.keys(), ...current.keys()])]
    .filter((filePath) => previous.get(filePath) !== current.get(filePath))
    .sort()
    .slice(0, 100);
}

function isDeclaredOrCompilerArtifact(request: ExecutionRequest, filePath: string, before: OwnedProjectWorkspaceSnapshot | null) {
  const normalized = filePath.replace(/\\/g, "/");
  if (request.scope.allowedOutputs.some((output) => path.resolve(request.scope.root, output) === path.resolve(request.scope.root, normalized))) return true;
  if (/\.tsbuildinfo$/i.test(normalized)) return true;
  const sourceFiles = new Set(before?.files.map((file) => file.path.replace(/\\/g, "/")) ?? []);
  const sourceCandidate = normalized
    .replace(/\.d\.ts(?:\.map)?$/i, ".ts")
    .replace(/\.js(?:\.map)?$/i, ".ts");
  return sourceFiles.has(sourceCandidate) || sourceFiles.has(sourceCandidate.replace(/\.ts$/i, ".tsx"));
}

function boundedSanitized(value: string, limit: number) {
  const bytes = Buffer.byteLength(value);
  const bounded = bytes <= limit ? value : Buffer.from(value).subarray(-limit).toString("utf8");
  return { text: sanitizeUntrustedToolText(bounded).sanitized, truncated: bytes > limit };
}

export function ownedSecureExecutionProcessCount() {
  return ownedProcesses.size;
}

export async function cleanupOwnedSecureExecutionProcesses() {
  for (const child of [...ownedProcesses]) {
    await stopOwnedChild(child).catch(() => undefined);
    if (child.exitCode !== null || child.signalCode !== null) ownedProcesses.delete(child);
  }
  return ownedProcesses.size;
}

export async function executeWithBroker(request: ExecutionRequest): Promise<ExecutionResult> {
  const startedAt = now();
  const events: ExecutionAuditEvent[] = [];
  audit(events, request.id, "request-created", `${request.mode} requested ${request.capability}.`);
  const consumed = consumeExecutionGrant(request);
  if (!consumed.grant) {
    const code = consumed.reason === "expired" ? "grant-expired" : consumed.reason === "scope-mismatch" ? "grant-scope-mismatch" : "grant-invalid";
    return blockedResult({ audit: events, code, message: "Execution authority is missing, expired, or does not match this request.", request, startedAt });
  }
  const policyFailure = evaluateExecutionPolicy(request, consumed.grant);
  if (policyFailure) return blockedResult({ audit: events, ...policyFailure, request, startedAt });
  const scope = await validateScope(request).catch(() => null);
  if (!scope) return blockedResult({ audit: events, code: "path-blocked", message: "Execution paths escaped the authorized scope or referenced a sensitive path.", request, startedAt });
  const executable = await resolveExecutable(request.command.executable).catch(() => null);
  if (!executable) return blockedResult({ audit: events, code: "capability-unavailable", message: "The approved executable is not available through the safe resolver.", request, startedAt, status: "unavailable" });
  const beforeFingerprint = await repositoryFingerprint(request);
  const beforeSnapshot = request.scope.kind === "project"
    ? await captureOwnedProjectWorkspaceSnapshot(request.scope.root).catch(() => null)
    : null;
  if (request.expectedWorkspaceFingerprint && beforeFingerprint !== request.expectedWorkspaceFingerprint) {
    return blockedResult({ audit: events, code: "stale-workspace", message: "The project changed after planning. Hassali stopped before execution and requires fresh inspection.", request, startedAt });
  }
  if (request.abortSignal?.aborted) {
    return {
      ...blockedResult({ audit: events, code: "process-failed", message: "Execution was cancelled before start.", request, startedAt, status: "cancelled" }),
      failure: null,
      signal: "ABORTED"
    };
  }
  audit(events, request.id, "process-started", `Started ${request.capability} with a directly resolved executable.`);
  const maxOutputBytes = Math.min(request.maxOutputBytes ?? defaultMaxOutputBytes, maxAllowedOutputBytes);
  const timeoutMs = Math.min(Math.max(request.timeoutMs, 100), maxAllowedTimeoutMs);
  return new Promise<ExecutionResult>((resolveResult) => {
    let stdout = "";
    let stderr = "";
    let finished = false;
    let termination: "abort" | "timeout" | null = null;
    const child = spawn(executable, request.command.args, {
      cwd: scope.cwd,
      env: createEnvironment(),
      shell: false,
      stdio: "pipe",
      windowsHide: true
    });
    ownedProcesses.add(child);
    const finish = async (input: { code: number | null; processError?: string; signal: string | null; teardownFailed?: boolean }) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      request.abortSignal?.removeEventListener("abort", abort);
      ownedProcesses.delete(child);
      if (input.processError) stderr = `${stderr}\n${input.processError}`;
      const stdoutResult = boundedSanitized(stdout, maxOutputBytes);
      const stderrResult = boundedSanitized(stderr, maxOutputBytes);
      const afterFingerprint = await repositoryFingerprint(request).catch(() => null);
      const afterSnapshot = request.scope.kind === "project"
        ? await captureOwnedProjectWorkspaceSnapshot(request.scope.root).catch(() => null)
        : null;
      const snapshotChanges = changedSnapshotPaths(beforeSnapshot, afterSnapshot);
      const changedProject = request.scope.kind === "project" && (
        snapshotChanges ? snapshotChanges.length > 0 : beforeFingerprint !== null && afterFingerprint !== beforeFingerprint
      );
      const expectedMutation = changedProject && request.mutation === "project" && snapshotChanges !== null && snapshotChanges.every((filePath) => isDeclaredOrCompilerArtifact(request, filePath, beforeSnapshot));
      const unexpectedMutation = changedProject && !expectedMutation;
      if (expectedMutation) audit(events, request.id, "expected-mutation", "Execution produced project-local artifacts declared by the approved command metadata.");
      if (unexpectedMutation) audit(events, request.id, "unexpected-mutation", "Execution changed repository evidence outside an approved mutation step; execution stopped without restoring files.");
      const status: ExecutionResult["status"] = unexpectedMutation
        ? "failed"
        : input.teardownFailed
          ? "failed"
          : termination === "abort"
            ? "cancelled"
            : termination === "timeout"
              ? "timed-out"
              : input.code === 0 && !input.processError
                ? "passed"
                : "failed";
      const failure = unexpectedMutation
        ? { code: "unexpected-mutation" as const, message: "The verification command changed project source evidence. Files were preserved for review." }
        : input.teardownFailed
          ? { code: "process-teardown-failed" as const, message: "Hassali could not confirm teardown of the owned process tree." }
          : termination === "timeout"
            ? { code: "process-failed" as const, message: `Execution exceeded ${timeoutMs}ms.` }
            : termination === "abort"
              ? null
              : input.code === 0 && !input.processError
                ? null
                : { code: "process-failed" as const, message: "The approved process exited unsuccessfully." };
      audit(events, request.id, status === "passed" ? "process-completed" : status, failure?.message ?? "Execution completed successfully.");
      resolveResult({
        audit: events,
        command: { ...request.command, executable: path.basename(executable) },
        durationMs: Date.now() - Date.parse(startedAt),
        exitCode: termination ? null : input.code,
        failure,
        finishedAt: now(),
        isolation,
        mutation: {
          afterFingerprint,
          beforeFingerprint,
          changedPaths: snapshotChanges ?? [],
          state: unexpectedMutation ? "unexpected" : expectedMutation ? "expected" : beforeFingerprint === null ? "unknown" : "none"
        },
        output: {
          stderr: stderrResult.text,
          stdout: stdoutResult.text,
          truncated: stdoutResult.truncated || stderrResult.truncated
        },
        requestId: request.id,
        resources: { cpuLimit: null, memoryLimitBytes: null, outputLimitBytes: maxOutputBytes, timeoutMs },
        signal: termination === "abort" ? "ABORTED" : termination === "timeout" ? "TIMEOUT" : input.signal,
        startedAt,
        status,
        tool: { executable: path.basename(executable), version: null },
        warnings: ["Filesystem and network restrictions are policy-enforced; this host does not provide an OS sandbox for child processes."]
      });
    };
    const abort = () => {
      termination = "abort";
      void stopOwnedChild(child)
        .then(() => finish({ code: null, signal: "ABORTED" }))
        .catch((error) => finish({ code: null, processError: `Owned process teardown failed: ${error instanceof Error ? error.message : "unknown error"}`, signal: "TEARDOWN_FAILED", teardownFailed: true }));
    };
    const timeout = setTimeout(() => {
      termination = "timeout";
      void stopOwnedChild(child)
        .then(() => finish({ code: null, signal: "TIMEOUT" }))
        .catch((error) => finish({ code: null, processError: `Timed-out process teardown failed: ${error instanceof Error ? error.message : "unknown error"}`, signal: "TEARDOWN_FAILED", teardownFailed: true }));
    }, timeoutMs);
    request.abortSignal?.addEventListener("abort", abort, { once: true });
    child.stdout.on("data", (chunk) => { stdout = `${stdout}${String(chunk)}`.slice(-maxOutputBytes * 2); });
    child.stderr.on("data", (chunk) => { stderr = `${stderr}${String(chunk)}`.slice(-maxOutputBytes * 2); });
    child.once("error", (error) => { void finish({ code: null, processError: error.message, signal: null }); });
    child.once("exit", (code, signal) => { void finish({ code, signal }); });
  });
}
