import { sql } from "drizzle-orm";
import { getDatabaseClient, type DatabaseClient } from "./client";

type Db = DatabaseClient;
type QueryDb = Pick<Db, "execute">;

export type PersistedProjectMemoryRecord = {
  category: string;
  confidenceBps: number;
  content: string;
  conversationId: string | null;
  createdAt: Date;
  id: string;
  importance: string;
  memoryType: string;
  normalizedKey: string;
  projectId: string;
  projectName: string;
  sourceMessageId: string | null;
  status: string;
  title: string;
  updatedAt: Date;
};

export type PersistedConversationMemory = {
  checkpoints: string[];
  conversationId: string;
  firstSourceMessageId: string | null;
  importantReferences: string[];
  keyDecisions: string[];
  lastActivityAt: Date;
  lastSourceMessageId: string | null;
  projectId: string;
  revision: number;
  sourceFingerprint: string;
  sourceMessageCount: number;
  startedAt: Date;
  summary: string;
  title: string;
  unresolvedItems: string[];
};

export type PersistedProjectEpisode = {
  checkpoint: string | null;
  conversationId: string | null;
  description: string;
  eventType: string;
  id: string;
  importance: string;
  occurredAt: Date;
  outcome: string | null;
  projectId: string;
  sourceMessageId: string | null;
  status: string;
};

type OwnedScope = { projectId: string; userId: string };
type ProjectMemoryRow = {
  category: string; confidenceBps: number; content: string; conversationId: string | null; createdAt: Date;
  id: string; importance: string; memoryType: string; normalizedKey: string; projectId: string;
  projectName: string; sourceMessageId: string | null; status: string; title: string; updatedAt: Date;
};
type ConversationMemoryRow = {
  checkpoints: unknown; conversationId: string; firstSourceMessageId: string | null; importantReferences: unknown;
  keyDecisions: unknown; lastActivityAt: Date; lastSourceMessageId: string | null; projectId: string;
  revision: number; sourceFingerprint: string; sourceMessageCount: number; startedAt: Date; summary: string;
  title: string; unresolvedItems: unknown;
};
type ProjectEpisodeRow = {
  checkpoint: string | null; conversationId: string | null; description: string; eventType: string; id: string;
  importance: string; occurredAt: Date; outcome: string | null; projectId: string;
  sourceMessageId: string | null; status: string;
};

