import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { InMemoryProjectMemoryStore, isProjectMemoryQuery } from "../../project-memory/project-memory";
import { InMemoryUserMemoryStore, type UserMemoryCandidate } from "../../user-memory/user-memory";
import {
  buildMemoryTimeline,
  buildProjectPlanningMemoryAmbiguities,
  findBlockingMemoryAmbiguities,
  handleAskTemporalMemory,
  parseTemporalMemoryQuery,
  planMemoryRetrieval,
  resolveMemoryTruth,
  type TemporalMemoryCandidate
} from "../temporal-memory";

const july = new Date("2026-07-01T12:00:00.000Z");
const august = new Date("2026-08-01T12:00:00.000Z");

function candidate(input: Partial<TemporalMemoryCandidate> & Pick<TemporalMemoryCandidate, "id" | "subject" | "value">): TemporalMemoryCandidate {
  return {
    assertionType: "fact",
    authority: 80,
    confidence: 0.95,
    effectiveFrom: july,
    effectiveUntil: null,
    explicitCorrection: false,
    projectId: null,
    sensitivity: "standard",
    sourceId: input.id,
    sourceTimestamp: input.effectiveFrom ?? july,
    sourceType: "original-user-message",
    status: "current",
    ...input
  };
}

function preference(value: string): UserMemoryCandidate {
  return {
    captureMethod: "explicit",
    category: "preference",
    confidence: 0.99,
    key: "workspace density",
    normalizedKey: "workspace density",
    sensitivity: "standard",
    sourceType: "user_message",
    value
  };
}

test("TEMPORAL-01 parses current, previous, range, and relative temporal intents deterministically", () => {
  const now = new Date("2026-08-11T10:00:00.000Z");
  assert.equal(parseTemporalMemoryQuery("What do I prefer now?", now).intent, "current-state");
  assert.equal(parseTemporalMemoryQuery("What did I prefer before?", now).intent, "previous-known");
  assert.equal(parseTemporalMemoryQuery("What changed between June and August?", now).intent, "date-range");
  const yesterday = parseTemporalMemoryQuery("What changed yesterday?", now);
  assert.equal(yesterday.anchorStart?.toISOString().slice(0, 10), "2026-08-10");
  assert.equal(yesterday.anchorEnd?.toISOString().slice(0, 10), "2026-08-10");
});

test("TEMPORAL-02 source time and effective time remain distinct", () => {
  const moved = candidate({ effectiveFrom: new Date("2026-01-01T00:00:00.000Z"), id: "moved", sourceTimestamp: august, subject: "city", value: "Karachi" });
  assert.equal(moved.effectiveFrom?.toISOString().slice(0, 7), "2026-01");
  assert.equal(moved.sourceTimestamp.toISOString().slice(0, 7), "2026-08");
});

test("POINT-01 point-in-time retrieval never leaks later knowledge backward", () => {
  const sqlite = candidate({ effectiveFrom: july, effectiveUntil: new Date("2026-07-31T23:59:59.999Z"), id: "sqlite", status: "superseded", subject: "database", value: "SQLite" });
  const postgres = candidate({ effectiveFrom: august, explicitCorrection: true, id: "postgres", sourceTimestamp: august, subject: "database", value: "PostgreSQL" });
  const query = parseTemporalMemoryQuery("What database had we chosen in July 2026?", new Date("2026-08-11T00:00:00.000Z"));
  const result = resolveMemoryTruth(query, [sqlite, postgres]);
  assert.equal(result.selected[0]?.value, "SQLite");
  assert.doesNotMatch(result.selected[0]?.value ?? "", /PostgreSQL/);
});

test("CHANGE-01 normal correction is retained as resolved temporal history", () => {
  const compact = candidate({ effectiveUntil: august, id: "compact", status: "superseded", subject: "workspace density", value: "compact" });
  const spacious = candidate({ effectiveFrom: august, explicitCorrection: true, id: "spacious", sourceTimestamp: august, subject: "workspace density", value: "spacious" });
  const timeline = buildMemoryTimeline(parseTemporalMemoryQuery("How did my workspace density change?"), [compact, spacious]);
  assert.equal(timeline.materialChanges, 1);
  assert.equal(timeline.entries[0]?.to, "compact");
  assert.equal(timeline.entries[1]?.from, "compact");
  assert.equal(timeline.entries[1]?.to, "spacious");
});

test("ASSERTION-01 a plan or possibility does not replace a current fact", () => {
  const current = candidate({ id: "alpha", subject: "city", value: "Alpha" });
  const possible = candidate({ assertionType: "possibility", effectiveFrom: august, id: "beta", sourceTimestamp: august, status: "future-planned", subject: "city", value: "might move to Beta" });
  const result = resolveMemoryTruth(parseTemporalMemoryQuery("What is my current city?"), [current, possible]);
  assert.equal(result.selected[0]?.value, "Alpha");
  assert.equal(result.conflict, null);
});

