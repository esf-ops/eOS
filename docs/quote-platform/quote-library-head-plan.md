# eliteOS Quote Library Head — plan (Stage 1)

**Canonical domain:** `https://quotes.eliteosfab.com` (plural **`quotes`** — not `quote-library.*`).  
**App:** `app-quote-library/`  
**Brain routes:** `/api/quote-library/*` (`quoteLibraryApi.js`)  
**Head slug:** `quote_library` (`EOS_HEAD_SLUGS`, `user_head_access`, `requireHeadAccess`)

**Stage 1 (live):** Quote Library at **`quotes.eliteosfab.com`** lists real quotes from the Brain; UI polish pass focuses on **readable labels**, **command-center layout**, **workflow prompts** (Mark sold → generate handoff docs), and **Internal Estimate** deep links (`VITE_HEAD_URL_INTERNAL_ESTIMATE` optional in `app-quote-library`).

## Product split

- **Internal Estimate Head** (`internal.eliteosfab.com`) — creates and revises estimates; uses `/api/internal-quotes/*`.
- **Quote Library Head** (`quotes.eliteosfab.com`) — search, account grouping, status workflow, sold-job **handoff document** generation; uses `/api/quote-library/*`.
- **Public Quote Head** (`quote.eliteosfab.com`) — homeowner-facing tool; unchanged.
- **Supabase / shared `quote_headers`** remain the **system of record** for stored quotes. **Monday** is workflow visibility only; Quote Library does not depend on Monday success.

## Handoff documents

- **Moraware Entry Doc** and **QuickBooks Entry Doc** are **JSON payloads** stored in `quote_handoff_documents` for staff workflows.
- **No** Moraware or QuickBooks **write** automation in this stage; future automation goes through integration/admin mapping.

## SQL (manual apply)

Run in Supabase SQL editor (additive):

`backend-core/supabase/eliteos_quote_library_foundation.sql`

Creates `quote_handoff_documents` and optional `quote_headers.account_name`.  
`quote_status_history` already exists in `eos_quote_platform.sql` — do not duplicate.

**Quote Delivery (Phase 1):** `backend-core/supabase/eliteos_quote_delivery_foundation.sql` — `quote_delivery_logs`, `quote_share_links` scaffold. API: `POST /api/quote-delivery/quotes/:quoteId/preview|send` (backend dry-run; shared by Internal Estimate and Quote Library in later UI phases).

## Known gaps (Stage 1)

- **Internal Estimate `?quoteId=`** — link is wired; **full form hydration from saved quote is not complete** (use Quote Library for read-only detail).
- **Partner/dealer-scoped** account visibility — backend should tighten when RLS/grants are ready; dealers are not granted `quote_library` by default.
- **Monday status on quote update** — scaffold/documentation only unless existing sync hooks are extended deliberately.
