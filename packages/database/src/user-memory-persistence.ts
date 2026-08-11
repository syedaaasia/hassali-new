import { sql } from "drizzle-orm";
import { getDatabaseClient, type DatabaseClient } from "./client";

type Db = DatabaseClient;
type QueryDb = Pick<Db, "execute">;

export type PersistedMemoryPerson = {
  aliases: string[];
  canonicalName: string;
  id: string;
  normalizedName: string;
  relationship: string | null;
};

export type PersistedUserMemoryRecord = {
  captureMethod: string;
  category: string;
  confidenceBps: number;
  createdAt: Date;
  id: string;
  key: string;
  normalizedKey: string;
  person: PersistedMemoryPerson | null;
  sensitivity: string;
  sourceMessageId: string | null;
  sourceType: string;
  status: "active" | "superseded";
  updatedAt: Date;
  value: string;
};

export type PersistOwnedUserMemoryInput = {
  captureMethod: "automatic" | "explicit";
  category: string;
  confidenceBps: number;
  externalUserId: string;
  key: string;
  normalizedKey: string;
  normalizedValue: string;
  person?: {
    aliases: string[];
    canonicalName: string;
    normalizedName: string;
    normalizedRelationship: string | null;
    relationship: string | null;
  } | null;
  sensitivity: "sensitive" | "standard";
  sourceMessageId?: string | null;
  value: string;
};

function mapMemoryRow(row: {
  aliases: unknown;
  canonicalName: string | null;
  captureMethod: string;
  category: string;
  confidenceBps: number;
  createdAt: Date;
  id: string;
  key: string;
  normalizedKey: string;
  normalizedName: string | null;
  personId: string | null;
  relationship: string | null;
  sensitivity: string;
  sourceMessageId: string | null;
  sourceType: string;
  status: "active" | "superseded";
  updatedAt: Date;
  value: string;
}): PersistedUserMemoryRecord {
  return {
    captureMethod: row.captureMethod,
    category: row.category,
    confidenceBps: Number(row.confidenceBps),
    createdAt: new Date(row.createdAt),
    id: row.id,
    key: row.key,
    normalizedKey: row.normalizedKey,
    person: row.personId && row.canonicalName && row.normalizedName
      ? {
          aliases: Array.isArray(row.aliases) ? row.aliases.filter((value): value is string => typeof value === "string") : [],
          canonicalName: row.canonicalName,
          id: row.personId,
          normalizedName: row.normalizedName,
          relationship: row.relationship
        }
      : null,
    sensitivity: row.sensitivity,
    sourceMessageId: row.sourceMessageId,
    sourceType: row.sourceType,
    status: row.status,
    updatedAt: new Date(row.updatedAt),
    value: row.value
  };
}

export async function listOwnedUserMemories(
  externalUserId: string,
  limit = 100,
  db: QueryDb = getDatabaseClient()
): Promise<PersistedUserMemoryRecord[]> {
  const safeLimit = Math.max(1, Math.min(200, Math.trunc(limit)));
  const result = await db.execute<Parameters<typeof mapMemoryRow>[0]>(sql`
    select
      records.id,
      records.category,
      records.key,
      records.normalized_key as "normalizedKey",
      records.value,
      records.sensitivity,
      records.confidence_bps as "confidenceBps",
      records.capture_method as "captureMethod",
      records.source_type as "sourceType",
      records.status,
      records.source_message_id as "sourceMessageId",
      records.created_at as "createdAt",
      records.updated_at as "updatedAt",
      people.id as "personId",
      people.canonical_name as "canonicalName",
      people.normalized_name as "normalizedName",
      people.aliases,
      people.relationship
    from user_memory_records records
    inner join users on users.id = records.user_id
    left join memory_people people on people.id = records.person_id
    where users.external_id = ${externalUserId}
      and records.status = 'active'
      and (records.expires_at is null or records.expires_at > now())
    order by records.updated_at desc, records.id asc
    limit ${safeLimit}
  `);
  return result.rows.map(mapMemoryRow);
}

export async function listOwnedUserMemoryHistory(
  externalUserId: string,
  limit = 120,
  db: QueryDb = getDatabaseClient()
): Promise<PersistedUserMemoryRecord[]> {
  const safeLimit = Math.max(1, Math.min(200, Math.trunc(limit)));
  const result = await db.execute<Parameters<typeof mapMemoryRow>[0]>(sql`
    select
      records.id,
      records.category,
      records.key,
      records.normalized_key as "normalizedKey",
      records.value,
      records.sensitivity,
      records.confidence_bps as "confidenceBps",
      records.capture_method as "captureMethod",
      records.source_type as "sourceType",
      records.source_message_id as "sourceMessageId",
      records.status,
      records.created_at as "createdAt",
      records.updated_at as "updatedAt",
      people.id as "personId",
      people.canonical_name as "canonicalName",
      people.normalized_name as "normalizedName",
      people.aliases,
      people.relationship
    from user_memory_records records
    inner join users on users.id = records.user_id
    left join memory_people people on people.id = records.person_id
    where users.external_id = ${externalUserId}
      and records.status in ('active', 'superseded')
      and (records.expires_at is null or records.expires_at > now())
    order by records.created_at desc, records.id asc
    limit ${safeLimit}
  `);
  return result.rows.map(mapMemoryRow);
}

