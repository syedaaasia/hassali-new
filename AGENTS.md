\# Hassali.ai — Codex Build Rules



You are building Hassali.ai, a calm, lightweight, AI-native coding workspace.



Product identity:

Hassali.ai is not a chatbot, not a generic AI wrapper, and not a feature-heavy Cursor clone.

It is a calm, lightweight AI software creation workspace focused on reducing friction between idea and working software.



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

