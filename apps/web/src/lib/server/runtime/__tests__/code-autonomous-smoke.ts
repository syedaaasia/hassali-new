import assert from "node:assert/strict";
import { mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  applyCodeRepairAttempt
} from "../code-attempt-snapshot";
import {
  findNonRepairableCodeFailure,
  runCodeAutonomousExecution as runBrokeredCodeAutonomousExecution
} from "../code-autonomous-orchestrator";
import { issueExecutionGrant, revokeExecutionGrant } from "../secure-execution/execution-grants";
import {
  createCodeExecutionEnvironment,
  ownedCodeCommandProcessCount
} from "../code-command-executor";
import {
  clearCodeExecutionRegistry,
  codeExecutionKey,
  runCodeExecutionOnce
} from "../code-execution-registry";
import {
  clearCodeRepositoryInspectionCache,
  inspectCodeRepository,
  isSafeCodePackageScript,
  resolveSafeProjectScriptInvocation
} from "../code-repository-inspector";
import {
  repairBudgetForPolicy,
  type CodeRepairProvider
} from "../code-execution-types";
import {
  captureOwnedProjectWorkspaceSnapshot,
  restoreOwnedProjectWorkspaceSnapshot,
  synchronizeOwnedProjectWorkspace
} from "../owned-workspace-hydration";
import { runApprovedFilePlan } from "../approved-file-runner";
import { buildBackendRuntimeEngine } from "../backend-runtime-engine";
import {
  startBackendRuntime,
  stopBackendRuntime
} from "../backend-runtime-manager";
import {
  beginServerProposalApproval,
  clearServerProposalRegistry,
  completeServerProposalApproval,
  registerServerProposal
} from "../server-proposal-registry";
import { resolveWorkspaceBaseRoot } from "../workspace-binding";
import type { ApprovedExecutionPlan } from "../runtime-types";

type TestCase = { name: string; run: () => Promise<void> | void };
const tests: TestCase[] = [];

function test(name: string, run: TestCase["run"]) {
  tests.push({ name, run });
}

async function runCodeAutonomousExecution(
  input: Omit<Parameters<typeof runBrokeredCodeAutonomousExecution>[0], "executionGrantId" | "externalUserId">
) {
  const externalUserId = "code-autonomous-smoke-user";
  const executionGrantId = issueExecutionGrant({
    approvalPolicy: "ask",
    approvalSource: "inline_approval",
    capabilities: ["repository.verify"],
    externalUserId,
    maxUses: 32,
    mode: "CODE",
    projectId: input.projectId,
    riskCeiling: "medium",
    scopeKind: "project",
    scopeRoot: input.workspaceRoot
  });
  try {
    return await runBrokeredCodeAutonomousExecution({ ...input, executionGrantId, externalUserId });
  } finally {
    revokeExecutionGrant(executionGrantId);
  }
}

async function fixture(name: string) {
  const root = path.join(await resolveWorkspaceBaseRoot(), `code-i1-${name}-${Date.now()}`);
  await mkdir(root, { recursive: true });
  return root;
}

async function writeFiles(root: string, files: Record<string, string>) {
  for (const [relativePath, content] of Object.entries(files)) {
    const target = path.resolve(root, relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content, "utf8");
  }
}

async function readFixtureFiles(root: string, paths: string[]) {
  return Object.fromEntries(await Promise.all(paths.map(async (relativePath) => [
    relativePath,
    await readFile(path.join(root, relativePath), "utf8")
  ])));
}

function deterministicProvider(
  changes: Array<{ content: string; path: string }>
): CodeRepairProvider {
  return {
    async proposeRepair() {
      return {
        failureCategory: null,
        ok: true,
        plan: {
          changes,
          evidenceToRerun: ["failing command"],
          expectedEffect: "The failing command passes.",
          hypothesis: "The approved source contains the observed fixture defect.",
          repairTarget: changes.map((change) => change.path).join(", "),
          risk: "low"
        },
        provider: "fixture",
        resolvedModel: "fixture/model"
      };
    }
  };
}

function failedProvider(): CodeRepairProvider {
  return {
    async proposeRepair() {
      return {
        failureCategory: "EXTERNAL_SERVICE_ERROR",
        message: "Fixture provider is unavailable.",
        ok: false,
        provider: "fixture",
        resolvedModel: "fixture/model"
      };
    }
  };
}

async function approvedWrite(input: {
  files: Record<string, string>;
  projectId: string;
  proposalId: string;
  root: string;
}) {
  const plan: ApprovedExecutionPlan = {
    approvedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    id: input.proposalId,
    mode: "CODE",
    projectId: input.projectId,
    steps: Object.entries(input.files).map(([relativePath, content], index) => ({
      approved: true,
      content,
      id: `step-${index}`,
      path: relativePath,
      summary: `Write ${relativePath}`,
      tool: "write_file" as const
    })),
    summary: "Approved fixture",
    workspaceRoot: input.root
  };
  return runApprovedFilePlan({
    approvedPlan: plan,
    projectId: input.projectId,
    workspaceRoot: input.root
  });
}

const packageJson = (scripts: Record<string, string>) => JSON.stringify({
  name: "code-i1-fixture",
  private: true,
  scripts
}, null, 2);