async function requireOwnedScope(
  input: { conversationId?: string | null; externalUserId: string; projectId: string; sourceMessageId?: string | null },
  db: QueryDb
): Promise<OwnedScope> {
  const result = await db.execute<{ projectId: string; userId: string }>(sql`
    select projects.id as "projectId", users.id as "userId"
    from projects
    inner join workspaces on workspaces.id = projects.workspace_id
    inner join users on users.id = workspaces.owner_id
    where projects.id = ${input.projectId}
      and users.external_id = ${input.externalUserId}
      and (${input.conversationId ?? null}::uuid is null or exists (
        select 1 from chat_sessions
        where chat_sessions.id = ${input.conversationId ?? null}
          and chat_sessions.project_id = projects.id
          and chat_sessions.user_id = users.id
      ))
      and (${input.sourceMessageId ?? null}::uuid is null or exists (
        select 1 from chat_messages
        inner join chat_sessions source_session on source_session.id = chat_messages.session_id
        where chat_messages.id = ${input.sourceMessageId ?? null}
          and chat_messages.user_id = users.id
          and source_session.project_id = projects.id
          and (${input.conversationId ?? null}::uuid is null or source_session.id = ${input.conversationId ?? null})
      ))
    limit 1
  `);
  const scope = result.rows[0];
  if (!scope) throw new Error("PROJECT_MEMORY_SCOPE_NOT_OWNED");
  return scope;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function mapRecord(row: ProjectMemoryRow): PersistedProjectMemoryRecord {
  return {
    category: String(row.category), confidenceBps: Number(row.confidenceBps), content: String(row.content),
    conversationId: row.conversationId ? String(row.conversationId) : null, createdAt: new Date(row.createdAt),
    id: String(row.id), importance: String(row.importance), memoryType: String(row.memoryType),
    normalizedKey: String(row.normalizedKey), projectId: String(row.projectId), projectName: String(row.projectName),
    sourceMessageId: row.sourceMessageId ? String(row.sourceMessageId) : null, status: String(row.status),
    title: String(row.title), updatedAt: new Date(row.updatedAt)
  };
}

async function loadOwnedProjectMemoryById(input: { externalUserId: string; id: string; projectId: string }, db: QueryDb) {
  const result = await db.execute<ProjectMemoryRow>(sql`
    select records.id, records.project_id as "projectId", projects.name as "projectName",
      records.conversation_id as "conversationId", records.source_message_id as "sourceMessageId",
      records.memory_type as "memoryType", records.category, records.title,
      records.normalized_key as "normalizedKey", records.content, records.status, records.importance,
      records.confidence_bps as "confidenceBps", records.created_at as "createdAt", records.updated_at as "updatedAt"
    from project_memory_records records
    inner join projects on projects.id = records.project_id
    inner join workspaces on workspaces.id = projects.workspace_id
    inner join users on users.id = workspaces.owner_id and users.id = records.user_id
    where users.external_id = ${input.externalUserId} and projects.id = ${input.projectId} and records.id = ${input.id}
    limit 1
  `);
  return result.rows[0] ? mapRecord(result.rows[0]) : null;
}

export async function persistOwnedProjectMemory(input: {
  category: string;
  confidenceBps: number;
  content: string;
  conversationId?: string | null;
  externalUserId: string;
  importance: string;
  memoryType: string;
  normalizedContent: string;
  normalizedKey: string;
  projectId: string;
  sourceMessageId?: string | null;
  sourceType?: string;
  status?: string;
  tags?: string[];
  title: string;
}, db: Db = getDatabaseClient()): Promise<{ action: "created" | "deduplicated" | "updated"; record: PersistedProjectMemoryRecord }> {
  return db.transaction(async (tx) => {
    const scope = await requireOwnedScope(input, tx);
    const existing = await tx.execute<{ id: string; normalizedContent: string }>(sql`
      select id, normalized_content as "normalizedContent"
      from project_memory_records
      where user_id = ${scope.userId} and project_id = ${scope.projectId}
        and normalized_key = ${input.normalizedKey} and status = 'active'
      order by updated_at desc limit 1 for update
    `);
    const current = existing.rows[0] ?? null;
    if (current?.normalizedContent === input.normalizedContent) {
      await tx.execute(sql`
        update project_memory_records
        set confidence_bps = greatest(confidence_bps, ${input.confidenceBps}),
            source_message_id = coalesce(${input.sourceMessageId ?? null}, source_message_id), updated_at = now()
        where id = ${current.id} and user_id = ${scope.userId}
      `);
      const found = await loadOwnedProjectMemoryById({ externalUserId: input.externalUserId, id: current.id, projectId: input.projectId }, tx);
      if (!found) throw new Error("PROJECT_MEMORY_DEDUPE_FAILED");
      return { action: "deduplicated" as const, record: found };
    }
    if (current) {
      await tx.execute(sql`update project_memory_records set status = 'superseded', updated_at = now() where id = ${current.id} and user_id = ${scope.userId}`);
    }
    const inserted = await tx.execute<{ id: string }>(sql`
      insert into project_memory_records (
        user_id, project_id, conversation_id, source_message_id, previous_record_id, memory_type,
        category, title, normalized_key, content, normalized_content, status, importance,
        confidence_bps, source_type, tags, provenance
      ) values (
        ${scope.userId}, ${scope.projectId}, ${input.conversationId ?? null}, ${input.sourceMessageId ?? null},
        ${current?.id ?? null}, ${input.memoryType}, ${input.category}, ${input.title}, ${input.normalizedKey},
        ${input.content}, ${input.normalizedContent}, ${input.status ?? "active"}, ${input.importance},
        ${input.confidenceBps}, ${input.sourceType ?? "user_message"}, ${JSON.stringify(input.tags ?? [])}::jsonb,
        ${JSON.stringify({ source: input.sourceType ?? "user_message", untrusted: true })}::jsonb
      ) returning id
    `);
    const insertedId = inserted.rows[0]?.id;
    const record = insertedId ? await loadOwnedProjectMemoryById({ externalUserId: input.externalUserId, id: insertedId, projectId: input.projectId }, tx) : null;
    if (!record) throw new Error("PROJECT_MEMORY_WRITE_FAILED");
    return { action: current ? "updated" as const : "created" as const, record };
  });
}

export async function listOwnedProjectMemories(input: {
  category?: string;
  externalUserId: string;
  includeSuperseded?: boolean;
  limit?: number;
  projectId: string;
  query?: string;
}, db: QueryDb = getDatabaseClient()): Promise<PersistedProjectMemoryRecord[]> {
  const limit = Math.max(1, Math.min(40, Math.trunc(input.limit ?? 12)));
  const query = input.query?.replace(/\s+/g, " ").trim().slice(0, 120) ?? "";
  const pattern = `%${query}%`;
  const result = await db.execute<ProjectMemoryRow>(sql`
    select records.id, records.project_id as "projectId", projects.name as "projectName",
      records.conversation_id as "conversationId", records.source_message_id as "sourceMessageId",
      records.memory_type as "memoryType", records.category, records.title,
      records.normalized_key as "normalizedKey", records.content, records.status, records.importance,
      records.confidence_bps as "confidenceBps", records.created_at as "createdAt", records.updated_at as "updatedAt"
    from project_memory_records records
    inner join projects on projects.id = records.project_id
    inner join workspaces on workspaces.id = projects.workspace_id
    inner join users on users.id = workspaces.owner_id and users.id = records.user_id
    where users.external_id = ${input.externalUserId} and projects.id = ${input.projectId}
      and (${input.includeSuperseded ?? false} or records.status = 'active')
      and (${input.category ?? ""} = '' or records.category = ${input.category ?? ""})
      and (${query} = '' or records.normalized_key ilike ${pattern} or records.normalized_content ilike ${pattern} or records.title ilike ${pattern})
    order by
      case records.importance when 'critical' then 0 when 'high' then 1 when 'normal' then 2 else 3 end,
      case when records.status = 'active' then 0 else 1 end,
      records.updated_at desc
    limit ${limit}
  `);
  return result.rows.map(mapRecord);
}

export async function searchOwnedProjectMemories(input: {
  externalUserId: string;
  limit?: number;
  query: string;
}, db: QueryDb = getDatabaseClient()): Promise<PersistedProjectMemoryRecord[]> {
  const limit = Math.max(1, Math.min(30, Math.trunc(input.limit ?? 12)));
  const query = input.query.replace(/\s+/g, " ").trim().slice(0, 120);
  if (query.length < 2) return [];
  const pattern = `%${query}%`;
  const result = await db.execute<ProjectMemoryRow>(sql`
    select records.id, records.project_id as "projectId", projects.name as "projectName",
      records.conversation_id as "conversationId", records.source_message_id as "sourceMessageId",
      records.memory_type as "memoryType", records.category, records.title,
      records.normalized_key as "normalizedKey", records.content, records.status, records.importance,
      records.confidence_bps as "confidenceBps", records.created_at as "createdAt", records.updated_at as "updatedAt"
    from project_memory_records records
    inner join projects on projects.id = records.project_id
    inner join workspaces on workspaces.id = projects.workspace_id
    inner join users on users.id = workspaces.owner_id and users.id = records.user_id
    where users.external_id = ${input.externalUserId} and records.status = 'active'
      and (records.normalized_key ilike ${pattern} or records.normalized_content ilike ${pattern} or records.title ilike ${pattern})
    order by records.updated_at desc limit ${limit}
  `);
  return result.rows.map(mapRecord);
}

export async function loadOwnedConversationMemory(input: { conversationId: string; externalUserId: string; projectId: string }, db: QueryDb = getDatabaseClient()): Promise<PersistedConversationMemory | null> {
  await requireOwnedScope(input, db);
  const result = await db.execute<ConversationMemoryRow>(sql`
    select conversation_id as "conversationId", project_id as "projectId", title, summary,
      key_decisions as "keyDecisions", unresolved_items as "unresolvedItems",
      important_references as "importantReferences", checkpoints,
      first_source_message_id as "firstSourceMessageId", last_source_message_id as "lastSourceMessageId",
      source_message_count as "sourceMessageCount", source_fingerprint as "sourceFingerprint", revision,
      started_at as "startedAt", last_activity_at as "lastActivityAt"
    from conversation_memories where conversation_id = ${input.conversationId} limit 1
  `);
  const row = result.rows[0];
  return row ? { ...row, checkpoints: strings(row.checkpoints), importantReferences: strings(row.importantReferences), keyDecisions: strings(row.keyDecisions), unresolvedItems: strings(row.unresolvedItems), lastActivityAt: new Date(row.lastActivityAt), startedAt: new Date(row.startedAt), revision: Number(row.revision), sourceMessageCount: Number(row.sourceMessageCount) } : null;
}

export async function listOwnedConversationMessagesAfter(input: { conversationId: string; externalUserId: string; limit?: number; offset: number; projectId: string }, db: QueryDb = getDatabaseClient()) {
  await requireOwnedScope(input, db);
  const limit = Math.max(1, Math.min(40, Math.trunc(input.limit ?? 24)));
  const offset = Math.max(0, Math.trunc(input.offset));
  const result = await db.execute<{ content: string; createdAt: Date; id: string; role: "assistant" | "user" }>(sql`
    select chat_messages.id, chat_messages.role::text as role, chat_messages.content, chat_messages.created_at as "createdAt"
    from chat_messages where chat_messages.session_id = ${input.conversationId}
    order by chat_messages.created_at asc, chat_messages.id asc offset ${offset} limit ${limit}
  `);
  return result.rows;
}

export async function upsertOwnedConversationMemory(input: {
  checkpoints: string[]; conversationId: string; externalUserId: string; firstSourceMessageId: string | null;
  importantReferences: string[]; keyDecisions: string[]; lastActivityAt: Date; lastSourceMessageId: string | null;
  projectId: string; sourceFingerprint: string; sourceMessageCount: number; startedAt: Date; summary: string;
  title: string; unresolvedItems: string[];
}, db: Db = getDatabaseClient()): Promise<PersistedConversationMemory> {
  return db.transaction(async (tx) => {
    const scope = await requireOwnedScope(input, tx);
    await tx.execute(sql`
      insert into conversation_memories (
        user_id, project_id, conversation_id, title, summary, key_decisions, unresolved_items,
        important_references, checkpoints, first_source_message_id, last_source_message_id,
        source_message_count, source_fingerprint, started_at, last_activity_at
      ) values (
        ${scope.userId}, ${scope.projectId}, ${input.conversationId},
        (select title from chat_sessions where id = ${input.conversationId}), ${input.summary},
        ${JSON.stringify(input.keyDecisions)}::jsonb, ${JSON.stringify(input.unresolvedItems)}::jsonb,
        ${JSON.stringify(input.importantReferences)}::jsonb, ${JSON.stringify(input.checkpoints)}::jsonb,
        ${input.firstSourceMessageId}, ${input.lastSourceMessageId}, ${input.sourceMessageCount},
        ${input.sourceFingerprint},
        (select created_at from chat_sessions where id = ${input.conversationId}), ${input.lastActivityAt}
      ) on conflict (conversation_id) do update set
        title = excluded.title, summary = excluded.summary, key_decisions = excluded.key_decisions,
        unresolved_items = excluded.unresolved_items, important_references = excluded.important_references,
        checkpoints = excluded.checkpoints, first_source_message_id = coalesce(conversation_memories.first_source_message_id, excluded.first_source_message_id),
        last_source_message_id = excluded.last_source_message_id, source_message_count = excluded.source_message_count,
        source_fingerprint = excluded.source_fingerprint, revision = conversation_memories.revision + 1,
        last_activity_at = excluded.last_activity_at, updated_at = now()
    `);
    const memory = await loadOwnedConversationMemory(input, tx);
    if (!memory) throw new Error("CONVERSATION_MEMORY_WRITE_FAILED");
    return memory;
  });
}

export async function listOwnedConversationMemories(input: { externalUserId: string; limit?: number; projectId: string }, db: QueryDb = getDatabaseClient()): Promise<PersistedConversationMemory[]> {
  await requireOwnedScope(input, db);
  const limit = Math.max(1, Math.min(12, Math.trunc(input.limit ?? 5)));
  const result = await db.execute<ConversationMemoryRow>(sql`
    select conversation_id as "conversationId", project_id as "projectId", title, summary,
      key_decisions as "keyDecisions", unresolved_items as "unresolvedItems", important_references as "importantReferences",
      checkpoints, first_source_message_id as "firstSourceMessageId", last_source_message_id as "lastSourceMessageId",
      source_message_count as "sourceMessageCount", source_fingerprint as "sourceFingerprint", revision,
      started_at as "startedAt", last_activity_at as "lastActivityAt"
    from conversation_memories where user_id = (select id from users where external_id = ${input.externalUserId})
      and project_id = ${input.projectId} and status = 'active'
    order by last_activity_at desc limit ${limit}
  `);
  return result.rows.map((row) => ({ ...row, checkpoints: strings(row.checkpoints), importantReferences: strings(row.importantReferences), keyDecisions: strings(row.keyDecisions), unresolvedItems: strings(row.unresolvedItems), lastActivityAt: new Date(row.lastActivityAt), startedAt: new Date(row.startedAt), revision: Number(row.revision), sourceMessageCount: Number(row.sourceMessageCount) }));
}

export async function persistOwnedProjectEpisode(input: {
  checkpoint?: string | null; conversationId?: string | null; description: string; eventType: string;
  externalUserId: string; importance: string; outcome?: string | null; projectId: string;
  sourceMessageId?: string | null; status: "failed" | "partial" | "resolved" | "verified";
}, db: Db = getDatabaseClient()): Promise<PersistedProjectEpisode> {
  const scope = await requireOwnedScope(input, db);
  const inserted = await db.execute<ProjectEpisodeRow>(sql`
    insert into project_episodes (user_id, project_id, conversation_id, source_message_id, event_type, description, outcome, status, importance, checkpoint, provenance)
    values (${scope.userId}, ${scope.projectId}, ${input.conversationId ?? null}, ${input.sourceMessageId ?? null}, ${input.eventType}, ${input.description}, ${input.outcome ?? null}, ${input.status}, ${input.importance}, ${input.checkpoint ?? null}, ${JSON.stringify({ verified: input.status === "verified", untrusted: true })}::jsonb)
    returning id, project_id as "projectId", conversation_id as "conversationId", source_message_id as "sourceMessageId",
      event_type as "eventType", description, outcome, status, importance, checkpoint, occurred_at as "occurredAt"
  `);
  const row = inserted.rows[0];
  if (!row) throw new Error("PROJECT_EPISODE_WRITE_FAILED");
  return { ...row, occurredAt: new Date(row.occurredAt) };
}

export async function listOwnedProjectEpisodes(input: { externalUserId: string; limit?: number; projectId: string }, db: QueryDb = getDatabaseClient()): Promise<PersistedProjectEpisode[]> {
  await requireOwnedScope(input, db);
  const limit = Math.max(1, Math.min(20, Math.trunc(input.limit ?? 8)));
  const result = await db.execute<ProjectEpisodeRow>(sql`
    select episodes.id, episodes.project_id as "projectId", episodes.conversation_id as "conversationId",
      episodes.source_message_id as "sourceMessageId", episodes.event_type as "eventType", episodes.description,
      episodes.outcome, episodes.status, episodes.importance, episodes.checkpoint, episodes.occurred_at as "occurredAt"
    from project_episodes episodes inner join users on users.id = episodes.user_id
    where users.external_id = ${input.externalUserId} and episodes.project_id = ${input.projectId}
    order by episodes.occurred_at desc limit ${limit}
  `);
  return result.rows.map((row) => ({ ...row, occurredAt: new Date(row.occurredAt) }));
}
