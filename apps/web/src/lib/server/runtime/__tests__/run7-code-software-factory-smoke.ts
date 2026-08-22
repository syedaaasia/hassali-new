import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildAdaptiveCodePlan,
  summarizeAdaptiveCodePlan
} from "../../ai/adaptive-code-planner";
import { validateCodeMutationCandidate } from "../../ai/code-software-factory";
import {
  findNonRepairableCodeFailure,
  selectCodeVerificationCommands
} from "../code-autonomous-orchestrator";
import type { CodeCommandResult, CodeCommandSpec } from "../code-execution-types";
import { evaluateExecutionPolicy } from "../secure-execution/execution-policy";
import type { ExecutionGrant, ExecutionRequest } from "../secure-execution/execution-types";
import { buildChangeLedger } from "../verification-recovery/change-safety";
import {
  buildDeliveryReadiness,
  buildVerificationPlan,
  decideRepairEligibility,
  evaluateVerificationPlan,
  reviewImplementation,
  successClaim,
  verifyArtifact
} from "../verification-recovery/verification-engine";

type TestCase = { name: string; run: () => void };
const tests: TestCase[] = [];
function test(name: string, run: TestCase["run"]) { tests.push({ name, run }); }

function plan(prompt: string, fileCount = 5) {
  return buildAdaptiveCodePlan({
    approvalPolicy: "ask",
    projectContext: {
      fileCount,
      framework: fileCount ? "existing-fixture" : null,
      languageHints: fileCount ? ["TypeScript"] : [],
      packageManager: fileCount ? "pnpm" : null,
      projectSelected: true
    },
    prompt
  });
}

function candidate(prompt: string, changes: Array<{ action: string; path?: string; proposedContent?: string }>, fileCount = 5) {
  return validateCodeMutationCandidate({ changes, plan: summarizeAdaptiveCodePlan(plan(prompt, fileCount)) });
}

const commands: CodeCommandSpec[] = (["typecheck", "test", "build", "lint"] as const).map((kind) => ({
  args: ["fixture"], command: "node", effect: "READ_ONLY", id: kind, kind,
  label: kind, scriptName: kind, timeoutMs: 1_000
}));

test("RUN7-A small existing edit preserves scope and selects focused evidence", () => {
  const request = "Change the API timeout from 10 seconds to 30 seconds. Do not change anything else.";
  const result = plan(request);
  const validation = candidate(request, [{ action: "modify", path: "src/config.ts", proposedContent: "export const timeout = 30;" }]);
  assert.equal(result.projectState.kind, "existing");
  assert.equal(result.complexity, "small");
  assert(result.preserveRequirements.some((item) => /outside the requested target/i.test(item)));
  assert.equal(validation.valid, true);
  assert.deepEqual(selectCodeVerificationCommands(commands, summarizeAdaptiveCodePlan(result).verificationCommands).map((item) => item.kind), ["typecheck", "test", "lint"]);
});

test("RUN7-B bug repair is diagnosis-first and regression-backed", () => {
  const result = plan("Fix duplicate records being returned while preserving original order.");
  assert.equal(result.intent.taskType, "repair");
  assert(result.actions.findIndex((item) => item.kind === "diagnose") < result.actions.findIndex((item) => item.kind === "implement"));
  assert(result.acceptanceCriteria.some((item) => /root-cause repair/i.test(item)));
  assert.equal(result.maxRepairCycles <= 2, true);
});

test("RUN7-C existing feature uses bounded mutation and validates CSV output", () => {
  const result = plan("Add CSV export to this existing records table.");
  assert.equal(result.projectState.kind, "existing");
  assert.equal(candidate(result.intent.goal, [
    { action: "modify", path: "src/records.ts", proposedContent: "export const toCsv = () => 'id,name';" },
    { action: "create", path: "src/records.test.ts", proposedContent: "export {};" }
  ]).valid, true);
  assert.equal(verifyArtifact({ content: "id,name\n1,Ali\n", expectedColumns: ["id", "name"], kind: "csv" }).ok, true);
});

test("RUN7-D greenfield Python CLI stays minimal and technology-aware", () => {
  const result = plan("Create a small Python CLI that reads a CSV and removes duplicate email addresses while preserving order.", 0);
  assert.equal(result.projectState.kind, "greenfield");
  assert.deepEqual(result.projectState.requestedTechnologies, ["Python"]);
  assert(result.preserveRequirements.some((item) => /unnecessary framework/i.test(item)));
  assert(result.mutationBudget.maxFiles <= 18);
});

test("RUN7-E self-repair permits two evidence-changing cycles only", () => {
  const first = decideRepairEligibility({ approvedPaths: ["src/app.ts"], attemptedCycles: 0, currentEvidenceSignature: "one", permissionValid: true, previousEvidenceSignatures: [], proposedPaths: ["src/app.ts"], repositoryStale: false });
  const third = decideRepairEligibility({ approvedPaths: ["src/app.ts"], attemptedCycles: 2, currentEvidenceSignature: "three", permissionValid: true, previousEvidenceSignatures: ["one", "two"], proposedPaths: ["src/app.ts"], repositoryStale: false });
  assert.equal(first.eligible, true);
  assert.equal(third.eligible, false);
});

test("RUN7-F environment failure is non-repairable and cannot become verified", () => {
  const failure: CodeCommandResult = { commandId: "test", durationMs: 1, exitCode: null, failureType: "ENVIRONMENT_ERROR", outputExcerpt: "toolchain unavailable", signal: null, status: "FAILED" };
  assert.equal(findNonRepairableCodeFailure([failure])?.failureType, "ENVIRONMENT_ERROR");
});

