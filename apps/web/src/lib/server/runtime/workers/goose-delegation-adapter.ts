import type { RuntimeAdapter } from "@/lib/server/runtime/runtime-adapter";
import { createGitSnapshotSafety } from "@/lib/server/runtime/git-snapshot-safety";
import { createDefaultMcpRegistry } from "@/lib/server/runtime/mcp/mcp-tool-registry";
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
import { getGooseDelegationConfig } from "@/lib/server/runtime/workers/goose-delegation-config";
import type {
  GooseDelegationConfig,
  GooseDelegationContract,
  GooseDelegationResult,
  GooseDelegationStatus,
  GooseDelegationTask
} from "@/lib/server/runtime/workers/goose-delegation-types";

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

function verificationFor(status: GooseDelegationStatus, details: string[]): RuntimeVerificationResult {
  return {
    checkedAt: now(),
    details,
    ok: status === "planned"
  };
}

function futureMcpToolNames() {
  return createDefaultMcpRegistry()
    .map((entry) => entry.tool.name)
    .filter((name) => name === "worker_delegate" || name === "sandbox_run");
}

function delegationTasks(plan: ApprovedExecutionPlan): GooseDelegationTask[] {
  const mcpToolsRequired = futureMcpToolNames();
  const planTasks = plan.steps.slice(0, 6).map((step, index): GooseDelegationTask => ({
    candidateWorker: index % 2 === 0 ? "aider" : "opencode",
    dryRun: true,
    id: `goose-plan-step-${index + 1}`,
    mcpToolsRequired,
    purpose: `Plan future delegation for approved step '${step.id}' without executing it.`,
    title: step.summary
  }));

  return planTasks.length
    ? planTasks
    : [
        {
          candidateWorker: "mcp",
          dryRun: true,
          id: "goose-plan-worker-delegate",
          mcpToolsRequired,
          purpose: "Describe a future approved worker delegation path through the MCP registry.",
          title: "Future worker delegation placeholder"
        }
      ];
}

function createDelegationContract(input: {
  config: GooseDelegationConfig;
  events: RuntimeEvent[];
  delegationId: string;
  status: GooseDelegationStatus;
  verification: RuntimeVerificationResult;
  workspaceRoot: string;
  plan: ApprovedExecutionPlan;
}): GooseDelegationContract {
  return {
    auditEvents: input.events,
    candidateWorkers: ["aider", "opencode", "openhands"],
    delegationId: input.delegationId,
    delegationMode: input.config.delegationMode,
    delegationPolicy: input.config.policy,
    delegationStatus: input.status,
    delegationTasks: delegationTasks(input.plan),
    dryRun: true,
    mcpToolsRequired: futureMcpToolNames(),
    requestedWorkerType: "goose",
    selectedDelegate: input.status === "planned" ? "goose_dry_run_planner" : null,
    timeoutMs: input.config.timeoutMs,
    verification: input.verification,
    workspaceRoot: input.workspaceRoot
  };
}

function result(input: {
  config: GooseDelegationConfig;
  errors?: string[];
  events: RuntimeEvent[];
  delegationId: string;
  snapshot: GooseDelegationResult["snapshot"];
  status: GooseDelegationStatus;
  verification: RuntimeVerificationResult;
  workspaceRoot: string;
  plan: ApprovedExecutionPlan;
}): GooseDelegationResult {
  return {
    changedFiles: [],
    delegation: createDelegationContract({
      config: input.config,
      events: input.events,
      delegationId: input.delegationId,
      plan: input.plan,
      status: input.status,
      verification: input.verification,
      workspaceRoot: input.workspaceRoot
    }),
    durationMs: 0,
    errors: input.errors ?? [],
    events: input.events,
    exitCode: null,
    snapshot: input.snapshot,
    snapshotId: input.snapshot?.snapshotId ?? null,
    status: input.status,
    stderr: "",
    stdout: "",
    verification: input.verification,
    workerType: "goose"
  };
}

