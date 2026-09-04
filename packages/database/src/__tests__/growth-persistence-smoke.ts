import assert from "node:assert/strict";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import type { DatabaseClient } from "../client";
import { getOwnedGrowthProjectState, ownsGrowthProject, upsertOwnedGrowthProjectState } from "../founder-acceptance-persistence";

const input = { externalUserId: "test-owner", projectId: "11111111-1111-4111-8111-111111111111" };
function fixture(results: unknown[][]) {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  const db = { execute: async (query: SQL) => { queries.push(new PgDialect().sqlToQuery(query)); const rows = results.shift(); assert.ok(rows, "unexpected database call"); return { rows }; } } as unknown as DatabaseClient;
  return { db, queries };
}
let count = 0;
async function test(name: string, fn: () => Promise<void>) { await fn(); count++; console.log(`PASS ${name}`); }
await test("ownership requires current project workspace owner", async () => { const f = fixture([[{ owned: true }]]); assert.equal(await ownsGrowthProject(input, f.db), true); assert.match(f.queries[0].sql, /workspaces.owner_id/); assert.ok(f.queries[0].params.includes(input.externalUserId)); });
await test("cross-owner read stops before loading state", async () => { const f = fixture([[{ owned: false }]]); assert.equal(await getOwnedGrowthProjectState(input, f.db), null); assert.equal(f.queries.length, 1); });
await test("owned read also scopes saved state to user", async () => { const row = { state: { discovery: { version: 1 } }, updatedAt: new Date() }; const f = fixture([[{ owned: true }], [row]]); assert.deepEqual(await getOwnedGrowthProjectState(input, f.db), row); assert.match(f.queries[1].sql, /users.external_id/); assert.ok(f.queries[1].params.includes(input.projectId)); });
await test("cross-owner write denied before insert", async () => { const f = fixture([[{ owned: false }]]); assert.equal(await upsertOwnedGrowthProjectState({ ...input, state: {} }, f.db), null); assert.equal(f.queries.length, 1); });
await test("state is bound JSON data not interpolated SQL", async () => { const state = { prompt: "' ; DROP TABLE fake; --" }; const f = fixture([[{ owned: true }], [{ state }]]); await upsertOwnedGrowthProjectState({ ...input, state }, f.db); assert.ok(f.queries[1].params.includes(JSON.stringify(state))); assert.doesNotMatch(f.queries[1].sql, /DROP TABLE/); });
await test("optimistic save binds read timestamp with JS precision", async () => { const timestamp = "2026-09-04T00:00:00.123Z"; const f = fixture([[{ owned: true }], [{ state: {} }]]); await upsertOwnedGrowthProjectState({ ...input, state: {}, expectedUpdatedAt: timestamp }, f.db); assert.ok(f.queries[1].params.includes(timestamp)); assert.match(f.queries[1].sql, /date_trunc\('milliseconds'/); });
await test("conflicting write is reported without recomputing state", async () => { const f = fixture([[{ owned: true }], []]); assert.equal(await upsertOwnedGrowthProjectState({ ...input, state: {}, expectedUpdatedAt: null }, f.db), null); assert.equal(f.queries.length, 2); });
await test("database failure propagates rather than returning success", async () => { const db = { execute: async () => { throw new Error("storage unavailable"); } } as unknown as DatabaseClient; await assert.rejects(() => upsertOwnedGrowthProjectState({ ...input, state: {} }, db), /storage unavailable/); });
console.log(`Growth persistence contracts: ${count}/${count} PASS (mock database; no live persistence claim)`);
