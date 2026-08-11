import { CapabilityPackRegistry } from "./capability-pack-registry";
import type { CapabilityEvidence, CapabilityPack } from "./capability-types";
import type { RepositorySnapshot } from "../repository-intelligence/repository-intelligence-types";

type PackDefinition = Omit<CapabilityPack, "detect"> & {
  languageLabels: string[];
};

function normalizedName(file: string) {
  return file.replace(/\\/g, "/").split("/").at(-1)?.toLowerCase() ?? "";
}

function matchesManifest(filename: string, pattern: string) {
  const normalized = pattern.toLowerCase();
  if (normalized.startsWith("*") && filename.endsWith(normalized.slice(1))) return true;
  if (normalized.endsWith("*") && filename.startsWith(normalized.slice(0, -1))) return true;
  return filename === normalized;
}

function repositoryDetector(definition: PackDefinition) {
  return (snapshot: RepositorySnapshot) => {
    const extensionFiles = snapshot.files.filter((file) => definition.fileExtensions.includes(file.extension.toLowerCase()));
    const manifestFiles = snapshot.files.filter((file) => definition.manifestNames.some((manifest) => matchesManifest(normalizedName(file.path), manifest)));
    const languageCount = snapshot.detectedLanguages
      .filter((entry) => definition.languageLabels.includes(entry.language))
      .reduce((total, entry) => total + entry.fileCount, 0);
    if (!extensionFiles.length && !manifestFiles.length && languageCount === 0) return null;
    const evidence: CapabilityEvidence[] = [];
    for (const file of manifestFiles.slice(0, 6)) {
      evidence.push({ confidence: 0.98, detail: `${definition.id} manifest detected.`, source: "manifest", sourceRef: file.path });
    }
    if (extensionFiles.length || languageCount) {
      evidence.push({
        confidence: manifestFiles.length ? 0.9 : 0.78,
        detail: `${Math.max(extensionFiles.length, languageCount)} matching repository file(s) detected.`,
        source: "repository",
        sourceRef: extensionFiles[0]?.path ?? null
      });
    }
    const confidence = Math.min(0.99, (manifestFiles.length ? 0.84 : 0.66) + Math.min(0.12, extensionFiles.length * 0.01));
    return { confidence, evidence, packId: definition.id, status: "detected" as const };
  };
}

function pack(definition: PackDefinition): CapabilityPack {
  return { ...definition, detect: repositoryDetector(definition) };
}

export const builtInCapabilityPacks: CapabilityPack[] = [
  pack({
    deepAnalysis: "symbols-and-routes", fileExtensions: [".cjs", ".js", ".jsx", ".mjs", ".ts", ".tsx"], id: "typescript-javascript",
    kinds: ["language", "runtime", "package-manager", "build-tool", "test-tool", "lint-tool", "formatter", "compiler"],
    languageLabels: ["JavaScript", "JavaScript JSX", "TypeScript", "TypeScript JSX"],
    limitations: ["Static call relationships remain evidence-backed approximations, not runtime traces."],
    manifestNames: ["package.json", "pnpm-workspace.yaml", "tsconfig.json"], supportedLanguages: ["JavaScript", "TypeScript"], version: "1"
  }),
  pack({
    deepAnalysis: "limited", fileExtensions: [".py"], id: "python", kinds: ["language", "interpreter", "package-manager", "build-tool", "test-tool", "lint-tool", "formatter"],
    languageLabels: ["Python"], limitations: ["Python symbols are metadata-level in I3.", "A virtual environment isolates dependencies; it is not a security sandbox."],
    manifestNames: ["pyproject.toml", "requirements*", "setup.py", "setup.cfg", "pipfile", "poetry.lock", "uv.lock"], supportedLanguages: ["Python"], version: "1"
  }),
  pack({ deepAnalysis: "metadata", fileExtensions: [".rs"], id: "rust", kinds: ["language", "compiler", "build-tool", "package-manager", "test-tool"], languageLabels: ["Rust"], limitations: ["Deep Rust symbols are not implemented in I3."], manifestNames: ["cargo.toml"], supportedLanguages: ["Rust"], version: "1" }),
  pack({ deepAnalysis: "metadata", fileExtensions: [".go"], id: "go", kinds: ["language", "compiler", "build-tool", "test-tool"], languageLabels: ["Go"], limitations: ["Deep Go symbols are not implemented in I3."], manifestNames: ["go.mod"], supportedLanguages: ["Go"], version: "1" }),
  pack({ deepAnalysis: "metadata", fileExtensions: [".java", ".kt", ".kts"], id: "jvm", kinds: ["language", "runtime", "compiler", "build-tool", "test-tool"], languageLabels: ["Java", "Kotlin"], limitations: ["Deep JVM symbols are not implemented in I3."], manifestNames: ["pom.xml", "build.gradle", "build.gradle.kts", "settings.gradle", "settings.gradle.kts"], supportedLanguages: ["Java", "Kotlin"], version: "1" }),
  pack({ deepAnalysis: "metadata", fileExtensions: [".cs"], id: "dotnet", kinds: ["language", "runtime", "compiler", "build-tool", "test-tool"], languageLabels: ["C#"], limitations: ["Deep .NET symbols are not implemented in I3."], manifestNames: ["*.csproj", "*.sln"], supportedLanguages: ["C#"], version: "1" }),
  pack({ deepAnalysis: "metadata", fileExtensions: [".c", ".cc", ".cpp", ".h", ".hpp"], id: "c-cpp", kinds: ["language", "compiler", "build-tool", "test-tool"], languageLabels: ["C", "C++", "C/C++ Header", "C++ Header"], limitations: ["Deep C/C++ symbols are not implemented in I3."], manifestNames: ["cmakelists.txt", "makefile"], supportedLanguages: ["C", "C++"], version: "1" }),
  pack({ deepAnalysis: "metadata", fileExtensions: [".php"], id: "php", kinds: ["language", "interpreter", "package-manager", "test-tool"], languageLabels: ["PHP"], limitations: ["Deep PHP symbols are not implemented in I3."], manifestNames: ["composer.json"], supportedLanguages: ["PHP"], version: "1" }),
  pack({ deepAnalysis: "metadata", fileExtensions: [".rb"], id: "ruby", kinds: ["language", "interpreter", "package-manager", "test-tool"], languageLabels: ["Ruby"], limitations: ["Deep Ruby symbols are not implemented in I3."], manifestNames: ["gemfile"], supportedLanguages: ["Ruby"], version: "1" }),
  pack({ deepAnalysis: "metadata", fileExtensions: [".ps1", ".sh"], id: "shell", kinds: ["language", "interpreter", "utility-tool"], languageLabels: ["PowerShell", "Shell"], limitations: ["Shell files are classified only; no command is executed in I3."], manifestNames: [], supportedLanguages: ["PowerShell", "Shell"], version: "1" }),
  pack({ deepAnalysis: "metadata", fileExtensions: [".sql"], id: "sql", kinds: ["language", "utility-tool"], languageLabels: ["SQL"], limitations: ["Database dialect and runtime availability may remain unknown."], manifestNames: [], supportedLanguages: ["SQL"], version: "1" })
];

export function createBuiltInCapabilityPackRegistry() {
  const registry = new CapabilityPackRegistry();
  for (const capabilityPack of builtInCapabilityPacks) registry.register(capabilityPack);
  return registry;
}
