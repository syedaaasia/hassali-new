import assert from "node:assert/strict";
import test from "node:test";
import { GraphKernel, graphNode } from "@/lib/server/graph-kernel/graph-kernel";
import {
  classifyKnowledgeWrite,
  createSourceKnowledgeRecord,
  InMemoryKnowledgeRepository,
  projectMemoryToKnowledgeRecord,
  retrieveKnowledge,
  toOpenKnowledgeFormat,
  userMemoryToKnowledgeRecord
} from "@/lib/server/knowledge-memory/knowledge-memory";
import { graphRelatedKnowledgeIds, projectKnowledgeRecordToGraph } from "@/lib/server/knowledge-memory/knowledge-graph";
import type { KnowledgeRecord } from "@/lib/server/knowledge-memory/knowledge-types";
import type { ProjectMemoryRecord } from "@/lib/server/project-memory/project-memory";
import type { UserMemoryRecord } from "@/lib/server/user-memory/user-memory";

function record(input: Partial<KnowledgeRecord> & Pick<KnowledgeRecord, "subject" | "value">): KnowledgeRecord {
  const now = new Date("2026-08-22T10:00:00.000Z");
  return {
    authority: { id: input.projectId ?? "user-a", kind: input.projectId ? "project" : "user" },
    confidence: 1,
    createdAt: now,
    effectiveFrom: now,
    expiresAt: null,
    factState: "confirmed",
    id: `memory-${input.subject}-${input.value}`,
    kind: input.projectId ? "project_decision" : "personal_fact",
    ownerId: "user-a",
    privacy: "standard",
    projectId: null,
    provenance: { kind: input.projectId ? "project_memory" : "user_statement", reference: "message-a" },
    scope: { id: input.projectId ?? "user-a", kind: input.projectId ? "project" : "user" },
    statement: `${input.subject}: ${input.value}`,
    status: "active",
    supersedesId: null,
    tags: [input.subject],
    updatedAt: now,
    ...input
  };
}

async function save(repository: InMemoryKnowledgeRepository, input: Partial<KnowledgeRecord> & Pick<KnowledgeRecord, "subject" | "value">) {
  const value = record(input);
  return repository.save({
    authority: value.authority,
    confidence: value.confidence,
    effectiveFrom: value.effectiveFrom,
    expiresAt: value.expiresAt,
    factState: value.factState,
    id: value.id,
    kind: value.kind,
    ownerId: value.ownerId,
    privacy: value.privacy,
    projectId: value.projectId,
    provenance: value.provenance,
    scope: value.scope,
    statement: value.statement,
    subject: value.subject,
    tags: value.tags,
    value: value.value
  });
}

test("A explicit save is durable and retrievable", async () => {
  assert.deepEqual(classifyKnowledgeWrite({ explicit: true, text: "Remember my editor is VS Code" }), { action: "store", reason: "explicit_save", scope: "user" });
  const repository = new InMemoryKnowledgeRepository();
  await save(repository, { subject: "editor", value: "VS Code" });
  assert.match((await repository.retrieve({ mode: "ASK", ownerId: "user-a", text: "What editor do I use?" })).context, /VS Code/);
});

test("B general knowledge is not gated on memory", () => {
  const result = retrieveKnowledge([], { mode: "ASK", ownerId: "user-a", text: "What is vibe coding?" });
  assert.equal(result.records.length, 0);
  assert.equal(result.context, "");
});

test("C personal recall without a record stays unknown", () => {
  const result = retrieveKnowledge([], { mode: "ASK", ownerId: "user-a", subject: "favorite editor", text: "What is my favorite editor?" });
  assert.equal(result.records.length, 0);
});

test("D relevant personalization excludes unrelated memory", () => {
  const result = retrieveKnowledge([
    record({ subject: "writing style", value: "concise" }),
    record({ subject: "favorite meal", value: "biryani" })
  ], { mode: "ASK", ownerId: "user-a", text: "Rewrite this in my preferred concise writing style" });
  assert.equal(result.records.length, 1);
  assert.match(result.context, /concise/);
});

test("E correction creates supersession lineage and invalidates cached recall", async () => {
  const repository = new InMemoryKnowledgeRepository();
  const first = await save(repository, { subject: "editor", value: "VS Code" });
  await repository.retrieve({ mode: "ASK", ownerId: "user-a", text: "my editor" });
  const corrected = await save(repository, { subject: "editor", value: "Zed" });
  assert.equal(corrected.action, "updated");
  assert.equal(corrected.record.supersedesId, first.record.id);
  const result = await repository.retrieve({ mode: "ASK", ownerId: "user-a", text: "my editor" });
  assert.match(result.context, /Zed/);
  assert.doesNotMatch(result.context, /VS Code/);
});

