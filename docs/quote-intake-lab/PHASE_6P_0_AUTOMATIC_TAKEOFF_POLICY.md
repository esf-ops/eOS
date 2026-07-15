# Phase 6P.0 — Automatic Takeoff Policy

**Date:** 2026-07-15
**Status:** Policy design only
**Principle:** Automate preparation, not approval.

---

## 1. Two explicit paths

| Path | Outcome |
|------|---------|
| **A — Trusted automatic Takeoff** | Intake case + automation decision + Takeoff job via ProductionTakeoffAdapter |
| **B — Manual review** | Intake case preserved with reasons; **no** Takeoff job created |

Silent discard of mail is forbidden on either path.

---

## 2. PATH A — Trusted automatic Takeoff

Automatic Takeoff may begin **only when all** required gates pass:

### 2.1 Sender

- Sender is an approved internal Elite Stone salesperson.
- Address matched against **server-side** allowlist and/or trusted role mapping.
- External / unknown senders → Path B.

### 2.2 Subject & program

- Subject contains deliberate marker: `[QIL TAKEOFF]` (case-sensitive recommended for pilot clarity; document exact matcher in 6P.5).
- Body declares `Program: Elite 100` **or** classification reaches an approved equivalent decision.

### 2.3 Attachment PDF

At least one supported PDF is **directly** attached and passes:

- Content-type validation
- Filename normalization
- Magic-byte `%PDF` validation
- Size limits
- Page limits
- Empty-file detection
- Encryption/password detection
- Active-content policy (no JS/forms/embedded exec — align with lab PDF hygiene)
- SHA-256 calculation
- Attachment dedupe

### 2.4 Message identity

- Immutable Graph ID handling
- `internetMessageId` dedupe
- Content-hash fallback
- Sender validation
- Revision validation

Message is not a duplicate. Attachment has not already created a Takeoff job for this intake/revision.

### 2.5 Multi-file policy (pilot)

See §5. Unambiguous single-plan package required for Path A.

### 2.6 Feature & cost gates

- Automatic Takeoff feature flag **enabled**
- Real-plan transmission feature flag **enabled** only when approved (synthetic may use a separate synthetic-transmission allow path)
- Cost / rate / concurrency budgets allow another job
- No blocking intake/classification warning

### 2.7 When Path A succeeds

1. Persist intake case
2. Persist automation decision (pass + gate evidence codes — not raw email)
3. Run classification/extraction
4. Submit supported PDF through ProductionTakeoffAdapter
5. Persist intake-to-takeoff link
6. Display status in Estimator Queue
7. Internal status only if safe internal notifications exist — **never customer email**
8. Require estimator review and approval

Estimator must **not** need to click Start Takeoff for Path A successes.

---

## 3. PATH B — Manual review

Do **not** start Takeoff automatically when any of:

- Sender external or not allowlisted
- Subject marker missing
- Elite 100 eligibility uncertain
- No supported PDF
- Attachment corrupt / encrypted / unsupported / oversized / empty
- Multiple plan packages ambiguous
- Revision relationship unclear
- Message/attachment duplicate (create/link case; do not new-job)
- Classification has blocking validation warnings
- Cost/rate/concurrency limits reached
- Automation disabled
- Real-plan transmission disabled (for real plans)
- Any contract invariant fails
- Nested `.eml` / item attachment only

**Path B behavior:**

- Create or preserve intake case
- Show reason automation did not run (structured codes)
- Route to estimator/manual review
- Do not silently discard
- Do not create a Takeoff job

---

## 4. Sender policy

| Element | Design |
|---------|--------|
| Allowlist | Server env or org-config table of salesperson emails (normalize lowercase) |
| Matching | Exact email match on SMTP From / Graph from.emailAddress |
| Display names | Not authoritative |
| Spoofing residual risk | Marker + allowlist + internal-only mailbox; still treat as untrusted until reviewed |
| Changes | Audited config change; not browser-editable in pilot |

---

## 5. Multi-PDF policy (initial pilot)

| Situation | Policy |
|-----------|--------|
| One directly attached plan PDF | May auto-run (Path A) |
| Several PDFs forming one package | **Ambiguous → Path B** until package rules exist |
| Several unrelated packages | Path B |
| PDF + images | Store images; auto-submit PDF only if single PDF; else Path B |
| Duplicate PDFs (same SHA) | Dedupe; one job max |
| Revised PDFs (new SHA) | New revision link/job when revision semantics clear; else Path B |
| Nested `.eml` / item attachments | Deferred → Path B |

**Evolution:** Later rules may declare “primary plan” naming conventions or salesperson structured block field `Plan file:`.

---

## 6. Idempotency & revisions

### Keys

- Microsoft immutable message ID
- `internetMessageId`
- `conversationId` — context only
- Normalized content hash fallback
- Attachment SHA-256
- Intake case ID
- Intake-to-takeoff mapping + idempotency key
- Revision identity/reference
- Job creation idempotency key

