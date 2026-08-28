import type { AskConversationMessage } from "./ask-serious-assistant";

export type AskResponseConstraints = {
  allowedResponses: string[] | null;
  bulletItemMaxWords: number | null;
  bulletCount: number | null;
  exactSentences: number | null;
  exactWords: number | null;
  forbiddenWords: string[];
  maxWords: number | null;
  source: "current" | "prior-turn" | "none";
};

const countPattern = "(\\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)";

const numberWords: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20
};

function positiveInteger(value: string | undefined) {
  if (!value) return null;
  const parsed = /^\d+$/.test(value) ? Number(value) : numberWords[value.toLowerCase()];
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 500 ? parsed : null;
}

function words(value: string) {
  return value.trim().split(/\s+/).filter(Boolean);
}

function sentenceParts(value: string) {
  const protectedValues: string[] = [];
  const protect = (match: string) => {
    const index = protectedValues.push(match) - 1;
    return `\uE100${index}\uE101`;
  };
  const protectedText = value
    .replace(/https?:\/\/\S+/gi, (match) => {
      const trailingPunctuation = match.match(/[.!?]+$/)?.[0] ?? "";
      const url = trailingPunctuation ? match.slice(0, -trailingPunctuation.length) : match;
      return protect(url) + trailingPunctuation;
    })
    .replace(/\b(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/\S*)?/gi, protect)
    .replace(/\bv?\d+(?:\.\d+)+\b/gi, (match) => match.replaceAll(".", "\uE102"))
    .replace(/\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc|e\.g|i\.e)\./gi, (match) => match.replaceAll(".", "\uE103"))
    .replace(/\b(?:[A-Z]\.){2,}/g, (match) => match.replaceAll(".", "\uE103"));
  return (protectedText.match(/[^.!?]+(?:[.!?]+|$)/g) ?? [])
    .map((part) => part
      .replaceAll("\uE102", ".")
      .replaceAll("\uE103", ".")
      .replace(/\uE100(\d+)\uE101/g, (_, index: string) => protectedValues[Number(index)] ?? "")
      .trim())
    .filter((part) => /[\p{L}\p{N}]/u.test(part));
}

function emptyConstraints(source: AskResponseConstraints["source"]): AskResponseConstraints {
  return {
    allowedResponses: null,
    bulletCount: null,
    bulletItemMaxWords: null,
    exactSentences: null,
    exactWords: null,
    forbiddenWords: [],
    maxWords: null,
    source
  };
}

export function isNextTurnResponseConstraint(prompt: string) {
  return /\b(?:answer|respond to)(?:\s+my)?\s+next\s+(?:answer|question|response)\b/i.test(prompt) ||
    /\bfor\s+my\s+next\s+(?:answer|question|response)\b/i.test(prompt);
}

