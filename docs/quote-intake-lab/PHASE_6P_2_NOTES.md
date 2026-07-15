# Phase 6P.2 — Central Quote Intake Persistence, RLS, Audit, and Dedupe

**Date:** 2026-07-15

**Status:** Implemented (migration file created; **not applied**)

**Does not:** Graph, mailbox sync, Gemini, Takeoff jobs, Storage uploads, frontend, IE import, Quote Library, pricing, outbound email

---

## 1. Files added/modified

| Path | Role |
|------|------|
| `backend-core/supabase/eliteos_quote_intake_v1.sql` | Additive migration (manual apply only) |
| `backend-core/src/quoteIntake/supabaseQuoteIntakeRepository.mjs` | Central repository |
| `backend-core/src/quoteIntake/quoteIntakeRepositoryFactory.mjs` | memory / supabase selection |
| `backend-core/src/quoteIntake/quoteIntakeAuditSanitize.mjs` | Audit metadata sanitizer |
| `backend-core/src/quoteIntake/fakeQuoteIntakeSupabase.mjs` | Test fake client |
| `backend-core/src/quoteIntake/phase6p2.test.mjs` | Persistence / RLS text / factory tests |
| `backend-core/src/quoteIntake/quoteIntakeConfig.mjs` | Safe config includes `repositoryMode` |
| `backend-core/src/quoteIntake/quoteIntakeRepository.mjs` | Attachment hash dedupe; audit sanitize; immutable audit APIs |
| `backend-core/src/quoteIntake/quoteIntakeRoutes.js` | Factory wiring; await repo; fail-closed mount |
| `backend-core/src/quoteIntake/productionTakeoffAdapter.test.mjs` | Boundary assertion update |
| `backend-core/src/quoteIntake/README.md` | Package notes |
| `backend-core/src/server.js` | Comment only (still passes `getSupabase` for org/factory) |
| `docs/quote-intake-lab/PHASE_6P_2_NOTES.md` | This document |

---

## 2. Existing persistence/auth conventions discovered

| Convention | Source |
|------------|--------|
| Migration dir | `backend-core/supabase/` (flat SQL files; no `supabase/migrations/`) |
| Naming | `eliteos_*_v1.sql` |
| UUID | `gen_random_uuid()` + `pgcrypto` |
| Timestamps | `timestamptz not null default now()` |
| Org FK | `organization_id uuid not null references organizations(id) on delete restrict` |
| Brain DB client | **Service-role** `supabaseServerClient()` in `server.js` (bypasses RLS) |
| Org identity | `resolveOrganizationContext` from authenticated user / `user_profiles` |
| App org filter | Every query `.eq("organization_id", organizationId)` |
| Partial unique indexes | `WHERE col IS NOT NULL` pattern (partner/identity examples) |
| Sensitive staging | Sometimes REVOKE `anon`/`authenticated`; Quote Intake instead uses **org RLS** for authenticated + service_role grants |

**Implication:** Service-role Brain **must** keep organization filters. RLS protects Data API / JWT clients.

---

## 3. Migration filename

`backend-core/supabase/eliteos_quote_intake_v1.sql`

**Not applied** to any database in this phase.

---

## 4. Tables and important columns

### `quote_intake_cases`

`id`, `organization_id`, `status` (qil_*), `source_type`, `mailbox_identity`, `graph_immutable_message_id`, `internet_message_id`, `content_hash`, `from_address_hash`, `received_at`, `subject_hash`, `body_char_count` (no raw subject/body), `classification_state`, `priority`, `assigned_estimator_user_id`, `created_by_user_id`, `updated_by_user_id`, `lifecycle_state`, `created_at`, `updated_at`

### `quote_intake_attachments`

Metadata only: `intake_case_id`, `organization_id`, `source_attachment_id`, `safe_filename`, `mime_type`, `size_bytes`, `sha256`, `page_count`, `security_validation_state`, `storage_path_placeholder`, `ingest_state`, `created_at`

### `quote_intake_automation_decisions`

`path` (A/B), `reason_codes` jsonb, `decision_version`, `eligible`, `would_start_takeoff`, `reason_summary`, actor fields, timestamps

### `quote_intake_audit_events`

Append-only (`BEFORE UPDATE/DELETE` trigger raises). Sanitized `metadata` jsonb.

### `quote_intake_takeoff_links`

Structure-only. `takeoff_job_id uuid` **without FK** to `quote_takeoff_jobs`. `idempotency_key` unique per org.

---

## 5. RLS policy summary

- Helper: `quote_intake_user_organization_id()` from `user_profiles` for `auth.uid()`
- `ENABLE ROW LEVEL SECURITY` on all five tables
- `authenticated`: SELECT/INSERT (UPDATE on cases) **only when** `organization_id = quote_intake_user_organization_id()`
- Audit: no UPDATE/DELETE policies; DB trigger also blocks mutations
- `anon`: `REVOKE ALL`
- `service_role`: full DML (Brain); still filtered in repository
- Child org consistency triggers on attachments/decisions/audit/links
- Cases: `organization_id` immutable on UPDATE

### Function EXECUTE after PUBLIC revoke

| Function | `PUBLIC` / `anon` | `authenticated` | Notes |
|----------|-------------------|-----------------|-------|
| `quote_intake_user_organization_id()` | REVOKE ALL | **GRANT EXECUTE** | Required so authenticated RLS policies can call the helper |
| `quote_intake_audit_immutable()` | REVOKE ALL | REVOKE ALL (no grant) | Trigger-only |
| `quote_intake_touch_updated_at()` | REVOKE ALL | REVOKE ALL (no grant) | Trigger-only |
| `quote_intake_enforce_child_org()` | REVOKE ALL | REVOKE ALL (no grant) | Trigger-only |
| `quote_intake_cases_org_immutable()` | REVOKE ALL | REVOKE ALL (no grant) | Trigger-only |

