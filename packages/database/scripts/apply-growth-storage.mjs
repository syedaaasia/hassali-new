import { readFile } from 'node:fs/promises';
import process from 'node:process';
import console from 'node:console';
import { URL } from 'node:url';
import pg from 'pg';

// This database has partially applied later migrations. Do not mark the whole
// migration complete or replay its unrelated tables.
const sql = await readFile(new URL('../drizzle/0006_overconfident_legion.sql', import.meta.url), 'utf8');
const statements = sql.split('--> statement-breakpoint').map(s => s.trim()).filter(s =>
  /^(?:CREATE TABLE|ALTER TABLE) "growth_project_states"\s/.test(s));
if (statements.length !== 3) throw new Error('Unexpected Growth migration shape; manual review required.');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
const target = new URL(process.env.DATABASE_URL);
if (!['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)) throw new Error('This command is local-development only.');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
try {
  await client.connect();
  await client.query('BEGIN');
  await client.query("SET LOCAL lock_timeout = '5s'");
  await client.query("SET LOCAL statement_timeout = '10s'");
  await client.query("SELECT pg_advisory_xact_lock(hashtext('hassali-growth-storage-0006'))");
  const exists = (await client.query("SELECT to_regclass('public.growth_project_states') AS name")).rows[0].name;
  if (!exists && process.argv.includes('--apply')) {
    for (const statement of statements) await client.query(statement);
    await client.query('COMMIT');
    console.log('Growth storage created from the three existing migration 0006 statements. Other tables and migration journal unchanged.');
  } else {
    await client.query('ROLLBACK');
    console.log(exists ? 'Growth storage already exists; no changes made.' : 'Growth storage missing. Explicit --apply is required.');
  }
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('Growth storage apply failed:', typeof error.code === 'string' ? error.code : 'LOCAL_APPLY_FAILED');
  process.exitCode = 1;
} finally {
  await client.end();
}
