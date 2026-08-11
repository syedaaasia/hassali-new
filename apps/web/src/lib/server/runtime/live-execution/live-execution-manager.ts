import { randomUUID } from "node:crypto";
import { sanitizeUntrustedToolText } from "@/lib/server/intelligence/security-kernel";
import { sanitizeRuntimeText } from "../runtime-event-buffer";
import type {
  ExecutionTimelineEvent,
  ExecutionTimelineStage,
  ExecutionTimelineStatus,
  GitDeliveryState,
  LiveExecutionTaskDeliveryContext,
  LiveExecutionTaskSnapshot,
  LiveExecutionTaskStatus,
  LiveTaskOutputChunk,
  VerifiedDeliveryProjection
} from "./live-execution-types";

const terminalTtlMs = 60 * 60 * 1000;
const activeTtlMs = 6 * 60 * 60 * 1000;
const maxTasks = 64;
const maxActiveTasksPerProject = 2;
const maxTimelineEvents = 160;
const maxOutputChunks = 180;
const maxOutputBytes = 64_000;
const maxDetailLength = 1_200;

type TaskRecord = LiveExecutionTaskSnapshot & {
  abortController: AbortController;
  deliveryContext: LiveExecutionTaskDeliveryContext | null;
  externalUserId: string;
  outputBytes: number;
  workspaceRoot: string;
};

const tasks = new Map<string, TaskRecord>();

function now() {
  return new Date().toISOString();
}

function isTerminal(status: LiveExecutionTaskStatus) {
  return status === "blocked" || status === "cancelled" || status === "completed" || status === "failed";
}

