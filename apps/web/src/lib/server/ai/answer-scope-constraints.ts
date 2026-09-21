export type ExclusiveConstraintScope = "color" | "field" | "file" | "ingredient" | "section" | "technology" | "tool" | "source" | "operation" | "fact";

export type ExclusiveSetConstraint = { allowed: string[]; exclusive: true; scope: ExclusiveConstraintScope };

const vocabularies: Partial<Record<ExclusiveConstraintScope, string[]>> = {
  color: ["black", "blue", "brown", "cream", "cyan", "gold", "gray", "green", "grey", "orange", "pink", "purple", "red", "silver", "teal", "white", "yellow"],
  field: ["address", "age", "company", "email", "id", "name", "phone", "price", "status", "title"],
  ingredient: ["butter", "cheese", "egg", "eggs", "flour", "garlic", "milk", "oil", "onion", "onions", "pepper", "rice", "salt", "soy sauce", "sugar", "tomato", "tomatoes", "vegetable", "vegetables", "water"],
  technology: ["angular", "css", "django", "express", "flask", "html", "javascript", "laravel", "next.js", "node.js", "php", "python", "react", "ruby", "svelte", "typescript", "vue"]
};

function normalize(value: string) {
  return value.toLowerCase().trim().replace(/^(?:the|a|an)\s+/, "").replace(/\s+(?:ingredients?|colors?|files?|fields?|columns?|technologies|sections?|tools?|sources?|operations?)$/i, "").trim();
}

