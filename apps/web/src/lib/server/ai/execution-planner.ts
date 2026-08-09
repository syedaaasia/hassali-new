import type { BusinessBlueprint } from "@/lib/server/ai/blueprint-matcher";
import {
  summarizeAdaptiveCodePlan,
  type AdaptiveCodePlan,
  type AdaptiveCodePlanSummary
} from "@/lib/server/ai/adaptive-code-planner";
import type { ContextPriorityResult } from "@/lib/server/ai/context-priority-engine";
import type { TranslatedIntentSpec } from "@/lib/server/ai/intent-translator";
import type { ProjectContract } from "@/lib/server/ai/project-contract";
import type { TaskDecomposition } from "@/lib/server/ai/task-decomposer";

export type ExecutionPlanStatus = "answer_only" | "planned" | "targeted";
export type ExecutionPlanStrategy =
  | "answer_only"
  | "docs_first_then_source"
  | "phased_proposal"
  | "single_proposal"
  | "single_targeted_patch";
export type ExecutionPlanMode = "ASK" | "CODE" | "WEBSITE";
export type ExecutionStageType =
  | "answer"
  | "content"
  | "discovery"
  | "integration"
  | "interaction"
  | "structure"
  | "styling"
  | "validation";
export type ExecutionRiskLevel = "high" | "low" | "medium";

export type ExecutionStage = {
  canRunInParallel: boolean;
  dependsOn: string[];
  id: string;
  purpose: string;
  requiredBeforeExecution: string[];
  riskLevel: ExecutionRiskLevel;
  rollbackNote: string;
  stageType: ExecutionStageType;
  tasks: string[];
  title: string;
  validationChecks: string[];
};

export type ExecutionPlan = {
  adaptiveCodePlan?: AdaptiveCodePlanSummary;
  approvalCheckpoints: string[];
  blockers: string[];
  completionChecks: string[];
  confidence: number;
  executionMode: ExecutionPlanMode;
  executionPlanId: string;
  executionPlanStatus: ExecutionPlanStatus;
  executionStages: ExecutionStage[];
  executionStrategy: ExecutionPlanStrategy;
  parallelTasks: string[];
  prerequisites: string[];
  recommendedExecutionPolicy: ExecutionPlanStrategy;
  riskLevel: ExecutionRiskLevel;
  rollbackChecks: string[];
  sequentialTasks: string[];
};

type BuildExecutionPlanInput = {
  adaptiveCodePlan?: AdaptiveCodePlan | null;
  businessBlueprint: BusinessBlueprint;
  contextPriority: ContextPriorityResult;
  currentPrompt: string;
  productMode: ExecutionPlanMode;
  projectContract: ProjectContract | null;
  taskDecomposition: TaskDecomposition;
  translatedIntent: TranslatedIntentSpec;
};

function adaptiveRisk(risk: AdaptiveCodePlan["risk"]): ExecutionRiskLevel {
  if (risk === "CRITICAL" || risk === "HIGH") return "high";
  if (risk === "MODERATE") return "medium";
  return "low";
}

