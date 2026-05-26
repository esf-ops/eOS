# Sales KPI History — plan + KPI v1 implementation

**Last updated:** 2026-05-27

---

## Status summary

| Area | Status |
|------|--------|
| KPI v1 backend endpoint (`GET /api/sales/kpi-v1`) | **Live** |
| Quote Library pipeline rollup | **Live** (quote count, value, avg, period trend) |
| Moraware production actuals rollup | **Live** (worksheet sqft, job count — where prepared facts exist) |
| Partner Quote pipeline | **Planned / Future** |
| Historical workbook import | **Future / manual** — not yet built |
| `sales_kpi_snapshots` snapshot tables | **Planned** (see §5) |

---

## 1. Purpose

The eliteOS Sales Dashboard is the **combined leadership view** for:

- **Historical KPI performance** (multi-year, multi-grain)
- **Current Moraware production / sales facts**
- **Quote pipeline momentum** from Quote Library
- **Future Partner Quote pipeline**
- **Data trust / attribution readiness**

KPI History must communicate **where each number came from** and **how trustworthy it is**, not invent
composite metrics.

---

## 2. Source-of-truth principle

| System         | Owns                                                            |
|----------------|-----------------------------------------------------------------|
| Moraware       | Production / work facts (installed sqft, templates, jobs, etc.) |
| Quote Library  | Internal estimate / quote facts (count, value, status)          |
| Partner Quote  | Partner / dealer quote facts (count, value, pipeline cohorts)   |
| Sales Head     | Explains and compares those facts. Does **not** mutate them.    |

Composite KPIs (anything that blends Moraware + Quote Library facts) must be **explicitly defined** before
they are rendered.

---

## 3. KPI v1 — what was actually built

### Backend: `GET /api/sales/kpi-v1`

Added to `backend-core/src/sales/salesHead.js`. Same auth chain as all Sales Head routes:
`requireAuth → requireRole(SALES_API_ROLES) → requireHeadAccess("sales")`.

**Query parameters:**
- `start_date` (YYYY-MM-DD, default: current year Jan 1)
- `end_date` (YYYY-MM-DD, default: today)
- `grain` (`week` | `month`, default: `month`)

**Response shape:**
```json
{
  "ok": true,
  "range": { "start_date": "...", "end_date": "...", "grain": "month" },
  "freshness": {
    "moraware_last_success": "...",
    "quote_last_updated": "...",
    "generated_at": "..."
  },
  "trust": {
    "attribution_status": "company_wide_available_branch_rep_gated",
    "branch_rep_gated": true,
    "protected_mapping_rules_enforced": true,
    "note": "Branch/rep attribution is gated by approved Sales Account Mapping..."
  },
  "quote_pipeline": { "source": "quote_library", "trust": "customer_display_total_preferred", "periods": [...], "totals": {...} },
  "moraware_actuals": { "source": "moraware_prepared_facts", "trust": "company_wide_actuals", "periods": [...], "totals": {...} },
  "partner_quote": { "source": "partner_quote", "status": "planned", "note": "..." },
  "notes": [...]
}
```

### Quote Library KPI facts

- **Source:** `quote_headers` table
- **Filters:** `archived_at IS NULL`, `is_current_revision = true`, `created_at` in date range, `organization_id`-scoped
- **Quote value rule:** Uses `calculation_snapshot.internal_ui.customer_display_total` (customer-facing
  estimated project total) when available; falls back to `grand_total` for older quotes that predate the
  `customer_display_total` field. This matches the Quote Library display behavior (§33 of FEATURE_DECISIONS.md).
- **Date basis:** `created_at` (internal estimate creation timestamp). No `quote_date` or `sent_at` column
  exists on current schema.
- **Metrics returned:** quote count, customer_quote_value (sum), average_quote_value, CDT vs GT fallback
  counts, status breakdown (sent/sold/lost pattern-matched), per-period trend.

### Moraware production KPI facts

- **Source:** `sales_moraware_job_facts` (prepared facts, latest complete import group), via
  `fetchLatestPreparedSalesJobFacts` + `buildCompanyWideSqftActuals` — the same functions used by the
  existing Sales Dashboard foundation handler.
