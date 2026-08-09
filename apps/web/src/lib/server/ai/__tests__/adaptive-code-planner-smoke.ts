import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildAdaptiveCodePlan,
  validateAdaptiveCodePlan,
  type AdaptiveCodePlan,
  type BuildAdaptiveCodePlanInput
} from "../adaptive-code-planner";
import { canApplyWithProjectApprovalPolicy } from "../../../approval-policy";

type TestCase = { name: string; run: () => void };
const tests: TestCase[] = [];

function test(name: string, run: () => void) {
  tests.push({ name, run });
}

function plan(
  prompt: string,
  approvalPolicy: BuildAdaptiveCodePlanInput["approvalPolicy"] = "ask",
  projectContext: BuildAdaptiveCodePlanInput["projectContext"] = { projectSelected: true }
) {
  return buildAdaptiveCodePlan({ approvalPolicy, projectContext, prompt });
}

function withoutValidation(value: AdaptiveCodePlan): Omit<AdaptiveCodePlan, "validation"> {
  const base: Partial<AdaptiveCodePlan> = { ...value };
  delete base.validation;
  return base as Omit<AdaptiveCodePlan, "validation">;
}

const cleanProposal = {
  approvalDecision: { approvalAllowed: true, hasCriticalIssues: false, hasWarnings: false },
  changes: [{ action: "modify" }],
  status: "pending"
};

test("PLAN-01 tiny label change gets proportional depth", () => {
  const result = plan("Change Save to Continue.");
  assert.equal(result.complexity, "tiny");
  assert.equal(result.intent.taskType, "modify");
  assert.equal(result.actions.length, 3);
  assert.equal(result.verificationPlan.build, false);
});

test("PLAN-02 medium feature includes implementation and verification", () => {
  const result = plan("Add project export.");
  assert.equal(result.complexity, "medium");
  assert.equal(result.intent.taskType, "add-feature");
  assert(result.actions.some((action) => action.kind === "implement"));
  assert(result.actions.some((action) => action.kind === "verify"));
  assert(result.acceptanceCriteria.length > 0);
});

test("PLAN-03 destructive production target blocks for clarification", () => {
  const result = plan("Delete the old production database.", "full_project_access");
  assert.equal(result.status, "blocked");
  assert.equal(result.risk, "CRITICAL");
  assert(result.ambiguities.some((ambiguity) => ambiguity.blocking));
  assert.equal(result.reversibility, "irreversible");
});

test("PLAN-04 existing button convention is a non-blocking default", () => {
  const result = plan("Add an icon to this existing button.");
  assert.equal(result.ambiguities.some((ambiguity) => ambiguity.blocking), false);
  assert.match(result.ambiguities[0]?.safeDefault ?? "", /existing|nearest/i);
});

test("PLAN-05 explicit auth preservation remains hard", () => {
  const result = plan("Fix this without changing auth.");
  assert(result.constraints.some((constraint) => constraint.strength === "hard" && /authentication/i.test(constraint.value)));
  assert(result.acceptanceCriteria.some((criterion) => /Hard constraint preserved/i.test(criterion)));
});

test("PLAN-06 contradictory persistence requirements block", () => {
  const result = plan("Persist this permanently and do not use any storage.");
  assert.equal(result.status, "blocked");
  assert(result.constraintConflicts.some((conflict) => conflict.severity === "blocking"));
});

test("PLAN-07 explanation is read-only with no artificial execution checks", () => {
  const result = plan("Explain this function.");
  assert.equal(result.intent.taskType, "explain");
  assert.equal(result.intent.requiresMutation, false);
  assert.equal(result.actions.every((action) => !action.mutates), true);
  assert.equal(Object.values(result.verificationPlan).every((required) => !required), true);
});

test("PLAN-08 security review remains valid and read-only", () => {
  const result = plan("Review this code for security.", "full_project_access");
  assert.equal(result.intent.taskType, "review");
  assert.equal(result.intent.requiresMutation, false);
  assert.equal(result.validation.valid, true);
  assert.equal(result.approvalRequirements.explicitApprovalRequired, false);
});

test("PLAN-09 bug repair is evidence-first and hypotheses stay unverified", () => {
  const result = plan("Settings keeps failing.");
  assert.equal(result.intent.taskType, "repair");
  assert(result.actions.some((action) => action.id === "diagnose-root-cause"));
  assert.equal(result.hypotheses[0]?.status, "unverified");
  assert.match(result.actions[0]?.objective ?? "", /Inspect/i);
});

