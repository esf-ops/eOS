## eOS Heads auth plan (foundation)

### Principle

- **Heads never call Moraware directly.**
- Heads authenticate users via **Supabase Auth (anon key)**.
- Heads call backend-core APIs with a Supabase **JWT** in the `Authorization` header.
- backend-core verifies JWT server-side using **`SUPABASE_SERVICE_ROLE_KEY`** (server only).
- Heads must **never** ship or use `SUPABASE_SERVICE_ROLE_KEY`.

### Frontend flow (future heads)

1. Head uses Supabase client SDK with:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
2. User signs in (email/password, SSO, etc).
3. Head gets session access token (JWT).
4. Head calls backend:
   - `Authorization: Bearer <jwt>`
5. backend-core:
   - verifies token
   - loads `user_profiles`
   - enforces roles/permissions

### Roles

Initial roles supported by backend-core:

- admin
- executive
- sales
- production
- shop_tv
- installer
- accounting
- purchasing
- customer_service
- viewer

Notes:

- **admin** can access everything.
- **shop_tv** will later be a display-only user role.
- Installers should only see installer-scoped endpoints (later).
- Partner/homeowner portals will require stricter access rules later.

### Logging

- Login events are recorded in `eos_login_log`.
- Important actions are recorded in `eos_action_log`.

### Profile bootstrap (first authenticated request)

If an authenticated Supabase user hits a protected backend route and no `user_profiles` row exists yet, backend-core will **auto-create a profile**:

- role: `viewer`
- is_active: `true`

This bootstrap event is logged to `eos_action_log` with:

- head: `auth`
- action_type: `bootstrap_user_profile`

Admins/executives can later promote users using the admin endpoints.

### Required env vars (backend-core)

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (server only)
- `EOS_ALLOW_PUBLIC_SYNC_HEALTH` (optional; local dev only)
- `EOS_CRON_SECRET` (for internal sync trigger endpoints)

Frontend (later):

- `SUPABASE_ANON_KEY`

