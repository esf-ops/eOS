# Monday.com — public quote submissions

When `POST /api/public-quote/submit-measurements` persists a lead, the backend calls `syncQuoteToMonday` in `backend-core/src/integrations/mondayQuoteSync.js`. If Monday env vars are set, it creates an item on the configured board via the Monday GraphQL API (`create_item`). If env vars are missing or Monday returns an error, the quote is still saved and the HTTP response stays **200** with `ok: true`.

## Required env vars (live create)

| Variable | Purpose |
|----------|---------|
| `MONDAY_API_TOKEN` | Monday API token (server only — **never** expose to the browser). |
| `MONDAY_PUBLIC_QUOTES_BOARD_ID` | Numeric board ID for **public consumer** quotes (`quote_source` values treated as public in `quoteSourceConfig.js`). |

**Example board (Retail Online Quotes):** board ID `18412881229`.

## Optional fallback

| Variable | Purpose |
|----------|---------|
| `MONDAY_QUOTES_BOARD_ID` | Used when the source-specific board env (e.g. `MONDAY_PUBLIC_QUOTES_BOARD_ID`) is unset. |

Partner / internal boards use `MONDAY_PARTNER_QUOTES_BOARD_ID` / `MONDAY_INTERNAL_QUOTES_BOARD_ID` via `quoteSourceConfig.js` when those flows call the same sync helper.

## Public column mapping — safe env vars (Vercel / backend-core)

Each value is the **column ID** from Monday (not the column title). Values are built by `buildMondayPublicColumnValues()` and sent as `column_values` on `create_item` (GraphQL variable type `JSON!`, value is `JSON.stringify(columnValuesObject)`).

If **none** of the `MONDAY_PUBLIC_COL_*` env vars listed below are set, the server **does not** send `column_values`: it creates the item **name-only** and logs `status = success` with a note in `request_payload` / `response_payload` (`name_only_no_mapping_env`).

Copy/paste set for **Retail Online Quotes** (safe columns only):

```bash
MONDAY_PUBLIC_QUOTES_BOARD_ID=18412881229

MONDAY_PUBLIC_COL_STATUS=color_mm39jp91
MONDAY_PUBLIC_COL_QUOTE_VALUE=numeric_mm39fhfy
MONDAY_PUBLIC_COL_CREATED_DATE=date_mm39q48r
MONDAY_PUBLIC_COL_PHONE=phone_mm391jen
MONDAY_PUBLIC_COL_EMAIL=email_mm39hq7c
MONDAY_PUBLIC_COL_CITY=text_mm392cgc
MONDAY_PUBLIC_COL_STATE=text_mm391gbx
MONDAY_PUBLIC_COL_ESTIMATED_SQFT=numeric_mm396hdp
MONDAY_PUBLIC_COL_ESTIMATE_SUMMARY=long_text_mm395fcz
MONDAY_PUBLIC_COL_QUOTE_ID=text_mm39m9cp

MONDAY_PUBLIC_STATUS_LABEL=Lead submitted
```

| Env var | Monday type | Payload / format |
|---------|----------------|------------------|
| `MONDAY_PUBLIC_COL_CITY` | text | Plain string from `city` |
| `MONDAY_PUBLIC_COL_STATE` | text | Plain string from `state` |
| `MONDAY_PUBLIC_COL_QUOTE_ID` | text | `quote_number`, else internal `quote_id` |
| `MONDAY_PUBLIC_COL_QUOTE_NUMBER` | text (legacy) | `quote_number` only |
| `MONDAY_PUBLIC_COL_ESTIMATE_SUMMARY` | long_text | Compact tier line from `buildPublicEstimateSummaryCompact` |
| `MONDAY_PUBLIC_COL_QUOTE_VALUE` | numbers | `{ "number": <grand_total> }` |
| `MONDAY_PUBLIC_COL_ESTIMATED_SQFT` | numbers | `{ "number": <estimated sq ft> }` |
| `MONDAY_PUBLIC_COL_CREATED_DATE` | date | `{ "date": "YYYY-MM-DD" }` |
| `MONDAY_PUBLIC_COL_STATUS` | status | `{ "label": "<MONDAY_PUBLIC_STATUS_LABEL>" }` |
| `MONDAY_PUBLIC_COL_EMAIL` | email | `{ "email": "…", "text": "…" }` — only if email present |
| `MONDAY_PUBLIC_COL_PHONE` | phone | `{ "phone": "<10 digits>", "countryShortName": "US" }` — only if phone normalizes to 10 US digits |
| `MONDAY_PUBLIC_COL_CUSTOMER_NAME` | text | Legacy optional |
| `MONDAY_PUBLIC_COL_ZIP` | text | Optional |
| `MONDAY_PUBLIC_COL_SOURCE` | text | `quote_source` |

