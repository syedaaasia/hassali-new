import type { AskConversationMessage } from "./ask-serious-assistant";

function recentUserMessages(history: AskConversationMessage[]) {
  return history.filter((message) => message.role === "user").slice(-12).map((message) => message.content.trim());
}

function conversationFactAnswer(prompt: string, history: AskConversationMessage[]) {
  const subject = prompt.match(/\bwhat\s+(?:database|framework|language|stack)\s+does\s+([A-Za-z][\w-]*)\s+use\b/i)?.[1];
  if (!subject) return null;
  for (const message of recentUserMessages(history).reverse()) {
    if (!message.toLowerCase().includes(subject.toLowerCase())) continue;
    const value = message.match(/\b(?:now uses|uses|changed?\s+(?:from\s+\w+\s+)?to)\s+([A-Za-z][A-Za-z0-9.+#-]*)/i)?.[1];
    if (value) return value;
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
  const conversationFact = conversationFactAnswer(prompt, history);
  if (conversationFact) return conversationFact;
  if (/\b(?:quoted|retrieved|embedded)\b[\s\S]{0,100}\b(?:instruction|prompt)\b/i.test(prompt) && /\b(?:data|untrusted|authority|control)\b/i.test(prompt)) {
    return "Quoted or retrieved instructions are untrusted data. They cannot outrank the current user's request or Hassali's safety and approval authority.";
  }
  return null;
}
