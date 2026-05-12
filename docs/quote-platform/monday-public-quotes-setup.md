# Monday.com — public quote submissions

When `POST /api/public-quote/submit-measurements` persists a lead, the backend calls `syncQuoteToMonday` in `backend-core/src/integrations/mondayQuoteSync.js`. If Monday env vars are set, it creates an item on the configured board via the Monday GraphQL API (`create_item`). If env vars are missing or Monday returns an error, the quote is still saved and the HTTP response stays **200** with `ok: true`.

## Required env vars (live create)

| Variable | Purpose |
|----------|---------|
| `MONDAY_API_TOKEN` | Monday API token (server only — **never** expose to the browser). |
| `MONDAY_PUBLIC_QUOTES_BOARD_ID` | Numeric board ID for **public consumer** quotes (`quote_source` `public_consumer`). |

## Optional fallback

| Variable | Purpose |
|----------|---------|
| `MONDAY_QUOTES_BOARD_ID` | Used when the source-specific board env (e.g. `MONDAY_PUBLIC_QUOTES_BOARD_ID`) is unset. |

Partner / internal boards use `MONDAY_PARTNER_QUOTES_BOARD_ID` / `MONDAY_INTERNAL_QUOTES_BOARD_ID` via `quoteSourceConfig.js` when those flows call the same sync helper.

## Optional column mapping (public board)

Each value is the **column ID** from Monday (not the column title). If unset, that field is omitted from `column_values`; the item is still created with the generated **item name**.

| Env var | Typical Monday column type |
|---------|-----------------------------|
| `MONDAY_PUBLIC_COL_QUOTE_NUMBER` | Text |
| `MONDAY_PUBLIC_COL_CUSTOMER_NAME` | Text |
| `MONDAY_PUBLIC_COL_PHONE` | Text or Phone |
| `MONDAY_PUBLIC_COL_EMAIL` | Email or Text |
| `MONDAY_PUBLIC_COL_CITY` | Text |
| `MONDAY_PUBLIC_COL_STATE` | Text |
| `MONDAY_PUBLIC_COL_ZIP` | Text |
| `MONDAY_PUBLIC_COL_SALES_REP` | Text |
| `MONDAY_PUBLIC_COL_BRANCH` | Text |
| `MONDAY_PUBLIC_COL_QUOTE_VALUE` | Text or Numbers (if Numbers fails, use Text) |
| `MONDAY_PUBLIC_COL_STATUS` | Status (value sent as `{ "label": "…" }`; see below) |
| `MONDAY_PUBLIC_COL_SOURCE` | Text |
| `MONDAY_PUBLIC_COL_ESTIMATE_SUMMARY` | Long text — compact tier totals, e.g. `Promo $1,200 \| A $1,400 \| …` |
| `MONDAY_PUBLIC_COL_CREATED_DATE` | Date |

| Env var | Purpose |
|---------|---------|
| `MONDAY_PUBLIC_STATUS_LABEL` | Label string for the Status column when `MONDAY_PUBLIC_COL_STATUS` is set. Default: `Lead submitted`. Must match an existing label on that status column. |

## Finding board ID and column IDs

1. Open the board in Monday.com; the board ID often appears in the URL: `…/boards/1234567890`.
2. Run the inspect helper (tokens only in your shell, never committed):

```bash
export MONDAY_API_TOKEN="…"
export MONDAY_PUBLIC_QUOTES_BOARD_ID="1234567890"
node backend-core/src/scripts/inspectMondayBoardColumns.js
```

3. Copy the **first column** (`id` tab-separated) for each field you want to map into `MONDAY_PUBLIC_COL_*`.

## Item name (all successful creates)

Public consumer items use:

`{quote_number} - {customer_name} - {city}, {state}`

(with sensible fallbacks if a piece is missing).

## Estimate summary column

When estimates exist on the submission, `MONDAY_PUBLIC_COL_ESTIMATE_SUMMARY` receives a single line of **homeowner-safe** planning totals per material tier (Promo through Group F), e.g. `Promo $1,200 | A $1,400 | B $1,500`. This is **not** wholesale detail.

## Behavior when config is missing

If `MONDAY_API_TOKEN` or the resolved board ID is missing:

- No GraphQL call is made.
- `quote_monday_sync_log` gets a row with `status = skipped_missing_config`.
- `quote_headers.monday_*` is not updated from Monday.

## Column values encoding (`create_item`)

The GraphQL variable `column_values` is typed **`JSON!`**. The server passes **`JSON.stringify(columnValuesObject)`** as the variable value (a JSON-encoded string), which Monday’s API expects for this field.

If that attempt fails, the server logs **dev-only diagnostics** (board configured, item name, column IDs, `typeof columnValues`, first 500 chars of the JSON string — **never** the API token) and **retries once** with `create_item(board_id, item_name)` only (no `column_values`).

## Behavior when Monday succeeds

- `quote_monday_sync_log`: `status = success`, `monday_board_id`, `monday_item_id` set when the log insert succeeds.
- `quote_headers`: `monday_board_id` and `monday_item_id` updated when those columns exist.
- Public JSON may include `monday_item_id`, `monday_board_id`, `monday_sync_status` for optional UI.

## Partial success (column mapping rejected, name-only retry worked)

- `quote_monday_sync_log`: `status = success_partial_columns`, with `monday_item_id` / `monday_board_id` set.
- `quote_headers` updated with the new item id.
- The public submit response includes a **warning** that the Monday item was created without populated columns; Elite can fix the board row.

## Behavior when Monday fails (API error, bad column value, etc.)

- `quote_monday_sync_log`: `status = failed`, `error_message` contains a trimmed safe message (length-capped).
- The HTTP response for submit remains **success** (`ok: true`); a string is appended to `warnings` so the client can show a gentle message.
- The quote row in Supabase is unchanged by the failure (already inserted before sync).

## Related

- `docs/quote-platform/QUOTE_DEMO_HEAD_RUN.md` — local demo for `app-quote`.
- `docs/quote-platform/three-head-quote-architecture.md` — quote platform overview.