test("RUN7-G public API preservation is a hard acceptance constraint", () => {
  const result = plan("Fix the calculation but do not change the public API.");
  assert(result.preserveRequirements.some((item) => /current API contract/i.test(item)));
  assert(result.acceptanceCriteria.some((item) => /current API contract/i.test(item)));
});

test("RUN7-H dependency discipline blocks manifest drift", () => {
  const request = "Add CSV export without new dependencies.";
  const result = candidate(request, [{ action: "modify", path: "apps/web/package.json", proposedContent: "{}" }]);
  assert.equal(result.valid, false);
  assert(result.issues.some((item) => item.code === "DEPENDENCY_CONTRACT_DRIFT"));
});

test("RUN7-I dirty user work remains separately owned", () => {
  const ledger = buildChangeLedger({
    after: { "notes.txt": "user draft", "src/config.ts": "timeout=30" },
    baseline: { "notes.txt": "user draft", "src/config.ts": "timeout=10" },
    baselineRepositoryFingerprint: "fixture", plannedPaths: ["src/config.ts"],
    preExistingDirtyPaths: ["notes.txt"], taskId: "run7-i"
  });
  assert.equal(ledger.entries.find((item) => item.path === "notes.txt")?.ownership, "pre-existing-user");
  assert.equal(ledger.entries.find((item) => item.path === "src/config.ts")?.ownership, "hassali");
});

test("RUN7-J destructive commands remain hard denied", () => {
  const now = Date.now();
  const grant: ExecutionGrant = { approvalPolicy: "full_project_access", approvalSource: "standing_policy", capabilities: ["repository.verify"], expiresAt: now + 1_000, externalUserId: "user", id: "grant", issuedAt: now, maxUses: 1, mode: "CODE", projectId: "project", riskCeiling: "medium", scopeKind: "project", scopeRoot: "C:/fixture", uses: 0 };
  const request: ExecutionRequest = { actor: { externalUserId: "user", projectId: "project" }, capability: "repository.verify", command: { args: ["reset", "--hard"], executable: "git", provenance: { evidence: "fixture", source: "repository-inspector" } }, cwd: "C:/fixture", grantId: "grant", id: "request", mode: "CODE", mutation: "project", network: "none", risk: "high", scope: { allowedInputs: [], allowedOutputs: [], kind: "project", root: "C:/fixture" }, timeoutMs: 1_000 };
  const decision = evaluateExecutionPolicy(request, grant);
  assert(decision);
  assert.equal(decision.code, "hard-deny");
});

test("RUN7-K secret and traversal paths fail before approval", () => {
  for (const path of [".env", "../outside.ts", "secrets/private.pem", "node_modules/x.js"]) {
    const result = candidate("Fix the parser.", [{ action: "modify", path, proposedContent: "changed" }]);
    assert(result.issues.some((item) => item.code === "UNSAFE_PATH"), path);
  }
  assert.equal(candidate("Add documented local configuration.", [{ action: "create", path: ".env.example", proposedContent: "API_URL=" }]).valid, true);
});

test("RUN7-L CODE planning remains mode-isolated", () => {
  const source = readFileSync("src/app/api/ai/chat/route.ts", "utf8");
  assert.match(source, /const adaptiveCodePlan = productMode === "CODE"/);
  assert.match(source, /proposalContext\?\.mode === "CODE"[\s\S]{0,180}validateCodeMutationCandidate/);
});

test("RUN7-M artifacts require structural inspection, not exit zero", () => {
  assert.equal(verifyArtifact({ content: '{"ok":true}', kind: "json" }).ok, true);
  assert.equal(verifyArtifact({ content: "not-json", kind: "json" }).ok, false);
  assert.equal(verifyArtifact({ content: "id,email\n1,a@example.com", expectedColumns: ["id", "email"], kind: "csv" }).ok, true);
});

test("RUN7-N failed verification cannot produce a success claim", () => {
  const verificationPlan = buildVerificationPlan({ acceptanceCriteria: ["Focused regression tests pass."], taskId: "run7-n" });
  const verification = evaluateVerificationPlan(verificationPlan, [{ criterionIds: [], id: "failed-test", observed: "test failed", provenance: "fixture", status: "failed", type: "test" }]);
  const review = reviewImplementation({ changes: [{ after: "fixed", before: "broken", path: "src/app.ts", planned: true }], taskId: "run7-n" });
  const delivery = buildDeliveryReadiness({ changedFiles: ["src/app.ts"], implementationComplete: true, review, verification });
  assert.equal(delivery.readyForDelivery, false);
  assert.doesNotMatch(successClaim({ attempted: true, delivery }), /Fixed and verified/);
});

test("RUN7-O coding explanation remains non-mutating ASK-compatible work", () => {
  const result = plan("Explain what this Python function does.");
  assert.equal(result.intent.taskType, "explain");
  assert.equal(result.intent.requiresMutation, false);
  assert.equal(result.actions.every((item) => !item.mutates), true);
});

let passed = 0;
for (const candidate of tests) {
  try { candidate.run(); passed += 1; console.log(`PASS ${candidate.name}`); }
  catch (error) { console.error(`FAIL ${candidate.name}`); throw error; }
}
console.log(`Run 7 CODE software factory smoke: ${passed}/${tests.length} PASS`);
