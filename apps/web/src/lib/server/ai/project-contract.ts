import type { DecisionPlan } from "@/lib/server/ai/decision-engine";
import type { GeneratorContract } from "@/lib/server/ai/generator-contract";
import type { IntentIntelligence } from "@/lib/server/ai/intent-intelligence";
import type { IntelligenceKernelResult } from "@/lib/server/ai/intelligence-kernel";
import type { CompositionStrategy } from "@/lib/server/ai/reasoning-composition";

export type ProjectContractMode = "ASK" | "CODE" | "WEBSITE";
export type ProjectContractPreviewType =
  | "answer_only"
  | "code_app_preview"
  | "code_plan_preview"
  | "docs_preview"
  | "website_static_preview";

export type ProjectContract = {
  acceptedConstraints: string[];
  brandName: string | null;
  designRules: string[];
  doNotRules: string[];
  domain: string | null;
  fileStrategy: string[];
  lastKnownSafeFacts: string[];
  previewType: ProjectContractPreviewType;
  projectType: ProjectContractMode;
};

type WorkspaceLike = {
  activeFileContent: string;
  activePath: string;
  fileContents?: Record<string, string>;
};

const contractPath = "HASSALI.md";

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function parseList(markdown: string, heading: string) {
  const match = markdown.match(new RegExp(`## ${heading}\\s*\\n([\\s\\S]*?)(?=\\n## |$)`, "i"));

  if (!match?.[1]) {
    return [];
  }

  return match[1]
    .split("\n")
    .map((line) => line.trim().replace(/^-\s*/, ""))
    .filter(Boolean);
}

function parseValue(markdown: string, label: string) {
  const match = markdown.match(new RegExp(`^- \\*\\*${label}:\\*\\*\\s*(.+)$`, "im"));
  const value = match?.[1]?.trim();

  return value && value !== "unknown" && value !== "none" ? value : null;
}

function normalizePreviewType(value: string | null): ProjectContractPreviewType {
  if (
    value === "answer_only" ||
    value === "code_app_preview" ||
    value === "code_plan_preview" ||
    value === "docs_preview" ||
    value === "website_static_preview"
  ) {
    return value;
  }

  return "answer_only";
}

function normalizeMode(value: string | null): ProjectContractMode {
  return value === "CODE" || value === "WEBSITE" || value === "ASK" ? value : "ASK";
}

export function readProjectContractFromWorkspace(workspace: WorkspaceLike): ProjectContract | null {
  const content = workspace.fileContents?.[contractPath] ??
    (workspace.activePath === contractPath ? workspace.activeFileContent : "");

  if (!content.trim()) {
    return null;
  }

  return {
    acceptedConstraints: parseList(content, "Accepted Constraints"),
    brandName: parseValue(content, "Brand/App/Site Name"),
    designRules: parseList(content, "Design Rules"),
    doNotRules: parseList(content, "Do-Not Rules"),
    domain: parseValue(content, "Domain/Business"),
    fileStrategy: parseList(content, "File Strategy"),
    lastKnownSafeFacts: parseList(content, "Last Known Safe Project Facts"),
    previewType: normalizePreviewType(parseValue(content, "Preview Type")),
    projectType: normalizeMode(parseValue(content, "Project Type"))
  };
}

export function summarizeProjectContract(contract: ProjectContract | null) {
  if (!contract) {
    return "No HASSALI.md project contract found yet.";
  }

  return [
    `projectType=${contract.projectType}`,
    `domain=${contract.domain ?? "unknown"}`,
    `brand=${contract.brandName ?? "unknown"}`,
    `previewType=${contract.previewType}`,
    contract.doNotRules.length ? `doNot=${contract.doNotRules.slice(0, 3).join("; ")}` : null
  ].filter(Boolean).join("; ");
}

export function projectContractSystemContext(contract: ProjectContract | null) {
  return contract
    ? `Project contract from HASSALI.md (lower priority than the current user prompt): ${summarizeProjectContract(contract)}. If the current prompt conflicts with this contract, obey the current prompt and update the contract through an approval-first proposal.`
    : "No HASSALI.md project contract exists yet. Infer project facts from the current prompt and selected project files.";
}

function previewTypeFor(input: {
  decision: DecisionPlan;
  kernel: IntelligenceKernelResult;
}): ProjectContractPreviewType {
  if (input.kernel.routingDecision.mode === "ASK") {
    return "answer_only";
  }

  if (input.decision.requestType === "code_system_generation") {
    return "code_app_preview";
  }

  if (input.kernel.routingDecision.mode === "CODE") {
    return "code_plan_preview";
  }

  return "website_static_preview";
}

function fileStrategyFor(decision: DecisionPlan, mode: ProjectContractMode) {
  if (decision.requestType === "code_system_generation") {
    return [
      "For app-building requests, include runnable source files plus architecture/security docs.",
      "For Vite React apps, include package.json, vite.config.ts, index.html, src/main.tsx, src/App.tsx, src/styles.css, src/lib/mock-data.ts, and source components.",
      "Do not run package installs; runtime may start only through approved runtime flow.",
      "Keep app/system work approval-first and project-scoped."
    ];
  }

  if (decision.requestType === "rename") {
    return [
      "Small text edits update only files containing the source text.",
      "Do not regenerate the website for rename/change text requests."
    ];
  }

  if (mode === "WEBSITE") {
    return [
      "Use index.html/styles.css/main.js for static WEBSITE outputs.",
      "Use targeted HTML/CSS/JS edits for small changes.",
      "Keep preview-ready files valid and responsive."
    ];
  }

  return ["Keep changes approval-first and scoped to the selected project."];
}

