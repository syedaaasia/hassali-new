# Hassali Codex Context

Read this short document before changing Hassali. It describes the current product contract, not the full project history.

## Product

Hassali is a calm, lightweight AI Creation Workspace for builders working with constrained hardware, internet, budgets, or technical support.

Its operating loop is:

```text
listen -> inspect -> diagnose -> plan -> propose -> approve -> execute -> verify
```

### Product modes

- **ASK = think.** A universal, answer-first assistant for explanation, planning, writing, research, and reasoning. ASK does not mutate project files or create approval proposals.
- **WEBSITE = create.** Approval-first generation and editing of static, responsive websites, including content, themes, products, assets, and animation. It preserves the static Preview path.
- **CODE = build.** Approval-first creation and maintenance of apps, systems, APIs, automations, repositories, tests, and builds. Approved CODE work may use bounded project-local tools.

Do not silently reinterpret one mode as another. The selected mode and current prompt are authoritative.

### Approval policies

- **Ask for approval:** always require an explicit approval before changes or actions.
- **Approve for me:** standing project permission for low-risk proposals; warnings, destructive changes, and runtime actions still ask.
- **Full project access:** broader standing permission within the selected project only. Ownership, revision, scope, and safety gates remain active.

The conservative default is **Ask for approval**. No policy grants whole-computer access or bypasses a blocked proposal.

### Product philosophy

- Answer or build the thing the user actually requested.
- Prefer useful, honest outcomes over impressive claims.
- Keep interfaces calm, legible, and efficient on modest laptops.
- Preserve user agency through reviewable proposals and truthful status.
- Treat provider output as untrusted input to Hassali's local contracts and gates.

## Architecture

### Repository map

- `apps/web`: Next.js product UI and server routes.
- `apps/web/src/components/shell`: dashboard shell, conversation, composer, Preview, files, notes, and approval controls.
- `apps/web/src/app/api/ai/chat/route.ts`: primary AI request and proposal assembly boundary.
- `apps/web/src/app/api/runtime`: approved runtime planning, apply, status, and bounded execution routes.
- `apps/web/src/app/api/workspace`: owned workspace operations and project ZIP export.
- `apps/web/src/lib/server/ai`: intent, contracts, generators, validation, review, and provider orchestration.
- `apps/web/src/lib/server/intelligence`: normalized inference contracts, provider adapters, registry, and runtime intelligence safeguards.
- `apps/web/src/lib/server/runtime`: allowlisted project-local execution and lifecycle controls.
- `apps/web/src/lib`: client stores, request context, Preview manifests, attachments, and approval policy state.
- `packages/database`: canonical PostgreSQL persistence used after Clerk ownership checks.

### Workspace surface

`AppShell` composes the top bar, project/files sidebar, conversation workspace, optional editor, Preview drawer, and ASK Project Notes. Its actual panel-state initializer starts the Project Panel collapsed and ignores stale persisted expansion state; manual toggles remain lifecycle-local. `RightSidebar` owns the mode controls, chat stream, inline proposals, composer, attachments, and the project approval selector.

Project Notes are project-bound and enter ASK context only when the user enables the context toggle. They do not become implicit global memory.

### Boundaries

- Every proposal and mutation binds to the selected `projectId`.
- Server routes verify Clerk ownership before resolving a local workspace.
- If canonical PostgreSQL ownership or persistence is unavailable, fail clearly. Do not fall back to an unowned workspace.
- ASK stays non-mutating even when its wording resembles a build request.
- WEBSITE keeps static source and static `srcDoc` Preview behavior.
- CODE Preview is explicit about whether it is static, summary-only, stopped, or backed by a real approved runtime.
- Approval may authorize the proposed project changes; it does not authorize unrelated scope, destructive work, installs, migrations, deployment, or external mutation.

### Preview and export

- Preview selection follows latest approved mode metadata before file inference.
- WEBSITE Preview uses approved static files and internal-link-safe `srcDoc` behavior.
- Python CODE Preview is summary-only unless a supported runtime is explicitly approved.
- React CODE can show a truthful product snapshot before a runtime starts.
- **Download ZIP appears only in Preview** for WEBSITE and CODE.
- Export reads the owned canonical project, excludes secrets/caches/runtime artifacts, and rejects unsafe paths and mode mismatches.

### Providers

