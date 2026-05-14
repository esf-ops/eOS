# eliteOS domain routing plan (Vercel + Cloudflare)

**Purpose:** Single checklist for **production hostnames**, **Vercel projects**, **DNS (Cloudflare)**, **Supabase Auth redirects**, and **eliteOS Brain** CORS (`ALLOWED_ORIGINS` / `EOS_ALLOWED_ORIGINS`). **No trailing slashes** in origins or hostnames in this document.

**Rule:** Exact browser origins must be allowed on **`backend-core`** (plus each head’s Vercel preview URL while staging). `backend-core/src/server.js` includes a baseline list for **`*.eliteosfab.com`** and `http://localhost:5177` (app-home); add **preview** hosts via env.

---

## 1. Vercel projects (root directory → hostname)

| # | Vercel project | Monorepo root | Production hostname |
|---|----------------|---------------|------------------------|
| 1 | **app-home** (eliteOS Home) | `app-home/` | `https://www.eliteosfab.com` |
| 2 | **app-quote** (eliteOS Public Quote Head) | `app-quote/` | `https://quote.eliteosfab.com` |
| 3 | **app-internal-estimate** (eliteOS Internal Estimate Head) | `app-internal-estimate/` | `https://internal.eliteosfab.com` **or** `https://estimate.eliteosfab.com` (pick one CNAME; both can exist if product wants aliases) |
| 4 | **app-pricing-admin** (eliteOS Pricing Admin Head) | `app-pricing-admin/` | `https://pricing.eliteosfab.com` |
| 5 | **app-system-admin** (eliteOS System Admin Head) | `app-system-admin/` | `https://system.eliteosfab.com` |
| 6 | **backend-core** (eliteOS Brain API) | `backend-core/` | **`https://api.eliteosfab.com`** (future); today often a `*.vercel.app` API URL |

For each project, set **Vercel → Settings → Domains** to the row above. Use **Vercel’s exact DNS target** shown in the UI (do not guess CNAME targets).

---

## 2. Cloudflare DNS (example)

| Hostname | Type | Target |
|----------|------|--------|
| `www` | CNAME | Vercel target for **app-home** |
| `quote` | CNAME | Vercel target for **app-quote** |
| `internal` or `estimate` | CNAME | Vercel target for **app-internal-estimate** |
| `pricing` | CNAME | Vercel target for **app-pricing-admin** |
| `system` | CNAME | Vercel target for **app-system-admin** |
| `api` | CNAME | Vercel target for **backend-core** (when ready) |

**Apex `eliteosfab.com`:** Redirect to `https://www.eliteosfab.com` (301) at Cloudflare or Vercel, consistent with Supabase **Site URL** below.

**Proxy:** Follow your existing Cloudflare “orange cloud” / SSL mode; ensure HTTPS end-to-end with Vercel.

---

## 3. Supabase Auth (Dashboard → Authentication → URL configuration)

- **Site URL:** `https://www.eliteosfab.com`
- **Redirect URLs (required patterns; add exact preview URLs as needed):**
  - `https://www.eliteosfab.com/**`
  - `https://eliteosfab.com/**`
  - `https://system.eliteosfab.com/**`
  - `https://internal.eliteosfab.com/**`
  - `https://estimate.eliteosfab.com/**`
  - `https://pricing.eliteosfab.com/**`
  - `https://quote.eliteosfab.com/**`
  - `http://localhost:5173/**` (default Vite; only if used)
  - `http://localhost:5174/**` — **app-brain-health** (eliteOS Brain Health Head)
  - `http://localhost:5175/**` — **app-executive** (eliteOS Executive Head)
  - `http://localhost:5176/**` — **app-system-admin** (eliteOS System Admin Head)
  - `http://localhost:5177/**` — **app-home** (eliteOS Home)
  - `http://localhost:5178/**` — **app-sales** (eliteOS Sales Head)
  - `http://localhost:5179/**` — **app-quote** (eliteOS Public Quote Head)
  - `http://localhost:5180/**` — **app-internal-estimate** (eliteOS Internal Estimate Head)
  - `http://localhost:5182/**` — **app-pricing-admin** (eliteOS Pricing Admin Head)

