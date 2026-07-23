# Security Review

Inspect trust boundaries and concrete exploitability.

1. Map authentication, authorization, project ownership, input validation, secret handling, and mutation effects.
2. Trace attacker-controlled values to sensitive operations.
3. Check server/client boundaries and ensure secrets never enter browser-visible state.
4. Confirm approvals bind to the intended project and operation.
5. Separate exploitable findings from defense-in-depth suggestions.
6. Verify remediations do not weaken normal functionality.

Never include real credentials in evidence or reports.