export async function planGooseDelegation(input: {
  config?: Partial<GooseDelegationConfig>;
  plan: ApprovedExecutionPlan;
  sessionId: string;
}): Promise<GooseDelegationResult> {
  const config = getGooseDelegationConfig(input.config);
  const delegationId = `goose-delegation-plan-${Date.now()}`;

  if (!config.enabled) {
    const verification = verificationFor("unavailable", ["Goose delegation is disabled; no delegation plan was created."]);
    const events = [
      event({
        message: "Goose delegation is disabled. Set ENABLE_GOOSE_DELEGATION=true to dry-run this optional delegation planner.",
        sessionId: input.sessionId,
        type: "goose_delegation_unavailable"
      })
    ];

    return result({
      config,
      delegationId,
      errors: ["Goose delegation is disabled."],
      events,
      plan: input.plan,
      snapshot: null,
      status: "unavailable",
      verification,
      workspaceRoot: input.plan.workspaceRoot
    });
  }

  if (input.plan.mode !== "CODE") {
    const verification = verificationFor("blocked", ["Goose delegation is only available for approved CODE plans."]);
    const events = [
      event({
        message: "Goose delegation blocked because the approved plan is not CODE mode.",
        sessionId: input.sessionId,
        type: "goose_delegation_blocked"
      })
    ];

    return result({
      config,
      delegationId,
      errors: verification.details,
      events,
      plan: input.plan,
      snapshot: null,
      status: "blocked",
      verification,
      workspaceRoot: input.plan.workspaceRoot
    });
  }

  const permissionReasons = validateApprovedExecutionPlan(input.plan);

  if (permissionReasons.length > 0) {
    const verification = verificationFor("blocked", permissionReasons.map((reason) => reason.message));
    const events = [
      event({
        message: "Goose delegation blocked by runtime permissions.",
        sessionId: input.sessionId,
        type: "goose_delegation_blocked"
      })
    ];

    return result({
      config,
      delegationId,
      errors: permissionReasons.map((reason) => reason.message),
      events,
      plan: input.plan,
      snapshot: null,
      status: "blocked",
      verification,
      workspaceRoot: input.plan.workspaceRoot
    });
  }

  const serverOwnedWorkspace = await isServerOwnedProjectWorkspaceRoot(input.plan.workspaceRoot);

  if (!serverOwnedWorkspace) {
    const verification = verificationFor("blocked", ["Goose delegation requires a server-owned Hassali project workspace."]);
    const events = [
      event({
        message: "Goose delegation blocked because workspace is not server-owned.",
        sessionId: input.sessionId,
        type: "goose_delegation_blocked"
      })
    ];

    return result({
      config,
      delegationId,
      errors: verification.details,
      events,
      plan: input.plan,
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
    const verification = verificationFor("blocked", ["Goose delegation requires an available Git snapshot before future delegation."]);
    const events = [
      ...snapshot.events,
      event({
        message: "Goose delegation blocked because Git snapshot is unavailable.",
        sessionId: input.sessionId,
        type: "goose_delegation_blocked"
      })
    ];

    return result({
      config,
      delegationId,
      errors: verification.details,
      events,
      plan: input.plan,
      snapshot: null,
      status: "blocked",
      verification,
      workspaceRoot: input.plan.workspaceRoot
    });
  }

  const verification = verificationFor("planned", [
    "Goose delegation dry-run plan verified.",
    "No worker was delegated.",
    "No MCP tool was executed.",
    "Network policy is deny.",
    "Shell policy is deny.",
    "Package install policy is deny."
  ]);
  const events = [
    ...snapshot.events,
    event({
      message: "Goose delegation dry-run plan created.",
      metadata: {
        delegationMode: config.delegationMode,
        mcpToolExecution: config.policy.mcpToolExecution,
        network: config.policy.network,
        timeoutMs: config.timeoutMs
      },
      sessionId: input.sessionId,
      type: "goose_delegation_planned"
    }),
    event({
      message: "Goose delegation dry-run verification passed.",
      sessionId: input.sessionId,
      type: "goose_delegation_verified"
    })
  ];

  return result({
    config,
    delegationId,
    events,
    plan: input.plan,
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
    adapterName: "goose-delegation-adapter",
    createdAt: now(),
    id: `goose-delegation-adapter-${Date.now()}`,
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

function adapterResult(session: RuntimeSession, delegationResult: GooseDelegationResult): RuntimeAdapterResult {
  return {
    blockedReasons: delegationResult.status === "planned"
      ? []
      : [blocked(
        delegationResult.status === "unavailable" ? "runtime_worker_unavailable" : "write_not_allowed",
        delegationResult.errors[0] ?? `Goose delegation ${delegationResult.status}.`
      )],
    events: delegationResult.events,
    ok: delegationResult.status === "planned",
    session: {
      ...session,
      status: delegationResult.status === "planned" ? "completed" : "failed"
    },
    snapshot: delegationResult.snapshot ?? undefined,
    verification: delegationResult.verification,
    workerResult: delegationResult
  };
}

export class GooseDelegationAdapter implements RuntimeAdapter {
  async startSession(input: { projectId: string; workspaceRoot: string }): Promise<RuntimeSession> {
    return createSession(input);
  }

  async sendApprovedPlan(session: RuntimeSession, plan: ApprovedExecutionPlan): Promise<RuntimeAdapterResult> {
    if (session.projectId !== plan.projectId || session.workspaceRoot !== plan.workspaceRoot) {
      return blockedAdapterResult(session, "missing_workspace_root", "Goose delegation session must match the approved plan workspace.");
    }

    const delegationResult = await planGooseDelegation({
      plan,
      sessionId: session.id
    });

    return adapterResult(session, delegationResult);
  }

  async *streamEvents(session: RuntimeSession): AsyncIterable<RuntimeEvent> {
    yield event({
      message: "Goose delegation adapter event stream opened.",
      sessionId: session.id,
      type: "session_started"
    });
  }

  async readFile(session: RuntimeSession): Promise<RuntimeAdapterResult> {
    return blockedAdapterResult(session, "unknown_tool", "Goose delegation adapter does not expose direct file reads.");
  }

  async writeFile(session: RuntimeSession): Promise<RuntimeAdapterResult> {
    return blockedAdapterResult(session, "write_not_allowed", "Goose delegation adapter is dry-run only in this phase.");
  }

  async applyPatch(session: RuntimeSession): Promise<RuntimeAdapterResult> {
    return blockedAdapterResult(session, "write_not_allowed", "Goose delegation adapter is dry-run only in this phase.");
  }

  async verify(session: RuntimeSession): Promise<RuntimeVerificationResult> {
    return {
      checkedAt: now(),
      details: [`Goose delegation adapter verification for session '${session.id}' is dry-run only.`],
      ok: true
    };
  }

  async stopSession(session: RuntimeSession): Promise<RuntimeAdapterResult> {
    return {
      blockedReasons: [],
      events: [
        event({
          message: "Goose delegation adapter session stopped.",
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

export function createGooseDelegationAdapter() {
  return new GooseDelegationAdapter();
}