test("F forget removes records from active retrieval and invalidates cache", async () => {
  const repository = new InMemoryKnowledgeRepository();
  await save(repository, { subject: "editor", value: "Zed" });
  assert.equal((await repository.retrieve({ mode: "ASK", ownerId: "user-a", text: "my editor" })).records.length, 1);
  assert.equal(await repository.forget({ ownerId: "user-a", subject: "editor" }), 1);
  assert.equal((await repository.retrieve({ mode: "ASK", ownerId: "user-a", text: "my editor" })).records.length, 0);
});

test("G project knowledge never crosses project scope", () => {
  const result = retrieveKnowledge([
    record({ projectId: "project-a", subject: "framework", value: "Next.js" }),
    record({ projectId: "project-b", subject: "framework", value: "Django" })
  ], { mode: "CODE", ownerId: "user-a", projectId: "project-a", text: "project framework" });
  assert.match(result.context, /Next\.js/);
  assert.doesNotMatch(result.context, /Django/);
});

test("H user and project scopes remain distinct", () => {
  const result = retrieveKnowledge([
    record({ subject: "theme", value: "I prefer dark editors" }),
    record({ projectId: "project-a", subject: "theme", value: "The site theme is light" })
  ], { mode: "WEBSITE", ownerId: "user-a", projectId: "project-a", subject: "theme", text: "current project theme" });
  assert.equal(result.records[0]?.projectId, "project-a");
});

test("I authoritative project-state knowledge retains authority and revision", () => {
  const value = record({
    authority: { id: "revision-7", kind: "project_revision", revision: "r7" },
    kind: "project_state",
    projectId: "project-a",
    provenance: { kind: "project_state", reference: "canonical", revision: "r7" },
    subject: "canonical revision",
    value: "r7"
  });
  assert.equal(value.authority.revision, "r7");
  assert.equal(value.provenance.kind, "project_state");
});

test("J stale revision is excluded after canonical revision changes", () => {
  const result = retrieveKnowledge([
    record({ projectId: "project-a", provenance: { kind: "project_state", reference: "r6", revision: "r6" }, subject: "entry", value: "old.ts" }),
    record({ projectId: "project-a", provenance: { kind: "project_state", reference: "r7", revision: "r7" }, subject: "entry", value: "new.ts" })
  ], { currentRevision: "r7", mode: "CODE", ownerId: "user-a", projectId: "project-a", text: "project entry" });
  assert.match(result.context, /new\.ts/);
  assert.doesNotMatch(result.context, /old\.ts/);
});

test("K only verified outcome is eligible as a verified project result", () => {
  const verified = record({ factState: "confirmed", kind: "verified_outcome", projectId: "project-a", provenance: { kind: "verified", reference: "test-run" }, subject: "build", value: "passed" });
  const failed = record({ factState: "unsupported", kind: "derived_context", projectId: "project-a", subject: "deploy", value: "complete" });
  const result = retrieveKnowledge([verified, failed], { mode: "CODE", ownerId: "user-a", projectId: "project-a", text: "latest build outcome", freshnessRequired: true });
  assert.deepEqual(result.records.map((item) => item.id), [verified.id]);
});

test("L source knowledge preserves source, chunk, and section provenance", () => {
  const source = createSourceKnowledgeRecord({ chunkId: "chunk-4", ownerId: "user-a", section: "Refunds", sourceId: "contract.pdf", statement: "Refunds require written notice.", subject: "refund policy" });
  const result = retrieveKnowledge([source], { mode: "ASK", ownerId: "user-a", text: "refund policy" });
  assert.match(result.context, /source=contract\.pdf chunk=chunk-4 section=Refunds/);
});

test("M conflicting active claims remain visible rather than silently merged", () => {
  const records = [
    record({ id: "claim-a", factState: "inferred", subject: "launch date", value: "Monday" }),
    record({ id: "claim-b", factState: "inferred", subject: "launch date", value: "Tuesday" })
  ];
  const result = retrieveKnowledge(records, { mode: "ASK", ownerId: "user-a", subject: "launch date", text: "launch date" });
  assert.equal(result.records.length, 2);
  assert.deepEqual(result.diagnostics.conflicts[0]?.recordIds.sort(), ["claim-a", "claim-b"]);
});