function forbiddenWords(prompt: string) {
  const match = prompt.match(/\b(?:do not|don't|without)\s+(?:use|using)\s+(?:the\s+)?words?\s+([^.!?]+)/i);
  if (!match?.[1]) return [];
  return match[1]
    .split(/,|\bor\b|\band\b/i)
    .map((word) => word.replace(/^[\s"'“”]+|[\s"'“”]+$/g, "").toLowerCase())
    .filter((word) => /^[a-z][a-z -]{0,40}$/.test(word))
    .slice(0, 20);
}

type ScopedWordLimit = {
  index: number;
  length: number;
  value: number;
};

function normalizedMaximum(value: string | undefined, operator: string | undefined) {
  const parsed = positiveInteger(value);
  if (!parsed) return null;
  return /^(?:under|less than)$/i.test(operator ?? "") ? Math.max(1, parsed - 1) : parsed;
}

function perItemWordLimit(prompt: string): ScopedWordLimit | null {
  const patterns = [
    new RegExp("\\beach(?:\\s+(?:bullet|item|point))?\\s+(?:with\\s+)?(under|less than|no more than|at most|max(?:imum)?)\\s+" + countPattern + "\\s+words?\\b", "i"),
    new RegExp("\\b(under|less than|no more than|at most|max(?:imum)?)\\s+" + countPattern + "\\s+words?\\s+(?:for\\s+)?each(?:\\s+(?:bullet|item|point))?\\b", "i"),
    new RegExp("\\b(under|less than|no more than|at most|max(?:imum)?)\\s+" + countPattern + "\\s+words?\\s+each\\b", "i")
  ];
  for (const pattern of patterns) {
    const match = prompt.match(pattern);
    const value = normalizedMaximum(match?.[2], match?.[1]);
    if (match?.index !== undefined && value) return { index: match.index, length: match[0].length, value };
  }
  return null;
}

function totalWordLimit(prompt: string, perItem: ScopedWordLimit | null) {
  const totalScope = perItem
    ? `${prompt.slice(0, perItem.index)} ${prompt.slice(perItem.index + perItem.length)}`
    : prompt;
  const match = totalScope.match(new RegExp("\\b(under|less than|max(?:imum)?|no more than|at most)\\s+" + countPattern + "\\s+words?(?:\\s+total)?\\b", "i"));
  return normalizedMaximum(match?.[2], match?.[1]);
}

function currentConstraints(prompt: string): Omit<AskResponseConstraints, "source"> {
  const perItem = perItemWordLimit(prompt);
  const exactWords = positiveInteger(prompt.match(new RegExp("\\bexactly\\s+" + countPattern + "\\s+words?\\b", "i"))?.[1])
    ?? positiveInteger(prompt.match(new RegExp("\\b(?:answer|respond)(?:\\s+(?:my\\s+)?next\\s+(?:question\\s+)?)?(?:in|using)\\s+(?:only\\s+)?" + countPattern + "\\s+words?\\b", "i"))?.[1])
    ?? positiveInteger(prompt.match(new RegExp("\\band\\s+(?:exactly\\s+)?" + countPattern + "\\s+words?\\b", "i"))?.[1]);
  const maxWords = totalWordLimit(prompt, perItem);
  const bulletCount = positiveInteger(prompt.match(new RegExp("\\b(?:exactly\\s+)?" + countPattern + "\\s+bullet(?:\\s+points?)?s?\\b", "i"))?.[1]);
  const exactSentences = positiveInteger(prompt.match(new RegExp("\\b(?:exactly\\s+)?" + countPattern + "\\s+sentences?(?:\\s+only)?\\b", "i"))?.[1])
    ?? positiveInteger(prompt.match(new RegExp("\\b(?:use|answer|respond|write)(?:\\s+in)?\\s+(?:exactly\\s+)?" + countPattern + "\\s+sentences?(?:\\s+only)?\\b", "i"))?.[1]);
  const bulletItemMaxWords = perItem?.value ?? null;
  const yesNoOnly = /\b(?:answer|respond|return)(?:\s+with)?\s+(?:only\s+)?yes\s+(?:or|\/)\s+no(?:\s+only)?\b/i.test(prompt) ||
    /\byes\s+(?:or|\/)\s+no\s+only\b/i.test(prompt);
  return {
    allowedResponses: yesNoOnly ? ["YES", "NO"] : null,
    bulletCount,
    bulletItemMaxWords,
    exactSentences,
    exactWords,
    forbiddenWords: forbiddenWords(prompt),
    maxWords
  };
}

export function extractAskResponseConstraints(prompt: string, history: AskConversationMessage[] = []): AskResponseConstraints {
  // A next-turn instruction controls the next user request, not its own acknowledgement.
  if (isNextTurnResponseConstraint(prompt)) {
    return emptyConstraints("none");
  }
  const current = currentConstraints(prompt);
  if (current.allowedResponses || current.exactWords || current.maxWords || current.bulletCount || current.bulletItemMaxWords || current.exactSentences || current.forbiddenWords.length) {
    return { ...current, source: "current" };
  }
  const priorUsers = history.filter((message) => message.role === "user");
  const currentIsLast = priorUsers.at(-1)?.content.trim() === prompt.trim();
  const immediatelyPrior = priorUsers.at(currentIsLast ? -2 : -1);
  if (immediatelyPrior && isNextTurnResponseConstraint(immediatelyPrior.content)) {
    const prior = currentConstraints(immediatelyPrior.content);
    if (prior.allowedResponses || prior.exactWords || prior.maxWords || prior.bulletCount || prior.bulletItemMaxWords || prior.exactSentences || prior.forbiddenWords.length) {
      return { ...prior, source: "prior-turn" };
    }
  }
  return emptyConstraints("none");
}

export function askResponseConstraintInstruction(constraints: AskResponseConstraints) {
  const requirements = [
    constraints.allowedResponses ? "Return only one of: " + constraints.allowedResponses.join(" or ") + "." : "",
    constraints.exactWords ? "Return exactly " + constraints.exactWords + " words." : "",
    constraints.maxWords ? "Return no more than " + constraints.maxWords + " words." : "",
    constraints.bulletCount ? "Return exactly " + constraints.bulletCount + " bullet items." : "",
    constraints.bulletItemMaxWords ? "Keep every bullet item to no more than " + constraints.bulletItemMaxWords + " words." : "",
    constraints.exactSentences ? "Return exactly " + constraints.exactSentences + " sentence" + (constraints.exactSentences === 1 ? "." : "s.") : "",
    constraints.forbiddenWords.length ? "Do not use these forbidden words (including ordinary case variants): " + constraints.forbiddenWords.join(", ") + "." : ""
  ].filter(Boolean);
  return requirements.length ? "Output constraints are authoritative: " + requirements.join(" ") : "";
}

export function validateAskResponseConstraints(answer: string, constraints: AskResponseConstraints) {
  const issues: string[] = [];
  const count = words(answer).length;
  if (constraints.allowedResponses && !constraints.allowedResponses.includes(answer.trim().toUpperCase())) {
    issues.push("constraint_allowed_response");
  }
  if (constraints.exactWords && count !== constraints.exactWords) issues.push("constraint_exact_words:" + constraints.exactWords + ":" + count);
  if (constraints.maxWords && count > constraints.maxWords) issues.push("constraint_max_words:" + constraints.maxWords + ":" + count);
  if (constraints.bulletCount) {
    const bulletLines = answer.split(/\r?\n/).filter((line) => /^\s*(?:[-*•]|\d+[.)])\s+/.test(line));
    const bullets = bulletLines.length;
    if (bullets !== constraints.bulletCount) issues.push("constraint_bullets:" + constraints.bulletCount + ":" + bullets);
    if (constraints.bulletItemMaxWords) {
      const overlong = bulletLines.filter((line) => words(line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "")).length > constraints.bulletItemMaxWords!).length;
      if (overlong) issues.push("constraint_bullet_max_words:" + constraints.bulletItemMaxWords + ":" + overlong);
    }
  }
  if (constraints.exactSentences) {
    const sentences = sentenceParts(answer).length;
    if (sentences !== constraints.exactSentences) issues.push("constraint_sentences:" + constraints.exactSentences + ":" + sentences);
  }
  for (const word of constraints.forbiddenWords) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
    if (new RegExp("\\b" + escaped + "\\b", "i").test(answer)) issues.push("constraint_forbidden_word:" + word);
  }
  return issues;
}

export function repairAskResponseLength(answer: string, constraints: AskResponseConstraints) {
  const tokens = words(answer);
  const ceiling = constraints.exactWords ?? constraints.maxWords;
  if (!ceiling || tokens.length <= ceiling) return answer.trim();
  return tokens.slice(0, ceiling).join(" ").replace(/[,;:]+$/, "").trim();
}

function distributeWordsAcrossParts(value: string, count: number) {
  const tokens = words(value.replace(/^\s*(?:[-*•]|\d+[.)])\s+/gm, ""));
  if (tokens.length < count) return [];
  const parts: string[] = [];
  let offset = 0;
  for (let index = 0; index < count; index += 1) {
    const remainingParts = count - index;
    const take = Math.ceil((tokens.length - offset) / remainingParts);
    parts.push(tokens.slice(offset, offset + take).join(" "));
    offset += take;
  }
  return parts;
}

function exactBulletContents(value: string, count: number) {
  const existing = value
    .split(/\r?\n/)
    .filter((line) => /^\s*(?:[-*•]|\d+[.)])\s+/.test(line))
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").trim())
    .filter(Boolean);
  const candidates = existing.length
    ? existing
    : sentenceParts(value).map((part) => part.trim()).filter(Boolean);
  if (candidates.length >= count) return candidates.slice(0, count);
  return distributeWordsAcrossParts(candidates.join(" "), count);
}

