import type { BusinessBlueprint, BlueprintPreviewType } from "@/lib/server/ai/blueprint-matcher";
import type { TranslatedIntentSpec } from "@/lib/server/ai/intent-translator";
import type { ProjectContract } from "@/lib/server/ai/project-contract";

export type ContextPriorityStatus = "clear" | "conflicts_resolved" | "low_confidence";
export type AuthoritativeIntentFamily =
  | "answer"
  | "app_or_system_generation"
  | "full_generation"
  | "landing_page"
  | "regeneration"
  | "runtime_action"
  | "targeted_text_replacement"
  | "visual_edit";

export type ContextSource = {
  priority: number;
  source: string;
  status: "authoritative" | "fallback" | "suppressed" | "supporting";
  value: string;
};

export type ContextConflict = {
  kept: string;
  reason: string;
  suppressed: string;
};

export type ContextPriorityResult = {
  authoritativeBusinessType: string | null;
  authoritativeConstraints: string[];
  authoritativeDomain: string | null;
  authoritativeFeatures: string[];
  authoritativeIntentFamily: AuthoritativeIntentFamily;
  authoritativeMode: "ASK" | "CODE" | "WEBSITE";
  authoritativePreviewType: BlueprintPreviewType;
  confidence: number;
  conflicts: ContextConflict[];
  contextSources: ContextSource[];
  priorityNotes: string[];
  priorityStatus: ContextPriorityStatus;
  suppressedContext: ContextSource[];
};

type BuildContextPriorityInput = {
  businessBlueprint: BusinessBlueprint;
  currentPrompt: string;
  fallbackDefaults?: string[];
  previousProposalContext?: string | null;
  productMode: "ASK" | "CODE" | "WEBSITE";
  projectContract: ProjectContract | null;
  regenerationContext?: string | null;
  translatedIntent: TranslatedIntentSpec;
  workspaceContextSummary?: string | null;
};