test("PLAN-10 database migration raises risk and migration verification", () => {
  const result = plan("Add an additive schema migration for account settings.");
  assert.equal(result.risk, "HIGH");
  assert.equal(result.verificationPlan.migrationCheck, true);
  assert.equal(result.approvalRequirements.explicitApprovalRequired, true);
});

test("broad refactors and destructive file work receive elevated boundaries", () => {
  const refactor = plan("Refactor the repository architecture.", "full_project_access");
  const deletion = plan("Remove the obsolete workspace directory.", "full_project_access");
  assert.equal(refactor.risk, "HIGH");
  assert.equal(refactor.reversibility, "partially-reversible");
  assert.equal(refactor.approvalRequirements.explicitApprovalRequired, true);
  assert.equal(deletion.risk, "HIGH");
  assert.equal(deletion.approvalRequirements.explicitApprovalRequired, true);
});

test("APPROVAL-01 Ask requires explicit approval for mutation", () => {
  assert.equal(plan("Change this label.", "ask").approvalRequirements.explicitApprovalRequired, true);
});

test("APPROVAL-02 Approve for me allows ordinary safe standing policy", () => {
  const result = plan("Change this label.", "approve_for_me");
  assert.equal(result.approvalRequirements.explicitApprovalRequired, false);
  assert.equal(result.approvalRequirements.standingPolicyEligible, true);
});

test("APPROVAL-03 Git push stays explicit under full project access", () => {
  const result = plan("Commit and push this repair.", "full_project_access");
  assert.equal(result.deliveryRequirements.commitRequested, true);
  assert.equal(result.deliveryRequirements.pushRequested, true);
  assert.equal(result.approvalRequirements.explicitApprovalRequired, true);
  assert.equal(result.approvalRequirements.gitPushPermissionRequired, true);
});

test("APPROVAL-04 destructive action exceeds full project access", () => {
  const result = plan("Delete the old production database.", "full_project_access");
  assert.equal(result.approvalRequirements.explicitApprovalRequired, true);
  assert.equal(result.status, "blocked");
});

test("runtime-only work retains the current approval-policy boundary", () => {
  assert.equal(plan("Run the tests.", "ask").approvalRequirements.explicitApprovalRequired, true);
  assert.equal(plan("Run the tests.", "approve_for_me").approvalRequirements.explicitApprovalRequired, true);
  assert.equal(plan("Run the tests.", "full_project_access").approvalRequirements.explicitApprovalRequired, false);
});

test("elevated adaptive approval disables standing auto-apply", () => {
  assert.equal(canApplyWithProjectApprovalPolicy("full_project_access", {
    ...cleanProposal,
    adaptiveApprovalRequired: true
  }), false);
  assert.equal(canApplyWithProjectApprovalPolicy("approve_for_me", cleanProposal), true);
});

test("SMART-01 repair paraphrases classify compatibly", () => {
  for (const prompt of ["fix this login issue", "repair authentication failure", "sign-in stopped working"]) {
    assert.equal(plan(prompt).intent.taskType, "repair", prompt);
  }
});

test("SMART-02 responsive request preserves desktop constraint", () => {
  const result = plan("Make this responsive but don't change desktop.");
  assert(result.constraints.some((constraint) => /desktop/i.test(constraint.value)));
  assert.equal(result.verificationPlan.browserCheck, true);
});

test("SMART-03 existing settings button is inspected without needless clarification", () => {
  const result = plan("Make it like the existing settings button.");
  assert.equal(result.ambiguities.some((ambiguity) => ambiguity.blocking), false);
  assert.match(result.repositoryInspection.symbolQuestions.join(" "), /existing|own/i);
});

test("SMART-04 reload failure includes persistence and hydration inspection", () => {
  const result = plan("This opens again after reload.");
  assert.match(result.actions[0]?.objective ?? "", /persisted state owner|hydration/i);
});

test("VALIDATE-01 mutation plan requires acceptance criteria", () => {
  const base = withoutValidation(plan("Change this label."));
  assert(validateAdaptiveCodePlan({ ...base, acceptanceCriteria: [] }).errors.some((error) => /acceptance/i.test(error)));
});

