export type ProjectNoteAction =
  | { kind: "add"; content: string }
  | { kind: "remove"; target: string }
  | { kind: "show" }
  | { kind: "summarize" }
  | { kind: "update"; from: string; to: string };

export function parseProjectNoteAction(prompt: string): ProjectNoteAction | null {
  const text = prompt.trim();
  if (/^(?:please\s+)?(?:add\s+)?(?:a\s+short\s+)?summar(?:y|ize)\b[\s\S]*\b(?:conversation|chat)\b[\s\S]*\b(?:to|into|in)\s+(?:my\s+)?notes?\b/i.test(text) ||
      /^(?:please\s+)?summarize\s+(?:what\s+we(?:'ve| have)\s+done|this\s+(?:conversation|chat))[\s\S]*\bnotes?\b/i.test(text)) {
    return { kind: "summarize" };
  }
  const add = text.match(/^(?:please\s+)?(?:add|save|write)\s+(?:to\s+)?(?:my\s+)?notes?\s+(?:that\s+)?(.+)$/i);
  if (add?.[1]) return { content: add[1].replace(/[.\s]+$/, "").trim(), kind: "add" };
  if (/^(?:please\s+)?(?:show|read|list|what(?:'s| is) in)\s+(?:my\s+)?notes?\??$/i.test(text)) return { kind: "show" };
  const update = text.match(/^(?:please\s+)?(?:change|update|replace)\s+(?:my\s+)?(?:note\s+)?(?:from\s+)?(.+?)\s+(?:to|with)\s+(.+)$/i);
  if (update?.[1] && update[2]) return { from: update[1].trim(), kind: "update", to: update[2].replace(/[.\s]+$/, "").trim() };
  const remove = text.match(/^(?:please\s+)?(?:remove|delete)\s+(?:the\s+)?(.+?)\s+(?:from\s+)?(?:my\s+)?notes?\.?$/i);
  if (remove?.[1]) return { kind: "remove", target: remove[1].trim() };
  return null;
}

function lines(notes: string) {
  return notes.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

export function applyProjectNoteAction(notes: string, action: ProjectNoteAction) {
  const current = lines(notes);
  if (action.kind === "summarize") return { answer: "I can update the Hassali Summary from this conversation.", notes };
  if (action.kind === "show") return { answer: current.length ? `My Notes:\n${current.map((line) => `- ${line.replace(/^[-*]\s*/, "")}`).join("\n")}` : "My Notes are empty.", notes };
  if (action.kind === "add") {
    const normalized = action.content.toLowerCase();
    if (current.some((line) => line.replace(/^[-*]\s*/, "").toLowerCase() === normalized)) return { answer: "That note is already in My Notes.", notes };
    const next = [...current, `- ${action.content}`].join("\n");
    return { answer: `Added to My Notes: ${action.content}`, notes: next };
  }
  if (action.kind === "update") {
    const index = current.findIndex((line) => line.toLowerCase().includes(action.from.toLowerCase()));
    if (index < 0) return { answer: `I couldn't find a note matching “${action.from}”, so I changed nothing.`, notes };
    current[index] = current[index].replace(new RegExp(action.from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), action.to);
    return { answer: `Updated My Notes to: ${current[index].replace(/^[-*]\s*/, "")}`, notes: current.join("\n") };
  }
  const index = current.findIndex((line) => line.toLowerCase().includes(action.target.toLowerCase()));
  if (index < 0) return { answer: `I couldn't find a note matching “${action.target}”, so I removed nothing.`, notes };
  const [removed] = current.splice(index, 1);
  return { answer: `Removed from My Notes: ${removed.replace(/^[-*]\s*/, "")}`, notes: current.join("\n") };
}

export function buildDeterministicAskSummary(messages: Array<{ content: string; role: "assistant" | "user" }>) {
  const meaningful = messages
    .filter((message) => message.content.trim().length >= 20)
    .filter((message) => !/\bsummar(?:y|ize)\b[\s\S]*\bnotes?\b/i.test(message.content))
    .slice(-10);
  const bullets: string[] = [];
  for (let index = 0; index < meaningful.length; index += 2) {
    const user = meaningful[index];
    const assistant = meaningful[index + 1];
    if (!user) continue;
    const request = user.content.replace(/\s+/g, " ").trim().slice(0, 120);
    const result = assistant?.role === "assistant" ? assistant.content.replace(/\s+/g, " ").trim().slice(0, 150) : "In progress";
    bullets.push(`- ${request}${/[.!?]$/.test(request) ? "" : ":"} ${result}`);
  }
  return bullets.slice(-5).join("\n");
}
