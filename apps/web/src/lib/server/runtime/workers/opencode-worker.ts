import { spawn } from "node:child_process";
import { access, rm } from "node:fs/promises";
import { join } from "node:path";
import type { RuntimeAdapter } from "@/lib/server/runtime/runtime-adapter";
import {
  createGitSnapshotSafety,
  finalizeGitSnapshotSafety,
  rollbackGitSnapshotFiles
} from "@/lib/server/runtime/git-snapshot-safety";
import { validateApprovedExecutionPlan } from "@/lib/server/runtime/runtime-permissions";
import type {
  ApprovedExecutionPlan,
  RuntimeAdapterResult,
  RuntimeBlockedReason,
  RuntimeEvent,
  RuntimeSession,
  RuntimeVerificationResult
} from "@/lib/server/runtime/runtime-types";
import { isServerOwnedProjectWorkspaceRoot } from "@/lib/server/runtime/workspace-binding";
import { getOpenCodeWorkerConfig } from "@/lib/server/runtime/workers/opencode-worker-config";
import type {
  OpenCodeWorkerConfig,
  OpenCodeWorkerExecution,
  OpenCodeWorkerInput,
  OpenCodeWorkerResult,
  OpenCodeWorkerStatus
} from "@/lib/server/runtime/workers/opencode-worker-types";

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

function approvedPlanToOpenCodeTask(plan: ApprovedExecutionPlan) {
  const steps = plan.steps
    .map((step, index) => {
      const content = typeof step.content === "string"
        ? `\nApproved content:\n\`\`\`\n${step.content}\n\`\`\``
        : "";

      return `${index + 1}. ${step.tool}${step.path ? ` ${step.path}` : ""}: ${step.summary}${content}`;
    })
    .join("\n\n");

  return [
    "You are OpenCode running as an optional Hassali runtime worker.",
    "Hassali is the source of truth. Do not reinterpret the user request beyond this approved plan.",
    "Operate only inside the current server-owned project workspace.",
    "Apply only the approved CODE-mode steps listed below.",
    "Do not install packages, run shell commands, change providers, or edit files outside this workspace.",
    "If a requested action is outside the approved plan, leave it unchanged.",
    `Approved plan: ${plan.id}`,
    `Plan summary: ${plan.summary}`,
    "Approved file paths and operations:",
    steps || "No approved file-edit steps were provided."
  ].join("\n\n");
}

function rollbackFilesForApprovedPlan(plan: ApprovedExecutionPlan, changedFiles: string[]) {
  const approvedPaths = plan.steps
    .map((step) => step.path?.replace(/\\/g, "/"))
    .filter((path): path is string => Boolean(path));

  return changedFiles.filter((file) => {
    const normalized = file.replace(/\\/g, "/");

    return approvedPaths.some((approvedPath) =>
      normalized === approvedPath ||
      normalized.endsWith(`/${approvedPath}`) ||
      approvedPath.endsWith(`/${normalized}`)
    );
  });
}

async function captureApprovedPathState(plan: ApprovedExecutionPlan) {
  const entries = await Promise.all(
    plan.steps
      .map((step) => step.path?.replace(/\\/g, "/"))
      .filter((path): path is string => Boolean(path))
      .map(async (path) => {
        try {
          await access(join(plan.workspaceRoot, path));

          return [path, true] as const;
        } catch {
          return [path, false] as const;
        }
      })
  );

  return new Map(entries);
}

