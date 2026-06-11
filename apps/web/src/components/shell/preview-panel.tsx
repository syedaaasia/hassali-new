"use client";

import { Panel } from "@/components/ui/panel";
import { useChatStore } from "@/lib/chat-store";
import { useRuntimeStore } from "@/lib/runtime-store";
import { useWorkspaceStore } from "@/lib/workspace-store";

export function PreviewPanel() {
  const files = useWorkspaceStore((state) => state.files);
  const productMode = useChatStore((state) => state.productMode);
  const proposal = useChatStore((state) => state.proposal);
  const projectId = useWorkspaceStore((state) => state.projectId);
  const error = useRuntimeStore((state) => state.error);
  const iframeVersion = useRuntimeStore((state) => state.iframeVersion);
  const isLoading = useRuntimeStore((state) => state.isLoading);
  const previewUrl = useRuntimeStore((state) => state.previewUrl);
  const setPreviewOpen = useRuntimeStore((state) => state.setPreviewOpen);
  const status = useRuntimeStore((state) => state.status);
  const startPreview = useRuntimeStore((state) => state.startPreview);
  const stopPreview = useRuntimeStore((state) => state.stopPreview);
  const syncPreview = useRuntimeStore((state) => state.syncPreview);
  const iframeSource = previewUrl ? `${previewUrl}?v=${iframeVersion}` : null;
  const hasIndexHtml = Boolean(files["index.html"]);
  const proposalDocFiles =
    proposal?.changes
      .map((change) => change.path)
      .filter((path): path is string => typeof path === "string" && /\.(?:md|mdx|txt)$/i.test(path))
      .slice(0, 4) ?? [];
  const appPreview = proposal?.appPreview;
  const isCodePreviewContext =
    productMode === "CODE" ||
    proposal?.previewMode === "code_plan" ||
    proposal?.previewType === "code_app_preview" ||
    proposal?.previewType === "code_plan_preview";
  const missingPreviewMessage = isCodePreviewContext
    ? `CODE proposal ready. Review the architecture and implementation files in the proposal panel. Live preview is available for WEBSITE/static outputs.${
        proposalDocFiles.length ? ` Planning docs: ${proposalDocFiles.join(", ")}.` : ""
      }`
    : "Preview needs index.html. Use WEBSITE mode to create a static website.";

  return (
    <Panel className="fixed bottom-2 right-2 top-[3.5rem] z-30 hidden w-[30rem] max-w-[calc(100vw-1rem)] flex-col rounded-[24px] border border-[hsl(var(--premium-border))] bg-[hsl(var(--premium-panel)/0.82)] shadow-[0_24px_90px_rgba(0,0,0,0.55)] backdrop-blur-xl lg:flex xl:w-[34rem] 2xl:w-[38rem]">
      <div className="flex items-center justify-between gap-3 border-b border-[hsl(var(--premium-border))] px-4 py-3.5">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Preview
          </div>
          <div className="mt-1 text-xs text-foreground">
            {status === "running" ? "Local static runtime" : "Stopped"}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={`rounded-full border px-2 py-1 text-[10px] uppercase ${
              status === "running"
                ? "border-emerald-400/35 text-emerald-300"
                : status === "error"
                  ? "border-destructive/35 text-destructive"
                  : "border-[hsl(var(--royal-border-soft))] text-muted-foreground"
            }`}
          >
            {isLoading ? "loading" : status}
          </span>
          <button
            className="rounded-full border border-white/10 bg-white/[0.035] px-2.5 py-1 text-[10px] uppercase text-muted-foreground hover:text-foreground"
            onClick={() => setPreviewOpen(false)}
            type="button"
          >
            Close
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 border-b border-[hsl(var(--premium-border))] p-3">
        <button
          className="rounded-full border border-[#7c6cff]/35 bg-[#7c6cff] px-3.5 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          disabled={isLoading || !projectId || !hasIndexHtml}
          onClick={() => {
            void startPreview(projectId);
          }}
          type="button"
        >
          Start
        </button>
        <button
          className="rounded-full border border-white/10 px-3.5 py-1.5 text-xs text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          disabled={isLoading || status !== "running"}
          onClick={() => {
            void syncPreview(projectId);
          }}
          type="button"
        >
          Reload
        </button>
        <button
          className="rounded-full border border-white/10 px-3.5 py-1.5 text-xs text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          disabled={isLoading || status === "stopped"}
          onClick={() => {
            void stopPreview();
          }}
          type="button"
        >
          Stop
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden bg-black/35 p-2">
        {iframeSource ? (
          <iframe
            className="h-full min-h-0 w-full rounded-2xl border border-[hsl(var(--premium-border))] bg-white"
            key={iframeSource}
            src={iframeSource}
            title="Hassali local preview"
          />
        ) : appPreview && isCodePreviewContext ? (
          <div className="flex h-full min-h-0 flex-col overflow-auto rounded-xl border border-[hsl(var(--royal-border-soft))] bg-[hsl(var(--royal-panel)/0.55)] p-4 text-xs text-foreground">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  CODE app preview
                </p>
                <h3 className="mt-1 text-lg font-semibold">{appPreview.appName}</h3>
                <p className="mt-1 text-muted-foreground">{appPreview.appKind} dashboard concept</p>
              </div>
              <span className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] uppercase text-muted-foreground">
                Mock data
              </span>
            </div>
            <div className="grid min-h-0 gap-3 md:grid-cols-[8rem_1fr]">
              <aside className="rounded-xl border border-white/10 bg-black/25 p-3">
                <p className="mb-2 text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Screens</p>
                <div className="space-y-1.5">
                  {appPreview.screens.map((screen) => (
                    <div className="rounded-full bg-white/[0.04] px-2.5 py-1" key={screen}>
                      {screen}
                    </div>
                  ))}
                </div>
              </aside>
              <section className="space-y-3">
                <div className="grid gap-2 sm:grid-cols-3">
                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <p className="text-muted-foreground">Customers</p>
                    <strong className="mt-2 block text-lg">128</strong>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <p className="text-muted-foreground">Open deals</p>
                    <strong className="mt-2 block text-lg">24</strong>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <p className="text-muted-foreground">Billing</p>
                    <strong className="mt-2 block text-lg">Planned</strong>
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <p className="mb-2 text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Entities</p>
                  <div className="flex flex-wrap gap-2">
                    {appPreview.entities.map((entity) => (
                      <span className="rounded-full border border-white/10 px-2.5 py-1" key={entity}>
                        {entity}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <p className="mb-2 text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Integrations</p>
                  <div className="space-y-1.5">
                    {appPreview.integrations.map((integration) => (
                      <div className="flex items-center justify-between gap-2" key={integration}>
                        <span>{integration}</span>
                        <span className="text-muted-foreground">placeholder</span>
                      </div>
                    ))}
                  </div>
                </div>
                <p className="rounded-xl border border-amber-300/20 bg-amber-300/10 p-3 text-amber-100">
                  {appPreview.mockDataNotice}
                </p>
              </section>
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center rounded-xl border border-[hsl(var(--royal-border-soft))] bg-[hsl(var(--royal-panel)/0.5)] p-6 text-center text-xs leading-5 text-muted-foreground">
            {!projectId
              ? "Create or select a project before starting preview."
              : hasIndexHtml
                ? "Start preview when you are ready."
                : missingPreviewMessage}
          </div>
        )}
      </div>

      {error ? (
        <div className="border-t border-white/10 px-4 py-3 text-xs leading-5 text-destructive">
          {error}
        </div>
      ) : null}
    </Panel>
  );
}