export function buildUpdatedProjectContract(input: {
  composition: CompositionStrategy;
  contract: ProjectContract | null;
  decision: DecisionPlan;
  generatorContract?: GeneratorContract;
  intent: IntentIntelligence;
  kernel: IntelligenceKernelResult;
  prompt: string;
}): ProjectContract {
  const mode = input.kernel.routingDecision.mode;
  const isNewGeneration =
    input.decision.requestType === "code_system_generation" ||
    input.decision.requestType === "website_generation" ||
    input.decision.requestType === "multi_page_generation";
  const promptDomain =
    input.generatorContract?.authoritativeBusinessType ||
    input.generatorContract?.authoritativeDomain ||
    input.composition.businessType ||
    (input.intent.domain !== "generic website" ? input.intent.domain : null);
  const brandName = input.intent.brandName || (isNewGeneration ? null : input.contract?.brandName) || null;
  const previewType = previewTypeFor({
    decision: input.decision,
    kernel: input.kernel
  });
  const previousConstraints = isNewGeneration ? [] : input.contract?.acceptedConstraints ?? [];
  const previousDesignRules = isNewGeneration ? [] : input.contract?.designRules ?? [];
  const previousDoNotRules = isNewGeneration ? [] : input.contract?.doNotRules ?? [];

  return {
    acceptedConstraints: unique([
      ...previousConstraints,
      ...input.intent.requiredFeatures.slice(0, 6),
      ...input.intent.palette.map((color) => `palette:${color}`),
      ...input.intent.requestedPages.map((page) => `page:${page}`),
      ...(input.generatorContract?.requiredPages ?? []).map((page) => `source-of-truth-page:${page}`)
    ]).slice(0, 14),
    brandName,
    designRules: unique([
      ...previousDesignRules,
      ...input.composition.visualLanguage.style.map((style) => `style:${style}`),
      ...input.composition.visualLanguage.palette.map((color) => `color:${color}`),
      "Keep output responsive and low-spec friendly."
    ]).slice(0, 12),
    doNotRules: unique([
      "Current user prompt outranks stale contract facts.",
      "Do not reuse unrelated old domains or brands.",
      "Do not mutate files without proposal approval.",
      "Do not cross project boundaries.",
      ...(mode === "CODE" ? ["Do not convert CODE app/system requests into public static websites."] : []),
      ...(mode === "WEBSITE" ? ["Do not convert WEBSITE requests into app dashboards unless explicitly asked."] : []),
      ...previousDoNotRules
    ]).slice(0, 14),
    domain: promptDomain ?? (isNewGeneration ? null : input.contract?.domain) ?? null,
    fileStrategy: unique(fileStrategyFor(input.decision, mode)).slice(0, 10),
    lastKnownSafeFacts: unique([
      `Last prompt: ${input.prompt}`,
      `Kernel mode: ${mode}`,
      `Task type: ${input.kernel.routingDecision.taskType}`,
      `Decision: ${input.decision.requestType}`,
      `Domain: ${promptDomain ?? "unknown"}`,
      `Preview: ${previewType}`,
      ...(input.generatorContract?.requiredPages.length ? [`Source-of-truth pages: ${input.generatorContract.requiredPages.join(", ")}`] : []),
      ...(input.generatorContract ? [`Generator contract: ${input.generatorContract.contractId}`] : []),
      ...(input.decision.requiredFiles.length ? [`Required files: ${input.decision.requiredFiles.join(", ")}`] : [])
    ]).slice(0, 10),
    previewType,
    projectType: mode
  };
}

export function renderProjectContract(contract: ProjectContract) {
  const value = (item: string | null) => item?.trim() || "unknown";
  const list = (items: string[], fallback: string) =>
    items.length ? items.map((item) => `- ${item}`).join("\n") : `- ${fallback}`;

  return `# HASSALI.md

This file is Hassali.ai's project contract. It stores stable project facts for future AI proposals.

Current user prompts always outrank this file. If this contract conflicts with the current request, Hassali must obey the current request and propose an update to this file.

- **Project Type:** ${contract.projectType}
- **Domain/Business:** ${value(contract.domain)}
- **Brand/App/Site Name:** ${value(contract.brandName)}
- **Preview Type:** ${contract.previewType}

## Accepted Constraints
${list(contract.acceptedConstraints, "No accepted constraints recorded yet.")}

## Design Rules
${list(contract.designRules, "Keep design responsive, readable, and low-spec friendly.")}

## File Strategy
${list(contract.fileStrategy, "Use the smallest approval-first file changes that satisfy the request.")}

## Do-Not Rules
${list(contract.doNotRules, "Do not mutate files without approval.")}

## Last Known Safe Project Facts
${list(contract.lastKnownSafeFacts, "No safe project facts recorded yet.")}
`;
}

export { contractPath as projectContractPath };