function adaptiveCodeExecutionPlan(plan: AdaptiveCodePlan): ExecutionPlan {
  const riskLevel = adaptiveRisk(plan.risk);
  const policy: ExecutionPlanStrategy = plan.complexity === "tiny"
    ? "single_targeted_patch"
    : plan.complexity === "small" || plan.complexity === "medium"
      ? "single_proposal"
      : "docs_first_then_source";
  const executionStages: ExecutionStage[] = plan.actions.map((action) => ({
    canRunInParallel: false,
    dependsOn: action.dependsOn,
    id: action.id,
    purpose: action.objective,
    requiredBeforeExecution: [
      ...(action.dependsOn.length ? ["dependent plan actions completed"] : ["selected project context"]),
      ...((action.mutates || (action.kind === "verify" && plan.intent.requiresExecution)) &&
        plan.approvalRequirements.explicitApprovalRequired
        ? ["explicit approval"]
        : [])
    ],
    riskLevel,
    rollbackNote: action.mutates
      ? plan.reversibility === "reversible"
        ? "Keep the change bounded and restore only the reviewed attempt if verification fails."
        : "Stop before mutation unless recovery and explicit approval are proven."
      : "No rollback is needed for this non-mutating planning action.",
    stageType: action.kind === "inspect" || action.kind === "diagnose"
      ? "discovery"
      : action.kind === "verify" || action.kind === "deliver"
        ? "validation"
        : "structure",
    tasks: [action.objective],
    title: action.id.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" "),
    validationChecks: [...action.acceptanceCriteria, ...action.verification]
  }));
  const blockers = [
    ...plan.constraintConflicts.filter((conflict) => conflict.severity === "blocking").map((conflict) => conflict.reason),
    ...plan.ambiguities.filter((ambiguity) => ambiguity.blocking).map((ambiguity) => ambiguity.reason)
  ];
  return {
    adaptiveCodePlan: summarizeAdaptiveCodePlan(plan),
    approvalCheckpoints: plan.approvalRequirements.reasons,
    blockers,
    completionChecks: plan.acceptanceCriteria,
    confidence: plan.validation.valid ? 0.94 : 0.5,
    executionMode: "CODE",
    executionPlanId: plan.taskId,
    executionPlanStatus: plan.complexity === "tiny" ? "targeted" : "planned",
    executionStages,
    executionStrategy: policy,
    parallelTasks: [],
    prerequisites: plan.repositoryInspection.requiredEvidence,
    recommendedExecutionPolicy: policy,
    riskLevel,
    rollbackChecks: [
      "Preserve unrelated user work.",
      plan.reversibility === "reversible"
        ? "Prefer a bounded reversible change."
        : "Require explicit recovery evidence before irreversible work."
    ],
    sequentialTasks: executionStages.map((stage) => stage.title)
  };
}

function stage(input: ExecutionStage): ExecutionStage {
  return input;
}

function riskFromStages(stages: ExecutionStage[]): ExecutionRiskLevel {
  if (stages.some((candidate) => candidate.riskLevel === "high")) return "high";
  if (stages.some((candidate) => candidate.riskLevel === "medium")) return "medium";

  return "low";
}

function answerPlan(input: BuildExecutionPlanInput): ExecutionPlan {
  const stages = [
    stage({
      canRunInParallel: false,
      dependsOn: [],
      id: "answer-only",
      purpose: "Answer the user without file or runtime mutation.",
      requiredBeforeExecution: ["current prompt"],
      riskLevel: "low",
      rollbackNote: "No rollback needed because no mutation is allowed.",
      stageType: "answer",
      tasks: input.taskDecomposition.orderedTasks,
      title: "Answer only",
      validationChecks: ["answer addresses the question", "no proposal is required unless explicitly requested"]
    })
  ];

  return {
    approvalCheckpoints: ["No approval checkpoint needed for non-mutating ASK answer."],
    blockers: [],
    completionChecks: ["Answer is scoped to user question.", "No file mutation proposal is created."],
    confidence: Math.min(0.97, input.taskDecomposition.confidence + 0.03),
    executionMode: "ASK",
    executionPlanId: "ask_answer_execution_plan",
    executionPlanStatus: "answer_only",
    executionStages: stages,
    executionStrategy: "answer_only",
    parallelTasks: [],
    prerequisites: ["current prompt"],
    recommendedExecutionPolicy: "answer_only",
    riskLevel: "low",
    rollbackChecks: ["No persisted file changes expected."],
    sequentialTasks: stages.map((candidate) => candidate.title)
  };
}

