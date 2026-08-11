import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { detectLocalToolCapabilities } from "@/lib/server/capabilities/local-tool-detector";
import { executeWithBroker } from "./execution-broker";
import { issueExecutionGrant, revokeExecutionGrant } from "./execution-grants";
import { createSecureTaskArtifacts } from "./task-artifacts";
import type { ExecutionMode, ExecutionResult } from "./execution-types";

type AdapterAuthority = {
  abortSignal?: AbortSignal;
  externalUserId: string;
  grantId: string;
  mode: ExecutionMode;
  projectId: string | null;
  scopeRoot: string;
};

export function ffprobeMetadataRequest(input: AdapterAuthority & { inputPath: string }) {
  return {
    abortSignal: input.abortSignal,
    actor: { externalUserId: input.externalUserId, projectId: input.projectId },
    capability: "media.inspect" as const,
    command: {
      args: ["-v", "error", "-show_format", "-show_streams", "-of", "json", input.inputPath],
      executable: "ffprobe",
      provenance: { evidence: "Built-in ffprobe metadata operation.", source: "hassali-tool-adapter" as const }
    },
    cwd: input.scopeRoot,
    grantId: input.grantId,
    id: `ffprobe-${randomUUID()}`,
    mode: input.mode,
    mutation: "none" as const,
    network: "none" as const,
    risk: "low" as const,
    scope: { allowedInputs: [input.inputPath], allowedOutputs: [], kind: input.mode === "ASK" ? "task-temp" as const : "project" as const, root: input.scopeRoot },
    timeoutMs: 15_000
  };
}

export function ffmpegThumbnailRequest(input: AdapterAuthority & { inputPath: string; outputPath: string; second?: number }) {
  const second = Math.max(0, Math.min(input.second ?? 0, 86_400));
  return {
    abortSignal: input.abortSignal,
    actor: { externalUserId: input.externalUserId, projectId: input.projectId },
    capability: "media.transform" as const,
    command: {
      args: ["-nostdin", "-y", "-ss", String(second), "-i", input.inputPath, "-frames:v", "1", input.outputPath],
      executable: "ffmpeg",
      provenance: { evidence: "Built-in single-frame thumbnail operation.", source: "hassali-tool-adapter" as const }
    },
    cwd: input.scopeRoot,
    grantId: input.grantId,
    id: `ffmpeg-${randomUUID()}`,
    mode: input.mode,
    mutation: input.mode === "ASK" ? "temporary" as const : "project" as const,
    network: "none" as const,
    risk: "medium" as const,
    scope: { allowedInputs: [input.inputPath], allowedOutputs: [input.outputPath], kind: input.mode === "ASK" ? "task-temp" as const : "project" as const, root: input.scopeRoot },
    timeoutMs: 30_000
  };
}

export function tesseractOcrRequest(input: AdapterAuthority & { inputPath: string; outputBasePath: string; language?: string }) {
  const language = input.language?.match(/^[a-z]{3}(?:\+[a-z]{3})*$/i)?.[0];
  return {
    abortSignal: input.abortSignal,
    actor: { externalUserId: input.externalUserId, projectId: input.projectId },
    capability: "ocr.extract" as const,
    command: {
      args: [input.inputPath, input.outputBasePath, ...(language ? ["-l", language] : [])],
      executable: "tesseract",
      provenance: { evidence: "Built-in deterministic OCR operation.", source: "hassali-tool-adapter" as const }
    },
    cwd: input.scopeRoot,
    grantId: input.grantId,
    id: `tesseract-${randomUUID()}`,
    mode: input.mode,
    mutation: input.mode === "ASK" ? "temporary" as const : "project" as const,
    network: "none" as const,
    risk: "medium" as const,
    scope: { allowedInputs: [input.inputPath], allowedOutputs: [`${input.outputBasePath}.txt`], kind: input.mode === "ASK" ? "task-temp" as const : "project" as const, root: input.scopeRoot },
    timeoutMs: 30_000
  };
}

