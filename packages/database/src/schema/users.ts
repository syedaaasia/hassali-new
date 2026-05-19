import { sql } from "drizzle-orm";
import { index, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    externalId: varchar("external_id", { length: 191 }).notNull().unique(),
    email: varchar("email", { length: 320 }).notNull().unique(),
    displayName: varchar("display_name", { length: 120 }),
    imageUrl: text("image_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`now()`)
  },
  (table) => ({
    usersExternalIdIdx: index("users_external_id_idx").on(table.externalId),
    usersEmailIdx: index("users_email_idx").on(table.email)
  })
);
