import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
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
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    max: 5
  });

  return drizzle(pool, { schema });
}

export type DatabaseClient = ReturnType<typeof createDatabaseClient>;

let cachedDatabaseClient: DatabaseClient | null = null;

export function getDatabaseClient() {
  cachedDatabaseClient ??= createDatabaseClient();

  return cachedDatabaseClient;
}

export async function probeDatabaseConnection() {
  await getDatabaseClient().execute(sql`select 1`);
}

export const db = new Proxy({} as DatabaseClient, {
  get(_target, property, receiver) {
    return Reflect.get(getDatabaseClient(), property, receiver);
  }
});
