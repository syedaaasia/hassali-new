import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { chatMessages } from "./chat-messages";
import { chatSessions } from "./chat-sessions";
import { projects } from "./projects";
import { users } from "./users";

export const conversationMemories = pgTable(
  "conversation_memories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").notNull().references(() => chatSessions.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 160 }).notNull(),
    summary: text("summary").notNull().default(""),
    keyDecisions: jsonb("key_decisions").$type<string[]>().notNull().default([]),
    unresolvedItems: jsonb("unresolved_items").$type<string[]>().notNull().default([]),
    importantReferences: jsonb("important_references").$type<string[]>().notNull().default([]),
    checkpoints: jsonb("checkpoints").$type<string[]>().notNull().default([]),
    firstSourceMessageId: uuid("first_source_message_id").references(() => chatMessages.id, { onDelete: "set null" }),
    lastSourceMessageId: uuid("last_source_message_id").references(() => chatMessages.id, { onDelete: "set null" }),
    sourceMessageCount: integer("source_message_count").notNull().default(0),
    sourceFingerprint: varchar("source_fingerprint", { length: 64 }).notNull(),
    revision: integer("revision").notNull().default(1),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => sql`now()`)
  },
  (table) => ({
    conversationMemoryUniqueIdx: uniqueIndex("conversation_memories_conversation_unique_idx").on(table.conversationId),
    conversationMemoryOwnerProjectIdx: index("conversation_memories_owner_project_idx").on(table.userId, table.projectId),
    conversationMemoryProjectActivityIdx: index("conversation_memories_project_activity_idx").on(table.projectId, table.lastActivityAt)
  })
);
