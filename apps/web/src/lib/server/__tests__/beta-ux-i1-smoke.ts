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
import { validateRuntimeApprovalRequest } from "../runtime/runtime-approval-plan";
import { deriveManifest, type VfsFile } from "../../preview-manifest";

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

test("mixed workspaces resolve preview from the explicit product mode", () => {
  const files = new Map<string, VfsFile>([
    ["HASSALI.md", { content: "mode: WEBSITE", lastModified: 1, path: "HASSALI.md" }],
    ["index.html", { content: "<main>Website</main>", lastModified: 1, path: "index.html" }],
    ["styles.css", { content: "body {}", lastModified: 1, path: "styles.css" }],
    ["package.json", { content: "{}", lastModified: 1, path: "package.json" }],
    ["vite.config.ts", { content: "export default {};", lastModified: 1, path: "vite.config.ts" }],
    ["src/main.tsx", { content: "", lastModified: 1, path: "src/main.tsx" }],
    ["src/App.tsx", { content: "", lastModified: 1, path: "src/App.tsx" }]
  ]);

  assert.equal(deriveManifest(files, "WEBSITE").type, "static_website");
  assert.equal(deriveManifest(files, "CODE").type, "react_vite_app");
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

test("runtime approval request preserves standing policy source for server verification", () => {
  const parsed = validateRuntimeApprovalRequest({
    approvalPolicy: "full_project_access",
    approvalSource: "standing_policy",
    projectId: "project-1",
    proposalId: "proposal-1"
  });
  assert.equal("error" in parsed, false);
  if (!("error" in parsed)) {
    assert.equal(parsed.approvalPolicy, "full_project_access");
    assert.equal(parsed.approvalSource, "standing_policy");
  }
});

test("project notes context is bounded and remains explicit", () => {
  const notes = boundedProjectNotesContext(`  ${"x".repeat(5_000)}  `);
  assert.equal(notes.length, maximumProjectNotesContextLength);
});

const root = process.cwd().replace(/\\/g, "/").endsWith("/apps/web")
  ? path.resolve(process.cwd(), "../..")
  : process.cwd();
const rightSidebar = readFileSync(path.resolve(root, "apps/web/src/components/shell/right-sidebar.tsx"), "utf8");
const approvalControl = readFileSync(path.resolve(root, "apps/web/src/components/shell/approval-policy-control.tsx"), "utf8");
const notesPanel = readFileSync(path.resolve(root, "apps/web/src/components/shell/project-notes-panel.tsx"), "utf8");
const chatRoute = readFileSync(path.resolve(root, "apps/web/src/app/api/ai/chat/route.ts"), "utf8");
const chatStore = readFileSync(path.resolve(root, "apps/web/src/lib/chat-store.ts"), "utf8");
const exportRoute = readFileSync(path.resolve(root, "apps/web/src/app/api/workspace/export/route.ts"), "utf8");
const exportButton = readFileSync(path.resolve(root, "apps/web/src/components/shell/project-export-button.tsx"), "utf8");
const previewPanel = readFileSync(path.resolve(root, "apps/web/src/components/shell/preview-panel.tsx"), "utf8");
const runtimeApprovalRoute = readFileSync(path.resolve(root, "apps/web/src/app/api/runtime/approve/route.ts"), "utf8");
const persistence = readFileSync(path.resolve(root, "packages/database/src/persistence.ts"), "utf8");
const domainValidator = readFileSync(path.resolve(root, "apps/web/src/lib/server/ai/domain-validator.ts"), "utf8");
const generatorContract = readFileSync(path.resolve(root, "apps/web/src/lib/server/ai/generator-contract.ts"), "utf8");

test("chat follows only near the bottom and exposes jump-to-latest", () => {
  assert.match(rightSidebar, /scrollHeight - container\.scrollTop - container\.clientHeight < 96/);
  assert.match(rightSidebar, /data-jump-to-latest/);
  assert.match(rightSidebar, /autoFollowRef\.current = nearBottom/);
  assert.match(rightSidebar, /const sendWithContext = \(\) => \{[\s\S]*?sendMessage\(createWorkspaceContext\(\)\)[\s\S]*?autoFollowRef\.current = true;[\s\S]*?scheduleAutoFollow\("smooth"\);/);
});

test("approval selector is plain composer text directly after attachment and reaches the server", () => {
  const attachmentIndex = rightSidebar.indexOf('aria-label="Attach files"');
  const policyIndex = rightSidebar.indexOf("<ApprovalPolicyControl", attachmentIndex);
  const textareaIndex = rightSidebar.indexOf("<textarea", policyIndex);
  assert(attachmentIndex >= 0 && policyIndex > attachmentIndex && textareaIndex > policyIndex);
  assert.equal((rightSidebar.match(/<ApprovalPolicyControl/g) ?? []).length, 1);
  assert.match(approvalControl, /bg-transparent/);
  assert.doesNotMatch(approvalControl, /rounded-full border border-white\/10 bg-white/);
  assert.doesNotMatch(rightSidebar, /Only risky actions ask|Always ask before changes|project access without repeated/i);
  assert.match(chatStore, /approvalPolicy: workspaceContext\.approvalPolicy/);
  assert.match(chatRoute, /approvalPolicy: persistence\?\.approvalPolicy \?\? approvalPolicy/);
  assert.match(runtimeApprovalRoute, /approvalSource === "standing_policy"/);
  assert.match(runtimeApprovalRoute, /Standing approval is not valid for this proposal/);
  assert.match(rightSidebar, /max-w-3xl sm:hidden[\s\S]*?<PremiumSelect[\s\S]*?label="Model"/);
});

test("standing approval suppresses manual controls and blocked proposals never expose Approve", () => {
  assert.match(rightSidebar, /standingApprovalPending/);
  assert.match(rightSidebar, /Applying with the current project approval policy/);
  assert.match(rightSidebar, /!isApprovalBlocked && !standingApprovalPending && !isProposalApplied/);
  assert.match(rightSidebar, /!standingApprovalPending && !isProposalApplied/);
  assert.match(rightSidebar, /canApplyWithProjectApprovalPolicy\(approvalPolicy, proposal\)/);
});

test("Preview is the only Download ZIP surface and retains the secure export action", () => {
  assert.equal((rightSidebar.match(/ProjectExportButton/g) ?? []).length, 0);
  assert.equal((previewPanel.match(/<ProjectExportButton/g) ?? []).length, 1);
  assert.match(previewPanel, /projectId=\{projectId\}/);
  assert.doesNotMatch(previewPanel, /z-30 hidden[^"]*lg:flex/);
  assert.match(exportButton, /link\.href = exportUrl/);
  assert.match(exportButton, /await response\.body\?\.cancel\(\)/);
  assert.doesNotMatch(exportButton, /createObjectURL|revokeObjectURL/);
});

test("approved React product metadata is consumed before source-code fallback", () => {
  assert.match(previewPanel, /productBlueprintFromApprovedMetadata\(productPreview\) \?\? extractReactProductBlueprint/);
  assert.match(previewPanel, /productPreview=\{approvedPreviewMetadata\?\.productPreview\}/);
  assert.match(chatRoute, /PREVIEW_METADATA_INVALID/);
});

test("ordinary practical-details language is no longer globally forbidden", () => {
  const genericDomainTerms = domainValidator.slice(domainValidator.indexOf("const genericForbidden"), domainValidator.indexOf("const profiles"));
  const genericGeneratorTerms = generatorContract.slice(generatorContract.indexOf("const genericForbiddenTerms"), generatorContract.indexOf("const domainSignals"));
  assert.doesNotMatch(genericDomainTerms, /practical details/i);
  assert.doesNotMatch(genericGeneratorTerms, /practical details/i);
});

test("thread authority is user and project bound with bounded recovery telemetry", () => {
  assert.match(persistence, /where id = \$\{input\.sessionId\}[\s\S]*project_id = \$\{input\.projectId\}[\s\S]*user_id = \$\{input\.userId\}/);
  assert.match(persistence, /threadResolution: "created" \| "recovered" \| "reused"/);
  assert.match(chatRoute, /threadResolution/);
  assert.doesNotMatch(rightSidebar, /thread not found:\s*\$\{/i);
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
