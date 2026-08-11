import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { sql } from "drizzle-orm";
import { getDatabaseClient } from "../client";
import {
  forgetOwnedUserMemory,
  listOwnedMemoryPeople,
  listOwnedUserMemories,
  persistOwnedUserMemory
} from "../user-memory-persistence";

test("PERSIST-DB-01 write/read/dedupe/update/forget remain owner scoped", async () => {
  const db = getDatabaseClient();
  const suffix = randomUUID();
  const ownerA = `memory-test-a-${suffix}`;
  const ownerB = `memory-test-b-${suffix}`;
  await db.execute(sql`
    insert into users (external_id, email)
    values (${ownerA}, ${`${ownerA}@example.invalid`}), (${ownerB}, ${`${ownerB}@example.invalid`})
  `);
  try {
    const first = await persistOwnedUserMemory({
      captureMethod: "explicit",
      category: "preference",
      confidenceBps: 9900,
      externalUserId: ownerA,
      key: "favorite test drink",
      normalizedKey: "favorite test drink",
      normalizedValue: "cardamom tea",
      sensitivity: "standard",
      sourceMessageId: null,
      value: "cardamom tea"
    }, db);
    assert.equal(first.action, "created");
    assert.equal((await listOwnedUserMemories(ownerA, 20, db)).length, 1);
    assert.equal((await listOwnedUserMemories(ownerB, 20, db)).length, 0);

    const duplicate = await persistOwnedUserMemory({
      captureMethod: "explicit",
      category: "preference",
      confidenceBps: 9900,
      externalUserId: ownerA,
      key: "favorite test drink",
      normalizedKey: "favorite test drink",
      normalizedValue: "cardamom tea",
      sensitivity: "standard",
      sourceMessageId: null,
      value: "cardamom tea"
    }, db);
    assert.equal(duplicate.action, "deduplicated");

    const updated = await persistOwnedUserMemory({
      captureMethod: "explicit",
      category: "preference",
      confidenceBps: 9900,
      externalUserId: ownerA,
      key: "favorite test drink",
      normalizedKey: "favorite test drink",
      normalizedValue: "coffee",
      sensitivity: "standard",
      sourceMessageId: null,
      value: "coffee"
    }, db);
    assert.equal(updated.action, "updated");
    assert.equal((await listOwnedUserMemories(ownerA, 20, db))[0]?.value, "coffee");

    const history = await db.execute<{ status: string }>(sql`
      select records.status
      from user_memory_records records
      inner join users on users.id = records.user_id
      where users.external_id = ${ownerA}
      order by records.created_at asc
    `);
    assert.deepEqual(history.rows.map((row) => row.status).sort(), ["active", "superseded"]);

    const forgotten = await forgetOwnedUserMemory({
      externalUserId: ownerA,
      mode: "key",
      normalizedTarget: "favorite test drink"
    }, db);
    assert.equal(forgotten, 2);
    assert.equal((await listOwnedUserMemories(ownerA, 20, db)).length, 0);
    const scrubbed = await db.execute<{ key: string; normalizedValue: string; value: string }>(sql`
      select key, normalized_value as "normalizedValue", value
      from user_memory_records records
      inner join users on users.id = records.user_id
      where users.external_id = ${ownerA}
    `);
    assert.equal(scrubbed.rows.length, 2);
    assert(scrubbed.rows.every((row) => row.key === "forgotten memory" && row.value === "[forgotten]"));
    assert.doesNotMatch(JSON.stringify(scrubbed.rows), /cardamom|coffee/i);
  } finally {
    await db.execute(sql`delete from users where external_id in (${ownerA}, ${ownerB})`);
  }
});

test("PERSIST-DB-02 people, aliases, and relationships survive a fresh read and clean up", async () => {
  const db = getDatabaseClient();
  const owner = `memory-person-test-${randomUUID()}`;
  await db.execute(sql`insert into users (external_id, email) values (${owner}, ${`${owner}@example.invalid`})`);
  try {
    await persistOwnedUserMemory({
      captureMethod: "explicit",
      category: "relationship",
      confidenceBps: 9900,
      externalUserId: owner,
      key: "relationship to Avery Sample",
      normalizedKey: "relationship to avery sample",
      normalizedValue: "test sibling",
      person: {
        aliases: ["Ave"],
        canonicalName: "Avery Sample",
        normalizedName: "avery sample",
        normalizedRelationship: "test sibling",
        relationship: "test sibling"
      },
      sensitivity: "standard",
      sourceMessageId: null,
      value: "test sibling"
    }, db);
    const people = await listOwnedMemoryPeople(owner, 20, db);
    assert.equal(people.length, 1);
    assert.deepEqual(people[0]?.aliases, ["Ave"]);
    assert.equal(people[0]?.relationship, "test sibling");
    assert.equal((await listOwnedUserMemories(owner, 20, db))[0]?.person?.canonicalName, "Avery Sample");
    assert.equal(await forgetOwnedUserMemory({ externalUserId: owner, mode: "person", normalizedTarget: "ave" }, db), 1);
    assert.equal((await listOwnedMemoryPeople(owner, 20, db)).length, 0);
  } finally {
    await db.execute(sql`delete from users where external_id = ${owner}`);
  }
});
