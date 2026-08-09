import { createHash, randomUUID } from "node:crypto";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { getDatabaseClient, type DatabaseClient } from "./client";
import {
  chatMessages,
  chatSessions,
  files,
  projects,
  users,
  workspaces
} from "./schema/index";

type Db = DatabaseClient;
type TransactionDb = Parameters<Parameters<Db["transaction"]>[0]>[0];
type QueryExecutor = Pick<Db, "execute">;

export type ClerkUserInput = {
  displayName?: string | null;
  email: string;
  externalId: string;
  imageUrl?: string | null;
};

export type StarterFile = {
  content: string;
  path: string;
};

export type ChatRole = "user" | "assistant";
export type AiMode = "ASK" | "SUGGEST" | "EXECUTE";

export type PersistedWorkspace = typeof workspaces.$inferSelect;
export type PersistedProject = typeof projects.$inferSelect;
export type PersistedFile = typeof files.$inferSelect;
export type PersistedChatMessage = typeof chatMessages.$inferSelect;
export type CreateProjectWithStarterFileResult = {
  files: Array<{
    content: string;
    id: string;
    path: string;
  }>;
  project: {
    id: string;
    name: string;
  };
};
export type LoadWorkspaceForExternalUserResult = {
  chat: {
    messages: Array<{
      content: string;
      id: string;
      mode: AiMode;
      role: ChatRole;
    }>;
    sessionId: string | null;
  };
  files: Array<{
    content: string;
    id: string;
    path: string;
  }>;
  project: {
    id: string;
    name: string;
  } | null;
  projects: Array<{
    id: string;
    name: string;
  }>;
  workspace: {
    id: string;
    name: string;
  } | null;
};

export type ProjectChatSearchResult = {
  kind: "chat" | "message" | "project";
  messageId: string | null;
  projectId: string;
  projectName: string;
  role: ChatRole | null;
  sessionId: string | null;
  sessionTitle: string | null;
  snippet: string;
  updatedAt: string;
};

export type ChatPersistenceContextResult = {
  mode: AiMode;
  projectId: string;
  sessionId: string | null;
  threadResolution: "created" | "recovered" | "reused";
  userId: string;
};
export type ProjectFileListResult = Array<{
  content: string;
  id: string;
  path: string;
}>;

const defaultStarterFiles: StarterFile[] = [
  {
    path: "welcome.ts",
    content:
      'type WorkspaceMood = "calm" | "focused" | "ready";\n\nexport function createSession(mood: WorkspaceMood) {\n  return {\n    mood,\n    promise: "small steps, visible changes, no surprise edits"\n  };\n}\n'
  },
  {
    path: "workspace.json",
    content:
      '{\n  "name": "hassali-project",\n  "model": "auto",\n  "performanceMode": "balanced"\n}\n'
  },
  {
    path: "README.md",
    content:
      "# Hassali.ai Workspace\n\nA quiet workspace for turning intent into working software.\n\n- Open files from the sidebar\n- Edit in Monaco\n- Save into PostgreSQL-backed workspace state\n"
  }
];
const proposalApprovalLeaseMs = 60 * 60 * 1000;

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "workspace"
  );
}

function fileNameFromPath(path: string) {
  return path.split("/").at(-1) || path;
}

function hashContent(content: string) {
  return createHash("sha256").update(content).digest("hex");
}

function projectContentRevision(
  projectFiles: Array<{ content: string; contentHash?: null | string; path: string }>
) {
  const digest = createHash("sha256");
  for (const file of [...projectFiles].sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0
  )) {
    digest.update(file.path);
    digest.update("\0");
    digest.update(file.contentHash ?? hashContent(file.content));
    digest.update("\0");
  }
  return digest.digest("hex");
}

function readSizeBytes(content: string) {
  return Buffer.byteLength(content, "utf8");
}

function mapFileRows(
  rows: Array<{
    content: string;
    id: string;
    path: string;
  }>
): ProjectFileListResult {
  return rows.map((file) => ({
    content: String(file.content),
    id: String(file.id),
    path: String(file.path)
  }));
}

async function findOwnedProjectForExternalUser(
  input: { externalUserId: string; projectId: string },
  db: QueryExecutor
) {
  const ownedProjectResult = await db.execute<{ id: string }>(sql`
    select projects.id
    from projects
    inner join workspaces on workspaces.id = projects.workspace_id
    inner join users on users.id = workspaces.owner_id
    where projects.id = ${input.projectId}
      and users.external_id = ${input.externalUserId}
    limit 1
  `);

  return ownedProjectResult.rows[0] ?? null;
}

async function lockProjectForMutation(projectId: string, db: TransactionDb) {
  const result = await db.execute<{ id: string }>(sql`
    select id
    from projects
    where id = ${projectId}
    limit 1
    for update
  `);
  return result.rows[0] ?? null;
}

async function lockOwnedProjectForMutation(
  input: { externalUserId: string; projectId: string },
  db: TransactionDb
) {
  const result = await db.execute<{ id: string }>(sql`
    select projects.id
    from projects
    inner join workspaces on workspaces.id = projects.workspace_id
    inner join users on users.id = workspaces.owner_id
    where projects.id = ${input.projectId}
      and users.external_id = ${input.externalUserId}
    limit 1
    for update of projects
  `);
  return result.rows[0] ?? null;
}

async function listProjectFilesById(projectId: string, db: QueryExecutor) {
  const result = await db.execute<{
    content: string;
    id: string;
    path: string;
  }>(sql`
    select id, path, content
    from files
    where project_id = ${projectId}
    order by path asc
  `);
  return mapFileRows(result.rows);
}

export async function listUserProjectFiles(
  input: { externalUserId: string; projectId: string },
  db: Db = getDatabaseClient()
): Promise<ProjectFileListResult | null> {
  const ownedProject = await findOwnedProjectForExternalUser(input, db);

  if (!ownedProject) {
    return null;
  }

  return listProjectFilesById(input.projectId, db);
}

