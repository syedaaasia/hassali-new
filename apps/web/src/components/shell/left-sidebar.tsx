"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { GitHubIcon, GitHubProjectPanel } from "@/components/shell/github-project-panel";
import { SettingsIcon, SidebarSettings } from "@/components/shell/sidebar-settings";
import { Panel } from "@/components/ui/panel";
import { useChatStore } from "@/lib/chat-store";
import { useProductAreaStore } from "@/lib/product-area-store";
import { useWorkspaceStore } from "@/lib/workspace-store";

type SearchResult = {
  kind: "chat" | "message" | "project";
  messageId: string | null;
  projectId: string;
  projectName: string;
  sessionId: string | null;
  sessionTitle: string | null;
  snippet: string;
};
type Props = { collapsed: boolean; onToggleCollapsed: () => void };
type BrowserGlobal = { prompt?: (message?: string) => string | null };

function Chevron({ direction }: { direction: "down" | "left" | "right" }) {
  const path = direction === "down" ? "m7 10 5 5 5-5" : direction === "left" ? "m15 18-6-6 6-6" : "m9 18 6-6-6-6";
  return <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24"><path d={path} /></svg>;
}

function ProjectIcon({ className = "h-4 w-4" }: { className?: string }) {
  return <svg aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H10l2 2h5.5A2.5 2.5 0 0 1 20 9.5v7A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5v-9Z" /></svg>;
}

function GrowthIcon({ className = "h-4 w-4" }: { className?: string }) {
  return <svg aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M4 18V9m6 9V5m6 13v-6m4 6H2" /><path d="m4 9 6-4 6 7 4-5" /></svg>;
}