Product behavior must remain provider-independent. A selected OpenAI, Anthropic, Gemini, Qwen, GLM, local, or compatible model cannot bypass Hassali intent, domain, file, review, approval, ownership, or execution contracts. Configured capability is distinct from registry metadata.

- `IntelligenceRequest` and `IntelligenceResponse` carry mode, normalized text/image/file parts, required capabilities, tools, privacy hints, model override, structured/streaming preferences, citations, tool calls, and safe metadata without provider response shapes.
- Capabilities are `supported`, `unsupported`, or `unknown`; unknown support never silently satisfies a required capability.
- Models describe provider and compute source separately. Health, failure, and usage metadata use stable internal contracts; unknown pricing and token values remain unknown.
- `IntelligenceAdapterRegistry` is the single adapter lookup and capability/privacy gate. Unknown adapters fail explicitly.
- The generic OpenAI-compatible adapter supports configured HTTPS endpoints and explicitly enabled loopback HTTP, bounded timeouts, optional health/model discovery, and normalized non-streaming/streaming results.
- ASK, proposal generation, and legacy streaming inference use one deterministic Auto router behind this contract. It applies privacy, enabled-source, hard-capability, health, mode-fit, reliability, and known-cost rules before invocation.
- Auto never treats unknown required capability support as supported. It chooses one primary and at most one independently eligible fallback; the current cloud path preserves its verified `openrouter/free` secondary preference.
- Health and model discovery are bounded in-memory caches. Recent retryable failures receive short cooldowns, while authentication failures temporarily exclude that source without retry storms.
- Routing privacy and the compact Off/Warn/Strict budget policy are persisted per user. Local only cannot invoke cloud; Strict excludes managed candidates whose monetary ceiling cannot be proven.
- Settings -> Intelligence exposes the environment-managed path, OpenRouter BYOK, Ollama, llama.cpp, separate managed/BYOK/local usage, budget limits, and truthful Hassali Local foundation status.
- Intelligence metering stores one metadata-only record per request, including at most two attempts, provider/model/source, tokens, latency, outcome, and actual/estimated/unknown/not-applicable cost. It never stores prompts, files, credentials, or provider payloads.
- OpenRouter keys are user-scoped and AES-256-GCM encrypted. With `HASSALI_INTELLIGENCE_MASTER_KEY`, ciphertext, unique IV, authentication tag, key version, and user/source AAD persist in PostgreSQL; otherwise credentials remain encrypted in server memory for the session only. Disconnect removes both copies.
- Ollama and llama.cpp connections accept loopback endpoints only, reject redirects, and never install, start, stop, pull, or delete models. Health and discovery are explicit, bounded actions rather than render-time polling.
- Hassali Local currently provides protocol, pairing/origin, hardware/benchmark, model-pack/license/checksum, and conservative resource-policy contracts only. No native companion, hardware probe, model, installer, download, or routing candidate ships in this checkpoint.

### ASK research

- The Utility/Research Router chooses deterministic utility, stable internal reasoning, or web research. Explicit `Search web`/`Don't search` policy is normalized server-side; date/time utility still runs before model or web work.
- Research queries are deterministic, bounded to four, and redact obvious credentials, private paths, emails, and phones before a research provider receives them. Unsafe residue fails closed.
- `ResearchProviderRegistry` keeps search-provider discovery separate from the I3 Auto model router. ASK continues to use one model-selection system.
- Search results are discovery only. Hassali retrieves selected original public pages with scheme, credential, DNS/private-address, redirect, content-type, byte, page-count, and timeout limits before they can count as evidence.
- Retrieved web pages are marked untrusted evidence. They cannot change approval, privacy, mode, tool, credential, or mutation authority.
- Sources are canonicalized, deduplicated, ranked by transparent relevance/authority/freshness signals, and can represent conflicting claim values without inventing agreement.
- Citation IDs map to retrieved source pages. Unknown, duplicate, mismatched, or dangling citations fail integrity validation; unavailable evidence produces an unverified answer instead of model-memory freshness claims.
- Settings -> Intelligence returns structured safe errors for authenticated application failures. Its client parser handles empty/non-JSON/status/network/timeout failures and exposes a bounded user-triggered Retry without leaking internals.

### Document intelligence