- **Date basis:** `created_at_source` fallback `modified_at_source` (same as current Sales Dashboard).
- **Metrics returned:** worksheet sqft, job count, jobs with sqft, sqft coverage %, average sqft per job.
- **Not available in current data:** template count, installed sqft — returned as `null` with a
  `not_available_in_current_data` note, never faked as 0.
- **If no prepared facts:** returns `extraction_status: "not_available"` with reason; not a crash.

### Trust and attribution guardrails

- Branch/rep/account attribution is **always gated** by approved Sales Account Mapping.
- Company-wide totals are returned before mapping coverage is high; split totals are not.
- `protected_mapping_rules_enforced: true` is always set in the trust block.
- No hardcoded customer/account names appear in the visible trust copy or API response.
- The Blackstone guardrail is preserved in `salesAttribution.js` backend logic and in
  `morawareSqftActuals.js` production bucket notes; it does **not** appear as static visible
  dashboard copy (generic attribution language is used instead).

### Frontend: `KpiV1Panel.tsx`

Replaces the static `KpiHistoryScaffold` as the primary render in the `kpi_history` tab.

- Date range controls (start/end/grain) with a Refresh button.
- Top stat cards: Quote count, Quote value (CDT preferred), Avg quote value, CDT/GT breakdown;
  Worksheet sqft, Job count, Jobs with sqft, Avg sqft/job; Partner Quote "Planned" section.
- Attribution/guardrail notice bar (generic language — no hardcoded account names).
- Period trend tables for Quote Library and Moraware.
- Source/freshness/trust panel.
- Collapsible "KPI architecture plan" section that shows the original `KpiHistoryScaffold`
  (planning + future tables) for reference.
- "Not available" shown clearly when an API metric is absent — never 0 or fake.
- Partner Quote shown as Planned, not shown as live.

### Tests: `verifySalesKpiV1.mjs`

34 tests covering:
- `pickKpiCdtValue` — CDT preferred, GT fallback, zero/negative handling
- `periodBucketForKpi` — monthly and weekly bucketing, edge cases
- `buildQuotePipelineResult` — correct counts, sums, CDT vs GT attribution, empty periods
- Attribution guardrails — `branch_rep_gated = true`, no hardcoded account names in trust copy

---

## 4. Data trust + guardrails (binding, unchanged)

Every KPI rendered in Sales Head must carry:

1. **Source label** — Moraware, Quote Library, Partner Quote, or `manual_import`
2. **Freshness** — latest sync time / rollup time
3. **Trust class** — `production`, `preview`, `planning`, or `manual_import`

Hard rules (binding):

- Frontend never calculates production / pipeline KPI totals from raw payloads — backend prepared rollups
  own the math.
- **Branch / rep / account attribution** remains gated by approved **Sales Account Mapping**. Company-wide
  totals may surface before mapping coverage is high; split totals may not.
- **Blackstone guardrail preserved.** Blackstone does **not** default to Dyersville. This rule survives any
  new KPI rollup unless Chris explicitly approves a mapping change. The guardrail lives in backend
  attribution code and docs/tests — not in static visible dashboard copy.
- Moraware and Quote Library facts are not blended blindly.
- Unavailable metrics show "Not available" with a reason — never 0 or a fake value.
- No hardcoded customer/account-specific names in visible Sales Dashboard static copy. Generic
  attribution language is used instead.

---

## 5. Suggested future data model (planning only — no migrations in this pass)

```
[ Moraware ]        [ Quote Library ]       [ Partner Quote (future) ]
     │                     │                          │
     ▼                     ▼                          ▼
brain_moraware_*    quote_headers /          partner_quote_*  ←  future heads
moraware_raw_*      forecast events
     │                     │                          │
     └───── prepared rollups (per-org, period-grain) ─┘
                              │
                              ▼
                ┌────────────────────────────┐
                │  sales_kpi_snapshots       │
                │  sales_kpi_metric_def…     │
                │  sales_kpi_targets         │
                │  sales_kpi_notes           │
                └──────────────┬─────────────┘
                               ▼
                       Sales Head (read-only)
```

### Planned tables (NOT created in this pass)

