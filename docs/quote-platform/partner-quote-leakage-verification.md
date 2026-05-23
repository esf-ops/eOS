# Partner Quote — leakage verification (internal pilot)

**Status:** Required before any **external** partner login.  
**Script:** `backend-core/src/scripts/verifyPartnerQuoteLeakage.mjs`  
**RLS:** Draft only — `backend-core/supabase/partner_quote_rls_draft.sql` (do **not** apply until app + service-role paths are validated).

This document describes how to prove **partner A cannot see partner B** data through partner-quote APIs. It does **not** replace production security review or RLS rollout.

---

## What the script verifies

| Check | Method |
|-------|--------|
| User A → context for partner A | `GET /api/partner-quote/context?partnerAccountId=A` → 200 |
| User A → context for partner B | Same → **403** (`partner_account_forbidden` or similar) |
| User B → context for partner B | 200 |
| User B → context for partner A | **403** |
| User A/B blocked from internal quote | `POST /api/internal-quotes/calculate` → **403** `partner_use_partner_routes` |
| User A/B blocked from quote library | `GET /api/quote-library/quotes` → **403** |
| User A/B blocked from generic quote API | `POST /api/quote/submit` → **403** |
| Submit under A | DB: `quote_source=partner_quote`, `partner_account_id=A`, `created_by_user_id=A` |
| Submit under B | DB: `partner_account_id=B` |
| My quotes A | List includes A quote, **not** B quote id |
| My quotes B | List includes B quote, **not** A quote id |
| Calculate payload | No `wholesale` / `profit` fields in JSON (partner-safe DTO) |

The script uses **service role** only for preflight and post-submit DB assertions. All authorization tests use **user JWTs** (same as the app).

---

## Required test data (no hardcoded partner names in code)

Use **two separate test users** and **two partner accounts** in the **same organization** (e.g. your internal `skogman-test` and `testing` rows — configure IDs via env, not in source).

### 1. Partner accounts (`quote_partner_accounts`)

- **Partner A** and **Partner B** — different UUIDs, same `organization_id`, `is_active` / `status=active`.
- Each has an **active** row in `quote_partner_pricing_assignments`.

### 2. Users (`user_profiles` + auth)

- **User A** — `user_kind = **dealer_partner**` (required for internal-route block tests).
- **User B** — `user_kind = **dealer_partner**`.
- Passwords known only to operators running the script.

### 3. `quote_partner_user_access`

| user | partner_account_id | role | is_active |
|------|------------------|------|-----------|
| A | Partner A only | `partner_admin` or `partner_user` | true |
| B | Partner B only | `partner_admin` or `partner_user` | true |

**Do not** grant cross-access (A→B or B→A). Preflight fails if cross rows exist.

### 4. `user_head_access`

| user | head_slug |
|------|-----------|
| A | `partner_quote` |
| B | `partner_quote` |

### 5. Backend + SQL

- `backend-core` running and reachable at `EOS_API_BASE_URL`.
- `partner_quote_foundation_v1_additive.sql` applied.
- Quote platform tables present.

---

## Environment variables

Set in `backend-core/.env` (or export in shell). **All are required** unless noted.

| Variable | Purpose |
|----------|---------|
| `PARTNER_LEAK_TEST_CONFIRM` | Must be exactly `yes` or script exits |
| `SUPABASE_URL` | Project URL |
| `SUPABASE_ANON_KEY` | Sign-in as test users |
| `SUPABASE_SERVICE_ROLE_KEY` | Preflight + DB row checks only |
| `EOS_API_BASE_URL` | e.g. `http://localhost:3001` |
| `PARTNER_LEAK_USER_A_EMAIL` | Test user A |
| `PARTNER_LEAK_USER_A_PASSWORD` | Test user A password |
| `PARTNER_LEAK_USER_B_EMAIL` | Test user B |
| `PARTNER_LEAK_USER_B_PASSWORD` | Test user B |
| `PARTNER_LEAK_PARTNER_A_ID` | UUID of partner A |
| `PARTNER_LEAK_PARTNER_B_ID` | UUID of partner B |

Optional:

| Variable | Purpose |
|----------|---------|
| `PARTNER_LEAK_ORGANIZATION_ID` | Assert org matches partner rows |
| `PARTNER_LEAK_SKIP_SUBMIT=1` | Skip submit + DB write tests (context/routes/my-quotes only if quotes already exist) |
| `PARTNER_LEAK_MARKER_PREFIX` | Customer name prefix for submitted rows (default `PARTNER_LEAK_TEST`) |

Example block (replace UUIDs and emails):

```bash
PARTNER_LEAK_TEST_CONFIRM=yes
PARTNER_LEAK_USER_A_EMAIL=partner-a-test@example.com
PARTNER_LEAK_USER_A_PASSWORD=...
PARTNER_LEAK_USER_B_EMAIL=partner-b-test@example.com
PARTNER_LEAK_USER_B_PASSWORD=...
PARTNER_LEAK_PARTNER_A_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
PARTNER_LEAK_PARTNER_B_ID=yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy
```

---

## How to run safely

1. Use a **dev/staging** Supabase project, not production, unless explicitly approved.
2. Confirm test users are **not** real external customers.
3. Start **backend-core** (`npm run eos:server` or deployed API).
4. Run unit checks first:

   ```bash
   node backend-core/src/scripts/verifyPartnerQuoteFoundation.mjs
   ```

5. Run leakage script from repo root:

   ```bash
   cd backend-core
   # ensure .env has all PARTNER_LEAK_* vars and PARTNER_LEAK_TEST_CONFIRM=yes
   node src/scripts/verifyPartnerQuoteLeakage.mjs
   ```

6. On success: `ALL CHECKS PASSED`. Note emitted `quoteIdA` / `quoteIdB` for optional cleanup.
7. On failure: fix Partner Setup (access, assignments, `dealer_partner`, heads) before inviting anyone external.

**Side effects:** Creates two `quote_headers` rows with `customer_name` like `PARTNER_LEAK_TEST_A_<timestamp>` unless `PARTNER_LEAK_SKIP_SUBMIT=1`.

---

## RLS draft status

File: **`backend-core/supabase/partner_quote_rls_draft.sql`**

- **Draft / not auto-applied** — enabling RLS without updating all Brain service-role and migration paths can break internal tools.
- Policies scope `auth.uid()` to `quote_partner_user_access` and partner-scoped `quote_headers` (`quote_source = 'partner_quote'`).
- Apply only after:
  - This leakage script passes in target env.
  - Regression pass on Internal Estimate, Quote Library, Pricing Admin (service role).
  - Explicit FEATURE_DECISIONS / operator sign-off.

---

## Remaining external launch blockers

Even when this script passes:

1. **RLS not applied** — App-layer filters only; direct Supabase/anon access could still leak without policies.
2. **Leakage script not run in production** — Staging pass does not prove prod config.
3. **External invite flow not hardened** — Partner Setup assigns existing users only; no self-service onboarding audit.
4. **Partner-safe PDF / customer output** — Not finalized for dealers.
5. **Admin impersonation / support policy** — Undecided whether staff may act-as partner with audit.
6. **`dealer_partner` vs internal users** — Internal users with broad heads are not the same threat model as external partners.
7. **Null `organization_id` legacy rows** — Strict partner setup uses org filter; legacy admin list paths may still include null-org rows.

**Partner Quote remains internal-pilot only** until the above are addressed for your target environment.

---

## Related

- `docs/quote-platform/partner-quote-foundation-readiness.md` §17
- `docs/eliteos/FEATURE_DECISIONS.md` §27–28 (when added)
- `app-partner-quote/` — pilot UI (no change required for this script)
