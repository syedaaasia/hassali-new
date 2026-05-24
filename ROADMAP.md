# Hassali.ai Build Roadmap

## Product & Engineering North Star

Hassali.ai is the Calm Autonomous Engineering Operating System for constrained builders.

Primary users include freelancers, students, startup founders, emerging-market developers, AI coders with subscription fatigue, and people working on weak laptops, unstable internet, limited budgets, and limited technical support.

Hassali.ai is not a Cursor clone, TRAE clone, generic AI wrapper, website-only builder, or chaotic multi-agent playground. It should feel calm, reliable, low-resource friendly, and trustworthy.

Core operating loop:

listen -> inspect -> diagnose -> plan -> propose -> approve -> execute -> verify

The current working app must be preserved:

- Clerk auth
- PostgreSQL/Drizzle persistence
- multi-project workspace system
- file/folder CRUD
- chat persistence
- Monaco editor
- approval-first SUGGEST/EXECUTE proposals
- selected-project isolation
- local static preview/runtime
- safe runtime actions only

## Current Non-Negotiables

- Project isolation is mandatory.
- Every proposal must bind to the selected `projectId`.
- Approval must fail if `proposal.projectId` does not match the current project.
- File mutations must always require `projectId`.
- Backend APIs must verify Clerk user ownership and project scope.
- ASK explains only.
- SUGGEST proposes file changes only, unless runtime action is explicitly requested.
- EXECUTE proposes file changes plus safe runtime actions, still approval-first.
- Allowed runtime actions only: `restart_runtime`, `reload_preview`, `stop_runtime`.
- No arbitrary shell commands.
- No package installs.
- No Docker/cloud execution yet.
- No offline database fallback or fake persistence.
- Clear errors when Docker/Postgres/runtime are unavailable.
- Vague prompts should lead to diagnosis and targeted treatment, not broad regeneration.

## Do Not Build Yet

- shell command execution
- package installation
- Docker-per-user runtime
- cloud execution or deployments
- Kubernetes, VMs, remote sandboxes, or heavy infra
- MCP marketplace
- autonomous multi-agent systems
- visual screenshot/DOM/console inspection
- billing
- collaboration
- mobile app
- rollback/audit systems beyond placeholders
- large background indexing or memory workers unless justified

## Next Safe Phases

### Phase 10.3 - Calm Workspace Layout + Preview Disclosure
Goal: make chat the main centered operating surface while preserving current functionality.

Includes:
- chat centered/main and larger
- preview hidden by default
- preview opened through a small Preview control, mainly in EXECUTE flow
- files/code secondary on the right side
- sidebar scroll and responsiveness preserved
- no full visual redesign yet

Test:
- dashboard remains usable on laptop screens
- chat has more room
- preview opens only when requested/useful
- approval, projects, files, chat, and runtime still work

### Phase 10.4 - Targeted Treatment Planner
Goal: make small prompts stay small.

Includes:
- rename/text fixes update only matching text
- image fixes update only image-related markup/CSS
- style fixes update CSS and only necessary classes
- broad redesign only when explicitly requested
- diagnosis explains what was detected and why the scope is small

Test:
- "animation" on an existing shop proposes targeted CSS/JS
- "rename X to Y" does not regenerate the site
- "fix images" does not rewrite unrelated layout

### Phase 10.5 - Design and Domain Memory
Goal: improve taste without copying brands or bloating the app.

Includes:
- internal design principles inspired by Apple Glass, Linear, Vercel, Stripe, Cursor, Notion, Raycast, and Perplexity
- domain-sensitive tone and layout guidance
- reusable static frontend patterns
- safe image sourcing guidance

Test:
- generated sites have consistent typography, spacing, sections, and imagery
- brand names are not copied into user-facing output unless requested

### Phase 10.6 - Anti-Slop Quality Guard
Goal: reject or repair low-quality proposals before approval.

