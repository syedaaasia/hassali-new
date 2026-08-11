import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { access, lstat, readFile, readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type {
  ChangeImpact,
  ImplementationSurface,
  RepositoryDependency,
  RepositoryFile,
  RepositoryFileRole,
  RepositoryInspectionResult,
  RepositoryLimits,
  RepositoryManifest,
  RepositoryRelationship,
  RepositoryRoute,
  RepositoryScript,
  RepositorySearchKind,
  RepositorySearchResult,
  RepositorySnapshot,
  RepositoryStaleness,
  RepositorySymbol,
  RepositoryWorkspace
} from "./repository-intelligence-types";

const execFileAsync = promisify(execFile);

export const defaultRepositoryLimits: RepositoryLimits = {
  maxCandidateFiles: 180,
  maxDeepFiles: 320,
  maxFileBytes: 512 * 1024,
  maxFiles: 1_800,
  maxRelationships: 6_000,
  maxSymbols: 4_000,
  maxTextBytes: 8 * 1024 * 1024
};

const skippedDirectories = new Set([
  ".git", ".next", ".turbo", ".cache", ".parcel-cache", ".hassali",
  "build", "coverage", "dist", "node_modules", "out", "tmp", "temp", "vendor"
]);
const buildDirectories = new Set([".next", ".turbo", "build", "coverage", "dist", "out"]);
const vendorDirectories = new Set(["node_modules", "vendor", "third_party"]);
const generatedDirectoryPattern = /(?:^|\/)(?:generated|__generated__|gen)(?:\/|$)/i;
const sourceExtensions = new Set([".cjs", ".css", ".go", ".html", ".java", ".js", ".jsx", ".mjs", ".php", ".py", ".rs", ".scss", ".sql", ".ts", ".tsx", ".vue"]);
const assetExtensions = new Set([".avif", ".bmp", ".gif", ".ico", ".jpeg", ".jpg", ".mp3", ".mp4", ".ogg", ".pdf", ".png", ".svg", ".webm", ".webp", ".woff", ".woff2", ".zip"]);
const textExtensions = new Set([...sourceExtensions, ".json", ".jsonc", ".md", ".mdx", ".toml", ".txt", ".yaml", ".yml"]);
const configNames = /(?:^|\/)(?:package\.json|pnpm-workspace\.yaml|turbo\.json|nx\.json|tsconfig(?:\.[^/]+)?\.json|next\.config\.[^/]+|vite\.config\.[^/]+|vitest\.config\.[^/]+|jest\.config\.[^/]+|eslint\.config\.[^/]+|\.eslintrc[^/]*|pyproject\.toml|requirements[^/]*\.txt|go\.mod|cargo\.toml|composer\.json|dockerfile|docker-compose[^/]*|\.github\/workflows\/[^/]+|prisma\/schema\.prisma)$/i;

type ParsedImport = {
  exported: boolean;
  names: string[];
  specifier: string;
};

type AnalyzedFile = {
  file: RepositoryFile;
  imports: ParsedImport[];
  text: string | null;
  symbols: RepositorySymbol[];
};

type InspectOptions = {
  limits?: Partial<RepositoryLimits>;
  now?: () => Date;
  signal?: AbortSignal;
};

function normalizeRelative(value: string) {
  return value.replace(/\\/g, "/").replace(/^\.\/+/, "");
}

function isInside(root: string, target: string) {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function resolveRepositoryPath(root: string, relativePath: string) {
  if (!relativePath || path.isAbsolute(relativePath) || /^[a-z]:/i.test(relativePath)) return null;
  const normalized = normalizeRelative(relativePath);
  if (normalized.split("/").some((part) => part === ".." || part === "")) return null;
  const target = path.resolve(root, normalized);
  return isInside(root, target) ? target : null;
}

function abortIfNeeded(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Repository inspection cancelled.", "AbortError");
}

function hash(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex").slice(0, 20);
}

function privateSearchTokenHashes(text: string | null) {
  if (!text) return [];
  return [...new Set(Array.from(text.matchAll(/[A-Za-z_$][\w$-]{2,}/g), (match) => hash(match[0].toLowerCase())))]
    .slice(0, 220);
}

function languageFor(extension: string) {
  const languages: Record<string, string> = {
    ".cjs": "JavaScript", ".css": "CSS", ".go": "Go", ".html": "HTML", ".java": "Java",
    ".js": "JavaScript", ".jsx": "JavaScript JSX", ".mjs": "JavaScript", ".php": "PHP",
    ".py": "Python", ".rs": "Rust", ".scss": "SCSS", ".sql": "SQL", ".ts": "TypeScript",
    ".tsx": "TypeScript JSX", ".vue": "Vue"
  };
  return languages[extension] ?? null;
}

function roleFor(relativePath: string): RepositoryFileRole {
  const normalized = normalizeRelative(relativePath).toLowerCase();
  const parts = normalized.split("/");
  if (parts.some((part) => vendorDirectories.has(part))) return "vendor";
  if (parts.some((part) => buildDirectories.has(part))) return "build-output";
  if (generatedDirectoryPattern.test(normalized) || /(?:\.generated\.|\.gen\.)/.test(normalized)) return "generated";
  if (configNames.test(normalized) || /(?:^|\/)(?:\.env\.example|\.env\.sample)$/.test(normalized)) return "config";
  if (/(?:^|\/)(?:__tests__|tests?|spec)(?:\/|$)|(?:\.test|\.spec)\.[^.]+$/i.test(normalized)) return "test";
  const extension = path.extname(normalized);
  if (assetExtensions.has(extension)) return "asset";
  if (sourceExtensions.has(extension)) return "source";
  return "other";
}

function authoritativeScore(role: RepositoryFileRole) {
  if (role === "source") return 0.95;
  if (role === "config") return 0.85;
  if (role === "test") return 0.65;
  if (role === "other") return 0.4;
  if (role === "asset") return 0.3;
  if (role === "generated") return 0.15;
  return 0.05;
}

function looksBinary(buffer: Buffer) {
  const sample = buffer.subarray(0, Math.min(buffer.length, 8_192));
  if (sample.includes(0)) return true;
  let suspicious = 0;
  for (const byte of sample) {
    if (byte < 7 || (byte > 14 && byte < 32)) suspicious += 1;
  }
  return sample.length > 0 && suspicious / sample.length > 0.12;
}

function lineAndColumn(text: string, offset: number) {
  const before = text.slice(0, offset);
  const lines = before.split("\n");
  return { column: (lines.at(-1)?.length ?? 0) + 1, line: lines.length };
}

function extractSymbols(relativePath: string, text: string, max: number): RepositorySymbol[] {
  if (!/\.[cm]?[jt]sx?$/i.test(relativePath)) return [];
  const symbols: RepositorySymbol[] = [];
  const declaration = /(^|\n)\s*(export\s+)?(?:default\s+)?(?:declare\s+)?(?:async\s+)?(function|class|interface|type|enum|const|let|var)\s+([A-Za-z_$][\w$]*)/g;
  for (const match of text.matchAll(declaration)) {
    if (symbols.length >= max) break;
    const name = match[4]!;
    const rawKind = match[3]!;
    const location = lineAndColumn(text, (match.index ?? 0) + match[0].lastIndexOf(name));
    const kind: RepositorySymbol["kind"] = ["const", "let", "var"].includes(rawKind)
      ? /^[A-Z]/.test(name) && /\.[jt]sx$/i.test(relativePath) ? "constant" : "variable"
      : rawKind as RepositorySymbol["kind"];
    symbols.push({
      ...location,
      exported: Boolean(match[2]),
      file: relativePath,
      id: `${relativePath}#${name}:${location.line}`,
      kind: /(?:^|\/)route\.[cm]?[jt]s$/i.test(relativePath) && /^(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(name)
        ? "route-handler"
        : kind,
      name
    });
  }
  return symbols;
}

function extractImports(text: string) {
  const imports: ParsedImport[] = [];
  const importPattern = /\bimport\s+(?:type\s+)?([^;\n]*?)\s+from\s+["']([^"']+)["']|\bimport\s*["']([^"']+)["']|\brequire\(\s*["']([^"']+)["']\s*\)/g;
  for (const match of text.matchAll(importPattern)) {
    const clause = match[1] ?? "";
    const specifier = match[2] ?? match[3] ?? match[4];
    if (!specifier) continue;
    const names = Array.from(clause.matchAll(/[A-Za-z_$][\w$]*/g))
      .map((candidate) => candidate[0])
      .filter((name) => !["as", "default", "type"].includes(name));
    imports.push({ exported: false, names: [...new Set(names)], specifier });
  }
  const exportPattern = /\bexport\s+(?:type\s+)?(?:\*|\{[^}]*\})\s+from\s+["']([^"']+)["']/g;
  for (const match of text.matchAll(exportPattern)) {
    imports.push({ exported: true, names: [], specifier: match[1]! });
  }
  return imports;
}

function routeForFile(relativePath: string, symbols: RepositorySymbol[]): RepositoryRoute | null {
  const normalized = normalizeRelative(relativePath);
  const segments = normalized.split("/");
  const filename = segments.at(-1) ?? "";
  const leaf = filename.match(/^(page|layout|route)\.[cm]?[jt]sx?$/i)?.[1]?.toLowerCase();
  const appIndex = segments.findIndex((segment, index) => segment === "app" && (index === 0 || segments[index - 1] === "src"));
  if (leaf && appIndex >= 0) {
    const rawSegments = segments.slice(appIndex + 1, -1);
    const routeSegments = rawSegments.filter((segment) => !/^\(.+\)$/.test(segment) && !segment.startsWith("@"));
    const route = "/" + routeSegments.join("/");
    return {
      file: normalized,
      framework: "next-app-router",
      handlers: leaf === "route" ? symbols.filter((symbol) => symbol.kind === "route-handler").map((symbol) => symbol.name) : [],
      kind: leaf === "route" ? "api" : leaf as "layout" | "page",
      route: route === "/" ? "/" : route.replace(/\/$/, "")
    };
  }
  const pagesMatch = normalized.match(/(?:^|\/)(?:src\/)?pages\/(.+)\.[cm]?[jt]sx?$/i);
  if (!pagesMatch || /(?:^|\/)_(?:app|document)\./i.test(normalized)) return null;
  const page = pagesMatch[1]!.replace(/\/index$/i, "");
  const api = page.startsWith("api/");
  return { file: normalized, framework: "next-pages-router", handlers: [], kind: api ? "api" : "page", route: "/" + page };
}

function resolveRelativeImport(fromFile: string, specifier: string, paths: Set<string>) {
  if (!specifier.startsWith(".")) return null;
  const base = normalizeRelative(path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), specifier)));
  const candidates = [
    base,
    ...[".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json"].map((extension) => base + extension),
    ...[".ts", ".tsx", ".js", ".jsx"].map((extension) => `${base}/index${extension}`)
  ];
  return candidates.find((candidate) => paths.has(candidate)) ?? null;
}