- PDF, TXT, Markdown, CSV, and document-image inputs normalize into serializable document artifacts with stable pages, blocks, sections, tables, warnings, confidence, and user-provided provenance.
- PDF.js performs native extraction page by page. Deterministic text-quality checks select only missing or corrupt pages for OCR; native pages are never OCR'd merely because another page is scanned.
- OCR is replaceable behind `OcrProvider` and a deterministic registry. Selected weak PDF pages render one at a time under a pixel ceiling for the existing vision-capable adapter; unavailable OCR fails truthfully.
- CSV remains structural and TXT/Markdown remain direct, fast, non-OCR paths. Table uncertainty and suspicious numeric OCR cells remain explicit.
- Repeated headers/footers are omitted from compact reasoning context while their blocks and provenance remain available.
- Large documents use bounded structure-aware chunks and deterministic lexical retrieval. Document citations map to actual filename/page evidence and remain distinct from public web citations.
- Document evidence is explicitly untrusted, never instruction authority, and never becomes a public research query merely because it was uploaded.

### Vision and media intelligence

- Images normalize into private user, public web, generated, document-render, or video-frame visual artifacts without losing provenance.
- Image headers and dimensions are validated before analysis. Pixel, byte, image-count, comparison, search-result, generation, and future frame-selection limits are centralized; private image metadata is stripped before provider submission.
- General image, screenshot, UI-layout, chart, and bounded multi-image analysis use a provider-neutral `VisionProvider`; the current implementation invokes the existing capability/privacy-aware Auto router rather than a second model router.
- OCR remains owned by document intelligence. Visual intent composes OCR with spatial/chart reasoning only when both add value.
- Public visual evidence uses a replaceable search contract and a bounded Wikimedia Commons adapter. Every retained image has a safe source-page URL; creator/license fields remain known, restricted, or unknown truthfully.
- Deterministic asset decisions keep user-supplied, sourced factual, and generated imagery separate. Private history and portfolio claims never receive synthetic evidence as a substitute.
- Image generation is replaceable behind `ImageGenerationProvider`. The configured OpenAI path retains explicit generated provenance, blocks private reference upload, honors Local-only fail-closed behavior, and reports unavailable capability without fake artifacts.
- Video and screen-recording work is contract-only: media metadata, timestamped frames, and bounded frame selection exist, while the absent native decoder/runtime is reported truthfully and nothing is installed.

### Multimodal verification and decisions

- `MultimodalRequestPlan` and its deterministic capability matrix describe required evidence before model reasoning. Unknown capability is never promoted to available.
- A bounded in-memory evidence graph keeps document, OCR, user image, public web/image, structured data, and generated origins distinct. Relations expose duplicates and conflicts without installing a graph or vector database.
- Citation and claim validators reject dangling evidence, invalid document pages, mismatched URLs, and generated imagery used as factual proof.
- ASK assembles attachment evidence once through a shared untrusted-context boundary. A failed optional modality may produce a truthful partial answer; missing required evidence remains unavailable or unverified.
- Outcome and workflow contracts reason conservatively from available evidence: observe before automating, preserve unknown actors/times/stages, avoid fabricated ROI, and prefer bounded reversible experiments with measurable success criteria.
- Intelligence Settings can return a complete ready-degraded snapshot when preference persistence is unavailable. BYOK remains encrypted in server memory and the UI states that session limitation truthfully.
- Project search is deterministic, Clerk-owner-filtered PostgreSQL search over project names, chat titles, and message content. It never invokes a model or public web provider and can open the exact matched chat session.

### Hassali self knowledge

