import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgTable, text, timestamp, uuid, varchar, type AnyPgColumn } from "drizzle-orm/pg-core";
import { chatMessages } from "./chat-messages";
import { chatSessions } from "./chat-sessions";
import { projects } from "./projects";
import { users } from "./users";

export const projectMemoryRecords = pgTable(
  "project_memory_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(() => chatSessions.id, { onDelete: "cascade" }),
    sourceMessageId: uuid("source_message_id").references(() => chatMessages.id, { onDelete: "cascade" }),
    previousRecordId: uuid("previous_record_id").references(
      (): AnyPgColumn => projectMemoryRecords.id,
      { onDelete: "set null" }
    ),
    memoryType: varchar("memory_type", { length: 32 }).notNull(),
    category: varchar("category", { length: 40 }).notNull(),
    title: varchar("title", { length: 180 }).notNull(),
    normalizedKey: varchar("normalized_key", { length: 180 }).notNull(),
    content: text("content").notNull(),
    normalizedContent: text("normalized_content").notNull(),
    status: varchar("status", { length: 24 }).notNull().default("active"),
    importance: varchar("importance", { length: 16 }).notNull().default("normal"),
    confidenceBps: integer("confidence_bps").notNull().default(9000),
    sourceType: varchar("source_type", { length: 32 }).notNull().default("user_message"),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    provenance: jsonb("provenance").$type<Record<string, unknown>>().notNull().default({}),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => sql`now()`)
  },
  (table) => ({
    projectMemoryOwnerProjectIdx: index("project_memory_owner_project_idx").on(table.userId, table.projectId),
    projectMemoryProjectStatusIdx: index("project_memory_project_status_idx").on(table.projectId, table.status, table.updatedAt),
    projectMemoryProjectCategoryIdx: index("project_memory_project_category_idx").on(table.projectId, table.category),
    projectMemoryConversationIdx: index("project_memory_conversation_idx").on(table.conversationId),
    projectMemorySourceMessageIdx: index("project_memory_source_message_idx").on(table.sourceMessageId)
  })
);
