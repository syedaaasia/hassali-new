import type { BusinessBlueprint } from "@/lib/server/ai/blueprint-matcher";
import type { ContextPriorityResult } from "@/lib/server/ai/context-priority-engine";
import type { TranslatedIntentSpec } from "@/lib/server/ai/intent-translator";
import type { ProjectContract } from "@/lib/server/ai/project-contract";

export type DecompositionStatus = "answer_only" | "decomposed" | "targeted";
export type TaskKind =
  | "answer_plan"
  | "code_app_build"
  | "targeted_text_replacement"
  | "visual_edit"
  | "website_generation";
export type ExecutionStrategy = "answer_only" | "phased_code_plan" | "single_targeted_edit" | "static_site_build";
export type RecommendedPhasePolicy = "multi_phase" | "single_pass" | "targeted_only";
export type MilestoneRiskLevel = "high" | "low" | "medium";

export type TaskMilestone = {
  acceptanceChecks: string[];
  dependsOn: string[];
  id: string;
  mode: "ASK" | "CODE" | "WEBSITE";
  priority: number;
  purpose: string;
  requiredInputs: string[];
  riskLevel: MilestoneRiskLevel;
  suggestedFiles: string[];
  title: string;
};

export type TaskDecomposition = {
  blockedUntil: string[];
  confidence: number;
  decompositionId: string;
  decompositionStatus: DecompositionStatus;
  dependencies: string[];
  executionStrategy: ExecutionStrategy;
  fileTargets: string[];
  milestones: TaskMilestone[];
  orderedTasks: string[];
  recommendedPhasePolicy: RecommendedPhasePolicy;
  riskNotes: string[];
  taskKind: TaskKind;
  validationChecks: string[];
};

type BuildTaskDecompositionInput = {
  businessBlueprint: BusinessBlueprint;
  contextPriority: ContextPriorityResult;
  currentPrompt: string;
  productMode: "ASK" | "CODE" | "WEBSITE";
  projectContract: ProjectContract | null;
  translatedIntent: TranslatedIntentSpec;
};

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function pageToPath(page: string) {
  const normalized = page.toLowerCase().trim();
  const map: Record<string, string> = {
    about: "about.html",
    blog: "blog.html",
    contact: "contact.html",
    home: "index.html",
    pricing: "pricing.html",
    products: "products.html",
    services: "services.html",
    shop: "products.html",
    story: "story.html"
  };

  return map[normalized] ?? `${normalized.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "page"}.html`;
}

function baseMilestone(input: {
  acceptanceChecks: string[];
  dependsOn?: string[];
  id: string;
  mode: "ASK" | "CODE" | "WEBSITE";
  priority: number;
  purpose: string;
  requiredInputs?: string[];
  riskLevel?: MilestoneRiskLevel;
  suggestedFiles?: string[];
  title: string;
}): TaskMilestone {
  return {
    acceptanceChecks: input.acceptanceChecks,
    dependsOn: input.dependsOn ?? [],
    id: input.id,
    mode: input.mode,
    priority: input.priority,
    purpose: input.purpose,
    requiredInputs: input.requiredInputs ?? [],
    riskLevel: input.riskLevel ?? "low",
    suggestedFiles: input.suggestedFiles ?? [],
    title: input.title
  };
}

function askDecomposition(input: BuildTaskDecompositionInput): TaskDecomposition {
  const milestone = baseMilestone({
    acceptanceChecks: ["answer the user directly", "do not create file mutation proposal unless explicitly requested"],
    id: "answer-plan",
    mode: "ASK",
    priority: 1,
    purpose: "Provide a concise answer or explanation using current ASK context.",
    requiredInputs: ["current prompt"],
    title: "Answer plan"
  });

  return {
    blockedUntil: [],
    confidence: Math.min(0.96, input.contextPriority.confidence + 0.04),
    decompositionId: "ask_answer_plan",
    decompositionStatus: "answer_only",
    dependencies: [],
    executionStrategy: "answer_only",
    fileTargets: [],
    milestones: [milestone],
    orderedTasks: [milestone.title],
    recommendedPhasePolicy: "targeted_only",
    riskNotes: ["ASK mode should not mutate files by default."],
    taskKind: "answer_plan",
    validationChecks: ["confirm no proposal/file changes are generated", "answer is scoped to the question"]
  };
}

