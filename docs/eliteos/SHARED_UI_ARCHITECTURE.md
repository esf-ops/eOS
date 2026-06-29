# eliteOS Shared UI Architecture

**Date:** 2026-06-29  
**Phase:** 0 — documentation and guardrails only  
**Status:** Approved plan; no production extractions in this phase  
**Related:** [HEAD_ARCHITECTURE_MAP_2026-05-27.md](./HEAD_ARCHITECTURE_MAP_2026-05-27.md) · [SHARED_UI_CONTRIBUTING.md](./SHARED_UI_CONTRIBUTING.md) · [MONOLITH_EXTRACTION_INVENTORY_2026-05-27.md](./MONOLITH_EXTRACTION_INVENTORY_2026-05-27.md) · [eliteos-ui-direction.md](./eliteos-ui-direction.md) · [FEATURE_DECISIONS.md](./FEATURE_DECISIONS.md)

---

## Purpose

This document defines how eliteOS heads should share UI, where ownership boundaries lie, and what must **not** change before Elite 100 go-live. The goal is to make slabOS easier to maintain and extend without requiring IDE-assisted refactors for every small UI adjustment.

**Phase 0 scope:** Architecture map, component inventory, ownership boundaries, and guardrails. No shared CSS imports, no head refactors, no backend changes.

**Design reference:** [Home Launcher](../app-home/) — treat current launcher UI as stable and desirable. Do not redesign it as part of shared UI work.

---

## Current state (2026-06-29)

| Layer | Location | Contents |
|-------|----------|----------|
| Shared shell | `shared/eliteos-ui/EliteosTopbar.tsx` | Canonical topbar (presentational only) |
| Shared shell CSS | `shared/eliteos-ui/eliteosTopbar.css` | Consumes `--eos-*` tokens; does not define them |
| Shared hook | `shared/eliteos-ui/useWorkflowRailScrollSpy.ts` | Workflow rail scroll-spy |
| Shared auth | `shared/eliteos-supabase/` | Supabase client auth options |
| Quote domain lib | `app-quote/src/lib/` | Math, customer estimate document, API helpers — **not general UI** |
| Per-head UI | Each head's `styles.css` + monolith App files | Buttons, cards, modals, tokens, session bootstrap (duplicated) |

There is no `packages/ui`, no `app-shared` head, and no shared Button/Card/Modal package yet.

---

## Head ownership boundaries

| Head | Owns | Must NOT own | Consumes |
|------|------|--------------|----------|
| **Home Launcher** | Launcher grid, invite/password gate, user preferences surface, head discovery | Permission grants, quote math, pricing edits | `/api/me`, `/api/me/heads`, `/api/me/preferences` |
| **Internal Estimate** | Estimate workspace, save/update/revision orchestration, customer output gate (print/email trigger), dirty-state UX | Account directory CRUD, pricing rate tables, platform user admin | Quote domain lib (`app-quote/src/lib`), Brain quote APIs; Account Directory (future) |
| **Quote Library** | Quote retrieval, search/filter, revision history display, archive, email/PDF trigger from saved quotes | Account ownership, pricing edits, estimate authoring | Quote rows from Brain; Account Directory (future, read-only) |
| **System Admin** | Users, org assignment, head access, platform audit, invite lifecycle | Day-to-day quoting, pricing math, account CRM | Brain admin APIs |
| **Pricing Admin** | Elite 100 price groups, rates, add-ons, public markup rules, partner pricing setup, pricing-change audit | Account contacts, branch addresses, estimate terms, quote save logic | Brain pricing APIs |
| **Account Directory** *(future)* | Accounts, contacts, aliases, dealer settings, default recipients, owner/salesperson mappings, delivery preferences, quote/sold metrics | Pricing math, rate tables, user/head permission grants | Pricing profiles (reference only); quote metrics (read) |
| **Brain (`backend-core`)** | Auth, head access enforcement, quote persistence, calculations, delivery, launcher catalog source | UI presentation | Supabase |

**Cross-cutting rule:** Permission truth lives in the Brain (and RLS where used). Shared UI must never be the only place a sensitive action is hidden.

---

## Shared component inventory

Components listed below are **candidates** for `shared/eliteos-ui/`. “Exists today” means implemented locally per head unless noted.

