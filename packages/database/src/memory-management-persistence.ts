import { sql } from "drizzle-orm";
import { getDatabaseClient, type DatabaseClient } from "./client";
import type { PersistedMemoryPerson, PersistedUserMemoryRecord } from "./user-memory-persistence";
import { listOwnedMemoryPeople, listOwnedUserMemoryHistory } from "./user-memory-persistence";

type Db = DatabaseClient;
type QueryDb = Pick<Db, "execute">;

export type PersistedMemoryPreferences = {
  automaticMemoryEnabled: boolean;
  conversationMemoryEnabled: boolean;
  memoryEnabled: boolean;
  paused: boolean;
  projectMemoryEnabled: boolean;
  sensitiveMemoryAllowed: boolean;
  updatedAt: Date | null;
  userMemoryEnabled: boolean;
};

export type ManagedProjectMemory = {
  category: string;
  content: string;
  conversationId: string | null;
  conversationTitle: string | null;
  createdAt: Date;
  id: string;
  projectId: string;
  projectName: string;
  sourceType: string;
  status: string;
  title: string;
  updatedAt: Date;
};

export type ManagedConversationMemory = {
  conversationId: string;
  lastActivityAt: Date;
  projectId: string;
  projectName: string;
  status: string;
  summary: string;
  title: string;
};

export type ManagedProjectEpisode = {
  description: string;
  occurredAt: Date;
  projectId: string;
  projectName: string;
  status: string;
};

export type OwnedMemorySnapshot = {
  conversations: ManagedConversationMemory[];
  episodes: ManagedProjectEpisode[];
  people: PersistedMemoryPerson[];
  preferences: PersistedMemoryPreferences;
  projectMemories: ManagedProjectMemory[];
  userMemories: PersistedUserMemoryRecord[];
};

export const defaultMemoryPreferences: PersistedMemoryPreferences = {
  automaticMemoryEnabled: true,
  conversationMemoryEnabled: true,
  memoryEnabled: true,
  paused: false,
  projectMemoryEnabled: true,
  sensitiveMemoryAllowed: false,
  updatedAt: null,
  userMemoryEnabled: true
};

async function ownedUserId(externalUserId: string, db: QueryDb) {
  const result = await db.execute<{ id: string }>(sql`
    select id from users where external_id = ${externalUserId} limit 1
  `);
  return result.rows[0]?.id ?? null;
}

export async function loadOwnedMemoryPreferences(
  externalUserId: string,
  db: QueryDb = getDatabaseClient()
): Promise<PersistedMemoryPreferences> {
  const result = await db.execute<{
    automaticMemoryEnabled: boolean;
    conversationMemoryEnabled: boolean;
    memoryEnabled: boolean;
    paused: boolean;
    projectMemoryEnabled: boolean;
    sensitiveMemoryAllowed: boolean;
    updatedAt: Date;
    userMemoryEnabled: boolean;
  }>(sql`
    select preferences.memory_enabled as "memoryEnabled",
      preferences.automatic_memory_enabled as "automaticMemoryEnabled",
      preferences.sensitive_memory_allowed as "sensitiveMemoryAllowed",
      preferences.paused,
      preferences.user_memory_enabled as "userMemoryEnabled",
      preferences.project_memory_enabled as "projectMemoryEnabled",
      preferences.conversation_memory_enabled as "conversationMemoryEnabled",
      preferences.updated_at as "updatedAt"
    from memory_preferences preferences
    inner join users on users.id = preferences.user_id
    where users.external_id = ${externalUserId}
    limit 1
  `);
  const row = result.rows[0];
  return row ? { ...row, updatedAt: new Date(row.updatedAt) } : { ...defaultMemoryPreferences };
}