export async function getOrCreateUser(input: ClerkUserInput, db: Db = getDatabaseClient()) {
  const [existingUser] = await db
    .select()
    .from(users)
    .where(eq(users.externalId, input.externalId))
    .limit(1);

  if (existingUser) {
    const [updatedUser] = await db
      .update(users)
      .set({
        displayName: input.displayName,
        email: input.email,
        imageUrl: input.imageUrl
      })
      .where(eq(users.id, existingUser.id))
      .returning();

    return updatedUser ?? existingUser;
  }

  const [createdUser] = await db
    .insert(users)
    .values({
      displayName: input.displayName,
      email: input.email,
      externalId: input.externalId,
      imageUrl: input.imageUrl
    })
    .returning();

  if (!createdUser) {
    throw new Error("Failed to create user.");
  }

  return createdUser;
}

export async function createWorkspace(
  input: { name: string; ownerId: string },
  db: Db = getDatabaseClient()
) {
  const [workspace] = await db
    .insert(workspaces)
    .values({
      name: input.name,
      ownerId: input.ownerId,
      slug: `${slugify(input.name)}-${input.ownerId.slice(0, 8)}`
    })
    .returning();

  if (!workspace) {
    throw new Error("Failed to create workspace.");
  }

  return workspace;
}

export async function getWorkspace(
  input: { ownerId: string; workspaceId: string },
  db: Db = getDatabaseClient()
) {
  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(and(eq(workspaces.id, input.workspaceId), eq(workspaces.ownerId, input.ownerId)))
    .limit(1);

  return workspace ?? null;
}

export async function listUserWorkspaces(ownerId: string, db: Db = getDatabaseClient()) {
  return db
    .select()
    .from(workspaces)
    .where(eq(workspaces.ownerId, ownerId))
    .orderBy(desc(workspaces.updatedAt));
}

export async function getLatestWorkspace(ownerId: string, db: Db = getDatabaseClient()) {
  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.ownerId, ownerId))
    .orderBy(desc(workspaces.updatedAt))
    .limit(1);

  return workspace ?? null;
}

export async function createProject(
  input: {
    description?: string | null;
    name: string;
    starterFiles?: StarterFile[];
    workspaceId: string;
  },
  db: Db = getDatabaseClient()
) {
  return db.transaction(async (tx) => {
    const [project] = await tx
      .insert(projects)
      .values({
        description: input.description,
        name: input.name,
        workspaceId: input.workspaceId
      })
      .returning();

    if (!project) {
      throw new Error("Failed to create project.");
    }

    const starterFiles = input.starterFiles ?? defaultStarterFiles;

    if (starterFiles.length > 0) {
      await tx.insert(files).values(
        starterFiles.map((file) => ({
          content: file.content,
          contentHash: hashContent(file.content),
          name: fileNameFromPath(file.path),
          path: file.path,
          projectId: project.id,
          sizeBytes: readSizeBytes(file.content)
        }))
      );
    }

    await tx
      .update(workspaces)
      .set({ updatedAt: new Date() })
      .where(eq(workspaces.id, input.workspaceId));

    return project;
  });
}

export async function createProjectWithStarterFile(
  input: {
    displayName?: string | null;
    email: string;
    externalId: string;
    imageUrl?: string | null;
    projectName: string;
  },
  db: Db = getDatabaseClient()
): Promise<CreateProjectWithStarterFileResult> {
  return db.transaction(async (tx) => {
    const [existingUser] = await tx
      .select()
      .from(users)
      .where(eq(users.externalId, input.externalId))
      .limit(1);
    const dbUser =
      existingUser ??
      (
        await tx
          .insert(users)
          .values({
            displayName: input.displayName,
            email: input.email,
            externalId: input.externalId,
            imageUrl: input.imageUrl
          })
          .returning()
      )[0];

    if (!dbUser) {
      throw new Error("Database user was not created.");
    }

    console.info("db user ready");

    const [existingWorkspace] = await tx
      .select()
      .from(workspaces)
      .where(eq(workspaces.ownerId, dbUser.id))
      .orderBy(desc(workspaces.updatedAt))
      .limit(1);
    const workspace =
      existingWorkspace ??
      (
        await tx
          .insert(workspaces)
          .values({
            name: "My Workspace",
            ownerId: dbUser.id,
            slug: `my-workspace-${dbUser.id.slice(0, 8)}`
          })
          .returning()
      )[0];

    if (!workspace) {
      throw new Error("Workspace was not created.");
    }

    console.info("workspace ready");

    const [project] = await tx
      .insert(projects)
      .values({
        name: input.projectName,
        workspaceId: workspace.id
      })
      .returning();

    if (!project) {
      throw new Error("Project was not created.");
    }

    console.info("project ready");

    const fileContent = defaultStarterFiles[0]?.content ?? "";
    const filePath = defaultStarterFiles[0]?.path ?? "welcome.ts";
    const [file] = await tx
      .insert(files)
      .values({
        content: fileContent,
        contentHash: hashContent(fileContent),
        name: fileNameFromPath(filePath),
        path: filePath,
        projectId: project.id,
        sizeBytes: readSizeBytes(fileContent)
      })
      .returning();

    if (!file) {
      throw new Error("Starter file was not created.");
    }

    console.info("starter files ready");

    return {
      files: [
        {
          content: file.content,
          id: file.id,
          path: file.path
        }
      ],
      project: {
        id: project.id,
        name: project.name
      }
    };
  });
}

export async function getLatestProject(workspaceId: string, db: Db = getDatabaseClient()) {
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.workspaceId, workspaceId))
    .orderBy(desc(projects.updatedAt), desc(projects.createdAt))
    .limit(1);

  return project ?? null;
}

