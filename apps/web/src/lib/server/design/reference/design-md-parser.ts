import { createHash } from "node:crypto";
import { designReferenceLimits, type ReferenceFact } from "./design-reference-contract";

export type ParsedDesignMd = {
  accessibility: ReferenceFact[];
  atmosphere: ReferenceFact[];
  colors: ReferenceFact[];
  components: ReferenceFact[];
  doRules: ReferenceFact[];
  dontRules: ReferenceFact[];
  fingerprint: string;
  imagery: ReferenceFact[];
  layout: ReferenceFact[];
  motion: ReferenceFact[];
  responsive: ReferenceFact[];
  surfaces: ReferenceFact[];
  typography: ReferenceFact[];
  warnings: string[];
};

type Dimension = Exclude<keyof ParsedDesignMd, "fingerprint" | "warnings">;

const headingDimensions: Array<{ dimension: Dimension; pattern: RegExp }> = [
  { dimension: "atmosphere", pattern: /\b(?:atmosphere|brand personality|mood|theme|visual language|visual style|visual tone)\b/i },
  { dimension: "colors", pattern: /\b(?:colors?|colours?|palette|semantic tokens?)\b/i },
  { dimension: "typography", pattern: /\b(?:font|type scale|typography|type system)\b/i },
  { dimension: "components", pattern: /\b(?:components?|buttons?|inputs?|cards?|navigation|tabs?)\b/i },
  { dimension: "layout", pattern: /\b(?:grid|layout|spacing|composition|page width|section rhythm)\b/i },
  { dimension: "surfaces", pattern: /\b(?:border|depth|elevation|radius|radii|shadow|shape|surface)\b/i },
  { dimension: "imagery", pattern: /\b(?:asset|icon|illustration|image|imagery|photo|photography)\b/i },
  { dimension: "motion", pattern: /\b(?:animation|easing|interaction|motion|transition)\b/i },
  { dimension: "responsive", pattern: /\b(?:adaptive|breakpoint|mobile|responsive|tablet)\b/i },
  { dimension: "accessibility", pattern: /\b(?:a11y|accessibility|contrast|focus|keyboard|reduced motion)\b/i },
  { dimension: "dontRules", pattern: /^(?:avoid|do not|don't|dont|never)$|\b(?:avoid|do not|don't|dont|never|anti-pattern)\b/i },
  { dimension: "doRules", pattern: /^do$|\b(?:do rules?|guidance|principles?|prompt guide|requirements?)\b/i }
];

function emptyParsed(fingerprint: string): ParsedDesignMd {
  return {
    accessibility: [],
    atmosphere: [],
    colors: [],
    components: [],
    doRules: [],
    dontRules: [],
    fingerprint,
    imagery: [],
    layout: [],
    motion: [],
    responsive: [],
    surfaces: [],
    typography: [],
    warnings: []
  };
}

function dimensionForHeading(heading: string): Dimension | null {
  return headingDimensions.find((candidate) => candidate.pattern.test(heading))?.dimension ?? null;
}

function cleanStatement(value: string) {
  return value
    .replace(/^[-*+]\s+/, "")
    .replace(/^\d+[.)]\s+/, "")
    .replace(/^>\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function fact(value: string, evidenceId: string): ReferenceFact {
  return { evidenceIds: [evidenceId], status: "directly-specified", value };
}

function addUnique(target: ReferenceFact[], candidate: ReferenceFact) {
  if (!candidate.value || target.some((entry) => entry.value.toLowerCase() === candidate.value.toLowerCase())) return;
  target.push(candidate);
}

function inferDimension(statement: string): Dimension | null {
  return headingDimensions.find((candidate) => candidate.pattern.test(statement))?.dimension ?? null;
}

export function parseDesignMd(input: { content: string; sourceId: string }): ParsedDesignMd {
  const bounded = input.content.slice(0, designReferenceLimits.maxDesignMdBytes);
  const fingerprint = createHash("sha256").update(bounded).digest("hex").slice(0, 16);
  const parsed = emptyParsed(fingerprint);
  if (input.content.length > bounded.length) parsed.warnings.push("DESIGN.md was truncated at the bounded input limit.");

  let current: Dimension | null = null;
  let statementCount = 0;
  for (const rawLine of bounded.split(/\r?\n/)) {
    const heading = rawLine.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/)?.[1] ??
      rawLine.match(/^\s*([A-Za-z][A-Za-z /&'-]{2,48}):\s*$/)?.[1] ?? null;
    if (heading) {
      current = dimensionForHeading(heading);
      continue;
    }

    const statement = cleanStatement(rawLine);
    if (!statement || /^```/.test(statement) || statement.length < 3) continue;
    const inlineKey = statement.match(/^([A-Za-z][A-Za-z /&'-]{2,36}):\s*(.+)$/);
    const dimension = inlineKey ? dimensionForHeading(inlineKey[1]) ?? current : current ?? inferDimension(statement);
    const value = inlineKey?.[2]?.trim() ?? statement;
    if (!dimension || !value) continue;
    addUnique(parsed[dimension], fact(value.slice(0, 420), input.sourceId));
    statementCount += 1;
    if (statementCount >= designReferenceLimits.maxDesignMdStatements) {
      parsed.warnings.push("DESIGN.md statements were truncated at the bounded parsing limit.");
      break;
    }
  }

  const hexColors = [...bounded.matchAll(/#[0-9a-f]{3,8}\b/gi)].map((match) => match[0].toUpperCase());
  for (const color of [...new Set(hexColors)].slice(0, 20)) addUnique(parsed.colors, fact(`Color token ${color}`, input.sourceId));

  if (!parsed.motion.length) {
    parsed.motion.push({ evidenceIds: [input.sourceId], status: "unavailable", value: "No motion guidance was directly specified." });
  }
  if (!parsed.responsive.length) {
    parsed.responsive.push({ evidenceIds: [input.sourceId], status: "unavailable", value: "No responsive guidance was directly specified." });
  }
  return parsed;
}
