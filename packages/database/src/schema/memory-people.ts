import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { users } from "./users";

export const memoryPeople = pgTable(
  "memory_people",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    canonicalName: varchar("canonical_name", { length: 160 }).notNull(),
    normalizedName: varchar("normalized_name", { length: 160 }).notNull(),
    aliases: jsonb("aliases").$type<string[]>().notNull().default([]),
    relationship: varchar("relationship", { length: 80 }),
    normalizedRelationship: varchar("normalized_relationship", { length: 80 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`now()`)
  },
  (table) => ({
    memoryPeopleUserNameIdx: index("memory_people_user_name_idx").on(table.userId, table.normalizedName),
    memoryPeopleUserRelationshipIdx: index("memory_people_user_relationship_idx").on(
      table.userId,
      table.normalizedRelationship
    )
  })
);
