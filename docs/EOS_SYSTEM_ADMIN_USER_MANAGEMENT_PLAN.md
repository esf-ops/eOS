# eOS System Admin / User Management (v1 foundation)

This document outlines the security model, data extensions, APIs, and the System Admin Head for managing **internal ESF users** and **external dealer/partner** identities from one place—without distributing access through code or bespoke SQL.

Production Supabase deployments should apply migrations in order: **`auth_schema.sql`** (existing), then **`user_management_schema.sql`** (additive).

---

## Part A — Current state

## Part A.1 — Sales Account Mapping Admin (additive)
System Admin also hosts **Sales Account Mapping Admin v1**, used to review and approve Moraware-to-Monday account mappings before Sales Head attribution is considered trustworthy.

- **Backend**: `/api/admin/sales-account-mapping/*` (admin-only, requires System Admin head access)
- **UI**: System Admin → “Sales Account Mapping”
- **Schema**: `backend-core/supabase/sales_account_attribution.sql` (additive; manual apply)

If the attribution schema is not installed, the UI must show a “schema not installed” message and continue operating without crashing.

### 1. Auth / user tables (today)

| Object | Purpose |
|--------|---------|
| `auth.users` | Supabase Auth identities (credentials, MFA, OAuth, managed by Auth). |
| `user_profiles` | eOS-facing profile keyed by auth user UUID: email, display name, `role`, department, activation. |
| `eos_login_log` | Login events emitted from clients (paired with middleware session checks). |
| `eos_action_log` | Structured audit trail: user, head, action, entity, timestamps, scrubbed metadata. |

### 2. Current roles (prior baseline)

Historical `user_profiles.role` constraint included a short list (`admin`, `executive`, `sales`, `production`, `shop_tv`, `installer`, `accounting`, `purchasing`, `customer_service`, `viewer`). The **additive** migration widens this to the partner/functional set below without dropping `user_profiles`.

### 3. Future roles needed

Internal and partner personas share one `role` enum for simplicity in v1; dealer context is supplemented by **`user_account_access`** and `user_kind`.

| Role | Typical use |
|------|--------------|
| `admin` | Full System Admin APIs and governance. |
| `executive` | Read-heavy admin roster where appropriate (existing list endpoint). |
| `sales`, `production`, `shop_tv`, `installer`, `accounting`, `purchasing`, `customer_service` | Operational heads. |
| `hr`, `safety`, `marketing` | People, safety compliance, positioning. |
| `dealer_admin`, `dealer_user` | Partner Quoting personas (scoped by dealer + pricing). |
| `viewer` | Default bootstrap posture. |
| `finance` | Finance head alignment (paired with finance head slug). |

### 4. Internal user fields (logical model)

Backed primarily by **`user_profiles`** (+ optional enrichment):

| Field | Storage |
|-------|---------|
| `id` | `user_profiles.id` (= `auth.users.id`) |
| `email` | `user_profiles.email` |
| `full_name` | `user_profiles.full_name` |
| `role` | `user_profiles.role` |
| `department` | `user_profiles.department` |
| `is_active` | `user_profiles.is_active` |
| `allowed_heads` | **`user_head_access`** (normalized rows); never trust client UI alone |
| `last_login_at` | `user_profiles.last_login_at` (optional column; nullable until wired from login telemetry) |
| `created_at` / `updated_at` | `user_profiles` timestamps |

### 5. Dealer / partner fields

| Field | Storage |
|-------|---------|
| `dealer_account_id` | `user_account_access.dealer_account_id` → `dealer_accounts.id` |
| `dealer_account_name` | `dealer_accounts.account_name` |
| `dealer_role` | `user_account_access.dealer_role` (free-text or future enum) |
| `pricing_group_id` | `user_account_access.pricing_group_id` → `pricing_groups.id` |
| `allowed_heads` | Same **`user_head_access`** table |
| `can_view_all_dealer_quotes` | `user_account_access.can_view_all_dealer_quotes` |
| `can_manage_dealer_users` | `user_account_access.can_manage_dealer_users` |
| `is_active` | `user_profiles.is_active` plus per-row `user_account_access.is_active` where needed |

