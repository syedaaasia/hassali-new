# Hassali.ai Build Roadmap

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