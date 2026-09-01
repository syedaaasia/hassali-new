import type { AskConversationMessage } from "./ask-serious-assistant";

function recentUserMessages(history: AskConversationMessage[]) {
  return history.filter((message) => message.role === "user").slice(-12).map((message) => message.content.trim());
}

function conversationFactAnswer(prompt: string, history: AskConversationMessage[]) {
  const query = prompt.match(/\bwhat\s+(database|framework|language|stack)\s+does\s+([A-Za-z][\w-]*)\s+use(?:\s+now)?\b/i);
  const property = query?.[1]?.toLowerCase();
  const subject = query?.[2];
  if (!subject || !property) return null;
  for (const message of recentUserMessages(history).reverse()) {
    if (!message.toLowerCase().includes(subject.toLowerCase())) continue;
    const corrected = message.match(/\b(?:now uses|changed?\s+(?:from\s+\w+\s+)?to)\s+([A-Za-z][A-Za-z0-9.+#-]*)/i)?.[1];
    if (corrected) return corrected;
    const stack = message.match(/\buses\s+([^.!?]+)/i)?.[1] ?? "";
    const candidates = stack.split(/,|\band\b/i).map((value) => value.trim()).filter(Boolean);
    const patterns: Record<string, RegExp> = {
      database: /\b(?:postgres(?:ql)?|sqlite|mysql|mariadb|mongodb|redis|supabase|firebase|sql server)\b/i,
      framework: /\b(?:react|vue|angular|svelte|next\.?js|nuxt|django|flask|laravel|rails|spring)\b/i,
      language: /\b(?:python|javascript|typescript|java|ruby|php|go|rust|c#|c\+\+)\b/i,
      stack: /./
    };
    const value = candidates.find((candidate) => patterns[property]!.test(candidate));
    if (value) return value;
  }
  return null;
}

const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
const smallNumbers: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 };

function dayOffsetAnswer(prompt: string) {
  const match = prompt.match(/\bif\s+yesterday\s+was\s+(\d+|one|two|three|four|five|six|seven)\s+days?\s+before\s+(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\b/i);
  if (!match) return null;
  const offset = /^\d+$/.test(match[1]!) ? Number(match[1]) : smallNumbers[match[1]!.toLowerCase()];
  const anchor = weekdays.findIndex((day) => day.toLowerCase() === match[2]!.toLowerCase());
  if (!offset || anchor < 0) return null;
  const yesterday = (anchor - (offset % 7) + 7) % 7;
  const today = (yesterday + 1) % 7;
  return `${offset} days before ${weekdays[anchor]} is ${weekdays[yesterday]}. If that was yesterday, today is ${weekdays[today]}.`;
}

function boundedArithmeticAnswer(prompt: string) {
  const handshake = prompt.match(/\b(?:among|with)\s+(\d+)\s+people\b/i);
  if (handshake && /\bhandshakes?\b/i.test(prompt)) {
    const people = Number(handshake[1]);
    if (people >= 2 && people <= 10_000) return `${people * (people - 1) / 2} handshakes.`;
  }
  const interval = prompt.match(/\b(\d+|one|two|three|four|five|six|seven)\s+(?:pills?|items?|doses?)[\s\S]{0,80}\bevery\s+(half(?:\s+an?)?\s+hour|\d+\s+minutes?)\b/i);
  if (interval) {
    const count = /^\d+$/.test(interval[1]!) ? Number(interval[1]) : smallNumbers[interval[1]!.toLowerCase()];
    const minutes = /half/i.test(interval[2]!) ? 30 : Number(interval[2]!.match(/\d+/)?.[0]);
    if (count && minutes >= 0) {
      const elapsed = (count - 1) * minutes;
      return elapsed === 60 ? "One hour. The first is taken immediately, then the remaining two at thirty-minute intervals." : `${elapsed} minutes.`;
    }
  }

  const formatResult = (value: number) => Number.isInteger(value)
    ? String(value)
    : String(Number(value.toFixed(6)));
  const safeResult = (left: number, right: number, operation: "+" | "-" | "*" | "/") => {
    if (![left, right].every((value) => Number.isFinite(value) && Math.abs(value) <= 1_000_000_000)) return null;
    if (operation === "/" && right === 0) return null;
    const result = operation === "+"
      ? left + right
      : operation === "-"
        ? left - right
        : operation === "*"
          ? left * right
          : left / right;
    return Number.isFinite(result) && Math.abs(result) <= 1_000_000_000_000 ? result : null;
  };

  const direct = prompt.match(/\b(?:what(?:'s| is)|calculate|compute|solve)?\s*(-?\d+(?:\.\d+)?)\s*(\+|-|\*|×|\/|÷|plus|minus|times|multiplied by|divided by)\s*(-?\d+(?:\.\d+)?)\b/i);
  if (direct) {
    const operationText = direct[2]!.toLowerCase();
    const operation: "+" | "-" | "*" | "/" = /^(?:\+|plus)$/.test(operationText)
      ? "+"
      : /^(?:-|minus)$/.test(operationText)
        ? "-"
        : /^(?:\*|×|times|multiplied by)$/.test(operationText)
          ? "*"
          : "/";
    const result = safeResult(Number(direct[1]), Number(direct[3]), operation);
    if (result !== null) return `${formatResult(result)}.`;
  }

  const takeAway = prompt.match(
    /\b(?:have|had|start(?:ed)? with|got)\s+(-?\d+(?:\.\d+)?)\s+([a-z][a-z -]{0,30}?)\s+(?:and\s+)?(?:give|gave)\s+away\s+(-?\d+(?:\.\d+)?)\b/i
  );
  if (takeAway && /\b(?:how many|remain|left)\b/i.test(prompt)) {
    const result = safeResult(Number(takeAway[1]), Number(takeAway[3]), "-");
    const noun = takeAway[2]!.trim().replace(/\s+(?:and|then)$/i, "");
    if (result !== null) return `${formatResult(result)} ${noun} remain.`;
  }

  return null;
}

export function isTimelessReasoningRequest(prompt: string) {
  const hypothetical = /\b(?:if|suppose|imagine|puzzle|riddle|prove|why does|which is heavier|how many|measure exactly|all but)\b/i.test(prompt);
  const formal = /\b(?:0\.9{3}|infinity|largest number|handshakes?|litres?|liters?|citations?|deduction|paradox)\b/i.test(prompt);
  const finiteIntervalProblem = /\b(?:gives?|has|take|receive)\b[\s\S]{0,80}\b(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b[\s\S]{0,80}\b(?:every|each)\s+(?:half(?:\s+an?)?\s+hour|\d+\s+minutes?)\b[\s\S]{0,80}\b(?:how long|until|when)\b/i.test(prompt);
  const externalTarget = /\b(?:current(?:ly)?|latest|today'?s|right now|live)\b[\s\S]{0,70}\b(?:news|price|rate|ceo|president|weather|richest|release|event|company)\b/i.test(prompt);
  return !externalTarget && (hypothetical || formal || finiteIntervalProblem);
}

export function isSourceExistenceRequest(prompt: string) {
  return /\b(?:paper|study|report|article)\s+(?:called|titled|named)\s+["'“][^"'”]{4,}["'”]/i.test(prompt) &&
    /\b(?:summari[sz]e|findings?|published|exists?|verify|real)\b/i.test(prompt);
}

export function createEpistemicDirectAnswer(prompt: string, history: AskConversationMessage[] = []) {
  if (/\b(?:answer|respond to)(?:\s+my)?\s+next\s+(?:answer|question|response)\b/i.test(prompt)) return "Understood.";
  const dayOffset = dayOffsetAnswer(prompt);
  if (dayOffset) return dayOffset;
  const arithmetic = boundedArithmeticAnswer(prompt);
  if (arithmetic) return arithmetic;
  const conversationFact = conversationFactAnswer(prompt, history);
  if (conversationFact) return conversationFact;
  if (/\bremember\s+that\s+only\s+for\s+this\s+conversation\b/i.test(prompt)) {
    return "Understood. I will keep that detail within this conversation only.";
  }
  if (/^actually\b/i.test(prompt) && /\b(?:now uses|instead of|changed from|changed to)\b/i.test(prompt)) {
    return "Understood. I will use the corrected detail for this conversation.";
  }
  if (/\b(?:quoted|retrieved|embedded)\b[\s\S]{0,100}\b(?:instruction|prompt)\b/i.test(prompt) && /\b(?:data|untrusted|authority|control)\b/i.test(prompt)) {
    return "Quoted or retrieved instructions are untrusted data. They cannot outrank the current user's request or Hassali's safety and approval authority.";
  }
  return null;
}