| Component | Exists today | Proposed location | Pre-go-live | Stay head-specific |
|-----------|--------------|-------------------|-------------|-------------------|
| `EliteosTopbar` | ✅ `shared/eliteos-ui/` | Keep | Done | `searchSlot`, menu items, per-head actions |
| `EliteAppShell` | ❌ (inline per head) | `shared/eliteos-ui/EliteAppShell.tsx` | **No** | Workflow body, domain panels |
| `HeadHero` | ❌ (duplicated hero JSX) | `shared/eliteos-ui/HeadHero.tsx` | **No** | Head title/subtitle copy |
| `PageToolbar` / `FilterBar` | ❌ (QL filters, SA filters) | `shared/eliteos-ui/FilterBar.tsx` | **No** | Filter field definitions |
| Head switcher | Home launcher only | Home stays owner; shared menu helper | Phase 1+ | Launcher grid logic |
| User menu items | Duplicated SVG + items | `shared/eliteos-ui/topbarMenuItems.ts` | Phase 1+ | Profile routing target |
| `Card` | CSS only (`.card`, `.ie-card`, etc.) | `shared/eliteos-ui/primitives.css` | Phase 1+ | Card content |
| `StatCard` | Inline in QL, SA | `shared/eliteos-ui/StatCard.tsx` | **No** | Metric values |
| `StatusBadge` | `.pill` CSS + `statusPillClass()` dupes | `shared/eliteos-ui/StatusBadge.tsx` | Phase 1+ | Status → label mapping |
| `Button` / `IconButton` | `.btn` CSS in every head | `shared/eliteos-ui/primitives.css` | Phase 1+ | Action labels/handlers |
| `Modal` / `ConfirmDialog` | IE + QL email modals; inline confirms | `shared/eliteos-ui/Modal.tsx` | **No** | Modal body, API calls |
| `Drawer` / `DetailPanel` | QL detail modal; SA user drawer | `shared/eliteos-ui/DetailDrawer.tsx` | **No** | Section content |
| `ErrorBanner` / `Toast` | Per-head banners | `shared/eliteos-ui/ErrorBanner.tsx` | Phase 1+ | Message text |
| `LoadingState` / `EmptyState` | Inline | `shared/eliteos-ui/LoadingState.tsx` | Phase 1+ | Empty CTAs |
| `FormField` / `SelectField` / `TextInput` | Raw HTML + `.field-grid` | `shared/eliteos-ui/FormField.tsx` | **No** | Validation rules |
| `SearchInput` | Home, QL | `shared/eliteos-ui/SearchInput.tsx` | **No** | Search handlers |
| `DataTable` | Raw `<table>` in QL, SA, IE | `shared/eliteos-ui/DataTable.tsx` | **No** | Columns, row actions |
| `Tabs` | SA audit tabs; PA sections | `shared/eliteos-ui/Tabs.tsx` | **No** | Tab panels |
| `Timeline` / `AuditLog` | SA, QL, PA audits | `shared/eliteos-ui/Timeline.tsx` | **No** | Event types |
| `QuoteSummaryCard` | IE sticky rollup; QL overview | `shared/eliteos-ui/QuoteSummaryCard.tsx` | **No** | Internal vs customer totals |
| `CustomerEstimateDocument` | ✅ `app-quote/src/lib/customerEstimate/` | **Quote domain lib** (keep) | Done | Layout via constants |
| `AccountPicker` / `ContactPicker` | ❌ | `shared/eliteos-ui/AccountPicker.tsx` | **No** (Phase 6) | Autofill wiring |

### Known near-duplicates (do not merge pre-go-live)

| Pattern | Locations |
|---------|-----------|
| `EmailEstimateModal` | `app-internal-estimate/src/components/email-estimate/`, `app-quote-library/src/components/email-estimate/` |
| Quote files UI | `QuoteFilesPanel` (IE) vs `QuoteFilesBlock` (QL) |
| `statusPillClass()`, `pickDisplayTotal()`, `str()` | Duplicated within and across IE/QL |
| `quoteDeliveryApi.ts` | Parallel copies in IE and QL |
| Session bootstrap + `/api/me` fetch | ~70 lines duplicated across protected heads |
| Workspace identity constants | Hardcoded in QL, PA, SA; backend-driven in Home only |
| `ApiError` + fetch wrappers | `app-quote/src/lib/api.ts`, `app-home`, `app-system-admin`, `app-quote-library` |

---

## Shared UI roadmap (target structure)

Evolutionary expansion of `shared/eliteos-ui/` — not a new npm package before go-live stabilization.

