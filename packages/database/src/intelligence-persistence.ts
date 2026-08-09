import { sql } from "drizzle-orm";
import { getDatabaseClient, type DatabaseClient } from "./client";
import type { StoredIntelligenceAttempt } from "./schema/intelligence-usage-records";

type Db = DatabaseClient;

export type PersistedIntelligenceSecretEnvelope = {
  authTag: string;
  ciphertext: string;
  iv: string;
  keyVersion: string;
};

export type PersistedIntelligenceSourceConnection = {
  credentialConfigured: boolean;
  defaultModel: string | null;
  enabled: boolean;
  endpointUrl: string | null;
  sourceId: string;
  updatedAt: Date;
};

export type PersistedIntelligencePreferences = {
  budgetMode: string;
  byokMonthlyWarningLimitMicros: number | null;
  managedMonthlyLimitMicros: number | null;
  managedPerRequestLimitMicros: number | null;
  routingPrivacy: string;
};

export type PersistIntelligenceUsageInput = {
  attemptCount: number;
  attempts: StoredIntelligenceAttempt[];
  completedAt: Date;
  computeSource: string;
  costAmountMicros: number | null;
  costCurrency: string | null;
  costScope: string;
  costSource: string;
  externalUserId: string;
  fallbackUsed: boolean;
  inputTokens: number | null;
  latencyMs: number;
  mode: string;
  model: string;
  outputTokens: number | null;
  projectId: string | null;
  provider: string;
  sourceId: string;
  startedAt: Date;
  status: string;
  totalTokens: number | null;
  traceId: string;
};

export async function listPersistedIntelligenceSources(
  externalUserId: string,
  db: Db = getDatabaseClient()
): Promise<PersistedIntelligenceSourceConnection[]> {
  const result = await db.execute<{
    credentialConfigured: boolean;
    defaultModel: string | null;
    enabled: boolean;
    endpointUrl: string | null;
    sourceId: string;
    updatedAt: Date;
  }>(sql`
    select
      connections.source_id as "sourceId",
      connections.enabled,
      connections.endpoint_url as "endpointUrl",
      connections.default_model as "defaultModel",
      (connections.credential_ciphertext is not null) as "credentialConfigured",
      connections.updated_at as "updatedAt"
    from intelligence_source_connections connections
    inner join users on users.id = connections.user_id
    where users.external_id = ${externalUserId}
    order by connections.source_id asc
  `);
  return result.rows;
}

export async function upsertPersistedIntelligenceSourceConfig(
  input: {
    defaultModel: string | null;
    enabled: boolean;
    endpointUrl: string | null;
    externalUserId: string;
    sourceId: string;
  },
  db: Db = getDatabaseClient()
) {
  const result = await db.execute<{ sourceId: string }>(sql`
    insert into intelligence_source_connections (user_id, source_id, enabled, endpoint_url, default_model)
    select users.id, ${input.sourceId}, ${input.enabled}, ${input.endpointUrl}, ${input.defaultModel}
    from users
    where users.external_id = ${input.externalUserId}
    on conflict (user_id, source_id) do update set
      enabled = excluded.enabled,
      endpoint_url = excluded.endpoint_url,
      default_model = excluded.default_model,
      updated_at = now()
    returning source_id as "sourceId"
  `);
  if (!result.rows[0]) throw new Error("INTELLIGENCE_USER_NOT_FOUND");
}

export async function putPersistedIntelligenceSecret(
  input: {
    envelope: PersistedIntelligenceSecretEnvelope;
    externalUserId: string;
    sourceId: string;
  },
  db: Db = getDatabaseClient()
) {
  const result = await db.execute<{ sourceId: string }>(sql`
    insert into intelligence_source_connections (
      user_id,
      source_id,
      enabled,
      credential_ciphertext,
      credential_iv,
      credential_auth_tag,
      credential_key_version
    )
    select
      users.id,
      ${input.sourceId},
      true,
      ${input.envelope.ciphertext},
      ${input.envelope.iv},
      ${input.envelope.authTag},
      ${input.envelope.keyVersion}
    from users
    where users.external_id = ${input.externalUserId}
    on conflict (user_id, source_id) do update set
      credential_ciphertext = excluded.credential_ciphertext,
      credential_iv = excluded.credential_iv,
      credential_auth_tag = excluded.credential_auth_tag,
      credential_key_version = excluded.credential_key_version,
      updated_at = now()
    returning source_id as "sourceId"
  `);
  if (!result.rows[0]) throw new Error("INTELLIGENCE_USER_NOT_FOUND");
}

