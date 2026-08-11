import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildChangeLedger, createTaskCheckpoint, recoverTaskCheckpoint, repositoryEvidenceIsStale } from "../verification-recovery/change-safety";
import {
  buildDeliveryReadiness,
  buildVerificationPlan,
  commandResultsToEvidence,
  decideRepairEligibility,
  evaluateVerificationPlan,
  reviewImplementation,
  successClaim,
  verifyArtifact
} from "../verification-recovery/verification-engine";
import type { VerificationEvidence } from "../verification-recovery/verification-types";

type TestCase = { name: string; run: () => Promise<void> | void };
const tests: TestCase[] = [];
function test(name: string, run: TestCase["run"]) { tests.push({ name, run }); }

function evidence(type: VerificationEvidence["type"], status: VerificationEvidence["status"], criterionIds: string[] = []): VerificationEvidence {
  return { criterionIds, id: `${type}-${status}`, observed: `${type} ${status}`, provenance: "fixture", status, type };
}

test("acceptance criteria map to bounded verification requirements", () => {
  const plan = buildVerificationPlan({ acceptanceCriteria: ["Focused regression tests pass.", "The production build passes.", "The button is visible in the browser."], taskId: "task-map" });
  assert.deepEqual(plan.criteria.map((item) => item.requiredEvidence[0]), ["test", "build", "browser"]);
});

test("a blocking failed criterion fails task verification", () => {
  const plan = buildVerificationPlan({ acceptanceCriteria: ["Focused tests pass."], taskId: "task-fail" });
  const result = evaluateVerificationPlan(plan, [evidence("test", "failed")]);
  assert.equal(result.state, "failed");
  assert.equal(result.blockingFailures.length, 1);
});

test("unavailable browser evidence remains blocked rather than passed", () => {
  const plan = buildVerificationPlan({ acceptanceCriteria: ["Responsive UI is browser verified."], taskId: "task-browser" });
  assert.equal(evaluateVerificationPlan(plan, [evidence("browser", "unavailable")]).state, "blocked");
});

test("missing outcome evidence remains inconclusive", () => {
  const plan = buildVerificationPlan({ acceptanceCriteria: ["The requested behavior is fixed."], taskId: "task-outcome" });
  assert.equal(evaluateVerificationPlan(plan, []).state, "inconclusive");
});

test("exit zero proves its command surface but not unrelated behavior", () => {
  const plan = buildVerificationPlan({ acceptanceCriteria: ["Focused tests pass.", "The user workflow is fixed."], taskId: "task-zero" });
  const result = evaluateVerificationPlan(plan, commandResultsToEvidence({ results: [{ commandId: "test", durationMs: 1, exitCode: 0, failureType: null, outputExcerpt: "ok", signal: null, status: "PASSED" }] }));
  assert.equal(result.results[0]?.status, "passed");
  assert.equal(result.results[1]?.status, "inconclusive");
  assert.equal(result.state, "inconclusive");
});

test("all blocking objective evidence aggregates to verified", () => {
  const plan = buildVerificationPlan({ acceptanceCriteria: ["Typecheck passes.", "Focused tests pass."], taskId: "task-pass" });
  const result = evaluateVerificationPlan(plan, [evidence("typecheck", "passed"), evidence("test", "passed")]);
  assert.equal(result.state, "verified");
});

test("deterministic review detects an unplanned file", () => {
  const review = reviewImplementation({ changes: [{ after: "x", before: null, path: "extra.ts", planned: false }], taskId: "review-unplanned" });
  assert.equal(review.status, "blocked");
  assert(review.issues.some((issue) => issue.code === "unexpected-path"));
});

test("deterministic review detects skip and only", () => {
  const review = reviewImplementation({ changes: [{ after: "test.only('x', () => {})", before: "test('x', () => {})", path: "x.test.ts", planned: true }], taskId: "review-only" });
  assert(review.issues.some((issue) => issue.code === "test-selection-weakened"));
});

test("deterministic review detects assertion removal", () => {
  const review = reviewImplementation({ changes: [{ after: "test('x', () => {})", before: "test('x', () => assert(true))", path: "x.test.ts", planned: true }], taskId: "review-assert" });
  assert(review.issues.some((issue) => issue.code === "assertion-removed"));
});

