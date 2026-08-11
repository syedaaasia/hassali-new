import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { LocalToolCapability, LocalToolId } from "./capability-types";

const execFileAsync = promisify(execFile);
const probeTimeoutMs = 900;
const probeOutputBytes = 32 * 1024;
const cacheTtlMs = 30_000;

type ProbeResult = { stderr: string; stdout: string };
export type SafeProbeRunner = (executable: string, args: string[]) => Promise<ProbeResult>;

type ProbeDefinition = {
  args: string[];
  id: Exclude<LocalToolId, "python">;
  kinds: LocalToolCapability["capabilityKinds"];
  limitations: string[];
  operations: string[];
};

const definitions: ProbeDefinition[] = [
  { args: ["--version"], id: "node", kinds: ["runtime", "interpreter"], limitations: ["Availability does not authorize project command execution."], operations: ["run JavaScript", "run TypeScript toolchains"] },
  { args: ["-version"], id: "ffmpeg", kinds: ["media-tool"], limitations: ["Detection does not authorize use; media operations require the secure execution broker."], operations: ["transcode", "trim", "crop", "resize", "extract frames", "extract audio", "concatenate", "subtitle overlay", "thumbnail", "compress"] },
  { args: ["-version"], id: "ffprobe", kinds: ["media-tool", "utility-tool"], limitations: ["Detection only; user media is not inspected during discovery."], operations: ["inspect duration", "inspect codecs", "inspect dimensions", "inspect streams", "inspect frame rate", "inspect media integrity"] },
  { args: ["--version"], id: "tesseract", kinds: ["ocr-tool"], limitations: ["Detection does not authorize OCR; local recognition requires a user-bound secure execution grant."], operations: ["local deterministic OCR"] }
];

let cached: { expiresAt: number; platform: NodeJS.Platform; tools: LocalToolCapability[] } | null = null;

function minimalProbeEnvironment() {
  return Object.fromEntries(Object.entries({
    NODE_ENV: process.env.NODE_ENV ?? "production",
    PATH: process.env.PATH,
    PATHEXT: process.env.PATHEXT,
    SystemRoot: process.env.SystemRoot,
    SYSTEMROOT: process.env.SYSTEMROOT,
    TEMP: process.env.TEMP,
    TMP: process.env.TMP,
    WINDIR: process.env.WINDIR,
    PYTHON_MANAGER_AUTOMATIC_INSTALL: "0"
  }).filter((entry): entry is [string, string] => typeof entry[1] === "string")) as NodeJS.ProcessEnv;
}

const defaultRunner: SafeProbeRunner = async (executable, args) => {
  const result = await execFileAsync(executable, args, {
    cwd: process.env.TEMP ?? process.cwd(),
    encoding: "utf8",
    env: minimalProbeEnvironment(),
    maxBuffer: probeOutputBytes,
    timeout: probeTimeoutMs,
    windowsHide: true
  });
  return { stderr: result.stderr, stdout: result.stdout };
};

function versionFrom(output: string) {
  const line = output.replace(/\0/g, "").split(/\r?\n/).map((value) => value.trim()).find(Boolean) ?? "";
  const matched = line.match(/\b(?:v)?(\d+(?:\.\d+){1,3}(?:[-+._a-z0-9]*)?)/i)?.[1] ?? null;
  return matched?.slice(0, 80) ?? null;
}

function failureStatus(error: unknown): { detail: string; status: LocalToolCapability["status"] } {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  if (code === "ENOENT") return { detail: "Executable was not found by the current process.", status: "unavailable" };
  if (code === "ETIMEDOUT" || (error as { killed?: boolean } | undefined)?.killed) return { detail: "Version probe exceeded the bounded timeout.", status: "degraded" };
  return { detail: "Version probe did not complete successfully.", status: "degraded" };
}

async function probe(
  id: LocalToolId,
  executable: string,
  args: string[],
  platform: NodeJS.Platform,
  runner: SafeProbeRunner,
  kinds: LocalToolCapability["capabilityKinds"],
  operations: string[],
  limitations: string[]
): Promise<LocalToolCapability> {
  const checkedAt = new Date().toISOString();
  try {
    const result = await runner(executable, args);
    const version = versionFrom(`${result.stdout}\n${result.stderr}`);
    const status = version ? "available" as const : "detected" as const;
    return {
      capabilityKinds: kinds,
      checkedAt,
      evidence: [{ confidence: version ? 0.99 : 0.82, detail: version ? `Bounded version probe reported ${version}.` : "Executable responded but did not report a parseable version.", source: "runtime-probe", sourceRef: executable }],
      executableName: executable,
      id,
      limitations,
      operations,
      platform,
      status,
      version
    };
  } catch (error) {
    const failure = failureStatus(error);
    return {
      capabilityKinds: kinds,
      checkedAt,
      evidence: [{ confidence: failure.status === "unavailable" ? 0.95 : 0.7, detail: failure.detail, source: "runtime-probe", sourceRef: executable }],
      executableName: null,
      id,
      limitations,
      operations,
      platform,
      status: failure.status,
      version: null
    };
  }
}

async function detectPython(platform: NodeJS.Platform, runner: SafeProbeRunner) {
  const candidates = platform === "win32"
    ? [{ args: ["--version"], executable: "python" }, { args: ["--list-paths"], executable: "py" }, { args: ["--version"], executable: "python3" }]
    : [{ args: ["--version"], executable: "python3" }, { args: ["--version"], executable: "python" }];
  const results: LocalToolCapability[] = [];
  for (const candidate of candidates) {
    const result = await probe(
      "python", candidate.executable, candidate.args, platform, runner, ["language", "interpreter", "runtime"],
      ["run Python", "support Python project toolchains"],
      ["A Python environment is not a security sandbox.", "Project code execution requires a scoped broker grant; package installation remains disabled."]
    );
    results.push(result);
    if (result.status === "available") return result;
  }
  const degraded = results.find((result) => result.status === "degraded") ?? null;
  return degraded ?? {
    capabilityKinds: ["language", "interpreter", "runtime"], checkedAt: new Date().toISOString(), executableName: null,
    evidence: [{ confidence: 0.95, detail: "No supported Python executable responded to a bounded version probe.", source: "runtime-probe", sourceRef: null }],
    id: "python" as const, limitations: ["Python is not available to the current process."], operations: ["run Python"], platform, status: "unavailable" as const, version: null
  };
}

export async function detectLocalToolCapabilities(options: {
  force?: boolean;
  now?: () => number;
  platform?: NodeJS.Platform;
  runner?: SafeProbeRunner;
} = {}) {
  const platform = options.platform ?? process.platform;
  const now = options.now?.() ?? Date.now();
  if (!options.force && !options.runner && cached?.platform === platform && cached.expiresAt > now) {
    return cached.tools.map((tool) => ({ ...tool, evidence: [...tool.evidence], limitations: [...tool.limitations], operations: [...tool.operations] }));
  }
  const runner = options.runner ?? defaultRunner;
  const [python, ...others] = await Promise.all([
    detectPython(platform, runner),
    ...definitions.map((definition) => probe(definition.id, definition.id, definition.args, platform, runner, definition.kinds, definition.operations, definition.limitations))
  ]);
  const tools = [python, ...others].sort((left, right) => left.id.localeCompare(right.id));
  if (!options.runner) cached = { expiresAt: now + cacheTtlMs, platform, tools };
  return tools;
}

export function clearLocalToolCapabilityCacheForTests() {
  cached = null;
}
