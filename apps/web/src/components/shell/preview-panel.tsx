"use client";

import { useEffect } from "react";
import { Panel } from "@/components/ui/panel";
import { useChatStore } from "@/lib/chat-store";
import { useRuntimeStore } from "@/lib/runtime-store";
import { useWorkspaceStore } from "@/lib/workspace-store";

type UnifiedPreviewType = "application" | "architecture" | "component" | "dashboard" | "mobile" | "none" | "website";
type RealPreviewFrame = {
  columns?: string[];
  id: string;
  items: string[];
  kind: "api" | "app_shell" | "component" | "dashboard" | "mobile_screen" | "panel" | "table";
  rows?: string[][];
  title: string;
};
type RealPreviewResult = {
  description: string;
  frames: RealPreviewFrame[];
  kind:
    | "api_architecture"
    | "component_mock"
    | "dashboard_mock"
    | "mobile_mock"
    | "static_app_mock"
    | "static_website"
    | "unavailable";
  renderMode: string;
  state: "ready" | "unavailable";
  title: string;
  warnings?: Array<{
    code: string;
    message: string;
    severity: "info" | "medium";
  }>;
};
type ExecutablePreviewResult = {
  canExecuteNow: boolean;
  commandPlan?: {
    defaultPort: number | null;
    devCommand: "npm run dev" | null;
    installCommand: null;
    renderMode: string;
    status: string;
  };
  confidence: number;
  devServerRuntime?: {
    canRun: boolean;
    frameworkDisplayName: string;
    plannedCommand: string | null;
    port: number | null;
    previewUrl: string | null;
    runtimeStatus: string;
    startCommand: string | null;
  };
  executablePreviewStatus: string;
  framework: string;
  frameworkMatch?: {
    displayName?: string;
    frameworkId?: string;
  };
  warnings?: string[];
};

function normalizePreviewType(value: string | undefined, productMode: string): UnifiedPreviewType {
  if (
    value === "application" ||
    value === "architecture" ||
    value === "component" ||
    value === "dashboard" ||
    value === "mobile" ||
    value === "none" ||
    value === "website"
  ) {
    return value;
  }

  if (value === "website_static_preview") return "website";
  if (value === "code_app_preview") return "dashboard";
  if (value === "code_plan_preview" || value === "docs_preview") return "architecture";
  if (productMode === "ASK") return "none";
  if (productMode === "WEBSITE") return "website";

  return "architecture";
}

function previewLabel(type: UnifiedPreviewType) {
  return type === "none" ? "No preview" : `${type.charAt(0).toUpperCase()}${type.slice(1)} preview`;
}

function metadataArray(metadata: Record<string, unknown> | undefined, key: string) {
  const value = metadata?.[key];

  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").slice(0, 6) : [];
}

function isRealPreviewFrame(value: unknown): value is RealPreviewFrame {
  if (!value || typeof value !== "object") {
    return false;
  }

  const frame = value as RealPreviewFrame;

  return (
    typeof frame.id === "string" &&
    typeof frame.title === "string" &&
    Array.isArray(frame.items) &&
    frame.items.every((item) => typeof item === "string")
  );
}

function realPreviewFrom(value: unknown): RealPreviewResult | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const preview = value as RealPreviewResult;

  if (
    typeof preview.title !== "string" ||
    typeof preview.description !== "string" ||
    !Array.isArray(preview.frames) ||
    !preview.frames.every(isRealPreviewFrame)
  ) {
    return null;
  }

  return preview;
}

function executablePreviewFrom(value: unknown): ExecutablePreviewResult | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const preview = value as ExecutablePreviewResult;

  if (
    typeof preview.framework !== "string" ||
    typeof preview.executablePreviewStatus !== "string" ||
    typeof preview.canExecuteNow !== "boolean"
  ) {
    return null;
  }

  return preview;
}

function previewTypeFromClassification(value: unknown): UnifiedPreviewType | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const previewType = (value as { previewType?: unknown }).previewType;

  return typeof previewType === "string" ? normalizePreviewType(previewType, "CODE") : null;
}