test("justified test evolution does not trigger assertion-removal signal", () => {
  const review = reviewImplementation({ changes: [{ after: "test('x', () => {})", before: "test('x', () => assert(true))", path: "x.test.ts", planned: true }], taskId: "review-justified", testChangeJustification: "Behavior moved to integration coverage." });
  assert(!review.issues.some((issue) => issue.code === "assertion-removed"));
});

test("new error suppression is reviewable", () => {
  const review = reviewImplementation({ changes: [{ after: "// @ts-ignore\nunsafe()", before: "unsafe()", path: "src/a.ts", planned: true }], taskId: "review-ignore" });
  assert(review.issues.some((issue) => issue.code === "error-suppression-added"));
});

test("security-sensitive changes require matching evidence", () => {
  const review = reviewImplementation({ changes: [{ after: "safe", before: "old", path: "src/execution-policy.ts", planned: true }], taskId: "review-security" });
  assert.equal(review.status, "blocked");
});

test("security-sensitive changes pass deterministic review with regression evidence", () => {
  const review = reviewImplementation({ changes: [{ after: "safe", before: "old", path: "src/execution-policy.ts", planned: true }], securityEvidencePresent: true, taskId: "review-security-pass" });
  assert.equal(review.status, "passed");
});

test("change ledger separates planned Hassali changes and pre-existing user work", () => {
  const ledger = buildChangeLedger({ after: { "a.ts": "new", "user.ts": "user-new" }, baseline: { "a.ts": "old", "user.ts": "user-old" }, baselineRepositoryFingerprint: "base", plannedPaths: ["a.ts"], preExistingDirtyPaths: ["user.ts"], taskId: "ledger" });
  assert.equal(ledger.entries.find((entry) => entry.path === "a.ts")?.ownership, "hassali");
  assert.equal(ledger.entries.find((entry) => entry.path === "user.ts")?.ownership, "pre-existing-user");
});

test("change ledger reports unexpected mutation", () => {
  const ledger = buildChangeLedger({ after: {}, baseline: {}, baselineRepositoryFingerprint: "base", explicitUnexpectedPaths: ["extra.ts"], plannedPaths: [], taskId: "ledger-extra" });
  assert.deepEqual(ledger.unexpectedPaths, ["extra.ts"]);
});

