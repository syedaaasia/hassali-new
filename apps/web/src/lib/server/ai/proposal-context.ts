import type { GeneratorContract } from "@/lib/server/ai/generator-contract";
import type { TranslatedIntentSpec } from "@/lib/server/ai/intent-translator";
import type { ProjectContract } from "@/lib/server/ai/project-contract";
import { pageToHtmlPath } from "@/lib/server/ai/website-source-of-truth";

export type ProposalContextMode = "ASK" | "CODE" | "WEBSITE";

export type ProposalContext = {
  businessName?: string;
  designTheme?: string;
  domain: string;
  entities: string[];
  framework?: string;
  isNewBuild: boolean;
  isRefinement: boolean;
  mode: ProposalContextMode;
  pages: string[];
  previewType?: string;
  projectType: string;
  requiredFiles: string[];
  runtimeType?: string;
  sourcePrompt: string;
  tokenTheme?: string;
  validationRules: string[];
};

export type PromptOwnershipDecision = {
  useContractMemory: boolean;
  useCurrentPromptOnly: boolean;
  usePreviousProjectMemory: boolean;
};

export type ValidationSeverity = "critical" | "major" | "minor";

const newBuildPattern = /\b(?:create|build|generate|make|design|start|new)\b[\s\S]{0,120}\b(?:website|site|app|crm|saas|dashboard|system|tool|landing page)\b/i;
const refinementPattern = /\b(?:update|improve|continue|modify|edit|change|redesign|refine|fix)\b/i;

function promptRequestsPython(prompt: string) {
  return /\b(?:python|py|streamlit|flask|fastapi|django|tkinter|pyside|pyqt)\b/i.test(prompt);
}

function promptRequestsReactFrontend(prompt: string) {
  return /\b(?:react|vite|tsx|frontend react|react frontend|typescript frontend)\b/i.test(prompt);
}

export function decidePromptOwnership(input: {
  mode: ProposalContextMode;
  prompt: string;
}): PromptOwnershipDecision {
  const isNewBuild = newBuildPattern.test(input.prompt);
  const isRefinement = !isNewBuild && refinementPattern.test(input.prompt);

  return {
    useContractMemory: isRefinement,
    useCurrentPromptOnly: isNewBuild || !isRefinement,
    usePreviousProjectMemory: isRefinement
  };
}

export function buildProposalContext(input: {
  contract?: ProjectContract | null;
  generatorContract?: GeneratorContract | null;
  mode: ProposalContextMode;
  prompt: string;
  translatedIntent: TranslatedIntentSpec;
}): ProposalContext {
  const ownership = decidePromptOwnership({
    mode: input.mode,
    prompt: input.prompt
  });
  const generatorDomain = input.generatorContract?.authoritativeDomain ?? null;
  const generatorBusiness = input.generatorContract?.authoritativeBusinessType ?? null;
  const domain =
    input.translatedIntent.domain ||
    input.translatedIntent.businessType ||
    generatorDomain ||
    generatorBusiness ||
    (ownership.useContractMemory ? input.contract?.domain : null) ||
    "unknown";
  const pages = input.mode === "WEBSITE"
    ? websitePagesFor(input)
    : [];
  const usePythonStack = input.mode === "CODE" &&
    promptRequestsPython(input.prompt) &&
    !promptRequestsReactFrontend(input.prompt);
  const requiredFiles = requiredFilesFor({
    domain,
    generatorContract: input.generatorContract,
    mode: input.mode,
    pages,
    prompt: input.prompt,
    translatedIntent: input.translatedIntent
  });

  return {
    businessName: input.translatedIntent.businessType ?? generatorBusiness ?? undefined,
    designTheme: input.translatedIntent.theme ?? input.translatedIntent.visualLanguage ?? undefined,
    domain,
    entities: input.generatorContract?.requiredEntities.length
      ? input.generatorContract.requiredEntities
      : input.translatedIntent.extractedEntities,
    framework: usePythonStack
      ? "python_streamlit"
      : input.mode === "CODE" && domain.toLowerCase().includes("crm")
        ? "react_vite"
        : undefined,
    isNewBuild: ownership.useCurrentPromptOnly && !ownership.useContractMemory,
    isRefinement: ownership.useContractMemory,
    mode: input.mode,
    pages,
    previewType: input.mode === "CODE"
      ? "dashboard"
      : input.mode === "WEBSITE"
        ? "website"
        : "none",
    projectType: input.mode,
    requiredFiles,
    runtimeType: usePythonStack
      ? "python"
      : input.mode === "CODE" && domain.toLowerCase().includes("crm")
        ? "vite"
        : undefined,
    sourcePrompt: input.prompt,
    tokenTheme: input.mode === "WEBSITE" ? tokenThemeFor(domain) : undefined,
    validationRules: validationRulesFor(input.mode, pages, requiredFiles)
  };
}

