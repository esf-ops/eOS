# Phase DE.0 — Digital Estimate Build Plan

**Date:** 2026-07-15
**Status:** Controlled phase plan only — **DE.1 not started**
**Depends on:** all sibling docs in this folder

---

## 1. Recommended first implementation slice (DE.1)

**Name:** Phase DE.1 — Read-only Publish + Tokenized Public View

**In scope:**

1. Authorized estimator opens saved Elite 100 `internal_quote`
2. Publish Digital Estimate (server eligibility + confirm)
3. Freeze revision identity + calculation/pricing evidence + customer-safe snapshot
4. High-entropy token; store hash only; return link once
5. Manual copy link (`link_copied` event)
6. Public head opens read-only room-by-room estimate
7. Customer print/save as PDF (browser print; may reuse print HTML helpers)
8. Events: Published, Link Copied, First Viewed, Last Viewed, Revoked
9. Revoke → generic 404, no estimate body

**Out of scope:** configuration, autosave, amendments, uploads, acceptance, automated email, auto Takeoff, IE import automation, pricing refresh, sold, Moraware/QB, PDF delivery changes, non–Elite 100.

---

## 2. Controlled phases (roadmap)

| Phase | Focus | Depends on |
|-------|-------|------------|
| **DE.0** | Current-state audit + architecture (this folder) | — |
| **DE.1** | Read-only publish + public token view + events + flags | DE.0 |
| **DE.2** | Quote Library activity UI + staff publication list polish | DE.1 |
| **DE.3** | Configuration envelope model (data + admin, no customer UI) | DE.1 |
| **DE.4** | Per-room Elite 100 group/color/option choices + Brain recalc | DE.3, Pricing Admin cutover awareness |
| **DE.5** | Customer autosave drafts (non-authoritative) | DE.4 |
| **DE.6** | Structured amendments + immutable customer submissions | DE.4 |
| **DE.7** | Elite exception review + revised publications | DE.6 |
| **DE.8** | Final customer approval / acceptance state | DE.7 |
| **DE.9** | Accepted — Awaiting Sold Review → staff Sold confirm | DE.8, QL sold |
| **DE.10** | Structured handoff + notifications + analytics | DE.9 |

Do not collapse DE.4–DE.8 into one phase.

---

## 3. Dependencies

| Dependency | Notes |
|------------|-------|
| Saved IE quote with `calculation_snapshot` + CDT | Hard gate for publish |
| Customer sanitizer / display builders | Reuse |
| Org context + head access middleware | Reuse |
| CORS / `HEAD_URL_*` pattern | New public origin |
| Feature flags | Fail closed |
| Migration runner / SQL editor process | Additive tables |
| Pricing Admin → calculator cutover | **Not** required for DE.1 (freeze saved snapshot) |
| Quote Intake 6P.x | **No** dependency; do not modify |

---

## 4. Expected files / modules (DE.1)

### Backend (new)

- `backend-core/src/digitalEstimate/digitalEstimateConfig.mjs`
- `digitalEstimatePublishService.mjs`
- `digitalEstimateTokenService.mjs`
- `digitalEstimatePublicSerializer.mjs`
- `digitalEstimateAccessService.mjs`
- `digitalEstimateEvents.mjs`
- `digitalEstimateRoutes.js`
- `digitalEstimateEligibility.mjs`
- `phaseDe1.test.mjs` (+ fakes)
- `backend-core/supabase/eliteos_digital_estimate_v1.sql`

### Backend (touch carefully)

- `server.js` — single attach registration line
- `headDeploymentUrls.js` / CORS list — `HEAD_URL_DIGITAL_ESTIMATE`
- Optionally `eosGovernanceConstants.js` — **only if** staff slug needed (prefer not for public head)

### Frontend (new)

- `app-digital-estimate/` — Vite public head (read-only)
- Env example `VITE_BACKEND_URL` only

### Frontend (additive)

- `app-internal-estimate/` — Publish / Revoke / Copy link controls (feature-flagged)
- Optional: `app-quote-library/` read-only publication activity

### Docs

- `docs/digital-estimate/PHASE_DE_1_NOTES.md` (after implement)

