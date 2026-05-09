# eOS auth & session policy (Supabase Auth + backend JWT)

This document describes how eOS SPA heads (`app-home`, `app-brain-health`, `app-executive`, `app-system-admin`) treat Supabase sessions and JWT-backed API calls.

## Normal users stay signed in until sign-out

Sessions are persisted in browser storage managed by `@supabase/supabase-js`. Users remain signed in across tabs and refreshes until they use **Sign out** (or clearing site data removes the stored session).

## Refresh tokens & rotation

Access tokens expire; Supabase rotates them using refresh tokens (`autoRefreshToken: true`). Frontend code treats `TOKEN_REFRESHED` as **token bookkeeping only**: update in-memory/session state **without** clearing dashboards or reloading entire app shells unless truly necessary (e.g. hard sign-out).

## Browser client configuration (all heads)

Shared options on `createClient(..., { auth: { … } })`:

- `persistSession: true`
- `autoRefreshToken: true`
- `detectSessionInUrl: true` — supports OAuth / recovery links that arrive with tokens in the URL hash

Frontend apps expose **only** the publishable **`VITE_SUPABASE_ANON_KEY`**. Never ship service-role keys or Moraware credentials to browsers.

## Bootstrap on load

Each app should:

1. Call `supabase.auth.getSession()`.
2. If a session exists, **omit the login UI** and use `session.access_token` for `fetch` wrappers toward the backend (`Authorization: Bearer …`).
3. Hydrate UI from **`GET /api/me`** (and head-specific endpoints). `app-home` also calls **`GET /api/me/heads`** for launcher cards.

## Backend verification

`backend-core` validates the JWT **on each protected request** (`requireAuth()`, role gates, head-specific checks). Launcher cards and hidden UI elements are **not** a substitute for authorization; APIs must deny unauthorized access even when a client guesses a URL.

## Future: step-up authentication

Security-sensitive destructive or governance actions **may later require recent re-authentication** (policy TBD). The current baseline is “logged in once” plus server-side JWT checks.

## Shared / display accounts

Org-wide kiosk or projector accounts must be constrained to **display-only heads** via `user_head_access` and downstream API rules so they cannot reach operational or admin APIs.

## No custom JWT persistence

Applications must **not** copy access tokens into ad-hoc `localStorage` keys. Supabase manages its storage key(s); syncing React state off `session.access_token` is fine for API calls within the SPA lifetime.

## Cross-head navigation

If the Supabase session is still valid when a user opens another eOS head in the **same browser profile**, Supabase restores the session; they should **not** be forced through email/password login again solely because another Vite bundle loaded.
