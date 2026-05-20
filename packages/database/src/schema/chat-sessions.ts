import { sql } from "drizzle-orm";
import { index, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { projects } from "./projects";
import { users } from "./users";

export const chatSessions = pgTable(
  "chat_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    title: varchar("title", { length: 160 }).notNull().default("Workspace chat"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`now()`)
  },
  (table) => ({
    chatSessionsProjectIdIdx: index("chat_sessions_project_id_idx").on(table.projectId),
    chatSessionsUserIdIdx: index("chat_sessions_user_id_idx").on(table.userId)
  })
);
