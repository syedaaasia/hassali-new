"use client";

import { create } from "zustand";

export const maximumProjectNotesLength = 12_000;
export const maximumProjectNotesContextLength = 4_000;

type LocalStorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

type ProjectNotesState = {
  activeProjectId: string | null;
  hassaliSummary: string;
  isOpen: boolean;
  isSaving: boolean;
  notes: string;
  useAsContext: boolean;
  hydrateProject: (projectId: string | null) => void;
  setIsOpen: (isOpen: boolean) => void;
  setHassaliSummary: (summary: string) => void;
  setNotes: (notes: string) => void;
  setUseAsContext: (useAsContext: boolean) => void;
};

function storage() {
  return (globalThis as { localStorage?: LocalStorageLike }).localStorage;
}

function notesKey(projectId: string) {
  return `hassali:project-notes:${projectId}`;
}

function contextKey(projectId: string) {
  return `hassali:project-notes-context:${projectId}`;
}

export function boundedProjectNotesContext(notes: string) {
  return notes.trim().slice(0, maximumProjectNotesContextLength);
}

export const useProjectNotesStore = create<ProjectNotesState>((set, get) => ({
  activeProjectId: null,
  hassaliSummary: "",
  isOpen: false,
  isSaving: false,
  notes: "",
  useAsContext: false,
  hydrateProject: (projectId) => {
    set({
      activeProjectId: projectId,
      hassaliSummary: "",
      notes: projectId ? storage()?.getItem(notesKey(projectId))?.slice(0, maximumProjectNotesLength) ?? "" : "",
      useAsContext: projectId ? storage()?.getItem(contextKey(projectId)) === "true" : false
    });
    if (projectId) {
      void fetch(`/api/project-notes?projectId=${encodeURIComponent(projectId)}`)
        .then(async (response) => response.ok ? response.json() as Promise<{ hassaliSummary: string; manualNotes: string; useAsContext: boolean }> : null)
        .then((payload) => {
          if (!payload || get().activeProjectId !== projectId) return;
          storage()?.setItem(notesKey(projectId), payload.manualNotes);
          storage()?.setItem(contextKey(projectId), String(payload.useAsContext));
          set({ hassaliSummary: payload.hassaliSummary, notes: payload.manualNotes, useAsContext: payload.useAsContext });
        })
        .catch(() => undefined);
    }
  },
  setIsOpen: (isOpen) => set({ isOpen }),
  setHassaliSummary: (hassaliSummary) => set({ hassaliSummary: hassaliSummary.slice(0, 2_000) }),
  setNotes: (notes) => {
    const bounded = notes.slice(0, maximumProjectNotesLength);
    const projectId = get().activeProjectId;

    if (projectId) storage()?.setItem(notesKey(projectId), bounded);
    set({ notes: bounded });
  },
  setUseAsContext: (useAsContext) => {
    const projectId = get().activeProjectId;

    if (projectId) storage()?.setItem(contextKey(projectId), String(useAsContext));
    set({ useAsContext });
  }
}));

export async function persistProjectNotes() {
  const state = useProjectNotesStore.getState();
  if (!state.activeProjectId) return false;
  useProjectNotesStore.setState({ isSaving: true });
  try {
    const response = await fetch("/api/project-notes", {
      body: JSON.stringify({ hassaliSummary: state.hassaliSummary, manualNotes: state.notes, projectId: state.activeProjectId, useAsContext: state.useAsContext }),
      headers: { "Content-Type": "application/json" },
      method: "PUT"
    });
    return response.ok;
  } finally {
    useProjectNotesStore.setState({ isSaving: false });
  }
}