export async function getProject(
  input: { projectId: string; workspaceId: string },
  db: Db = getDatabaseClient()
) {
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, input.projectId), eq(projects.workspaceId, input.workspaceId)))
    .limit(1);

  return project ?? null;
}

export async function getProjectFiles(projectId: string, db: Db = getDatabaseClient()) {
  return db.select().from(files).where(eq(files.projectId, projectId)).orderBy(asc(files.path));
}

export async function saveFileContent(
  input: { content: string; path: string; projectId: string },
  db: Db = getDatabaseClient()
) {
  return db.transaction(async (tx) => {
    if (!(await lockProjectForMutation(input.projectId, tx))) {
      throw new Error("Project not found.");
    }
    const contentHash = hashContent(input.content);
    const name = fileNameFromPath(input.path);
    const sizeBytes = readSizeBytes(input.content);
    const updatedResult = await tx.execute<{
      content: string;
      id: string;
      path: string;
    }>(sql`
      update files
      set
        content = ${input.content},
        content_hash = ${contentHash},
        name = ${name},
        size_bytes = ${sizeBytes}
      where project_id = ${input.projectId} and path = ${input.path}
      returning id, path, content
    `);
    const updatedFile = updatedResult.rows[0];

    if (updatedFile) {
      return updatedFile;
    }

    const createdResult = await tx.execute<{
      content: string;
      id: string;
      path: string;
    }>(sql`
      insert into files (project_id, path, name, content, content_hash, size_bytes)
      values (${input.projectId}, ${input.path}, ${name}, ${input.content}, ${contentHash}, ${sizeBytes})
      returning id, path, content
    `);
    const createdFile = createdResult.rows[0];

    if (!createdFile) {
      throw new Error("Failed to save file.");
    }

    return createdFile;
  });
}

export async function saveUserProjectFileContent(
  input: {
    content: string;
    externalUserId: string;
    path: string;
    projectId: string;
  },
  db: Db = getDatabaseClient()
) {
  return db.transaction(async (tx) => {
    const ownedProject = await lockOwnedProjectForMutation(input, tx);
    if (!ownedProject) {
      return null;
    }
    const contentHash = hashContent(input.content);
    const name = fileNameFromPath(input.path);
    const sizeBytes = readSizeBytes(input.content);

    const updatedResult = await tx.execute<{
      content: string;
      id: string;
      path: string;
    }>(sql`
      update files
      set
        content = ${input.content},
        content_hash = ${contentHash},
        name = ${name},
        size_bytes = ${sizeBytes}
      where project_id = ${input.projectId} and path = ${input.path}
      returning id, path, content
    `);
    const updatedFile = updatedResult.rows[0];
    if (updatedFile) return updatedFile;

    const createdResult = await tx.execute<{
      content: string;
      id: string;
      path: string;
    }>(sql`
      insert into files (project_id, path, name, content, content_hash, size_bytes)
      values (${input.projectId}, ${input.path}, ${name}, ${input.content}, ${contentHash}, ${sizeBytes})
      returning id, path, content
    `);
    const file = createdResult.rows[0];
    if (!file) {
      throw new Error("Failed to save file.");
    }
    return file;
  });
}

export async function applyUserProjectFileBatch(
  input: {
    deletes: string[];
    expectedProjectRevision: string;
    externalUserId: string;
    projectId: string;
    proposalApproval: {
      claimToken: string;
      proposalId: string;
      result: Record<string, unknown>;
    };
    writes: Array<{
      content: string;
      path: string;
    }>;
  },
  db: Db = getDatabaseClient()
) {
  return db.transaction(async (tx) => {
    const ownedProjectResult = await tx.execute<{ id: string }>(sql`
      select projects.id
      from projects
      inner join workspaces on workspaces.id = projects.workspace_id
      inner join users on users.id = workspaces.owner_id
      where projects.id = ${input.projectId}
        and users.external_id = ${input.externalUserId}
      limit 1
      for update
    `);
    if (!ownedProjectResult.rows[0]) return { files: [], status: "missing" as const };

    const currentFileResult = await tx.execute<{
      content: string;
      content_hash: null | string;
      id: string;
      path: string;
    }>(sql`
      select id, path, content, content_hash
      from files
      where project_id = ${input.projectId}
      order by path asc
    `);
    const currentRevision = projectContentRevision(currentFileResult.rows.map((file) => ({
      content: file.content,
      contentHash: file.content_hash,
      path: file.path
    })));
    if (currentRevision !== input.expectedProjectRevision) {
      return { files: mapFileRows(currentFileResult.rows), status: "stale" as const };
    }

    const claimResult = await tx.execute<{ id: string }>(sql`
      select chat_messages.id
      from chat_messages
      inner join chat_sessions on chat_sessions.id = chat_messages.session_id
      where chat_sessions.project_id = ${input.projectId}
        and chat_messages.role = 'assistant'
        and chat_messages.metadata -> 'proposal' ->> 'id' = ${input.proposalApproval.proposalId}
        and chat_messages.metadata -> 'proposalApproval' ->> 'status' = 'executing'
        and chat_messages.metadata -> 'proposalApproval' ->> 'claimToken' = ${input.proposalApproval.claimToken}
      limit 1
      for update of chat_messages
    `);
    if (!claimResult.rows[0]) return { files: [], status: "claim_lost" as const };

    for (const path of input.deletes) {
      await tx.execute(sql`
        delete from files
        where project_id = ${input.projectId} and path = ${path}
      `);
    }

    for (const file of input.writes) {
      const contentHash = hashContent(file.content);
      const name = fileNameFromPath(file.path);
      const sizeBytes = readSizeBytes(file.content);
      const updated = await tx.execute<{ id: string }>(sql`
        update files
        set
          content = ${file.content},
          content_hash = ${contentHash},
          name = ${name},
          size_bytes = ${sizeBytes}
        where project_id = ${input.projectId} and path = ${file.path}
        returning id
      `);
      if (!updated.rows[0]) {
        await tx.execute(sql`
          insert into files (project_id, path, name, content, content_hash, size_bytes)
          values (${input.projectId}, ${file.path}, ${name}, ${file.content}, ${contentHash}, ${sizeBytes})
        `);
      }
    }

    const result = await tx.execute<{
      content: string;
      id: string;
      path: string;
    }>(sql`
      select id, path, content
      from files
      where project_id = ${input.projectId}
      order by path asc
    `);
    const approval = JSON.stringify({
      completedAt: new Date().toISOString(),
      result: input.proposalApproval.result,
      status: "completed"
    });
    const completed = await tx.execute<{ id: string }>(sql`
      update chat_messages
      set metadata = jsonb_set(metadata, '{proposalApproval}', ${approval}::jsonb, true)
      where id = ${claimResult.rows[0].id}
        and metadata -> 'proposalApproval' ->> 'status' = 'executing'
        and metadata -> 'proposalApproval' ->> 'claimToken' = ${input.proposalApproval.claimToken}
      returning id
    `);
    if (!completed.rows[0]) {
      throw new Error("The durable proposal approval claim was lost before commit.");
    }
    return { files: mapFileRows(result.rows), status: "applied" as const };
  });
}

