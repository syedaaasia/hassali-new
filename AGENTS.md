\# Hassali.ai — Codex Build Rules



You are building Hassali.ai, a calm, lightweight, AI-native coding workspace.



Product identity:

Hassali.ai is not a chatbot, not a generic AI wrapper, and not a feature-heavy Cursor clone.

It is a calm, lightweight AI software creation workspace focused on reducing friction between idea and working software.

## Hassali.ai Product & Engineering North Star

Hassali.ai is the Calm Autonomous Engineering Operating System for constrained builders.

It is built first for people using low-spec PCs and laptops, unstable internet, limited budgets, and limited technical support across Pakistan, India, Bangladesh, Africa, Asia, Latin America, and other low-resource regions.

Hassali.ai must not become a Cursor clone, a TRAE clone, a generic AI chat wrapper, a chaotic multi-agent playground, or a tool only for elite Silicon Valley developers.

The long-term product shape is:

- chat as the main operating surface
- code, files, preview, terminal, and diagnostics revealed progressively
- calm, centered, spacious UX
- low RAM and low CPU usage
- selective project context instead of full-repo flooding
- local-first static preview where possible
- approval-first engineering automation
- reliable project isolation and ownership checks
- clear errors instead of silent fake fallbacks
- future Apple Glass / Liquid Glass visual direction, only in explicit UI phases

Hassali's core orchestration loop:

listen -> inspect -> diagnose -> plan -> propose -> approve -> execute -> verify

Before any SUGGEST or EXECUTE proposal, Hassali should classify user intent, inspect the selected project, inspect current files and active file, inspect runtime state when useful, infer domain, infer edit scope, and choose the smallest safe treatment.

## Current Non-Negotiables

- Project isolation is mandatory. A proposal must bind to the selected `projectId`.
- Approval must fail if the current project differs from the proposal project.
- File mutations must always require `projectId`.
- Backend file APIs must verify Clerk user ownership and project scope.
- ASK is explanation only.
- SUGGEST is a file-change proposal mode. It must not run runtime actions unless explicitly requested.
- EXECUTE is still approval-first. It may propose file changes plus safe runtime actions only.
- Allowed runtime actions are `restart_runtime`, `reload_preview`, and `stop_runtime`.
- Nothing mutates or runs before approval.
- No arbitrary shell commands.
- No package installs.
- No cloud, Docker, VM, deployment, or remote sandbox execution yet.
- No offline database fallback. If Postgres is unavailable, show a clear error.
- No cross-project edits, stale proposal application, or silent data corruption.
- For vague prompts like "animation", "make better", "fix style", "improve design", "make premium", and "make modern", preserve existing structure and prefer targeted CSS/JS or selected-file edits.

## Context and Quality Principles

Do not send everything blindly. Prefer:

- selected project files only
- active file
- key files first, such as `index.html`, `styles.css`, `main.js`, and `package.json`
- relevant snippets
- project summaries later
- runtime logs only when needed
- future memory/indexing only when justified

Hassali must become a quality thinker, not just a code generator. Future quality gates should check visual coherence, responsiveness, broken layout, broken images, spacing, typography, excessive rewrites, wrong domain/tone, hallucinated APIs, risky paths, and unnecessary complexity.

## Do Not Build Yet

Do not build these until explicitly scheduled:

- arbitrary terminal command execution
- package installs
- Docker-per-user execution
- cloud execution
- deployments
- Kubernetes, VMs, remote sandboxes, or heavy infra
- MCP marketplace
- autonomous multi-agent systems
- visual screenshot/DOM inspection
- billing
- collaboration
- mobile app
- rollback/audit systems beyond placeholders
- semantic memory/indexing beyond justified minimal phases



Primary users:

\- freelancers

\- students

\- startup founders

\- developers in emerging markets

\- low-spec laptop users

\- users with unstable internet

\- AI coders with subscription fatigue



Core principles:

\- calm UX

\- low RAM usage

\- low CPU usage

\- low token waste

\- fast UI

\- simple surface, powerful underneath

\- workspace-aware AI

\- diff-first safety

\- user approval before file mutation

\- modular architecture



Strict MVP only:

1\. Auth

2\. Dashboard

3\. Monaco editor

4\. Virtualized file explorer

5\. AI assistant sidebar

6\. Multi-file AI editing

7\. AI orchestration engine

8\. Semantic code memory

9\. Streaming responses

10\. Terminal

11\. Project import/upload

12\. ZIP export

13\. Git integration

14\. Local/cloud model routing

15\. Prompt history

16\. Usage tracking

17\. Settings

18\. Snapshot + rollback

19\. Diff approval

20\. Dark/light mode



Do NOT build:

\- marketplace

\- social features

\- collaboration

\- mobile app

\- payments

\- voice coding

\- gamification

\- browser automation

\- AI swarm systems



Tech stack:

\- Next.js App Router

\- TypeScript

\- TailwindCSS

\- shadcn/ui

\- Zustand

\- React Query

\- Monaco Editor

\- xterm.js

\- Fastify

\- PostgreSQL

\- Drizzle ORM

\- Qdrant

\- Redis

\- BullMQ

\- Clerk

\- OpenRouter

\- Vercel AI SDK

\- Ollama support later

\- Cloudflare R2 later

\- Docker Compose



Architecture:

Use Turborepo monorepo.



Required structure:

apps/web

apps/api

packages/ui

packages/database

packages/shared

packages/ai

packages/orchestration

packages/memory

packages/git

packages/terminal

workers/indexing

workers/embeddings

workers/usage

workers/snapshots



Development rules:

\- Do not build the whole product in one response.

\- Work phase by phase only.

\- Before editing, explain the exact files you will touch.

\- Do not touch unrelated files.

\- Do not introduce unnecessary dependencies.

\- Keep files small and modular.

\- Run typecheck/build after each phase.

\- Fix only relevant errors.

\- Never delete large sections without explaining why.

\- Never silently change architecture.

\- Prefer simple working implementation over overengineering.



AI behavior:

\- Be concise.

\- Do not over-explain.

\- Do not hallucinate missing files.

\- Inspect repo before editing.

\- Ask only if blocked.

\- If uncertain, create a minimal safe placeholder.



Safety:

\- All AI file changes should eventually support diff review.

\- Terminal execution must be designed for Docker sandboxing.

\- Never expose secrets client-side.

\- Use Zod for validation.

\- Use environment variable templates.



Performance:

\- No Redux.

\- No Electron.

\- No full repo preload.

\- Use lazy loading.

\- Use virtualized trees.

\- Use incremental indexing.

\- Keep UI lightweight for 4GB RAM laptops.

