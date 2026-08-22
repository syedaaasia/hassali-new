import { createHash } from "node:crypto";
import { extractExplicitWebsiteBrand } from "@/lib/server/ai/website-request-objective";
import { resolveCatalogReference } from "./design-reference-catalog";
import type {
  DesignReference,
  ReferenceFidelity,
  ReferenceRole,
  ReferenceSourceType
} from "./design-reference-contract";

export type ReferenceAttachmentInput = {
  content: string | null;
  id: string;
  kind: "image" | "other";
  name: string;
};

export type DesignReferenceIntent = {
  fidelity: ReferenceFidelity;
  references: DesignReference[];
  securityBlockReason: string | null;
  userBrand: string | null;
};

const knownReferencePattern = /\b(?:ferrari|snap\s?chat|sound\s?cloud|apple|nike|spotify|stripe|linear|notion|airbnb|shopify|vercel)\b/gi;
const urlPattern = /https?:\/\/[^\s<>{}"']+/gi;

export function isDesignMdAttachmentName(name: string) {
  const normalized = name.trim().toLowerCase();
  if (!normalized.endsWith(".md")) return false;
  const stem = normalized.slice(0, -3).replace(/\s*\(\d+\)\s*$/, "");
  return /(?:^|[-_.\s])design(?:[-_.\s]|$)/.test(stem);
}

export function isStructuredDesignMdContent(content: string | null | undefined) {
  if (!content?.trim()) return false;
  const bounded = content.slice(0, 48_000);
  const designDimensions = [
    /(?:^|\n)\s*(?:#{1,6}\s*)?(?:colors?|palette|semantic tokens?)\s*:?\s*(?:\n|$)/i,
    /(?:^|\n)\s*(?:#{1,6}\s*)?(?:typography|type system|fonts?)\s*:?\s*(?:\n|$)/i,
    /(?:^|\n)\s*(?:#{1,6}\s*)?(?:layout|composition|spacing|section rhythm)\s*:?\s*(?:\n|$)/i,
    /(?:^|\n)\s*(?:#{1,6}\s*)?(?:imagery|photography|visual language|components?)\s*:?\s*(?:\n|$)/i
  ].filter((pattern) => pattern.test(bounded)).length;
  const tokenEvidence = /#[0-9a-f]{6}\b/i.test(bounded) || /fontFamily\s*:|font-family\s*:|fontSize\s*:/i.test(bounded);
  return designDimensions >= 2 && tokenEvidence;
}

function idFor(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

export function classifyReferenceFidelity(prompt: string): ReferenceFidelity {
  if (/\bfollow\b[\s\S]{0,60}\b(?:design(?:\.md)?|document)\b[\s\S]{0,40}\bexact(?:ly)?\b|\bfollow (?:this|the) (?:design(?:\.md)?|document) exact(?:ly)?\b/i.test(prompt)) return "close-replica";
  if (/\b(?:clone|recreate|replicate)\b|\bas close as possible\b|\bexact(?:ly)? like\b/i.test(prompt)) return "reference-clone";
  if (/\b(?:very|extremely|really) close\b|\bcopy (?:this|the) layout closely\b|\bclose replica\b/i.test(prompt)) return "close-replica";
  if (/\b(?:look|looks|looking) like\b|\bstyle(?:d)? (?:of|like)\b|\bvisual style\b|\bmatch (?:the )?(?:style|design)\b/i.test(prompt)) return "style-match";
  return "inspired";
}

export function hasDesignReferenceSignal(input: { attachmentNames?: string[]; prompt: string }) {
  return Boolean(
    input.attachmentNames?.some((name) => isDesignMdAttachmentName(name) || /\.(?:avif|gif|jpe?g|png|webp)$/i.test(name)) ||
    /https?:\/\//i.test(input.prompt) ||
    /\b(?:clone|copy|recreate|replicate|reference|screenshot|design\.md|visual style|style-match|inspired by|vibes?|look like|looks like|match the (?:existing|current|rest of)|existing project|current project)\b/i.test(input.prompt) ||
    /\b(?:rounded|square|sharp)\s+(?:cards?|corners?)\b|\b(?:cards?|corners?)\s+(?:rounded|square|sharp)\b/i.test(input.prompt) ||
    /\b(?:ferrari|snap\s?chat|sound\s?cloud|apple|nike|spotify|stripe|linear|notion|airbnb|shopify|vercel)\b/i.test(input.prompt)
  );
}

export function isDesignDirectionRevisionRequest(prompt: string) {
  return Boolean(
    /\b(?:change|revise|update|replace|switch|move|shift|turn)\b[\s\S]{0,80}\b(?:current|existing|overall|global|site|website|design)\b[\s\S]{0,60}\b(?:direction|theme|visual language|design system|style)\b/i.test(prompt) ||
    /\b(?:change|revise|update|replace|switch|move|shift|turn)\b[\s\S]{0,60}\b(?:direction|theme|visual language|design system)\b/i.test(prompt)
  );
}

function referenceRole(prompt: string, start: number, end: number): { pageTarget: string | null; role: ReferenceRole } {
  const before = prompt.slice(0, start);
  const after = prompt.slice(end);
  const priorSeparators = [...before.matchAll(/(?:,|;|\bbut\b|\band\b)/gi)];
  const nextSeparator = after.match(/(?:,|;|\bbut\b|\band\b)/i);
  const contextStart = priorSeparators.at(-1)?.index;
  const contextEnd = nextSeparator?.index;
  const context = prompt.slice(
    typeof contextStart === "number" ? contextStart + 1 : Math.max(0, start - 70),
    typeof contextEnd === "number" ? end + contextEnd : Math.min(prompt.length, end + 70)
  ).toLowerCase();
  const rolePairs: Array<[RegExp, ReferenceRole]> = [
    [/\b(?:nav|navbar|navigation|header)\b/, "navigation"],
    [/\bhero\b/, "hero"],
    [/\bpricing\b/, "pricing"],
    [/\bproduct (?:sections?|story|storytelling)\b/, "product-storytelling"],
    [/\b(?:card|tiles?)\b/, "cards"],
    [/\b(?:color|palette)\b/, "color"],
    [/\btypograph(?:y|ic)|\bfont\b/, "typography"],
    [/\b(?:footer)\b/, "footer"],
    [/\b(?:motion|animation|transition)\b/, "motion"],
    [/\b(?:image|imagery|photo)\b/, "imagery"],
    [/\b(?:dashboard)\b/, "dashboard"],
    [/\b(?:shop|store|ecommerce|checkout)\b/, "ecommerce"],
    [/\b(?:mobile|responsive|tablet)\b/, "responsive"],
    [/\b(?:section|layout|structure)\b/, "section-layout"]
  ];
  const role = rolePairs.find(([pattern]) => pattern.test(context))?.[1] ?? "global";
  const page = context.match(/\b(home|about|services?|contact|pricing|product|shop|blog|dashboard)\s+page\b/)?.[1] ?? null;
  return { pageTarget: page, role: /\b(?:overall|global|whole (?:site|website))\b/.test(context) ? "global" : role };
}

function userBrandFrom(prompt: string) {
  return extractExplicitWebsiteBrand(prompt);
}

function escapePattern(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function namedReferenceIsAttachedDocumentCoreference(input: {
  attachmentNames: string[];
  name: string;
  prompt: string;
}) {
  const normalizedName = input.name.toLowerCase().replace(/\s+/g, "");
  const matchingAttachment = input.attachmentNames.some((attachmentName) =>
    attachmentName.toLowerCase().replace(/\s+/g, "").includes(normalizedName)
  );
  if (!matchingAttachment) return false;
  const escaped = input.name.split(/\s+/).filter(Boolean).map(escapePattern).join("\\s*");
  const identifiesDocument = new RegExp(
    `(?:\\b(?:this|the|attached|uploaded)\\s+${escaped}\\s+(?:design\\s+)?(?:document|file|design(?:\\.md)?)\\b|\\b${escaped}\\s+(?:design\\s+)?(?:document|file|design(?:\\.md)?)\\b)`,
    "i"
  ).test(input.prompt);
  const explicitlyAdditional = new RegExp(
    `\\b(?:also|plus|mix|combine|but)\\b[\\s\\S]{0,60}\\b${escaped}\\b|\\b(?:typography|fonts?|colors?|palette|layout|motion)\\b[\\s\\S]{0,36}\\b(?:like|from|of)\\s+${escaped}\\b`,
    "i"
  ).test(input.prompt);
  return identifiesDocument && !explicitlyAdditional;
}

function reference(input: {
  canonicalUrl?: string | null;
  fidelity: ReferenceFidelity;
  name: string;
  pageTarget?: string | null;
  providerId: string;
  resolutionStatus: DesignReference["resolutionStatus"];
  role: ReferenceRole;
  sourceLabel: string;
  sourceAttachmentId?: string | null;
  sourceType: ReferenceSourceType;
  sourceUrl?: string | null;
  userSuppliedUrl?: string | null;
}): DesignReference {
  const seed = `${input.sourceType}:${input.name}:${input.userSuppliedUrl ?? ""}:${input.role}`;
  return {
    canonicalUrl: input.canonicalUrl ?? null,
    confidence: input.resolutionStatus === "resolved" ? 0.9 : input.resolutionStatus === "partial" ? 0.68 : 0.35,
    fidelity: input.fidelity,
    id: `reference-${idFor(seed)}`,
    limitations: [],
    name: input.name,
    pageTarget: input.pageTarget ?? null,
    provenance: {
      capturedAt: null,
      fingerprint: null,
      license: null,
      private: ["uploaded-design-md", "uploaded-image", "uploaded-screenshot", "existing-project", "existing-project-page"].includes(input.sourceType),
      providerId: input.providerId,
      revision: null,
      sourceLabel: input.sourceLabel,
      sourceUrl: input.sourceUrl ?? null
    },
    resolutionStatus: input.resolutionStatus,
    role: input.role,
    sourceAttachmentId: input.sourceAttachmentId ?? null,
    sourceType: input.sourceType,
    userSuppliedUrl: input.userSuppliedUrl ?? null
  };
}

function unknownNamedCandidates(prompt: string, occupied: string[]) {
  const patterns = [
    /\b(?:inspired by|like|style of|visual style of|match)\s+([A-Z][A-Za-z0-9&.-]*(?:\s+[A-Z][A-Za-z0-9&.-]*){0,2})/g,
    /\b([A-Z][A-Za-z0-9&.-]*(?:\s+[A-Z][A-Za-z0-9&.-]*){0,2})[- ](?:like|style)\b/g
  ];
  const ignored = new Set(["Build", "Clone", "Make", "Use", "Website", "Current", "Reference", "DESIGN"]);
  return patterns.flatMap((pattern) => [...prompt.matchAll(pattern)].map((match) => match[1].trim()))
    .filter((candidate) => !ignored.has(candidate) && !occupied.some((known) => known.toLowerCase() === candidate.toLowerCase()))
    .filter((candidate, index, all) => all.findIndex((other) => other.toLowerCase() === candidate.toLowerCase()) === index);
}

export function classifyDesignReferenceIntent(input: {
  attachments?: ReferenceAttachmentInput[];
  prompt: string;
  workspaceHasVisualSystem?: boolean;
}): DesignReferenceIntent {
  const fidelity = classifyReferenceFidelity(input.prompt);
  const references: DesignReference[] = [];
  const named = [...input.prompt.matchAll(knownReferencePattern)];
  for (const match of named) {
    const name = match[0].replace(/\s+/g, "");
    const resolved = resolveCatalogReference(name);
    const role = referenceRole(input.prompt, match.index ?? 0, (match.index ?? 0) + match[0].length);
    references.push(reference({
      canonicalUrl: resolved.entry?.sourceUrl ?? null,
      fidelity,
      name: resolved.entry?.name ?? match[0],
      pageTarget: role.pageTarget,
      providerId: "hassali-reference-catalog",
      resolutionStatus: resolved.status,
      role: role.role,
      sourceLabel: resolved.entry ? `Hassali reference catalog: ${resolved.entry.name}` : `Named reference: ${match[0]}`,
      sourceType: "named-brand",
      sourceUrl: resolved.entry?.sourceUrl ?? null
    }));
  }

  const occupied = references.map((entry) => entry.name);
  for (const candidate of unknownNamedCandidates(input.prompt, occupied)) {
    references.push(reference({
      fidelity,
      name: candidate,
      providerId: "named-design-reference-resolver",
      resolutionStatus: "not-found",
      role: "global",
      sourceLabel: `Unresolved named reference: ${candidate}`,
      sourceType: "named-brand"
    }));
  }

  for (const url of [...new Set(input.prompt.match(urlPattern) ?? [])].slice(0, 2)) {
    const role = referenceRole(input.prompt, input.prompt.indexOf(url), input.prompt.indexOf(url) + url.length);
    references.push(reference({
      fidelity,
      name: new URL(url).hostname.replace(/^www\./, ""),
      pageTarget: role.pageTarget,
      providerId: "live-website-reference",
      resolutionStatus: "partial",
      role: role.role,
      sourceLabel: "User-provided public URL",
      sourceType: "public-url",
      userSuppliedUrl: url
    }));
  }

  for (const attachment of input.attachments ?? []) {
    const isDesignMd = isDesignMdAttachmentName(attachment.name) ||
      (/\.(?:md|markdown|txt)$/i.test(attachment.name) && isStructuredDesignMdContent(attachment.content));
    if (isDesignMd) {
      references.push(reference({
        fidelity,
        name: attachment.name,
        providerId: "design-md-reference",
        resolutionStatus: attachment.content ? "resolved" : "partial",
        role: "global",
        sourceLabel: `Uploaded ${attachment.name}`,
        sourceAttachmentId: attachment.id,
        sourceType: "uploaded-design-md"
      }));
    } else if (attachment.kind === "image") {
      references.push(reference({
        fidelity,
        name: attachment.name,
        providerId: "uploaded-visual-reference",
        resolutionStatus: "partial",
        role: "global",
        sourceLabel: `Uploaded visual ${attachment.name}`,
        sourceAttachmentId: attachment.id,
        sourceType: /screenshot/i.test(input.prompt) ? "uploaded-screenshot" : "uploaded-image"
      }));
    }
  }

  if (/\b(?:match|use|follow)\b[\s\S]{0,50}\b(?:existing|current|rest of (?:this|the)) project\b/i.test(input.prompt) && input.workspaceHasVisualSystem) {
    references.push(reference({
      fidelity,
      name: "Existing project visual system",
      providerId: "existing-project-reference",
      resolutionStatus: "resolved",
      role: "global",
      sourceLabel: "Current owned project files",
      sourceType: "existing-project"
    }));
  }

  if (!references.length) {
    references.push(reference({
      fidelity: "inspired",
      name: /\bdon't copy|\bdo not copy|\boriginal\b/i.test(input.prompt) ? "Original design direction" : "User-described design direction",
      providerId: "user-description-reference",
      resolutionStatus: "resolved",
      role: "global",
      sourceLabel: "Current user request",
      sourceType: "user-description"
    }));
  }

  const securityBlockReason = fidelity === "reference-clone" &&
    /\b(?:bank|banking|wallet|crypto exchange|payment provider)\b/i.test(input.prompt) &&
    /\b(?:collect|capture|harvest|send|store)\b[\s\S]{0,60}\b(?:passwords?|credentials?|logins?|otp|pin|seed phrase)\b/i.test(input.prompt)
      ? "Reference cloning cannot be used to create deceptive credential collection."
      : null;

  const attachmentNames = (input.attachments ?? []).map((attachment) => attachment.name);
  const coreferenceResolved = references.filter((entry) =>
    entry.sourceType !== "named-brand" ||
    !namedReferenceIsAttachedDocumentCoreference({
      attachmentNames,
      name: entry.name,
      prompt: input.prompt
    })
  );

  return {
    fidelity,
    references: coreferenceResolved.filter((entry, index, all) =>
      all.findIndex((other) => other.sourceType === entry.sourceType && other.name.toLowerCase() === entry.name.toLowerCase() && other.role === entry.role) === index
    ),
    securityBlockReason,
    userBrand: userBrandFrom(input.prompt)
  };
}
