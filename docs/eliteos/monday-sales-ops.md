# Monday Sales Ops integration

Sales Ops talks to Monday.com **only through the eliteOS Brain**. The browser never calls `api.monday.com` and never receives a Monday token, app secret, signing secret, `source_snapshot`, `raw_columns`, or private asset URLs.

## Authority

| Concern | Authority |
|---------|-----------|
| Canonical eliteOS account identity | Account Directory UUID (`account_directory_accounts.id`) |
| CRM source (assignment, operational fields, updates, files, docs, subitems) | Monday Account Master List |
| Sales plan, ramp, KPI standards, scorecards, intelligence, plan lifecycle | eliteOS (never Monday) |
| Historical credited SF | eliteOS attribution facts — never today's Monday owner |
| Sales Ops fast list/filter | Layer B projection `sales_ops_accounts` (not a customer master) |

Monday remains a **source system**. Do **not** create a new customer master. Do **not** treat Monday item IDs as canonical eliteOS identity.

## Architecture

**Layer A** (Brain/service-role only): complete Monday fidelity in `sales_ops_monday_items`, `sales_ops_monday_column_values` (EAV — future columns need no DDL; identity is `column_id`, title is metadata), `sales_ops_monday_updates` (replies via `parent_monday_update_id`), `sales_ops_monday_assets` (metadata only), `sales_ops_monday_docs`, `sales_ops_monday_users` (external person/team IDs only), `sales_ops_monday_groups`, `sales_ops_monday_sync_state`.

**Layer B**: `sales_ops_accounts` is the operational projection (name, owner, status, contacts, market/branch, and a few queryable fields). `sales_ops_accounts.id` is the projection-row identity, **not** canonical customer identity.

## Account Directory link

Exact only:

- `external_system = 'monday'`
- `external_id = '{boardId}:{itemId}'`

Do **not** collide with Excel `account_master_list`. Do **not** fuzzy-match. Name, alias, ownership, address, and starter-pack hints are **review candidates only**. If no exact link exists, `account_directory_account_id` stays NULL and the Monday-owned Sales Ops projection can still be visible by salesperson ownership.

Admin **Account Identity Review** (`GET/POST /api/sales-ops/admin/identity-reviews*`) rebuilds a queue with statuses `EXACT_SOURCE_ID` (legacy alias `EXACT_AUTO_LINKABLE`), `REVIEW_REQUIRED`, `NO_CANDIDATE`, and `CONFLICT`. Only an existing unique Monday `{boardId}:{itemId}` external link (conclusive source ID) may auto-project on rebuild. Unique 1:1 **exact display name** candidates may be **bulk human-approved** after a preview (`POST .../bulk-preview`, `POST .../bulk`); exact name is not automatic identity. Weak aliases (including Epworth → Cabinet shop) and alias-only hits are excluded from bulk. Filters: salesperson (`assignedUserId`) and approved starter book (`packKey=starter_handoff_v1`). Human approval logs actor, timestamp, Monday item, Account Directory UUID, shown evidence, match method, prior link, and reason. Unmatched Monday items do not create Account Directory rows. Identity linkage and commission eligibility remain separate.

QuickBooks ListIDs are never returned to the browser (linked yes/no only). Moraware Account IDs may be shown on identity review candidates.

## Configuration (org-scoped, not SaaS-global)

Stored in `sales_ops_monday_config`:

- `account_master_board_id` — Elite tenant parent **18397092941**
- `subitem_board_id` — Elite tenant subitems **18397319923**
- `column_map` — semantic key → `{ columnId, title, type }` for Layer B projection
- `board_schema` — last inspected columns/groups/settings
- `read_enabled` — Brain may ingest Monday into the local mirror
- `write_enabled` — Brain may mutate Monday. **Must remain false** until separately approved
- `enabled` — legacy write gate; prefer `write_enabled`

Ownership column: **Sales Executive** / `person` / people type. Mapping uses **Monday person ID** only (example observed ID `99047417` is not seeded to an eliteOS UUID).

## Reads vs writes

This phase is **read-only**.

