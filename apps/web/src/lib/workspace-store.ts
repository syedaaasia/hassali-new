"use client";

import { create } from "zustand";
import { canonicalProjectState } from "@/lib/canonical-project-state";
import type { RuntimeSyncedFile } from "@/lib/runtime-result-sync";
import { useRuntimeStore } from "@/lib/runtime-store";
import { normalizeSafeProjectPath } from "@/lib/utils/path";

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
type ApplyFileContentOptions = {
  syncPreview?: boolean;
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
  applyFileContent: (
    path: string,
    content: string,
    expectedProjectId?: string | null,
    options?: ApplyFileContentOptions
  ) => Promise<void>;
  createFile: (path: string) => Promise<void>;
  createFolder: (path: string) => Promise<void>;
  createProject: (name: string) => Promise<WorkspaceLoadResult | null>;
  deletePath: (path: string, kind: "file" | "folder") => Promise<void>;
  hydrateWorkspace: (payload: WorkspaceLoadResult) => void;
  loadWorkspace: (projectId?: string | null) => Promise<WorkspaceLoadResult | null>;
  renamePath: (path: string, newPath: string, kind: "file" | "folder") => Promise<void>;
  setError: (error: string | null) => void;
  syncRuntimeFiles: (updates: RuntimeSyncedFile[], deletedPaths?: string[]) => void;
  switchProject: (projectId: string) => Promise<WorkspaceLoadResult | null>;
  updateActiveFile: (content: string) => void;
  saveActiveFile: () => Promise<void>;
};
type WorkspaceSet = (state: Partial<WorkspaceState>) => void;

export const folderPlaceholderFileName = ".hassali-folder";
const selectedProjectStorageKey = "hassali:selected-project-id";
const starterWelcomeSignature = 'type WorkspaceMood = "calm" | "focused" | "ready";';
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
  const normalizedFiles = new Map<string, WorkspaceFile>();

  for (const file of files.filter((payloadFile) => !isTemplateWelcomeFile(payloadFile))) {
    const path = normalizeSafeProjectPath(file.path);

    if (!path) continue;

    normalizedFiles.set(path, {
      content: file.content,
      id: file.id,
      language: languageFromPath(path),
      path,
      savedContent: file.content
    });
  }

  return Object.fromEntries(normalizedFiles);
}

function isTemplateWelcomeFile(file: WorkspacePayloadFile) {
  return normalizeSafeProjectPath(file.path) === "welcome.ts" &&
    file.content.includes(starterWelcomeSignature) &&
    file.content.includes("small steps, visible changes");
}

function committedPayloadFiles(files: WorkspacePayloadFile[]) {
  return files.filter((file) => !isTemplateWelcomeFile(file));
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
  canonicalProjectState.hydrateCommitted({
    files: committedPayloadFiles(payload.files),
    projectId: payload.project?.id ?? null
  });

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
  canonicalProjectState.hydrateCommitted({
    files: committedPayloadFiles(filesPayload),
    projectId: get().projectId
  });

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
  const payload = (await response.json().catch(() => null)) as unknown;

  if (!isFilesMutationResult(payload)) {
    throw new Error("File API did not return project files.");
  }

  return payload;
}

async function readFileApiError(response: Response) {
  const payload = (await response.json().catch(() => null)) as unknown;

  if (payload && typeof payload === "object") {
    const error = (payload as { error?: unknown; message?: unknown }).error;
    const message = (payload as { error?: unknown; message?: unknown }).message;

    if (typeof error === "string" && error.trim().length > 0) {
      return error;
    }

    if (typeof message === "string" && message.trim().length > 0) {
      return message;
    }
  }

  return response.statusText || "File persistence failed.";
}

function normalizeProjectFilePath(value: unknown) {
  const normalized = normalizeSafeProjectPath(value);

  if (!normalized || normalized === folderPlaceholderFileName || normalized.endsWith(`/${folderPlaceholderFileName}`)) {
    return null;
  }

  return normalized;
}

