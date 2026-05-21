"use client";

import { Panel } from "@/components/ui/panel";
import { useChatStore } from "@/lib/chat-store";
import { useWorkspaceStore } from "@/lib/workspace-store";

const fileTypeLabels: Record<string, string> = {
  "README.md": "MD",
  "welcome.ts": "TS",
  "workspace.json": "{}"
};

export function LeftSidebar() {
  const files = useWorkspaceStore((state) => state.files);
  const activePath = useWorkspaceStore((state) => state.activePath);
  const error = useWorkspaceStore((state) => state.error);
  const isLoading = useWorkspaceStore((state) => state.isLoading);
  const projectId = useWorkspaceStore((state) => state.projectId);
  const projectName = useWorkspaceStore((state) => state.projectName);
  const projects = useWorkspaceStore((state) => state.projects);
  const openFile = useWorkspaceStore((state) => state.openFile);
  const createProject = useWorkspaceStore((state) => state.createProject);
  const switchProject = useWorkspaceStore((state) => state.switchProject);
  const hydrateChat = useChatStore((state) => state.hydrateChat);
  const nextProjectName = projects.length === 0 ? "Hassali Project" : `Hassali Project ${projects.length + 1}`;

  const hydrateProjectChat = (payload: Awaited<ReturnType<typeof createProject>>) => {
    if (payload) {
      hydrateChat(payload.chat.messages, payload.chat.sessionId);
    }
  };

  return (
    <Panel className="hidden w-60 shrink-0 flex-col border-r border-[hsl(var(--royal-border-soft))] bg-[hsl(var(--royal-surface)/0.9)] md:flex xl:w-64">
      <div className="border-b border-[hsl(var(--royal-border-soft))] px-4 py-3.5">
        <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          Project
        </div>
        <div className="mt-1 truncate text-xs text-foreground">
          {projectName ?? "No project yet"}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-3.5">
        <div className="rounded-2xl border border-[hsl(var(--royal-border-soft))] bg-[hsl(var(--royal-panel)/0.58)] p-2.5 shadow-[0_18px_54px_hsl(0_80%_3%/0.24)]">
          <div className="flex items-center justify-between px-1 pb-2 text-xs font-medium">
            <span>Projects</span>
            <button
              className="rounded-lg border border-accent/35 px-2 py-1 text-[11px] text-accent hover:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isLoading}
              onClick={() => {
                void createProject(nextProjectName).then(hydrateProjectChat);
              }}
              type="button"
            >
              New
            </button>
          </div>
          <div className="space-y-1">
            {projects.length === 0 ? (
              <div className="rounded-xl border border-[hsl(var(--royal-border-soft))] bg-[hsl(var(--royal-black)/0.34)] px-2 py-3 text-xs leading-5 text-muted-foreground">
                {isLoading ? "Loading projects..." : "Create your first project."}
              </div>
            ) : null}
            {projects.map((project) => {
              const isActive = project.id === projectId;

              return (
                <button
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs ${
                    isActive
                      ? "bg-[hsl(var(--gold)/0.11)] text-foreground shadow-[inset_0_0_0_1px_hsl(var(--gold)/0.18),0_10px_28px_hsl(var(--gold)/0.08)]"
                      : "text-muted-foreground hover:bg-[hsl(var(--royal-panel-raised)/0.62)] hover:text-foreground"
                  } disabled:cursor-not-allowed disabled:opacity-60`}
                  disabled={isLoading || isActive}
                  key={project.id}
                  onClick={() => {
                    void switchProject(project.id).then(hydrateProjectChat);
                  }}
                  type="button"
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-[hsl(var(--royal-border-soft))] bg-[hsl(var(--royal-panel-raised)/0.68)] font-mono text-[10px] text-muted-foreground">
                    P
                  </span>
                  <span className="truncate">{project.name}</span>
                </button>
              );
            })}
          </div>
          {error ? <p className="mt-2 px-1 text-xs leading-5 text-destructive">{error}</p> : null}
        </div>
        {!projectName && projects.length === 0 ? (
          <div className="rounded-2xl border border-[hsl(var(--royal-border))] bg-[hsl(var(--accent)/0.08)] p-3 shadow-[0_18px_54px_hsl(0_80%_3%/0.24)]">
            <div className="text-xs font-medium text-foreground">Create Project</div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              Start a PostgreSQL-backed workspace with starter files.
            </p>
            <button
              className="mt-3 rounded-xl border border-accent/35 bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isLoading}
              onClick={() => {
                void createProject(nextProjectName).then(hydrateProjectChat);
              }}
              type="button"
            >
              {isLoading ? "Creating..." : "Create Project"}
            </button>
            {error ? <p className="mt-2 text-xs leading-5 text-destructive">{error}</p> : null}
          </div>
        ) : null}
        <div className="rounded-2xl border border-[hsl(var(--royal-border-soft))] bg-[hsl(var(--royal-panel)/0.58)] p-2.5 shadow-[0_18px_54px_hsl(0_80%_3%/0.24)]">
          <div className="flex items-center justify-between px-1 pb-2 text-xs font-medium">
            <span>Workspace</span>
            <span className="text-[11px] text-muted-foreground">
              {isLoading ? "..." : Object.keys(files).length}
            </span>
          </div>
          <div className="space-y-1">
            {Object.keys(files).length === 0 ? (
              <div className="rounded-xl border border-[hsl(var(--royal-border-soft))] bg-[hsl(var(--royal-black)/0.34)] px-2 py-3 text-xs leading-5 text-muted-foreground">
                {isLoading ? "Loading workspace..." : "Create a project to add starter files."}
              </div>
            ) : null}
            {Object.values(files).map((file) => {
              const isActive = file.path === activePath;
              const isDirty = file.content !== file.savedContent;

              return (
                <button
                  key={file.path}
                  className={`group relative flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs ${
                    isActive
                      ? "bg-[hsl(var(--gold)/0.11)] text-foreground shadow-[inset_0_0_0_1px_hsl(var(--gold)/0.18),0_10px_28px_hsl(var(--gold)/0.08)]"
                      : "text-muted-foreground hover:bg-[hsl(var(--royal-panel-raised)/0.62)] hover:text-foreground"
                  }`}
                  onClick={() => openFile(file.path)}
                  type="button"
                >
                  {isActive ? (
                    <span className="absolute left-0 top-1/2 h-4 w-px -translate-y-1/2 rounded-full bg-accent" />
                  ) : null}
                  <span className="flex h-5 w-7 shrink-0 items-center justify-center rounded-md border border-[hsl(var(--royal-border-soft))] bg-[hsl(var(--royal-panel-raised)/0.68)] font-mono text-[10px] text-muted-foreground group-hover:text-foreground">
                    {fileTypeLabels[file.path] ?? "--"}
                  </span>
                  <span className="truncate">{file.path}</span>
                  {isDirty ? (
                    <span
                      aria-label={`${file.path} has unsaved changes`}
                      className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                    />
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
        <div className="rounded-2xl border border-[hsl(var(--royal-border-soft))] bg-[hsl(var(--royal-panel)/0.48)] p-3 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-medium">
            <span className="flex h-5 w-5 items-center justify-center rounded-md border border-[hsl(var(--royal-border-soft))] bg-[hsl(var(--royal-panel-raised)/0.68)] font-mono text-[10px] text-muted-foreground">
              G
            </span>
            Git
          </div>
          <div className="mt-1 text-xs leading-5 text-muted-foreground">Status placeholder</div>
        </div>
        <div className="rounded-2xl border border-[hsl(var(--royal-border-soft))] bg-[hsl(var(--royal-panel)/0.48)] p-3 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-medium">
            <span className="flex h-5 w-5 items-center justify-center rounded-md border border-[hsl(var(--royal-border-soft))] bg-[hsl(var(--royal-panel-raised)/0.68)] font-mono text-[10px] text-muted-foreground">
              /
            </span>
            Search
          </div>
          <div className="mt-1 text-xs leading-5 text-muted-foreground">Project search placeholder</div>
        </div>
      </div>
    </Panel>
  );
}