function exactSentenceText(value: string, count: number, redistribute = false) {
  const existing = sentenceParts(value);
  const normalized = existing
    .map((part) => part.replace(/[.!?]+$/g, "").trim())
    .join(" ");
  const parts = redistribute
    ? distributeWordsAcrossParts(normalized || value, count)
    : existing.length >= count
      ? existing.slice(0, count)
    : distributeWordsAcrossParts(existing.join(" ") || value, count);
  if (!parts.length) return value.trim();
  return parts
    .map((part) => `${part.replace(/[.!?]+$/g, "").trim()}.`)
    .join(" ");
}

export function finalizeAskResponseConstraints(answer: string, constraints: AskResponseConstraints) {
  let next = answer.trim();
  if (constraints.allowedResponses) {
    const allowed = constraints.allowedResponses.find((value) => new RegExp(`\\b${value}\\b`, "i").test(next));
    if (allowed) next = allowed;
  }
  for (const word of constraints.forbiddenWords) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
    next = next.replace(new RegExp(`\\b${escaped}\\b`, "gi"), "").replace(/[ \t]{2,}/g, " ");
  }
  if (constraints.bulletCount) {
    const candidates = exactBulletContents(next, constraints.bulletCount);
    next = candidates.map((content) => {
      const bounded = constraints.bulletItemMaxWords
        ? words(content).slice(0, constraints.bulletItemMaxWords).join(" ")
        : content;
      return `- ${bounded}`;
    }).join("\n");
  }
  if (constraints.exactSentences) {
    next = exactSentenceText(next, constraints.exactSentences);
  }
  next = repairAskResponseLength(next, constraints);
  if (constraints.exactWords) {
    const tokens = words(next);
    const fillers = ["clearly", "and", "concisely", "for", "you", "today"];
    while (tokens.length < constraints.exactWords) {
      tokens.push(fillers[tokens.length % fillers.length]!);
    }
    next = tokens.slice(0, constraints.exactWords).join(" ").replace(/[,;:]+$/, "").trim();
  }
  if (constraints.exactSentences && next) {
    next = exactSentenceText(
      next,
      constraints.exactSentences,
      Boolean(constraints.exactWords || constraints.maxWords)
    );
  }
  return next;
}
