# Brain Agent Capability Map

**Date:** 2026-09-22  
**Status:** Audit + foundation architecture (Phase A). Read-only. No deploy.  
**Audience:** Engineers extending the eliteOS Brain Agent Gateway.

## Purpose

Map what the eliteOS Brain already contains, what AI-safe read surfaces exist today, and what a governable read-only agent still needs.

**Principle:** The LLM is never authoritative for company facts. Facts must come from Brain evidence produced in the same agent run.

**Investigation architecture:** The agent loop is **model-driven** (`MODEL → TOOL → OBSERVATION → … → grounded answer`). Application code does **not** route natural-language requests into business workflows via regex, keywords, or hard-coded conversational paths. Deterministic code owns authz, org isolation, read-only gates, schemas, limits, provenance, and factual support checking only. See FEATURE_DECISIONS §373.

## Sensitivity legend

| Level | Meaning |
|-------|---------|
| **Low** | Ops-safe inventory / approved knowledge excerpts |
| **Medium** | Customer/job operational context; redacted totals |
| **High** | PII, pricing dumps, finance, HR discipline, audit internals |
| **Critical** | Credentials, raw provider payloads, service-role material |

## Matrix

| Domain | Brain contains | Existing read API | Agent currently sees | Permission required | Missing capability | Sensitivity | Recommended agent primitive |
|--------|----------------|-------------------|----------------------|---------------------|--------------------|-------------|----------------------------|
| Account Directory | Canonical accounts, contacts, locations, aliases, notes, follow-ups, external links | `/api/account-directory/*` | AI search + account summary via `/api/slab-ai/accounts/*` (no notes/timeline/finance embed) | `slab_ai` ∩ `account_directory` | Timeline/notes AI DTO; account activity window | High | `brain.search_entities`, `brain.get_account_360`, `brain.get_recent_activity` |
| Account 360 / relationship | AD + Moraware recent jobs + estimate summaries | `/api/account-directory/accounts/:id/relationship` | Partial via AI account retrieve + jobs list | `slab_ai` ∩ `account_directory` | Unified 360 evidence pack | High | `brain.get_account_360` |
| Quote Library | `quote_headers` + rooms/lines/revisions/timeline | `/api/quote-library/quotes*`, `/metrics` | AI search/retrieve DTOs (no calc dump) | `slab_ai` (quotes); head `quote_library` for UI metrics | AI-safe metric endpoint; revision/timeline DTO | Medium–High | `brain.search_entities`, `brain.get_quote_360`, `brain.query_metric` |
| Internal Estimate | Same headers (`quote_source=internal_quote`) + `calculation_snapshot` | `/api/internal-quotes*` | Only via Quote AI if matched | `quote` head | Calc-free Internal AI DTO | High | Prefer `brain.get_quote_360` (narrative only) |
| Moraware jobs (prepared) | `sales_moraware_job_facts`, account rollups | Sales `/api/sales/jobs*`, AD 360, AI account jobs | Account-scoped job list only | `slab_ai` ∩ `account_directory` (AI); `sales` for Sales APIs | Org-wide AI job search; single-job retrieve HTTP; pass `sourceUpdatedAt` | Medium–High | `brain.get_related_records`, `brain.get_job_360` |
| Slab inventory | `slab_inventory` cache | `/api/slab-inventory/*`; AI materials search | Search only | `slab_ai` ∩ `slab_inventory` | Retrieve-by-id; color-program rollups for agent | Low–Medium | `brain.search_inventory` |
| Company knowledge | Approved documents/passages + embeddings | `/api/slab-ai/knowledge/*` | Hybrid search + citations | `slab_ai` (+ admin for hub) | Local embedding provider option | Medium | `brain.search_company_knowledge` |
| Sales Command Center | Prepared Moraware + QB sales truth + KPI | `/api/sales/*`, `/kpi-v1` | **No** AI adapter | `sales` + roles | Safe sales summary primitive; deny debug/query | Medium–High | Future: `brain.query_metric` (sales) |
| Production / shop flow | `brain_jobs` aggregates, Titans | `/api/executive/production-flow`, Titans | **No** | `executive` (weak org scoping historically) | Org-scoped production DTO | Medium | Future: `brain.get_operational_exceptions` |
| Install / field | Calendar schedule rows | `/api/install-dashboard/*` | **No** | `install_dashboard` | Day-route AI DTO without raw_payload | Medium | Future: install day board |
| Scheduling | Same as install + Monday internal sync | Install dashboard; cron sync | **No** | Install / cron secret | Staff schedule board primitive | Medium–High | Future |
| Finance / QB | `qb_finance_*` snapshots; Intel; AD AR | `/api/finance/*`, QB Intel, AD financials | Catalogued **unavailable** on slabAi | `finance` / `quickbooks_intelligence` / AD | Permission-gated finance metrics only | **High** | Future: finance-only `brain.query_metric` |
| HR / workforce | `workforce_*`, scorecards | `/api/hr/workforce/*` | **No** | `hr` + category gates | Aggregate-only AI DTO; deny mistake detail by default | **High** | Future / deny by default |
| Executive metrics | Year scrapes of brain_* | `/api/executive/*` | **No** | `executive` | Org-scoped KPI pack from governed sources | Medium–High | Prefer Sales/Finance governed metrics |
| System health / audit | Sync runs, locks, failed jobs, auth/action logs | `/api/brain/sync-*`, admin audit | **No** (and some legacy brain routes are ops-risk) | `brain_health` / admin | Status-only health primitive; never expose ungated jobs | High | Future: `ops.sync_health_safe` |
| Org Directory | Planning org chart | `/api/org-directory/*` | **No** | `org_directory` | Optional people lookup (non-authoritative for head grants) | Medium | Later |

