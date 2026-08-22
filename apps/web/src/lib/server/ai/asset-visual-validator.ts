import type { BusinessBlueprint } from "@/lib/server/ai/blueprint-matcher";
import type { CompositionPlan } from "@/lib/server/ai/composition-engine";
import type { ContextPriorityResult } from "@/lib/server/ai/context-priority-engine";
import type { DomainValidationResult } from "@/lib/server/ai/domain-validator";
import type { ExecutionPlan } from "@/lib/server/ai/execution-planner";
import type { TranslatedIntentSpec } from "@/lib/server/ai/intent-translator";
import type { ProposalContext } from "@/lib/server/ai/proposal-context";
import type { ProjectContract } from "@/lib/server/ai/project-contract";
import type { ProposalQualityGateResult } from "@/lib/server/ai/proposal-quality-gate";
import type { TaskDecomposition } from "@/lib/server/ai/task-decomposer";

export type AssetVisualValidationStatus = "blocked" | "passed" | "review_required" | "warning";
export type AssetVisualIssueSeverity = "block" | "failure" | "warning";

export type AssetVisualIssue = {
  category: string;
  evidence: string;
  id: string;
  message: string;
  repairHint: string;
  severity: AssetVisualIssueSeverity;
};

export type AssetVisualValidationResult = {
  acceptanceChecks: string[];
  allowedAssetCategories: string[];
  assetDriftDetected: boolean;
  assetScore: number;
  assetValidationId: string;
  assetValidationStatus: AssetVisualValidationStatus;
  blockedAssetCategories: string[];
  confidence: number;
  detectedVisualSignals: string[];
  expectedVisualSignals: string[];
  galleryAssetMismatch: boolean;
  heroAssetMismatch: boolean;
  logoMismatch: boolean;
  mismatchedAssets: string[];
  missingAssets: string[];
  placeholderOnlyVisualDetected: boolean;
  productAssetMismatch: boolean;
  repairHints: string[];
  shouldBlockVisualApproval: boolean;
  visualBlocks: AssetVisualIssue[];
  visualDriftDetected: boolean;
  visualFailures: AssetVisualIssue[];
  visualScore: number;
  visualValidationStatus: AssetVisualValidationStatus;
  visualWarnings: AssetVisualIssue[];
};

type BuildAssetVisualValidationInput = {
  businessBlueprint: BusinessBlueprint;
  compositionPlan: CompositionPlan;
  contextPriority: ContextPriorityResult;
  currentPrompt: string;
  domainValidation: DomainValidationResult;
  executionPlan: ExecutionPlan;
  productMode: "ASK" | "CODE" | "WEBSITE";
  proposalContext?: ProposalContext;
  projectContract: ProjectContract | null;
  proposalQuality: ProposalQualityGateResult;
  proposalSummary?: string;
  proposedFiles?: Record<string, string>;
  taskDecomposition: TaskDecomposition;
  translatedIntent: TranslatedIntentSpec;
};

type AssetProfile = {
  allowed: string[];
  blocked: string[];
};

const profiles: Record<string, AssetProfile> = {
  coffee: {
    allowed: ["coffee", "cup", "beans", "espresso", "latte", "cafe interior", "pastry", "barista"],
    blocked: ["dental", "furniture catalog", "TV", "shoe", "CRM dashboard", "clinic"]
  },
  crm: {
    allowed: ["CRM dashboard preview", "customer table", "billing panel", "pipeline board", "metric cards", "activity feed", "dashboard", "analytics", "charts", "pipeline", "contacts", "workflow", "automation", "table UI", "business UI"],
    blocked: ["dentist", "furniture product", "sofa", "chair", "table", "cupboard", "coffee", "flowers", "TV products", "shoe", "food"]
  },
  dental: {
    allowed: ["dentist", "dental chair", "clinic", "smile", "teeth", "hygiene", "doctor", "patient consultation", "treatment room"],
    blocked: ["coffee", "furniture", "TV", "shoe", "bouquet", "restaurant food", "coding dashboard"]
  },
  electronics_retail: {
    allowed: ["TV", "smart TV", "OLED", "QLED", "LED", "home theater", "electronics showroom", "remote", "screen", "installation"],
    blocked: ["dental", "flowers", "coffee", "sofa-only", "shoe", "restaurant", "clinic"]
  },
  floral: {
    allowed: ["flower", "bouquet", "arrangement", "wedding", "event floral", "delivery bouquet", "rose", "fresh flowers", "gifting"],
    blocked: ["dentist", "furniture", "TV", "laptop", "shoe", "dashboard", "coffee beans"]
  },
  furniture: {
    allowed: ["sofa", "chair", "table", "cupboard", "wardrobe", "bed", "dining", "living room", "interior", "decor", "showroom", "wood", "upholstery"],
    blocked: ["dentist", "clinic", "coffee", "cafe", "flower", "bouquet", "TV", "laptop", "shoe", "coding", "dashboard"]
  },
  restaurant: {
    allowed: ["food", "menu", "dining", "chef", "restaurant", "table setting", "dish", "reservation"],
    blocked: ["dental", "CRM dashboard", "TV", "furniture catalog", "shoe"]
  },
  saas: {
    allowed: ["dashboard", "workflow", "analytics", "interface", "automation", "charts", "product UI"],
    blocked: ["dentist", "sofa", "flowers", "coffee beans", "TV products", "restaurant food"]
  }
};