test("VALIDATE-02 mutation plan requires verification", () => {
  const base = withoutValidation(plan("Add project export."));
  const verificationPlan = Object.fromEntries(Object.keys(base.verificationPlan).map((key) => [key, false])) as AdaptiveCodePlan["verificationPlan"];
  assert(validateAdaptiveCodePlan({ ...base, verificationPlan }).errors.some((error) => /verification/i.test(error)));
});

test("VALIDATE-03 dependency cycles are rejected", () => {
  const base = withoutValidation(plan("Add project export."));
  const actions = base.actions.map((action, index) => ({
    ...action,
    dependsOn: [base.actions[(index + 1) % base.actions.length]!.id]
  }));
  assert(validateAdaptiveCodePlan({ ...base, actions }).errors.some((error) => /cycle/i.test(error)));
});

test("VALIDATE-04 high-risk mutation has approval boundary", () => {
  const result = plan("Change the authentication session flow.", "full_project_access");
  assert.equal(result.risk, "HIGH");
  assert.equal(result.approvalRequirements.explicitApprovalRequired, true);
  assert.equal(result.validation.valid, true);
});

test("VALIDATE-05 pure explanation stays valid without execution verification", () => {
  assert.equal(plan("Explain this function.").validation.valid, true);
});

test("DELIVERY-01 ZIP is requested without claiming it exists", () => {
  const result = plan("Add project export and include a ZIP in delivery.");
  assert.equal(result.deliveryRequirements.zipRequested, true);
  assert.equal(result.status === "ready" || result.status === "requires-approval", true);
});

test("DELIVERY-02 commit and push are separate", () => {
  const result = plan("Commit the change but do not push.");
  assert.equal(result.deliveryRequirements.commitRequested, true);
  assert.equal(result.deliveryRequirements.pushRequested, false);
});

test("DELIVERY-03 deployment carries runtime and manual verification", () => {
  const result = plan("Deploy this service to staging.");
  assert.equal(result.deliveryRequirements.deploymentRequested, true);
  assert.equal(result.verificationPlan.runtimeCheck, true);
  assert.equal(result.verificationPlan.manualReview, true);
});

test("CODE-RESEARCH-01 repository-owned question avoids public research", () => {
  assert.equal(plan("Explain how this project stores settings.").research.required, false);
});

test("CODE-RESEARCH-02 current external API behavior marks technical freshness", () => {
  const result = plan("Verify the current official API behavior before updating this integration.");
  assert.equal(result.research.required, true);
  assert.match(result.research.publicQuery ?? "", /official current technical documentation/i);
});

test("CODE-RESEARCH-03 public query excludes private paths and source", () => {
  const result = plan("Check current API behavior for C:\\private\\customer\\secret.ts and token ABC123.");
  assert.equal(result.research.required, true);
  assert.doesNotMatch(result.research.publicQuery ?? "", /private|customer|secret|ABC123/i);
  assert.doesNotMatch(result.taskId, /private|customer|secret|ABC123/i);
});

test("planner keeps repair budget bounded and repository text untrusted", () => {
  const result = plan("Repair the failing settings panel.");
  assert(result.maxRepairCycles >= 1 && result.maxRepairCycles <= 2);
  assert.match(result.repositoryInspection.untrustedContentPolicy, /cannot override/i);
});

test("chat route builds adaptive plan before the execution-plan bridge", () => {
  const source = readFileSync("apps/web/src/app/api/ai/chat/route.ts", "utf8");
  const adaptiveIndex = source.indexOf("const adaptiveCodePlan = productMode === \"CODE\"");
  const executionIndex = source.indexOf("const executionPlan = buildExecutionPlan({", adaptiveIndex);
  assert(adaptiveIndex > 0);
  assert(executionIndex > adaptiveIndex);
  assert.match(source.slice(adaptiveIndex, executionIndex + 120), /adaptiveCodePlan/);
  assert.match(source, /adaptivePlanBlocked[\s\S]*shouldBlockExecution/);
});

test("CODE proposal UI renders a concise adaptive plan", () => {
  const source = readFileSync("apps/web/src/components/shell/right-sidebar.tsx", "utf8");
  assert.match(source, /data-adaptive-code-plan/);
  assert.match(source, /planSteps\.slice\(0, 4\)/);
});

let passed = 0;
for (const candidate of tests) {
  try {
    candidate.run();
    passed += 1;
  } catch (error) {
    console.error(`FAIL ${candidate.name}`);
    throw error;
  }
}

console.log(`adaptive-code-planner-smoke: ${passed}/${tests.length} passed`);
