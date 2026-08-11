import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { buildAdaptiveCodePlan } from "../../ai/adaptive-code-planner";
import { inspectRepository } from "../../repository-intelligence/repository-intelligence";
import type { RepositoryFile, RepositorySnapshot } from "../../repository-intelligence/repository-intelligence-types";
import { builtInCapabilityPacks, createBuiltInCapabilityPackRegistry } from "../built-in-capability-packs";
import { CapabilityPackRegistry } from "../capability-pack-registry";
import { classifyRepositoryCommands } from "../command-intelligence";
import { detectLocalToolCapabilities, type SafeProbeRunner } from "../local-tool-detector";
import { refineAdaptiveCodePlanWithCapabilities } from "../planner-capability-bridge";
import { analyzeRepositoryCapabilities, matchRepositoryCapabilities } from "../repository-capability-analyzer";
import type { LocalToolCapability } from "../capability-types";

function file(pathname: string, language: string | null, tokens: string[] = []): RepositoryFile {
  return {
    authoritativeScore: 1, extension: path.extname(pathname).toLowerCase(), fingerprint: pathname, ignored: false, imports: [], language,
    modifiedAt: new Date(0).toISOString(), packagePath: null, path: pathname, role: pathname.includes("test") ? "test" : "source",
    searchTokenHashes: tokens, size: 10, symbolIds: [], textKind: "text"
  };
}

function snapshot(overrides: Partial<RepositorySnapshot> = {}): RepositorySnapshot {
  return {
    branch: "main", buildOutputPaths: [], completeness: { deepFilesRead: 0, discoveredFiles: 0, reason: null, skippedBinary: 0, skippedLarge: 0 },
    configuration: [], dependencies: [], detectedLanguages: [], files: [], fingerprint: "fixture-fingerprint", frameworks: [], generatedPaths: [], gitRevision: "abc123",
    ignoredPaths: [], inspectedAt: new Date(0).toISOString(), limits: { maxCandidateFiles: 10, maxDeepFiles: 10, maxFileBytes: 10_000, maxFiles: 100, maxRelationships: 100, maxSymbols: 100, maxTextBytes: 100_000 },
    modifiedTrackedFiles: [], packageManagers: [], relationships: [], repositoryId: "fixture", repositoryRoot: "C:/fixture", routes: [], scripts: [], sourceRoots: [], status: "complete", symbols: [], testRoots: [], untrackedRelevantFiles: [], vendorPaths: [], warnings: [], workspaces: [], worktree: "clean",
    ...overrides
  };
}

function tool(id: LocalToolCapability["id"], status: LocalToolCapability["status"] = "available"): LocalToolCapability {
  return { capabilityKinds: id === "tesseract" ? ["ocr-tool"] : id === "ffmpeg" || id === "ffprobe" ? ["media-tool"] : ["runtime"], checkedAt: new Date(0).toISOString(), evidence: [{ confidence: 1, detail: `${id} fixture`, source: "runtime-probe", sourceRef: id }], executableName: status === "unavailable" ? null : id, id, limitations: [], operations: [], platform: "win32", status, version: status === "available" ? "1.2.3" : null };
}

test("CAP-01 built-in registry is deterministic and rejects duplicate packs", () => {
  const registry = createBuiltInCapabilityPackRegistry();
  assert.deepEqual(registry.list().map((pack) => pack.id), registry.list().map((pack) => pack.id).sort());
  assert.throws(() => registry.register(builtInCapabilityPacks[0]!));
  assert.throws(() => new CapabilityPackRegistry().register({ ...builtInCapabilityPacks[0]!, id: "INVALID ID" }));
});

test("CAP-02 TypeScript/JavaScript retains deep symbols-and-routes support", () => {
  const detected = createBuiltInCapabilityPackRegistry().detect(snapshot({ detectedLanguages: [{ fileCount: 2, language: "TypeScript" }], files: [file("src/App.tsx", "TypeScript"), file("package.json", "JSON")] }));
  assert(detected.some((entry) => entry.packId === "typescript-javascript"));
  assert.equal(createBuiltInCapabilityPackRegistry().get("typescript-javascript")?.deepAnalysis, "symbols-and-routes");
});

test("CAP-03 Python and broad language packs are metadata-detected without deep claims", () => {
  const files = [file("pyproject.toml", "TOML"), file("app.py", "Python"), file("Cargo.toml", "TOML"), file("main.rs", "Rust"), file("go.mod", null), file("main.go", "Go"), file("App.csproj", "XML"), file("Program.cs", "C#"), file("query.sql", "SQL")];
  const ids = createBuiltInCapabilityPackRegistry().detect(snapshot({ files })).map((entry) => entry.packId);
  for (const id of ["python", "rust", "go", "dotnet", "sql"]) assert(ids.includes(id), `${id} should be detected`);
  assert.notEqual(createBuiltInCapabilityPackRegistry().get("python")?.deepAnalysis, "symbols-and-routes");
});

