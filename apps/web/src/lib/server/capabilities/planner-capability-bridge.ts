import {
  validateAdaptiveCodePlan,
  type AdaptiveCodePlan,
  type AdaptivePlanAction,
  type PlanRevision
} from "../ai/adaptive-code-planner";
import type { CapabilityMatch, RepositoryCapabilityProfile } from "./capability-types";

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function validate(plan: AdaptiveCodePlan): AdaptiveCodePlan {
  const validation = validateAdaptiveCodePlan(plan);
  return { ...plan, validation: { ...validation, executable: validation.executable && plan.status !== "requires-approval" } };
}

export function refineAdaptiveCodePlanWithCapabilities(
  plan: AdaptiveCodePlan,
  profile: RepositoryCapabilityProfile,
  match: CapabilityMatch
): AdaptiveCodePlan {
  if (match.taskId !== plan.taskId) return plan;
  const commandById = new Map(profile.commands.map((command) => [command.commandId, command]));
  const suggested = match.suggestedCommandIds.map((id) => commandById.get(id)).filter((command) => command?.invocation);
  const actions = plan.actions.map((action): AdaptivePlanAction => {
    if (action.kind !== "verify" || !suggested.length) return action;
    const commands = suggested.map((command) => `${command!.invocation!.executable} ${command!.invocation!.args.join(" ")}`);
    return {
      ...action,
      objective: `${action.objective} Prefer declared targeted verification: ${commands.join(", ")}.`,
      verification: unique([...action.verification, ...commands.map((command) => `Run only after approval: ${command}.`)])
    };
  });
  const blocksExecution = plan.intent.requiresExecution && (match.missingCapabilityIds.length > 0 || match.degradedCapabilityIds.length > 0 || match.unsupportedCapabilityIds.length > 0);
  const evidence = unique([
    ...match.selectedPackIds.map((id) => `Capability pack detected: ${id}.`),
    ...match.availableCapabilityIds.map((id) => `Local capability available: ${id}.`),
    ...match.degradedCapabilityIds.map((id) => `Local capability degraded: ${id}.`),
    ...match.missingCapabilityIds.map((id) => `Required local capability unavailable: ${id}.`)
  ]).slice(0, 16);
  const revisionAction = actions.find((action) => action.kind === "verify") ?? actions[0];
  const revision: PlanRevision | null = revisionAction && evidence.length ? {
    evidence,
    newAction: revisionAction,
    previousActionId: revisionAction.id,
    reason: "Repository and local-tool capability evidence refined verification metadata without granting execution permission."
  } : null;
  const refined: AdaptiveCodePlan = {
    ...plan,
    actions,
    assumptions: unique([...plan.assumptions, ...profile.warnings]),
    capabilityEvidence: {
      available: match.availableCapabilityIds,
      degraded: match.degradedCapabilityIds,
      fingerprint: profile.fingerprint,
      missing: match.missingCapabilityIds,
      packs: match.selectedPackIds
    },
    executionRequirements: match.executionRequirements,
    failure: blocksExecution
      ? { code: "REQUIRED_CAPABILITY_UNAVAILABLE", safeMessage: "A required local capability is unavailable, so Hassali cannot execute this plan." }
      : plan.failure,
    revisions: revision ? [...plan.revisions, revision] : plan.revisions,
    status: blocksExecution ? "blocked" : plan.status,
    stopConditions: unique([
      ...plan.stopConditions,
      blocksExecution ? "Stop before execution until the required local capability is available and separately approved." : "",
      "Capability availability never grants execution permission."
    ])
  };
  return validate(refined);
}
