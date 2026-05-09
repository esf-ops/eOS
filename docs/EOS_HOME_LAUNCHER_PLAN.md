# eOS Home / Launcher — architecture plan

**Goal**: One branded **`eos.elitestonefabrication.com`** entry where authenticated users launch only the heads they are entitled to touch. Frontend route hiding alone is insufficient — **every head’s backend surface must independently enforce RBAC.**

---

## 1. Canonical entry experience

### Login / landing (`/` or `/login`)

Visual language (conceptual):

- **ESF** logo tile
- **eOS** product name — *Elite Operating System*
- **Motto**: *Keep the Titans running well.*
- **Supabase Auth** email/password (+ future SSO/passkeys per project settings)

Technical:

- Hosted **static SPA shell** (“Home app”) consuming **anon key + publishable URLs** only.
- After Auth session established, hydrate launcher data from backend (**never infer entitlements purely client-side beyond optimistic disable states**).


## 2. Post-login data flow

1. `POST` Supabase session — standard SDK.
2. `GET /api/me` → identity + coarse role + active gate (already exists).
3. **`GET /api/me/heads`** → structured cards (**implemented v1**) from `backend-core/src/me/launcherHeads.js`.
4. UI renders **`enabled === true`** cards first; muted/disabled stubs optional for auditing super-admins (“you lack partner quote entitlement”) — UX TBD.


## 3. Launcher card catalog

Each launcher row aligns with **`user_head_access.head_slug`** and `EOS_HEAD_SLUGS`:

| Display | slug | SPA href hint (`href` fields are routing hints until router ships) |
|---------|------|-----|
| Executive | `executive` | `/executive` → existing `app-executive` |
| Brain Health | `brain_health` | `/brain-health` |
| System Admin | `system_admin` | `/system-admin` |
| Sales | `sales` | `/sales` |
| Quote | `quote` | `/quote` |
| Production | `production` | `/production` |
| Shop Floor TV | `shop_tv` | `/shop-tv` |
| Install | `install` | `/install` |
| Purchasing | `purchasing` | `/purchasing` |
| Customer Service | `customer_service` | `/customer-service` |
| HR | `hr` | `/hr` |
| Safety | `safety` | `/safety` |
| Marketing | `marketing` | `/marketing` |
| Finance | `finance` | `/finance` |
| Reports | `reports` | `/reports` |
| Partner Quote | `partner_quote` | `/partner-quote` |
| Dealer Resources | `dealer_resources` | `/dealer-resources` |

Clicking launches either:

- **Same SPA** routed sub-app bundles (recommended long term), OR
- **Absolute URL** mapping per environment (`VITE_HEAD_ORIGIN_*`) documented in infra runbooks.


## 4. **`GET /api/me/heads`** (Auth: `requireAuth()`)

Implementation: `buildMeHeadsPayload` exported from **`backend-core/src/me/launcherHeads.js`** and wired via **`backend-core/src/server.js`**.

High-level resolver:

1. If **inactive**: return `inactive: true` and all launcher rows `enabled: false`.
2. Read **`user_profiles.user_kind`** (`internal` vs `dealer_partner`).
3. Load **`user_head_access`** (`head_slug`).
4. If **explicit rows exist** → sanitized intersection with **`EOS_HEAD_SLUGS`**.
5. Else apply **stub defaults** (`defaultSlugSet`):  
   - `admin` → all known heads  
   - `executive` → all except **`system_admin`**  
   - `dealer_partner` → `partner_quote`, `dealer_resources`, `quote`  
   - other roles → `brain_health` + small role-aware hints *(superseded when admins populate head access rows)*  

6. Clamp **partner** users (`user_kind === 'dealer_partner'`) → never surface internal-heavy heads regardless of rogue DB rows (**defense-in-depth**, not substitute for hardened per-head endpoints).

Typical payload:

```json
{
  "ok": true,
  "user": { "id": "…", "email": "…", "role": "executive", "userKind": "internal" },
  "heads": [
    {
      "slug": "executive",
      "label": "Executive",
      "description": "…",
      "href": "/executive",
      "category": "Leadership",
      "enabled": true
    }
  ]
}
```


## 5. Dealer / isolation rules

**Dealers** must not escalate to internal aggregates by forging URLs:

- Launcher endpoint clamps partner catalog.
- **Each head-specific API route** MUST continue validating `role`, `user_head_access`, and **partner account joins** (`user_account_access`).
- Sensitive exports (financial rollups beyond scope) gated server-side irrespective of SPA bundle presence.


## 6. Refresh interplay

Follow **`docs/EOS_REFRESH_POLICY.md`**: Home shell should behave like analytics — **manual refresh**, no global polling timers; head micro-apps inherit their classification when embedded or deep-linked.


## 7. Session & UI state *(normative)*

| Concern | Rule |
|---------|------|
| Supabase Auth session | **Per browser profile** cookie/local storage semantics — rotates silently (`TOKEN_REFRESHED`). |
| Shared backend truths | Operational sync, Brain ingest, Postgres — centrally governed via service role pipelines. |
| Entitlements snapshots | Launcher cards reflect server truth at fetch time — re-fetch manual or on route focus (future). |
| UI filters / drawers / quoting drafts | **Local component state by default.** Persist deliberately with **`user_id`**, revision metadata, **`eos_action_log`** when mutating governance or commercial instruments. |
| Global singleton frontend stores | Forbidden for cross-tab cross-user coupling — isolate per mount tree. |



