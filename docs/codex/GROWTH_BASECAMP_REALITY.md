# Growth Basecamp reality checkpoint

2026-09-14. Starting HEAD: `69a53e3`. ASK provider acceptance remains
`PARKED_EXTERNAL_BLOCKER`; no provider configuration or routing changed.

## Root cause and bounded repair

Previously, URL retrieval preceded business/audience inference, but state was
persisted only after both model steps succeeded. A provider failure discarded
the readable source and left a new business empty.

`capture` now uses the existing safe public-page retriever without inference.
It saves the page title and up to four bounded verbatim paragraph excerpts,
including URL and retrieval time. `source_only` is not an analyzed Business Twin.
Offer, geography and value proposition remain unknown. Model analysis stays a
separate explicit action. Recognized inference failures preserve source evidence
with `provider_blocked` or `incomplete`, never invented audiences or prospects.
Internal bugs, safety refusals and cancellation still fail explicitly.

Same-business capture preserves established analysis and results. Selecting a
different business clears incompatible discovery results in the new revision.
Ownership, optimistic revision checks and canonical database persistence remain
the existing authority. No schema, dependency, auth or provider changes.

## Authenticated Edge evidence

Project: Repository Acceptance. Fresh Growth state initially had no business.
Input: `https://basecamp.com`. Original Analyze business action failed visibly
with unavailable-analysis wording and no saved source. This was not a mock.

After repair, Read website saved Basecamp with source URL
`https://basecamp.com/`, page title and four product/problem paragraphs. The
visible excerpts discuss project tasks, discussions, decisions, shared files,
fragmented apps, and why Basecamp was built. They are quotations, not generated
business claims. Offer, market and value proposition display Not established.
The UI explicitly says interpretation/audiences are incomplete and no customers
were discovered. No model was called by the capture action.

Full page reload then reopening Growth restored the same five evidence records.
A read-only database query confirmed Basecamp, `source_only`, five evidence
items, zero audiences and zero companies. Switching to Test014 showed its
different existing iHouse Design business and three saved companies, not
Basecamp. No existing Test014 data was edited.

Test014's CSV action emitted an authenticated browser download event. Its
existing records are HLM Architects, AEW Architects and AHR. These are historical
records, NOT new discoveries from this run. Downloaded file-byte inspection was
not completed; do not call this full end-to-end export integrity verification.
No new audience, prospect, person or outreach was fabricated for Basecamp.

## Reality map

| Surface | Classification | Evidence / remaining boundary |
|---|---|---|
| Entry / navigation | WORKING | Authenticated Business, Audiences, Companies, People, Outreach views |
| URL read / source evidence | WORKING | Real Basecamp page, bounded quotes, URL and timestamps |
| Business interpretation / Twin | PARTIAL | Source persists; offer/category/customer reasoning requires inference |
| Audience schema / generation | PROVIDER_DATA_BLOCKED | Existing schema and persistence; zero new hypotheses while unavailable |
| Company discovery / fit | PROVIDER_DATA_BLOCKED | Existing search interface; planning and evidence interpretation require model |
| Person / contact discovery | MISSING | No connected verified-person source; UI states limitation |
| Evidence / stored companies | PARTIAL | Historical Test014 pool loads; no new Basecamp prospect proof |
| Outreach | PROVIDER_DATA_BLOCKED | Existing evidence-based draft path needs offer, prospects and inference |
| CSV export | PARTIAL | Download event plus automated CSV contracts; downloaded bytes uninspected |
| CSV import | MISSING | No current Growth import surface |
| Persistence / project isolation | WORKING | Reload, project switch and database evidence agree |
| Status / error truthfulness | WORKING | Source-only and analysis failure distinct; no false customer success |

## Verification

- Source capture tests: 15/15; no-inference, bounds, URL validation, unknowns,
  serialization, input immutability, blocked/incomplete distinction, preservation,
  business replacement, cancellation, internal/policy errors, empty CSV.
- Growth discovery: 47/47; unified repair: 35/35; state validation: 7/7;
  commercial jobs: 25/25; business context: 12/12; intelligence: 21/21;
  persistence: 9/9 (mock SQL contract, separate from real browser/DB proof).
- Baseline remote repository tests: 24/24. Existing integration work preserved.
- TypeScript, scoped ESLint and diff checks pass. Baseline and final production
  builds both exited 0 using a hash-verified isolated source snapshot to avoid
  the live dev server's cache. The known Next ESLint plugin warning remains.

## Remaining

Basecamp is URL -> retrieved evidence -> persisted source, NOT a completed
business-to-prospect workflow. Next: `READY_FOR_GROWTH_DISCOVERY_REPAIR`.
Do not return to ASK or treat provider credits as a product-code repair.
P2: improve deterministic source coverage beyond bounded homepage excerpts;
complete downloaded-CSV byte inspection. New live audiences, prospects and
personalization require an available legitimate intelligence/data method.
The existing search adapter is configured, but its live quota/availability was
not re-probed. Current planning and company interpretation still require model
inference; configured search alone does not establish a verified prospect pool.
