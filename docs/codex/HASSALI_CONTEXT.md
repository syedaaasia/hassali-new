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

`AppShell` composes the top bar, project/files sidebar, conversation workspace, optional editor, Preview drawer, and ASK Project Notes. `RightSidebar` owns the mode controls, chat stream, inline proposals, composer, attachments, and the project approval selector.

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
- Current ASK, proposal, and legacy streaming inference use the OpenRouter adapter through this contract. Existing deterministic selection and one-secondary-provider fallback remain unchanged.
- BYOK persistence, provider settings, local endpoint configuration, and advanced Auto routing are not part of this checkpoint.

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
- The repository HEAD is authoritative; confirm it with Git before every task.
