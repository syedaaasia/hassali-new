import type { RealPreviewResult } from "@/lib/server/preview/real-preview-types";

export type BackendFramework =
  | "aspnet_core"
  | "django"
  | "express"
  | "fastapi"
  | "fastify"
  | "fiber"
  | "flask"
  | "gin"
  | "laravel"
  | "nestjs"
  | "node"
  | "spring_boot"
  | "unknown";

export type BackendRuntimeType =
  | "dotnet"
  | "go"
  | "java"
  | "node"
  | "php"
  | "python"
  | "unknown";

export type BackendArchitectureStyle =
  | "controller_service_repository"
  | "mvc"
  | "modular_monolith"
  | "rest_api"
  | "service_oriented"
  | "unknown";

export type BackendFrameworkMatch = {
  confidence: number;
  displayName: string;
  framework: BackendFramework;
  runtimeType: BackendRuntimeType;
  signals: string[];
};

export type BackendRuntimeAnalysis = {
  architectureStyle: BackendArchitectureStyle;
  authenticationType: string | null;
  authorization: string[];
  controllers: string[];
  cronJobs: string[];
  databases: string[];
  databaseCount: number;
  endpointCount: number;
  endpoints: string[];
  events: string[];
  framework: BackendFramework;
  middleware: string[];
  models: string[];
  queues: string[];
  queueType: string | null;
  repositories: string[];
  routeCount: number;
  routes: string[];
  schemas: string[];
  serviceCount: number;
  services: string[];
  validators: string[];
  webhooks: string[];
  workers: string[];
};

export type BackendRuntimeMetadata = {
  architectureStyle: BackendArchitectureStyle;
  authenticationType: string | null;
  databaseCount: number;
  endpointCount: number;
  framework: BackendFramework;
  frameworkDisplayName: string;
  queueType: string | null;
  routeCount: number;
  runtimeType: BackendRuntimeType;
  serviceCount: number;
};

export type BackendRuntimeEngineResult = {
  analysis: BackendRuntimeAnalysis;
  detected: boolean;
  match: BackendFrameworkMatch;
  metadata: BackendRuntimeMetadata;
  realPreview: RealPreviewResult | null;
  warnings: string[];
};

export type BackendExecutionStatus =
  | "blocked"
  | "error"
  | "running"
  | "starting"
  | "stopped";

export type BackendExecutionLog = {
  createdAt: string;
  stream: "stderr" | "stdout" | "system";
  text: string;
};

export type BackendExecutionRecord = {
  error: string | null;
  framework: BackendFramework;
  logs: BackendExecutionLog[];
  pid: number | null;
  port: number | null;
  previewUrl: string | null;
  projectId: string;
  runtimeId: string;
  startedAt: string | null;
  status: BackendExecutionStatus;
  workspaceRoot: string;
};

export type BackendExecutionValidation = {
  command: BackendRuntimeCommand | null;
  ok: boolean;
  reasons: string[];
};

export type BackendRuntimeCommand =
  | {
      args: string[];
      command: "node" | "npm";
      label: "node server.js" | "npm run dev" | "npm run start:dev";
    };

export type BackendRuntimeOperationResult = {
  apiStatus: "candidate" | "failed" | "running";
  endpointCount: number;
  error: string | null;
  framework: BackendFramework;
  healthStatus: "blocked" | "healthy" | "unknown";
  logs: string[];
  port: number | null;
  previewUrl: string | null;
  projectId: string;
  routeCount: number;
  runtimeId: string | null;
  runtimeStatus: BackendExecutionStatus;
  startedAt: string | null;
  workspaceRoot: string;
};

export type BackendRuntimeStartInput = {
  analysis: BackendRuntimeAnalysis;
  match: BackendFrameworkMatch;
  productMode: "ASK" | "CODE" | "WEBSITE";
  projectId: string;
  workerType: string | null;
  workspaceRoot: string;
};
