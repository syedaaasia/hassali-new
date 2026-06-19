import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { buildExecutablePreviewRuntime } from "@/lib/server/preview/executable-preview-runtime";
import type { RuntimeFileAnalysis } from "@/lib/server/runtime/live-runtime-types";

const maxFiles = 300;
const maxFileBytes = 140_000;
const ignoredDirs = new Set([
  ".git",
  ".hassali-git",
  ".next",
  ".turbo",
  "build",
  "coverage",
  "dist",
  "node_modules"
]);
const readablePattern = /\.(?:astro|cs|csproj|css|dart|gradle|go|html|java|js|json|jsx|kt|md|php|prisma|py|sql|svelte|swift|toml|ts|tsx|vue|xml|yaml|yml)$/i;
const keyFileNames = new Set([
  "androidmanifest.xml",
  "app.json",
  "angular.json",
  "build.gradle",
  "build.gradle.kts",
  "capacitor.config.json",
  "capacitor.config.ts",
  "composer.json",
  "components.json",
  "database.yml",
  "drizzle.config.js",
  "drizzle.config.ts",
  "go.mod",
  "ionic.config.json",
  "manage.py",
  "next.config.js",
  "next.config.mjs",
  "next.config.ts",
  "package.json",
  "pom.xml",
  "pubspec.yaml",
  "pyproject.toml",
  "requirements.txt",
  "schema.prisma",
  "svelte.config.js",
  "tailwind.config.js",
  "tailwind.config.ts",
  "tsconfig.json",
  "vite.config.js",
  "vite.config.ts"
]);

function normalizePath(value: string) {
  return value.replace(/\\/g, "/").replace(/^\/+/, "");
}

function safeResolve(root: string, relativePath: string) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relativePath);

  return resolved === resolvedRoot || resolved.startsWith(`${resolvedRoot}${path.sep}`)
    ? resolved
    : null;
}

function shouldRead(relativePath: string) {
  const normalized = normalizePath(relativePath);
  const fileName = normalized.split("/").pop()?.toLowerCase() ?? "";

  return readablePattern.test(normalized) || keyFileNames.has(fileName);
}

async function walk(root: string, dir = "", collected: string[] = []): Promise<string[]> {
  if (collected.length >= maxFiles) {
    return collected;
  }

  const absolute = safeResolve(root, dir);

  if (!absolute) {
    return collected;
  }

  const entries = await readdir(absolute, { withFileTypes: true }).catch(() => []);

  for (const entry of entries) {
    if (collected.length >= maxFiles) break;

    const relativePath = normalizePath(path.join(dir, entry.name));

    if (entry.isDirectory()) {
      if (!ignoredDirs.has(entry.name.toLowerCase())) {
        await walk(root, relativePath, collected);
      }
      continue;
    }

    if (entry.isFile() && shouldRead(relativePath)) {
      collected.push(relativePath);
    }
  }

  return collected;
}

async function readWorkspaceFiles(root: string, writtenFiles: string[]) {
  const discovered = await walk(root);
  const candidates = Array.from(new Set([...writtenFiles.map(normalizePath), ...discovered]))
    .filter(shouldRead)
    .slice(0, maxFiles);
  const files: Record<string, string> = {};

  for (const relativePath of candidates) {
    const absolute = safeResolve(root, relativePath);

    if (!absolute) continue;

    const fileStat = await stat(absolute).catch(() => null);

    if (!fileStat?.isFile() || fileStat.size > maxFileBytes) continue;

    files[relativePath] = await readFile(absolute, "utf8").catch(() => "");
  }

  return files;
}

function textFromFiles(files: Record<string, string>) {
  return Object.entries(files)
    .map(([filePath, content]) => `${filePath}\n${content.slice(0, 5000)}`)
    .join("\n")
    .toLowerCase();
}

