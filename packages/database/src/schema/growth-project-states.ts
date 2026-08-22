import { sql } from "drizzle-orm";
import { jsonb, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { projects } from "./projects";
import { users } from "./users";

export const growthProjectStates = pgTable("growth_project_states", {
  projectId: uuid("project_id").primaryKey().references(() => projects.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  state: jsonb("state").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => sql`now()`)
});