function RealPreviewMock({ preview }: { preview: RealPreviewResult }) {
  const isMobile = preview.kind === "mobile_mock";
  const isArchitecture = preview.kind === "api_architecture";

  return (
    <div className="flex h-full min-h-0 flex-col overflow-auto rounded-xl border border-[hsl(var(--royal-border-soft))] bg-[hsl(var(--royal-panel)/0.55)] p-4 text-xs text-foreground">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            Real preview
          </p>
          <h3 className="mt-1 text-lg font-semibold">{preview.title}</h3>
          <p className="mt-1 max-w-md text-muted-foreground">{preview.description}</p>
        </div>
        <span className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] uppercase text-muted-foreground">
          {preview.kind.replace(/_/g, " ")}
        </span>
      </div>

      {isMobile ? (
        <div className="mx-auto flex w-full max-w-[18rem] flex-1 flex-col rounded-[2rem] border border-white/15 bg-black p-3 shadow-[0_24px_70px_rgba(0,0,0,0.35)]">
          <div className="mx-auto mb-3 h-1.5 w-16 rounded-full bg-white/20" />
          <div className="min-h-[24rem] flex-1 rounded-[1.5rem] border border-white/10 bg-[#11131a] p-4">
            {preview.frames.map((frame) => (
              <section className="mb-4 last:mb-0" key={frame.id}>
                <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  {frame.title}
                </h4>
                <div className="space-y-2">
                  {frame.items.map((item) => (
                    <div className="rounded-2xl border border-white/10 bg-white/[0.045] px-3 py-2" key={`${frame.id}-${item}`}>
                      {item}
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      ) : (
        <div className={`grid gap-3 ${isArchitecture ? "" : "md:grid-cols-2"}`}>
          {preview.frames.map((frame) => (
            <section
              className="rounded-xl border border-white/10 bg-black/20 p-3"
              key={frame.id}
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <h4 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  {frame.title}
                </h4>
                <span className="rounded-full border border-white/10 px-2 py-0.5 text-[9px] uppercase text-muted-foreground">
                  {frame.kind}
                </span>
              </div>
              {frame.rows?.length ? (
                <div className="overflow-hidden rounded-lg border border-white/10">
                  <div className="grid grid-cols-2 bg-white/[0.04] text-muted-foreground">
                    {(frame.columns ?? ["Name", "Status"]).slice(0, 2).map((column) => (
                      <div className="px-2 py-1.5" key={column}>
                        {column}
                      </div>
                    ))}
                  </div>
                  {frame.rows.slice(0, 4).map((row, index) => (
                    <div className="grid grid-cols-2 border-t border-white/10" key={`${frame.id}-row-${index}`}>
                      {row.slice(0, 2).map((cell) => (
                        <div className="px-2 py-1.5" key={cell}>
                          {cell}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {frame.items.map((item) => (
                    <span className="rounded-full border border-white/10 bg-white/[0.035] px-2.5 py-1" key={`${frame.id}-${item}`}>
                      {item}
                    </span>
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}

      {preview.warnings?.length ? (
        <p className="mt-3 rounded-xl border border-amber-300/20 bg-amber-300/10 p-3 text-amber-100">
          {preview.warnings[0]?.message}
        </p>
      ) : null}
    </div>
  );
}

export function PreviewPanel() {
  const files = useWorkspaceStore((state) => state.files);
  const productMode = useChatStore((state) => state.productMode);
  const proposal = useChatStore((state) => state.proposal);
  const projectId = useWorkspaceStore((state) => state.projectId);
  const error = useRuntimeStore((state) => state.error);
  const iframeVersion = useRuntimeStore((state) => state.iframeVersion);
  const isLoading = useRuntimeStore((state) => state.isLoading);
  const previewUrl = useRuntimeStore((state) => state.previewUrl);
  const refreshRuntimeStatus = useRuntimeStore((state) => state.refreshRuntimeStatus);
  const runtimeErrors = useRuntimeStore((state) => state.runtimeErrors);
  const runtimeFramework = useRuntimeStore((state) => state.runtimeFramework);
  const runtimeHealth = useRuntimeStore((state) => state.runtimeHealth);
  const runtimeLastUpdatedAt = useRuntimeStore((state) => state.runtimeLastUpdatedAt);
  const runtimeLogs = useRuntimeStore((state) => state.runtimeLogs);
  const runtimePort = useRuntimeStore((state) => state.runtimePort);
  const runtimePreviewUrl = useRuntimeStore((state) => state.runtimePreviewUrl);
  const runtimeStatus = useRuntimeStore((state) => state.runtimeStatus);
  const setPreviewOpen = useRuntimeStore((state) => state.setPreviewOpen);
  const status = useRuntimeStore((state) => state.status);
  const startPreview = useRuntimeStore((state) => state.startPreview);
  const stopPreview = useRuntimeStore((state) => state.stopPreview);
  const syncPreview = useRuntimeStore((state) => state.syncPreview);
  const livePreviewUrl = runtimePreviewUrl ?? previewUrl;
  const iframeSource = livePreviewUrl ? `${livePreviewUrl}?v=${iframeVersion}` : null;
  const hasIndexHtml = Boolean(files["index.html"]);
  const activePreviewMetadata = proposal?.livePreviewMetadata ?? proposal?.previewMetadata;
  const unifiedPreviewType = previewTypeFromClassification(proposal?.livePreviewClassification) ??
    proposal?.previewClassification?.previewType ??
    normalizePreviewType(proposal?.previewType, productMode);
  const realPreview = realPreviewFrom(proposal?.liveRealPreview) ?? realPreviewFrom(proposal?.realPreview);
  const executablePreview = executablePreviewFrom(activePreviewMetadata?.executablePreview);
  const isWebsitePreview = unifiedPreviewType === "website";
  const canStartStaticPreview = isWebsitePreview && hasIndexHtml;
  const proposalDocFiles =
    proposal?.changes
      .map((change) => change.path)
      .filter((path): path is string => typeof path === "string" && /\.(?:md|mdx|txt)$/i.test(path))
      .slice(0, 4) ?? [];
  const appPreview = proposal?.appPreview;
  const isCodePreviewContext =
    productMode === "CODE" ||
    unifiedPreviewType === "application" ||
    unifiedPreviewType === "architecture" ||
    unifiedPreviewType === "component" ||
    unifiedPreviewType === "dashboard" ||
    unifiedPreviewType === "mobile" ||
    proposal?.previewMode === "code_plan" ||
    proposal?.previewType === "code_app_preview" ||
    proposal?.previewType === "code_plan_preview";
  const structuredPreviewFields =
    unifiedPreviewType === "dashboard"
      ? ["screens", "widgets", "charts", "panels"]
      : unifiedPreviewType === "mobile"
        ? ["screens", "navigation", "flows"]
        : unifiedPreviewType === "component"
          ? ["components", "props", "states"]
          : unifiedPreviewType === "application"
            ? ["routes", "modules", "features"]
            : ["services", "endpoints", "dataFlow"];
  const structuredPreviewItems = structuredPreviewFields
    .map((field) => ({
      field,
      values: metadataArray(activePreviewMetadata, field)
    }))
    .filter((item) => item.values.length > 0);
  const missingPreviewMessage = isCodePreviewContext
    ? `${previewLabel(unifiedPreviewType)} ready. Review the proposal files and metadata. Live iframe preview is available for WEBSITE/static outputs.${
        proposalDocFiles.length ? ` Planning docs: ${proposalDocFiles.join(", ")}.` : ""
      }`
    : "Preview needs index.html. Use WEBSITE mode to create a static website.";

  useEffect(() => {
    if (!projectId) {
      return;
    }

    void refreshRuntimeStatus(projectId);

    const interval = setInterval(() => {
      void refreshRuntimeStatus(projectId);
    }, 2500);

    return () => clearInterval(interval);
  }, [projectId, refreshRuntimeStatus]);

  return (
    <Panel className="fixed bottom-2 right-2 top-[3.5rem] z-30 hidden w-[30rem] max-w-[calc(100vw-1rem)] flex-col rounded-[24px] border border-[hsl(var(--premium-border))] bg-[hsl(var(--premium-panel)/0.82)] shadow-[0_24px_90px_rgba(0,0,0,0.55)] backdrop-blur-xl lg:flex xl:w-[34rem] 2xl:w-[38rem]">
      <div className="flex items-center justify-between gap-3 border-b border-[hsl(var(--premium-border))] px-4 py-3.5">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Preview
          </div>
          <div className="mt-1 text-xs text-foreground">
            {status === "running" ? "Local static runtime" : previewLabel(unifiedPreviewType)}
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
          disabled={isLoading || !projectId || !canStartStaticPreview}
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

      {runtimeFramework || runtimeLogs.length || runtimeErrors.length ? (
        <div className="border-b border-[hsl(var(--premium-border))] px-4 py-3 text-[11px] leading-5 text-muted-foreground">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-2 py-0.5 uppercase ${
              runtimeStatus === "running"
                ? "border-emerald-400/35 text-emerald-300"
                : runtimeStatus === "error" || runtimeStatus === "blocked"
                  ? "border-red-400/35 text-red-200"
                  : "border-white/10 text-muted-foreground"
            }`}>
              {runtimeStatus}
            </span>
            <span>Framework: {runtimeFramework ?? "runtime"}</span>
            {runtimePort ? <span>Port: {runtimePort}</span> : null}
            {livePreviewUrl ? <span className="truncate">URL: {livePreviewUrl}</span> : null}
          </div>
          {runtimeErrors.at(-1) ? (
            <div className="mt-2 rounded-lg border border-red-400/20 bg-red-400/10 px-2 py-1 text-red-100">
              {runtimeErrors.at(-1)}
            </div>
          ) : null}
          {runtimeLogs.length ? (
            <details className="mt-2">
              <summary className="cursor-pointer text-foreground/80">
                Recent runtime logs
              </summary>
              <pre className="mt-2 max-h-24 overflow-auto whitespace-pre-wrap rounded-lg border border-white/10 bg-black/35 p-2 font-mono text-[10px] leading-4">
                {runtimeLogs.slice(-10).join("\n")}
              </pre>
            </details>
          ) : null}
          <div className="mt-2 text-[10px] text-muted-foreground">
            {runtimeHealth ? `Health: ${runtimeHealth}` : null}
            {runtimeLastUpdatedAt ? `${runtimeHealth ? " · " : ""}Updated: ${runtimeLastUpdatedAt}` : null}
          </div>
        </div>
      ) : null}

      {executablePreview && executablePreview.framework !== "unknown" ? (
        <div className="border-b border-[hsl(var(--premium-border))] px-4 py-2 text-[11px] leading-5 text-muted-foreground">
          {executablePreview.devServerRuntime ? (
            <>
              Framework: {executablePreview.devServerRuntime.frameworkDisplayName}. Runtime:{" "}
              {executablePreview.devServerRuntime.runtimeStatus.replace(/_/g, " ")}.
              {executablePreview.devServerRuntime.port
                ? ` Port: ${executablePreview.devServerRuntime.port}.`
                : null}
              {executablePreview.devServerRuntime.startCommand
                ? ` Command: ${executablePreview.devServerRuntime.startCommand}.`
                : null}
            </>
          ) : (
            <>
              Executable preview detected: {(executablePreview.frameworkMatch?.displayName ?? executablePreview.framework).replace(/_/g, " ")}.
              {executablePreview.canExecuteNow
                ? " Existing static iframe preview can render this output."
                : " Runtime start is blocked until safe enablement."}
              {executablePreview.commandPlan?.devCommand
                ? ` Planned command metadata: ${executablePreview.commandPlan.devCommand} on port ${executablePreview.commandPlan.defaultPort}.`
                : null}
            </>
          )}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-hidden bg-black/35 p-2">
        {iframeSource ? (
          <iframe
            className="h-full min-h-0 w-full rounded-2xl border border-[hsl(var(--premium-border))] bg-white"
            key={iframeSource}
            src={iframeSource}
            title="Hassali local preview"
          />
        ) : realPreview && realPreview.state === "ready" && realPreview.kind !== "static_website" ? (
          <RealPreviewMock preview={realPreview} />
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
        ) : proposal && isCodePreviewContext && unifiedPreviewType !== "none" ? (
          <div className="flex h-full min-h-0 flex-col overflow-auto rounded-xl border border-[hsl(var(--royal-border-soft))] bg-[hsl(var(--royal-panel)/0.55)] p-4 text-xs text-foreground">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  Unified preview
                </p>
                <h3 className="mt-1 text-lg font-semibold">{previewLabel(unifiedPreviewType)}</h3>
                <p className="mt-1 text-muted-foreground">
                  {proposal.previewClassification?.reason ?? "Metadata-only preview is available for this CODE proposal."}
                </p>
              </div>
              <span className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] uppercase text-muted-foreground">
                {proposal.previewRuntimeState ?? "metadata"}
              </span>
            </div>
            {structuredPreviewItems.length ? (
              <div className="space-y-3">
                {structuredPreviewItems.map((item) => (
                  <div className="rounded-xl border border-white/10 bg-black/20 p-3" key={item.field}>
                    <p className="mb-2 text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                      {item.field}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {item.values.map((value) => (
                        <span className="rounded-full border border-white/10 px-2.5 py-1" key={`${item.field}-${value}`}>
                          {value}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-xl border border-white/10 bg-black/20 p-3 text-muted-foreground">
                Preview metadata is empty. Review the proposal files for architecture details.
              </p>
            )}
            {proposal.previewWarnings?.length ? (
              <p className="mt-3 rounded-xl border border-amber-300/20 bg-amber-300/10 p-3 text-amber-100">
                {proposal.previewWarnings[0]}
              </p>
            ) : null}
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
