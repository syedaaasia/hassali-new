import type { WebsiteAssetIntelligence } from "@/lib/server/ai/website-asset-intelligence";
import type { WebsiteCinematicExperience } from "@/lib/server/ai/website-cinematic-sequence-spec";

export type WebsiteExperienceEngine =
  | "frame_sequence"
  | "light_motion"
  | "procedural_webgl"
  | "standard_html";

export type WebsiteExperienceCost = "HIGH" | "LOW" | "MEDIUM";

export type WebsiteExperienceSectionInput = {
  body: string;
  id: string;
  kind: string;
  pagePath: string;
  title: string;
};

export type WebsiteExperienceSectionPlan = {
  accessibilityRisk: WebsiteExperienceCost;
  contentType: string;
  engine: WebsiteExperienceEngine;
  engineReason: string;
  fallback: "representative_frame" | "semantic_html" | "static_artwork";
  interactionNeed: "explain" | "navigate" | "none" | "story";
  mobileCost: WebsiteExperienceCost;
  mobileEngine: WebsiteExperienceEngine;
  pagePath: string;
  performanceCost: WebsiteExperienceCost;
  reducedMotionEngine: "standard_html";
  sectionId: string;
  sectionPurpose: string;
  semanticImportance: "high" | "low" | "medium";
  sequenceId: string | null;
  visualOpportunity: "high" | "low" | "medium";
};

export type WebsiteExperiencePlan = {
  advancedDensity: number;
  budget: {
    maxActiveCanvases: number;
    maxHighCostSections: number;
    maxSequenceCacheDesktop: number;
    maxSequenceCacheMobile: number;
    maxSimultaneousHeavySections: number;
  };
  explicitConstraints: {
    animationForbidden: boolean;
    cinematicRequested: boolean;
    webglForbidden: boolean;
    webglRequested: boolean;
  };
  sections: WebsiteExperienceSectionPlan[];
  totalCost: WebsiteExperienceCost;
  warnings: string[];
};

const visualKinds = new Set(["comparison", "gallery", "product-grid", "process", "showcase", "story"]);
const transactionalKinds = new Set(["contact", "faq", "form", "pricing", "trust"]);