Supporting tables: **`dealer_accounts`**, **`pricing_groups`**, optional **`dealer_user_settings`** (JSON preferences).

### 6. Password handling (non-negotiable)

- **No plaintext passwords** in UI, APIs, logs, or `eos_action_log.metadata`.
- Admins never read or set another user’s password.
- Use **invite** (`inviteUserByEmail`) for new identities and **recovery** (`generateLink` type `recovery`) for resets—all via Supabase Auth email flows.
- **Deactivate** (`is_active = false`) to off-board without juggling credentials.

Environment hints (examples):

- `EOS_ADMIN_INVITE_REDIRECT_URL` — post-invite landing for the Partner / eOS SPA.
- `EOS_ADMIN_PASSWORD_RECOVERY_REDIRECT_URL` — recovery link redirect.

### 7. Backend enforcement

- Protected routes combine **`requireAuth`** + **`requireRole`** / future account checks.
- **Do not rely on hiding UI.** Partner Quoting and other heads must repeat authorization against profile + assignments.
- Sensitive Admin APIs are **`admin` only** (user detail, invite, resets, mutations). **`GET /api/admin/users`** remains available to **`executive`** for legacy dashboards unless product narrows this later.

---

## Part E — Canonical head slugs (`allowed_heads`)

Use exactly these lowercase slugs in **`user_head_access.head_slug`** and future route guards:

`executive`, `brain_health`, `system_admin`, `sales`, `quote`, `production`, `shop_tv`, `install`, `purchasing`, `customer_service`, `hr`, `safety`, `marketing`, `finance`, `reports`, `partner_quote`, `dealer_resources`

Backed by **`EOS_HEAD_SLUGS`** in `backend-core/src/auth/eosGovernanceConstants.js`.

---

## Part B — Schema file

**`backend-core/supabase/user_management_schema.sql`** (additive):

- Replaces **`user_profiles_role_check`** with the expanded enum (no drops of `user_profiles` itself).
- Adds `user_kind`, `last_login_at`.
- Adds `dealer_accounts`, `pricing_groups`, `user_head_access`, `user_account_access`, `dealer_user_settings`.

---

## Part C — Backend admin endpoints (implemented)

All **mutations** below write to **`eos_action_log`** via `logAction` (never password material).

| Method | Route | Visibility | Purpose |
|--------|-------|------------|---------|
| GET | `/api/admin/users` | admin, executive | Roster (+ enrich when extension tables exist). |
| POST | `/api/admin/users/:userId/role` | admin | Legacy role/active patch. |
| GET | `/api/admin/reference` | admin | Heads, roles, dealers, pricing groups for UI selects. |
| POST | `/api/admin/users/invite` | admin | Invite email + bootstrap `user_profiles`. |
| GET | `/api/admin/users/:userId` | admin | Detail: profile enrich, assignments, summaries. |
| POST | `/api/admin/users/:userId/profile` | admin | `full_name`, `role`, `department`, `is_active`, `user_kind`. |
| POST | `/api/admin/users/:userId/head-access` | admin | Replace allowed heads (`user_head_access`). |
| POST | `/api/admin/users/:userId/dealer-access` | admin | Upsert `user_account_access`. |
| POST | `/api/admin/users/:userId/pricing-group` | admin | Update pricing group for one dealer pairing. |
| POST | `/api/admin/users/:userId/send-password-reset` | admin | Triggers Auth recovery machinery; HTTP response **`dispatched`** only. |

Implementation: `backend-core/src/admin/systemAdminUserManagement.js` (wired from `server.js`).

---

## Part D — `app-system-admin`

Vite + React + TypeScript head using the same **`VITE_BACKEND_URL`** + Supabase anon pattern as other heads. **`admin`** role gate on `/api/me`. No password fields anywhere in the UX.

---

## Roadmap / v2 ideas

- RLS templates per head using `user_head_access`.
- Narrow **`GET /api/admin/users`** to admin-only once Executive no longer consumes it.
- Auto-fill `last_login_at` from `eos_login_log` or Auth `last_sign_in_at` reconciliation job.
- `dealer_user_settings` UI for personalization without mixing entitlements into preferences.