Never `GRANT EXECUTE … TO anon` or `TO PUBLIC` on these functions.

### Authenticated table privileges

| Table | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| `quote_intake_cases` | yes | yes | yes (RLS) | no |
| `quote_intake_attachments` | yes | yes | no | no |
| `quote_intake_automation_decisions` | yes | yes | no | no |
| `quote_intake_audit_events` | yes | yes | no | no |
| `quote_intake_takeoff_links` | yes | yes | no | no |

---

## 6. Organization source of truth

Authenticated request → `resolveOrganizationContext` / injected `resolveOrganizationId` → repository methods.  
POST body / query / headers cannot set organization, actor, pilot email, or repository mode.

---

## 7. Repository selection behavior

| Env | Behavior |
|-----|----------|
| `QUOTE_INTAKE_API_ENABLED` unset | Routes not mounted |
| `QUOTE_INTAKE_REPOSITORY` unset / `memory` | `InMemoryQuoteIntakeRepository` (default) |
| `QUOTE_INTAKE_REPOSITORY=supabase` | `SupabaseQuoteIntakeRepository` via `getSupabase` |
| supabase without client | Fail closed — **not mounted**; no memory fallback |
| DB error at runtime | Normalized 503; **no** fallback to memory |

Never exposed via `VITE_*`.

---

## 8. Dedupe keys and constraints

| Key | Enforcement |
|-----|-------------|
| `(organization_id, internet_message_id)` | Partial unique index when Message-ID present (**primary**) |
| `(organization_id, content_hash)` | Partial unique **only when Message-ID is absent** (null/blank) — **fallback**; distinct Message-IDs with the same content hash do **not** merge |
| `(intake_case_id, sha256)` | Unique on attachments |
| `(organization_id, idempotency_key)` | Unique on takeoff links |
| Null Message-IDs with distinct content hashes | Allowed |

Repository pre-checks + unique-violation handling return `409 duplicate_message` with `existingCaseId` when possible.

### Security closeout (post-6P.2 audit)

- All helpers are `SECURITY INVOKER` with `set search_path = public`.
- After `REVOKE ALL … FROM PUBLIC`, RLS helper keeps a narrow `GRANT EXECUTE TO authenticated` (not anon/PUBLIC); trigger-only functions revoke authenticated/anon and get no JWT EXECUTE grant.
- Cases UPDATE policy has both `USING` and `WITH CHECK`; `organization_id` immutable via trigger.
- Authenticated: no `DELETE`; no `UPDATE` on non-case tables; no audit UPDATE/DELETE.
- Audit append-only via trigger (+ repository methods throw).
- Memory / API-off paths never call `getSupabase()` or construct `SupabaseQuoteIntakeRepository`.

---

## 9. Audit redaction/sanitization

`sanitizeQuoteIntakeAuditMetadata` rejects (strict) keys such as subject, body, addresses, bytes/base64, tokens, secrets, provider payloads. Applied before every audit insert (memory + supabase).

---

## 10–11. Attachment / Takeoff-link boundaries

- Attachments: metadata only; no Storage / `eliteos-quote-files`
- Takeoff links: structure only; adapter not invoked; no IE import method

---

## 12. Tests and results

Executed:

```bash
node backend-core/src/quoteIntake/quoteIntakeRepository.test.mjs
node backend-core/src/quoteIntake/quoteIntakeRoutes.test.mjs
node backend-core/src/quoteIntake/productionTakeoffAdapter.test.mjs
node backend-core/src/quoteIntake/phase6p2.test.mjs
node backend-core/src/takeoff/takeoffConfig.test.mjs
node --check … (routes, supabase repo, server.js)
git diff --check
```

All passed (0 failures).

Coverage includes: flag off, runtime re-check, memory + supabase parity, cross-org isolation, orgId spoof (6P.1 test retained), child org reject, Message-ID/content-hash dedupe, null Message-ID, race duplicate, attachment hash dedupe, takeoff-link idempotency, audit sanitize + immutable APIs, supabase misconfig fail-closed, migration SQL assertions, boundary (no Graph/Gemini/Takeoff providers/IE).

---

## 13–16. Confirmations

| Check | Result |
|-------|--------|
| Migration applied | **No** |
| External network / Supabase call | **No** (fake client only) |
| Graph / Gemini / Takeoff / Storage / IE / Quote Library | **None** |
| Production Takeoff tables modified | **No** |

---

## 17. Git status (expected)

```
 M backend-core/src/quoteIntake/…
 M backend-core/src/server.js
?? backend-core/supabase/eliteos_quote_intake_v1.sql
?? backend-core/src/quoteIntake/{supabase…,factory,audit,fake,phase6p2.test}
?? docs/quote-intake-lab/PHASE_6P_2_NOTES.md
```

---

## 18. Risks / open questions

1. `user_profiles.is_active` coalesce used — confirm column always present in all envs.
2. Service-role bypass means RLS is defense-in-depth; app bugs that omit org filter remain the main risk.
3. Migration not applied — API with `QUOTE_INTAKE_REPOSITORY=supabase` will 503 until applied.
4. Concurrent duplicates under extreme races: repository handles 23505; return shape uses `existingCaseId` when lookup succeeds.
5. Whether later to add `GRANT` for Data API vs keep Brain-only remains open; current design allows authenticated org access under RLS.

---

## 19. Recommended Phase 6P.3 scope

Protected Estimator Queue tab/view in live `app-ai-takeoff` (default workbench unchanged), fixture/central test data, pilot-gated UI calling `/api/quote-intake/*` — still no Graph sync and no automatic Takeoff.
