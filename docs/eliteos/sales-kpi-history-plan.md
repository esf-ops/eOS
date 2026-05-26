# Sales KPI History — plan

**Status:** Planning only. No backend KPI engine, snapshot tables, or data fetch is implemented in this pass.
A read-only "KPI history" scaffold tab renders in Sales Dashboard so leadership can see the intended model and
source labels without any fake metrics being drawn.

**Last updated:** 2026-05-26

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

## 2. Source-of-truth principle

| System         | Owns                                                            |
|----------------|-----------------------------------------------------------------|
| Moraware       | Production / work facts (installed sqft, templates, jobs, etc.) |
| Quote Library  | Internal estimate / quote facts (count, value, status)          |
| Partner Quote  | Partner / dealer quote facts (count, value, pipeline cohorts)   |
| Sales Head     | Explains and compares those facts. Does **not** mutate them.    |

Composite KPIs (anything that blends Moraware + Quote Library facts) must be **explicitly defined** before
they are rendered.

## 3. Planned metric groups

### Moraware-fed (production KPIs)

- Installed square footage (weekly / monthly / quarterly / YTD)
- Template count + template activity
- Job count by production status
- Production process facts (rough, polish, install, etc.) where normalized
- Other production information from Moraware as it becomes synced/normalized
- Branch / rep splits **gated** by approved Sales Account Mapping

### Quote Library-fed (pipeline KPIs)

- Quote count by week / month
- Quote value (sum of grand totals) by week / month
- Sent / sold / lost status counts where available
- Average quote value
- Internal vs public-quote source splits
- Branch / rep splits **gated** by approved mapping

### Future Partner Quote-fed

- Partner quote count
- Partner quote value
- Dealer / builder pipeline cohort views
- Partner-vs-direct comparison

### Manual / historical imports

Allowed for years older than the normalized Brain tables. Must:

- Carry `source = manual_import`
- Carry an import note (who, when, why)
- Never overwrite normalized facts for the same period
- Never blend silently into live Moraware / Quote Library facts

## 4. Data trust + guardrails (binding)

Every KPI rendered in Sales Head must carry:

1. **Source label** — Moraware, Quote Library, Partner Quote, or `manual_import`
2. **Freshness** — latest sync time / rollup time
3. **Trust class** — `production`, `preview`, `planning`, or `manual_import`

Hard rules:

- Frontend never calculates production / pipeline KPI totals from raw payloads — backend prepared rollups own
  the math.
- **Branch / rep / account attribution** remains gated by approved **Sales Account Mapping**. Company-wide
  totals may surface before mapping coverage is high; split totals may not.
- **Blackstone guardrail preserved.** Blackstone does **not** default to Dyersville. This rule survives any
  new KPI rollup unless Chris explicitly approves a mapping change.
- Moraware and Quote Library facts are not blended blindly.

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

## 6. What we are deliberately not building yet

- KPI rollup engine
- KPI snapshot SQL/migrations
- KPI editing UI
- Partner Quote data fetch
- Backfill scripts for historical imports
- Live charts in Sales Head KPI history tab

The scaffold tab is **explanatory only** until backend prepared rollups exist.

## 7. Path to live

1. Define `sales_kpi_metric_definitions` rows for the v1 set (installed sqft week, quote value week, etc.).
2. Land additive `sales_kpi_snapshots` migration + writer that consumes Moraware prepared facts and Quote
   Library facts.
3. Add `GET /api/sales/kpi-history` (read-only, role-gated, org-scoped) returning labeled snapshots.
4. Replace the scaffold tab with live panels driven by that endpoint, preserving the same source / freshness /
   trust labeling pattern.
5. Layer in targets, notes, and partner pipeline cards as those heads come online.

## 8. Related docs

- `docs/eliteos/SYSTEM_BLUEPRINT.md` — Sales Head section
- `docs/eliteos/CURRENT_SYSTEM_MAP.md` — backend `/api/sales/*` routes
- `docs/eliteos/moraware-sync-foundation.md` — Moraware prepared facts
- `docs/eliteos/FEATURE_DECISIONS.md` §24 — Sales Dashboard vertical slice + Sales Account Mapping
  (Blackstone guardrail origin)
- `docs/eliteos/FEATURE_DECISIONS.md` §32 — Sales Head joined the protected-head shell + KPI History
  scaffold (this pass)
