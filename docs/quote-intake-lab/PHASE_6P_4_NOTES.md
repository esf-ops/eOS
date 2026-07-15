# Phase 6P.4 — Manual Microsoft Graph Mailbox Preview and Import

**Date:** 2026-07-15
**Status:** Implemented + **Phase 6P.4 closure complete** (manual preview/import only; off by default)
**Mailbox:** `quotes@elitestonefabrication.com` (fixed server config)

---

## Inspection patterns reused

| Area | Pattern |
|------|---------|
| Auth | `requireAuth` + `requireHeadAccess("ai_takeoff")` + optional `QUOTE_INTAKE_PILOT_EMAILS` |
| CSRF | Bearer JWT API (no cookie session CSRF tokens on these routes); CORS Origin allowlist in `server.js` |
| Timeouts | Vercel `maxDuration` 300s; Graph calls use AbortController (`QUOTE_INTAKE_GRAPH_TIMEOUT_MS`, default 30s) |
| Secrets | Server env only; never `VITE_*`; redacted error messages |
| Fail-closed flags | Exact `"1"` for enable; Graph credentials not required when flags off |
| Persistence | Unapplied migration `eliteos_quote_intake_v1.sql` column `graph_immutable_message_id` (opaque Graph ImmutableId, max 2048 chars) |
| Storage | **Not used** in 6P.4 — attachment bytes discarded after SHA-256 / PDF magic validation |

---

## Graph architecture

```
Pilot UI "Sync mailbox"
  → POST /api/quote-intake/mailbox/preview  (explicit Preview click)
  → select messages + confirm
  → POST /api/quote-intake/mailbox/import
       → client-credentials token (in-memory cache)
       → GET Inbox messages / message / attachment metadata (/ contentBytes for single PDF)
       → createCase via Quote Intake repository
       → no Takeoff / Storage / mailbox mutation
```

Token endpoint: `POST https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token`
Scope: `https://graph.microsoft.com/.default`
Prefer: `outlook.body-content-type="text", IdType="ImmutableId"`
Graph GETs: fixed base `https://graph.microsoft.com/v1.0` + `/users/{configuredMailbox}/…` only.

---

## Environment variables (server-only)

| Variable | Default | Notes |
|----------|---------|-------|
| `QUOTE_INTAKE_GRAPH_ENABLED` | off | Must be `1` |
| `QUOTE_INTAKE_GRAPH_MANUAL_SYNC_ENABLED` | off | Must be `1` |
| `QUOTE_INTAKE_GRAPH_TENANT_ID` | — | Required when Graph+sync on |
| `QUOTE_INTAKE_GRAPH_CLIENT_ID` | — | Required when Graph+sync on |
| `QUOTE_INTAKE_GRAPH_CLIENT_SECRET` | — | Required when Graph+sync on |
| `QUOTE_INTAKE_GRAPH_MAILBOX` | `quotes@elitestonefabrication.com` | Fixed; ignore client overrides |
| `QUOTE_INTAKE_GRAPH_TIMEOUT_MS` | `30000` | |
| `QUOTE_INTAKE_GRAPH_PREVIEW_LIMIT` | `25` | Single page; never follows `@odata.nextLink` |
| `QUOTE_INTAKE_GRAPH_IMPORT_LIMIT` | `10` | |
| `QUOTE_INTAKE_GRAPH_MAX_ATTACHMENT_BYTES` | 50 MiB | |
| `QUOTE_INTAKE_GRAPH_MAX_TOTAL_BYTES` | 50 MiB | |

Documented in `backend-core/.env.example`. Never place these in `VITE_*`.

---

## Fixed-mailbox / URL enforcement

- Mailbox taken only from server config.
- Request body attempting `mailbox`, `tenantId`, `accessToken`, `graphUrl`, `nextLink`, `attachmentUrl`, etc. is rejected (`graph_forbidden`).
- Graph client URLs built from `GRAPH_BASE` + encoded configured mailbox + URL-encoded message/attachment ImmutableIds.
- Absolute/caller Graph URLs and relative path traversal are rejected.
- `@odata.nextLink` is never followed. If a nextLink were ever followed later, it must pass `assertSafeGraphNextLink` (HTTPS `graph.microsoft.com`, length ≤ 2048).
- No generic Graph proxy. Token POST lives only in the token provider; mailbox client allows GET only.

---

## Token handling

- Client-credentials grant; form-urlencoded POST.
- In-memory cache with early refresh (~60s skew).
- Concurrent callers share one in-flight token request.
- Invalidation + single retry on Graph `401`.
- Tokens never persisted to DB/files/audit/responses/logs.
- API/Graph flags off → mailbox service gates before `createQuoteIntakeGraphClient` / token provider; no Graph fetch.

---

## Preview behavior

`POST /api/quote-intake/mailbox/preview`

- Requires API + Graph + manual-sync flags, auth, head, pilot.
- Lists Inbox newest-first, bounded `$top`.
- Attachment **metadata only** (no `contentBytes` download).
- Marks already-imported via Message-ID / Graph ImmutableId linkage.
- Eligibility hints only (not AI classification).

