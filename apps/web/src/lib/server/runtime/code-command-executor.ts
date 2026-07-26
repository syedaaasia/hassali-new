import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import path from "node:path";
import { sanitizeUntrustedToolText } from "@/lib/server/intelligence/security-kernel";
import { isServerOwnedProjectWorkspaceRoot } from "./workspace-binding";
import { stopOwnedChild } from "./owned-runtime-safety";
import type {
  CodeCommandResult,
  CodeCommandSpec,
  CodeFailureType
} from "./code-execution-types";

const maxOutputBytes = 48_000;
const ownedCommandChildren = new Set<ChildProcessWithoutNullStreams>();
const sensitiveEnvironmentName = /(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD|DATABASE_URL|PRIVATE_KEY|CLERK|OPENROUTER)/i;
const osEnvironmentNames = new Set([
  "APPDATA",
  "COMSPEC",
  "HOME",
  "HOMEDRIVE",
  "HOMEPATH",
  "LOCALAPPDATA",
  "NUMBER_OF_PROCESSORS",
  "OS",
  "PATH",
  "PATHEXT",
  "PROCESSOR_ARCHITECTURE",
  "PROGRAMDATA",
  "PROGRAMFILES",
  "PROGRAMFILES(X86)",
  "SYSTEMDRIVE",
  "SYSTEMROOT",
  "TEMP",
  "TMP",
  "USERPROFILE",
  "WINDIR"
]);

export function createCodeExecutionEnvironment(extra: Record<string, string> = {}) {
  const environment: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value && osEnvironmentNames.has(key.toUpperCase()) && !sensitiveEnvironmentName.test(key)) {
      environment[key] = value;
    }
  }
  return {
    ...environment,
    ...extra,
    BROWSER: "none",
    CI: "1",
    HASSALI_CODE_EXECUTION: "1",
    NODE_ENV: process.env.NODE_ENV ?? "development",
    NO_UPDATE_NOTIFIER: "1"
  };
}

export function ownedCodeCommandProcessCount() {
  return ownedCommandChildren.size;
}

export async function cleanupOwnedCodeCommands() {
  for (const child of [...ownedCommandChildren]) {
    await stopOwnedChild(child).catch(() => undefined);
    if (child.exitCode !== null) ownedCommandChildren.delete(child);
  }
  return ownedCommandChildren.size;
}

function classifyFailure(command: CodeCommandSpec, output: string): CodeFailureType {
  if (/\b(?:401|403|unauthorized|forbidden)\b/i.test(output)) return "AUTH_ERROR";
  if (/\b(?:EACCES|EPERM|permission denied)\b/i.test(output)) return "PERMISSION_ERROR";
  if (/\b(?:ERR_MODULE_NOT_FOUND|MODULE_NOT_FOUND|cannot find module|command not found|not recognized as an internal)\b/i.test(output)) {
    return "DEPENDENCY_ERROR";
  }
  if (/\b(?:ECONNREFUSED|ENETUNREACH|network|fetch failed|socket hang up)\b/i.test(output)) return "NETWORK_ERROR";
  if (command.kind === "build") return "BUILD_ERROR";
  if (command.kind === "typecheck" || /\bTS\d{4}\b|Type error:/i.test(output)) return "TYPE_ERROR";
  if (command.kind === "test" || /\b(?:tests? failed|assertionerror|expected .+ received)\b/i.test(output)) return "TEST_FAILURE";
  return "TOOL_ERROR";
}

function boundedOutput(stdout: string, stderr: string) {
  const combined = `${stdout}\n${stderr}`.trim().slice(-maxOutputBytes);
  return sanitizeUntrustedToolText(combined).sanitized;
}