function targetedEditDecomposition(input: BuildTaskDecompositionInput): TaskDecomposition {
  const milestone = baseMilestone({
    acceptanceChecks: [
      "only files containing the target text are changed",
      "do not regenerate the full website/app",
      "do not require main.js/styles.css unless they contain the target text"
    ],
    id: "targeted-text-replacement",
    mode: input.productMode === "CODE" ? "CODE" : "WEBSITE",
    priority: 1,
    purpose: "Find the requested source text and replace it with the requested target text.",
    requiredInputs: ["source text", "replacement text", "selected project files"],
    riskLevel: "medium",
    suggestedFiles: ["files containing target text"],
    title: "Targeted text replacement"
  });

  return {
    blockedUntil: ["source text exists in selected project files"],
    confidence: Math.min(0.94, input.contextPriority.confidence + 0.08),
    decompositionId: "targeted_text_replacement",
    decompositionStatus: "targeted",
    dependencies: [],
    executionStrategy: "single_targeted_edit",
    fileTargets: ["files containing target text"],
    milestones: [milestone],
    orderedTasks: [milestone.title],
    recommendedPhasePolicy: "targeted_only",
    riskNotes: ["Small edit intent suppresses full generation requirements."],
    taskKind: "targeted_text_replacement",
    validationChecks: ["target text found before proposing replacement", "proposal contains actual content mutation"]
  };
}

function websiteFileTargets(input: BuildTaskDecompositionInput) {
  const pageFiles = input.translatedIntent.pages.names.length
    ? input.translatedIntent.pages.names.map(pageToPath)
    : ["index.html"];

  return unique([...pageFiles, "styles.css", "main.js"]);
}

function websiteDecomposition(input: BuildTaskDecompositionInput): TaskDecomposition {
  const fileTargets = websiteFileTargets(input);
  const sectionMilestones = input.businessBlueprint.sections.map((section, index) =>
    baseMilestone({
      acceptanceChecks: [
        `${section} is visible and domain-specific`,
        "copy avoids suppressed/stale context",
        "section supports the selected blueprint"
      ],
      dependsOn: index === 0 ? ["site-shell"] : ["site-shell", `section-${index}`],
      id: `section-${index + 1}`,
      mode: "WEBSITE",
      priority: index + 2,
      purpose: `Create or refine the ${section} section.`,
      requiredInputs: ["business blueprint", "translated intent", "context priority"],
      suggestedFiles: fileTargets,
      title: section
    })
  );
  const milestones = [
    baseMilestone({
      acceptanceChecks: ["requested pages exist", "shared assets are connected", "no stale domain identity is used"],
      id: "site-shell",
      mode: "WEBSITE",
      priority: 1,
      purpose: "Create the static site/page shell and navigation for the requested website.",
      requiredInputs: ["requested pages", "brand/domain", "file strategy"],
      suggestedFiles: fileTargets,
      title: "Site shell and navigation"
    }),
    ...sectionMilestones,
    baseMilestone({
      acceptanceChecks: ["responsive layout works", "preview can reload after approval", "no blank files"],
      dependsOn: ["site-shell", ...sectionMilestones.map((milestone) => milestone.id)],
      id: "responsive-preview-checks",
      mode: "WEBSITE",
      priority: sectionMilestones.length + 2,
      purpose: "Validate responsive behavior, visual consistency, and preview readiness.",
      requiredInputs: ["generated files"],
      suggestedFiles: ["styles.css", "main.js"],
      title: "Responsive and preview checks"
    })
  ];

  return {
    blockedUntil: [],
    confidence: Math.min(0.95, (input.contextPriority.confidence + input.businessBlueprint.confidence) / 2 + 0.06),
    decompositionId: `${input.businessBlueprint.blueprintId}_decomposition`,
    decompositionStatus: "decomposed",
    dependencies: ["intent translator", "business blueprint", "context priority"],
    executionStrategy: "static_site_build",
    fileTargets,
    milestones,
    orderedTasks: milestones.map((milestone) => milestone.title),
    recommendedPhasePolicy: "single_pass",
    riskNotes: input.contextPriority.conflicts.map((conflict) => `Suppressed ${conflict.suppressed}; kept ${conflict.kept}.`),
    taskKind: "website_generation",
    validationChecks: unique([
      ...input.businessBlueprint.acceptanceChecks,
      "requested pages are present",
      "domain-specific section copy is present",
      "responsive CSS exists",
      "preview reload happens only after file save"
    ])
  };
}

