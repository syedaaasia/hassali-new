import { spawn } from "node:child_process";
import type { RuntimeAdapter } from "@/lib/server/runtime/runtime-adapter";
import {
  createGitSnapshotSafety,
  finalizeGitSnapshotSafety
} from "@/lib/server/runtime/git-snapshot-safety";
import {
  validateApprovedExecutionPlan
} from "@/lib/server/runtime/runtime-permissions";
import type {
  ApprovedExecutionPlan,
  RuntimeAdapterResult,
  RuntimeBlockedReason,
  RuntimeEvent,
  RuntimeSession,
  RuntimeVerificationResult
} from "@/lib/server/runtime/runtime-types";
import { isServerOwnedProjectWorkspaceRoot } from "@/lib/server/runtime/workspace-binding";
import { getAiderWorkerConfig } from "@/lib/server/runtime/workers/aider-worker-config";
import type {
  AiderWorkerConfig,
  AiderWorkerExecution,
  AiderWorkerInput,
  AiderWorkerResult,
  AiderWorkerStatus
} from "@/lib/server/runtime/workers/aider-worker-types";

const outputLimit = 200_000;

function now() {
  return new Date().toISOString();
}

function event(input: {
  message: string;
  metadata?: RuntimeEvent["metadata"];
  sessionId: string;
  type: RuntimeEvent["type"];
}): RuntimeEvent {
  return {
    createdAt: now(),
    message: input.message,
    metadata: input.metadata,
    sessionId: input.sessionId,
    type: input.type
  };
}

function blocked(code: RuntimeBlockedReason["code"], message: string): RuntimeBlockedReason {
  return {
    code,
    message,
    severity: "high"
  };
}

function appendLimited(current: string, next: string) {
  const combined = `${current}${next}`;

  return combined.length > outputLimit ? combined.slice(combined.length - outputLimit) : combined;
}

function approvedPlanToAiderTask(plan: ApprovedExecutionPlan) {
  const steps = plan.steps
    .map((step, index) => {
      const header = `${index + 1}. ${step.tool}${step.path ? ` ${step.path}` : ""}: ${step.summary}`;
      const content = typeof step.content === "string"
        ? `\nApproved content:\n\`\`\`\n${step.content}\n\`\`\``
        : "";

      return `${header}${content}`;
    })
    .join("\n\n");

  return [
    "You are running as an optional Hassali runtime worker.",
    "Hassali has already classified, validated, repaired, and approved this plan.",
    "Apply only the approved steps below inside the current project workspace.",
    "Do not install packages, run shell commands, change providers, or edit files outside this workspace.",
    `Approved plan: ${plan.id}`,
    `Plan summary: ${plan.summary}`,
    "Approved steps:",
    steps || "No approved file-edit steps were provided."
  ].join("\n\n");
}

function executeAiderCli(input: {
  config: AiderWorkerConfig;
  task: string;
  workspaceRoot: string;
}): Promise<AiderWorkerExecution> {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const args = [...input.config.args, "--yes", "--message", input.task];
    const child = spawn(input.config.command, args, {
      cwd: input.workspaceRoot,
      shell: false,
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;
    const finish = (exitCode: number | null) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      resolve({
        durationMs: Date.now() - startedAt,
        exitCode,
        stderr,
        stdout,
        timedOut
      });
    };
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill();
      finish(null);
    }, input.config.timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout = appendLimited(stdout, chunk.toString());
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = appendLimited(stderr, chunk.toString());
    });
    child.on("error", (error) => {
      stderr = appendLimited(stderr, error.message);
      finish(null);
    });
    child.on("close", (code) => finish(code));
  });
}

function verificationFor(status: AiderWorkerStatus, execution: AiderWorkerExecution | null): RuntimeVerificationResult {
  return {
    checkedAt: now(),
    details: [
      `Aider worker status: ${status}`,
      execution ? `Aider exit code: ${execution.exitCode ?? "none"}` : "Aider CLI was not executed."
    ],
    ok: status === "completed"
  };
}

function unavailableResult(input: AiderWorkerInput, message: string): AiderWorkerResult {
  return {
    changedFiles: [],
    durationMs: 0,
    errors: [message],
    events: [
      event({
        message,
        sessionId: input.sessionId,
        type: "aider_worker_unavailable"
      })
    ],
    exitCode: null,
    snapshot: null,
    snapshotId: null,
    status: "unavailable",
    stderr: "",
    stdout: "",
    verification: verificationFor("unavailable", null),
    workerType: "aider"
  };
}

