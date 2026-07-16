# Private Studio Deployment Readiness (DE.1.1)

**Do not execute these steps in DE.1.1 automation.** Prepared for a future controlled rollout.

---

## Domains (proposed — DNS not created)

| Surface | Domain | App |
|---------|--------|-----|
| Internal Studio | `https://elite100.eliteosfab.com` | `app-elite100-estimate-studio` |
| Public Digital Estimate | `https://digital.eliteosfab.com` | `app-digital-estimate` |
| Internal Estimate (unchanged) | `https://estimate.eliteosfab.com` | `app-internal-estimate` |

---

## Required server environment flags

```bash
# Studio (private pilot)
ELITE100_ESTIMATE_STUDIO_ENABLED=0
ELITE100_ESTIMATE_STUDIO_PILOT_USER_IDS=   # comma-separated auth user UUIDs
ELITE100_ESTIMATE_STUDIO_PILOT_EMAILS=    # optional secondary constraint
HEAD_URL_ELITE100_ESTIMATE_STUDIO=https://elite100.eliteosfab.com

# Digital Estimate backend
DIGITAL_ESTIMATE_API_ENABLED=0
DIGITAL_ESTIMATE_PUBLISH_ENABLED=0
DIGITAL_ESTIMATE_PUBLIC_READ_ENABLED=0
DIGITAL_ESTIMATE_CONFIGURATION_ENABLED=0
DIGITAL_ESTIMATE_PUBLIC_CONFIGURATION_ENABLED=0
DIGITAL_ESTIMATE_REVIEW_REQUESTS_ENABLED=0
DIGITAL_ESTIMATE_AMENDMENTS_ENABLED=0
HEAD_URL_DIGITAL_ESTIMATE=https://digital.eliteosfab.com
```

Never put pilot IDs/emails in `VITE_*`.

---

## Required Vite flags

**Studio**

```bash
VITE_ELITE100_ESTIMATE_STUDIO_UI_ENABLED=false
VITE_ELITE100_ESTIMATE_STUDIO_CONFIGURATION_UI_ENABLED=false
VITE_ELITE100_ESTIMATE_STUDIO_REVIEW_UI_ENABLED=false
VITE_BACKEND_URL=...
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_HEAD_URL_HOME=...
```

Configuration / review UI visibility is separate from Studio shell visibility. Vite flags never grant Brain access.

**Public Digital Estimate**

```bash
VITE_DIGITAL_ESTIMATE_CONFIGURATION_UI_ENABLED=false
VITE_DIGITAL_ESTIMATE_REVIEW_UI_ENABLED=false
VITE_BACKEND_URL=...
# no Supabase; token-only public head
```

New Studio-generated customer links use fragment form `/e#<token>` (DE.2E). Amendment replacement links use the same form (DE.2F). Legacy path tokens remain readable on the public head.

---

## Migration dependency

Apply **manually** when ready (order matters; do not apply in DE.2F automation):

1. `backend-core/supabase/eliteos_digital_estimate_v1.sql`
2. `eliteos_digital_estimate_configuration_v1.sql`
3. `eliteos_digital_estimate_public_configuration_v1.sql`
4. `eliteos_digital_estimate_amendment_v1.sql`

Not applied by DE.1 / DE.1.1 automation.

---

## Exact future rollout steps (checklist)

1. **Apply migration** `eliteos_digital_estimate_v1.sql` to staging, verify RLS/RPC grants.
2. **Deploy internal Studio** (`app-elite100-estimate-studio`) to `elite100.eliteosfab.com` (or staging host).
3. **Deploy public Digital Estimate** (`app-digital-estimate`) to `digital.eliteosfab.com` (or staging).
4. **Set Brain env** Studio + Digital Estimate flags (start with Studio + API + publish only; public-read off until smoke test).
5. **Configure domains / CORS** via `HEAD_URL_ELITE100_ESTIMATE_STUDIO` and `HEAD_URL_DIGITAL_ESTIMATE`.
6. **Register Studio head** already in catalog/slug list — confirm production Brain includes DE.1.1 code.
7. **Assign only the owner** `elite100_estimate_studio` via System Admin Access Scope (`user_head_access`). Do not use role defaults (none exist).
8. **Enable only the owner pilot gate** — set `ELITE100_ESTIMATE_STUDIO_PILOT_USER_IDS=<owner uuid>` (optional email). Set `ELITE100_ESTIMATE_STUDIO_ENABLED=1`.
9. **Publish a synthetic estimate** from Studio against a non-customer test quote.
10. **Test public portal** with `DIGITAL_ESTIMATE_PUBLIC_READ_ENABLED=1` using the one-time link; confirm revoke.
11. **Disable / roll back:**
    - Instant: set `ELITE100_ESTIMATE_STUDIO_ENABLED=0` and/or all `DIGITAL_ESTIMATE_*=0`
    - Access: remove `user_head_access` row; clear pilot lists
    - Public: turn off `DIGITAL_ESTIMATE_PUBLIC_READ_ENABLED`
    - Existing IE / QL / delivery remain unaffected (no DE UI there)

---

## How existing production tools stay unaffected

- Internal Estimate and Quote Library have **no** DE employee UI after DE.1.1 restore.
- Studio and DE routes are flag-gated and fail closed when off.
- Empty pilot lists authorize nobody.
- Public Digital Estimate is not a launcher staff head.