function sanitizeText(value: string, maxLength = maxDetailLength) {
  const runtimeSafe = sanitizeRuntimeText(value)
    .replace(/\b(?:Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/\b(?:sk|pk)_[A-Za-z0-9_-]{12,}\b/g, "[redacted]");
  return sanitizeUntrustedToolText(runtimeSafe).sanitized.trim().slice(0, maxLength);
}

function expiryFor(status: LiveExecutionTaskStatus) {
  return new Date(Date.now() + (isTerminal(status) ? terminalTtlMs : activeTtlMs)).toISOString();
}

function prune() {
  const current = Date.now();
  for (const [taskId, task] of tasks) {
    if (Date.parse(task.expiresAt) <= current) {
      if (!isTerminal(task.status)) task.abortController.abort();
      tasks.delete(taskId);
    }
  }
  while (tasks.size > maxTasks) {
    const oldestTerminal = [...tasks.entries()].find(([, task]) => isTerminal(task.status));
    const oldest = oldestTerminal ?? tasks.entries().next().value as [string, TaskRecord] | undefined;
    if (!oldest) break;
    if (!isTerminal(oldest[1].status)) oldest[1].abortController.abort();
    tasks.delete(oldest[0]);
  }
}

function publicSnapshot(task: TaskRecord): LiveExecutionTaskSnapshot {
  return {
    cancellable: task.cancellable,
    completedAt: task.completedAt,
    createdAt: task.createdAt,
    delivery: task.delivery,
    expiresAt: task.expiresAt,
    git: task.git,
    kind: task.kind,
    mode: task.mode,
    objective: task.objective,
    output: task.output,
    outputTruncated: task.outputTruncated,
    projectId: task.projectId,
    proposalId: task.proposalId,
    startedAt: task.startedAt,
    status: task.status,
    taskId: task.taskId,
    timeline: task.timeline,
    updatedAt: task.updatedAt
  };
}

function requireOwnedTask(input: { externalUserId: string; projectId: string; taskId: string }) {
  prune();
  const task = tasks.get(input.taskId);
  return task && task.externalUserId === input.externalUserId && task.projectId === input.projectId
    ? task
    : null;
}

export function createLiveExecutionTask(input: {
  externalUserId: string;
  kind?: LiveExecutionTaskSnapshot["kind"];
  objective: string;
  projectId: string;
  proposalId?: string | null;
  workspaceRoot: string;
}) {
  prune();
  const activeCount = [...tasks.values()].filter((task) =>
    task.externalUserId === input.externalUserId &&
    task.projectId === input.projectId &&
    !isTerminal(task.status)
  ).length;
  if (activeCount >= maxActiveTasksPerProject) {
    throw new Error("This project already has the maximum number of active Hassali tasks.");
  }
  const createdAt = now();
  const taskId = `task_${randomUUID()}`;
  const task: TaskRecord = {
    abortController: new AbortController(),
    cancellable: true,
    completedAt: null,
    createdAt,
    delivery: null,
    deliveryContext: null,
    expiresAt: expiryFor("queued"),
    externalUserId: input.externalUserId,
    git: null,
    kind: input.kind ?? "code_execution",
    mode: "CODE",
    objective: sanitizeText(input.objective, 1_000),
    output: [],
    outputBytes: 0,
    outputTruncated: false,
    projectId: input.projectId,
    proposalId: input.proposalId ?? null,
    startedAt: null,
    status: "queued",
    taskId,
    timeline: [],
    updatedAt: createdAt,
    workspaceRoot: input.workspaceRoot
  };
  tasks.set(taskId, task);
  appendLiveTaskTimeline({
    detail: "The approved CODE task is queued inside the owned project workspace.",
    externalUserId: input.externalUserId,
    projectId: input.projectId,
    source: "approval",
    stage: "approval",
    status: "complete",
    taskId,
    title: "Approval confirmed"
  });
  return publicSnapshot(task);
}

export function startLiveExecutionTask(input: { externalUserId: string; projectId: string; taskId: string }) {
  const task = requireOwnedTask(input);
  if (!task || task.status !== "queued") return null;
  task.status = "running";
  task.startedAt = now();
  task.updatedAt = task.startedAt;
  task.expiresAt = expiryFor(task.status);
  return task.abortController.signal;
}

export function appendLiveTaskTimeline(input: {
  artifact?: ExecutionTimelineEvent["artifact"];
  blocking?: boolean;
  command?: ExecutionTimelineEvent["command"];
  detail?: string | null;
  durationMs?: number | null;
  execution?: ExecutionTimelineEvent["execution"];
  externalUserId: string;
  progress?: ExecutionTimelineEvent["progress"];
  projectId: string;
  source: ExecutionTimelineEvent["source"];
  stage: ExecutionTimelineStage;
  status: ExecutionTimelineStatus;
  taskId: string;
  title: string;
  tool?: ExecutionTimelineEvent["tool"];
  userAction?: ExecutionTimelineEvent["userAction"];
  warning?: string | null;
}) {
  const task = requireOwnedTask(input);
  if (!task) return null;
  const timestamp = now();
  task.timeline = task.timeline.map((event) => event.status === "active"
    ? { ...event, status: "complete" as const }
    : event);
  const sequence = (task.timeline.at(-1)?.sequence ?? 0) + 1;
  const event: ExecutionTimelineEvent = {
    artifact: input.artifact ?? null,
    blocking: input.blocking,
    command: input.command ?? null,
    detail: input.detail ? sanitizeText(input.detail) : null,
    durationMs: input.durationMs ?? null,
    execution: input.execution ?? null,
    id: `${task.taskId}:event:${sequence}`,
    progress: input.progress ?? null,
    sequence,
    source: input.source,
    stage: input.stage,
    status: input.status,
    taskId: task.taskId,
    timestamp,
    title: sanitizeText(input.title, 180),
    tool: input.tool ?? null,
    userAction: input.userAction ?? null,
    warning: input.warning ? sanitizeText(input.warning, 500) : null
  };
  task.timeline = [...task.timeline, event].slice(-maxTimelineEvents);
  task.updatedAt = timestamp;
  return event;
}

export async function runLiveExecutionTask<T>(input: {
  execute: (signal: AbortSignal) => Promise<T>;
  externalUserId: string;
  projectId: string;
  taskId: string;
}) {
  const signal = startLiveExecutionTask(input);
  if (!signal) throw new Error("The owned task could not enter the running state.");
  try {
    const result = await input.execute(signal);
    const task = requireOwnedTask(input);
    if (task && !isTerminal(task.status)) {
      appendLiveTaskTimeline({
        detail: "The owned background operation completed without additional delivery evidence.",
        externalUserId: input.externalUserId,
        projectId: input.projectId,
        source: "runtime",
        stage: "runtime",
        status: "complete",
        taskId: input.taskId,
        title: "Background task completed"
      });
      finishLiveExecutionTask({ ...input, status: "completed" });
    }
    return result;
  } catch (error) {
    const task = requireOwnedTask(input);
    if (task && !isTerminal(task.status)) {
      appendLiveTaskTimeline({
        blocking: !signal.aborted,
        detail: error instanceof Error ? error.message : "The owned task stopped unexpectedly.",
        externalUserId: input.externalUserId,
        projectId: input.projectId,
        source: "runtime",
        stage: "runtime",
        status: signal.aborted ? "cancelled" : "failed",
        taskId: input.taskId,
        title: signal.aborted ? "Task cancelled" : "Task failed"
      });
      finishLiveExecutionTask({ ...input, status: signal.aborted ? "cancelled" : "failed" });
    }
    throw error;
  }
}

export function appendLiveTaskOutput(input: {
  commandId?: string | null;
  externalUserId: string;
  projectId: string;
  stream: LiveTaskOutputChunk["stream"];
  taskId: string;
  text: string;
}) {
  const task = requireOwnedTask(input);
  if (!task || isTerminal(task.status)) return null;
  const safeText = sanitizeText(input.text, 4_000);
  if (!safeText) return null;
  const remaining = Math.max(0, maxOutputBytes - task.outputBytes);
  if (!remaining) {
    task.outputTruncated = true;
    return null;
  }
  const bounded = Buffer.from(safeText).subarray(0, remaining).toString("utf8");
  const sequence = (task.output.at(-1)?.sequence ?? 0) + 1;
  const chunk: LiveTaskOutputChunk = {
    commandId: input.commandId ?? null,
    id: `${task.taskId}:output:${sequence}`,
    sequence,
    stream: input.stream,
    taskId: task.taskId,
    text: bounded,
    timestamp: now(),
    truncated: bounded.length < safeText.length
  };
  task.output = [...task.output, chunk].slice(-maxOutputChunks);
  task.outputBytes += Buffer.byteLength(bounded);
  task.outputTruncated ||= chunk.truncated || task.output.length >= maxOutputChunks;
  task.updatedAt = chunk.timestamp;
  return chunk;
}

export function attachLiveTaskDelivery(input: {
  context: LiveExecutionTaskDeliveryContext;
  delivery: VerifiedDeliveryProjection;
  externalUserId: string;
  git: GitDeliveryState;
  projectId: string;
  taskId: string;
}) {
  const task = requireOwnedTask(input);
  if (!task) return false;
  task.delivery = input.delivery;
  task.deliveryContext = input.context;
  task.git = input.git;
  task.updatedAt = now();
  return true;
}

export function finishLiveExecutionTask(input: {
  externalUserId: string;
  projectId: string;
  status: Extract<LiveExecutionTaskStatus, "blocked" | "cancelled" | "completed" | "failed">;
  taskId: string;
}) {
  const task = requireOwnedTask(input);
  if (!task) return null;
  task.status = input.status;
  task.cancellable = false;
  task.completedAt = now();
  task.updatedAt = task.completedAt;
  task.expiresAt = expiryFor(task.status);
  return publicSnapshot(task);
}

export function cancelLiveExecutionTask(input: { externalUserId: string; projectId: string; taskId: string }) {
  const task = requireOwnedTask(input);
  if (!task || isTerminal(task.status)) return false;
  task.abortController.abort();
  task.status = "cancelled";
  task.cancellable = false;
  task.completedAt = now();
  task.updatedAt = task.completedAt;
  task.expiresAt = expiryFor(task.status);
  appendLiveTaskTimeline({
    detail: "Hassali stopped the owned task and requested teardown of its active process.",
    externalUserId: input.externalUserId,
    projectId: input.projectId,
    source: "runtime",
    stage: "runtime",
    status: "cancelled",
    taskId: input.taskId,
    title: "Task cancelled"
  });
  return true;
}

export function getLiveExecutionTask(input: { externalUserId: string; projectId: string; taskId: string }) {
  const task = requireOwnedTask(input);
  return task ? publicSnapshot(task) : null;
}

export function getLatestLiveExecutionTask(input: { externalUserId: string; projectId: string; proposalId?: string | null }) {
  prune();
  const candidates = [...tasks.values()]
    .filter((candidate) =>
      candidate.externalUserId === input.externalUserId &&
      candidate.projectId === input.projectId &&
      (!input.proposalId || candidate.proposalId === input.proposalId)
    )
    .map((task, index) => ({ index, task }))
    .sort((a, b) => Date.parse(b.task.updatedAt) - Date.parse(a.task.updatedAt) || b.index - a.index);
  const task = candidates[0]?.task;
  return task ? publicSnapshot(task) : null;
}

export function getLiveExecutionTaskInternal(input: { externalUserId: string; projectId: string; taskId: string }) {
  const task = requireOwnedTask(input);
  return task
    ? { deliveryContext: task.deliveryContext, snapshot: publicSnapshot(task), workspaceRoot: task.workspaceRoot }
    : null;
}

export function clearLiveExecutionTasks() {
  for (const task of tasks.values()) task.abortController.abort();
  tasks.clear();
}