**Invite / magic-link completion:** System Admin sends invites via **`backend-core`** (`inviteUserByEmail`). Set on **backend-core Vercel**:

- **`SUPABASE_INVITE_REDIRECT_URL`** = `https://www.eliteosfab.com/auth/callback`  
  (Must appear in the Supabase redirect allowlist above.)

Fallbacks in code (if unset): `ELITEOS_HOME_URL` / `HEAD_URL_HOME` / legacy invite envs, then **`https://www.eliteosfab.com/auth/callback`**. Localhost values from `SITE_URL` are **ignored** for invite/recovery redirects so production emails do not point at `http://localhost:3000`.

**app-home SPA routing:** `app-home/vercel.json` rewrites unknown paths to `index.html` so **`/auth/callback`** is not a Vercel 404. After deploy, invite links land in **eliteOS Home**, which parses Supabase tokens (hash or PKCE query), optional **set password** step, then the launcher.

### 3.1 Manual test — System Admin invite (after env + redeploy)

1. Supabase **Site URL** = `https://www.eliteosfab.com`.
2. Redirect allowlist includes `https://www.eliteosfab.com/**`.
3. **backend-core** env has `SUPABASE_INVITE_REDIRECT_URL=https://www.eliteosfab.com/auth/callback`.
4. Redeploy **backend-core**; redeploy **app-home** if `app-home` changed.
5. Send a **new** invite from System Admin.
6. Invite email should **not** mention localhost; **Accept** should open **www** (not 404).
7. Complete password (or skip), confirm **launcher** and **assigned heads**.

---

## 4. eliteOS Brain / API CORS (`backend-core` Vercel env)

Set **`EOS_ALLOWED_ORIGINS`** and/or **`ALLOWED_ORIGINS`** (comma-separated, **no trailing slashes**), including:

- `https://www.eliteosfab.com`
- `https://eliteosfab.com`
- `https://quote.eliteosfab.com`
- `https://internal.eliteosfab.com` and/or `https://estimate.eliteosfab.com`
- `https://pricing.eliteosfab.com`
- `https://system.eliteosfab.com`
- Each active **`https://*.vercel.app`** preview origin used by the heads above

`backend-core` also resolves **deployment URLs** for the launcher from **`HEAD_URL_*`** (see `backend-core/.env.example`).

---

## 5. Head URL env vars (Brain)

Canonical keys live in `backend-core/src/me/headDeploymentUrls.js`. Minimum set for current heads:

| Env var | Head / meaning |
|---------|------------------|
| `HEAD_URL_PUBLIC_QUOTE` | eliteOS Public Quote Head (`app-quote`) |
| `HEAD_URL_INTERNAL_ESTIMATE` | eliteOS Internal Estimate Head (`app-internal-estimate`); legacy alias `HEAD_URL_QUOTE` |
| `HEAD_URL_PRICING_ADMIN` | eliteOS Pricing Admin Head (`app-pricing-admin`) |
| `HEAD_URL_EXECUTIVE` | eliteOS Executive Head |
| `HEAD_URL_BRAIN_HEALTH` | eliteOS Brain Health Head |
| `HEAD_URL_SYSTEM_ADMIN` | eliteOS System Admin Head |
| `HEAD_URL_HOME` | eliteOS Home / Launcher (`app-home`); also used as invite redirect fallback when building `…/auth/callback` |
| `HEAD_URL_SALES` | eliteOS Sales Head |

**app-home** may use **`VITE_HEAD_URL_*`** and **`VITE_BACKEND_URL`** as SPA fallbacks; production should prefer URLs returned by **`GET /api/me/heads`**.
