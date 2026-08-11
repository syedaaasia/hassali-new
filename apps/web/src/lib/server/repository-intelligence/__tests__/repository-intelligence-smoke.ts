import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { buildAdaptiveCodePlan } from "../../ai/adaptive-code-planner";
import {
  checkRepositoryStaleness,
  inspectRepository,
  inspectRepositoryForRequest,
  mapChangeImpact,
  mapImplementationSurface,
  publicRepositorySummary,
  refreshRepositorySnapshot,
  resolveRepositoryPath,
  searchRepository
} from "../repository-intelligence";
import { refineAdaptiveCodePlanWithRepository } from "../planner-repository-bridge";

const execFileAsync = promisify(execFile);

async function put(root: string, relative: string, contents: string | Buffer) {
  const target = path.join(root, ...relative.split("/"));
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, contents);
}

async function createFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "hassali-repo-intelligence-"));
  await put(root, "package.json", JSON.stringify({
    name: "repo-fixture",
    private: true,
    scripts: { build: "turbo build", dev: "next dev", format: "prettier --write .", test: "node --test", typecheck: "tsc --noEmit" },
    workspaces: ["apps/*", "packages/*"]
  }));
  await put(root, "pnpm-workspace.yaml", "packages:\n  - apps/*\n  - packages/*\n");
  await put(root, ".env.example", "DATABASE_URL=should-never-leak\nPUBLIC_FLAG=true\n");
  await put(root, "apps/web/package.json", JSON.stringify({
    name: "@fixture/web",
    dependencies: { next: "15.0.0", react: "19.0.0", "unused-package": "1.0.0" },
    devDependencies: { typescript: "5.0.0" }
  }));
  await put(root, "apps/web/src/lib/search-service.ts", [
    "export interface SearchResult { id: string; title: string }",
    "export type SearchScope = 'project' | 'chat'",
    "export const SEARCH_LIMIT = 20;",
    "export async function searchProjectsAndChatsForExternalUser(query: string): Promise<SearchResult[]> {",
    "  return query ? [{ id: 'project-a', title: 'Project Search' }] : [];",
    "}"
  ].join("\n"));
  await put(root, "apps/web/src/app/api/workspace/search/route.ts", [
    "import { searchProjectsAndChatsForExternalUser } from '../../../../lib/search-service';",
    "export async function GET() {",
    "  return Response.json(await searchProjectsAndChatsForExternalUser('project search'));",
    "}"
  ].join("\n"));
  await put(root, "apps/web/src/components/project-search.tsx", [
    "import { searchProjectsAndChatsForExternalUser } from '../lib/search-service';",
    "export function ProjectSearch() {",
    "  void searchProjectsAndChatsForExternalUser('project search');",
    "  return <button>Project Search</button>;",
    "}"
  ].join("\n"));
  await put(root, "apps/web/src/lib/__tests__/search-service.test.ts", [
    "import { searchProjectsAndChatsForExternalUser } from '../search-service';",
    "void searchProjectsAndChatsForExternalUser('test');"
  ].join("\n"));
  await put(root, "apps/web/src/generated/search-service.generated.ts", "// Generated from ../lib/search-service.ts; do not edit\nexport const generated = true;\n");
  await put(root, "apps/web/public/logo.png", Buffer.from([0, 1, 2, 3, 0, 5]));
  await put(root, "apps/web/src/oversized.txt", Buffer.alloc(530 * 1024, 65));
  await put(root, "dist/bundle.js", "minified build output");
  await put(root, "vendor/library.js", "vendored output");
  await execFileAsync("git", ["init"], { cwd: root, windowsHide: true });
  await execFileAsync("git", ["config", "user.email", "tests@hassali.local"], { cwd: root, windowsHide: true });
  await execFileAsync("git", ["config", "user.name", "Hassali Tests"], { cwd: root, windowsHide: true });
  await execFileAsync("git", ["add", "."], { cwd: root, windowsHide: true });
  await execFileAsync("git", ["commit", "-m", "fixture"], { cwd: root, windowsHide: true });
  await put(root, "apps/web/src/lib/search-service.ts", `${await readFile(path.join(root, "apps/web/src/lib/search-service.ts"), "utf8")}\nexport const dirtySignal = true;\n`);
  await put(root, "apps/web/src/lib/untracked-relevant.ts", "export const untrackedRelevant = true;\n");
  return root;
}