function blockedResult(input: AiderWorkerInput, message: string, events: RuntimeEvent[] = []): AiderWorkerResult {
  return {
    changedFiles: [],
    durationMs: 0,
    errors: [message],
    events: [
      ...events,
      event({
        message,
        sessionId: input.sessionId,
        type: "aider_worker_failed"
      })
    ],
    exitCode: null,
    snapshot: null,
    snapshotId: null,
    status: "blocked",
    stderr: "",
    stdout: "",
    verification: verificationFor("blocked", null),
    workerType: "aider"
  };
}

export async function runAiderWorker(input: AiderWorkerInput): Promise<AiderWorkerResult> {
  const config = getAiderWorkerConfig(input.config);

  if (!config.enabled) {
    return unavailableResult(input, "Aider worker is disabled. Set ENABLE_AIDER_WORKER=true to allow this optional worker.");
  }

  const permissionReasons = validateApprovedExecutionPlan(input.plan);

  if (permissionReasons.length > 0) {
    return blockedResult(input, permissionReasons.map((reason) => reason.message).join(" "));
  }

  const serverOwnedWorkspace = await isServerOwnedProjectWorkspaceRoot(input.plan.workspaceRoot);

  if (!serverOwnedWorkspace) {
    return blockedResult(input, "Aider worker requires a server-owned Hassali project workspace.");
  }

  const snapshotBefore = await createGitSnapshotSafety({
    planId: input.plan.id,
    projectId: input.plan.projectId,
    runnerId: input.sessionId,
    workspaceRoot: input.plan.workspaceRoot
  });

  if (snapshotBefore.snapshotStatus !== "available") {
    return blockedResult(
      input,
      "Aider worker requires an available Git snapshot before execution.",
      snapshotBefore.events
    );
  }

  const task = approvedPlanToAiderTask(input.plan);
  const started = event({
    message: "Aider worker started for approved execution plan.",
    metadata: {
      planId: input.plan.id,
      timeoutMs: config.timeoutMs
    },
    sessionId: input.sessionId,
    type: "aider_worker_started"
  });
  const execution = await executeAiderCli({
    config,
    task,
    workspaceRoot: input.plan.workspaceRoot
  });
  const status: AiderWorkerStatus = execution.timedOut
    ? "timeout"
    : execution.exitCode === 0
      ? "completed"
      : "failed";
  const verification = verificationFor(status, execution);
  const snapshotAfter = await finalizeGitSnapshotSafety(
    {
      planId: input.plan.id,
      projectId: input.plan.projectId,
      runnerId: input.sessionId,
      workspaceRoot: input.plan.workspaceRoot
    },
    snapshotBefore,
    verification.ok
  );
  const completedEventType: RuntimeEvent["type"] =
    status === "completed"
      ? "aider_worker_completed"
      : status === "timeout"
        ? "aider_worker_timeout"
        : "aider_worker_failed";

  return {
    changedFiles: snapshotAfter.changedFiles,
    durationMs: execution.durationMs,
    errors: status === "completed" ? [] : [execution.stderr || `Aider worker ${status}.`],
    events: [
      ...snapshotBefore.events,
      started,
      event({
        message: `Aider worker ${status}.`,
        metadata: {
          changedFileCount: snapshotAfter.changedFiles.length,
          durationMs: execution.durationMs,
          exitCode: execution.exitCode
        },
        sessionId: input.sessionId,
        type: completedEventType
      }),
      ...snapshotAfter.events.slice(snapshotBefore.events.length)
    ],
    exitCode: execution.exitCode,
    snapshot: {
      afterRef: snapshotAfter.afterRef,
      beforeRef: snapshotAfter.beforeRef,
      changedFiles: snapshotAfter.changedFiles,
      rollbackApplied: snapshotAfter.rollbackApplied,
      rollbackAvailable: snapshotAfter.rollbackAvailable,
      snapshotId: snapshotAfter.snapshotId,
      snapshotStatus: snapshotAfter.snapshotStatus
    },
    snapshotId: snapshotAfter.snapshotId,
    status,
    stderr: execution.stderr,
    stdout: execution.stdout,
    verification,
    workerType: "aider"
  };
}

function createSession(input: { projectId: string; workspaceRoot: string }): RuntimeSession {
  return {
    adapterName: "aider-runtime-adapter",
    createdAt: now(),
    id: `aider-runtime-adapter-${Date.now()}`,
    projectId: input.projectId,
    status: "running",
    workspaceRoot: input.workspaceRoot
  };
}

