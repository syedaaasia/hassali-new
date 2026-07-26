import type { ChildProcessWithoutNullStreams } from "node:child_process";
import type {
  NextRuntimeLog,
  NextRuntimeRecord,
  NextRuntimeStatus
} from "@/lib/server/runtime/next-runtime-types";
import {
  recordRuntimeStreamEvent,
  sanitizeRuntimeText
} from "@/lib/server/runtime/runtime-event-buffer";
import { stopOwnedChild } from "@/lib/server/runtime/owned-runtime-safety";

type ManagedNextRuntime = {
  child: ChildProcessWithoutNullStreams | null;
  record: NextRuntimeRecord;
};

const maxRuntimeLogs = 400;
const runtimes = new Map<string, ManagedNextRuntime>();

function now() {
  return new Date().toISOString();
}

function serializeLog(log: NextRuntimeLog) {
  return `[${log.stream}] ${sanitizeRuntimeText(log.text)}`;
}

function appendRecordLog(record: NextRuntimeRecord, stream: NextRuntimeLog["stream"], text: string) {
  const logs = text
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => ({
      createdAt: now(),
      stream,
      text: sanitizeRuntimeText(line)
    }));

  return {
    ...record,
    logs: [...record.logs, ...logs].slice(-maxRuntimeLogs)
  };
}

function publicRecord(record: NextRuntimeRecord): NextRuntimeRecord {
  return {
    ...record,
    logs: [...record.logs]
  };
}

export function getRuntime(projectId: string) {
  const runtime = runtimes.get(projectId);

  return runtime ? publicRecord(runtime.record) : null;
}

export function runtimeLogLines(record: NextRuntimeRecord | null) {
  return record?.logs.map(serializeLog) ?? [];
}

export function appendRuntimeLog(projectId: string, stream: NextRuntimeLog["stream"], text: string) {
  const runtime = runtimes.get(projectId);

  if (!runtime) return null;

  runtime.record = appendRecordLog(runtime.record, stream, text);
  recordRuntimeStreamEvent({
    framework: "next",
    message: text,
    port: runtime.record.port,
    previewUrl: runtime.record.previewUrl,
    projectId,
    runtimeId: runtime.record.runtimeId,
    status: runtime.record.status,
    stream,
    type: stream === "system" ? "status" : "log"
  });

  return publicRecord(runtime.record);
}

export function markRuntimeStatus(
  projectId: string,
  status: NextRuntimeStatus,
  error: string | null = null
) {
  const runtime = runtimes.get(projectId);

  if (!runtime) return null;

  runtime.record = {
    ...runtime.record,
    error,
    status
  };
  recordRuntimeStreamEvent({
    error,
    framework: "next",
    message: error ?? `Next.js runtime status: ${status}`,
    port: runtime.record.port,
    previewUrl: runtime.record.previewUrl,
    projectId,
    runtimeId: runtime.record.runtimeId,
    status,
    stream: "system",
    type: status === "error" ? "error" : status === "running" ? "health" : "status"
  });

  return publicRecord(runtime.record);
}

export function startRuntime(input: {
  child: ChildProcessWithoutNullStreams;
  port: number;
  previewUrl: string;
  projectId: string;
  routerKind: NextRuntimeRecord["routerKind"];
  runtimeId: string;
  workspaceRoot: string;
}) {
  const record: NextRuntimeRecord = {
    error: null,
    framework: "next_app",
    logs: [{
      createdAt: now(),
      stream: "system",
      text: `Next.js runtime starting on ${input.previewUrl}`
    }],
    pid: input.child.pid ?? null,
    port: input.port,
    previewUrl: input.previewUrl,
    projectId: input.projectId,
    routerKind: input.routerKind,
    runtimeId: input.runtimeId,
    startedAt: now(),
    status: "starting",
    workspaceRoot: input.workspaceRoot
  };

  runtimes.set(input.projectId, {
    child: input.child,
    record
  });
  recordRuntimeStreamEvent({
    framework: "next",
    message: `Next.js runtime starting on ${input.previewUrl}`,
    port: input.port,
    previewUrl: input.previewUrl,
    projectId: input.projectId,
    runtimeId: input.runtimeId,
    status: "starting",
    stream: "system",
    type: "started"
  });

  return publicRecord(record);
}

export async function stopRuntime(projectId: string) {
  const runtime = runtimes.get(projectId);

  if (!runtime) {
    return null;
  }

  runtime.record = appendRecordLog(runtime.record, "system", "Stopping Next.js runtime.");

  if (runtime.child && !runtime.child.killed) {
    await stopOwnedChild(runtime.child);
    runtime.child.stdout.removeAllListeners();
    runtime.child.stderr.removeAllListeners();
  }

  runtime.record = {
    ...runtime.record,
    error: null,
    pid: null,
    status: "stopped"
  };
  runtime.record = appendRecordLog(runtime.record, "system", "Next.js runtime stopped.");
  recordRuntimeStreamEvent({
    framework: "next",
    message: "Next.js runtime stopped.",
    port: runtime.record.port,
    previewUrl: runtime.record.previewUrl,
    projectId,
    runtimeId: runtime.record.runtimeId,
    status: "stopped",
    stream: "system",
    type: "stopped"
  });
  const stopped = publicRecord(runtime.record);
  runtimes.delete(projectId);

  return stopped;
}

export async function restartRuntime(input: Parameters<typeof startRuntime>[0]) {
  await stopRuntime(input.projectId);

  return startRuntime(input);
}
