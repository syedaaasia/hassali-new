import { readFile, stat } from "node:fs/promises";
import path from "node:path";

export type IntelligenceProductMode = "ASK" | "CODE" | "WEBSITE";
export type SkillAuthority = "hassali_core" | "plugin" | "project" | "user";

export type SkillResource = {
  matchTerms: string[];
  path: string;
  required?: boolean;
};

export type SkillMetadata = {
  adaptation: "adapted" | "direct" | "hassali_native";
  allowedModes: IntelligenceProductMode[];
  assets?: SkillResource[];
  authority: SkillAuthority;
  description: string;
  id: string;
  instructionPath: string;
  scripts?: SkillResource[];
  semanticTriggers: string[];
  source: string;
  sourceDocuments: string[];
  sourceFamilies: Array<"anthropic_claude_code" | "hassali" | "openai_codex">;
  version: string;
};

export type LoadedSkillResource = {
  content: string;
  kind: "asset" | "reference" | "script";
  path: string;
};

export type LoadedSkill = {
  body: string;
  metadata: SkillMetadata;
  resources: LoadedSkillResource[];
};

export type SkillSelectionResult = {
  collisions: string[];
  explicitSkillIds: string[];
  loadedSkills: LoadedSkill[];
  missingSkillIds: string[];
  rejectedSkills: string[];
  selectedSkillIds: string[];
  warnings: string[];
};

export type SelectSkillsInput = {
  additionalSkills?: SkillMetadata[];
  mode: IntelligenceProductMode;
  prompt: string;
};

const authorityRank: Record<SkillAuthority, number> = {
  plugin: 0,
  hassali_core: 1,
  project: 2,
  user: 3
};

const skillRootCandidates = [
  path.resolve(process.cwd(), "src/lib/server/intelligence/skills"),
  path.resolve(process.cwd(), "apps/web/src/lib/server/intelligence/skills")
];

