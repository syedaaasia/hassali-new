import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { bindProjectWorkspace } from "../workspace-binding";
import { runCodeAutonomousExecution } from "../code-autonomous-orchestrator";
import { issueExecutionGrant, revokeExecutionGrant } from "../secure-execution/execution-grants";
import {
  finalizeCodeLiveExecution,
  recordCodeCommandResult,
  recordCodeOutput,
  recordCodeProgress
} from "../live-execution/code-live-execution";
import {
  appendLiveTaskOutput,
  appendLiveTaskTimeline,
  cancelLiveExecutionTask,
  clearLiveExecutionTasks,
  createLiveExecutionTask,
  finishLiveExecutionTask,
  getLatestLiveExecutionTask,
  getLiveExecutionTask,
  runLiveExecutionTask,
  startLiveExecutionTask
} from "../live-execution/live-execution-manager";
import {
  createTaskLocalCommit,
  inspectGitDeliveryState,
  projectVerifiedDelivery
} from "../live-execution/git-delivery";
import type { ChangeLedger, DeliveryReadiness } from "../verification-recovery/verification-types";

type TestCase = { name: string; run: () => Promise<void> | void };
const tests: TestCase[] = [];
const execFileAsync = promisify(execFile);
function test(name: string, run: TestCase["run"]) { tests.push({ name, run }); }

const owner = "i6-owner";
const projectId = "i6-project";

function newTask(suffix = "one") {
  return createLiveExecutionTask({
    externalUserId: owner,
    objective: `Verify ${suffix}`,
    projectId,
    proposalId: `proposal-${suffix}`,
    workspaceRoot: path.resolve(".hassali", "workspaces", projectId)
  });
}

function delivery(overrides: Partial<DeliveryReadiness> = {}): DeliveryReadiness {
  return {
    changedFiles: ["src/app.ts"],
    gitEligible: true,
    implementationComplete: true,
    manualChecks: [],
    pushAuthorized: false,
    readyForDelivery: true,
    recoveryState: "clean",
    reviewStatus: "passed",
    verificationState: "verified",
    warnings: [],
    ...overrides
  };
}

function ledger(taskId: string, ownership: "hassali" | "pre-existing-user" = "hassali"): ChangeLedger {
  return {
    baselineRepositoryFingerprint: "before",
    entries: [{
      afterFingerprint: "after",
      beforeFingerprint: "before",
      existedBefore: true,
      operation: "modify",
      ownership,
      path: "src/app.ts",
      planned: ownership === "hassali"
    }],
    taskId,
    unexpectedPaths: []
  };
}

test("owned task starts queued with approval evidence", () => {
  clearLiveExecutionTasks();
  const task = newTask();
  assert.equal(task.status, "queued");
  assert.equal(task.timeline[0]?.stage, "approval");
  assert.equal(task.timeline[0]?.status, "complete");
});

test("task ownership blocks cross-user reads", () => {
  clearLiveExecutionTasks();
  const task = newTask();
  assert.equal(getLiveExecutionTask({ externalUserId: "other", projectId, taskId: task.taskId }), null);
});

test("task ownership blocks cross-project reads", () => {
  clearLiveExecutionTasks();
  const task = newTask();
  assert.equal(getLiveExecutionTask({ externalUserId: owner, projectId: "other", taskId: task.taskId }), null);
});

test("timeline sequences remain ordered and deterministic", () => {
  clearLiveExecutionTasks();
  const task = newTask();
  startLiveExecutionTask({ externalUserId: owner, projectId, taskId: task.taskId });
  appendLiveTaskTimeline({ externalUserId: owner, projectId, source: "orchestrator", stage: "inspection", status: "active", taskId: task.taskId, title: "Inspecting" });
  appendLiveTaskTimeline({ externalUserId: owner, projectId, source: "verification", stage: "verification", status: "complete", taskId: task.taskId, title: "Verified" });
  assert.deepEqual(getLiveExecutionTask({ externalUserId: owner, projectId, taskId: task.taskId })?.timeline.map((event) => event.sequence), [1, 2, 3]);
});