export async function createUserProjectFile(
  input: {
    content: string;
    externalUserId: string;
    path: string;
    projectId: string;
  },
  db: Db = getDatabaseClient()
) {
  return db.transaction(async (tx) => {
    if (!(await lockOwnedProjectForMutation(input, tx))) {
      return null;
    }
    const nestedPathPattern = `${input.path}/%`;
    const conflictResult = await tx.execute<{ id: string }>(sql`
      select id
      from files
      where project_id = ${input.projectId}
        and (path = ${input.path} or path like ${nestedPathPattern})
      limit 1
    `);
    if (conflictResult.rows[0]) {
      throw new Error("A file or folder already exists at that path.");
    }

    const contentHash = hashContent(input.content);
    const name = fileNameFromPath(input.path);
    const sizeBytes = readSizeBytes(input.content);
    await tx.execute(sql`
      insert into files (project_id, path, name, content, content_hash, size_bytes)
      values (${input.projectId}, ${input.path}, ${name}, ${input.content}, ${contentHash}, ${sizeBytes})
    `);
    return listProjectFilesById(input.projectId, tx);
  });
}

export async function createUserProjectFolder(
  input: {
    externalUserId: string;
    folderPath: string;
    placeholderFileName: string;
    projectId: string;
  },
  db: Db = getDatabaseClient()
) {
  return db.transaction(async (tx) => {
    if (!(await lockOwnedProjectForMutation(input, tx))) {
      return null;
    }
    const folderPattern = `${input.folderPath}/%`;
    const existingResult = await tx.execute<{ id: string }>(sql`
      select id
      from files
      where project_id = ${input.projectId}
        and (path = ${input.folderPath} or path like ${folderPattern})
      limit 1
    `);
    if (existingResult.rows[0]) {
      throw new Error("A file or folder already exists at that path.");
    }

    const placeholderPath = `${input.folderPath}/${input.placeholderFileName}`;
    const content = "";
    await tx.execute(sql`
      insert into files (project_id, path, name, content, content_hash, size_bytes)
      values (
        ${input.projectId},
        ${placeholderPath},
        ${input.placeholderFileName},
        ${content},
        ${hashContent(content)},
        0
      )
    `);
    return listProjectFilesById(input.projectId, tx);
  });
}

export async function renameUserProjectPath(
  input: {
    externalUserId: string;
    kind: "file" | "folder";
    newPath: string;
    path: string;
    projectId: string;
  },
  db: Db = getDatabaseClient()
) {
  return db.transaction(async (tx) => {
    if (!(await lockOwnedProjectForMutation(input, tx))) {
      return null;
    }
    const newPathPattern = `${input.newPath}/%`;
    const conflictResult = await tx.execute<{ id: string }>(sql`
      select id
      from files
      where project_id = ${input.projectId}
        and (path = ${input.newPath} or path like ${newPathPattern})
      limit 1
    `);
    if (conflictResult.rows[0]) {
      throw new Error("A file or folder already exists at the new path.");
    }

    if (input.kind === "file") {
      const updatedResult = await tx.execute<{ id: string }>(sql`
        update files
        set
          path = ${input.newPath},
          name = ${fileNameFromPath(input.newPath)}
        where project_id = ${input.projectId} and path = ${input.path}
        returning id
      `);
      if (!updatedResult.rows[0]) {
        throw new Error("File not found.");
      }
      return listProjectFilesById(input.projectId, tx);
    }

    const folderPattern = `${input.path}/%`;
    const prefixStart = input.path.length + 1;
    const updatedFolderResult = await tx.execute<{ id: string }>(sql`
      update files
      set path = ${input.newPath} || substring(path from ${prefixStart})
      where project_id = ${input.projectId} and path like ${folderPattern}
      returning id
    `);
    if (!updatedFolderResult.rows[0]) {
      throw new Error("Folder not found.");
    }
    return listProjectFilesById(input.projectId, tx);
  });
}

export async function deleteUserProjectPath(
  input: {
    externalUserId: string;
    kind: "file" | "folder";
    path: string;
    projectId: string;
  },
  db: Db = getDatabaseClient()
) {
  return db.transaction(async (tx) => {
    if (!(await lockOwnedProjectForMutation(input, tx))) {
      return null;
    }
    if (input.kind === "file") {
      await tx.execute(sql`
        delete from files
        where project_id = ${input.projectId} and path = ${input.path}
      `);
      return listProjectFilesById(input.projectId, tx);
    }

    const folderPattern = `${input.path}/%`;
    await tx.execute(sql`
      delete from files
      where project_id = ${input.projectId} and path like ${folderPattern}
    `);
    return listProjectFilesById(input.projectId, tx);
  });
}