---

## Import behavior

`POST /api/quote-intake/mailbox/import`
Body: `{ messageIds: string[], confirm: true }`

- **Server-side** `confirm === true` required (not UI-only).
- Refetches each message from Graph (never trusts browser preview).
- Single direct PDF `fileAttachment`: download bytes → base64 decode → `%PDF` magic → SHA-256 → **discard bytes**.
- `itemAttachment` / inline images → manual review (no plan PDF).
- Multi-PDF → manual review (no auto-pick).
- Persists case with `source_type=graph_mailbox`, mailbox identity, opaque ImmutableId in `graph_immutable_message_id` / DTO `graphImmutableMessageId`, Message-ID / content-hash dedupe, attachment metadata + `source_attachment_id`.
- Never creates Takeoff jobs or Storage uploads.

---

## Schema rename (closure)

| Was (incorrect) | Now |
|-----------------|-----|
| `graph_message_id_hash` | `graph_immutable_message_id` |
| `graphMessageIdHash` | `graphImmutableMessageId` |

Value is the opaque Microsoft Graph **ImmutableId** (`IdType=ImmutableId`), not a content hash.
Column type: `text` with `char_length` between 1 and 2048.
Updated in the **unapplied** Phase 6P.2 migration (no second compatibility column). Migration still **not applied**.

---

## Attachment handling

| Kind | Behavior |
|------|----------|
| Direct PDF fileAttachment | Importable when exactly one; magic + SHA validated |
| itemAttachment / nested mail | Metadata + manual review |
| Inline images | Ignored as plans |
| Multi-PDF | Manual review |

---

## Dedupe / idempotency

1. Graph ImmutableId (`graph_immutable_message_id`)
2. `internetMessageId` (primary unique index)
3. Content-hash fallback **only when Message-ID absent**
4. Attachment SHA-256 per case

Manual re-import → `duplicate` + existing case id. Supabase unique violations handled as races.

---

## UI behavior

- **Sync mailbox** button only when `config.mailboxSyncEnabled`.
- Modal requires explicit **Preview mailbox**; no auto-preview on open/queue load.
- Import requires selection + confirmation checkbox.
- **401/403** → `clearPreviewData()` (messages, selection, results wiped).
- Refresh queue after import.
- Existing Takeoff workbench unchanged when Graph is off.

---

## Audit / logging safety

| Event | Where |
|-------|--------|
| `mailbox_preview_completed` | Safe counts in API response (no case row — `intake_case_id` NOT NULL) |
| `mailbox_message_imported` / `_duplicate` / `_manual_review` | Case-bound audit via `appendAuditEvent` |
| `mailbox_import_requested` | Response summary counts |

Never audits subject/body/addresses/bytes/tokens/secrets/`contentBytes`/nextLink/Graph URLs.
Mailbox route logs log `e?.code` only; responses use `safeGraphError` (fixed public strings).

---

## Safe error codes

`graph_disabled`, `graph_not_configured`, `graph_token_failed`, `graph_forbidden`, `graph_throttled`, `graph_timeout`, `graph_unavailable`, `graph_invalid_response`, `message_not_found`, `attachment_unsupported`, `attachment_too_large`, `attachment_hash_failed`, `duplicate`, `import_failed`

---

## Closure verification checklist

- [x] Graph URLs = fixed `GRAPH_BASE` + configured mailbox; IDs URL-encoded
- [x] Caller mailbox/tenant/token/Graph URL/nextLink/attachment URL rejected
- [x] nextLink never followed; `assertSafeGraphNextLink` for HTTPS graph.microsoft.com + bound
- [x] Token POST + approved Graph GETs only; no mailbox mutation methods
- [x] Import confirmation required server-side
- [x] Preview never downloads attachment bytes
- [x] Import discards bytes after validation/hash
- [x] Raw Graph errors/tokens/bodies/subjects/addresses/bytes excluded from logs/audit
- [x] UI 401/403 clears preview data
- [x] API/Graph flags off → no token/Graph call
- [x] No mailbox mutation endpoint
- [x] Column/DTO rename applied; no compatibility column

---

## Exact files (Phase 6P.4 + closure)

**Backend (new):**
`quoteIntakeGraphConfig.mjs`, `quoteIntakeGraphToken.mjs`, `quoteIntakeGraphClient.mjs`, `quoteIntakeGraphNormalize.mjs`, `quoteIntakeMailboxService.mjs`, `fakeQuoteIntakeGraph.mjs`, `phase6p4.test.mjs`, `scripts/quoteIntakeGraphPreviewSmoke.mjs`

**Backend (modified):**
`quoteIntakeConfig.mjs`, `quoteIntakeRoutes.js`, `quoteIntakeRepository.mjs`, `supabaseQuoteIntakeRepository.mjs`, `quoteIntakeAuditSanitize.mjs`, `phase6p2.test.mjs`, `.env.example`, `supabase/eliteos_quote_intake_v1.sql`

