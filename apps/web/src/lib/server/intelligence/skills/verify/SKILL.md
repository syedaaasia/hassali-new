# Verify

Implementation is not completion. Verify the requested behavior with the
minimum sufficient evidence from the surface the user actually relies on.

## 1. Establish the verification target

1. Read the user request, acceptance criteria, relevant proposal, and complete
   changed scope. Treat the diff and current files as ground truth.
2. Name the behavior being proved, the selected project, and the artifact or
   runtime surface where that behavior is observable.
3. Identify explicit negative constraints and nearby behavior that must remain
   unchanged.
4. If the target or project is unclear, report the ambiguity instead of
   inventing a verification claim.

## 2. Plan minimum sufficient evidence

Choose evidence by task shape:

- Pure explanation: source reasoning may be sufficient.
- Repository change: focused tests, typecheck, build, or runtime as warranted.
- API or route: send a real request and capture status, headers, and body.
- UI or WEBSITE: use the real browser or static preview and inspect behavior.
- Build-system change: run the actual build.
- Security-sensitive change: use a safe security-specific probe.

Do not run every verifier by habit. Do not substitute an internal
import-and-call check for a public CLI, route, package boundary, or UI when a
real surface exists.

## 3. Reach the real surface

1. Prefer an existing project run or verification skill.
2. Use only registered Hassali tools and approved project-scoped actions.
3. Do not install packages or invent arbitrary shell execution.
4. Isolate ports, temporary data, and test state. Never stop a user-owned
   process.
5. If a destructive or external path lacks a safe target or dry run, verify
   the surrounding behavior and mark the unexercised path explicitly.

## 4. Drive and probe

Exercise the smallest end-to-end path that reaches the changed behavior.
Capture what the application returns or renders. Then run at least one
relevant adjacent probe, such as malformed input, empty state, repeated
action, reload, stale state, failure response, or mobile layout. Select probes
from the actual risk; do not use a generic checklist mechanically.

If verification fails, classify the failure, diagnose the owning boundary,
make only an approved bounded repair, and rerun the affected evidence plus one
final regression check. Do not loop indefinitely.

## 5. Evidence contract

Each record should contain:

```text
verificationTarget
criterion
method
result
evidence
status
```

Use `PASS`, `FAIL`, `NOT_RUN`, `NOT_AVAILABLE`, or `NOT_APPLICABLE`. Label the
evidence surface as `SOURCE_INSPECTED`, `TEST_VERIFIED`, `BUILD_VERIFIED`,
`ROUTE_VERIFIED`, or `BROWSER_VERIFIED`.

Never claim runtime, route, build, test, or browser success from source
inspection. Missing evidence remains missing evidence.

## 6. Report

State the verdict, target, method, observed steps, decisive evidence, adjacent
probe, failures, and limitations. A blocked harness or missing environment is
not an application failure. A partial set of passing checks is not a full
pass unless the remaining criteria are explicitly not applicable.

Use the evidence-check script when a structured evidence record is requested.