function namesMatching(files: string[], pattern: RegExp) {
  return files
    .filter((filePath) => pattern.test(filePath))
    .map((filePath) => normalizePath(filePath))
    .slice(0, 12);
}

function terms(text: string, values: string[]) {
  return values.filter((value) => text.includes(value.toLowerCase()));
}

function routeFromPath(filePath: string) {
  const normalized = normalizePath(filePath)
    .replace(/\.(?:astro|html|js|jsx|svelte|ts|tsx|vue)$/i, "")
    .replace(/\/index$/i, "")
    .replace(/^src\/pages/i, "")
    .replace(/^pages/i, "")
    .replace(/^app/i, "")
    .replace(/\/page$/i, "")
    .replace(/^src\/routes/i, "");

  return normalized ? `/${normalized.replace(/^\/+/, "")}` : "/";
}

function endpointsFromContent(text: string) {
  const matches = Array.from(text.matchAll(/\b(?:app|router)\.(get|post|put|patch|delete)\(["'`]([^"'`]+)["'`]/g));

  return matches.map((match) => `${match[1]?.toUpperCase()} ${match[2]}`).slice(0, 12);
}

export async function analyzeRuntimeFiles(input: {
  workspaceRoot: string;
  writtenFiles: string[];
}): Promise<RuntimeFileAnalysis> {
  const generatedFiles = await readWorkspaceFiles(input.workspaceRoot, input.writtenFiles);
  const filePaths = Object.keys(generatedFiles);
  const text = textFromFiles(generatedFiles);
  const executablePreview = buildExecutablePreviewRuntime({
    generatedFiles
  });
  const routeFiles = namesMatching(filePaths, /(?:^|\/)(app|pages|src\/pages|src\/routes|routes)\/.*\.(?:astro|js|jsx|svelte|ts|tsx|vue|html)$/i);
  const apiRouteFiles = namesMatching(filePaths, /(?:^|\/)(api|routes|server)\/.*\.(?:js|ts)$/i);
  const screenFiles = namesMatching(filePaths, /(?:screen|page|view|activity|fragment|contentview|app\.(?:tsx|jsx))\.(?:dart|java|js|jsx|kt|swift|ts|tsx|xml)$/i);
  const components = namesMatching(filePaths, /(?:^|\/)(components|src\/components|app\/components)\/.*\.(?:astro|js|jsx|svelte|ts|tsx|vue)$/i)
    .map((filePath) => filePath.split("/").pop()?.replace(/\.(?:astro|js|jsx|svelte|ts|tsx|vue)$/i, "") ?? filePath);
  const endpoints = [
    ...apiRouteFiles.map(routeFromPath),
    ...endpointsFromContent(text)
  ].slice(0, 12);

  return {
    analysisStatus: filePaths.length > 0 ? "ready" : "empty",
    analyzedFiles: filePaths,
    charts: terms(text, ["chart", "recharts", "bar chart", "line chart", "analytics"]),
    components,
    confidence: executablePreview.confidence,
    endpoints,
    forms: terms(text, ["<form", "useform", "textfield", "input", "formcontrol"]),
    framework: String(executablePreview.framework),
    generatedFiles,
    navigation: terms(text, ["nav", "sidebar", "tabs", "bottomnavigation", "navigationstack", "router"]),
    pages: namesMatching(filePaths, /(?:^|\/)(app|pages|src\/pages)\/.*\.(?:astro|html|js|jsx|ts|tsx|vue)$/i).map(routeFromPath),
    routes: routeFiles.map(routeFromPath),
    screens: screenFiles.map((filePath) => filePath.split("/").pop()?.replace(/\.[^.]+$/i, "") ?? filePath),
    services: namesMatching(filePaths, /(?:service|schema|database|db|repository|client)\.(?:js|ts|prisma|sql)$/i),
    tables: terms(text, ["<table", "datatable", "table", "columns"]),
    warnings: filePaths.length > 0 ? [] : ["No runtime files were available for live preview analysis."]
  };
}
