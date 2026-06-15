import type {
  ApprovedExecutionPlan,
  RuntimeAdapterResult,
  RuntimeEvent,
  RuntimeSession,
  RuntimeVerificationResult
} from "@/lib/server/runtime/runtime-types";

export type RuntimeAdapter = {
  applyPatch(session: RuntimeSession, path: string, patch: string): Promise<RuntimeAdapterResult>;
  readFile(session: RuntimeSession, path: string): Promise<RuntimeAdapterResult>;
  sendApprovedPlan(session: RuntimeSession, plan: ApprovedExecutionPlan): Promise<RuntimeAdapterResult>;
  startSession(input: {
    projectId: string;
    workspaceRoot: string;
  }): Promise<RuntimeSession>;
  stopSession(session: RuntimeSession): Promise<RuntimeAdapterResult>;
  streamEvents(session: RuntimeSession): AsyncIterable<RuntimeEvent>;
  verify(session: RuntimeSession, plan: ApprovedExecutionPlan): Promise<RuntimeVerificationResult>;
  writeFile(session: RuntimeSession, path: string, content: string): Promise<RuntimeAdapterResult>;
};
