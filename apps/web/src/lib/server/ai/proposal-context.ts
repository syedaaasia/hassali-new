import type { GeneratorContract } from "@/lib/server/ai/generator-contract";
import type { TranslatedIntentSpec } from "@/lib/server/ai/intent-translator";
import {
  buildCodeIntentContract,
  buildWebsiteIntentContract,
  type IntentLockContract
} from "@/lib/server/ai/industry-taxonomy";
import {
  buildCodeGenerationBrief,
  buildWebsiteGenerationBrief,
  type CodeGenerationBrief,
  type WebsiteGenerationBrief
} from "@/lib/server/ai/generation-brief";
import type { ProjectContract } from "@/lib/server/ai/project-contract";
import { pageToHtmlPath } from "@/lib/server/ai/website-source-of-truth";
import type { DesignDirectionRequest } from "@/lib/server/design/reference/design-reference-contract";
import type { ProjectDesignContract } from "@/lib/server/design/direction/project-design-contract";

export type ProposalContextMode = "ASK" | "CODE" | "WEBSITE";

export type ProposalContext = {
  businessName?: string;
  codeGenerationBrief?: CodeGenerationBrief | null;
  designDirectionRequest?: DesignDirectionRequest | null;
  designTheme?: string;
  domain: string;
  entities: string[];
  framework?: string;
  intentContract?: IntentLockContract | null;
  isNewBuild: boolean;
  isRefinement: boolean;
  mode: ProposalContextMode;
  pages: string[];
  previewType?: string;
  projectDesignContract?: ProjectDesignContract | null;
  projectType: string;
  requiredFiles: string[];
  runtimeType?: string;
  sourcePrompt: string;
  tokenTheme?: string;
  validationRules: string[];
  websiteGenerationBrief?: WebsiteGenerationBrief | null;
};

export type PromptOwnershipDecision = {
  useContractMemory: boolean;
  useCurrentPromptOnly: boolean;
  usePreviousProjectMemory: boolean;
};

export type ValidationSeverity = "critical" | "major" | "minor";

