import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { sql } from "drizzle-orm";
import { getDatabaseClient } from "../client";
import {
  clearAllOwnedDerivedMemory,
  clearOwnedProjectMemory,
  editOwnedUserMemory,
  forgetOwnedProjectMemoryById,
  forgetOwnedUserMemoryById,
  loadOwnedMemoryPreferences,
  loadOwnedMemorySnapshot,
  updateOwnedMemoryPreferences
} from "../memory-management-persistence";
import { persistOwnedProjectMemory } from "../project-memory-persistence";
import { persistOwnedUserMemory } from "../user-memory-persistence";

test("M5-DB-01 preferences, management, export snapshot, and deletion remain owner scoped", async () => {
  const db = getDatabaseClient();
  const suffix = randomUUID();
  const ownerA = `m5-owner-a-${suffix}`;
  const ownerB = `m5-owner-b-${suffix}`;
  const users = await db.execute<{ externalId: string; id: string }>(sql`
    insert into users (external_id, email) values
      (${ownerA}, ${`${ownerA}@example.invalid`}), (${ownerB}, ${`${ownerB}@example.invalid`})
    returning id, external_id as "externalId"
  `);
  const userA = users.rows.find((row) => row.externalId === ownerA)!.id;
  const userB = users.rows.find((row) => row.externalId === ownerB)!.id;
  const workspaces = await db.execute<{ id: string; ownerId: string }>(sql`
    insert into workspaces (owner_id, name, slug) values
      (${userA}, 'M5 A', ${`m5-a-${suffix}`}), (${userB}, 'M5 B', ${`m5-b-${suffix}`})
    returning id, owner_id as "ownerId"
  `);
  const workspaceA = workspaces.rows.find((row) => row.ownerId === userA)!.id;
  const workspaceB = workspaces.rows.find((row) => row.ownerId === userB)!.id;
  const projects = await db.execute<{ id: string; workspaceId: string }>(sql`
    insert into projects (workspace_id, name) values (${workspaceA}, 'M5 Project A'), (${workspaceB}, 'M5 Project B')
    returning id, workspace_id as "workspaceId"
  `);
  const projectA = projects.rows.find((row) => row.workspaceId === workspaceA)!.id;
  const projectB = projects.rows.find((row) => row.workspaceId === workspaceB)!.id;
  try {
    assert.equal((await loadOwnedMemoryPreferences(ownerA, db)).memoryEnabled, true);
    const preferences = await updateOwnedMemoryPreferences(
      ownerA,
      { automaticMemoryEnabled: false, paused: true },
      db
    );
    assert.equal(preferences.automaticMemoryEnabled, false);
    assert.equal(preferences.paused, true);
    assert.equal((await loadOwnedMemoryPreferences(ownerB, db)).paused, false);

    const base = {
      captureMethod: "explicit" as const,
      category: "preference",
      confidenceBps: 9900,
      key: "M5 palette",
      normalizedKey: "m5 palette",
      sensitivity: "standard" as const,
      sourceMessageId: null
    };
    await persistOwnedUserMemory(
      { ...base, externalUserId: ownerA, normalizedValue: "alpine", value: "alpine" },
      db
    );
    const updated = await persistOwnedUserMemory(
      { ...base, externalUserId: ownerA, normalizedValue: "coastal", value: "coastal" },
      db
    );
    await persistOwnedUserMemory(
      { ...base, externalUserId: ownerB, normalizedValue: "private-b", value: "private-b" },
      db
    );
    const snapshotA = await loadOwnedMemorySnapshot(ownerA, db);
    assert(snapshotA.userMemories.some((item) => item.value === "coastal"));
    assert(
      snapshotA.userMemories.some((item) => item.value === "alpine" && item.status === "superseded")
    );
    assert.doesNotMatch(JSON.stringify(snapshotA), /private-b/);
    await assert.rejects(
      () =>
        editOwnedUserMemory(
          { externalUserId: ownerB, memoryId: updated.record.id, value: "forged" },
          db
        ),
      /NOT_FOUND/
    );
    await editOwnedUserMemory(
      { externalUserId: ownerA, memoryId: updated.record.id, value: "balanced" },
      db
    );
    const activeA = (await loadOwnedMemorySnapshot(ownerA, db)).userMemories.find(
      (item) => item.status === "active"
    );
    assert.equal(activeA?.value, "balanced");

    const projectBase = {
      category: "decision",
      confidenceBps: 9900,
      conversationId: null,
      importance: "high",
      memoryType: "decision",
      normalizedKey: "m5 project decision",
      sourceMessageId: null,
      sourceType: "user_message",
      tags: ["decision"],
      title: "M5 decision"
    };
    const projectRecordA = await persistOwnedProjectMemory(
      {
        ...projectBase,
        content: "Use alpine.",
        externalUserId: ownerA,
        normalizedContent: "use alpine",
        projectId: projectA
      },
      db
    );
    await persistOwnedProjectMemory(
      {
        ...projectBase,
        content: "Private B.",
        externalUserId: ownerB,
        normalizedContent: "private b",
        projectId: projectB
      },
      db
    );
    assert.equal(await forgetOwnedProjectMemoryById(ownerB, projectRecordA.record.id, db), 0);
    await assert.rejects(() => clearOwnedProjectMemory(ownerB, projectA, db), /NOT_OWNED/);
    assert.equal(await forgetOwnedProjectMemoryById(ownerA, projectRecordA.record.id, db), 1);

    const beforeClearB = await loadOwnedMemorySnapshot(ownerB, db);
    assert(beforeClearB.userMemories.length > 0 && beforeClearB.projectMemories.length > 0);
    await clearAllOwnedDerivedMemory(ownerA, db);
    const clearedA = await loadOwnedMemorySnapshot(ownerA, db);
    assert.equal(clearedA.userMemories.length, 0);
    assert.equal(clearedA.projectMemories.length, 0);
    assert.equal(
      (await loadOwnedMemorySnapshot(ownerB, db)).userMemories.length,
      beforeClearB.userMemories.length
    );

    assert.equal(await forgetOwnedUserMemoryById(ownerB, activeA!.id, db), 0);
  } finally {
    await db.execute(sql`delete from users where external_id in (${ownerA}, ${ownerB})`);
  }
});
