"use client";

import { create } from "zustand";

export type WorkspaceFile = {
  id?: string;
  path: string;
  language: string;
  savedContent: string;
  content: string;
};

type WorkspacePayloadFile = {
  content: string;
  id: string;
  path: string;
};

type CreateProjectResult = {
  files: WorkspacePayloadFile[];
  project: {
    id: string;
    name: string;
  };
};

export type WorkspaceLoadResult = {
  chat: {
    messages: Array<{
      content: string;
      id: string;
      mode: "ASK" | "SUGGEST" | "EXECUTE";
      role: "user" | "assistant";
    }>;
    sessionId: string | null;
  };
  files: WorkspacePayloadFile[];
  project: {
    id: string;
    name: string;
  } | null;
  workspace: {
    id: string;
    name: string;
  };
};

type WorkspaceState = {
  files: Record<string, WorkspaceFile>;
  openTabs: string[];
  activePath: string;
  error: string | null;
  hasLoaded: boolean;
  isLoading: boolean;
  projectId: string | null;
  projectName: string | null;
  workspaceId: string | null;
  openFile: (path: string) => void;
  closeFile: (path: string) => void;
  applyFileContent: (path: string, content: string) => Promise<void>;
  createProject: (name: string) => Promise<WorkspaceLoadResult | null>;
  hydrateWorkspace: (payload: WorkspaceLoadResult) => void;
  loadWorkspace: () => Promise<WorkspaceLoadResult | null>;
  updateActiveFile: (content: string) => void;
  saveActiveFile: () => Promise<void>;
};

function languageFromPath(path: string) {
  if (path.endsWith(".ts") || path.endsWith(".tsx")) {
    return "typescript";
  }

  if (path.endsWith(".json")) {
    return "json";
  }

  if (path.endsWith(".md")) {
    return "markdown";
  }

  return "plaintext";
}

function filesFromPayload(files: WorkspacePayloadFile[]) {
  return Object.fromEntries(
    files.map((file) => [
      file.path,
      {
        content: file.content,
        id: file.id,
        language: languageFromPath(file.path),
        path: file.path,
        savedContent: file.content
      } satisfies WorkspaceFile
    ])
  );
}

function isWorkspaceLoadResult(value: unknown): value is WorkspaceLoadResult {
  if (!value || typeof value !== "object") {
    return false;
  }

  const payload = value as WorkspaceLoadResult;

  return (
    typeof payload.workspace?.id === "string" &&
    typeof payload.workspace.name === "string" &&
    (payload.project === null ||
      (typeof payload.project.id === "string" && typeof payload.project.name === "string")) &&
    Array.isArray(payload.files)
  );
}

function isCreateProjectResult(value: unknown): value is CreateProjectResult {
  if (!value || typeof value !== "object") {
    return false;
  }

  const payload = value as CreateProjectResult;

  return (
    typeof payload.project?.id === "string" &&
    typeof payload.project.name === "string" &&
    Array.isArray(payload.files) &&
    payload.files.length > 0 &&
    payload.files.every(
      (file) =>
        file &&
        typeof file === "object" &&
        typeof file.id === "string" &&
        typeof file.path === "string" &&
        typeof file.content === "string"
    )
  );
}

