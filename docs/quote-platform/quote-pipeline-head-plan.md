# Quote Pipeline Head — plan

## 1. Purpose

Give **sales, managers, and admins** a single place to **review and work quote leads** created from **every quote entry path** (public consumer, internal, partner). All paths persist into the **same** `quote_headers` and related tables — this head is a **read + light workflow** surface, not a separate quote silo.

## 2. Who uses it

| Audience | Typical access |
|----------|------------------|
| **Sales reps** | `sales` role + **`sales` head** in `user_head_access`. Sees quotes assigned to them (matched `sales_rep` / customer email heuristics) until tighter identity mapping exists. |
| **Sales managers / executives** | `executive` (or `admin`) — sees **all** quotes in the pipeline APIs. |
| **System administrators** | Same pipeline UI from **System Admin** for support; admin bypasses head checks. |

**TODO:** Introduce an explicit `sales_manager` role or permission bit so “see all” does not rely solely on `executive`.

## 3. How entry heads feed one pipeline

- **Public** — `POST /api/public-quote/submit-measurements` → `quote_headers` (`quote_source = public_consumer`), `quote_submission_payloads`, `quote_lead_assignments`, `quote_forecast_events`, optional Monday log.
- **Internal / partner (authenticated)** — `POST /api/quote/submit` (and future dedicated routes) → same `quote_headers` with their `quote_source` values.

The Pipeline **GET** list reads **`quote_headers`** only; enrichment joins **`quote_monday_sync_log`** and **`quote_lead_assignments`** for display.

## 4. Backend routes (authenticated)

Mounted from `backend-core/src/quotes/quotePipelineApi.js` (via `quoteRoutes.js`).

| Method | Path | Notes |
|--------|------|--------|
| GET | `/api/quotes/pipeline/summary` | Metrics for current filter set (open value, new today/week, public/partner value split, averages, follow-up heuristic). |
| GET | `/api/quotes/pipeline` | Filtered list + latest Monday row + latest assignment summary per quote. |
| GET | `/api/quotes/pipeline/:id` | Header + payloads + timeline-related tables. **Non–admin/executive** users get **redacted** `calculation_snapshot` / empty `line_items` for non–`public_consumer` sources. |
| GET | `/api/quotes/pipeline/:id/timeline` | Merged chronological events. |
| PATCH | `/api/quotes/pipeline/:id/status` | Allowed statuses: `lead_submitted`, `reviewing`, `contacted`, `quoted`, `won`, `lost`, `archived`. Writes `quote_status_history` when present; logs `eos_action_log` when present. |
| PATCH | `/api/quotes/pipeline/:id/assign` | Manual `sales_rep`, `sales_rep_email`, `branch`; inserts `quote_lead_assignments` with `assignment_source = manual`. |

**Auth stack:** `requireAuth` → `requireRole(admin|executive|sales|finance|marketing)` → **`requireHeadAccess("sales")`**. Admins bypass head checks.

## 5. Tables read / written

| Table | Read | Write (pipeline) |
|-------|------|------------------|
| `quote_headers` | ✓ | status PATCH, assign PATCH |
| `quote_submission_payloads` | ✓ | — |
| `quote_status_history` | ✓ | status PATCH (optional) |
| `quote_lead_assignments` | ✓ | assign PATCH |
| `quote_forecast_events` | ✓ | — |
| `quote_monday_sync_log` | ✓ | — |
| `quote_line_items` / `quote_rooms` | ✓ | — |
| `eos_action_log` | ✓ | status / assign PATCH (optional) |

## 6. Status workflow

Recommended progression: `lead_submitted` → `reviewing` → `contacted` → `quoted` → `won` | `lost` | `archived`.

Existing quotes may still use `draft` / `submitted` from earlier flows; filters allow any status.

## 7. Territory assignment relationship

**Territories** (`quote_sales_territories`) drive **initial** rep/branch on **public** submit (`assignSalesRepForPublicQuote`). **Manual reassignment** in the Pipeline PATCH updates the header and appends a **`quote_lead_assignments`** row — it does not delete prior territory rows.

Territory **admin** CRUD remains under **Pricing Admin** (`/api/admin/quote-sales-territories`).

## 8. Monday sync visibility

Pipeline list shows the **latest** `quote_monday_sync_log` status per quote when the table exists. Item/board ids on the header power an **“Open Monday pulse”** link in the UI (generic `monday.com` URL shape; no tokens).

## 9. Future analytics

- Bid/close ratio, quote value by source / rep / branch, aging, won/lost rate — reuse `quote_headers` + `quote_forecast_events` + status history; add scheduled rollups or materialized views when volume warrants.

## 10. UI surfaces

- **`app-sales`** — “Quote pipeline” tab (primary sales-facing entry).
- **`app-system-admin`** — “Quote pipeline” nav entry for admins (same component pattern).

Both call the same backend routes with the user’s bearer token.
