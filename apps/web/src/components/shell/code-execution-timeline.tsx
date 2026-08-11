"use client";

import { useEffect, useMemo, useState } from "react";

type TimelineTask = {
  cancellable: boolean;
  delivery: {
    gitEligible: boolean;
    status: string;
    summary: string;
    warnings: string[];
  } | null;
  git: {
    branch: string | null;
    commitEligible: boolean;
    commitReason: string;
    diffPreview: string;
    diffSummary: string;
    head: string | null;
    repositoryAvailable: boolean;
    taskOwnedPaths: string[];
    userOwnedPaths: string[];
    warnings: string[];
    worktreeStatus: string;
  } | null;
  objective: string;
  output: Array<{
    commandId: string | null;
    id: string;
    stream: "stderr" | "stdout" | "system";
    text: string;
  }>;
  outputTruncated: boolean;
  status: "blocked" | "cancelled" | "completed" | "failed" | "queued" | "running" | "waiting";
  taskId: string;
  timeline: Array<{
    detail?: string | null;
    durationMs?: number | null;
    id: string;
    source: string;
    stage: string;
    status: string;
    timestamp: string;
    title: string;
    userAction?: { action: string; label: string; required: boolean } | null;
    warning?: string | null;
  }>;
};

const terminalStates = new Set(["blocked", "cancelled", "completed", "failed"]);

function statusTone(status: string) {
  if (status === "complete" || status === "completed" || status === "verified-ready") return "text-emerald-300";
  if (status === "failed" || status === "blocked") return "text-red-300";
  if (status === "warning" || status === "verified-with-warnings" || status === "partial") return "text-amber-300";
  if (status === "cancelled") return "text-muted-foreground";
  return "text-[hsl(var(--premium-accent-soft))]";
}

