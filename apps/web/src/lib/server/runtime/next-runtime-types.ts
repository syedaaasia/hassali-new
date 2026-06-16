import type { DevServerRuntimeResult } from "@/lib/server/runtime/dev-server-runtime-types";

export type NextRuntimeStatus =
  | "blocked"
  | "error"
  | "running"
  | "starting"
  | "stopped";

export type NextRouterKind = "app_router" | "mixed" | "pages_router" | "unknown";

export type NextRuntimeLog = {
  createdAt: string;
  stream: "stderr" | "stdout" | "system";
  text: string;
};

export type NextRuntimeRecord = {
  error: string | null;
  framework: "next_app";
  logs: NextRuntimeLog[];
  pid: number | null;
  port: number | null;
  previewUrl: string | null;
  projectId: string;
  routerKind: NextRouterKind;
  runtimeId: string;
  startedAt: string | null;
  status: NextRuntimeStatus;
  workspaceRoot: string;
};

export type NextRuntimeValidation = {
  devScript: string | null;
  hasNextDependency: boolean;
  ok: boolean;
  reasons: string[];
  routerKind: NextRouterKind;
};

export type NextRuntimeOperationResult = {
  devServerRuntime?: DevServerRuntimeResult;
  error: string | null;
  framework: "next_app";
  logs: string[];
  port: number | null;
  previewUrl: string | null;
  projectId: string;
  routerKind: NextRouterKind;
  runtimeId: string | null;
  runtimeStatus: NextRuntimeStatus;
  startedAt: string | null;
  workspaceRoot: string;
};

export type NextRuntimeStartInput = {
  devServerRuntime?: DevServerRuntimeResult | null;
  productMode: "ASK" | "CODE" | "WEBSITE";
  projectId: string;
  workerType: string | null;
  workspaceRoot: string;
};
