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
    <Panel className="hidden w-56 shrink-0 flex-col border-r bg-surface/95 md:flex xl:w-64">
      <div className="border-b px-3.5 py-3 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
        Project
      </div>
      <div className="flex flex-1 flex-col gap-3 p-3">
        <div className="rounded-md border bg-background/70 p-2 shadow-sm">
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
                  className={`group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs ${
                    isActive
                      ? "bg-muted text-foreground shadow-[inset_2px_0_0_hsl(var(--accent))]"
                      : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                  }`}
                  onClick={() => openFile(file.path)}
                  type="button"
                >
                  <span className="flex h-5 w-6 shrink-0 items-center justify-center rounded border bg-surface font-mono text-[10px] text-muted-foreground group-hover:text-foreground">
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
        <div className="rounded-md border bg-background/70 p-3 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-medium">
            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60" />
            Git
          </div>
          <div className="mt-1 text-xs leading-5 text-muted-foreground">Status placeholder</div>
        </div>
        <div className="rounded-md border bg-background/70 p-3 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-medium">
            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60" />
            Search
          </div>
          <div className="mt-1 text-xs leading-5 text-muted-foreground">Project search placeholder</div>
        </div>
      </div>
    </Panel>
  );
}
