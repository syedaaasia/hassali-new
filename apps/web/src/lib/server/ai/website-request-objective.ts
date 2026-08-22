export type WebsiteRequestOperation = "edit_website" | "new_website" | "unknown";

export type WebsiteRequestObjective = {
  attachmentRelationship: "asset" | "design_reference" | "none";
  explicitBrandName: string | null;
  functionalRequirements: string[];
  negativeConstraints: string[];
  operation: WebsiteRequestOperation;
  preservationConstraints: string[];
  subject: string | null;
};

const genericNameWords = new Set([
  "a", "an", "business", "company", "my", "our", "portfolio", "site", "the", "website"
]);

const instructionStart = /\b(?:use|follow|treat|take)\s+(?:this|the|that|current|attached|uploaded)\b|\b(?:keep|preserve|do\s+not|don't|dont|never|avoid|change\s+only|make\s+it|add)\b/i;

function clean(value: string) {
  return value
    .replace(/[_]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[,.:;\s]+|[,.:;\s]+$/g, "")
    .trim();
}

function beforeInstruction(value: string) {
  const match = instructionStart.exec(value);
  return clean(match?.index === undefined ? value : value.slice(0, match.index));
}

function plausibleProperName(value: string) {
  const words = clean(value).split(/\s+/).filter(Boolean);
  if (!words.length || words.length > 6 || genericNameWords.has(words[0]!.toLowerCase())) return false;
  if (words.some((word) => /^(?:as|for|from|in|of|to|use|using|with)$/i.test(word))) return false;
  return words.every((word) => /^(?:[A-Z][A-Za-z0-9&'.-]*|[A-Z0-9&'.-]{2,})$/.test(word));
}

export function extractExplicitWebsiteBrand(prompt: string) {
  const declared = prompt.match(
    /\b(?:brand|business|company|project)\s+name\s+(?:is\s+)?["']?([a-z0-9][a-z0-9&'. -]{1,60}?)["']?(?=\s+(?:with|and|using|that|which|for|to|it|should|as)\b|[,.!?]|$)/i
  )?.[1] ?? prompt.match(
    /\b(?:brand|business|company|project)\s+(?:called|named)\s+["']?([a-z0-9][a-z0-9&'. -]{1,60}?)["']?(?=\s+(?:with|and|using|that|which|for|to|it|should|as)\b|[,.!?]|$)/i
  )?.[1] ?? prompt.match(
    /\b(?:called|named)\s+["']?([a-z0-9][a-z0-9&'. -]{1,60}?)["']?(?=\s+(?:with|and|using|that|which|for|to|it|should|as)\b|[,.!?]|$)/i
  )?.[1];
  if (declared) return clean(declared);

  const properName = prompt.match(
    /\b(?:website|site|landing page)\s+for\s+([A-Z][A-Za-z0-9&'.-]*(?:\s+[A-Z][A-Za-z0-9&'.-]*){0,5})(?=\s+(?:with|using|that|which|to|for|website|site)\b|[,.!?]|$)/
  )?.[1];
  return properName && plausibleProperName(properName) ? clean(properName) : null;
}

export function stripWebsiteInstructionSpans(value: string) {
  return beforeInstruction(value)
    .replace(/\b(?:in|using|with)\s+(?:interactive\s+)?(?:3d|webgl|three(?:\.js)?|threejs)\b[\s\S]*$/i, "")
    .replace(/\b(?:webgl|three(?:\.js)?|threejs)\b/gi, " ")
    .replace(/\bscroll(?:-driven|ing)?\s+(?:effect|effects|animation|animations|interaction|interactions)?\b/gi, " ")
    .replace(/\b(?:beautiful|modern|premium|responsive)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function subjectFrom(prompt: string) {
  const candidates = [
    prompt.match(/\b(?:website|site|landing\s+page)\s+for\s+([^,.!?]{2,120})/i)?.[1],
    prompt.match(/\b(?:build|create|design|generate|make)\s+(?:me\s+)?(?:a\s+|an\s+|the\s+)?(.{2,100}?)\s+(?:website|site|landing\s+page)\b/i)?.[1],
    prompt.match(/\b(?:build|create|design|generate|make)\s+(?:me\s+)?(?:a\s+|an\s+|the\s+)?(?:website|site|landing\s+page)\s+(?:for\s+)?([^,.!?]{2,120})/i)?.[1]
  ];
  let subject = candidates.map((candidate) => stripWebsiteInstructionSpans(candidate ?? "")).find(Boolean) ?? "";
  subject = clean(subject.replace(/^(?:me\s+)?(?:a|an|the|my|our)\s+/i, ""));
  if (/\bportfolio\b/i.test(subject) && /\bphotograph(?:er|y|ic)\b/i.test(subject)) return "photographer portfolio";
  if (!subject || /^(?:webgl|scroll effects?|website|site)$/i.test(subject)) return null;
  return subject;
}

function matchingClauses(prompt: string, pattern: RegExp) {
  return Array.from(prompt.matchAll(pattern), (match) => clean(match[0] ?? "")).filter(Boolean);
}

export function analyzeWebsiteRequestObjective(prompt: string): WebsiteRequestObjective {
  const lower = prompt.toLowerCase();
  const creationRequest = /\b(?:build|create|design|generate|make)\b[\s\S]{0,120}\b(?:website|site|portfolio)\b/i.test(prompt);
  const functionalRequirements = [
    /\b(?:webgl|three(?:\.js)?|threejs)\b/i.test(prompt) ? "webgl" : "",
    /\bscroll(?:-driven|ing)?\b/i.test(prompt) ? "scroll_interaction" : "",
    /\bresponsive|mobile[- ]friendly\b/i.test(prompt) ? "responsive" : ""
  ].filter(Boolean);
  const designReference = /\b(?:use|follow|treat)\b[\s\S]{0,80}\b(?:inspiration|design reference|visual reference|style reference)\b/i.test(prompt);
  const assetReference = /\b(?:use|replace|set)\b[\s\S]{0,80}\b(?:image|photo|asset|hero)\b/i.test(prompt) && !designReference;

  return {
    attachmentRelationship: designReference ? "design_reference" : assetReference ? "asset" : "none",
    explicitBrandName: extractExplicitWebsiteBrand(prompt),
    functionalRequirements,
    negativeConstraints: matchingClauses(prompt, /\b(?:do\s+not|don't|dont|never|avoid)\b[^.!?]*/gi),
    operation: creationRequest
      ? "new_website"
      : /\b(?:change|edit|update|replace|remove|add|make)\b/i.test(lower)
      ? "edit_website"
      : /\b(?:build|create|design|generate|website|site|portfolio)\b/i.test(lower)
        ? "new_website"
        : "unknown",
    preservationConstraints: matchingClauses(prompt, /\b(?:keep|preserve|do\s+not\s+(?:change|redesign)|don't\s+(?:change|redesign)|change\s+only)\b[^.!?]*/gi),
    subject: subjectFrom(prompt)
  };
}
