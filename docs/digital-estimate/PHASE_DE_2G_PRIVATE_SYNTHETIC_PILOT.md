# Phase DE.2G — Private Synthetic Digital Estimate Pilot

**Status:** **Stage 10 complete** — synthetic-only flags on; Stages 11–14 (publish, allowlist, E2E, kill switches) pending
**Approval:** `APPROVE_PRIVATE_SYNTHETIC_DEPLOYMENT`
**Branch:** `elite-100-digital-estimate` @ `6a3308c` (pushed)

---

## Stage 3 — Post-apply verification ✅

| Check | Result |
|-------|--------|
| DE tables | **23 tables** (`quote_publication*` + `digital_estimate_*`) |
| Key RPCs | `digital_estimate_publish_atomic`, `activate_configuration_envelope`, `save_selection_and_calculation`, `publish_amendment_atomic`, `replace_token_atomic`, `try_first_viewed` |
| RLS | **Enabled** on all DE tables |
| `service_role` RPC execute | **Granted** on key RPCs |
| `quote_publication_access_tokens` | **`token_hash` only** (no raw token column) |
| `anon`/`authenticated` table grants | **None** on sampled DE tables |
| `quote_headers` count | **634** (no migration DML) |
| Publications | **0** |

---

## Stage 4 — Brain deployment ✅

| Item | Value |
|------|-------|
| Vercel project | `backend-core` (`prj_JvK1y3Q56FUpAm4bLwSnnxqedjIP`) |
| Production URL | `https://api.eliteosfab.com` |
| Deploy | `dpl_H76K8FMx8sYNKNqZHkgjCtNi6LA2` (READY) |
| Health | `ok: true`, `environment: production` |
| DE routes (flags off) | Studio diagnostics **404**, public v1 **404** (fail-closed) |
| IE regression probe | `GET /api/internal-quotes` → **401** (unchanged auth gate) |

**Server env added (production):**

- `DIGITAL_ESTIMATE_SYNTHETIC_PILOT_ONLY=1`
- `HEAD_URL_DIGITAL_ESTIMATE=https://digital.eliteosfab.com`
- `HEAD_URL_ELITE100_ESTIMATE_STUDIO=https://elite100.eliteosfab.com`

**DE operational flags remain off** until Stage 10.

---

## Stage 5 — Studio head ✅ (Vercel default host)

| Item | Value |
|------|-------|
| Vercel project | `app-elite100-estimate-studio` (`prj_Uy6eaRM2sUQitwI1BdWK95L2WpOU`) |
| Production URL | `https://app-elite100-estimate-studio.vercel.app` |
| HTTP | **200** |
| Build | Monorepo deploy from repo root (includes `shared/eliteos-ui`) |
| Custom domain (pending DNS) | `elite100.eliteosfab.com` |

---

## Stage 6 — Public head ✅ (Vercel default host)

| Item | Value |
|------|-------|
| Vercel project | `app-digital-estimate` (`prj_04pdnxQewbQBEvXBd9nDt6pyGjJb`) |
| Production URL | `https://app-digital-estimate.vercel.app` |
| `/e` route | **200** |
| `VITE_BACKEND_URL` | `https://api.eliteosfab.com` |
| Supabase in bundle | **None** |
| Custom domain (pending DNS) | `digital.eliteosfab.com` |

---

## Stage 7 — DNS ✅

| Host | HTTPS |
|------|-------|
| `elite100.eliteosfab.com` | **200** |
| `digital.eliteosfab.com` | **200** |
| `api.eliteosfab.com` | Health **200** at `/api/health` |

---

## Stage 8 — Owner-only access ✅

| Check | Result |
|-------|--------|
| `user_head_access` grants for `elite100_estimate_studio` | **1** |
| `ELITE100_ESTIMATE_STUDIO_PILOT_USER_IDS` on Brain production | **Present** (encrypted) |
| Studio SPA (`elite100.eliteosfab.com`) | **200** |
| Unauthenticated Studio API (`/api/elite100-estimate-studio/*`) | **401** |
| Unauthenticated staff DE (`/api/digital-estimate/publications`) | **401** |
| IE unchanged (`/api/internal-quotes`) | **401** without auth |

---

## Stage 9 — Fictional fixture eligibility ✅

