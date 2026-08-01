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
  isOpen: boolean;
  notes: string;
  useAsContext: boolean;
  hydrateProject: (projectId: string | null) => void;
  setIsOpen: (isOpen: boolean) => void;
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
  isOpen: false,
  notes: "",
  useAsContext: false,
  hydrateProject: (projectId) => {
    set({
      activeProjectId: projectId,
      notes: projectId ? storage()?.getItem(notesKey(projectId))?.slice(0, maximumProjectNotesLength) ?? "" : "",
      useAsContext: projectId ? storage()?.getItem(contextKey(projectId)) === "true" : false
    });
  },
  setIsOpen: (isOpen) => set({ isOpen }),
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
