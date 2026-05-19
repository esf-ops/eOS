# Monday — Internal quotes board (backend-only)

Internal quotes (`quote_source: internal_quote`) sync to a **separate** board from public retail quotes. Tokens and board/column IDs stay **server-side only**. Supabase is the source of truth; Monday is workflow visibility only. Sync is **best-effort** and must not block quote save.

## Required

- `MONDAY_API_TOKEN` — server-side only (Vercel / Brain env).
- `MONDAY_INTERNAL_QUOTES_BOARD_ID` — Internal Estimates board ID (confirm in your Monday workspace; do not hardcode in code).

## Optional — column mapping

Set **Monday column IDs** (from introspection below). If none are set, the server may still resolve columns **by exact board title** when `MONDAY_INTERNAL_ALLOW_TITLE_COLUMN_MATCH` is not `0` (default: enabled).

| Env var | Board column title (export) | Type |
|---------|----------------------------|------|
| `MONDAY_INTERNAL_COL_QUOTE_ID` | Quote ID | text |
| `MONDAY_INTERNAL_COL_QUOTE_DATE` | Quote Date | date |
| `MONDAY_INTERNAL_COL_SALESPERSON` | Salesperson | text (people columns skipped) |
| `MONDAY_INTERNAL_COL_ACCOUNT` | Account Master List | text |
| `MONDAY_INTERNAL_COL_ESTIMATED_BY` | Estimated By | text |
| `MONDAY_INTERNAL_COL_BRANCH` | Branch Location | text |
| `MONDAY_INTERNAL_COL_EST_SQ_FT` | Est Sq Ft | numbers |
| `MONDAY_INTERNAL_COL_QUOTE_AMOUNT` | Quote Amount | numbers |
| `MONDAY_INTERNAL_COL_ROOM_COUNT` | Room Count | numbers |
| `MONDAY_INTERNAL_COL_STATUS` | Status | status (label must exist on board) |
| `MONDAY_INTERNAL_COL_PHONE` | Phone | phone |
| `MONDAY_INTERNAL_COL_EMAIL` | Email | email |
| `MONDAY_INTERNAL_COL_PROJECT_ADDRESS` | Project Address | text |
| `MONDAY_INTERNAL_COL_CITY` | City | text |
| `MONDAY_INTERNAL_COL_STATE` | State | text |
| `MONDAY_INTERNAL_COL_ESTIMATE_SUMMARY` | Estimate Summary | long_text |
| `MONDAY_INTERNAL_COL_ESTIMATE_LINK` | Estimate Link | link |

Legacy aliases still work: `MONDAY_INTERNAL_COL_CUSTOMER`, `MONDAY_INTERNAL_COL_PROJECT`, `MONDAY_INTERNAL_COL_QUOTE_VALUE`, `MONDAY_INTERNAL_COL_ESTIMATED_SQFT`, `MONDAY_INTERNAL_COL_CREATED_DATE`, `MONDAY_INTERNAL_COL_SALES_REP_TEXT`, `MONDAY_INTERNAL_COL_BRANCH_TEXT`, `MONDAY_INTERNAL_COL_ENTERED_BY`, `MONDAY_INTERNAL_COL_REVISION`, `MONDAY_INTERNAL_COL_LAST_REVISED`, `MONDAY_INTERNAL_COL_PRICING_MODE`.

## Optional — groups

| Env var | Group title |
|---------|-------------|
| `MONDAY_INTERNAL_GROUP_NEW_QUOTES` | New Quotes |
| `MONDAY_INTERNAL_GROUP_IN_REVIEW` | In Review |
| `MONDAY_INTERNAL_GROUP_APPROVED_QUOTES` | Approved Quotes |

When group IDs are unset, new items are created without `group_id` (typically land in the board default). **Status** column still reflects `quote_status`. Group routing by status:

- `draft`, `testing_review` → New Quotes  
- `sent`, `follow_up`, `revised`, `submitted` → In Review  
- `sold` → Approved Quotes  

## Deep links

- `HEAD_URL_INTERNAL_ESTIMATE` (or `HEAD_URL_QUOTE`) — Internal Estimate `/?quoteId=…`
- `HEAD_URL_QUOTE_LIBRARY` — Quote Library link when set

## Duplicate prevention

1. `quote_headers.monday_item_id` on the row or any revision in the same `quote_family_root_id`
2. Monday search on **Quote ID** column value (`quote_number` / `quote_number_base`)
3. **Update** existing pulse when found; **create** only when no match

`save_revision` copies the family `monday_item_id` so revisions update the same Monday item.

## Item name

`ESF Quote # - Customer/Account - City, ST` (fallbacks documented in `buildInternalMondayItemName`).

## Diagnostics

- Table: `quote_monday_sync_log` (quote_id, board_id, item_id, action, attempted/skipped columns, errors)
- **Dry run:** `MONDAY_SYNC_DRY_RUN=1` — builds payload, logs to sync table with `status: dry_run`, no Monday API writes
- **Admin API (auth + Internal Estimate head):** `GET /api/internal-quotes/monday/board-schema` — columns, groups, resolved mapping (no token in response)

### CLI introspection

```bash
export MONDAY_API_TOKEN="…"
export MONDAY_INTERNAL_QUOTES_BOARD_ID="…"
node backend-core/src/scripts/inspectMondayBoardColumns.js --internal
```

## Intentionally skipped

People, dropdown, board_relation, location, and other unsupported types are skipped per column without failing the whole sync.

## Public quotes unchanged

Retail online quotes use `MONDAY_PUBLIC_QUOTES_BOARD_ID` and `MONDAY_PUBLIC_COL_*` only.
