# eOS Roles & Permissions Map

## Principles

1. **Backend enforcement** — Every sensitive JSON route checks auth + role (and future dealer/account scope). Treat URL secrecy as nonexistent.
2. **Dealer isolation** — Dealer users see **only** their dealer’s quotes, resources, and shared assets — never internal heads or other dealers’ data.
3. **Least privilege** — Internal users see heads that match their job; `viewer` is read-only where explicitly allowed.
4. **RLS** — Row Level Security in Supabase is a **defense-in-depth** goal; **never** rely on it alone from `backend-core`—the API must still authorize.

**Current code reference:** `ALLOWED_ROLES` in `backend-core/src/auth/authMiddleware.js`; route guards in `backend-core/src/server.js`.

---

## Current roles (implemented in `ALLOWED_ROLES`)

| Role | Intent |
| --- | --- |
| `admin` | Full admin API access (user role updates, critical ops as coded) |
| `executive` | Executive Head + Brain ops read surfaces shared with admin where implemented |
| `sales` | Sales-oriented surfaces (future Sales Head / quote prep) |
| `production` | Shop/production surfaces |
| `shop_tv` | Large-screen / low-friction read |
| `installer` | Field install context (future Install Head) |
| `accounting` | Financial surfaces |
| `purchasing` | Purchasing / material |
| `customer_service` | CS / exceptions |
| `viewer` | Read-only default for bootstrap users |

---

## Recommended future roles (not all implemented)

| Role | Notes |
| --- | --- |
| `HR` | HR, onboarding, training assignment |
| `safety` | Safety programs, incidents |
| `marketing` | Brand/library, campaigns metadata |
| `dealer_admin` | Manage dealer users + quotes for org |
| `dealer_user` | Create/view quotes per dealer policy |
| `quality` | QC head |
| `scheduler` | Scheduling head |

**Implementation path:** extend `ALLOWED_ROLES`, migrate profiles, then enforce on routes + RLS policies per table.

---

## Head access matrix (target state)

| Head / module | admin | executive | sales | production | shop_tv | installer | accounting | purchasing | customer_service | viewer | dealer_admin | dealer_user |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Brain Health / sync admin | ✓ | ✓ (read-only where coded) | — | — | — | — | — | — | — | — | — | — |
| Executive Head | ✓ | ✓ | — | — | — | — | — | — | — | — | — | — |
| Titans Flowing | ✓ | ✓ | optional | ✓ | ✓ | — | — | — | — | optional | — | — |
| Sales Head | ✓ | ✓ | ✓ | — | — | — | — | — | — | optional | — | — |
| Quote Head / Partner Quoting | ✓ | optional | ✓ | — | — | — | — | — | — | — | ✓ | ✓ |
| Partner / ESFN | ✓ | — | optional | — | — | — | — | — | — | — | ✓ | ✓ |
| Production Head | ✓ | ✓ | — | ✓ | ✓ | — | — | — | — | — | — | — |
| Material Flow / Purchasing | ✓ | ✓ | — | optional | — | — | optional | ✓ | — | — | — | — |
| Install Head | ✓ | optional | — | — | — | ✓ | — | — | — | — | — | — |
| Customer Service / Exceptions | ✓ | optional | — | — | — | — | — | — | ✓ | — | — | — |
| Finance / Job costing | ✓ | ✓ | — | — | — | — | ✓ | — | — | optional | — | — |
| HR / Training | ✓ | — | — | — | — | — | — | — | — | — | — | — |
| SOP / Policy | ✓ | — | — | — | — | — | — | — | — | — | — | — |

*(✓ = primary audience; “optional” = executive/policy choice or read-only slice.)*

---

## Actions by role (patterns)

| Action | Who |
| --- | --- |
| User management, role assignment | `admin` |
| Run / retry sync (where exposed) | `admin`, `executive` (as implemented per route) |
| Read Executive aggregates | `admin`, `executive` |
| Read shop floor “today” boards | `production`, `shop_tv`, `executive` |
| Author **internal** pricing rules | `admin` only |
| Author **dealer-facing** quotes | `dealer_admin`, `dealer_user`, `sales` (internal) per product rules |
| View **another dealer’s** quotes | **Denied** by default |

---

## Backend permission enforcement rules

1. **Middleware:** `requireAuth()` + `requireRole([...])` on every protected route.
2. **Resource scope:** For dealer routes, add **dealer_id / account_id** check from `user_profiles` (or linked table) — **must match** row being read/written.
3. **No service-role leakage to clients** — browser never sees service role key; only `backend-core` uses it.
4. **Auditing:** Sensitive mutations log to `eos_action_log` (existing pattern).

---

## Dealer / partner isolation rules

- **No Executive Head**, **no internal production dashboards**, **no internal pricing logic**, **no admin settings** unless `admin` explicitly impersonates (future — avoid until hardened).
- **Quote history** scoped to **dealer_id**.
- **Resources** scoped to dealer program / ESFN tier.

---

## Internal department rules

- **sales:** Sales + Quote surfaces; no admin sync controls unless also `admin`/`executive`.
- **production / shop_tv:** Operational views; no financial detail unless role expanded.
- **purchasing:** Material flow + purchasing endpoints; no HR PII.
- **customer_service:** Job/exception views; mask unrelated financials if required by policy.

---

## Future Supabase RLS (notes)

- Enable RLS on tenant tables (`quotes`, `dealer_accounts`, etc.) when introduced.
- Policies: `dealer_id = auth.jwt() claim` or join through `user_profiles`.
- **`backend-core` using service role** bypasses RLS — **authorization in code is mandatory**; RLS protects direct Supabase access and future edge cases.

---

*See also `docs/EOS_MASTER_HEAD_ROADMAP.md` and Moraware coverage in `docs/MORAWARE_DATA_COVERAGE_MAP.md`.*