const genericPlaceholderTerms = ["hero", "image", "placeholder", "visual", "photo"];
const visualAttributePattern = /\b(?:alt|aria-label|title|class|src)\s*=\s*["']([^"']+)["']/gi;
const imageTagPattern = /<img\b[^>]*>/gi;
const visualClassPattern = /\b(?:visual|hero|gallery|product|image|photo|logo|background)[-_a-z0-9]*\b/gi;

function normalize(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function includesSignal(text: string, signal: string) {
  const normalizedText = normalize(text);
  const normalizedSignal = normalize(signal);

  if (normalizedSignal.length <= 3) {
    const escaped = normalizedSignal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, "i").test(normalizedText);
  }

  return normalizedText.includes(normalizedSignal);
}

function contentFromFiles(files?: Record<string, string>) {
  return Object.entries(files ?? {})
    .map(([path, content]) => `\nFILE:${path}\n${content}`)
    .join("\n");
}

function profileFor(domain: string | null): AssetProfile {
  const normalizedDomain = domain ? normalize(domain) : null;
  if (domain && profiles[domain]) return profiles[domain];
  if (normalizedDomain?.includes("crm")) return profiles.crm;
  if (normalizedDomain?.includes("restaurant") || normalizedDomain?.includes("seafood")) return profiles.restaurant;

  return {
    allowed: ["domain-specific visual", "brand-relevant icon", "service visual"],
    blocked: ["stale unrelated domain visual", "generic placeholder-only visual"]
  };
}

function issue(input: {
  category: string;
  evidence: string;
  id: string;
  message: string;
  repairHint: string;
  severity: AssetVisualIssueSeverity;
}): AssetVisualIssue {
  return input;
}

function visualSnippets(text: string) {
  const snippets: string[] = [];
  let attributeMatch: RegExpExecArray | null;
  let imageMatch: RegExpExecArray | null;
  let classMatch: RegExpExecArray | null;

  while ((attributeMatch = visualAttributePattern.exec(text)) !== null) {
    snippets.push(attributeMatch[1]);
  }

  while ((imageMatch = imageTagPattern.exec(text)) !== null) {
    snippets.push(imageMatch[0]);
  }

  while ((classMatch = visualClassPattern.exec(text)) !== null) {
    snippets.push(classMatch[0]);
  }

  return unique(snippets);
}

function detectSignals(text: string, signals: string[]) {
  return signals.filter((signal) => includesSignal(text, signal));
}

function visualIntentSignals(input: BuildAssetVisualValidationInput, profile: AssetProfile) {
  return unique([
    ...profile.allowed,
    ...input.compositionPlan.assetIntent,
    ...input.compositionPlan.visualIntent,
    ...input.compositionPlan.productOrServiceEntities,
    ...input.businessBlueprint.mustInclude
  ]);
}

function placeholderOnly(snippets: string[], expectedSignals: string[]) {
  const visualSnippetsOnly = snippets.filter((snippet) =>
    genericPlaceholderTerms.some((term) => normalize(snippet) === term || normalize(snippet).includes(` ${term} `))
  );

  if (visualSnippetsOnly.length === 0) return false;

  return !snippets.some((snippet) => expectedSignals.some((signal) => includesSignal(snippet, signal)));
}

function score(input: {
  blocks: number;
  failures: number;
  missingAssets: number;
  placeholderOnly: boolean;
  staleVisual: boolean;
  warnings: number;
}) {
  return Math.max(
    0,
    Math.min(
      100,
      100 -
        input.blocks * 35 -
        input.failures * 20 -
        input.warnings * 5 -
        (input.missingAssets > 0 ? 10 : 0) -
        (input.placeholderOnly ? 15 : 0) -
        (input.staleVisual ? 15 : 0)
    )
  );
}