export async function loadWorkspaceForExternalUser(
  externalUserId: string,
  selectedProjectId?: string | null,
  db: Db = getDatabaseClient(),
  selectedSessionId?: string | null
): Promise<LoadWorkspaceForExternalUserResult> {
  const userResult = await db.execute<{ id: string }>(sql`
    select id
    from users
    where external_id = ${externalUserId}
    limit 1
  `);
  const user = userResult.rows[0];

  if (!user) {
    return {
      chat: {
        messages: [],
        sessionId: null
      },
      files: [],
      project: null,
      projects: [],
      workspace: null
    };
  }

  const workspaceResult = await db.execute<{
    id: string;
    name: string;
  }>(sql`
    select id, name
    from workspaces
    where owner_id = ${user.id}
    order by created_at desc
    limit 1
  `);
  const workspace = workspaceResult.rows[0];

  if (!workspace) {
    return {
      chat: {
        messages: [],
        sessionId: null
      },
      files: [],
      project: null,
      projects: [],
      workspace: null
    };
  }

  const projectsResult = await db.execute<{
    id: string;
    name: string;
  }>(sql`
    select id, name
    from projects
    where workspace_id = ${workspace.id}
    order by created_at desc
  `);
  const projectSummaries = projectsResult.rows.map((project) => ({
    id: String(project.id),
    name: String(project.name)
  }));
  const project =
    projectSummaries.find((projectSummary) => projectSummary.id === selectedProjectId) ??
    projectSummaries[0];

  if (!project) {
    return {
      chat: {
        messages: [],
        sessionId: null
      },
      files: [],
      project: null,
      projects: [],
      workspace: {
        id: String(workspace.id),
        name: String(workspace.name)
      }
    };
  }

  const sessionQuery = selectedSessionId
    ? db.execute<{ id: string }>(sql`
        select id
        from chat_sessions
        where id = ${selectedSessionId}
          and project_id = ${project.id}
          and user_id = ${user.id}
        limit 1
      `)
    : db.execute<{ id: string }>(sql`
        select id
        from chat_sessions
        where project_id = ${project.id} and user_id = ${user.id}
        order by created_at desc
        limit 1
      `);
  const [filesResult, sessionResult] = await Promise.all([
    db.execute<{
      content: string;
      id: string;
      path: string;
    }>(sql`
      select id, path, content
      from files
      where project_id = ${project.id}
      order by path asc
    `),
    sessionQuery
  ]);
  const session = sessionResult.rows[0];
  const messagesResult = session
    ? await db.execute<{
        content: string;
        attachments: unknown;
        handoff: unknown;
        id: string;
        mode: AiMode;
        provider_failure_category: null | string;
        response_kind: null | string;
        role: ChatRole;
      }>(sql`
        select
          id,
          role,
          content,
          mode,
          metadata -> 'attachments' as attachments,
          metadata -> 'handoff' as handoff,
          coalesce(metadata ->> 'providerFailureCategory', metadata -> 'askBrain' ->> 'providerFailureCategory') as provider_failure_category,
          coalesce(metadata ->> 'responseKind', metadata -> 'askBrain' ->> 'responseKind') as response_kind
        from chat_messages
        where session_id = ${session.id}
        order by created_at asc
      `)
    : { rows: [] };

  return {
    chat: {
      messages: messagesResult.rows.map((message) => ({
        content: String(message.content),
        attachments: Array.isArray(message.attachments) ? message.attachments : [],
        handoff: message.handoff ?? null,
        id: String(message.id),
        mode: message.mode,
        providerFailureCategory: message.provider_failure_category,
        responseKind: message.response_kind,
        role: message.role
      })),
      sessionId: session ? String(session.id) : null
    },
    files: filesResult.rows.map((file) => ({
      content: String(file.content),
      id: String(file.id),
      path: String(file.path)
    })),
    project: {
      id: String(project.id),
      name: String(project.name)
    },
    projects: projectSummaries,
    workspace: {
      id: String(workspace.id),
      name: String(workspace.name)
    }
  };
}

export async function searchProjectsAndChatsForExternalUser(
  externalUserId: string,
  query: string,
  db: Db = getDatabaseClient()
): Promise<ProjectChatSearchResult[]> {
  const normalizedQuery = query.replace(/\s+/g, " ").trim().slice(0, 120);
  if (normalizedQuery.length < 2) return [];
  const pattern = `%${normalizedQuery}%`;
  const result = await db.execute<{
    kind: ProjectChatSearchResult["kind"];
    matched_at: Date | string;
    message_id: string | null;
    project_id: string;
    project_name: string;
    role: ChatRole | null;
    session_id: string | null;
    session_title: string | null;
    snippet: string;
  }>(sql`
    with owned_projects as (
      select projects.id, projects.name, projects.updated_at
      from projects
      inner join workspaces on workspaces.id = projects.workspace_id
      inner join users on users.id = workspaces.owner_id
      where users.external_id = ${externalUserId}
    ), matches as (
      select
        'project'::text as kind,
        owned_projects.id as project_id,
        owned_projects.name as project_name,
        null::uuid as session_id,
        null::text as session_title,
        null::uuid as message_id,
        null::text as role,
        owned_projects.name::text as snippet,
        owned_projects.updated_at as matched_at
      from owned_projects
      where owned_projects.name ilike ${pattern}

      union all

      select
        'chat'::text as kind,
        owned_projects.id as project_id,
        owned_projects.name as project_name,
        chat_sessions.id as session_id,
        chat_sessions.title::text as session_title,
        null::uuid as message_id,
        null::text as role,
        chat_sessions.title::text as snippet,
        chat_sessions.updated_at as matched_at
      from owned_projects
      inner join chat_sessions on chat_sessions.project_id = owned_projects.id
      inner join users on users.id = chat_sessions.user_id
      where users.external_id = ${externalUserId}
        and chat_sessions.title ilike ${pattern}

      union all

      select
        'message'::text as kind,
        owned_projects.id as project_id,
        owned_projects.name as project_name,
        chat_sessions.id as session_id,
        chat_sessions.title::text as session_title,
        chat_messages.id as message_id,
        chat_messages.role::text as role,
        left(regexp_replace(chat_messages.content, E'[\\n\\r\\t]+', ' ', 'g'), 240) as snippet,
        chat_messages.created_at as matched_at
      from owned_projects
      inner join chat_sessions on chat_sessions.project_id = owned_projects.id
      inner join chat_messages on chat_messages.session_id = chat_sessions.id
      inner join users on users.id = chat_sessions.user_id
      where users.external_id = ${externalUserId}
        and chat_messages.content ilike ${pattern}
    )
    select *
    from matches
    order by matched_at desc
    limit 30
  `);
  return result.rows.map((row) => ({
    kind: row.kind,
    messageId: row.message_id ? String(row.message_id) : null,
    projectId: String(row.project_id),
    projectName: String(row.project_name),
    role: row.role === "user" || row.role === "assistant" ? row.role : null,
    sessionId: row.session_id ? String(row.session_id) : null,
    sessionTitle: row.session_title ? String(row.session_title) : null,
    snippet: String(row.snippet),
    updatedAt: new Date(row.matched_at).toISOString()
  }));
}

