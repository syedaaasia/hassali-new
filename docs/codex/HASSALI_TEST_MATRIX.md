# Hassali Codex Test Matrix

Use this as a compact regression menu. Select the smallest relevant rows first, then broaden only when risk warrants it. Evidence from source inspection, route tests, browser checks, and builds is not interchangeable.

Format: `ID | Area | Scenario | Expected`

## Global

```text
G-01 | Git | Inspect root, HEAD, status before editing | Correct repository and unrelated work preserved
G-02 | Ownership | Request project data as another user | Clerk ownership check rejects access
G-03 | Persistence | PostgreSQL/canonical persistence unavailable | Clear failure; no unowned fallback workspace
G-04 | Isolation | Switch between two projects | Files, notes, contracts, approvals, and Preview stay project-bound
G-05 | Routing | Select ASK/WEBSITE/CODE with similar prompt wording | Selected product mode remains authoritative
G-06 | Prompt authority | New prompt conflicts with stale workspace content | Current prompt/contract wins or proposal blocks safely
G-07 | Mutation | Send an unapproved mutating request | No files change and no runtime starts
G-08 | Failure truth | Provider/network/auth/tool fails | UI reports the actual failure and does not claim completion
G-09 | Duplicate submit | Press Enter/click Send during active submit | One request and one response lifecycle
G-10 | Project switch | Switch while request is active | Stale work stops or is isolated; no cross-project mutation
```

## ASK

```text
A-01 | Answer only | Ask a general question | Direct answer; no proposal, file write, Preview, or runtime
A-02 | Drafting priority | Draft a message mentioning tomorrow | Drafted message, not date utility
A-03 | Date utility | Ask tomorrow's date | Correct date answer, no drafting or proposal
A-04 | Wrong-mode website | Ask ASK to build a website | Conversational plan/switch guidance; no files
A-05 | Wrong-mode code | Ask ASK to create an app | Conversational plan/switch guidance; no files
A-06 | Sources | Ask for current/high-stakes facts | Freshness gate uses supported sources or states limitation
A-07 | Unsupported URL | Ask to open a URL without browser capability | No fake fetch; asks for pasted content
A-08 | Pasted text | Paste text and request summary | Uses only supplied text; no invented facts
A-09 | Pasted CSV | Analyze quoted CSV and duplicates | Correct delimiter parsing, bounded report, no writes
A-10 | Formula safety | Request cleaned CSV preview | Formula-like cells neutralized; preview only
A-11 | Notes off | Notes exist with context toggle off | Notes are not injected
A-12 | Notes on | Enable notes context | Bounded current-project notes are included predictably
A-13 | Attachments | Attach supported text/image/document | Reads actual extracted content or states capability limitation
```

## WEBSITE

```text
W-01 | Creation | Generate an upholstery site | Correct domain, requested pages, static files, approval required
W-02 | Domain lock | Current domain conflicts with stale files | Current prompt domain wins; no stale vocabulary leak
W-03 | Exact pages | Request exactly four named pages | Exactly those HTML pages plus shared assets/contracts
W-04 | Edit | Change a phone number | Existing values replaced cleanly; no duplicate blocks
W-05 | Style edit | Make hero darker | Scoped edit; no unrelated regeneration or domain change
W-06 | Destructive edit | Remove contact page | Blocks or updates page, navigation, and references atomically
W-07 | Mixed workspace | Edit WEBSITE beside CODE files | WEBSITE contract/Preview used; CODE contract untouched
W-08 | Approval | Inspect proposal before apply | No file writes until valid approval
W-09 | Preview | Apply valid static site | `static_website` srcDoc Preview with working internal links
W-10 | Validation | Model output is placeholder/wrong domain | Proposal is blocked and cannot be applied
```

## CODE

```text
C-01 | Python stack | Ask explicitly for Python CRM | Streamlit/Python files only; no React/Vite files
C-02 | Python Preview | Apply Python scaffold | Honest summary-only Preview; no install or auto-start
C-03 | React app | Ask for a serious browser app | Product-specific React proposal, docs, sample data, forms, metrics
C-04 | React Preview | Apply React proposal before runtime | Truthful product snapshot; no fake live Vite claim
C-05 | Stack guard | Python prompt receives React files | High-severity stack failure and apply disabled
C-06 | Frontend secrets | Ask for provider key in browser code | No secret or direct provider call; backend boundary explained
C-07 | Runtime approval | Request run/test after apply | Typed allowlisted plan and explicit required authority
C-08 | Package install | Generated app lacks dependencies | No automatic installation
C-09 | Repair | Verification fails repeatedly | Bounded repairs, repeated-signature stop, no scope expansion
C-10 | Mixed workspace | Build CODE beside WEBSITE files | CODE contract/Preview used; WEBSITE contract unchanged
C-11 | Environment | Child runtime starts | Minimal environment excludes Hassali/provider/database/auth secrets
C-12 | Process stop | Stop Preview/runtime | Stops only Hassali-owned process
```

## Approval Policies

