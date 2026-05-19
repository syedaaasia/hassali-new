"use client";

import { Panel } from "@/components/ui/panel";
import { useWorkspaceStore } from "@/lib/workspace-store";

export function LeftSidebar() {
  const files = useWorkspaceStore((state) => state.files);
  const activePath = useWorkspaceStore((state) => state.activePath);
  const openFile = useWorkspaceStore((state) => state.openFile);

  return (
    <Panel className="flex w-60 shrink-0 flex-col border-r">
      <div className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">Project</div>
      <div className="flex flex-1 flex-col gap-3 p-3">
        <div className="rounded-md border bg-background p-2">
          <div className="px-1 pb-2 text-xs font-medium">Workspace</div>
          <div className="space-y-1">
            {Object.values(files).map((file) => {
              const isActive = file.path === activePath;
              const isDirty = file.content !== file.savedContent;

              return (
                <button
                  key={file.path}
                  className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs ${
                    isActive ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted"
                  }`}
                  onClick={() => openFile(file.path)}
                  type="button"
                >
                  <span className="truncate">{file.path}</span>
                  {isDirty ? <span className="ml-auto text-accent">●</span> : null}
                </button>
              );
            })}
          </div>
        </div>
        <div className="rounded-md border bg-background p-3">
          <div className="text-xs font-medium">Git</div>
          <div className="mt-1 text-xs text-muted-foreground">Status placeholder</div>
        </div>
        <div className="rounded-md border bg-background p-3">
          <div className="text-xs font-medium">Search</div>
          <div className="mt-1 text-xs text-muted-foreground">Project search placeholder</div>
        </div>
      </div>
    </Panel>
  );
}