async function getOrCreateChatSession(
  input: { projectId: string; sessionId?: string | null; userId: string },
  db: Db
) {
  if (input.sessionId) {
    const existingSessionResult = await db.execute<{ id: string }>(sql`
      select id
      from chat_sessions
      where id = ${input.sessionId}
        and project_id = ${input.projectId}
        and user_id = ${input.userId}
      limit 1
    `);
    const existingSession = existingSessionResult.rows[0];

    if (existingSession) {
      return {
        id: String(existingSession.id),
        resolution: "reused" as const
      };
    }
  }

  const latestSessionResult = await db.execute<{ id: string }>(sql`
    select id
    from chat_sessions
    where project_id = ${input.projectId} and user_id = ${input.userId}
    order by updated_at desc
    limit 1
  `);
  const latestSession = latestSessionResult.rows[0];

  if (latestSession) {
    return {
      id: String(latestSession.id),
      resolution: input.sessionId ? "recovered" as const : "reused" as const
    };
  }

  const createdSessionResult = await db.execute<{ id: string }>(sql`
    insert into chat_sessions (project_id, user_id)
    values (${input.projectId}, ${input.userId})
    returning id
  `);
  const createdSession = createdSessionResult.rows[0];

  if (!createdSession) {
    throw new Error("Failed to create chat session.");
  }

  return {
    id: String(createdSession.id),
    resolution: input.sessionId ? "recovered" as const : "created" as const
  };
}

export async function resolveChatPersistenceContext(
  input: {
    externalUserId: string;
    mode: AiMode;
    projectId: string;
    sessionId?: string | null;
  },
  db: Db = getDatabaseClient()
): Promise<ChatPersistenceContextResult | null> {
  const result = await db.execute<{
    projectId: string;
    userId: string;
  }>(sql`
    select projects.id as "projectId", users.id as "userId"
    from projects
    inner join workspaces on workspaces.id = projects.workspace_id
    inner join users on users.id = workspaces.owner_id
    where projects.id = ${input.projectId}
      and users.external_id = ${input.externalUserId}
    limit 1
  `);
  const row = result.rows[0];

  if (!row) {
    return null;
  }

  const session = await getOrCreateChatSession({
    projectId: String(row.projectId),
    sessionId: input.sessionId ?? null,
    userId: String(row.userId)
  }, db);

  return {
    mode: input.mode,
    projectId: String(row.projectId),
    sessionId: session.id,
    threadResolution: session.resolution,
    userId: String(row.userId)
  };
}

export async function saveChatMessage(
  input: {
    content: string;
    metadata?: Record<string, unknown>;
    mode: AiMode;
    projectId: string;
    role: ChatRole;
    sessionId?: string | null;
    userId: string;
  },
  db: Db = getDatabaseClient()
) {
  const session = await getOrCreateChatSession(
    {
      projectId: input.projectId,
      sessionId: input.sessionId,
      userId: input.userId
    },
    db
  );
  const metadata = JSON.stringify(input.metadata ?? {});

  const messageResult = await db.execute<{ id: string }>(sql`
    insert into chat_messages (session_id, user_id, role, mode, content, metadata)
    values (
      ${session.id},
      ${input.userId},
      ${input.role},
      ${input.mode},
      ${input.content},
      ${metadata}::jsonb
    )
    returning id
  `);
  const message = messageResult.rows[0];

  await db.execute(sql`
    update chat_sessions
    set updated_at = now()
    where id = ${session.id}
  `);

  if (!message) {
    throw new Error("Failed to save chat message.");
  }

  return {
    message: {
      content: input.content,
      id: String(message.id),
      mode: input.mode,
      role: input.role
    },
    session
  };
}

export async function deleteOwnedChatMessage(
  input: {
    messageId: string;
    userId: string;
  },
  db: Db = getDatabaseClient()
) {
  const result = await db.execute<{ id: string }>(sql`
    delete from chat_messages
    where id = ${input.messageId}
      and user_id = ${input.userId}
    returning id
  `);
  return Boolean(result.rows[0]);
}

