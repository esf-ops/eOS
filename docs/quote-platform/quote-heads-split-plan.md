# Quote heads split plan (Vite apps + shared modules)

**Goal:** eliteOS treats **Public Quote** and **Internal Estimate** as **separate heads** (separate deployable surfaces). They share measurement/pricing **logic** via imports from `app-quote/src/lib` (and Brain APIs), but **must not** ship combined “public + internal” UX in the public bundle.

**Today (repo):**

| Head | Package | Users | Auth | APIs |
|------|-----------|-------|------|------|
| **Public Quote Head** | `app-quote/` | Homeowners / retail web | None (public) | `POST /api/public-quote/calculate`, `POST /api/public-quote/submit-measurements` |
| **Internal Estimate Head** | `app-internal-estimate/` | Elite staff | Supabase session + Brain **`requireAuth` + `requireHeadAccess`** on internal routes | `POST /api/internal-quotes/calculate`, `POST /api/internal-quotes/save`, `GET /api/internal-quotes`, `GET /api/internal-quotes/:id`, `PATCH /api/internal-quotes/:id`, `POST /api/internal-quotes/:id/duplicate` |

**Rule:** Do **not** copy `quoteCalculator.js` into any frontend. All heads call **`backend-core`** APIs.

**Decision:** Public Quote Head and Internal Estimate Head are separate heads. Internal Estimate requires login and **must not** be exposed through the public quote app (`app-quote` ships **public-only** UI; internal lab files were removed from `app-quote`).

---

## Shared components and modules

`app-internal-estimate` uses Vite `resolve.alias` to `@quote-lib/*` and `@quote-ui/*` pointing at `app-quote/src/lib` and selected `app-quote/src/ui` (e.g. `RoomScopeBuilder`). This avoids duplicating pure math/types until a dedicated shared package exists.

**Never share into public bundles:** service keys, Monday tokens, wholesale-only response shaping, or internal-only controls.

---

## Backend routes per head

| Head | Calculate | Persist / library |
|------|-----------|-------------------|
| **Public** | `POST /api/public-quote/calculate` (no auth) | `POST /api/public-quote/submit-measurements` (no auth v1; rate-limit + CAPTCHA TBD) |
| **Internal** | `POST /api/internal-quotes/calculate` (auth + head access) | `POST /api/internal-quotes/save`, list/get/patch/duplicate on `/api/internal-quotes*` |

Legacy **`POST /api/quote/submit`** may remain for older demos; new heads should prefer **source-specific** routes.

---

## Monday boards (env vars)

| Quote source | Env key for board ID |
|--------------|----------------------|
| `public_consumer` | `MONDAY_PUBLIC_QUOTES_BOARD_ID` (and public column envs) |
| `internal_quote` | `MONDAY_INTERNAL_QUOTES_BOARD_ID` and **`MONDAY_INTERNAL_COL_*`** only |

Sync is **logged** in `quote_monday_sync_log` with `skipped_missing_config` when vars or token are absent. Internal sync **must not** read public Monday column IDs for internal-sourced rows.

---

## Phasing

1. **Done:** Backend public + internal APIs; internal Monday routing with `MONDAY_INTERNAL_*`; public Monday unchanged for public submissions.
2. **Done:** `app-internal-estimate` scaffold; internal UI removed from `app-quote` source tree.
3. **Future:** Dedicated `@eliteos/quote-shared` package; optional **`app-partner-quote`** head; Pricing Admin surfaces in System Admin.

**Launcher:** Staff discover **Public Quote** vs **Internal Estimate** URLs from **`app-home`** after sign-in; deployment URLs are configured on the Brain (`HEAD_URL_*`) and mirrored as optional Vite fallbacks (`VITE_HEAD_URL_*`). See `docs/eliteos/domain-routing-plan.md`.
