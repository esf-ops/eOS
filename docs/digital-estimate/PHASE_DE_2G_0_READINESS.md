# Phase DE.2G.0 — Private Synthetic Deployment Readiness and Guardrails

**Date:** 2026-07-16
**Status:** Readiness only — **no deploy, no SQL apply, no DNS, no grants, no production flags.**
**Do not begin DE.2G.1** until blockers in §12 are cleared and Gates 1–12 are explicitly authorized.

---

## 1. Objective

Prepare Elite 100 Estimate Studio + public Digital Estimate for a **private synthetic-only** pilot where:

- only the owner/pilot reaches Studio
- other employees cannot see or use Studio
- only allowlisted synthetic publication IDs reach the public portal
- no real customer publications are publicly usable
- no outbound email
- IE / QL / Takeoff / delivery / Pricing Admin unchanged
- every surface has an independent server kill switch

---

## 2. Deployment states

| State | Meaning |
|-------|---------|
| `OFF` | All server feature flags off; no mounts / no repo init |
| `PRIVATE_STUDIO_ONLY` | Studio (+ API) for pilot; public read/config off |
| `SYNTHETIC_PUBLICATION_PILOT` | Public on + `DIGITAL_ESTIMATE_SYNTHETIC_PILOT_ONLY≠0` + allowlist |
| `REAL_CUSTOMER_PILOT_BLOCKED` | Public on while synthetic-only explicitly `0` — **not authorized in DE.2G.0** |

Derived by `resolveDigitalEstimateDeploymentState()` (`deploymentState.mjs`).

---

## 3. Synthetic publication guard

| Env | Default | Behavior |
|-----|---------|----------|
| `DIGITAL_ESTIMATE_SYNTHETIC_PILOT_ONLY` | **ON** (unset ⇒ on; only `"0"` disables) | Public surfaces require allowlist |
| `DIGITAL_ESTIMATE_SYNTHETIC_PUBLICATION_IDS` | empty | Empty ⇒ **fail closed** (no public pubs) |

Rules:

- Server UUID allowlist only (normalized, max 64, no `*` / `all`)
- Browser `synthetic=true` / name / `example.com` **never** grants access
- Guards: legacy v1 path token, v2 session exchange/resume/selections, review requests
- Amendment **replacement** publication IDs must be allowlisted separately before public use
- Studio shows: **“Replacement publication awaiting synthetic allowlist”** (staff only; public stays generic 404)

Implementation: `syntheticPilotGuard.mjs`.

---

## 4. Studio pilot guard

Already enforced on Studio routes:

1. `requireAuth`
2. internal operator (`assertInternalQuoteOperator`)
3. `ELITE100_ESTIMATE_STUDIO_ENABLED=1`
4. `requireHeadAccess("elite100_estimate_studio")`
5. `requireElite100EstimateStudioPilot` (user ID primary; email optional secondary)
6. org context from auth — never body/query

Empty pilot lists ⇒ nobody. Vite UI flags never grant access.

**Note:** `requireHeadAccess` admin bypass still exists for recovery surfaces; **pilot middleware** remains the binding Studio gate for non-listed users (including admins who are not pilots).

---

## 5. Head-access grant procedure (do not execute in DE.2G.0)

Slug `elite100_estimate_studio` is already in `EOS_HEAD_SLUGS` / launcher catalog (hidden unless grant + pilot).

Manual steps (System Admin → Access Scope):

1. Confirm slug registered in production Brain build.
2. Assign **only** the owner user `user_head_access.head_slug = elite100_estimate_studio`.
3. Confirm another employee: no launcher tile; direct Studio URL/API → 403.
4. Set `ELITE100_ESTIMATE_STUDIO_PILOT_USER_IDS=<owner uuid>` (optional email).
5. Revoke: delete `user_head_access` row + clear pilot env; leave other heads untouched.

Do **not** use role defaults.

---

## 6. Backend / frontend env matrix (safe defaults)

See `PRIVATE_SYNTHETIC_DEPLOYMENT_RUNBOOK.md` §Env. All feature flags default **off**. Synthetic-only defaults **on**.

---

## 7. Migration audit (unapplied)