const coreSkills: SkillMetadata[] = [
  {
    adaptation: "adapted",
    allowedModes: ["WEBSITE"],
    assets: [{ matchTerms: ["acceptance", "build", "website"], path: "website-build/assets/acceptance-checklist.md" }],
    authority: "hassali_core",
    description: "Plans a complete approval-first WEBSITE artifact from a new site request.",
    id: "website-build",
    instructionPath: "website-build/SKILL.md",
    semanticTriggers: ["build website", "create website", "new website", "landing page", "web site"],
    source: "hassali",
    sourceDocuments: ["OpenAI Codex website-building guidance", "Hassali WEBSITE contract"],
    sourceFamilies: ["hassali", "openai_codex"],
    version: "1.0.0"
  },
  {
    adaptation: "adapted",
    allowedModes: ["WEBSITE"],
    authority: "hassali_core",
    description: "Scopes a WEBSITE edit while preserving existing site identity and unrelated files.",
    id: "website-edit",
    instructionPath: "website-edit/SKILL.md",
    semanticTriggers: ["edit website", "change page", "update hero", "replace footer", "redesign page"],
    source: "hassali",
    sourceDocuments: ["OpenAI Codex website-editing guidance", "Hassali WEBSITE contract"],
    sourceFamilies: ["hassali", "openai_codex"],
    version: "1.0.0"
  },
  {
    adaptation: "adapted",
    allowedModes: ["CODE"],
    authority: "hassali_core",
    description: "Plans an approval-first application or code-system build.",
    id: "code-build",
    instructionPath: "code-build/SKILL.md",
    semanticTriggers: ["build app", "create api", "create application", "react app", "python app"],
    source: "hassali",
    sourceDocuments: ["OpenAI Codex engineering workflow", "Hassali approval contract"],
    sourceFamilies: ["hassali", "openai_codex"],
    version: "1.0.0"
  },
  {
    adaptation: "adapted",
    allowedModes: ["ASK", "CODE", "WEBSITE"],
    authority: "hassali_core",
    description: "Diagnoses errors from evidence before proposing the smallest correction.",
    id: "debug",
    instructionPath: "debug/SKILL.md",
    semanticTriggers: ["debug", "crash", "error", "exception", "not working", "fails", "broken"],
    source: "hassali",
    sourceDocuments: ["Anthropic Claude Code debug skill", "OpenAI Codex engineering workflow"],
    sourceFamilies: ["anthropic_claude_code", "hassali", "openai_codex"],
    version: "1.0.0"
  },
  {
    adaptation: "adapted",
    allowedModes: ["ASK", "CODE", "WEBSITE"],
    authority: "hassali_core",
    description: "Reviews changes for correctness, regressions, safety, and missing tests.",
    id: "code-review",
    instructionPath: "code-review/SKILL.md",
    semanticTriggers: ["code review", "review changes", "review diff", "audit code", "review implementation"],
    source: "hassali",
    sourceDocuments: ["Anthropic Claude Code code-review skill", "OpenAI Codex auto-review guidance"],
    sourceFamilies: ["anthropic_claude_code", "hassali", "openai_codex"],
    version: "1.0.0"
  },
  {
    adaptation: "adapted",
    allowedModes: ["ASK", "CODE", "WEBSITE"],
    authority: "hassali_core",
    description: "Verifies behavior at the real runtime surface using direct evidence.",
    id: "verify",
    instructionPath: "verify/SKILL.md",
    scripts: [{ matchTerms: ["evidence", "verify", "test"], path: "verify/scripts/check-evidence.mjs" }],
    semanticTriggers: ["verify", "prove", "test result", "acceptance test", "regression test"],
    source: "hassali",
    sourceDocuments: ["Anthropic Claude Code verify skill", "OpenAI Codex verification guidance"],
    sourceFamilies: ["anthropic_claude_code", "hassali", "openai_codex"],
    version: "1.0.0"
  },
  {
    adaptation: "adapted",
    allowedModes: ["ASK", "CODE", "WEBSITE"],
    authority: "hassali_core",
    description: "Simplifies an implementation without changing its intended behavior.",
    id: "simplify",
    instructionPath: "simplify/SKILL.md",
    semanticTriggers: ["simplify", "reduce complexity", "remove duplication", "make cleaner"],
    source: "hassali",
    sourceDocuments: ["Anthropic Claude Code simplify skill"],
    sourceFamilies: ["anthropic_claude_code", "hassali", "openai_codex"],
    version: "1.0.0"
  },
  {
    adaptation: "adapted",
    allowedModes: ["ASK", "CODE", "WEBSITE"],
    authority: "hassali_core",
    description: "Reviews trust boundaries, secret handling, authorization, and unsafe effects.",
    id: "security-review",
    instructionPath: "security-review/SKILL.md",
    semanticTriggers: ["security review", "threat model", "vulnerability", "auth audit", "secret exposure"],
    source: "hassali",
    sourceDocuments: ["Anthropic Claude Code security-review skill", "OpenAI Codex security guidance"],
    sourceFamilies: ["anthropic_claude_code", "hassali", "openai_codex"],
    version: "1.0.0"
  },
  {
    adaptation: "adapted",
    allowedModes: ["ASK"],
    authority: "hassali_core",
    description: "Researches a question with source discipline and clear fact status.",
    id: "research",
    instructionPath: "research/SKILL.md",
    semanticTriggers: ["research", "latest", "compare sources", "find evidence", "investigate market"],
    source: "hassali",
    sourceDocuments: ["Anthropic research instructions", "OpenAI deep-research guidance"],
    sourceFamilies: ["anthropic_claude_code", "hassali", "openai_codex"],
    version: "1.0.0"
  },
  {
    adaptation: "adapted",
    allowedModes: ["ASK", "CODE", "WEBSITE"],
    authority: "hassali_core",
    description: "Checks rendered browser behavior, interaction, console health, and responsive layout.",
    id: "browser-verify",
    instructionPath: "browser-verify/SKILL.md",
    semanticTriggers: ["browser verify", "test in browser", "ui test", "responsive test", "visual regression"],
    source: "hassali",
    sourceDocuments: ["OpenAI Codex control-in-app-browser", "OpenAI Codex computer-use", "Anthropic browser guidance"],
    sourceFamilies: ["anthropic_claude_code", "hassali", "openai_codex"],
    version: "1.0.0"
  }
];

const bodyCache = new Map<string, { body: string; modifiedMs: number }>();

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function containsTrigger(prompt: string, trigger: string) {
  const promptTokens = normalize(prompt).split(" ").filter(Boolean);
  const triggerTokens = normalize(trigger).split(" ").filter(Boolean);
  if (!triggerTokens.length) return false;
  if (triggerTokens.length === 1) {
    return promptTokens.some((token) =>
      token === triggerTokens[0] ||
      (token.startsWith(triggerTokens[0]) && /^(?:s|es|ed|ing)$/.test(token.slice(triggerTokens[0].length)))
    );
  }

  const contiguous = promptTokens.some((_, index) =>
    triggerTokens.every((token, offset) => promptTokens[index + offset] === token)
  );
  return contiguous || triggerTokens.every((token) => promptTokens.includes(token));
}

function unique<T>(values: T[]) {
  return Array.from(new Set(values));
}