export async function loadOwnedChatProposal(
  input: {
    externalUserId: string;
    projectId: string;
    proposalId: string;
  },
  db: Db = getDatabaseClient()
) {
  const result = await db.execute<{ metadata: unknown }>(sql`
    select chat_messages.metadata
    from chat_messages
    inner join chat_sessions on chat_sessions.id = chat_messages.session_id
    inner join projects on projects.id = chat_sessions.project_id
    inner join workspaces on workspaces.id = projects.workspace_id
    inner join users on users.id = workspaces.owner_id
    where projects.id = ${input.projectId}
      and users.external_id = ${input.externalUserId}
      and chat_messages.role = 'assistant'
      and chat_messages.metadata -> 'proposal' ->> 'id' = ${input.proposalId}
    order by chat_messages.created_at desc
    limit 1
  `);
  const metadata = result.rows[0]?.metadata;

  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const proposal = (metadata as Record<string, unknown>).proposal;

  if (!proposal || typeof proposal !== "object" || Array.isArray(proposal)) {
    return null;
  }

  return {
    ...(proposal as Record<string, unknown>),
    serverProjectRevision: typeof (metadata as Record<string, unknown>).serverProjectRevision === "string"
      ? (metadata as Record<string, unknown>).serverProjectRevision
      : undefined,
    serverSelectedModel: typeof (metadata as Record<string, unknown>).model === "string"
      ? (metadata as Record<string, unknown>).model
      : undefined,
    serverTaskObjective: typeof (metadata as Record<string, unknown>).serverTaskObjective === "string"
      ? (metadata as Record<string, unknown>).serverTaskObjective
      : undefined
  };
}

export async function loadOwnedChatHandoff(
  input: {
    externalUserId: string;
    handoffId: string;
    projectId: string;
  },
  db: Db = getDatabaseClient()
) {
  const result = await db.execute<{ handoff: unknown }>(sql`
    select chat_messages.metadata -> 'handoff' as handoff
    from chat_messages
    inner join chat_sessions on chat_sessions.id = chat_messages.session_id
    inner join projects on projects.id = chat_sessions.project_id
    inner join workspaces on workspaces.id = projects.workspace_id
    inner join users on users.id = workspaces.owner_id
    where projects.id = ${input.projectId}
      and users.external_id = ${input.externalUserId}
      and chat_messages.role = 'assistant'
      and chat_messages.metadata -> 'handoff' ->> 'id' = ${input.handoffId}
    order by chat_messages.created_at desc
    limit 1
  `);

  return result.rows[0]?.handoff ?? null;
}

export async function loadOwnedHandoffResponse(
  input: {
    externalUserId: string;
    projectId: string;
    requestKey: string;
  },
  db: Db = getDatabaseClient()
) {
  const result = await db.execute<{ content: string; metadata: unknown }>(sql`
    select chat_messages.content, chat_messages.metadata
    from chat_messages
    inner join chat_sessions on chat_sessions.id = chat_messages.session_id
    inner join projects on projects.id = chat_sessions.project_id
    inner join workspaces on workspaces.id = projects.workspace_id
    inner join users on users.id = workspaces.owner_id
    where projects.id = ${input.projectId}
      and users.external_id = ${input.externalUserId}
      and chat_messages.role = 'assistant'
      and chat_messages.metadata ->> 'sourceHandoffRequestKey' = ${input.requestKey}
    order by chat_messages.created_at desc
    limit 1
  `);
  const row = result.rows[0];

  if (!row || !row.metadata || typeof row.metadata !== "object" || Array.isArray(row.metadata)) {
    return null;
  }

  return {
    content: String(row.content),
    metadata: row.metadata as Record<string, unknown>
  };
}

export async function loadOwnedProjectRevision(
  input: {
    externalUserId: string;
    projectId: string;
  },
  db: Db = getDatabaseClient()
) {
  const ownership = await db.execute<{ id: string }>(sql`
    select projects.id
    from projects
    inner join workspaces on workspaces.id = projects.workspace_id
    inner join users on users.id = workspaces.owner_id
    where projects.id = ${input.projectId}
      and users.external_id = ${input.externalUserId}
    limit 1
  `);
  if (!ownership.rows[0]) return null;
  const result = await db.execute<{
    content: string;
    content_hash: null | string;
    path: string;
  }>(sql`
    select path, content, content_hash
    from files
    where project_id = ${input.projectId}
    order by path asc
  `);
  return projectContentRevision(result.rows.map((file) => ({
    content: file.content,
    contentHash: file.content_hash,
    path: file.path
  })));
}

