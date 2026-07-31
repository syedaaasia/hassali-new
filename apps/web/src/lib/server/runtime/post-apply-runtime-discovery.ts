import path from "node:path";
import type {
  PostApplyPackageManager,
  PostApplyRuntimeDiscovery,
  PostApplyRuntimeKind,
  PostApplyTargetCandidate
} from "@/lib/server/runtime/post-apply-preview-types";

type PackageManifest = {
  dependencies?: Record<string, unknown>;
  devDependencies?: Record<string, unknown>;
  name?: unknown;
  packageManager?: unknown;
  scripts?: Record<string, unknown>;
};

const lockfileManagers: Array<[RegExp, PostApplyPackageManager]> = [
  [/(?:^|\/)pnpm-lock\.yaml$/i, "pnpm"],
  [/(?:^|\/)yarn\.lock$/i, "yarn"],
  [/(?:^|\/)bun\.lockb?$/i, "bun"],
  [/(?:^|\/)package-lock\.json$/i, "npm"]
];

const supportedBrowserRuntimes = new Set<PostApplyRuntimeKind>(["next_app", "react_vite"]);

function normalizePath(value: string) {
  return value.replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/\/+/g, "/");
}

function directoryOf(filePath: string) {
  const normalized = normalizePath(filePath);
  const index = normalized.lastIndexOf("/");
  return index >= 0 ? normalized.slice(0, index) : "";
}

function parseManifest(content: string): PackageManifest | null {
  try {
    const value = JSON.parse(content) as unknown;
    return value && typeof value === "object" && !Array.isArray(value)
      ? value as PackageManifest
      : null;
  } catch {
    return null;
  }
}

function dependenciesFor(manifest: PackageManifest) {
  return new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.devDependencies ?? {})
  ].map((value) => value.toLowerCase()));
}

function scriptsFor(manifest: PackageManifest) {
  return Object.fromEntries(
    Object.entries(manifest.scripts ?? {})
      .filter((entry): entry is [string, string] => typeof entry[1] === "string")
  );
}

function runtimeKindFor(input: {
  files: string[];
  manifest: PackageManifest;
  relativeRoot: string;
  scripts: Record<string, string>;
}): { confidence: number; kind: PostApplyRuntimeKind; signals: string[] } {
  const dependencies = dependenciesFor(input.manifest);
  const prefix = input.relativeRoot ? `${input.relativeRoot}/` : "";
  const localFiles = input.files
    .filter((file) => !input.relativeRoot || file.startsWith(prefix))
    .map((file) => input.relativeRoot ? file.slice(prefix.length) : file);
  const devScript = input.scripts.dev?.toLowerCase() ?? "";
  const signals: string[] = [];
  const detected = (kind: PostApplyRuntimeKind, confidence: number, ...values: string[]) => ({
    confidence,
    kind,
    signals: values
  });

  if (
    dependencies.has("next") ||
    localFiles.some((file) => /^next\.config\.[cm]?[jt]s$/i.test(file)) ||
    /\bnext\s+dev\b/.test(devScript)
  ) {
    if (dependencies.has("next")) signals.push("dependency:next");
    if (/\bnext\s+dev\b/.test(devScript)) signals.push("script:next_dev");
    return detected("next_app", 0.96, ...signals);
  }
  if (
    dependencies.has("vite") ||
    localFiles.some((file) => /^vite\.config\.[cm]?[jt]s$/i.test(file)) ||
    /^vite(?:\s|$)/.test(devScript)
  ) {
    if (dependencies.has("vite")) signals.push("dependency:vite");
    if (/^vite(?:\s|$)/.test(devScript)) signals.push("script:vite");
    return detected("react_vite", 0.95, ...signals);
  }
  if (dependencies.has("react-scripts") || /\breact-scripts\s+start\b/.test(devScript)) {
    return detected("react_scripts", 0.9, "dependency_or_script:react_scripts");
  }
  if (dependencies.has("astro") || /\bastro\s+dev\b/.test(devScript)) {
    return detected("astro", 0.9, "dependency_or_script:astro");
  }
  if (dependencies.has("@remix-run/dev") || /\bremix\s+dev\b/.test(devScript)) {
    return detected("remix", 0.9, "dependency_or_script:remix");
  }
  if (dependencies.has("nuxt") || /\bnuxt\s+dev\b/.test(devScript)) {
    return detected("nuxt", 0.9, "dependency_or_script:nuxt");
  }
  if (dependencies.has("@sveltejs/kit") || /\bvite\s+dev\b/.test(devScript) && dependencies.has("svelte")) {
    return detected("sveltekit", 0.9, "dependency_or_script:sveltekit");
  }
  if (
    ["express", "fastify", "@nestjs/core"].some((dependency) => dependencies.has(dependency)) ||
    /^(?:node|tsx|ts-node)\s+/.test(devScript)
  ) {
    return detected("backend_node", 0.84, "dependency_or_script:backend_node");
  }
  if (Object.keys(input.scripts).length > 0 || dependencies.size > 0) {
    return detected("library", 0.58, "manifest:non_browser_package");
  }
  return detected("unknown", 0.25, "manifest:unknown");
}

