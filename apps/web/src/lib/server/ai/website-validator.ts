import type { WebsitePlan } from "@/lib/server/ai/website-planner";
import { getTaxonomyProfile } from "@/lib/server/ai/industry-taxonomy";

export type WebsiteValidationResult = {
  blockedReasons: string[];
  duplicateSections: string[];
  genericLayoutDetected: boolean;
  passed: boolean;
  placeholderDetected: boolean;
  validationWarnings: string[];
};

const genericTerms = [
  "build faster with our platform",
  "clear services studio",
  "local service",
  "lorem ipsum",
  "[placeholder]",
  "placeholder image",
  "insert content here",
  "replace me",
  "todo"
];

function duplicateValues(values: string[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  values.forEach((value) => {
    const normalized = value.toLowerCase().trim();

    if (seen.has(normalized)) {
      duplicates.add(normalized);
    }

    seen.add(normalized);
  });

  return Array.from(duplicates);
}

function pageToPath(page: string) {
  const normalized = page.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  return normalized === "home" ? "index.html" : `${normalized}.html`;
}

export function validateWebsitePlanAndFiles(input: {
  files: Record<string, string>;
  plan: WebsitePlan;
}): WebsiteValidationResult {
  const allContent = Object.values(input.files).join("\n").toLowerCase();
  const sectionIds = input.plan.requiredSections.map((section) => section.id);
  const duplicateSections = duplicateValues(sectionIds);
  const profile = getTaxonomyProfile(input.plan.sourceOfTruthDomain ?? input.plan.industry);
  const vocabularyHits = (profile?.websiteVocabulary ?? [])
    .filter((term) => allContent.includes(term.toLowerCase()));
  const hasSpecificVocabulary = vocabularyHits.length >= Math.min(3, Math.max(1, profile?.websiteVocabulary.length ?? 0));
  const rawGenericLayoutDetected =
    sectionIds.join(",") === "hero,features,pricing,footer" ||
    genericTerms.some((term) => allContent.includes(term));
  const genericLayoutDetected = rawGenericLayoutDetected && !hasSpecificVocabulary;
  const placeholderDetected = /https?:\/\/|<img\b|alt=["'](?:hero|image|placeholder)["']/i.test(Object.values(input.files).join("\n"));
  const emptyFiles = Object.entries(input.files)
    .filter(([, content]) => content.trim().length === 0)
    .map(([path]) => path);
  const expectedPageFiles = input.plan.pages.map(pageToPath);
  const missingPageFiles = expectedPageFiles.filter((path) => !(path in input.files));
  const unexpectedHtmlFiles = Object.keys(input.files)
    .filter((path) => path.endsWith(".html") && !expectedPageFiles.includes(path));
  const blockedReasons = [
    duplicateSections.length ? `Duplicate sections detected: ${duplicateSections.join(", ")}.` : "",
    genericLayoutDetected ? "Generic template language or layout detected." : "",
    placeholderDetected ? "Placeholder or remote image reference detected." : "",
    emptyFiles.length ? `Empty generated files: ${emptyFiles.join(", ")}.` : "",
    missingPageFiles.length ? `Missing planner page files: ${missingPageFiles.join(", ")}.` : "",
    unexpectedHtmlFiles.length ? `Generated pages not present in planner page list: ${unexpectedHtmlFiles.join(", ")}.` : "",
    input.plan.requiredSections.length < 4 ? "Website plan has too few industry-specific sections." : "",
    !input.plan.designTokenValidationPassed
      ? `Design token validation failed: ${input.plan.designTokens.validation.issues.map((issue) => issue.message).join("; ")}.`
      : ""
  ].filter(Boolean);

  return {
    blockedReasons,
    duplicateSections,
    genericLayoutDetected,
    passed: blockedReasons.length === 0,
    placeholderDetected,
    validationWarnings: input.plan.optionalSections.length === 0 ? ["No optional sections were available for expansion."] : []
  };
}