**Frontend (new):**
`MailboxSyncModal.tsx`, `phase6p4.ui.test.mjs`, `quoteIntakeApiTypes.ts`

**Frontend (modified):**
`EstimatorQueueView.tsx`, `quoteIntakeApi.mjs`, `quoteIntakeTypes.ts`, `styles.css`, `.env.example`

**Docs:** this file; `PHASE_6P_2_NOTES.md` (column name)

---

## Tests / build results (closure)

```bash
node backend-core/src/quoteIntake/phase6p1… # via phase6p* + routes suite
node backend-core/src/quoteIntake/phase6p2.test.mjs
node backend-core/src/quoteIntake/phase6p4.test.mjs
node app-ai-takeoff/src/lib/phase6p3.test.mjs
node app-ai-takeoff/src/lib/phase6p4.ui.test.mjs
# plus other Quote Intake + AI Takeoff unit tests
cd app-ai-takeoff && npm run build
node --check … Graph/mailbox modules
git diff --check
```

Fake Graph transport only — **no real Graph call**.

---

## Confirmations

- No real Graph request / mailbox access during implementation or automated tests
- No mailbox mutation (PATCH/DELETE/send/reply/move/mark-read)
- No Takeoff invocation, Storage upload, Gemini, IE import, Quote Library write
- No migration applied; no commit/push/deploy; production flags not enabled
- Phase 6P.5 not started

---

## Manual local configuration (no secret values)

1. Set `QUOTE_INTAKE_API_ENABLED=1`, repository mode as needed.
2. Set Graph flags + tenant/client/secret from Entra (server only).
3. Confirm mailbox stays `quotes@elitestonefabrication.com`.
4. Frontend: `VITE_QUOTE_INTAKE_UI_ENABLED=true` (visibility only).
5. Open Estimator Queue → **Sync mailbox** → Preview → select → confirm Import.

### Optional real-mailbox smoke (not run in this phase)

```bash
node backend-core/src/quoteIntake/scripts/quoteIntakeGraphPreviewSmoke.mjs --i-understand-real-mailbox
```

Prints counts only.

### Synthetic-email test plan

1. Forward a synthetic message with one PDF to the quotes mailbox.
2. Preview → see message + PDF metadata.
3. Import → case created `graph_mailbox`.
4. Re-import → duplicate.
5. Nested item-attachment forward → manual review hint.
6. Confirm mailbox message remains unread/unmoved.

---

## Git status --short (at Phase 6P.4 closure)

```
 M app-ai-takeoff/.env.example
 M app-ai-takeoff/src/components/intake/EstimatorQueueView.tsx
 M app-ai-takeoff/src/lib/quoteIntakeApi.mjs
 M app-ai-takeoff/src/lib/quoteIntakeTypes.ts
 M app-ai-takeoff/src/styles.css
 M backend-core/.env.example
 M backend-core/src/quoteIntake/README.md
 M backend-core/src/quoteIntake/phase6p2.test.mjs
 M backend-core/src/quoteIntake/quoteIntakeAuditSanitize.mjs
 M backend-core/src/quoteIntake/quoteIntakeConfig.mjs
 M backend-core/src/quoteIntake/quoteIntakeRepository.mjs
 M backend-core/src/quoteIntake/quoteIntakeRoutes.js
 M backend-core/src/quoteIntake/supabaseQuoteIntakeRepository.mjs
 M backend-core/supabase/eliteos_quote_intake_v1.sql
 M docs/quote-intake-lab/PHASE_6P_2_NOTES.md
?? app-ai-takeoff/src/components/intake/MailboxSyncModal.tsx
?? app-ai-takeoff/src/lib/phase6p4.ui.test.mjs
?? app-ai-takeoff/src/lib/quoteIntakeApiTypes.ts
?? backend-core/src/quoteIntake/fakeQuoteIntakeGraph.mjs
?? backend-core/src/quoteIntake/phase6p4.test.mjs
?? backend-core/src/quoteIntake/quoteIntakeGraphClient.mjs
?? backend-core/src/quoteIntake/quoteIntakeGraphConfig.mjs
?? backend-core/src/quoteIntake/quoteIntakeGraphNormalize.mjs
?? backend-core/src/quoteIntake/quoteIntakeGraphToken.mjs
?? backend-core/src/quoteIntake/quoteIntakeMailboxService.mjs
?? backend-core/src/quoteIntake/scripts/quoteIntakeGraphPreviewSmoke.mjs
?? docs/quote-intake-lab/PHASE_6P_4_NOTES.md
```

---

## Recommended Phase 6P.5 scope

Server-side classification + Path A/B automation-decision engine (still **no** Takeoff invocation). See `PHASE_6P_0_AUTOMATIC_TAKEOFF_POLICY.md` and `PHASE_6P_0_IMPLEMENTATION_PLAN.md`.

**Do not begin Phase 6P.5 until explicitly requested.**