```
shared/
  eliteos-ui/              ← shared UI layer (expand here)
    EliteosTopbar.tsx      ← exists
    eliteosTopbar.css      ← exists
    tokens.css             ← Phase 1 (canonical --eos-* from Home)
    primitives.css         ← Phase 1 (.btn, .card, .pill, .field-grid)
    hooks/
      useProtectedHeadSession.ts   ← Phase 2
    components/            ← Phase 1–4 primitives and shells
  eliteos-supabase/        ← exists
  eliteos-api/             ← Phase 2 (single ApiError + apiFetch)

app-quote/src/lib/         ← quote domain ONLY (math, customer document, delivery shapes)
  @quote-lib Vite alias    ← IE + Pricing Admin today; HTTP should migrate to eliteos-api

Each head/
  styles.css               ← eventually: @import shared tokens + head overrides only
  *App.tsx                 ← thins over phases; no big-bang rewrite
```

**Rejected for pre-go-live:** `packages/ui` npm workspace, broad `EliteAppShell` replacement, merging Internal Estimate save flow with shared components.

Visual source of truth for tokens: `app-home/src/ui/styles.css` per [eliteos-ui-direction.md](./eliteos-ui-direction.md).

---

## Admin-configurable settings map

Settings Chris should eventually edit through admin heads instead of code. Until tables/UI exist, treat these as **code-owned** with documented owners.

### System Admin–owned (future)

| Setting | Current location |
|---------|------------------|
| Branch addresses, phones, footer locations | `app-quote/src/lib/customerEstimate/documentConstants.ts`, `backend-core/src/quoteDelivery/customerEstimateBrandingConstants.js` |
| Email footer links, website URL | Same + `estimateEmailBuilder.js` |
| Customer payment terms, T&C bullets, card-fee note | Same constants |
| Branch dropdown list (IE) | `INTERNAL_BRANCHES` in `InternalEstimateApp.tsx` |
| Head navigation labels/descriptions | `backend-core/src/me/launcherHeads.js` (`HEAD_LAUNCHER_CATALOG`) |
| Org logo/name defaults | Hardcoded ESF in most heads; Home reads `/api/me` |
| Feature flags, email/PDF delivery toggles | Env vars + backend config |

### Pricing Admin–owned

| Setting | Notes |
|---------|-------|
| Elite 100 price groups and rates | Source of truth — do not duplicate in Account Directory |
| Add-ons / services | Pricing Admin UI |
| Public consumer markup percent | `public_consumer_markup_percent` rule |
| Partner pricing profiles | `PartnerSetupTab` |
| Pricing-change audit | Partner/pricing scope |

### Account Directory–owned (future)

| Setting | Notes |
|---------|-------|
| Account records, contacts | Replace free-text IE Job Info fields |
| Account aliases / misspellings | Migrate from `sales_account_aliases` + System Admin mapping UI |
| Default quote recipients (To/CC) | Email modal prefills |
| Salesperson / account owner mappings | Per-account, not global hardcoded list |
| Dealer settings | Delivery preferences; references pricing profile, does not own rates |
| Quote / sold-job metrics | Read-only context for IE and QL |

### Code-only (stay in code)

| Setting | Reason |
|---------|--------|
| Auth and head slugs | Security boundary (`eosGovernanceConstants.js`) |
| Route gates and RLS | Brain enforcement |
| Quote math engine, ESF number format | Domain invariants |
| Vanity program rates (until modeled in Pricing Admin) | Out of current scope |
| Customer output gate rules | Behavioral contract for go-live |

---

## Account Directory — future ownership model

Account Directory is a **separate head** (future slug e.g. `account_directory`), distinct from the planning-only `org_directory` head.

```
┌──────────────────────────────────────────────────────────┐
│  Account Directory Head                                   │
│  Owns: accounts, contacts, aliases, dealer settings,     │
│        default recipients, owner/salesperson, metrics      │
└─────────────────────────┬────────────────────────────────┘
                          │ GET/PATCH /api/account-directory/*
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
   Internal Estimate   Quote Library   Pricing Admin
   (AccountPicker)     (read-only      (pricing profile
                        display/link)    reference only)
```

**Rules:**

1. Internal Estimate and Quote Library **consume** account APIs and shared pickers; they do **not** own account CRUD.
2. Account Directory may **reference** Pricing Admin pricing profiles; it does **not** own pricing math or rate tables.
3. New account tables must be **`organization_id`** scoped.
4. Existing `SalesAccountMappingAdmin` (System Admin) is a precursor — migrate ownership to Account Directory in Phase 5, do not duplicate.
5. **Do not implement Account Directory before go-live.**

---

## Do not touch before go-live

The following areas are **frozen** for shared UI / refactor work until Elite 100 go-live is stable:

### Application flows