export async function listOwnedMemoryPeople(
  externalUserId: string,
  limit = 80,
  db: QueryDb = getDatabaseClient()
): Promise<PersistedMemoryPerson[]> {
  const safeLimit = Math.max(1, Math.min(160, Math.trunc(limit)));
  const result = await db.execute<{
    aliases: unknown;
    canonicalName: string;
    id: string;
    normalizedName: string;
    relationship: string | null;
  }>(sql`
    select
      people.id,
      people.canonical_name as "canonicalName",
      people.normalized_name as "normalizedName",
      people.aliases,
      people.relationship
    from memory_people people
    inner join users on users.id = people.user_id
    where users.external_id = ${externalUserId}
    order by people.updated_at desc, people.id asc
    limit ${safeLimit}
  `);
  return result.rows.map((row) => ({
    ...row,
    aliases: Array.isArray(row.aliases) ? row.aliases.filter((value): value is string => typeof value === "string") : []
  }));
}

export async function persistOwnedUserMemory(
  input: PersistOwnedUserMemoryInput,
  db: Db = getDatabaseClient()
): Promise<{ action: "created" | "deduplicated" | "updated"; record: PersistedUserMemoryRecord }> {
  return db.transaction(async (tx) => {
    const owner = await tx.execute<{ id: string }>(sql`
      select id from users where external_id = ${input.externalUserId} limit 1 for update
    `);
    const userId = owner.rows[0]?.id;
    if (!userId) throw new Error("MEMORY_USER_NOT_FOUND");

    let sourceMessageId: string | null = null;
    if (input.sourceMessageId) {
      const ownedMessage = await tx.execute<{ id: string }>(sql`
        select id
        from chat_messages
        where id = ${input.sourceMessageId}
          and user_id = ${userId}
        limit 1
      `);
      sourceMessageId = ownedMessage.rows[0]?.id ?? null;
    }

    let personId: string | null = null;
    if (input.person) {
      const existingPeople = await tx.execute<{ aliases: unknown; id: string }>(sql`
        select id, aliases
        from memory_people
        where user_id = ${userId}
          and normalized_name = ${input.person.normalizedName}
          and normalized_relationship is not distinct from ${input.person.normalizedRelationship}
        order by created_at asc
        limit 2
        for update
      `);
      const existingPerson = existingPeople.rows.length === 1 ? existingPeople.rows[0] : null;
      if (existingPerson) {
        personId = existingPerson.id;
        const aliases = new Set([
          ...(Array.isArray(existingPerson.aliases) ? existingPerson.aliases.filter((value): value is string => typeof value === "string") : []),
          ...input.person.aliases
        ]);
        await tx.execute(sql`
          update memory_people
          set aliases = ${JSON.stringify([...aliases])}::jsonb,
              canonical_name = ${input.person.canonicalName},
              relationship = ${input.person.relationship},
              updated_at = now()
          where id = ${personId} and user_id = ${userId}
        `);
      } else {
        const inserted = await tx.execute<{ id: string }>(sql`
          insert into memory_people (
            user_id, canonical_name, normalized_name, aliases, relationship, normalized_relationship
          ) values (
            ${userId}, ${input.person.canonicalName}, ${input.person.normalizedName},
            ${JSON.stringify(input.person.aliases)}::jsonb, ${input.person.relationship},
            ${input.person.normalizedRelationship}
          )
          returning id
        `);
        personId = inserted.rows[0]?.id ?? null;
      }
    }

    const existing = await tx.execute<{ id: string; normalizedValue: string }>(sql`
      select id, normalized_value as "normalizedValue"
      from user_memory_records
      where user_id = ${userId}
        and normalized_key = ${input.normalizedKey}
        and status = 'active'
        and person_id is not distinct from ${personId}
      order by updated_at desc
      limit 1
      for update
    `);
    const current = existing.rows[0] ?? null;
    if (current?.normalizedValue === input.normalizedValue) {
      await tx.execute(sql`
        update user_memory_records
        set confidence_bps = greatest(confidence_bps, ${input.confidenceBps}),
            source_message_id = coalesce(${sourceMessageId}, source_message_id),
            updated_at = now()
        where id = ${current.id} and user_id = ${userId}
      `);
      const deduplicated = (await listOwnedUserMemories(input.externalUserId, 200, tx))
        .find((item) => item.id === current.id);
      if (!deduplicated) throw new Error("MEMORY_DEDUPLICATION_FAILED");
      return { action: "deduplicated" as const, record: deduplicated };
    }

    if (current) {
      await tx.execute(sql`
        update user_memory_records
        set status = 'superseded', updated_at = now()
        where id = ${current.id} and user_id = ${userId}
      `);
    }

    const inserted = await tx.execute<{ id: string }>(sql`
      insert into user_memory_records (
        user_id, person_id, previous_record_id, category, key, normalized_key, value,
        normalized_value, sensitivity, confidence_bps, capture_method, source_type,
        source_message_id
      ) values (
        ${userId}, ${personId}, ${current?.id ?? null}, ${input.category}, ${input.key},
        ${input.normalizedKey}, ${input.value}, ${input.normalizedValue}, ${input.sensitivity},
        ${input.confidenceBps}, ${input.captureMethod}, 'user_message', ${sourceMessageId}
      )
      returning id
    `);
    const insertedId = inserted.rows[0]?.id;
    const record = (await listOwnedUserMemories(input.externalUserId, 200, tx))
      .find((item) => item.id === insertedId);
    if (!record) throw new Error("MEMORY_WRITE_FAILED");
    return { action: current ? "updated" as const : "created" as const, record };
  });
}

