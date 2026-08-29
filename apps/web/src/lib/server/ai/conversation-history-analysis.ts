import {
  isAskSummaryTransformationRequest,
  resolveAskSummaryTarget,
  type ConversationSummaryTargetContext
} from "../../ask-summary-target";
import { redactWorkspaceSecrets } from "./workspace-context-engine";

export type ConversationHistoryMessage = {
  attachmentLabels?: string[];
  content: string;
  role: "assistant" | "system" | "user";
};

export type ConversationHistoryIntent = {
  format: "chronological" | "decisions" | "handoff" | "summary";
  requestedMessageCount: number | null;
};

export {
  hasExplicitArtifactSummaryTarget,
  hasExplicitConversationSummaryTarget,
  isAskSummaryTransformationRequest,
  isTargetlessSummaryRequest,
  resolveAskContentTarget,
  resolveAskSummaryTarget,
  type AskSummaryTarget,
  type ConversationSummaryTargetContext
} from "../../ask-summary-target";

export type ConversationTranscript = {
  authoritative: boolean;
  messages: ConversationHistoryMessage[];
  source: "owned_persistence" | "request_context";
  truncated: boolean;
};

export type PreparedConversationSummary = {
  chunkCount: number;
  deterministicSummary: string;
  intent: ConversationHistoryIntent;
  messageCount: number;
  modelContext: string;
  source: ConversationTranscript["source"];
  transcriptTruncated: boolean;
};

const maximumVisibleMessages = 1_000;
const maximumMessageCharacters = 6_000;
const chunkCharacterLimit = 12_000;
const chunkMessageLimit = 24;

