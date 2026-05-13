# Monday.com — public quote submissions

When `POST /api/public-quote/submit-measurements` persists a lead, the backend calls `syncQuoteToMonday` in `backend-core/src/integrations/mondayQuoteSync.js`. If Monday env vars are set, it creates an item on the configured board via the Monday GraphQL API. If env vars are missing or Monday returns an error, the quote is still saved and the HTTP response stays **200** with `ok: true`.

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

Each value is the **column ID** from Monday (not the column title). Values are built by `buildMondayPublicColumnGroups()` (and merged by `buildMondayPublicColumnValues()` for inspection).

If **none** of the `MONDAY_PUBLIC_COL_*` env vars listed below are set, the server **does not** send `column_values` on create: it creates the item **name-only** and logs `status = success` with a note in `response_payload` (`name_only_no_mapping_env`).

### Column groups (resilient sync)

Public sync applies columns in stages so one bad column type does not fail the entire board row:

| Group | When applied | Columns (env vars) | Monday value shape |
|-------|----------------|-------------------|-------------------|
| **A** — safest first | `create_item` only (first request) | City, state, legacy text (customer name, zip, source), quote id / quote number, **quote amount**, **estimated sqft** | Text: plain string. Numbers columns: **numeric string** (quote amount two decimals, sqft rounded integer string). |
| **B** | After item exists (`change_multiple_column_values`) | `MONDAY_PUBLIC_COL_ESTIMATE_SUMMARY` (long_text) | Plain string. |
| **C** | Same, one call after previous | `MONDAY_PUBLIC_COL_CREATED_DATE` | `{ "date": "YYYY-MM-DD" }` |
| **D** | Same | `MONDAY_PUBLIC_COL_STATUS` | `{ "label": "<MONDAY_PUBLIC_STATUS_LABEL>" }` — label **must already exist** on that status column in Monday. |
| **E** | Same | `MONDAY_PUBLIC_COL_EMAIL` | `{ "email": "…", "text": "…" }` — only if the address passes a simple validity check. |
| **F** | Same | `MONDAY_PUBLIC_COL_PHONE` | `{ "phone": "<10 digits>", "countryShortName": "US" }` — only when the number normalizes to 10 US digits. |

If **group A** fails on `create_item`, the server falls back to **name-only** `create_item`, then retries **each group A column** individually via `change_multiple_column_values` (single column per call) so a single bad mapping does not block the rest. Optional groups **B–F** are each attempted in order; a failure in one group **does not** roll back the Monday item or successful columns, and **does not** fail the public quote HTTP response.

Copy/paste set for **Retail Online Quotes** (safe first columns + optional special columns):

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
|---------|-------------|------------------|
| `MONDAY_PUBLIC_COL_CITY` | text | Plain string from `city` |
| `MONDAY_PUBLIC_COL_STATE` | text | Plain string from `state` |
| `MONDAY_PUBLIC_COL_QUOTE_ID` | text | `quote_number`, else internal `quote_id` |
| `MONDAY_PUBLIC_COL_QUOTE_NUMBER` | text (legacy) | `quote_number` only |
| `MONDAY_PUBLIC_COL_ESTIMATE_SUMMARY` | long_text | Compact tier line from `buildPublicEstimateSummaryCompact` (group **B**) |
| `MONDAY_PUBLIC_COL_QUOTE_VALUE` | numbers | Numeric **string**, e.g. `"1234.56"` (group **A**) |
| `MONDAY_PUBLIC_COL_ESTIMATED_SQFT` | numbers | Numeric **string** of rounded sqft (group **A**) |
| `MONDAY_PUBLIC_COL_CREATED_DATE` | date | `{ "date": "YYYY-MM-DD" }` (group **C**) |
| `MONDAY_PUBLIC_COL_STATUS` | status | `{ "label": "<MONDAY_PUBLIC_STATUS_LABEL>" }` (group **D**) |
| `MONDAY_PUBLIC_COL_EMAIL` | email | `{ "email": "…", "text": "…" }` — only if email looks valid (group **E**) |
| `MONDAY_PUBLIC_COL_PHONE` | phone | `{ "phone": "<10 digits>", "countryShortName": "US" }` — only if phone normalizes to 10 US digits (group **F**) |
| `MONDAY_PUBLIC_COL_CUSTOMER_NAME` | text | Legacy optional (group **A**) |
| `MONDAY_PUBLIC_COL_ZIP` | text | Optional (group **A**) |
| `MONDAY_PUBLIC_COL_SOURCE` | text | `quote_source` (group **A**) |

