import type { RuntimeAdapter } from "@/lib/server/runtime/runtime-adapter";
import { createGitSnapshotSafety } from "@/lib/server/runtime/git-snapshot-safety";
import { validateApprovedExecutionPlan } from "@/lib/server/runtime/runtime-permissions";
import type {
  ApprovedExecutionPlan,
  RuntimeAdapterResult,
  RuntimeBlockedReason,
  RuntimeEvent,
  RuntimeSession,
  RuntimeVerificationResult
} from "@/lib/server/runtime/runtime-types";
import { isServerOwnedProjectWorkspaceRoot } from "@/lib/server/runtime/workspace-binding";
import { getOpenHandsSandboxConfig } from "@/lib/server/runtime/workers/openhands-sandbox-config";
import type {
  OpenHandsSandboxConfig,
  OpenHandsSandboxContract,
  OpenHandsSandboxResult,
  OpenHandsSandboxStatus
} from "@/lib/server/runtime/workers/openhands-sandbox-types";

function now() {
  return new Date().toISOString();
}

function event(input: {
  message: string;
  metadata?: RuntimeEvent["metadata"];
  sessionId: string;
  type: RuntimeEvent["type"];
}): RuntimeEvent {
  return {
    createdAt: now(),
    message: input.message,
    metadata: input.metadata,
    sessionId: input.sessionId,
    type: input.type
  };
}

function blocked(code: RuntimeBlockedReason["code"], message: string): RuntimeBlockedReason {
  return {
    code,
    message,
    severity: "high"
  };
}

function verificationFor(status: OpenHandsSandboxStatus, details: string[]): RuntimeVerificationResult {
  return {
    checkedAt: now(),
    details,
    ok: status === "planned"
  };
}

function createSandboxContract(input: {
  config: OpenHandsSandboxConfig;
  events: RuntimeEvent[];
  sandboxId: string;
  status: OpenHandsSandboxStatus;
  verification: RuntimeVerificationResult;
  workspaceRoot: string;
}): OpenHandsSandboxContract {
  return {
    allowedFutureOperations: [
      "inspect workspace",
      "apply approved patch",
      "run verification command",
      "run tests",
      "collect logs"
    ],
    allowedMounts: [input.workspaceRoot],
    auditEvents: input.events,
    commandPolicy: input.config.commandPolicy,
    deniedMounts: ["host filesystem", "home directory", "system directories", "external paths"],
    dryRun: true,
    isolationMode: input.config.isolationMode,
    networkPolicy: input.config.networkPolicy,
    resourceLimits: input.config.resourceLimits,
    sandboxId: input.sandboxId,
    sandboxStatus: input.status,
    timeoutMs: input.config.timeoutMs,
    verification: input.verification,
    workspaceRoot: input.workspaceRoot
  };
}

function result(input: {
  config: OpenHandsSandboxConfig;
  errors?: string[];
  events: RuntimeEvent[];
  sandboxId: string;
  snapshot: OpenHandsSandboxResult["snapshot"];
  status: OpenHandsSandboxStatus;
  verification: RuntimeVerificationResult;
  workspaceRoot: string;
}): OpenHandsSandboxResult {
  return {
    changedFiles: [],
    durationMs: 0,
    errors: input.errors ?? [],
    events: input.events,
    exitCode: null,
    sandbox: createSandboxContract({
      config: input.config,
      events: input.events,
      sandboxId: input.sandboxId,
      status: input.status,
      verification: input.verification,
      workspaceRoot: input.workspaceRoot
    }),
    snapshot: input.snapshot,
    snapshotId: input.snapshot?.snapshotId ?? null,
    status: input.status,
    stderr: "",
    stdout: "",
    verification: input.verification,
    workerType: "openhands"
  };
}