const newBuildPattern = /\b(?:create|build|generate|make|design|start|new)\b[\s\S]{0,120}\b(?:website|site|app|crm|saas|dashboard|system|tool|landing page)\b/i;
const refinementPattern = /\b(?:update|improve|continue|modify|edit|change|redesign|refine|fix|rewrite|rebuild|replace|recreate|redo|overhaul)\b/i;

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
  designDirectionRequest?: DesignDirectionRequest | null;
  generatorContract?: GeneratorContract | null;
  mode: ProposalContextMode;
  projectDesignContract?: ProjectDesignContract | null;
  prompt: string;
  translatedIntent: TranslatedIntentSpec;
}): ProposalContext {
  const ownership = decidePromptOwnership({
    mode: input.mode,
    prompt: input.prompt
  });
  const intentContract = input.mode === "WEBSITE"
    ? buildWebsiteIntentContract({
        existingDomain: ownership.useContractMemory ? input.contract?.domain : null,
        prompt: input.prompt,
        requestedPagesFallback: ownership.useContractMemory && input.contract?.websitePages?.length
          ? input.contract.websitePages
          : input.translatedIntent.pages.names
      })
    : input.mode === "CODE"
      ? buildCodeIntentContract({ prompt: input.prompt })
      : null;
  const websiteGenerationBrief = intentContract?.mode === "WEBSITE"
    ? buildWebsiteGenerationBrief(intentContract)
    : null;
  const codeGenerationBrief = intentContract?.mode === "CODE"
    ? buildCodeGenerationBrief(intentContract)
    : null;
  const generatorDomain = input.generatorContract?.authoritativeDomain ?? null;
  const generatorBusiness = input.generatorContract?.authoritativeBusinessType ?? null;
  const domain =
    intentContract?.domainId ||
    (intentContract?.mode === "WEBSITE" ? intentContract.semanticDomain : null) ||
    input.translatedIntent.domain ||
    input.translatedIntent.businessType ||
    generatorDomain ||
    generatorBusiness ||
    (ownership.useContractMemory ? input.contract?.domain : null) ||
    "unknown";
  const pages = input.mode === "WEBSITE"
    ? websiteGenerationBrief?.requestedPages ?? websitePagesFor(input)
    : [];
  const usePythonStack = input.mode === "CODE" &&
    (codeGenerationBrief?.preferredFramework === "streamlit" ||
      (promptRequestsPython(input.prompt) && !promptRequestsReactFrontend(input.prompt)));
  const requiredFiles = requiredFilesFor({
    codeGenerationBrief,
    domain,
    generatorContract: input.generatorContract,
    mode: input.mode,
    pages,
    prompt: input.prompt,
    translatedIntent: input.translatedIntent,
    websiteGenerationBrief
  });

  return {
    businessName:
      (intentContract?.mode === "WEBSITE" ? intentContract.displayName : null) ??
      input.translatedIntent.businessType ??
      generatorBusiness ??
      undefined,
    codeGenerationBrief,
    designDirectionRequest: input.mode === "WEBSITE" ? input.designDirectionRequest ?? null : null,
    designTheme: input.translatedIntent.theme ?? input.translatedIntent.visualLanguage ?? undefined,
    domain,
    entities: input.generatorContract?.requiredEntities.length
      ? input.generatorContract.requiredEntities
      : input.translatedIntent.extractedEntities,
    framework: usePythonStack
      ? "python_streamlit"
      : input.mode === "CODE" && (domain.toLowerCase().includes("crm") || codeGenerationBrief?.preferredFramework === "react_vite")
        ? "react_vite"
        : undefined,
    isNewBuild: ownership.useCurrentPromptOnly && !ownership.useContractMemory,
    isRefinement: ownership.useContractMemory,
    intentContract,
    mode: input.mode,
    pages,
    previewType: input.mode === "CODE"
      ? usePythonStack
        ? "python_app_preview"
        : "dashboard"
      : input.mode === "WEBSITE"
        ? "website"
        : "none",
    projectDesignContract: input.mode === "WEBSITE" ? input.projectDesignContract ?? null : null,
    projectType: input.mode,
    requiredFiles,
    runtimeType: usePythonStack
      ? "python"
      : input.mode === "CODE" && domain.toLowerCase().includes("crm")
        ? "vite"
        : undefined,
    sourcePrompt: input.prompt,
    tokenTheme: input.mode === "WEBSITE" ? tokenThemeFor(domain) : undefined,
    validationRules: validationRulesFor(input.mode, pages, requiredFiles),
    websiteGenerationBrief
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
    const websiteIntent = context.intentContract?.mode === "WEBSITE" ? context.intentContract : null;
    const hasResolvedDomain = Boolean(
      context.domain &&
      context.domain !== "unknown" &&
      websiteIntent?.generatorStrategy !== "clarify_domain_before_generation"
    );
    const contractBlocks = hasResolvedDomain
      ? contract.contractBlocks.filter((block) => !block.startsWith("ambiguous domain classification:"))
      : contract.contractBlocks;

    return {
      ...contract,
      authoritativeBusinessType: context.businessName ?? contract.authoritativeBusinessType,
      authoritativeDomain: context.domain || contract.authoritativeDomain,
      contractBlocks,
      contractStatus: contractBlocks.length ? "blocked" : contract.contractWarnings.length ? "warning" : "ready",
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
  const contract = buildWebsiteIntentContract({
    prompt: input.prompt,
    requestedPagesFallback: input.translatedIntent.pages.names
  });

  if (contract.requestedPages.length) {
    return contract.exactPageCount ? contract.requestedPages.slice(0, contract.exactPageCount) : contract.requestedPages;
  }

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
  codeGenerationBrief?: CodeGenerationBrief | null;
  domain: string;
  generatorContract?: GeneratorContract | null;
  mode: ProposalContextMode;
  pages: string[];
  prompt: string;
  translatedIntent: TranslatedIntentSpec;
  websiteGenerationBrief?: WebsiteGenerationBrief | null;
}) {
  if (input.mode === "ASK") return [];

  if (input.mode === "WEBSITE") {
    if (input.websiteGenerationBrief?.requiredFiles.length) {
      return input.websiteGenerationBrief.requiredFiles;
    }

    return [
      ...input.pages.map(pageToHtmlPath),
      "styles.css",
      "main.js",
      "HASSALI.md"
    ];
  }

  if (input.mode === "CODE" && input.codeGenerationBrief?.filePlan.length) {
    return input.codeGenerationBrief.filePlan.map((file) => file.path);
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