| Env var | Purpose |
|---------|---------|
| `MONDAY_PUBLIC_STATUS_LABEL` | Status label when `MONDAY_PUBLIC_COL_STATUS` is set. Default: `Lead submitted`. **Must match** an existing label on that status column in Monday. |

### Intentionally skipped (until a follow-up mapping pass)

Do **not** set these yet unless you add the corresponding implementation in `mondayQuoteSync.js` (they are detected and recorded in `skipped_columns` only as diagnostics when the env var exists):

| Env var (examples) | Why skipped |
|--------------------|-------------|
| `MONDAY_PUBLIC_COL_SALES_REP` | **People** column needs Monday user IDs, not display names. |
| `MONDAY_PUBLIC_COL_ADDRESS` | **Location** column needs a validated Monday location JSON payload. |
| `MONDAY_PUBLIC_COL_BRANCH` | **Dropdown** must match an existing option label on the board. |

## Finding board ID and column IDs

1. Open the board in Monday.com; the board ID appears in the URL: `…/boards/18412881229`.
2. Run the inspect helper (tokens only in your shell, never committed):

```bash
export MONDAY_API_TOKEN="…"
export MONDAY_PUBLIC_QUOTES_BOARD_ID="18412881229"
node backend-core/src/scripts/inspectMondayBoardColumns.js
```

3. Copy the **column `id`** for each field into the matching `MONDAY_PUBLIC_COL_*` env var.

## Item name (all successful creates)

Public consumer items use:

`{quote_number} - {customer_name} - {city}, {state}`

(with sensible fallbacks if a piece is missing).

## Estimate summary column

When estimates exist on the submission, `MONDAY_PUBLIC_COL_ESTIMATE_SUMMARY` receives a single line of **homeowner-safe** planning totals per material tier, e.g. `Promo $1,200 | A $1,400 | B $1,500`. This is **not** wholesale detail.

## `buildMondayPublicColumnValues`

Exported helper (used by `syncQuoteToMonday`):

```js
buildMondayPublicColumnValues({ payload, estimateSummary })
```

Returns:

- `columnValues` — object keyed by Monday column id
- `attemptedColumnIds` — `Object.keys(columnValues)`
- `skippedColumns` — `{ reason, detail }[]` (missing data, unimplemented env-only columns, etc.)

## Behavior when config is missing

If `MONDAY_API_TOKEN` or the resolved board ID is missing:

- No GraphQL call is made.
- `quote_monday_sync_log` gets a row with `status = skipped_missing_config`.
- `quote_headers.monday_*` is not updated from Monday.

## Column values encoding (`create_item`)

The GraphQL variable `columnValues` is typed **`JSON!`**. The server passes **`JSON.stringify(columnValuesObject)`** as the variable value (a JSON string), which Monday’s API accepts for this field.

## No column env vars configured (public)

- Creates **item name only** (no `column_values` mutation argument).
- Logs `status = success` with `response_payload.note` / `request_payload.graphql` describing name-only path.
- Does **not** attempt a failing empty column mutation.

## Full column attempt → Monday rejects values

1. **Diagnostics** (console, never token): `attempted_column_ids`, `typeof_columnValues` (`string`), JSON preview, `skipped_columns`.
2. **Retry** once: `create_item(board_id, item_name)` only (name-only).
3. If retry succeeds: `quote_monday_sync_log` **`status = success_partial_columns`**, `monday_item_id` set, `error_message` contains the **original Monday error** (trimmed), `response_payload` includes `monday_column_values_error`, `attempted_column_ids`, `typeof_columnValues`, `skipped_columns`.  
   There is no separate `metadata` column on `quote_monday_sync_log`; use **`response_payload`** (jsonb) for this detail.

## Behavior when Monday succeeds (columns)

- `quote_monday_sync_log`: `status = success`, `monday_board_id`, `monday_item_id` set when the log insert succeeds.
- `quote_headers`: `monday_board_id` and `monday_item_id` updated when those columns exist.
- Public JSON may include `monday_item_id`, `monday_board_id`, `monday_sync_status` for optional UI.

## Behavior when Monday fails completely (API error, name-only retry fails)

- `quote_monday_sync_log`: `status = failed`, `error_message` contains a trimmed safe message (length-capped).
- The HTTP response for submit remains **success** (`ok: true`); a string may be appended to `warnings` so the client can show a gentle message.
- The quote row in Supabase is unchanged by the failure (already inserted before sync).

## Related

- `docs/quote-platform/QUOTE_DEMO_HEAD_RUN.md` — local demo for `app-quote`.
- `docs/quote-platform/three-head-quote-architecture.md` — quote platform overview.
