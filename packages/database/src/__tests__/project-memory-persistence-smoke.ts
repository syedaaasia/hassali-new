import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { sql } from "drizzle-orm";
import { getDatabaseClient } from "../client";
import {
  listOwnedConversationMemories,
  listOwnedProjectEpisodes,
  listOwnedProjectMemories,
  persistOwnedProjectEpisode,
  persistOwnedProjectMemory,
  upsertOwnedConversationMemory
} from "../project-memory-persistence";
import { createOwnedChatSession, deleteOwnedChatMessage, loadOwnedProjectMessageEvidence } from "../persistence";

async function fixture() {
  const db = getDatabaseClient();
  const suffix = randomUUID();
  const ownerA = `m3-owner-a-${suffix}`;
  const ownerB = `m3-owner-b-${suffix}`;
  const users = await db.execute<{ externalId: string; id: string }>(sql`
    insert into users (external_id, email) values
      (${ownerA}, ${`${ownerA}@example.invalid`}),
      (${ownerB}, ${`${ownerB}@example.invalid`})
    returning id, external_id as "externalId"
  `);
  const userA = users.rows.find((row) => row.externalId === ownerA)!.id;
  const userB = users.rows.find((row) => row.externalId === ownerB)!.id;
  const workspaces = await db.execute<{ id: string; ownerId: string }>(sql`
    insert into workspaces (owner_id, name, slug) values
      (${userA}, 'M3 A', ${`m3-a-${suffix}`}), (${userB}, 'M3 B', ${`m3-b-${suffix}`})
    returning id, owner_id as "ownerId"
  `);
  const workspaceA = workspaces.rows.find((row) => row.ownerId === userA)!.id;
  const workspaceB = workspaces.rows.find((row) => row.ownerId === userB)!.id;
  const projects = await db.execute<{ id: string; workspaceId: string }>(sql`
    insert into projects (workspace_id, name) values
      (${workspaceA}, 'M3 Project A'), (${workspaceA}, 'M3 Project A2'), (${workspaceB}, 'M3 Project B')
    returning id, workspace_id as "workspaceId"
  `);
  const ownedA = projects.rows.filter((row) => row.workspaceId === workspaceA);
  const projectA = ownedA[0]!.id;
  const projectA2 = ownedA[1]!.id;
  const projectB = projects.rows.find((row) => row.workspaceId === workspaceB)!.id;
  const sessions = await db.execute<{ id: string; projectId: string }>(sql`
    insert into chat_sessions (project_id, user_id, title) values
      (${projectA}, ${userA}, 'Chat A'), (${projectA}, ${userA}, 'Chat B'),
      (${projectA2}, ${userA}, 'Other project'), (${projectB}, ${userB}, 'Other owner')
    returning id, project_id as "projectId"
  `);
  const [chatA, chatB] = sessions.rows.filter((row) => row.projectId === projectA).map((row) => row.id);
  const chatOtherOwner = sessions.rows.find((row) => row.projectId === projectB)!.id;
  const messages = await db.execute<{ id: string; sessionId: string }>(sql`
    insert into chat_messages (session_id, user_id, role, mode, content) values
      (${chatA}, ${userA}, 'user', 'ASK', 'We decided to use cedar as the code name.'),
      (${chatB}, ${userA}, 'user', 'ASK', 'What is the code name?'),
      (${chatOtherOwner}, ${userB}, 'user', 'ASK', 'Private other-owner message.')
    returning id, session_id as "sessionId"
  `);
  return { chatA: chatA!, chatB: chatB!, db, messageA: messages.rows.find((row) => row.sessionId === chatA)!.id, ownerA, ownerB, projectA, projectA2, projectB, userA };
}

