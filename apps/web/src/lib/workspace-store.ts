"use client";

import { create } from "zustand";

export type WorkspaceFile = {
  path: string;
  language: string;
  savedContent: string;
  content: string;
};

type WorkspaceState = {
  files: Record<string, WorkspaceFile>;
  openTabs: string[];
  activePath: string;
  openFile: (path: string) => void;
  closeFile: (path: string) => void;
  updateActiveFile: (content: string) => void;
  saveActiveFile: () => void;
};

const initialFiles: Record<string, WorkspaceFile> = {
  "welcome.ts": {
    path: "welcome.ts",
    language: "typescript",
    savedContent:
      'export function welcome() {\n  return "Build calmly, ship thoughtfully.";\n}\n',
    content: 'export function welcome() {\n  return "Build calmly, ship thoughtfully.";\n}\n'
  },
  "workspace.json": {
    path: "workspace.json",
    language: "json",
    savedContent:
      '{\n  "name": "hassali-demo",\n  "model": "auto",\n  "performanceMode": "balanced"\n}\n',
    content:
      '{\n  "name": "hassali-demo",\n  "model": "auto",\n  "performanceMode": "balanced"\n}\n'
  },
  "README.md": {
    path: "README.md",
    language: "markdown",
    savedContent:
      "# Hassali.ai Workspace\n\nThis local mock workspace is client-side only for Phase 5.\n\n- Open files from the sidebar\n- Edit in Monaco\n- Save into local state\n",
    content:
      "# Hassali.ai Workspace\n\nThis local mock workspace is client-side only for Phase 5.\n\n- Open files from the sidebar\n- Edit in Monaco\n- Save into local state\n"
  }
};

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  files: initialFiles,
  openTabs: ["welcome.ts"],
  activePath: "welcome.ts",
  openFile: (path) =>
    set((state) => ({
      activePath: path,
      openTabs: state.openTabs.includes(path) ? state.openTabs : [...state.openTabs, path]
    })),
  closeFile: (path) =>
    set((state) => {
      const nextTabs = state.openTabs.filter((tabPath) => tabPath !== path);
      const activePath =
        state.activePath === path ? (nextTabs.at(-1) ?? "welcome.ts") : state.activePath;

      return {
        activePath,
        openTabs: nextTabs.length > 0 ? nextTabs : ["welcome.ts"]
      };
    }),
  updateActiveFile: (content) =>
    set((state) => ({
      files: {
        ...state.files,
        [state.activePath]: {
          ...state.files[state.activePath],
          content
        }
      }
    })),
  saveActiveFile: () =>
    set((state) => ({
      files: {
        ...state.files,
        [state.activePath]: {
          ...state.files[state.activePath],
          savedContent: state.files[state.activePath].content
        }
      }
    }))
}));