```text
P-01 | Default | Open a new project | Ask for approval selected
P-02 | Composer layout | Inspect CODE/WEBSITE composer | Selector is below composer, left-aligned, and outside input row
P-03 | Collapsed style | Inspect selector at rest | Plain text only; no border, pill, box, shadow, caret, chevron, or bulky icon
P-04 | Composer width | Compare ASK and CODE composer | Policy control does not squeeze input width
P-05 | Keyboard | Focus and open selector | Visible focus, Enter/Space open, Escape closes, options operable
P-06 | Persistence | Change policy and revisit project | Current project/session selection hydrates correctly
P-07 | Ask | Apply a valid proposal | Explicit inline Approve/Reject required
P-08 | Approve for me | Valid low-risk file proposal | May apply; warnings, deletes, and runtime still ask
P-09 | Full access | Valid in-scope project proposal | May apply within project; server gates stay active
P-10 | Blocked invariant | Proposal status FAIL/blocked | No policy can expose or execute approval
P-11 | Reject | Reject inline proposal | No files, manifest, or runtime state mutate
P-12 | Server authority | Forge standing policy or stale revision | Server rejects invalid authority
```

## Preview and Export

```text
V-01 | Location | Search workspace UI | Download ZIP appears only inside Preview
V-02 | WEBSITE | Open approved site Preview | Static content renders; Reload remains static
V-03 | Python | Open approved Python Preview | Summary-only state with truthful runtime status
V-04 | React | Open approved React Preview | Product snapshot remains visible without runtime
V-05 | Mode switch | Approve CODE then WEBSITE | Latest approved mode replaces stale Preview state
V-06 | Reload | Reload static/Python/React Preview | Refreshes current kind without mode contamination
V-07 | Stop | Stop inactive/running Preview | Safe stopped state; no unrelated process call
V-08 | ZIP contents | Export WEBSITE/CODE | Approved source/config/assets included and archive opens
V-09 | ZIP exclusions | Inspect archive | No node_modules, .next, build caches, logs, .git, secrets, or temp uploads
V-10 | Binary integrity | Export image assets | Binary bytes remain intact
V-11 | Path safety | Attempt traversal/symlink/mode mismatch | Export rejects unsafe or unrelated content
V-12 | Mobile controls | Open Preview at 390px | Actions wrap without collision or horizontal overflow
```

## Responsive

```text
R-01 | 1440px | Open workspace with sidebar and Preview | Conversation remains primary and panels balanced
R-02 | 1280x800 | Open workspace, dropdown, Preview | Composer spacious; actions align; no clipping
R-03 | 1024px | Open Files and Preview controls | Layout adapts; controls remain reachable
R-04 | 768px | Switch modes and compose | No horizontal page overflow or unusable shrink
R-05 | 390x844 | Use mode nav, composer, approval, Preview | All critical controls readable, tappable, and contained
R-06 | Long metadata | Use long project/path/status values | Text truncates or wraps without collision
R-07 | Scroll | Stream near bottom, then scroll upward | Auto-follow near bottom; manual reading preserved
R-08 | Jump latest | Stay away from newest message | Visible control returns to latest content
```

## Accessibility

```text
X-01 | Keyboard | Tab through top bar, modes, chat, composer, Preview | Logical order and visible focus
X-02 | Names | Inspect icon-only controls | Accessible names present
X-03 | State | Inspect mode and approval controls | Selected/expanded state exposed semantically
X-04 | Contrast | Review dark/light workspace text | Primary, secondary, muted, and disabled states remain legible
X-05 | Hover independence | Use keyboard/touch only | No essential action requires hover
X-06 | Reduced motion | Enable OS reduced motion | Status meaning remains; mascot decoration calms/stops
X-07 | Touch | Use 390px viewport | Primary targets remain practically tappable
```

## Provider and Runtime Failures