---

## 5. Migrations likely required

`eliteos_digital_estimate_v1.sql` (additive):

- `quote_publications`
- `quote_publication_snapshots`
- `quote_publication_access_tokens`
- `quote_publication_events`
- Indexes + revoke/anon privileges
- Comments; no changes to `quote_headers` required for DE.1 (FK only)

**Do not** apply in DE.0.

---

## 6. Feature flags

| Flag | Default | Meaning |
|------|---------|---------|
| `DIGITAL_ESTIMATE_API_ENABLED` | off (`1` to enable) | Mount internal+public routes |
| `DIGITAL_ESTIMATE_PUBLISH_ENABLED` | off | Allow publish |
| `DIGITAL_ESTIMATE_PUBLIC_READ_ENABLED` | off | Allow public GET |
| `VITE_DIGITAL_ESTIMATE_UI_ENABLED` | false | IE publish button visibility only |

Elite 100 eligibility may also check snapshot/program markers — document exact predicate in DE.1 notes.

---

## 7. Tests (DE.1 minimum)

- Publish requires auth, org, confirm, eligibility
- Publish freezes snapshot; IE `update_existing` after publish does not change public DTO
- Token hash stored; raw token not in DB
- Public GET happy path redacts internals (wholesale, internal_ui, etc.)
- Revoked/expired/unknown → identical 404
- Rate limit trips
- Flags off → no Graph-of-quote / no route side effects
- Cross-org deny
- Event append-only + metadata sanitizer
- UI: no auto-publish; revoke clears public access
- `node --check`, existing IE/QL/delivery tests remain green

---

## 8. Deployment order

1. Apply SQL (staging)
2. Deploy Brain with flags **off**
3. Deploy `app-digital-estimate` (flags/API off → safe empty)
4. Deploy IE UI (button hidden)
5. Enable API + publish + public read on staging
6. Synthetic publish test with test customer link
7. Production SQL → Brain → heads → flags last

Rollback: flags off; revoke publications; do not drop tables immediately.

---

## 9. Acceptance criteria (DE.1)

- [ ] Estimator publishes from saved Elite 100 quote only when eligible
- [ ] Customer opens link without account and sees read-only rooms + total
- [ ] Print works
- [ ] Events recorded for published, link copied, first/last viewed, revoked
- [ ] Revoked link shows no estimate information
- [ ] No recalculation on view
- [ ] No changes to PDF email delivery behavior
- [ ] No Quote Intake / Takeoff / Pricing Admin / Moraware / QB modifications
- [ ] Tests + build + `git diff --check` green

---

## 10. Complete paste-ready Phase DE.1 Cursor prompt

Copy everything in the block below into a new Cursor agent turn when ready to implement DE.1.