test("TOOL-01 Windows Python detection falls through to the non-installing py list probe", async () => {
  const calls: Array<[string, string[]]> = [];
  const runner: SafeProbeRunner = async (executable, args) => {
    calls.push([executable, args]);
    if (executable === "python") throw Object.assign(new Error("missing"), { code: "ENOENT" });
    if (executable === "py") return { stdout: " -V:3.12 * C:\\Python312\\python.exe\n", stderr: "" };
    throw Object.assign(new Error("missing"), { code: "ENOENT" });
  };
  const tools = await detectLocalToolCapabilities({ force: true, platform: "win32", runner });
  assert.equal(tools.find((entry) => entry.id === "python")?.executableName, "py");
  assert(calls.some(([exe, args]) => exe === "py" && args.join(" ") === "--list-paths"));
});

test("TOOL-02 unavailable and timed-out probes remain unavailable/degraded", async () => {
  const unavailable = await detectLocalToolCapabilities({ force: true, platform: "win32", runner: async () => { throw Object.assign(new Error("missing"), { code: "ENOENT" }); } });
  assert(unavailable.every((entry) => entry.status === "unavailable"));
  const degraded = await detectLocalToolCapabilities({ force: true, platform: "win32", runner: async () => { throw Object.assign(new Error("timeout"), { code: "ETIMEDOUT" }); } });
  assert(degraded.every((entry) => entry.status === "degraded"));
});

test("TOOL-03 ffmpeg, ffprobe, and Tesseract use independent fixed version probes", async () => {
  const calls: Array<[string, string[]]> = [];
  const runner: SafeProbeRunner = async (executable, args) => {
    calls.push([executable, args]);
    if (executable === "ffmpeg") return { stdout: "ffmpeg version 7.1", stderr: "" };
    if (executable === "tesseract") return { stdout: "tesseract 5.4.0", stderr: "" };
    throw Object.assign(new Error("missing"), { code: "ENOENT" });
  };
  const tools = await detectLocalToolCapabilities({ force: true, platform: "win32", runner });
  assert.equal(tools.find((entry) => entry.id === "ffmpeg")?.status, "available");
  assert.equal(tools.find((entry) => entry.id === "ffprobe")?.status, "unavailable");
  assert.equal(tools.find((entry) => entry.id === "tesseract")?.status, "available");
  assert.deepEqual(calls.find(([exe]) => exe === "tesseract")?.[1], ["--version"]);
});

test("CMD-01 repository scripts are classified only and targeted verification is deterministic", () => {
  const fixture = snapshot({ packageManagers: ["pnpm"], scripts: [
    { body: "tsc --noEmit", longRunning: false, mayMutate: false, name: "typecheck", purpose: "typecheck", risk: "low", workspacePath: "apps/web" },
    { body: "next dev", longRunning: true, mayMutate: false, name: "dev", purpose: "dev", risk: "low", workspacePath: "apps/web" },
    { body: "deploy production", longRunning: false, mayMutate: true, name: "deploy", purpose: "other", risk: "high", workspacePath: "" }
  ] });
  const commands = classifyRepositoryCommands(fixture);
  assert.deepEqual(commands.find((entry) => entry.scriptName === "typecheck")?.invocation, { executable: "pnpm", args: ["typecheck"] });
  assert.equal(commands.find((entry) => entry.scriptName === "dev")?.longRunning, true);
  assert.equal(commands.find((entry) => entry.scriptName === "deploy")?.mutation, "external-mutation");
});

test("MATCH-01 matching is deterministic and never grants permission", async () => {
  const profile = await analyzeRepositoryCapabilities(snapshot({ detectedLanguages: [{ fileCount: 1, language: "Python" }], files: [file("app.py", "Python")] }), { localTools: [tool("python", "unavailable"), tool("node"), tool("ffmpeg"), tool("ffprobe"), tool("tesseract")] });
  const request = { approvalRequired: true, prompt: "Run this Python test", requiresExecution: true, taskId: "task-1" };
  const first = matchRepositoryCapabilities(profile, request);
  const second = matchRepositoryCapabilities(profile, request);
  assert.deepEqual(first, second);
  assert(first.missingCapabilityIds.includes("tool:python"));
  assert(first.executionRequirements.every((entry) => entry.permission === "not-granted" && entry.approvalRequired));
});

test("MATCH-02 targeted commands prefer the evidence-backed workspace", async () => {
  const repo = snapshot({ packageManagers: ["pnpm"], scripts: [
    { body: "tsc --noEmit", longRunning: false, mayMutate: false, name: "typecheck", purpose: "typecheck", risk: "low", workspacePath: "" },
    { body: "tsc --noEmit", longRunning: false, mayMutate: false, name: "typecheck", purpose: "typecheck", risk: "low", workspacePath: "apps/web" }
  ] });
  const profile = await analyzeRepositoryCapabilities(repo, { localTools: [tool("node"), tool("python"), tool("ffmpeg"), tool("ffprobe"), tool("tesseract")] });
  const match = matchRepositoryCapabilities(profile, { approvalRequired: true, prompt: "Run the typecheck", requiresExecution: true, taskId: "task-web", workspaceHints: ["apps/web/src/App.tsx"] });
  const selected = profile.commands.find((command) => command.commandId === match.suggestedCommandIds[0]);
  assert.equal(selected?.workspacePath, "apps/web");
  assert.equal(match.executionRequirements.find((entry) => entry.commandId === selected?.commandId)?.workingScope, "apps/web");
});

