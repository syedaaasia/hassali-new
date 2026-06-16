import type { DevServerRuntimeResult } from "@/lib/server/runtime/dev-server-runtime-types";

export type ViteRuntimeStatus =
  | "blocked"
  | "error"
  | "running"
  | "starting"
  | "stopped";

export type ViteRuntimeLog = {
  createdAt: string;
  stream: "stderr" | "stdout" | "system";
  text: string;
};

export type ViteRuntimeRecord = {
  error: string | null;
  logs: ViteRuntimeLog[];
  pid: number | null;
  port: number | null;
  previewUrl: string | null;
  projectId: string;
  runtimeId: string;
  startedAt: string | null;
  status: ViteRuntimeStatus;
  workspaceRoot: string;
};

export type ViteRuntimeValidation = {
  devScript: string | null;
  ok: boolean;
  reasons: string[];
};

export type ViteRuntimeOperationResult = {
  devServerRuntime?: DevServerRuntimeResult;
  error: string | null;
  logs: string[];
  port: number | null;
  previewUrl: string | null;
  projectId: string;
  runtimeId: string | null;
  runtimeStatus: ViteRuntimeStatus;
  startedAt: string | null;
  workspaceRoot: string;
};

export type ViteRuntimeStartInput = {
  devServerRuntime?: DevServerRuntimeResult | null;
  productMode: "ASK" | "CODE" | "WEBSITE";
  projectId: string;
  workerType: string | null;
  workspaceRoot: string;
};
