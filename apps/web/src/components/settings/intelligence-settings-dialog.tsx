"use client";

import { useEffect, useRef, useState } from "react";
import type {
  ConfigurableIntelligenceSourceId,
  IntelligenceSourceSummary,
  IntelligenceSourcesResponse
} from "@/lib/intelligence-sources";
import { requestIntelligenceSettings } from "@/lib/intelligence-settings-response";

type Draft = {
  apiKey: string;
  defaultModel: string;
  enabled: boolean;
  endpointUrl: string;
};

type BudgetDraft = {
  byokMonthlyWarningLimitUsd: string;
  managedMonthlyLimitUsd: string;
  managedPerRequestLimitUsd: string;
  mode: IntelligenceSourcesResponse["budget"]["mode"];
};

type BrowserInputTarget = { checked: boolean; value: string };
type BrowserGlobal = {
  addEventListener?: (type: string, listener: (event: Event) => void) => void;
  removeEventListener?: (type: string, listener: (event: Event) => void) => void;
  requestAnimationFrame?: (callback: () => void) => number;
};

function draftFromSource(source: IntelligenceSourceSummary): Draft {
  return {
    apiKey: "",
    defaultModel: source.defaultModel ?? "",
    enabled: source.enabled,
    endpointUrl: source.endpointUrl ?? ""
  };
}

function healthTone(status: IntelligenceSourceSummary["health"]["status"]) {
  if (status === "ready") return "bg-emerald-400";
  if (status === "loading" || status === "degraded") return "bg-amber-400";
  if (status === "rate-limited") return "bg-orange-400";
  return "bg-slate-500";
}

function formatBytes(value: number | null) {
  if (value === null) return null;
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)} GB`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(0)} MB`;
  return `${value} B`;
}