export async function updateOwnedMemoryPreferences(
  externalUserId: string,
  patch: Partial<Omit<PersistedMemoryPreferences, "updatedAt">>,
  db: Db = getDatabaseClient()
): Promise<PersistedMemoryPreferences> {
  return db.transaction(async (tx) => {
    const userId = await ownedUserId(externalUserId, tx);
    if (!userId) throw new Error("MEMORY_USER_NOT_FOUND");
    const current = await loadOwnedMemoryPreferences(externalUserId, tx);
    const next = { ...current, ...patch };
    await tx.execute(sql`
      insert into memory_preferences (
        user_id, memory_enabled, automatic_memory_enabled, sensitive_memory_allowed,
        paused, user_memory_enabled, project_memory_enabled, conversation_memory_enabled
      ) values (
        ${userId}, ${next.memoryEnabled}, ${next.automaticMemoryEnabled}, ${next.sensitiveMemoryAllowed},
        ${next.paused}, ${next.userMemoryEnabled}, ${next.projectMemoryEnabled}, ${next.conversationMemoryEnabled}
      ) on conflict (user_id) do update set
        memory_enabled = excluded.memory_enabled,
        automatic_memory_enabled = excluded.automatic_memory_enabled,
        sensitive_memory_allowed = excluded.sensitive_memory_allowed,
        paused = excluded.paused,
        user_memory_enabled = excluded.user_memory_enabled,
        project_memory_enabled = excluded.project_memory_enabled,
        conversation_memory_enabled = excluded.conversation_memory_enabled,
        updated_at = now()
    `);
    return loadOwnedMemoryPreferences(externalUserId, tx);
  });
}

export async function listOwnedManagedProjectMemories(
  externalUserId: string,
  limit = 160,
  db: QueryDb = getDatabaseClient()
): Promise<ManagedProjectMemory[]> {
  const safeLimit = Math.max(1, Math.min(240, Math.trunc(limit)));
  const result = await db.execute<ManagedProjectMemory>(sql`
    select records.id, records.project_id as "projectId", projects.name as "projectName",
      records.conversation_id as "conversationId", sessions.title as "conversationTitle",
      records.category, records.title, records.content, records.status,
      records.source_type as "sourceType", records.created_at as "createdAt", records.updated_at as "updatedAt"
    from project_memory_records records
    inner join users on users.id = records.user_id
    inner join projects on projects.id = records.project_id
    inner join workspaces on workspaces.id = projects.workspace_id and workspaces.owner_id = users.id
    left join chat_sessions sessions on sessions.id = records.conversation_id
    where users.external_id = ${externalUserId} and records.status in ('active', 'resolved', 'superseded')
    order by records.updated_at desc, records.id asc
    limit ${safeLimit}
  `);
  return result.rows.map((row) => ({
    ...row,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt)
  }));
}

export async function listOwnedManagedConversationMemories(
  externalUserId: string,
  limit = 80,
  db: QueryDb = getDatabaseClient()
): Promise<ManagedConversationMemory[]> {
  const safeLimit = Math.max(1, Math.min(120, Math.trunc(limit)));
  const result = await db.execute<ManagedConversationMemory>(sql`
    select memories.conversation_id as "conversationId", memories.project_id as "projectId",
      projects.name as "projectName", memories.title, memories.summary, memories.status,
      memories.last_activity_at as "lastActivityAt"
    from conversation_memories memories
    inner join users on users.id = memories.user_id
    inner join projects on projects.id = memories.project_id
    inner join workspaces on workspaces.id = projects.workspace_id and workspaces.owner_id = users.id
    where users.external_id = ${externalUserId} and memories.status = 'active'
    order by memories.last_activity_at desc
    limit ${safeLimit}
  `);
  return result.rows.map((row) => ({ ...row, lastActivityAt: new Date(row.lastActivityAt) }));
}

export async function listOwnedManagedProjectEpisodes(
  externalUserId: string,
  limit = 80,
  db: QueryDb = getDatabaseClient()
): Promise<ManagedProjectEpisode[]> {
  const safeLimit = Math.max(1, Math.min(120, Math.trunc(limit)));
  const result = await db.execute<ManagedProjectEpisode>(sql`
    select episodes.project_id as "projectId", projects.name as "projectName", episodes.description,
      episodes.status, episodes.occurred_at as "occurredAt"
    from project_episodes episodes
    inner join users on users.id = episodes.user_id
    inner join projects on projects.id = episodes.project_id
    inner join workspaces on workspaces.id = projects.workspace_id and workspaces.owner_id = users.id
    where users.external_id = ${externalUserId}
    order by episodes.occurred_at desc
    limit ${safeLimit}
  `);
  return result.rows.map((row) => ({ ...row, occurredAt: new Date(row.occurredAt) }));
}

