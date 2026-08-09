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
- The repository HEAD is authoritative; confirm it with Git before every task.