export async function pythonProjectFileRequest(input: {
  abortSignal?: AbortSignal;
  args?: string[];
  expectedWorkspaceFingerprint: string;
  externalUserId: string;
  grantId: string;
  projectId: string;
  scriptPath: string;
  workspaceRoot: string;
}) {
  const scriptArgs = input.args ?? [];
  if (
    scriptArgs.length > 32 ||
    scriptArgs.some((value) => value.length > 240 || value.includes("\0"))
  ) {
    throw new RangeError("Project Python accepts at most 32 bounded argv values.");
  }
  const python = (await detectLocalToolCapabilities()).find((tool) => tool.id === "python");
  const executable = python?.status === "available" && python.executableName
    ? python.executableName
    : "python-unavailable";
  const args = executable.toLowerCase() === "py"
    ? ["-3", input.scriptPath, ...scriptArgs]
    : [input.scriptPath, ...scriptArgs];
  return {
    abortSignal: input.abortSignal,
    actor: { externalUserId: input.externalUserId, projectId: input.projectId },
    capability: "python.project" as const,
    command: {
      args,
      executable,
      provenance: { evidence: `Repository-inspected Python entry point ${input.scriptPath}.`, source: "repository-inspector" as const }
    },
    cwd: input.workspaceRoot,
    expectedWorkspaceFingerprint: input.expectedWorkspaceFingerprint,
    grantId: input.grantId,
    id: `python-project-${randomUUID()}`,
    mode: "CODE" as const,
    mutation: "none" as const,
    network: "none" as const,
    risk: "medium" as const,
    scope: { allowedInputs: [input.scriptPath], allowedOutputs: [], kind: "project" as const, root: input.workspaceRoot },
    timeoutMs: 30_000
  };
}

export async function runDeterministicPythonSum(input: {
  externalUserId: string;
  values: number[];
}): Promise<{ result: number | null; execution: ExecutionResult }> {
  if (input.values.length > 10_000 || input.values.some((value) => !Number.isFinite(value))) {
    throw new RangeError("The deterministic Python transform accepts at most 10,000 finite numbers.");
  }
  const artifacts = await createSecureTaskArtifacts("python-sum");
  const scriptPath = path.join(artifacts.root, "transform.py");
  const inputPath = path.join(artifacts.root, "input.json");
  const outputPath = path.join(artifacts.root, "output.json");
  await writeFile(scriptPath, [
    "import json, pathlib",
    "root = pathlib.Path(__file__).parent",
    "values = json.loads((root / 'input.json').read_text(encoding='utf-8'))",
    "result = sum(float(value) for value in values)",
    "(root / 'output.json').write_text(json.dumps({'result': result}), encoding='utf-8')"
  ].join("\n"), "utf8");
  await writeFile(inputPath, JSON.stringify(input.values), "utf8");
  const python = (await detectLocalToolCapabilities()).find((tool) => tool.id === "python");
  const executable = python?.status === "available" && python.executableName
    ? python.executableName
    : "python-unavailable";
  const executableArgs = executable.toLowerCase() === "py" ? ["-3", "transform.py"] : ["transform.py"];
  const grantId = issueExecutionGrant({
    approvalPolicy: "ask",
    approvalSource: "inline_approval",
    capabilities: ["python.deterministic"],
    externalUserId: input.externalUserId,
    maxUses: 1,
    mode: "ASK",
    projectId: null,
    riskCeiling: "low",
    scopeKind: "task-temp",
    scopeRoot: artifacts.root
  });
  try {
    const execution = await executeWithBroker({
      actor: { externalUserId: input.externalUserId, projectId: null },
      capability: "python.deterministic",
      command: {
        args: executableArgs,
        executable,
        provenance: { evidence: "Built-in numeric sum transform; user code is never accepted.", source: "hassali-tool-adapter" }
      },
      cwd: artifacts.root,
      grantId,
      id: `python-sum-${randomUUID()}`,
      mode: "ASK",
      mutation: "temporary",
      network: "none",
      risk: "low",
      scope: { allowedInputs: ["transform.py", "input.json"], allowedOutputs: ["output.json"], kind: "task-temp", root: artifacts.root },
      timeoutMs: 10_000
    });
    const result = execution.status === "passed"
      ? JSON.parse(await readFile(outputPath, "utf8")) as { result?: unknown }
      : null;
    return { execution, result: typeof result?.result === "number" ? result.result : null };
  } finally {
    revokeExecutionGrant(grantId);
    await artifacts.cleanup();
  }
}