test("CONFLICT-01 equal-authority overlapping current claims remain unresolved", () => {
  const left = candidate({ id: "left", subject: "database", value: "PostgreSQL" });
  const right = candidate({ id: "right", sourceTimestamp: august, subject: "database", value: "MySQL" });
  const result = resolveMemoryTruth(parseTemporalMemoryQuery("What is our current project database?"), [left, right]);
  assert.equal(result.status, "unresolved");
  assert.equal(result.conflict?.kind, "direct-contradiction");
  assert.equal(result.selected.length, 0);
});

test("CONFLICT-02 subject qualifiers do not hide a material Project Notes disagreement", () => {
  const memory = candidate({ authority: 74, id: "memory", projectId: "project-a", sourceType: "project-memory", subject: "decision code name", value: "Orion" });
  const note = candidate({ authority: 82, id: "note", projectId: "project-a", sourceTimestamp: august, sourceType: "project-note", subject: "m4 synthetic project code name", value: "Pegasus" });
  const result = resolveMemoryTruth(parseTemporalMemoryQuery("Do you have conflicting current memories about the M4 synthetic project code name?"), [memory, note]);
  assert.equal(result.status, "unresolved");
  assert.equal(result.conflict?.kind, "project-note-disagreement");
});

test("SOURCE-01 runtime truth outranks stale documentation for current capability", () => {
  const documentation = candidate({ authority: 55, id: "docs", sourceType: "conversation-summary", subject: "ffmpeg availability", value: "unavailable" });
  const runtime = candidate({ authority: 100, effectiveFrom: august, id: "runtime", sourceTimestamp: august, sourceType: "runtime-evidence", subject: "ffmpeg availability", value: "available" });
  const result = resolveMemoryTruth(parseTemporalMemoryQuery("Is FFmpeg available now?"), [documentation, runtime]);
  assert.equal(result.status, "resolved");
  assert.equal(result.selected[0]?.value, "available");
  assert.equal(result.conflict?.kind, "runtime-documentation-disagreement");
});

test("SUMMARY-01 original explicit evidence outranks a stale summary", () => {
  const summary = candidate({ authority: 45, id: "summary", sourceType: "conversation-summary", subject: "code name", value: "Falcon" });
  const original = candidate({ authority: 90, effectiveFrom: august, explicitCorrection: true, id: "original", sourceTimestamp: august, subject: "code name", value: "Orion" });
  const result = resolveMemoryTruth(parseTemporalMemoryQuery("What is our current code name?"), [summary, original]);
  assert.equal(result.selected[0]?.value, "Orion");
  assert.equal(result.conflict?.kind, "stale-summary");
});

test("RETRIEVAL-01 planner selects the narrowest relevant stores and remains bounded", () => {
  const personal = planMemoryRetrieval(parseTemporalMemoryQuery("What did I prefer before?"));
  const project = planMemoryRetrieval(parseTemporalMemoryQuery("What changed in this project last month?"));
  assert.deepEqual(personal.sources, ["user-memory"]);
  assert.deepEqual(project.sources, ["project-memory", "project-notes"]);
  assert(personal.limit <= 40);
  assert(project.limit <= 40);
});

test("RETRIEVAL-02 self-knowledge and exact-source questions defer to their authoritative M1/M3 handlers", async () => {
  const projectStore = new InMemoryProjectMemoryStore("project-a", "Project A");
  const self = await handleAskTemporalMemory({ projectId: "project-a", projectStore, prompt: "What could Hassali do before Run 4?" });
  const exactPrompt = "What exactly did I tell you before we changed this?";
  const exact = await handleAskTemporalMemory({ projectId: "project-a", projectStore, prompt: exactPrompt });
  assert.equal(self, null);
  assert.equal(exact, null);
  assert.equal(isProjectMemoryQuery(exactPrompt), true);
});

test("USER-01 current, previous, and change history use retained M2 rows", async () => {
  const store = new InMemoryUserMemoryStore();
  await store.save(preference("compact"), "message-1");
  await store.save(preference("spacious"), "message-2");
  const current = await handleAskTemporalMemory({ projectId: null, prompt: "What is my current workspace density?", userStore: store });
  const previous = await handleAskTemporalMemory({ projectId: null, prompt: "What was my previous workspace density?", userStore: store });
  const changed = await handleAskTemporalMemory({ projectId: null, prompt: "How did my workspace density change?", userStore: store });
  assert.match(current?.answer ?? "", /spacious/);
  assert.match(previous?.answer ?? "", /compact/);
  assert.match(changed?.answer ?? "", /compact -> spacious/);
});