### Required behavior

| Scenario | Behavior |
|----------|----------|
| Same forwarded message twice | One case |
| Same PDF same intake/revision | One job |
| Retry after technical failure | Traceable retry row / link; not accidental duplicate |
| True customer revision | New linked job; prior immutable |
| Latest current result | Explicit pointer on case/link |
| Email thread noise | Must not overwrite accepted work |

---

## 7. Cost, abuse, workload controls

| Control | Pilot intent |
|---------|--------------|
| Approved sender allowlist | Required for Path A |
| Subject marker | Required for Path A |
| Attachment count/size/page limits | Hard reject / Path B |
| Hourly / daily automatic-job budgets | Server-enforced |
| Max concurrent automatic jobs | Server-enforced |
| Dedupe | Always |
| Retry ceilings | Finite; exponential backoff |
| Poison message quarantine | Path B + visible failure |
| Provider timeout | Fail case/job visibly; no silent loop |
| Audit | Every automatic-cost / gate decision recorded |

Suggested starting budgets (tune later): e.g. low single-digit concurrent; dozens/day — exact numbers in implementation env.

---

## 8. Classification role in automation

- Classification may **inform** gates (Elite 100, missing fields).
- Attachment bytes **not** sent to email classification.
- Classification failure → Path B.
- Classification cannot trigger customer communication.
- Invalid evidence remains human-correctable / mark-unknown (lab pattern).
- Simulated provider remains for tests; live Gemini feature-flagged server-side.

---

## 9. Status model (namespaced)

Promote/adapt lab vocabulary (`app-quote-intake-lab/src/domain/statuses.mjs`) for central intake:

| Intake status (proposed live) | Meaning |
|-------------------------------|---------|
| `qil_received` | Imported |
| `qil_validating` | Validation in progress |
| `qil_classifying` | Classification running |
| `qil_manual_review` | Path B / blockers |
| `qil_not_quote` / `qil_not_elite_100` | Rejected classes |
| `qil_ready_for_takeoff` | Gates pending enqueue |
| `qil_takeoff_queued` | Job created / waiting |
| `qil_takeoff_processing` | Job processing |
| `qil_takeoff_ready_for_review` | Draft ready |
| `qil_takeoff_manual_review` | Takeoff needs manual |
| `qil_takeoff_failed` | Takeoff failed |
| `qil_estimator_review` | Estimator actively reviewing |
| `qil_accepted_takeoff` | Estimator accepted (**not** IE import) |

Do **not** reuse ambiguous production quote statuses without explicit mapping.

### Mapping from production Takeoff job → intake

| Takeoff job | Takeoff review | Intake display |
|-------------|----------------|----------------|
| `pending` | * | `qil_takeoff_queued` |
| `processing` | * | `qil_takeoff_processing` |
| `completed` | `needs_review` / `in_review` | `qil_takeoff_ready_for_review` |
| `completed` | hard QA / manual signals | `qil_takeoff_manual_review` |
| `failed` / `cancelled` | * | `qil_takeoff_failed` |
| `completed` | `approved` | Still **not** IE — map to `qil_accepted_takeoff` only after explicit estimator acceptance on intake side if that step is modeled; otherwise remain ready/approved-takeoff without quote creation |

Exact UI labels for queue filters: intake processing · takeoff processing · ready for review · manual review · failed.

---

## 10. Failure behavior

| Failure | Behavior |
|---------|----------|
| Microsoft auth / RBAC | Sync fails visibly; cases unchanged |
| Message fetch | Per-message error; cursor policy documented |
| Unsupported attachment | Path B |
| Duplicate | Link existing; no new job |
| Classification failure | Path B |
| Takeoff create failure | Case → failed/manual; audited |
| Provider timeout / contract failure | Job/case failed; retry explicit |
| Deterministic validation blocker | Manual review state (reuse lab semantics) |
| Worker interruption / storage / DB | Visible failure; no customer mail |
| Estimator correction required | Existing Takeoff review path |

**Invariants:** no email disappears; no accidental duplicate job; prior successful results remain; estimator sees reason; automatic retry has strict limits.

---

## 11. Safety gate (critical)

Incomplete / unsupported / conflicting / missing-dimension cases must **never** become “ready for review” without appropriate blocker/manual-review state.
(Validated offline in Phase 4B.5A benchmark corpus; retain as regression suite for live promotion.)

---

## 12. Kill switches (automation-related)

| Switch | Pilot default |
|--------|---------------|
| Automatic classification | Feature-flagged |
| Automatic Takeoff submission | Feature-flagged / off until 6P.6 |
| Real-plan transmission | **Disabled** until explicit approval |
| Outbound email | Disabled |
| IE / Quote Library promotion | Disabled |

Emergency action stops mailbox ingestion + **new** automatic Takeoff jobs without interrupting existing Takeoff users or already-running jobs.
