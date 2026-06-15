# OpenCode Architecture Audit for Hassali Runtime

Phase: 11.0A  
Date: 2026-06-13  
Scope: Research and adoption planning only. No code integration.

## 1. What OpenCode Is

OpenCode is an open-source AI coding agent/runtime that can operate from a terminal UI, run in a client/server mode, expose an SDK, use file-editing and shell-like tools, read project instructions from `AGENTS.md`, and route across many model providers through its configuration system.

Useful source references:

- Repository: [github.com/anomalyco/opencode](https://github.com/anomalyco/opencode)
- Website/docs: [opencode.ai](https://opencode.ai/)
- Server docs: [opencode.ai/docs/server](https://opencode.ai/docs/server/)
- SDK docs: [opencode.ai/docs/sdk](https://opencode.ai/docs/sdk/)
- Tools docs: [opencode.ai/docs/tools](https://opencode.ai/docs/tools/)
- Permissions docs: [opencode.ai/docs/permissions](https://opencode.ai/docs/permissions/)
- Config docs: [opencode.ai/docs/config](https://opencode.ai/docs/config/)
- Providers docs: [opencode.ai/docs/providers](https://opencode.ai/docs/providers/)
- Rules docs: [opencode.ai/docs/rules](https://opencode.ai/docs/rules/)
- Windows docs: [opencode.ai/docs/windows](https://opencode.ai/docs/windows/)

Key observed capabilities:

- Runtime modes: terminal app, server mode, SDK/API usage.
- Server API: starts a local HTTP server, exposes REST endpoints, includes a web interface.
- SDK: official JavaScript SDK for interacting with server sessions.
- Tools: file read/write/edit, search, glob, grep, shell/bash, patch, todo, task, web fetch/search.
- Permissions: configurable approval rules for editing files, shell commands, web fetches, and external-directory access.
- Provider routing: supports multiple AI providers via config.
- Rules: loads project guidance from `AGENTS.md` and supports global/project-specific rules.
- Windows: recommends WSL usage; native Windows support is not treated as the primary path.
- License: repository is MIT licensed at time of audit.

## 2. What Hassali Should Learn From It

OpenCode is useful as a reference for runtime ergonomics, not as Hassali's decision brain.

Hassali should learn these architecture patterns:

- Separate brain from hands: Hassali Kernel should classify, plan, validate, and approve before any runtime tool acts.
- Server runtime boundary: a local server process can expose narrow APIs for sessions, messages, files, and execution status.
- SDK boundary: a typed SDK/client wrapper can keep the UI from directly knowing runtime internals.
- Tool registry pattern: tools should have explicit names, inputs, permissions, and output contracts.
- Permission policy first: file edits, shell commands, external paths, and web fetches should be separately permissioned.
- Project rules loading: `AGENTS.md`-style instruction loading is useful, but must be merged under Hassali's priority engine.
- Session model: chat sessions, tool calls, streaming, and state should be explicit and inspectable.
- Streaming surface: streamed agent activity should be structured enough for UI progress and audit logs.
- Config layer: provider/model/runtime settings should be centralized, typed, and override-aware.
- Approval discipline: risky actions should be blocked or require explicit approval before execution.

Useful Hassali-aligned mental model:

```text
Hassali Kernel = brain / policy / planner / validator
OpenCode-like runtime = future hands / tools / execution worker
Hassali proposal flow = approval gate between brain and hands
```

## 3. What Hassali Must Not Copy

Hassali must not copy OpenCode's product identity, brand language, UI, or terminal-first assumptions.

Do not copy:

- Branding, copy, names, or visual identity.
- Full terminal-first product shape.
- Broad autonomous shell execution.
- Unbounded full-repo context behavior.
- Any behavior that bypasses Hassali's proposal/review/approval model.
- Any direct provider/model router that weakens Hassali Kernel routing.
- Any code wholesale unless license obligations are reviewed and attribution is handled.
- Permission defaults that are too permissive for Hassali's low-spec, safety-first users.
- Multi-agent behavior as a default runtime model.

Hassali should stay:

- Chat-first.
- Approval-first.
- Low-resource friendly.
- Project-isolated.
- Kernel-guided.
- Calm and progressive rather than terminal-heavy.

## 4. Legal/License Notes

OpenCode's GitHub repository currently declares an MIT license. MIT generally permits use, modification, distribution, and private use, provided the copyright notice and license text are preserved when copying code.

For Hassali:

- Architecture ideas can be learned from without copying source.
- If any source code is copied later, preserve license notices and add attribution.
- Prefer clean-room implementation of Hassali-specific runtime interfaces.
- Do not copy OpenCode brand assets, website copy, UI, or product positioning.
- Before any production integration, re-check the repository license and dependency licenses on the exact commit used.

Recommendation: use OpenCode as an external reference and possible runtime adapter target, not as a source-code donor in this phase.

## 5. Possible Integration Architecture

No integration should happen yet. If adopted later, OpenCode should sit below Hassali Kernel as a controlled runtime/hands layer.

Proposed future architecture:

```text
User prompt
  -> Intent Translator
  -> Blueprint Matcher
  -> Context Priority Engine
  -> Task Decomposer
  -> Execution Planner
  -> Composition/Validation/Quality/Asset/Gate/Repair
  -> Hassali Kernel Routing Decision
  -> Proposal shown to user
  -> User approval
  -> Hassali Runtime Adapter
  -> OpenCode-like server/SDK/tools, if enabled
  -> Verification
  -> Result reported to user
```

Adapter boundary:

- `HassaliRuntimeAdapter`
  - `startSession(projectId, workspacePath, rules)`
  - `sendApprovedPlan(sessionId, approvedSteps)`
  - `streamEvents(sessionId)`
  - `readFile(sessionId, path)`
  - `writeFile(sessionId, path, content)`
  - `applyPatch(sessionId, patch)`
  - `stopSession(sessionId)`

OpenCode should never receive raw user prompts as unrestricted instructions. It should receive approved, kernel-sanitized execution plans only.

Provider/model routing:

- Keep Hassali's provider decisions in Hassali.
- OpenCode provider support can be considered later as an execution backend detail.
- Hassali should not delegate strategic model choice to OpenCode by default.

Rules/AGENTS.md:

- Hassali should read `AGENTS.md` and `HASSALI.md`.
- Priority must remain:
  1. Current user prompt
  2. Selected mode
  3. Hassali intent/priority/contract layers
  4. `HASSALI.md`
  5. `AGENTS.md`
  6. Existing files
  7. Fallback defaults

## 6. Risks

Primary risks:

- Shell execution risk: OpenCode-style tools can run commands. Hassali currently forbids arbitrary shell execution.
- Permission drift: imported permission behavior could weaken Hassali's approval-first model.
- Context flooding: external agent runtimes may load more repo context than Hassali wants.
- Cross-project risk: runtime sessions must bind to selected `projectId` and workspace root.
- Windows/WSL complexity: OpenCode's Windows guidance leans toward WSL; Hassali must handle Windows users carefully.
- Provider complexity: adding runtime-level provider routing before Hassali's own provider architecture could create confusion.
- Streaming mismatch: OpenCode event streams may not map cleanly to Hassali proposal/review UI.
- Resource usage: long-running agent processes may be heavy for 4GB RAM laptops.
- Legal hygiene: copying code requires license preservation and dependency review.
- Product identity drift: adopting too much could make Hassali feel terminal-heavy or clone-like.

Mitigations:

- Build an adapter, not a direct dependency first.
- Keep all execution behind user approval.
- Disallow arbitrary shell commands until a later explicitly scheduled sandbox phase.
- Bind runtime sessions to `projectId`, user ownership, and workspace root.
- Add per-tool permissions.
- Require structured event output.
- Use process limits/timeouts when runtime execution eventually exists.
- Prefer docs-first/source-plan execution for large CODE tasks.

## 7. Recommended Hassali Implementation Path

Recommended path: borrow patterns, not implementation.

Phase approach:

1. Define Hassali's own runtime interface.
2. Add a no-op/mock runtime adapter for approved plans.
3. Add event schema for runtime activity.
4. Add permission policy schema.
5. Add local file operation adapter only for approved file proposals.
6. Later, evaluate OpenCode server/SDK as one optional runtime backend.
7. Keep provider routing in Hassali until a separate provider phase is scheduled.

What to build first inside Hassali:

- `RuntimeToolRegistry`
- `RuntimePermissionPolicy`
- `RuntimeSession`
- `RuntimeEvent`
- `RuntimeAdapter`
- `ApprovedExecutionPlan`
- `VerificationResult`

What not to build yet:

- Arbitrary shell.
- Package install execution.
- Docker/cloud execution.
- Autonomous multi-agent workflows.
- Provider router integration.
- OpenCode dependency installation.

## 8. Phase Breakdown for Future Integration

Suggested future phases:

### Phase 11.0B - Hassali Runtime Adapter Contract

- Create internal TypeScript types for runtime sessions, events, tools, permissions, and approved execution plans.
- No external runtime dependency.
- No shell execution.

### Phase 11.0C - Runtime Permission Policy

- Add deterministic permission checks for file read/write, patch, runtime actions, external paths, and future shell commands.
- Keep selected `projectId` mandatory.
- Add blocked reason metadata.

### Phase 11.0D - Approved File Tool Runner

- Execute only already-approved Hassali file proposals.
- No arbitrary commands.
- Verify file writes after persistence.

### Phase 11.0E - Runtime Event Stream

- Add structured runtime events for proposed/approved execution steps.
- Map events into the existing chat/proposal UI without redesign.

### Phase 11.0F - OpenCode Compatibility Spike

- Start OpenCode server separately in a local dev-only experiment.
- Use SDK/API only through a Hassali adapter.
- Measure Windows/WSL behavior, memory usage, startup time, and event quality.
- Do not ship by default.

### Phase 11.0G - Optional OpenCode Backend Adapter

- Add feature-flagged adapter if the spike succeeds.
- Keep Hassali Kernel as the only router/brain.
- Pass only approved plans.
- Disable shell/package tools unless explicitly enabled in a later sandbox phase.

### Phase 11.0H - Provider Strategy Review

- Revisit provider/model routing separately.
- Decide whether OpenCode provider config is useful as reference or should remain isolated.

## Final Recommendation

OpenCode is worth studying as a runtime and tool-permission reference. Hassali should not integrate it yet.

The safest adoption path is to build Hassali's own runtime adapter contract first, keep the Kernel as the brain, keep proposal approval as the gate, and treat OpenCode as a possible future backend for approved execution only.
