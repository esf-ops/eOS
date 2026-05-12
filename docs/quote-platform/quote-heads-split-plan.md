# Quote heads split plan (Vite apps + shared modules)

**Goal:** Replace the single **`app-quote`** “everything demo” with **three production heads** plus **Pricing Admin** (already largely **System Admin** + `quotePricingAdminApi.js`). **`app-quote`** remains a **combined prototype / component lab** until each head is GA.

---

## Target applications

| App | npm / package dir | Primary users | Auth |
|-----|-------------------|---------------|------|
| **`app-public-quote`** | `app-public-quote/` | Homeowners | Optional anon; submit lead without staff login |
| **`app-internal-quote`** | `app-internal-quote/` | Elite staff | Supabase auth + staff roles |
| **`app-partner-quote`** | `app-partner-quote/` | Partners | Supabase auth + partner account linkage |
| **Pricing / catalog admin** | `app-system-admin/` (current) | Admins | Existing admin + head access |

**Rule:** Do **not** copy `quoteCalculator.js` into any frontend. All heads call **`backend-core`** APIs.

---

## Shared components and modules

Suggested shared package (future monorepo path — can start as copy-paste from `app-quote/src/lib`):

- **Measurement / types:** `measurementEngine`-style inputs, room draft types (or JSON schema shared from backend).
- **UI primitives:** cards, summary strip, method picker patterns — **not** business constants for prices.
- **API client:** thin wrappers for `/api/public-quote/*`, `/api/quote/*`, `/api/internal-quote/*`, `/api/partner-quote/*`, `/api/admin/quote-*`.

**Never share:** service keys, Monday tokens, wholesale-only response shaping in public bundle.

---

## Migration from `app-quote`

| Keep in lab (`app-quote`) | Move to **public** head | Move to **internal** head | Move to **partner** head |
|---------------------------|---------------------------|----------------------------|--------------------------|
| Guided homeowner presets | ✓ (simplified further) | — | ✓ (full parity optional) |
| Measurement preview copy | ✓ | partial | ✓ |
| Room-by-room builder | optional / link out | ✓ primary | ✓ |
| Math check / wholesale matrix | **remove** | ✓ | ✓ (partner-safe) |
| Material group **selector** before measure | **remove** | ✓ fast pick | ✓ (from assignment + override rules) |
| Partner retail % playground | — | ✓ internal | ✓ controlled |

---

## Backend routes per head

| Head | Calculate | Submit |
|------|-----------|--------|
| **Public** | `POST /api/public-quote/calculate` (no auth) | `POST /api/public-quote/submit-measurements` (no auth for v1; rate-limit + CAPTCHA TBD) |
| **Internal** | `POST /api/quote/calculate` (auth) or dedicated internal calculate later | `POST /api/internal-quote/submit` (auth) — scaffold → full |
| **Partner** | `POST /api/quote/calculate` (auth) | `POST /api/partner-quote/submit` (auth) — scaffold → full |
| **Admin** | `POST /api/admin/quote-test-calculate` (future) | N/A |

Legacy **`POST /api/quote/submit`** remains for existing demos; new heads should prefer **source-specific** routes.

---

## Monday boards (env vars)

| Quote source | Env key for board ID |
|--------------|----------------------|
| `public_consumer` | `MONDAY_PUBLIC_QUOTES_BOARD_ID` |
| `internal_quote` | `MONDAY_INTERNAL_QUOTES_BOARD_ID` |
| `partner_quote` | `MONDAY_PARTNER_QUOTES_BOARD_ID` |
| Legacy / fallback | `MONDAY_QUOTES_BOARD_ID` |

Sync is **logged** in `quote_monday_sync_log` with `skipped_missing_config` when vars or token are absent.

---

## Supabase writes per head (high level)

| Head | Typical writes |
|------|----------------|
| **Public** | `quote_headers` (lead), `quote_line_items` / `quote_rooms` as needed, `quote_forecast_events`, `quote_submission_payloads`, `quote_lead_assignments`, `quote_monday_sync_log` |
| **Internal / Partner** | Full quote graph + audit + forecast + Monday log |

---

## Phasing (recommended)

1. **Done / in progress:** Backend public calculate + submit-measurements; source config + territory tables; Monday board selection by source; docs.
2. **Next:** Scaffold Vite **`app-public-quote`** (minimal shell + public API only).
3. **Then:** Split internal/partner from `app-quote` by copying scope builder + math panels into gated heads.
4. **Ongoing:** Pricing admin routes + System Admin UI pages for territories and quote source config.

**Today’s decision:** Optional **`app-public-quote`** / **`app-internal-quote`** / **`app-partner-quote`** folders are **not required** to merge this architecture PR; **`app-quote`** carries clarifying copy until those apps exist.
