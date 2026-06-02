# Quote Files + Takeoff Storage Architecture

**Status:** Schema draft written (2026-06-01). SQL not yet applied. Bucket not yet created.  
**SQL draft:** `backend-core/supabase/eliteos_quote_files_takeoff_storage.sql`  
**Helper:** `backend-core/src/files/quoteFileStoragePath.mjs`  
**Tests:** `npm run eos:test:quote-file-storage`  
**See also:** [`ai-takeoff-foundation.md`](./ai-takeoff-foundation.md) · [`FEATURE_DECISIONS.md`](./FEATURE_DECISIONS.md) entry **49**

---

## Core principle

> `quote_files` is the general-purpose file attachment table for Internal Estimate and all other quote types.
> AI Takeoff (`takeoff_jobs` / `takeoff_results`) is an **optional processing layer** on top.
> Most files will never run through AI Takeoff.

---

## Why files live in object storage, not Postgres rows

| Factor | Object Storage (Supabase Storage) | Postgres rows |
|--------|-----------------------------------|--------------|
| Binary blobs | Native | Wastes row storage, slows queries |
| Large files (PDFs, images) | Efficient | Pg TOAST overhead |
| Access control | Signed URL per download, bucket policy | Hard to scope at byte level |
| Future migration (R2/S3) | `storage_provider` field in `quote_files` | Would require data migration |
| Audit trail | `quote_file_events` per action | Mixed with business data |

Postgres tracks **metadata, ownership, quote linkage, takeoff linkage, lifecycle, and audit events only**.

---

## Table responsibilities

### `quote_files` — general file attachment metadata

One row per uploaded file. Covers all quote types via `quote_headers.quote_source`:

| `quote_source` | Use case |
|---|---|
| `internal_quote` | Estimator uploads cabinet plan to Internal Estimate |
| `partner_quote` | Dealer uploads measurement drawing to partner portal |
| `public_consumer` | (Future) customer uploads photo for initial inquiry |
| _(no quote yet)_ | Lab upload, pre-quote takeoff, or unlinked draft |

Key fields:

| Column | Purpose |
|---|---|
| `organization_id` | Tenant scoping — all files isolated per fabricator |
| `quote_id` | Links to `quote_headers.id` (nullable — may not exist at upload time) |
| `partner_account_id` | Optional scoping for pre-quote partner files |
| `takeoff_job_id` | Set only when AI Takeoff is triggered (most files: null) |
| `uploaded_by_user_id` | Auth user who uploaded |
| `storage_bucket` | `eliteos-quote-files` (private) |
| `storage_path` | Full path in bucket (never exposed to untrusted clients) |
| `original_filename` | User-provided name at upload time |
| `safe_filename` | Sanitized name used in storage path |
| `file_hash` | SHA-256 hex for duplicate detection (nullable) |
| `file_role` | Semantic role: `cabinet_plan`, `measurement_plan`, `signed_quote`, etc. |
| `visibility` | `internal` \| `partner` \| `customer` |
| `status` | `uploaded` → `active` → `archived` / `deleted` |

`quote_id` uses `quote_headers.id` for all quote types — no separate `internal_quote_id` is needed because `quote_headers.quote_source` already distinguishes them.

### `quote_file_events` — audit trail

Append-only. One row per meaningful lifecycle event:

| Action | When |
|---|---|
| `uploaded` | File bytes confirmed in storage |
| `downloaded` | Signed URL issued (intent to download) |
| `linked_to_quote` | `quote_files.quote_id` set or updated |
| `linked_to_takeoff` | `quote_files.takeoff_job_id` set |
| `takeoff_started` | Job moved to processing |
| `takeoff_approved` | Result approved by staff |
| `takeoff_rejected` | Result rejected |
| `sent_to_moraware` | File sent to Moraware handoff |
| `archived` / `deleted` | Status change |
| `visibility_changed` | Visibility updated |

### `quote_takeoff_jobs` (additive changes to existing table)

The existing `quote_takeoff_jobs` in `eos_quote_takeoff_visual_foundation.sql` had:
- `quote_id NOT NULL` — prevented pre-quote takeoff flows
- `input_file_ids uuid[]` — array, not a FK to a file table
- No `organization_id`