function values(value: string) {
  return value.replace(/[.!?]+$/g, "").split(/\s*,\s*(?:and\s+)?|\s+and\s+|\s+or\s+/i)
    .map((item) => normalize(item.replace(/^[`"']|[`"']$/g, "").replace(/^sections?\s+(?=\d)/i, ""))).filter(Boolean);
}

function scopeFor(prompt: string): ExclusiveConstraintScope | null {
  if (/\bfacts?\b/i.test(prompt)) return "fact";
  if (/\bsources?\b|\bhttps?:\/\//i.test(prompt)) return "source";
  if (/\btools?\b/i.test(prompt)) return "tool";
  if (/\boperations?|actions?\b/i.test(prompt)) return "operation";
  if (/\b(?:cook|dish|food|ingredient|meal|recipe)\b/i.test(prompt)) return "ingredient";
  if (/\b(?:files?|\w+\.(?:tsx?|jsx?|css|html|py))\b/i.test(prompt)) return "file";
  if (/\b(?:colors?|colour|palette|design)\b/i.test(prompt)) return "color";
  if (/\bsections?\s+\d/i.test(prompt)) return "section";
  if (/\b(?:fields?|columns?|return)\b/i.test(prompt)) return "field";
  if (/\b(?:build|code|implementation|stack|technolog)\b/i.test(prompt)) return "technology";
  if (vocabularies.technology!.some((item) => values(prompt.replace(/^use\s+(?:only|just)\s+/i, "")).includes(item))) return "technology";
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
  const raw = antecedent ?? explicit ?? "";
  if (scope === "fact") {
    const facts = raw.replace(/^(?:these\s+)?(?:\w+\s+)?facts?\s*:\s*/i, "").split(/;|\n|\.\s/).map((fact) => fact.replace(/[.!?]+$/, "").trim()).filter(Boolean);
    return facts.length && /facts?\s*:/i.test(raw) ? [{ allowed: facts, exclusive: true, scope }] : [];
  }
  const list = raw.split(/[;!?]|\.\s/)[0]
    .replace(/\s+(?:in|for|on|as)\s+(?:the|this|my|our)\s+.+$/i, "")
    .replace(/^(?:the\s+)?(?:tools?|sources?|operations?|fields?|files?|colors?|ingredients?)\s*:\s*/i, "");
  if (/^(?:these|those)\b/i.test(list)) return [];
  const allowed = values(list);
  return allowed.length ? [{ allowed: Array.from(new Set(allowed)), exclusive: true, scope }] : [];
}

function roleObjects(answer: string, scope: ExclusiveConstraintScope) {
  const verbs: Partial<Record<ExclusiveConstraintScope, string>> = {
    ingredient: "add|stir in|fold in|season with|sprinkle|garnish with|finish with|cook with|fry in",
    technology: "install|import|depend on|built with|implement with|add|use",
    color: "use|add|paint|color|colour",
    tool: "use|run|invoke|install",
    operation: "perform|execute|run|apply",
    source: "cite|consult|reference|use"
  };
  const pattern = verbs[scope];
  if (!pattern) return [];
  const objects = Array.from(answer.matchAll(new RegExp(`\\b(?:${pattern})\\s+([^.!?;\\n]+)`, "gi")))
    .flatMap((match) => values(match[1]!.split(/(?:,?\s+and\s+)(?=(?:add|stir|fold|season|sprinkle|garnish|finish|cook|use|install|run)\b)|\s+(?:to|into|in|for|with|over|then|until|before|after|from)\s+/i)[0]!))
    .map((item) => item.replace(/^(?:(?:some|optional|extra|additional|little|fresh|chopped|ground)\s+|(?:a\s+)?(?:pinch|dash|spoonful)\s+of\s+)+/i, ""));
  // Instructional objects do not acquire the restricted role merely by being nouns.
  const contextOnly = /^(?:pan|pot|bowl|plate|spoon|oven|stove|heat|skillet|browser|layout|file|page|structure|accents?|background|surfaces?|emphasis|supporting surfaces|primary emphasis)(?:\s|$)/i;
  return objects.map((item) => scope === "technology" ? item.replace(/\s+(?:file|framework|library|language|stylesheet)$/i, "") : item)
    .filter((item) => item && !contextOnly.test(item) && item.split(/\s+/).length <= 4);
}

function mentioned(answer: string, scope: ExclusiveConstraintScope) {
  if (scope === "file") return Array.from(answer.matchAll(/\b[\w./-]+\.[a-z0-9]{1,8}\b/gi), (match) => normalize(match[0]));
  if (scope === "section") return Array.from(answer.matchAll(/\bsections?\s+(\d+(?:\s*(?:,|and)\s*\d+)*)/gi)).flatMap((match) => values(match[1]));
  if (scope === "field") {
    const labels = Array.from(answer.matchAll(/(?:^|[\n{,])\s*[-*]?\s*["`]?([a-z][\w -]{0,40})["`]?\s*:/gi), (match) => normalize(match[1]));
    const tableHeader = answer.split("\n").find((line) => /^\s*\|/.test(line));
    const tableFields = tableHeader ? tableHeader.split("|").map(normalize).filter(Boolean) : [];
    return Array.from(new Set([...labels, ...tableFields, ...vocabularies.field!.filter((item) => new RegExp(`\\b${item}\\b\\s*[:|]`, "i").test(answer))]));
  }
  const known = (vocabularies[scope] ?? []).filter((item) => new RegExp(`\\b${item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\ /g, "\\s+")}\\b`, "i").test(answer));
  const declared = Array.from(answer.matchAll(new RegExp(`\\b${scope}s?\\s*:\\s*([^\\n.!?]+)`, "gi"))).flatMap((match) => values(match[1]!));
  const links = scope === "source" ? Array.from(answer.matchAll(/https?:\/\/[^\s)]+/gi), (match) => match[0].replace(/[.,]+$/, "")) : [];
  return Array.from(new Set([...known, ...roleObjects(answer, scope), ...declared, ...links]));
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
    if (constraint.scope === "fact") {
      const normalizeFact = (value: string) => value.toLowerCase().replace(/^[\s*\-\d.)]+/, "").replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
      const allowedFacts = constraint.allowed.map(normalizeFact);
      return answer.split(/(?<=[.!?])\s+|\n+/).filter((sentence) => {
        const text = normalizeFact(sentence);
        return text && !allowedFacts.includes(text);
      }).map((sentence) => `fact:unestablished claim (${sentence.slice(0, 100)})`);
    }
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
