"use client";

import { useEffect, useRef } from "react";
import { useRuntimeStore } from "@/lib/runtime-store";

type ScrollableElement = {
  scrollHeight: number;
  scrollTop: number;
};

const statusTone = {
  error: "bg-destructive/80",
  running: "bg-accent/80",
  starting: "bg-yellow-400/80",
  stopped: "bg-muted-foreground/60"
};

export function BottomPanel() {
  const clearLogs = useRuntimeStore((state) => state.clearLogs);
  const error = useRuntimeStore((state) => state.error);
  const isLoading = useRuntimeStore((state) => state.isLoading);
  const logs = useRuntimeStore((state) => state.logs);
  const previewUrl = useRuntimeStore((state) => state.previewUrl);
  const refreshRuntime = useRuntimeStore((state) => state.refreshRuntime);
  const status = useRuntimeStore((state) => state.status);
  const terminalRef = useRef<ScrollableElement | null>(null);

  useEffect(() => {
    void refreshRuntime();
  }, [refreshRuntime]);

  useEffect(() => {
    if (status !== "running" && status !== "starting" && !isLoading) {
      return;
    }

    const interval = setInterval(() => {
      void refreshRuntime();
    }, 1500);

    return () => clearInterval(interval);
  }, [isLoading, refreshRuntime, status]);

  useEffect(() => {
    const terminal = terminalRef.current;

    if (!terminal) {
      return;
    }

    terminal.scrollTop = terminal.scrollHeight;
  }, [logs]);

  return (
    <footer className="hidden h-36 shrink-0 grid-cols-[minmax(0,1fr)_14rem] border-t border-[hsl(var(--royal-border-soft))] bg-[hsl(var(--royal-surface)/0.88)] text-xs lg:grid xl:grid-cols-[minmax(0,1fr)_18rem]">
      <section className="min-w-0 border-r border-[hsl(var(--royal-border-soft))] p-3.5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 font-medium">
            <span className={`h-1.5 w-1.5 rounded-full ${statusTone[status]}`} />
            Runtime Terminal
          </div>
          <button
            className="rounded-lg border border-[hsl(var(--royal-border-soft))] px-2 py-1 text-[11px] text-muted-foreground transition hover:text-foreground disabled:opacity-50"
            disabled={logs.length === 0}
            onClick={() => {
              void clearLogs();
            }}
            type="button"
          >
            Clear
          </button>
        </div>
        <div
          className="mt-3 h-[4.75rem] overflow-y-auto rounded-xl border border-[hsl(var(--royal-border-soft))] bg-black/45 p-3 font-mono text-[11px] leading-5 text-muted-foreground shadow-sm"
          ref={(node) => {
            terminalRef.current = node as ScrollableElement | null;
          }}
        >
          {logs.length > 0 ? (
            logs.map((log, index) => (
              <div className="whitespace-pre-wrap break-words" key={`${index}-${log}`}>
                {log}
              </div>
            ))
          ) : (
            <div className="text-muted-foreground/70">
              Runtime logs will appear here when preview starts.
            </div>
          )}
        </div>
      </section>
      <section className="p-3.5">
        <div className="flex items-center gap-2 font-medium">
          <span className={`h-1.5 w-1.5 rounded-full ${statusTone[status]}`} />
          Runtime Status
        </div>
        <div className="mt-3 space-y-1 rounded-xl border border-[hsl(var(--royal-border-soft))] bg-[hsl(var(--royal-panel)/0.5)] p-3 font-mono text-[11px] text-muted-foreground shadow-sm">
          <div>status: {isLoading ? "starting..." : status}</div>
          <div className="truncate">preview: {previewUrl ?? "not running"}</div>
          {error ? <div className="text-destructive">error: {error}</div> : null}
        </div>
      </section>
    </footer>
  );
}
