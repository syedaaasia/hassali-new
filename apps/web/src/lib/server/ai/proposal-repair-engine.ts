import type { AssetVisualValidationResult } from "@/lib/server/ai/asset-visual-validator";
import type { BusinessBlueprint } from "@/lib/server/ai/blueprint-matcher";
import type { CompositionPlan } from "@/lib/server/ai/composition-engine";
import type { ContextPriorityResult } from "@/lib/server/ai/context-priority-engine";
import type { DomainValidationResult } from "@/lib/server/ai/domain-validator";
import type { ExecutionPlan } from "@/lib/server/ai/execution-planner";
import type { GeneratorContract } from "@/lib/server/ai/generator-contract";
import type { TranslatedIntentSpec } from "@/lib/server/ai/intent-translator";
import type { ProjectContract } from "@/lib/server/ai/project-contract";
import type { ProposalQualityGateResult } from "@/lib/server/ai/proposal-quality-gate";
import type { TaskDecomposition } from "@/lib/server/ai/task-decomposer";

export type ProposalRepairStatus = "failed" | "keep_blocked" | "not_needed" | "partial_repair" | "repaired";
export type ProposalRepairStrategy =
  | "ask_mutation_suppression"
  | "code_file_strategy_repair"
  | "contract_domain_sanitization"
  | "domain_copy_rewrite"
  | "forbidden_term_rewrite"
  | "page_count_repair"
  | "section_structure_repair"
  | "small_edit_scope_repair"
  | "visual_placeholder_repair";
export type ProposalRepairSeverity = "high" | "low" | "medium";

export type ProposalRepairResult = {
  originalBlockReasons: string[];
  repairActions: string[];
  repairApplied: boolean;
  repairAttempted: boolean;
  repairConfidence: number;
  repairId: string;
  repairedFiles: Record<string, string>;
  repairedSummary: string;
  repairSeverity: ProposalRepairSeverity;
  repairStatus: ProposalRepairStatus;
  repairStrategy: ProposalRepairStrategy | "none";
  repairWarnings: string[];
  revalidationPassed: boolean;
  revalidationRequired: boolean;
  shouldKeepBlocked: boolean;
  shouldPresentRepairedProposal: boolean;
  unresolvedIssues: string[];
};

type BuildProposalRepairInput = {
  assetVisualValidation: AssetVisualValidationResult;
  businessBlueprint: BusinessBlueprint;
  compositionPlan: CompositionPlan;
  contextPriority: ContextPriorityResult;
  currentPrompt: string;
  domainValidation: DomainValidationResult;
  executionPlan: ExecutionPlan;
  generatorContract: GeneratorContract;
  productMode: "ASK" | "CODE" | "WEBSITE";
  projectContract: ProjectContract | null;
  proposalQuality: ProposalQualityGateResult;
  proposedFiles: Record<string, string>;
  proposalSummary: string;
  taskDecomposition: TaskDecomposition;
  translatedIntent: TranslatedIntentSpec;
};

const genericReplacementMap: Array<[RegExp, string]> = [
  [/\bClear Services Studio\b/gi, ""],
  [/\bLocal Service\b/gi, ""],
  [/\bclear services\b/gi, ""],
  [/\bpractical details\b/gi, ""],
  [/\bcustomer use cases\b/gi, ""],
  [/\bdetected services\b/gi, ""],
  [/\bspecific offer clarity\b/gi, ""],
  [/\bdomain-specific proof\b/gi, ""],
  [/\bCTA for Local Service\b/gi, ""],
  [/\bServices for Local Service\b/gi, ""],
  [/\bHero for Local Service\b/gi, ""],
  [/\bContact Details for Local Service\b/gi, ""],
  [/\bForm for Local Service\b/gi, ""]
];