## What Phase B implements (foundation slice)

| Primitive | Status | Backed by |
|-----------|--------|-----------|
| `brain.search_entities` | Implemented | Existing AI account/quote search |
| `brain.get_entity` | Implemented | Account/quote retrieve |
| `brain.get_related_records` | Implemented | Account jobs list |
| `brain.get_account_360` | Implemented | AI account summary (+ related jobs optional) |
| `brain.get_quote_360` | Implemented | AI quote detail |
| `brain.get_job_360` | Stubbed via related list match | Account jobs (no org-wide job search yet) |
| `brain.search_inventory` | Implemented | AI materials search |
| `brain.search_company_knowledge` | Implemented | Knowledge hybrid search |
| `brain.query_metric` | Implemented (quote_count by account) | Server-side aggregation on `quote_headers` |
| `brain.get_time_series` | Catalog only | Not implemented |
| `brain.compare_periods` | Catalog only | Not implemented |
| `brain.get_operational_exceptions` | Catalog only | Not implemented |
| `brain.get_recent_activity` | Catalog only | Not implemented |

## Explicit non-goals (this foundation)

- Write actions of any kind
- Arbitrary SQL / LLM DB credentials
- Automatic finance/HR exposure
- Replacing Quote Library / Internal Estimate authority
- Wiring every eliteOS domain in one pass

## Security contract (mandatory)

```
User → auth → organization_id → slab_ai head
  → gateway capability (mode=read)
  → domain/head intersection
  → safe DTO + evidence envelope
  → MODEL decides next step (call_tool | clarify | abstain | final_answer)
  → TOOL observation returned to MODEL (including not_permitted)
  → … iterate within limits …
  → deterministic answer validation (evidence IDs / no unsupported claims)
```

There is **no** application-layer intent classifier between the user message and the model planner.

## Future complete catalog (proposed)

See § “Proposed complete future capability catalog” in the delivery report / FEATURE_DECISIONS entry for Brain Agent Foundation. Primitives above plus sales/install/production/finance (gated) / health-safe.

## Source audit notes

- Prefer `/api/slab-ai/*` over Quote Library / Internal Estimate **detail** for LLM context.
- Do not call ungated legacy `/api/brain/jobs*` for agents.
- Moraware/QB/inventory results must expose freshness (`retrievedAt`, `sourceUpdatedAt` when known) and never imply live vendor calls when data is cached.