export async function beginOwnedChatProposalApproval(
  input: {
    expectedProjectRevision: string;
    externalUserId: string;
    projectId: string;
    proposalId: string;
  },
  db: Db = getDatabaseClient()
) {
  return db.transaction(async (tx) => {
    const projectResult = await tx.execute<{ id: string }>(sql`
      select projects.id
      from projects
      inner join workspaces on workspaces.id = projects.workspace_id
      inner join users on users.id = workspaces.owner_id
      where projects.id = ${input.projectId}
        and users.external_id = ${input.externalUserId}
      limit 1
      for update of projects
    `);
    if (!projectResult.rows[0]) return { status: "missing" as const };
    const result = await tx.execute<{
      id: string;
      metadata: unknown;
    }>(sql`
      select chat_messages.id, chat_messages.metadata
      from chat_messages
      inner join chat_sessions on chat_sessions.id = chat_messages.session_id
      inner join projects on projects.id = chat_sessions.project_id
      inner join workspaces on workspaces.id = projects.workspace_id
      inner join users on users.id = workspaces.owner_id
      where projects.id = ${input.projectId}
        and users.external_id = ${input.externalUserId}
        and chat_messages.role = 'assistant'
        and chat_messages.metadata -> 'proposal' ->> 'id' = ${input.proposalId}
      order by chat_messages.created_at desc
      limit 1
      for update
    `);
    const row = result.rows[0];
    if (!row || !row.metadata || typeof row.metadata !== "object" || Array.isArray(row.metadata)) {
      return { status: "missing" as const };
    }
    const metadata = row.metadata as Record<string, unknown>;
    const approval = metadata.proposalApproval &&
      typeof metadata.proposalApproval === "object" &&
      !Array.isArray(metadata.proposalApproval)
      ? metadata.proposalApproval as Record<string, unknown>
      : {};
    if (approval.status === "completed") {
      return {
        result: approval.result &&
          typeof approval.result === "object" &&
          !Array.isArray(approval.result)
          ? approval.result as Record<string, unknown>
          : {},
        status: "completed" as const
      };
    }
    const currentFileResult = await tx.execute<{
      content: string;
      content_hash: null | string;
      path: string;
    }>(sql`
      select path, content, content_hash
      from files
      where project_id = ${input.projectId}
      order by path asc
    `);
    const currentRevision = projectContentRevision(currentFileResult.rows.map((file) => ({
      content: file.content,
      contentHash: file.content_hash,
      path: file.path
    })));
    if (currentRevision !== input.expectedProjectRevision) {
      return { status: "stale" as const };
    }
    const activeResult = await tx.execute<{ metadata: unknown }>(sql`
      select chat_messages.metadata
      from chat_messages
      inner join chat_sessions on chat_sessions.id = chat_messages.session_id
      where chat_sessions.project_id = ${input.projectId}
        and chat_messages.role = 'assistant'
        and chat_messages.metadata -> 'proposalApproval' ->> 'status' = 'executing'
        and chat_messages.metadata -> 'proposal' ->> 'id' <> ${input.proposalId}
      order by chat_messages.created_at desc
    `);
    const activeProjectExecution = activeResult.rows.some((entry) => {
      if (!entry.metadata || typeof entry.metadata !== "object" || Array.isArray(entry.metadata)) {
        return false;
      }
      const entryApproval = (entry.metadata as Record<string, unknown>).proposalApproval;
      if (!entryApproval || typeof entryApproval !== "object" || Array.isArray(entryApproval)) {
        return false;
      }
      const entryClaimedAt = typeof (entryApproval as Record<string, unknown>).claimedAt === "string"
        ? Date.parse((entryApproval as Record<string, unknown>).claimedAt as string)
        : Number.NaN;
      return Number.isFinite(entryClaimedAt) && Date.now() - entryClaimedAt < proposalApprovalLeaseMs;
    });
    if (activeProjectExecution) return { status: "project_busy" as const };
    const claimedAt = typeof approval.claimedAt === "string"
      ? Date.parse(approval.claimedAt)
      : Number.NaN;
    if (
      approval.status === "executing" &&
      Number.isFinite(claimedAt) &&
      Date.now() - claimedAt < proposalApprovalLeaseMs
    ) {
      return { status: "executing" as const };
    }
    const claimToken = randomUUID();
    const nextApproval = JSON.stringify({
      claimedAt: new Date().toISOString(),
      claimToken,
      status: "executing"
    });
    await tx.execute(sql`
      update chat_messages
      set metadata = jsonb_set(metadata, '{proposalApproval}', ${nextApproval}::jsonb, true)
      where id = ${row.id}
    `);
    return { claimToken, status: "acquired" as const };
  });
}

export async function completeOwnedChatProposalApproval(
  input: {
    claimToken: string;
    externalUserId: string;
    projectId: string;
    proposalId: string;
    result: Record<string, unknown>;
  },
  db: Db = getDatabaseClient()
) {
  const approval = JSON.stringify({
    completedAt: new Date().toISOString(),
    result: input.result,
    status: "completed"
  });
  const result = await db.execute<{ id: string }>(sql`
    update chat_messages
    set metadata = jsonb_set(metadata, '{proposalApproval}', ${approval}::jsonb, true)
    from chat_sessions, projects, workspaces, users
    where chat_messages.session_id = chat_sessions.id
      and projects.id = chat_sessions.project_id
      and workspaces.id = projects.workspace_id
      and users.id = workspaces.owner_id
      and projects.id = ${input.projectId}
      and users.external_id = ${input.externalUserId}
      and chat_messages.role = 'assistant'
      and chat_messages.metadata -> 'proposal' ->> 'id' = ${input.proposalId}
      and chat_messages.metadata -> 'proposalApproval' ->> 'status' = 'executing'
      and chat_messages.metadata -> 'proposalApproval' ->> 'claimToken' = ${input.claimToken}
    returning chat_messages.id
  `);
  return Boolean(result.rows[0]);
}

export async function releaseOwnedChatProposalApproval(
  input: {
    claimToken: string;
    externalUserId: string;
    projectId: string;
    proposalId: string;
  },
  db: Db = getDatabaseClient()
) {
  const approval = JSON.stringify({
    releasedAt: new Date().toISOString(),
    status: "pending"
  });
  const result = await db.execute<{ id: string }>(sql`
    update chat_messages
    set metadata = jsonb_set(metadata, '{proposalApproval}', ${approval}::jsonb, true)
    from chat_sessions, projects, workspaces, users
    where chat_messages.session_id = chat_sessions.id
      and projects.id = chat_sessions.project_id
      and workspaces.id = projects.workspace_id
      and users.id = workspaces.owner_id
      and projects.id = ${input.projectId}
      and users.external_id = ${input.externalUserId}
      and chat_messages.role = 'assistant'
      and chat_messages.metadata -> 'proposal' ->> 'id' = ${input.proposalId}
      and chat_messages.metadata -> 'proposalApproval' ->> 'status' = 'executing'
      and chat_messages.metadata -> 'proposalApproval' ->> 'claimToken' = ${input.claimToken}
    returning chat_messages.id
  `);
  return Boolean(result.rows[0]);
}

export async function loadChatHistory(
  input: { limit?: number; projectId: string; sessionId?: string | null; userId: string },
  db: Db = getDatabaseClient()
) {
  const session = await getOrCreateChatSession(
    {
      projectId: input.projectId,
      sessionId: input.sessionId,
      userId: input.userId
    },
    db
  );

  const messages = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.sessionId, session.id))
    .orderBy(asc(chatMessages.createdAt))
    .limit(input.limit ?? 80);

  return {
    messages,
    session
  };
}