function explicitSkillIds(prompt: string) {
  const ids = new Set<string>();
  const patterns = [
    /(?:^|\s)[/$]skill[:\s]+([a-z0-9-]+)/gi,
    /\buse (?:the )?([a-z0-9-]+) skill\b/gi
  ];

  for (const pattern of patterns) {
    for (const match of prompt.matchAll(pattern)) {
      if (match[1]) ids.add(match[1].toLowerCase());
    }
  }

  return [...ids];
}

function validateMetadata(skill: SkillMetadata) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(skill.id)) return "invalid skill id";
  if (!skill.allowedModes.length) return "no allowed modes";
  if (!skill.description.trim() || !skill.instructionPath.trim()) return "incomplete metadata";
  if (/^(?:[a-z]:[\\/]|\\\\|\/)/i.test(skill.instructionPath) || skill.instructionPath.includes("..")) {
    return "unsafe instruction path";
  }
  if (!skill.instructionPath.endsWith("/SKILL.md")) return "instruction path must end in SKILL.md";
  return null;
}

function resolveCatalog(additionalSkills: SkillMetadata[] = []) {
  const collisions: string[] = [];
  const rejectedSkills: string[] = [];
  const byId = new Map<string, SkillMetadata>();

  for (const skill of [...coreSkills, ...additionalSkills]) {
    const error = validateMetadata(skill);
    if (error) {
      rejectedSkills.push(`${skill.id || "unknown"}: ${error}`);
      continue;
    }

    const current = byId.get(skill.id);
    if (!current) {
      byId.set(skill.id, skill);
      continue;
    }

    collisions.push(`${skill.id}: ${current.authority} vs ${skill.authority}`);
    const currentRank = authorityRank[current.authority];
    const candidateRank = authorityRank[skill.authority];
    if (candidateRank > currentRank || (candidateRank === currentRank && skill.source.localeCompare(current.source) < 0)) {
      byId.set(skill.id, skill);
    }
  }

  return { catalog: [...byId.values()], collisions, rejectedSkills };
}

function semanticScore(skill: SkillMetadata, prompt: string, mode: IntelligenceProductMode) {
  if (!skill.allowedModes.includes(mode)) return 0;
  const normalizedPrompt = normalize(prompt);
  let score = 0;

  for (const trigger of skill.semanticTriggers) {
    const normalizedTrigger = normalize(trigger);
    const triggerTokens = normalizedTrigger.split(" ");
    if (prompt.split(/\s+/).length && normalizedPrompt.includes(normalizedTrigger) && containsTrigger(prompt, trigger)) {
      score += triggerTokens.length + 2;
    } else if (triggerTokens.length > 1 && containsTrigger(prompt, trigger)) {
      score += triggerTokens.length + 2;
    }
  }

  const descriptionTokens = normalize(skill.description).split(" ").filter((token) => token.length > 4);
  const promptTokens = new Set(normalizedPrompt.split(" "));
  score += descriptionTokens.filter((token) => promptTokens.has(token)).length * 0.35;
  return score;
}

function chooseSemanticSkills(catalog: SkillMetadata[], prompt: string, mode: IntelligenceProductMode) {
  const normalizedPrompt = normalize(prompt);
  const scored = catalog
    .map((skill) => ({ score: semanticScore(skill, prompt, mode), skill }))
    .filter((candidate) => candidate.score >= 3)
    .sort((a, b) => b.score - a.score || a.skill.id.localeCompare(b.skill.id));
  const selected: SkillMetadata[] = [];

  if (mode === "WEBSITE") {
    const editing = /\b(?:change|edit|update|replace|redesign|improve)\b/.test(normalizedPrompt) &&
      !/\b(?:replace all|rewrite (?:the |my )?website|start over|new website)\b/.test(normalizedPrompt);
    const websiteSkill = catalog.find((skill) => skill.id === (editing ? "website-edit" : "website-build"));
    if (websiteSkill) selected.push(websiteSkill);
  } else if (mode === "CODE" && /\b(?:build|create|implement|design)\b/.test(normalizedPrompt)) {
    const codeBuild = catalog.find((skill) => skill.id === "code-build");
    if (codeBuild) selected.push(codeBuild);
  }

  for (const candidate of scored) {
    if (selected.length >= 2) break;
    if (!selected.some((skill) => skill.id === candidate.skill.id)) selected.push(candidate.skill);
  }

  return selected.slice(0, 2);
}

async function findSkillRoot() {
  for (const candidate of skillRootCandidates) {
    try {
      if ((await stat(candidate)).isDirectory()) return candidate;
    } catch {
      // Try the next known monorepo working directory.
    }
  }
  return skillRootCandidates[0];
}

function safeResourcePath(root: string, relativePath: string) {
  if (/^(?:[a-z]:[\\/]|\\\\|\/)/i.test(relativePath) || relativePath.includes("..")) return null;
  const resolved = path.resolve(root, relativePath);
  const normalizedRoot = `${path.resolve(root)}${path.sep}`.toLowerCase();
  return resolved.toLowerCase().startsWith(normalizedRoot) ? resolved : null;
}