function packageManagerFromDeclaration(value: unknown): PostApplyPackageManager | null {
  if (typeof value !== "string") return null;
  const manager = value.trim().toLowerCase().split("@")[0];
  return manager === "pnpm" || manager === "yarn" || manager === "bun" || manager === "npm"
    ? manager
    : null;
}

function ancestors(relativeRoot: string) {
  const result = [relativeRoot];
  let current = relativeRoot;
  while (current) {
    current = directoryOf(current);
    result.push(current);
  }
  return result;
}

function packageManagerFor(input: {
  files: string[];
  manifest: PackageManifest;
  manifests: Map<string, PackageManifest>;
  relativeRoot: string;
}) {
  const declared = packageManagerFromDeclaration(input.manifest.packageManager) ??
    packageManagerFromDeclaration(input.manifests.get("")?.packageManager);
  const warnings: string[] = [];
  for (const directory of ancestors(input.relativeRoot)) {
    const nearbyManagers = Array.from(new Set(lockfileManagers.flatMap(([pattern, manager]) => {
      const matched = input.files.some((file) => {
        if (directory && !file.startsWith(`${directory}/`)) return false;
        const local = directory ? file.slice(directory.length + 1) : file;
        return !local.includes("/") && pattern.test(local);
      });
      return matched ? [manager] : [];
    })));
    if (nearbyManagers.length > 0) {
      if (nearbyManagers.length > 1) {
        warnings.push(`Multiple package-manager lockfiles were found near ${input.relativeRoot || "."}: ${nearbyManagers.join(", ")}.`);
      }
      const conflictingManagers = declared
        ? nearbyManagers.filter((manager) => manager !== declared)
        : [];
      if (declared && conflictingManagers.length > 0) {
        warnings.push(`packageManager declares ${declared}, which overrides the nearby ${conflictingManagers.join(", ")} lockfile signal.`);
      }
      return {
        manager: declared ?? nearbyManagers[0],
        warnings
      };
    }
  }
  return {
    manager: declared ?? "npm",
    warnings
  };
}

function selectedScriptFor(scripts: Record<string, string>) {
  for (const name of ["dev", "preview", "start"]) {
    if (typeof scripts[name] === "string" && scripts[name].trim()) {
      return { command: scripts[name].trim(), name };
    }
  }
  return { command: null, name: null };
}

function defaultPortFor(kind: PostApplyRuntimeKind, scriptCommand: string | null) {
  const explicit = scriptCommand?.match(/(?:--port(?:=|\s+)|(?:^|\s)-p\s+)(\d{2,5})\b/i)?.[1];
  if (explicit) {
    const port = Number(explicit);
    if (port > 0 && port <= 65_535) return port;
  }
  if (kind === "next_app") return 3000;
  if (kind === "react_vite") return 5173;
  return null;
}

function selectedCommandFor(input: {
  packageManager: PostApplyPackageManager;
  relativeRoot: string;
  scriptName: string | null;
}) {
  if (!input.scriptName) return null;
  const root = input.relativeRoot || ".";
  if (input.packageManager === "pnpm") {
    return input.relativeRoot
      ? `pnpm --dir ${root} run ${input.scriptName}`
      : `pnpm run ${input.scriptName}`;
  }
  if (input.packageManager === "yarn") {
    return input.relativeRoot
      ? `yarn --cwd ${root} ${input.scriptName}`
      : `yarn ${input.scriptName}`;
  }
  if (input.packageManager === "bun") {
    return input.relativeRoot
      ? `bun --cwd ${root} run ${input.scriptName}`
      : `bun run ${input.scriptName}`;
  }
  return input.relativeRoot
    ? `npm --prefix ${root} run ${input.scriptName}`
    : `npm run ${input.scriptName}`;
}

function changedFileAffinity(relativeRoot: string, writtenFiles: string[]) {
  const prefix = relativeRoot ? `${relativeRoot}/` : "";
  const direct = writtenFiles.filter((file) =>
    relativeRoot ? file === relativeRoot || file.startsWith(prefix) : !file.includes("/")
  ).length;
  return direct;
}

