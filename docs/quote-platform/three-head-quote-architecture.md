# Three-head quote architecture

**Branch context:** `feature/quote-platform-foundation`  
**Principle:** **Three heads. One quote brain.** Different UX and permissions; shared Supabase data model, backend calculator, snapshots, Monday sync log, and forecast analytics.

This document is the **product and platform contract** before Cloudflare/Vercel deployment. It does **not** replace per-head UX specs; it aligns engineering, admin, and go-to-market on **who uses what** and **what must never leak across trust boundaries**.

---

## 1. Product split

### 1.1 Public Consumer Quote Tool

- **Audience:** Homeowners and remodelers who need a **planning estimate**, not a wholesale worksheet.
- **Trust boundary:** **Public-safe totals only.** No wholesale, no protected partner economics, no internal rate tables in responses.
- **Measurement:** Guided, simple questions (sink/cooktop/splash/tear-out, etc.). **No requirement** to pick a material price group before measuring; the system estimates **every** standard material tier for comparison.
- **Submit:** **“Submit measurements”** (lead), not “Submit quote” as a final contractual quote. Creates a **lead** in Supabase and stages Monday on the **Public Quotes** board when configured.
- **Pricing:** Backend applies **minimum 25% dealer/partner protection** on public-facing numbers relative to wholesale-style economics used internally by the calculator.

### 1.2 Internal Quoting Tool

- **Audience:** Elite staff (sales, estimating, operations).
- **Trust boundary:** May show **internal / protected** math and line detail **subject to role** (enforced in app + RLS policies over time).
- **Measurement:** **Fast path** — direct sq ft / add-ons, branch, salesperson, customer/account/source. Room-by-room and future AI takeoff attach here.
- **Submit:** Full **internal quote** record; Monday **Internal Quotes** board (or equivalent); forecast events for pipeline analytics.

### 1.3 Partner Quoting Tool

- **Audience:** Authenticated partners (dealers, builders, designers) with **assigned** pricing structures.
- **Trust boundary:** **Partner-safe** presentation — not the same as public homeowner UI, and not unconstrained internal wholesale view unless policy allows.
- **Measurement:** Guided tools, room-by-room, and future takeoff/visual flows as rolled out.
- **Submit:** Quote tied to **partner account** and assignment; Monday **Partner Quotes** (or account-specific board); history per partner.

### 1.4 Pricing Admin / Quote Catalog Admin Head

- **Audience:** Authorized admins (System Admin / dedicated Pricing Admin head when split).
- **Purpose:** **Pricing authority in data**, not in code: structures, rules, catalog items, partner assignments, visibility, future effective dating.
- **Rule:** Changes to rates, cutouts, trip fees, template/install fees, public retail markup floor, and partner structures must be possible **without redeploying** consumer or partner apps.

---

## 2. Shared backend services (single “quote brain”)

| Service | Role |
|--------|------|
| **`quoteCalculator.js`** | Authoritative calculation from inputs + resolved pricing structure and rules; builds immutable snapshots. |
| **`quoteAnalytics.js`** | Read models over `quote_headers` / events for pipeline and KPIs. |
| **`mondayQuoteSync.js`** | **Server-side only** — builds payload, writes `quote_monday_sync_log`, and optionally **creates a Monday item** via GraphQL when `MONDAY_API_TOKEN` and the board ID env for the quote source are set. See **`docs/quote-platform/monday-public-quotes-setup.md`**. |
| **`quotePricingAdminApi.js`** | Admin CRUD for structures, rules, partners, assignments; extends toward source configs and territories. |
| **Future: AI takeoff services** | Ingest plans → measurement candidates → review workflow; writes `quote_measurement_sources` / takeoff tables. |
| **Future: Visualize / layout services** | Layout tied to quote scope; `quote_visual_layouts` and related tables. |

All heads call **the same HTTP APIs** (with different auth requirements), not forked calculators in the browser.

---

## 3. Shared Supabase tables (conceptual model)

Existing / planned (names align with `eos_quote_platform.sql` and follow-on migrations):

