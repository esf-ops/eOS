# Digital Estimate — Do Not Touch

**Purpose:** Hard isolation boundaries for Phase DE.1+ implementers.
**Date:** 2026-07-15 (DE.0)

---

## 1. Existing quote workflows that remain unchanged in DE.1

| Area | Path / surface | Rule |
|------|----------------|------|
| Internal Estimate save/calculate | `app-internal-estimate/**`, `/api/internal-quotes/*` | **No Digital Estimate employee UI** (DE.1.1). Do not change save modes, revision math, or PATCH policy |
| Quote Library workflow | `app-quote-library/**`, `/api/quote-library/*` | **No DE timeline integration during stealth** (DE.1.1). No status-model rewrite |
| Elite 100 Estimate Studio | `app-elite100-estimate-studio/**`, `/api/elite100-estimate-studio/*` | Private pilot only; do not grant via role defaults or VITE flags |
| Public Digital Estimate | `app-digital-estimate/**` | Customer portal only — never register in employee launcher |
| Interactive configuration (DE.2+) | future tables under digital estimate config model | **Do not** mutate `quote_headers`, publication snapshots, Takeoff, or live `calculateQuote()` semantics without an explicit phase |
| Pricing Admin → `calculateQuote` cutover | `pricingConfigResolver.js` | **Forbidden** without parity tests + explicit approval (DE.2A) |
| Partner Quote | `app-partner-quote/**`, `/api/partner-quote/*` | Out of scope |
| Custom Quote | `app-custom-quote/**`, `/api/custom-quotes/*` | Out of scope |
| Quote Pipeline | `/api/quotes/pipeline*` | Out of scope |
| Monday sync | `mondayQuoteSync.js` | Do not require Monday for publish |

---

## 2. Non–Elite 100 behavior

- Do not change wholesale/partner/custom pricing paths to “support” digital estimate.
- Publish eligibility must **fail closed** for non–Elite 100 / non-`internal_quote` until a later phase explicitly expands.
- Do not migrate historical public_consumer leads into digital estimate publications.

---

## 3. Current PDF / email delivery

| Path | Rule |
|------|------|
| `backend-core/src/quoteDelivery/**` | **Do not change send/preview behavior** in DE.1 |
| Resend / `emailClient.js` | No automated digital-estimate email |
| Customer print HTML/PDF builders | May **import/reuse** for print rendering; do not alter email templates or delivery gates |

PDF remains available as today’s printable path; DE.1 adds a parallel link experience.

---

## 4. Pricing authority

| Path | Rule |
|------|------|
| `quoteCalculator.js` | **Do not edit** for DE.1 features |
| `pricingConfigResolver.js` / Pricing Admin cutover | Out of scope |
| Public digital-estimate GET | **Must not** call `calculateQuote` |
| Publish default | Freeze **saved** snapshot — do not silent-reprice |

---

## 5. Existing quote API contracts

Do not break request/response shapes for:

- `/api/internal-quotes/*`
- `/api/quote-library/*`
- `/api/public-quote/*`
- `/api/quote/calculate`, `/api/quote/submit`
- `/api/quote-delivery/*`

New contracts live only under `/api/digital-estimate/*` and `/api/public-digital-estimate/*`.

---

## 6. Takeoff / Intake boundaries

| Path | Rule |
|------|------|
| `app-ai-takeoff/**` | Do not modify for DE.1 |
| `backend-core/src/takeoff/**` | Do not modify |
| `backend-core/src/quoteIntake/**` | Do not modify |
| `docs/quote-intake-lab/**` | Do not rewrite as part of DE |
| `POST /api/internal-quotes/import-from-takeoff` | Do not call from digital estimate |

See also `docs/quote-intake-lab/DO_NOT_TOUCH.md`.

---

## 7. External integrations

| Integration | Rule for DE.1 |
|-------------|----------------|
| Moraware | No writes; no handoff automation |
| QuickBooks | No writes |
| Monday | No required sync for publish |
| Microsoft Graph / mailbox | No coupling |
| Gemini / Exayard | No coupling |

---

## 8. Explicit prohibitions for DE.1

1. No customer configuration / cart / recalculation in the browser.
2. No acceptance or e-signature.
3. No automated outbound email of the digital link.
4. No tokens stored in plaintext.
5. No public listing or UUID-guessable quote URLs.
6. No reuse of internal quote API responses as the public DTO.
7. No putting access tokens on `quote_headers`.
8. No giant status column merging publish/view/sold into `quote_status`.
9. No browser service-role or direct Supabase reads of publication tables.
10. No commits, pushes, deploys, migration applies, or production flag enables unless explicitly requested.
11. No drive-by refactors of quote math, delivery, or intake.
12. No beginning DE.2+ in the same change set as DE.1.

---

## 9. Allowed additive surfaces (DE.1)

- `backend-core/src/digitalEstimate/**` (new)
- `backend-core/supabase/eliteos_digital_estimate_v1.sql` (new)
- `app-digital-estimate/**` (new)
- Thin Publish/Revoke/Copy UI in Internal Estimate (flagged)
- Docs under `docs/digital-estimate/**`
- Single Brain mount + CORS/`HEAD_URL_DIGITAL_ESTIMATE` wiring
