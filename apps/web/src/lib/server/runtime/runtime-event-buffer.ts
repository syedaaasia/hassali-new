import type {
  RuntimeStreamEvent,
  RuntimeStreamFramework,
  RuntimeStreamSnapshot,
  RuntimeStreamStatus
} from "@/lib/server/runtime/runtime-stream-types";

const maxEventsPerProject = 300;
const maxLogLineLength = 1_200;
const projectBuffers = new Map<string, RuntimeStreamEvent[]>();

function now() {
  return new Date().toISOString();
}

export function sanitizeRuntimeText(value: string) {
  return value
    .replace(/[A-Za-z]:\\[^\r\n]*?\.hassali\\workspaces\\[^\s"'`]+/g, "[workspace]")
    .replace(/\/[^\r\n]*?\.hassali\/workspaces\/[^\s"'`]+/g, "[workspace]")
    .replace(/((?:OPENAI|ANTHROPIC|GROQ|OPENROUTER|CLERK|DATABASE|POSTGRES|REDIS|QDRANT|SUPABASE|SECRET|TOKEN|KEY)_[A-Z0-9_]*)=([^\s]+)/gi, "$1=[redacted]")
    .slice(0, maxLogLineLength);
}

export function recordRuntimeStreamEvent(input: {
  error?: string | null;
  exitCode?: number | null;
  framework: RuntimeStreamFramework;
  message: string;
  port?: number | null;
  previewUrl?: string | null;
  projectId: string;
  runtimeId: string;
  status?: RuntimeStreamStatus;
  stream?: RuntimeStreamEvent["stream"];
  type: RuntimeStreamEvent["type"];
}) {
  const event: RuntimeStreamEvent = {
    createdAt: now(),
    error: input.error ? sanitizeRuntimeText(input.error) : input.error,
    exitCode: input.exitCode,
    framework: input.framework,
    message: sanitizeRuntimeText(input.message),
    port: input.port,
    previewUrl: input.previewUrl,
    projectId: input.projectId,
    runtimeId: input.runtimeId,
    status: input.status,
    stream: input.stream,
    type: input.type
  };
  const current = projectBuffers.get(input.projectId) ?? [];

  projectBuffers.set(input.projectId, [...current, event].slice(-maxEventsPerProject));

  return event;
}

export function getRuntimeStreamEvents(input: {
  projectId: string;
  runtimeId?: string | null;
}) {
  const events = projectBuffers.get(input.projectId) ?? [];

  return input.runtimeId
    ? events.filter((event) => event.runtimeId === input.runtimeId)
    : events;
}

export function getRuntimeStreamSnapshot(projectId: string): RuntimeStreamSnapshot {
  const events = getRuntimeStreamEvents({ projectId });
  const latest = [...events].reverse().find((event) => event.status || event.previewUrl || event.port);
  const latestError = [...events].reverse().find((event) => event.error || event.type === "error");
  const latestHealth = [...events].reverse().find((event) => event.type === "health");
  const started = events.find((event) => event.type === "started");
  const stopped = [...events].reverse().find((event) => event.type === "stopped");
  const logs = events
    .filter((event) => event.type === "log" || event.stream)
    .map((event) => `[${event.stream ?? "system"}] ${event.message}`)
    .slice(-120);
  const errors = events
    .filter((event) => event.error || event.type === "error")
    .map((event) => event.error ?? event.message)
    .slice(-25);

  return {
    errors,
    events: events.slice(-120),
    exitCode: latestError?.exitCode ?? null,
    framework: latest?.framework ?? "unknown",
    lastHealthCheckAt: latestHealth?.createdAt ?? null,
    logs,
    port: latest?.port ?? null,
    previewUrl: latest?.previewUrl ?? null,
    projectId,
    runtimeId: latest?.runtimeId ?? null,
    startedAt: started?.createdAt ?? null,
    status: latest?.status ?? "stopped",
    stoppedAt: stopped?.createdAt ?? null,
    updatedAt: events.at(-1)?.createdAt ?? null
  };
}
