import { createHash } from "node:crypto";
import type {
  DesignKnowledgeComponentToken,
  DesignKnowledgeProfile,
  DesignKnowledgeTypographyToken
} from "./design-knowledge-profile";

type ScalarMap = Record<string, string>;
type NestedMap = Record<string, ScalarMap>;

const maximumDocumentCharacters = 96 * 1024;
const maximumNarrativeItems = 18;

function clean(value: string) {
  return value.replace(/^['"]|['"]$/g, "").replace(/\s+/g, " ").trim();
}

function unique(values: string[], maximum = maximumNarrativeItems) {
  return [...new Set(values.map(clean).filter(Boolean))].slice(0, maximum);
}

function slug(value: string) {
  return value.toLowerCase().replace(/\.app$/i, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function frontmatter(content: string) {
  const lines = content.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return { body: content, raw: "", structured: false };
  const closing = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  if (closing < 0) return { body: content, raw: "", structured: false };
  return {
    body: lines.slice(closing + 1).join("\n"),
    raw: lines.slice(1, closing).join("\n"),
    structured: true
  };
}

function parseFrontmatter(raw: string) {
  const roots: Record<string, string | ScalarMap | NestedMap> = {};
  let root = "";
  let child = "";
  const lines = raw.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (!line.trim() || /^\s*#/.test(line)) continue;
    const indent = line.length - line.trimStart().length;
    const match = line.trim().match(/^([^:]+):(?:\s*(.*))?$/);
    if (!match) continue;
    const key = clean(match[1] ?? "");
    let value = (match[2] ?? "").trim();
    if (/^[>|][-+]?$/.test(value)) {
      const block: string[] = [];
      const minimumIndent = indent + 2;
      while (index + 1 < lines.length) {
        const next = lines[index + 1] ?? "";
        const nextIndent = next.length - next.trimStart().length;
        if (next.trim() && nextIndent < minimumIndent) break;
        index += 1;
        block.push(next.trim());
      }
      value = block.join(" ");
    }
    if (indent === 0) {
      root = key;
      child = "";
      roots[root] = value ? clean(value) : {};
      continue;
    }
    if (!root || typeof roots[root] === "string") continue;
    if (indent === 2) {
      child = key;
      if (value) (roots[root] as ScalarMap)[key] = clean(value);
      else (roots[root] as NestedMap)[key] = {};
      continue;
    }
    if (indent === 4 && child) {
      const parent = (roots[root] as NestedMap)[child];
      if (parent && typeof parent === "object") parent[key] = clean(value);
    }
  }
  return roots;
}

function scalarMap(value: unknown): ScalarMap {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}

function nestedMap(value: unknown): NestedMap {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(Object.entries(value).flatMap(([key, candidate]) => {
    const mapped = scalarMap(candidate);
    return Object.keys(mapped).length ? [[key, mapped]] : [];
  }));
}

function narrativeSections(body: string) {
  const sections = new Map<string, string[]>();
  let heading = "overview";
  for (const rawLine of body.split(/\r?\n/)) {
    const nextHeading = rawLine.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/)?.[1];
    if (nextHeading) {
      heading = clean(nextHeading).toLowerCase();
      continue;
    }
    const statement = clean(rawLine.replace(/^[-*+]\s+/, "").replace(/^\d+[.)]\s+/, "").replace(/^>\s*/, ""));
    if (!statement || statement.length < 4 || /^```/.test(statement)) continue;
    const current = sections.get(heading) ?? [];
    if (current.length < 10) current.push(statement.slice(0, 520));
    sections.set(heading, current);
  }
  return sections;
}

function sectionValues(sections: Map<string, string[]>, pattern: RegExp) {
  return unique([...sections.entries()].filter(([heading]) => pattern.test(heading)).flatMap(([, values]) => values));
}

function resolveToken(value: string, roots: Record<string, string | ScalarMap | NestedMap>) {
  return value.replace(/\{([a-zA-Z0-9_-]+)\.([a-zA-Z0-9_-]+)\}/g, (original, root, key) => {
    const candidate = roots[root];
    if (!candidate || typeof candidate !== "object") return original;
    const token = (candidate as ScalarMap | NestedMap)[key];
    if (typeof token === "string") return token;
    if (token && typeof token === "object") return Object.entries(token).map(([name, entry]) => `${name}: ${entry}`).join("; ");
    return original;
  });
}

function typography(tokens: NestedMap): Record<string, DesignKnowledgeTypographyToken> {
  return Object.fromEntries(Object.entries(tokens).map(([name, values]) => [name, {
    family: values.fontFamily ?? null,
    featureSettings: values.fontFeature ?? values.fontFeatureSettings ?? null,
    letterSpacing: values.letterSpacing ?? null,
    lineHeight: values.lineHeight ?? null,
    name,
    size: values.fontSize ?? null,
    weight: values.fontWeight ?? null
  }]));
}

function components(tokens: NestedMap, roots: Record<string, string | ScalarMap | NestedMap>): Record<string, DesignKnowledgeComponentToken> {
  return Object.fromEntries(Object.entries(tokens).map(([name, properties]) => [name, {
    name,
    properties,
    resolvedProperties: Object.fromEntries(Object.entries(properties).map(([key, value]) => [key, resolveToken(value, roots)]))
  }]));
}

function inferredArchetypes(text: string) {
  const patterns = ["cinematic", "editorial", "minimal", "technical", "playful", "luxury", "commerce", "product", "dashboard", "brutalist", "organic", "photography-first"];
  return patterns.filter((pattern) => text.toLowerCase().includes(pattern));
}

function aliasesFor(input: { id: string; name: string }) {
  const name = input.name.replace(/[- ](?:inspired-)?design-analysis$/i, "").replace(/-inspired$/i, "");
  const values = [input.id, input.id.replace(/\.app$/i, ""), name, slug(name)];
  if (/shopifi/i.test(name)) values.push("shopify", "shopifi");
  return unique(values.map((value) => value.toLowerCase()), 8);
}

export function parseDesignKnowledgeDocument(input: { content: string; sourcePath: string }): DesignKnowledgeProfile {
  const bounded = input.content.slice(0, maximumDocumentCharacters);
  const source = frontmatter(bounded);
  const roots = parseFrontmatter(source.raw);
  const sections = narrativeSections(source.body);
  const id = input.sourcePath.split(/[\\/]/).filter(Boolean).at(-2) ?? "design-profile";
  const name = typeof roots.name === "string" ? roots.name : id;
  const description = typeof roots.description === "string" ? roots.description : sectionValues(sections, /overview|theme|atmosphere/)[0] ?? name;
  const combined = `${description}\n${source.body}`;
  return {
    aliases: aliasesFor({ id, name }),
    archetypes: inferredArchetypes(combined),
    atmosphere: unique([description, ...sectionValues(sections, /atmosphere|theme|mood|visual language|visual style/)]),
    canvasStrategy: unique(combined.match(/[^.!?\n]*(?:canvas|background|surface)[^.!?\n]*[.!?]?/gi) ?? [], 8),
    colors: scalarMap(roots.colors),
    components: components(nestedMap(roots.components), roots),
    confidence: source.structured ? 0.94 : 0.76,
    description,
    doRules: sectionValues(sections, /^(?:do|principles|guidance|requirements)/),
    dontRules: sectionValues(sections, /don't|dont|avoid|anti-pattern|never/),
    fingerprint: createHash("sha256").update(bounded).digest("hex").slice(0, 20),
    geometry: scalarMap(roots.rounded),
    id,
    imagery: sectionValues(sections, /imagery|photography|assets?|illustration|icon/),
    layout: sectionValues(sections, /layout|grid|composition|spacing|whitespace|section rhythm/),
    motion: sectionValues(sections, /motion|animation|interaction|transition/),
    name,
    responsive: sectionValues(sections, /responsive|mobile|tablet|breakpoint|adaptive/),
    sourceFormat: source.structured ? "structured-frontmatter" : "legacy",
    sourcePath: input.sourcePath,
    spacing: scalarMap(roots.spacing),
    typography: typography(nestedMap(roots.typography)),
    version: typeof roots.version === "string" ? roots.version : null
  };
}
