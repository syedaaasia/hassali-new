import type { CodeAmbiguity } from "@/lib/server/ai/adaptive-code-planner";
import type { ProjectMemoryRecord, ProjectMemoryStore } from "@/lib/server/project-memory/project-memory";
import type { UserMemoryRecord, UserMemoryStore } from "@/lib/server/user-memory/user-memory";
import { containsForbiddenMemorySecret, normalizeMemoryText } from "@/lib/server/user-memory/user-memory";

export type TemporalMemoryStatus =
  | "ambiguous"
  | "current"
  | "future-planned"
  | "historical"
  | "superseded"
  | "time-bounded"
  | "unknown"
  | "unresolved";

export type TemporalQueryIntent =
  | "after-event"
  | "before-event"
  | "change-history"
  | "current-state"
  | "date-range"
  | "first-known"
  | "historical-state"
  | "latest-known"
  | "point-in-time"
  | "previous-known"
  | "timeline";

export type MemoryQueryScope =
  | "combined-bounded"
  | "conversation"
  | "current-project"
  | "current-user"
  | "hassali-self"
  | "person"
  | "runtime-current";

export type MemoryAssertionType =
  | "decision"
  | "fact"
  | "goal"
  | "observation"
  | "plan"
  | "possibility"
  | "preference"
  | "requirement"
  | "verified-outcome";

export type MemorySourceType =
  | "canonical-self"
  | "conversation-summary"
  | "original-user-message"
  | "project-memory"
  | "project-note"
  | "runtime-evidence"
  | "verified-project-outcome";

export type TemporalMemoryQuery = {
  anchorEnd: Date | null;
  anchorStart: Date | null;
  intent: TemporalQueryIntent;
  raw: string;
  referenceEvent: string | null;
  scope: MemoryQueryScope;
  subject: string;
};

export type TemporalMemoryCandidate = {
  assertionType: MemoryAssertionType;
  authority: number;
  confidence: number;
  effectiveFrom: Date | null;
  effectiveUntil: Date | null;
  explicitCorrection: boolean;
  id: string;
  projectId: string | null;
  sensitivity: "sensitive" | "standard";
  sourceId: string | null;
  sourceTimestamp: Date;
  sourceType: MemorySourceType;
  status: TemporalMemoryStatus;
  subject: string;
  value: string;
};

export type MemoryConflictKind =
  | "ambiguous-entity"
  | "direct-contradiction"
  | "explicit-correction"
  | "overlapping-validity"
  | "project-note-disagreement"
  | "runtime-documentation-disagreement"
  | "source-disagreement"
  | "stale-summary"
  | "temporal-change"
  | "uncertain-interpretation";

export type MemoryConflict = {
  candidates: TemporalMemoryCandidate[];
  kind: MemoryConflictKind;
  rationale: string;
  resolution: "resolved" | "unresolved";
  subject: string;
  winner: TemporalMemoryCandidate | null;
};

export type MemoryResolution = {
  candidates: TemporalMemoryCandidate[];
  conflict: MemoryConflict | null;
  rationale: string;
  selected: TemporalMemoryCandidate[];
  status: "ambiguous" | "insufficient-evidence" | "likely" | "resolved" | "unresolved";
};

export type MemoryTimelineEntry = {
  effectiveTime: Date | null;
  from: string | null;
  source: MemorySourceType;
  sourceTime: Date;
  status: TemporalMemoryStatus;
  subject: string;
  to: string;
};

export type MemoryTimeline = {
  entries: MemoryTimelineEntry[];
  materialChanges: number;
  subject: string;
};

export type MemoryRetrievalPlan = {
  includeOriginalMessages: boolean;
  limit: number;
  query: TemporalMemoryQuery;
  sources: Array<"project-memory" | "project-notes" | "self-knowledge" | "user-memory">;
};

const monthNames = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const temporalWords = new Set([
  "about", "after", "at", "before", "between", "build", "changed", "changes", "choose", "chosen", "configure", "conflict", "conflicting", "current", "currently",
  "did", "do", "earlier", "first", "had", "have", "history", "implement", "is", "known", "last", "latest", "later", "memory", "memories", "migrate", "migration",
  "month", "newer", "now", "our", "previous", "previously", "recent", "recently", "since", "source", "state",
  "synthetic", "that", "the", "then", "this", "timeline", "today", "until", "use", "using", "was", "we", "were", "what", "when", "which", "year", "you"
]);

