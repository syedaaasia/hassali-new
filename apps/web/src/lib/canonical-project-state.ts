"use client";

import { useSyncExternalStore } from "react";
import {
  deriveManifest,
  emptyPreviewManifest,
  type HassaliMode,
  type PreviewManifest,
  type VfsFile
} from "@/lib/preview-manifest";
import { normalizePath } from "@/lib/utils/path";
import type { DiffProposal } from "@/lib/chat-store";

export type StagedFile = {
  path: string;
  content: string;
  action: "create" | "update" | "delete";
};

export type CanonicalProjectState = {
  projectId: string;
  mode: HassaliMode;
  manifest: PreviewManifest;
  vfs: {
    committed: Map<string, VfsFile>;
    staged: Map<string, StagedFile>;
  };
  pendingProposal: DiffProposal | null;
  runtime: {
    status: "stopped" | "starting" | "running" | "blocked" | "failed" | "crashed";
    port: number | null;
    pid: number | null;
    lastHealthCheck: number | null;
    framework: string | null;
    previewUrl: string | null;
  };
};

const listeners = new Set<() => void>();
let state: CanonicalProjectState = {
  projectId: "",
  mode: "ASK",
  manifest: emptyPreviewManifest,
  vfs: {
    committed: new Map(),
    staged: new Map()
  },
  pendingProposal: null,
  runtime: {
    status: "stopped",
    port: null,
    pid: null,
    lastHealthCheck: null,
    framework: null,
    previewUrl: null
  }
};

function emit() {
  for (const listener of listeners) listener();
}

function committedFromFiles(files: Array<{ content: string; id?: string; path: string }>) {
  const committed = new Map<string, VfsFile>();

  for (const file of files) {
    const path = normalizePath(file.path);

    if (!path) continue;

    committed.set(path, {
      content: file.content,
      lastModified: Date.now(),
      path
    });
  }

  return committed;
}

function resetRuntime() {
  state = {
    ...state,
    runtime: {
      status: "stopped",
      port: null,
      pid: null,
      lastHealthCheck: null,
      framework: null,
      previewUrl: null
    }
  };
}

export const canonicalProjectState = {
  _committedListCache: null as VfsFile[] | null,
  _invalidateFileCache: () => {
    canonicalProjectState._committedListCache = null;
  },
  clearProposalState() {
    state = {
      ...state,
      pendingProposal: null,
      vfs: {
        ...state.vfs,
        staged: new Map()
      }
    };
    emit();
  },
  getCommittedFileList: () => {
    if (canonicalProjectState._committedListCache !== null) {
      return canonicalProjectState._committedListCache;
    }

    canonicalProjectState._committedListCache = [...state.vfs.committed.values()].sort((left, right) =>
      left.path.localeCompare(right.path)
    );

    return canonicalProjectState._committedListCache;
  },
  getManifest() {
    return state.manifest;
  },
  getSnapshot() {
    return state;
  },
  hydrateCommitted(input: {
    files: Array<{ content: string; id?: string; path: string }>;
    mode?: HassaliMode;
    projectId: string | null;
  }) {
    const committed = committedFromFiles(input.files);

    state = {
      ...state,
      projectId: input.projectId ?? "",
      mode: input.mode ?? state.mode,
      manifest: deriveManifest(committed, input.mode),
      vfs: {
        committed,
        staged: new Map()
      },
      pendingProposal: null
    };
    canonicalProjectState._invalidateFileCache();
    emit();
  },
  resetForProjectSwitch(projectId: string | null) {
    state = {
      ...state,
      projectId: projectId ?? "",
      manifest: emptyPreviewManifest,
      vfs: {
        committed: new Map(),
        staged: new Map()
      },
      pendingProposal: null
    };
    resetRuntime();
    canonicalProjectState._invalidateFileCache();
    emit();
  },
  setMode(mode: HassaliMode) {
    state = {
      ...state,
      manifest: deriveManifest(state.vfs.committed, mode),
      mode,
      pendingProposal: null,
      vfs: {
        ...state.vfs,
        staged: new Map()
      }
    };
    resetRuntime();
    emit();
  },
  setRuntime(runtime: Partial<CanonicalProjectState["runtime"]>) {
    state = {
      ...state,
      runtime: {
        ...state.runtime,
        ...runtime
      }
    };
    emit();
  },
  stageProposal(proposal: DiffProposal | null) {
    const staged = new Map<string, StagedFile>();

    for (const change of proposal?.changes ?? []) {
      const path = normalizePath(change.path);

      if (!path || typeof change.proposedContent !== "string") continue;
      if (change.action !== "create" && change.action !== "modify" && change.action !== "update" && change.action !== "write_file") continue;

      staged.set(path, {
        action: change.action === "create" ? "create" : "update",
        content: change.proposedContent,
        path
      });
    }

    state = {
      ...state,
      pendingProposal: proposal,
      vfs: {
        ...state.vfs,
        staged
      }
    };
    emit();
  },
  subscribe: (listener: () => void) => {
    listeners.add(listener);

    return () => {
      listeners.delete(listener);
    };
  }
};

export function useCanonicalFiles() {
  return useSyncExternalStore(
    canonicalProjectState.subscribe,
    canonicalProjectState.getCommittedFileList,
    canonicalProjectState.getCommittedFileList
  );
}

export function useCanonicalManifest() {
  return useSyncExternalStore(
    canonicalProjectState.subscribe,
    canonicalProjectState.getManifest,
    canonicalProjectState.getManifest
  );
}
