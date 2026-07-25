# Code Review

Review changed code for actionable defects and regressions. Correctness,
security, data integrity, and user-request fidelity outrank style preferences.

## 1. Define the review scope

1. Identify the requested target: working diff, commit range, branch, proposal,
   or named files.
2. Include uncommitted changes when they are part of the work under review.
3. Read the user specification, applicable `AGENTS.md`, and the enclosing
   functions and modules for every changed hunk.
4. Record the selected project and ownership boundary. Do not review or change
   another project by implication.

If the review target is absent or ambiguous, state what is missing. Do not
silently choose an unrelated range.

## 2. Find candidates from independent angles

Use the angles that match the change:

- Line scan: for each changed line, ask which input, state, timing, or platform
  makes it wrong.
- Removed behavior: name the invariant enforced by deleted code and find where
  the new code re-establishes it.
- Cross-file trace: inspect callers, callees, schemas, return shapes, ordering,
  exceptions, and lifecycle ownership.
- State and failure paths: check empty data, partial failure, retries, duplicate
  callbacks, reload, stale state, and cleanup.
- Trust boundaries: check authentication, authorization, project ownership,
  approval binding, input validation, secrets, and sensitive mutations.
- Contract fidelity: check explicit requirements, exclusions, artifact family,
  stack, file set, and user-visible behavior.
- Test coverage: identify missing evidence proportional to blast radius.
- Cleanup: note reuse, unnecessary complexity, wasted work, or a fix applied at
  the wrong architectural level only when the cost is concrete.

For broad or high-risk diffs, selective independent reviewers may inspect
separate angles. Do not create agents for a narrow review, duplicate the same
work, or let an agent mutate shared state.

## 3. Verify each candidate

Deduplicate findings that describe the same defect. For each candidate:

1. Read enough surrounding code to construct the execution path.
2. Search for guards, types, invariants, tests, or callers that confirm or
   refute it.
3. Assign `CONFIRMED`, `PLAUSIBLE`, or `REFUTED`.
4. Report `PLAUSIBLE` only when the state is realistically reachable and the
   impact is concrete. Drop speculation and pure preference.

Do not manufacture findings to make the review look productive.

## 4. Severity and output

Use `CRITICAL`, `HIGH`, `MEDIUM`, or `LOW` based on user impact and
exploitability, not code aesthetics. Every finding must contain:

```text
location
problem
impact or failure scenario
evidence
recommended correction
```

Lead with findings ordered by severity and include precise file and line
references. Keep summaries secondary. If no candidate survives verification,
return `NO_ACTIONABLE_FINDINGS` and name residual test or runtime gaps.

Review-only requests do not authorize edits. If fixes are requested, keep file
changes project-scoped and behind the existing proposal and approval contract.
