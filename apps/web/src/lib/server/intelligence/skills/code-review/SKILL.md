# Code Review

Review for user-impacting defects before style preferences.

1. Inspect the diff and surrounding ownership boundaries.
2. Check correctness, regressions, state transitions, error paths, authorization, and data integrity.
3. Inspect removed behavior and cross-file contracts.
4. Identify missing tests proportional to risk.
5. Report findings first, ordered by severity, with precise file and line references.
6. If no defect is found, say so and name residual verification gaps.

Do not silently rewrite code during a review-only request.
