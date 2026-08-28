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
    .replace(/\b\d+(?:\.\d+)+\b/g, (match) => match.replaceAll(".", "\uE102"))
    .replace(/\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc)\./gi, (match) => match.slice(0, -1) + "\uE103");
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

function currentConstraints(prompt: string): Omit<AskResponseConstraints, "source"> {
  const exactWords = positiveInteger(prompt.match(new RegExp("\\bexactly\\s+" + countPattern + "\\s+words?\\b", "i"))?.[1])
    ?? positiveInteger(prompt.match(new RegExp("\\b(?:answer|respond)(?:\\s+(?:my\\s+)?next\\s+(?:question\\s+)?)?(?:in|using)\\s+(?:only\\s+)?" + countPattern + "\\s+words?\\b", "i"))?.[1])
    ?? positiveInteger(prompt.match(new RegExp("\\band\\s+(?:exactly\\s+)?" + countPattern + "\\s+words?\\b", "i"))?.[1]);
  const maxWords = positiveInteger(prompt.match(/\b(?:under|less than|max(?:imum)?|no more than|at most)\s+(\d+)\s+words?\b/i)?.[1]);
  const bulletCount = positiveInteger(prompt.match(new RegExp("\\b(?:exactly\\s+)?" + countPattern + "\\s+bullet(?:\\s+points?)?s?\\b", "i"))?.[1]);
  const exactSentences = positiveInteger(prompt.match(new RegExp("\\b(?:exactly\\s+)?" + countPattern + "\\s+sentences?\\s+(?:only\\b)?", "i"))?.[1])
    ?? positiveInteger(prompt.match(new RegExp("\\b(?:use|answer|respond)(?:\\s+in)?\\s+" + countPattern + "\\s+sentences?\\s+only\\b", "i"))?.[1]);
  const bulletItemMaxWords = positiveInteger(prompt.match(new RegExp("\\beach(?:\\s+(?:bullet|item))?\\s+(?:with\\s+)?(?:no more than|at most|max(?:imum)?)\\s+" + countPattern + "\\s+words?\\b", "i"))?.[1]);
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
  if (current.allowedResponses || current.exactWords || current.maxWords || current.bulletCount || current.exactSentences || current.forbiddenWords.length) {
    return { ...current, source: "current" };
  }
  const priorUsers = history.filter((message) => message.role === "user");
  const currentIsLast = priorUsers.at(-1)?.content.trim() === prompt.trim();
  const immediatelyPrior = priorUsers.at(currentIsLast ? -2 : -1);
  if (immediatelyPrior && isNextTurnResponseConstraint(immediatelyPrior.content)) {
    const prior = currentConstraints(immediatelyPrior.content);
    if (prior.allowedResponses || prior.exactWords || prior.maxWords || prior.bulletCount || prior.exactSentences || prior.forbiddenWords.length) {
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
    const existing = next.split(/\r?\n/).filter((line) => /^\s*(?:[-*•]|\d+[.)])\s+/.test(line));
    const candidates = existing.length
      ? existing
      : next.split(/(?<=[.!?])\s+/).map((line) => line.trim()).filter(Boolean).map((line) => `- ${line}`);
    next = candidates.slice(0, constraints.bulletCount).map((line) => {
      const content = line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "");
      const bounded = constraints.bulletItemMaxWords
        ? words(content).slice(0, constraints.bulletItemMaxWords).join(" ")
        : content;
      return `- ${bounded}`;
    }).join("\n");
  }
  if (constraints.exactSentences) {
    next = sentenceParts(next).slice(0, constraints.exactSentences).join(" ").trim();
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
  if (constraints.exactSentences === 1 && next) {
    next = next.replace(/[.!?]+(?=\s+\S)/g, ",").replace(/[.!?]*$/, ".");
  }
  return next;
}