| Area | Tables |
|------|--------|
| **Quote core** | `quote_headers`, `quote_line_items`, `quote_rooms`, `quote_files`, `quote_status_history`, `quote_calculation_audit` |
| **Forecast** | `quote_forecast_events` |
| **Monday** | `quote_monday_sync_log` |
| **Pricing** | `quote_pricing_structures`, `quote_pricing_rules` |
| **Partners** | `quote_partner_accounts`, `quote_partner_pricing_assignments` |
| **Catalog / programs** | `quote_catalog_*` (see `eos_quote_catalog_schema.sql`), future shower program rows |
| **Takeoff / visual** | `quote_takeoff_*`, `quote_visual_layouts`, `quote_measurement_sources` |
| **Source / territory (additive)** | `quote_source_configs`, `quote_sales_territories`, `quote_lead_assignments`, `quote_submission_payloads` |

`quote_headers.quote_source` distinguishes **`public_consumer`**, **`internal_quote`**, **`partner_quote`**, and legacy values (e.g. `partner_portal`, `public_retail`) during migration.

---

## 4. Public Consumer Quote Tool — behavior

1. **No price group selection** before measuring; optional “preferred tier” may be added later as **display only**, not required for calculation.
2. Collect **contact**, **project location** (address/city/state/zip), **measurements**, **simple add-ons** (sink, cooktop, specialty, backsplash, tear-out, etc.).
3. Backend returns **estimates for every material price group** (Promo → F), each with **countertop**, **backsplash**, **add-on**, **total** — all **public-safe** (minimum **25%** protection applied consistently).
4. User **never** sees wholesale, protected partner rates, or internal structure identifiers in API responses intended for browsers.
5. Primary CTA: **Submit measurements** → creates **lead** (`quote_headers` with `public_consumer`, status such as `lead_submitted`), **`calculation_snapshot`**, **`quote_submission_payloads`**, **`quote_forecast_events`**, **`quote_lead_assignments`** (territory logic), Monday row **staged** to **Public** board env key.
6. **Sales assignment:** From **`quote_sales_territories`** (ZIP → city → county → branch → state → unassigned). Geocoding is a later enhancement.

---

## 5. Internal Quoting Tool — behavior

- Staff-first: **sq ft / add-ons**, salesperson, branch, customer fields.
- **Submit** → `internal_quote`, full quote rows, forecast event, Monday **Internal** board env.
- May expose wholesale / margin / math check **by role** in the dedicated head (not in public head).

---

## 6. Partner Quoting Tool — behavior

- Auth required; **pricing structure** from **assignment**, not arbitrary partner-picked internal codes.
- Guided + room-by-room; quote history by partner account.
- **Submit** → `partner_quote`, forecast, Monday **Partner** board env.

---

## 7. Pricing Admin / Quote Catalog Admin — behavior

- CRUD for **structures**, **rules**, **partner accounts**, **assignments**, **catalog** rows (as schema exists).
- **Visibility** metadata: `public_visible`, `partner_visible`, `internal_only`, `requires_review` (stored in rule/catalog `metadata` or dedicated columns as schema evolves).
- **Public retail** structures: DB constraint already requires **`retail_markup_percent` ≥ 25** for `pricing_mode = public_retail`; admin UI must warn clearly.
- **Test calculate** under a selected structure (admin-only) without affecting production quotes.

---

## 8. Cloudflare / Vercel readiness (non-deploy checklist)

- **No client-side secrets** — anon Supabase in browsers only where appropriate; **service role** only on server.
- **Environment variables** (document in runbooks, not committed): `SUPABASE_*`, Monday tokens and **per-board IDs** (`MONDAY_PUBLIC_QUOTES_BOARD_ID`, `MONDAY_INTERNAL_QUOTES_BOARD_ID`, `MONDAY_PARTNER_QUOTES_BOARD_ID`, fallback `MONDAY_QUOTES_BOARD_ID`), `MONDAY_API_TOKEN` when live calls are enabled.
- **Auth redirects:** Supabase Auth URLs for each deployed head origin.
- **Path separation:** Public consumer origin must not ship partner/internal bundles; until three Vite apps exist, **`app-quote` remains a labeled combined prototype** (see `quote-heads-split-plan.md`).

**Do not deploy** the public origin until public routes are verified safe and penetration-tested for information disclosure.