test("task checkpoint rejects secret-bearing paths", async () => {
  const workspace = path.join(os.tmpdir(), `hassali-i5-sensitive-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(workspace, { recursive: true });
  await writeFile(path.join(workspace, ".env"), "SECRET=value", "utf8");
  try {
    await assert.rejects(
      createTaskCheckpoint({ beforeContents: { ".env": "SECRET=old" }, plannedPaths: [".env"], taskId: "sensitive", workspaceRoot: workspace }),
      /sensitive or generated/i
    );
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("task checkpoint recovers Hassali file and preserves unrelated user file", async () => {
  const workspace = path.join(os.tmpdir(), `hassali-i5-work-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(workspace, { recursive: true });
  await writeFile(path.join(workspace, "owned.ts"), "changed", "utf8");
  await writeFile(path.join(workspace, "user.ts"), "user-change", "utf8");
  const checkpoint = await createTaskCheckpoint({ beforeContents: { "owned.ts": "original" }, plannedPaths: ["owned.ts"], taskId: "recover", workspaceRoot: workspace });
  try {
    const recovery = await recoverTaskCheckpoint(checkpoint);
    assert.equal(recovery.state, "recovered");
    assert.equal(await readFile(path.join(workspace, "owned.ts"), "utf8"), "original");
    assert.equal(await readFile(path.join(workspace, "user.ts"), "utf8"), "user-change");
  } finally {
    await checkpoint.cleanup();
    await rm(workspace, { recursive: true, force: true });
  }
});

test("same-file divergence blocks blind recovery", async () => {
  const workspace = path.join(os.tmpdir(), `hassali-i5-conflict-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(workspace, { recursive: true });
  await writeFile(path.join(workspace, "owned.ts"), "hassali-change", "utf8");
  const checkpoint = await createTaskCheckpoint({ beforeContents: { "owned.ts": "original" }, plannedPaths: ["owned.ts"], taskId: "conflict", workspaceRoot: workspace });
  try {
    await writeFile(path.join(workspace, "owned.ts"), "concurrent-user-change", "utf8");
    const recovery = await recoverTaskCheckpoint(checkpoint);
    assert.equal(recovery.state, "conflict");
    assert.equal(await readFile(path.join(workspace, "owned.ts"), "utf8"), "concurrent-user-change");
  } finally {
    await checkpoint.cleanup();
    await rm(workspace, { recursive: true, force: true });
  }
});

test("repair controller permits first and second cycle only with new evidence", () => {
  const first = decideRepairEligibility({ approvedPaths: ["a.ts"], attemptedCycles: 0, currentEvidenceSignature: "failure-a", previousEvidenceSignatures: [], proposedPaths: ["a.ts"], repositoryStale: false, permissionValid: true });
  const second = decideRepairEligibility({ approvedPaths: ["a.ts"], attemptedCycles: 1, currentEvidenceSignature: "failure-b", previousEvidenceSignatures: ["failure-a"], proposedPaths: ["a.ts"], repositoryStale: false, permissionValid: true });
  assert.equal(first.nextAttempt, 1);
  assert.equal(second.nextAttempt, 2);
});

test("third repair cycle is prohibited", () => {
  assert.equal(decideRepairEligibility({ approvedPaths: ["a.ts"], attemptedCycles: 2, currentEvidenceSignature: "c", previousEvidenceSignatures: ["a", "b"], proposedPaths: ["a.ts"], repositoryStale: false, permissionValid: true }).eligible, false);
});

test("repair requires new evidence and current repository", () => {
  assert.match(decideRepairEligibility({ approvedPaths: ["a.ts"], attemptedCycles: 1, currentEvidenceSignature: "same", previousEvidenceSignatures: ["same"], proposedPaths: ["a.ts"], repositoryStale: false, permissionValid: true }).reason, /new failure evidence/i);
  assert.equal(repositoryEvidenceIsStale("one", "two"), true);
});

test("scope expansion requires reapproval", () => {
  const result = decideRepairEligibility({ approvedPaths: ["a.ts"], attemptedCycles: 0, currentEvidenceSignature: "new", previousEvidenceSignatures: [], proposedPaths: ["b.ts"], repositoryStale: false, permissionValid: true });
  assert.equal(result.requiresReapproval, true);
});

test("JSON CSV and ZIP artifacts are structurally validated", () => {
  assert.equal(verifyArtifact({ content: "{\"ok\":true}", kind: "json" }).ok, true);
  assert.equal(verifyArtifact({ content: "id,name\n1,Ada", expectedColumns: ["id", "name"], kind: "csv" }).ok, true);
  const zip = Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    Buffer.from("src/app.ts", "utf8"),
    Buffer.from([0x50, 0x4b, 0x05, 0x06])
  ]);
  assert.equal(verifyArtifact({ content: zip, expectedPaths: ["src/app.ts"], kind: "zip" }).ok, true);
});

test("corrupt artifacts are rejected", () => {
  assert.equal(verifyArtifact({ content: "not-json", kind: "json" }).ok, false);
  assert.equal(verifyArtifact({ content: Buffer.from("not-zip"), kind: "zip" }).ok, false);
});

test("delivery readiness and success language follow evidence", () => {
  const plan = buildVerificationPlan({ acceptanceCriteria: ["Focused tests pass."], taskId: "delivery" });
  const verification = evaluateVerificationPlan(plan, [evidence("test", "passed")]);
  const review = reviewImplementation({ changes: [], taskId: "delivery" });
  const delivery = buildDeliveryReadiness({ changedFiles: [], implementationComplete: true, review, verification });
  assert.equal(delivery.readyForDelivery, true);
  assert.equal(successClaim({ attempted: true, delivery }), "Fixed and verified.");
  assert.equal(delivery.pushAuthorized, false);
});

let failed = 0;
for (const entry of tests) {
  try {
    await entry.run();
    process.stdout.write(`PASS ${entry.name}\n`);
  } catch (error) {
    failed += 1;
    process.stderr.write(`FAIL ${entry.name}\n${error instanceof Error ? error.stack : String(error)}\n`);
  }
}
if (failed) process.exitCode = 1;
else process.stdout.write(`${tests.length}/${tests.length} verification and recovery checks passed.\n`);