| Env var | Purpose |
|---------|---------|
| `MONDAY_PUBLIC_STATUS_LABEL` | Status label when `MONDAY_PUBLIC_COL_STATUS` is set. Default: `Lead submitted`. **Create this label on the board’s status column** before relying on sync; if the label is missing, group **D** is recorded in `failed_column_groups` with an error in `group_errors.group_D`. |

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

When estimates exist on the submission, `MONDAY_PUBLIC_COL_ESTIMATE_SUMMARY` receives a single line of **homeowner-safe** planning totals per material tier, e.g. `Promo $1,200 | A $1,400 | B $1,500`. This is **not** wholesale detail. It is applied in **group B** after the item exists.

## `buildMondayPublicColumnGroups` / `buildMondayPublicColumnValues`

Exported helpers:

```js
buildMondayPublicColumnGroups({ payload, estimateSummary })
```

Returns `groupA` … `groupF` (objects keyed by Monday column id) and `skippedColumns` (`{ reason, detail }[]`).

```js
buildMondayPublicColumnValues({ payload, estimateSummary })
```

Merges all groups into a single `columnValues` object (for debugging or tooling), plus `attemptedColumnIds` and `skippedColumns`.

## Diagnostics in `quote_monday_sync_log.response_payload`

For public runs with column mapping, the log includes (no tokens):

| Field | Meaning |
|-------|---------|
| `monday_item_id` | Created item id |
| `created_with_columns` | `true` if `create_item` succeeded **with** group A `column_values`; `false` if the first create was name-only or group A had no keys |
| `applied_column_ids` | Column ids that were set successfully |
| `failed_column_ids` | Column ids that failed on an incremental update (or group A per-column retry) |
| `failed_column_groups` | e.g. `A`, `B`, … — which stage had errors |
| `skipped_columns` | Missing ids, empty values, unimplemented env-only columns, invalid email/phone, etc. |
| `group_errors` | Map of stage → message, e.g. `create_item_group_A`, `group_A_incremental`, `group_D` |

Use `failed_column_groups` and `group_errors` to see whether a **status label** (group D), **long text** (B), **date** (C), **email** (E), or **phone** (F) rejected the payload.

## Behavior when config is missing

If `MONDAY_API_TOKEN` or the resolved board ID is missing:

- No GraphQL call is made.
- `quote_monday_sync_log` gets a row with `status = skipped_missing_config`.
- `quote_headers.monday_*` is not updated from Monday.

## Column values encoding

- **Group A** on `create_item`: GraphQL variable `column_values` is `JSON!`; the server passes `JSON.stringify(groupAObject)` (same pattern as before for a single blob).
- **Groups B–F**: `change_multiple_column_values` with `column_values` as `JSON.stringify` for that group’s object only.

## No column env vars configured (public)

- Creates **item name only** (no `column_values` on create).
- Logs `status = success` with `response_payload` / notes describing the name-only path.

## Legacy full-blob failure (partner / non-public)

Non-public quotes still use `create_item` with an empty column map (`{}`) when no public mapping applies.

## Behavior when Monday succeeds (all groups)

- `quote_monday_sync_log`: `status = success`, diagnostics fields populated, `monday_item_id` set when the log insert succeeds.
- `quote_headers`: `monday_board_id` and `monday_item_id` updated when those columns exist.

## Partial success (`success_partial_columns`)

- Group A `create_item` failed but name-only retry succeeded, and/or any group A per-column retry failed, and/or any optional group **B–F** failed.
- The Monday item is kept; successful column values are not cleared.
- `error_message` on the log row may contain concatenated `group_errors` (trimmed, length-capped).
- The public HTTP response remains **success**; `warnings` may include a short note that some Monday columns could not be filled.

## Behavior when Monday fails completely (API error, no item id)

- `quote_monday_sync_log`: `status = failed`, `error_message` contains a trimmed safe message.
- The HTTP response for submit remains **success** (`ok: true`); a string may be appended to `warnings`.

## Related

- `docs/quote-platform/QUOTE_DEMO_HEAD_RUN.md` — local demo for `app-quote`.
- `docs/quote-platform/three-head-quote-architecture.md` — quote platform overview.
