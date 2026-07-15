# Phase 6P.0 — Data and Security Boundary

**Date:** 2026-07-15
**Status:** Design only — **no migrations in this phase**

---

## 1. Why IndexedDB cannot host the live queue

`app-quote-intake-lab` persists cases in browser IndexedDB. That cannot support:

- Multiple estimators
- Shared org queue
- Durable audit
- Server-side Graph import
- Automatic Takeoff attribution

Local IndexedDB history is **disposable test data** — no automatic migration to production.

---

## 2. Central persistence recommendation

### Comparison

| Option | Pros | Cons |
|--------|------|------|
| Separate staging Supabase project | Isolation | Dual ops, dual auth friction, harder estimator SSO |
| **Existing production DB + additive `quote_intake_*` tables + strict RLS** | Shared auth/org; smallest live pilot; reversible cleanup migration | Must never join/write quote tables from intake automation |

**Recommendation:** Additive namespaced tables in the **existing** production Supabase project with:

- `organization_id` on every tenant row
- RLS (and/or service-role-only writes with explicit org checks mirroring takeoff)
- No FKs into `quote_headers` for automation
- Optional FK from `quote_intake_takeoff_links.takeoff_job_id` → `quote_takeoff_jobs` (read association only)
- Instant disable via feature flags without schema drops

Staging project remains useful for **dev load tests**, but the live pilot should not invent a second production identity system.

---

## 3. Proposed entity namespace (`quote_intake_*`)

Conceptual (not final; no SQL here):

| Entity | Purpose |
|--------|---------|
| `quote_intake_cases` | Case header, status, assignment |
| `quote_intake_source_messages` | Graph/SMTP metadata (hashed ids; bounded text) |
| `quote_intake_message_recipients` | To/Cc normalized |
| `quote_intake_attachments` | Filename meta, SHA-256, size, mime, storage pointer |
| `quote_intake_dedupe_keys` | Unique identities |
| `quote_intake_classification_runs` | Provider outputs + evidence |
| `quote_intake_reviewed_intake_snapshots` | Accepted classification snapshots |
| `quote_intake_missing_information` | Structured gaps |
| `quote_intake_automation_decisions` | Path A/B + gate codes |
| `quote_intake_takeoff_links` | Case ↔ takeoff job linkage |
| `quote_intake_audit_events` | Append-only audit |
| `quote_intake_assignments` | Estimator assignment |
| `quote_intake_status_history` | Status transitions |
| `quote_intake_sync_cursors` | Mailbox sync checkpoints |
| `quote_intake_reviewed_takeoff_snapshots` | Later optional |

**Do not** add email-specific columns to `quote_takeoff_jobs` unless unavoidable; prefer linkage + `metadata.intake` markers.

---

## 4. Storage

| Decision | Recommendation |
|----------|----------------|
| Plan bytes for automatic Takeoff | Reuse `eliteos-quote-files` via existing `quote_files` flow so Takeoff services work unchanged |
| Intake-only copies | Optional; avoid dual-byte ownership in pilot |
| Client exposure | Never return `storage_path` or bytes to browser beyond existing signed download patterns |

---

## 5. Authentication & pilot access

### Current Takeoff auth (inspected)

- Frontend: shared `.eliteosfab.com` Supabase cookie (`shared/eliteos-supabase`)
- API: Bearer JWT `requireAuth()`
- Head: `requireHeadAccess("ai_takeoff")` via `user_head_access`
- Org: server-derived `resolveOrganizationContext`

### Pilot design

| Layer | Rule |
|-------|------|
| Feature flag | `QUOTE_INTAKE_UI_ENABLED` (server + optional build flag for chrome) |
| Pilot users | Explicit allowlist (emails) **or** dedicated access grant checked server-side |
| Org scoping | All intake APIs org-scoped |
| Client hide | Non-pilots do not see Queue tab |
| Server enforce | Non-pilots get 403 on `/api/quote-intake/*` even if URL forced |
| Anonymous | Forbidden |
| Existing Takeoff users | Retain current workbench behavior |
| Estimator audit actor | Authenticated user id on review/acceptance |
| System actor | Distinct `actor_type=system` for automatic jobs |
| Salesperson identity | Captured from forwarded From + structured block; not assumed authoritative alone |

**Note:** `quote_intake_lab` is not currently in `EOS_HEAD_SLUGS`. Pilot may:

1. Gate under existing `ai_takeoff` + pilot claim, or
2. Add a new slug (e.g. `quote_intake`) in a later slice with migrations/grants

Prefer (1) for smallest pilot, then (2) if access must be separated.

---

## 6. Kill switches (independent)

| Switch | Pilot default |
|--------|---------------|
| Quote Intake UI | Pilot users only |
| Microsoft Graph | Disabled until configured |
| Mailbox sync | Manual initially |
| Automatic classification | Feature-flagged |
| Automatic Takeoff submission | Feature-flagged / off until 6P.6 |
| Real-plan transmission | **Disabled** until approved |
| Per-hour / per-day job limits | Enforced when auto on |
| Max concurrent automatic jobs | Enforced |
| Outbound email | **Disabled** |
| IE / Quote Library promotion | **Disabled** |

**Emergency:** one operator action disables sync + new automatic Takeoff without stopping interactive Takeoff users or already-running jobs.

---

## 7. Logging & privacy

Never log:

- Subjects, bodies, addresses
- Attachment names/bytes
- Tokens, secrets
- Full Graph resource IDs

Use correlation ids and SHA-256 prefixes. Same rule as Graph plan.

---

## 8. Hard guards against quote systems

Intake automation must not:

| Action | Guard |
|--------|-------|
| Call `import-from-takeoff` | No import in adapter surface; flag off |
| Write `quote_headers` | No module import paths |
| Quote Library records | No library API calls |
| Pricing | No `calculateQuote` for intake |
| Customer PDFs / email | No delivery adapters enabled |

Code review + tests should assert absence of these import paths on the automatic workflow.

---

## 9. Local-lab migration

| Item | Policy |
|------|--------|
| IndexedDB history | Disposable; do not migrate automatically |
| Fixtures / tests / offline benchmark | Retain in `app-quote-intake-lab` |
| Safe contracts/helpers | Share via reviewed extraction to backend pure modules when needed |
| Synthetic live cases | Recreate via mailbox forwards |
| Secrets | Never migrate from browser/local env into prod docs |
| Browser audit history | No copy into production without explicit future migration design |

---

## 10. Rollback data safety

- Flags off first
- Preserve `quote_intake_*` audit rows
- Stop new links/jobs
- Do not delete `quote_takeoff_*` production rows
- Drop intake tables only via deliberate cleanup migration after retention decision
- Rotate Graph secrets; remove Exchange RBAC if abandoning

---

## 11. Security audit checklist (SaaS)

Per workspace security rules:

1. **Org scope:** every new table/path uses `organization_id`.
2. **Server-side auth:** queue/sync/automation enforced in backend, not UI-only.
3. **Secrets:** Graph + Gemini keys never in `VITE_*` / browser.
4. **Cross-tenant:** Graph mailbox fixed; no client mailbox param.
5. **Traceability:** automation decisions + takeoff links + audit events required for writes.