export async function loadOwnedMemorySnapshot(
  externalUserId: string,
  db: QueryDb = getDatabaseClient()
): Promise<OwnedMemorySnapshot> {
  const [preferences, userMemories, people, projectMemories, conversations, episodes] =
    await Promise.all([
      loadOwnedMemoryPreferences(externalUserId, db),
      listOwnedUserMemoryHistory(externalUserId, 200, db),
      listOwnedMemoryPeople(externalUserId, 120, db),
      listOwnedManagedProjectMemories(externalUserId, 200, db),
      listOwnedManagedConversationMemories(externalUserId, 100, db),
      listOwnedManagedProjectEpisodes(externalUserId, 100, db)
    ]);
  return { conversations, episodes, people, preferences, projectMemories, userMemories };
}

export async function editOwnedUserMemory(
  input: { externalUserId: string; memoryId: string; value: string },
  db: Db = getDatabaseClient()
) {
  return db.transaction(async (tx) => {
    const userId = await ownedUserId(input.externalUserId, tx);
    if (!userId) throw new Error("MEMORY_USER_NOT_FOUND");
    const current = await tx.execute<{
      captureMethod: string;
      category: string;
      confidenceBps: number;
      key: string;
      normalizedKey: string;
      personId: string | null;
      sensitivity: string;
    }>(sql`
      select capture_method as "captureMethod", category, confidence_bps as "confidenceBps", key,
        normalized_key as "normalizedKey", person_id as "personId", sensitivity
      from user_memory_records
      where id = ${input.memoryId} and user_id = ${userId} and status = 'active'
      limit 1 for update
    `);
    const record = current.rows[0];
    if (!record) throw new Error("MEMORY_NOT_FOUND");
    await tx.execute(
      sql`update user_memory_records set status = 'superseded', updated_at = now() where id = ${input.memoryId} and user_id = ${userId}`
    );
    const inserted = await tx.execute<{ id: string }>(sql`
      insert into user_memory_records (
        user_id, person_id, previous_record_id, category, key, normalized_key, value,
        normalized_value, sensitivity, confidence_bps, capture_method, source_type, source_message_id
      ) values (
        ${userId}, ${record.personId}, ${input.memoryId}, ${record.category}, ${record.key},
        ${record.normalizedKey}, ${input.value}, ${input.value
          .toLowerCase()
          .replace(/[^\p{L}\p{N}]+/gu, " ")
          .trim()},
        ${record.sensitivity}, ${Math.max(9900, Number(record.confidenceBps))}, 'explicit', 'memory_settings', null
      ) returning id
    `);
    return inserted.rows[0]?.id ?? null;
  });
}

export async function editOwnedProjectMemory(
  input: { externalUserId: string; memoryId: string; value: string },
  db: Db = getDatabaseClient()
) {
  return db.transaction(async (tx) => {
    const current = await tx.execute<{
      category: string;
      conversationId: string | null;
      importance: string;
      memoryType: string;
      normalizedKey: string;
      projectId: string;
      title: string;
      userId: string;
    }>(sql`
      select records.user_id as "userId", records.project_id as "projectId",
        records.conversation_id as "conversationId", records.memory_type as "memoryType",
        records.category, records.title, records.normalized_key as "normalizedKey", records.importance
      from project_memory_records records
      inner join users on users.id = records.user_id
      inner join projects on projects.id = records.project_id
      inner join workspaces on workspaces.id = projects.workspace_id and workspaces.owner_id = users.id
      where records.id = ${input.memoryId} and users.external_id = ${input.externalUserId} and records.status = 'active'
      limit 1 for update
    `);
    const record = current.rows[0];
    if (!record) throw new Error("PROJECT_MEMORY_NOT_FOUND");
    await tx.execute(
      sql`update project_memory_records set status = 'superseded', updated_at = now() where id = ${input.memoryId} and user_id = ${record.userId}`
    );
    const inserted = await tx.execute<{ id: string }>(sql`
      insert into project_memory_records (
        user_id, project_id, conversation_id, source_message_id, previous_record_id, memory_type,
        category, title, normalized_key, content, normalized_content, status, importance,
        confidence_bps, source_type, tags, provenance, effective_from
      ) values (
        ${record.userId}, ${record.projectId}, ${record.conversationId}, null, ${input.memoryId},
        ${record.memoryType}, ${record.category}, ${record.title}, ${record.normalizedKey}, ${input.value},
        ${input.value
          .toLowerCase()
          .replace(/[^\p{L}\p{N}]+/gu, " ")
          .trim()}, 'active',
        ${record.importance}, 9900, 'memory_settings', ${JSON.stringify([record.category])}::jsonb,
        ${JSON.stringify({ correctedByUser: true, source: "memory_settings", untrusted: true })}::jsonb, now()
      ) returning id
    `);
    return inserted.rows[0]?.id ?? null;
  });
}