- Internal Estimate **save / update / revision** flow (`handleSubmit`, baseline signature, `applyPostSaveQuoteIdentity`, restore-as-revision)
- Internal Estimate **quote hydration** (`?quoteId=`, `hydrationRanRef`, revision family fetch)
- Internal Estimate **customer output gate** (auto-save before print/email, `quoteOutputGate.ts` behavior)
- Quote Library **archive** (single and batch) and eligibility guards
- Quote Library **revision restore** API contract
- **Quote math** (`prototypeQuoteMath.ts`, calculator payloads, customer pricing/rounding)
- **Email / PDF delivery** (server builders, dry-run behavior, attachment rules)
- **PDF renderer** (`CustomerEstimateDocument` behavior)
- **Vanity / side splash** math
- **Pricing Admin** rate/group business logic
- **Auth / head access** mutation paths (System Admin)

### Structural changes to avoid

- App shell or topbar replacement across heads
- Merging `EmailEstimateModal` implementations
- Shared `DataTable` migration in production heads
- Internal Estimate monolith extractions (hooks/components) — Phase 3 post-go-live
- Importing shared `tokens.css` / `primitives.css` into production heads — Phase 1 post-go-live
- `packages/ui` npm workspace setup
- Account Directory implementation

### Safe pre-go-live (docs and planning only)

- This document and contributing guide
- Component inventory updates
- Token value documentation (no CSS imports)
- Ownership boundary updates in `FEATURE_DECISIONS.md` when decisions are made

---

## Phased roadmap

### Phase 0 — Documentation and guardrails *(current)*

- [x] `SHARED_UI_ARCHITECTURE.md` (this file)
- [x] `SHARED_UI_CONTRIBUTING.md`
- [x] Pointer section in `HEAD_ARCHITECTURE_MAP_2026-05-27.md`
- No shared CSS imports; no production code changes

### Phase 1 — Shared design tokens and low-risk primitives

- `shared/eliteos-ui/tokens.css` (canonical `--eos-*` from Home)
- `shared/eliteos-ui/primitives.css` (Button, Card, Pill, FormField layout, ErrorBanner)
- `workspaceIdentity.ts`, `userDisplay.ts`, `topbarMenuItems.ts`
- Pilot import: **Pricing Admin only** first; verify visual parity
- No workflow behavior changes

### Phase 2 — Shared app shell / session

- `shared/eliteos-api/` (single `ApiError` + `apiFetch`)
- `useProtectedHeadSession` hook
- `EliteAppShell` composition (sign-in gate + topbar + main slot)
- Migrate Pricing Admin → Quote Library → Internal Estimate (last)

### Phase 3 — Internal Estimate modularization

- Extract hooks: session, hydration, revision, calculate, save, customer output
- Extract components: `JobInfoSection`, `SavePanel`, `InternalWorksheet`
- Run `verifyInternalQuote*.mjs` and manual save/revision/print/email checks each PR

### Phase 4 — Quote Library modularization

- `QuoteFilterBar`, metrics bar, batch archive bar
- Shared `DetailDrawer` shell; unified `EmailEstimateModal` (IE behavior as superset)
- Shared quote files component (read-only + upload modes)
- Preserve archive and revision behavior exactly

### Phase 5 — Account Directory head

- Backend: org-scoped account/contact/alias tables and APIs
- UI: account CRUD, alias editor, dealer settings, default recipients
- Migrate System Admin sales-account mapping concerns

### Phase 6 — Account autofill in IE / QL

- `AccountPicker`, `ContactPicker`
- Email To/CC defaults, salesperson prefill
- Quote metrics context (read-only)

---

## Risk matrix (summary)

| Item | Impact if rushed | Mitigation |
|------|------------------|------------|
| IE save/revision refactor | Critical data loss / wrong revision | Phase 3 only; verify scripts + manual QA |
| Token CSS import drift | Visual regression | One head at a time; Home screenshot diff |
| EmailEstimateModal merge | Broken delivery | Phase 4; preserve per-head API paths |
| Account Directory scope creep | Duplicated ownership | Strict boundaries in this doc |
| `@quote-lib` used for general UI | Wrong dependency graph | HTTP → `eliteos-api`; lib stays quote-domain |

---

## Verification scripts (Internal Estimate guardrails)

When Phase 3+ touches estimate behavior, run from `backend-core`:

| Script | Protects |
|--------|----------|
| `verifyInternalEstimateMath.mjs` | Calculator totals, markup leakage |
| `verifyInternalQuoteRevisions.mjs` | Revision numbering, restore payload |
| `verifyInternalQuoteSaveResponseContract.mjs` | Save response keys IE expects |
| `verifyPhase2InternalQuotePolicies.mjs` | Snapshot immutability, archive guards |

---

## Document history

| Date | Change |
|------|--------|
| 2026-06-29 | Phase 0 — initial shared UI architecture and guardrails |