function packageNameFromSpecifier(specifier: string) {
  if (specifier.startsWith(".") || specifier.startsWith("/") || specifier.startsWith("node:")) return null;
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0] ?? null;
}

function scriptPurpose(name: string, body: string): RepositoryScript["purpose"] {
  const value = `${name} ${body}`.toLowerCase();
  if (/\bdev\b|\bstart\b/.test(value)) return "dev";
  if (/typecheck|tsc\s+.*noemit/.test(value)) return "typecheck";
  if (/\btest\b|vitest|jest|pytest/.test(value)) return "test";
  if (/\blint\b|eslint/.test(value)) return "lint";
  if (/\bbuild\b|next build|vite build/.test(value)) return "build";
  if (/\bformat\b|prettier/.test(value)) return "format";
  if (/migrat|prisma\s+(?:db|migrate)|drizzle-kit/.test(value)) return "migration";
  if (/generate|codegen/.test(value)) return "generate";
  return "other";
}

function scriptMetadata(name: string, body: string, workspacePath: string): RepositoryScript {
  const purpose = scriptPurpose(name, body);
  const mayMutate = ["format", "generate", "migration"].includes(purpose) || /\b(?:write|fix|deploy|publish|rm|del)\b/i.test(body);
  const highRisk = purpose === "migration" || /\b(?:deploy|publish|prisma\s+migrate|drop|delete)\b/i.test(body);
  const safeBody = body
    .replace(/\b([A-Z][A-Z0-9_]*)=(?:"[^"]*"|'[^']*'|[^\s]+)/g, "$1=[redacted]")
    .replace(/(--(?:api[-_]?key|password|secret|token)\s+)(?:"[^"]*"|'[^']*'|[^\s]+)/gi, "$1[redacted]");
  return {
    body: safeBody.slice(0, 500),
    longRunning: purpose === "dev" || /\b(?:watch|serve)\b/i.test(body),
    mayMutate,
    name,
    purpose,
    risk: highRisk ? "high" : mayMutate ? "moderate" : "low",
    workspacePath
  };
}

async function runGit(root: string, args: string[]) {
  try {
    const result = await execFileAsync("git", args, {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 2 * 1024 * 1024,
      timeout: 4_000,
      windowsHide: true
    });
    return result.stdout.trim();
  } catch {
    return null;
  }
}

async function gitState(root: string) {
  const top = await runGit(root, ["rev-parse", "--show-toplevel"]);
  if (!top || path.resolve(top).toLowerCase() !== path.resolve(root).toLowerCase()) {
    return { branch: null, modified: [] as string[], revision: null, untracked: [] as string[], worktree: "unknown" as const };
  }
  const [revision, branch, porcelain] = await Promise.all([
    runGit(root, ["rev-parse", "HEAD"]),
    runGit(root, ["branch", "--show-current"]),
    runGit(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"])
  ]);
  const modified: string[] = [];
  const untracked: string[] = [];
  for (const entry of (porcelain ?? "").split("\0").filter(Boolean)) {
    const statusCode = entry.slice(0, 2);
    const file = normalizeRelative(entry.slice(3).split(" -> ").at(-1) ?? "");
    if (!file) continue;
    if (statusCode === "??") untracked.push(file);
    else modified.push(file);
  }
  return {
    branch: branch || null,
    modified: [...new Set(modified)].sort(),
    revision: revision || null,
    untracked: [...new Set(untracked)].sort(),
    worktree: porcelain ? "dirty" as const : "clean" as const
  };
}

function frameworkHints(dependencies: Set<string>, files: Set<string>) {
  const hints = new Set<string>();
  if (dependencies.has("next") || [...files].some((file) => /(?:^|\/)app\/.+\/(?:page|route)\.[jt]sx?$/.test(file))) hints.add("Next.js");
  if (dependencies.has("react")) hints.add("React");
  if (dependencies.has("vite") || [...files].some((file) => /(?:^|\/)vite\.config\./.test(file))) hints.add("Vite");
  if (dependencies.has("express")) hints.add("Express");
  if (dependencies.has("@nestjs/core")) hints.add("NestJS");
  if (dependencies.has("fastapi")) hints.add("FastAPI");
  return [...hints];
}

function workspaceKind(relativePath: string): RepositoryWorkspace["kind"] {
  if (!relativePath) return "repository";
  if (/^apps\//.test(relativePath)) return "app";
  if (/^packages\//.test(relativePath)) return "package";
  if (/^workers\//.test(relativePath)) return "worker";
  return "workspace";
}

function manifestKind(relativePath: string) {
  const name = path.posix.basename(relativePath).toLowerCase();
  if (name === "package.json") return "package";
  if (/tsconfig/.test(name)) return "typescript";
  if (/next\.config/.test(name)) return "next";
  if (/vite/.test(name)) return "vite";
  if (/eslint/.test(name)) return "lint";
  if (/vitest|jest/.test(name)) return "test";
  if (/schema\.prisma/.test(relativePath)) return "database-schema";
  if (/docker/.test(name)) return "container";
  if (/workflow/.test(relativePath) || /^\.github\//.test(relativePath)) return "ci";
  return "configuration";
}

function environmentNames(text: string) {
  const names = new Set<string>();
  for (const match of text.matchAll(/(?:process\.env\.|import\.meta\.env\.)([A-Z][A-Z0-9_]*)/g)) names.add(match[1]!);
  for (const match of text.matchAll(/^([A-Z][A-Z0-9_]*)\s*=/gm)) names.add(match[1]!);
  return [...names].sort();
}

async function fileInstalled(root: string, workspacePath: string, dependency: string) {
  const candidates = [
    path.resolve(root, workspacePath, "node_modules", ...dependency.split("/")),
    path.resolve(root, "node_modules", ...dependency.split("/"))
  ];
  for (const candidate of candidates) {
    if (!isInside(root, candidate)) continue;
    try {
      await access(candidate);
      return true;
    } catch {
      // Try the next bounded location.
    }
  }
  return false;
}

function relationshipId(type: RepositoryRelationship["type"], from: string, to: string) {
  return hash(`${type}:${from}:${to}`);
}

export async function inspectRepository(repositoryRoot: string, options: InspectOptions = {}): Promise<RepositorySnapshot> {
  const limits = { ...defaultRepositoryLimits, ...options.limits };
  const requestedRoot = path.resolve(repositoryRoot);
  const rootStat = await stat(requestedRoot).catch(() => null);
  if (!rootStat?.isDirectory()) throw new Error("Repository root is not an accessible directory.");
  const root = await realpath(requestedRoot);
  const now = options.now?.() ?? new Date();
  const git = await gitState(root);
  const stack = [""];
  const analyzed: AnalyzedFile[] = [];
  const warnings: string[] = [];
  const ignoredPaths = new Set<string>();
  const buildOutputPaths = new Set<string>();
  const vendorPaths = new Set<string>();
  const generatedPaths = new Set<string>();
  let discoveredFiles = 0;
  let deepFilesRead = 0;
  let skippedBinary = 0;
  let skippedLarge = 0;
  let textBytes = 0;
  let hitFileLimit = false;

  while (stack.length > 0) {
    abortIfNeeded(options.signal);
    const directory = stack.pop()!;
    const absoluteDirectory = path.resolve(root, directory);
    if (!isInside(root, absoluteDirectory)) continue;
    const entries = await readdir(absoluteDirectory, { withFileTypes: true }).catch(() => []);
    // The stack is LIFO, so reverse insertion keeps stable alphabetic traversal.
    // This ensures bounded scans reach primary `apps/` source before later trees.
    entries.sort((left, right) => right.name.localeCompare(left.name));
    for (const entry of entries) {
      abortIfNeeded(options.signal);
      const relativePath = normalizeRelative(path.posix.join(directory.replace(/\\/g, "/"), entry.name));
      if (entry.isSymbolicLink()) {
        ignoredPaths.add(relativePath);
        warnings.push(`Skipped symbolic link ${relativePath}; repository inspection does not follow links.`);
        continue;
      }
      if (entry.isDirectory()) {
        const lower = entry.name.toLowerCase();
        const excludedResearchCorpus = relativePath.toLowerCase() === "research/ai-corpus";
        if (skippedDirectories.has(lower) || excludedResearchCorpus) {
          ignoredPaths.add(relativePath);
          if (buildDirectories.has(lower)) buildOutputPaths.add(relativePath);
          if (vendorDirectories.has(lower)) vendorPaths.add(relativePath);
          continue;
        }
        stack.push(relativePath);
        continue;
      }
      if (!entry.isFile()) continue;
      discoveredFiles += 1;
      if (analyzed.length >= limits.maxFiles) {
        hitFileLimit = true;
        continue;
      }
      const target = resolveRepositoryPath(root, relativePath);
      if (!target) continue;
      const fileStat = await lstat(target).catch(() => null);
      if (!fileStat?.isFile()) continue;
      const extension = path.extname(relativePath).toLowerCase();
      let role = roleFor(relativePath);
      if (role === "generated") generatedPaths.add(relativePath);
      let text: string | null = null;
      let textKind: RepositoryFile["textKind"] = "unknown";
      let symbols: RepositorySymbol[] = [];
      let imports: ParsedImport[] = [];
      const canRead = textExtensions.has(extension) || role === "config" || extension === "";
      if (canRead && fileStat.size <= limits.maxFileBytes && deepFilesRead < limits.maxDeepFiles && textBytes + fileStat.size <= limits.maxTextBytes) {
        const bytes = await readFile(target);
        if (looksBinary(bytes)) {
          textKind = "binary";
          skippedBinary += 1;
        } else {
          text = bytes.toString("utf8");
          textKind = "text";
          deepFilesRead += 1;
          textBytes += bytes.length;
          if (/^\s*(?:\/\/|\/\*)[^\n]{0,80}(?:generated|do not edit)/i.test(text) && role === "source") {
            role = "generated";
            generatedPaths.add(relativePath);
          }
          symbols = extractSymbols(relativePath, text, Math.max(0, limits.maxSymbols - analyzed.reduce((count, file) => count + file.symbols.length, 0)));
          imports = extractImports(text);
        }
      } else if (canRead && fileStat.size > limits.maxFileBytes) {
        textKind = "oversized";
        skippedLarge += 1;
      } else if (!canRead || assetExtensions.has(extension)) {
        textKind = "binary";
        skippedBinary += 1;
      } else {
        textKind = "oversized";
        skippedLarge += 1;
      }
      const fingerprint = hash(`${relativePath}:${fileStat.size}:${fileStat.mtimeMs}:${text ? hash(text) : "metadata"}`);
      analyzed.push({
        file: {
          authoritativeScore: authoritativeScore(role),
          extension,
          fingerprint,
          ignored: false,
          imports: imports.map((candidate) => candidate.specifier).slice(0, 80),
          language: languageFor(extension),
          modifiedAt: new Date(fileStat.mtimeMs).toISOString(),
          packagePath: null,
          path: relativePath,
          role,
          searchTokenHashes: privateSearchTokenHashes(text),
          size: fileStat.size,
          symbolIds: symbols.map((symbol) => symbol.id),
          textKind
        },
        imports,
        symbols,
        text
      });
    }
  }

  const paths = new Set(analyzed.map((item) => item.file.path));
  const packageFiles = analyzed.filter((item) => /(?:^|\/)package\.json$/i.test(item.file.path));
  const packageRecords: Array<{
    dependencies: Array<{ kind: RepositoryDependency["declaredAs"]; name: string; version: string }>;
    name: string;
    path: string;
    scripts: Record<string, string>;
  }> = [];
  for (const item of packageFiles) {
    try {
      const parsed = JSON.parse(item.text ?? "{}") as Record<string, unknown>;
      const workspacePath = normalizeRelative(path.posix.dirname(item.file.path)).replace(/^\.$/, "");
      const dependencies: typeof packageRecords[number]["dependencies"] = [];
      for (const [field, kind] of [
        ["dependencies", "dependency"], ["devDependencies", "devDependency"], ["optionalDependencies", "optionalDependency"], ["peerDependencies", "peerDependency"]
      ] as const) {
        const values = parsed[field];
        if (!values || typeof values !== "object" || Array.isArray(values)) continue;
        for (const [name, version] of Object.entries(values)) {
          if (typeof version === "string") dependencies.push({ kind, name, version });
        }
      }
      const scripts = parsed.scripts && typeof parsed.scripts === "object" && !Array.isArray(parsed.scripts)
        ? Object.fromEntries(Object.entries(parsed.scripts).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
        : {};
      packageRecords.push({
        dependencies,
        name: typeof parsed.name === "string" ? parsed.name : workspacePath || path.basename(root),
        path: workspacePath,
        scripts
      });
    } catch {
      warnings.push(`Could not parse ${item.file.path}; dependency and script metadata may be partial.`);
    }
  }
  if (!packageRecords.some((record) => record.path === "")) {
    packageRecords.unshift({ dependencies: [], name: path.basename(root), path: "", scripts: {} });
  }
  const allDependencyNames = new Set(packageRecords.flatMap((record) => record.dependencies.map((dependency) => dependency.name)));
  const frameworks = frameworkHints(allDependencyNames, paths);
  const workspaces: RepositoryWorkspace[] = packageRecords.map((record) => ({
    frameworkHints: frameworkHints(new Set(record.dependencies.map((dependency) => dependency.name)), paths),
    kind: workspaceKind(record.path),
    manifestPath: record.path ? `${record.path}/package.json` : paths.has("package.json") ? "package.json" : null,
    name: record.name,
    path: record.path
  }));
  const workspacePaths = workspaces.map((workspace) => workspace.path).sort((left, right) => right.length - left.length);
  for (const item of analyzed) {
    item.file.packagePath = workspacePaths.find((workspacePath) => !workspacePath || item.file.path === workspacePath || item.file.path.startsWith(`${workspacePath}/`)) ?? null;
  }

  const symbols = analyzed.flatMap((item) => item.symbols).slice(0, limits.maxSymbols);
  const relationships: RepositoryRelationship[] = [];
  const addRelationship = (relationship: Omit<RepositoryRelationship, "id">) => {
    if (relationships.length >= limits.maxRelationships) return;
    const target = relationship.toFile ?? relationship.toSpecifier ?? relationship.toSymbolId ?? "unknown";
    const id = relationshipId(relationship.type, `${relationship.fromFile}:${relationship.fromSymbolId ?? ""}`, target);
    if (!relationships.some((candidate) => candidate.id === id)) relationships.push({ ...relationship, id });
  };
  const routes: RepositoryRoute[] = [];
  for (const item of analyzed) {
    const route = routeForFile(item.file.path, item.symbols);
    if (route) {
      routes.push(route);
      for (const handler of route.handlers) {
        const symbol = item.symbols.find((candidate) => candidate.name === handler);
        addRelationship({ confidence: 1, evidence: `Next.js route file ${item.file.path} exports ${handler}.`, fromFile: item.file.path, fromSymbolId: symbol?.id ?? null, toFile: item.file.path, toSpecifier: route.route, toSymbolId: null, type: "routes-to" });
      }
    }
    for (const imported of item.imports) {
      const targetFile = resolveRelativeImport(item.file.path, imported.specifier, paths);
      addRelationship({
        confidence: targetFile ? 1 : 0.85,
        evidence: `${item.file.path} ${imported.exported ? "re-exports" : "imports"} ${imported.specifier}.`,
        fromFile: item.file.path,
        fromSymbolId: null,
        toFile: targetFile,
        toSpecifier: imported.specifier,
        toSymbolId: null,
        type: imported.exported ? "exports" : "imports"
      });
      if (targetFile && item.file.role === "test") {
        addRelationship({ confidence: 0.95, evidence: `Test file ${item.file.path} imports ${targetFile}.`, fromFile: item.file.path, fromSymbolId: null, toFile: targetFile, toSpecifier: imported.specifier, toSymbolId: null, type: "tests" });
      }
      if (targetFile && item.file.role === "config") {
        addRelationship({ confidence: 0.85, evidence: `Configuration ${item.file.path} references ${targetFile}.`, fromFile: item.file.path, fromSymbolId: null, toFile: targetFile, toSpecifier: imported.specifier, toSymbolId: null, type: "configures" });
      }
      if (targetFile && item.text) {
        for (const name of imported.names.slice(0, 20)) {
          const targetSymbol = symbols.find((candidate) => candidate.file === targetFile && candidate.name === name);
          if (!targetSymbol) continue;
          const callPattern = new RegExp(`\\b${name.replace(/[$]/g, "\\$")}\\s*\\(`);
          const renderPattern = new RegExp(`<${name}(?:\\s|/?>)`);
          if (callPattern.test(item.text)) {
            addRelationship({ confidence: 0.8, evidence: `${item.file.path} imports and invokes ${name}.`, fromFile: item.file.path, fromSymbolId: null, toFile: targetFile, toSpecifier: imported.specifier, toSymbolId: targetSymbol.id, type: "calls" });
          }
          if (renderPattern.test(item.text)) {
            addRelationship({ confidence: 0.9, evidence: `${item.file.path} imports and renders ${name}.`, fromFile: item.file.path, fromSymbolId: null, toFile: targetFile, toSpecifier: imported.specifier, toSymbolId: targetSymbol.id, type: "renders" });
          }
        }
      }
    }
    if (item.text) {
      const generatedFrom = item.text.match(/generated\s+from\s+["'`]?([^\s"'`]+)/i)?.[1];
      if (generatedFrom) {
        const targetFile = resolveRelativeImport(item.file.path, generatedFrom, paths) ?? (paths.has(normalizeRelative(generatedFrom)) ? normalizeRelative(generatedFrom) : null);
        addRelationship({ confidence: targetFile ? 0.9 : 0.5, evidence: `${item.file.path} declares generated-from provenance.`, fromFile: item.file.path, fromSymbolId: null, toFile: targetFile, toSpecifier: generatedFrom, toSymbolId: null, type: "generated-from" });
      }
    }
  }
  for (const test of analyzed.filter((item) => item.file.role === "test")) {
    if (relationships.some((relationship) => relationship.type === "tests" && relationship.fromFile === test.file.path)) continue;
    const stem = path.posix.basename(test.file.path).replace(/(?:\.test|\.spec)?\.[^.]+$/, "").toLowerCase();
    const candidate = analyzed.find((item) => item.file.role === "source" && path.posix.basename(item.file.path).replace(/\.[^.]+$/, "").toLowerCase() === stem);
    if (candidate) addRelationship({ confidence: 0.55, evidence: `${test.file.path} shares a source filename with ${candidate.file.path}; import evidence was unavailable.`, fromFile: test.file.path, fromSymbolId: null, toFile: candidate.file.path, toSpecifier: null, toSymbolId: null, type: "tests" });
  }

  const packageImports = new Map<string, Set<string>>();
  for (const item of analyzed) {
    for (const imported of item.imports) {
      const packageName = packageNameFromSpecifier(imported.specifier);
      if (!packageName) continue;
      const references = packageImports.get(packageName) ?? new Set<string>();
      references.add(item.file.path);
      packageImports.set(packageName, references);
    }
  }
  const dependencies: RepositoryDependency[] = [];
  for (const record of packageRecords) {
    for (const dependency of record.dependencies) {
      dependencies.push({
        declaredAs: dependency.version.startsWith("workspace:") ? "workspace" : dependency.kind,
        installed: await fileInstalled(root, record.path, dependency.name),
        name: dependency.name,
        referencedBy: [...(packageImports.get(dependency.name) ?? [])].slice(0, 40),
        version: dependency.version,
        workspacePath: record.path
      });
    }
  }
  const scripts = packageRecords.flatMap((record) => Object.entries(record.scripts).map(([name, body]) => scriptMetadata(name, body, record.path)));
  const configuration: RepositoryManifest[] = analyzed
    .filter((item) => item.file.role === "config")
    .map((item) => ({ environmentVariables: environmentNames(item.text ?? ""), kind: manifestKind(item.file.path), path: item.file.path, workspacePath: item.file.packagePath }));
  const envNamesByFile = new Map<string, string[]>();
  for (const item of analyzed.filter((candidate) => candidate.text)) {
    const names = environmentNames(item.text!);
    if (names.length) envNamesByFile.set(item.file.path, names);
  }
  for (const [file, names] of envNamesByFile) {
    if (!configuration.some((manifest) => manifest.path === file)) configuration.push({ environmentVariables: names, kind: "environment-reference", path: file, workspacePath: analyzed.find((item) => item.file.path === file)?.file.packagePath ?? null });
  }
  const packageManagers = [
    paths.has("pnpm-lock.yaml") || paths.has("pnpm-workspace.yaml") ? "pnpm" : "",
    paths.has("package-lock.json") ? "npm" : "",
    paths.has("yarn.lock") ? "yarn" : "",
    paths.has("bun.lock") || paths.has("bun.lockb") ? "bun" : ""
  ].filter(Boolean);
  const languageCounts = new Map<string, number>();
  for (const item of analyzed) if (item.file.language) languageCounts.set(item.file.language, (languageCounts.get(item.file.language) ?? 0) + 1);
  const sourceRoots = [...new Set(analyzed.filter((item) => item.file.role === "source").map((item) => path.posix.dirname(item.file.path)).filter((directory) => directory !== "."))].sort().slice(0, 80);
  const testRoots = [...new Set(analyzed.filter((item) => item.file.role === "test").map((item) => path.posix.dirname(item.file.path)).filter((directory) => directory !== "."))].sort().slice(0, 80);
  const relevantUntracked = git.untracked.filter((file) => {
    const role = roleFor(file);
    return role === "source" || role === "test" || role === "config" || role === "generated";
  });
  const snapshotFingerprint = hash([
    git.revision ?? "no-revision",
    git.branch ?? "no-branch",
    ...git.modified,
    ...relevantUntracked,
    ...analyzed.map((item) => `${item.file.path}:${item.file.fingerprint}`)
  ].join("\n"));
  const partial = hitFileLimit || skippedLarge > 0 || analyzed.length >= limits.maxFiles || deepFilesRead >= limits.maxDeepFiles || textBytes >= limits.maxTextBytes;
  if (hitFileLimit) warnings.push(`Repository discovery exceeded the ${limits.maxFiles}-file metadata ceiling.`);
  if (skippedLarge) warnings.push(`${skippedLarge} oversized or deep-read-limited file(s) remained metadata-only.`);

  return {
    branch: git.branch,
    buildOutputPaths: [...buildOutputPaths].sort(),
    completeness: {
      deepFilesRead,
      discoveredFiles,
      reason: partial ? "One or more bounded inspection ceilings were reached." : null,
      skippedBinary,
      skippedLarge
    },
    configuration: configuration.sort((left, right) => left.path.localeCompare(right.path)),
    dependencies: dependencies.sort((left, right) => `${left.workspacePath}:${left.name}`.localeCompare(`${right.workspacePath}:${right.name}`)),
    detectedLanguages: [...languageCounts].map(([language, fileCount]) => ({ fileCount, language })).sort((left, right) => right.fileCount - left.fileCount),
    files: analyzed.map((item) => item.file).sort((left, right) => left.path.localeCompare(right.path)),
    fingerprint: snapshotFingerprint,
    frameworks,
    generatedPaths: [...generatedPaths].sort(),
    gitRevision: git.revision,
    ignoredPaths: [...ignoredPaths].sort(),
    inspectedAt: now.toISOString(),
    limits,
    modifiedTrackedFiles: git.modified,
    packageManagers,
    relationships,
    repositoryId: hash(path.resolve(root).toLowerCase()),
    repositoryRoot: root,
    routes: routes.sort((left, right) => left.route.localeCompare(right.route)),
    scripts,
    sourceRoots,
    status: partial ? "partial" : "complete",
    symbols,
    testRoots,
    untrackedRelevantFiles: relevantUntracked,
    vendorPaths: [...vendorPaths].sort(),
    warnings,
    workspaces,
    worktree: git.worktree
  };
}

function queryTokens(query: string) {
  return [...new Set(query.toLowerCase().split(/[^a-z0-9_$@.-]+/).filter((token) => token.length >= 2))].slice(0, 16);
}

const broadSearchTokens = new Set(["app", "code", "file", "project", "repository", "search", "src", "web", "workspace"]);

function resultKind(file: RepositoryFile, symbolMatch: boolean, routeMatch: boolean): RepositorySearchResult["kind"] {
  if (file.role === "generated" || file.role === "build-output") return "generated";
  if (file.role === "test") return "test";
  if (file.role === "config") return "config";
  if (routeMatch) return "route";
  if (symbolMatch) return "definition";
  return file.role === "source" ? "implementation" : "usage";
}

async function boundedText(snapshot: RepositorySnapshot, file: RepositoryFile) {
  if (file.textKind === "binary" || file.size > snapshot.limits.maxFileBytes) return null;
  const target = resolveRepositoryPath(snapshot.repositoryRoot, file.path);
  if (!target) return null;
  const targetReal = await realpath(target).catch(() => null);
  if (!targetReal || !isInside(snapshot.repositoryRoot, targetReal)) return null;
  return readFile(targetReal, "utf8").then((value) => value.slice(0, snapshot.limits.maxFileBytes)).catch(() => null);
}

export async function searchRepository(
  snapshot: RepositorySnapshot,
  input: { kind?: RepositorySearchKind; limit?: number; query: string; signal?: AbortSignal }
): Promise<RepositorySearchResult[]> {
  const query = input.query.trim().slice(0, 240);
  if (!query) return [];
  const kind = input.kind ?? "auto";
  const limit = Math.max(1, Math.min(input.limit ?? 12, 30));
  const tokens = queryTokens(query);
  const meaningfulTokens = tokens.filter((token) => !broadSearchTokens.has(token));
  const tokenHashes = tokens.map(hash);
  const lowered = query.toLowerCase();
  const symbolByFile = new Map<string, RepositorySymbol[]>();
  for (const symbol of snapshot.symbols) {
    const values = symbolByFile.get(symbol.file) ?? [];
    values.push(symbol);
    symbolByFile.set(symbol.file, values);
  }
  const routeByFile = new Map(snapshot.routes.map((route) => [route.file, route]));
  const candidates = snapshot.files
    .filter((file) => !file.ignored && file.role !== "vendor" && file.role !== "build-output")
    .map((file) => {
      const fileSymbols = symbolByFile.get(file.path) ?? [];
      const symbolMatches = fileSymbols.filter((symbol) => symbol.name.toLowerCase().includes(lowered) || meaningfulTokens.includes(symbol.name.toLowerCase()));
      const route = routeByFile.get(file.path);
      const pathText = file.path.toLowerCase();
      let score = file.authoritativeScore * 20;
      const evidence: string[] = [];
      if (pathText === lowered || pathText.endsWith(`/${lowered}`)) { score += 70; evidence.push("Exact path or filename match."); }
      const pathHits = tokens.filter((token) => pathText.includes(token)).length;
      if (pathHits) { score += pathHits * 12; evidence.push(`${pathHits} query token(s) match the path.`); }
      const indexedHits = tokenHashes.filter((tokenHash) => file.searchTokenHashes.includes(tokenHash)).length;
      if (indexedHits) { score += indexedHits * 8; evidence.push(`${indexedHits} query token(s) match the private bounded content index.`); }
      if (symbolMatches.length) { score += 55 + symbolMatches.length * 6; evidence.push(`Defines matching symbol(s): ${symbolMatches.map((symbol) => symbol.name).join(", ")}.`); }
      if (route && (route.route.toLowerCase().includes(lowered) || tokens.some((token) => route.route.toLowerCase().includes(token)))) { score += 50; evidence.push(`Defines route ${route.route}.`); }
      if (kind === "config" && file.role === "config") score += 35;
      if (kind === "filename" && path.posix.basename(pathText).includes(lowered)) score += 40;
      if (kind === "path" && pathText.includes(lowered)) score += 40;
      if (kind === "symbol" && symbolMatches.length) score += 40;
      if (kind === "route" && route) score += 30;
      if (file.role === "generated") score -= 35;
      if (file.role === "test") score -= kind === "exact" ? 0 : 8;
      return { evidence, file, route, score, symbolMatches };
    })
    .filter((candidate) => candidate.score > 8)
    .sort((left, right) => right.score - left.score || left.file.path.localeCompare(right.file.path))
    .slice(0, snapshot.limits.maxCandidateFiles);

  const results: RepositorySearchResult[] = [];
  for (const candidate of candidates) {
    abortIfNeeded(input.signal);
    let score = candidate.score;
    const evidence = [...candidate.evidence];
    if (["auto", "exact", "import"].includes(kind) || score < 55) {
      const text = await boundedText(snapshot, candidate.file);
      if (text) {
        const lowerText = text.toLowerCase();
        if (lowerText.includes(lowered)) { score += kind === "exact" ? 70 : 35; evidence.push("Exact text appears in the bounded source file."); }
        const contentHits = tokens.filter((token) => lowerText.includes(token)).length;
        if (contentHits) { score += contentHits * 4; evidence.push(`${contentHits} query token(s) appear in bounded source text.`); }
        if (kind === "import" && candidate.file.imports.some((specifier) => specifier.toLowerCase().includes(lowered))) { score += 50; evidence.push("Import specifier matches the query."); }
      }
    }
    if (!evidence.length) continue;
    results.push({
      authoritative: candidate.file.authoritativeScore >= 0.8,
      evidence: [...new Set(evidence)],
      file: candidate.file.path,
      kind: resultKind(candidate.file, candidate.symbolMatches.length > 0, Boolean(candidate.route)),
      matchedSymbols: candidate.symbolMatches.map((symbol) => symbol.name),
      score: Math.round(score * 100) / 100
    });
  }
  return results
    .sort((left, right) => right.score - left.score || left.file.localeCompare(right.file))
    .filter((result, index, values) => values.findIndex((candidate) => candidate.file === result.file) === index)
    .slice(0, limit);
}

export async function mapImplementationSurface(
  snapshot: RepositorySnapshot,
  input: { query: string; suspectedDomains?: string[]; symbolQuestions?: string[]; signal?: AbortSignal }
): Promise<ImplementationSurface> {
  const queries = [...(input.suspectedDomains ?? []), ...(input.symbolQuestions ?? []), input.query].filter(Boolean).slice(0, 8);
  const collected: RepositorySearchResult[] = [];
  for (const query of queries) collected.push(...await searchRepository(snapshot, { limit: 10, query, signal: input.signal }));
  const deduplicated = collected
    .sort((left, right) => right.score - left.score)
    .filter((result, index, values) => values.findIndex((candidate) => candidate.file === result.file) === index)
    .slice(0, 18);
  const authoritativeFiles = deduplicated.filter((result) => result.authoritative && !["config", "test"].includes(result.kind)).slice(0, 10).map((result) => result.file);
  const supportingFiles = deduplicated.filter((result) => !authoritativeFiles.includes(result.file)).slice(0, 12).map((result) => result.file);
  const directSet = new Set([...authoritativeFiles, ...supportingFiles]);
  const relatedTests = [...new Set(snapshot.relationships
    .filter((relationship) => relationship.type === "tests" && relationship.toFile && directSet.has(relationship.toFile))
    .map((relationship) => relationship.fromFile))].slice(0, 12);
  for (const result of deduplicated.filter((candidate) => candidate.kind === "test")) if (!relatedTests.includes(result.file)) relatedTests.push(result.file);
  const relatedRoutes = snapshot.routes.filter((route) => directSet.has(route.file)).slice(0, 12);
  const symbolTokens = queryTokens([input.query, ...(input.symbolQuestions ?? [])].join(" "))
    .filter((token) => !broadSearchTokens.has(token));
  const explicitSymbolNames = [...new Set((input.symbolQuestions ?? []).flatMap((question) =>
    Array.from(question.matchAll(/[A-Za-z_$][\w$]{7,}/g), (match) => match[0].toLowerCase())
  ))];
  const relatedSymbols = snapshot.symbols.filter((symbol) => directSet.has(symbol.file) && (
    deduplicated.find((result) => result.file === symbol.file)?.matchedSymbols.includes(symbol.name) ||
    symbolTokens.some((token) => symbol.name.toLowerCase().includes(token))
  )).sort((left, right) => {
    const leftExact = explicitSymbolNames.includes(left.name.toLowerCase()) ? 1 : 0;
    const rightExact = explicitSymbolNames.includes(right.name.toLowerCase()) ? 1 : 0;
    return rightExact - leftExact || left.file.localeCompare(right.file) || left.line - right.line;
  }).slice(0, 12);
  const lazySymbols = new Map<string, RepositorySymbol[]>();
  for (const filePath of [...directSet]) {
    if (relatedSymbols.length >= 20) break;
    const file = snapshot.files.find((candidate) => candidate.path === filePath);
    if (!file) continue;
    const text = await boundedText(snapshot, file);
    if (!text) continue;
    const discovered = extractSymbols(filePath, text, 240);
    lazySymbols.set(filePath, discovered);
    for (const symbol of discovered.filter((candidate) => explicitSymbolNames.includes(candidate.name.toLowerCase()))) {
      if (!relatedSymbols.some((candidate) => candidate.id === symbol.id)) relatedSymbols.push(symbol);
    }
  }
  for (const filePath of [...directSet]) {
    if (relatedSymbols.length >= 20) break;
    const file = snapshot.files.find((candidate) => candidate.path === filePath);
    if (!file) continue;
    const discovered = (lazySymbols.get(filePath) ?? []).filter((symbol) =>
      symbolTokens.some((token) => symbol.name.toLowerCase().includes(token))
    );
    for (const symbol of discovered) {
      if (relatedSymbols.length >= 20) break;
      if (!relatedSymbols.some((candidate) => candidate.id === symbol.id)) relatedSymbols.push(symbol);
    }
  }
  const configurationFiles = deduplicated.filter((result) => result.kind === "config").map((result) => result.file).slice(0, 8);
  const evidence = deduplicated.flatMap((result) => result.evidence.map((item) => `${result.file}: ${item}`)).slice(0, 24);
  const confidence = authoritativeFiles.length > 0
    ? Math.min(0.98, 0.62 + authoritativeFiles.length * 0.06 + (relatedSymbols.length ? 0.08 : 0) + (relatedTests.length ? 0.06 : 0))
    : deduplicated.length ? 0.45 : 0.1;
  return {
    authoritativeFiles,
    confidence,
    configurationFiles,
    evidence,
    query: input.query.slice(0, 240),
    relatedRoutes,
    relatedSymbols,
    relatedTests: relatedTests.slice(0, 12),
    status: authoritativeFiles.length ? "found" : deduplicated.length ? "partial" : "unavailable",
    supportingFiles,
    uncertainty: [
      snapshot.status !== "complete" ? "Repository snapshot is partial; undiscovered files may affect the surface." : "",
      authoritativeFiles.length === 0 ? "No authoritative implementation file was proven by the bounded search." : "",
      "Static relationships do not prove every runtime call path."
    ].filter(Boolean)
  };
}

export function mapChangeImpact(snapshot: RepositorySnapshot, surface: ImplementationSurface): ChangeImpact {
  const direct = new Set(surface.authoritativeFiles);
  const possibleIndirect = new Set<string>();
  const tests = new Set(surface.relatedTests);
  for (const relationship of snapshot.relationships) {
    if (relationship.toFile && direct.has(relationship.toFile)) {
      if (relationship.type === "tests") tests.add(relationship.fromFile);
      else if (["imports", "calls", "renders", "configures"].includes(relationship.type)) possibleIndirect.add(relationship.fromFile);
    }
  }
  for (const file of surface.supportingFiles) if (!direct.has(file) && !tests.has(file)) possibleIndirect.add(file);
  const workspaceCount = new Set([...direct, ...possibleIndirect].map((file) => snapshot.files.find((candidate) => candidate.path === file)?.packagePath ?? "")).size;
  const radius = direct.size === 0
    ? "unknown"
    : workspaceCount > 2 || possibleIndirect.size > 20
      ? "system-wide"
      : workspaceCount > 1 || possibleIndirect.size > 8
        ? "cross-feature"
        : possibleIndirect.size > 2 || direct.size > 2
          ? "feature"
          : "local";
  return {
    configurationImpact: surface.configurationFiles,
    directFiles: [...direct],
    directSymbols: surface.relatedSymbols.map((symbol) => symbol.id),
    possibleIndirectFiles: [...possibleIndirect].slice(0, 30),
    radius,
    routeImpact: surface.relatedRoutes.map((route) => route.route),
    schemaImpact: surface.configurationFiles.filter((file) => /(?:schema|migration|prisma|sql)/i.test(file)),
    testFiles: [...tests].slice(0, 20),
    uncertainty: [...surface.uncertainty, "Indirect impact is evidence-backed but remains possible until runtime verification."]
  };
}

export async function inspectRepositoryForRequest(
  snapshot: RepositorySnapshot,
  request: { goal: string; suspectedDomains: string[]; symbolQuestions: string[]; taskId: string },
  signal?: AbortSignal
): Promise<RepositoryInspectionResult> {
  const implementationSurface = await mapImplementationSurface(snapshot, {
    query: request.goal,
    signal,
    suspectedDomains: request.suspectedDomains,
    symbolQuestions: request.symbolQuestions
  });
  const changeImpact = mapChangeImpact(snapshot, implementationSurface);
  return {
    changeImpact,
    evidence: implementationSurface.evidence,
    implementationSurface,
    requestTaskId: request.taskId,
    snapshotFingerprint: snapshot.fingerprint,
    snapshotStatus: snapshot.status,
    warnings: [...snapshot.warnings, ...implementationSurface.uncertainty]
  };
}

async function lightweightFingerprint(snapshot: RepositorySnapshot) {
  const git = await gitState(snapshot.repositoryRoot);
  const relevantUntracked = git.untracked.filter((file) => ["source", "test", "config", "generated"].includes(roleFor(file)));
  const values = [git.revision ?? "no-revision", git.branch ?? "no-branch", ...git.modified, ...relevantUntracked];
  const changedPaths: string[] = [];
  const knownPaths = new Set(snapshot.files.map((file) => file.path));
  for (const file of relevantUntracked) if (!knownPaths.has(file)) changedPaths.push(file);
  for (const file of snapshot.files) {
    const target = resolveRepositoryPath(snapshot.repositoryRoot, file.path);
    const fileStat = target ? await stat(target).catch(() => null) : null;
    const current = fileStat ? hash(`${file.path}:${fileStat.size}:${fileStat.mtimeMs}`) : "missing";
    const previous = hash(`${file.path}:${file.size}:${new Date(file.modifiedAt).getTime()}`);
    if (current !== previous) changedPaths.push(file.path);
    values.push(`${file.path}:${current}`);
  }
  return { changedPaths, fingerprint: hash(values.join("\n")) };
}

export async function checkRepositoryStaleness(snapshot: RepositorySnapshot): Promise<RepositoryStaleness> {
  const current = await lightweightFingerprint(snapshot);
  const baselineValues = [
    snapshot.gitRevision ?? "no-revision",
    snapshot.branch ?? "no-branch",
    ...snapshot.modifiedTrackedFiles,
    ...snapshot.untrackedRelevantFiles,
    ...snapshot.files.map((file) => `${file.path}:${hash(`${file.path}:${file.size}:${new Date(file.modifiedAt).getTime()}`)}`)
  ];
  const previousFingerprint = hash(baselineValues.join("\n"));
  return {
    changedPaths: current.changedPaths,
    currentFingerprint: current.fingerprint,
    previousFingerprint,
    stale: current.fingerprint !== previousFingerprint
  };
}

async function analyzeChangedFile(root: string, relativePath: string, limits: RepositoryLimits): Promise<AnalyzedFile | null> {
  const target = resolveRepositoryPath(root, relativePath);
  if (!target) return null;
  const targetStat = await lstat(target).catch(() => null);
  if (!targetStat?.isFile() || targetStat.isSymbolicLink()) return null;
  const targetReal = await realpath(target).catch(() => null);
  if (!targetReal || !isInside(root, targetReal)) return null;
  const extension = path.extname(relativePath).toLowerCase();
  let role = roleFor(relativePath);
  let text: string | null = null;
  let textKind: RepositoryFile["textKind"] = "unknown";
  let symbols: RepositorySymbol[] = [];
  let imports: ParsedImport[] = [];
  const canRead = textExtensions.has(extension) || role === "config" || extension === "";
  if (canRead && targetStat.size <= limits.maxFileBytes) {
    const bytes = await readFile(targetReal);
    if (looksBinary(bytes)) {
      textKind = "binary";
    } else {
      text = bytes.toString("utf8");
      textKind = "text";
      if (/^\s*(?:\/\/|\/\*)[^\n]{0,80}(?:generated|do not edit)/i.test(text) && role === "source") role = "generated";
      symbols = extractSymbols(relativePath, text, limits.maxSymbols);
      imports = extractImports(text);
    }
  } else {
    textKind = canRead ? "oversized" : "binary";
  }
  return {
    file: {
      authoritativeScore: authoritativeScore(role),
      extension,
      fingerprint: hash(`${relativePath}:${targetStat.size}:${targetStat.mtimeMs}:${text ? hash(text) : "metadata"}`),
      ignored: false,
      imports: imports.map((candidate) => candidate.specifier).slice(0, 80),
      language: languageFor(extension),
      modifiedAt: new Date(targetStat.mtimeMs).toISOString(),
      packagePath: null,
      path: relativePath,
      role,
      searchTokenHashes: privateSearchTokenHashes(text),
      size: targetStat.size,
      symbolIds: symbols.map((symbol) => symbol.id),
      textKind
    },
    imports,
    symbols,
    text
  };
}

function changedFileRelationships(
  item: AnalyzedFile,
  paths: Set<string>,
  symbols: RepositorySymbol[],
  limit: number
) {
  const relationships: RepositoryRelationship[] = [];
  const add = (relationship: Omit<RepositoryRelationship, "id">) => {
    if (relationships.length >= limit) return;
    const target = relationship.toFile ?? relationship.toSpecifier ?? relationship.toSymbolId ?? "unknown";
    const id = relationshipId(relationship.type, `${relationship.fromFile}:${relationship.fromSymbolId ?? ""}`, target);
    if (!relationships.some((candidate) => candidate.id === id)) relationships.push({ ...relationship, id });
  };
  for (const imported of item.imports) {
    const targetFile = resolveRelativeImport(item.file.path, imported.specifier, paths);
    add({
      confidence: targetFile ? 1 : 0.85,
      evidence: `${item.file.path} ${imported.exported ? "re-exports" : "imports"} ${imported.specifier}.`,
      fromFile: item.file.path,
      fromSymbolId: null,
      toFile: targetFile,
      toSpecifier: imported.specifier,
      toSymbolId: null,
      type: imported.exported ? "exports" : "imports"
    });
    if (targetFile && item.file.role === "test") {
      add({ confidence: 0.95, evidence: `Test file ${item.file.path} imports ${targetFile}.`, fromFile: item.file.path, fromSymbolId: null, toFile: targetFile, toSpecifier: imported.specifier, toSymbolId: null, type: "tests" });
    }
    if (targetFile && item.file.role === "config") {
      add({ confidence: 0.85, evidence: `Configuration ${item.file.path} references ${targetFile}.`, fromFile: item.file.path, fromSymbolId: null, toFile: targetFile, toSpecifier: imported.specifier, toSymbolId: null, type: "configures" });
    }
    if (!targetFile || !item.text) continue;
    for (const name of imported.names.slice(0, 20)) {
      const targetSymbol = symbols.find((candidate) => candidate.file === targetFile && candidate.name === name);
      if (!targetSymbol) continue;
      if (new RegExp(`\\b${name.replace(/[$]/g, "\\$")}\\s*\\(`).test(item.text)) {
        add({ confidence: 0.8, evidence: `${item.file.path} imports and invokes ${name}.`, fromFile: item.file.path, fromSymbolId: null, toFile: targetFile, toSpecifier: imported.specifier, toSymbolId: targetSymbol.id, type: "calls" });
      }
      if (new RegExp(`<${name}(?:\\s|/?>)`).test(item.text)) {
        add({ confidence: 0.9, evidence: `${item.file.path} imports and renders ${name}.`, fromFile: item.file.path, fromSymbolId: null, toFile: targetFile, toSpecifier: imported.specifier, toSymbolId: targetSymbol.id, type: "renders" });
      }
    }
  }
  return relationships;
}

export async function refreshRepositorySnapshot(
  previous: RepositorySnapshot,
  changedPaths: string[],
  options: InspectOptions = {}
) {
  const bounded = [...new Set(changedPaths.map(normalizeRelative))].filter((candidate) => resolveRepositoryPath(previous.repositoryRoot, candidate)).slice(0, 40);
  const requiresFullRefresh = bounded.length === 0 || bounded.length > 20 || bounded.some((file) => configNames.test(file) || /(?:^|\/)package\.json$|lock|workspace|tsconfig/i.test(file));
  if (requiresFullRefresh) return { mode: "full" as const, snapshot: await inspectRepository(previous.repositoryRoot, options) };

  abortIfNeeded(options.signal);
  const changed = new Set(bounded);
  const refreshed = (await Promise.all(bounded.map((file) => analyzeChangedFile(previous.repositoryRoot, file, previous.limits))))
    .filter((item): item is AnalyzedFile => item !== null);
  const workspacePaths = previous.workspaces.map((workspace) => workspace.path).sort((left, right) => right.length - left.length);
  for (const item of refreshed) {
    item.file.packagePath = workspacePaths.find((workspacePath) => !workspacePath || item.file.path === workspacePath || item.file.path.startsWith(`${workspacePath}/`)) ?? null;
  }
  const files = [
    ...previous.files.filter((file) => !changed.has(file.path)),
    ...refreshed.map((item) => item.file)
  ].sort((left, right) => left.path.localeCompare(right.path));
  const symbols = [
    ...previous.symbols.filter((symbol) => !changed.has(symbol.file)),
    ...refreshed.flatMap((item) => item.symbols)
  ].slice(0, previous.limits.maxSymbols);
  const paths = new Set(files.map((file) => file.path));
  const refreshedRelationships = refreshed.flatMap((item) => changedFileRelationships(item, paths, symbols, previous.limits.maxRelationships));
  const relationships = [
    ...previous.relationships.filter((relationship) => !changed.has(relationship.fromFile) && (!relationship.toFile || paths.has(relationship.toFile))),
    ...refreshedRelationships
  ].filter((relationship, index, values) => values.findIndex((candidate) => candidate.id === relationship.id) === index)
    .slice(0, previous.limits.maxRelationships);
  const routes = [
    ...previous.routes.filter((route) => !changed.has(route.file)),
    ...refreshed.map((item) => routeForFile(item.file.path, item.symbols)).filter((route): route is RepositoryRoute => route !== null)
  ].sort((left, right) => left.route.localeCompare(right.route));
  const configuration = [
    ...previous.configuration.filter((entry) => !changed.has(entry.path)),
    ...refreshed.flatMap((item) => {
      const names = environmentNames(item.text ?? "");
      if (item.file.role === "config") return [{ environmentVariables: names, kind: manifestKind(item.file.path), path: item.file.path, workspacePath: item.file.packagePath }];
      return names.length ? [{ environmentVariables: names, kind: "environment-reference", path: item.file.path, workspacePath: item.file.packagePath }] : [];
    })
  ].sort((left, right) => left.path.localeCompare(right.path));
  const git = await gitState(previous.repositoryRoot);
  const relevantUntracked = git.untracked.filter((file) => ["source", "test", "config", "generated"].includes(roleFor(file)));
  const languageCounts = new Map<string, number>();
  for (const file of files) if (file.language) languageCounts.set(file.language, (languageCounts.get(file.language) ?? 0) + 1);
  const fingerprint = hash([
    git.revision ?? "no-revision",
    git.branch ?? "no-branch",
    ...git.modified,
    ...relevantUntracked,
    ...files.map((file) => `${file.path}:${file.fingerprint}`)
  ].join("\n"));
  const snapshot: RepositorySnapshot = {
    ...previous,
    branch: git.branch,
    configuration,
    completeness: {
      ...previous.completeness,
      discoveredFiles: Math.max(
        0,
        previous.completeness.discoveredFiles - previous.files.filter((file) => changed.has(file.path)).length + refreshed.length
      )
    },
    detectedLanguages: [...languageCounts].map(([language, fileCount]) => ({ fileCount, language })).sort((left, right) => right.fileCount - left.fileCount),
    files,
    fingerprint,
    generatedPaths: files.filter((file) => file.role === "generated").map((file) => file.path),
    gitRevision: git.revision,
    inspectedAt: (options.now?.() ?? new Date()).toISOString(),
    modifiedTrackedFiles: git.modified,
    relationships,
    routes,
    sourceRoots: [...new Set(files.filter((file) => file.role === "source").map((file) => path.posix.dirname(file.path)).filter((directory) => directory !== "."))].sort().slice(0, 80),
    symbols,
    testRoots: [...new Set(files.filter((file) => file.role === "test").map((file) => path.posix.dirname(file.path)).filter((directory) => directory !== "."))].sort().slice(0, 80),
    untrackedRelevantFiles: relevantUntracked,
    warnings: [...previous.warnings.filter((warning) => !warning.startsWith("Incremental refresh")), `Incremental refresh updated ${bounded.length} changed path(s) without rebuilding the repository index.`],
    worktree: git.worktree
  };
  return { mode: "incremental" as const, snapshot };
}

export function publicRepositorySummary(snapshot: RepositorySnapshot) {
  return {
    branch: snapshot.branch,
    fileCount: snapshot.files.length,
    fingerprint: snapshot.fingerprint,
    frameworks: snapshot.frameworks,
    languages: snapshot.detectedLanguages.slice(0, 8),
    packageManagers: snapshot.packageManagers,
    repositoryId: snapshot.repositoryId,
    revision: snapshot.gitRevision,
    status: snapshot.status,
    workspaces: snapshot.workspaces.map((workspace) => ({ kind: workspace.kind, name: workspace.name, path: workspace.path })),
    worktree: snapshot.worktree
  };
}