function setAndThrowFileApplyError(set: WorkspaceSet, message: string): never {
  set({ error: message, isLoading: false });
  throw new Error(message);
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
  applyFileContent: async (path, content, expectedProjectId, options) => {
    const { projectId } = get();
    const normalizedPath = normalizeProjectFilePath(path);

    if (!normalizedPath) {
      setAndThrowFileApplyError(
        set,
        "Could not save file. The proposal contains an invalid project path. Proposal was not applied."
      );
    }

    if (typeof content !== "string") {
      setAndThrowFileApplyError(
        set,
        `Could not save ${normalizedPath}. Proposed content was missing. Proposal was not applied.`
      );
    }

    if (!expectedProjectId) {
      setAndThrowFileApplyError(
        set,
        `Could not save ${normalizedPath}. The proposal is missing projectId. Proposal was not applied.`
      );
    }

    if (!projectId) {
      setAndThrowFileApplyError(
        set,
        `Could not save ${normalizedPath}. No selected project is loaded. Proposal was not applied.`
      );
    }

    if (expectedProjectId !== projectId) {
      setAndThrowFileApplyError(
        set,
        "This proposal belongs to another project. Recreate it for the current project."
      );
    }

    const response = await fetch("/api/workspace/files", {
      body: JSON.stringify({ content, path: normalizedPath, projectId }),
      headers: {
        "Content-Type": "application/json"
      },
      method: "PATCH"
    });

    if (!response.ok) {
      const backendMessage = await readFileApiError(response);
      setAndThrowFileApplyError(
        set,
        `Could not save ${normalizedPath}. Backend returned ${response.status}: ${backendMessage}. Proposal was not applied.`
      );
    }

    const payload = await readFilesMutationResponse(response);
    const savedFile = payload.files.find((workspaceFile) => workspaceFile.path === normalizedPath);

    if (!savedFile) {
      setAndThrowFileApplyError(
        set,
        `Could not verify ${normalizedPath}. The backend did not return the saved file. Proposal was not applied.`
      );
    }

    if (savedFile.content !== content) {
      setAndThrowFileApplyError(
        set,
        `Could not verify ${normalizedPath}. The saved content did not match the proposal. Proposal was not applied.`
      );
    }

    applyFilesPayload(payload.files, set, get, normalizedPath);

    if (options?.syncPreview !== false) {
      syncPreviewIfRunning(projectId);
    }
  },
  createFile: async (path) => {
    const { projectId } = get();
    const normalizedPath = normalizeProjectFilePath(path);

    if (!projectId) {
      set({ error: "Create a project before adding files." });
      return;
    }

    if (!normalizedPath) {
      set({ error: "A valid file path is required." });
      return;
    }

    set({ error: null, isLoading: true });

    try {
      const response = await fetch("/api/workspace/files", {
        body: JSON.stringify({ action: "createFile", content: "", path: normalizedPath, projectId }),
        headers: {
          "Content-Type": "application/json"
        },
        method: "POST"
      });

      if (!response.ok) {
        throw new Error("File creation failed.");
      }

      const payload = await readFilesMutationResponse(response);
      applyFilesPayload(payload.files, set, get, normalizedPath);
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
    const normalizedPath = normalizeProjectFilePath(path);

    if (!projectId) {
      set({ error: "Create a project before adding folders." });
      return;
    }

    if (!normalizedPath) {
      set({ error: "A valid folder path is required." });
      return;
    }

    set({ error: null, isLoading: true });

    try {
      const response = await fetch("/api/workspace/files", {
        body: JSON.stringify({ action: "createFolder", path: normalizedPath, projectId }),
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
    const normalizedPath = normalizeProjectFilePath(path);

    if (!projectId) {
      set({ error: "Create a project before deleting files." });
      return;
    }

    if (!normalizedPath) {
      set({ error: "A valid path is required." });
      return;
    }

    set({ error: null, isLoading: true });

    try {
      const response = await fetch("/api/workspace/files", {
        body: JSON.stringify({ kind, path: normalizedPath, projectId }),
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
    canonicalProjectState.resetForProjectSwitch(projectId ?? readSelectedProjectId());
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
    const normalizedPath = normalizeProjectFilePath(path);
    const normalizedNewPath = normalizeProjectFilePath(newPath);

    if (!projectId) {
      set({ error: "Create a project before renaming files." });
      return;
    }

    if (!normalizedPath || !normalizedNewPath) {
      set({ error: "Valid source and target paths are required." });
      return;
    }

    set({ error: null, isLoading: true });

    try {
      const response = await fetch("/api/workspace/files", {
        body: JSON.stringify({ action: "rename", kind, newPath: normalizedNewPath, path: normalizedPath, projectId }),
        headers: {
          "Content-Type": "application/json"
        },
        method: "PATCH"
      });

      if (!response.ok) {
        throw new Error("Rename failed.");
      }

      const payload = await readFilesMutationResponse(response);
      applyFilesPayload(payload.files, set, get, kind === "file" ? normalizedNewPath : null);
      syncPreviewIfRunning(projectId);
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "Rename failed.",
        isLoading: false
      });
    }
  },
  setError: (error) => set({ error }),
  syncRuntimeFiles: (updates, deletedPaths = []) => {
    if (updates.length === 0 && deletedPaths.length === 0) {
      return;
    }

    set((state) => {
      const files = { ...state.files };
      const openedPaths = new Set(state.openTabs);
      let preferredActivePath = state.activePath;

      for (const deletedPath of deletedPaths) {
        const normalizedPath = normalizeProjectFilePath(deletedPath);
        if (!normalizedPath) continue;
        delete files[normalizedPath];
        openedPaths.delete(normalizedPath);
        if (preferredActivePath === normalizedPath) preferredActivePath = "";
      }

      for (const update of updates) {
        const normalizedPath = normalizeProjectFilePath(update.path);

        if (!normalizedPath) {
          continue;
        }

        files[normalizedPath] = {
          content: update.content,
          id: files[normalizedPath]?.id ?? normalizedPath,
          language: files[normalizedPath]?.language ?? languageFromPath(normalizedPath),
          path: normalizedPath,
          savedContent: update.content
        };

        if (state.openTabs.includes(normalizedPath) || state.activePath === normalizedPath) {
          openedPaths.add(normalizedPath);
        }

        if (!preferredActivePath || state.activePath === normalizedPath) {
          preferredActivePath = normalizedPath;
        }
      }

      if (!preferredActivePath || !files[preferredActivePath]) {
        preferredActivePath = Array.from(openedPaths).find((path) => files[path]) ?? visibleFilePaths(files)[0] ?? "";
      }

      return {
        error: null,
        files,
        activePath: preferredActivePath,
        openTabs: Array.from(openedPaths).filter((path) => files[path])
      };
    });
    canonicalProjectState.hydrateCommitted({
      files: Object.values(useWorkspaceStore.getState().files).map((file) => ({
        content: file.savedContent,
        id: file.id ?? file.path,
        path: file.path
      })),
      projectId: get().projectId
    });
  },
  switchProject: async (projectId) => {
    canonicalProjectState.resetForProjectSwitch(projectId);
    useRuntimeStore.getState().applyRuntimePayload({
      error: null,
      logs: [],
      port: null,
      previewUrl: null,
      projectId,
      status: "stopped",
      workspacePath: null
    });

    return get().loadWorkspace(projectId);
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

      const payload = await readFilesMutationResponse(response);
      const savedFile = payload.files.find((workspaceFile) => workspaceFile.path === activePath);
      savedContent = savedFile?.content ?? file.content;
      fileId = savedFile?.id ?? file.id;
      canonicalProjectState.hydrateCommitted({
        files: committedPayloadFiles(payload.files),
        projectId
      });
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