- `lib/server/self-knowledge/` is the canonical server-only product self-knowledge layer shared by ASK, WEBSITE, and CODE. It stores compact structured records rather than injecting a giant product prompt.
- Records carry category, status, provenance, confidence, modes, roadmap/capability links, and current/superseded state. Status distinguishes implemented, verified, live-verified, degraded, limited, unavailable, planned, and deprecated facts.
- Retrieval is deterministic lexical/structured search with current-first conflict handling, deduplication, a maximum of eight records, and a 5,000-character hard context ceiling. Hassali internal facts do not require public web search.
- Current runtime/security truth outranks implementation prose, which outranks canonical docs and checkpoints, which outrank roadmap and superseded history. Descriptive knowledge cannot grant approval or execution authority.
- Machine-local tool availability is added only from the bounded runtime capability registry when the request asks for current local state; static adapter support is never treated as proof that a binary is available.
- ASK answers common Hassali identity, mode, capability, approval, roadmap, and local-tool questions deterministically from these records. WEBSITE and CODE receive the same bounded source through shared preflight context.
- M1 contains Hassali product self knowledge. `lib/server/user-memory/` adds M2's separate per-user memory service for durable user facts, preferences, goals, routines, instructions, work context, and people/relationships.
- M2 memory is stored in PostgreSQL behind Clerk external-user ownership. Records retain confidence, sensitivity, capture method, source-message provenance, and active/superseded/forgotten lifecycle state; secrets are rejected before persistence.
- ASK handles explicit remember/update/forget/recall commands and may auto-save only clear, low-risk durable statements. Temporary states are ignored and sensitive facts require explicit remember language.
- Direct M2 recall remains bounded to at most five relevant standard-sensitivity records and 1,400 characters. Public research receives no personal-memory context.
- `lib/server/project-memory/` provides M3 durable, owner/project-scoped project records, incremental conversation summaries with source fingerprints, truthful project episodes, checkpoints/issues/decisions, current-state views, and bounded original-message recall built on Project Search.
- M3 context is capped, lexical, and explicitly untrusted. It defaults to the current project, uses current Project Notes ahead of stale automatic summaries, excludes secrets, and never grants approval, execution, network, deployment, or Git authority.
- `lib/server/memory-intelligence/` provides M4 deterministic temporal intent parsing, bounded evidence retrieval, effective/source-time comparison, history/timeline answers, source-aware conflict resolution, and explicit ambiguity. Superseded evidence is retained for history while forgotten or expired evidence is excluded.
- M4 keeps future plans separate from current facts, prevents future evidence from leaking into earlier point-in-time answers, and passes unresolved material project conflicts into CODE planning as blocking ambiguities. Project Notes are strong context but do not silently override structured evidence.
- Settings → Memory provides M5's server-authoritative controls over M2-M4: durable global enable/disable, pause/resume, automatic ordinary-memory capture, explicit-sensitive consent, and personal/project/conversation scope preferences. Global OFF and Pause suppress derived retrieval/writes without deleting stored data; M1 and current-chat context remain available.
- Authenticated owner-scoped Memory APIs provide bounded listing/search UI, current/history and provenance display, derived-record correction, individual/person/project/conversation deletion, confirmed transactional clear-all, and private JSON export. Forget scrubs personal temporal chains; project forget removes its derived chain. Original chats, projects, files, and Project Notes remain separate.
- Prohibited credentials remain impossible to save regardless of preferences. Memory export contains only bounded derived user memory, excludes internal IDs and secret-like values, and is explicitly not a complete account export.
- `lib/server/shared-memory/` provides M6's single mode-aware context policy and capsule for ASK, WEBSITE, CODE, and a future GROWTH mode. It combines relevant current M2-M4 facts, people, same-project decisions, verified episodes, and conversation continuity within 12 records/3,600 characters; excludes unrelated/sensitive/cross-project/public-research context; and labels every item untrusted and non-authoritative. No vector database is used.
- WEBSITE and CODE can capture permitted explicit/automatic durable statements and consume the same owner/project-bound capsule. Current prompts outrank memory, M4 resolves superseded truth and verified outcomes, OFF/Pause fail closed in every mode, and saved Git/execution text never grants authority.

### Adaptive CODE planning

- Every actionable CODE request now creates an `AdaptiveCodePlan` before the existing execution-plan/proposal path. ASK and WEBSITE keep their established planners and authority boundaries.
- The planner normalizes task intent, explicit and inferred constraints, hard conflicts, blocking/non-blocking ambiguity, proportional complexity, risk, reversibility, required capabilities, bounded repair budget, and stop conditions.
- Read-only explanation and review remain non-mutating. Bug work starts with evidence and an unverified hypothesis rather than claiming a root cause before inspection.
- Mutation plans require objective acceptance criteria and relevant verification. High-risk, destructive, deployment, and Git-push work cannot use standing project approval; Git push remains separately permissioned.
- Delivery tracks source, commit, push, Preview, ZIP, deployment, and report requests independently. A requested artifact is never treated as already delivered.
- Plan actions use stable IDs and a validated acyclic dependency list. Invalid, contradictory, or safety-ambiguous plans block before proposal approval.
- The normal CODE UI receives only a bounded plan summary. Full constraints, safety boundaries, and private prompts/source remain server-side.
- `RepositoryInspectionRequest` hands I2 goals, evidence needs, suspected domains, and symbol/dependency/configuration questions without inventing file paths. Repository text remains untrusted evidence, not authority.