test("a new timeline event settles the prior active operation", () => {
  clearLiveExecutionTasks();
  const task = newTask();
  startLiveExecutionTask({ externalUserId: owner, projectId, taskId: task.taskId });
  appendLiveTaskTimeline({ externalUserId: owner, projectId, source: "orchestrator", stage: "inspection", status: "active", taskId: task.taskId, title: "Inspecting" });
  appendLiveTaskTimeline({ externalUserId: owner, projectId, source: "tool", stage: "verification", status: "active", taskId: task.taskId, title: "Testing" });
  const timeline = getLiveExecutionTask({ externalUserId: owner, projectId, taskId: task.taskId })?.timeline ?? [];
  assert.equal(timeline.at(-2)?.status, "complete");
  assert.equal(timeline.at(-1)?.status, "active");
});

test("generic background runner owns lifecycle completion", async () => {
  clearLiveExecutionTasks();
  const task = newTask();
  const result = await runLiveExecutionTask({
    execute: async (signal) => {
      assert.equal(signal.aborted, false);
      return 42;
    },
    externalUserId: owner,
    projectId,
    taskId: task.taskId
  });
  assert.equal(result, 42);
  assert.equal(getLiveExecutionTask({ externalUserId: owner, projectId, taskId: task.taskId })?.status, "completed");
});

test("stdout and stderr are bounded and secret-sanitized", () => {
  clearLiveExecutionTasks();
  const task = newTask();
  startLiveExecutionTask({ externalUserId: owner, projectId, taskId: task.taskId });
  appendLiveTaskOutput({ commandId: "test", externalUserId: owner, projectId, stream: "stderr", taskId: task.taskId, text: "OPENAI_API_KEY=secret-value\nBearer abc.def.ghi" });
  const output = getLiveExecutionTask({ externalUserId: owner, projectId, taskId: task.taskId })?.output[0]?.text ?? "";
  assert(!output.includes("secret-value"));
  assert(!output.includes("abc.def.ghi"));
});

test("completed tasks reject additional output", () => {
  clearLiveExecutionTasks();
  const task = newTask();
  startLiveExecutionTask({ externalUserId: owner, projectId, taskId: task.taskId });
  finishLiveExecutionTask({ externalUserId: owner, projectId, status: "completed", taskId: task.taskId });
  assert.equal(appendLiveTaskOutput({ externalUserId: owner, projectId, stream: "stdout", taskId: task.taskId, text: "late" }), null);
});

test("cancellation aborts only the owned task signal", () => {
  clearLiveExecutionTasks();
  const first = newTask("first");
  const second = newTask("second");
  const firstSignal = startLiveExecutionTask({ externalUserId: owner, projectId, taskId: first.taskId });
  const secondSignal = startLiveExecutionTask({ externalUserId: owner, projectId, taskId: second.taskId });
  assert(cancelLiveExecutionTask({ externalUserId: owner, projectId, taskId: first.taskId }));
  assert.equal(firstSignal?.aborted, true);
  assert.equal(secondSignal?.aborted, false);
});

test("per-project concurrency is bounded", () => {
  clearLiveExecutionTasks();
  newTask("first");
  newTask("second");
  assert.throws(() => newTask("third"), /maximum number of active/i);
});

test("latest task lookup stays project-bound", () => {
  clearLiveExecutionTasks();
  const first = newTask("first");
  finishLiveExecutionTask({ externalUserId: owner, projectId, status: "completed", taskId: first.taskId });
  const second = newTask("second");
  assert.equal(getLatestLiveExecutionTask({ externalUserId: owner, projectId })?.taskId, second.taskId);
});

test("verified delivery projects a truthful ready state", () => {
  const result = projectVerifiedDelivery({ completionStatus: "COMPLETE_VERIFIED", delivery: delivery(), limitations: [] });
  assert.equal(result.status, "verified-ready");
  assert.equal(result.gitEligible, true);
  assert.equal(result.pushAuthorized, false);
});