Order + checksums: `MIGRATION_CHECKSUMS_DE_2G_0.json`.

| # | File | Notes |
|---|------|-------|
| 1 | `eliteos_digital_estimate_v1.sql` | Publications, snapshots, tokens, events, publish RPC |
| 2 | `eliteos_digital_estimate_configuration_v1.sql` | Envelopes, sessions, calcs, activate RPC |
| 3 | `eliteos_digital_estimate_public_configuration_v1.sql` | Public session columns + selection/calc RPC |
| 4 | `eliteos_digital_estimate_amendment_v1.sql` | Review requests, amendments, publish-amendment RPC |

Verified statically: additive; no `quote_headers` DML; SECURITY DEFINER RPCs revoke PUBLIC/anon/authenticated and grant `service_role`; fixed `search_path` on RPCs; RLS + revokes. **Do not apply in this phase.**

Preflight (read-only):
`node backend-core/scripts/digitalEstimateSyntheticPreflight.mjs`

---

## 8. Synthetic fixture strategy (blocker documented)

Publish currently requires an eligible saved Elite 100 `quote_headers` row (`publishDigitalEstimate` → eligibility).

**DE.2G.0 does not auto-insert fake production quotes.**

Recommended path for a later authorized gate:

1. Staging org only, or
2. Explicitly labeled **synthetic staging quote** created manually by owner (example.com identity, fictional project), never a real customer, then
3. Publish from Studio → capture publication UUID → add to `DIGITAL_ESTIMATE_SYNTHETIC_PUBLICATION_IDS` → redeploy/restart Brain env.

Watt’s / Spahn membership tests use **isolated fixture org data** in memory/staging policy tables — never real account IDs.

Scenario label: Example Homes LLC / Digital Estimate Synthetic Kitchen (Kitchen + Island).

---

## 9. Health / diagnostics

`GET /api/elite100-estimate-studio/diagnostics` (pilot staff stack):

- deployment state, flag booleans, synthetic allowlist **count** (not IDs)
- head URL configured booleans, pilotAuthorized, process-local limiter note
- never secrets, tokens, DB URLs, allowlist IDs, customer data

---

## 10. Kill switches (independent)

| Switch | Env |
|--------|-----|
| Studio | `ELITE100_ESTIMATE_STUDIO_ENABLED` |
| Publish | `DIGITAL_ESTIMATE_PUBLISH_ENABLED` |
| Public read | `DIGITAL_ESTIMATE_PUBLIC_READ_ENABLED` |
| Config schema/API | `DIGITAL_ESTIMATE_CONFIGURATION_ENABLED` |
| Public config | `DIGITAL_ESTIMATE_PUBLIC_CONFIGURATION_ENABLED` |
| Review requests | `DIGITAL_ESTIMATE_REVIEW_REQUESTS_ENABLED` |
| Amendments | `DIGITAL_ESTIMATE_AMENDMENTS_ENABLED` |
| Synthetic public rail | `DIGITAL_ESTIMATE_SYNTHETIC_PILOT_ONLY` + allowlist |

Off ⇒ route unmount / generic errors; data preserved; no email.

---

## 11. Distributed rate limiting

Process-local limiter remains. Synthetic allowlist is mandatory for any public exposure.
**REAL_CUSTOMER_PILOT = BLOCKED** until shared/distributed limiting + approvals exist.

---

## 12. Exact blockers before DE.2G.1

1. Explicit authorization to apply migrations (Gate 3)
2. Backend + head deploys with DNS (Gates 4–5, 9) — not done here
3. Owner-only head grant + pilot UUID (Gate 6) — not done here
4. Synthetic fixture quote strategy approved (Gate 7 blocker if no staging quote path)
5. Population of synthetic publication allowlist after publish (Gate 8)
6. Distributed rate limiting for any real-customer consideration
7. Security / pricing / ops review for REAL_CUSTOMER_PILOT

---

## 13. Tests

```bash
node backend-core/src/digitalEstimate/phaseDe2g0.test.mjs
node backend-core/scripts/digitalEstimateSyntheticPreflight.mjs
# plus DE.1–DE.2F regressions (prior suites set SYNTHETIC_PILOT_ONLY=0 for unit isolation)
```
