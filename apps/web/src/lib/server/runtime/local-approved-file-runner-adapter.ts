import type { RuntimeAdapter } from "@/lib/server/runtime/runtime-adapter";
import {
  readApprovedFile,
  runApprovedFilePlan
} from "@/lib/server/runtime/approved-file-runner";
import type {
  ApprovedExecutionPlan,
  RuntimeAdapterResult,
  RuntimeEvent,
  RuntimeSession,
  RuntimeVerificationResult
} from "@/lib/server/runtime/runtime-types";

function now() {
  return new Date().toISOString();
}

function createSession(input: { projectId: string; workspaceRoot: string }): RuntimeSession {
  return {
    adapterName: "local-approved-file-runner-adapter",
    createdAt: now(),
    id: `local-approved-file-runner-${Date.now()}`,
    projectId: input.projectId,
    status: "running",
    workspaceRoot: input.workspaceRoot
  };
}

function event(session: RuntimeSession, type: RuntimeEvent["type"], message: string): RuntimeEvent {
  return {
    createdAt: now(),
    message,
    sessionId: session.id,
    type
  };
}

export class LocalApprovedFileRunnerAdapter implements RuntimeAdapter {
  async startSession(input: { projectId: string; workspaceRoot: string }): Promise<RuntimeSession> {
    return createSession(input);
  }

  async sendApprovedPlan(session: RuntimeSession, plan: ApprovedExecutionPlan): Promise<RuntimeAdapterResult> {
    const output = await runApprovedFilePlan({
      approvedPlan: plan,
      projectId: session.projectId,
      workspaceRoot: session.workspaceRoot
    });

    return {
      blockedReasons: output.blockedSteps.flatMap((step) => step.reasons),
      events: output.events,
      ok: output.runnerStatus === "completed",
      session: {
        ...session,
        status: output.runnerStatus === "completed" ? "completed" : output.runnerStatus === "failed" ? "failed" : "stopped"
      },
      verification: output.verification
    };
  }

  async *streamEvents(session: RuntimeSession): AsyncIterable<RuntimeEvent> {
    yield event(session, "session_started", "Local approved file runner event stream opened.");
  }

  async readFile(session: RuntimeSession, path: string): Promise<RuntimeAdapterResult> {
    try {
      await readApprovedFile(session.workspaceRoot, path);

      return {
        blockedReasons: [],
        events: [event(session, "verification", `Verified readable file '${path}'.`)],
        ok: true,
        session
      };
    } catch (error) {
      return {
        blockedReasons: [{
          code: "unsafe_path",
          message: error instanceof Error ? error.message : "Unable to read approved file.",
          severity: "high"
        }],
        events: [event(session, "blocked", `Read blocked for '${path}'.`)],
        ok: false,
        session
      };
    }
  }

  async writeFile(session: RuntimeSession, path: string, content: string): Promise<RuntimeAdapterResult> {
    const plan: ApprovedExecutionPlan = {
      createdAt: now(),
      id: `single-write-${Date.now()}`,
      mode: "CODE",
      projectId: session.projectId,
      steps: [{
        approved: true,
        content,
        id: "write_file",
        path,
        summary: `Write approved file ${path}`,
        tool: "write_file"
      }],
      summary: "Single approved file write",
      workspaceRoot: session.workspaceRoot
    };

    return this.sendApprovedPlan(session, plan);
  }

  async applyPatch(session: RuntimeSession, path: string, patch: string): Promise<RuntimeAdapterResult> {
    const plan: ApprovedExecutionPlan = {
      createdAt: now(),
      id: `single-patch-${Date.now()}`,
      mode: "CODE",
      projectId: session.projectId,
      steps: [{
        approved: true,
        content: patch,
        id: "apply_patch",
        path,
        summary: `Apply approved full-file patch ${path}`,
        tool: "apply_patch"
      }],
      summary: "Single approved full-file patch",
      workspaceRoot: session.workspaceRoot
    };

    return this.sendApprovedPlan(session, plan);
  }

  async verify(_session: RuntimeSession, plan: ApprovedExecutionPlan): Promise<RuntimeVerificationResult> {
    const output = await runApprovedFilePlan({
      approvedPlan: {
        ...plan,
        steps: plan.steps.filter((step) => step.tool === "verify_files")
      },
      projectId: plan.projectId,
      workspaceRoot: plan.workspaceRoot
    });

    return output.verification;
  }

  async stopSession(session: RuntimeSession): Promise<RuntimeAdapterResult> {
    return {
      blockedReasons: [],
      events: [event(session, "session_stopped", "Local approved file runner session stopped.")],
      ok: true,
      session: {
        ...session,
        status: "stopped"
      }
    };
  }
}

export function createLocalApprovedFileRunnerAdapter() {
  return new LocalApprovedFileRunnerAdapter();
}