async function scrubUserMemoryIds(userId: string, ids: string[], db: QueryDb) {
  if (!ids.length) return 0;
  const result = await db.execute<{ id: string }>(sql`
    update user_memory_records set status = 'forgotten', key = 'forgotten memory',
      normalized_key = 'forgotten memory', value = '[forgotten]', normalized_value = 'forgotten',
      person_id = null, source_message_id = null, forgotten_at = now(), updated_at = now()
    where user_id = ${userId} and id in (${sql.join(
      ids.map((id) => sql`${id}`),
      sql`, `
    )})
      and status <> 'forgotten'
    returning id
  `);
  return result.rows.length;
}

export async function forgetOwnedUserMemoryById(
  externalUserId: string,
  memoryId: string,
  db: Db = getDatabaseClient()
) {
  return db.transaction(async (tx) => {
    const userId = await ownedUserId(externalUserId, tx);
    if (!userId) throw new Error("MEMORY_USER_NOT_FOUND");
    const target = await tx.execute<{ normalizedKey: string; personId: string | null }>(sql`
      select normalized_key as "normalizedKey", person_id as "personId"
      from user_memory_records where id = ${memoryId} and user_id = ${userId} limit 1 for update
    `);
    const found = target.rows[0];
    if (!found) return 0;
    const chain = await tx.execute<{ id: string }>(sql`
      select id from user_memory_records where user_id = ${userId}
        and normalized_key = ${found.normalizedKey}
        and person_id is not distinct from ${found.personId}
      for update
    `);
    return scrubUserMemoryIds(
      userId,
      chain.rows.map((row) => row.id),
      tx
    );
  });
}

export async function forgetOwnedPersonById(
  externalUserId: string,
  personId: string,
  db: Db = getDatabaseClient()
) {
  return db.transaction(async (tx) => {
    const userId = await ownedUserId(externalUserId, tx);
    if (!userId) throw new Error("MEMORY_USER_NOT_FOUND");
    const person = await tx.execute<{ id: string }>(
      sql`select id from memory_people where id = ${personId} and user_id = ${userId} limit 1 for update`
    );
    if (!person.rows[0]) return 0;
    const records = await tx.execute<{ id: string }>(
      sql`select id from user_memory_records where user_id = ${userId} and person_id = ${personId} for update`
    );
    const removed = await scrubUserMemoryIds(
      userId,
      records.rows.map((row) => row.id),
      tx
    );
    await tx.execute(sql`delete from memory_people where id = ${personId} and user_id = ${userId}`);
    return removed || 1;
  });
}

export async function forgetOwnedProjectMemoryById(
  externalUserId: string,
  memoryId: string,
  db: Db = getDatabaseClient()
) {
  return db.transaction(async (tx) => {
    const target = await tx.execute<{
      normalizedKey: string;
      projectId: string;
      userId: string;
    }>(sql`
      select records.normalized_key as "normalizedKey", records.project_id as "projectId", records.user_id as "userId"
      from project_memory_records records
      inner join users on users.id = records.user_id
      inner join projects on projects.id = records.project_id
      inner join workspaces on workspaces.id = projects.workspace_id and workspaces.owner_id = users.id
      where records.id = ${memoryId} and users.external_id = ${externalUserId}
      limit 1 for update
    `);
    const owned = target.rows[0];
    if (!owned) return 0;
    const removed = await tx.execute<{ id: string }>(sql`
      delete from project_memory_records
      where user_id = ${owned.userId} and project_id = ${owned.projectId}
        and normalized_key = ${owned.normalizedKey}
      returning id
    `);
    return removed.rows.length;
  });
}

