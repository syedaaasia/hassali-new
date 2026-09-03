# ASK Failure Backlog

## ASK-P1 BACKLOG - topic/context contamination

Status: deferred for later Beta certification; not repaired by the scoped
exclusivity checkpoint. ASK development is frozen after that checkpoint.

Observed in authenticated Edge at localhost:3113/dashboard on 2026-09-04.

Minimal sequence in one ASK conversation:

1. `Suggest a simple palette using only red and white colors.`
2. A palette answer containing red and white.
3. `Write a warm client reminder without using the phrase "I hope you are well". Ask them to send the invoice reference.`

Exact incorrect answer:

> Hassali's visual direction is calm, premium, technical, warm, precise, dimensional, minimal, and mature, led by Hassali orange. It intentionally avoids neon, crypto/cyberpunk styling, generic purple SaaS, excessive glass, and nested-card noise.

Causality: PRE_EXISTING_UNRELATED. An in-memory comparison loaded the committed
`82515ec` behavioral module using `git show` and compared it with the dirty
module, using the same messages. Both append the same stale text to the current
request: `Referenced objective: Suggest a simple palette using only red and white colors.`
Both then return the exact answer above through the unchanged
`createHassaliSelfKnowledgeAnswer`. With no previous turns, both preserve the
raw reminder request and self-knowledge returns null. The failure reproduces
deterministically; it is not merely an unconfirmed browser artifact.

Likely subsystem: follow-up objective resolution in behavioral-intelligence,
then the early self-knowledge dispatch in /api/ai/chat. This occurs before
provider invocation, revision, or the new local palette recovery method.

The exclusivity patch now extracts its allowed sets from the current user
utterance, not from an appended referenced objective. This prevents the new
contract field from inheriting stale palette authority; it does not repair
the pre-existing topic selection or self-knowledge response.

Do not reopen a broad ASK repair or restart acceptance gates automatically.