test("M3-DB-01 project memory is durable, deduplicated, superseded, and owner/project scoped", async () => {
  const f = await fixture();
  try {
    const base = { category: "decision", confidenceBps: 9900, conversationId: f.chatA, externalUserId: f.ownerA, importance: "high", memoryType: "decision", normalizedKey: "decision code name", projectId: f.projectA, sourceMessageId: f.messageA, sourceType: "user_message", tags: ["decision"], title: "Project code name" };
    assert.equal((await persistOwnedProjectMemory({ ...base, content: "The current project code name is cedar.", normalizedContent: "the current project code name is cedar" }, f.db)).action, "created");
    assert.equal((await persistOwnedProjectMemory({ ...base, content: "The current project code name is cedar.", normalizedContent: "the current project code name is cedar" }, f.db)).action, "deduplicated");
    assert.equal((await persistOwnedProjectMemory({ ...base, content: "The current project code name is maple.", normalizedContent: "the current project code name is maple" }, f.db)).action, "updated");
    assert.equal((await listOwnedProjectMemories({ externalUserId: f.ownerA, projectId: f.projectA }, f.db))[0]?.content, "The current project code name is maple.");
    assert.equal((await listOwnedProjectMemories({ externalUserId: f.ownerA, includeSuperseded: true, projectId: f.projectA }, f.db)).length, 2);
    assert.equal((await listOwnedProjectMemories({ externalUserId: f.ownerA, projectId: f.projectA2 }, f.db)).length, 0);
    assert.equal((await listOwnedProjectMemories({ externalUserId: f.ownerB, projectId: f.projectB }, f.db)).length, 0);
    await assert.rejects(() => persistOwnedProjectMemory({ ...base, externalUserId: f.ownerB, projectId: f.projectA, content: "forged", normalizedContent: "forged" }, f.db), /NOT_OWNED/);
    await assert.rejects(() => persistOwnedProjectMemory({ ...base, conversationId: f.chatB, sourceMessageId: f.messageA, content: "forged source", normalizedContent: "forged source" }, f.db), /NOT_OWNED/);
  } finally { await f.db.execute(sql`delete from users where external_id in (${f.ownerA}, ${f.ownerB})`); }
});

test("M3-DB-02 conversation summaries retain provenance and project episodes preserve truthful status", async () => {
  const f = await fixture();
  try {
    const now = new Date();
    const first = await upsertOwnedConversationMemory({ checkpoints: [], conversationId: f.chatA, externalUserId: f.ownerA, firstSourceMessageId: f.messageA, importantReferences: [], keyDecisions: ["Use cedar"], lastActivityAt: now, lastSourceMessageId: f.messageA, projectId: f.projectA, sourceFingerprint: "a".repeat(64), sourceMessageCount: 1, startedAt: now, summary: "User chose cedar.", title: "Chat A", unresolvedItems: ["Build reporting"] }, f.db);
    assert.equal(first.revision, 1);
    const second = await upsertOwnedConversationMemory({ ...first, externalUserId: f.ownerA, sourceFingerprint: "b".repeat(64), sourceMessageCount: 2, summary: "User chose cedar. Reporting remains next." }, f.db);
    assert.equal(second.revision, 2);
    assert.equal((await listOwnedConversationMemories({ externalUserId: f.ownerA, projectId: f.projectA }, f.db)).length, 1);
    await persistOwnedProjectEpisode({ conversationId: f.chatA, description: "Feature implemented with browser verification unavailable.", eventType: "verified_delivery", externalUserId: f.ownerA, importance: "high", outcome: "Partially verified", projectId: f.projectA, sourceMessageId: f.messageA, status: "partial" }, f.db);
    const episodes = await listOwnedProjectEpisodes({ externalUserId: f.ownerA, projectId: f.projectA }, f.db);
    assert.equal(episodes[0]?.status, "partial");
    assert.doesNotMatch(episodes[0]?.description ?? "", /fully verified/i);
  } finally { await f.db.execute(sql`delete from users where external_id in (${f.ownerA}, ${f.ownerB})`); }
});

