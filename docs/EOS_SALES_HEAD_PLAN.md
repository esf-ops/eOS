# eOS Sales Head (Performance Intelligence)

## Purpose

**Sales Head** is Elite’s internal **sales operating and performance intelligence** view. It answers:

- Which **attributed sales reps** are producing worksheet volume?
- Which **accounts** are growing or declining **year-over-year (YoY)**?
- Which **branch / location** is volume attributed to?
- Which accounts deserve **follow-up** (focus / decline watch)?
- How **cleanly** Moraware rows map to normalized reps vs **house / fallback / unknown**?
- How does the **current performance period** compare to the **prior-year-aligned** or **previous-length** window?

Principle unchanged: **Moraware records the work. eOS explains the work. The heads move the work.**

## Scope

- Standalone SPA: **`app-sales`** (`npm run eos:build:sales`, dev server port **5178**).
- **Brain-backed only** via **`backend-core`** — **no Moraware calls from the browser** and **no Moraware sync changes**.
- Authorization: **`requireAuth()`**, **`requireRole(SALES_API_ROLES)`**, **`requireHeadAccess("sales")`** (admin bypass unchanged).

## Data sources

- **`brain_jobs.worksheet_sqft`** — same Sq.Ft. rollup as Executive Head (**unchanged math**).
- Optional: **`brain_job_addresses`**, **`brain_fields`** for legacy row filters (city / material hints).

### Active salesperson model

Only these Moraware-exact names are **`active_rep`** when no account override applies:

- **Casey Schenke**
- **Thera McEnany**
- **Michael Joseph**

Other `salesperson_name` values remain **`morawareSalesperson`** on each row and are classified as **`house_account`**, **`fallback_moraware`**, or **`unknown`** (see `salesAttribution.js`).

### Branch / location attribution

Normalized **`branch`** for each job is one of:

- **Lisbon**, **Dyersville**, **Iowa City**, or **`Unmapped / Moraware only`**

Derived from **account override rules**, **Moraware “House Account - …” patterns**, **Skogman substring rule**, or **fallback**.

Rules are editable in **`backend-core/src/sales/salesAttribution.js`** (documented list also returned in the **Classification Rules** API panel).

### YoY account analysis

- **`GET /api/sales/performance-intelligence`** compares a **current window** vs a **prior window** (prior calendar year slice, prior YTD-aligned slice, or previous period of equal length).
- Account rows include **`yoySqft`**, **`yoyPct`**, **`focusFlag`** (`priorSqft >= 100` and **`yoySqft < 0`**).

### Classification rules & data quality

Each job carries (additive, non-destructive to Moraware):

- **`morawareSalesperson`** — raw Brain field
- **`normalizedSalesperson`** — dashboard attribution
- **`branch`**
- **`salespersonClass`**: `active_rep` | `house_account` | `fallback_moraware` | `unknown` | `other`
- **`classificationMethod`**: `user_override` | `exact_master_match` | `substring_rule` | `moraware_fallback` | `unknown` (reserved: `prior_dashboard`)
- **`classificationConfidence`**: `high` | `medium` | `low`
- **`classificationNote`**

The UI **Data Quality** tab and API **`classificationPanel`** summarize method mix, mapped vs unmapped volume share, and unknown counts.

### Focus account logic

**`focusFlag`** on account YoY: meaningful prior volume (**`priorSqft >= 100`**) and **negative** YoY change. Sorted by largest decline for “Focus Accounts”.

## API surface

### Legacy range endpoints (unchanged contracts)

| Route | Purpose |
| --- | --- |
| `GET /api/sales/summary` | KPIs + `compare` block |
| `GET /api/sales/salesperson-performance` | Moraware-name leaderboard |
| `GET /api/sales/account-performance` | Account rollup + dormancy |
| `GET /api/sales/trend` | Time buckets |
| `GET /api/sales/jobs` | Paginated jobs; optional **`attribution=1`** adds classification object per row |
| `GET /api/sales/filters` | Distincts + **additive** PI hints: `branches`, `activeSalesReps`, `performancePeriodModes`, etc. |
| `GET /api/sales/debug` | Counts / notes |

### Performance intelligence (additive)

**`GET /api/sales/performance-intelligence`**

**Period (`periodMode`)**

- `month_vs_prior_year_month` — `year`, `month` (1–12)
- `quarter_vs_prior_year_quarter` — `year`, `quarter` (1–4)
- `ytd_vs_prior_ytd` — `year`; prior window aligns same month/day in prior year
- `custom_vs_prior_year` — `start`, `end` (`YYYY-MM-DD`)
- `custom_vs_previous_period` — `start`, `end`; prior = equal length immediately before

**Attribution / PI filters**

- `branch` — exact branch label or omit / `All`
- `piSalesperson` — normalized salesperson (or `__MORAWARE_FALLBACK__` with `salespersonClass=fallback_moraware`)
- `salespersonClass` — `all` | `active_rep` | `house_account` | `fallback_moraware` | `unknown` | `inactive_rep` (mapped but not on active rep roster)
- `search` — case-insensitive substring on account, job name, Moraware salesperson, account id

**Legacy Brain filters** (same query params as other sales routes): `salesperson`, `account`, `jobStatus`, `process`, `materialColor`, `city`, `minSqft`, `maxSqft`.

**Monthly YoY company trend**

- `trendYearCurrent`, `trendYearPrior` (defaults derived from period)

**Debug**

- `debug=1` — sample classified rows, counts, unmapped account examples (trusted callers only; still requires sales head access).
  - Includes attribution mapping source when available:
    - `approved_aliases_plus_assignments`
    - `approved_aliases_plus_rules`
    - `hardcoded_rules_only`
    - `no_alias_table`

Response includes **`legacyQueryForJobs`** (`range=custom`, `start`, `end`) so the Jobs tab can align to the PI current window.

## Front-end (`app-sales`)

- **Dark “performance intelligence”** shell (`sales-intelligence.css`) — internal analytics density.
- **Tabs**: Overview, Reps, Accounts, Focus Accounts, Jobs, Data Quality.
- **Sticky** top filter bar: period, branch, attributed salesperson, class, customer/job search, YoY chart years, Apply/Refresh.
- **Advanced Brain filters** row (optional) applies to PI + Jobs via shared query string.
- **No `setInterval` polling.** Loads on login, when filters / debounced search / applied Brain filters change, and on Refresh.
- **`TOKEN_REFRESHED`** does not wipe hydrated PI state (handled in `App.tsx` auth listener).

## Known limits

- **Revenue / quote / pipeline** — not invented; remains null until **Quote Platform** (or guarded finance feed) exists.
- **Classification** is **rule-based** in eOS; Moraware remains production SoT for Sq.Ft.
- Full-year **monthly YoY** fetches two calendar years of jobs — can be heavy on very large Brain datasets; pagination is server-side in `fetchJobsInDateRange`.

## Future (Quote Platform)

Unlock revenue, quote value, close rate, and pipeline metrics without changing attribution hooks or motto.