- Read sync can run while writes stay disabled.
- `PATCH` / notes / follow-ups return `monday_writes_disabled` until `write_enabled=true`.
- Mutation helpers (`change_multiple_column_values`, `create_update`) remain in code but are gated.

Do **not** create production Monday webhooks in this phase. The webhook route remains: event-id idempotency, fetch-after-event, source `updated_at` comparison. **There is no 120-second echo suppression window.**

`MONDAY_APP_SIGNING_SECRET` is currently **missing** on production Brain. Therefore `webhook_ids` stay empty and inbound board subscriptions are not created. Future enablement (separate approval): store the App signing secret only on Brain, confirm the challenge/JWT path, then create the board webhook and persist its id in `sales_ops_monday_config.webhook_ids`. Do not invent a secret, do not put it in a head, and do not enable Monday **writes** as part of webhook setup.

## Scheduled READ-ONLY sync

Brain (`backend-core`) owns Monday schedules via **Vercel Cron** on the existing Brain project. Do **not** put Monday sync on the Moraware Mac mini. Do not create a second worker host.

| Job | Path | Cadence (UTC) | What it does |
|-----|------|----------------|--------------|
| `LIGHT_ACCOUNT` | `GET /api/internal/sales-ops/monday-sync/light` | `*/5 * * * *` | Parent items + column values + Sales Executive → exact eliteOS person map → `sales_ops_accounts.assigned_user_id`. No updates/files/docs history. |
| `DEEP_REFRESH` | `GET /api/internal/sales-ops/monday-sync/deep` | `15 * * * *` | Reuses `runFullMondayReconcile` without membership/unavailable. |
| `FULL_RECONCILE` | `GET /api/internal/sales-ops/monday-sync/full` | `0 8 * * *` | Complete census including membership only after success. Nightly repair/safety net. |

Authorization matches Takeoff: `CRON_SECRET` / `EOS_CRON_SECRET` / `ELITEOS_CRON_SECRET` as `Authorization: Bearer` or `x-eos-cron-secret`. There is no unauthenticated admin trigger.

Concurrency: org-scoped lock `eos_sync_locks.lock_name = sales_ops_monday:{organizationId}` (not `moraware_population`). Light defers if deep/full holds the lock. Stale locks recover when `expires_at` has elapsed. Two lights cannot overlap.

Current Monday ownership controls current CRM visibility only. Historical attribution / commission / scorecard facts do not move. Unmapped Monday people fail closed (`assigned_user_id` null). Failed light/deep/partial census does not mark membership unavailable.

`write_enabled` stays false. `webhook_ids` stay empty until `MONDAY_APP_SIGNING_SECRET` is present and webhook enablement is separately approved. A future signed webhook may call targeted `runLightMondayAccountSync({ itemIds })`; the three schedules remain safety nets.

Admin `GET /api/sales-ops/admin/sync/status` and `GET /api/sales-ops/integration/health` expose `schedules.LIGHT_ACCOUNT|DEEP_REFRESH|FULL_RECONCILE` plus `ownershipStale` (light success older than 15 minutes).

## Reconciliation

Full census (maintenance, not per-page browsing):

1. Inspect parent + subitem board schema once per run (schema is cached for the reconcile)
2. Page parent items (bounded GraphQL pages of 50) **with column values and nested subitems**
3. Batch-persist Layer A (items, EAV, users, assets, docs) and Layer B projection
4. Fetch updates/replies in bounded item-id batches (not one Monday request per account)
5. Refresh Monday users/groups once; enrich docs in bounded ID batches
6. Update `last_seen_at`
7. **Only after complete success** mark previously known-but-unseen rows `unavailable` / archived
8. Never hard-delete history

Progress is written to `sales_ops_monday_sync_state.metadata` and emitted as PII-safe JSON (`sales_ops_reconcile`). Poll `GET /api/sales-ops/admin/sync/status` or admin integration health. Activity states: `ACTIVE`, `RATE_LIMITED`, `STALLED` (no progress for 180s without backoff), `FAILED`, `COMPLETE`. A valid Monday backoff is `RATE_LIMITED`, not stalled.

