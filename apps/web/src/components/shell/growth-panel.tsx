"use client";
import { useEffect, useState } from "react";
import { useProductAreaStore } from "@/lib/product-area-store";
import { useWorkspaceStore } from "@/lib/workspace-store";

type GrowthState = { artifact?: { content?: string }; validation?: { status?: string } };

export function GrowthPanel() {
  const projectId = useWorkspaceStore((state) => state.projectId);
  const projectName = useWorkspaceStore((state) => state.projectName);
  const setArea = useProductAreaStore((state) => state.setArea);
  const [prompt, setPrompt] = useState("");
  const [state, setState] = useState<GrowthState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    setState(null); setError(null);
    if (!projectId) return;
    const controller = new AbortController();
    void fetch(`/api/growth?projectId=${encodeURIComponent(projectId)}`, { signal: controller.signal }).then(async (response) => response.ok ? response.json() as Promise<{ state: GrowthState | null }> : null).then((payload) => { if (payload) setState(payload.state); }).catch(() => undefined);
    return () => controller.abort();
  }, [projectId]);
  const submit = async () => {
    if (!projectId || !prompt.trim() || loading) return;
    setLoading(true); setError(null);
    try {
      const response = await fetch("/api/growth", { body: JSON.stringify({ projectId, prompt }), headers: { "Content-Type": "application/json" }, method: "POST" });
      const payload = await response.json() as { error?: string; state?: GrowthState };
      if (!response.ok || !payload.state) throw new Error(payload.error ?? "Growth could not prepare this work.");
      setState(payload.state); setPrompt("");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Growth could not prepare this work."); }
    finally { setLoading(false); }
  };
  return <section className="flex min-h-0 flex-1 flex-col bg-[hsl(var(--premium-panel)/0.35)]" data-growth-runtime>
    <header className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3"><div><h1 className="text-sm font-semibold">Growth</h1><p className="text-[11px] text-muted-foreground">Strategy and campaigns for {projectName ?? "the selected project"}</p></div><button className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-white/[0.05] hover:text-foreground" onClick={() => setArea("chat")} type="button">Back to chat</button></header>
    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6"><div className="mx-auto max-w-3xl">{state?.artifact?.content ? <article className="whitespace-pre-wrap text-[13px] leading-6 text-foreground/90">{state.artifact.content}</article> : <div className="py-16 text-center"><h2 className="text-lg font-semibold">Plan how to reach and grow the right customers</h2><p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">Start from what you tell Growth here. Existing business context in Hassali can enrich the plan when it is available. Nothing is sent or published automatically.</p></div>}{error ? <p className="mt-4 text-sm text-rose-300" role="alert">{error}</p> : null}</div></div>
    <form className="border-t border-white/[0.06] px-5 py-4" onSubmit={(event) => { event.preventDefault(); void submit(); }}><div className="mx-auto flex max-w-3xl items-center gap-2 rounded-xl bg-[hsl(var(--premium-panel-strong))] px-3 py-2"><textarea className="min-h-10 flex-1 resize-none bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground" onChange={(event) => setPrompt((event.currentTarget as unknown as { value: string }).value)} placeholder="Create a 30-day content plan, improve conversion, or plan customer acquisition..." value={prompt} /><button className="rounded-md bg-[hsl(var(--premium-accent))] px-3 py-2 text-xs font-semibold text-white disabled:opacity-40" disabled={!prompt.trim() || loading || !projectId} type="submit">{loading ? "Preparing..." : "Prepare"}</button></div></form>
  </section>;
}