export async function clearOwnedProjectMemory(
  externalUserId: string,
  projectId: string,
  db: Db = getDatabaseClient()
) {
  return db.transaction(async (tx) => {
    const owned = await tx.execute<{ id: string; userId: string }>(sql`
      select projects.id, users.id as "userId" from projects
      inner join workspaces on workspaces.id = projects.workspace_id
      inner join users on users.id = workspaces.owner_id
      where projects.id = ${projectId} and users.external_id = ${externalUserId}
      limit 1 for update of projects
    `);
    const scope = owned.rows[0];
    if (!scope) throw new Error("PROJECT_MEMORY_SCOPE_NOT_OWNED");
    const records = await tx.execute<{ id: string }>(
      sql`delete from project_memory_records where project_id = ${projectId} and user_id = ${scope.userId} returning id`
    );
    const conversations = await tx.execute<{ id: string }>(
      sql`delete from conversation_memories where project_id = ${projectId} and user_id = ${scope.userId} returning id`
    );
    const episodes = await tx.execute<{ id: string }>(
      sql`delete from project_episodes where project_id = ${projectId} and user_id = ${scope.userId} returning id`
    );
    return records.rows.length + conversations.rows.length + episodes.rows.length;
  });
}

export async function clearOwnedConversationMemory(
  externalUserId: string,
  conversationId: string,
  db: Db = getDatabaseClient()
) {
  return db.transaction(async (tx) => {
    const scope = await tx.execute<{ projectId: string; userId: string }>(sql`
      select sessions.project_id as "projectId", users.id as "userId" from chat_sessions sessions
      inner join projects on projects.id = sessions.project_id
      inner join workspaces on workspaces.id = projects.workspace_id
      inner join users on users.id = workspaces.owner_id and users.id = sessions.user_id
      where sessions.id = ${conversationId} and users.external_id = ${externalUserId}
      limit 1 for update of sessions
    `);
    const owned = scope.rows[0];
    if (!owned) throw new Error("CONVERSATION_MEMORY_SCOPE_NOT_OWNED");
    const records = await tx.execute<{ id: string }>(
      sql`delete from project_memory_records where conversation_id = ${conversationId} and user_id = ${owned.userId} returning id`
    );
    const conversations = await tx.execute<{ id: string }>(
      sql`delete from conversation_memories where conversation_id = ${conversationId} and user_id = ${owned.userId} returning id`
    );
    const episodes = await tx.execute<{ id: string }>(
      sql`delete from project_episodes where conversation_id = ${conversationId} and user_id = ${owned.userId} returning id`
    );
    return records.rows.length + conversations.rows.length + episodes.rows.length;
  });
}

export async function clearAllOwnedDerivedMemory(
  externalUserId: string,
  db: Db = getDatabaseClient()
) {
  return db.transaction(async (tx) => {
    const userId = await ownedUserId(externalUserId, tx);
    if (!userId) throw new Error("MEMORY_USER_NOT_FOUND");
    const userRecords = await tx.execute<{ id: string }>(
      sql`select id from user_memory_records where user_id = ${userId} and status <> 'forgotten' for update`
    );
    const userRemoved = await scrubUserMemoryIds(
      userId,
      userRecords.rows.map((row) => row.id),
      tx
    );
    await tx.execute(sql`delete from memory_people where user_id = ${userId}`);
    const project = await tx.execute<{ id: string }>(
      sql`delete from project_memory_records where user_id = ${userId} returning id`
    );
    const conversations = await tx.execute<{ id: string }>(
      sql`delete from conversation_memories where user_id = ${userId} returning id`
    );
    const episodes = await tx.execute<{ id: string }>(
      sql`delete from project_episodes where user_id = ${userId} returning id`
    );
    return userRemoved + project.rows.length + conversations.rows.length + episodes.rows.length;
  });
}