export async function forgetOwnedUserMemory(
  input: {
    externalUserId: string;
    mode: "all" | "key" | "person";
    normalizedTarget?: string;
  },
  db: Db = getDatabaseClient()
): Promise<number> {
  return db.transaction(async (tx) => {
    const owner = await tx.execute<{ id: string }>(sql`
      select id from users where external_id = ${input.externalUserId} limit 1 for update
    `);
    const userId = owner.rows[0]?.id;
    if (!userId) throw new Error("MEMORY_USER_NOT_FOUND");

    if (input.mode === "all") {
      const forgotten = await tx.execute<{ id: string }>(sql`
        update user_memory_records
        set status = 'forgotten',
            key = 'forgotten memory',
            normalized_key = 'forgotten memory',
            value = '[forgotten]',
            normalized_value = 'forgotten',
            person_id = null,
            source_message_id = null,
            forgotten_at = now(),
            updated_at = now()
        where user_id = ${userId} and status <> 'forgotten'
        returning id
      `);
      await tx.execute(sql`delete from memory_people where user_id = ${userId}`);
      return forgotten.rows.length;
    }

    const target = input.normalizedTarget?.trim();
    if (!target) return 0;

    if (input.mode === "person") {
      const people = await tx.execute<{ id: string }>(sql`
        select id
        from memory_people
        where user_id = ${userId}
          and (
            normalized_name = ${target}
            or exists (
              select 1 from jsonb_array_elements_text(aliases) alias
              where lower(alias) = ${target}
            )
          )
        for update
      `);
      const personIds = people.rows.map((person) => person.id);
      if (personIds.length === 0) return 0;
      const forgotten = await tx.execute<{ id: string }>(sql`
        update user_memory_records
        set status = 'forgotten',
            key = 'forgotten memory',
            normalized_key = 'forgotten memory',
            value = '[forgotten]',
            normalized_value = 'forgotten',
            person_id = null,
            source_message_id = null,
            forgotten_at = now(),
            updated_at = now()
        where user_id = ${userId}
          and status <> 'forgotten'
          and person_id in (${sql.join(personIds.map((id) => sql`${id}`), sql`, `)})
        returning id
      `);
      await tx.execute(sql`
        delete from memory_people
        where user_id = ${userId}
          and id in (${sql.join(personIds.map((id) => sql`${id}`), sql`, `)})
      `);
      return forgotten.rows.length || personIds.length;
    }

    const pattern = `%${target}%`;
    const forgotten = await tx.execute<{ id: string }>(sql`
      update user_memory_records
      set status = 'forgotten',
          key = 'forgotten memory',
          normalized_key = 'forgotten memory',
          value = '[forgotten]',
          normalized_value = 'forgotten',
          person_id = null,
          source_message_id = null,
          forgotten_at = now(),
          updated_at = now()
      where user_id = ${userId}
        and status <> 'forgotten'
        and (
          normalized_key = ${target}
          or normalized_key like ${pattern}
          or ${target} like ('%' || normalized_key || '%')
        )
      returning id
    `);
    return forgotten.rows.length;
  });
}