function targetedPatchPlan(input: BuildExecutionPlanInput): ExecutionPlan {
  const stages = [
    stage({
      canRunInParallel: false,
      dependsOn: [],
      id: "locate-source-text",
      purpose: "Find files containing the exact source text in the selected project.",
      requiredBeforeExecution: ["selected project", "source text"],
      riskLevel: "low",
      rollbackNote: "No file content changes in discovery stage.",
      stageType: "discovery",
      tasks: ["locate source text", "limit target files to actual matches"],
      title: "Targeted file/text discovery",
      validationChecks: ["source text exists before proposing replacement"]
    }),
    stage({
      canRunInParallel: false,
      dependsOn: ["locate-source-text"],
      id: "exact-replacement",
      purpose: "Replace only the requested text and avoid broad regeneration.",
      requiredBeforeExecution: ["matched files", "replacement text", "approval"],
      riskLevel: "medium",
      rollbackNote: "Revert changed files to their previous content if replacement is incorrect.",
      stageType: "content",
      tasks: ["replace exact text only", "preserve surrounding content"],
      title: "Exact replacement",
      validationChecks: ["no unrelated file changes", "no suggestion comments instead of real replacement"]
    }),
    stage({
      canRunInParallel: false,
      dependsOn: ["exact-replacement"],
      id: "verify-replacement",
      purpose: "Confirm old text is removed and replacement is present.",
      requiredBeforeExecution: ["updated file contents"],
      riskLevel: "low",
      rollbackNote: "Keep proposal visible if verification fails.",
      stageType: "validation",
      tasks: ["verify replacement exists", "verify source text removed from changed files"],
      title: "Verify replacement",
      validationChecks: ["target text removed where intended", "replacement text visible in changed files"]
    })
  ];

  return {
    approvalCheckpoints: ["User must approve the exact targeted patch before file mutation."],
    blockers: input.taskDecomposition.blockedUntil,
    completionChecks: ["Replacement persisted.", "No full website/app regeneration occurred."],
    confidence: Math.min(0.96, input.taskDecomposition.confidence + 0.04),
    executionMode: input.productMode === "CODE" ? "CODE" : "WEBSITE",
    executionPlanId: "targeted_text_replacement_execution_plan",
    executionPlanStatus: "targeted",
    executionStages: stages,
    executionStrategy: "single_targeted_patch",
    parallelTasks: [],
    prerequisites: ["selected project", "source text", "replacement text"],
    recommendedExecutionPolicy: "single_targeted_patch",
    riskLevel: riskFromStages(stages),
    rollbackChecks: ["Changed files can be restored from diff preview if replacement is wrong."],
    sequentialTasks: stages.map((candidate) => candidate.title)
  };
}

function websitePolicy(input: BuildExecutionPlanInput): ExecutionPlanStrategy {
  const pageCount = input.translatedIntent.pages.count ?? 1;
  const sectionCount = input.businessBlueprint.sections.length;

  return pageCount > 4 || sectionCount > 8 ? "phased_proposal" : "single_proposal";
}