Layer B ownership remapping uses `POST /api/sales-ops/admin/reproject` (or `sync?mode=reproject`) against the existing mirror — do **not** re-census Monday to apply person mappings.

If a census fails halfway, **do not** mark unseen records unavailable. Normal Sales Ops browsing reads the local mirror, not live Monday.

Source states: `active`, `archived`, `deleted`, `unavailable`.

Rep mappings: exact unique email only (`Monday user.email` == active eliteOS `user_profiles.email` in the same org). Preview: `GET /api/sales-ops/admin/person-mappings/preview`. Apply: `POST /api/sales-ops/admin/person-mappings/apply`. Fail closed on ambiguity.

## APIs

Light list: `GET /api/sales-ops/me/accounts?limit=&cursor=` (default 50, max 100). No updates/files/docs/EAV/snapshots.

Detail: `GET /api/sales-ops/accounts/:accountId` — projection + governed column DTO + description.

Lazy heavy (paginated, ownership-gated):

- `.../subitems`
- `.../updates`
- `.../files` (metadata only; content fetch returns `asset_fetch_not_enabled`)
- `.../docs`
- `.../activity`

The Sales Ops head Account 360 workspace lazy-loads those governed endpoints when an account is opened. The list stays a light `/me/accounts` page. File **content** is not proxied; the UI states that download is unavailable. Docs DTO omits `sourceUrl`. Deep links use `#account=<sales_ops_accounts.id>` and unknown/cross-rep UUIDs resolve to a safe not-found state (Brain 404). Authorization remains on Brain.

Admin observability (org admin only):

- `GET /api/sales-ops/admin/sync/status` — durable reconcile run (no PII / no provider payloads)
- `GET /api/sales-ops/integration/health` — includes latest `reconcile` snapshot for admins
- `POST /api/sales-ops/admin/reproject` — Layer B only
- `GET /api/sales-ops/admin/person-mappings/preview` / `POST .../apply` — exact unique email only

Rep: own Monday-assigned accounts. Manager: explicit assigned reports. Admin/executive/super_admin: organization scope. Unmapped Monday owners are hidden from normal rep lists.

## Schema

- v1 `eliteos_sales_ops_v1.sql` is **already applied** in production.
- Additive v2 `eliteos_sales_ops_monday_full_mirror_v2.sql` **is applied** on production project `wbxbzhxsdlkpqsviyzkt`, plus follow-up `eliteos_sales_ops_monday_column_value_null_v2_1.sql` (empty column JSON null) and `eliteos_sales_ops_monday_sync_mode_schedule_v2_2.sql` (sync_mode allow-list includes `light` / `deep` / `reproject`). Writes remain disabled.
- Additive v3 `eliteos_sales_ops_performance_attribution_v3.sql` is applied (attribution facts; no seeded actuals).
- Additive v4 `eliteos_sales_ops_identity_review_v4.sql` — identity review queue, compensation proposal/config, commission-report lifecycle. Applied.
- Additive v5 `eliteos_sales_ops_identity_review_v5.sql` — `EXACT_SOURCE_ID` status, bulk-approval audit actions, `match_method`. Apply before Brain deploy of the bulk-review slice.

## Environment

| Variable | Where | Purpose |
|----------|--------|---------|
| `HEAD_URL_SALES_OPS` | Brain | Launcher + CORS origin. Production **`https://sales-ops.eliteosfab.com`** (Vercel project `eliteos-sales-ops`; Cloudflare DNS-only CNAME to `c0bfc63fa49f166c.vercel-dns-016.com`). |
| `SALES_OPS_STORE` | Brain | `supabase` after v1 **and** v2 SQL. `memory` for local tests. |
| `MONDAY_API_TOKEN` | Brain only | GraphQL reads (and future writes). |
| `MONDAY_APP_SIGNING_SECRET` | Brain only | App-created board webhook JWT. |

## Realtime limitation

eliteOS does not currently subscribe to Supabase Realtime. Sales Ops polls `/api/sales-ops/me/accounts` about every 20 seconds while the tab is visible, and refetches after local mutations.
