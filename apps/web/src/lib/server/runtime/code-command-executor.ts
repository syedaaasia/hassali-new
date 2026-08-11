import { isServerOwnedProjectWorkspaceRoot } from "./workspace-binding";
import { clearCodeRepositoryInspectionCache, inspectCodeRepository } from "./code-repository-inspector";
import {
  cleanupOwnedSecureExecutionProcesses,
  createSecureExecutionEnvironment,
  executeWithBroker,
  ownedSecureExecutionProcessCount
} from "./secure-execution/execution-broker";
import type {
  CodeCommandResult,
  CodeCommandSpec,
  CodeFailureType
} from "./code-execution-types";

export function createCodeExecutionEnvironment(extra: Record<string, string> = {}) {
  return createSecureExecutionEnvironment(extra);
}

export function ownedCodeCommandProcessCount() {
  return ownedSecureExecutionProcessCount();
}

export async function cleanupOwnedCodeCommands() {
  return cleanupOwnedSecureExecutionProcesses();
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

export async function runBoundedCodeCommand(input: {
  abortSignal?: AbortSignal;
  command: CodeCommandSpec;
  executionGrantId: string;
  expectedWorkspaceFingerprint: string;
  externalUserId: string;
  projectId: string;
  workspaceRoot: string;
}): Promise<CodeCommandResult> {
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
  const execution = await executeWithBroker({
    abortSignal: input.abortSignal,
    actor: { externalUserId: input.externalUserId, projectId: input.projectId },
    capability: "repository.verify",
    command: {
      args: input.command.args,
      executable: input.command.command,
      provenance: { evidence: `Repository-inspected scripts.${input.command.scriptName}.`, source: "repository-inspector" }
    },
    cwd: input.workspaceRoot,
    expectedWorkspaceFingerprint: input.expectedWorkspaceFingerprint,
    grantId: input.executionGrantId,
    id: input.command.id,
    mode: "CODE",
    mutation: input.command.effect === "REVERSIBLE_LOCAL" ? "project" : "none",
    network: "none",
    risk: input.command.effect === "READ_ONLY" ? "low" : "medium",
    scope: { allowedInputs: ["."], allowedOutputs: [], kind: "project", root: input.workspaceRoot },
    timeoutMs: input.command.timeoutMs
  });
  const output = `${execution.output.stdout}\n${execution.output.stderr}`.trim();
  const failureType: CodeFailureType | null = execution.failure?.code === "unexpected-mutation" || execution.failure?.code === "stale-workspace" || execution.failure?.code === "path-blocked" || execution.failure?.code.startsWith("grant-")
    ? "PROJECT_SCOPE_ERROR"
    : execution.failure?.code === "process-teardown-failed"
      ? "PROCESS_TEARDOWN_ERROR"
      : execution.status === "failed" || execution.status === "timed-out" || execution.status === "unavailable" || execution.status === "blocked"
        ? classifyFailure(input.command, output)
        : null;
  return {
    commandId: input.command.id,
    durationMs: execution.durationMs,
    exitCode: execution.exitCode,
    failureType,
    mutationPaths: execution.mutation.changedPaths,
    mutationState: execution.mutation.state,
    outputExcerpt: execution.failure ? `${output}\n${execution.failure.message}`.trim() : output,
    signal: execution.signal,
    status: execution.status === "cancelled" ? "CANCELLED" : execution.status === "passed" ? "PASSED" : "FAILED"
  };
}

export async function runCodeCommandSuite(input: {
  abortSignal?: AbortSignal;
  commands: CodeCommandSpec[];
  executionGrantId: string;
  expectedWorkspaceFingerprint: string;
  externalUserId: string;
  projectId: string;
  workspaceRoot: string;
}) {
  const results: CodeCommandResult[] = [];
  let expectedWorkspaceFingerprint = input.expectedWorkspaceFingerprint;
  for (const command of input.commands) {
    const result = await runBoundedCodeCommand({
      abortSignal: input.abortSignal,
      command,
      executionGrantId: input.executionGrantId,
      expectedWorkspaceFingerprint,
      externalUserId: input.externalUserId,
      projectId: input.projectId,
      workspaceRoot: input.workspaceRoot
    });
    results.push(result);
    if (result.status === "CANCELLED" || result.failureType === "PROCESS_TEARDOWN_ERROR") break;
    if (result.mutationState === "unexpected") break;
    if (result.mutationState === "expected") {
      clearCodeRepositoryInspectionCache(input.workspaceRoot);
      expectedWorkspaceFingerprint = (await inspectCodeRepository(input.workspaceRoot)).fingerprint;
    }
  }
  return results;
}
