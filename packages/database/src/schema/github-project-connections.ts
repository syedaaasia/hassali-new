import { sql } from "drizzle-orm";
import { boolean, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { projects } from "./projects";
import { users } from "./users";

export const githubProjectConnections = pgTable("github_project_connections", {
  projectId: uuid("project_id").primaryKey().references(() => projects.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  repositoryOwner: varchar("repository_owner", { length: 120 }).notNull(),
  repositoryName: varchar("repository_name", { length: 180 }).notNull(),
  defaultBranch: varchar("default_branch", { length: 240 }).notNull(),
  private: boolean("private").notNull().default(false),
  htmlUrl: text("html_url").notNull(),
  lastKnownHead: varchar("last_known_head", { length: 64 }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => sql`now()`)
});
