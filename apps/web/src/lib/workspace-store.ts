"use client";

import { create } from "zustand";
import { useRuntimeStore } from "@/lib/runtime-store";

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
type FilesMutationResult = {
  files: WorkspacePayloadFile[];
};

type WorkspaceProject = {
  id: string;
  name: string;
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
  projects: WorkspaceProject[];
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
  projects: WorkspaceProject[];
  workspaceId: string | null;
  openFile: (path: string) => void;
  closeFile: (path: string) => void;
  applyFileContent: (path: string, content: string, expectedProjectId?: string | null) => Promise<void>;
  createFile: (path: string) => Promise<void>;
  createFolder: (path: string) => Promise<void>;
  createProject: (name: string) => Promise<WorkspaceLoadResult | null>;
  deletePath: (path: string, kind: "file" | "folder") => Promise<void>;
  hydrateWorkspace: (payload: WorkspaceLoadResult) => void;
  loadWorkspace: (projectId?: string | null) => Promise<WorkspaceLoadResult | null>;
  renamePath: (path: string, newPath: string, kind: "file" | "folder") => Promise<void>;
  setError: (error: string | null) => void;
  switchProject: (projectId: string) => Promise<WorkspaceLoadResult | null>;
  updateActiveFile: (content: string) => void;
  saveActiveFile: () => Promise<void>;
};
type WorkspaceSet = (state: Partial<WorkspaceState>) => void;

export const folderPlaceholderFileName = ".hassali-folder";
const selectedProjectStorageKey = "hassali:selected-project-id";
type LocalStorageLike = {
  getItem: (key: string) => string | null;
  removeItem: (key: string) => void;
  setItem: (key: string, value: string) => void;
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

function isFolderPlaceholderPath(path: string) {
  return path.endsWith(`/${folderPlaceholderFileName}`);
}

function visibleFilePaths(files: Record<string, WorkspaceFile>) {
  return Object.keys(files).filter((path) => !isFolderPlaceholderPath(path));
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
    Array.isArray(payload.files) &&
    Array.isArray(payload.projects)
  );
}

