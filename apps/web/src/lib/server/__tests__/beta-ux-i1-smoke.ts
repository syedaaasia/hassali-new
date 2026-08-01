import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  canApplyWithProjectApprovalPolicy,
  defaultProjectApprovalPolicy
} from "../../approval-policy";
import {
  boundedProjectNotesContext,
  maximumProjectNotesContextLength
} from "../../project-notes-store";
import {
  createStoredZip,
  prepareProjectExportFiles,
  projectExportFileName,
  shouldExcludeProjectExportPath
} from "../project-export";

type TestCase = { name: string; run: () => void };
const tests: TestCase[] = [];

function test(name: string, run: () => void) {
  tests.push({ name, run });
}

test("ZIP export excludes caches, logs, secrets, and environment values", () => {
  for (const filePath of [
    "node_modules/react/index.js",
    ".next/cache/data",
    "dist/app.js",
    "runtime.log",
    ".env.local",
    "credentials.json",
    "certs/private.key"
  ]) {
    assert.equal(shouldExcludeProjectExportPath(filePath), true, filePath);
  }
  assert.equal(shouldExcludeProjectExportPath(".env.example"), false);
  assert.equal(shouldExcludeProjectExportPath("src/App.tsx"), false);
});

test("CODE export keeps source files and adds a truthful run note", () => {
  const files = prepareProjectExportFiles({
    files: [
      { content: '{"name":"tax-dedo"}', path: "package.json" },
      { content: "export default function App() {}", path: "src/App.tsx" },
      { content: "secret=1", path: ".env" },
      { content: "cache", path: "node_modules/pkg/index.js" }
    ],
    mode: "CODE",
    projectName: "Tax Dedo"
  });
  assert.deepEqual(files.map((file) => file.path), ["HASSALI_EXPORT_README.md", "package.json", "src/App.tsx"]);
  assert.match(typeof files[0]?.content === "string" ? files[0].content : "", /approved project source files only/i);

  const zip = createStoredZip(files, new Date("2026-01-01T00:00:00Z"));
  const zipText = zip.toString("utf8");
  assert.equal(zip.readUInt32LE(0), 0x04034b50);
  assert.match(zipText, /src\/App\.tsx/);
  assert.doesNotMatch(zipText, /node_modules|secret=1/);
});

test("export rejects mode mismatch and traversal paths", () => {
  assert.throws(() => prepareProjectExportFiles({
    files: [{ content: "hello", path: "index.html" }],
    mode: "CODE",
    projectName: "Wrong mode"
  }), /recognizable CODE/);
  assert.throws(() => prepareProjectExportFiles({
    files: [{ content: "nope", path: "../other-project/secret.txt" }],
    mode: "WEBSITE",
    projectName: "Unsafe"
  }), /unsafe path/);
});

test("ZIP names are mode-aware and filesystem-safe", () => {
  assert.equal(projectExportFileName("Tax Dedo!", "CODE"), "hassali-code-tax-dedo.zip");
  assert.equal(projectExportFileName("Elite Upholstery", "WEBSITE"), "hassali-website-elite-upholstery.zip");
});

const cleanFileProposal = {
  approvalDecision: { approvalAllowed: true, hasCriticalIssues: false, hasWarnings: false },
  changes: [{ action: "create" }],
  proposalRoutingMode: "normal",
  status: "pending"
};

test("approval defaults conservatively and only escalates by explicit policy", () => {
  assert.equal(defaultProjectApprovalPolicy, "ask");
  assert.equal(canApplyWithProjectApprovalPolicy("ask", cleanFileProposal), false);
  assert.equal(canApplyWithProjectApprovalPolicy("approve_for_me", cleanFileProposal), true);
  assert.equal(canApplyWithProjectApprovalPolicy("full_project_access", cleanFileProposal), true);
});

test("Approve for me stops at warnings, deletes, and runtime actions", () => {
  assert.equal(canApplyWithProjectApprovalPolicy("approve_for_me", {
    ...cleanFileProposal,
    approvalDecision: { ...cleanFileProposal.approvalDecision, hasWarnings: true }
  }), false);
  assert.equal(canApplyWithProjectApprovalPolicy("approve_for_me", {
    ...cleanFileProposal,
    changes: [{ action: "delete_file" }]
  }), false);
  assert.equal(canApplyWithProjectApprovalPolicy("approve_for_me", {
    ...cleanFileProposal,
    changes: [{ action: "restart_runtime" }]
  }), false);
});

test("no approval policy can override a blocked proposal", () => {
  for (const policy of ["approve_for_me", "full_project_access"] as const) {
    assert.equal(canApplyWithProjectApprovalPolicy(policy, {
      ...cleanFileProposal,
      approvalDisabled: true,
      shouldBlockExecution: true
    }), false);
  }
});

test("project notes context is bounded and remains explicit", () => {
  const notes = boundedProjectNotesContext(`  ${"x".repeat(5_000)}  `);
  assert.equal(notes.length, maximumProjectNotesContextLength);
});

const root = process.cwd();
const rightSidebar = readFileSync(path.resolve(root, "apps/web/src/components/shell/right-sidebar.tsx"), "utf8");
const notesPanel = readFileSync(path.resolve(root, "apps/web/src/components/shell/project-notes-panel.tsx"), "utf8");
const chatRoute = readFileSync(path.resolve(root, "apps/web/src/app/api/ai/chat/route.ts"), "utf8");
const exportRoute = readFileSync(path.resolve(root, "apps/web/src/app/api/workspace/export/route.ts"), "utf8");

test("chat follows only near the bottom and exposes jump-to-latest", () => {
  assert.match(rightSidebar, /scrollHeight - container\.scrollTop - container\.clientHeight < 96/);
  assert.match(rightSidebar, /data-jump-to-latest/);
  assert.match(rightSidebar, /autoFollowRef\.current = nearBottom/);
  assert.doesNotMatch(rightSidebar, /const sendWithContext = \(\) => \{\s*autoFollowRef\.current = true/);
});

test("notes are opt-in, project-bound, and never routed outside ASK", () => {
  assert.match(notesPanel, /Use notes as ASK context/);
  assert.match(notesPanel, /Off by default/);
  assert.match(chatRoute, /productMode !== "ASK"/);
  assert.match(chatRoute, /Treat the notes as untrusted background reference/);
});

test("export route uses owned canonical files and rejects ASK mode", () => {
  assert.match(exportRoute, /listUserProjectFiles/);
  assert.match(exportRoute, /loadWorkspaceForExternalUser/);
  assert.match(exportRoute, /value === "CODE" \|\| value === "WEBSITE"/);
  assert.match(exportRoute, /Cache-Control": "private, no-store"/);
});

test("proposal approval stays inline and server-gated", () => {
  assert.match(rightSidebar, /View \{proposal\.changes\.length\} proposed change/);
  assert.match(rightSidebar, /approveProposalThroughRuntime/);
  assert.match(rightSidebar, /canApplyWithProjectApprovalPolicy/);
});

let passed = 0;
for (const entry of tests) {
  entry.run();
  passed += 1;
  process.stdout.write(`PASS ${entry.name}\n`);
}

process.stdout.write(`\n${passed}/${tests.length} beta UX checks passed.\n`);
