# Growth unified reality repair

Starting HEAD: `7e16129f115e5a102ccf71eb725d44fcb7ffa369`.
Result: `GROWTH_VERTICAL_SLICE_BLOCKED`. This is an implementation checkpoint,
not authenticated vertical-slice acceptance.

## Confirmed reality

The supplied mandate's descriptions of missing types, CSV, and a one-box UI were
stale at this HEAD. Reused the five-tab workspace, discovery model, original-page
evidence checks, draft generator, CSV serializer, and ownership/revision boundaries.
The `e73a2e0` stale-businessTruth repair was already present and remains covered.

| Capability | Before | After |
|---|---|---|
| Business URL analysis | BLOCKED | BLOCKED |
| Business Twin | PARTIAL | PARTIAL |
| Audience intelligence | PARTIAL | PARTIAL |
| Structured search state | PARTIAL | PARTIAL |
| Natural-language mutation | PARTIAL | PARTIAL |
| Real company discovery | BLOCKED | BLOCKED |
| People discovery | MISSING | MISSING |
| Contact enrichment | MISSING | MISSING |
| Fit scoring | PARTIAL | PARTIAL |
| Evidence | PARTIAL | PARTIAL |
| Outreach | PARTIAL | PARTIAL |
| CSV | PARTIAL | PARTIAL |

These statuses concern the real product, not mocked contract-test success.

## Storage root cause and explicit apply path

Read-only live PostgreSQL checks succeeded. `growth_project_states` does not exist.
The Drizzle journal records only 0000 and 0001, while several later intelligence and
memory tables already exist. The database is partially migrated: blindly running all
pending migrations would collide with existing tables and expand beyond Growth.

Added `db:growth:apply`, an explicit local-development command reading only the three
original Growth CREATE/FK statements from 0006. No duplicate schema SQL, no generated
migration, no deployment/boot auto-migration, no unrelated tables, no journal update.
The command requires DATABASE_URL, restricts the host to loopback, uses a transaction
with lock/statement timeouts, and does not modify a table that already exists.
Production migration-history reconciliation remains an administrator responsibility.

The attempted apply was DENIED by automatic execution review despite explicit user
authorization; the guard cited AGENTS.md's migration restriction. No workaround or
second execution path was used. No database schema or records changed in this run.

Growth errors now distinguish missing table, unreachable database, permission failure,
ownership denial, stale-businessTruth recovery, structured interpretation failure,
and stale-revision conflict. Error payloads/logs do not include connection strings.

## Structured interpretation repair

One Growth-owned boundary parses object JSON and ordinary code-fence/prose wrappers,
checks task-specific structure, and allows one repair for invalid syntax, schema, or
truncated output. Original constraints accompany the repair. Cancellation and a total
deadline are preserved. Transport/auth/safety errors do not start semantic retries;
the existing provider router retains its bounded alternate-provider policy.

Wrong-typed criteria cannot silently disappear during normalization. Malformed list
operations fail closed. Removing an explicit/adjacent title also records its exclusion.
No ASK continuity machinery or shared provider implementation was changed.

## Research reuse and sources

Added a Growth-only Tavily ResearchProvider using the documented fixed search endpoint:
https://docs.tavily.com/documentation/api-reference/endpoint/search

The adapter sanitizes queries, bounds response bytes/results/time, prohibits redirects
of credential-bearing requests, and never logs provider bodies or credentials.
It feeds the existing `runBoundedWebResearch` engine for query/retrieval/citation work.
Growth still refetches the original page before accepting a company because the shared
engine can preserve snippets on retrieval failure. Snippets alone cannot qualify.

Neither TAVILY_API_KEY nor SERPER_API_KEY is configured in the inspected environment.
Tavily is implemented and mocked-contract tested but was NOT called live. A Serper
adapter was not added. Existing OpenRouter live-research routing is preserved when
no Tavily key is configured. No live company/person/email/phone result is claimed.

## Live inference and browser evidence

The public `https://ihousedesign.com` business-analysis service probe failed with:
`malformed-provider-response / PROVIDER_JSON_INVALID`, provider `openrouter`, model
`openrouter/free`, two attempts, fallback used. Source inspection locates this error
at provider HTTP-body parsing, BEFORE Growth's model-output parser. It is not evidence
that Growth's schema parser rejected prose/fenced JSON. No output was fabricated.

A separate small public fictional-business diagnostic succeeded through the current
provider adapter with HTTP 200 and application/json. Thus the provider is not proven
universally unavailable. The full analysis failure remains unresolved; simple adapter
connectivity is not equivalent to a successful business-analysis workload.

Reconnected to existing authenticated Edge, Test013, localhost:3113/dashboard.
The Growth panel and its storage-unavailable message were visible. The first journey
cannot clear its storage prerequisite. No refresh-persistence, populated audiences,
live refinement, three prospects, three drafts, or downloaded CSV acceptance occurred.
Three additional business replays were not started. No retries counted as PASS.
No Chrome use, session clearing, logout, or dev-server restart.

Representative real prospect records: unavailable (not fabricated).
CSV downloaded record count: UNVERIFIED. Serializer selected-set/escaping tests pass.

## Automated evidence

- Unified repair: 28/28 PASS (including shared research engine with mocked HTTP).
- Existing discovery/service/CSV: 37/37 PASS.
- Stale-state validation/preparation: 7/7 PASS.
- Growth A-U: 21/21 PASS.
- Ownership/persistence SQL contracts: 8/8 PASS, mocked database only.
- Total: 101/101. Not live-product acceptance.
- TypeScript noEmit: PASS.
- Changed-file lint: PASS after importing Node globals in the new .mjs command.
- `git diff --check`: PASS; Windows LF/CRLF notices only.
- Production build: PASS, 28/28 pages, lint/types enabled. Used the existing ignored
  `.next/growth-verification-app` with the same source/public/dependencies and copied
  app config to avoid touching the running server's build output. Known Next ESLint
  plugin warning only. No dev-server restart.

## Scope and remaining gate

Only Growth route/service/core/tests/docs plus the explicit database package script
and local apply command changed. No dependency versions or lockfiles changed. No auth,
environment-file, schema-definition, ASK, WEBSITE, CODE, or provider-routing edits.
`.pnpm-store/` untouched. No push, outreach sending, or migration executed.

P1 acceptance blockers: missing Growth storage (apply denied); full live business
analysis failure; no demonstrated live company discovery or complete browser journey.
P2: richer outreach, scoring sophistication, bigger pools, person/contact enrichment.
Next: administrator resolves Growth storage, then resume the first real authenticated
journey and diagnose any remaining live inference failure. Do not resume ASK.
