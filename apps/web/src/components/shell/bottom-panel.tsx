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
    <footer className="hidden h-32 shrink-0 flex-col border-t border-[hsl(var(--royal-border-soft))] bg-[hsl(var(--royal-surface)/0.88)] text-xs lg:flex">
      <section className="flex min-h-0 min-w-0 flex-1 flex-col p-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-medium">
            <span className={`h-1.5 w-1.5 rounded-full ${statusTone[status]}`} />
            Runtime Terminal
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate font-mono text-[10px] text-muted-foreground">
              {isLoading ? "starting..." : status}
              {previewUrl ? ` · ${previewUrl}` : ""}
            </span>
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
        </div>
        <div
          className="mt-2 min-h-0 flex-1 overflow-y-auto rounded-xl border border-[hsl(var(--royal-border-soft))] bg-black/45 p-2.5 font-mono text-[11px] leading-5 text-muted-foreground shadow-sm"
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
      {error ? (
        <div className="border-t border-[hsl(var(--royal-border-soft))] px-2.5 py-1.5 text-[11px] text-destructive">
          {error}
        </div>
      ) : null}
    </footer>
  );
}
