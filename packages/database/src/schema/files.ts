import { sql } from "drizzle-orm";
import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
  type AnyPgColumn
} from "drizzle-orm/pg-core";
import { fileKind } from "./enums";
import { projects } from "./projects";

export const files = pgTable(
  "files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id").references((): AnyPgColumn => files.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    kind: fileKind("kind").notNull().default("file"),
    content: text("content").notNull().default(""),
    sizeBytes: integer("size_bytes").notNull().default(0),
    contentHash: varchar("content_hash", { length: 128 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`now()`)
  },
  (table) => ({
    filesParentIdIdx: index("files_parent_id_idx").on(table.parentId),
    filesProjectIdIdx: index("files_project_id_idx").on(table.projectId),
    filesProjectPathIdx: index("files_project_path_idx").on(table.projectId, table.path)
  })
);