function websitePlan(input: BuildExecutionPlanInput): ExecutionPlan {
  const policy = websitePolicy(input);
  const stages = [
    stage({
      canRunInParallel: false,
      dependsOn: [],
      id: "website-structure",
      purpose: "Create page shell, navigation, file strategy, and requested pages.",
      requiredBeforeExecution: ["authoritative website mode", "requested pages", "approval"],
      riskLevel: "medium",
      rollbackNote: "Revert created/updated static files if page structure is wrong.",
      stageType: "structure",
      tasks: ["site shell/navigation", "page structure", ...input.taskDecomposition.fileTargets],
      title: "Structure and page shell",
      validationChecks: ["requested pages exist", "file targets match decomposition"]
    }),
    stage({
      canRunInParallel: false,
      dependsOn: ["website-structure"],
      id: "website-content",
      purpose: "Compose domain-specific sections and public copy from blueprint milestones.",
      requiredBeforeExecution: ["business blueprint", "ordered section milestones"],
      riskLevel: "medium",
      rollbackNote: "Revert content sections if stale or wrong-domain copy appears.",
      stageType: "content",
      tasks: input.taskDecomposition.orderedTasks.filter((task) => !task.toLowerCase().includes("responsive")),
      title: "Section and content composition",
      validationChecks: ["copy matches authoritative domain", "must-avoid terms are absent"]
    }),
    stage({
      canRunInParallel: true,
      dependsOn: ["website-content"],
      id: "website-styling-assets",
      purpose: "Apply requested style, palette, asset strategy, and responsive-friendly visual rules.",
      requiredBeforeExecution: ["translated style/theme constraints"],
      riskLevel: "medium",
      rollbackNote: "Revert CSS/asset changes if styling breaks readability or requested theme.",
      stageType: "styling",
      tasks: ["styling/visual rules", "asset/placeholder treatment", "responsive layout rules"],
      title: "Styling, assets, and visual rules",
      validationChecks: ["requested colors/style represented", "no broken image placeholders", "layout remains readable"]
    }),
    stage({
      canRunInParallel: true,
      dependsOn: ["website-content"],
      id: "website-interactions",
      purpose: "Add lightweight interactions and runtime script only where needed.",
      requiredBeforeExecution: ["main.js needed by decomposition or requested interactions"],
      riskLevel: "low",
      rollbackNote: "Remove script changes if they create preview/runtime issues.",
      stageType: "interaction",
      tasks: ["lightweight JS only", "no package installs", "no heavy animation loops"],
      title: "Interaction/runtime scripts",
      validationChecks: ["main.js is not required for pure text edits", "scripts stay lightweight"]
    }),
    stage({
      canRunInParallel: false,
      dependsOn: ["website-styling-assets", "website-interactions"],
      id: "website-validation",
      purpose: "Validate responsive behavior, preview readiness, and no blank files.",
      requiredBeforeExecution: ["all proposed file content"],
      riskLevel: "low",
      rollbackNote: "Keep proposal visible and skip preview reload if validation or save fails.",
      stageType: "validation",
      tasks: ["responsive validation", "preview/static runtime check", "no blank file check"],
      title: "Responsive and preview validation",
      validationChecks: input.taskDecomposition.validationChecks
    })
  ];

  return {
    approvalCheckpoints: ["User approval before file mutation.", "Preview reload only after all file saves succeed."],
    blockers: input.taskDecomposition.blockedUntil,
    completionChecks: ["Website files match authoritative domain and pages.", "Preview can reload after persistence."],
    confidence: Math.min(0.95, (input.taskDecomposition.confidence + input.contextPriority.confidence) / 2 + 0.05),
    executionMode: "WEBSITE",
    executionPlanId: `${input.taskDecomposition.decompositionId}_execution_plan`,
    executionPlanStatus: "planned",
    executionStages: stages,
    executionStrategy: policy,
    parallelTasks: ["Styling/assets and lightweight interactions can be reviewed in the same proposal after content exists."],
    prerequisites: ["selected project", "approval-first proposal", "authoritative WEBSITE context"],
    recommendedExecutionPolicy: policy,
    riskLevel: riskFromStages(stages),
    rollbackChecks: ["Use diff preview to inspect changed static files.", "Do not clear proposal if persistence fails."],
    sequentialTasks: stages.map((candidate) => candidate.title)
  };
}

