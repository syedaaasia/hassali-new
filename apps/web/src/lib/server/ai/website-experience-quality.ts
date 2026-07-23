import {
  advancedExperienceDensity,
  type WebsiteExperiencePlan,
  type WebsiteExperienceSectionPlan
} from "@/lib/server/ai/website-experience-composer";

export type WebsiteExperienceQualityFinding = {
  code:
    | "advanced_density"
    | "business_fact_risk"
    | "engine_misuse"
    | "generic_copy"
    | "repetitive_rhythm"
    | "weak_cta";
  message: string;
  repair: string;
  severity: "repairable" | "warning";
};

export type WebsiteExperienceQualityReview = {
  findings: WebsiteExperienceQualityFinding[];
  repaired: boolean;
  repairPasses: number;
  score: number;
  warnings: string[];
};

const genericCopyPatterns = [
  /\belevate (?:your|the) experience\b/i,
  /\btransform your future\b/i,
  /\bwhere innovation meets excellence\b/i,
  /\bbuilt for tomorrow\b/i,
  /\bsolutions that empower\b/i,
  /\bunlock (?:your|the) potential\b/i
];

const unsupportedFactPatterns = [
  /\b\d{2,}%\s+(?:satisfaction|success|growth)\b/i,
  /\btrusted by \d+/i,
  /\b\d+(?:\.\d+)?\/5\s+(?:rating|reviews?)\b/i,
  /\baward[- ]winning\b/i,
  /\bguaranteed results?\b/i
];

function semanticTerms(values: string[]) {
  return new Set(
    values
      .flatMap((value) => value.toLowerCase().split(/[^a-z0-9]+/))
      .filter((value) => value.length > 3)
  );
}

function semanticCopyGap(copy: string[], semanticValues: string[]) {
  const terms = semanticTerms(semanticValues);
  if (!terms.size) return false;
  const content = copy.join(" ").toLowerCase();
  const matches = [...terms].filter((term) => content.includes(term));
  return content.length > 120 && matches.length === 0;
}

function repetitiveRhythm(sections: Array<{ items?: Array<{ title: string }>; kind: string }>) {
  const kinds = sections.map((section) => section.kind);
  if (kinds.length < 4) return false;
  const cardLike = kinds.filter((kind) => /grid|cards|features|services|products/.test(kind)).length;
  const longestRun = kinds.reduce(
    (state, kind) => kind === state.previous
      ? { longest: Math.max(state.longest, state.current + 1), current: state.current + 1, previous: kind }
      : { longest: state.longest, current: 1, previous: kind },
    { current: 0, longest: 0, previous: "" }
  ).longest;
  const itemSets = sections
    .map((section) => new Set((section.items ?? []).map((item) => item.title.toLowerCase().trim())))
    .filter((items) => items.size >= 3);
  const repeatedItemClusters = itemSets.filter((items, index) =>
    itemSets.slice(index + 1).some((candidate) =>
      [...items].filter((item) => candidate.has(item)).length / Math.min(items.size, candidate.size) >= 0.75
    )
  ).length;
  return longestRun >= 3 || (cardLike >= 4 && cardLike / kinds.length > 0.65) || repeatedItemClusters >= 2;
}

function engineMisuse(section: WebsiteExperienceSectionPlan) {
  return (
    (section.engine === "procedural_webgl" || section.engine === "frame_sequence") &&
    (
      (section.visualOpportunity === "low" && section.semanticImportance !== "high") ||
      ["contact", "faq", "form", "pricing", "trust"].includes(section.contentType)
    )
  );
}