async function removeNewApprovedFiles(input: {
  pathState: Map<string, boolean>;
  plan: ApprovedExecutionPlan;
  sessionId: string;
}) {
  const events: RuntimeEvent[] = [];
  const errors: string[] = [];

  for (const [path, existedBefore] of input.pathState) {
    if (existedBefore) {
      continue;
    }

    try {
      await rm(join(input.plan.workspaceRoot, path), { force: true });
      events.push(event({
        message: `Removed newly-created approved file '${path}' after failed OpenCode worker execution.`,
        sessionId: input.sessionId,
        type: "rollback_applied"
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : `Unable to remove '${path}' after failed OpenCode worker execution.`;

      errors.push(message);
      events.push(event({
        message,
        sessionId: input.sessionId,
        type: "rollback_failed"
      }));
    }
  }

  return { errors, events };
}

function executeOpenCodeCli(input: {
  config: OpenCodeWorkerConfig;
  task: string;
  workspaceRoot: string;
}): Promise<OpenCodeWorkerExecution> {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const args = [...input.config.args, input.task];
    const child = spawn(input.config.command, args, {
      cwd: input.workspaceRoot,
      shell: false,
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;
    let commandMissing = false;
    const finish = (exitCode: number | null) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      resolve({
        commandMissing,
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
    child.on("error", (error: NodeJS.ErrnoException) => {
      commandMissing = error.code === "ENOENT";
      stderr = appendLimited(stderr, error.message);
      finish(null);
    });
    child.on("close", (code) => finish(code));
  });
}

function verificationFor(status: OpenCodeWorkerStatus, execution: OpenCodeWorkerExecution | null): RuntimeVerificationResult {
  return {
    checkedAt: now(),
    details: [
      `OpenCode worker status: ${status}`,
      execution ? `OpenCode exit code: ${execution.exitCode ?? "none"}` : "OpenCode CLI was not executed."
    ],
    ok: status === "completed"
  };
}

function unavailableResult(input: OpenCodeWorkerInput, message: string): OpenCodeWorkerResult {
  return {
    changedFiles: [],
    durationMs: 0,
    errors: [message],
    events: [
      event({
        message,
        sessionId: input.sessionId,
        type: "opencode_worker_unavailable"
      })
    ],
    exitCode: null,
    snapshot: null,
    snapshotId: null,
    status: "unavailable",
    stderr: "",
    stdout: "",
    verification: verificationFor("unavailable", null),
    workerType: "opencode"
  };
}

function blockedResult(input: OpenCodeWorkerInput, message: string, events: RuntimeEvent[] = []): OpenCodeWorkerResult {
  return {
    changedFiles: [],
    durationMs: 0,
    errors: [message],
    events: [
      ...events,
      event({
        message,
        sessionId: input.sessionId,
        type: "opencode_worker_failed"
      })
    ],
    exitCode: null,
    snapshot: null,
    snapshotId: null,
    status: "blocked",
    stderr: "",
    stdout: "",
    verification: verificationFor("blocked", null),
    workerType: "opencode"
  };
}

export async function runOpenCodeWorker(input: OpenCodeWorkerInput): Promise<OpenCodeWorkerResult> {
  const config = getOpenCodeWorkerConfig(input.config);

  if (!config.enabled) {
    return unavailableResult(input, "OpenCode worker is disabled. Set ENABLE_OPENCODE_WORKER=true to allow this optional worker.");
  }

  if (input.plan.mode !== "CODE") {
    return blockedResult(input, "OpenCode worker only accepts approved CODE-mode execution plans.");
  }

  const permissionReasons = validateApprovedExecutionPlan(input.plan);

  if (permissionReasons.length > 0) {
    return blockedResult(input, permissionReasons.map((reason) => reason.message).join(" "));
  }

  const serverOwnedWorkspace = await isServerOwnedProjectWorkspaceRoot(input.plan.workspaceRoot);

  if (!serverOwnedWorkspace) {
    return blockedResult(input, "OpenCode worker requires a server-owned Hassali project workspace.");
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
      "OpenCode worker requires an available Git snapshot before execution.",
      snapshotBefore.events
    );
  }

  const task = approvedPlanToOpenCodeTask(input.plan);
  const approvedPathState = await captureApprovedPathState(input.plan);
  const started = event({
    message: "OpenCode worker started for approved execution plan.",
    metadata: {
      planId: input.plan.id,
      timeoutMs: config.timeoutMs
    },
    sessionId: input.sessionId,
    type: "opencode_worker_started"
  });
  const execution = await executeOpenCodeCli({
    config,
    task,
    workspaceRoot: input.plan.workspaceRoot
  });
  const status: OpenCodeWorkerStatus = execution.timedOut
    ? "timeout"
    : execution.commandMissing
      ? "unavailable"
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
  const rollbackFiles = rollbackFilesForApprovedPlan(input.plan, snapshotAfter.changedFiles);
  const rollback = !verification.ok && snapshotAfter.rollbackAvailable && snapshotAfter.beforeRef && rollbackFiles.length > 0
    ? await rollbackGitSnapshotFiles({
        beforeRef: snapshotAfter.beforeRef,
        changedFiles: rollbackFiles,
        runnerId: input.sessionId,
        workspaceRoot: input.plan.workspaceRoot
      })
    : null;
  const newFileCleanup = !verification.ok
    ? await removeNewApprovedFiles({
        pathState: approvedPathState,
        plan: input.plan,
        sessionId: input.sessionId
      })
    : null;
  const finalSnapshot = rollback
    ? {
        ...snapshotAfter,
        errors: [...snapshotAfter.errors, ...rollback.errors, ...(newFileCleanup?.errors ?? [])],
        events: [...snapshotAfter.events, ...rollback.events, ...(newFileCleanup?.events ?? [])],
        rollbackApplied: rollback.rollbackApplied || Boolean(newFileCleanup?.events.length),
        rollbackAvailable: rollback.rollbackAvailable || Boolean(newFileCleanup?.errors.length)
      }
    : newFileCleanup
      ? {
          ...snapshotAfter,
          errors: [...snapshotAfter.errors, ...newFileCleanup.errors],
          events: [...snapshotAfter.events, ...newFileCleanup.events],
          rollbackApplied: Boolean(newFileCleanup.events.length),
          rollbackAvailable: Boolean(newFileCleanup.errors.length)
        }
      : snapshotAfter;
  const completedEventType: RuntimeEvent["type"] =
    status === "completed"
      ? "opencode_worker_completed"
      : status === "timeout"
        ? "opencode_worker_timeout"
        : status === "unavailable"
          ? "opencode_worker_unavailable"
          : "opencode_worker_failed";

  return {
    changedFiles: finalSnapshot.changedFiles,
    durationMs: execution.durationMs,
    errors: status === "completed" ? [] : [execution.stderr || `OpenCode worker ${status}.`],
    events: [
      ...snapshotBefore.events,
      started,
      event({
        message: `OpenCode worker ${status}.`,
        metadata: {
          changedFileCount: finalSnapshot.changedFiles.length,
          durationMs: execution.durationMs,
          exitCode: execution.exitCode
        },
        sessionId: input.sessionId,
        type: completedEventType
      }),
      ...finalSnapshot.events.slice(snapshotBefore.events.length)
    ],
    exitCode: execution.exitCode,
    snapshot: {
      afterRef: finalSnapshot.afterRef,
      beforeRef: finalSnapshot.beforeRef,
      changedFiles: finalSnapshot.changedFiles,
      rollbackApplied: finalSnapshot.rollbackApplied,
      rollbackAvailable: finalSnapshot.rollbackAvailable,
      snapshotId: finalSnapshot.snapshotId,
      snapshotStatus: finalSnapshot.snapshotStatus
    },
    snapshotId: finalSnapshot.snapshotId,
    status,
    stderr: execution.stderr,
    stdout: execution.stdout,
    verification,
    workerType: "opencode"
  };
}

function createSession(input: { projectId: string; workspaceRoot: string }): RuntimeSession {
  return {
    adapterName: "opencode-runtime-adapter",
    createdAt: now(),
    id: `opencode-runtime-adapter-${Date.now()}`,
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
  workerResult: OpenCodeWorkerResult
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
      : [blocked(code, workerResult.errors[0] ?? `OpenCode worker ${workerResult.status}.`)],
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

export class OpenCodeRuntimeAdapter implements RuntimeAdapter {
  async startSession(input: { projectId: string; workspaceRoot: string }): Promise<RuntimeSession> {
    return createSession(input);
  }

  async sendApprovedPlan(session: RuntimeSession, plan: ApprovedExecutionPlan): Promise<RuntimeAdapterResult> {
    if (session.projectId !== plan.projectId || session.workspaceRoot !== plan.workspaceRoot) {
      return blockedAdapterResult(session, "missing_workspace_root", "OpenCode session must match the approved plan workspace.");
    }

    const workerResult = await runOpenCodeWorker({
      plan,
      sessionId: session.id
    });

    return workerResultToAdapterResult(session, workerResult);
  }

  async *streamEvents(session: RuntimeSession): AsyncIterable<RuntimeEvent> {
    yield event({
      message: "OpenCode runtime adapter event stream opened.",
      sessionId: session.id,
      type: "session_started"
    });
  }

  async readFile(session: RuntimeSession): Promise<RuntimeAdapterResult> {
    return blockedAdapterResult(session, "unknown_tool", "OpenCode adapter does not expose direct file reads.");
  }

  async writeFile(session: RuntimeSession, path: string, content: string): Promise<RuntimeAdapterResult> {
    const plan: ApprovedExecutionPlan = {
      approvedAt: now(),
      createdAt: now(),
      id: `opencode-single-write-${Date.now()}`,
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
      summary: "Single approved OpenCode write",
      workspaceRoot: session.workspaceRoot
    };

    return this.sendApprovedPlan(session, plan);
  }

  async applyPatch(session: RuntimeSession, path: string, patch: string): Promise<RuntimeAdapterResult> {
    const plan: ApprovedExecutionPlan = {
      approvedAt: now(),
      createdAt: now(),
      id: `opencode-single-patch-${Date.now()}`,
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
      summary: "Single approved OpenCode patch",
      workspaceRoot: session.workspaceRoot
    };

    return this.sendApprovedPlan(session, plan);
  }

  async verify(session: RuntimeSession): Promise<RuntimeVerificationResult> {
    return {
      checkedAt: now(),
      details: [`OpenCode adapter verification for session '${session.id}' is reported through worker execution results.`],
      ok: true
    };
  }

  async stopSession(session: RuntimeSession): Promise<RuntimeAdapterResult> {
    return {
      blockedReasons: [],
      events: [
        event({
          message: "OpenCode runtime adapter session stopped.",
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

export function createOpenCodeRuntimeAdapter() {
  return new OpenCodeRuntimeAdapter();
}