export function enforceGeneratorContractWithProposalContext(
  contract: GeneratorContract,
  context: ProposalContext
): GeneratorContract {
  if (context.mode === "ASK") {
    return {
      ...contract,
      contractBlocks: [],
      contractStatus: contract.contractWarnings.length ? "warning" : "ready",
      requiredFileStrategy: [],
      requiredPageCount: null,
      requiredPages: []
    };
  }

  if (context.mode === "WEBSITE") {
    return {
      ...contract,
      authoritativeBusinessType: context.businessName ?? contract.authoritativeBusinessType,
      authoritativeDomain: context.domain || contract.authoritativeDomain,
      contractBlocks: [],
      contractStatus: contract.contractWarnings.length ? "warning" : "ready",
      requiredFileStrategy: context.requiredFiles,
      requiredPageCount: context.pages.length || contract.requiredPageCount,
      requiredPages: context.pages
    };
  }

  return {
    ...contract,
    authoritativeBusinessType: context.businessName ?? contract.authoritativeBusinessType,
    authoritativeDomain: context.domain || contract.authoritativeDomain,
    contractBlocks: [],
    contractStatus: contract.contractWarnings.length ? "warning" : "ready",
    requiredFileStrategy: context.requiredFiles,
    requiredPageCount: null,
    requiredPages: []
  };
}

function websitePagesFor(input: {
  generatorContract?: GeneratorContract | null;
  prompt: string;
  translatedIntent: TranslatedIntentSpec;
}) {
  const explicitPages = input.translatedIntent.pages.names;
  const exactCount = input.translatedIntent.pages.count;

  if (explicitPages.length) {
    return exactCount ? explicitPages.slice(0, exactCount) : explicitPages;
  }

  const fallbackPages = input.generatorContract?.requiredPages.length
    ? input.generatorContract.requiredPages
    : ["home", "about", "contact"];

  return exactCount ? fallbackPages.slice(0, exactCount) : fallbackPages;
}

function requiredFilesFor(input: {
  domain: string;
  generatorContract?: GeneratorContract | null;
  mode: ProposalContextMode;
  pages: string[];
  prompt: string;
  translatedIntent: TranslatedIntentSpec;
}) {
  if (input.mode === "ASK") return [];

  if (input.mode === "WEBSITE") {
    return [
      ...input.pages.map(pageToHtmlPath),
      "styles.css",
      "main.js",
      "HASSALI.md"
    ];
  }

  if (input.mode === "CODE" && promptRequestsPython(input.prompt) && !promptRequestsReactFrontend(input.prompt)) {
    return [
      "app.py",
      "requirements.txt",
      "data/mock_crm_data.py",
      "README.md",
      "ARCHITECTURE.md",
      "SECURITY_AND_TESTING.md",
      "HASSALI.md"
    ];
  }

  if (input.domain.toLowerCase().includes("crm") || input.translatedIntent.domain === "crm") {
    return [
      "package.json",
      "vite.config.ts",
      "index.html",
      "src/main.tsx",
      "src/App.tsx",
      "src/styles.css",
      "src/lib/mock-data.ts",
      "src/components/DashboardShell.tsx",
      "src/components/MetricCards.tsx",
      "src/components/CustomerTable.tsx",
      "src/components/PipelineBoard.tsx",
      "src/components/BillingPanel.tsx",
      "src/components/ActivityFeed.tsx",
      "ARCHITECTURE.md",
      "DATA_MODEL.md",
      "SECURITY_AND_TESTING.md",
      "HASSALI.md"
    ];
  }

  return input.generatorContract?.requiredFileStrategy ?? [];
}

function tokenThemeFor(domain: string) {
  return domain.toLowerCase().includes("seafood") || domain.toLowerCase().includes("restaurant")
    ? "default_dark"
    : undefined;
}

function validationRulesFor(mode: ProposalContextMode, pages: string[], requiredFiles: string[]) {
  if (mode === "ASK") {
    return ["no file mutations", "answer-only response"];
  }

  return [
    "current prompt is source of truth",
    "generated files must match requiredFiles",
    ...(pages.length ? [`required pages: ${pages.join(", ")}`] : []),
    ...(requiredFiles.length ? [`required files: ${requiredFiles.join(", ")}`] : [])
  ];
}