export async function planOpenHandsSandbox(input: {
  config?: Partial<OpenHandsSandboxConfig>;
  plan: ApprovedExecutionPlan;
  sessionId: string;
}): Promise<OpenHandsSandboxResult> {
  const config = getOpenHandsSandboxConfig(input.config);
  const sandboxId = `openhands-sandbox-plan-${Date.now()}`;

  if (!config.enabled) {
    const verification = verificationFor("unavailable", ["OpenHands sandbox is disabled; no sandbox was created."]);
    const events = [
      event({
        message: "OpenHands sandbox is disabled. Set ENABLE_OPENHANDS_SANDBOX=true to plan this optional sandbox.",
        sessionId: input.sessionId,
        type: "openhands_sandbox_unavailable"
      })
    ];

    return result({
      config,
      errors: ["OpenHands sandbox is disabled."],
      events,
      sandboxId,
      snapshot: null,
      status: "unavailable",
      verification,
      workspaceRoot: input.plan.workspaceRoot
    });
  }

  const permissionReasons = validateApprovedExecutionPlan(input.plan);

  if (permissionReasons.length > 0) {
    const verification = verificationFor("blocked", permissionReasons.map((reason) => reason.message));
    const events = [
      event({
        message: "OpenHands sandbox plan blocked by runtime permissions.",
        sessionId: input.sessionId,
        type: "openhands_sandbox_blocked"
      })
    ];

    return result({
      config,
      errors: permissionReasons.map((reason) => reason.message),
      events,
      sandboxId,
      snapshot: null,
      status: "blocked",
      verification,
      workspaceRoot: input.plan.workspaceRoot
    });
  }

  const serverOwnedWorkspace = await isServerOwnedProjectWorkspaceRoot(input.plan.workspaceRoot);

  if (!serverOwnedWorkspace) {
    const verification = verificationFor("blocked", ["OpenHands sandbox requires a server-owned Hassali project workspace."]);
    const events = [
      event({
        message: "OpenHands sandbox plan blocked because workspace is not server-owned.",
        sessionId: input.sessionId,
        type: "openhands_sandbox_blocked"
      })
    ];

    return result({
      config,
      errors: verification.details,
      events,
      sandboxId,
      snapshot: null,
      status: "blocked",
      verification,
      workspaceRoot: input.plan.workspaceRoot
    });
  }

  const snapshot = await createGitSnapshotSafety({
    planId: input.plan.id,
    projectId: input.plan.projectId,
    runnerId: input.sessionId,
    workspaceRoot: input.plan.workspaceRoot
  });

  if (snapshot.snapshotStatus !== "available") {
    const verification = verificationFor("blocked", ["OpenHands sandbox requires an available Git snapshot before future execution."]);
    const events = [
      ...snapshot.events,
      event({
        message: "OpenHands sandbox plan blocked because Git snapshot is unavailable.",
        sessionId: input.sessionId,
        type: "openhands_sandbox_blocked"
      })
    ];

    return result({
      config,
      errors: verification.details,
      events,
      sandboxId,
      snapshot: null,
      status: "blocked",
      verification,
      workspaceRoot: input.plan.workspaceRoot
    });
  }

  const verification = verificationFor("planned", [
    "OpenHands sandbox dry-run plan verified.",
    "No container was created.",
    "No command was executed.",
    "Network policy is deny.",
    "Command policy is deny."
  ]);
  const events = [
    ...snapshot.events,
    event({
      message: "OpenHands sandbox dry-run plan created.",
      metadata: {
        isolationMode: config.isolationMode,
        networkPolicy: config.networkPolicy,
        timeoutMs: config.timeoutMs
      },
      sessionId: input.sessionId,
      type: "openhands_sandbox_planned"
    }),
    event({
      message: "OpenHands sandbox dry-run verification passed.",
      sessionId: input.sessionId,
      type: "openhands_sandbox_verified"
    })
  ];

  return result({
    config,
    events,
    sandboxId,
    snapshot: {
      afterRef: snapshot.afterRef,
      beforeRef: snapshot.beforeRef,
      changedFiles: snapshot.changedFiles,
      rollbackApplied: snapshot.rollbackApplied,
      rollbackAvailable: snapshot.rollbackAvailable,
      snapshotId: snapshot.snapshotId,
      snapshotStatus: snapshot.snapshotStatus
    },
    status: "planned",
    verification,
    workspaceRoot: input.plan.workspaceRoot
  });
}

