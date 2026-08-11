import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { chatMessages } from "./chat-messages";
import { chatSessions } from "./chat-sessions";
import { projects } from "./projects";
import { users } from "./users";

export const projectEpisodes = pgTable(
  "project_episodes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(() => chatSessions.id, { onDelete: "cascade" }),
    sourceMessageId: uuid("source_message_id").references(() => chatMessages.id, { onDelete: "cascade" }),
    eventType: varchar("event_type", { length: 40 }).notNull(),
    description: text("description").notNull(),
    outcome: text("outcome"),
    status: varchar("status", { length: 24 }).notNull(),
    importance: varchar("importance", { length: 16 }).notNull().default("normal"),
    checkpoint: varchar("checkpoint", { length: 180 }),
    relatedFiles: jsonb("related_files").$type<string[]>().notNull().default([]),
    provenance: jsonb("provenance").$type<Record<string, unknown>>().notNull().default({}),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => sql`now()`)
  },
  (table) => ({
    projectEpisodesOwnerProjectIdx: index("project_episodes_owner_project_idx").on(table.userId, table.projectId),
    projectEpisodesProjectStatusIdx: index("project_episodes_project_status_idx").on(table.projectId, table.status, table.occurredAt),
    projectEpisodesConversationIdx: index("project_episodes_conversation_idx").on(table.conversationId),
    projectEpisodesSourceMessageIdx: index("project_episodes_source_message_idx").on(table.sourceMessageId)
  })
);
