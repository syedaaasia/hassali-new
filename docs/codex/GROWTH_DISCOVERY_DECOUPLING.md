# Growth small discovery decoupling

Baseline: `9e5518f`. Acceptance: 2026-09-14/15, authenticated Edge.

## Boundary

Previously, search URLs could only become visible/exportable company records
after model qualification. The existing job now supports bounded capture-only
work: one public search, at most ten unique hosts, existing retrieval, saved
source excerpts. No inference is invoked by this action.

Candidates remain separate from verified companies and people. Unknown identity,
fit and contacts are not inferred. Explicit qualification reuses the normal
verifier and saved candidates without repeating search. Ownership, revisions,
leases, cancellation and budgets remain in the existing route/job machinery.

An HTTP-200 access-denial page discovered during acceptance is rejected by the
source capture boundary. Its URL remains a candidate without business evidence.
No access restrictions are bypassed. Previously saved records are not migrated.

## Live evidence

- Tavily configured; bounded availability query returned HTTP 200 and 3 results.
- Repository Acceptance: wedding planners, Chicago, Illinois. Ten new URLs,
  four captured business pages: Michigan Avenue Events, Sustainable Soirees,
  Marryment and LK Events. Initial capture marked all ten unverified.
- On resumption, this saved job had subsequently entered qualification and was
  paused: nine unverified, one rejected, zero verified companies. We did not
  restart inference. All ten URLs and captured evidence survived service restart.
- Test01 began with no Growth pool. Dentists, Milwaukee, Wisconsin returned ten
  URLs, mostly directories and some off-target pages. A DocSpot denial page
  exposed the capture guard defect, repaired and covered by a focused regression.
- Post-repair Test01 search: accounting firms, Bristol, United Kingdom returned
  ten URLs with five captured source pages. Results include directories and
  wrong-geography pages; none is claimed to be a qualified accounting firm.
- Test01 survived full browser reload. Switching back restored the distinct
  Chicago pool. A read-only database check confirmed both persisted pools.
- No companies, people, emails, phone numbers or URLs were fabricated.

## Actual downloads

Downloaded through authenticated Growth UI, not synthesized from a helper:

| File in D:/Downloads | Bytes | Parsed rows | Evidence rows |
| --- | ---: | ---: | ---: |
| hassali-growth-candidates.csv (initial Chicago) | 8009 | 10 | 4 |
| hassali-growth-candidates (1).csv (Milwaukee, before guard) | 6285 | 10 | 3 |
| hassali-growth-candidates (2).csv (Bristol) | 6549 | 10 | 5 |
| hassali-growth-candidates (3).csv (current Chicago) | 8007 | 10 | 4 |

UTF-8 BOM, quoted cells and CRLF. Existing spreadsheet-formula escaping reused.
Headers: Source URL, Website, Domain, Page title, Discovery source, Discovered at,
Evidence state, Qualification, Evidence URLs, Evidence quotes, Checked at.

Current Chicago and Bristol files were parsed and compared against PostgreSQL:
all 220 fields matched; each had ten unique URLs; cross-project overlap zero.
Missing values remained blank. No fit/contact columns were invented.

## Verification

- Candidate capture: 10/10; source capture: 15/15.
- Existing commercial jobs: 25/25; discovery: 47/47; unified repair: 35/35;
  state validation: 7/7; Growth: 21/21; persistence contracts: 9/9.
- Preserved Repository Intelligence suite: 24/24.
- TypeScript noEmit, scoped ESLint and git diff --check passed.
- Production build passed after the denial-page guard. Used the existing isolated
  source snapshot to avoid colliding with the user-owned port-3113 dev cache.
  Known Next ESLint-plugin warning only.

## Limitations

- Discovery is a raw candidate pool, not completed intelligent lead generation.
  Search relevance is inconsistent; directories and wrong-geography pages remain
  unverified. Source excerpts are evidence of page content, not endorsed claims.
- Qualification/personalization still require a functioning inference provider;
  paid-provider acceptance is parked, not repaired here.
- Source identity is stored as public-web-search; Tavily was the configured
  implementation for these searches. Richer provider attribution is follow-up.
- UI still displays the existing larger company target alongside the explicitly
  bounded ten-candidate action; this is minor copy/layout backlog.
- No packages, lockfiles, credentials, auth or database schema changed.
  Unrelated Repository Intelligence work and .pnpm-store/ remain untouched.