function boundedDate(year: number, month: number, day: number, end = false) {
  return new Date(Date.UTC(year, month, day, end ? 23 : 0, end ? 59 : 0, end ? 59 : 0, end ? 999 : 0));
}

function periodForRelative(text: string, now: Date): { end: Date; start: Date } | null {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const day = now.getUTCDate();
  if (/\byesterday\b/i.test(text)) {
    const date = new Date(Date.UTC(year, month, day - 1));
    return { start: boundedDate(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()), end: boundedDate(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), true) };
  }
  if (/\btoday\b/i.test(text)) return { start: boundedDate(year, month, day), end: boundedDate(year, month, day, true) };
  if (/\blast week\b/i.test(text)) {
    const weekday = (now.getUTCDay() + 6) % 7;
    const start = new Date(Date.UTC(year, month, day - weekday - 7));
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + 6, 23, 59, 59, 999));
    return { start, end };
  }
  if (/\bthis week\b/i.test(text)) {
    const weekday = (now.getUTCDay() + 6) % 7;
    return { start: new Date(Date.UTC(year, month, day - weekday)), end: now };
  }
  if (/\blast month\b/i.test(text)) return { start: boundedDate(year, month - 1, 1), end: boundedDate(year, month, 0, true) };
  if (/\bthis month\b/i.test(text)) return { start: boundedDate(year, month, 1), end: now };
  if (/\blast year\b/i.test(text)) return { start: boundedDate(year - 1, 0, 1), end: boundedDate(year - 1, 11, 31, true) };
  if (/\bthis year\b/i.test(text)) return { start: boundedDate(year, 0, 1), end: now };
  return null;
}

function explicitDatePeriod(text: string, now: Date): { end: Date; start: Date } | null {
  const iso = text.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]) - 1;
    const day = Number(iso[3]);
    return { start: boundedDate(year, month, day), end: boundedDate(year, month, day, true) };
  }
  const monthPattern = new RegExp(`\\b(${monthNames.join("|")})(?:\\s+(20\\d{2}))?\\b`, "i");
  const named = text.match(monthPattern);
  if (named) {
    const month = monthNames.indexOf((named[1] ?? "").toLowerCase());
    const year = Number(named[2] ?? now.getUTCFullYear());
    return { start: boundedDate(year, month, 1), end: boundedDate(year, month + 1, 0, true) };
  }
  const year = text.match(/\b(20\d{2})\b/);
  return year ? { start: boundedDate(Number(year[1]), 0, 1), end: boundedDate(Number(year[1]), 11, 31, true) } : null;
}

function dateRange(text: string, now: Date): { end: Date; start: Date } | null {
  const between = text.match(/\bbetween\s+([a-z]+(?:\s+20\d{2})?|20\d{2}-\d{1,2}-\d{1,2})\s+and\s+([a-z]+(?:\s+20\d{2})?|20\d{2}-\d{1,2}-\d{1,2})\b/i);
  if (!between) return null;
  const left = explicitDatePeriod(between[1] ?? "", now);
  const right = explicitDatePeriod(between[2] ?? "", now);
  return left && right ? { start: left.start, end: right.end } : null;
}

function querySubject(prompt: string) {
  const tokens = normalizeMemoryText(prompt).split(" ").filter((token) => token.length > 1 && !/^20\d{2}$/.test(token) && !temporalWords.has(token) && !monthNames.includes(token));
  return tokens.slice(0, 12).join(" ");
}