Additive migration adds:
- `organization_id uuid`
- `quote_file_id uuid` → FK to `quote_files.id` (primary plan file)
- `quote_id` made nullable (constraint relaxation — backward-safe)
- `created_by_user_id uuid`, `model_provider text`, `model_version text`
- `started_at`, `completed_at`

### `quote_takeoff_results` (additive changes to existing table)

The existing table had sparse row-per-measurement structure (`room_name`, `surface_type`, `quantity`). The new contract stores full structured JSON alongside:
- `normalized_takeoff_json` — validated `TakeoffResult` (schema v1.0+)
- `computed_measurements_json` — output of `computeTakeoffMeasurements()`
- `validation_diagnostics_json` — output of `validateTakeoffResult()`
- `import_plan_json` — output of `planTakeoffImport()`
- `review_status text` (supplements existing `needs_review boolean`)
- `reviewed_by_user_id uuid`, `reviewed_at timestamptz`

---

## Storage path conventions

**Bucket:** `eliteos-quote-files` (private, no public read — create via Supabase dashboard)

**Path template:**
```
org/{organizationId}/{contextType}/{contextId}/files/{quoteFileId}/{safeFilename}
```

**Context types:**

| Context | Path prefix | When |
|---|---|---|
| `internal-quotes` | `org/{org}/internal-quotes/{quoteId}/files/…` | Internal Estimate file |
| `partner-quotes` | `org/{org}/partner-quotes/{quoteId}/files/…` | Partner portal file |
| `quotes` | `org/{org}/quotes/{quoteId}/files/…` | Generic quote file |
| `takeoff-jobs` | `org/{org}/takeoff-jobs/{jobId}/files/…` | Pre-quote takeoff upload |
| `unlinked` | `org/{org}/unlinked/files/{quoteFileId}/…` | Not yet linked to any context |

