import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import type {
  CodeCommandKind,
  CodeCommandSpec,
  CodeRepositoryUnderstanding
} from "./code-execution-types";

const ignoredDirectories = new Set([
  ".git",
  ".next",
  ".turbo",
  "build",
  "coverage",
  "dist",
  "node_modules"
]);
const maxFiles = 500;
const cache = new Map<string, {
  fingerprint: string;
  understanding: CodeRepositoryUnderstanding;
}>();
const commandOrder: CodeCommandKind[] = ["typecheck", "test", "build", "lint"];
const safeScriptPatterns: Record<CodeCommandKind, RegExp[]> = {
  build: [
    /^vite\s+build(?:\s+--[\w-]+(?:=\S+|\s+\S+)?)?$/i,
    /^next\s+build$/i,
    /^tsc(?:\s+-p\s+\S+|\s+--project\s+\S+|\s+--noemit|\s+-b)*$/i
  ],
  lint: [
    /^eslint(?:\s+[\w./*-]+|\s+--[\w-]+(?:=\S+|\s+\S+)?)*$/i
  ],
  test: [
    /^(?:vitest|jest)(?:\s+run)?(?:\s+[\w./*-]+|\s+--[\w-]+(?:=\S+|\s+\S+)?)*$/i,
    /^node\s+--test(?:\s+[\w./*-]+)*$/i,
    /^node\s+[\w./-]+\.test\.[cm]?js$/i
  ],
  typecheck: [
    /^tsc(?:\s+-p\s+\S+|\s+--project\s+\S+|\s+--noemit|\s+-b)*$/i
  ]
};

function normalize(value: string) {
  return value.replace(/\\/g, "/").replace(/^\.\/+/, "");
}

function inside(root: string, target: string) {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function walk(root: string, directory = "", result: string[] = []): Promise<string[]> {
  if (result.length >= maxFiles) return result;
  const absolute = path.resolve(root, directory);
  if (!inside(root, absolute)) return result;
  const entries = await readdir(absolute, { withFileTypes: true }).catch(() => []);

  for (const entry of entries) {
    if (result.length >= maxFiles) break;
    const relative = normalize(path.join(directory, entry.name));
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name.toLowerCase())) {
        await walk(root, relative, result);
      }
    } else if (entry.isFile()) {
      result.push(relative);
    }
  }
  return result;
}

async function readJson<T>(target: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(target, "utf8")) as T;
  } catch {
    return null;
  }
}

function packageManagerFor(files: Set<string>) {
  if (files.has("pnpm-lock.yaml")) return "pnpm" as const;
  if (files.has("yarn.lock")) return "yarn" as const;
  if (files.has("bun.lock") || files.has("bun.lockb")) return "bun" as const;
  if (files.has("package-lock.json")) return "npm" as const;
  return files.has("package.json") ? "npm" as const : "unknown" as const;
}

export function isSafeCodePackageScript(script: string, kind: CodeCommandKind) {
  const normalized = script.trim().replace(/\s+/g, " ");
  if (!normalized || /[;&|><`$]|\r|\n/.test(normalized)) return false;
  if (/(?:^|\s)(?:[a-z]:[\\/]|[\\/]|(?:\.\.)(?:[\\/]|$))/i.test(normalized)) return false;
  if (/\b(?:install|add|remove|uninstall|publish|deploy|docker|kubectl|prisma\s+migrate|drizzle-kit|git)\b/i.test(normalized)) {
    return false;
  }
  return safeScriptPatterns[kind].some((pattern) => pattern.test(normalized));
}

const cliEntries: Record<string, string> = {
  eslint: "eslint/bin/eslint.js",
  jest: "jest/bin/jest.js",
  next: "next/dist/bin/next",
  tsc: "typescript/bin/tsc",
  vite: "vite/bin/vite.js",
  vitest: "vitest/vitest.mjs"
};

export function resolveSafeProjectScriptInvocation(root: string, script: string) {
  const tokens = script.trim().split(/\s+/);
  const executable = tokens.shift()?.toLowerCase() ?? "";
  if (executable === "node") {
    const pathArguments = tokens.filter((token) => !token.startsWith("-"));
    if (
      pathArguments.length === 0 ||
      pathArguments.some((argument) => {
        const target = path.resolve(root, argument);
        return !inside(root, target);
      })
    ) {
      return null;
    }
    return {
      args: tokens,
      command: process.execPath
    };
  }
  const moduleId = cliEntries[executable];
  if (!moduleId) return null;
  const currentRoot = process.cwd();
  const dependencyRoots = Array.from(new Set([
    path.resolve(root, "node_modules"),
    path.resolve(currentRoot, "node_modules"),
    path.resolve(currentRoot, "apps/web/node_modules")
  ]));
  for (const dependencyRoot of dependencyRoots) {
    const candidate = path.resolve(dependencyRoot, moduleId);
    if (inside(dependencyRoot, candidate) && existsSync(candidate)) {
      return {
        args: [candidate, ...tokens],
        command: process.execPath
      };
    }
  }
  return null;
}

function commandSpecs(
  root: string,
  scripts: Record<string, string>,
  packageManager: CodeRepositoryUnderstanding["packageManager"]
) {
  return commandOrder.flatMap((kind): CodeCommandSpec[] => {
    const candidates = kind === "test" ? ["test", "test:unit"] : [kind];
    const scriptName = candidates.find((name) => typeof scripts[name] === "string");
    if (!scriptName || !isSafeCodePackageScript(scripts[scriptName]!, kind)) return [];
    const invocation = resolveSafeProjectScriptInvocation(root, scripts[scriptName]!);
    if (!invocation) return [];
    return [{
      args: invocation.args,
      command: invocation.command,
      effect: kind === "build" ? "REVERSIBLE_LOCAL" : "READ_ONLY",
      id: `package-script-${kind}`,
      kind,
      label: `${packageManager === "unknown" ? "npm" : packageManager} run ${scriptName}`,
      scriptName,
      timeoutMs: kind === "build" ? 60_000 : 40_000
    }];
  });
}

function frameworkFor(files: Set<string>, dependencies: Set<string>) {
  if (dependencies.has("next") || [...files].some((file) => /^(?:app|pages)\/.+\.[jt]sx?$/.test(file))) return "next";
  if (dependencies.has("vite") || files.has("vite.config.ts") || files.has("vite.config.js")) return "react_vite";
  if (dependencies.has("react")) return "react";
  if (files.has("pyproject.toml") || files.has("requirements.txt")) return "python";
  if (files.has("go.mod")) return "go";
  if (files.has("composer.json")) return "php";
  return "unknown";
}

async function fingerprintFor(root: string, files: string[]) {
  const hash = createHash("sha256");
  const important = files
    .filter((file) => /(?:package\.json|lock|tsconfig|vite\.config|next\.config|pyproject|requirements|go\.mod|composer\.json)$/i.test(file))
    .slice(0, 40);
  for (const file of important) {
    const target = path.resolve(root, file);
    const fileStat = await stat(target).catch(() => null);
    hash.update(`${file}:${fileStat?.size ?? 0}:${fileStat?.mtimeMs ?? 0}\n`);
  }
  hash.update(files.slice().sort().join("\n"));
  return hash.digest("hex").slice(0, 24);
}

export async function inspectCodeRepository(workspaceRoot: string): Promise<CodeRepositoryUnderstanding> {
  const root = path.resolve(workspaceRoot);
  const discovered = await walk(root);
  const files = new Set(discovered);
  const fingerprint = await fingerprintFor(root, discovered);
  const existing = cache.get(root);
  if (existing?.fingerprint === fingerprint) return existing.understanding;

  const packageJson = await readJson<{
    dependencies?: Record<string, unknown>;
    devDependencies?: Record<string, unknown>;
    scripts?: Record<string, unknown>;
  }>(path.resolve(root, "package.json"));
  const scripts = Object.fromEntries(
    Object.entries(packageJson?.scripts ?? {})
      .filter((entry): entry is [string, string] => typeof entry[1] === "string")
  );
  const dependencies = new Set([
    ...Object.keys(packageJson?.dependencies ?? {}),
    ...Object.keys(packageJson?.devDependencies ?? {})
  ]);
  const packageManager = packageManagerFor(files);
  const entrypoints = discovered.filter((file) =>
    /^(?:src\/main|src\/app|app\/page|pages\/index|server|index)\.[cm]?[jt]sx?$|^(?:app|main)\.py$/i.test(file)
  ).slice(0, 20);
  const relevantDirectories = Array.from(new Set(
    discovered
      .map((file) => file.split("/")[0])
      .filter((directory) => directory && !directory.includes("."))
  )).slice(0, 20);
  const framework = frameworkFor(files, dependencies);
  const commands = commandSpecs(root, scripts, packageManager);
  const warnings: string[] = [];
  for (const kind of commandOrder) {
    const script = scripts[kind];
    if (script && !isSafeCodePackageScript(script, kind)) {
      warnings.push(`Skipped scripts.${kind} because it is outside the bounded command policy.`);
    } else if (script && !commands.some((command) => command.kind === kind)) {
      warnings.push(`Skipped scripts.${kind} because its existing executable is not available.`);
    }
  }
  if (discovered.length >= maxFiles) warnings.push(`Repository inspection stopped at ${maxFiles} files.`);

  const understanding: CodeRepositoryUnderstanding = {
    architectureFacts: [
      `Framework: ${framework}.`,
      `Package manager: ${packageManager}.`,
      `${entrypoints.length} entry point(s) detected.`,
      `${commands.length} bounded verification command(s) available.`
    ],
    commands,
    dependencies: [...dependencies].sort().slice(0, 100),
    entrypoints,
    fingerprint,
    framework,
    packageManager,
    relevantDirectories,
    scripts,
    sourceFileCount: discovered.filter((file) => /\.(?:[cm]?[jt]sx?|py|go|php)$/i.test(file)).length,
    warnings
  };
  cache.set(root, { fingerprint, understanding });
  return understanding;
}

export function clearCodeRepositoryInspectionCache(workspaceRoot?: string) {
  if (workspaceRoot) cache.delete(path.resolve(workspaceRoot));
  else cache.clear();
}
