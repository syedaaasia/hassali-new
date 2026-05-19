import { relations } from "drizzle-orm";
import { aiRequests } from "./ai-requests";
import { files } from "./files";
import { projects } from "./projects";
import { prompts } from "./prompts";
import { snapshots } from "./snapshots";
import { usageEvents } from "./usage-events";
import { users } from "./users";
import { workspaces } from "./workspaces";

export const usersRelations = relations(users, ({ many }) => ({
  aiRequests: many(aiRequests),
  prompts: many(prompts),
  snapshots: many(snapshots),
  usageEvents: many(usageEvents),
  workspaces: many(workspaces)
}));

export const workspacesRelations = relations(workspaces, ({ one, many }) => ({
  owner: one(users, {
    fields: [workspaces.ownerId],
    references: [users.id]
  }),
  projects: many(projects)
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [projects.workspaceId],
    references: [workspaces.id]
  }),
  aiRequests: many(aiRequests),
  files: many(files),
  prompts: many(prompts),
  snapshots: many(snapshots)
}));

export const filesRelations = relations(files, ({ one, many }) => ({
  project: one(projects, {
    fields: [files.projectId],
    references: [projects.id]
  }),
  parent: one(files, {
    fields: [files.parentId],
    references: [files.id],
    relationName: "file_parent"
  }),
  children: many(files, {
    relationName: "file_parent"
  })
}));

export const promptsRelations = relations(prompts, ({ one, many }) => ({
  project: one(projects, {
    fields: [prompts.projectId],
    references: [projects.id]
  }),
  user: one(users, {
    fields: [prompts.userId],
    references: [users.id]
  }),
  aiRequests: many(aiRequests)
}));

export const aiRequestsRelations = relations(aiRequests, ({ one, many }) => ({
  project: one(projects, {
    fields: [aiRequests.projectId],
    references: [projects.id]
  }),
  prompt: one(prompts, {
    fields: [aiRequests.promptId],
    references: [prompts.id]
  }),
  user: one(users, {
    fields: [aiRequests.userId],
    references: [users.id]
  }),
  usageEvents: many(usageEvents)
}));

export const usageEventsRelations = relations(usageEvents, ({ one }) => ({
  aiRequest: one(aiRequests, {
    fields: [usageEvents.aiRequestId],
    references: [aiRequests.id]
  }),
  user: one(users, {
    fields: [usageEvents.userId],
    references: [users.id]
  })
}));

export const snapshotsRelations = relations(snapshots, ({ one }) => ({
  createdBy: one(users, {
    fields: [snapshots.createdById],
    references: [users.id]
  }),
  project: one(projects, {
    fields: [snapshots.projectId],
    references: [projects.id]
  })
}));
