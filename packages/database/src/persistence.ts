import { createHash } from "node:crypto";
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

export type ChatPersistenceContextResult = {
  mode: AiMode;
  projectId: string;
  sessionId: string | null;
  userId: string;
};

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

function readSizeBytes(content: string) {
  return Buffer.byteLength(content, "utf8");
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
  const contentHash = hashContent(input.content);
  const name = fileNameFromPath(input.path);
  const sizeBytes = readSizeBytes(input.content);
  const updatedResult = await db.execute<{
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

  const createdResult = await db.execute<{
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
  const contentHash = hashContent(input.content);
  const name = fileNameFromPath(input.path);
  const sizeBytes = readSizeBytes(input.content);
  const ownedProjectResult = await db.execute<{ id: string }>(sql`
    select projects.id
    from projects
    inner join workspaces on workspaces.id = projects.workspace_id
    inner join users on users.id = workspaces.owner_id
    where projects.id = ${input.projectId}
      and users.external_id = ${input.externalUserId}
    limit 1
  `);
  const ownedProject = ownedProjectResult.rows[0];

  if (!ownedProject) {
    return null;
  }

  await db.execute(sql`
    update files
    set
      content = ${input.content},
      content_hash = ${contentHash},
      name = ${name},
      size_bytes = ${sizeBytes}
    where project_id = ${input.projectId} and path = ${input.path}
  `);

  let fileResult = await db.execute<{
    content: string;
    id: string;
    path: string;
  }>(sql`
    select id, path, content
    from files
    where project_id = ${input.projectId} and path = ${input.path}
    limit 1
  `);
  let file = fileResult.rows[0];

  if (!file) {
    await db.execute(sql`
      insert into files (project_id, path, name, content, content_hash, size_bytes)
      values (${input.projectId}, ${input.path}, ${name}, ${input.content}, ${contentHash}, ${sizeBytes})
    `);

    fileResult = await db.execute<{
      content: string;
      id: string;
      path: string;
    }>(sql`
      select id, path, content
      from files
      where project_id = ${input.projectId} and path = ${input.path}
      limit 1
    `);
    file = fileResult.rows[0];
  }

  if (!file) {
    throw new Error("Failed to save file.");
  }

  return file;
}

export async function loadWorkspaceForExternalUser(
  externalUserId: string,
  selectedProjectId?: string | null,
  db: Db = getDatabaseClient()
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
    db.execute<{
      id: string;
    }>(sql`
      select id
      from chat_sessions
      where project_id = ${project.id} and user_id = ${user.id}
      order by created_at desc
      limit 1
    `)
  ]);
  const session = sessionResult.rows[0];
  const messagesResult = session
    ? await db.execute<{
        content: string;
        id: string;
        mode: AiMode;
        role: ChatRole;
      }>(sql`
        select id, role, content, mode
        from chat_messages
        where session_id = ${session.id}
        order by created_at asc
      `)
    : { rows: [] };

  return {
    chat: {
      messages: messagesResult.rows.map((message) => ({
        content: String(message.content),
        id: String(message.id),
        mode: message.mode,
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

async function getOrCreateChatSession(
  input: { projectId: string; sessionId?: string | null; userId: string },
  db: Db
) {
  if (input.sessionId) {
    const existingSessionResult = await db.execute<{ id: string }>(sql`
      select id
      from chat_sessions
      where id = ${input.sessionId} and project_id = ${input.projectId}
      limit 1
    `);
    const existingSession = existingSessionResult.rows[0];

    if (existingSession) {
      return {
        id: String(existingSession.id)
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
      id: String(latestSession.id)
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
    id: String(createdSession.id)
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

  return {
    mode: input.mode,
    projectId: String(row.projectId),
    sessionId: input.sessionId ?? null,
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