export async function runBoundedCodeCommand(input: {
  abortSignal?: AbortSignal;
  command: CodeCommandSpec;
  projectId: string;
  workspaceRoot: string;
}): Promise<CodeCommandResult> {
  const startedAt = Date.now();
  if (!(await isServerOwnedProjectWorkspaceRoot(input.workspaceRoot))) {
    return {
      commandId: input.command.id,
      durationMs: 0,
      exitCode: null,
      failureType: "PROJECT_SCOPE_ERROR",
      outputExcerpt: "Command execution requires a server-owned Hassali project workspace.",
      signal: null,
      status: "FAILED"
    };
  }
  if (input.abortSignal?.aborted) {
    return {
      commandId: input.command.id,
      durationMs: 0,
      exitCode: null,
      failureType: null,
      outputExcerpt: "",
      signal: "ABORTED",
      status: "CANCELLED"
    };
  }
  const root = path.resolve(input.workspaceRoot);

  return new Promise<CodeCommandResult>((resolveResult) => {
    let stdout = "";
    let stderr = "";
    let finished = false;
    let termination: "abort" | "timeout" | null = null;
    const child = spawn(input.command.command, input.command.args, {
      cwd: root,
      env: createCodeExecutionEnvironment(),
      shell: false,
      stdio: "pipe",
      windowsHide: true
    });
    ownedCommandChildren.add(child);
    const finish = (result: CodeCommandResult) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      input.abortSignal?.removeEventListener("abort", abort);
      resolveResult(result);
    };
    const abort = () => {
      termination = "abort";
      void stopOwnedChild(child)
        .then(() => finish({
          commandId: input.command.id,
          durationMs: Date.now() - startedAt,
          exitCode: null,
          failureType: null,
          outputExcerpt: boundedOutput(stdout, stderr),
          signal: "ABORTED",
          status: "CANCELLED"
        }))
        .catch((error) => finish({
          commandId: input.command.id,
          durationMs: Date.now() - startedAt,
          exitCode: null,
          failureType: "PROCESS_TEARDOWN_ERROR",
          outputExcerpt: boundedOutput(
            stdout,
            `${stderr}\nOwned process teardown failed: ${error instanceof Error ? error.message : "unknown error"}`
          ),
          signal: "TEARDOWN_FAILED",
          status: "FAILED"
        }));
    };
    const timeout = setTimeout(() => {
      termination = "timeout";
      void stopOwnedChild(child)
        .then(() => {
          const output = boundedOutput(stdout, `${stderr}\nCommand exceeded ${input.command.timeoutMs}ms.`);
          finish({
            commandId: input.command.id,
            durationMs: Date.now() - startedAt,
            exitCode: null,
            failureType: "TOOL_ERROR",
            outputExcerpt: output,
            signal: "TIMEOUT",
            status: "FAILED"
          });
        })
        .catch((error) => finish({
          commandId: input.command.id,
          durationMs: Date.now() - startedAt,
          exitCode: null,
          failureType: "PROCESS_TEARDOWN_ERROR",
          outputExcerpt: boundedOutput(
            stdout,
            `${stderr}\nCommand timed out and owned process teardown failed: ${error instanceof Error ? error.message : "unknown error"}`
          ),
          signal: "TEARDOWN_FAILED",
          status: "FAILED"
        }));
    }, input.command.timeoutMs);

    input.abortSignal?.addEventListener("abort", abort, { once: true });
    child.stdout.on("data", (chunk) => {
      stdout = `${stdout}${String(chunk)}`.slice(-maxOutputBytes);
    });
    child.stderr.on("data", (chunk) => {
      stderr = `${stderr}${String(chunk)}`.slice(-maxOutputBytes);
    });
    child.once("error", (error) => {
      ownedCommandChildren.delete(child);
      const output = boundedOutput(stdout, `${stderr}\n${error.message}`);
      finish({
        commandId: input.command.id,
        durationMs: Date.now() - startedAt,
        exitCode: null,
        failureType: classifyFailure(input.command, output),
        outputExcerpt: output,
        signal: null,
        status: "FAILED"
      });
    });
    child.once("exit", (code, signal) => {
      ownedCommandChildren.delete(child);
      const output = boundedOutput(
        stdout,
        termination === "timeout"
          ? `${stderr}\nCommand exceeded ${input.command.timeoutMs}ms.`
          : stderr
      );
      finish({
        commandId: input.command.id,
        durationMs: Date.now() - startedAt,
        exitCode: termination ? null : code,
        failureType: termination === "timeout"
          ? "TOOL_ERROR"
          : termination === "abort"
            ? null
            : code === 0
              ? null
              : classifyFailure(input.command, output),
        outputExcerpt: output,
        signal: termination === "abort" ? "ABORTED" : termination === "timeout" ? "TIMEOUT" : signal,
        status: termination === "abort" ? "CANCELLED" : code === 0 && !termination ? "PASSED" : "FAILED"
      });
    });
  });
}

export async function runCodeCommandSuite(input: {
  abortSignal?: AbortSignal;
  commands: CodeCommandSpec[];
  projectId: string;
  workspaceRoot: string;
}) {
  const results: CodeCommandResult[] = [];
  for (const command of input.commands) {
    const result = await runBoundedCodeCommand({
      abortSignal: input.abortSignal,
      command,
      projectId: input.projectId,
      workspaceRoot: input.workspaceRoot
    });
    results.push(result);
    if (result.status === "CANCELLED" || result.failureType === "PROCESS_TEARDOWN_ERROR") break;
  }
  return results;
}
