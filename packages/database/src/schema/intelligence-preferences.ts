import { sql } from "drizzle-orm";
import { bigint, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { users } from "./users";

export const intelligencePreferences = pgTable("intelligence_preferences", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  routingPrivacy: varchar("routing_privacy", { length: 24 }).notNull().default("allow-cloud"),
  budgetMode: varchar("budget_mode", { length: 16 }).notNull().default("off"),
  managedPerRequestLimitMicros: bigint("managed_per_request_limit_micros", { mode: "number" }),
  managedMonthlyLimitMicros: bigint("managed_monthly_limit_micros", { mode: "number" }),
  byokMonthlyWarningLimitMicros: bigint("byok_monthly_warning_limit_micros", { mode: "number" }),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => sql`now()`)
});