function statusFor(input: {
  blocks: AssetVisualIssue[];
  failures: AssetVisualIssue[];
  score: number;
  warnings: AssetVisualIssue[];
}): AssetVisualValidationStatus {
  if (input.blocks.length > 0) return "blocked";
  if (input.failures.length > 0 || input.score < 70) return "review_required";
  if (input.warnings.length > 0 || input.score < 85) return "warning";

  return "passed";
}

export function validateAssetVisuals(input: BuildAssetVisualValidationInput): AssetVisualValidationResult {
  const mode = input.contextPriority.authoritativeMode;
  const intentFamily = input.contextPriority.authoritativeIntentFamily;
  const files = input.proposedFiles ?? {};
  const content = Object.keys(files).length > 0
    ? [input.proposalSummary ?? "", contentFromFiles(files)].join("\n")
    : input.currentPrompt;
  const snippets = visualSnippets(content);
  const profile = profileFor(input.proposalContext?.domain ?? input.contextPriority.authoritativeDomain);
  const expectedVisualSignals = visualIntentSignals(input, profile);
  const blockedAssetCategories = unique(profile.blocked).filter((blockedSignal) =>
    !profile.allowed.some((allowedSignal) =>
      includesSignal(allowedSignal, blockedSignal) || includesSignal(blockedSignal, allowedSignal)
    )
  );
  const allowedAssetCategories = unique(profile.allowed);
  const detectedVisualSignals = detectSignals(content, expectedVisualSignals);
  const mismatchedAssets = detectSignals(content, blockedAssetCategories);
  const hasVisualAsset = snippets.length > 0 || /<img\b|background(?:-image)?|url\(|svg|icon|gallery|hero-visual/i.test(content);
  const expectsAssets =
    mode === "WEBSITE" &&
    intentFamily !== "targeted_text_replacement" &&
    (input.compositionPlan.assetIntent.length > 0 ||
      input.compositionPlan.productOrServiceEntities.length > 0 ||
      /\b(?:image|images|photo|photos|gallery|logo|icon|visual)\b/i.test(input.currentPrompt));
  const missingAssets = expectsAssets && detectedVisualSignals.length === 0
    ? expectedVisualSignals.slice(0, 6)
    : [];
  const placeholderOnlyVisualDetected = placeholderOnly(snippets, expectedVisualSignals);
  const heroAssetMismatch = snippets.some((snippet) => /hero/i.test(snippet) && blockedAssetCategories.some((signal) => includesSignal(snippet, signal)));
  const galleryAssetMismatch = snippets.some((snippet) => /gallery/i.test(snippet) && blockedAssetCategories.some((signal) => includesSignal(snippet, signal)));
  const productAssetMismatch = snippets.some((snippet) => /product/i.test(snippet) && blockedAssetCategories.some((signal) => includesSignal(snippet, signal)));
  const logoMismatch = snippets.some((snippet) => /logo/i.test(snippet) && blockedAssetCategories.some((signal) => includesSignal(snippet, signal)));
  const visualBlocks: AssetVisualIssue[] = [];
  const visualFailures: AssetVisualIssue[] = [];
  const visualWarnings: AssetVisualIssue[] = [];

  if (mode === "ASK" && Object.keys(files).length > 0 && hasVisualAsset) {
    visualBlocks.push(issue({
      category: "mode",
      evidence: "ASK proposal contains visual file changes.",
      id: "ask_visual_mutation",
      message: "ASK mode should not introduce visual or asset mutations.",
      repairHint: "Answer without file changes unless the user switches to WEBSITE or CODE.",
      severity: "block"
    }));
  }

  if (intentFamily === "targeted_text_replacement" && mismatchedAssets.length > 0) {
    visualBlocks.push(issue({
      category: "scope",
      evidence: mismatchedAssets.join(", "),
      id: "small_edit_asset_expansion",
      message: "Targeted text edit introduced unrelated asset changes.",
      repairHint: "Keep the edit scoped to exact text replacement.",
      severity: "block"
    }));
  }

  if (mode === "CODE") {
    const physicalSignals = mismatchedAssets.filter((signal) => !/dashboard|workflow|analytics|table|customer|billing|pipeline|metric|activity|sidebar|shell|invoice|record/i.test(signal));
    const physicalVisualSnippets = snippets.filter((snippet) =>
      physicalSignals.some((signal) => includesSignal(snippet, signal))
    );

    if (physicalVisualSnippets.length > 0) {
      visualWarnings.push(issue({
        category: "mode",
        evidence: physicalVisualSnippets.slice(0, 5).join(", "),
        id: "code_physical_asset_review",
        message: "CODE app proposal includes physical-domain visual wording to review.",
        repairHint: "Use dashboard, workflow, table, chart, or interface visuals for CODE app previews.",
        severity: "warning"
      }));
    }
  }

  if (mismatchedAssets.length > 0 && mode === "WEBSITE") {
    const severe = heroAssetMismatch || galleryAssetMismatch || productAssetMismatch;
    const target = severe ? visualBlocks : visualFailures;

    target.push(issue({
      category: "domain_asset",
      evidence: mismatchedAssets.join(", "),
      id: "wrong_domain_visuals",
      message: "Proposal includes visual signals from a different domain.",
      repairHint: "Replace mismatched visual labels/assets with domain-appropriate visual intent.",
      severity: severe ? "block" : "failure"
    }));
  }

  if (placeholderOnlyVisualDetected) {
    visualWarnings.push(issue({
      category: "placeholder",
      evidence: snippets.filter((snippet) => genericPlaceholderTerms.some((term) => includesSignal(snippet, term))).slice(0, 5).join(", "),
      id: "placeholder_only_visual",
      message: "Visual placeholders are too generic.",
      repairHint: "Replace generic visual labels with concrete subjects and roles drawn from the current domain contract.",
      severity: "warning"
    }));
  }

  if (missingAssets.length > 0) {
    visualWarnings.push(issue({
      category: "missing_assets",
      evidence: missingAssets.join(", "),
      id: "missing_expected_visual_signals",
      message: "Expected domain visual signals were not found.",
      repairHint: "Add visual labels, alt text, icon intent, or placeholders that match the authoritative domain.",
      severity: "warning"
    }));
  }

  const assetScore = score({
    blocks: visualBlocks.length,
    failures: visualFailures.length,
    missingAssets: missingAssets.length,
    placeholderOnly: placeholderOnlyVisualDetected,
    staleVisual: mismatchedAssets.length > 0,
    warnings: visualWarnings.length
  });
  const visualScore = score({
    blocks: [heroAssetMismatch, galleryAssetMismatch, productAssetMismatch, logoMismatch].filter(Boolean).length,
    failures: visualFailures.length,
    missingAssets: missingAssets.length,
    placeholderOnly: placeholderOnlyVisualDetected,
    staleVisual: mismatchedAssets.length > 0,
    warnings: visualWarnings.length
  });
  const combinedStatus = statusFor({
    blocks: visualBlocks,
    failures: visualFailures,
    score: Math.min(assetScore, visualScore),
    warnings: visualWarnings
  });
  const shouldBlockVisualApproval = combinedStatus === "blocked";

  return {
    acceptanceChecks: unique([
      "visual assets match authoritative domain",
      "hero/gallery/product visuals avoid stale domains",
      "visual placeholders are domain-specific",
      ...input.compositionPlan.acceptanceChecks,
      ...input.proposalQuality.requiredChecks
    ]),
    allowedAssetCategories,
    assetDriftDetected: mismatchedAssets.length > 0,
    assetScore,
    assetValidationId: `${mode.toLowerCase()}_${input.contextPriority.authoritativeDomain ?? "unknown"}_asset_visual_validation`,
    assetValidationStatus: combinedStatus,
    blockedAssetCategories,
    confidence: Math.min(0.94, Math.max(0.55, input.proposalQuality.confidence)),
    detectedVisualSignals,
    expectedVisualSignals,
    galleryAssetMismatch,
    heroAssetMismatch,
    logoMismatch,
    mismatchedAssets,
    missingAssets,
    placeholderOnlyVisualDetected,
    productAssetMismatch,
    repairHints: unique([...visualBlocks, ...visualFailures, ...visualWarnings].map((item) => item.repairHint)),
    shouldBlockVisualApproval,
    visualBlocks,
    visualDriftDetected: mismatchedAssets.length > 0 || placeholderOnlyVisualDetected || missingAssets.length > 0,
    visualFailures,
    visualScore,
    visualValidationStatus: combinedStatus,
    visualWarnings
  };
}

export function summarizeAssetVisualValidation(validation: AssetVisualValidationResult) {
  return [
    validation.assetValidationId,
    `asset=${validation.assetValidationStatus}`,
    `visual=${validation.visualValidationStatus}`,
    `assetScore=${validation.assetScore}`,
    `visualScore=${validation.visualScore}`,
    `mismatch=${validation.mismatchedAssets.length}`,
    `block=${validation.shouldBlockVisualApproval ? "yes" : "no"}`
  ].join("; ");
}
