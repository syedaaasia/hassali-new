function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

export function extractVisibleWebsiteText(value: string) {
  return decodeHtmlEntities(value
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function normalizedSignal(value: string) {
  return value
    .toLowerCase()
    .replace(/[_/]+/g, " ")
    .replace(/[^a-z0-9+\s-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function phrasePattern(value: string) {
  const tokens = normalizedSignal(value)
    .split(" ")
    .filter(Boolean)
    .map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

  return tokens.length ? new RegExp(`\\b${tokens.join("[\\s-]+")}\\b`, "gi") : null;
}

const displayContexts = "tv|television|display|panel|screen|lighting|lamp|monitor";
const furnitureTableContexts = "bedside|coffee|console|dining|end|furniture|nesting|oak|side|wooden|wood";
const clinicalCareContexts = [
  "urgent care clinic",
  "primary care physician",
  "patient care plan",
  "medical care provider",
  "clinical care treatment"
];

function contextualPattern(signal: string) {
  const normalized = normalizedSignal(signal);

  if (normalized === "led") {
    return new RegExp(`(?:\\bled\\b[\\s-]*(?:${displayContexts})\\b|\\b(?:${displayContexts})[\\s-]+led\\b)`, "gi");
  }

  if (normalized === "table" || normalized === "tables") {
    return new RegExp(`(?:\\b(?:${furnitureTableContexts})[\\s-]+tables?\\b|\\btables?\\b[\\s-]+(?:furniture|collection|set)\\b)`, "gi");
  }

  // "Care" is a cross-industry word. It is only a conflicting entity when the
  // surrounding phrase supplies clinical meaning; skincare and product care
  // cannot independently prove healthcare contamination.
  if (normalized === "care") {
    const phrases = clinicalCareContexts.map((phrase) =>
      normalizedSignal(phrase).split(" ").filter(Boolean).join("[\\s-]+")
    );
    return new RegExp(`\\b(?:${phrases.join("|")})\\b`, "gi");
  }

  return phrasePattern(signal);
}

export function semanticSignalCount(text: string, signal: string) {
  const pattern = contextualPattern(signal);
  if (!pattern) return 0;

  return extractVisibleWebsiteText(text).match(pattern)?.length ?? 0;
}

export function includesSemanticSignal(text: string, signal: string) {
  return semanticSignalCount(text, signal) > 0;
}

export function findSemanticSignals(text: string, signals: string[]) {
  return signals.filter((signal) => includesSemanticSignal(text, signal));
}

export function semanticEvidenceKey(value: string) {
  let hash = 2166136261;
  for (const character of normalizedSignal(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `semantic-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