function codeDecomposition(input: BuildTaskDecompositionInput): TaskDecomposition {
  const screens = input.businessBlueprint.screens.length
    ? input.businessBlueprint.screens
    : ["Login/Auth", "Dashboard", "Records", "Settings"];
  const fileTargets = unique(input.businessBlueprint.fileStrategy.length
    ? input.businessBlueprint.fileStrategy
    : ["ARCHITECTURE.md", "DATA_MODEL.md", "IMPLEMENTATION_PLAN.md"]);
  const milestones = [
    baseMilestone({
      acceptanceChecks: ["app structure is described", "navigation/screens are defined", "not a public marketing website"],
      id: "app-shell-navigation",
      mode: "CODE",
      priority: 1,
      purpose: "Define app shell, navigation, and high-level screen map.",
      requiredInputs: ["authoritative mode", "blueprint screens"],
      suggestedFiles: fileTargets,
      title: "App shell and navigation"
    }),
    ...screens.map((screen, index) =>
      baseMilestone({
        acceptanceChecks: [`${screen} responsibilities are defined`, "screen supports the app blueprint"],
        dependsOn: ["app-shell-navigation"],
        id: `screen-${index + 1}`,
        mode: "CODE",
        priority: index + 2,
        purpose: `Plan or scaffold the ${screen} screen/module.`,
        requiredInputs: ["blueprint screens", "requested features"],
        riskLevel: screen.toLowerCase().includes("billing") || screen.toLowerCase().includes("auth") ? "medium" : "low",
        suggestedFiles: fileTargets,
        title: screen
      })
    ),
    baseMilestone({
      acceptanceChecks: ["entities are listed", "relationships are clear", "database assumptions are explicit"],
      dependsOn: ["app-shell-navigation"],
      id: "data-model-plan",
      mode: "CODE",
      priority: screens.length + 2,
      purpose: "Define the app data model and core entities.",
      requiredInputs: ["blueprint entities", "requested integrations"],
      riskLevel: "medium",
      suggestedFiles: fileTargets,
      title: "Data model plan"
    }),
    baseMilestone({
      acceptanceChecks: ["auth/security risks are named", "billing placeholders are not fake live integrations", "test plan exists"],
      dependsOn: ["data-model-plan"],
      id: "security-testing-plan",
      mode: "CODE",
      priority: screens.length + 3,
      purpose: "Capture security, integration, and testing expectations before execution.",
      requiredInputs: ["requested features", "integration placeholders"],
      riskLevel: "medium",
      suggestedFiles: fileTargets,
      title: "Security and testing plan"
    })
  ];

  return {
    blockedUntil: ["user approval before file mutation", "real provider credentials before live auth/billing integration"],
    confidence: Math.min(0.94, (input.contextPriority.confidence + input.businessBlueprint.confidence) / 2 + 0.04),
    decompositionId: `${input.businessBlueprint.blueprintId}_code_decomposition`,
    decompositionStatus: "decomposed",
    dependencies: ["intent translator", "business blueprint", "context priority"],
    executionStrategy: "phased_code_plan",
    fileTargets,
    milestones,
    orderedTasks: milestones.map((milestone) => milestone.title),
    recommendedPhasePolicy: "multi_phase",
    riskNotes: ["Large CODE apps should be planned in phases before broad implementation."],
    taskKind: "code_app_build",
    validationChecks: unique([
      ...input.businessBlueprint.acceptanceChecks,
      "CODE proposal does not create static marketing website files unless requested",
      "architecture, data model, security, and test plan exist"
    ])
  };
}

export function decomposeTask(input: BuildTaskDecompositionInput): TaskDecomposition {
  if (input.contextPriority.authoritativeMode === "ASK") {
    return askDecomposition(input);
  }

  if (input.contextPriority.authoritativeIntentFamily === "targeted_text_replacement") {
    return targetedEditDecomposition(input);
  }

  if (input.contextPriority.authoritativeMode === "CODE") {
    return codeDecomposition(input);
  }

  return websiteDecomposition(input);
}

export function summarizeTaskDecomposition(decomposition: TaskDecomposition) {
  return [
    `${decomposition.decompositionId}`,
    `kind=${decomposition.taskKind}`,
    `strategy=${decomposition.executionStrategy}`,
    `milestones=${decomposition.milestones.length}`,
    `policy=${decomposition.recommendedPhasePolicy}`,
    `confidence=${decomposition.confidence.toFixed(2)}`
  ].join("; ");
}