test("M3-DB-03 chat and project deletion cascade derived memory without orphaned recall", async () => {
  const f = await fixture();
  try {
    await persistOwnedProjectMemory({ category: "decision", confidenceBps: 9900, content: "Use cedar.", conversationId: f.chatA, externalUserId: f.ownerA, importance: "high", memoryType: "decision", normalizedContent: "use cedar", normalizedKey: "decision code name", projectId: f.projectA, sourceMessageId: f.messageA, title: "Code name" }, f.db);
    const now = new Date();
    await upsertOwnedConversationMemory({ checkpoints: [], conversationId: f.chatA, externalUserId: f.ownerA, firstSourceMessageId: f.messageA, importantReferences: [], keyDecisions: ["Use cedar"], lastActivityAt: now, lastSourceMessageId: f.messageA, projectId: f.projectA, sourceFingerprint: "c".repeat(64), sourceMessageCount: 1, startedAt: now, summary: "Use cedar.", title: "Chat A", unresolvedItems: [] }, f.db);
    await f.db.execute(sql`delete from chat_sessions where id = ${f.chatA}`);
    assert.equal((await listOwnedProjectMemories({ externalUserId: f.ownerA, projectId: f.projectA }, f.db)).length, 0);
    assert.equal((await listOwnedConversationMemories({ externalUserId: f.ownerA, projectId: f.projectA }, f.db)).length, 0);
    await f.db.execute(sql`delete from projects where id = ${f.projectA}`);
    const orphans = await f.db.execute<{ count: number }>(sql`select count(*)::int as count from project_memory_records where project_id = ${f.projectA}`);
    assert.equal(orphans.rows[0]?.count, 0);
  } finally { await f.db.execute(sql`delete from users where external_id in (${f.ownerA}, ${f.ownerB})`); }
});

test("M3-DB-04 new chats and full source evidence remain ownership bound", async () => {
  const f = await fixture();
  try {
    const created = await createOwnedChatSession({ externalUserId: f.ownerA, projectId: f.projectA, title: "Fresh continuation" }, f.db);
    assert.notEqual(created.id, f.chatA);
    assert.equal(created.title, "Fresh continuation");
    await assert.rejects(() => createOwnedChatSession({ externalUserId: f.ownerB, projectId: f.projectA }, f.db), /NOT_OWNED/);
    const ownerEvidence = await loadOwnedProjectMessageEvidence(f.ownerA, [f.messageA], f.db);
    const otherEvidence = await loadOwnedProjectMessageEvidence(f.ownerB, [f.messageA], f.db);
    assert.equal(ownerEvidence[0]?.content, "We decided to use cedar as the code name.");
    assert.equal(otherEvidence.length, 0);
  } finally { await f.db.execute(sql`delete from users where external_id in (${f.ownerA}, ${f.ownerB})`); }
});

test("M3-DB-05 deleting a source message invalidates its derived record and conversation summary", async () => {
  const f = await fixture();
  try {
    await persistOwnedProjectMemory({ category: "decision", confidenceBps: 9900, content: "Use cedar.", conversationId: f.chatA, externalUserId: f.ownerA, importance: "high", memoryType: "decision", normalizedContent: "use cedar", normalizedKey: "decision code name", projectId: f.projectA, sourceMessageId: f.messageA, title: "Code name" }, f.db);
    const now = new Date();
    await upsertOwnedConversationMemory({ checkpoints: [], conversationId: f.chatA, externalUserId: f.ownerA, firstSourceMessageId: f.messageA, importantReferences: [], keyDecisions: ["Use cedar"], lastActivityAt: now, lastSourceMessageId: f.messageA, projectId: f.projectA, sourceFingerprint: "d".repeat(64), sourceMessageCount: 1, startedAt: now, summary: "Use cedar.", title: "Chat A", unresolvedItems: [] }, f.db);
    assert.equal(await deleteOwnedChatMessage({ messageId: f.messageA, userId: f.userA }, f.db), true);
    assert.equal((await listOwnedProjectMemories({ externalUserId: f.ownerA, projectId: f.projectA }, f.db)).length, 0);
    assert.equal((await listOwnedConversationMemories({ externalUserId: f.ownerA, projectId: f.projectA }, f.db)).length, 0);
  } finally { await f.db.execute(sql`delete from users where external_id in (${f.ownerA}, ${f.ownerB})`); }
});
