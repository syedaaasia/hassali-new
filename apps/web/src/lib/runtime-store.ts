"use client";

import { create } from "zustand";
import { canonicalProjectState } from "@/lib/canonical-project-state";

type RuntimeStatus = "blocked" | "error" | "running" | "starting" | "stopped";

type RuntimePayload = {
  error: string | null;
  logs: string[];
  port: number | null;
  previewUrl: string | null;
  projectId: string | null;
  status: RuntimeStatus;
  workspacePath: string | null;
};

type RuntimeStreamPayload = {
  errors?: string[];
  framework?: string;
  lastHealthCheckAt?: string | null;
  logs?: string[];
  port?: number | null;
  previewUrl?: string | null;
  runtimeId?: string | null;
  status?: RuntimeStatus;
  updatedAt?: string | null;
};

type RuntimeState = RuntimePayload & {
  applyRuntimePayload: (payload: RuntimePayload) => void;
  iframeVersion: number;
  isLoading: boolean;
  isPreviewOpen: boolean;
  runtimeErrors: string[];
  runtimeFramework: string | null;
  runtimeHealth: string | null;
  runtimeId: string | null;
  runtimeLastUpdatedAt: string | null;
  runtimeLogs: string[];
  runtimePort: number | null;
  runtimePreviewUrl: string | null;
  runtimeStatus: RuntimeStatus;
  clearLogs: () => Promise<void>;
  refreshRuntime: () => Promise<void>;
  refreshRuntimeStatus: (projectId: string | null) => Promise<void>;
  setPreviewOpen: (isPreviewOpen: boolean) => void;
  startPreview: (projectId: string | null) => Promise<void>;
  stopPreview: () => Promise<void>;
  syncPreview: (projectId: string | null) => Promise<void>;
  togglePreview: () => void;
};

const initialPayload: RuntimePayload = {
  error: null,
  logs: [],
  port: null,
  previewUrl: null,
  projectId: null,
  status: "stopped",
  workspacePath: null
};

const initialStreamState = {
  runtimeErrors: [] as string[],
  runtimeFramework: null as string | null,
  runtimeHealth: null as string | null,
  runtimeId: null as string | null,
  runtimeLastUpdatedAt: null as string | null,
  runtimeLogs: [] as string[],
  runtimePort: null as number | null,
  runtimePreviewUrl: null as string | null,
  runtimeStatus: "stopped" as RuntimeStatus
};

function isRuntimePayload(value: unknown): value is RuntimePayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const payload = value as RuntimePayload;

  return (
    (payload.status === "blocked" ||
      payload.status === "error" ||
      payload.status === "running" ||
      payload.status === "starting" ||
      payload.status === "stopped") &&
    Array.isArray(payload.logs)
  );
}

function canonicalRuntimeStatus(status: RuntimeStatus) {
  if (status === "error") return "failed";

  return status;
}

function syncCanonicalRuntime(payload: {
  framework?: string | null;
  lastHealthCheckAt?: string | null;
  port?: number | null;
  previewUrl?: string | null;
  status?: RuntimeStatus;
}) {
  canonicalProjectState.setRuntime({
    framework: payload.framework ?? null,
    lastHealthCheck: payload.lastHealthCheckAt ? Date.parse(payload.lastHealthCheckAt) : Date.now(),
    port: payload.port ?? null,
    previewUrl: payload.previewUrl ?? null,
    status: canonicalRuntimeStatus(payload.status ?? "stopped")
  });
}

async function readRuntimeResponse(response: Response) {
  const payload = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    const error =
      payload && typeof payload === "object" && typeof (payload as { error?: unknown }).error === "string"
        ? (payload as { error: string }).error
        : "Preview runtime request failed.";

    throw new Error(error);
  }

  if (!isRuntimePayload(payload)) {
    throw new Error("Preview runtime response was not valid.");
  }

  return payload;
}