export function CodeExecutionTimeline(input: {
  active: boolean;
  projectId: string;
  proposalId: string;
}) {
  const [task, setTask] = useState<TimelineTask | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const controller = new AbortController();
    setTask(null);
    const poll = async () => {
      try {
        const response = await fetch(`/api/runtime/tasks?projectId=${encodeURIComponent(input.projectId)}&proposalId=${encodeURIComponent(input.proposalId)}`, {
          signal: controller.signal
        });
        if (response.ok) {
          const payload = await response.json() as { task?: TimelineTask | null };
          if (!cancelled && payload.task) setTask(payload.task);
          const keepPolling = input.active || (payload.task && !terminalStates.has(payload.task.status));
          if (!cancelled && keepPolling) timeout = setTimeout(poll, 850);
        } else if (!cancelled && input.active) {
          timeout = setTimeout(poll, 1_500);
        }
      } catch {
        if (!cancelled && input.active) timeout = setTimeout(poll, 1_500);
      }
    };
    void poll();
    return () => {
      cancelled = true;
      controller.abort();
      if (timeout) clearTimeout(timeout);
    };
  }, [input.active, input.projectId, input.proposalId]);

  const currentEvent = [...(task?.timeline ?? [])].reverse().find((event) => event.status === "active") ?? task?.timeline.at(-1) ?? null;
  const output = useMemo(() => task?.output.map((chunk) => `[${chunk.stream}] ${chunk.text}`).join("\n") ?? "", [task]);

  const taskAction = async (action: "cancel" | "local_commit") => {
    if (!task) return;
    setActionPending(true);
    setActionError(null);
    try {
      const response = await fetch("/api/runtime/tasks", {
        body: JSON.stringify({
          action,
          commitMessage: action === "local_commit" ? `Hassali verified task: ${task.objective}` : undefined,
          projectId: input.projectId,
          taskId: task.taskId
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST"
      });
      const payload = await response.json() as { error?: string; task?: TimelineTask };
      if (!response.ok) throw new Error(payload.error ?? "The task action could not complete.");
      if (payload.task) setTask(payload.task);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "The task action could not complete.");
    } finally {
      setActionPending(false);
    }
  };

  if (!task) {
    return input.active ? (
      <div className="mt-3 border-t border-[hsl(var(--royal-border-soft))] pt-3 text-[11px] text-muted-foreground" role="status">
        Preparing the owned CODE execution timeline...
      </div>
    ) : null;
  }

  return (
    <section aria-label="CODE execution timeline" className="mt-3 border-t border-[hsl(var(--royal-border-soft))] pt-3">
      <div className="flex items-start justify-between gap-3">
        <button
          aria-expanded={expanded}
          className="min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--premium-accent)/0.35)]"
          onClick={() => setExpanded((value) => !value)}
          type="button"
        >
          <span className="block text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Execution timeline</span>
          <span className={`mt-0.5 block truncate text-xs font-medium ${statusTone(currentEvent?.status ?? task.status)}`}>
            {currentEvent?.title ?? task.status}
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-2">
          <span className={`text-[10px] font-semibold uppercase ${statusTone(task.status)}`}>{task.status}</span>
          {task.cancellable ? (
            <button
              className="text-[11px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:opacity-50"
              disabled={actionPending}
              onClick={() => void taskAction("cancel")}
              type="button"
            >
              Cancel
            </button>
          ) : null}
        </div>
      </div>

      {expanded ? (
        <div className="mt-3 space-y-3">
          <ol className="space-y-2 border-l border-white/10 pl-3 [.light_&]:border-black/10">
            {task.timeline.slice(-12).map((event) => (
              <li className="relative" key={event.id}>
                <span aria-hidden="true" className={`absolute -left-[0.96rem] top-1.5 h-1.5 w-1.5 rounded-full bg-current ${statusTone(event.status)}`} />
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <span className={`text-[11px] font-medium ${statusTone(event.status)}`}>{event.title}</span>
                  <span className="text-[9px] uppercase text-muted-foreground">{event.stage}</span>
                </div>
                {event.detail ? <p className="mt-0.5 line-clamp-2 text-[10px] leading-4 text-muted-foreground">{event.detail}</p> : null}
                {event.durationMs != null ? <span className="text-[9px] text-muted-foreground">{event.durationMs} ms</span> : null}
              </li>
            ))}
          </ol>

          {output ? (
            <details className="border-t border-white/10 pt-2 [.light_&]:border-black/10">
              <summary className="cursor-pointer text-[10px] font-medium text-muted-foreground">Command output{task.outputTruncated ? " (bounded)" : ""}</summary>
              <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words bg-black/20 p-2 font-mono text-[10px] leading-4 text-muted-foreground">{output}</pre>
            </details>
          ) : null}

          {task.delivery ? (
            <div className="border-t border-white/10 pt-2 [.light_&]:border-black/10">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className={`text-[11px] font-semibold ${statusTone(task.delivery.status)}`}>{task.delivery.status.replace(/-/g, " ")}</span>
                {task.git?.commitEligible ? (
                  <button
                    className="text-[11px] font-medium text-[hsl(var(--premium-accent-soft))] underline-offset-4 hover:underline disabled:opacity-50"
                    disabled={actionPending}
                    onClick={() => void taskAction("local_commit")}
                    type="button"
                  >
                    Create local commit
                  </button>
                ) : null}
              </div>
              <p className="mt-1 text-[10px] leading-4 text-muted-foreground">{task.delivery.summary}</p>
              {task.git ? (
                <details className="mt-2">
                  <summary className="cursor-pointer text-[10px] text-muted-foreground">Git state{task.git.branch ? ` · ${task.git.branch}` : ""}</summary>
                  <p className="mt-1 whitespace-pre-wrap text-[10px] leading-4 text-muted-foreground">{task.git.diffSummary}</p>
                  <p className="mt-1 text-[10px] leading-4 text-muted-foreground">{task.git.commitReason}</p>
                  {task.git.diffPreview ? <pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap bg-black/20 p-2 font-mono text-[9px] leading-4 text-muted-foreground">{task.git.diffPreview}</pre> : null}
                </details>
              ) : null}
            </div>
          ) : null}
          {actionError ? <p className="text-[10px] text-red-300" role="alert">{actionError}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