async function withFixture(run: (root: string) => Promise<void>) {
  const root = await createFixture();
  try { await run(root); } finally { await rm(root, { recursive: true, force: true }); }
}

test("REPO-01 snapshot records Git, dirty worktree, languages, bounds, and monorepo workspaces", () => withFixture(async (root) => {
  const snapshot = await inspectRepository(root);
  assert(snapshot.gitRevision);
  assert.equal(snapshot.worktree, "dirty");
  assert(snapshot.modifiedTrackedFiles.some((file) => file.endsWith("search-service.ts")));
  assert(snapshot.untrackedRelevantFiles.includes("apps/web/src/lib/untracked-relevant.ts"));
  assert(snapshot.workspaces.some((workspace) => workspace.path === "apps/web" && workspace.kind === "app"));
  assert(snapshot.packageManagers.includes("pnpm"));
  assert(snapshot.detectedLanguages.some((entry) => entry.language === "TypeScript"));
}));

test("REPO-02 generated/build/vendor/binary/large files are classified or skipped safely", () => withFixture(async (root) => {
  const snapshot = await inspectRepository(root);
  assert.equal(snapshot.files.find((file) => file.path.endsWith("search-service.generated.ts"))?.role, "generated");
  assert(snapshot.buildOutputPaths.includes("dist"));
  assert(snapshot.vendorPaths.includes("vendor"));
  assert.equal(snapshot.files.find((file) => file.path.endsWith("logo.png"))?.textKind, "binary");
  assert.equal(snapshot.files.find((file) => file.path.endsWith("oversized.txt"))?.textKind, "oversized");
}));

test("SAFE-REPO-01 snapshot exposes environment names but never values or an absolute root publicly", () => withFixture(async (root) => {
  const snapshot = await inspectRepository(root);
  assert(snapshot.configuration.some((entry) => entry.environmentVariables.includes("DATABASE_URL")));
  assert.doesNotMatch(JSON.stringify(snapshot), /should-never-leak/);
  assert.equal("repositoryRoot" in publicRepositorySummary(snapshot), false);
}));

test("SAFE-REPO-02 traversal, absolute paths, and symlink escape are rejected", () => withFixture(async (root) => {
  assert.equal(resolveRepositoryPath(root, "../outside.ts"), null);
  assert.equal(resolveRepositoryPath(root, "C:\\outside.ts"), null);
  assert.equal(resolveRepositoryPath(root, "/outside.ts"), null);
  const outside = await mkdtemp(path.join(os.tmpdir(), "hassali-outside-"));
  try {
    try { await symlink(outside, path.join(root, "outside-link"), "junction"); } catch { return; }
    const snapshot = await inspectRepository(root);
    assert(snapshot.ignoredPaths.includes("outside-link"));
    assert(snapshot.files.every((file) => !file.path.startsWith("outside-link/")));
  } finally { await rm(outside, { recursive: true, force: true }); }
}));

test("SYMBOL-01 TS/JS definitions, exports, and stable source locations are indexed", () => withFixture(async (root) => {
  const snapshot = await inspectRepository(root);
  const symbol = snapshot.symbols.find((candidate) => candidate.name === "searchProjectsAndChatsForExternalUser");
  assert(symbol);
  assert.equal(symbol.exported, true);
  assert.equal(symbol?.kind, "function");
  assert((symbol?.line ?? 0) > 0);
  assert(snapshot.symbols.some((candidate) => candidate.name === "SearchResult" && candidate.kind === "interface"));
}));

