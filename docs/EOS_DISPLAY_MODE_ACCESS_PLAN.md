# eOS display-mode access plan

Operational dashboards (“Shop Floor TV”, kiosk boards, projector walls) need **strong read-only framing** distinct from privileged staff workstations. This plan defines acceptable display modes without changing current auth primitives until explicitly implemented.

Security reminder: launcher visibility and kiosk UX are never substitutes for **`requireAuth`** / **`requireRole`** guards on mutations and sensitive payloads.

---

## Recommended modes

### 1. Authenticated display account (**default recommendation**)

| Attribute | Guidance |
| --- | --- |
| **Identification** | Dedicated Supabase Auth user dedicated to signage (example: `shop.tv@…`) |
| **`user_profiles.role`** | `shop_tv` (or analogous least-privilege role) |
| **`user_head_access`** | Only `shop_tv` (and any other narrowly scoped heads required) |
| **Session UX** | `persistSession: true`; TVs remain signed-in until revoked or rotated |
| **Capabilities** | **View-only surfaces** inside the SPA; hide admin / invite / destructive controls |
| **Lifecycle** | Deactivate Supabase Auth user + revoke head rows **when retiring a TV**

This mode reuses the same JWT verification path staff apps use (`Authorization: Bearer` → backend verifies on every request).

### 2. Secret display links (**optional future**)

| Attribute | Guidance |
| --- | --- |
| **Purpose** | Public-ish TV without workstation login — **narrow data only** |
| **Mechanism** | Opaque bearer token hashed server-side (**never** plaintext in DB) scoped to minimal routes |
| **Rotation** | Regenerate whenever token might be leaked (photo of QR code, misplaced remote) |

#### Future table sketch (planning only — not implemented until requested):

**`display_tokens`**

| Column | Notes |
| --- | --- |
| `id` | UUID PK |
| `token_hash` | bcrypt/argon/etc. hash of bearer |
| `display_name` | Human label (“Line 4 west board”) |
| `allowed_head` | Slug (e.g. `shop_tv`) |
| `is_active` | Soft kill-switch |
| `expires_at` | Optional TTL |
| `created_at` | Audit |
| `last_used_at` | Rate/abuse telemetry |
| `created_by` | Admin FK / UUID |

### 3. Fully public dashboards (**avoid for production Moraware-derived data**)

Reserve for marketing screens with **sanitized aggregates** absent customer-specific detail. Assume anything tied to synced Moraware timelines is inappropriate for anonymous exposure.

---

## Display route rules (contract for future heads)

| Rule | Detail |
| --- | --- |
| **Read-only** | No inserts/updates/deletes from display routes |
| **No mutation UI** | Hide sync triggers, invitations, credential tools, impersonation hooks |
| **No secrets browser-side** | No service-role keys, cron secrets, or Moraware API keys in SPA bundles |
| **Minimal payloads** | Round endpoints to the smallest projections needed at 10+ foot viewing distance |
| **Auto-refresh** | Allowed; prefer WebSocket/long-poll sparingly vs tight `setInterval` loops hammering `/api/me` |
| **Stability** | Backoff on errors; pause when tab invisible if supported |
| **Account choice** | Default to authenticated display users; escalate to hashed tokens only after threat modeling |

---

## User/session expectations

| Audience | Behaviour |
| --- | --- |
| **Standard staff** | Stay signed-in until explicit sign-out (`docs/EOS_AUTH_SESSION_POLICY.md`) |
| **Display TVs** | Permitted long-lived sessions tied to deactivated hardware via account disable |
| **Secret links** | Treat like credentials — rotate/revoke on exposure suspicion |
| **UI state isolation** | Every browser/tab owns its filters; dashboards never trust shared frontend singletons beyond session token |
| **Shared truth** | Data consistency comes from Supabase + guarded APIs — not mirrored localStorage blobs fanning sensitive state |

Operational follow-ups (outside this document):

- Step-up MFA for admins performing destructive governance (future enhancement).
- Central audit when display accounts view sensitive aggregates (analytics backlog).