function promptSignals(prompt: string) {
  const animationForbidden = /\b(?:no|without|disable|avoid|don't|do not)\b[\s\S]{0,32}\b(?:animation|animated|motion|cinematic|sequence)\b/i.test(prompt);
  const webglForbidden = /\b(?:no|without|disable|avoid|don't|do not)\b[\s\S]{0,32}\b(?:webgl|three\.?js|3d)\b/i.test(prompt);
  const cinematicRequested = !animationForbidden && /\b(?:cinematic|frame sequence|sequential frames|scroll story|scroll storytelling|product frames)\b/i.test(prompt);
  const webglRequested = !webglForbidden && /\b(?:webgl|three\.?js|interactive 3d|spatial 3d|3d explainer|3d storytelling)\b/i.test(prompt);
  const keepLightweight = /\b(?:keep (?:everything|the rest) lightweight|only where (?:useful|meaningful|it helps)|subtle motion|low[- ]spec|performance)\b/i.test(prompt);
  return { animationForbidden, cinematicRequested, keepLightweight, webglForbidden, webglRequested };
}

function importance(section: WebsiteExperienceSectionInput) {
  if (/hero|explainer|product|showcase|story/.test(`${section.id} ${section.kind}`)) return "high" as const;
  if (transactionalKinds.has(section.kind)) return "medium" as const;
  return "low" as const;
}

function opportunity(section: WebsiteExperienceSectionInput, capabilities: string[]) {
  const text = `${section.id} ${section.kind} ${section.title} ${section.body}`.toLowerCase();
  const tangible = capabilities.some((value) => /\b(?:hardware|material|mechanical|product|spatial|architecture|equipment|device|display|visual)\b/i.test(value));
  if (visualKinds.has(section.kind) || /(?:mechanism|hardware|architecture|layers|assembly|material|product|performance|process)/.test(text)) {
    return tangible ? "high" as const : "medium" as const;
  }
  return "low" as const;
}

function advancedCost(engine: WebsiteExperienceEngine): WebsiteExperienceCost {
  if (engine === "procedural_webgl") return "HIGH";
  if (engine === "frame_sequence") return "MEDIUM";
  return "LOW";
}

export function advancedExperienceDensity(sections: WebsiteExperienceSectionPlan[]) {
  const byPage = new Map<string, WebsiteExperienceSectionPlan[]>();
  sections.forEach((section) => {
    const pageSections = byPage.get(section.pagePath) ?? [];
    pageSections.push(section);
    byPage.set(section.pagePath, pageSections);
  });
  return Number(Math.max(
    0,
    ...[...byPage.values()].map((pageSections) =>
      pageSections.filter((section) => ["frame_sequence", "procedural_webgl"].includes(section.engine)).length /
      Math.max(1, pageSections.length)
    )
  ).toFixed(3));
}

export function composeWebsiteExperience(input: {
  assets: WebsiteAssetIntelligence;
  businessCapabilities: string[];
  cinematic: WebsiteCinematicExperience;
  pages: Array<{
    name: string;
    path: string;
    sections: Array<Omit<WebsiteExperienceSectionInput, "pagePath">>;
  }>;
  prompt: string;
  scene: { enabled: boolean; mountSectionId: string; pagePath: string; requirement: string };
}): WebsiteExperiencePlan {
  const signals = promptSignals(input.prompt);
  const sections: WebsiteExperienceSectionPlan[] = [];
  const home = input.pages.find((page) => page.name === "home") ?? input.pages[0];
  const allSections = input.pages.flatMap((page) => [
    {
      body: "",
      id: page.name === "home" ? "hero" : `${page.name}-hero`,
      kind: "hero",
      pagePath: page.path,
      title: `${page.name} hero`
    },
    ...page.sections.map((section) => ({ ...section, pagePath: page.path }))
  ]);
  const sequenceAssignments = new Map<string, string>();
  if (signals.cinematicRequested) {
    const candidates = allSections.filter((section) =>
      section.pagePath === home?.path &&
      !transactionalKinds.has(section.kind) &&
      (/hero|story|showcase|product|gallery|process/.test(`${section.id} ${section.kind}`) || opportunity(section, input.businessCapabilities) !== "low")
    );
    input.cinematic.sequences.forEach((sequence, index) => {
      const target = candidates[index] ?? candidates.at(-1);
      if (target) sequenceAssignments.set(`${target.pagePath}:${target.id}`, sequence.id);
    });
  }
  const sceneTarget = signals.webglRequested || input.scene.requirement === "required"
    ? allSections.find((section) =>
        section.pagePath === input.scene.pagePath &&
        !sequenceAssignments.has(`${section.pagePath}:${section.id}`) &&
        opportunity(section, input.businessCapabilities) === "high"
      ) ?? allSections.find((section) =>
        section.pagePath === input.scene.pagePath &&
        !sequenceAssignments.has(`${section.pagePath}:${section.id}`)
      )
    : null;

  for (const section of allSections) {
    const sectionImportance = importance(section);
    const visualOpportunity = opportunity(section, input.businessCapabilities);
    let engine: WebsiteExperienceEngine = section.kind === "hero" || sectionImportance === "high" ? "light_motion" : "standard_html";
    let engineReason = section.kind === "hero"
      ? "A lightweight entrance establishes hierarchy without owning the page."
      : "Semantic HTML is the lightest effective treatment for this content.";
    let sequenceId: string | null = null;

    if (signals.animationForbidden) {
      engine = "standard_html";
      engineReason = "The current request explicitly forbids animation.";
    } else if (sequenceAssignments.has(`${section.pagePath}:${section.id}`)) {
      engine = "frame_sequence";
      sequenceId = sequenceAssignments.get(`${section.pagePath}:${section.id}`) ?? null;
      engineReason = "An explicit cinematic request and a usable ordered sequence support this narrative section.";
    } else if (!signals.webglForbidden && input.scene.enabled && sceneTarget?.id === section.id) {
      engine = "procedural_webgl";
      engineReason = "Interactive spatial treatment adds explanatory value to a tangible or structural subject.";
    } else if (signals.keepLightweight || transactionalKinds.has(section.kind)) {
      engine = "standard_html";
      engineReason = transactionalKinds.has(section.kind)
        ? "Transactional and trust content stays calm, readable, and immediately usable."
        : "The request asks the remaining experience to stay lightweight.";
    }

    sections.push({
      accessibilityRisk: engine === "standard_html" ? "LOW" : engine === "light_motion" ? "LOW" : "MEDIUM",
      contentType: section.kind,
      engine,
      engineReason,
      fallback: engine === "frame_sequence" ? "representative_frame" : engine === "procedural_webgl" ? "static_artwork" : "semantic_html",
      interactionNeed: engine === "frame_sequence" ? "story" : engine === "procedural_webgl" ? "explain" : transactionalKinds.has(section.kind) ? "navigate" : "none",
      mobileCost: engine === "procedural_webgl" ? "HIGH" : advancedCost(engine),
      mobileEngine: engine === "procedural_webgl" ? "standard_html" : engine === "frame_sequence" ? "light_motion" : engine,
      pagePath: section.pagePath,
      performanceCost: advancedCost(engine),
      reducedMotionEngine: "standard_html",
      sectionId: section.id,
      sectionPurpose: section.kind,
      semanticImportance: sectionImportance,
      sequenceId,
      visualOpportunity
    });
  }

  const advanced = sections.filter((section) => section.engine === "procedural_webgl" || section.engine === "frame_sequence");
  const highCost = sections.filter((section) => section.performanceCost === "HIGH");
  const warnings: string[] = [];
  if (signals.cinematicRequested && !input.cinematic.enabled) warnings.push("Cinematic treatment was requested, but no usable ordered image sequence is available.");
  if (signals.webglRequested && !input.scene.enabled) warnings.push("Interactive 3D was requested, but the current scene policy could not enable a valid scene.");
  if (input.assets.archiveStatus === "raw_zip_upload_layer_blocked") warnings.push("A ZIP archive is present, but binary upload extraction is not connected.");
  if (advanced.length > 2 || highCost.length > 1) warnings.push("Advanced experience density exceeded the page budget; lower-value sections must remain lightweight.");

  return {
    advancedDensity: advancedExperienceDensity(sections),
    budget: {
      maxActiveCanvases: 2,
      maxHighCostSections: 1,
      maxSequenceCacheDesktop: 24,
      maxSequenceCacheMobile: 10,
      maxSimultaneousHeavySections: 1
    },
    explicitConstraints: {
      animationForbidden: signals.animationForbidden,
      cinematicRequested: signals.cinematicRequested,
      webglForbidden: signals.webglForbidden,
      webglRequested: signals.webglRequested
    },
    sections,
    totalCost: highCost.length || advanced.length > 1 ? "HIGH" : advanced.length ? "MEDIUM" : "LOW",
    warnings
  };
}

export function experienceForSection(
  plan: WebsiteExperiencePlan,
  pagePath: string,
  sectionId: string
) {
  return plan.sections.find((section) => section.pagePath === pagePath && section.sectionId === sectionId) ?? null;
}