test("REL-01 imports, calls, routes, tests, and exports remain distinct evidence types", () => withFixture(async (root) => {
  const snapshot = await inspectRepository(root);
  const routeFile = "apps/web/src/app/api/workspace/search/route.ts";
  assert(snapshot.routes.some((route) => route.file === routeFile && route.route === "/api/workspace/search" && route.handlers.includes("GET")));
  assert(snapshot.relationships.some((relation) => relation.fromFile === routeFile && relation.type === "imports"));
  assert(snapshot.relationships.some((relation) => relation.fromFile === routeFile && relation.type === "calls"));
  assert(snapshot.relationships.some((relation) => relation.fromFile.endsWith("search-service.test.ts") && relation.type === "tests"));
  const componentImport = snapshot.relationships.find((relation) => relation.fromFile.endsWith("project-search.tsx") && relation.type === "imports");
  assert(componentImport);
  assert.notEqual(componentImport?.type, "calls");
}));

test("SEARCH-01 ranked search supports path, filename, exact text, symbol, route, config, and import evidence", () => withFixture(async (root) => {
  const snapshot = await inspectRepository(root);
  for (const [kind, query] of [
    ["path", "src/lib/search-service"], ["filename", "search-service.ts"], ["exact", "Project Search"],
    ["symbol", "searchProjectsAndChatsForExternalUser"], ["route", "/api/workspace/search"], ["config", "package.json"], ["import", "search-service"]
  ] as const) {
    const results = await searchRepository(snapshot, { kind, query });
    assert(results.length > 0, `${kind} search should return evidence`);
  }
}));

test("SEARCH-02 authoritative source outranks generated output and results are deduplicated/bounded", () => withFixture(async (root) => {
  const snapshot = await inspectRepository(root);
  const results = await searchRepository(snapshot, { limit: 4, query: "search service" });
  assert(results.length <= 4);
  assert.equal(new Set(results.map((result) => result.file)).size, results.length);
  const source = results.findIndex((result) => result.file.endsWith("src/lib/search-service.ts"));
  const generated = results.findIndex((result) => result.file.includes("generated"));
  assert(source >= 0);
  assert(generated < 0 || source < generated);
}));

test("IMPACT-01 implementation surface and impact distinguish direct, test, route, and possible consumers", () => withFixture(async (root) => {
  const snapshot = await inspectRepository(root);
  const surface = await mapImplementationSurface(snapshot, { query: "Project Search searchProjectsAndChatsForExternalUser" });
  const impact = mapChangeImpact(snapshot, surface);
  assert.equal(surface.status, "found");
  assert(surface.authoritativeFiles.some((file) => file.endsWith("search-service.ts")));
  assert(surface.relatedRoutes.some((route) => route.route === "/api/workspace/search"));
  assert(impact.testFiles.some((file) => file.endsWith("search-service.test.ts")));
  assert(["feature", "cross-feature", "local"].includes(impact.radius));
}));

test("META-01 scripts and dependencies are metadata only, with declared and referenced state separated", () => withFixture(async (root) => {
  const snapshot = await inspectRepository(root);
  assert(snapshot.scripts.some((script) => script.name === "dev" && script.longRunning));
  assert(snapshot.scripts.some((script) => script.name === "format" && script.mayMutate));
  assert(snapshot.dependencies.some((dependency) => dependency.name === "next" && dependency.referencedBy.length === 0));
  assert(snapshot.dependencies.some((dependency) => dependency.name === "unused-package" && dependency.referencedBy.length === 0));
}));

test("STALE-01 relevant changes make a snapshot stale and source-only refresh is incremental", () => withFixture(async (root) => {
  const snapshot = await inspectRepository(root);
  const target = "apps/web/src/lib/search-service.ts";
  await put(root, target, `${await readFile(path.join(root, ...target.split("/")), "utf8")}\nexport function refreshedSymbol() { return true; }\n`);
  const stale = await checkRepositoryStaleness(snapshot);
  assert.equal(stale.stale, true);
  assert(stale.changedPaths.includes(target));
  const refreshed = await refreshRepositorySnapshot(snapshot, [target]);
  assert.equal(refreshed.mode, "incremental");
  assert(refreshed.snapshot.symbols.some((symbol) => symbol.name === "refreshedSymbol"));
  assert.equal(refreshed.snapshot.files.length, snapshot.files.length);
}));