### Repository Intelligence

- `lib/server/repository-intelligence/` is a shared, read-only capability. CODE consumes it first, but ASK and WEBSITE can use the same evidence without gaining mutation authority.
- Bounded snapshots record Git/worktree state, relevant untracked files, languages, workspaces, manifests, environment-variable names, scripts, dependencies, file roles, TS/JS symbols, Next routes, and evidence-backed relationships. Source bodies and secret values are not returned in the snapshot.
- Discovery skips symlinks and common vendor/build/cache trees, keeps binary and oversized files metadata-only, confines every read to the real repository root, and uses fixed read-only Git commands.
- Search is lexical, ranked, deduplicated, and bounded. A private hashed token index supports deterministic concept lookup without public model/web calls or a vector database.
- `ImplementationSurface` separates authoritative files from tests/config/supporting files. `ChangeImpact` separates direct impact from possible consumers and reports a bounded radius plus uncertainty.
- Imports are not treated as calls. Call/render/test relationships require additional source evidence and carry confidence/provenance.
- Snapshot fingerprints include revision, dirty/untracked state, and relevant file metadata/content fingerprints. Ordinary source changes use targeted incremental refresh; manifest/workspace changes use a full bounded refresh.
- The adaptive CODE planner can replace unresolved implementation assumptions with proven files, symbols, routes, and tests while preserving intent, constraints, acceptance criteria, approval policy, and stop conditions.
- Deep symbol parsing remains strongest for TypeScript/JavaScript. Metadata-level packs detect Python, Rust, Go, JVM, .NET, C/C++, PHP, Ruby, shell, and SQL repositories without claiming deep language intelligence.

### Capability Packs

- `lib/server/capabilities/` owns provider-neutral capability types, the deterministic pack registry, local-tool evidence, command classification, matching, and the non-executing I4 handoff.
- Repository evidence and machine availability remain distinct. A manifest can detect a project ecosystem while its local runtime or package-manager health remains unknown or unavailable.
- Python detection recognizes common manifests and files. Bounded direct version probes check `python`, `py -3`, and `python3` in platform-appropriate order; a virtual environment is never described as a sandbox.
- Node, FFmpeg, ffprobe, and Tesseract use independent, timeout/output-bounded version probes with a minimal environment and short cache. Detection never processes user media, runs OCR, installs software, or executes project code.
- Declared repository scripts are classified as build/test/typecheck/lint/dev/format/generate/migration/other with duration, side-effect, network, and risk metadata. Targeted verification is preferred, but commands are not run in I3.
- `ExecutionRequirement` records capability, working scope, filesystem/network needs, duration, mutation, risk, missing prerequisites, and approval requirement. Every I3 requirement carries `permission: not-granted`.
- The adaptive CODE planner consumes owned repository and capability evidence after ownership verification. Missing tools block only work that actually requires execution; generation can proceed with truthful prerequisite metadata.
- Capability discovery never grants execution authority. Available tools still require the I4 broker policy and a matching server-issued grant.

### Secure execution

- `lib/server/runtime/secure-execution/` owns structured execution requests/results, mode policy, server-side grants, task artifacts, deterministic tool adapters, and the general approved command-process launcher. I6 adds only a specialized fixed-argv Git read/local-commit helper with separate explicit authority.
- The authenticated approval route issues short-lived CODE grants bound to user, project, mode, capability, root, risk ceiling, approval source, expiry, and a bounded use count. Client/model/project text cannot mint authority.
- Existing repository-derived typecheck, test, build, and lint commands now run through the broker with direct executable/argv spawning. Shell interpreters, inline dynamic code, installs, deployment, Git mutation/push, destructive database operations, and unapproved network use are denied.
- ASK deterministic Python uses a fixed Hassali-owned script in a random task directory, never arbitrary user code or project mutation. CODE project Python uses an evidence-backed file entry point, project grant, direct argv, and the same broker. FFmpeg, ffprobe, and Tesseract expose structured operations and return unavailable without installation.
- Local Tesseract is an optional user-bound `OcrProvider`; it stages explicit bytes in task artifacts and does not replace the provider-neutral OCR contract.
- Project and task paths are canonicalized, checked against owned roots, and reject traversal, sensitive files, and symlink/junction escape. Child environments use an allowlist without provider, Clerk, database, token, password, or key secrets.
- Execution has bounded timeout/output, owned process-tree cancellation, sanitized untrusted output, lightweight audit events, truthful resource metadata, and no uncontrolled polling.
- Repository fingerprints are rechecked immediately before execution. Read-only commands that mutate project evidence fail and stop; evidence is preserved. Declared build artifacts are tracked as expected mutation. Only a failed Hassali-authored repair may roll back its own unchanged attempt.
- Current Windows isolation is truthfully `process-bounded`: path and network rules are policy-enforced, with no claim of kernel filesystem/network isolation, containerization, CPU quota, or memory quota.

