import { sql } from "drizzle-orm";
import { index, integer, pgTable, text, timestamp, uuid, varchar, type AnyPgColumn } from "drizzle-orm/pg-core";
import { chatMessages } from "./chat-messages";
import { memoryPeople } from "./memory-people";
import { users } from "./users";

export const userMemoryRecords = pgTable(
  "user_memory_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    personId: uuid("person_id").references(() => memoryPeople.id, { onDelete: "set null" }),
    previousRecordId: uuid("previous_record_id").references(
      (): AnyPgColumn => userMemoryRecords.id,
      { onDelete: "set null" }
    ),
    category: varchar("category", { length: 32 }).notNull(),
    key: varchar("key", { length: 160 }).notNull(),
    normalizedKey: varchar("normalized_key", { length: 160 }).notNull(),
    value: text("value").notNull(),
    normalizedValue: text("normalized_value").notNull(),
    sensitivity: varchar("sensitivity", { length: 24 }).notNull().default("standard"),
    confidenceBps: integer("confidence_bps").notNull(),
    captureMethod: varchar("capture_method", { length: 24 }).notNull(),
    sourceType: varchar("source_type", { length: 24 }).notNull().default("user_message"),
    sourceMessageId: uuid("source_message_id").references(() => chatMessages.id, { onDelete: "set null" }),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    forgottenAt: timestamp("forgotten_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`now()`)
  },
  (table) => ({
    userMemoryCategoryIdx: index("user_memory_category_idx").on(table.userId, table.category),
    userMemoryPersonStatusIdx: index("user_memory_person_status_idx").on(table.personId, table.status),
    userMemorySourceMessageIdx: index("user_memory_source_message_idx").on(table.sourceMessageId),
    userMemoryStatusUpdatedIdx: index("user_memory_status_updated_idx").on(
      table.userId,
      table.status,
      table.updatedAt
    )
  })
);