```text
I-01 | Request contract | Normalize ASK/CODE and text/image/file inputs | Mode, parts, metadata, and implied capabilities survive
I-02 | Registry | Resolve known, duplicate, and unknown adapters | Known resolves; duplicate/unknown fail deterministically
I-03 | Capability gate | Require unsupported or unknown capability | Stable unsupported-capability failure; no invocation
I-04 | Compute privacy | Send local-only request to cloud adapter | Fails before provider invocation
I-05 | Health | Simulate ready/unconfigured/auth/rate/loading/down | Distinct normalized states and retry semantics
I-06 | Failure | Simulate provider HTTP/network/malformed responses | Stable categories; no provider text or secrets exposed
I-07 | Usage | Provider returns tokens but no cost | Tokens normalize; cost remains explicitly unknown
I-08 | Compatible endpoint | Configure HTTPS or approved loopback endpoint | Safe URL accepted; embedded credentials/insecure remote HTTP rejected
I-09 | Streaming/tools | Normalize SSE text, usage, tool calls, and completion | Provider framing does not escape adapter boundary
I-10 | Current provider | Run ASK/proposal via current configured provider | Contract path used; response behavior remains intact
I-11 | Fallback | Primary current provider fails | At most one existing secondary attempt; no loop or unrelated answer
I-12 | Secret boundary | Save OpenRouter BYOK for user A | AES-GCM encrypted durable storage when master key exists, encrypted session-only otherwise; no client/user-B access
I-13 | Disconnect | Disconnect a BYOK/local source | Hassali config and credential removed; external runtime untouched
I-14 | Local URL | Configure localhost/127.0.0.1/::1 and remote/private URL | Loopback accepted; credentials, redirects, and non-loopback hosts rejected
I-15 | OpenRouter discovery | Test valid/invalid BYOK | Models normalize on success; invalid key reports authentication-failed without provider detail
I-16 | Ollama discovery | Test running Ollama with zero or installed models | Ready with honest count; format/size/quantization shown only when reported
I-17 | llama.cpp health | Simulate ready/loading/down server | Distinct ready/loading/unavailable status; model discovery remains bounded
I-18 | Settings UI | Open Intelligence at desktop and 390px | Sources, disclosure, controls, focus names, and safe wrapping remain usable
I-19 | Default regression | Leave all new connections empty/disabled | Current provider selection and one-secondary fallback remain unchanged
I-20 | Auto hard gate | Require vision with unsupported or unknown local support | Local candidate rejected; verified capable source selected
I-21 | Auto privacy | Select Prefer local and Local only | Healthy capable local wins preference; Local only makes zero cloud calls
I-22 | Auto health | Use degraded/loading/auth-failed and ready sources | Ready reliable candidate wins; failed source is bounded/cached
I-23 | Auto source state | Disable source or return zero models | Source remains unselected; healthy zero-model service is not called
I-24 | Auto economics | Compare degraded cheap and ready verified models | Reliability and capability win before known price
I-25 | Auto fallback | Primary has retryable/non-retryable or streaming failure | At most one eligible fallback; none after output or invalid request
I-26 | Auto override | Lock valid/incapable source and model | Valid override honored; invalid override fails without substitution
I-27 | Auto determinism | Resolve identical request/source state twice | Same primary and fallback decision
I-28 | Meter success | Complete one inference request | One metadata-only request record with normalized source/model/tokens/latency/outcome
I-29 | Meter fallback | Primary fails and fallback succeeds | One request record, two bounded attempts, final source retained
I-30 | Meter privacy | Meter prompt/file-bearing request | No prompt, file body, credential, or raw provider payload is stored
I-31 | Meter resilience | Usage persistence fails after inference | Successful inference remains successful; safe operational warning emitted
I-32 | Cost truth | Provider omits cost or inference is local | Unknown remains null/unknown; local is not-applicable, never fake zero cost
I-33 | Budget Off/Warn | Candidate exceeds configured limit | Off preserves behavior; Warn remains eligible and carries a warning
I-34 | Budget Strict | Managed cost exceeds or cannot prove limit | Candidate excluded with stable strict-budget failure
I-35 | Budget ordering | Cheap incapable model competes with capable model | Capability and privacy remain hard gates before economics
I-36 | Durable secret | Persist, restart-hydrate, tamper, and disconnect | Correct user decrypts; tamper/wrong user fails; disconnect deletes ciphertext and session copy
I-37 | Missing master key | Save BYOK without durable key configuration | No plaintext persistence; UI states encrypted session-only behavior
I-38 | Hassali Local protocol | Normalize mismatched/unpaired bridge data | Mismatch fails; unpaired bridge exposes no runtimes or models
I-39 | Hassali Local safety | Validate origin, endpoint, checksum, license, and resource defaults | Exact origin/loopback required; credentials rejected in URLs; unknown proof stays unknown
I-40 | Hassali Local truth | Open Settings without a native companion | Foundation-only/not installed/not paired; no fake models or install controls
I-41 | Workspace defaults | Open a project and ASK notes | Project Panel and Project Notes start collapsed; both manual toggles remain
F-01 | Provider config | Select unconfigured model | Required env/status shown; no active-model claim
F-02 | Provider fallback | Selected provider fails | Only bounded approved fallback; source/provider truth retained
F-03 | Timeout/cancel | Cancel a slow response | Request and mascot stop; no stale output or timers
F-04 | Runtime unsupported | Enable unsupported Preview | Clear limitation; static/summary Preview does not blank
F-05 | Runtime failure | Approved command exits nonzero | Logs/error shown; no fake success
F-06 | Validation failure | Generator returns unsafe files | Non-applyable diagnostic and no writes
```

## Final Release Evidence

```text
E-01 | Focused tests | Run changed subsystem smoke tests | All pass after final repair
E-02 | TypeScript | Run web typecheck/noEmit | Pass
E-03 | Browser | Validate changed interactions at target widths | Actual screenshots/inspection recorded
E-04 | Build | Run one standard production build | Pass with only known warnings
E-05 | Diff | Inspect status, stat, and changed-file diff | Scope clean; no secrets/package/lock churn
E-06 | Git | Commit requested checkpoint | Correct message, no push, clean worktree
E-07 | Report | Summarize proof surfaces | No visual/runtime claim without matching evidence
```