### Live execution and verified delivery

- `lib/server/runtime/live-execution/` owns bounded in-memory CODE tasks, ordered structured timeline events, capped sanitized stdout/stderr, cancellation, expiration, delivery projection, and task-scoped Git evidence. It adds no daemon, queue, database, or package dependency.
- The approval route starts one owned task for actual approved CODE execution. Secure command chunks, command results, repair/review stages, and I5 delivery evidence feed the same timeline; polling is project-, proposal-, and Clerk-user-bound.
- The compact CODE timeline shows the current operation, recent stages, expandable bounded output, delivery status, Git state, and cancellation. Reconnect reads the latest matching owned task; sequence IDs keep polling updates deterministic.
- Background task concurrency is bounded per user/project. Cancellation aborts only the matching owned signal, and the existing broker remains responsible for owned child-process teardown. Dev-server tasks have a typed lifecycle seam but no server is auto-started.
- Git inspection uses fixed read-only commands, bounded secret-sanitized diffs, and the I5 change ledger to separate task-owned paths from pre-existing user work. Repositories outside the owned project root, sensitive paths, staged work, unrelated work, and untracked task files are ineligible.
- A verified tracked task can create one explicit local commit with a fresh branch/HEAD/diff check. Git push has no action or authority in I6 and remains a separate future approval boundary.
- Delivery states are evidence-backed: verified-ready, verified-with-warnings, partial, blocked, failed, or cancelled. Preview/ZIP/deployment claims remain separate and are never inferred from command success.

### Verification, review, and recovery

- `lib/server/runtime/verification-recovery/` owns criterion-level verification plans/results, deterministic implementation review, change ownership ledgers, task checkpoints, safe recovery, repair eligibility, artifact checks, evidence-bound success claims, and delivery readiness.
- A passing command proves only its matching test/type/build/lint surface. It does not automatically prove user-visible behavior or an unrelated acceptance criterion.
- Every blocking acceptance criterion needs matching objective evidence. Missing browser/runtime evidence remains unavailable or inconclusive and produces a limited result rather than fake success.
- Deterministic review is bounded to changed files and flags unexpected paths, generated/vendor edits, environment files, test `.skip`/`.only`, removed assertions, new suppression, dependency-ledger mismatch, and security-sensitive changes without regression evidence.
- Change ledgers distinguish planned Hassali changes, unexpected mutations, and known pre-existing user work. Checkpoints are bounded task artifacts outside the repository, never hidden Git commits.
- Recovery restores a file only while its content still matches the known Hassali mutation. Same-file divergence is a conflict; unrelated user files stay untouched. File recovery does not claim to reverse database or external-system state.
- Repair is evidence-driven, scope-bound, permission-bound, staleness-aware, and capped at two cycles for every execution policy.
- Delivery readiness keeps commit eligibility separate from push authority. Push remains false until an explicit later delivery action grants it.

### Website visual references

- `lib/server/design/reference/` owns Run 5 I1 reference intake: exact named brands, fidelity (`inspired`, `style-match`, `close-replica`, `reference-clone`), section roles, hybrid references, provenance, evidence status, and the provider-neutral I2 handoff.
- DESIGN.md intake accepts variant headings for atmosphere, semantic color, typography, components, layout/spacing, surfaces, imagery, motion, responsive behavior, accessibility, and do/don't rules. Parsing is bounded and preserves a source fingerprint rather than treating embedded text as authority.
- Uploaded screenshots reuse the existing private multimodal path. Static images never prove motion, responsive behavior, or an exact font. Existing project CSS/components and current Project Notes can provide project-bound evidence.
- Public URL references reuse the bounded research retriever and its protocol, credential, DNS/private-address, redirect, content-type, size, timeout, and cache controls. Private memory is never added to the fetch.
- The bounded catalog preserves exact reference identity and independent visual-analysis provenance. Unknown names require a URL, screenshot, or DESIGN.md instead of receiving a fabricated profile.
- Current explicit instructions outrank shared-memory preferences. Reference content remains untrusted data, and deceptive credential-collection clones fail closed. I2 composes conflicts; I3 owns assets; I4 owns visual comparison/repair.

