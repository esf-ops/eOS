# Quote Intake Lab — Phase 2 notes

**Date:** 2026-07-14  
**Status:** Implemented (local EML / paste ingest + IndexedDB)

## Import architecture

```
UI (ImportEmailModal)
   → LocalQuoteIntakeRepository.previewImport / confirmImport
       → InboundEmailAdapter (parseEmlUpload | parseManualPaste)
       → caseFromInboundMessage → qil_received shell
       → IdbLabStore (cases + attachment blobs + dedupe index)
   → Composite list = imported cases + built-in fixtures
```

No Brain routes. No Supabase. No Outlook / Resend / AI / takeoff / pricing.

## Parser dependency

| Package | Scope | Role |
|---------|-------|------|
| `postal-mime` | `app-quote-intake-lab` only | Browser-compatible RFC822 / MIME parse |

Root `package.json` / lockfile unchanged.

## Local persistence

| Store | Backend |
|-------|---------|
| Cases | IndexedDB `quote-intake-lab-v1` / `cases` |
| Attachment bytes | IndexedDB `attachments` |
| Dedupe map | IndexedDB `dedupe` (`dedupeKey` → `caseId`) |
| Tests | `MemoryLabStore` + `fake-indexeddb` for IDB unit test |

Fixtures never touch IndexedDB. **Clear imported** wipes only IDB stores.

## Dedupe algorithm

1. If Message-ID present → `mid:<normalized-id>`
2. Else SHA-256 over normalized sender, recipients, subject, date, body, and sorted attachment hashes → `hash:<hex>`

Duplicates surface existing case and **block** a second insert (preview `canConfirm=false`; confirm is idempotent).

## Attachment limits (lab-only)

| Limit | Value |
|-------|-------|
| Per attachment | 8 MiB |
| Total attachments | 24 MiB |
| Max count | 15 |
| Raw `.eml` | 32 MiB |
| Paste body chars | 200,000 |

These are temporary local safeguards — **not** production Outlook policy.

## Security decisions

- HTML never rendered; converted via string-only `htmlToSafeText`
- Scripts / SVG / object / iframe stripped from display text
- Filenames sanitized for display
- Attachment open uses local object URLs; no remote loads
- No `console` logging of bodies or attachment bytes
- Committed `.eml` fixtures use `example.com` only
- Unknown quote fields stay null / `—` (no inference)

## Known limitations

- No Graph / mailbox polling (`pollMailbox` throws)
- No server-side persistence or multi-device sync
- Attachment “preview” limited to download / open of image & PDF locally
- Malformed emails may still import with warnings if a body can be recovered
- Express `/api/quote-intake-lab/*` remains unmounted

## Future backend replacement boundary

Replace `IdbLabStore` + browser adapter with:

1. Mounted `/api/quote-intake-lab/*` (when approved)
2. Staging Supabase lab tables / bucket
3. Same `InboundMessage` / dedupe contracts

UI should keep calling `LocalQuoteIntakeRepository` (or an API-backed twin) without scattering storage access.

## Production connection confirmation

Phase 2 does **not** connect to production Quote Library, takeoff, email delivery, Elite 100 catalog, Mondays, Moraware, QuickBooks, or Home Launcher.