const tsconfig = JSON.stringify({
  compilerOptions: {
    module: "NodeNext",
    moduleResolution: "NodeNext",
    noEmit: true,
    strict: true,
    target: "ES2022"
  },
  include: ["src/**/*.ts"]
}, null, 2);

test("repository inspection discovers safe scripts and rejects unsafe command chains", async () => {
  const root = await fixture("inspection");
  try {
    await writeFiles(root, {
      "package.json": packageJson({
        build: "tsc -p tsconfig.json",
        test: "node app.test.js",
        typecheck: "tsc --noEmit",
        unsafe: "npm install && vite build"
      }),
      "src/main.ts": "export const ready = true;",
      "tsconfig.json": tsconfig,
      "vite.config.ts": "export default {};"
    });
    const result = await inspectCodeRepository(root);
    assert.equal(result.framework, "react_vite");
    assert.deepEqual(result.commands.map((command) => command.kind), ["typecheck", "test", "build"]);
    assert.equal(isSafeCodePackageScript("npm install && vite build", "build"), false);
    assert.equal(isSafeCodePackageScript("vite build", "build"), true);
    assert.equal(isSafeCodePackageScript("node ../outside.test.js", "test"), false);
    assert.equal(resolveSafeProjectScriptInvocation(root, "node ../outside.test.js"), null);
  } finally {
    clearCodeRepositoryInspectionCache(root);
    await rm(root, { recursive: true, force: true });
  }
});