test("FORGET-01 targeted forget removes current and historical retrieval surfaces", async () => {
  const store = new InMemoryUserMemoryStore();
  await store.save(preference("compact"), "message-1");
  await store.save(preference("spacious"), "message-2");
  await store.save({ ...preference("Alpha"), category: "fact", key: "M4 synthetic current city", normalizedKey: "m4 synthetic current city" }, "message-3");
  await store.forget({ mode: "key", target: "workspace density" });
  const history = await store.listHistory();
  const answer = await handleAskTemporalMemory({ projectId: null, prompt: "What was my previous workspace density?", userStore: store });
  assert.equal(history.filter((record) => /workspace density/i.test(record.normalizedKey)).length, 0);
  assert.match(answer?.answer ?? "", /don't have enough/i);
});

test("PROJECT-01 project code-name history resolves current, previous, and before", async () => {
  const store = new InMemoryProjectMemoryStore("project-orion", "Synthetic Orion");
  await store.saveRecord({ category: "decision", confidence: 0.99, content: "Falcon", importance: "high", normalizedKey: "code name", title: "Code name" }, "message-1", "chat-a");
  await store.saveRecord({ category: "decision", confidence: 0.99, content: "Orion", importance: "high", normalizedKey: "code name", title: "Code name" }, "message-2", "chat-a");
  const current = await handleAskTemporalMemory({ projectId: "project-orion", projectStore: store, prompt: "What is our current project code name?" });
  const previous = await handleAskTemporalMemory({ projectId: "project-orion", projectStore: store, prompt: "What was our previous project code name?" });
  const before = await handleAskTemporalMemory({ projectId: "project-orion", projectStore: store, prompt: "What was the code name before we changed it?" });
  assert.match(current?.answer ?? "", /Orion/);
  assert.match(previous?.answer ?? "", /Falcon/);
  assert.match(before?.answer ?? "", /Falcon/);
});

test("NOTES-01 unresolved Project Notes disagreement blocks planner assumptions", async () => {
  const store = new InMemoryProjectMemoryStore("project-a", "Project A");
  await store.saveRecord({ category: "decision", confidence: 0.95, content: "PostgreSQL", importance: "high", normalizedKey: "database", title: "Database" }, "message-1", "chat-a");
  const ambiguities = await buildProjectPlanningMemoryAmbiguities({ projectNotes: "database: MySQL", prompt: "Build the database migration", store });
  assert.equal(ambiguities.length, 1);
  assert.equal(ambiguities[0]?.blocking, true);
  assert.match(ambiguities[0]?.question ?? "", /PostgreSQL|MySQL/);
});

test("PLANNER-01 only same-subject material conflicts become blocking ambiguities", () => {
  const ambiguities = findBlockingMemoryAmbiguities([
    candidate({ id: "db-a", projectId: "project-a", subject: "database", value: "PostgreSQL" }),
    candidate({ id: "db-b", projectId: "project-a", sourceTimestamp: august, subject: "database", value: "MySQL" }),
    candidate({ id: "theme", projectId: "project-a", subject: "theme", value: "dark" })
  ], "migrate the database");
  assert.equal(ambiguities.length, 1);
  assert.match(ambiguities[0]?.reason ?? "", /Unresolved material project-memory conflict/);
});

test("SECURITY-01 persistence history excludes forgotten rows and route preserves owned scope", async () => {
  const persistence = await readFile(new URL("../../../../../../../packages/database/src/user-memory-persistence.ts", import.meta.url), "utf8");
  const route = await readFile(new URL("../../../../app/api/ai/chat/route.ts", import.meta.url), "utf8");
  assert.match(persistence, /records\.status in \('active', 'superseded'\)/);
  assert.doesNotMatch(persistence.match(/export async function listOwnedUserMemoryHistory[\s\S]*?return result\.rows\.map\(mapMemoryRow\);/)?.[0] ?? "", /forgotten/);
  assert.match(route, /createDatabaseProjectMemoryStore\(memoryOwnerId, persistence\.projectId\)/);
  assert.match(route, /handleAskTemporalMemory/);
  assert.doesNotMatch(route, /console\.(?:log|info).*temporal/i);
});

test("QUERY-01 unknown temporal evidence remains truthful rather than guessed", () => {
  const result = resolveMemoryTruth(parseTemporalMemoryQuery("What was our previous launch date?"), []);
  assert.equal(result.status, "insufficient-evidence");
  assert.equal(result.selected.length, 0);
});

console.log("temporal-memory-smoke: contract cases registered");