**Filename sanitization rules** (`sanitizeStorageFilename`):
- Strip directory components (`../ `, `/`, `\`) — path traversal prevention
- Replace unsafe characters with `_`; collapse runs
- Remove trailing underscores before extension (`plan_.pdf` → `plan.pdf`)
- Enforce max 200 characters; preserve extension
- Fallback to `"file"` if nothing remains

**Access:**
- No permanent public URLs
- Backend generates short-lived signed URLs per download
- Backend must verify ownership (`organization_id`, quote access, `status = 'active'`) before issuing URL
- Log every download in `quote_file_events` (action `downloaded`)

**Migration path:**
- `storage_provider` field (`supabase` | `r2` | `s3` | `other`) allows future move to Cloudflare R2 or AWS S3 without schema change

---

## Lifecycle flows

### A. Internal Estimate file upload — no AI Takeoff

```
Internal Estimate draft (internal_quote) exists
  → Staff uploads cabinet plan or photo or signed approval
  → quote_files row created
      organization_id = (org)
      quote_id        = quote_headers.id  ← quote already exists
      file_role       = cabinet_plan | photo | signed_quote | …
      status          = active
      takeoff_job_id  = NULL              ← not running AI Takeoff
  → quote_file_events: action = uploaded
  → File appears in Internal Estimate file panel (future UI)
  → File appears in Quote Library handoff panel (future UI)
  → No takeoff_job required
```

### B. Internal Estimate file upload with AI Takeoff

```
Internal Estimate draft (internal_quote) exists
  → Staff uploads cabinet or measurement plan
  → quote_files row created (as above)
  → Staff triggers "Run Takeoff" action (future UI)
  → quote_takeoff_jobs row created
      organization_id = (org)
      quote_id        = quote_headers.id
      quote_file_id   = quote_files.id   ← the uploaded plan
      status          = queued
  → quote_files.takeoff_job_id backfilled → job links back to file
  → quote_file_events: action = linked_to_takeoff
  → AI model runs → takeoff_results created
  → Staff reviews in AI Takeoff Lab or future Internal Estimate panel
  → Staff approves → review_status = approved
  → quote_file_events: action = takeoff_approved
  → Import plan applied to room builder (future UI)
  → Original file remains attached to quote (immutable)
```

### C. AI Takeoff before any quote exists

```
Estimator opens AI Takeoff Lab
  → Uploads file (future Lab v4 feature)
  → quote_files row created
      organization_id = (org)
      quote_id        = NULL              ← no quote yet
      status          = active
  → quote_takeoff_jobs row created (quote_id = NULL — allowed after migration)
  → quote_files.takeoff_job_id → job
  → Takeoff result reviewed and approved in Lab
  → Estimator creates Internal Estimate from approved measurements
  → quote_headers row created (internal_quote)
  → quote_files.quote_id backfilled → file now linked to quote
  → quote_takeoff_jobs.quote_id backfilled
  → quote_file_events: action = linked_to_quote
  → Full audit trail preserved from pre-quote upload through final quote
```

### D. Quote Library / sold estimate handoff

```
Quote marked sold (quote_status = 'sold' or similar)
  → Related quote_files remain attached (not deleted)
  → Quote Library handoff panel shows:
      - Cabinet plans (file_role = cabinet_plan)
      - Signed approval (file_role = signed_quote)
      - Customer PDF (file_role = customer_pdf)
      - AI Takeoff result (via takeoff_results.import_plan_json)
  → Future Moraware handoff action:
      - Backend downloads file from storage (signed URL)
      - Sends file to Moraware or marks for manual upload
      - quote_file_events: action = sent_to_moraware
          metadata = { moraware_job_id, outcome, sent_by_user_id }
```

### E. Generated customer PDF storage

```
Future: customer estimate PDF generation
  → Backend generates PDF
  → Stores in eliteos-quote-files bucket
  → quote_files row created
      file_role   = customer_pdf
      visibility  = customer  (or internal initially)
      quote_id    = quote_headers.id
  → Available in Quote Library / handoff for download and Moraware
```

---

## Security and RLS plan

**Bucket policy:** Private — no public read. All access via signed URL (server-side only).

**Backend authorization before issuing signed URL:**
1. Confirm `quote_files.organization_id` matches the requesting session's org
2. Confirm `quote_files.status = 'active'` (not deleted or archived)
3. Confirm requester has access to the linked quote/partner account
4. Issue signed URL (short TTL — e.g. 1 hour)
5. Log in `quote_file_events` (action `downloaded`)

**Never expose `storage_path` directly** to untrusted clients — it reveals org ID and quote structure.

**Planned RLS tiers (not yet applied):**

| Role | Access |
|---|---|
| Service role (backend) | Full — all org files |
| Internal staff (org member) | `SELECT/INSERT/UPDATE` where `organization_id = (session org)` |
| Partner user | `SELECT` where `partner_account_id = (session partner)` AND `visibility IN ('partner', 'customer')` |
| Customer | `SELECT` where `visibility = 'customer'` AND quote ownership verified in app layer |
| Anon | No access |

RLS policies will be applied in a separate slice once backend read/write patterns are confirmed. Until then, all access is via service role behind backend auth gates.

---

## Files shipped in this slice

```
backend-core/supabase/
  eliteos_quote_files_takeoff_storage.sql   SQL draft (DO NOT APPLY YET)

backend-core/src/files/
  quoteFileStoragePath.mjs                  Pure path builder + filename sanitizer
  quoteFileStoragePath.test.mjs             Unit tests (10 test groups, all passing)

docs/eliteos/
  quote-files-storage.md                    This document
```

Scripts added to root `package.json`:
```bash
npm run eos:test:quote-file-storage   # 10 test groups, all passing
```

---

## What is NOT built in this slice

| Item | Status |
|---|---|
| SQL applied to Supabase | Not applied |
| Supabase Storage bucket created | Not created |
| Upload UI in Internal Estimate | Not built |
| Upload UI in AI Takeoff Lab | Not built |
| Signed URL generation endpoint | Not built |
| Moraware handoff file sending | Not built |
| RLS policies | Not applied |
| AI API calls for takeoff | Not built |

---

## Recommended next slice

1. **Apply SQL** — Run `eliteos_quote_files_takeoff_storage.sql` manually in Supabase SQL editor after review. Create the `eliteos-quote-files` bucket (private, no public read).
2. **Backend upload endpoint** — Supabase Storage `createSignedUploadUrl` via service role; write `quote_files` row; log `uploaded` event.
3. **Internal Estimate file panel** — Simple file list + upload button in Internal Estimate sidebar. No AI Takeoff yet.
4. **Quote Library handoff panel** — Show attached files; "Download" action issues signed URL.
5. **AI Takeoff Lab file input** — Wire file upload in Lab to `quote_files` + `quote_takeoff_jobs` pipeline.
