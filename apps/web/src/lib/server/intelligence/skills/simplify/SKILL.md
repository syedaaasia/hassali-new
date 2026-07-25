# Simplify

Improve changed code after correctness is established. Preserve behavior while
reducing duplication, wasted work, and cognitive overhead.

## 1. Establish scope and evidence

1. Identify the exact diff, proposal, or files being simplified.
2. Read the applicable project rules and nearby shared helpers.
3. Record the behavior and verification evidence that must remain valid.
4. Do not simplify broken code first unless simplification is itself the
   smallest correctness repair.

## 2. Review from four angles

- Reuse: find new logic that duplicates an established local helper, type,
  parser, validator, component, or convention.
- Simplification: find derivable state, copy-paste variants, deep nesting,
  unreachable branches, needless wrappers, and comments that restate code.
- Efficiency: find repeated I/O, redundant computation, sequential independent
  work, oversized context, retained resources, or work added to hot paths.
- Altitude: find special cases layered on shared infrastructure where a small
  general correction at the owning boundary would be clearer.

Use selective independent review only when the change is broad enough for the
angles to be genuinely separable. Parallel reviewers must not edit the same
working tree.

## 3. Filter candidates

For every candidate, name the concrete duplicated work, complexity, cost, or
maintenance burden. Skip it when:

- behavior might change;
- the simpler form is not demonstrably clearer;
- the change would expand far outside the reviewed scope;
- an existing abstraction would become harder to understand;
- evidence is insufficient to prove a branch or helper is unused.

Keep public APIs, schemas, file ownership, project identity, and approval
semantics stable unless the user explicitly requested a contract change.

## 4. Apply only with authority

Simplification does not grant mutation permission. In ASK, explain the
recommended changes as text. In proposal modes, produce a project-bound
proposal and wait for approval. Do not install packages or use arbitrary shell
commands as part of cleanup.

Prefer fewer concepts and direct data flow. Do not replace a small working
implementation with a new framework or abstraction layer.

## 5. Verify again

After an approved simplification, rerun the previously valid evidence for the
affected behavior and one focused regression check. If behavior differs,
classify the change as a failed simplification and repair or revert only
through the authorized workflow.

Report what was simplified, what was skipped, why it was safe, and which
evidence still passes. An already simple diff may return
`NO_ACTIONABLE_SIMPLIFICATIONS`.
