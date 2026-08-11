import { relations } from "drizzle-orm";
import { aiRequests } from "./ai-requests";
import { chatMessages } from "./chat-messages";
import { chatSessions } from "./chat-sessions";
import { files } from "./files";
import { intelligencePreferences } from "./intelligence-preferences";
import { intelligenceSourceConnections } from "./intelligence-source-connections";
import { intelligenceUsageRecords } from "./intelligence-usage-records";
import { memoryPeople } from "./memory-people";
import { projects } from "./projects";
import { prompts } from "./prompts";
import { snapshots } from "./snapshots";
import { usageEvents } from "./usage-events";
import { userMemoryRecords } from "./user-memory-records";
import { users } from "./users";
import { workspaces } from "./workspaces";

export const usersRelations = relations(users, ({ many, one }) => ({
  aiRequests: many(aiRequests),
  chatMessages: many(chatMessages),
  chatSessions: many(chatSessions),
  intelligencePreferences: one(intelligencePreferences),
  intelligenceSourceConnections: many(intelligenceSourceConnections),
  intelligenceUsageRecords: many(intelligenceUsageRecords),
  memoryPeople: many(memoryPeople),
  prompts: many(prompts),
  snapshots: many(snapshots),
  usageEvents: many(usageEvents),
  userMemoryRecords: many(userMemoryRecords),
  workspaces: many(workspaces)
}));

export const memoryPeopleRelations = relations(memoryPeople, ({ one, many }) => ({
  memories: many(userMemoryRecords),
  user: one(users, {
    fields: [memoryPeople.userId],
    references: [users.id]
  })
}));

export const userMemoryRecordsRelations = relations(userMemoryRecords, ({ one }) => ({
  person: one(memoryPeople, {
    fields: [userMemoryRecords.personId],
    references: [memoryPeople.id]
  }),
  sourceMessage: one(chatMessages, {
    fields: [userMemoryRecords.sourceMessageId],
    references: [chatMessages.id]
  }),
  user: one(users, {
    fields: [userMemoryRecords.userId],
    references: [users.id]
  })
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
  chatSessions: many(chatSessions),
  files: many(files),
  intelligenceUsageRecords: many(intelligenceUsageRecords),
  prompts: many(prompts),
  snapshots: many(snapshots)
}));

export const chatSessionsRelations = relations(chatSessions, ({ one, many }) => ({
  messages: many(chatMessages),
  project: one(projects, {
    fields: [chatSessions.projectId],
    references: [projects.id]
  }),
  user: one(users, {
    fields: [chatSessions.userId],
    references: [users.id]
  })
}));

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  session: one(chatSessions, {
    fields: [chatMessages.sessionId],
    references: [chatSessions.id]
  }),
  user: one(users, {
    fields: [chatMessages.userId],
    references: [users.id]
  })
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

export const intelligencePreferencesRelations = relations(intelligencePreferences, ({ one }) => ({
  user: one(users, {
    fields: [intelligencePreferences.userId],
    references: [users.id]
  })
}));

export const intelligenceSourceConnectionsRelations = relations(intelligenceSourceConnections, ({ one }) => ({
  user: one(users, {
    fields: [intelligenceSourceConnections.userId],
    references: [users.id]
  })
}));

export const intelligenceUsageRecordsRelations = relations(intelligenceUsageRecords, ({ one }) => ({
  project: one(projects, {
    fields: [intelligenceUsageRecords.projectId],
    references: [projects.id]
  }),
  user: one(users, {
    fields: [intelligenceUsageRecords.userId],
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
