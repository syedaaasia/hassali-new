"use client";

import { useEffect } from "react";
import {
  maximumProjectNotesContextLength,
  maximumProjectNotesLength,
  persistProjectNotes,
  useProjectNotesStore
} from "@/lib/project-notes-store";
import { useWorkspaceStore } from "@/lib/workspace-store";
import { useChatStore } from "@/lib/chat-store";
import { buildDeterministicAskSummary } from "@/lib/project-notes-intelligence";

export function ProjectNotesPanel() {
  const projectId = useWorkspaceStore((state) => state.projectId);
  const projectName = useWorkspaceStore((state) => state.projectName);
  const activeProjectId = useProjectNotesStore((state) => state.activeProjectId);
  const hydrateProject = useProjectNotesStore((state) => state.hydrateProject);
  const hassaliSummary = useProjectNotesStore((state) => state.hassaliSummary);
  const isOpen = useProjectNotesStore((state) => state.isOpen);
  const notes = useProjectNotesStore((state) => state.notes);
  const isSaving = useProjectNotesStore((state) => state.isSaving);
  const setIsOpen = useProjectNotesStore((state) => state.setIsOpen);
  const setHassaliSummary = useProjectNotesStore((state) => state.setHassaliSummary);
  const setNotes = useProjectNotesStore((state) => state.setNotes);
  const setUseAsContext = useProjectNotesStore((state) => state.setUseAsContext);
  const useAsContext = useProjectNotesStore((state) => state.useAsContext);
  const messages = useChatStore((state) => state.messages);

  useEffect(() => {
    hydrateProject(projectId);
  }, [hydrateProject, projectId]);

  useEffect(() => {
    if (!activeProjectId || activeProjectId !== projectId) return;
    const handle = setTimeout(() => void persistProjectNotes(), 500);
    return () => clearTimeout(handle);
  }, [activeProjectId, hassaliSummary, notes, projectId, useAsContext]);

  useEffect(() => {
    if (activeProjectId !== projectId) return;
    const summary = buildDeterministicAskSummary(messages);
    if (summary && summary !== hassaliSummary) setHassaliSummary(summary);
  }, [activeProjectId, hassaliSummary, messages, projectId, setHassaliSummary]);

  if (!isOpen) {
    return (
      <button
        aria-label="Open Project Notes"
        className="fixed right-2 top-[7.25rem] z-40 rounded-md bg-[hsl(var(--premium-panel))] px-2.5 py-2 text-[11px] font-medium text-foreground shadow-lg xl:static xl:z-auto xl:w-9 xl:[writing-mode:vertical-rl]"
        onClick={() => setIsOpen(true)}
        type="button"
      >
        Notes
      </button>
    );
  }

  const ready = Boolean(projectId && activeProjectId === projectId);

  return (
    <aside className="fixed bottom-2 right-2 top-[4rem] z-40 flex w-[min(15.5rem,calc(100vw-1rem))] flex-col overflow-hidden bg-[hsl(var(--premium-panel)/0.98)] shadow-[0_24px_70px_rgba(0,0,0,0.42)] backdrop-blur-xl xl:static xl:z-auto xl:w-[15rem] xl:shrink-0 xl:border-l xl:border-white/[0.06]">
      <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] px-3 py-2.5">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold text-foreground">Project Notes</div>
          <div className="truncate text-[10px] text-muted-foreground">{projectName ?? "Select a project"}</div>
        </div>
        <button
          aria-label="Collapse Project Notes"
          className="rounded-md px-2 py-1 text-[10px] text-muted-foreground hover:bg-white/[0.05] hover:text-foreground"
          onClick={() => setIsOpen(false)}
          type="button"
        >
          Hide
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col p-3">
        <section className="mb-3 border-b border-white/[0.06] pb-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Hassali Summary</div>
          <div className="mt-2 whitespace-pre-wrap text-[11px] leading-5 text-foreground/85">
            {hassaliSummary || "Meaningful ASK work will be summarized here in a few short bullets."}
          </div>
        </section>
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">My Notes</div>
        <textarea
          aria-label="Project notes"
          className="min-h-0 flex-1 resize-none border-0 bg-transparent p-1 text-xs leading-5 text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-60"
          disabled={!ready}
          maxLength={maximumProjectNotesLength}
          onChange={(event) => setNotes((event.currentTarget as unknown as { value: string }).value)}
          placeholder="Keep project decisions, facts, references, and next steps here. Notes stay with this project and are not sent to ASK unless you enable the context option below."
          value={ready ? notes : ""}
        />
        <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
          <span>{isSaving ? "Saving..." : "Autosaved to project"}</span>
          <span>{notes.length}/{maximumProjectNotesLength}</span>
        </div>
        <label className="mt-3 flex items-start gap-2 border-t border-white/[0.06] pt-2.5 text-[11px] leading-4 text-muted-foreground">
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
