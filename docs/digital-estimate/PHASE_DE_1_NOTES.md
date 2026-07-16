# Phase DE.1 — Elite 100 Digital Estimate Read-Only Publish

**Date:** 2026-07-16 (closure verification same day)  
**Status:** Implemented + **closure-verified**; employee UI relocated in **DE.1.1** to Elite 100 Estimate Studio (see `PHASE_DE_1_1_NOTES.md`).  
**Branch:** `elite-100-digital-estimate`

> **DE.1.1 note:** Publish controls no longer live in Internal Estimate or Quote Library. Backend Digital Estimate + `app-digital-estimate` remain. Staff DE routes require Studio head + pilot allowlist.

---

## Closure verification (DE.1 only — DE.2 not started)

### 1. Publish atomicity

**Mechanism:** Postgres RPC `digital_estimate_publish_atomic` (single transaction, `SECURITY DEFINER`, `search_path = public`, execute granted to `service_role` only; revoked from `anon`/`authenticated`/`public`).

Order inside the transaction:

1. `FOR UPDATE` lock prior active publications for `(organization_id, quote_family_root_id)`
2. Supersede priors + revoke their tokens + append `superseded` events
3. Insert new publication (`active`)
4. Set `superseded_by_publication_id` on priors (after new row exists — FK-safe)
5. Insert immutable snapshot + access token hash + `published` event

Partial unique index `uq_quote_publications_one_active_per_family` enforces one current active publication per org+family. Concurrent publishers serialize on the row locks; failure rolls back the entire transaction — prior working publication is never revoked without a completed replacement.

**Supabase repository** calls the RPC only (no multi-statement app-simulated transaction).  
**Memory repository** mirrors the same all-or-nothing sequence under a family mutex with checkpoint rollback (tests).

### 2. Token replacement atomicity

**Mechanism:** Postgres RPC `digital_estimate_replace_token_atomic` — revoke prior active tokens, insert new hash, append `token_replaced` in one transaction. Unique partial index `uq_quote_publication_one_active_token` enforces one non-revoked token per publication. Failure rolls back to the prior usable token (never tokenless active). Concurrent replaces serialize via `FOR UPDATE` on publication + tokens (memory: publication mutex).

### 3. Public / internal route separation

| Surface | Auth |
|---------|------|
| `/api/digital-estimate/*` | `requireAuth` + internal operator + quote/quote_library head grant |
| `/api/public-digital-estimate/v1/:token` | Unauthenticated; token is sole authority |

- Public routes do not inherit staff middleware.
- Public DTO only (`buildPublicDigitalEstimateDto` allowlist).
- Public callers cannot supply org / quote / publication / snapshot IDs as authority.
- Distinct path prefixes — no wildcard collision with internal routes.
- Flags: `API` mounts routes; `PUBLISH` gates mutations; `PUBLIC_READ` gates public GET. API off → `maybeAttachDigitalEstimateRoutes` returns without repository init or side effects.

### 4. Elite 100 eligibility authority

**Evidence source:** Persisted `quote_headers.calculation_snapshot` only.

- Internal Estimate save (`internalQuotesApi.js`) **hardcodes** `internal_ui.material_program_default: "elite_100"` server-side — not taken from a publish-body claim.
- Publish rejects body keys `material_program_default` / `materialProgramDefault` / `elite_100`.
- Assessed by `assessElite100PublicationEligibility`: missing program ⇒ `elite_100_eligibility_ambiguous`; non-elite / OOC rooms / archived / non-`internal_quote` rejected.
- CDT + print snapshot checked on the **same** calculation_snapshot; org scoped via session `organizationId` + `getQuoteHeader(..., organizationId)`.

### 5. Migration security (unapplied)

`backend-core/supabase/eliteos_digital_estimate_v1.sql` audited:

- Fixed `search_path = public` on functions
- Narrow grants (table access revoked from anon/authenticated; RPC execute to service_role)
- RLS enabled on all four tables; no anon policies
- Org immutability triggers; child org-match triggers
- Immutable snapshots + append-only events
- FKs with restrict/cascade as documented; no token columns on `quote_headers`
- Partial uniques for one active publication, one active token, one `first_viewed`
- Raw tokens never stored (`token_hash` only)

**Not applied** in this phase.

### 6. Public token and logging

Raw token absent from DB fixtures, app logs (path redaction helper), audit/event metadata, error messages, QL timeline metadata, and server test dumps.

**Hosting access logs:** Path tokens in `/e/:token` and `/api/public-digital-estimate/v1/:token` appear in **platform/CDN/proxy access logs** unless the host redacts them. Application redaction does **not** control provider access logs. Production mitigation required: CDN/proxy path redaction or token-in-fragment/header delivery (DE.2+), short TTL, and revoke-on-leak runbook. Do not claim app-layer redaction covers hosting logs.

CSP + `Referrer-Policy: no-referrer` on public API responses; HTML shell (`app-digital-estimate/index.html`) sets CSP meta + referrer no-referrer.

### 7. Public snapshot immutability

Tests prove: `update_existing`-style header mutation, new revision rows, calculator/pricing fixture drift, and source archive do not change public DTO. Only an explicit new publication (superseding) changes customer-visible data.

### 8. View events

`digital_estimate_try_first_viewed` + unique partial index → `first_viewed` once under concurrency. Subsequent `viewed` events throttled. Event-write / token-access-count failures are swallowed — safe read continues (fail-open for telemetry only).

### 9. Quote Library soft integration