export const useRuntimeStore = create<RuntimeState>((set, get) => ({
  ...initialPayload,
  ...initialStreamState,
  applyRuntimePayload: (payload) =>
    {
      syncCanonicalRuntime(payload);
      set((state) => ({
        ...payload,
        iframeVersion: payload.previewUrl ? state.iframeVersion + 1 : state.iframeVersion,
        isLoading: false,
        runtimeErrors: payload.error ? [payload.error] : state.runtimeErrors,
        runtimeLogs: payload.logs,
        runtimePort: payload.port,
        runtimePreviewUrl: payload.previewUrl,
        runtimeStatus: payload.status
      }));
    },
  iframeVersion: 0,
  isLoading: false,
  isPreviewOpen: false,
  clearLogs: async () => {
    const response = await fetch("/api/runtime", {
      body: JSON.stringify({ action: "clearLogs" }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    const payload = await readRuntimeResponse(response);
    set({ ...payload, error: null });
  },
  refreshRuntime: async () => {
    try {
      const response = await fetch("/api/runtime");
      const payload = await readRuntimeResponse(response);
      set(payload);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Preview status unavailable." });
    }
  },
  refreshRuntimeStatus: async (projectId) => {
    if (!projectId) {
      return;
    }

    try {
      const response = await fetch(`/api/runtime/status?projectId=${encodeURIComponent(projectId)}`);
      const payload = (await response.json().catch(() => null)) as RuntimeStreamPayload | null;

      if (!response.ok || !payload) {
        return;
      }

      syncCanonicalRuntime(payload);
      set((state) => {
        const nextPreviewUrl = payload.previewUrl ?? state.previewUrl;

        return {
          error: payload.errors?.at(-1) ?? state.error,
          iframeVersion: nextPreviewUrl && nextPreviewUrl !== state.previewUrl
            ? state.iframeVersion + 1
            : state.iframeVersion,
          logs: payload.logs ?? state.logs,
          port: payload.port ?? state.port,
          previewUrl: nextPreviewUrl,
          runtimeErrors: payload.errors ?? state.runtimeErrors,
          runtimeFramework: payload.framework ?? state.runtimeFramework,
          runtimeHealth: payload.lastHealthCheckAt ?? state.runtimeHealth,
          runtimeId: payload.runtimeId ?? state.runtimeId,
          runtimeLastUpdatedAt: payload.updatedAt ?? state.runtimeLastUpdatedAt,
          runtimeLogs: payload.logs ?? state.runtimeLogs,
          runtimePort: payload.port ?? state.runtimePort,
          runtimePreviewUrl: payload.previewUrl ?? state.runtimePreviewUrl,
          runtimeStatus: payload.status ?? state.runtimeStatus,
          status: payload.status ?? state.status
        };
      });
    } catch {
      // Runtime streaming is best-effort; existing preview state remains usable.
    }
  },
  setPreviewOpen: (isPreviewOpen) => set({ isPreviewOpen }),
  startPreview: async (projectId) => {
    if (!projectId) {
      set({ error: "Create or select a project before starting preview." });
      return;
    }

    set({ error: null, isLoading: true, status: "starting" });

    try {
      const response = await fetch("/api/runtime", {
        body: JSON.stringify({ action: "restart", projectId }),
        headers: { "Content-Type": "application/json" },
        method: "POST"
      });
      const payload = await readRuntimeResponse(response);
      syncCanonicalRuntime(payload);
      set((state) => ({
        ...payload,
        iframeVersion: payload.previewUrl ? state.iframeVersion + 1 : state.iframeVersion,
        isLoading: false
      }));
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "Preview start failed.",
        isLoading: false,
        status: "error"
      });
    }
  },
  stopPreview: async () => {
    set({ error: null, isLoading: true });

    try {
      const response = await fetch("/api/runtime", {
        body: JSON.stringify({ action: "stop" }),
        headers: { "Content-Type": "application/json" },
        method: "POST"
      });
      const payload = await readRuntimeResponse(response);
      syncCanonicalRuntime(payload);
      set({ ...payload, isLoading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "Preview stop failed.",
        isLoading: false,
        status: "error"
      });
    }
  },
  syncPreview: async (projectId) => {
    if (!projectId || get().status !== "running") {
      return;
    }

    try {
      const response = await fetch("/api/runtime", {
        body: JSON.stringify({ action: "sync", projectId }),
        headers: { "Content-Type": "application/json" },
        method: "POST"
      });
      const payload = await readRuntimeResponse(response);
      syncCanonicalRuntime(payload);
      set((state) => ({
        ...payload,
        iframeVersion: payload.previewUrl ? state.iframeVersion + 1 : state.iframeVersion
      }));
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Preview reload failed." });
    }
  },
  togglePreview: () => {
    set((state) => ({ isPreviewOpen: !state.isPreviewOpen }));
  }
}));