test("owned workspace hydration removes stale source and restores database content", async () => {
  const root = await fixture("hydrate");
  try {
    await writeFiles(root, {
      "node_modules/kept.txt": "dependency tree",
      "src/app.ts": "stale local content",
      "src/stale.ts": "stale file"
    });
    const result = await synchronizeOwnedProjectWorkspace({
      files: [{ content: "canonical content", path: "src/app.ts" }],
      workspaceRoot: root
    });
    assert.equal(await readFile(path.join(root, "src/app.ts"), "utf8"), "canonical content");
    await assert.rejects(readFile(path.join(root, "src/stale.ts"), "utf8"));
    assert.equal(await readFile(path.join(root, "node_modules/kept.txt"), "utf8"), "dependency tree");
    assert.deepEqual(result.removed, ["src/stale.ts"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("workspace snapshot restores Hassali metadata and recovers from a new symlink", async () => {
  const root = await fixture("snapshot-symlink");
  try {
    await writeFiles(root, {
      ".hassali/events.jsonl": "trusted-event\n",
      "src/app.ts": "export const ready = true;\n"
    });
    const snapshot = await captureOwnedProjectWorkspaceSnapshot(root);
    await writeFile(path.join(root, ".hassali/events.jsonl"), "forged-event\n", "utf8");
    await symlink(root, path.join(root, "src/link"), "junction");
    const result = await restoreOwnedProjectWorkspaceSnapshot(snapshot);
    assert.equal(result.recoveredByReset, true);
    assert.equal(await readFile(path.join(root, ".hassali/events.jsonl"), "utf8"), "trusted-event\n");
    await assert.rejects(readFile(path.join(root, "src/link"), "utf8"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("workspace snapshot uses bounded reset recovery after a file flood", async () => {
  const root = await fixture("snapshot-overflow");
  try {
    await writeFiles(root, {
      ".hassali/events.jsonl": "trusted-event\n",
      "src/app.ts": "export const ready = true;\n"
    });
    const snapshot = await captureOwnedProjectWorkspaceSnapshot(root);
    const floodRoot = path.join(root, "flood");
    await mkdir(floodRoot, { recursive: true });
    for (let index = 0; index <= 2_000; index += 1) {
      await writeFile(path.join(floodRoot, `${index}.txt`), "x", "utf8");
    }
    const result = await restoreOwnedProjectWorkspaceSnapshot(snapshot);
    assert.equal(result.recoveredByReset, true);
    assert(result.restored.includes("<workspace-file-limit-exceeded>"));
    assert.equal(await readFile(path.join(root, "src/app.ts"), "utf8"), "export const ready = true;\n");
    await assert.rejects(readFile(path.join(floodRoot, "0.txt"), "utf8"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("existing repository dependencies and scoped feature conventions are reused", async () => {
  const root = await fixture("existing-feature");
  const projectId = path.basename(root);
  try {
    const files = {
      "package.json": JSON.stringify({
        dependencies: { zod: "^3.24.1" },
        name: "existing-signup",
        private: true,
        scripts: { test: "node signup.test.js" },
        type: "module"
      }, null, 2),
      "signup.js": [
        "export function validateSignup(input) {",
        "  return typeof input.email === 'string' && input.email.includes('@') && input.password.length >= 8;",
        "}"
      ].join("\n"),
      "signup.test.js": [
        "import assert from 'node:assert/strict';",
        "import { validateSignup } from './signup.js';",
        "assert.equal(validateSignup({ email: 'user@example.com', password: 'password' }), true);",
        "assert.equal(validateSignup({ email: 'bad', password: 'short' }), false);"
      ].join("\n")
    };
    await approvedWrite({ files, projectId, proposalId: "proposal-existing-feature", root });
    const repository = await inspectCodeRepository(root);
    assert.ok(repository.dependencies.includes("zod"));
    const report = await runCodeAutonomousExecution({
      approvedPaths: Object.keys(files),
      executionPolicy: "FLOW",
      objective: "Add signup validation using the repository's existing validation dependency.",
      projectId,
      proposalId: "proposal-existing-feature",
      repairProvider: {
        async proposeRepair() {
          throw new Error("A passing scoped feature must not request repair.");
        }
      },
      selectedModel: "fixture/model",
      workspaceRoot: root
    });
    assert.equal(report.completionStatus, "COMPLETE_VERIFIED");
    assert.equal(report.metrics.repairAttempts, 0);
    assert.equal(report.commandResults.length, 1);
  } finally {
    clearCodeRepositoryInspectionCache(root);
    await rm(root, { recursive: true, force: true });
  }
});

test("clean simple approved edit stays cheap and deterministic", async () => {
  const root = await fixture("simple-edit");
  const projectId = path.basename(root);
  try {
    const files = {
      "app.js": "export const label = 'Update';\n",
      "app.test.js": "import assert from 'node:assert/strict'; import { label } from './app.js'; assert.equal(label, 'Update');",
      "package.json": JSON.stringify({
        name: "simple-edit",
        private: true,
        scripts: { test: "node app.test.js" },
        type: "module"
      }, null, 2)
    };
    await approvedWrite({ files, projectId, proposalId: "proposal-simple-edit", root });
    const report = await runCodeAutonomousExecution({
      approvedPaths: Object.keys(files),
      executionPolicy: "CALM",
      objective: "Rename the label from Save to Update.",
      projectId,
      proposalId: "proposal-simple-edit",
      repairProvider: {
        async proposeRepair() {
          throw new Error("A passing simple edit must not request repair.");
        }
      },
      selectedModel: "fixture/model",
      workspaceRoot: root
    });
    assert.equal(report.completionStatus, "COMPLETE_VERIFIED");
    assert.equal(report.metrics.commandsExecuted, 1);
    assert.equal(report.metrics.repairAttempts, 0);
  } finally {
    clearCodeRepositoryInspectionCache(root);
    await rm(root, { recursive: true, force: true });
  }
});

test("real approved TypeScript failure is repaired and reverified", async () => {
  const root = await fixture("type-repair");
  const projectId = path.basename(root);
  try {
    const files = {
      "package.json": packageJson({ typecheck: "tsc --noEmit" }),
      "src/app.ts": "export const total: number = \"wrong\";\n",
      "tsconfig.json": tsconfig
    };
    const applied = await approvedWrite({
      files,
      projectId,
      proposalId: "proposal-type",
      root
    });
    assert.equal(applied.runnerStatus, "completed");
    const report = await runCodeAutonomousExecution({
      approvedPaths: Object.keys(files),
      executionPolicy: "FLOW",
      objective: "Create a typed total.",
      projectId,
      proposalId: "proposal-type",
      repairProvider: deterministicProvider([
        { content: "export const total: number = 42;\n", path: "src/app.ts" }
      ]),
      selectedModel: "fixture/model",
      workspaceRoot: root
    });
    assert.equal(report.commandResults[0]?.status, "PASSED");
    assert.equal(report.repairAttempts[0]?.failureBefore.failureType, "TYPE_ERROR");
    assert.equal(report.metrics.successfulAttempt, 1);
    assert.equal(report.completionStatus, "COMPLETE_VERIFIED");
  } finally {
    clearCodeRepositoryInspectionCache(root);
    await rm(root, { recursive: true, force: true });
  }
});

test("real test failure repairs the correct approved target", async () => {
  const root = await fixture("test-repair");
  const projectId = path.basename(root);
  try {
    const files = {
      "app.test.js": "import assert from 'node:assert/strict'; import { add } from './calculator.js'; assert.equal(add(2, 3), 5);",
      "calculator.js": "export const add = (a, b) => a - b;\n",
      "package.json": packageJson({ test: "node app.test.js" })
    };
    await approvedWrite({ files, projectId, proposalId: "proposal-test", root });
    const report = await runCodeAutonomousExecution({
      approvedPaths: Object.keys(files),
      executionPolicy: "FLOW",
      objective: "Make addition correct.",
      projectId,
      proposalId: "proposal-test",
      repairProvider: deterministicProvider([
        { content: "export const add = (a, b) => a + b;\n", path: "calculator.js" }
      ]),
      selectedModel: "fixture/model",
      workspaceRoot: root
    });
    assert.equal(report.repairAttempts[0]?.failureBefore.failureType, "TEST_FAILURE");
    assert.equal(report.commandResults[0]?.status, "PASSED");
  } finally {
    clearCodeRepositoryInspectionCache(root);
    await rm(root, { recursive: true, force: true });
  }
});

test("build failure is classified separately and repaired", async () => {
  const root = await fixture("build-repair");
  const projectId = path.basename(root);
  try {
    const files = {
      "package.json": packageJson({ build: "tsc -p tsconfig.json" }),
      "src/app.ts": "export const label: string = 9;\n",
      "tsconfig.json": tsconfig
    };
    await approvedWrite({ files, projectId, proposalId: "proposal-build", root });
    const report = await runCodeAutonomousExecution({
      approvedPaths: Object.keys(files),
      executionPolicy: "FLOW",
      objective: "Build the typed module.",
      projectId,
      proposalId: "proposal-build",
      repairProvider: deterministicProvider([
        { content: "export const label: string = \"ready\";\n", path: "src/app.ts" }
      ]),
      selectedModel: "fixture/model",
      workspaceRoot: root
    });
    assert.equal(report.repairAttempts[0]?.failureBefore.failureType, "BUILD_ERROR");
    assert.equal(report.commandResults[0]?.status, "PASSED", JSON.stringify(report.commandResults));
  } finally {
    clearCodeRepositoryInspectionCache(root);
    await rm(root, { recursive: true, force: true });
  }
});

test("approved API repair runs through an owned real runtime", async () => {
  const root = await fixture("api-runtime");
  const projectId = path.basename(root);
  try {
    const fixedLogic = "export const status = () => ({ ok: true, value: 42 });\n";
    const files = {
      "app.test.js": "import assert from 'node:assert/strict'; import { status } from './logic.js'; assert.deepEqual(status(), { ok: true, value: 42 });",
      "logic.js": "export const status = () => ({ ok: false, value: 0 });\n",
      "package.json": packageJson({
        dev: "node server.js",
        test: "node app.test.js"
      }),
      "server.js": [
        "import http from 'node:http';",
        "import { status } from './logic.js';",
        "const server = http.createServer((request, response) => {",
        "  response.setHeader('content-type', request.url === '/api/status' ? 'application/json' : 'text/html');",
        "  response.end(request.url === '/api/status' ? JSON.stringify(status()) : '<button id=\"status\">Ready</button>');",
        "});",
        "server.listen(Number(process.env.PORT), '127.0.0.1');"
      ].join("\n")
    };
    await approvedWrite({ files, projectId, proposalId: "proposal-api", root });
    const report = await runCodeAutonomousExecution({
      approvedPaths: Object.keys(files),
      executionPolicy: "FLOW",
      objective: "Repair and run the status API.",
      projectId,
      proposalId: "proposal-api",
      repairProvider: deterministicProvider([{ content: fixedLogic, path: "logic.js" }]),
      selectedModel: "fixture/model",
      workspaceRoot: root
    });
    assert.equal(report.commandResults[0]?.status, "PASSED");
    const engine = buildBackendRuntimeEngine(await readFixtureFiles(root, Object.keys(files)));
    assert.equal(engine.match.framework, "node");
    const runtime = await startBackendRuntime({
      analysis: engine.analysis,
      match: engine.match,
      productMode: "CODE",
      projectId,
      workerType: "local",
      workspaceRoot: root
    });
    assert.equal(runtime.runtimeStatus, "running");
    const response = await fetch(`${runtime.previewUrl}api/status`);
    assert.deepEqual(await response.json(), { ok: true, value: 42 });
  } finally {
    await stopBackendRuntime(projectId);
    clearCodeRepositoryInspectionCache(root);
    await rm(root, { recursive: true, force: true });
  }
});

test("worsening repair rolls back only its own attempt", async () => {
  const root = await fixture("worse");
  const projectId = path.basename(root);
  try {
    const original = "export const total: number = \"wrong\";\n";
    const files = {
      "package.json": packageJson({ typecheck: "tsc --noEmit" }),
      "src/app.ts": original,
      "tsconfig.json": tsconfig
    };
    await approvedWrite({ files, projectId, proposalId: "proposal-worse", root });
    const report = await runCodeAutonomousExecution({
      approvedPaths: Object.keys(files),
      executionPolicy: "CALM",
      objective: "Repair the type.",
      projectId,
      proposalId: "proposal-worse",
      repairProvider: deterministicProvider([{
        content: "export const a: number = \"x\";\nexport const b: number = \"y\";\nexport const c: number = \"z\";\n",
        path: "src/app.ts"
      }]),
      selectedModel: "fixture/model",
      workspaceRoot: root
    });
    assert.equal(report.repairAttempts[0]?.outcome, "ROLLED_BACK_WORSE");
    assert.equal(report.metrics.rollbackUsed, true);
    assert.equal(await readFile(path.join(root, "src/app.ts"), "utf8"), original);
  } finally {
    clearCodeRepositoryInspectionCache(root);
    await rm(root, { recursive: true, force: true });
  }
});

test("repair refuses to overwrite a file changed after diagnosis", async () => {
  const root = await fixture("concurrent-change");
  try {
    await writeFiles(root, { "src/app.ts": "export const value = 'user-change';\n" });
    await assert.rejects(
      applyCodeRepairAttempt({
        changes: [{ content: "export const value = 'repair';\n", path: "src/app.ts" }],
        expectedContents: { "src/app.ts": "export const value = 'diagnosed';\n" },
        workspaceRoot: root
      }),
      /changed after diagnosis/
    );
    assert.equal(
      await readFile(path.join(root, "src/app.ts"), "utf8"),
      "export const value = 'user-change';\n"
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("same repair strategy cannot loop even when the failure remains", async () => {
  const root = await fixture("repeat");
  const projectId = path.basename(root);
  try {
    const broken = "export const total: number = \"wrong\";\n";
    const files = {
      "package.json": packageJson({ typecheck: "tsc --noEmit" }),
      "src/app.ts": broken,
      "tsconfig.json": tsconfig
    };
    await approvedWrite({ files, projectId, proposalId: "proposal-repeat", root });
    const report = await runCodeAutonomousExecution({
      approvedPaths: Object.keys(files),
      executionPolicy: "AUTOPILOT_EXPERIMENTAL",
      objective: "Repair the type.",
      projectId,
      proposalId: "proposal-repeat",
      repairProvider: deterministicProvider([{ content: broken, path: "src/app.ts" }]),
      selectedModel: "fixture/model",
      workspaceRoot: root
    });
    assert.equal(report.repairAttempts.length, 2);
    assert.equal(report.repairAttempts[1]?.outcome, "REJECTED_REPEAT");
    assert.equal(report.metrics.repairsApplied, 0);
    assert(report.limitations.some((item) => item.includes("previously ineffective repair")));
  } finally {
    clearCodeRepositoryInspectionCache(root);
    await rm(root, { recursive: true, force: true });
  }
});

test("same failure may receive a bounded alternative repair strategy", async () => {
  const root = await fixture("alternative");
  const projectId = path.basename(root);
  try {
    const files = {
      "app.test.js": "throw new Error('stable fixture failure');",
      "logic.js": "export const strategy = 'initial';\n",
      "package.json": packageJson({ test: "node app.test.js" })
    };
    await approvedWrite({ files, projectId, proposalId: "proposal-alternative", root });
    const report = await runCodeAutonomousExecution({
      approvedPaths: Object.keys(files),
      executionPolicy: "FLOW",
      objective: "Try a bounded alternative when the first repair does not resolve the same failure.",
      projectId,
      proposalId: "proposal-alternative",
      repairProvider: {
        async proposeRepair(input) {
          return deterministicProvider([{
            content: `export const strategy = 'attempt-${input.attempt}';\n`,
            path: "logic.js"
          }]).proposeRepair(input);
        }
      },
      selectedModel: "fixture/model",
      workspaceRoot: root
    });
    assert.equal(report.repairAttempts.length, 2);
    assert.notEqual(
      report.repairAttempts[0]?.repairSignature,
      report.repairAttempts[1]?.repairSignature
    );
    assert(report.limitations.some((item) => item.includes("repair budget was exhausted")));
  } finally {
    clearCodeRepositoryInspectionCache(root);
    await rm(root, { recursive: true, force: true });
  }
});

test("scope expansion pauses without modifying an unapproved file", async () => {
  const root = await fixture("scope");
  const projectId = path.basename(root);
  try {
    const files = {
      "package.json": packageJson({ typecheck: "tsc --noEmit" }),
      "src/app.ts": "export const total: number = \"wrong\";\n",
      "tsconfig.json": tsconfig
    };
    await approvedWrite({ files, projectId, proposalId: "proposal-scope", root });
    const report = await runCodeAutonomousExecution({
      approvedPaths: Object.keys(files),
      executionPolicy: "FLOW",
      objective: "Repair the type.",
      projectId,
      proposalId: "proposal-scope",
      repairProvider: deterministicProvider([
        { content: "export const newModule = true;\n", path: "src/new-module.ts" }
      ]),
      selectedModel: "fixture/model",
      workspaceRoot: root
    });
    assert.equal(report.completionStatus, "BLOCKED");
    assert.deepEqual(report.scopeExpansionRequired, ["src/new-module.ts"]);
    await assert.rejects(readFile(path.join(root, "src/new-module.ts"), "utf8"));
  } finally {
    clearCodeRepositoryInspectionCache(root);
    await rm(root, { recursive: true, force: true });
  }
});

test("high-risk repair pauses without modifying approved source", async () => {
  const root = await fixture("high-risk");
  const projectId = path.basename(root);
  try {
    const original = "export const total: number = \"wrong\";\n";
    const files = {
      "package.json": packageJson({ typecheck: "tsc --noEmit" }),
      "src/app.ts": original,
      "tsconfig.json": tsconfig
    };
    await approvedWrite({ files, projectId, proposalId: "proposal-high-risk", root });
    const report = await runCodeAutonomousExecution({
      approvedPaths: Object.keys(files),
      executionPolicy: "AUTOPILOT_EXPERIMENTAL",
      objective: "Repair the type without changing architecture.",
      projectId,
      proposalId: "proposal-high-risk",
      repairProvider: {
        async proposeRepair() {
          return {
            failureCategory: null,
            ok: true,
            plan: {
              changes: [{ content: "export const total = 1;\n", path: "src/app.ts" }],
              evidenceToRerun: ["typecheck"],
              expectedEffect: "The check passes.",
              hypothesis: "Replace the module architecture.",
              repairTarget: "src/app.ts architecture",
              risk: "high"
            },
            provider: "fixture",
            resolvedModel: "fixture/model"
          };
        }
      },
      selectedModel: "fixture/model",
      workspaceRoot: root
    });
    assert.equal(report.completionStatus, "BLOCKED");
    assert.equal(await readFile(path.join(root, "src/app.ts"), "utf8"), original);
  } finally {
    clearCodeRepositoryInspectionCache(root);
    await rm(root, { recursive: true, force: true });
  }
});

test("repair cannot change dependencies without expanded approval", async () => {
  const root = await fixture("dependency-scope");
  const projectId = path.basename(root);
  try {
    const packageContent = JSON.stringify({
      dependencies: {},
      name: "dependency-scope",
      private: true,
      scripts: { test: "node app.test.js" },
      type: "module"
    }, null, 2);
    const files = {
      "app.test.js": "throw new Error('fixture failure');",
      "package.json": packageContent
    };
    await approvedWrite({ files, projectId, proposalId: "proposal-dependency-scope", root });
    const changedPackage = JSON.stringify({
      dependencies: { "new-library": "1.0.0" },
      name: "dependency-scope",
      private: true,
      scripts: { test: "node app.test.js" },
      type: "module"
    }, null, 2);
    const report = await runCodeAutonomousExecution({
      approvedPaths: Object.keys(files),
      executionPolicy: "FLOW",
      objective: "Repair without adding dependencies.",
      projectId,
      proposalId: "proposal-dependency-scope",
      repairProvider: deterministicProvider([{ content: changedPackage, path: "package.json" }]),
      selectedModel: "fixture/model",
      workspaceRoot: root
    });
    assert.equal(report.completionStatus, "BLOCKED");
    assert.equal(await readFile(path.join(root, "package.json"), "utf8"), packageContent);
    assert(report.scopeExpansionRequired.includes("package.json dependency contract"));
  } finally {
    clearCodeRepositoryInspectionCache(root);
    await rm(root, { recursive: true, force: true });
  }
});

test("provider outage preserves broken source and resumable state", async () => {
  const root = await fixture("provider");
  const projectId = path.basename(root);
  try {
    const original = "export const total: number = \"wrong\";\n";
    const files = {
      "package.json": packageJson({ typecheck: "tsc --noEmit" }),
      "src/app.ts": original,
      "tsconfig.json": tsconfig
    };
    await approvedWrite({ files, projectId, proposalId: "proposal-provider", root });
    const report = await runCodeAutonomousExecution({
      approvedPaths: Object.keys(files),
      executionPolicy: "FLOW",
      objective: "Repair the type.",
      projectId,
      proposalId: "proposal-provider",
      repairProvider: failedProvider(),
      selectedModel: "fixture/model",
      workspaceRoot: root
    });
    assert.equal(report.metrics.repairsApplied, 0);
    assert(report.resumableState.includes("proposal-provider") === false);
    assert(report.resumableState.includes(report.taskId));
    assert.equal(await readFile(path.join(root, "src/app.ts"), "utf8"), original);
  } finally {
    clearCodeRepositoryInspectionCache(root);
    await rm(root, { recursive: true, force: true });
  }
});

test("cancelled execution stops before repair", async () => {
  const root = await fixture("cancel");
  const projectId = path.basename(root);
  try {
    await writeFiles(root, {
      "package.json": packageJson({ test: "node app.test.js" }),
      "app.test.js": "setTimeout(() => process.exit(0), 5000);"
    });
    const controller = new AbortController();
    controller.abort();
    const report = await runCodeAutonomousExecution({
      abortSignal: controller.signal,
      approvedPaths: ["app.test.js", "package.json"],
      executionPolicy: "FLOW",
      objective: "Run the fixture.",
      projectId,
      proposalId: "proposal-cancel",
      repairProvider: deterministicProvider([]),
      selectedModel: "fixture/model",
      workspaceRoot: root
    });
    assert.equal(report.completionStatus, "CANCELLED");
    assert.equal(report.repairAttempts.length, 0);
  } finally {
    clearCodeRepositoryInspectionCache(root);
    await rm(root, { recursive: true, force: true });
  }
});

test("verification side effects are preserved as evidence and treated as a project-scope failure", async () => {
  const root = await fixture("verification-side-effect");
  const projectId = "project-verification-side-effect";
  let providerCalls = 0;
  try {
    const files = {
      "app.js": "export const status = 'ready';\n",
      "mutate.test.js": [
        "import { mkdirSync, writeFileSync } from 'node:fs';",
        "mkdirSync('src', { recursive: true });",
        "writeFileSync('src/unapproved.js', \"export const injected = true;\\n\", 'utf8');",
        "writeFileSync('.hassali/events.jsonl', 'forged-event\\n', 'utf8');",
        "process.exitCode = 1;"
      ].join("\n"),
      "package.json": packageJson({ test: "node mutate.test.js" })
    };
    await approvedWrite({
      files,
      projectId,
      proposalId: "proposal-verification-side-effect",
      root
    });
    await mkdir(path.join(root, ".hassali"), { recursive: true });
    await writeFile(path.join(root, ".hassali/events.jsonl"), "trusted-event\n", "utf8");
    const report = await runCodeAutonomousExecution({
      approvedPaths: Object.keys(files),
      objective: "Verify without changing project files.",
      projectId,
      proposalId: "proposal-verification-side-effect",
      repairProvider: {
        async proposeRepair() {
          providerCalls += 1;
          throw new Error("Project-scope failures must stop before provider repair.");
        }
      },
      selectedModel: "fixture/model",
      workspaceRoot: root
    });
    assert.equal(report.completionStatus, "FAILED");
    assert(report.commandResults.some((result) =>
      result.commandId === "package-script-test" &&
      result.failureType === "PROJECT_SCOPE_ERROR" &&
      result.mutationState === "unexpected"
    ));
    assert.equal(providerCalls, 0);
    assert.equal(
      await readFile(path.join(root, "src/unapproved.js"), "utf8"),
      "export const injected = true;\n"
    );
    assert.equal(
      await readFile(path.join(root, ".hassali/events.jsonl"), "utf8"),
      "forged-event\n"
    );
  } finally {
    clearCodeRepositoryInspectionCache(root);
    await rm(root, { recursive: true, force: true });
  }
});

test("post-repair project-scope failure rolls back and stops before another command suite", async () => {
  const root = await fixture("post-repair-scope-failure");
  const projectId = "project-post-repair-scope-failure";
  const original = "export const value = 1;\n";
  try {
    const files = {
      "logic.js": original,
      "package.json": packageJson({ test: "node repair.test.js" }),
      "repair.test.js": [
        "import assert from 'node:assert/strict';",
        "import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';",
        "import { value } from './logic.js';",
        "mkdirSync('.next', { recursive: true });",
        "const countPath = '.next/verification-count.txt';",
        "const count = existsSync(countPath) ? Number(readFileSync(countPath, 'utf8')) : 0;",
        "writeFileSync(countPath, String(count + 1), 'utf8');",
        "if (value === 2) {",
        "  mkdirSync('src', { recursive: true });",
        "  writeFileSync('src/unapproved.js', 'export const injected = true;\\n', 'utf8');",
        "}",
        "assert.equal(value, 2);"
      ].join("\n")
    };
    await approvedWrite({
      files,
      projectId,
      proposalId: "proposal-post-repair-scope-failure",
      root
    });
    const report = await runCodeAutonomousExecution({
      approvedPaths: Object.keys(files),
      objective: "Repair the approved logic without accepting verification side effects.",
      projectId,
      proposalId: "proposal-post-repair-scope-failure",
      repairProvider: deterministicProvider([{ content: "export const value = 2;\n", path: "logic.js" }]),
      selectedModel: "fixture/model",
      workspaceRoot: root
    });
    assert.equal(report.completionStatus, "FAILED");
    assert.equal(report.repairAttempts.length, 1);
    assert.match(report.repairAttempts[0]?.outcome ?? "", /^ROLLED_BACK_/);
    assert(report.commandResults.some((result) => result.failureType === "PROJECT_SCOPE_ERROR"));
    assert.equal(await readFile(path.join(root, "logic.js"), "utf8"), original);
    assert.equal(await readFile(path.join(root, ".next/verification-count.txt"), "utf8"), "2");
    assert.equal(
      await readFile(path.join(root, "src/unapproved.js"), "utf8"),
      "export const injected = true;\n"
    );
  } finally {
    clearCodeRepositoryInspectionCache(root);
    await rm(root, { recursive: true, force: true });
  }
});

test("a later teardown failure outranks an earlier repairable command failure", () => {
  const hardFailure = findNonRepairableCodeFailure([
    {
      commandId: "test",
      durationMs: 1,
      exitCode: 1,
      failureType: "TEST_FAILURE",
      outputExcerpt: "test failed",
      signal: null,
      status: "FAILED"
    },
    {
      commandId: "build",
      durationMs: 1,
      exitCode: null,
      failureType: "PROCESS_TEARDOWN_ERROR",
      outputExcerpt: "teardown failed",
      signal: "TEARDOWN_FAILED",
      status: "FAILED"
    }
  ]);
  assert.equal(hardFailure?.failureType, "PROCESS_TEARDOWN_ERROR");
});

test("server proposal authority rejects ASK, keeps SUGGEST file-only, and supports replay", async () => {
  clearServerProposalRegistry();
  assert.equal(registerServerProposal({
    changes: [{ action: "update", path: "src/app.ts", proposedContent: "x" }],
    executionMode: "ASK",
    id: "ask-proposal",
    mode: "EXECUTE",
    projectId: "project-a",
    summary: "ASK must not mutate"
  }), null);
  const registered = registerServerProposal({
    changes: [{ action: "update", path: "src/app.ts", proposedContent: "x" }],
    executionMode: "CODE",
    id: "code-proposal",
    mode: "EXECUTE",
    projectId: "project-a",
    summary: "Approved CODE proposal"
  });
  assert.equal(registered?.mode, "CODE");
  assert.equal(registered?.approvalMode, "EXECUTE");
  const suggested = registerServerProposal({
    changes: [{ action: "update", path: "src/app.ts", proposedContent: "suggested" }],
    executionMode: "CODE",
    id: "code-suggestion",
    mode: "SUGGEST",
    projectId: "project-a",
    summary: "Suggested CODE file change"
  });
  assert.equal(suggested?.approvalMode, "SUGGEST");
  assert.equal(registerServerProposal({
    authoritativeMode: "WEBSITE",
    changes: [{ action: "update", path: "src/app.ts", proposedContent: "x" }],
    executionMode: "CODE",
    id: "conflicting-proposal",
    mode: "EXECUTE",
    projectId: "project-a"
  }), null);
  assert.equal(beginServerProposalApproval({ projectId: "project-a", proposalId: "code-proposal" }).status, "acquired");
  assert.equal(beginServerProposalApproval({ projectId: "project-a", proposalId: "code-proposal" }).status, "executing");
  completeServerProposalApproval({
    projectId: "project-a",
    proposalId: "code-proposal",
    result: { applied: true }
  });
  assert.equal(beginServerProposalApproval({ projectId: "project-a", proposalId: "code-proposal" }).status, "completed");
  const routePath = path.basename(process.cwd()).toLowerCase() === "web"
    ? path.resolve(process.cwd(), "src/app/api/runtime/approve/route.ts")
    : path.resolve(process.cwd(), "apps/web/src/app/api/runtime/approve/route.ts");
  const route = await readFile(routePath, "utf8");
  assert(route.includes('authorizedProposal.approvalMode === "EXECUTE"'));
  assert(route.includes("beginOwnedChatProposalApproval"));
  assert(route.includes("expectedProjectRevision"));
  assert(route.includes('const requestedWorkerType = "local" as const'));
  assert(
    route.lastIndexOf("await clearOwnedProjectGeneratedArtifacts") <
    route.lastIndexOf("await synchronizeOwnedProjectWorkspace")
  );
  assert(route.includes("if (codeExecution)"));
  const persistencePath = path.basename(process.cwd()).toLowerCase() === "web"
    ? path.resolve(process.cwd(), "../../packages/database/src/persistence.ts")
    : path.resolve(process.cwd(), "packages/database/src/persistence.ts");
  const persistence = await readFile(persistencePath, "utf8");
  assert(persistence.includes('status: "project_busy" as const'));
  assert(persistence.includes("proposalApproval: {"));
  assert(persistence.includes("The durable proposal approval claim was lost before commit."));
  assert((persistence.match(/lockOwnedProjectForMutation\(input, tx\)/g) ?? []).length >= 5);
  assert(persistence.includes("lockProjectForMutation(input.projectId, tx)"));
  const executorPath = path.basename(process.cwd()).toLowerCase() === "web"
    ? path.resolve(process.cwd(), "src/lib/server/runtime/code-command-executor.ts")
    : path.resolve(process.cwd(), "apps/web/src/lib/server/runtime/code-command-executor.ts");
  const executor = await readFile(executorPath, "utf8");
  assert(executor.includes('"PROCESS_TEARDOWN_ERROR"'));
  assert(executor.includes('result.failureType === "PROCESS_TEARDOWN_ERROR"'));
});

test("execution registry suppresses duplicate task work", async () => {
  clearCodeExecutionRegistry();
  let calls = 0;
  const report = {
    approvedScope: [],
    commandResults: [],
    completionStatus: "COMPLETE_VERIFIED" as const,
    executionPolicy: "FLOW" as const,
    finalFileContents: {},
    finishedAt: new Date().toISOString(),
    limitations: [],
    metrics: {
      commandsExecuted: 0,
      repairAttempts: 0,
      repairsApplied: 0,
      rollbackUsed: false,
      successfulAttempt: null,
      verificationOutcome: "PASSED" as const
    },
    modifiedFiles: [],
    objective: "fixture",
    progress: [],
    projectId: "p",
    proposalId: "q",
    repairAttempts: [],
    repository: {
      architectureFacts: [],
      commands: [],
      dependencies: [],
      entrypoints: [],
      fingerprint: "x",
      framework: "unknown",
      packageManager: "unknown" as const,
      relevantDirectories: [],
      scripts: {},
      sourceFileCount: 0,
      warnings: []
    },
    resumableState: "{}",
    scopeExpansionRequired: [],
    startedAt: new Date().toISOString(),
    state: "COMPLETE" as const,
    taskId: "task"
  };
  const first = await runCodeExecutionOnce({
    execute: async () => {
      calls += 1;
      return report;
    },
    key: codeExecutionKey("p", "q")
  });
  const second = await runCodeExecutionOnce({
    execute: async () => {
      calls += 1;
      return report;
    },
    key: codeExecutionKey("p", "q")
  });
  assert.equal(first.duplicateSuppressed, false);
  assert.equal(second.duplicateSuppressed, true);
  assert.equal(calls, 1);
});

test("execution policies change bounded attempts without weakening environment safety", () => {
  assert.equal(repairBudgetForPolicy("CALM"), 1);
  assert.equal(repairBudgetForPolicy("FLOW"), 2);
  assert.equal(repairBudgetForPolicy("AUTOPILOT_EXPERIMENTAL"), 3);
  const environment = createCodeExecutionEnvironment() as Record<string, string | undefined>;
  assert.equal(environment.OPENROUTER_API_KEY, undefined);
  assert.equal(environment.DATABASE_URL, undefined);
  assert.equal(environment.CLERK_SECRET_KEY, undefined);
  assert.equal(ownedCodeCommandProcessCount(), 0);
});

let passed = 0;
for (const entry of tests) {
  await entry.run();
  passed += 1;
  process.stdout.write(`PASS ${entry.name}\n`);
}
process.stdout.write(`\n${passed}/${tests.length} CODE autonomous execution checks passed.\n`);