`quoteLibraryApi` loads `quote_publication_events` via `safeSelect`; missing table / errors soft-skip. Timeline `type: "digital_estimate"` is additive only — detail response still succeeds without DE migration/flags.

### 10. Regression (closure run)

| Suite | Result |
|-------|--------|
| `phaseDe1.test.mjs` | PASS (incl. atomicity, concurrency, immutability, migration surface) |
| `app-digital-estimate` UI tests | PASS |
| `app-digital-estimate` build | PASS |
| IE unit tests (`enteredByDefaults`, `quoteFilePanelHelpers`) | PASS |
| IE build | PASS |
| `quoteOutputGate.test.mjs` | PASS |
| `quoteLibrarySearch` / `quoteLibraryArchive` | PASS |
| `node --check` on DE + QL touchpoints | PASS |
| `git diff --check` | PASS |
| `quoteDelivery.test.mjs` assertions | PASS (`quoteDelivery tests: all passed`) |
| `quoteDelivery.test.mjs` process exit | **Pre-existing hang** after pass |

**quoteDelivery hang diagnostic (bounded):**

1. Suite prints `quoteDelivery tests: all passed` in ~2–3s.
2. Node process remains open (`stillOpen=true`) with only PIPE/KQUEUE FDs (`lsof`) — no child Chromium under the test PID when `PUPPETEER_EXECUTABLE_PATH` points at a nonexistent binary.
3. Hard timeout (60–120s) yields shell exit `142` (SIGALRM) after assertions already succeeded.
4. Isolated `renderHtmlToPdfBytes` with real macOS Chrome completes in ~620ms when forced `process.exit(0)`.
5. **No files under `backend-core/src/quoteDelivery/` are modified by DE.1** (`git status` / `git diff --name-only` confirm). Hang is outside the DE change set.

---

## Eligibility predicate (authoritative)

Publish succeeds only when **all** of:

1. `quote_source === "internal_quote"`
2. Explicit `calculation_snapshot.internal_ui.material_program_default` (or root `materialProgramDefault`) === `"elite_100"` — missing ⇒ ambiguous
3. No room resolves to `out_of_collection`
4. `customer_display_total` present and positive; print snapshot `finalRounded` matches when present (same snapshot)
5. Not archived; quote belongs to authenticated organization

Module: `digitalEstimateEligibility.mjs`

---

## Snapshot model

At publish, Brain copies into `quote_publication_snapshots`:

- `customer_snapshot_json` — allowlisted customer-safe document
- `pricing_evidence_json` — internal evidence including full `calculationSnapshotCopy` (never public)

Public GET reads **only** `customer_snapshot_json`. Tokens never point at live `quote_headers`.

---

## Token lifecycle

1. `crypto.randomBytes(32)` → base64url raw token  
2. Store SHA-256 hex only (`token_hash`)  
3. Return raw token once on publish/replace  
4. Public verify: hash lookup + constant-time digest compare  
5. Revoke / replace / access expiry / superseded → generic `{ ok:false, error:"Not found" }`  
6. Never log raw token (path redaction helper)

---

## Routes

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/digital-estimate/config` | staff |
| POST | `/api/digital-estimate/publications` | staff + confirm |
| GET | `/api/digital-estimate/publications?quoteId=` | staff |
| GET | `/api/digital-estimate/publications/:id` | staff |
| POST | `/api/digital-estimate/publications/:id/revoke` | staff + confirm |
| POST | `/api/digital-estimate/publications/:id/replace-token` | staff + confirm |
| POST | `/api/digital-estimate/publications/:id/events/link-copied` | staff |
| GET | `/api/public-digital-estimate/v1/:token` | public + rate limit |
| GET | `/api/public-digital-estimate/v1/:token/print` | public |

Mounted only when `DIGITAL_ESTIMATE_API_ENABLED=1` via `maybeAttachDigitalEstimateRoutes` from `quoteRoutes.js`.

---

## Flags (default OFF)

| Flag | Role |
|------|------|
| `DIGITAL_ESTIMATE_API_ENABLED` | Mount routes (no mount ⇒ no repo init) |
| `DIGITAL_ESTIMATE_PUBLISH_ENABLED` | Allow publish/revoke/replace |
| `DIGITAL_ESTIMATE_PUBLIC_READ_ENABLED` | Allow public GET |
| `VITE_DIGITAL_ESTIMATE_UI_ENABLED` | IE panel visibility (`true`) |
| `HEAD_URL_DIGITAL_ESTIMATE` | Customer link base (documented `https://digital.eliteosfab.com`) |

`estimate.eliteosfab.com` untouched (IE alias). No DNS created for digital host.

---

## Events

`published`, `link_copied` (manual copy — **not** “sent”), `first_viewed`, `viewed`, `revoked`, `token_replaced`, `superseded`.

View metadata: truncated IP hash + coarse UA family only.

Quote Library timeline: soft-additive `type: "digital_estimate"` when table exists.

---

## Print

Public head uses browser print + print stylesheet. Existing quote-delivery PDF/Resend unchanged.

---

## Migration

`backend-core/supabase/eliteos_digital_estimate_v1.sql` — **created, not applied**.

Tables + RPCs + RLS/grants/uniques/triggers as in §5 above.

---

## Out of scope (confirmed)

Customer config, autosave, amendments, uploads, acceptance, automated email, Takeoff automation, reprice-on-view, sold, Moraware/QB, non–Elite 100 publish, DNS/deploy, **DE.2**.