export function parseTemporalMemoryQuery(prompt: string, now = new Date()): TemporalMemoryQuery {
  const range = dateRange(prompt, now) ?? periodForRelative(prompt, now) ?? explicitDatePeriod(prompt, now);
  const reference = prompt.match(/\b(?:before|after|since|until)\s+(.+?)(?:[?.!]|$)/i)?.[1]?.trim() ?? null;
  let intent: TemporalQueryIntent = "current-state";
  if (/\bbetween\b/i.test(prompt) && range) intent = "date-range";
  else if (/\b(?:timeline|history|how .* change|what changed|when did .* change|which source is newer)\b/i.test(prompt)) intent = /timeline/i.test(prompt) ? "timeline" : "change-history";
  else if (/\bfirst\b/i.test(prompt)) intent = "first-known";
  else if (/\b(?:previous|before the latest|last time|previously|prefer before)\b/i.test(prompt)) intent = "previous-known";
  else if (/\blatest\b/i.test(prompt)) intent = "latest-known";
  else if (/\bbefore\b/i.test(prompt) && !range) intent = "before-event";
  else if (/\bafter\b/i.test(prompt) && !range) intent = "after-event";
  else if (range) intent = "point-in-time";
  else if (/\b(?:historical|earlier|at that time|used to)\b/i.test(prompt)) intent = "historical-state";

  const project = /\b(?:project|we|our|decision|code name|architecture|requirement|checkpoint)\b/i.test(prompt);
  const personal = /\b(?:i|me|my|mine|person|prefer|preference|live|city|goal)\b/i.test(prompt);
  const scope: MemoryQueryScope = /\bHassali\b/i.test(prompt)
    ? "hassali-self"
    : /\b(?:runtime|available now|installed now)\b/i.test(prompt)
      ? "runtime-current"
      : /\b(?:who is|what did)\s+[A-Z][\p{L}'-]+/u.test(prompt)
        ? "person"
      : project && personal
        ? "combined-bounded"
        : project
          ? "current-project"
          : "current-user";
  return { anchorEnd: range?.end ?? null, anchorStart: range?.start ?? null, intent, raw: prompt, referenceEvent: reference, scope, subject: querySubject(prompt) };
}

export function isTemporalMemoryQuery(prompt: string) {
  const asks = /^(?:do|did|how|is|was|were|what|when|which|show|tell|remind|have)\b/i.test(prompt.trim());
  return asks && /\b(?:after|before|change|changed|conflict|conflicting|current|currently|earlier|first|history|last time|latest|newer|now|previous|previously|recently|timeline|at that time|this (?:week|month|year)|last (?:week|month|year)|today|yesterday)\b/i.test(prompt);
}

export function planMemoryRetrieval(query: TemporalMemoryQuery): MemoryRetrievalPlan {
  const sources: MemoryRetrievalPlan["sources"] = [];
  if (["current-user", "person", "combined-bounded"].includes(query.scope)) sources.push("user-memory");
  if (["current-project", "conversation", "combined-bounded"].includes(query.scope)) sources.push("project-memory", "project-notes");
  if (query.scope === "hassali-self" || query.scope === "runtime-current") sources.push("self-knowledge");
  return {
    includeOriginalMessages: /\b(?:exactly|source|message|quote|newer)\b/i.test(query.raw),
    limit: query.intent === "timeline" || query.intent === "change-history" || query.intent === "date-range" ? 40 : 20,
    query,
    sources
  };
}

function assertionForUser(record: UserMemoryRecord): MemoryAssertionType {
  if (record.category === "preference") return "preference";
  if (record.category === "goal") return "goal";
  if (record.category === "instruction") return "requirement";
  return "fact";
}

function assertionForProject(record: ProjectMemoryRecord): MemoryAssertionType {
  if (/\b(?:maybe|might|may|could|consider|possibly)\b/i.test(record.content)) return "possibility";
  if (record.category === "decision") return "decision";
  if (record.category === "next_step") return "plan";
  if (record.category === "requirement" || record.category === "constraint") return "requirement";
  if (record.category === "checkpoint" || record.category === "milestone" || record.category === "implementation") return "observation";
  if (record.category === "preference") return "preference";
  return "fact";
}

function candidateStatus(status: "active" | "resolved" | "superseded", assertionType: MemoryAssertionType): TemporalMemoryStatus {
  if (assertionType === "plan" || assertionType === "possibility" || assertionType === "goal") return "future-planned";
  if (status === "active") return "current";
  if (status === "superseded") return "superseded";
  return "historical";
}

export function userRecordToTemporal(record: UserMemoryRecord): TemporalMemoryCandidate {
  const assertionType = assertionForUser(record);
  return {
    assertionType,
    authority: record.captureMethod === "explicit" ? 90 : 78,
    confidence: record.confidence,
    effectiveFrom: record.createdAt,
    effectiveUntil: record.status === "superseded" ? record.updatedAt : null,
    explicitCorrection: record.captureMethod === "explicit" && record.status === "active",
    id: record.id,
    projectId: null,
    sensitivity: record.sensitivity,
    sourceId: record.sourceMessageId,
    sourceTimestamp: record.createdAt,
    sourceType: "original-user-message",
    status: candidateStatus(record.status, assertionType),
    subject: record.person ? `${record.normalizedKey} ${record.person.normalizedName}` : record.normalizedKey,
    value: record.value
  };
}

export function projectRecordToTemporal(record: ProjectMemoryRecord): TemporalMemoryCandidate {
  const assertionType = assertionForProject(record);
  return {
    assertionType,
    authority: record.category === "checkpoint" || record.category === "implementation" ? 82 : 74,
    confidence: record.confidence,
    effectiveFrom: record.effectiveFrom,
    effectiveUntil: record.status === "superseded" ? record.updatedAt : null,
    explicitCorrection: record.status === "active" && /\b(?:actually|changed|correction|from now on|instead|now|outdated|update)\b/i.test(record.content),
    id: record.id,
    projectId: record.projectId,
    sensitivity: "standard",
    sourceId: record.sourceMessageId,
    sourceTimestamp: record.createdAt,
    sourceType: "project-memory",
    status: candidateStatus(record.status, assertionType),
    subject: record.normalizedKey,
    value: record.content
  };
}

function noteCandidates(projectNotes: string, now: Date, projectId: string | null): TemporalMemoryCandidate[] {
  if (!projectNotes.trim() || containsForbiddenMemorySecret(projectNotes)) return [];
  const candidates: TemporalMemoryCandidate[] = [];
  projectNotes.split(/\r?\n/).forEach((line, index) => {
    const cleaned = line.replace(/^[-*#\s]+/, "").trim();
    const pair = cleaned.match(/^(.{2,80}?)(?:\s+is|\s*=|:)\s*(.{1,300})$/i);
    if (!pair) return;
    const value = pair[2]?.trim() ?? "";
    const assertionType: MemoryAssertionType = /\b(?:maybe|might|may|could|consider|possibly|plan to)\b/i.test(value) ? "possibility" : "decision";
    candidates.push({
      assertionType,
      authority: 82,
      confidence: 0.95,
      effectiveFrom: now,
      effectiveUntil: null,
      explicitCorrection: /\b(?:current|now|instead|correction|decision)\b/i.test(cleaned),
      id: `project-note-${index}`,
      projectId,
      sensitivity: "standard" as const,
      sourceId: null,
      sourceTimestamp: now,
      sourceType: "project-note" as const,
      status: assertionType === "possibility" ? "future-planned" as const : "current" as const,
      subject: normalizeMemoryText(pair[1] ?? "project note"),
      value
    });
  });
  return candidates;
}

function sameValue(left: TemporalMemoryCandidate, right: TemporalMemoryCandidate) {
  return normalizeMemoryText(left.value) === normalizeMemoryText(right.value);
}

function canonicalSubject(subject: string) {
  const ignored = new Set(["constraint", "current", "decision", "fact", "preference", "project", "requirement", "synthetic", "saved", "recorded"]);
  const tokens = normalizeMemoryText(subject).split(" ").filter((token) => token.length > 2 && !ignored.has(token));
  return tokens.join(" ") || normalizeMemoryText(subject);
}

function chronological(candidates: TemporalMemoryCandidate[]) {
  return [...candidates].sort((left, right) => (left.effectiveFrom ?? left.sourceTimestamp).getTime() - (right.effectiveFrom ?? right.sourceTimestamp).getTime() || left.id.localeCompare(right.id));
}

function relevantCandidates(query: TemporalMemoryQuery, candidates: TemporalMemoryCandidate[]) {
  const terms = query.subject.split(" ").filter((term) => term.length > 2 && !["prefer", "preference", "project", "decision", "changed"].includes(term));
  const assertionHint = /\bprefer/i.test(query.raw) ? "preference" : /\bgoal/i.test(query.raw) ? "goal" : null;
  const nonSensitiveBroad = terms.length === 0;
  const scored = candidates.filter((candidate) => !(nonSensitiveBroad && candidate.sensitivity === "sensitive")).map((candidate) => {
    const haystack = normalizeMemoryText(`${candidate.subject} ${candidate.value}`);
    const lexicalMatches = terms.reduce((count, term) => count + (haystack.includes(term) ? 1 : 0), 0);
    const lexical = lexicalMatches * 2;
    const type = assertionHint === candidate.assertionType ? 3 : 0;
    const project = query.scope === "current-project" && candidate.projectId ? 2 : 0;
    return { candidate, lexicalMatches, score: lexical + type + project };
  });
  const matching = scored.filter((item) => item.score > 0);
  const maximumLexicalMatches = Math.max(0, ...matching.map((item) => item.lexicalMatches));
  const minimumQueryMatches = Math.min(2, terms.length);
  const minimumCoreMatches = Math.max(minimumQueryMatches, maximumLexicalMatches - 1);
  const strongest = matching.filter((item) => item.lexicalMatches >= minimumCoreMatches);
  return (strongest.length ? strongest : terms.length === 0 ? scored : []).sort((left, right) => right.score - left.score || right.candidate.sourceTimestamp.getTime() - left.candidate.sourceTimestamp.getTime()).map((item) => item.candidate);
}

function pointInTimeCandidates(query: TemporalMemoryQuery, candidates: TemporalMemoryCandidate[]) {
  if (!query.anchorEnd) return candidates;
  return candidates.filter((candidate) => {
    const from = candidate.effectiveFrom ?? candidate.sourceTimestamp;
    if (from > query.anchorEnd!) return false;
    return !candidate.effectiveUntil || candidate.effectiveUntil >= (query.anchorStart ?? query.anchorEnd!);
  });
}

function conflictKind(candidates: TemporalMemoryCandidate[]): MemoryConflictKind {
  if (candidates.some((candidate) => candidate.sourceType === "project-note") && candidates.some((candidate) => candidate.sourceType !== "project-note")) return "project-note-disagreement";
  if (candidates.some((candidate) => candidate.sourceType === "runtime-evidence")) return "runtime-documentation-disagreement";
  if (candidates.some((candidate) => candidate.sourceType === "conversation-summary")) return "stale-summary";
  return candidates.some((candidate) => candidate.explicitCorrection) ? "explicit-correction" : "direct-contradiction";
}

export function resolveMemoryTruth(query: TemporalMemoryQuery, input: TemporalMemoryCandidate[]): MemoryResolution {
  const candidates = chronological(relevantCandidates(query, input));
  if (!candidates.length) return { candidates: [], conflict: null, rationale: "No relevant owned memory evidence was found.", selected: [], status: "insufficient-evidence" };
  const bounded = pointInTimeCandidates(query, candidates);
  if (!bounded.length) return { candidates, conflict: null, rationale: "No evidence was effective in the requested period.", selected: [], status: "insufficient-evidence" };

  if (["timeline", "change-history", "date-range"].includes(query.intent)) {
    return { candidates: bounded, conflict: null, rationale: "Material values are ordered by effective time, then source time.", selected: bounded, status: "resolved" };
  }
  if (query.intent === "first-known") return { candidates, conflict: null, rationale: "Selected the earliest known material value.", selected: [bounded[0]!], status: "resolved" };
  if (query.intent === "previous-known" || query.intent === "historical-state" || query.intent === "before-event") {
    const material = bounded.filter((candidate, index) => index === 0 || !sameValue(candidate, bounded[index - 1]!));
    const selected = material.length > 1 ? material.at(-2)! : material[0]!;
    return { candidates, conflict: null, rationale: "Selected the material value immediately before the latest known value.", selected: [selected], status: "resolved" };
  }
  if (query.intent === "after-event") return { candidates, conflict: null, rationale: "Selected the latest value established after the referenced event.", selected: [bounded.at(-1)!], status: "resolved" };

  const current = bounded.filter((candidate) => candidate.status === "current" && !["goal", "plan", "possibility"].includes(candidate.assertionType));
  const pool = current.length ? current : bounded.filter((candidate) => !["goal", "plan", "possibility"].includes(candidate.assertionType));
  if (!pool.length) return { candidates, conflict: null, rationale: "Only plans or possibilities were found; none establishes a current fact.", selected: [], status: "insufficient-evidence" };
  const bySubject = new Map<string, TemporalMemoryCandidate[]>();
  for (const candidate of pool) {
    const subject = canonicalSubject(candidate.subject);
    bySubject.set(subject, [...(bySubject.get(subject) ?? []), candidate]);
  }
  const distinctBySubject = [...bySubject.values()].map((group) => group.filter((candidate, index) => group.findIndex((other) => sameValue(candidate, other)) === index));
  const conflictingGroup = distinctBySubject.find((group) => group.length > 1);
  if (!conflictingGroup) {
    const selected = distinctBySubject.map((group) => group.at(-1)!).slice(0, 8);
    return { candidates, conflict: null, rationale: "Compatible current values remain after subject and temporal filtering.", selected, status: "resolved" };
  }
  const distinct = conflictingGroup;

  const ranked = [...distinct].sort((left, right) => right.authority - left.authority || right.sourceTimestamp.getTime() - left.sourceTimestamp.getTime());
  const winner = ranked[0]!;
  const runnerUp = ranked[1]!;
  const correctionWins = winner.explicitCorrection && winner.sourceTimestamp > runnerUp.sourceTimestamp;
  const authorityWins = winner.authority - runnerUp.authority >= 15;
  const resolved = correctionWins || authorityWins;
  const conflict: MemoryConflict = {
    candidates: ranked.slice(0, 6),
    kind: resolved && candidates.some((candidate) => candidate.status === "superseded") ? "temporal-change" : conflictKind(ranked),
    rationale: resolved
      ? correctionWins ? "A later explicit correction outranks the earlier current claim." : "The higher-authority source controls this question type."
      : "Current material claims overlap without a decisive correction or authority difference.",
    resolution: resolved ? "resolved" : "unresolved",
    subject: winner.subject,
    winner: resolved ? winner : null
  };
  return { candidates, conflict, rationale: conflict.rationale, selected: resolved ? [winner] : [], status: resolved ? "resolved" : "unresolved" };
}

export function buildMemoryTimeline(query: TemporalMemoryQuery, input: TemporalMemoryCandidate[]): MemoryTimeline {
  const candidates = chronological(pointInTimeCandidates(query, relevantCandidates(query, input)));
  const material = candidates.filter((candidate, index) => index === 0 || !sameValue(candidate, candidates[index - 1]!));
  return {
    entries: material.slice(-20).map((candidate, index) => ({
      effectiveTime: candidate.effectiveFrom,
      from: index > 0 ? material[index - 1]!.value : null,
      source: candidate.sourceType,
      sourceTime: candidate.sourceTimestamp,
      status: candidate.status,
      subject: candidate.subject,
      to: candidate.value
    })),
    materialChanges: Math.max(0, material.length - 1),
    subject: material.at(-1)?.subject ?? query.subject
  };
}

function formatDate(date: Date | null) {
  return date ? date.toISOString().slice(0, 10) : "date unknown";
}

function safeValue(value: string) {
  return value.replace(/[\r\n]+/g, " ").trim().slice(0, 360);
}

export function formatTemporalMemoryAnswer(query: TemporalMemoryQuery, resolution: MemoryResolution) {
  if (resolution.status === "insufficient-evidence") return "I don't have enough relevant memory evidence to answer that temporal question.";
  if (resolution.status === "unresolved" && resolution.conflict) {
    return `I found conflicting current memories about ${resolution.conflict.subject}: ${resolution.conflict.candidates.slice(0, 3).map((candidate) => `${safeValue(candidate.value)} (${candidate.sourceType})`).join("; ")}. I do not have a clear correction that resolves which is current.`;
  }
  if (["timeline", "change-history", "date-range"].includes(query.intent)) {
    const timeline = buildMemoryTimeline(query, resolution.candidates);
    if (!timeline.entries.length) return "I don't have a material change recorded for that period.";
    const lines = timeline.entries.map((entry) => `- ${formatDate(entry.effectiveTime ?? entry.sourceTime)}: ${entry.from ? `${safeValue(entry.from)} -> ` : ""}${safeValue(entry.to)} [${entry.source}]`);
    return `I found ${timeline.materialChanges} material ${timeline.materialChanges === 1 ? "change" : "changes"}:\n${lines.join("\n")}`;
  }
  const selected = resolution.selected[0];
  if (!selected) return "I don't have enough evidence to select one value.";
  const current = chronological(resolution.candidates).filter((candidate) => candidate.status === "current").at(-1);
  if (["previous-known", "historical-state", "before-event", "point-in-time"].includes(query.intent)) {
    const later = current && current.id !== selected.id ? ` It was later changed to ${safeValue(current.value)}.` : "";
    return `At that time, the recorded value was ${safeValue(selected.value)} (source recorded ${formatDate(selected.sourceTimestamp)}).${later}`;
  }
  if (resolution.selected.length > 1) {
    return `Current recorded values:\n${resolution.selected.map((candidate) => `- ${candidate.subject}: ${safeValue(candidate.value)} [${candidate.sourceType}]`).join("\n")}`;
  }
  return `Currently, the recorded value is ${safeValue(selected.value)} (from ${selected.sourceType}, recorded ${formatDate(selected.sourceTimestamp)}).`;
}

export async function handleAskTemporalMemory(input: {
  now?: Date;
  projectId: string | null;
  projectNotes?: string;
  projectStore?: ProjectMemoryStore | null;
  prompt: string;
  userStore?: UserMemoryStore | null;
}): Promise<{ answer: string; plan: MemoryRetrievalPlan; resolution: MemoryResolution } | null> {
  if (!isTemporalMemoryQuery(input.prompt)) return null;
  const now = input.now ?? new Date();
  const query = parseTemporalMemoryQuery(input.prompt, now);
  const plan = planMemoryRetrieval(query);
  if (query.scope === "hassali-self" || query.scope === "runtime-current") return null;
  if (plan.includeOriginalMessages && input.projectStore) return null;
  const candidates: TemporalMemoryCandidate[] = [];
  if (plan.sources.includes("user-memory") && input.userStore) {
    const records = input.userStore.listHistory ? await input.userStore.listHistory(plan.limit) : await input.userStore.list(plan.limit);
    candidates.push(...records.map(userRecordToTemporal));
  }
  if (plan.sources.includes("project-memory") && input.projectStore) {
    const records = await input.projectStore.listRecords({ includeSuperseded: true, limit: Math.min(40, plan.limit) });
    candidates.push(...records.map(projectRecordToTemporal));
  }
  if (plan.sources.includes("project-notes")) candidates.push(...noteCandidates(input.projectNotes ?? "", now, input.projectId));
  const resolution = resolveMemoryTruth(query, candidates);
  return { answer: formatTemporalMemoryAnswer(query, resolution), plan, resolution };
}

export function findBlockingMemoryAmbiguities(candidates: TemporalMemoryCandidate[], prompt: string): CodeAmbiguity[] {
  const query = parseTemporalMemoryQuery(`What is the current project decision about ${prompt}?`);
  const relevant = relevantCandidates(query, candidates).filter((candidate) => candidate.projectId && ["decision", "fact", "requirement"].includes(candidate.assertionType));
  const groups = new Map<string, TemporalMemoryCandidate[]>();
  for (const candidate of relevant) {
    const subject = canonicalSubject(candidate.subject);
    groups.set(subject, [...(groups.get(subject) ?? []), candidate]);
  }
  return [...groups.entries()].flatMap(([subject, group]) => {
    const resolution = resolveMemoryTruth({ ...query, subject }, group);
    if (resolution.status !== "unresolved" || !resolution.conflict) return [];
    const values = resolution.conflict.candidates.slice(0, 3).map((candidate) => safeValue(candidate.value));
    return [{
      blocking: true,
      question: `I found conflicting current project memory for ${subject}: ${values.join(" / ")}. Which value is current?`,
      reason: `Unresolved material project-memory conflict: ${resolution.conflict.kind}.`,
      safeDefault: null
    }];
  }).slice(0, 3);
}

export async function buildProjectPlanningMemoryAmbiguities(input: {
  now?: Date;
  projectNotes?: string;
  prompt: string;
  store: ProjectMemoryStore;
}): Promise<CodeAmbiguity[]> {
  if (!/\b(?:architecture|build|change|code|configure|database|implement|migrate|project|refactor|repair|use)\b/i.test(input.prompt)) return [];
  const records = await input.store.listRecords({ includeSuperseded: false, limit: 30 });
  const projectId = records[0]?.projectId ?? null;
  const candidates = [
    ...records.map(projectRecordToTemporal),
    ...noteCandidates(input.projectNotes ?? "", input.now ?? new Date(), projectId)
  ];
  return findBlockingMemoryAmbiguities(candidates, input.prompt);
}