export const useWorkspaceStore = create<WorkspaceState>()((set, get) => ({
  files: {},
  openTabs: [],
  activePath: "",
  error: null,
  hasLoaded: false,
  isLoading: false,
  projectId: null,
  projectName: null,
  workspaceId: null,
  openFile: (path) =>
    set((state) => ({
      activePath: path,
      openTabs: state.openTabs.includes(path) ? state.openTabs : [...state.openTabs, path]
    })),
  closeFile: (path) =>
    set((state) => {
      const nextTabs = state.openTabs.filter((tabPath) => tabPath !== path);
      const activePath =
        state.activePath === path ? (nextTabs.at(-1) ?? "") : state.activePath;

      return {
        activePath,
        openTabs: nextTabs
      };
    }),
  applyFileContent: async (path, content) => {
    const { files, projectId } = get();
    let persistedFile: WorkspacePayloadFile | null = null;

    if (projectId) {
      const response = await fetch("/api/workspace/files", {
        body: JSON.stringify({ content, path, projectId }),
        headers: {
          "Content-Type": "application/json"
        },
        method: "PATCH"
      });

      if (!response.ok) {
        set({ error: "File persistence failed." });
        throw new Error("File persistence failed.");
      }

      const payload = (await response.json()) as { file?: WorkspacePayloadFile };
      persistedFile = payload.file ?? null;
    }

    const existingFile = files[path];
    const nextContent = persistedFile?.content ?? content;

    set((state) => ({
      activePath: path,
      error: null,
      files: {
        ...state.files,
        [path]: {
          content: nextContent,
          id: persistedFile?.id ?? existingFile?.id,
          language: existingFile?.language ?? languageFromPath(path),
          path,
          savedContent: nextContent
        }
      },
      openTabs: state.openTabs.includes(path) ? state.openTabs : [...state.openTabs, path]
    }));
  },
  createProject: async (name) => {
    set({ error: null, isLoading: true });

    try {
      const response = await fetch("/api/workspace/projects", {
        body: JSON.stringify({ name }),
        headers: {
          "Content-Type": "application/json"
        },
        method: "POST"
      });

      if (!response.ok) {
        throw new Error("Failed to create project.");
      }

      const payload = (await response.json()) as unknown;

      if (!isCreateProjectResult(payload)) {
        throw new Error("Project creation did not return persisted project files.");
      }

      const files = filesFromPayload(payload.files);
      const firstPath = Object.keys(files)[0] ?? "";
      const workspaceId = get().workspaceId ?? "";

      set((state) => ({
        activePath: firstPath,
        error: null,
        files,
        hasLoaded: true,
        isLoading: false,
        openTabs: firstPath ? [firstPath] : [],
        projectId: payload.project.id,
        projectName: payload.project.name,
        workspaceId: state.workspaceId
      }));

      return {
        chat: {
          messages: [],
          sessionId: null
        },
        files: payload.files,
        project: payload.project,
        workspace: {
          id: workspaceId,
          name: "My Workspace"
        }
      };
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "Project creation failed.",
        isLoading: false
      });

      return null;
    }
  },
  hydrateWorkspace: (payload) => {
    const files = filesFromPayload(payload.files);
    const firstPath = Object.keys(files)[0] ?? "";

    set({
      activePath: firstPath,
      error: null,
      files,
      hasLoaded: true,
      isLoading: false,
      openTabs: firstPath ? [firstPath] : [],
      projectId: payload.project?.id ?? null,
      projectName: payload.project?.name ?? null,
      workspaceId: payload.workspace.id
    });
  },
  loadWorkspace: async () => {
    set({ error: null, isLoading: true });

    try {
      const response = await fetch("/api/workspace");

      if (!response.ok) {
        throw new Error("Failed to load workspace.");
      }

      const payload = (await response.json()) as WorkspaceLoadResult;
      const files = filesFromPayload(payload.files);
      const firstPath = Object.keys(files)[0] ?? "";

      set({
        activePath: firstPath,
        error: null,
        files,
        hasLoaded: true,
        isLoading: false,
        openTabs: firstPath ? [firstPath] : [],
        projectId: payload.project?.id ?? null,
        projectName: payload.project?.name ?? null,
        workspaceId: payload.workspace.id
      });

      return payload;
    } catch {
      set({ error: "Workspace loading failed.", hasLoaded: true, isLoading: false });

      return null;
    }
  },
  updateActiveFile: (content) =>
    set((state) => ({
      files: state.files[state.activePath]
        ? {
            ...state.files,
            [state.activePath]: {
              ...state.files[state.activePath],
              content
            }
          }
        : state.files
    })),
  saveActiveFile: async () => {
    const { activePath, files, projectId } = useWorkspaceStore.getState();
    const file = files[activePath];

    if (!file) {
      return;
    }

    let savedContent = file.content;
    let fileId = file.id;

    if (projectId) {
      const response = await fetch("/api/workspace/files", {
        body: JSON.stringify({
          content: file.content,
          path: activePath,
          projectId
        }),
        headers: {
          "Content-Type": "application/json"
        },
        method: "PATCH"
      });

      if (!response.ok) {
        set({ error: "File persistence failed." });
        return;
      }

      const payload = (await response.json()) as { file?: WorkspacePayloadFile };
      savedContent = payload.file?.content ?? file.content;
      fileId = payload.file?.id ?? file.id;
    }

    set((state) => ({
      error: null,
      files: {
        ...state.files,
        [activePath]: {
          ...file,
          content: savedContent,
          id: fileId,
          savedContent
        }
      }
    }));
  }
}));