test("PLAN-CAP-01 unavailable runtime blocks execution but preserves approval and intent", async () => {
  const plan = buildAdaptiveCodePlan({ approvalPolicy: "ask", projectContext: { projectSelected: true }, prompt: "Run and test this Python repair." });
  const profile = await analyzeRepositoryCapabilities(snapshot({ files: [file("app.py", "Python")] }), { localTools: [tool("python", "unavailable"), tool("node", "unavailable"), tool("ffmpeg", "unavailable"), tool("ffprobe", "unavailable"), tool("tesseract", "unavailable")] });
  const match = matchRepositoryCapabilities(profile, { approvalRequired: true, prompt: plan.intent.goal, requiresExecution: true, taskId: plan.taskId });
  const refined = refineAdaptiveCodePlanWithCapabilities(plan, profile, match);
  assert.deepEqual(refined.intent, plan.intent);
  assert.deepEqual(refined.approvalRequirements, plan.approvalRequirements);
  assert.equal(refined.status, "blocked");
  assert.equal(refined.failure?.code, "REQUIRED_CAPABILITY_UNAVAILABLE");
  assert.equal(refined.validation.executable, false);
});

test("PLAN-CAP-02 source generation records missing tools without faking execution", async () => {
  const plan = buildAdaptiveCodePlan({ approvalPolicy: "ask", projectContext: { projectSelected: true }, prompt: "Create a Python utility without running it." });
  const profile = await analyzeRepositoryCapabilities(snapshot({ files: [file("app.py", "Python")] }), { localTools: [tool("python", "unavailable"), tool("node", "unavailable"), tool("ffmpeg", "unavailable"), tool("ffprobe", "unavailable"), tool("tesseract", "unavailable")] });
  const match = matchRepositoryCapabilities(profile, { approvalRequired: true, prompt: plan.intent.goal, requiresExecution: false, taskId: plan.taskId });
  const refined = refineAdaptiveCodePlanWithCapabilities(plan, profile, match);
  assert.notEqual(refined.failure?.code, "REQUIRED_CAPABILITY_UNAVAILABLE");
  assert(refined.executionRequirements.every((entry) => entry.permission === "not-granted"));
});

test("PLAN-CAP-03 degraded required runtime cannot become executable", async () => {
  const plan = buildAdaptiveCodePlan({ approvalPolicy: "ask", projectContext: { projectSelected: true }, prompt: "Run this Python test." });
  const profile = await analyzeRepositoryCapabilities(snapshot({ files: [file("app.py", "Python")] }), { localTools: [tool("python", "degraded"), tool("node"), tool("ffmpeg"), tool("ffprobe"), tool("tesseract")] });
  const match = matchRepositoryCapabilities(profile, { approvalRequired: true, prompt: plan.intent.goal, requiresExecution: true, taskId: plan.taskId });
  const refined = refineAdaptiveCodePlanWithCapabilities(plan, profile, match);
  assert(match.degradedCapabilityIds.includes("tool:python"));
  assert.equal(refined.status, "blocked");
  assert.equal(refined.validation.executable, false);
});

test("SAFE-CAP-01 discovery uses fixed direct probes and adds no install or execution loop", async () => {
  const source = `${await readFile(new URL("../local-tool-detector.ts", import.meta.url), "utf8")}\n${await readFile(new URL("../repository-capability-analyzer.ts", import.meta.url), "utf8")}`;
  assert.doesNotMatch(source, /setInterval|shell:\s*true|npm\s+install|pnpm\s+install|pip\s+install|spawn\(/i);
});

test("HASSALI-CAP-01 real repository trace detects TS/JS, pnpm, scripts, and actual local availability", async () => {
  const repositoryRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/, (value) => value.slice(1))), "../../../../../../..");
  const repo = await inspectRepository(repositoryRoot, { limits: { maxDeepFiles: 1_200, maxFileBytes: 700 * 1024, maxFiles: 4_000, maxTextBytes: 28 * 1024 * 1024 } });
  const profile = await analyzeRepositoryCapabilities(repo);
  assert(profile.packs.some((entry) => entry.packId === "typescript-javascript"));
  assert(repo.packageManagers.includes("pnpm"));
  assert.equal(profile.capabilities.find((entry) => entry.id === "package-manager:pnpm")?.localStatus, "unknown");
  assert(profile.commands.some((entry) => entry.intent === "build"));
  assert(profile.localTools.some((entry) => entry.id === "node" && ["available", "detected"].includes(entry.status)));
  assert(profile.localTools.every((entry) => ["available", "degraded", "detected", "unavailable"].includes(entry.status)));
});