Includes:
- visual coherence checks
- responsiveness heuristics
- broken image/layout warnings
- excessive rewrite detection
- wrong-domain/tone detection
- risky path/API detection

Test:
- broad or ugly proposals are reduced, repaired, or rejected before user approval

### Phase 10.7 - Security Governance
Goal: formalize layered safety.

Includes:
- path validation
- action validation
- runtime action allowlist
- risk levels
- governance logs later
- rollback hooks later

Test:
- invalid paths/actions are blocked before proposal or approval

### Phase 10.8 - Visual Inspection Later
Goal: add screenshot/DOM/console analysis only when the runtime foundation is stable.

Includes:
- preview screenshot/DOM inspection
- console/log interpretation
- layout issue detection

Test:
- Hassali can diagnose visible preview problems without excessive resource usage

### Phase 10.9 - Verification and Self-Correction
Goal: verify before claiming work is done.

Includes:
- preview/test/check before success messages
- safe retry when appropriate
- clear failure reporting

Test:
- Hassali reports what was checked and what still failed

## Phase 0 — Foundation
Goal: Create clean monorepo foundation.
Includes:
- Turborepo
- pnpm workspace
- TypeScript configs
- ESLint
- Prettier
- Docker Compose
- env templates
- basic README

Test:
- pnpm install works
- pnpm build works
- docker compose config is valid

## Phase 1 — Web Shell
Goal: Create calm IDE layout.
Includes:
- Next.js app
- Tailwind
- shadcn/ui
- dark/light mode
- app shell
- left sidebar
- center editor placeholder
- right AI panel placeholder
- bottom terminal placeholder

Test:
- web app runs
- layout responsive
- no broken imports

## Phase 2 — API Foundation
Goal: Create Fastify backend.
Includes:
- health route
- WebSocket setup
- env validation
- basic logger
- CORS
- rate limit placeholder

Test:
- API runs
- /health returns OK
- WebSocket connects

## Phase 3 — Database
Goal: PostgreSQL + Drizzle.
Includes:
- users
- workspaces
- projects
- files
- prompts
- ai_requests
- usage_events
- snapshots

Test:
- migrations run
- schema compiles
- database connection works

## Phase 4 — Auth
Goal: Clerk auth wiring.
Includes:
- protected dashboard
- user sync
- protected API middleware

Test:
- login works
- dashboard protected
- user appears in DB

## Phase 5 — Editor + Files
Goal: Monaco editor + file explorer.
Includes:
- file tree
- open file
- edit file
- save file
- tabs
- virtualized tree

Test:
- create/open/edit/save file works

## Phase 6 — AI Chat Streaming
Goal: AI assistant with OpenRouter.
Includes:
- model selector
- streaming chat
- prompt history
- usage tracking

Test:
- prompt streams
- selected model works
- usage saved

## Phase 7 — Orchestration MVP
Goal: AI plans and suggests file changes.
Includes:
- ASK mode
- SUGGEST mode
- EXECUTE placeholder
- tool contracts
- diff preview
- approval before apply

Test:
- AI suggests diff
- user approves
- file changes apply

## Phase 8 — Terminal
Goal: xterm.js terminal + backend execution placeholder.
Includes:
- terminal UI
- command stream
- Docker sandbox design placeholder

Test:
- terminal connects
- logs stream

## Phase 9 — Memory
Goal: Qdrant semantic memory.
Includes:
- indexing worker
- embeddings worker
- incremental indexing
- ignored folders

Test:
- files indexed
- search returns relevant chunks

## Phase 10 — Export + Git
Goal: ZIP export and Git basics.
Includes:
- export project ZIP
- git status
- staged changes
- AI commit message

Test:
- ZIP downloads
- git status shows

## Phase 11 — Polish
Goal: MVP launch readiness.
Includes:
- settings
- performance modes
- usage page
- error states
- loading states
- README deployment guide

Test:
- fresh setup works
- build passes
- app is usable end-to-end