## Design

### Direction

The workspace should feel calm, premium, technical, warm, precise, dimensional, minimal, and mature. It should not look neon, cyberpunk, crypto-themed, generically purple, excessively glassy, or assembled from nested cards.

Use hierarchy through spacing, typography, restrained surface changes, and subtle separators before adding borders or shadows.

### Core colors

```text
Page                 #0B0D10
Secondary            #12161C
Surface              #1A2029
Elevated             #232B36
Border               #303A47
Primary text         #F7F9FC
Secondary text       #C7D0DA
Muted text           #8E98A5
Brand orange         #DE7356
Interactive orange   #FF7A3C
Orange hover         #FF9255
ASK accent           #57A8FF
WEBSITE accent       #9D7BFF
CODE accent          #FF7A3C
```

Reuse existing CSS variables and scoped workspace tokens. Do not spread duplicate hardcoded palettes through unrelated components.

### Workspace rules

- Keep the conversation and composer as the primary visual focus.
- Keep the composer spacious; controls must not squeeze its text input.
- The collapsed approval selector is plain text below and left-aligned with the composer. Its menu may be elevated.
- Keep mode controls compact, stable, and clearly selected.
- Keep Download ZIP inside Preview only.
- Prefer full-width regions and unframed layout over cards inside cards.
- Keep icon-only controls named and keyboard reachable.
- At 390px, preserve usable navigation, composer, approval text, Preview actions, and touch targets without horizontal page overflow.

### Common mistakes

- Putting approval policy inside the composer row.
- Adding a pill, border, background, shadow, or permanent caret to the collapsed approval text.
- Duplicating Download ZIP outside Preview.
- Letting old workspace files or contracts control the current mode.
- Showing stale WEBSITE Preview for CODE, or stale CODE Preview for WEBSITE.
- Hiding essential mobile actions without a replacement.
- Claiming a runtime, provider, upload, or export succeeded without evidence.

## Safety and mutation

- Preserve unrelated dirty work and user-owned processes.
- Never reset, clean, broadly restore, or discard changes without explicit instruction.
- Never mutate or run before the required approval.
- Keep changes inside the owned project and approved objective.
- Use typed allowlisted execution; do not expose arbitrary shell execution.
- Do not install packages automatically.
- Child runtimes receive a minimal environment without Hassali, database, Clerk, token, password, provider, or private-key secrets.
- Stop only processes Hassali owns.
- Keep repair attempts bounded and never erase concurrent user edits.
- Do not push or deploy without explicit permission.
- Never stage `research/ai-corpus/`.

## Testing philosophy

1. Inspect the relevant contract and smallest code path.
2. Run the focused test first.
3. Verify type behavior after edits.
4. Browser-check the actual UI when a visual or interaction claim matters.
5. Verify Preview separately from generation and approval.
6. Run one final production build when practical.
7. Distinguish app failures from provider, network, auth, environment, or harness failures.
8. Report only evidence that actually ran. Use `COMPLETE_VERIFIED`, `COMPLETE_WITH_LIMITATIONS`, `BLOCKED`, or `FAILED` honestly.

The reusable acceptance scenarios live in `docs/codex/HASSALI_TEST_MATRIX.md`.

## Current roadmap

Roadmap names describe intended bounded runs, not completed implementation claims.

The pre-launch Memory sequence has completed M1-M6. Run 5 I1 visual-reference intake and Run 5 I2 design-direction kernel are implemented; Run 5 I3-I5, Growth, and Run 6 remain planned rather than implemented.

