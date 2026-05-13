# Monday — Internal quotes board (backend-only)

Internal quotes (`quote_source: internal_quote`) sync to a **separate** board from public retail quotes. Tokens and board/column IDs stay **server-side only**.

## Required

- `MONDAY_API_TOKEN` — same token as other boards if acceptable to your security model.
- `MONDAY_INTERNAL_QUOTES_BOARD_ID` — internal quotes board ID.

## Optional column mapping (text / numbers / date / status only)

If **none** of the variables below are set, sync still creates the **item name** (incremental column fill is skipped).

| Env var | Column type | Notes |
|---------|-------------|--------|
| `MONDAY_INTERNAL_COL_CITY` | text | |
| `MONDAY_INTERNAL_COL_STATE` | text | |
| `MONDAY_INTERNAL_COL_CUSTOMER` | text | |
| `MONDAY_INTERNAL_COL_PROJECT` | text | |
| `MONDAY_INTERNAL_COL_QUOTE_ID` | text | Quote number or UUID fallback |
| `MONDAY_INTERNAL_COL_QUOTE_VALUE` | numbers | Grand total |
| `MONDAY_INTERNAL_COL_ESTIMATED_SQFT` | numbers | |
| `MONDAY_INTERNAL_COL_ESTIMATE_SUMMARY` | long_text | Compact material / mode / $ summary |
| `MONDAY_INTERNAL_COL_CREATED_DATE` | date | |
| `MONDAY_INTERNAL_COL_STATUS` | status | Uses `quote_status` from the header when present; else `MONDAY_INTERNAL_STATUS_LABEL` |
| `MONDAY_INTERNAL_COL_SALES_REP_TEXT` | text | |
| `MONDAY_INTERNAL_COL_BRANCH_TEXT` | text | |
| `MONDAY_INTERNAL_COL_ENTERED_BY` | text | Maps from `prepared_by` / Entered by |
| `MONDAY_INTERNAL_COL_PRICING_MODE` | text | `Direct` or `Wholesale` |

## Intentionally skipped (for now)

- People columns (need Monday user IDs).
- Dropdown columns without label validation.
- Location columns (payload format TBD).

## Diagnostics

Failures and partial syncs are written to **`quote_monday_sync_log`** like public quotes.

## Public quotes unchanged

Retail online quotes continue to use **`MONDAY_PUBLIC_QUOTES_BOARD_ID`** and **`MONDAY_PUBLIC_COL_*`** only.