export function discoverPostApplyRuntime(input: {
  generatedFiles: Record<string, string>;
  writtenFiles: string[];
}): PostApplyRuntimeDiscovery {
  const normalizedFiles = Object.fromEntries(
    Object.entries(input.generatedFiles).map(([file, content]) => [normalizePath(file), content])
  );
  const filePaths = Object.keys(normalizedFiles);
  const writtenFiles = input.writtenFiles.map(normalizePath);
  const manifestEntries = Object.entries(normalizedFiles)
    .filter(([file]) => /(?:^|\/)package\.json$/i.test(file))
    .map(([manifestPath, content]) => ({
      manifest: parseManifest(content),
      manifestPath,
      relativeRoot: directoryOf(manifestPath)
    }))
    .filter((entry): entry is {
      manifest: PackageManifest;
      manifestPath: string;
      relativeRoot: string;
    } => Boolean(entry.manifest));
  const manifests = new Map(manifestEntries.map((entry) => [entry.relativeRoot, entry.manifest]));
  const candidates = manifestEntries.map((entry): PostApplyTargetCandidate & { managerWarnings: string[] } => {
    const scripts = scriptsFor(entry.manifest);
    const runtime = runtimeKindFor({
      files: filePaths,
      manifest: entry.manifest,
      relativeRoot: entry.relativeRoot,
      scripts
    });
    const selectedScript = selectedScriptFor(scripts);
    const packageManagerResult = packageManagerFor({
      files: filePaths,
      manifest: entry.manifest,
      manifests,
      relativeRoot: entry.relativeRoot
    });
    const packageManager = packageManagerResult.manager;
    const affinity = changedFileAffinity(entry.relativeRoot, writtenFiles);
    const runnable = Boolean(selectedScript.name);
    const score =
      affinity * 100 +
      (supportedBrowserRuntimes.has(runtime.kind) ? 30 : 0) +
      (runnable ? 16 : 0) +
      Math.round(runtime.confidence * 10) -
      (entry.relativeRoot ? 0 : 4);

    return {
      commandSource: selectedScript.name ? "package_script" : "none",
      confidence: runtime.confidence,
      defaultPort: defaultPortFor(runtime.kind, selectedScript.command),
      framework: runtime.kind,
      manifestPath: entry.manifestPath,
      managerWarnings: packageManagerResult.warnings,
      packageManager,
      packageName: typeof entry.manifest.name === "string" ? entry.manifest.name : null,
      relativeRoot: entry.relativeRoot,
      score,
      scriptCommand: selectedScript.command,
      selectedCommand: selectedCommandFor({
        packageManager,
        relativeRoot: entry.relativeRoot,
        scriptName: selectedScript.name
      }),
      selectedScript: selectedScript.name,
      signals: [
        ...runtime.signals,
        ...(affinity ? [`changed_files:${affinity}`] : []),
        ...(selectedScript.name ? [`script:${selectedScript.name}`] : [])
      ]
    };
  }).sort((left, right) => right.score - left.score || left.relativeRoot.localeCompare(right.relativeRoot));

  if (candidates.length === 0) {
    const pythonDetected = filePaths.some((file) =>
      /(?:^|\/)(?:app\.py|requirements\.txt|pyproject\.toml)$/i.test(file)
    );
    return {
      candidates: [],
      detected: pythonDetected,
      selectedTarget: null,
      status: pythonDetected ? "NOT_PREVIEWABLE" : "NONE",
      warnings: [
        pythonDetected
          ? "Python project detected; this checkpoint does not auto-start Python browser runtimes."
          : "No package manifest or preview-capable project was detected."
      ]
    };
  }

  const top = candidates[0];
  const second = candidates[1];
  const topAffinity = changedFileAffinity(top.relativeRoot, writtenFiles);
  const secondAffinity = second ? changedFileAffinity(second.relativeRoot, writtenFiles) : 0;
  const ambiguous = Boolean(
    second &&
    topAffinity === secondAffinity &&
    Math.abs(top.score - second.score) <= 2
  );
  if (ambiguous) {
    return {
      candidates,
      detected: true,
      selectedTarget: null,
      status: "AMBIGUOUS_TARGET",
      warnings: [`Multiple runnable targets are equally plausible: ${candidates.slice(0, 3).map((candidate) => candidate.relativeRoot || ".").join(", ")}.`]
        .concat(candidates.slice(0, 3).flatMap((candidate) => candidate.managerWarnings))
    };
  }

  const previewable = supportedBrowserRuntimes.has(top.framework);
  return {
    candidates,
    detected: true,
    selectedTarget: top,
    status: previewable ? "DETECTED" : "NOT_PREVIEWABLE",
    warnings: [
      ...top.managerWarnings,
      ...(previewable
        ? []
        : [`${(top.packageName ?? top.relativeRoot) || "The selected package"} does not expose a supported browser preview runtime.`])
    ]
  };
}

export function resolvePostApplyTargetWorkspace(workspaceRoot: string, relativeRoot: string) {
  const root = path.resolve(workspaceRoot);
  const target = path.resolve(root, relativeRoot || ".");
  const relative = path.relative(root, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Post-apply runtime target escaped the owned project workspace.");
  }
  return target;
}
