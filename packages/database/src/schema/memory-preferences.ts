import { sql } from "drizzle-orm";
import { boolean, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";

export const memoryPreferences = pgTable("memory_preferences", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  memoryEnabled: boolean("memory_enabled").notNull().default(true),
  automaticMemoryEnabled: boolean("automatic_memory_enabled").notNull().default(true),
  sensitiveMemoryAllowed: boolean("sensitive_memory_allowed").notNull().default(false),
  paused: boolean("paused").notNull().default(false),
  userMemoryEnabled: boolean("user_memory_enabled").notNull().default(true),
  projectMemoryEnabled: boolean("project_memory_enabled").notNull().default(true),
  conversationMemoryEnabled: boolean("conversation_memory_enabled").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => sql`now()`)
});
