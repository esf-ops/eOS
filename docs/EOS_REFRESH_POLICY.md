# eOS refresh & polling policy

eOS mixes **near-real-time operational** widgets with **on-demand analytical** dashboards. This document defines when automatic refresh is allowed, how aggressively it may poll, and how auditing maps to frontend behavior after the inspections in **§Audit (current apps)**.

**Principles**

- Prefer **explicit user actions** or **successful mutations** for refresh on analytical and admin surfaces.
- Only **live operational** views may run **automatic timers** — with **documented intervals**, **`visibility`-aware guards**, and **cleanup on unmount**.
- Filters, search chips, drawer state, chart mode toggles, and similar UI must stay **client-side** unless persistence is deliberate (quotes, drafts saved with `user_id`, etc.).
- **Tab-local state** belongs in React/component state — never singleton stores shared across unrelated users/tabs unless namespaced and ephemeral (this repo has no shared global dashboards).

---

## 1. Live operational heads

**Examples**: Titans Flowing (**Today only**), future Shop Floor TV, production pulse, install day boards.

**Behavior**

- Automatic polling **may** run when **data is inherently time-sensitive**.
- Frontend interval should match real operational cadence (ingest granularity, SLA). Typical range: **15–120 seconds** depending on freshness labels; Titans **Today** defaults to **30 seconds** while the tab is visible.
- **Pause** timers when **`document.visibilityState === 'hidden'`** where practical (Titans polling already stops when hidden; midnight “today” rollover tick skips while hidden — see Titans widget).
- Brain freshness reflects **recent operational sync**, not frontend polling cadence alone.

---

## 2. Executive analytics heads

**Examples**: Operating summary cards, salesperson/account performance, monthly trends (Recharts panels), Titan **historical** date selection.

**Behavior**

- **Load-on-open**: single `loadAll`/equivalent when auth resolves or filters **commit** (year, account limit blur/Enter — not keystroke churn).
- **Manual refresh**: primary action for “bring me fresher aggregates.”
- **No perpetual polling loops** tied to dashboards, toast text, chart render counters, or `lastRefreshed` timestamps.
- Titans **today** polling is confined to **`TitansFlowingWidget.tsx`** — **changing the date picker to a historical/future date disables the 30s poll** (`isTodayView === false`).
- Tabs (Overview vs Sales…) are **pure client mounts** relative to cached data — switching tabs **must not refetch Brain** unless a future lazy-load path is deliberately added.

---

## 3. Admin / settings heads

**Examples**: **System Admin** (user roster, schema health, invitations).

**Behavior**

- **Load-on-open** + reload after **successful mutations** (save profile, dealer access, head access, invites).
- **Manual “Reload”** button for admins who want a cold pull.
- **No background polling**.


## 4. Quote / partner heads *(future scaffold)*

**Examples**: Partner quote composer, dealer quote history.

**Behavior**

- **Save intents** explicitly (autosave drafts only when designed with debounce + idempotency keys).
- **No polling** during typing.
- Reload after persisted save/open.

---

## 5. Reports / HR / safety / finance *(future)*

**Behavior**

- **Load-on-open**, **manual refresh** only unless a KPI is explicitly chartered as operational live.

---

# Audit — current frontend apps (post-fix)

Inspection targets: **`setInterval`**, **auth listeners that refetch unconditionally**, **`useEffect` dependency churn causing network loops.**

## `app-executive`

| Area | Finding | Status |
|------|-----------|--------|
| `TitansFlowingWidget.tsx` | **30 s** poll `loadTitans` **only when** `isTodayView && tabVisible` | ✅ Policy |
| | Prior **1 s** ticker forced **60 s** rollover + skips while hidden (`visibility`) | ✅ **Fixed** CPU churn vs policy |
| | `useEffect` on `[loadTitans, refreshTick]` — `refreshTick` bumps **only manual Refresh** (`App.tsx`) | ✅ |
| `App.tsx` | `TOKEN_REFRESHED` ignores full dashboard reload (`loadAll`), updates token only | ✅ |
| `App.tsx` | `loadAll` when **year/account limit** commit changes (`useEffect` keyed to committed values only) | ✅ |
| `MonthlyTrendPanel.tsx` | DEV-only render counter bump — zero production traffic | ✅ |
| Filters | Client-side narrowing + API limit committed on blur/Enter (`accountLimitCommitted`) — documented UX | ✅ |

## `app-brain-health`

| Area | Finding | Status |
|------|-----------|--------|
| Interval timers | None | ✅ |
| `TOKEN_REFRESHED` | Previously called `clearDataState + loadAll` — caused thrash/flashes aligned with JWT rotation | ✅ **Fixed** — token sync only (`return` early) identical pattern to Executive |
| `loadAll` | Still invoked **SIGNED_IN** / **USER_UPDATED**, manual triggers after sync admin actions — OK | ✅ |
| Titans “pulse probe” | Single **GET** `/api/titans/today?limit=1` during `loadAll` — not a loop | ✅ |

## `app-system-admin`

| Area | Finding | Status |
|------|-----------|--------|
| Polling loops | No `setInterval` | ✅ |
| `useEffect` | Loads detail when selection changes — expected | ✅ |
| Mutations | `refreshAll`/inline reload hooks after invites/saves — expected | ✅ |

---

# Operational checklist for new heads

When adding timers:

1. **Document** intent in code comment referencing this file.
2. **Clean up** on unmount — always return `clearInterval`/`abort`.
3. **Guard** duplicate intervals (`useRef` lock or single effect owner).
4. **Visibility** hooks for anything >10 s cadence.
5. Separate **analytics** bundles from **live ops** bundles to avoid accidental dependency coupling.
