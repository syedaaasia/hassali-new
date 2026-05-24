"use client";

import { create } from "zustand";

type RuntimeStatus = "error" | "running" | "starting" | "stopped";

type RuntimePayload = {
  error: string | null;
  logs: string[];
  port: number | null;
  previewUrl: string | null;
  projectId: string | null;
  status: RuntimeStatus;
  workspacePath: string | null;
};

type RuntimeState = RuntimePayload & {
  iframeVersion: number;
  isLoading: boolean;
  clearLogs: () => Promise<void>;
  refreshRuntime: () => Promise<void>;
  startPreview: (projectId: string | null) => Promise<void>;
  stopPreview: () => Promise<void>;
  syncPreview: (projectId: string | null) => Promise<void>;
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

function isRuntimePayload(value: unknown): value is RuntimePayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const payload = value as RuntimePayload;

  return (
    (payload.status === "error" ||
      payload.status === "running" ||
      payload.status === "starting" ||
      payload.status === "stopped") &&
    Array.isArray(payload.logs)
  );
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
  iframeVersion: 0,
  isLoading: false,
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
      set((state) => ({
        ...payload,
        iframeVersion: payload.previewUrl ? state.iframeVersion + 1 : state.iframeVersion
      }));
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Preview reload failed." });
    }
  }
}));
