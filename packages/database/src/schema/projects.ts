import { sql } from "drizzle-orm";
import { index, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces";

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 140 }).notNull(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`now()`)
  },
  (table) => ({
    projectsWorkspaceIdIdx: index("projects_workspace_id_idx").on(table.workspaceId)
  })
);