function SourceCard(props: {
  busy: boolean;
  draft: Draft;
  error?: string | null;
  onChange: (draft: Draft) => void;
  onDisconnect: () => void;
  onSave: () => void;
  onTest: () => void;
  source: IntelligenceSourceSummary;
}) {
  const { source } = props;
  const isCloudDefault = source.id === "hassali-cloud";
  const needsKey = source.id === "openrouter-byok";
  const configurableId = isCloudDefault ? null : source.id as ConfigurableIntelligenceSourceId;

  return (
    <section className="rounded-lg border border-[hsl(var(--premium-border))] bg-white/[0.025] p-4 [.light_&]:bg-slate-50">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${healthTone(source.health.status)}`} />
            <h3 className="text-sm font-semibold text-foreground">{source.label}</h3>
            <span className="text-[10px] uppercase text-muted-foreground">{source.computeSource.replace("-", " ")}</span>
          </div>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">{source.description}</p>
          <p className="mt-2 text-[11px] text-muted-foreground" role="status">
            {source.health.status.replace("-", " ")}
            {source.health.latencyMs !== null ? ` · ${source.health.latencyMs} ms` : ""}
            {source.health.reason ? ` · ${source.health.reason}` : ""}
          </p>
        </div>
        {isCloudDefault ? (
          <span className="rounded-md bg-white/[0.06] px-2 py-1 text-[11px] text-muted-foreground [.light_&]:bg-slate-200">
            Current default
          </span>
        ) : (
          <label className="flex min-h-8 cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <input
              checked={props.draft.enabled}
              className="h-4 w-4 accent-[hsl(var(--premium-accent))]"
              disabled={props.busy}
              onChange={(event) => props.onChange({
                ...props.draft,
                enabled: (event.currentTarget as unknown as BrowserInputTarget).checked
              })}
              type="checkbox"
            />
            Enabled
          </label>
        )}
      </div>

      {configurableId ? (
        <div className="mt-4 grid gap-3">
          {needsKey ? (
            <label className="grid gap-1.5 text-xs font-medium text-foreground">
              OpenRouter API key
              <input
                autoComplete="off"
                className="hassali-focus-ring h-10 w-full rounded-md border border-[hsl(var(--premium-border))] bg-black/20 px-3 font-mono text-xs text-foreground placeholder:text-muted-foreground/70 [.light_&]:bg-white"
                disabled={props.busy}
                onChange={(event) => props.onChange({
                  ...props.draft,
                  apiKey: (event.currentTarget as unknown as BrowserInputTarget).value
                })}
                placeholder={source.credentialConfigured ? "Key configured — enter a new key to replace it" : "sk-or-v1-…"}
                type="password"
                value={props.draft.apiKey}
              />
            </label>
          ) : (
            <label className="grid gap-1.5 text-xs font-medium text-foreground">
              Local endpoint
              <input
                autoComplete="off"
                className="hassali-focus-ring h-10 w-full rounded-md border border-[hsl(var(--premium-border))] bg-black/20 px-3 font-mono text-xs text-foreground placeholder:text-muted-foreground/70 [.light_&]:bg-white"
                disabled={props.busy}
                onChange={(event) => props.onChange({
                  ...props.draft,
                  endpointUrl: (event.currentTarget as unknown as BrowserInputTarget).value
                })}
                spellCheck={false}
                type="url"
                value={props.draft.endpointUrl}
              />
              <span className="font-normal text-muted-foreground">Loopback addresses only. Hassali will not install, start, or stop this service.</span>
            </label>
          )}

          {source.models.length ? (
            <label className="grid gap-1.5 text-xs font-medium text-foreground">
              Default model for this source
              <select
                className="hassali-focus-ring h-10 w-full rounded-md border border-[hsl(var(--premium-border))] bg-[hsl(var(--premium-panel-strong))] px-3 text-xs text-foreground [.light_&]:bg-white"
                disabled={props.busy}
                onChange={(event) => props.onChange({
                  ...props.draft,
                  defaultModel: (event.currentTarget as unknown as BrowserInputTarget).value
                })}
                value={props.draft.defaultModel}
              >
                <option value="">Choose later</option>
                {source.models.map((model) => (
                  <option key={model.modelId} value={model.modelId}>{model.displayName}</option>
                ))}
              </select>
            </label>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <button
              className="hassali-focus-ring min-h-9 rounded-md bg-[hsl(var(--premium-accent))] px-3 text-xs font-semibold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={props.busy}
              onClick={props.onSave}
              type="button"
            >
              {props.busy ? "Working…" : source.configured ? "Save changes" : "Connect"}
            </button>
            <button
              className="hassali-focus-ring min-h-9 rounded-md border border-[hsl(var(--premium-border))] px-3 text-xs font-medium text-foreground hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-50 [.light_&]:hover:bg-slate-100"
              disabled={props.busy || !source.configured}
              onClick={props.onTest}
              type="button"
            >
              Test connection
            </button>
            {source.configured ? (
              <button
                className="hassali-focus-ring min-h-9 rounded-md px-3 text-xs font-medium text-rose-300 hover:bg-rose-400/10 disabled:cursor-not-allowed disabled:opacity-50 [.light_&]:text-rose-700"
                disabled={props.busy}
                onClick={props.onDisconnect}
                type="button"
              >
                Disconnect
              </button>
            ) : null}
          </div>

          {props.error ? (
            <p className="border-l-2 border-rose-400/60 pl-2 text-[11px] leading-5 text-rose-200 [.light_&]:text-rose-800" role="alert">
              {props.error}
            </p>
          ) : null}

          {source.models.length ? (
            <div className="border-t border-[hsl(var(--premium-border))] pt-3">
              <p className="text-[11px] font-medium text-foreground">Discovered models · {source.modelCount}</p>
              <div className="mt-2 grid max-h-36 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2">
                {source.models.slice(0, 12).map((model) => {
                  const details = [model.parameterSize, model.quantization, model.format, formatBytes(model.sizeBytes)].filter(Boolean);
                  return (
                    <div className="min-w-0 rounded-md bg-black/15 px-2.5 py-2 [.light_&]:bg-white" key={model.modelId}>
                      <p className="truncate text-[11px] font-medium text-foreground" title={model.modelId}>{model.displayName}</p>
                      <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                        {details.length ? details.join(" · ") : model.capabilities.join(" · ") || "Capabilities not reported"}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export function IntelligenceSettingsDialog(props: { onClose: () => void; open: boolean }) {
  const [data, setData] = useState<IntelligenceSourcesResponse | null>(null);
  const [drafts, setDrafts] = useState<Partial<Record<ConfigurableIntelligenceSourceId, Draft>>>({});
  const [busySource, setBusySource] = useState<ConfigurableIntelligenceSourceId | null>(null);
  const [sourceErrors, setSourceErrors] = useState<Partial<Record<ConfigurableIntelligenceSourceId, string>>>({});
  const [routingBusy, setRoutingBusy] = useState(false);
  const [budgetDraft, setBudgetDraft] = useState<BudgetDraft>({
    byokMonthlyWarningLimitUsd: "",
    managedMonthlyLimitUsd: "",
    managedPerRequestLimitUsd: "",
    mode: "off"
  });
  const [error, setError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const adoptResponse = (response: IntelligenceSourcesResponse) => {
    setData(response);
    setBudgetDraft({
      byokMonthlyWarningLimitUsd: response.budget.byokMonthlyWarningLimitUsd?.toString() ?? "",
      managedMonthlyLimitUsd: response.budget.managedMonthlyLimitUsd?.toString() ?? "",
      managedPerRequestLimitUsd: response.budget.managedPerRequestLimitUsd?.toString() ?? "",
      mode: response.budget.mode
    });
    setDrafts((current) => Object.fromEntries(response.sources.flatMap((source) => {
      if (source.id === "hassali-cloud") return [];
      const previous = current[source.id];
      return [[source.id, {
        ...draftFromSource(source),
        apiKey: "",
        endpointUrl: previous?.endpointUrl && !source.configured ? previous.endpointUrl : source.endpointUrl ?? ""
      }]];
    })));
  };

  useEffect(() => {
    if (!props.open) {
      setDrafts({});
      setError(null);
      setSourceErrors({});
      return;
    }
    const controller = new AbortController();
    setData(null);
    setError(null);
    requestIntelligenceSettings("/api/settings/intelligence", { signal: controller.signal })
      .then((payload) => {
        adoptResponse(payload);
        (globalThis as BrowserGlobal).requestAnimationFrame?.(() => {
          (closeButtonRef.current as unknown as { focus?: () => void } | null)?.focus?.();
        });
      })
      .catch((caught) => {
        if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Settings could not be loaded.");
      });
    return () => controller.abort();
  }, [loadAttempt, props.open]);

  useEffect(() => {
    if (!props.open) return;
    const onKeyDown = (event: Event) => {
      if ((event as unknown as { key?: string }).key === "Escape") props.onClose();
    };
    (globalThis as BrowserGlobal).addEventListener?.("keydown", onKeyDown);
    return () => (globalThis as BrowserGlobal).removeEventListener?.("keydown", onKeyDown);
  }, [props]);

  if (!props.open) return null;

  const request = async (
    sourceId: ConfigurableIntelligenceSourceId,
    init: RequestInit
  ) => {
    setBusySource(sourceId);
    setSourceErrors((current) => ({ ...current, [sourceId]: undefined }));
    try {
      const payload = await requestIntelligenceSettings(
        "/api/settings/intelligence" + (init.method === "DELETE" ? `?sourceId=${encodeURIComponent(sourceId)}` : ""),
        init
      );
      adoptResponse(payload);
    } catch (caught) {
      setSourceErrors((current) => ({
        ...current,
        [sourceId]: caught instanceof Error ? caught.message : "The connection action failed."
      }));
    } finally {
      setDrafts((current) => ({
        ...current,
        [sourceId]: current[sourceId] ? { ...current[sourceId]!, apiKey: "" } : undefined
      }));
      setBusySource(null);
    }
  };

  const updateRoutingPrivacy = async (privacy: IntelligenceSourcesResponse["routing"]["privacy"]) => {
    setRoutingBusy(true);
    setError(null);
    try {
      const payload = await requestIntelligenceSettings("/api/settings/intelligence", {
        body: JSON.stringify({ privacy }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH"
      });
      adoptResponse(payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The routing preference could not be saved.");
    } finally {
      setRoutingBusy(false);
    }
  };

  const updateBudget = async () => {
    setRoutingBusy(true);
    setError(null);
    try {
      const payload = await requestIntelligenceSettings("/api/settings/intelligence", {
        body: JSON.stringify({
          budget: {
            byokMonthlyWarningLimitUsd: budgetDraft.byokMonthlyWarningLimitUsd || null,
            managedMonthlyLimitUsd: budgetDraft.managedMonthlyLimitUsd || null,
            managedPerRequestLimitUsd: budgetDraft.managedPerRequestLimitUsd || null,
            mode: budgetDraft.mode
          }
        }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH"
      });
      adoptResponse(payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The budget policy could not be saved.");
    } finally {
      setRoutingBusy(false);
    }
  };

  return (
    <div
      aria-labelledby="intelligence-settings-title"
      aria-modal="true"
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm sm:p-6"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) props.onClose();
      }}
      role="dialog"
    >
      <div className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-[hsl(var(--premium-border))] bg-[hsl(var(--premium-panel-strong))] text-foreground shadow-[0_24px_90px_rgba(0,0,0,0.55)] sm:max-h-[calc(100dvh-3rem)] [.light_&]:bg-white">
        <div className="flex items-start justify-between gap-4 border-b border-[hsl(var(--premium-border))] px-4 py-4 sm:px-5">
          <div>
            <p className="text-[10px] font-semibold uppercase text-[hsl(var(--premium-accent))]">Settings</p>
            <h2 className="mt-1 text-lg font-semibold" id="intelligence-settings-title">Intelligence</h2>
            <p className="mt-1 text-xs text-muted-foreground">Connect cloud credentials or services already running on this computer.</p>
          </div>
          <button
            aria-label="Close Intelligence settings"
            className="hassali-focus-ring flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-lg text-muted-foreground hover:bg-white/[0.06] hover:text-foreground [.light_&]:hover:bg-slate-100"
            onClick={props.onClose}
            ref={closeButtonRef}
            type="button"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          {data ? (
            <section className="mb-4 flex flex-col gap-3 rounded-lg border border-[hsl(var(--premium-border))] bg-white/[0.025] p-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold text-foreground">Routing · Auto</p>
                <p className="mt-1 text-[11px] leading-5 text-muted-foreground">Hassali selects the best reliably capable enabled source within this privacy boundary.</p>
              </div>
              <label className="flex shrink-0 items-center gap-2 text-[11px] text-muted-foreground">
                Privacy
                <select
                  aria-label="Automatic routing privacy"
                  className="hassali-focus-ring rounded-md border border-[hsl(var(--premium-border))] bg-[hsl(var(--premium-panel-strong))] px-2.5 py-2 text-xs text-foreground"
                  disabled={routingBusy}
                  onChange={(event) => void updateRoutingPrivacy((event.currentTarget as unknown as { value: IntelligenceSourcesResponse["routing"]["privacy"] }).value)}
                  value={data.routing.privacy}
                >
                  <option value="allow-cloud">Allow cloud</option>
                  <option value="prefer-local">Prefer local</option>
                  <option value="local-only">Local only</option>
                </select>
              </label>
            </section>
          ) : null}
          {data && data.persistence.status !== "ready" ? (
            <div className="mb-4 border-l-2 border-amber-300/55 bg-amber-300/[0.045] px-3 py-2 text-[11px] leading-5 text-amber-100 [.light_&]:text-amber-900" role="status">
              <p className="font-semibold">
                {data.persistence.status === "unavailable" ? "Temporary settings mode" : "Session-only credential storage"}
              </p>
              <p>{data.persistence.message}</p>
            </div>
          ) : null}
          {data ? (
            <section className="mb-4 border-y border-[hsl(var(--premium-border))] py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-xs font-semibold text-foreground">Usage & limits</h3>
                  <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                    {data.usage.requestCount} requests this period · {data.usage.totalTokens.toLocaleString()} reported tokens
                  </p>
                  <p className="text-[11px] leading-5 text-muted-foreground">
                    Managed recorded ${data.usage.managedCostUsd.toFixed(4)}
                    {data.usage.managedUnknownCostRequests ? ` · ${data.usage.managedUnknownCostRequests} unknown-cost request(s)` : ""}
                    {` · BYOK ${data.usage.byokRequests} request(s) · Local ${data.usage.localRequests} request(s)`}
                  </p>
                </div>
                <label className="grid gap-1 text-[11px] text-muted-foreground">
                  Budget mode
                  <select
                    aria-label="Intelligence budget mode"
                    className="hassali-focus-ring rounded-md border border-[hsl(var(--premium-border))] bg-[hsl(var(--premium-panel-strong))] px-2.5 py-2 text-xs text-foreground"
                    disabled={routingBusy}
                    onChange={(event) => setBudgetDraft((current) => ({
                      ...current,
                      mode: (event.currentTarget as unknown as { value: BudgetDraft["mode"] }).value
                    }))}
                    value={budgetDraft.mode}
                  >
                    <option value="off">Off</option>
                    <option value="warn">Warn</option>
                    <option value="strict">Strict</option>
                  </select>
                </label>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {([
                  ["managedPerRequestLimitUsd", "Managed per request"],
                  ["managedMonthlyLimitUsd", "Managed monthly"],
                  ["byokMonthlyWarningLimitUsd", "BYOK monthly warning"]
                ] as const).map(([key, label]) => (
                  <label className="grid gap-1 text-[11px] text-muted-foreground" key={key}>
                    {label} (USD)
                    <input
                      className="hassali-focus-ring rounded-md border border-[hsl(var(--premium-border))] bg-black/20 px-2.5 py-2 text-xs text-foreground [.light_&]:bg-white"
                      disabled={routingBusy}
                      min="0"
                      onChange={(event) => setBudgetDraft((current) => ({
                        ...current,
                        [key]: (event.currentTarget as unknown as BrowserInputTarget).value
                      }))}
                      placeholder="No limit"
                      step="0.01"
                      type="number"
                      value={budgetDraft[key]}
                    />
                  </label>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <p className="text-[10px] leading-4 text-muted-foreground">Unknown prices stay unknown. Local use has no external token charge but still consumes device resources.</p>
                <button
                  className="hassali-focus-ring shrink-0 rounded-md bg-[hsl(var(--premium-accent))] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                  disabled={routingBusy}
                  onClick={() => void updateBudget()}
                  type="button"
                >
                  Save limits
                </button>
              </div>
            </section>
          ) : null}
          {data ? (
            <section className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-[hsl(var(--premium-border))] pb-4">
              <div>
                <h3 className="text-xs font-semibold text-foreground">Hassali Local</h3>
                <p className="mt-1 text-[11px] leading-5 text-muted-foreground">Foundation available · native companion not installed or paired.</p>
              </div>
              <span className="text-[10px] uppercase text-muted-foreground">Protocol {data.local.protocolVersion} · Not paired</span>
            </section>
          ) : null}
          {error ? (
            <div aria-live="polite" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-rose-400/25 bg-rose-400/[0.07] px-3 py-2 text-xs text-rose-200 [.light_&]:text-rose-800" role="alert">
              <span>{error}</span>
              {!data ? (
                <button
                  className="hassali-focus-ring rounded-md border border-current/25 px-2.5 py-1.5 font-semibold hover:bg-white/[0.05]"
                  onClick={() => setLoadAttempt((current) => current + 1)}
                  type="button"
                >
                  Retry
                </button>
              ) : null}
            </div>
          ) : null}
          {!data && !error ? <p className="py-10 text-center text-xs text-muted-foreground">Loading intelligence sources…</p> : null}
          <div className="grid gap-3">
            {data?.sources.map((source) => {
              const configurableId = source.id === "hassali-cloud" ? null : source.id;
              const draft = configurableId ? drafts[configurableId] ?? draftFromSource(source) : draftFromSource(source);
              return (
                <SourceCard
                  busy={configurableId === busySource}
                  draft={draft}
                  error={configurableId ? sourceErrors[configurableId] : null}
                  key={source.id}
                  onChange={(next) => configurableId && setDrafts((current) => ({ ...current, [configurableId]: next }))}
                  onDisconnect={() => configurableId && request(configurableId, { method: "DELETE" })}
                  onSave={() => configurableId && request(configurableId, {
                    body: JSON.stringify({
                      apiKey: draft.apiKey || undefined,
                      defaultModel: draft.defaultModel || null,
                      enabled: draft.enabled,
                      endpointUrl: draft.endpointUrl || undefined,
                      sourceId: configurableId
                    }),
                    headers: { "Content-Type": "application/json" },
                    method: "PUT"
                  })}
                  onTest={() => configurableId && request(configurableId, {
                    body: JSON.stringify({ action: "test", sourceId: configurableId }),
                    headers: { "Content-Type": "application/json" },
                    method: "POST"
                  })}
                  source={source}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
