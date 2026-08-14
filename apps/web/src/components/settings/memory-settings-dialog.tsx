"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Preferences = {
  automaticMemoryEnabled: boolean;
  conversationMemoryEnabled: boolean;
  memoryEnabled: boolean;
  paused: boolean;
  projectMemoryEnabled: boolean;
  sensitiveMemoryAllowed: boolean;
  updatedAt: string | null;
  userMemoryEnabled: boolean;
};

type UserMemory = {
  captureMethod: "automatic" | "explicit";
  category: string;
  createdAt: string;
  id: string;
  key: string;
  person: { canonicalName: string; id: string; relationship: string | null } | null;
  sensitivity: "sensitive" | "standard";
  sourceType: string;
  status: "active" | "superseded";
  updatedAt: string;
  value: string;
};

type Person = { aliases: string[]; canonicalName: string; id: string; relationship: string | null };
type ProjectMemory = {
  category: string;
  content: string;
  conversationId: string | null;
  conversationTitle: string | null;
  createdAt: string;
  id: string;
  projectId: string;
  projectName: string;
  sourceType: string;
  status: string;
  title: string;
  updatedAt: string;
};
type ConversationMemory = {
  conversationId: string;
  lastActivityAt: string;
  projectId: string;
  projectName: string;
  status: string;
  summary: string;
  title: string;
};
type Episode = {
  description: string;
  occurredAt: string;
  projectId: string;
  projectName: string;
  status: string;
};
type Snapshot = {
  conversations: ConversationMemory[];
  episodes: Episode[];
  people: Person[];
  preferences: Preferences;
  projectMemories: ProjectMemory[];
  userMemories: UserMemory[];
};
type Filter = "all" | "history" | "people" | "personal" | "projects";
type BrowserInputTarget = { value: string };
type BrowserGlobal = {
  URL?: { createObjectURL: (blob: Blob) => string; revokeObjectURL: (url: string) => void };
  addEventListener?: (type: string, listener: (event: Event) => void) => void;
  cancelAnimationFrame?: (id: number) => void;
  document?: {
    body: { appendChild: (element: unknown) => void };
    createElement: (tag: "a") => {
      click: () => void;
      download: string;
      href: string;
      remove: () => void;
    };
  };
  removeEventListener?: (type: string, listener: (event: Event) => void) => void;
  requestAnimationFrame?: (callback: () => void) => number;
};

const preferenceRows: Array<{
  description: string;
  key: keyof Omit<Preferences, "updatedAt">;
  label: string;
}> = [
  {
    description: "Use and save long-term personal and project memory.",
    key: "memoryEnabled",
    label: "Memory"
  },
  {
    description: "Temporarily stop retrieval and new saves without deleting anything.",
    key: "paused",
    label: "Pause memory"
  },
  {
    description: "Save useful ordinary details when you state them naturally.",
    key: "automaticMemoryEnabled",
    label: "Automatically remember useful details"
  },
  {
    description:
      "Allow deliberate, explicit saves of sensitive facts. Credentials are always prohibited.",
    key: "sensitiveMemoryAllowed",
    label: "Allow explicitly saved sensitive memories"
  }
];

function displayDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Unknown date"
    : date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function sourceLabel(source: string, capture?: string) {
  if (source === "memory_settings") return "Corrected by you in Memory Settings";
  if (source === "user_message")
    return capture === "explicit"
      ? "Explicitly remembered from your message"
      : "Remembered from your message";
  return source.replaceAll("_", " ");
}

