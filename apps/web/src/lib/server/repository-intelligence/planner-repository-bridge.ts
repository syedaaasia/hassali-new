import {
  validateAdaptiveCodePlan,
  type AdaptiveCodePlan,
  type AdaptivePlanAction,
  type PlanRevision
} from "../ai/adaptive-code-planner";
import type { RepositoryInspectionResult } from "./repository-intelligence-types";

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function withObjective(action: AdaptivePlanAction, objective: string, verification?: string[]): AdaptivePlanAction {
  return {
    ...action,
    objective,
    verification: verification ? unique([...action.verification, ...verification]) : action.verification
  };
}

function validatedRepositoryPlan(plan: AdaptiveCodePlan): AdaptiveCodePlan {
  const validation = validateAdaptiveCodePlan(plan);
  return {
    ...plan,
    validation: {
      ...validation,
      executable: validation.executable && plan.status !== "requires-approval"
    }
  };
}

export function refineAdaptiveCodePlanWithRepository(
  plan: AdaptiveCodePlan,
  inspection: RepositoryInspectionResult
): AdaptiveCodePlan {
  if (inspection.requestTaskId !== plan.taskId) return plan;
  const surface = inspection.implementationSurface;
  const exactPaths = unique([
    ...surface.authoritativeFiles,
    ...surface.relatedTests,
    ...surface.configurationFiles
  ]).slice(0, 16);
  if (surface.status === "unavailable" || surface.authoritativeFiles.length === 0) {
    const withoutValidation = {
      ...plan,
      assumptions: unique([...plan.assumptions, "Repository inspection did not prove an exact implementation owner; keep implementation paths unresolved."]),
      repositoryEvidence: {
        confidence: surface.confidence,
        exactPaths: [],
        impactRadius: inspection.changeImpact.radius,
        snapshotFingerprint: inspection.snapshotFingerprint,
        status: surface.status
      }
    };
    return validatedRepositoryPlan(withoutValidation);
  }

  const owners = surface.authoritativeFiles.slice(0, 5);
  const tests = surface.relatedTests.slice(0, 5);
  const symbols = surface.relatedSymbols.slice(0, 8).map((symbol) => `${symbol.name} (${symbol.file}:${symbol.line})`);
  let revisedAction: AdaptivePlanAction | null = null;
  const actions = plan.actions.map((action) => {
    if (action.kind === "inspect") {
      return withObjective(
        action,
        `Confirm the evidence-backed implementation surface in ${owners.join(", ")}${symbols.length ? `; inspect symbols ${symbols.join(", ")}` : ""}.`
      );
    }
    if (action.kind === "implement" && !revisedAction) {
      revisedAction = withObjective(
        action,
        `Implement the approved objective within the proven authoritative surface: ${owners.join(", ")}.`,
        tests.length ? [`Run mapped test(s): ${tests.join(", ")}.`] : undefined
      );
      return revisedAction;
    }
    if (action.kind === "verify" && tests.length) {
      return withObjective(action, `${action.objective} Prioritize repository-mapped tests: ${tests.join(", ")}.`);
    }
    return action;
  });
  const revisionTarget = revisedAction ?? actions.find((action) => action.kind === "inspect") ?? actions[0];
  const revision: PlanRevision | null = revisionTarget ? {
    evidence: inspection.evidence.slice(0, 10),
    newAction: revisionTarget,
    previousActionId: revisionTarget.id,
    reason: "Repository evidence replaced unresolved implementation assumptions with proven files, symbols, routes, and tests."
  } : null;
  const withoutValidation = {
    ...plan,
    actions,
    repositoryEvidence: {
      confidence: surface.confidence,
      exactPaths,
      impactRadius: inspection.changeImpact.radius,
      snapshotFingerprint: inspection.snapshotFingerprint,
      status: surface.status
    },
    revisions: revision ? [...plan.revisions, revision] : plan.revisions
  };
  return validatedRepositoryPlan(withoutValidation);
}
