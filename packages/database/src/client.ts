import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { z } from "zod";
import * as schema from "./schema/index";

const databaseEnvSchema = z.object({
  DATABASE_URL: z.string().url()
});

function readDatabaseUrl() {
  const parsedEnv = databaseEnvSchema.safeParse(process.env);

  if (!parsedEnv.success) {
    throw new Error("DATABASE_URL is required for database connections.");
  }

  return parsedEnv.data.DATABASE_URL;
}

export function createDatabaseClient(connectionString = readDatabaseUrl()) {
  const pool = new Pool({
    connectionString,
    max: 5
  });

  return drizzle(pool, { schema });
}

export const db = createDatabaseClient();
