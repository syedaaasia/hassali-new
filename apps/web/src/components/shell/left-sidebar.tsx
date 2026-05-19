"use client";

import { Panel } from "@/components/ui/panel";
import { useWorkspaceStore } from "@/lib/workspace-store";

const fileTypeLabels: Record<string, string> = {
  "README.md": "MD",
  "welcome.ts": "TS",
  "workspace.json": "{}"
};

export function LeftSidebar() {
  const files = useWorkspaceStore((state) => state.files);
  const activePath = useWorkspaceStore((state) => state.activePath);
  const openFile = useWorkspaceStore((state) => state.openFile);

  return (
    <Panel className="hidden w-60 shrink-0 flex-col border-r bg-surface/90 md:flex xl:w-64">
      <div className="border-b px-4 py-3.5">
        <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          Project
        </div>
        <div className="mt-1 truncate text-xs text-foreground">hassali-demo</div>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-3.5">
        <div className="rounded-lg border border-border/70 bg-background/60 p-2.5 shadow-[0_10px_32px_hsl(224_20%_4%/0.08)]">
          <div className="flex items-center justify-between px-1 pb-2 text-xs font-medium">
            <span>Workspace</span>
            <span className="text-[11px] text-muted-foreground">{Object.keys(files).length}</span>
          </div>
          <div className="space-y-1">
            {Object.values(files).map((file) => {
              const isActive = file.path === activePath;
              const isDirty = file.content !== file.savedContent;

              return (
                <button
                  key={file.path}
                  className={`group relative flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs ${
                    isActive
                      ? "bg-muted/90 text-foreground shadow-[inset_0_0_0_1px_hsl(var(--accent)/0.15),0_8px_22px_hsl(var(--accent)/0.08)]"
                      : "text-muted-foreground hover:bg-muted/55 hover:text-foreground"
                  }`}
                  onClick={() => openFile(file.path)}
                  type="button"
                >
                  {isActive ? (
                    <span className="absolute left-0 top-1/2 h-4 w-px -translate-y-1/2 rounded-full bg-accent" />
                  ) : null}
                  <span className="flex h-5 w-7 shrink-0 items-center justify-center rounded border border-border/70 bg-surface/80 font-mono text-[10px] text-muted-foreground group-hover:text-foreground">
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
        <div className="rounded-lg border border-border/70 bg-background/55 p-3 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-medium">
            <span className="flex h-5 w-5 items-center justify-center rounded border border-border/70 bg-surface/80 font-mono text-[10px] text-muted-foreground">
              G
            </span>
            Git
          </div>
          <div className="mt-1 text-xs leading-5 text-muted-foreground">Status placeholder</div>
        </div>
        <div className="rounded-lg border border-border/70 bg-background/55 p-3 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-medium">
            <span className="flex h-5 w-5 items-center justify-center rounded border border-border/70 bg-surface/80 font-mono text-[10px] text-muted-foreground">
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
