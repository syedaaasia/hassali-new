# Code Build

Use for a new application, API, script, or code system in CODE mode. Produce a
complete project-bound proposal; execution remains approval-first.

## 1. Resolve the build contract

Extract and preserve:

```text
product identity
new creation or existing app edit
target users and primary workflow
stack, framework, runtime, and platform
core entities and data relationships
screens, routes, commands, or public APIs
explicit inclusions, exclusions, and counts
acceptance criteria
```

Separate required MVP behavior from optional work. When details are open,
choose conservatively from the existing repository patterns. Ask only when an
ambiguity would materially change the artifact, data model, or safety boundary.

## 2. Inspect project context

1. Bind the request to the selected `projectId`.
2. Read the applicable project contract, important root files, active file,
   framework configuration, and existing source structure.
3. For an edit, preserve the current app identity, architecture, data, and
   unrelated behavior.
4. For a new app, compare the requested identity with the existing workspace.
   Surface a collision instead of overwriting a different application.
5. Prefer established helpers, schemas, components, and file conventions.

The CODE overwrite guard and preview contract remain authoritative.

## 3. Design the smallest complete solution

Define the entry point, modules, data flow, state ownership, persistence
boundary, error handling, and focused test strategy. Include:

- real domain entities instead of generic records;
- loading, empty, success, validation, and failure states;
- responsive and accessible UI behavior when a frontend is requested;
- server-side authorization and secret handling where relevant;
- deterministic dependency and configuration choices already supported by the
  repository;
- migration and compatibility notes when an existing contract changes.

Avoid speculative infrastructure, broad rewrites, duplicate sample data,
oversized single files, and abstractions that do not remove real complexity.

## 4. Review before proposing

Check the intended file set against the user request:

- Does the artifact solve the named product rather than a neighboring domain?
- Are every requested screen, route, entity, and constraint represented?
- Are excluded features absent?
- Do file paths stay inside the selected project?
- Are public contracts, failures, and security boundaries coherent?
- Is the planned verification sufficient for the risk?

Use a selective architecture, security, or review agent only when the work has
an independently reviewable high-risk boundary. Do not create a standing agent
team for routine builds.

## 5. Proposal and evidence boundary

Return an approval-first proposal containing the exact project, files,
operations, rationale, risks, and verification plan. Do not apply files, start
runtimes, install packages, or introduce arbitrary shell commands before
approval. A request for code text in ASK remains an ASK response and must not
enter this workflow.

After approved execution by the existing Hassali mechanism, verification must
use the real public surface and evidence statuses. Until then, describe planned
checks as `NOT_RUN`; never claim that proposed code already builds or runs.
