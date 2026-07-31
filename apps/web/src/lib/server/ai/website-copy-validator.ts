import type { WebsiteContentContract } from "@/lib/server/ai/website-content-contract";
import type {
  WebsitePageBlueprint,
  WebsiteSectionBlueprint,
  WebsiteVisitorCopy
} from "@/lib/server/ai/website-quality-blueprint";

export type WebsiteCopyFinding = {
  code:
    | "COPY_GENERIC_HERO"
    | "COPY_INTERNAL_LANGUAGE"
    | "COPY_REPEATED_SECTION"
    | "CTA_UNSUPPORTED"
    | "IDENTITY_MISMATCH"
    | "PLACEHOLDER_CONTENT"
    | "UNSUPPORTED_CLAIM"
    | "UNSUPPORTED_TESTIMONIAL";
  evidence: string;
  message: string;
  severity: "BLOCK" | "REPAIR" | "WARNING";
};

export type WebsiteCopyValidationResult = {
  blocked: boolean;
  findings: WebsiteCopyFinding[];
  passed: boolean;
  repairCount: number;
  status: "BLOCKED" | "PASSED" | "REPAIRED" | "WARNING";
};

const placeholderPattern = /\b(?:lorem ipsum|\[business name\]|your tagline here|example testimonial|123 main street|hello@example\.com|current prompt website|contact\s*\/\s*unknown)\b/i;
const internalLanguagePattern = /\b(?:premium cinematic interface|conversion-focused solution|immersive digital experience|cutting-edge animations|visually stunning premium website|quality blueprint|selected composition|design strategy)\b/i;
const universalHeroPattern = /^(?:elevate your experience|transform your business|discover excellence|where innovation meets quality|solutions designed for you|your journey starts here)$/i;
const testimonialPattern = /(?:testimonial|customer stor(?:y|ies)|what (?:our )?clients say)[\s\S]{0,240}["\u201c][^"\u201d]+["\u201d][\s\u2014-]+[A-Z][a-z]+(?:\s+[A-Z]\.)?/i;
const unsupportedStaticActionPattern = /\b(?:book now|buy now|checkout|reserve now|sign up|start (?:a )?free trial)\b/i;
const unsupportedClaimPatterns = [
  /\b(?:trusted by|serving)\s+\d[\d,]*\+?\s+(?:customers?|clients?|companies|businesses)\b/i,
  /\b\d+(?:\.\d+)?\s*(?:\/\s*5|stars?|%|percent)\b/i,
  /\b(?:award[- ]winning|certified|licensed|guaranteed results?|clinically proven|dermatologist approved)\b/i,
  /\b(?:over|more than)\s+\d+\s+years?\b/i
];

function normalized(value: string) {
  return value
    .toLowerCase()
    .replace(/<[^>]*>/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function allCopy(pages: WebsitePageBlueprint[]) {
  return pages.flatMap((page) => [
    page.title,
    page.description,
    page.visitorCopy.eyebrow,
    page.visitorCopy.heading,
    page.visitorCopy.body,
    page.visitorCopy.primaryCta,
    page.visitorCopy.secondaryCta ?? "",
    ...page.sections.flatMap((section) => [
      section.eyebrow,
      section.title,
      section.body,
      ...section.items.flatMap((item) => [item.title, item.detail, item.meta ?? ""])
    ])
  ]).filter(Boolean);
}

function suppliedClaimSupports(contract: WebsiteContentContract, copy: string) {
  const normalizedCopy = normalized(copy);
  return contract.trustInputs.some((fact) => {
    const words = normalized(fact.value).split(" ").filter((word) => word.length > 2);
    return words.length > 0 && words.every((word) => normalizedCopy.includes(word));
  });
}

function repeatedSections(sections: WebsiteSectionBlueprint[]) {
  const seen = new Map<string, string>();
  const repeated: string[] = [];
  sections.forEach((section) => {
    const body = normalized(section.body);
    if (body.length < 35) return;
    const existing = seen.get(body);
    if (existing) repeated.push(`${existing} and ${section.id}`);
    else seen.set(body, section.id);
  });
  return repeated;
}

export function validateWebsiteVisitorCopy(input: {
  contract: WebsiteContentContract;
  pages: WebsitePageBlueprint[];
}): WebsiteCopyValidationResult {
  const findings: WebsiteCopyFinding[] = [];
  const home = input.pages.find((page) => page.name === "home") ?? input.pages[0];
  const copy = allCopy(input.pages);
  const joined = copy.join("\n");

  if (!home || universalHeroPattern.test(home.visitorCopy.heading.trim()) || normalized(home?.visitorCopy.heading ?? "").split(" ").length < 3) {
    findings.push({
      code: "COPY_GENERIC_HERO",
      evidence: home?.visitorCopy.heading ?? "missing",
      message: "The hero does not identify a specific offer or outcome.",
      severity: "REPAIR"
    });
  }
  const placeholder = copy.find((value) => placeholderPattern.test(value));
  if (placeholder) {
    findings.push({
      code: "PLACEHOLDER_CONTENT",
      evidence: placeholder,
      message: "Visitor copy contains a placeholder or internal fallback.",
      severity: "BLOCK"
    });
  }
  const internal = copy.find((value) => internalLanguagePattern.test(value));
  if (internal) {
    findings.push({
      code: "COPY_INTERNAL_LANGUAGE",
      evidence: internal,
      message: "Internal design language leaked into visitor-facing copy.",
      severity: "BLOCK"
    });
  }
  if (testimonialPattern.test(joined) && input.contract.trustInputs.length === 0) {
    findings.push({
      code: "UNSUPPORTED_TESTIMONIAL",
      evidence: joined.match(testimonialPattern)?.[0] ?? "testimonial content",
      message: "The website contains testimonial-style proof that the user did not supply.",
      severity: "BLOCK"
    });
  }
  for (const pattern of unsupportedClaimPatterns) {
    const match = joined.match(pattern)?.[0];
    if (match && !suppliedClaimSupports(input.contract, match)) {
      findings.push({
        code: "UNSUPPORTED_CLAIM",
        evidence: match,
        message: "The website contains a proof or outcome claim that is not supported by current-prompt facts.",
        severity: "BLOCK"
      });
    }
  }
  const displayName = input.contract.businessIdentity.displayName;
  if (displayName && !joined.toLowerCase().includes(displayName.toLowerCase())) {
    findings.push({
      code: "IDENTITY_MISMATCH",
      evidence: displayName,
      message: "The supplied business identity is missing from the generated visitor copy.",
      severity: "BLOCK"
    });
  }
  const primaryTargets = new Set(input.pages.map((page) => page.path));
  if (!input.contract.primaryCta.target.startsWith("#") && !primaryTargets.has(input.contract.primaryCta.target)) {
    findings.push({
      code: "CTA_UNSUPPORTED",
      evidence: `${input.contract.primaryCta.label} -> ${input.contract.primaryCta.target}`,
      message: "The primary CTA points to a route the generated website does not contain.",
      severity: "BLOCK"
    });
  }
  const unsupportedAction = input.pages
    .map((page) => page.visitorCopy.primaryCta)
    .find((label) => unsupportedStaticActionPattern.test(label));
  if (unsupportedAction) {
    findings.push({
      code: "CTA_UNSUPPORTED",
      evidence: unsupportedAction,
      message: "The primary CTA promises a transaction or confirmed action that this static website does not provide.",
      severity: "BLOCK"
    });
  }
  const repeats = repeatedSections(input.pages.flatMap((page) => page.sections));
  if (repeats.length > 0) {
    findings.push({
      code: "COPY_REPEATED_SECTION",
      evidence: repeats.slice(0, 3).join("; "),
      message: "Multiple sections repeat the same visitor promise.",
      severity: "REPAIR"
    });
  }

  const blocked = findings.some((finding) => finding.severity === "BLOCK");
  const repairCount = findings.filter((finding) => finding.severity === "REPAIR").length;
  return {
    blocked,
    findings,
    passed: findings.length === 0,
    repairCount,
    status: blocked ? "BLOCKED" : repairCount > 0 ? "WARNING" : findings.length > 0 ? "WARNING" : "PASSED"
  };
}

export function repairVisitorCopy(input: {
  contract: WebsiteContentContract;
  page: string;
  visitorCopy: WebsiteVisitorCopy;
}): WebsiteVisitorCopy {
  if (input.page !== "home") return input.visitorCopy;

  return {
    ...input.visitorCopy,
    body: input.contract.hero.supportingCopy,
    heading: input.contract.hero.headline,
    primaryCta: input.contract.primaryCta.label,
    secondaryCta: input.contract.secondaryCta?.label
  };
}
