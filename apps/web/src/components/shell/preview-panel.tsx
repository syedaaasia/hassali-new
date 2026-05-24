"use client";

import { Panel } from "@/components/ui/panel";
import { useRuntimeStore } from "@/lib/runtime-store";
import { useWorkspaceStore } from "@/lib/workspace-store";

export function PreviewPanel() {
  const projectId = useWorkspaceStore((state) => state.projectId);
  const error = useRuntimeStore((state) => state.error);
  const iframeVersion = useRuntimeStore((state) => state.iframeVersion);
  const isLoading = useRuntimeStore((state) => state.isLoading);
  const previewUrl = useRuntimeStore((state) => state.previewUrl);
  const status = useRuntimeStore((state) => state.status);
  const startPreview = useRuntimeStore((state) => state.startPreview);
  const stopPreview = useRuntimeStore((state) => state.stopPreview);
  const syncPreview = useRuntimeStore((state) => state.syncPreview);
  const iframeSource = previewUrl ? `${previewUrl}?v=${iframeVersion}` : null;

  return (
    <Panel className="hidden w-80 shrink-0 flex-col border-l border-[hsl(var(--royal-border-soft))] bg-[hsl(var(--royal-surface)/0.9)] xl:flex 2xl:w-[28rem]">
      <div className="flex items-center justify-between gap-3 border-b border-[hsl(var(--royal-border-soft))] px-4 py-3.5">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Preview
          </div>
          <div className="mt-1 text-xs text-foreground">
            {status === "running" ? "Local static runtime" : "Stopped"}
          </div>
        </div>
        <span
          className={`rounded-full border px-2 py-1 text-[10px] uppercase ${
            status === "running"
              ? "border-accent/35 text-accent"
              : status === "error"
                ? "border-destructive/35 text-destructive"
                : "border-[hsl(var(--royal-border-soft))] text-muted-foreground"
          }`}
        >
          {isLoading ? "loading" : status}
        </span>
      </div>

      <div className="flex items-center gap-2 border-b border-[hsl(var(--royal-border-soft))] p-3">
        <button
          className="rounded-xl border border-accent/35 bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
          disabled={isLoading || !projectId}
          onClick={() => {
            void startPreview(projectId);
          }}
          type="button"
        >
          Start
        </button>
        <button
          className="rounded-xl border border-[hsl(var(--royal-border-soft))] px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          disabled={isLoading || status !== "running"}
          onClick={() => {
            void syncPreview(projectId);
          }}
          type="button"
        >
          Reload
        </button>
        <button
          className="rounded-xl border border-[hsl(var(--royal-border-soft))] px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          disabled={isLoading || status === "stopped"}
          onClick={() => {
            void stopPreview();
          }}
          type="button"
        >
          Stop
        </button>
      </div>

      <div className="min-h-0 flex-1 bg-[hsl(var(--royal-black)/0.45)] p-3">
        {iframeSource ? (
          <iframe
            className="h-full w-full rounded-xl border border-[hsl(var(--royal-border-soft))] bg-white"
            key={iframeSource}
            src={iframeSource}
            title="Hassali local preview"
          />
        ) : (
          <div className="flex h-full items-center justify-center rounded-xl border border-[hsl(var(--royal-border-soft))] bg-[hsl(var(--royal-panel)/0.5)] p-6 text-center text-xs leading-5 text-muted-foreground">
            {projectId
              ? "Start preview after creating an index.html project."
              : "Create or select a project before starting preview."}
          </div>
        )}
      </div>

      {error ? (
        <div className="border-t border-[hsl(var(--royal-border-soft))] px-4 py-3 text-xs leading-5 text-destructive">
          {error}
        </div>
      ) : null}
    </Panel>
  );
}
