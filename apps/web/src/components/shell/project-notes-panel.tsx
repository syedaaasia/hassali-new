"use client";

import { useEffect } from "react";
import {
  maximumProjectNotesContextLength,
  maximumProjectNotesLength,
  useProjectNotesStore
} from "@/lib/project-notes-store";
import { useWorkspaceStore } from "@/lib/workspace-store";

export function ProjectNotesPanel() {
  const projectId = useWorkspaceStore((state) => state.projectId);
  const projectName = useWorkspaceStore((state) => state.projectName);
  const activeProjectId = useProjectNotesStore((state) => state.activeProjectId);
  const hydrateProject = useProjectNotesStore((state) => state.hydrateProject);
  const isOpen = useProjectNotesStore((state) => state.isOpen);
  const notes = useProjectNotesStore((state) => state.notes);
  const setIsOpen = useProjectNotesStore((state) => state.setIsOpen);
  const setNotes = useProjectNotesStore((state) => state.setNotes);
  const setUseAsContext = useProjectNotesStore((state) => state.setUseAsContext);
  const useAsContext = useProjectNotesStore((state) => state.useAsContext);

  useEffect(() => {
    hydrateProject(projectId);
  }, [hydrateProject, projectId]);

  if (!isOpen) {
    return (
      <button
        aria-label="Open Project Notes"
        className="fixed right-2 top-[3.65rem] z-40 rounded-lg border border-[hsl(var(--premium-border))] bg-[hsl(var(--premium-panel))] px-2.5 py-2 text-[11px] font-medium text-foreground shadow-xl xl:static xl:z-auto xl:w-10 xl:[writing-mode:vertical-rl]"
        onClick={() => setIsOpen(true)}
        type="button"
      >
        Notes
      </button>
    );
  }

  const ready = Boolean(projectId && activeProjectId === projectId);

  return (
    <aside className="fixed bottom-2 right-2 top-[3.5rem] z-40 flex w-[min(18rem,calc(100vw-1rem))] flex-col overflow-hidden rounded-xl border border-[hsl(var(--premium-border))] bg-[hsl(var(--premium-panel)/0.96)] shadow-[0_24px_90px_rgba(0,0,0,0.48)] backdrop-blur-xl xl:static xl:z-auto xl:w-[17rem] xl:shrink-0">
      <div className="flex items-center justify-between gap-2 border-b border-[hsl(var(--premium-border))] px-3 py-2.5">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold text-foreground">Project Notes</div>
          <div className="truncate text-[10px] text-muted-foreground">Persistent scratchpad · {projectName ?? "Select a project"}</div>
        </div>
        <button
          aria-label="Collapse Project Notes"
          className="rounded-lg border border-white/10 px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground"
          onClick={() => setIsOpen(false)}
          type="button"
        >
          Hide
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col p-3">
        <textarea
          aria-label="Project notes"
          className="min-h-0 flex-1 resize-none rounded-lg border border-white/10 bg-black/25 p-3 text-xs leading-5 text-foreground outline-none placeholder:text-muted-foreground focus:border-[hsl(var(--premium-accent)/0.55)] disabled:cursor-not-allowed disabled:opacity-60"
          disabled={!ready}
          maxLength={maximumProjectNotesLength}
          onChange={(event) => setNotes((event.currentTarget as unknown as { value: string }).value)}
          placeholder="Keep project decisions, facts, references, and next steps here. Notes stay with this project and are not sent to ASK unless you enable the context option below."
          value={ready ? notes : ""}
        />
        <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
          <span>Autosaved locally</span>
          <span>{notes.length}/{maximumProjectNotesLength}</span>
        </div>
        <label className="mt-3 flex items-start gap-2 rounded-lg border border-white/10 bg-white/[0.03] p-2.5 text-[11px] leading-4 text-muted-foreground">
          <input
            checked={ready && useAsContext}
            className="mt-0.5 accent-[#DE7356]"
            disabled={!ready || notes.trim().length === 0}
            onChange={(event) => setUseAsContext((event.currentTarget as unknown as { checked: boolean }).checked)}
            type="checkbox"
          />
          <span>
            Use notes as ASK context
            <span className="mt-0.5 block text-[10px] text-muted-foreground/75">
              Explicitly includes up to {maximumProjectNotesContextLength.toLocaleString()} characters. Off by default.
            </span>
          </span>
        </label>
      </div>
    </aside>
  );
}