function codePlan(input: BuildExecutionPlanInput): ExecutionPlan {
  const policy: ExecutionPlanStrategy = input.taskDecomposition.fileTargets.length > 3
    ? "docs_first_then_source"
    : "phased_proposal";
  const stages = [
    stage({
      canRunInParallel: false,
      dependsOn: [],
      id: "code-architecture-file-strategy",
      purpose: "Define architecture, scope, and safe file strategy before source mutation.",
      requiredBeforeExecution: ["authoritative CODE mode", "approval"],
      riskLevel: "medium",
      rollbackNote: "Revert docs/plans if architecture is wrong before source changes begin.",
      stageType: "structure",
      tasks: ["architecture and file strategy", "screen/module map", "phase boundaries"],
      title: "Architecture and file strategy",
      validationChecks: ["not a public marketing website", "planned files match CODE preview lane"]
    }),
    stage({
      canRunInParallel: false,
      dependsOn: ["code-architecture-file-strategy"],
      id: "code-data-model-interfaces",
      purpose: "Plan entities, relationships, interfaces, and persistence boundaries.",
      requiredBeforeExecution: ["blueprint data entities", "requested features"],
      riskLevel: "medium",
      rollbackNote: "Revise data model docs before implementing source if entities are wrong.",
      stageType: "structure",
      tasks: ["data model", "interfaces/contracts", ...input.businessBlueprint.dataEntities],
      title: "Data model and interfaces",
      validationChecks: ["entities match blueprint", "database assumptions are explicit"]
    }),
    stage({
      canRunInParallel: false,
      dependsOn: ["code-data-model-interfaces"],
      id: "code-auth-security",
      purpose: "Define auth/security foundation without fake live integrations.",
      requiredBeforeExecution: ["auth requirement", "security assumptions"],
      riskLevel: "high",
      rollbackNote: "Keep auth/billing as placeholders until credentials and provider choices are approved.",
      stageType: "integration",
      tasks: ["auth foundation", "security notes", "environment variables"],
      title: "Auth and security foundation",
      validationChecks: ["no secrets client-side", "provider placeholders are clearly labeled"]
    }),
    stage({
      canRunInParallel: true,
      dependsOn: ["code-data-model-interfaces"],
      id: "code-app-shell-screens",
      purpose: "Plan app shell, dashboard, and user-facing screens/modules.",
      requiredBeforeExecution: ["screen list", "component strategy"],
      riskLevel: "medium",
      rollbackNote: "Revert screen/source changes if app scope drifts from CODE blueprint.",
      stageType: "content",
      tasks: input.taskDecomposition.orderedTasks,
      title: "App shell and screens",
      validationChecks: ["screens match CODE blueprint", "no static website fallback"]
    }),
    stage({
      canRunInParallel: true,
      dependsOn: ["code-auth-security"],
      id: "code-integrations-placeholders",
      purpose: "Represent billing/database/integration placeholders safely.",
      requiredBeforeExecution: ["integration requirements", "approval"],
      riskLevel: "medium",
      rollbackNote: "Remove or revise placeholder integrations if they imply live behavior.",
      stageType: "integration",
      tasks: input.businessBlueprint.integrations,
      title: "Integrations and billing placeholders",
      validationChecks: ["billing/auth are placeholders unless configured", "no fake provider calls"]
    }),
    stage({
      canRunInParallel: false,
      dependsOn: ["code-app-shell-screens", "code-integrations-placeholders"],
      id: "code-validation-testing",
      purpose: "Document validation, testing, and maintainability checkpoints.",
      requiredBeforeExecution: ["planned docs/source changes"],
      riskLevel: "medium",
      rollbackNote: "Do not mark proposal applied if persistence or validation fails.",
      stageType: "validation",
      tasks: ["validation/testing plan", "typecheck/build guidance", "security review"],
      title: "Validation and testing plan",
      validationChecks: input.taskDecomposition.validationChecks
    })
  ];

  return {
    approvalCheckpoints: ["User approval before docs/source mutation.", "Large CODE apps should proceed in phases."],
    blockers: input.taskDecomposition.blockedUntil,
    completionChecks: ["Architecture and data model are explicit.", "Auth/billing risks are named.", "No static marketing website generated."],
    confidence: Math.min(0.94, (input.taskDecomposition.confidence + input.contextPriority.confidence) / 2 + 0.04),
    executionMode: "CODE",
    executionPlanId: `${input.taskDecomposition.decompositionId}_execution_plan`,
    executionPlanStatus: "planned",
    executionStages: stages,
    executionStrategy: policy,
    parallelTasks: ["App shell/screens and placeholder integration planning can be reviewed after data model is stable."],
    prerequisites: ["selected project", "approval-first proposal", "authoritative CODE context"],
    recommendedExecutionPolicy: policy,
    riskLevel: riskFromStages(stages),
    rollbackChecks: ["Use diff review before applying docs/source.", "Keep proposal visible if any save fails."],
    sequentialTasks: stages.map((candidate) => candidate.title)
  };
}

export function buildExecutionPlan(input: BuildExecutionPlanInput): ExecutionPlan {
  if (input.contextPriority.authoritativeMode === "ASK") {
    return answerPlan(input);
  }

  if (input.contextPriority.authoritativeIntentFamily === "targeted_text_replacement") {
    return targetedPatchPlan(input);
  }

  if (input.contextPriority.authoritativeMode === "CODE") {
    if (input.adaptiveCodePlan) return adaptiveCodeExecutionPlan(input.adaptiveCodePlan);
    return codePlan(input);
  }

  return websitePlan(input);
}

export function summarizeExecutionPlan(plan: ExecutionPlan) {
  return [
    `${plan.executionPlanId}`,
    `mode=${plan.executionMode}`,
    `strategy=${plan.executionStrategy}`,
    `stages=${plan.executionStages.length}`,
    `policy=${plan.recommendedExecutionPolicy}`,
    `risk=${plan.riskLevel}`,
    `confidence=${plan.confidence.toFixed(2)}`
  ].join("; ");
}