test("limited delivery retains warnings without claiming verified ready", () => {
  const result = projectVerifiedDelivery({ completionStatus: "COMPLETE_WITH_LIMITATIONS", delivery: delivery({ gitEligible: false }), limitations: ["Browser evidence pending."] });
  assert.equal(result.status, "verified-with-warnings");
  assert.equal(result.gitEligible, false);
  assert.match(result.warnings.join(" "), /Browser evidence pending/);
});

test("blocked and cancelled delivery remain explicit", () => {
  assert.equal(projectVerifiedDelivery({ completionStatus: "BLOCKED", delivery: null, limitations: [] }).status, "blocked");
  assert.equal(projectVerifiedDelivery({ completionStatus: "CANCELLED", delivery: null, limitations: [] }).status, "cancelled");
});

test("source contains live output observer without timers", async () => {
  const broker = await readFile(path.resolve("src/lib/server/runtime/secure-execution/execution-broker.ts"), "utf8");
  const manager = await readFile(path.resolve("src/lib/server/runtime/live-execution/live-execution-manager.ts"), "utf8");
  assert.match(broker, /request\.onOutput/);
  assert(!/setInterval\s*\(/.test(manager));
  assert(!/setTimeout\s*\(/.test(manager));
});

test("task endpoint verifies database ownership and exposes cancel plus local commit", async () => {
  const route = await readFile(path.resolve("src/app/api/runtime/tasks/route.ts"), "utf8");
  assert.match(route, /listUserProjectFiles/);
  assert.match(route, /body\.action === "cancel"/);
  assert.match(route, /createTaskLocalCommit/);
  assert.doesNotMatch(route, /push\s*\(/);
});

test("CODE UI renders a compact expandable timeline", async () => {
  const component = await readFile(path.resolve("src/components/shell/code-execution-timeline.tsx"), "utf8");
  assert.match(component, /Execution timeline/);
  assert.match(component, /Command output/);
  assert.match(component, /Create local commit/);
  assert.match(component, /aria-expanded/);
});

test("dashboard includes the exact non-interactive signature", async () => {
  const shell = await readFile(path.resolve("src/components/shell/app-shell.tsx"), "utf8");
  assert.match(shell, /Build in .*🇵🇰.* for .*🌍/);
  assert.match(shell, /pointer-events-none/);
  assert.match(shell, /data-hassali-signature/);
});

test("runtime task polling cleans up its abort controller and timeout", async () => {
  const component = await readFile(path.resolve("src/components/shell/code-execution-timeline.tsx"), "utf8");
  assert.match(component, /controller\.abort\(\)/);
  assert.match(component, /clearTimeout\(timeout\)/);
});

test("right sidebar exposes timeline only for CODE execution", async () => {
  const sidebar = await readFile(path.resolve("src/components/shell/right-sidebar.tsx"), "utf8");
  assert.match(sidebar, /productMode === "CODE"/);
  assert.match(sidebar, /CodeExecutionTimeline/);
});

test("generic Git helper never offers push", async () => {
  const source = await readFile(path.resolve("src/lib/server/runtime/live-execution/git-delivery.ts"), "utf8");
  assert.match(source, /pushAuthorized: false/);
  assert.match(source, /pushPerformed: false/);
  assert.doesNotMatch(source, /\["push"/);
});

test("real approved fixture flows through execution timeline verification delivery and Git", async () => {
  const fixtureProjectId = `i6-e2e-${Date.now()}`;
  const binding = await bindProjectWorkspace(fixtureProjectId);
  assert(!("error" in binding));
  const root = binding.workspaceRoot;
  const fixtureOwner = "i6-e2e-owner";
  await mkdir(path.join(root, "src"), { recursive: true });
  let grantId: string | null = null;
  try {
    await execFileAsync("git", ["-C", root, "init"]);
    await execFileAsync("git", ["-C", root, "config", "user.email", "i6@hassali.test"]);
    await execFileAsync("git", ["-C", root, "config", "user.name", "Hassali I6"]);
    await writeFile(path.join(root, "package.json"), JSON.stringify({ scripts: { test: "node app.test.js" } }), "utf8");
    await writeFile(path.join(root, "app.test.js"), "console.log('fixture-pass');\n", "utf8");
    await writeFile(path.join(root, "src", "app.ts"), "export const ready = false;\n", "utf8");
    await execFileAsync("git", ["-C", root, "add", "."]);
    await execFileAsync("git", ["-C", root, "commit", "-m", "fixture"]);
    await writeFile(path.join(root, "src", "app.ts"), "export const ready = true;\n", "utf8");
    const task = createLiveExecutionTask({ externalUserId: fixtureOwner, objective: "Verify the approved fixture", projectId: fixtureProjectId, proposalId: "i6-e2e-proposal", workspaceRoot: root });
    grantId = issueExecutionGrant({ approvalPolicy: "ask", approvalSource: "inline_approval", capabilities: ["repository.verify"], externalUserId: fixtureOwner, maxUses: 8, mode: "CODE", projectId: fixtureProjectId, riskCeiling: "medium", scopeKind: "project", scopeRoot: root });
    const report = await runLiveExecutionTask({
      execute: async (signal) => {
        const rawReport = await runCodeAutonomousExecution({
          acceptanceCriteria: ["Focused tests pass."],
          abortSignal: signal,
          approvedPaths: ["src/app.ts"],
          baselineFileContents: { "src/app.ts": "export const ready = false;\n" },
          executionGrantId: grantId!,
          externalUserId: fixtureOwner,
          initiallyModifiedPaths: ["src/app.ts"],
          objective: "Verify the approved fixture",
          onCommandResult: (result, command) => recordCodeCommandResult({ command, externalUserId: fixtureOwner, projectId: fixtureProjectId, result, taskId: task.taskId }),
          onOutput: (chunk) => recordCodeOutput({ ...chunk, externalUserId: fixtureOwner, projectId: fixtureProjectId, taskId: task.taskId }),
          onProgress: (event) => recordCodeProgress({ event, externalUserId: fixtureOwner, projectId: fixtureProjectId, taskId: task.taskId }),
          projectId: fixtureProjectId,
          proposalId: "i6-e2e-proposal",
          selectedModel: "fixture-model",
          taskId: task.taskId,
          workspaceRoot: root
        });
        return finalizeCodeLiveExecution({ externalUserId: fixtureOwner, projectId: fixtureProjectId, report: rawReport, taskId: task.taskId, workspaceRoot: root });
      },
      externalUserId: fixtureOwner,
      projectId: fixtureProjectId,
      taskId: task.taskId
    });
    assert.equal(report.completionStatus, "COMPLETE_VERIFIED");
    assert.equal(report.deliverySummary?.status, "verified-ready");
    assert.equal(report.git?.commitEligible, true);
    assert(report.timeline?.some((event) => event.stage === "inspection"));
    assert(report.timeline?.some((event) => event.stage === "verification"));
    assert(report.timeline?.some((event) => event.stage === "review"));
    assert(report.timeline?.some((event) => event.stage === "delivery"));
    assert(report.timeline?.some((event) => event.stage === "git"));
    assert.match(getLiveExecutionTask({ externalUserId: fixtureOwner, projectId: fixtureProjectId, taskId: task.taskId })?.output.map((chunk) => chunk.text).join(" ") ?? "", /fixture-pass/);
  } finally {
    if (grantId) revokeExecutionGrant(grantId);
    await rm(root, { force: true, recursive: true });
  }
});

test("owned Git inspection and local commit remain task-scoped", async () => {
  const fixtureProjectId = `i6-git-${Date.now()}`;
  const binding = await bindProjectWorkspace(fixtureProjectId);
  assert(!("error" in binding));
  const root = binding.workspaceRoot;
  await mkdir(path.join(root, "src"), { recursive: true });
  try {
    await execFileAsync("git", ["-C", root, "init"]);
    await execFileAsync("git", ["-C", root, "config", "user.email", "i6@hassali.test"]);
    await execFileAsync("git", ["-C", root, "config", "user.name", "Hassali I6"]);
    await writeFile(path.join(root, "src", "app.ts"), "export const value = 1;\n", "utf8");
    await execFileAsync("git", ["-C", root, "add", "src/app.ts"]);
    await execFileAsync("git", ["-C", root, "commit", "-m", "fixture"]);
    await writeFile(path.join(root, "src", "app.ts"), "export const value = 2;\n", "utf8");
    const state = await inspectGitDeliveryState({ changeLedger: ledger("git-task"), delivery: delivery(), workspaceRoot: root });
    assert.equal(state.repositoryAvailable, true);
    assert.equal(state.commitEligible, true, JSON.stringify(state));
    assert.deepEqual(state.taskOwnedPaths, ["src/app.ts"]);
    assert.match(state.diffPreview, /value = 2/);
    await writeFile(path.join(root, "src", "app.ts"), "export const value = 3;\n", "utf8");
    const stale = await createTaskLocalCommit({ authorizationSource: "inline_git_commit", changeLedger: ledger("git-task"), commitMessage: "Stale fixture change", delivery: delivery(), git: state, workspaceRoot: root });
    assert.equal(stale.ok, false);
    assert.match(stale.error, /Git state changed/);
    const refreshed = await inspectGitDeliveryState({ changeLedger: ledger("git-task"), delivery: delivery(), workspaceRoot: root });
    const commit = await createTaskLocalCommit({ authorizationSource: "inline_git_commit", changeLedger: ledger("git-task"), commitMessage: "Verified fixture change", delivery: delivery(), git: refreshed, workspaceRoot: root });
    assert.equal(commit.ok, true);
    assert.equal(commit.pushPerformed, false);
    await writeFile(path.join(root, "src", "app.ts"), "export const API_KEY = 'sk_test_secret_value_12345';\n", "utf8");
    const secretState = await inspectGitDeliveryState({ changeLedger: ledger("secret-task"), delivery: delivery(), workspaceRoot: root });
    assert.equal(secretState.commitEligible, false);
    assert(!secretState.diffPreview.includes("sk_test_secret_value_12345"));
    assert.match(secretState.diffPreview, /\[redacted\]/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("Git inspection separates pre-existing user work", async () => {
  const fixtureProjectId = `i6-user-work-${Date.now()}`;
  const binding = await bindProjectWorkspace(fixtureProjectId);
  assert(!("error" in binding));
  const root = binding.workspaceRoot;
  await mkdir(path.join(root, "src"), { recursive: true });
  try {
    await execFileAsync("git", ["-C", root, "init"]);
    await execFileAsync("git", ["-C", root, "config", "user.email", "i6@hassali.test"]);
    await execFileAsync("git", ["-C", root, "config", "user.name", "Hassali I6"]);
    await writeFile(path.join(root, "src", "app.ts"), "one\n", "utf8");
    await execFileAsync("git", ["-C", root, "add", "src/app.ts"]);
    await execFileAsync("git", ["-C", root, "commit", "-m", "fixture"]);
    await writeFile(path.join(root, "src", "app.ts"), "two\n", "utf8");
    const state = await inspectGitDeliveryState({ changeLedger: ledger("user-task", "pre-existing-user"), delivery: delivery(), workspaceRoot: root });
    assert.equal(state.commitEligible, false);
    assert.deepEqual(state.userOwnedPaths, ["src/app.ts"]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

let passed = 0;
for (const item of tests) {
  try {
    await item.run();
    passed += 1;
    console.log(`PASS ${item.name}`);
  } catch (error) {
    console.error(`FAIL ${item.name}`);
    throw error;
  } finally {
    clearLiveExecutionTasks();
  }
}
console.log(`live execution delivery smoke: ${passed}/${tests.length} passed`);
