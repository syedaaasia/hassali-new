import { index, jsonb, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { snapshotKind } from "./enums";
import { projects } from "./projects";
import { users } from "./users";

export const snapshots = pgTable(
  "snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    kind: snapshotKind("kind").notNull().default("manual"),
    label: varchar("label", { length: 160 }),
    storageKey: text("storage_key"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    snapshotsCreatedByIdIdx: index("snapshots_created_by_id_idx").on(table.createdById),
    snapshotsProjectIdIdx: index("snapshots_project_id_idx").on(table.projectId)
  })
);
