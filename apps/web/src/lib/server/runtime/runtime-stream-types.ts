export type RuntimeStreamFramework = "backend" | "mobile" | "next" | "unknown" | "vite";

export type RuntimeStreamStatus =
  | "blocked"
  | "error"
  | "running"
  | "starting"
  | "stopped";

export type RuntimeStreamEventType =
  | "error"
  | "health"
  | "log"
  | "started"
  | "status"
  | "stopped";

export type RuntimeStreamEvent = {
  createdAt: string;
  error?: string | null;
  exitCode?: number | null;
  framework: RuntimeStreamFramework;
  message: string;
  port?: number | null;
  previewUrl?: string | null;
  projectId: string;
  runtimeId: string;
  status?: RuntimeStreamStatus;
  stream?: "stderr" | "stdout" | "system";
  type: RuntimeStreamEventType;
};

export type RuntimeStreamSnapshot = {
  errors: string[];
  events: RuntimeStreamEvent[];
  exitCode: number | null;
  framework: RuntimeStreamFramework;
  lastHealthCheckAt: string | null;
  logs: string[];
  port: number | null;
  previewUrl: string | null;
  projectId: string;
  runtimeId: string | null;
  startedAt: string | null;
  status: RuntimeStreamStatus;
  stoppedAt: string | null;
  updatedAt: string | null;
};