test("STALE-02 manifest/config changes require a full bounded refresh", () => withFixture(async (root) => {
  const snapshot = await inspectRepository(root);
  const refreshed = await refreshRepositorySnapshot(snapshot, ["package.json"]);
  assert.equal(refreshed.mode, "full");
}));

test("PLAN-REPO-01 repository evidence refines actions without changing intent, constraints, criteria, or approval", () => withFixture(async (root) => {
  const plan = buildAdaptiveCodePlan({ approvalPolicy: "ask", projectContext: { projectSelected: true }, prompt: "Fix Project Search without changing auth." });
  const snapshot = await inspectRepository(root);
  const inspection = await inspectRepositoryForRequest(snapshot, plan.repositoryInspection);
  const refined = refineAdaptiveCodePlanWithRepository(plan, inspection);
  assert.deepEqual(refined.intent, plan.intent);
  assert.deepEqual(refined.constraints, plan.constraints);
  assert.deepEqual(refined.acceptanceCriteria, plan.acceptanceCriteria);
  assert.deepEqual(refined.approvalRequirements, plan.approvalRequirements);
  assert(refined.repositoryEvidence?.exactPaths.some((file) => file.endsWith("search-service.ts")));
  assert(refined.revisions.length > 0);
  assert(refined.validation.valid);
  assert.equal(refined.status, "requires-approval");
  assert.equal(refined.validation.executable, false);
}));

test("PLAN-REPO-02 unavailable evidence never invents an exact path", () => withFixture(async (root) => {
  const plan = buildAdaptiveCodePlan({ approvalPolicy: "ask", projectContext: { projectSelected: true }, prompt: "Fix quantum banana synchronization." });
  const snapshot = await inspectRepository(root);
  const inspection = await inspectRepositoryForRequest(snapshot, plan.repositoryInspection);
  const refined = refineAdaptiveCodePlanWithRepository(plan, inspection);
  if (inspection.implementationSurface.status === "unavailable") assert.deepEqual(refined.repositoryEvidence?.exactPaths, []);
  assert.doesNotMatch(refined.actions.map((action) => action.objective).join(" "), /quantum-banana\.ts|quantum\/banana/);
}));

test("SAFE-REPO-03 deterministic repository lookup contains no provider, model, or public-web call", async () => {
  const source = await readFile(new URL("../repository-intelligence.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /openrouter|invokeAutoIntelligence|webSearch|searchPublic|https?:\/\//i);
  assert.doesNotMatch(source, /exec\(|spawn\(|shell:\s*true/i);
});

test("HASSALI-01 real Project Search trace discovers UI, API, persistence, tests, and feature impact", async () => {
  const repositoryRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/, (value) => value.slice(1))), "../../../../../../..");
  const snapshot = await inspectRepository(repositoryRoot, {
    limits: { maxDeepFiles: 1_200, maxFileBytes: 700 * 1024, maxFiles: 4_000, maxTextBytes: 28 * 1024 * 1024 }
  });
  assert(snapshot.ignoredPaths.includes("research/ai-corpus"));
  const surface = await mapImplementationSurface(snapshot, {
    query: "Project Search searchProjectsAndChatsForExternalUser workspace search",
    suspectedDomains: ["left sidebar", "persistence"],
    symbolQuestions: ["searchProjectsAndChatsForExternalUser"]
  });
  const impact = mapChangeImpact(snapshot, surface);
  const allFiles = new Set([...surface.authoritativeFiles, ...surface.supportingFiles, ...surface.relatedTests]);
  assert([...allFiles].some((file) => file.endsWith("components/shell/left-sidebar.tsx")));
  assert([...allFiles].some((file) => file.endsWith("app/api/workspace/search/route.ts")));
  assert([...allFiles].some((file) => file.endsWith("packages/database/src/persistence.ts")));
  assert([...allFiles].some((file) => file.endsWith("project-search-smoke.ts")));
  assert(surface.relatedSymbols.some((symbol) => symbol.name === "searchProjectsAndChatsForExternalUser"));
  assert(["feature", "cross-feature", "system-wide"].includes(impact.radius));
});
