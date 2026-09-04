# Growth Phase 1: implementation checkpoint, live acceptance blocked

Starting HEAD: `1aaa9563d6220dd58a917394527e1cca594b779c`.

ASK remains frozen. No outreach was sent. No package, lockfile, auth, environment-file,
or schema-definition changes were made. `.pnpm-store/` was not touched.

## Reality audit

Statuses describe the local product, not what mocked tests can prove.

| Capability | Before | After |
|---|---|---|
| Business URL analysis | MISSING | BLOCKED |
| Business Twin | PARTIAL | PARTIAL |
| Audience Intelligence | PARTIAL | PARTIAL |
| Structured search state | MISSING | PARTIAL |
| Natural-language filter mutation | MISSING | PARTIAL |
| Real company discovery | MISSING | BLOCKED |
| Real people discovery | MISSING | MISSING |
| Contact enrichment | MISSING | MISSING |
| Fit scoring | MISSING | PARTIAL |
| Evidence | PARTIAL | PARTIAL |
| Personalized outreach | PARTIAL | PARTIAL |
| CSV export | MISSING | PARTIAL |

The new Growth panel has Business, Audiences, Companies, People, and Outreach views,
a refinement assistant, searchable/sortable/selectable company records, evidence
details, and a project-scoped CSV download. Its authenticated rendering was observed
in Edge on Test013. Populated discovery journeys remain unverified.

## Reproduced legacy failure

Calling the production preparation helper with legacy `businessTruth: {}` reproduced:
`Cannot read properties of undefined (reading 'category')`.

The previous route cast unknown JSON to the current business-truth type, letting an
invalid non-null record suppress the canonical Website handoff. One catch also
conflated preparation and persistence failures.

Commit `e73a2e0` (`GROWTH-RELIABILITY: recover stale persisted business state`) validates
persisted business truth, preserves valid current records, permits canonical Website
fallback for invalid records, checks current project ownership, and separates storage
from preparation failures. No database write failure triggers strategy recomputation.

## Implemented pipeline

1. Clerk/project ownership before loading, inference, retrieval, or export.
2. Existing Website/business truth retained alongside a versioned discovery slice.
3. Public URL retrieval through the existing bounded public-page validator/retriever.
4. Existing provider-neutral intelligence service interprets business/audiences and
   structured searches; refinements become allowlisted add/remove/set operations.
5. Existing live web-research capability proposes cited company URLs.
6. Original company pages are retrieved, two at a time, and source quotes checked.
7. Company names must occur in source text; unsupported locations/contact fields
   are omitted. Requested geography/organization evidence is required when restricted.
8. Coarse deterministic fit measures coverage of criteria supported by source quotes.
   It is not a probability of purchase or a verified budget/authority claim.
9. Drafts combine the saved offer and a specific company quotation. No sending exists.
10. CSV exports the server-owned current or selected pool, escaping quotes and
    neutralizing spreadsheet formula prefixes.

Search changes clear obsolete results/drafts and recalculate the pool. A discovery
source failure saves the new criteria with an unavailable result, not stale prospects.
Optimistic writes detect stale sessions. Abort/project-switch guards prevent client
responses from contaminating another project. Provider attempts retain the existing
bounded routing policy. No alternate provider configuration was added.

## Live blockers and evidence

### Missing local Growth storage table

The configured PostgreSQL connection passed a read-only connectivity probe, but:

`select to_regclass('public.growth_project_states')` returned `null`.

The existing definition is in `packages/database/drizzle/0006_overconfident_legion.sql`:
the `CREATE TABLE growth_project_states` statement and its two `ALTER TABLE` foreign
keys. The remaining statements concern other products and are outside this repair.

The founder explicitly approved Growth-only table creation. Automatic approval review
still rejected execution, interpreting the repository's migration prohibition as
absolute. The migration was NOT executed. No workaround was attempted. An authorized
database administrator must apply the existing Growth-only definition outside this
tool session before authenticated persistence can be tested.

### Existing live inference response failure

An opt-in live probe used public input only and the configured environment source,
without database writes. Public business URL: `https://ihousedesign.com`.
The first sandbox attempt failed network retrieval. The network-enabled attempt
reached inference but returned an invalid provider response.

The founder art query was then passed through the new service. Safe diagnostics:

```
provider: openrouter
model: openrouter/free
category: malformed-provider-response
code: PROVIDER_JSON_INVALID
attempts: 2
fallbackUsed: true
```

No real company/person/email/phone was accepted or fabricated. This is an
environment-source probe, not proof of authenticated per-user provider settings.
The existing provider must return valid inference/research responses before the live
company floor can be certified. ASK/provider architecture was not modified to chase it.

## Browser acceptance

Authenticated Edge at `http://localhost:3113/dashboard`, project Test013:

- New Growth workspace, navigation, business input, and assistant panel rendered.
- Reload exposed the missing storage dependency. A user-visible storage failure was
  observed; the route now returns a bounded JSON storage error rather than an empty 500.
- Business-to-audience, art-query results, persisted conversational mutation, three
  prospect evidence records, three drafts, and downloaded CSV: **BLOCKED/UNVERIFIED**.
- No browser PASS is inferred from server tests or screenshots of the empty panel.
- A later dashboard reload showed Edge `ERR_BLOCKED_BY_CLIENT`. A separate
  unauthenticated HTTP probe returned 500, so this was not declared solely a browser
  issue. The in-place build may have disrupted the development cache. The user declined
  the proposed restart of the existing port-3113 server. It remains running; no process
  was stopped. The development-session HTTP failure remains unresolved.

## Automated evidence

- Discovery contract/service tests: 37/37.
- Legacy state validation/preparation: 7/7.
- Existing Growth A-U: 21/21.
- Website-to-Growth handoff: 21/21.
- Persistence/ownership SQL contracts: 8/8, mocked database; live persistence unverified.
- TypeScript noEmit and changed-file ESLint: PASS.
- `git diff --check`: PASS, only existing Windows LF/CRLF notices.
- Production build: normal in-place build compiled and passed lint/types, but page
  collection collided with the active dev server's `.next` vendor chunks.
- Normal `next build` in ignored `.next/growth-verification-app`, using copied app
  configuration and links to the same source/public/dependencies: PASS (28/28 pages,
  lint/types enabled). No user server was stopped. Two earlier in-memory isolation
  launcher attempts failed before compilation because Next serializes configuration
  functions; they are not counted as successful builds.
- The final source revision passed the isolated standard build again after the last
  error-handling change, with all 28 static pages generated.

Contract tests preserve explicit/adjacent titles, geography, seniority, organizations,
exclusions, additive/replacement/removal operations, bounded top-N, and verified-only
filter semantics. The art-shaped fixture changes geography from United States/Europe
to include Germany/Netherlands and forces actual discovery invocation. This is mocked
contract evidence, not a live natural-language interpretation or result-count claim.

CSV serialization tests prove selected records, blanks for unknown contacts, quoting,
and formula safety. No authenticated downloaded record count exists yet.

## Next gate

Resume this same vertical slice after Growth storage exists and the configured live
source returns usable responses. Run the six authenticated journeys from the founder's
mandate, then the small cross-business check if stable. Do not start sending, sequences,
CRM expansion, or another ASK repair. Preserve the implementation and existing work.

P0/P1 acceptance blockers: missing Growth table; no successful live discovery response;
the mandatory populated authenticated journeys are unverified.

P2 backlog: editable draft UX, richer semantic outreach wording, larger paginated
discovery pools (currently at most eight original pages per search), and optional
verified person/contact enrichment. Unknown contacts remain explicitly unavailable.
