import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { runApprovedFilePlan } from "../approved-file-runner";
import { runCodeAutonomousExecution } from "../code-autonomous-orchestrator";
import type { CodeRepairProvider } from "../code-execution-types";
import { clearCodeRepositoryInspectionCache } from "../code-repository-inspector";
import { resolveWorkspaceBaseRoot } from "../workspace-binding";
import type { ApprovedExecutionPlan } from "../runtime-types";

const action = process.argv[2] ?? "";
const projectId = "code-i1-browser-acceptance";
const workspaceRoot = path.join(await resolveWorkspaceBaseRoot(), projectId);
const fixedLogic = "export const status = () => ({ ok: true, label: \"Ready\" });\n";
const files = {
  "app.test.js": "import assert from 'node:assert/strict'; import { status } from './logic.js'; assert.deepEqual(status(), { ok: true, label: 'Ready' });",
  "logic.js": "export const status = () => ({ ok: false, label: \"Broken\" });\n",
  "package.json": JSON.stringify({
    name: projectId,
    private: true,
    scripts: {
      dev: "node server.js",
      test: "node app.test.js"
    },
    type: "module"
  }, null, 2),
  "server.js": [
    "import http from 'node:http';",
    "import { status } from './logic.js';",
    "const page = `<!doctype html><html><head><meta charset=\"utf-8\"><title>CODE I1 Browser Repair</title></head><body>",
    "<main><h1>Owned runtime repair</h1><button id=\"load\" type=\"button\">Check status</button><p id=\"status\">Not checked</p></main>",
    "<script>document.querySelector('#load').addEventListener('click', async () => { const response = await fetch('/api/status'); const data = await response.json(); document.querySelector('#status').textContent = data.label; });</script>",
    "</body></html>`;",
    "const server = http.createServer((request, response) => {",
    "  if (request.url === '/api/status') { response.setHeader('content-type', 'application/json'); response.end(JSON.stringify(status())); return; }",
    "  response.setHeader('content-type', 'text/html; charset=utf-8'); response.end(page);",
    "});",
    "server.listen(Number(process.env.PORT || 4179), '127.0.0.1');"
  ].join("\n")
};

async function setup() {
  await rm(workspaceRoot, { force: true, recursive: true });
  await mkdir(workspaceRoot, { recursive: true });
  const plan: ApprovedExecutionPlan = {
    approvedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    id: "proposal-browser-acceptance",
    mode: "CODE",
    projectId,
    steps: Object.entries(files).map(([relativePath, content], index) => ({
      approved: true,
      content,
      id: `browser-step-${index}`,
      path: relativePath,
      summary: `Write ${relativePath}`,
      tool: "write_file" as const
    })),
    summary: "Approved browser repair fixture",
    workspaceRoot
  };
  const result = await runApprovedFilePlan({
    approvedPlan: plan,
    projectId,
    workspaceRoot
  });
  if (result.runnerStatus !== "completed") {
    throw new Error(`Fixture approval failed: ${result.errors.join(" ")}`);
  }
  process.stdout.write(JSON.stringify({ projectId, workspaceRoot }));
}

async function repair() {
  const provider: CodeRepairProvider = {
    async proposeRepair() {
      return {
        failureCategory: null,
        ok: true,
        plan: {
          changes: [{ content: fixedLogic, path: "logic.js" }],
          evidenceToRerun: ["package-script-test"],
          expectedEffect: "The status API and button show Ready.",
          hypothesis: "The approved logic returns the wrong status.",
          repairTarget: "logic.js",
          risk: "low"
        },
        provider: "fixture",
        resolvedModel: "fixture/model"
      };
    }
  };
  const report = await runCodeAutonomousExecution({
    approvedPaths: Object.keys(files),
    executionPolicy: "FLOW",
    objective: "Repair the status API and verify the browser button result.",
    projectId,
    proposalId: "proposal-browser-acceptance",
    repairProvider: provider,
    selectedModel: "fixture/model",
    workspaceRoot
  });
  process.stdout.write(JSON.stringify({
    completionStatus: report.completionStatus,
    metrics: report.metrics,
    workspaceRoot
  }));
}

async function cleanup() {
  clearCodeRepositoryInspectionCache(workspaceRoot);
  await rm(workspaceRoot, { force: true, recursive: true });
  process.stdout.write(JSON.stringify({ cleaned: true, workspaceRoot }));
}

if (action === "setup") await setup();
else if (action === "repair") await repair();
else if (action === "cleanup") await cleanup();
else throw new Error("Use setup, repair, or cleanup.");
