import { sql } from "drizzle-orm";
import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { projects } from "./projects";

export const projectNotes = pgTable("project_notes", {
  projectId: uuid("project_id").primaryKey().references(() => projects.id, { onDelete: "cascade" }),
  hassaliSummary: text("hassali_summary").notNull().default(""),
  manualNotes: text("manual_notes").notNull().default(""),
  useAsContext: boolean("use_as_context").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => sql`now()`)
});