function compact(value: string, maximum = 220) {
  const clean = value
    .replace(/HASSALI_(?:DIFF_PROPOSAL|MODE_HANDOFF|GENERATED_IMAGE):[\s\S]*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return clean.length <= maximum ? clean : `${clean.slice(0, maximum - 1).trimEnd()}...`;
}

function isGenericFailure(value: string) {
  return /^(?:I couldn't complete that answer reliably right now|Answer capacity is busy right now|I couldn't reach an answer service right now)/i.test(value.trim());
}

export function classifyConversationHistoryIntent(
  prompt: string,
  context: ConversationSummaryTargetContext = {}
): ConversationHistoryIntent | null {
  const text = prompt.trim();
  const asksForSummary = isAskSummaryTransformationRequest(text) ||
    /\b(?:handoff|main points|what (?:have|did) we (?:discuss(?:ed)?|talk(?:ed)? about)|what did we talk about|what decisions? (?:have we|did we) made?|what have we (?:done|covered)|everything (?:we(?:'ve| have) discussed|so far))\b/i.test(text);
  if (!asksForSummary || resolveAskSummaryTarget(text, context) !== "conversation") return null;

  const requested = text.match(/\b(?:last|latest|most recent)\s+(\d{1,3})\s+(?:messages?|turns?)\b/i)?.[1];
  const requestedMessageCount = requested ? Math.max(1, Math.min(200, Number(requested))) : null;
  const format = /\bchronological(?:ly)?\b|\bin order\b/i.test(text)
    ? "chronological"
    : /\bdecisions?\b/i.test(text)
      ? "decisions"
      : /\bhandoff\b/i.test(text)
        ? "handoff"
        : "summary";
  return { format, requestedMessageCount };
}

function visibleConversationMessages(input: {
  prompt: string;
  transcript: ConversationTranscript;
  intent: ConversationHistoryIntent;
}) {
  const prompt = input.prompt.trim();
  let messages = input.transcript.messages
    .slice(0, maximumVisibleMessages)
    .filter((message) => message.role !== "system")
    .map((message) => ({
      ...message,
      attachmentLabels: message.attachmentLabels?.filter(Boolean).slice(0, 8),
      content: message.content.trim().slice(0, maximumMessageCharacters)
    }))
    .filter((message) => message.content && !isGenericFailure(message.content));

  const last = messages.at(-1);
  if (last?.role === "user" && last.content === prompt) messages = messages.slice(0, -1);
  if (input.intent.requestedMessageCount) messages = messages.slice(-input.intent.requestedMessageCount);
  return messages;
}

function chunkMessages(messages: ConversationHistoryMessage[]) {
  const chunks: ConversationHistoryMessage[][] = [];
  let current: ConversationHistoryMessage[] = [];
  let currentCharacters = 0;
  for (const message of messages) {
    const size = message.content.length + (message.attachmentLabels?.join(" ").length ?? 0) + 32;
    if (current.length && (current.length >= chunkMessageLimit || currentCharacters + size > chunkCharacterLimit)) {
      chunks.push(current);
      current = [];
      currentCharacters = 0;
    }
    current.push(message);
    currentCharacters += size;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

function formatTurn(message: ConversationHistoryMessage, index: number) {
  const attachments = message.attachmentLabels?.length
    ? ` [Attachments: ${message.attachmentLabels.join(", ")}]`
    : "";
  return `${index + 1}. ${message.role === "user" ? "User" : "Hassali"}: ${compact(message.content, 700)}${attachments}`;
}

function unique(items: string[], maximum: number) {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const item of items) {
    const key = item.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(item);
    if (output.length >= maximum) break;
  }
  return output;
}

function chunkDigest(chunk: ConversationHistoryMessage[], chunkIndex: number) {
  const userTurns = chunk.filter((message) => message.role === "user");
  const assistantTurns = chunk.filter((message) => message.role === "assistant");
  const corrections = userTurns.filter((message) => /\b(?:wrong|incorrect|instead|correction|change(?:d)?|replace|do not|don't|use .+ not|no longer)\b/i.test(message.content));
  const completions = assistantTurns.filter((message) => /\b(?:completed|fixed|implemented|passed|created|updated|committed|ready)\b/i.test(message.content));
  return [
    `Chunk ${chunkIndex + 1}:`,
    ...unique(userTurns.map((message) => `- User topic/request: ${compact(message.content)}`), 6),
    ...unique(corrections.map((message) => `- Correction/current direction: ${compact(message.content)}`), 3),
    ...unique(completions.map((message) => `- Reported outcome: ${compact(message.content)}`), 3)
  ].join("\n");
}

function deterministicSummary(input: {
  intent: ConversationHistoryIntent;
  messages: ConversationHistoryMessage[];
  transcript: ConversationTranscript;
}) {
  if (!input.messages.length) {
    return input.transcript.authoritative
      ? "I could not find any earlier visible messages in this conversation to summarize."
      : "I could not load an authoritative conversation transcript for this request.";
  }

  const userTurns = input.messages.filter((message) => message.role === "user");
  const assistantTurns = input.messages.filter((message) => message.role === "assistant");
  const correctionTurns = userTurns.filter((message) => /\b(?:wrong|incorrect|instead|correction|change(?:d)?|replace|do not|don't|use .+ not|no longer)\b/i.test(message.content));
  const completedTurns = assistantTurns.filter((message) => /\b(?:completed|fixed|implemented|passed|created|updated|committed|ready)\b/i.test(message.content));
  const questions = userTurns.filter((message) => /\?|\b(?:next|remaining|todo|still need|open item)\b/i.test(message.content));
  const topicLimit = input.intent.format === "chronological" ? 12 : 8;
  const topics = unique(userTurns.map((message) => compact(message.content)), topicLimit);
  const latestDirection = userTurns.at(-1)?.content;
  const attachmentLabels = unique(input.messages.flatMap((message) => message.attachmentLabels ?? []), 8);
  const sections: string[] = ["Conversation summary"];

  if (input.intent.format === "chronological") {
    sections.push("Main chronology", ...topics.map((topic, index) => `${index + 1}. ${topic}`));
  } else {
    sections.push("Main topics", ...topics.map((topic) => `- ${topic}`));
  }
  if (correctionTurns.length) {
    sections.push(
      "Important corrections / current decisions",
      ...unique(correctionTurns.slice().reverse().map((message) => `- ${compact(message.content)}`), 6)
    );
  }
  if (completedTurns.length) {
    sections.push("What was completed or reported", ...unique(completedTurns.slice(-6).map((message) => `- ${compact(message.content)}`), 6));
  }
  if (attachmentLabels.length) sections.push("Referenced attachments", ...attachmentLabels.map((label) => `- ${label}`));
  if (latestDirection) sections.push("Current state", `- Latest user direction: ${compact(latestDirection)}`);
  if (questions.length) sections.push("Open items / next steps", ...unique(questions.slice(-5).map((message) => `- ${compact(message.content)}`), 5));
  if (input.transcript.truncated) {
    sections.push("Coverage note", "- The conversation exceeded the bounded transcript limit, so this summary uses the safely available transcript rather than claiming complete coverage.");
  }
  return sections.join("\n\n");
}

export function prepareConversationSummary(input: {
  artifactTargetAvailable?: boolean;
  prompt: string;
  transcript: ConversationTranscript;
}): PreparedConversationSummary | null {
  const intent = classifyConversationHistoryIntent(input.prompt, {
    artifactTargetAvailable: input.artifactTargetAvailable,
    hasConversationContext: input.transcript.messages.some((message) => message.role !== "system" && message.content.trim() !== input.prompt.trim())
  });
  if (!intent) return null;
  const messages = visibleConversationMessages({ ...input, intent }).map((message) => ({
    ...message,
    content: redactWorkspaceSecrets(message.content).redacted
  }));
  const chunks = chunkMessages(messages);
  const deterministic = deterministicSummary({ intent, messages, transcript: input.transcript });
  const modelContext = messages.length === 0
    ? "No earlier visible conversation turns were available."
    : chunks.length === 1
      ? chunks[0]!.map(formatTurn).join("\n")
      : chunks.map(chunkDigest).join("\n\n");
  return {
    chunkCount: chunks.length,
    deterministicSummary: deterministic,
    intent,
    messageCount: messages.length,
    modelContext,
    source: input.transcript.source,
    transcriptTruncated: input.transcript.truncated
  };
}
