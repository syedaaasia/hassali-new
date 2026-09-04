"use client";
import { useEffect, useRef, useState } from "react";
import { emptyGrowthDiscovery, type GrowthDiscoveryState, type GrowthSearchPlan } from "@/lib/growth-discovery";
import { useProductAreaStore } from "@/lib/product-area-store";
import { useWorkspaceStore } from "@/lib/workspace-store";
import styles from "./growth-panel.module.css";

type View = "Business" | "Audiences" | "Companies" | "People" | "Outreach";
type Action = "analyze" | "search" | "refine" | "audience" | "outreach";
type GrowthPayload = { error?: string; state?: { discovery?: GrowthDiscoveryState } };
const inputValue = (event: { currentTarget: unknown }) => (event.currentTarget as { value: string }).value;
const inputChecked = (event: { currentTarget: unknown }) => (event.currentTarget as { checked: boolean }).checked;

export function GrowthPanel() {
  const projectId = useWorkspaceStore((s) => s.projectId);
  const projectName = useWorkspaceStore((s) => s.projectName);
  const setArea = useProductAreaStore((s) => s.setArea);
  const [state, setState] = useState<GrowthDiscoveryState>(emptyGrowthDiscovery);
  const [prompt, setPrompt] = useState("");
  const [businessInput, setBusinessInput] = useState("");
  const [view, setView] = useState<View>("Business");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hydrating, setHydrating] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [detail, setDetail] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState("fit");
  const active = useRef<AbortController | null>(null);
  const currentProject = useRef(projectId);
  currentProject.current = projectId;
  const load = async (id: string, controller: AbortController) => {
    const response = await fetch(`/api/growth?projectId=${encodeURIComponent(id)}`, { signal: controller.signal });
    const payload = await response.json() as GrowthPayload;
    if (!response.ok) throw new Error(payload.error ?? "Growth could not load this project.");
    if (!controller.signal.aborted && currentProject.current === id) setState(payload.state?.discovery ?? emptyGrowthDiscovery());
  };
  useEffect(() => {
    active.current?.abort();
    const controller = new AbortController(); active.current = controller;
    setState(emptyGrowthDiscovery()); setSelected([]); setDetail(null); setError(null); setLoading(false); setHydrating(true); setPrompt(""); setBusinessInput(""); setView("Business");
    if (projectId) void load(projectId, controller).catch((e: unknown) => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Project unavailable"); }).finally(() => { if (!controller.signal.aborted) setHydrating(false); });
    else setHydrating(false);
    return () => controller.abort();
  }, [projectId]);
  const submit = async (action: Action, value = prompt, extras: { audienceId?: string; selectedIds?: string[] } = {}) => {
    if (!projectId || loading || hydrating) return;
    const id = projectId, controller = new AbortController(); active.current?.abort(); active.current = controller;
    setLoading(true); setError(null);
    try {
      const response = await fetch("/api/growth", { signal: controller.signal, body: JSON.stringify({ projectId: id, action, prompt: value, revision: state.revision, ...extras }), headers: { "Content-Type": "application/json" }, method: "POST" });
      const payload = await response.json() as GrowthPayload;
      if (!response.ok || !payload.state?.discovery) throw new Error(payload.error ?? "Growth could not complete this action.");
      if (controller.signal.aborted || currentProject.current !== id) return;
      setState(payload.state.discovery); setPrompt(""); setDetail(null);
      if (action !== "outreach") setSelected([]);
      setView(action === "analyze" ? "Audiences" : action === "outreach" ? "Outreach" : "Companies");
    } catch (e) { if (!controller.signal.aborted && currentProject.current === id) setError(e instanceof Error ? e.message : "Growth is unavailable."); }
    finally { if (!controller.signal.aborted && currentProject.current === id) setLoading(false); }
  };
  const reload = async () => {
    if (!projectId || loading) return;
    const controller = new AbortController(); active.current?.abort(); active.current = controller;
    setHydrating(true); setError(null);
    try { await load(projectId, controller); } catch { if (!controller.signal.aborted) setError("Growth project storage is unavailable."); }
    finally { if (!controller.signal.aborted) setHydrating(false); }
  };
  const companies = state.companies.filter((c) => `${c.name} ${c.location ?? ""} ${c.organizationType ?? ""}`.toLowerCase().includes(filter.toLowerCase())).sort((a, b) => sort === "name" ? a.name.localeCompare(b.name) : b.fitScore - a.fitScore);
  const chosen = state.companies.find((c) => c.id === detail);
  const exportUrl = projectId ? `/api/growth?projectId=${encodeURIComponent(projectId)}&format=csv${selected.length ? `&ids=${encodeURIComponent(selected.join(","))}` : ""}` : "";
  return <section className={styles.root} data-growth-runtime aria-label="Growth workspace">
    <header className={styles.header}><div><span className={styles.eyebrow}>CUSTOMER DISCOVERY</span><h1>Growth <span>{projectName ?? "No project selected"}</span></h1></div><div className={styles.actions}><button onClick={() => void reload()} disabled={loading || hydrating}>Reload</button><button onClick={() => setArea("chat")}>Back to chat</button></div></header>
    <div className={styles.layout}><main className={styles.main}>
      <nav className={styles.tabs} aria-label="Growth views">{(["Business", "Audiences", "Companies", "People", "Outreach"] as View[]).map((name) => <button key={name} aria-current={view === name ? "page" : undefined} onClick={() => setView(name)}>{name}{name === "Companies" && state.companies.length ? <span>{state.companies.length}</span> : null}</button>)}</nav>
      <div className={styles.content}>
        {!projectId ? <div className={styles.empty}><h2>Select a project</h2><p>Growth discovery belongs to your selected project.</p></div> : hydrating ? <p role="status">Loading Growth...</p> : <>
          {view === "Business" && <><div className={styles.sectionHeading}><h2>{state.business?.name ?? "Grow your business"}</h2>{state.business && <span className={styles.badge}>{state.business.status.replace(/_/g, " ")}</span>}</div>
            {state.business && <div className={styles.business}><p>{state.business.description}</p><dl><dt>Offer</dt><dd>{state.business.offer}</dd><dt>Value proposition</dt><dd>{state.business.valueProposition || "Not established"}</dd><dt>Market</dt><dd>{state.business.geography ?? "Not established"}</dd></dl>{state.business.evidence.map((e, i) => <blockquote key={i}><p>{e.quote}</p><a href={e.url} target="_blank" rel="noreferrer">Business source</a></blockquote>)}<button className={styles.primary} onClick={() => setView("Audiences")}>Compare audiences</button></div>}
            <form className={styles.businessForm} onSubmit={(e) => { e.preventDefault(); void submit("analyze", businessInput); }}><label htmlFor="growth-business">Business website or description</label><textarea id="growth-business" value={businessInput} onChange={(e) => setBusinessInput(inputValue(e))} placeholder="https://your-business.com or what you sell and who you serve" maxLength={4000} rows={3}/><button className={styles.primary} disabled={!businessInput.trim() || loading} type="submit">Analyze business</button></form>
          </>}
          {view === "Audiences" && <><div className={styles.sectionHeading}><h2>Who is most likely to buy?</h2><span className={styles.muted}>Audience hypotheses</span></div><div className={styles.audiences}>{state.audiences.map((a) => <article key={a.id}><h3>{a.name}</h3><p>{a.problem}</p><p>{a.whyTheyBuy}</p><dl><dt>Buyer roles</dt><dd>{a.buyerRoles.join(", ") || "Not established"}</dd><dt>Organizations</dt><dd>{a.organizationTypes.join(", ")}</dd><dt>Markets</dt><dd>{a.geography.join(", ") || "Any supported geography"}</dd><dt>Buying signals</dt><dd>{a.buyingSignals.join("; ")}</dd></dl><button className={styles.primary} disabled={loading} onClick={() => void submit("audience", `Find customers: ${a.name}`, { audienceId: a.id })}>Find customers</button></article>)}</div>{!state.audiences.length && <div className={styles.empty}><h3>No audiences yet</h3><button onClick={() => setView("Business")}>Analyze your business</button></div>}</>}
          {view === "Companies" && <><div className={styles.sectionHeading}><h2>Companies <span className={styles.muted}>{companies.length}</span></h2><span className={styles.badge}>{state.discovery.status.replace(/_/g, " ")}</span></div>
            {state.plan && <SearchCriteria plan={state.plan}/>}
            {state.discovery.message && <p className={styles.notice} role="status">{state.discovery.message}</p>}
            <div className={styles.toolbar}><input aria-label="Filter companies" placeholder="Filter company or location" value={filter} onChange={(e) => setFilter(inputValue(e))}/><select aria-label="Sort companies" value={sort} onChange={(e) => setSort(inputValue(e))}><option value="fit">Strongest evidence</option><option value="name">Company name</option></select><button disabled={!selected.length || loading || !state.business?.offer} onClick={() => void submit("outreach", "Draft outreach for selected companies", { selectedIds: selected })}>Draft outreach ({selected.length})</button>{state.companies.length > 0 && <a className={styles.download} href={exportUrl} download>Export {selected.length ? `selected (${selected.length})` : "all"} CSV</a>}</div>
            {companies.length ? <div className={styles.tableWrap}><table><thead><tr><th><input type="checkbox" aria-label="Select visible companies" checked={companies.every((c) => selected.includes(c.id))} onChange={(e) => setSelected(inputChecked(e) ? companies.map((c) => c.id) : [])}/></th><th>Company</th><th>Location</th><th>Fit</th><th>Contacts</th><th>Evidence</th></tr></thead><tbody>{companies.map((c) => <tr key={c.id}><td><input type="checkbox" aria-label={`Select ${c.name}`} checked={selected.includes(c.id)} onChange={() => setSelected((v) => v.includes(c.id) ? v.filter((x) => x !== c.id) : [...v, c.id])}/></td><td><strong>{c.name}</strong><a href={c.website} target="_blank" rel="noreferrer">{c.domain}</a></td><td>{c.location ?? "Not established"}</td><td><span className={styles.fit}>{c.fitScore}</span></td><td><span className={styles.muted}>Not verified</span></td><td><button onClick={() => setDetail(detail === c.id ? null : c.id)}>View evidence</button></td></tr>)}</tbody></table></div> : <div className={styles.empty}><h3>{loading ? "Finding and checking public companies..." : "No companies in this view"}</h3><p>{state.plan ? "Your search criteria are saved." : "Describe the buyers you want to reach."}</p></div>}
            {chosen && <article className={styles.evidence} aria-label={`Evidence for ${chosen.name}`}><div className={styles.sectionHeading}><h3>{chosen.name}</h3><button onClick={() => setDetail(null)}>Close evidence</button></div><p className={styles.muted}>Checked {new Date(chosen.lastVerifiedAt).toLocaleString()}</p><h4>Why this company</h4><ul>{chosen.fitReasons.map((r, i) => <li key={i}>{r}</li>)}</ul><p>Decision-maker roles to verify: {chosen.targetRoles.join(", ") || "Not established"}</p>{chosen.evidence.map((e, i) => <blockquote key={i}><p>{e.quote}</p><a href={e.url} target="_blank" rel="noreferrer">{e.field} source</a></blockquote>)}</article>}
          </>}
          {view === "People" && <div className={styles.empty}><h2>Decision-makers</h2><p>No verified people or contact details are available in this discovery source.</p>{state.plan && <p>Target roles: {state.plan.titles.join(", ") || "Not established"}</p>}<button onClick={() => setView("Companies")}>View company evidence</button></div>}
          {view === "Outreach" && <><div className={styles.sectionHeading}><h2>Outreach drafts</h2><span className={styles.muted}>Not sent</span></div>{state.drafts.map((d) => <article key={d.companyId} className={styles.draft}><h3>{d.subject}</h3><textarea aria-label={`Draft for ${state.companies.find((c) => c.id === d.companyId)?.name}`} readOnly value={d.body} rows={12}/>{d.personalizationEvidence.map((e, i) => <a href={e.url} key={i} target="_blank" rel="noreferrer">Personalization source</a>)}</article>)}{!state.drafts.length && <div className={styles.empty}><h3>No drafts yet</h3><p>{state.business?.offer ? "Select companies to prepare evidence-based outreach." : "Add your business offer before preparing outreach."}</p><button onClick={() => setView(state.business?.offer ? "Companies" : "Business")}>{state.business?.offer ? "Choose companies" : "Add business"}</button></div>}</>}
        </>}
      </div>
    </main>
    <aside className={styles.assistant} aria-label="Growth assistant"><div className={styles.assistantHeader}><h2>Hassali Growth</h2><span className={styles.badge}>{loading ? "Working" : "Ready"}</span></div><div className={styles.messages}>{state.messages.length ? state.messages.map((m, i) => <div className={m.role === "user" ? styles.userMessage : styles.assistantMessage} key={i}><span>{m.role === "user" ? "You" : "Hassali"}</span><p>{m.text}</p></div>) : <div className={styles.empty}><h3>Find the right customers</h3><p>Who do you want to reach?</p></div>}</div>{error && <p className={styles.error} role="alert">{error}</p>}<form className={styles.composer} onSubmit={(e) => { e.preventDefault(); void submit(state.plan ? "refine" : "search"); }}><label htmlFor="growth-request">{state.plan ? "Refine this audience" : "Describe your target customers"}</label><textarea id="growth-request" value={prompt} onChange={(e) => setPrompt(inputValue(e))} placeholder={state.plan ? "Add a market, exclude a role, narrow the audience..." : "Find buyers by role, company type and market..."} rows={4} maxLength={4000}/><div className={styles.actions}>{loading ? <button type="button" onClick={() => { active.current?.abort(); setLoading(false); setError("Request stopped. Reload to confirm the latest saved state."); }}>Stop</button> : <><button disabled={!prompt.trim() || !projectId || hydrating} className={styles.primary} type="submit">{state.plan ? "Update search" : "Find customers"}</button>{state.plan && <button disabled={!prompt.trim() || !projectId || hydrating} type="button" onClick={() => void submit("search")}>New search</button>}</>}</div></form></aside>
    </div>
  </section>;
}

function SearchCriteria({ plan }: { plan: GrowthSearchPlan }) {
  const groups: Array<[string, string[]]> = [["Requested roles", plan.titles], ["Suggested adjacent roles", plan.adjacentTitles], ["Organizations", plan.organizationTypes], ["Markets", plan.geographies], ["Seniority", plan.seniority], ["Excluded roles", plan.excludedTitles], ["Exclusions", plan.exclusions]];
  return <details className={styles.criteria} open><summary>Search criteria</summary><dl>{groups.filter(([, values]) => values.length).map(([label, values]) => <div key={label}><dt>{label}</dt><dd>{values.map((v) => <span key={v}>{v}</span>)}</dd></div>)}</dl><p className={styles.muted}>Up to {plan.limit} requested{plan.verifiedContactsOnly ? " / Verified contacts only" : ""}</p></details>;
}
