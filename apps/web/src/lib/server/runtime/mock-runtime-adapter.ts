import type { RuntimeAdapter } from "@/lib/server/runtime/runtime-adapter";
import {
  defaultRuntimePermissionPolicy,
  isPathInsideWorkspace,
  validateApprovedExecutionPlan
} from "@/lib/server/runtime/runtime-permissions";
import type {
  ApprovedExecutionPlan,
  RuntimeAdapterResult,
  RuntimeBlockedReason,
  RuntimeEvent,
  RuntimeSession,
  RuntimeVerificationResult
} from "@/lib/server/runtime/runtime-types";

function now() {
  return new Date().toISOString();
}

function createSession(input: { projectId: string; workspaceRoot: string }): RuntimeSession {
  return {
    adapterName: "mock-runtime-adapter",
    createdAt: now(),
    id: `mock-runtime-${Date.now()}`,
    projectId: input.projectId,
    status: "idle",
    workspaceRoot: input.workspaceRoot
  };
}

function event(session: RuntimeSession, type: RuntimeEvent["type"], message: string, stepId?: string): RuntimeEvent {
  return {
    createdAt: now(),
    message,
    sessionId: session.id,
    stepId,
    type
  };
}

function result(
  session: RuntimeSession,
  events: RuntimeEvent[],
  blockedReasons: RuntimeBlockedReason[] = [],
  verification?: RuntimeVerificationResult
): RuntimeAdapterResult {
  return {
    blockedReasons,
    events,
    ok: blockedReasons.length === 0,
    session: {
      ...session,
      status: blockedReasons.length === 0 ? "completed" : "failed"
    },
    verification
  };
}

export class MockRuntimeAdapter implements RuntimeAdapter {
  async startSession(input: { projectId: string; workspaceRoot: string }): Promise<RuntimeSession> {
    return {
      ...createSession(input),
      status: "running"
    };
  }

  async sendApprovedPlan(session: RuntimeSession, plan: ApprovedExecutionPlan): Promise<RuntimeAdapterResult> {
    const blockedReasons = validateApprovedExecutionPlan(plan, defaultRuntimePermissionPolicy);
    const events: RuntimeEvent[] = [
      event(session, "plan_received", `Mock runtime received approved plan '${plan.id}'.`)
    ];

    if (blockedReasons.length > 0) {
      return result(
        session,
        [
          ...events,
          event(session, "blocked", "Mock runtime blocked the plan before any execution.")
        ],
        blockedReasons
      );
    }

    for (const step of plan.steps) {
      events.push(event(session, "step_started", `Accepted approved step '${step.summary}'.`, step.id));
      events.push(event(session, "tool_noop", `No-op runtime accepted tool '${step.tool}' without mutating disk.`, step.id));
    }

    const verification = await this.verify(session, plan);

    return result(session, [...events, event(session, "completed", "Mock runtime completed without disk mutation.")], [], verification);
  }

  async *streamEvents(session: RuntimeSession): AsyncIterable<RuntimeEvent> {
    yield event(session, "session_started", "Mock runtime event stream opened.");
    yield event(session, "tool_noop", "Mock runtime has no live execution events.");
  }

  async readFile(session: RuntimeSession, path: string): Promise<RuntimeAdapterResult> {
    const blockedReasons = isPathInsideWorkspace(path, session.workspaceRoot)
      ? []
      : [{ code: "external_path_blocked", message: `Path '${path}' is outside the workspace root.`, severity: "high" } satisfies RuntimeBlockedReason];

    return result(
      session,
      [event(session, blockedReasons.length ? "blocked" : "tool_noop", "Mock read_file never reads from disk.")],
      blockedReasons
    );
  }

  async writeFile(session: RuntimeSession, path: string, content: string): Promise<RuntimeAdapterResult> {
    const blockedReasons = isPathInsideWorkspace(path, session.workspaceRoot)
      ? []
      : [{ code: "external_path_blocked", message: `Path '${path}' is outside the workspace root.`, severity: "high" } satisfies RuntimeBlockedReason];

    return result(
      session,
      [event(session, blockedReasons.length ? "blocked" : "tool_noop", `Mock write_file accepted ${content.length} character(s) as no-op input.`)],
      blockedReasons
    );
  }

  async applyPatch(session: RuntimeSession, path: string, patch: string): Promise<RuntimeAdapterResult> {
    const blockedReasons = isPathInsideWorkspace(path, session.workspaceRoot)
      ? []
      : [{ code: "external_path_blocked", message: `Path '${path}' is outside the workspace root.`, severity: "high" } satisfies RuntimeBlockedReason];

    return result(
      session,
      [event(session, blockedReasons.length ? "blocked" : "tool_noop", `Mock apply_patch accepted ${patch.length} character(s) as no-op input.`)],
      blockedReasons
    );
  }

  async verify(session: RuntimeSession, plan: ApprovedExecutionPlan): Promise<RuntimeVerificationResult> {
    return {
      checkedAt: now(),
      details: [
        `Plan '${plan.id}' was permission-checked.`,
        "Mock adapter did not mutate disk.",
        "Real runtime verification is reserved for a later phase."
      ],
      ok: validateApprovedExecutionPlan(plan, defaultRuntimePermissionPolicy).length === 0
    };
  }

  async stopSession(session: RuntimeSession): Promise<RuntimeAdapterResult> {
    return result(
      {
        ...session,
        status: "stopped"
      },
      [event(session, "session_stopped", "Mock runtime session stopped.")]
    );
  }
}

export function createMockRuntimeAdapter() {
  return new MockRuntimeAdapter();
}