| Table                                | Role                                                                                                   |
|--------------------------------------|--------------------------------------------------------------------------------------------------------|
| `sales_kpi_metric_definitions`       | Catalog of named KPIs (id, source, unit, trust class, description)                                     |
| `sales_kpi_snapshots`                | `(organization_id, metric_id, period_grain, period_start, value, source, computed_at, trust_class)`    |
| `sales_kpi_targets`                  | Admin-edited quotas/targets per metric+period+branch/rep — never auto-inferred from production facts   |
| `sales_kpi_notes`                    | Founder/operator notes attached to (metric_id, period)                                                 |
| `weekly_quote_pipeline_rollups`      | Prepared Quote Library facts: per-week count/value/status by source (internal / public / partner)      |
| `moraware_production_kpi_rollups`    | Prepared Moraware facts ready for Sales Head consumption without re-scanning raw payloads              |

All planned tables would carry `organization_id` (org-scoped) and be readable only via backend APIs that enforce
role + sales-head access.

---

## 6. What was built vs. what is still planned

### Built in this pass (KPI v1)

- `GET /api/sales/kpi-v1` endpoint (source-labeled, freshness-labeled, trust-labeled)
- Quote Library pipeline rollup (count, value using CDT, avg, period trend, status breakdown)
- Moraware production actuals rollup (sqft, job count, period trend where prepared facts exist)
- `KpiV1Panel.tsx` replacing the static scaffold as the primary KPI History tab render
- Stat cards, period tables, attribution/trust/freshness panel, collapsible planning scaffold
- `verifySalesKpiV1.mjs` — 34 pure-function tests

### Still planned / not built

- `sales_kpi_snapshots` migration + writer
- KPI editing UI (targets, notes)
- Partner Quote data fetch
- Template count / installed sqft (not yet available in prepared facts)
- Branch / rep split KPIs (gated until approved mapping coverage is high)
- Historical KPI workbook import (see §7)
- Backfill scripts for historical periods

---

## 7. Historical KPI workbook mapping notes

An Excel workbook (`ESF KPI Tracking __ All Locations.xlsx`) was available as reference. It was inspected
as **reference only** — no values were imported into production; no workbook rows were hardcoded into
the KPI v1 endpoint or UI.

Likely workbook → system mappings (for a future controlled import pass):

| Workbook column / concept | Planned system field |
|---------------------------|---------------------|
| Weekly quote count | `quote_headers` count grouped by `created_at` week |
| Weekly quote value | `customer_display_total` sum grouped by `created_at` week |
| Monthly installed sqft | `sales_moraware_job_facts.worksheet_sqft` sum by month |
| Production report sqft | To be aligned with `buildProductionReportReconciliation` date basis |
| Goals / targets | Future `sales_kpi_targets` table (admin-edited, never auto-inferred) |
| Branch / location splits | Future, gated by approved Sales Account Mapping |

A future controlled import pass should:
1. Map workbook column names to `sales_kpi_metric_definitions` metric IDs.
2. Import rows with `source = "manual_import"` and an explicit import note.
3. Never overwrite normalized facts for the same period.
4. Never blend silently with live Moraware / Quote Library facts.

---

## 8. Path to full KPI live

1. ✅ KPI v1 read-only rollup from existing data — **done in this pass**
2. Define `sales_kpi_metric_definitions` rows for the v1 set (installed sqft week, quote value week, etc.)
3. Land additive `sales_kpi_snapshots` migration + writer that consumes Moraware prepared facts and
   Quote Library facts.
4. Optionally replace the live `kpi-v1` endpoint with snapshot-backed reads for performance.
5. Layer in targets, notes, and partner pipeline cards as those heads come online.

---

## 9. Related docs

- `docs/eliteos/SYSTEM_BLUEPRINT.md` — Sales Head section
- `docs/eliteos/CURRENT_SYSTEM_MAP.md` — backend `/api/sales/*` routes
- `docs/eliteos/moraware-sync-foundation.md` — Moraware prepared facts
- `docs/eliteos/FEATURE_DECISIONS.md` §24 — Sales Dashboard vertical slice + Sales Account Mapping
  (Blackstone guardrail origin)
- `docs/eliteos/FEATURE_DECISIONS.md` §32 — Sales Head joined the protected-head shell + KPI History
  scaffold
- `docs/eliteos/FEATURE_DECISIONS.md` §33 — Quote Library customer_display_total rule
- `docs/eliteos/FEATURE_DECISIONS.md` §35 — Sales KPI v1 decision (this pass)