function Toggle(props: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: () => void;
}) {
  return (
    <button
      aria-checked={props.checked}
      aria-label={props.label}
      className={`hassali-focus-ring relative h-6 w-11 shrink-0 rounded-full transition-colors ${props.checked ? "bg-[hsl(var(--premium-accent))]" : "bg-white/15 [.light_&]:bg-slate-300"}`}
      disabled={props.disabled}
      onClick={props.onChange}
      role="switch"
      type="button"
    >
      <span
        className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${props.checked ? "translate-x-6" : "translate-x-1"}`}
      />
    </button>
  );
}

export function MemorySettingsDialog(props: { onClose: () => void; open: boolean }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);
  const [clearPhrase, setClearPhrase] = useState("");
  const [editing, setEditing] = useState<{
    id: string;
    kind: "edit-project" | "edit-user";
    value: string;
  } | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const adopt = (payload: Snapshot | { snapshot: Snapshot }) =>
    setSnapshot("snapshot" in payload ? payload.snapshot : payload);
  const load = async () => {
    setError(null);
    try {
      const response = await fetch("/api/memory");
      const payload = (await response.json()) as Snapshot | { error?: string };
      if (!response.ok || "error" in payload)
        throw new Error("error" in payload ? payload.error : "Memory could not be loaded.");
      setSnapshot(payload as Snapshot);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Memory could not be loaded.");
    }
  };

  useEffect(() => {
    if (!props.open) return;
    void load();
    const browser = globalThis as BrowserGlobal;
    const frame = browser.requestAnimationFrame?.(() =>
      (closeRef.current as unknown as { focus?: () => void } | null)?.focus?.()
    );
    const onKeyDown = (event: Event) => {
      if ((event as unknown as { key?: string }).key === "Escape") props.onClose();
    };
    browser.addEventListener?.("keydown", onKeyDown);
    return () => {
      if (frame !== undefined) browser.cancelAnimationFrame?.(frame);
      browser.removeEventListener?.("keydown", onKeyDown);
    };
  }, [props.open]);

  const request = async (
    method: "DELETE" | "PATCH",
    body: Record<string, unknown>,
    key: string
  ) => {
    setBusy(key);
    setError(null);
    try {
      const response = await fetch("/api/memory", {
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
        method
      });
      const payload = (await response.json()) as Snapshot | { error?: string; snapshot?: Snapshot };
      if (!response.ok || "error" in payload)
        throw new Error("error" in payload ? payload.error : "The memory change failed.");
      adopt(payload as Snapshot | { snapshot: Snapshot });
      setConfirming(null);
      setEditing(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The memory change failed.");
    } finally {
      setBusy(null);
    }
  };

  const updatePreference = (key: keyof Omit<Preferences, "updatedAt">, value: boolean) =>
    request("PATCH", { action: "preferences", preferences: { [key]: value } }, `pref-${key}`);

  const exportMemory = async () => {
    setBusy("export");
    setError(null);
    try {
      const response = await fetch("/api/memory/export");
      if (!response.ok) throw new Error("Memory export could not be created.");
      const blob = await response.blob();
      const browser = globalThis as BrowserGlobal;
      if (!browser.URL || !browser.document)
        throw new Error("Memory export is unavailable in this browser.");
      const url = browser.URL.createObjectURL(blob);
      const link = browser.document.createElement("a");
      link.href = url;
      link.download = `hassali-memory-${new Date().toISOString().slice(0, 10)}.json`;
      browser.document.body.appendChild(link);
      link.click();
      link.remove();
      browser.URL.revokeObjectURL(url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Memory export could not be created.");
    } finally {
      setBusy(null);
    }
  };

  const normalizedQuery = query.trim().toLowerCase();
  const visibleUserMemories = useMemo(
    () =>
      (snapshot?.userMemories ?? []).filter((memory) => {
        if (filter === "history" && memory.status !== "superseded") return false;
        if (filter === "people" && !memory.person) return false;
        if (filter === "personal" && memory.person) return false;
        if (filter === "projects") return false;
        return (
          !normalizedQuery ||
          `${memory.key} ${memory.value} ${memory.category} ${memory.person?.canonicalName ?? ""} ${memory.person?.relationship ?? ""}`
            .toLowerCase()
            .includes(normalizedQuery)
        );
      }),
    [filter, normalizedQuery, snapshot]
  );
  const visibleProjects = useMemo(
    () =>
      (snapshot?.projectMemories ?? []).filter(
        (memory) =>
          (filter === "all" ||
            filter === "projects" ||
            (filter === "history" && memory.status === "superseded")) &&
          (!normalizedQuery ||
            `${memory.projectName} ${memory.title} ${memory.content} ${memory.category} ${memory.conversationTitle ?? ""}`
              .toLowerCase()
              .includes(normalizedQuery))
      ),
    [filter, normalizedQuery, snapshot]
  );

  if (!props.open) return null;
  const hasVisibleMemory = visibleUserMemories.length > 0 || visibleProjects.length > 0;

  return (
    <div
      aria-labelledby="memory-settings-title"
      aria-modal="true"
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm sm:p-6"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) props.onClose();
      }}
      role="dialog"
    >
      <div className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-[hsl(var(--premium-border))] bg-[hsl(var(--premium-panel-strong))] text-foreground shadow-[0_24px_90px_rgba(0,0,0,0.55)] sm:max-h-[calc(100dvh-3rem)] [.light_&]:bg-white">
        <header className="flex items-start justify-between gap-4 border-b border-[hsl(var(--premium-border))] px-4 py-4 sm:px-5">
          <div>
            <p className="text-[10px] font-semibold uppercase text-[hsl(var(--premium-accent))]">
              Settings
            </p>
            <h2 className="mt-1 text-lg font-semibold" id="memory-settings-title">
              Memory
            </h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
              Hassali can reuse compact details and project context between chats. You control what
              is used, saved, exported, or forgotten.
            </p>
          </div>
          <button
            aria-label="Close Memory settings"
            className="hassali-focus-ring flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-lg text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
            onClick={props.onClose}
            ref={closeRef}
            type="button"
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          {error ? (
            <div
              className="mb-4 flex items-center justify-between gap-3 border-l-2 border-rose-400 px-3 py-2 text-xs text-rose-200"
              role="alert"
            >
              <span>{error}</span>
              <button
                className="hassali-focus-ring rounded-md px-2 py-1 font-semibold hover:bg-white/[0.06]"
                onClick={() => void load()}
                type="button"
              >
                Retry
              </button>
            </div>
          ) : null}
          {!snapshot && !error ? (
            <p className="py-12 text-center text-xs text-muted-foreground">Loading Memory…</p>
          ) : null}
          {snapshot ? (
            <>
              <section
                aria-label="Memory preferences"
                className="border-b border-[hsl(var(--premium-border))] pb-4"
              >
                {preferenceRows.map((row) => {
                  const disabled =
                    row.key !== "memoryEnabled" &&
                    row.key !== "paused" &&
                    !snapshot.preferences.memoryEnabled;
                  return (
                    <div className="flex items-center justify-between gap-5 py-2.5" key={row.key}>
                      <div>
                        <p className="text-xs font-semibold">{row.label}</p>
                        <p className="mt-0.5 text-[11px] leading-5 text-muted-foreground">
                          {row.description}
                        </p>
                      </div>
                      <Toggle
                        checked={snapshot.preferences[row.key]}
                        disabled={busy !== null || disabled}
                        label={row.label}
                        onChange={() =>
                          void updatePreference(row.key, !snapshot.preferences[row.key])
                        }
                      />
                    </div>
                  );
                })}
                <details className="mt-2 text-[11px] leading-5 text-muted-foreground">
                  <summary className="hassali-focus-ring cursor-pointer font-medium text-foreground">
                    Memory and chat history are different
                  </summary>
                  <p className="mt-1 max-w-3xl">
                    Memory is compact derived context Hassali may reuse. Chat history is the
                    original conversation. Clearing Memory does not delete chats, projects, files,
                    or Project Notes.
                  </p>
                </details>
              </section>

              <section className="py-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-sm font-semibold">What Hassali remembers</h3>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {snapshot.userMemories.filter((item) => item.status === "active").length}{" "}
                      personal · {snapshot.people.length} people ·{" "}
                      {snapshot.projectMemories.filter((item) => item.status === "active").length}{" "}
                      project items
                    </p>
                  </div>
                  <button
                    className="hassali-focus-ring self-start rounded-md border border-[hsl(var(--premium-border))] px-3 py-2 text-xs font-semibold hover:bg-white/[0.05]"
                    disabled={busy !== null}
                    onClick={() => void exportMemory()}
                    type="button"
                  >
                    {busy === "export" ? "Preparing…" : "Export Memory JSON"}
                  </button>
                </div>
                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <input
                    aria-label="Search memory"
                    className="hassali-focus-ring min-h-10 flex-1 rounded-md border border-[hsl(var(--premium-border))] bg-black/15 px-3 text-xs placeholder:text-muted-foreground [.light_&]:bg-white"
                    onChange={(event) =>
                      setQuery((event.currentTarget as unknown as BrowserInputTarget).value)
                    }
                    placeholder="Search details, people, projects, or conversations"
                    value={query}
                  />
                  <div aria-label="Memory filters" className="flex flex-wrap gap-1" role="group">
                    {(["all", "personal", "people", "projects", "history"] as Filter[]).map(
                      (item) => (
                        <button
                          aria-pressed={filter === item}
                          className={`hassali-focus-ring rounded-md px-2.5 py-2 text-[11px] capitalize ${filter === item ? "bg-white/[0.09] text-foreground [.light_&]:bg-slate-200" : "text-muted-foreground hover:text-foreground"}`}
                          key={item}
                          onClick={() => setFilter(item)}
                          type="button"
                        >
                          {item}
                        </button>
                      )
                    )}
                  </div>
                </div>

                <div className="mt-4 divide-y divide-[hsl(var(--premium-border))] border-y border-[hsl(var(--premium-border))]">
                  {!hasVisibleMemory ? (
                    <p className="py-10 text-center text-xs text-muted-foreground">
                      Hassali hasn&apos;t saved any matching memory yet.
                    </p>
                  ) : null}
                  {visibleUserMemories.map((memory) => (
                    <article className="py-3" key={memory.id}>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-semibold">{memory.key}</span>
                            <span
                              className={`rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase ${memory.status === "active" ? "bg-emerald-400/10 text-emerald-300" : "bg-white/[0.06] text-muted-foreground"}`}
                            >
                              {memory.status === "active" ? "Current" : "Historical"}
                            </span>
                            {memory.sensitivity === "sensitive" ? (
                              <span className="rounded bg-amber-300/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-amber-200">
                                Sensitive
                              </span>
                            ) : null}
                          </div>
                          {editing?.id === memory.id ? (
                            <input
                              aria-label={`Edit ${memory.key}`}
                              autoFocus
                              className="hassali-focus-ring mt-2 min-h-9 w-full rounded-md border border-[hsl(var(--premium-border))] bg-black/15 px-2.5 text-xs"
                              onChange={(event) =>
                                setEditing({
                                  ...editing,
                                  value: (event.currentTarget as unknown as BrowserInputTarget)
                                    .value
                                })
                              }
                              value={editing.value}
                            />
                          ) : (
                            <p className="mt-1 text-xs leading-5 text-foreground/90">
                              {memory.value}
                            </p>
                          )}
                          <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
                            {memory.person
                              ? `${memory.person.canonicalName}${memory.person.relationship ? ` · ${memory.person.relationship}` : ""} · `
                              : ""}
                            {sourceLabel(memory.sourceType, memory.captureMethod)} ·{" "}
                            {displayDate(memory.updatedAt)}
                          </p>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          {memory.status === "active" ? (
                            editing?.id === memory.id ? (
                              <>
                                <button
                                  className="hassali-focus-ring rounded-md px-2 py-1.5 text-[11px] font-semibold text-emerald-300"
                                  disabled={!editing.value.trim() || busy !== null}
                                  onClick={() =>
                                    void request(
                                      "PATCH",
                                      {
                                        action: editing.kind,
                                        memoryId: editing.id,
                                        value: editing.value
                                      },
                                      `edit-${memory.id}`
                                    )
                                  }
                                  type="button"
                                >
                                  Save
                                </button>
                                <button
                                  className="hassali-focus-ring rounded-md px-2 py-1.5 text-[11px] text-muted-foreground"
                                  onClick={() => setEditing(null)}
                                  type="button"
                                >
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <button
                                className="hassali-focus-ring rounded-md px-2 py-1.5 text-[11px] text-muted-foreground hover:text-foreground"
                                onClick={() =>
                                  setEditing({
                                    id: memory.id,
                                    kind: "edit-user",
                                    value: memory.value
                                  })
                                }
                                type="button"
                              >
                                Edit
                              </button>
                            )
                          ) : null}
                          <button
                            className="hassali-focus-ring rounded-md px-2 py-1.5 text-[11px] text-rose-300 hover:bg-rose-400/10"
                            disabled={busy !== null}
                            onClick={() =>
                              void request(
                                "DELETE",
                                { action: "memory", memoryId: memory.id },
                                `forget-${memory.id}`
                              )
                            }
                            type="button"
                          >
                            Forget
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                  {visibleProjects.map((memory) => (
                    <article className="py-3" key={memory.id}>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-semibold">{memory.title}</span>
                            <span className="rounded bg-violet-400/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-violet-200">
                              {memory.status === "active" ? "Current" : memory.status}
                            </span>
                          </div>
                          {editing?.id === memory.id ? (
                            <input
                              aria-label={`Edit ${memory.title}`}
                              autoFocus
                              className="hassali-focus-ring mt-2 min-h-9 w-full rounded-md border border-[hsl(var(--premium-border))] bg-black/15 px-2.5 text-xs"
                              onChange={(event) =>
                                setEditing({
                                  ...editing,
                                  value: (event.currentTarget as unknown as BrowserInputTarget)
                                    .value
                                })
                              }
                              value={editing.value}
                            />
                          ) : (
                            <p className="mt-1 text-xs leading-5">{memory.content}</p>
                          )}
                          <p className="mt-1 text-[10px] text-muted-foreground">
                            {memory.projectName}
                            {memory.conversationTitle
                              ? ` · From conversation: ${memory.conversationTitle}`
                              : ""}{" "}
                            · {sourceLabel(memory.sourceType)} · {displayDate(memory.updatedAt)}
                          </p>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          {memory.status === "active" ? (
                            editing?.id === memory.id ? (
                              <>
                                <button
                                  className="hassali-focus-ring rounded-md px-2 py-1.5 text-[11px] font-semibold text-emerald-300"
                                  disabled={!editing.value.trim() || busy !== null}
                                  onClick={() =>
                                    void request(
                                      "PATCH",
                                      {
                                        action: editing.kind,
                                        memoryId: editing.id,
                                        value: editing.value
                                      },
                                      `edit-${memory.id}`
                                    )
                                  }
                                  type="button"
                                >
                                  Save
                                </button>
                                <button
                                  className="hassali-focus-ring rounded-md px-2 py-1.5 text-[11px] text-muted-foreground"
                                  onClick={() => setEditing(null)}
                                  type="button"
                                >
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <button
                                className="hassali-focus-ring rounded-md px-2 py-1.5 text-[11px] text-muted-foreground hover:text-foreground"
                                onClick={() =>
                                  setEditing({
                                    id: memory.id,
                                    kind: "edit-project",
                                    value: memory.content
                                  })
                                }
                                type="button"
                              >
                                Edit
                              </button>
                            )
                          ) : null}
                          <button
                            className="hassali-focus-ring rounded-md px-2 py-1.5 text-[11px] text-rose-300 hover:bg-rose-400/10"
                            disabled={busy !== null}
                            onClick={() =>
                              void request(
                                "DELETE",
                                { action: "project-memory", memoryId: memory.id },
                                `forget-project-${memory.id}`
                              )
                            }
                            type="button"
                          >
                            Forget
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </section>

              {snapshot.people.length && (filter === "all" || filter === "people") ? (
                <section className="border-t border-[hsl(var(--premium-border))] py-4">
                  <h3 className="text-sm font-semibold">People</h3>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {snapshot.people
                      .filter(
                        (person) =>
                          !normalizedQuery ||
                          `${person.canonicalName} ${person.relationship ?? ""}`
                            .toLowerCase()
                            .includes(normalizedQuery)
                      )
                      .map((person) => (
                        <div
                          className="flex items-center justify-between gap-3 rounded-md bg-white/[0.025] px-3 py-2"
                          key={person.id}
                        >
                          <div>
                            <p className="text-xs font-semibold">{person.canonicalName}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {person.relationship ?? "Relationship not specified"}
                            </p>
                          </div>
                          {confirming === `person-${person.id}` ? (
                            <div className="flex gap-1">
                              <button
                                className="hassali-focus-ring rounded-md px-2 py-1 text-[10px] font-semibold text-rose-300"
                                onClick={() =>
                                  void request(
                                    "DELETE",
                                    { action: "person", personId: person.id },
                                    `person-${person.id}`
                                  )
                                }
                                type="button"
                              >
                                Confirm
                              </button>
                              <button
                                className="hassali-focus-ring px-2 py-1 text-[10px] text-muted-foreground"
                                onClick={() => setConfirming(null)}
                                type="button"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              className="hassali-focus-ring rounded-md px-2 py-1 text-[10px] text-rose-300"
                              onClick={() => setConfirming(`person-${person.id}`)}
                              type="button"
                            >
                              Forget person
                            </button>
                          )}
                        </div>
                      ))}
                  </div>
                </section>
              ) : null}

              <section className="border-t border-[hsl(var(--premium-border))] py-4">
                <h3 className="text-sm font-semibold">Derived project context</h3>
                <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                  Clear compact project or conversation memory without deleting the underlying
                  project, chat, files, or Project Notes.
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {[
                    ...new Map(
                      snapshot.projectMemories.map((item) => [item.projectId, item])
                    ).values()
                  ].map((project) => (
                    <div
                      className="flex items-center justify-between gap-3 rounded-md bg-white/[0.025] px-3 py-2"
                      key={project.projectId}
                    >
                      <span className="truncate text-xs">{project.projectName}</span>
                      {confirming === `project-${project.projectId}` ? (
                        <div className="flex gap-1">
                          <button
                            className="hassali-focus-ring px-2 py-1 text-[10px] font-semibold text-rose-300"
                            onClick={() =>
                              void request(
                                "DELETE",
                                { action: "project", projectId: project.projectId },
                                `project-${project.projectId}`
                              )
                            }
                            type="button"
                          >
                            Clear
                          </button>
                          <button
                            className="hassali-focus-ring px-2 py-1 text-[10px] text-muted-foreground"
                            onClick={() => setConfirming(null)}
                            type="button"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          className="hassali-focus-ring px-2 py-1 text-[10px] text-rose-300"
                          onClick={() => setConfirming(`project-${project.projectId}`)}
                          type="button"
                        >
                          Clear context
                        </button>
                      )}
                    </div>
                  ))}
                  {snapshot.conversations.map((conversation) => (
                    <div
                      className="flex items-center justify-between gap-3 rounded-md bg-white/[0.025] px-3 py-2"
                      key={conversation.conversationId}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-xs">{conversation.title}</p>
                        <p className="truncate text-[10px] text-muted-foreground">
                          {conversation.projectName}
                        </p>
                      </div>
                      {confirming === `conversation-${conversation.conversationId}` ? (
                        <div className="flex gap-1">
                          <button
                            className="hassali-focus-ring px-2 py-1 text-[10px] font-semibold text-rose-300"
                            onClick={() =>
                              void request(
                                "DELETE",
                                {
                                  action: "conversation",
                                  conversationId: conversation.conversationId
                                },
                                `conversation-${conversation.conversationId}`
                              )
                            }
                            type="button"
                          >
                            Clear
                          </button>
                          <button
                            className="hassali-focus-ring px-2 py-1 text-[10px] text-muted-foreground"
                            onClick={() => setConfirming(null)}
                            type="button"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          className="hassali-focus-ring px-2 py-1 text-[10px] text-rose-300"
                          onClick={() =>
                            setConfirming(`conversation-${conversation.conversationId}`)
                          }
                          type="button"
                        >
                          Clear summary
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </section>

              <section className="border-t border-rose-400/20 pt-4">
                <h3 className="text-sm font-semibold text-rose-200 [.light_&]:text-rose-800">
                  Clear all memory
                </h3>
                <p className="mt-1 max-w-3xl text-[11px] leading-5 text-muted-foreground">
                  Removes your derived personal, people, project, conversation, and historical
                  memory. It does not delete chats, projects, files, Project Notes, account data, or
                  Hassali&apos;s product knowledge.
                </p>
                <label className="mt-3 grid max-w-sm gap-1 text-[10px] text-muted-foreground">
                  Type CLEAR MY MEMORY to confirm
                  <input
                    className="hassali-focus-ring min-h-9 rounded-md border border-rose-400/20 bg-black/15 px-2.5 text-xs text-foreground"
                    onChange={(event) =>
                      setClearPhrase((event.currentTarget as unknown as BrowserInputTarget).value)
                    }
                    value={clearPhrase}
                  />
                </label>
                <button
                  className="hassali-focus-ring mt-2 rounded-md bg-rose-500/15 px-3 py-2 text-xs font-semibold text-rose-200 disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={clearPhrase !== "CLEAR MY MEMORY" || busy !== null}
                  onClick={() =>
                    void request(
                      "DELETE",
                      { action: "all", confirmation: clearPhrase },
                      "clear-all"
                    )
                  }
                  type="button"
                >
                  {busy === "clear-all" ? "Clearing…" : "Clear all memory"}
                </button>
              </section>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