export function reviewWebsiteExperienceQuality(input: {
  businessValues: string[];
  copy: string[];
  experience: WebsiteExperiencePlan;
  sections: Array<{ items?: Array<{ title: string }>; kind: string }>;
}): WebsiteExperienceQualityReview {
  const findings: WebsiteExperienceQualityFinding[] = [];
  if (input.copy.some((value) => genericCopyPatterns.some((pattern) => pattern.test(value))) ||
      semanticCopyGap(input.copy, input.businessValues)) {
    findings.push({
      code: "generic_copy",
      message: "Visitor copy is generic or lacks meaningful overlap with the current business.",
      repair: "Use supported products, services, capabilities, audience needs, and concrete visitor benefits.",
      severity: "repairable"
    });
  }
  if (repetitiveRhythm(input.sections)) {
    findings.push({
      code: "repetitive_rhythm",
      message: "Section rhythm repeats the same card-grid pattern without enough functional variation.",
      repair: "Vary the lower-value section treatment while preserving the requested content and page count.",
      severity: "repairable"
    });
  }
  if (input.experience.sections.some(engineMisuse)) {
    findings.push({
      code: "engine_misuse",
      message: "An advanced visual engine is assigned to low-value or transactional content.",
      repair: "Downgrade that section to semantic HTML or lightweight motion.",
      severity: "repairable"
    });
  }
  if (input.experience.advancedDensity > 0.4) {
    findings.push({
      code: "advanced_density",
      message: "Advanced-engine density is too high for a calm, usable website.",
      repair: "Keep the strongest narrative moment and one explanatory moment; simplify the rest.",
      severity: "repairable"
    });
  }
  if (input.copy.some((value) => unsupportedFactPatterns.some((pattern) => pattern.test(value)))) {
    findings.push({
      code: "business_fact_risk",
      message: "Visitor copy appears to contain unsupported quantitative trust or guarantee claims.",
      repair: "Omit unsupported claims and preserve them only as editor warnings when supplied facts are missing.",
      severity: "repairable"
    });
  }
  const copyText = input.copy.join(" ");
  if (copyText.length > 300 && !/\b(?:contact|book|browse|compare|explore|request|shop|start|view)\b/i.test(copyText)) {
    findings.push({
      code: "weak_cta",
      message: "The visitor journey lacks a clear next action.",
      repair: "Use one primary domain-relevant action and a quieter secondary path.",
      severity: "warning"
    });
  }

  return {
    findings,
    repaired: findings.some((finding) => finding.severity === "repairable"),
    repairPasses: findings.some((finding) => finding.severity === "repairable") ? 1 : 0,
    score: Math.max(0, 100 - findings.reduce((total, finding) => total + (finding.severity === "repairable" ? 14 : 6), 0)),
    warnings: findings.map((finding) => finding.message)
  };
}

export function applyExperienceQualityRepair(plan: WebsiteExperiencePlan): WebsiteExperiencePlan {
  let keptWebgl = false;
  let keptSequence = false;
  const sections = plan.sections.map((section) => {
    if (engineMisuse(section)) {
      return {
        ...section,
        engine: "standard_html" as const,
        engineReason: "Quality repair removed an advanced engine from low-value or transactional content.",
        mobileEngine: "standard_html" as const,
        performanceCost: "LOW" as const
      };
    }
    if (section.engine === "procedural_webgl") {
      if (keptWebgl) {
        return {
          ...section,
          engine: "light_motion" as const,
          engineReason: "Quality repair kept one explanatory WebGL moment and simplified duplicate heavy sections.",
          mobileEngine: "standard_html" as const,
          performanceCost: "LOW" as const
        };
      }
      keptWebgl = true;
    }
    if (section.engine === "frame_sequence") {
      if (keptSequence) {
        return {
          ...section,
          engine: "light_motion" as const,
          engineReason: "Quality repair kept one cinematic story and simplified additional high-cost sequences.",
          mobileEngine: "light_motion" as const,
          performanceCost: "LOW" as const,
          sequenceId: null
        };
      }
      keptSequence = true;
    }
    return section;
  });
  const advanced = sections.filter((section) => ["procedural_webgl", "frame_sequence"].includes(section.engine));
  return {
    ...plan,
    advancedDensity: advancedExperienceDensity(sections),
    sections,
    totalCost: advanced.length > 1 ? "HIGH" : advanced.length ? "MEDIUM" : "LOW",
    warnings: [...plan.warnings, "A bounded quality repair pass simplified lower-value advanced sections."]
  };
}