function createSession(input: { projectId: string; workspaceRoot: string }): RuntimeSession {
  return {
    adapterName: "openhands-sandbox-adapter",
    createdAt: now(),
    id: `openhands-sandbox-adapter-${Date.now()}`,
    projectId: input.projectId,
    status: "running",
    workspaceRoot: input.workspaceRoot
  };
}

function blockedAdapterResult(
  session: RuntimeSession,
  code: RuntimeBlockedReason["code"],
  message: string
): RuntimeAdapterResult {
  return {
    blockedReasons: [blocked(code, message)],
    events: [
      event({
        message,
        sessionId: session.id,
        type: "blocked"
      })
    ],
    ok: false,
    session: {
      ...session,
      status: "failed"
    }
  };
}

function adapterResult(session: RuntimeSession, sandboxResult: OpenHandsSandboxResult): RuntimeAdapterResult {
  return {
    blockedReasons: sandboxResult.status === "planned"
      ? []
      : [blocked(
        sandboxResult.status === "unavailable" ? "runtime_worker_unavailable" : "write_not_allowed",
        sandboxResult.errors[0] ?? `OpenHands sandbox ${sandboxResult.status}.`
      )],
    events: sandboxResult.events,
    ok: sandboxResult.status === "planned",
    session: {
      ...session,
      status: sandboxResult.status === "planned" ? "completed" : "failed"
    },
    snapshot: sandboxResult.snapshot ?? undefined,
    verification: sandboxResult.verification,
    workerResult: sandboxResult
  };
}

export class OpenHandsSandboxAdapter implements RuntimeAdapter {
  async startSession(input: { projectId: string; workspaceRoot: string }): Promise<RuntimeSession> {
    return createSession(input);
  }

  async sendApprovedPlan(session: RuntimeSession, plan: ApprovedExecutionPlan): Promise<RuntimeAdapterResult> {
    if (session.projectId !== plan.projectId || session.workspaceRoot !== plan.workspaceRoot) {
      return blockedAdapterResult(session, "missing_workspace_root", "OpenHands sandbox session must match the approved plan workspace.");
    }

    const sandboxResult = await planOpenHandsSandbox({
      plan,
      sessionId: session.id
    });

    return adapterResult(session, sandboxResult);
  }

  async *streamEvents(session: RuntimeSession): AsyncIterable<RuntimeEvent> {
    yield event({
      message: "OpenHands sandbox adapter event stream opened.",
      sessionId: session.id,
      type: "session_started"
    });
  }

  async readFile(session: RuntimeSession): Promise<RuntimeAdapterResult> {
    return blockedAdapterResult(session, "unknown_tool", "OpenHands sandbox adapter does not expose direct file reads.");
  }

  async writeFile(session: RuntimeSession): Promise<RuntimeAdapterResult> {
    return blockedAdapterResult(session, "write_not_allowed", "OpenHands sandbox adapter is dry-run only in this phase.");
  }

  async applyPatch(session: RuntimeSession): Promise<RuntimeAdapterResult> {
    return blockedAdapterResult(session, "write_not_allowed", "OpenHands sandbox adapter is dry-run only in this phase.");
  }

  async verify(session: RuntimeSession): Promise<RuntimeVerificationResult> {
    return {
      checkedAt: now(),
      details: [`OpenHands sandbox adapter verification for session '${session.id}' is dry-run only.`],
      ok: true
    };
  }

  async stopSession(session: RuntimeSession): Promise<RuntimeAdapterResult> {
    return {
      blockedReasons: [],
      events: [
        event({
          message: "OpenHands sandbox adapter session stopped.",
          sessionId: session.id,
          type: "session_stopped"
        })
      ],
      ok: true,
      session: {
        ...session,
        status: "stopped"
      }
    };
  }
}

export function createOpenHandsSandboxAdapter() {
  return new OpenHandsSandboxAdapter();
}
