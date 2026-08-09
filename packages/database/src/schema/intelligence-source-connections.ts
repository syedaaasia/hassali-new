import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar
} from "drizzle-orm/pg-core";
import { users } from "./users";

export const intelligenceSourceConnections = pgTable(
  "intelligence_source_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sourceId: varchar("source_id", { length: 80 }).notNull(),
    enabled: boolean("enabled").notNull().default(true),
    endpointUrl: text("endpoint_url"),
    defaultModel: varchar("default_model", { length: 240 }),
    credentialCiphertext: text("credential_ciphertext"),
    credentialIv: varchar("credential_iv", { length: 64 }),
    credentialAuthTag: varchar("credential_auth_tag", { length: 64 }),
    credentialKeyVersion: varchar("credential_key_version", { length: 40 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`now()`)
  },
  (table) => ({
    intelligenceSourceConnectionsSourceIdx: index("intelligence_source_connections_source_idx").on(table.sourceId),
    intelligenceSourceConnectionsUserSourceIdx: uniqueIndex("intelligence_source_connections_user_source_idx").on(
      table.userId,
      table.sourceId
    )
  })
);