function blockedAdapterResult(
  session: RuntimeSession,
  code: RuntimeBlockedReason["code"],
  message: string
): RuntimeAdapterResult {
  return {
    blockedReasons: [blocked(code, message)],
    events: [
      event({
        message,
        sessionId: session.id,
        type: "blocked"
      })
    ],
    ok: false,
    session: {
      ...session,
      status: "failed"
    }
  };
}

function workerResultToAdapterResult(
  session: RuntimeSession,
  workerResult: AiderWorkerResult
): RuntimeAdapterResult {
  const code: RuntimeBlockedReason["code"] =
    workerResult.status === "unavailable"
      ? "runtime_worker_unavailable"
      : workerResult.status === "timeout"
        ? "runtime_worker_timeout"
        : workerResult.status === "blocked"
          ? "missing_snapshot"
          : "write_not_allowed";

  return {
    blockedReasons: workerResult.status === "completed"
      ? []
      : [blocked(code, workerResult.errors[0] ?? `Aider worker ${workerResult.status}.`)],
    events: workerResult.events,
    ok: workerResult.status === "completed",
    session: {
      ...session,
      status: workerResult.status === "completed" ? "completed" : "failed"
    },
    snapshot: workerResult.snapshot ?? undefined,
    verification: workerResult.verification ?? undefined,
    workerResult
  };
}

export class AiderRuntimeAdapter implements RuntimeAdapter {
  async startSession(input: { projectId: string; workspaceRoot: string }): Promise<RuntimeSession> {
    return createSession(input);
  }

  async sendApprovedPlan(session: RuntimeSession, plan: ApprovedExecutionPlan): Promise<RuntimeAdapterResult> {
    if (session.projectId !== plan.projectId || session.workspaceRoot !== plan.workspaceRoot) {
      return blockedAdapterResult(session, "missing_workspace_root", "Aider session must match the approved plan workspace.");
    }

    const workerResult = await runAiderWorker({
      plan,
      sessionId: session.id
    });

    return workerResultToAdapterResult(session, workerResult);
  }

  async *streamEvents(session: RuntimeSession): AsyncIterable<RuntimeEvent> {
    yield event({
      message: "Aider runtime adapter event stream opened.",
      sessionId: session.id,
      type: "session_started"
    });
  }

  async readFile(session: RuntimeSession): Promise<RuntimeAdapterResult> {
    return blockedAdapterResult(session, "unknown_tool", "Aider adapter does not expose direct file reads.");
  }

  async writeFile(session: RuntimeSession, path: string, content: string): Promise<RuntimeAdapterResult> {
    const plan: ApprovedExecutionPlan = {
      approvedAt: now(),
      createdAt: now(),
      id: `aider-single-write-${Date.now()}`,
      mode: "CODE",
      projectId: session.projectId,
      steps: [{
        approved: true,
        content,
        id: "write_file",
        path,
        summary: `Write approved file ${path}`,
        tool: "write_file"
      }],
      summary: "Single approved Aider write",
      workspaceRoot: session.workspaceRoot
    };

    return this.sendApprovedPlan(session, plan);
  }

  async applyPatch(session: RuntimeSession, path: string, patch: string): Promise<RuntimeAdapterResult> {
    const plan: ApprovedExecutionPlan = {
      approvedAt: now(),
      createdAt: now(),
      id: `aider-single-patch-${Date.now()}`,
      mode: "CODE",
      projectId: session.projectId,
      steps: [{
        approved: true,
        content: patch,
        id: "apply_patch",
        path,
        summary: `Apply approved patch ${path}`,
        tool: "apply_patch"
      }],
      summary: "Single approved Aider patch",
      workspaceRoot: session.workspaceRoot
    };

    return this.sendApprovedPlan(session, plan);
  }

  async verify(session: RuntimeSession): Promise<RuntimeVerificationResult> {
    return {
      checkedAt: now(),
      details: [`Aider adapter verification for session '${session.id}' is reported through worker execution results.`],
      ok: true
    };
  }

  async stopSession(session: RuntimeSession): Promise<RuntimeAdapterResult> {
    return {
      blockedReasons: [],
      events: [
        event({
          message: "Aider runtime adapter session stopped.",
          sessionId: session.id,
          type: "session_stopped"
        })
      ],
      ok: true,
      session: {
        ...session,
        status: "stopped"
      }
    };
  }
}

export function createAiderRuntimeAdapter() {
  return new AiderRuntimeAdapter();
}
