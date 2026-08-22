"use client";

import { useEffect, useState } from "react";

type Repository = { fullName: string; private: boolean; updatedAt: string | null };
type SelectedRepository = { repositoryName: string; repositoryOwner: string; private: boolean };
type BrowserGlobal = { location?: { href: string } };

export function GitHubIcon({ className = "h-4 w-4" }: { className?: string }) {
  return <svg aria-hidden="true" className={className} fill="currentColor" viewBox="0 0 24 24"><path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.87c-2.78.6-3.37-1.18-3.37-1.18-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.9 1.53 2.35 1.09 2.92.83.09-.65.35-1.09.64-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02A9.6 9.6 0 0 1 12 6.82a9.6 9.6 0 0 1 2.5.34c1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.86v2.76c0 .27.18.58.69.48A10 10 0 0 0 12 2Z" /></svg>;
}

export function GitHubProjectPanel({ projectId }: { projectId: string | null }) {
  const [configured, setConfigured] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [selected, setSelected] = useState<SelectedRepository | null>(null);
  const [selectedName, setSelectedName] = useState("");

  useEffect(() => {
    fetch(`/api/github/status${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ""}`)
      .then(async (response) => response.json() as Promise<{ configured?: boolean; connected?: boolean; reason?: string | null; repository?: SelectedRepository | null }>)
      .then((payload) => {
        setConfigured(payload.configured === true);
        setConnected(payload.connected === true);
        setSelected(payload.repository ?? null);
        setError(payload.configured === false ? payload.reason ?? "GitHub is not configured." : null);
      })
      .catch(() => setError("GitHub status is unavailable."));
  }, [projectId]);

  const discover = async () => {
    setLoading(true); setError(null);
    try {
      const response = await fetch("/api/github/repositories");
      const payload = await response.json() as { error?: string; repositories?: Repository[] };
      if (!response.ok) throw new Error(payload.error);
      setRepositories(payload.repositories ?? []);
      setSelectedName(payload.repositories?.[0]?.fullName ?? "");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Repositories are unavailable."); }
    finally { setLoading(false); }
  };

  const attach = async () => {
    if (!projectId || !selectedName) return;
    setLoading(true); setError(null);
    try {
      const response = await fetch("/api/github/project", { body: JSON.stringify({ fullName: selectedName, projectId }), headers: { "Content-Type": "application/json" }, method: "POST" });
      const payload = await response.json() as { error?: string; repository?: SelectedRepository };
      if (!response.ok) throw new Error(payload.error);
      setSelected(payload.repository ?? null);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Repository could not be attached."); }
    finally { setLoading(false); }
  };

  return <div className="mt-2 space-y-2 px-2 pb-2 text-[11px] text-muted-foreground">
    {selected ? <div className="rounded-md bg-white/[0.035] px-2 py-2"><div className="truncate font-medium text-foreground">{selected.repositoryOwner}/{selected.repositoryName}</div><div>{selected.private ? "Private" : "Public"} repository · read-only source context</div></div> : null}
    {!configured ? <p>{error ?? "GitHub is not configured."}</p> : !connected ? <button className="hassali-focus-ring rounded-md bg-white/[0.06] px-2 py-1.5 text-foreground hover:bg-white/[0.1]" onClick={() => { const location = (globalThis as BrowserGlobal).location; if (location) location.href = "/api/github/connect"; }} type="button">Connect GitHub</button> : <>
      <button className="hassali-focus-ring text-[hsl(var(--premium-accent-soft))] hover:text-foreground" disabled={loading} onClick={() => void discover()} type="button">{loading ? "Loading..." : "Choose repository"}</button>
      {repositories.length ? <div className="space-y-1"><select aria-label="GitHub repository" className="h-8 w-full rounded-md border border-white/10 bg-[hsl(var(--premium-panel-strong))] px-2 text-xs text-foreground" onChange={(event) => setSelectedName((event.currentTarget as unknown as { value: string }).value)} value={selectedName}>{repositories.map((repository) => <option key={repository.fullName} value={repository.fullName}>{repository.fullName}{repository.private ? " · private" : ""}</option>)}</select><button className="hassali-focus-ring rounded-md bg-[hsl(var(--premium-accent)/0.14)] px-2 py-1.5 text-[hsl(var(--premium-accent-soft))]" disabled={!projectId || !selectedName || loading} onClick={() => void attach()} type="button">Attach to current project</button></div> : null}
    </>}
    {error && configured ? <p className="text-rose-300">{error}</p> : null}
    <p className="leading-4">Attaching reads bounded repository metadata. File changes, commits, and push still require CODE authority; push is never automatic.</p>
  </div>;
}
