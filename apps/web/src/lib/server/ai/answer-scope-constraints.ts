export type ExclusiveConstraintScope = "color" | "field" | "file" | "ingredient" | "section" | "technology";

export type ExclusiveSetConstraint = { allowed: string[]; exclusive: true; scope: ExclusiveConstraintScope };

const vocabularies: Record<Exclude<ExclusiveConstraintScope, "file" | "section">, string[]> = {
  color: ["black", "blue", "brown", "cream", "cyan", "gold", "gray", "green", "grey", "orange", "pink", "purple", "red", "silver", "teal", "white", "yellow"],
  field: ["address", "age", "company", "email", "id", "name", "phone", "price", "status", "title"],
  ingredient: ["butter", "cheese", "egg", "eggs", "flour", "garlic", "milk", "oil", "onion", "onions", "pepper", "rice", "salt", "soy sauce", "sugar", "tomato", "tomatoes", "vegetable", "vegetables", "water"],
  technology: ["angular", "css", "django", "express", "flask", "html", "javascript", "laravel", "next.js", "node.js", "php", "python", "react", "ruby", "svelte", "typescript", "vue"]
};

function normalize(value: string) {
  return value.toLowerCase().replace(/^the\s+/, "").replace(/\s+(?:ingredients?|colors?|files?|fields?|columns?|technologies|sections?)$/i, "").trim();
}

function values(value: string) {
  return value.replace(/[.!?]+$/g, "").split(/\s*,\s*(?:and\s+)?|\s+and\s+|\s+or\s+/i)
    .map((item) => normalize(item.replace(/^[`"']|[`"']$/g, "").replace(/^sections?\s+(?=\d)/i, ""))).filter(Boolean);
}

function scopeFor(prompt: string): ExclusiveConstraintScope | null {
  if (/\b(?:cook|dish|food|ingredient|meal|recipe)\b/i.test(prompt)) return "ingredient";
  if (/\b(?:files?|\w+\.(?:tsx?|jsx?|css|html|py))\b/i.test(prompt)) return "file";
  if (/\b(?:colors?|colour|palette|design)\b/i.test(prompt)) return "color";
  if (/\bsections?\s+\d/i.test(prompt)) return "section";
  if (/\b(?:fields?|columns?|return)\b/i.test(prompt)) return "field";
  if (/\b(?:build|code|implementation|stack|technolog)\b/i.test(prompt)) return "technology";
  if (vocabularies.technology.some((item) => values(prompt.replace(/^use\s+(?:only|just)\s+/i, "")).includes(item))) return "technology";
  return null;
}

export function extractExclusiveSetConstraints(prompt: string): ExclusiveSetConstraint[] {
  const scope = scopeFor(prompt);
  if (!scope) return [];
  const explicit = prompt.match(/\b(?:using|use|with|return|include|change|modify|summari[sz]e)\s+(?:nothing\s+except|only|just)\s+([^\r\n]+)/i)?.[1]
    ?? prompt.match(/\bnothing\s+(?:but|except)\s+([^\r\n]+)/i)?.[1];
  const referencesList = /\b(?:only|just)\s+(?:these|those)\b|\b(?:use no other|do not add anything else)\b/i.test(prompt);
  const antecedent = referencesList
    ? prompt.match(/\b(?:i have|(?:ingredients?|colors?|files?|fields?|columns?|technologies|sections?) (?:are|available)[:]?|use)\s+(.+?)(?:[.!?](?:\s|$)|$)/i)?.[1]
    : null;
  const list = (antecedent ?? explicit ?? "").split(/[;!?]|\.\s/)[0];
  if (/^(?:these|those)\b/i.test(list)) return [];
  const allowed = values(list);
  return allowed.length ? [{ allowed: Array.from(new Set(allowed)), exclusive: true, scope }] : [];
}

function mentioned(answer: string, scope: ExclusiveConstraintScope) {
  if (scope === "file") return Array.from(answer.matchAll(/\b[\w./-]+\.[a-z0-9]{1,8}\b/gi), (match) => normalize(match[0]));
  if (scope === "section") return Array.from(answer.matchAll(/\bsections?\s+(\d+(?:\s*(?:,|and)\s*\d+)*)/gi)).flatMap((match) => values(match[1]));
  if (scope === "field") {
    const labels = Array.from(answer.matchAll(/(?:^|[\n{,])\s*[-*]?\s*["`]?([a-z][\w -]{0,40})["`]?\s*:/gi), (match) => normalize(match[1]));
    return Array.from(new Set([...labels, ...vocabularies.field.filter((item) => new RegExp(`\\b${item}\\b\\s*[:|]`, "i").test(answer))]));
  }
  return vocabularies[scope].filter((item) => new RegExp(`\\b${item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\ /g, "\\s+")}\\b`, "i").test(answer));
}

function equivalent(value: string, scope: ExclusiveConstraintScope) {
  const normalized = normalize(value);
  if (scope === "file") return normalized;
  return scope === "ingredient" ? normalized.replace(/s$/, "") : normalized;
}

export function materiallyIncluded(answer: string, item: string) {
  const escaped = item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\ /g, "\\s+");
  return Array.from(answer.matchAll(new RegExp(`\\b${escaped}\\b`, "gi"))).some((match) => {
    const before = answer.slice(Math.max(0, match.index - 80), match.index);
    const after = answer.slice(match.index + match[0].length, match.index + match[0].length + 60);
    const negatedBefore = /\b(?:avoid|exclude|excluding|skip|no|not|without|do not|don't|never)\s+(?:(?:use|using|add|adding|include|including|recommend|modify|change|need|for|any|the|extra|additional|optional)\s+)*$/i.test(before);
    const negatedAfter = /^\s*(?:(?:is|are|should be|will be|remains?|stays?)\s+)?(?:excluded|not needed|unchanged|unused)\b/i.test(after);
    return !negatedBefore && !negatedAfter;
  });
}

export function validateExclusiveSetConstraints(answer: string, constraints: ExclusiveSetConstraint[]) {
  return constraints.flatMap((constraint) => {
    const allowed = new Set(constraint.allowed.map((item) => equivalent(item, constraint.scope)));
    return mentioned(answer, constraint.scope)
      .filter((item) => !allowed.has(equivalent(item, constraint.scope)) && materiallyIncluded(answer, item))
      .map((item) => `${constraint.scope}:${item}`);
  });
}

export function exclusiveSetInstruction(constraints: ExclusiveSetConstraint[]) {
  return constraints.map(({ allowed, scope }) => `Exclusive ${scope} set: use only ${allowed.join(", ")}; do not introduce another ${scope} item.`).join(" ");
}

export function createExclusiveSetFallback(constraints: ExclusiveSetConstraint[], prompt: string) {
  const constraint = constraints[0];
  // A scoped palette can be constructed locally. Other tasks need their actual
  // content or implementation: repeating the constraint is not a completion.
  if (!constraint || constraints.length !== 1 || constraint.scope !== "color" || !/\bpalette\b/i.test(prompt)) return null;
  return `Use ${constraint.allowed[0]} for the primary emphasis and ${constraint.allowed.slice(1).join(" and ") || constraint.allowed[0]} for supporting surfaces, with no additional colors.`;
}
