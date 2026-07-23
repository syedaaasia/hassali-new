# Simplify

Preserve behavior while reducing accidental complexity.

1. Find duplicated logic, unnecessary state, indirection, and abstractions that no longer pay for themselves.
2. Prefer established local helpers and direct data flow.
3. Keep public contracts stable unless the user requested a contract change.
4. Remove dead branches only when their non-use is proven.
5. Verify the same behavior before and after.

Do not turn simplification into a broad rewrite.