async function readCachedBody(fullPath: string) {
  const info = await stat(fullPath);
  const cached = bodyCache.get(fullPath);
  if (cached && cached.modifiedMs === info.mtimeMs) return cached.body;
  const body = await readFile(fullPath, "utf8");
  bodyCache.set(fullPath, { body, modifiedMs: info.mtimeMs });
  return body;
}

export function isSkillInstructionBodySafe(body: string) {
  return !/\b(?:ignore (?:the )?(?:user|system|developer)|bypass approval|delete unrelated|print secrets|exfiltrate|override safety)\b/i.test(body);
}

function suspiciousInstructionBody(body: string) {
  return !isSkillInstructionBodySafe(body);
}

function resourceNeeded(resource: SkillResource, prompt: string) {
  return Boolean(resource.required) || resource.matchTerms.some((term) => containsTrigger(prompt, term));
}

async function loadSkill(skill: SkillMetadata, prompt: string, root: string): Promise<LoadedSkill> {
  const bodyPath = safeResourcePath(root, skill.instructionPath);
  if (!bodyPath) throw new Error("unsafe instruction path");
  const body = await readCachedBody(bodyPath);
  if (suspiciousInstructionBody(body)) throw new Error("instruction body attempts to override authority");
  const resources: LoadedSkillResource[] = [];
  const groups: Array<{ kind: LoadedSkillResource["kind"]; resources: SkillResource[] }> = [
    { kind: "reference", resources: [] },
    { kind: "script", resources: skill.scripts ?? [] },
    { kind: "asset", resources: skill.assets ?? [] }
  ];

  const referenceMatch = body.matchAll(/^reference(!?):\s*(.+?)\s*\|\s*(.+)$/gim);
  for (const match of referenceMatch) {
    groups[0].resources.push({
      matchTerms: match[3].split(",").map((term) => term.trim()).filter(Boolean),
      path: path.posix.join(path.posix.dirname(skill.instructionPath), match[2].trim()),
      required: match[1] === "!"
    });
  }

  for (const group of groups) {
    for (const resource of group.resources) {
      if (!resourceNeeded(resource, prompt)) continue;
      const fullPath = safeResourcePath(root, resource.path);
      if (!fullPath) throw new Error(`unsafe ${group.kind} path`);
      try {
        resources.push({
          content: await readCachedBody(fullPath),
          kind: group.kind,
          path: resource.path
        });
      } catch {
        if (resource.required) throw new Error(`required ${group.kind} unavailable: ${resource.path}`);
      }
    }
  }

  return { body, metadata: skill, resources };
}

export async function selectAndLoadSkills(input: SelectSkillsInput): Promise<SkillSelectionResult> {
  const explicit = explicitSkillIds(input.prompt);
  const { catalog, collisions, rejectedSkills } = resolveCatalog(input.additionalSkills);
  const semantic = chooseSemanticSkills(catalog, input.prompt, input.mode);
  const requested = explicit.length
    ? explicit.map((id) => catalog.find((skill) => skill.id === id)).filter((skill): skill is SkillMetadata => Boolean(skill))
    : semantic;
  const missingSkillIds = explicit.filter((id) => !catalog.some((skill) => skill.id === id));
  const selected = unique(requested.filter((skill) => skill.allowedModes.includes(input.mode)).map((skill) => skill.id))
    .map((id) => catalog.find((skill) => skill.id === id))
    .filter((skill): skill is SkillMetadata => Boolean(skill))
    .slice(0, 2);
  const loadedSkills: LoadedSkill[] = [];
  const warnings: string[] = [];
  const root = await findSkillRoot();

  for (const skill of selected) {
    try {
      loadedSkills.push(await loadSkill(skill, input.prompt, root));
    } catch (error) {
      warnings.push(`${skill.id}: ${error instanceof Error ? error.message : "could not load"}`);
    }
  }

  if (missingSkillIds.length) warnings.push(`Unknown skill request: ${missingSkillIds.join(", ")}`);
  if (selected.length && !loadedSkills.length) warnings.push("Selected skills were unavailable; continue with the base Hassali contract.");

  return {
    collisions,
    explicitSkillIds: explicit,
    loadedSkills,
    missingSkillIds,
    rejectedSkills,
    selectedSkillIds: selected.map((skill) => skill.id),
    warnings
  };
}

export function listSkillMetadata() {
  return coreSkills.map((skill) => ({ ...skill }));
}

export function clearSkillBodyCacheForTests() {
  bodyCache.clear();
}
