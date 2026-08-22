import { sql } from "drizzle-orm";
import { getDatabaseClient, type DatabaseClient } from "./client";

type Db = DatabaseClient;

export type PersistedProjectNotes = {
  hassaliSummary: string;
  manualNotes: string;
  useAsContext: boolean;
  updatedAt: Date;
};

export type PersistedGithubProjectConnection = {
  defaultBranch: string;
  htmlUrl: string;
  lastKnownHead: string | null;
  private: boolean;
  repositoryName: string;
  repositoryOwner: string;
  updatedAt: Date;
};

async function ownsProject(externalUserId: string, projectId: string, db: Db) {
  const result = await db.execute<{ owned: boolean }>(sql`
    select exists (
      select 1 from projects
      inner join workspaces on workspaces.id = projects.workspace_id
      inner join users on users.id = workspaces.owner_id
      where projects.id = ${projectId} and users.external_id = ${externalUserId}
    ) as owned
  `);
  return Boolean(result.rows[0]?.owned);
}

export async function getOwnedProjectNotes(input: { externalUserId: string; projectId: string }, db: Db = getDatabaseClient()) {
  if (!await ownsProject(input.externalUserId, input.projectId, db)) return null;
  const result = await db.execute<PersistedProjectNotes>(sql`
    select hassali_summary as "hassaliSummary", manual_notes as "manualNotes", use_as_context as "useAsContext", updated_at as "updatedAt"
    from project_notes where project_id = ${input.projectId} limit 1
  `);
  return result.rows[0] ?? { hassaliSummary: "", manualNotes: "", useAsContext: false, updatedAt: new Date(0) };
}

export async function upsertOwnedProjectNotes(input: { externalUserId: string; projectId: string; hassaliSummary: string; manualNotes: string; useAsContext: boolean }, db: Db = getDatabaseClient()) {
  if (!await ownsProject(input.externalUserId, input.projectId, db)) return null;
  const result = await db.execute<PersistedProjectNotes>(sql`
    insert into project_notes (project_id, hassali_summary, manual_notes, use_as_context)
    values (${input.projectId}, ${input.hassaliSummary}, ${input.manualNotes}, ${input.useAsContext})
    on conflict (project_id) do update set hassali_summary = excluded.hassali_summary, manual_notes = excluded.manual_notes, use_as_context = excluded.use_as_context, updated_at = now()
    returning hassali_summary as "hassaliSummary", manual_notes as "manualNotes", use_as_context as "useAsContext", updated_at as "updatedAt"
  `);
  return result.rows[0] ?? null;
}

export async function getOwnedGithubProjectConnection(input: { externalUserId: string; projectId: string }, db: Db = getDatabaseClient()) {
  const result = await db.execute<PersistedGithubProjectConnection>(sql`
    select c.repository_owner as "repositoryOwner", c.repository_name as "repositoryName", c.default_branch as "defaultBranch", c.private, c.html_url as "htmlUrl", c.last_known_head as "lastKnownHead", c.updated_at as "updatedAt"
    from github_project_connections c inner join users on users.id = c.user_id
    where c.project_id = ${input.projectId} and users.external_id = ${input.externalUserId} limit 1
  `);
  return result.rows[0] ?? null;
}

export async function upsertOwnedGithubProjectConnection(input: { externalUserId: string; projectId: string; repositoryOwner: string; repositoryName: string; defaultBranch: string; private: boolean; htmlUrl: string; lastKnownHead?: string | null }, db: Db = getDatabaseClient()) {
  if (!await ownsProject(input.externalUserId, input.projectId, db)) return null;
  const result = await db.execute<PersistedGithubProjectConnection>(sql`
    insert into github_project_connections (project_id, user_id, repository_owner, repository_name, default_branch, private, html_url, last_known_head)
    select ${input.projectId}, users.id, ${input.repositoryOwner}, ${input.repositoryName}, ${input.defaultBranch}, ${input.private}, ${input.htmlUrl}, ${input.lastKnownHead ?? null}
    from users where users.external_id = ${input.externalUserId}
    on conflict (project_id) do update set repository_owner = excluded.repository_owner, repository_name = excluded.repository_name, default_branch = excluded.default_branch, private = excluded.private, html_url = excluded.html_url, last_known_head = excluded.last_known_head, updated_at = now()
    returning repository_owner as "repositoryOwner", repository_name as "repositoryName", default_branch as "defaultBranch", private, html_url as "htmlUrl", last_known_head as "lastKnownHead", updated_at as "updatedAt"
  `);
  return result.rows[0] ?? null;
}

export async function getOwnedGrowthProjectState(input: { externalUserId: string; projectId: string }, db: Db = getDatabaseClient()) {
  const result = await db.execute<{ state: unknown; updatedAt: Date }>(sql`
    select state, states.updated_at as "updatedAt" from growth_project_states states
    inner join users on users.id = states.user_id
    where states.project_id = ${input.projectId} and users.external_id = ${input.externalUserId} limit 1
  `);
  return result.rows[0] ?? null;
}

export async function upsertOwnedGrowthProjectState(input: { externalUserId: string; projectId: string; state: unknown }, db: Db = getDatabaseClient()) {
  if (!await ownsProject(input.externalUserId, input.projectId, db)) return null;
  const result = await db.execute<{ state: unknown; updatedAt: Date }>(sql`
    insert into growth_project_states (project_id, user_id, state)
    select ${input.projectId}, users.id, ${JSON.stringify(input.state)}::jsonb from users where users.external_id = ${input.externalUserId}
    on conflict (project_id) do update set state = excluded.state, updated_at = now()
    returning state, updated_at as "updatedAt"
  `);
  return result.rows[0] ?? null;
}