export async function getPersistedIntelligenceSecret(
  externalUserId: string,
  sourceId: string,
  db: Db = getDatabaseClient()
): Promise<PersistedIntelligenceSecretEnvelope | null> {
  const result = await db.execute<{
    authTag: string;
    ciphertext: string;
    iv: string;
    keyVersion: string;
  }>(sql`
    select
      connections.credential_ciphertext as ciphertext,
      connections.credential_iv as iv,
      connections.credential_auth_tag as "authTag",
      connections.credential_key_version as "keyVersion"
    from intelligence_source_connections connections
    inner join users on users.id = connections.user_id
    where users.external_id = ${externalUserId}
      and connections.source_id = ${sourceId}
      and connections.credential_ciphertext is not null
    limit 1
  `);
  return result.rows[0] ?? null;
}

export async function hasPersistedIntelligenceSecret(
  externalUserId: string,
  sourceId: string,
  db: Db = getDatabaseClient()
) {
  const result = await db.execute<{ configured: boolean }>(sql`
    select exists (
      select 1
      from intelligence_source_connections connections
      inner join users on users.id = connections.user_id
      where users.external_id = ${externalUserId}
        and connections.source_id = ${sourceId}
        and connections.credential_ciphertext is not null
    ) as configured
  `);
  return Boolean(result.rows[0]?.configured);
}

export async function deletePersistedIntelligenceSource(
  externalUserId: string,
  sourceId: string,
  db: Db = getDatabaseClient()
) {
  const result = await db.execute<{ sourceId: string }>(sql`
    delete from intelligence_source_connections
    where source_id = ${sourceId}
      and user_id = (select id from users where external_id = ${externalUserId} limit 1)
    returning source_id as "sourceId"
  `);
  return Boolean(result.rows[0]);
}

export async function getPersistedIntelligencePreferences(
  externalUserId: string,
  db: Db = getDatabaseClient()
): Promise<PersistedIntelligencePreferences | null> {
  const result = await db.execute<PersistedIntelligencePreferences>(sql`
    select
      preferences.routing_privacy as "routingPrivacy",
      preferences.budget_mode as "budgetMode",
      preferences.managed_per_request_limit_micros as "managedPerRequestLimitMicros",
      preferences.managed_monthly_limit_micros as "managedMonthlyLimitMicros",
      preferences.byok_monthly_warning_limit_micros as "byokMonthlyWarningLimitMicros"
    from intelligence_preferences preferences
    inner join users on users.id = preferences.user_id
    where users.external_id = ${externalUserId}
    limit 1
  `);
  const row = result.rows[0];
  return row ? {
    ...row,
    byokMonthlyWarningLimitMicros: row.byokMonthlyWarningLimitMicros === null ? null : Number(row.byokMonthlyWarningLimitMicros),
    managedMonthlyLimitMicros: row.managedMonthlyLimitMicros === null ? null : Number(row.managedMonthlyLimitMicros),
    managedPerRequestLimitMicros: row.managedPerRequestLimitMicros === null ? null : Number(row.managedPerRequestLimitMicros)
  } : null;
}

export async function upsertPersistedIntelligencePreferences(
  input: PersistedIntelligencePreferences & { externalUserId: string },
  db: Db = getDatabaseClient()
) {
  const result = await db.execute<{ userId: string }>(sql`
    insert into intelligence_preferences (
      user_id,
      routing_privacy,
      budget_mode,
      managed_per_request_limit_micros,
      managed_monthly_limit_micros,
      byok_monthly_warning_limit_micros
    )
    select
      users.id,
      ${input.routingPrivacy},
      ${input.budgetMode},
      ${input.managedPerRequestLimitMicros},
      ${input.managedMonthlyLimitMicros},
      ${input.byokMonthlyWarningLimitMicros}
    from users
    where users.external_id = ${input.externalUserId}
    on conflict (user_id) do update set
      routing_privacy = excluded.routing_privacy,
      budget_mode = excluded.budget_mode,
      managed_per_request_limit_micros = excluded.managed_per_request_limit_micros,
      managed_monthly_limit_micros = excluded.managed_monthly_limit_micros,
      byok_monthly_warning_limit_micros = excluded.byok_monthly_warning_limit_micros,
      updated_at = now()
    returning user_id as "userId"
  `);
  if (!result.rows[0]) throw new Error("INTELLIGENCE_USER_NOT_FOUND");
}

