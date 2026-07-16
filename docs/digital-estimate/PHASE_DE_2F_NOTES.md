# Phase DE.2F — Customer Review Request, Estimator Amendment, Comparison Queue, and Digital Re-publication

**Date:** 2026-07-16  
**Status:** Implemented (flags off; SQL unapplied; no acceptance/sold/email/payment). **Do not begin DE.2G.**  
**Depends on:** DE.2E (public configuration + sessions + DE.2C calculations)

---

## 1. What shipped

| Deliverable | Path |
|-------------|------|
| Review/amendment flags | `amendmentConfig.mjs` |
| Memory + Supabase amendment repository | `amendmentRepository.mjs` |
| Public review-request service | `reviewRequestService.mjs` |
| Public review-request routes | `reviewRequestRoutes.js` |
| Studio amendment + comparison service | `amendmentStudioService.mjs` |
| Studio review/amendment routes | `amendmentRoutes.js` |
| Additive unapplied migration | `eliteos_digital_estimate_amendment_v1.sql` |
| Atomic re-publication RPC | `digital_estimate_publish_amendment_atomic` |
| Public UI review panel | `app-digital-estimate` ConfigurationView |
| Studio review queue | `app-elite100-estimate-studio` ReviewWorkspace |
| Tests | `phaseDe2f.test.mjs`, `phaseDe2f.ui.test.mjs` |

**Not shipped:** legal acceptance, signature, sold, payment, outbound email/SMS, Quote Library writes, `quote_headers` revision, IE import, Moraware/QB/Monday, Takeoff changes, production handoff, DE.2G deployment, migration apply, flag enablement.

---

## 2. Review-request semantics (explicit nonacceptance)

Customer action labels:

- “Send selections for review”
- “Request an updated estimate”
- “Your selections were sent to your estimator”
- “This is not an order or acceptance”
- “Pricing and availability remain subject to estimator review”

The action **only** freezes an immutable review-request snapshot for estimator review. It does **not**:

- accept / approve / sign / purchase / sell
- send email
- publish a Digital Estimate
- replace tokens
- revise Internal Estimate / Quote Library
- invoke Takeoff

---

## 3. Immutable review request

After create, freeze fields cannot change:

- publication / envelope / version
- selection + calculation identities and fingerprints
- baseline / configured display totals + display delta
- customer-safe selected options
- customer note
- request timestamp / fingerprint

Later session selection changes **do not rewrite** the prior request. Customer UI shows `currentSelectionsDifferFromSubmitted` and requires save/recalc before a new request under policy (identical open fingerprint is reused).

---

## 4. Public APIs

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/public-digital-estimate/v2/review-requests` | Session cookie + Origin; freeze request; customer-safe confirmation |
| GET | `/api/public-digital-estimate/v2/review-requests/current` | Customer-safe status only |

No public amendment or publication routes.

---

## 5. Studio queue + comparison

Navigation: **Publications** | **Customer review requests** (Studio only; not IE/QL).

Detail workspace includes:

- request identity + immutable notice
- structured baseline vs requested rows
- internal totals (estimator) vs customer-safe totals (separated)
- plain-text customer note
- private internal notes
- decisions: start review, amendment draft, clarification, close without amendment

---

## 6. Amendment model

States: `amendment_draft` → `amendment_validating` / `amendment_ready` → `amendment_published` (also superseded/cancelled/failed).

Review states: `review_requested`, `estimator_reviewing`, `clarification_required`, `amendment_prepared`, `updated_estimate_published`, `review_closed`, `review_superseded`.

Draft edits allowed only before publish. Locked measurements are **not** editable in this workspace. DE.2C validates amendment selections. Published snapshots are immutable; further edits require a new draft/version.

---

## 7. Re-publication atomicity

Memory: mutex + full restore of DE + configuration + amendment dumps on failure.  
Postgres: single `digital_estimate_publish_amendment_atomic` (service_role, fixed `search_path`).

Atomically:

1. validate amendment / calculation evidence  
2. freeze amendment  
3. supersede prior active publication + revoke tokens  
4. revoke prior configuration sessions  
5. create replacement publication + snapshot + hash-only token  
6. mark review `updated_estimate_published`  
7. append safe events  

Does **not** write `quote_headers`. Source type: `digital_estimate_amendment` (not a new IE revision).

---

## 8. Replacement link + old session behavior

- Raw token returned **once** to Studio: `https://digital.eliteosfab.com/e#<token>` (`HEAD_URL_DIGITAL_ESTIMATE`)
- Copy → `replacement_link_copied` / publication `link_copied`
- No automated email
- Old token → generic unavailable; old sessions cannot resume/calculate
- No redirect from old token to new token
- Studio shows supersession via prior publication status

---

## 9. Flags (all default off)

| Flag | Default |
|------|---------|
| `DIGITAL_ESTIMATE_REVIEW_REQUESTS_ENABLED` | `0` |
| `DIGITAL_ESTIMATE_AMENDMENTS_ENABLED` | `0` |
| `VITE_DIGITAL_ESTIMATE_REVIEW_UI_ENABLED` | `false` |
| `VITE_ELITE100_ESTIMATE_STUDIO_REVIEW_UI_ENABLED` | `false` |

Server flags are authoritative. No real user grants in this phase.

---

## 10. Migration order (do not apply yet)

1. `eliteos_digital_estimate_v1.sql`  
2. `eliteos_digital_estimate_configuration_v1.sql`  
3. `eliteos_digital_estimate_public_configuration_v1.sql`  
4. `eliteos_digital_estimate_amendment_v1.sql`

---

## 11. Exact next phase

**DE.2G — Private synthetic deployment** (controlled Studio/public pilot wiring, still no real-customer production cutover unless separately approved). Do not start DE.2G until this phase is reviewed.