```
Implement Phase DE.1 — Elite 100 Digital Estimate Read-Only Publish + Tokenized Public View.

Read first and obey:
- docs/digital-estimate/DO_NOT_TOUCH.md
- docs/digital-estimate/CURRENT_STATE.md
- docs/digital-estimate/TARGET_ARCHITECTURE.md
- docs/digital-estimate/REVISION_AND_SNAPSHOT_MODEL.md
- docs/digital-estimate/PUBLIC_SECURITY_AND_API.md
- docs/digital-estimate/BUILD_PLAN.md
- docs/quote-intake-lab/DO_NOT_TOUCH.md (do not modify Quote Intake / Takeoff work)

CONTEXT
Ship the first vertical slice only:
1) Authorized estimator opens an existing saved Elite 100 internal_quote.
2) Clicks Publish Digital Estimate.
3) Backend validates eligibility (feature flags, org, quote_source=internal_quote, Elite 100 eligibility predicate you document, saved calculation_snapshot + customer_display_total / print snapshot consistency, not archived).
4) Backend freezes quote revision identity (source quote_headers.id, family root, quote number, revision).
5) Backend freezes calculation + minimum pricing evidence by COPYING the saved calculation_snapshot (do NOT recalculate on publish by default; do NOT call calculateQuote on the public path ever).
6) Backend creates customer-safe scope snapshot via a dedicated public serializer (reuse estimateContentSanitizer / display-from-snapshot patterns; do not return internal quote API JSON).
7) Backend generates a high-entropy access token; store only token_hash; return raw token + customer URL once to staff.
8) Estimator copies the link manually; record link_copied.
9) Customer opens dedicated public head route without an account.
10) Customer sees read-only room-by-room estimate and can print.
11) Record published, first_viewed, last_viewed (throttled), revoked events.
12) Revoke invalidates access with generic Not found and zero estimate body.

EXPLICITLY OUT OF SCOPE
Customer configuration, autosave, amendments, uploads, acceptance/signature, automated email delivery of the link, automatic Takeoff, Takeoff-to-IE import, pricing refresh on view, sold conversion, Moraware/QuickBooks writes, changes to existing PDF/Resend delivery, non-Elite-100 quotes, Quote Intake/Graph changes, Pricing Admin calculator cutover.

ARCHITECTURE TO IMPLEMENT
- New Brain package: backend-core/src/digitalEstimate/**
- New additive SQL: backend-core/supabase/eliteos_digital_estimate_v1.sql
  Tables: quote_publications, quote_publication_snapshots, quote_publication_access_tokens, quote_publication_events
  Do NOT put tokens on quote_headers. Do NOT rely on unused quote_share_links without snapshot binding (prefer new tables).
- Internal routes under /api/digital-estimate/* (auth + head access quote and/or quote_library + internal operator checks). Org from auth only.
- Public routes under /api/public-digital-estimate/v1/:token (rate limited; generic 404).
- New public head app-digital-estimate/ on digital.eliteosfab.com (HEAD_URL_DIGITAL_ESTIMATE + CORS). Do NOT use estimate.eliteosfab.com (Internal Estimate alias). No browser Supabase authority for estimate rows.
- Additive Publish/Revoke/Copy controls in app-internal-estimate behind VITE flag. Optional read-only activity in Quote Library if small; otherwise staff list via IE only for DE.1.
- Feature flags default OFF: DIGITAL_ESTIMATE_API_ENABLED, DIGITAL_ESTIMATE_PUBLISH_ENABLED, DIGITAL_ESTIMATE_PUBLIC_READ_ENABLED (exact "1"), VITE_DIGITAL_ESTIMATE_UI_ENABLED.

SECURITY REQUIREMENTS
- Public-safe DTO only; redaction list in PUBLIC_SECURITY_AND_API.md
- Constant-time hash comparison where applicable
- No quote enumeration; no internal IDs in public DTO when avoidable
- No logging of tokens, snapshots, subjects, addresses beyond what existing delivery already carefully allows — prefer event codes only
- IP/UA: hash/truncate per docs; no raw long-term retention requirement beyond documented policy
- Flags off: do not mount side-effecting paths / fail closed
- Confirm publish and revoke server-side (confirm: true)

TESTS / VALIDATION
- Add phaseDe1 backend tests with fakes (no real network, no real Resend, no real customer traffic)
- UI boundary tests for public head / IE button gating
- Run relevant existing quote + delivery tests that must stay green
- node --check on new modules; app builds for IE + digital-estimate
- git diff --check
- Write docs/digital-estimate/PHASE_DE_1_NOTES.md

HARD STOPS
- Do not commit/push/deploy/apply migrations/enable production flags unless explicitly asked
- Do not modify Quote Intake, Takeoff providers, Pricing Admin math, Moraware, QuickBooks, or existing quote-delivery send behavior
- Do not begin DE.2+

When done, report files changed, migration path, flags, test results, and residual risks.
```

**Location of this prompt:** this section (`BUILD_PLAN.md` §10).

---

## 11. Rollback

1. Set all Digital Estimate flags off.
2. Revoke active publications (script or SQL).
3. Remove public head from DNS/CORS if needed.
4. Keep tables for audit; drop only with explicit later decision.

---

## 12. Success metrics (pilot)

- Publish → view → revoke works for ≥1 synthetic Elite 100 quote
- Zero production customer emails sent by DE.1
- Zero incidents of internal pricing in public responses (test-enforced)
- PDF email path regression tests still pass