export async function persistIntelligenceUsageRecord(
  input: PersistIntelligenceUsageInput,
  db: Db = getDatabaseClient()
) {
  if (input.projectId) {
    const owned = await db.execute<{ id: string }>(sql`
      select projects.id
      from projects
      inner join workspaces on workspaces.id = projects.workspace_id
      inner join users on users.id = workspaces.owner_id
      where projects.id = ${input.projectId}
        and users.external_id = ${input.externalUserId}
      limit 1
    `);
    if (!owned.rows[0]) throw new Error("INTELLIGENCE_PROJECT_NOT_OWNED");
  }

  const attempts = JSON.stringify(input.attempts);
  const result = await db.execute<{ id: string }>(sql`
    insert into intelligence_usage_records (
      user_id,
      project_id,
      trace_id,
      mode,
      source_id,
      provider,
      model,
      compute_source,
      status,
      attempt_count,
      fallback_used,
      attempts,
      latency_ms,
      input_tokens,
      output_tokens,
      total_tokens,
      cost_amount_micros,
      cost_currency,
      cost_source,
      cost_scope,
      started_at,
      completed_at
    )
    select
      users.id,
      ${input.projectId},
      ${input.traceId},
      ${input.mode},
      ${input.sourceId},
      ${input.provider},
      ${input.model},
      ${input.computeSource},
      ${input.status},
      ${input.attemptCount},
      ${input.fallbackUsed},
      ${attempts}::jsonb,
      ${input.latencyMs},
      ${input.inputTokens},
      ${input.outputTokens},
      ${input.totalTokens},
      ${input.costAmountMicros},
      ${input.costCurrency},
      ${input.costSource},
      ${input.costScope},
      ${input.startedAt},
      ${input.completedAt}
    from users
    where users.external_id = ${input.externalUserId}
    on conflict (user_id, trace_id) do nothing
    returning id
  `);
  if (!result.rows[0]) throw new Error("INTELLIGENCE_USAGE_NOT_PERSISTED");
}

export async function summarizeIntelligenceUsage(
  externalUserId: string,
  periodStart: Date,
  db: Db = getDatabaseClient()
) {
  const result = await db.execute<{
    byokCostMicros: string | number | null;
    byokRequests: string | number;
    localRequests: string | number;
    managedCostMicros: string | number | null;
    managedUnknownCostRequests: string | number;
    requestCount: string | number;
    totalTokens: string | number | null;
  }>(sql`
    select
      count(*) as "requestCount",
      coalesce(sum(total_tokens), 0) as "totalTokens",
      coalesce(sum(cost_amount_micros) filter (where cost_scope = 'managed'), 0) as "managedCostMicros",
      count(*) filter (where cost_scope = 'managed' and cost_source = 'unknown') as "managedUnknownCostRequests",
      coalesce(sum(cost_amount_micros) filter (where cost_scope = 'byok'), 0) as "byokCostMicros",
      count(*) filter (where cost_scope = 'byok') as "byokRequests",
      count(*) filter (where cost_scope = 'local') as "localRequests"
    from intelligence_usage_records records
    inner join users on users.id = records.user_id
    where users.external_id = ${externalUserId}
      and records.created_at >= ${periodStart}
  `);
  const row = result.rows[0];
  return {
    byokCostMicros: Number(row?.byokCostMicros ?? 0),
    byokRequests: Number(row?.byokRequests ?? 0),
    localRequests: Number(row?.localRequests ?? 0),
    managedCostMicros: Number(row?.managedCostMicros ?? 0),
    managedUnknownCostRequests: Number(row?.managedUnknownCostRequests ?? 0),
    requestCount: Number(row?.requestCount ?? 0),
    totalTokens: Number(row?.totalTokens ?? 0)
  };
}