function normalize(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function isSmallEdit(prompt: string) {
  return /\b(?:rename|replace|change)\s+.+?\s+(?:to|with)\s+.+/i.test(prompt);
}

function isLandingPage(prompt: string) {
  const text = normalize(prompt);

  return text.includes("landing page") || text.includes("static website") || text.includes("product website");
}

function isRegeneration(prompt: string, regenerationContext?: string | null) {
  const text = normalize(prompt);

  return Boolean(regenerationContext?.trim()) ||
    text.includes("regenerate") ||
    text.includes("safer proposal") ||
    text.includes("previous proposal was blocked") ||
    text.includes("fix the blocked");
}

function intentFamilyFor(input: BuildContextPriorityInput): AuthoritativeIntentFamily {
  const prompt = input.currentPrompt;
  const text = normalize(prompt);

  if (input.productMode === "ASK") return "answer";
  if (isRegeneration(prompt, input.regenerationContext)) return "regeneration";
  if (isSmallEdit(prompt)) return "targeted_text_replacement";
  if (text.includes("theme") || text.includes("color") || text.includes("colour") || text.includes("make it")) {
    return "visual_edit";
  }
  if (input.productMode === "CODE") return "app_or_system_generation";
  if (input.translatedIntent.domain === "crm" && isLandingPage(prompt)) return "landing_page";
  if (input.businessBlueprint.blueprintKind === "website") return "full_generation";

  return "full_generation";
}

function previewTypeFor(input: BuildContextPriorityInput, intentFamily: AuthoritativeIntentFamily): BlueprintPreviewType {
  if (input.productMode === "ASK") return "none";
  if (input.productMode === "CODE") return input.businessBlueprint.previewType === "website_static_preview"
    ? "code_plan_preview"
    : input.businessBlueprint.previewType;
  if (intentFamily === "landing_page") return "website_static_preview";
  if (input.productMode === "WEBSITE") return input.businessBlueprint.previewType === "code_app_preview"
    ? "website_static_preview"
    : input.businessBlueprint.previewType;

  return input.businessBlueprint.previewType;
}

function source(priority: number, sourceName: string, value: string, status: ContextSource["status"]): ContextSource {
  return {
    priority,
    source: sourceName,
    status,
    value
  };
}

function conflictsFor(input: BuildContextPriorityInput, authoritativeDomain: string | null, authoritativeMode: "ASK" | "CODE" | "WEBSITE", authoritativePreviewType: BlueprintPreviewType) {
  const conflicts: ContextConflict[] = [];

  if (
    input.projectContract?.domain &&
    authoritativeDomain &&
    normalize(input.projectContract.domain) !== normalize(authoritativeDomain)
  ) {
    conflicts.push({
      kept: `current prompt domain ${authoritativeDomain}`,
      reason: "Current user prompt and translated intent outrank HASSALI.md.",
      suppressed: `contract domain ${input.projectContract.domain}`
    });
  }

  if (input.projectContract?.projectType && input.projectContract.projectType !== authoritativeMode) {
    conflicts.push({
      kept: `selected mode ${authoritativeMode}`,
      reason: "Explicit selected product mode outranks old project context.",
      suppressed: `contract mode ${input.projectContract.projectType}`
    });
  }

  if (authoritativeMode === "CODE" && authoritativePreviewType === "website_static_preview") {
    conflicts.push({
      kept: "CODE app/code plan preview",
      reason: "CODE requests must not be forced into static WEBSITE preview.",
      suppressed: "website_static_preview"
    });
  }

  if (authoritativeMode === "WEBSITE" && input.businessBlueprint.blueprintKind === "code_app" && isLandingPage(input.currentPrompt)) {
    conflicts.push({
      kept: "WEBSITE landing page",
      reason: "The current prompt asks for a landing page, so SaaS/product WEBSITE context wins over app blueprint context.",
      suppressed: "CODE CRM app blueprint"
    });
  }

  if (authoritativeMode === "ASK" && input.businessBlueprint.blueprintKind !== "answer") {
    conflicts.push({
      kept: "ASK answer-only context",
      reason: "ASK mode suppresses mutation contexts unless the user explicitly switches modes.",
      suppressed: `${input.businessBlueprint.blueprintName} blueprint`
    });
  }

  return conflicts;
}

export function buildContextPriority(input: BuildContextPriorityInput): ContextPriorityResult {
  const authoritativeMode = input.productMode;
  const authoritativeIntentFamily = intentFamilyFor(input);
  const authoritativeDomain = input.translatedIntent.domain ?? input.businessBlueprint.matchedDomain ?? null;
  const authoritativeBusinessType = input.translatedIntent.businessType ?? input.businessBlueprint.blueprintName ?? null;
  const authoritativePreviewType = previewTypeFor(input, authoritativeIntentFamily);
  const authoritativeFeatures = unique([
    ...input.translatedIntent.requestedFeatures,
    ...input.businessBlueprint.mustInclude
  ]);
  const authoritativeConstraints = unique([
    ...input.translatedIntent.constraints,
    `preview:${authoritativePreviewType}`,
    `intent-family:${authoritativeIntentFamily}`,
    ...input.businessBlueprint.acceptanceChecks.map((check) => `check:${check}`)
  ]);
  const conflicts = conflictsFor(input, authoritativeDomain, authoritativeMode, authoritativePreviewType);
  const suppressedContext = conflicts.map((conflict, index) =>
    source(6 + index, "suppressed_conflict", conflict.suppressed, "suppressed")
  );
  const contextSources: ContextSource[] = [
    source(1, "current_user_prompt", input.currentPrompt, "authoritative"),
    source(2, "selected_product_mode", authoritativeMode, "authoritative"),
    source(3, "explicit_prompt_constraints", input.translatedIntent.constraints.join("; ") || "none", "authoritative"),
    source(4, "intent_translator", `${input.translatedIntent.domain ?? "unknown"} / ${input.translatedIntent.businessType ?? "unknown"}`, "supporting"),
    source(5, "business_blueprint", input.businessBlueprint.blueprintId, "supporting"),
    input.projectContract
      ? source(6, "HASSALI.md", `${input.projectContract.projectType} / ${input.projectContract.domain ?? "unknown"}`, conflicts.some((conflict) => conflict.suppressed.includes("contract")) ? "suppressed" : "fallback")
      : source(6, "HASSALI.md", "none", "fallback"),
    input.workspaceContextSummary
      ? source(7, "workspace_context", input.workspaceContextSummary, "fallback")
      : source(7, "workspace_context", "none", "fallback"),
    input.previousProposalContext
      ? source(8, "previous_proposal", input.previousProposalContext, isRegeneration(input.currentPrompt, input.regenerationContext) ? "supporting" : "suppressed")
      : source(8, "previous_proposal", "none", "fallback"),
    source(9, "fallback_defaults", input.fallbackDefaults?.join("; ") || "generic safe defaults", "fallback"),
    source(10, "examples_system_guidance", "examples are guidance only, never current truth", "fallback")
  ];
  const confidence = Math.min(
    0.97,
    Number(((input.translatedIntent.confidence + input.businessBlueprint.confidence) / 2 + (conflicts.length ? -0.08 : 0.04)).toFixed(2))
  );

  return {
    authoritativeBusinessType,
    authoritativeConstraints,
    authoritativeDomain,
    authoritativeFeatures,
    authoritativeIntentFamily,
    authoritativeMode,
    authoritativePreviewType,
    confidence,
    conflicts,
    contextSources,
    priorityNotes: [
      "Current user prompt has top priority.",
      "Selected ASK/WEBSITE/CODE mode outranks stale project context.",
      authoritativeIntentFamily === "targeted_text_replacement"
        ? "Small edit intent suppresses full generation requirements."
        : "",
      authoritativeMode === "ASK" ? "ASK suppresses mutation context by default." : "",
      conflicts.length ? `${conflicts.length} conflict(s) resolved before kernel/proposal generation.` : "No context conflicts detected."
    ].filter(Boolean),
    priorityStatus: conflicts.length ? "conflicts_resolved" : confidence >= 0.55 ? "clear" : "low_confidence",
    suppressedContext
  };
}

export function summarizeContextPriority(priority: ContextPriorityResult) {
  return [
    `mode=${priority.authoritativeMode}`,
    `domain=${priority.authoritativeDomain ?? "unknown"}`,
    `intent=${priority.authoritativeIntentFamily}`,
    `preview=${priority.authoritativePreviewType}`,
    `status=${priority.priorityStatus}`,
    `conflicts=${priority.conflicts.length}`,
    `suppressed=${priority.suppressedContext.length}`,
    `confidence=${priority.confidence.toFixed(2)}`
  ].join("; ");
}