export function LeftSidebar({ collapsed, onToggleCollapsed }: Props) {
  const [projectsOpen, setProjectsOpen] = useState(true);
  const [githubOpen, setGithubOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const hydrateChat = useChatStore((state) => state.hydrateChat);
  const setProductMode = useChatStore((state) => state.setProductMode);
  const area = useProductAreaStore((state) => state.area);
  const setArea = useProductAreaStore((state) => state.setArea);
  const projectId = useWorkspaceStore((state) => state.projectId);
  const projectName = useWorkspaceStore((state) => state.projectName);
  const projects = useWorkspaceStore((state) => state.projects);
  const isLoading = useWorkspaceStore((state) => state.isLoading);
  const error = useWorkspaceStore((state) => state.error);
  const createProject = useWorkspaceStore((state) => state.createProject);
  const switchProject = useWorkspaceStore((state) => state.switchProject);

  useEffect(() => {
    if (!searchOpen || searchQuery.trim().length < 2) {
      setSearchResults([]);
      setSearchError(null);
      return;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      setSearchLoading(true);
      fetch(`/api/workspace/search?q=${encodeURIComponent(searchQuery.trim())}`, { signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error("Search is unavailable.");
          return response.json() as Promise<{ results?: SearchResult[] }>;
        })
        .then((payload) => setSearchResults(payload.results ?? []))
        .catch((caught) => {
          if (!controller.signal.aborted) setSearchError(caught instanceof Error ? caught.message : "Search is unavailable.");
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearchLoading(false);
        });
    }, 220);
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [searchOpen, searchQuery]);

  const hydrateProject = (payload: Awaited<ReturnType<typeof createProject>>) => {
    if (payload) hydrateChat(payload.chat.messages, payload.chat.sessionId);
  };
  const newProject = () => {
    const name = (globalThis as BrowserGlobal).prompt?.("Project name")?.trim();
    if (name) void createProject(name).then(hydrateProject);
  };
  const createProjectChat = async () => {
    if (!projectId || isLoading) return;
    const response = await fetch("/api/workspace/chat", {
      body: JSON.stringify({ projectId }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    const payload = await response.json() as { sessionId?: unknown };
    if (response.ok && typeof payload.sessionId === "string") hydrateChat([], payload.sessionId);
  };
  const openProject = (id: string, sessionId?: string | null) => {
    void switchProject(id, sessionId).then((payload) => {
      hydrateProject(payload);
      if (payload) {
        setSearchOpen(false);
        setSearchQuery("");
      }
    });
  };

  if (collapsed) {
    return <Panel className="hidden w-14 shrink-0 flex-col items-center rounded-2xl border border-white/[0.06] bg-[hsl(var(--premium-panel)/0.72)] py-2 md:flex">
      <button aria-label="Open sidebar" className="hassali-focus-ring flex h-10 w-10 items-center justify-center rounded-full" onClick={onToggleCollapsed} type="button"><Image alt="Hassali.ai" height={30} src="/apple-icon.png" width={30} /></button>
      <div className="mt-4 flex flex-1 flex-col gap-2">
        <button aria-label="Projects" className="hassali-focus-ring flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-white/[0.05] hover:text-foreground" onClick={onToggleCollapsed} type="button"><ProjectIcon /></button>
        <button aria-label="Growth" className="hassali-focus-ring flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-white/[0.05] hover:text-foreground" onClick={() => { setProductMode("ASK"); setArea("growth"); onToggleCollapsed(); }} type="button"><GrowthIcon /></button>
        <button aria-label="GitHub" className="hassali-focus-ring flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-white/[0.05] hover:text-foreground" onClick={onToggleCollapsed} type="button"><GitHubIcon /></button>
        <button aria-label="Settings" className="hassali-focus-ring flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-white/[0.05] hover:text-foreground" onClick={onToggleCollapsed} type="button"><SettingsIcon /></button>
      </div>
      <button aria-label="Expand sidebar" className="hassali-focus-ring mb-1 flex h-9 w-9 items-center justify-center text-muted-foreground" onClick={onToggleCollapsed} type="button"><Chevron direction="right" /></button>
    </Panel>;
  }

  return <Panel className="hidden w-[16.5rem] shrink-0 flex-col rounded-2xl border border-white/[0.06] bg-[hsl(var(--premium-panel)/0.72)] md:flex">
    <div className="border-b border-white/[0.06] px-3 py-3">
      <div className="flex items-center justify-between">
        <div><div className="text-[10px] uppercase text-muted-foreground">Project</div><div className="mt-1 max-w-[12rem] truncate text-xs text-foreground">{projectName ?? "No project selected"}</div></div>
        <button aria-label="Collapse sidebar" className="hassali-focus-ring flex h-8 w-8 items-center justify-center text-muted-foreground" onClick={onToggleCollapsed} type="button"><Chevron direction="left" /></button>
      </div>
      <div className="mt-2 flex gap-1">
        <button className="hassali-focus-ring rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-white/[0.05] hover:text-foreground" onClick={() => setSearchOpen((value) => !value)} type="button">Search</button>
        <button className="hassali-focus-ring rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-white/[0.05] hover:text-foreground" disabled={!projectId} onClick={() => void createProjectChat()} type="button">New chat</button>
      </div>
      {searchOpen ? <div className="mt-2">
        <input aria-label="Search projects and chats" autoFocus className="h-9 w-full rounded-md border border-white/10 bg-black/20 px-2 text-xs outline-none" onChange={(event) => setSearchQuery((event.currentTarget as unknown as { value: string }).value)} placeholder="Search projects and chats" value={searchQuery} />
        <div className="mt-1 max-h-52 overflow-y-auto">
          {searchLoading ? <p className="p-2 text-xs text-muted-foreground">Searching...</p> : null}
          {searchError ? <p className="p-2 text-xs text-rose-300">{searchError}</p> : null}
          {searchResults.map((result) => <button className="block w-full rounded-md p-2 text-left hover:bg-white/[0.05]" key={`${result.kind}:${result.messageId ?? result.sessionId ?? result.projectId}`} onClick={() => openProject(result.projectId, result.sessionId)} type="button"><span className="block truncate text-xs text-foreground">{result.projectName}</span><span className="line-clamp-2 text-[10px] text-muted-foreground">{result.snippet}</span></button>)}
        </div>
      </div> : null}
    </div>
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-2">
      <section className="pb-2">
        <div className="flex items-center">
          <button aria-expanded={projectsOpen} className="hassali-focus-ring flex flex-1 items-center gap-2 rounded-md px-2 py-2 text-left text-xs font-medium hover:bg-white/[0.04]" onClick={() => setProjectsOpen((value) => !value)} type="button"><Chevron direction={projectsOpen ? "down" : "right"} /><ProjectIcon /><span>Projects</span></button>
          <button aria-label="New project" className="hassali-focus-ring px-2 py-2 text-lg text-muted-foreground hover:text-foreground" disabled={isLoading} onClick={newProject} type="button">+</button>
        </div>
        {projectsOpen ? <div className="mt-1 max-h-40 space-y-0.5 overflow-y-auto">{projects.map((project) => <button className={`hassali-focus-ring flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs ${project.id === projectId ? "bg-white/[0.075] text-foreground" : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"}`} disabled={isLoading || project.id === projectId} key={project.id} onClick={() => openProject(project.id)} type="button"><ProjectIcon className="h-3.5 w-3.5" /><span className="truncate">{project.name}</span></button>)}{projects.length === 0 ? <p className="px-2 py-2 text-xs text-muted-foreground">Create your first project.</p> : null}</div> : null}
        {error ? <p className="px-2 py-1 text-xs text-rose-300">{error}</p> : null}
      </section>
      <button aria-current={area === "growth" ? "page" : undefined} className={`hassali-focus-ring flex items-center gap-2 rounded-md px-2 py-2 text-left text-xs ${area === "growth" ? "bg-[hsl(var(--premium-accent)/0.12)] text-foreground" : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"}`} onClick={() => { setProductMode("ASK"); setArea("growth"); }} type="button"><GrowthIcon /><span>Growth</span></button>
      <section className="mt-1">
        <button aria-expanded={githubOpen} className="hassali-focus-ring flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs text-muted-foreground hover:bg-white/[0.04] hover:text-foreground" onClick={() => setGithubOpen((value) => !value)} type="button"><GitHubIcon /><span>GitHub</span></button>
        {githubOpen ? <GitHubProjectPanel projectId={projectId} /> : null}
      </section>
      <div className="mt-auto pt-2"><SidebarSettings /></div>
    </div>
  </Panel>;
}