| Field | Result |
|-------|--------|
| Example Homes Elite 100 candidates | **1** |
| `internal_quote` | **true** |
| Not archived | **true** |
| `material_program_default = elite_100` | **true** |
| CDT positive | **true** |
| CDT matches `finalRounded` | **true** |
| No OOC rooms | **true** |
| Has rooms | **true** |
| Publications | **0** |

---

## Stage 10 — Minimum synthetic-only flags ✅

Brain production redeploy: `dpl_EVjyakQh2aahg2Je5bew12LRNcQT`

**Enabled (`=1`):**

- `DIGITAL_ESTIMATE_API_ENABLED`
- `DIGITAL_ESTIMATE_PUBLISH_ENABLED`
- `ELITE100_ESTIMATE_STUDIO_ENABLED`
- `DIGITAL_ESTIMATE_CONFIGURATION_ENABLED`
- `DIGITAL_ESTIMATE_PUBLIC_READ_ENABLED`
- `DIGITAL_ESTIMATE_PUBLIC_CONFIGURATION_ENABLED`
- `DIGITAL_ESTIMATE_REVIEW_REQUESTS_ENABLED`
- `DIGITAL_ESTIMATE_AMENDMENTS_ENABLED`
- `DIGITAL_ESTIMATE_SYNTHETIC_PILOT_ONLY`

**Still empty / off:**

- `DIGITAL_ESTIMATE_SYNTHETIC_PUBLICATION_IDS` (empty → public blocked)
- Real-customer mode (prohibited)

| Post-enable probe | Result |
|-------------------|--------|
| Brain health | **200** |
| Studio diagnostics (no auth) | **401** |
| Public fake token | **404** generic (`ok: false`) |
| CORS `digital.eliteosfab.com` → v2 session | **204** + `Allow-Origin` + `Allow-Credentials` |
| CORS `elite100.eliteosfab.com` → Studio | **204** |
| Public CSP / Referrer meta | **Present** in HTML |

---

## Stage 11 — Synthetic allowlist ✅ (publication unchanged)

| Check | Result |
|-------|--------|
| Publications in DB | **1 active**, **1 superseded** (unchanged) |
| `DIGITAL_ESTIMATE_SYNTHETIC_PUBLICATION_IDS` | **Set** on Brain production (exactly **1** entry) |
| `DIGITAL_ESTIMATE_SYNTHETIC_PILOT_ONLY` | **1** |
| Superseded publication | **Blocked** (not allowlisted) |
| Fake token exchange | **404** |
| Studio one-time link UI fix | **Deployed** to `elite100.eliteosfab.com` |

**Manual:** Chris must **Replace token** once to obtain a new one-time link (no automatic token issuance).

---

## Stage 10.5 — DE.2G lifecycle + DE.2H material migrations ✅ (2026-07-16)

| Check | Result |
|-------|--------|
| `material_catalog_contract` column | **Present** |
| Activate RPC revokes sessions on supersede | **Present** (`sessions_revoked`) |
| `service_role` EXECUTE on activate RPC | **Yes** |
| `anon` / `authenticated` EXECUTE on activate RPC | **No** |
| Lifecycle SQL checksum | Matches `MIGRATION_CHECKSUMS_DE_2G_SESSION_LIFECYCLE.json` |
| Material catalog SQL checksum | Matches `MIGRATION_CHECKSUMS_DE_2H_MATERIAL_CATALOG.json` |

**Follow-on:** Deploy Brain + Studio + public heads with color catalog; activate color-frozen envelope; synthetic browser smoke.

---

## Stages 12–14 — Pending

| Stage | Action |
|-------|--------|
| **12–14** | E2E smoke (after manual replace-token), kill-switch validation, IE/QL/Takeoff regression |

---

## Rollback switches

1. Clear `DIGITAL_ESTIMATE_SYNTHETIC_PUBLICATION_IDS`
2. Set all `DIGITAL_ESTIMATE_*` / `ELITE100_*` operational flags → `0`
3. Remove Studio head grant
4. Unpublish custom domains if needed
5. **Do not DROP** DE tables

---

## Remaining blockers before real-customer pilot

- Distributed rate limiting
- `DIGITAL_ESTIMATE_SYNTHETIC_PILOT_ONLY=1` must stay on
- Explicit real-customer authorization phase
