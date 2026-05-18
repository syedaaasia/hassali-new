# Hassali.ai

Hassali.ai is a calm, lightweight, AI-native coding workspace focused on reducing friction between idea and working software.

This repository is currently in Phase 0: monorepo foundation only. It intentionally does not include auth, UI, AI logic, database schema, or product workflows yet.

## Stack Direction

- Turborepo monorepo
- pnpm workspaces
- TypeScript
- ESLint
- Prettier
- Docker Compose placeholders for PostgreSQL, Redis, Qdrant, and Ollama

## Workspace Layout

```text
apps/
  web/
  api/
packages/
  ai/
  database/
  git/
  memory/
  orchestration/
  shared/
  terminal/
  ui/
workers/
  embeddings/
  indexing/
  snapshots/
  usage/
```

## Getting Started

Install dependencies:

```bash
pnpm install
```

Run validation:

```bash
pnpm typecheck
pnpm build
pnpm lint
pnpm format
docker compose config
```

Start local infrastructure when needed:

```bash
docker compose up -d postgres redis qdrant
```

Ollama is included as a placeholder service for later local model routing work:

```bash
docker compose up -d ollama
```

## Environment

Copy `.env.example` to `.env` for local development and fill only the services needed for the current phase.

No secrets should be committed.

## Phase Rules

- Phase 0 creates the foundation only.
- Product features are added phase by phase from `ROADMAP.md`.
- Keep modules small and boundaries clear.
- Prefer lightweight defaults for low-resource machines.