function isFilesMutationResult(value: unknown): value is FilesMutationResult {
  if (!value || typeof value !== "object") {
    return false;
  }

  const payload = value as FilesMutationResult;

  return (
    Array.isArray(payload.files) &&
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

function readSelectedProjectId() {
  const localStorage = (globalThis as { localStorage?: LocalStorageLike }).localStorage;

  if (!localStorage) {
    return null;
  }

  return localStorage.getItem(selectedProjectStorageKey);
}

function writeSelectedProjectId(projectId: string | null) {
  const localStorage = (globalThis as { localStorage?: LocalStorageLike }).localStorage;

  if (!localStorage) {
    return;
  }

  if (projectId) {
    localStorage.setItem(selectedProjectStorageKey, projectId);
    return;
  }

  localStorage.removeItem(selectedProjectStorageKey);
}

function applyWorkspacePayload(
  payload: WorkspaceLoadResult,
  set: WorkspaceSet
) {
  const files = filesFromPayload(payload.files);
  const firstPath = visibleFilePaths(files)[0] ?? "";

  writeSelectedProjectId(payload.project?.id ?? null);

  set({
    activePath: firstPath,
    error: null,
    files,
    hasLoaded: true,
    isLoading: false,
    openTabs: firstPath ? [firstPath] : [],
    projectId: payload.project?.id ?? null,
    projectName: payload.project?.name ?? null,
    projects: payload.projects,
    workspaceId: payload.workspace.id
  });
}

function applyFilesPayload(
  filesPayload: WorkspacePayloadFile[],
  set: WorkspaceSet,
  get: () => WorkspaceState,
  preferredPath?: string | null
) {
  const files = filesFromPayload(filesPayload);
  const visiblePaths = visibleFilePaths(files);
  const currentPath = get().activePath;
  const activePath =
    preferredPath && files[preferredPath] && !isFolderPlaceholderPath(preferredPath)
      ? preferredPath
      : files[currentPath] && !isFolderPlaceholderPath(currentPath)
        ? currentPath
        : (visiblePaths[0] ?? "");

  const existingOpenTabs = get().openTabs.filter(
    (path) => files[path] && !isFolderPlaceholderPath(path)
  );
  const openTabs =
    activePath && !existingOpenTabs.includes(activePath)
      ? [...existingOpenTabs, activePath]
      : existingOpenTabs;

  set({
    activePath,
    error: null,
    files,
    openTabs: activePath ? openTabs : [],
    isLoading: false
  });
}

async function readFilesMutationResponse(response: Response) {
  const payload = (await response.json()) as unknown;

  if (!isFilesMutationResult(payload)) {
    throw new Error("File API did not return project files.");
  }

  return payload;
}

function syncPreviewIfRunning(projectId: string | null) {
  if (!projectId) {
    return;
  }

  void useRuntimeStore.getState().syncPreview(projectId);
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
  projects: [],
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
  applyFileContent: async (path, content, expectedProjectId) => {
    const { files, projectId } = get();

    if (typeof expectedProjectId !== "undefined" && expectedProjectId !== projectId) {
      const message = "This proposal belongs to another project. Recreate it for the current project.";

      set({ error: message });
      throw new Error(message);
    }

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

      const payload = await readFilesMutationResponse(response);
      applyFilesPayload(payload.files, set, get, path);
      syncPreviewIfRunning(projectId);
      return;
    }

    const existingFile = files[path];

    set((state) => ({
      activePath: path,
      error: null,
      files: {
        ...state.files,
        [path]: {
          content,
          id: existingFile?.id,
          language: existingFile?.language ?? languageFromPath(path),
          path,
          savedContent: content
        }
      },
      openTabs: state.openTabs.includes(path) ? state.openTabs : [...state.openTabs, path]
    }));
  },
  createFile: async (path) => {
    const { projectId } = get();

    if (!projectId) {
      set({ error: "Create a project before adding files." });
      return;
    }

    set({ error: null, isLoading: true });

    try {
      const response = await fetch("/api/workspace/files", {
        body: JSON.stringify({ action: "createFile", content: "", path, projectId }),
        headers: {
          "Content-Type": "application/json"
        },
        method: "POST"
      });

      if (!response.ok) {
        throw new Error("File creation failed.");
      }

      const payload = await readFilesMutationResponse(response);
      applyFilesPayload(payload.files, set, get, path);
      syncPreviewIfRunning(projectId);
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "File creation failed.",
        isLoading: false
      });
    }
  },
  createFolder: async (path) => {
    const { projectId } = get();

    if (!projectId) {
      set({ error: "Create a project before adding folders." });
      return;
    }

    set({ error: null, isLoading: true });

    try {
      const response = await fetch("/api/workspace/files", {
        body: JSON.stringify({ action: "createFolder", path, projectId }),
        headers: {
          "Content-Type": "application/json"
        },
        method: "POST"
      });

      if (!response.ok) {
        throw new Error("Folder creation failed.");
      }

      const payload = await readFilesMutationResponse(response);
      applyFilesPayload(payload.files, set, get);
      syncPreviewIfRunning(projectId);
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "Folder creation failed.",
        isLoading: false
      });
    }
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

      if (!isWorkspaceLoadResult(payload)) {
        throw new Error("Project creation did not return persisted project files.");
      }

      applyWorkspacePayload(payload, set);

      return payload;
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "Project creation failed.",
        isLoading: false
      });

      return null;
    }
  },
  hydrateWorkspace: (payload) => {
    applyWorkspacePayload(payload, set);
  },
  deletePath: async (path, kind) => {
    const { projectId } = get();

    if (!projectId) {
      set({ error: "Create a project before deleting files." });
      return;
    }

    set({ error: null, isLoading: true });

    try {
      const response = await fetch("/api/workspace/files", {
        body: JSON.stringify({ kind, path, projectId }),
        headers: {
          "Content-Type": "application/json"
        },
        method: "DELETE"
      });

      if (!response.ok) {
        throw new Error("Delete failed.");
      }

      const payload = await readFilesMutationResponse(response);
      applyFilesPayload(payload.files, set, get);
      syncPreviewIfRunning(projectId);
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "Delete failed.",
        isLoading: false
      });
    }
  },
  loadWorkspace: async (projectId) => {
    set({ error: null, isLoading: true });

    try {
      const selectedProjectId = projectId ?? readSelectedProjectId();
      const query = selectedProjectId ? `?projectId=${encodeURIComponent(selectedProjectId)}` : "";
      const response = await fetch(`/api/workspace${query}`);

      if (!response.ok) {
        throw new Error("Failed to load workspace.");
      }

      const payload = (await response.json()) as unknown;

      if (!isWorkspaceLoadResult(payload)) {
        throw new Error("Workspace response was not valid.");
      }

      applyWorkspacePayload(payload, set);

      return payload;
    } catch {
      set({ error: "Workspace loading failed.", hasLoaded: true, isLoading: false });

      return null;
    }
  },
  renamePath: async (path, newPath, kind) => {
    const { projectId } = get();

    if (!projectId) {
      set({ error: "Create a project before renaming files." });
      return;
    }

    set({ error: null, isLoading: true });

    try {
      const response = await fetch("/api/workspace/files", {
        body: JSON.stringify({ action: "rename", kind, newPath, path, projectId }),
        headers: {
          "Content-Type": "application/json"
        },
        method: "PATCH"
      });

      if (!response.ok) {
        throw new Error("Rename failed.");
      }

      const payload = await readFilesMutationResponse(response);
      applyFilesPayload(payload.files, set, get, kind === "file" ? newPath : null);
      syncPreviewIfRunning(projectId);
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "Rename failed.",
        isLoading: false
      });
    }
  },
  setError: (error) => set({ error }),
  switchProject: async (projectId) => get().loadWorkspace(projectId),
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

      const payload = await readFilesMutationResponse(response);
      const savedFile = payload.files.find((workspaceFile) => workspaceFile.path === activePath);
      savedContent = savedFile?.content ?? file.content;
      fileId = savedFile?.id ?? file.id;
      syncPreviewIfRunning(projectId);
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