1. **Premium Workspace and Codex Efficiency Foundation** - polish the creation workspace and establish concise engineering context.
2. **Live Execution Timeline, Git Workflow and Verified Delivery** - make approved work, evidence, and delivery state easy to inspect.
3. **Three.js, Image-to-Procedural 3D and Cinematic Sequences** - add bounded, performant 3D and cinematic creation workflows.
4. **GitHub and Deployment Adapters** - connect explicit, scoped repository and deployment actions.
5. **Multimodal Project Intake and Asset Workflows** - deepen truthful attachment-to-project workflows without weakening approval boundaries.
6. **Collaboration, Project Memory and Handoff** - add project-scoped continuity and reviewable human handoff.
7. **Provider Resilience, Cost and Evaluation Controls** - make model choice, fallback, quality, and cost evidence clearer.
8. **Beta Hardening, Packaging and Launch Readiness** - consolidate security, accessibility, performance, packaging, and release proof.

## Current checkpoint

- Base before Run 01: `012ffb5` - `HOMEPAGE-UI-I1: add premium palette and responsive polish`
- Run 01 checkpoint: `DASHBOARD-UI-I1: polish workspace and add Codex context capsule`
- Run 02 I1 checkpoint: `INTELLIGENCE-I1: add provider-independent inference contract`
- Run 02 I2 checkpoint: `INTELLIGENCE-I2: add BYOK and local provider connections`
- Run 02 I3 checkpoint: `INTELLIGENCE-I3: add capability-aware automatic routing`
- Run 02 I4 checkpoint: `INTELLIGENCE-I4: add metering budgets and Hassali Local foundation`
- Run 03 I1 checkpoint: `ASK-I1: add utility research routing and verified citations`
- Run 03 I2 checkpoint: `ASK-I2: add OCR and document intelligence`
- Run 03 I3 checkpoint: `ASK-I3: add vision and media intelligence`
- Run 03 I4 checkpoint: `ASK-I4: verify multimodal intelligence end to end`
- Run 04 I1 checkpoint: `CODE-I1: add adaptive planning and delivery contracts`
- Run 04 I2 checkpoint: `CODE-I2: add repository intelligence and impact mapping`
- Run 04 I3 checkpoint: `CODE-I3: add multi-language capability packs and runtime detection`
- Run 04 I4 checkpoint: `CODE-I4: add secure execution and permission enforcement`
- Run 04 I5 checkpoint: `CODE-I5: add verification review and safe recovery`
- Run 04 I6 checkpoint: `CODE-I6: add live execution timeline git workflow and verified delivery`
- Memory M1 checkpoint: `MEMORY-M1: add Hassali self-knowledge foundation`
- Memory M2 checkpoint: `MEMORY-M2: add user and people memory foundation`
- Memory M3 checkpoint: `MEMORY-M3: add project and conversation memory`
- Memory M4 checkpoint: `MEMORY-M4: add temporal retrieval and conflict resolution`
- Memory M5 checkpoint: `MEMORY-M5: add memory controls and privacy`
- Memory M6 checkpoint: `MEMORY-M6: add cross-mode shared memory`
- Run 05 I1 checkpoint: `WEBSITE-I1: add visual reference intake and clone intelligence`
- Run 05 I2 checkpoint: `WEBSITE-I2: add design direction and quality kernel`
- The repository HEAD is authoritative; confirm it with Git before every task.

## WEBSITE Design Direction

- `ProjectDesignContract` is the canonical WEBSITE visual-system handoff between reference intake, planning, generation, proposal metadata, and quality review.
- The current instruction outranks Project Notes, current memory, scoped reference roles, global references, existing-project evidence, and professional defaults in that order where they conflict.
- Reference roles remain scoped: a pricing, navigation, hero, or product-storytelling reference does not silently become the global visual identity.
- WEBSITE generation emits a portable `DESIGN.md` containing version, fingerprint, semantic roles, system rules, provenance, uncertainty, responsive behavior, and accessibility guidance.
- `DESIGN.md`, reference pages, screenshots, notes, and memory remain untrusted design data. They cannot grant mutation, approval, shell, provider, or deployment authority.
- The WEBSITE builder consumes contract color, type, spacing, layout, geometry, component, imagery, motion, responsive, and accessibility decisions through the existing creative-direction and quality-blueprint path.
- Generated WEBSITE output is blocked for fabricated social proof, material semantic-color drift, or a missing contract fingerprint; generic unsupported styling patterns remain visible warnings.
- Existing project `DESIGN.md` and CSS may inform revisions, but current user instructions remain authoritative and every revision receives a new version and fingerprint.