function normalize(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function unique<T extends string>(values: T[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function pageToPath(page: string) {
  const normalized = normalize(page);
  const map: Record<string, string> = {
    about: "about.html",
    catalog: "catalog.html",
    contact: "contact.html",
    "controller gallery": "controller-gallery.html",
    "controller-gallery": "controller-gallery.html",
    controllers: "controllers.html",
    gallery: "gallery.html",
    home: "index.html",
    products: "products.html",
    services: "services.html",
    support: "support.html"
  };

  return map[normalized] ?? `${normalized.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "page"}.html`;
}

function dominantPhrase(contract: GeneratorContract) {
  return contract.authoritativeBusinessType ??
    contract.requiredCopySignals.find((signal) => signal.length > 4) ??
    contract.authoritativeDomain ??
    "domain-specific offer";
}

function domainSentence(contract: GeneratorContract) {
  const signals = contract.requiredCopySignals.slice(0, 8);

  if (contract.authoritativeDomain === "gaming_controller") {
    return "Compare wireless controllers, pro grips, console compatibility, low-latency accessories, and support options for a sharper gaming setup.";
  }

  if (signals.length >= 3) {
    return `Explore ${signals.slice(0, 3).join(", ")} with clear guidance, trusted details, and a focused path to act.`;
  }

  return `Explore ${dominantPhrase(contract)} with clear details, relevant options, and a focused path to act.`;
}

function repairForbiddenTerms(content: string, contract: GeneratorContract) {
  let repaired = content;
  let changed = false;

  for (const [pattern, replacement] of genericReplacementMap) {
    if (pattern.test(repaired)) {
      changed = true;
      repaired = repaired.replace(pattern, replacement || dominantPhrase(contract));
    }
  }

  for (const term of contract.forbiddenTerms) {
    if (term.length < 4) continue;
    const pattern = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");

    if (pattern.test(repaired)) {
      changed = true;
      repaired = repaired.replace(pattern, dominantPhrase(contract));
    }
  }

  repaired = repaired.replace(/\bHelp [^.]{0,100} understand [^.]{0,140}\./gi, () => {
    changed = true;
    return domainSentence(contract);
  });

  return { changed, content: repaired.replace(/\s{3,}/g, " ") };
}

function repairVisualPlaceholders(content: string, contract: GeneratorContract) {
  const visual = contract.requiredVisualSignals[0] ?? `${dominantPhrase(contract)} visual`;
  let repaired = content;
  let changed = false;

  repaired = repaired.replace(/(alt|aria-label|title)=["'](?:hero|image|placeholder|visual)["']/gi, (_match, attr) => {
    changed = true;
    return `${attr}="${visual}"`;
  });
  repaired = repaired.replace(/>\s*(?:hero|image|placeholder|visual)\s*</gi, () => {
    changed = true;
    return `>${visual}<`;
  });

  return { changed, content: repaired };
}

function repairContractContent(content: string, contract: GeneratorContract) {
  const label = dominantPhrase(contract);
  let repaired = content;
  let changed = false;

  if (/^- \*\*Domain\/Business:\*\*/im.test(repaired)) {
    repaired = repaired.replace(/^- \*\*Domain\/Business:\*\*.*$/im, `- **Domain/Business:** ${label}`);
    changed = true;
  }

  repaired = repaired.replace(/^- Domain:.*$/gim, () => {
    changed = true;
    return `- Domain: ${label}`;
  });

  return { changed, content: repaired };
}

function simpleHtmlPage(input: {
  contract: GeneratorContract;
  page: string;
}) {
  const title = input.page.split(/[-_\s]+/).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
  const signals = input.contract.requiredCopySignals.slice(0, 8);
  const visuals = input.contract.requiredVisualSignals.slice(0, 4);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} - ${dominantPhrase(input.contract)}</title>
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <nav>
    <a href="index.html">Home</a>
    ${input.contract.requiredPages.map((page) => `<a href="${pageToPath(page)}">${page}</a>`).join("\n    ")}
  </nav>
  <main>
    <section class="hero">
      <p>${dominantPhrase(input.contract)}</p>
      <h1>${title}</h1>
      <p>${domainSentence(input.contract)}</p>
      <a href="contact.html">Contact us</a>
    </section>
    <section class="domain-section">
      <h2>${signals.slice(0, 3).join(" / ") || dominantPhrase(input.contract)}</h2>
      <p>${signals.slice(3, 8).join(", ") || "Focused details for this request."}</p>
      <div class="visual-panel" aria-label="${visuals[0] ?? `${dominantPhrase(input.contract)} visual`}">${visuals.join(" / ") || dominantPhrase(input.contract)}</div>
    </section>
  </main>
  <footer>Support, warranty, shipping, and contact details for ${dominantPhrase(input.contract)}.</footer>
  <script src="main.js"></script>
</body>
</html>
`;
}

function codeDocsRepair(input: BuildProposalRepairInput) {
  const name = input.generatorContract.authoritativeBusinessType ?? "CODE app/system";

  return {
    "ARCHITECTURE.md": `# ${name} Architecture\n\nThis repaired CODE proposal uses docs-first planning instead of a static public website.\n\n## Modules\n- App shell and navigation\n- Auth/security boundary\n- Dashboard\n- Contacts/customers\n- Records/deals\n- Billing placeholders\n- Settings\n\n## Rule\nDo not create index.html/styles.css/main.js unless the user explicitly asks for a landing page.\n`,
    "DATA_MODEL.md": `# ${name} Data Model\n\n- User\n- Customer\n- Deal/Record\n- Invoice/Subscription\n- Activity\n- Audit event\n`,
    "SECURITY_AND_TESTING.md": `# ${name} Security And Testing\n\n- Keep secrets server-side.\n- Verify ownership before reads/writes.\n- Treat billing provider/webhook state as authoritative.\n- Run typecheck after source changes.\n`
  };
}

function parseRename(prompt: string) {
  const match = prompt.match(/\b(?:rename|replace|change)\s+(.+?)\s+(?:to|with)\s+(.+?)$/i);

  return match ? { from: match[1].trim().replace(/^["']|["']$/g, ""), to: match[2].trim().replace(/^["']|["']$/g, "") } : null;
}

function blockReasons(input: BuildProposalRepairInput) {
  return unique([
    ...input.domainValidation.repairHints,
    ...input.proposalQuality.blocks.map((issue) => issue.message),
    ...input.proposalQuality.failures.map((issue) => issue.message),
    ...input.assetVisualValidation.visualBlocks.map((issue) => issue.message),
    ...input.assetVisualValidation.visualFailures.map((issue) => issue.message),
    ...input.generatorContract.contractBlocks
  ]);
}

export function repairProposal(input: BuildProposalRepairInput): ProposalRepairResult {
  const reasons = blockReasons(input);
  const needsRepair =
    input.domainValidation.shouldBlockProposal ||
    input.proposalQuality.qualityStatus !== "passed" ||
    input.assetVisualValidation.visualValidationStatus !== "passed" ||
    input.generatorContract.contractStatus === "blocked";

  if (!needsRepair) {
    return {
      originalBlockReasons: [],
      repairActions: [],
      repairApplied: false,
      repairAttempted: false,
      repairConfidence: 0.9,
      repairId: `${input.generatorContract.contractId}_repair_not_needed`,
      repairedFiles: input.proposedFiles,
      repairedSummary: input.proposalSummary,
      repairSeverity: "low",
      repairStatus: "not_needed",
      repairStrategy: "none",
      repairWarnings: [],
      revalidationPassed: true,
      revalidationRequired: false,
      shouldKeepBlocked: false,
      shouldPresentRepairedProposal: false,
      unresolvedIssues: []
    };
  }

  const repairedFiles: Record<string, string> = { ...input.proposedFiles };
  const actions: string[] = [];
  const strategies: ProposalRepairStrategy[] = [];

  if (input.contextPriority.authoritativeMode === "ASK") {
    return {
      originalBlockReasons: reasons,
      repairActions: ["Suppressed file mutations for ASK answer-only behavior."],
      repairApplied: Object.keys(input.proposedFiles).length > 0,
      repairAttempted: true,
      repairConfidence: 0.74,
      repairId: `${input.generatorContract.contractId}_ask_mutation_suppression`,
      repairedFiles: {},
      repairedSummary: "ASK mode should answer without proposing file mutations.",
      repairSeverity: "high",
      repairStatus: "repaired",
      repairStrategy: "ask_mutation_suppression",
      repairWarnings: [],
      revalidationPassed: false,
      revalidationRequired: true,
      shouldKeepBlocked: false,
      shouldPresentRepairedProposal: true,
      unresolvedIssues: []
    };
  }

  const hasRunnableAppSource = Object.keys(repairedFiles).some((path) =>
    path === "vite.config.ts" ||
    path === "vite.config.js" ||
    path.startsWith("src/")
  );

  if (input.generatorContract.generatorMode === "code_generation" && !hasRunnableAppSource && ["index.html", "styles.css", "main.js"].every((path) => path in repairedFiles)) {
    strategies.push("code_file_strategy_repair");
    actions.push("Converted static website trio into docs-first CODE proposal files.");
    for (const path of Object.keys(repairedFiles)) delete repairedFiles[path];
    Object.assign(repairedFiles, codeDocsRepair(input));
  }

  if (input.generatorContract.generatorMode === "small_edit") {
    const rename = parseRename(input.currentPrompt);
    const matching = Object.entries(repairedFiles).filter(([, content]) =>
      rename ? content.toLowerCase().includes(rename.to.toLowerCase()) || content.toLowerCase().includes(rename.from.toLowerCase()) : true
    );

    if (matching.length > 0 && Object.keys(repairedFiles).length > matching.length) {
      strategies.push("small_edit_scope_repair");
      actions.push("Dropped unrelated files from targeted text replacement proposal.");
      for (const path of Object.keys(repairedFiles)) {
        if (!matching.some(([matchPath]) => matchPath === path)) delete repairedFiles[path];
      }
    }
  }

  for (const [path, content] of Object.entries(repairedFiles)) {
    let nextContent = content;
    const forbidden = repairForbiddenTerms(nextContent, input.generatorContract);
    if (forbidden.changed) {
      strategies.push("forbidden_term_rewrite");
      strategies.push("domain_copy_rewrite");
      actions.push(`Rewrote forbidden/generic terms in ${path}.`);
      nextContent = forbidden.content;
    }

    const visuals = repairVisualPlaceholders(nextContent, input.generatorContract);
    if (visuals.changed) {
      strategies.push("visual_placeholder_repair");
      actions.push(`Repaired generic visual placeholders in ${path}.`);
      nextContent = visuals.content;
    }

    if (path === "HASSALI.md") {
      const contract = repairContractContent(nextContent, input.generatorContract);
      if (contract.changed) {
        strategies.push("contract_domain_sanitization");
        actions.push("Sanitized HASSALI.md domain facts.");
        nextContent = contract.content;
      }
    }

    repairedFiles[path] = nextContent;
  }

  if (input.generatorContract.generatorMode === "website_generation" && input.generatorContract.requiredPages.length > 0) {
    for (const page of input.generatorContract.requiredPages) {
      const path = pageToPath(page);
      if (!repairedFiles[path]) {
        strategies.push("page_count_repair");
        strategies.push("section_structure_repair");
        actions.push(`Added missing required page ${path}.`);
        repairedFiles[path] = simpleHtmlPage({ contract: input.generatorContract, page });
      }
    }
  }

  const applied = actions.length > 0;
  const unresolvedIssues = applied ? [] : reasons;
  const repairStrategy = unique(strategies)[0] as ProposalRepairStrategy | undefined;

  return {
    originalBlockReasons: reasons,
    repairActions: unique(actions),
    repairApplied: applied,
    repairAttempted: true,
    repairConfidence: applied ? 0.72 : 0.42,
    repairId: `${input.generatorContract.contractId}_repair_attempt`,
    repairedFiles,
    repairedSummary: applied
      ? `${input.proposalSummary} Hassali repaired this proposal in memory before approval: ${unique(actions).join(" ")}`
      : input.proposalSummary,
    repairSeverity: reasons.length > 2 ? "high" : reasons.length ? "medium" : "low",
    repairStatus: applied ? "repaired" : "keep_blocked",
    repairStrategy: repairStrategy ?? "none",
    repairWarnings: applied ? [] : ["Repair engine could not safely determine a deterministic repair."],
    revalidationPassed: false,
    revalidationRequired: applied,
    shouldKeepBlocked: !applied,
    shouldPresentRepairedProposal: applied,
    unresolvedIssues
  };
}

export function summarizeProposalRepair(repair: ProposalRepairResult) {
  return [
    repair.repairId,
    `status=${repair.repairStatus}`,
    `attempted=${repair.repairAttempted ? "yes" : "no"}`,
    `applied=${repair.repairApplied ? "yes" : "no"}`,
    `strategy=${repair.repairStrategy}`,
    `actions=${repair.repairActions.length}`,
    `revalidate=${repair.revalidationRequired ? "yes" : "no"}`
  ].join("; ");
}