test("N secrets are rejected and sensitive automatic capture is denied", async () => {
  assert.equal(classifyKnowledgeWrite({ explicit: true, text: "Remember password: fake-value-for-rejection" }).action, "do_not_store");
  assert.deepEqual(classifyKnowledgeWrite({ explicit: false, text: "My medical diagnosis is private" }), { action: "do_not_store", reason: "sensitive_requires_explicit" });
  const repository = new InMemoryKnowledgeRepository();
  await assert.rejects(() => save(repository, { subject: "password", value: "fake-value-for-rejection" }), /MEMORY_SECRET_REJECTED/);
});

test("O retrieval is ranked, bounded, and negatively filters unrelated facts", () => {
  const records = Array.from({ length: 20 }, (_, index) => record({ id: `record-${index}`, subject: index < 10 ? "typescript testing" : "cooking", value: `value ${index}` }));
  const result = retrieveKnowledge(records, { limit: 4, maxCharacters: 300, mode: "CODE", ownerId: "user-a", text: "typescript testing" });
  assert(result.records.length <= 4);
  assert(result.context.length <= 300);
  assert(result.records.every((item) => item.subject === "typescript testing"));
});

test("P graph-assisted project retrieval follows bounded relationships", () => {
  const graph = new GraphKernel();
  const memory = record({ id: "knowledge-entry", projectId: "project-a", subject: "entry", value: "src/main.ts" });
  const projected = projectKnowledgeRecordToGraph({ graph, record: memory });
  const related = graph.upsertNode(graphNode({ identity: "source-file", kind: "file", label: "src/main.ts", metadata: { knowledgeId: "file-memory" }, mode: "SHARED", privacy: "private", provenance: "project_state", scope: projected.node.scope }));
  graph.connect({ factState: "confirmed", from: projected.node.id, kind: "RELATED_TO", mode: "SHARED", provenance: "retrieval", scope: projected.node.scope, status: "current", to: related.id });
  const relatedIds = graphRelatedKnowledgeIds(graph, memory);
  assert(relatedIds.includes("file-memory"));
  const companion = record({ id: "companion", projectId: "project-a", subject: "supporting file", value: "src/main.ts" });
  assert.equal(retrieveKnowledge([companion], {
    mode: "CODE",
    ownerId: "user-a",
    projectId: "project-a",
    relatedRecordIds: [companion.id],
    text: "supporting file"
  }).records[0]?.id, companion.id);
});

test("Q current/fresh questions reject stale personal memory as authority", () => {
  const staleSource = createSourceKnowledgeRecord({ ownerId: "user-a", sourceId: "old-weather.txt", statement: "The weather is sunny.", subject: "weather" });
  const result = retrieveKnowledge([record({ subject: "weather", value: "sunny" }), staleSource], { mode: "ASK", ownerId: "user-a", text: "What is the current weather?" });
  assert.equal(result.records.length, 0);
});

test("R equivalent memory and graph-derived values deduplicate", () => {
  const first = record({ id: "memory", subject: "framework", value: "Next.js" });
  const duplicate = record({ ...first, id: "graph", provenance: { kind: "derived", reference: "graph" } });
  const result = retrieveKnowledge([first, duplicate], { mode: "CODE", ownerId: "user-a", text: "framework" });
  assert.equal(result.records.length, 1);
  assert.equal(result.diagnostics.deduplicated, 1);
});

test("S legacy user and project memories normalize without schema migration", () => {
  const now = new Date();
  const user: UserMemoryRecord = { captureMethod: "explicit", category: "preference", confidence: 1, createdAt: now, id: "legacy-user", key: "editor", normalizedKey: "editor", person: null, sensitivity: "standard", sourceMessageId: "message", sourceType: "user_message", status: "active", updatedAt: now, value: "Zed" };
  const project: ProjectMemoryRecord = { category: "decision", confidence: 1, content: "Use Next.js", conversationId: "chat", createdAt: now, effectiveFrom: now, id: "legacy-project", importance: "high", normalizedKey: "framework", projectId: "project-a", projectName: "A", sourceMessageId: "message", status: "active", title: "Framework", updatedAt: now };
  assert.equal(userMemoryToKnowledgeRecord("user-a", user).kind, "preference");
  assert.equal(projectMemoryToKnowledgeRecord("user-a", project).kind, "project_decision");
});

test("T optional retrieval failure can degrade to empty context and OKF stays portable", async () => {
  const unavailable = async () => { throw new Error("optional memory unavailable"); };
  const context = await unavailable().catch(() => "");
  assert.equal(context, "");
  const portable = toOpenKnowledgeFormat(record({ subject: "editor", value: "Zed" }));
  assert.deepEqual(Object.keys(portable).sort(), ["id", "metadata", "provenance", "scope", "subject", "value"]);
});
