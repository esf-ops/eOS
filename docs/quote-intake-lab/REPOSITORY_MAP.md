# Quote Intake Lab — Repository Map

**Date:** 2026-07-14  
**Scope:** Architecture discovery only. No application code was added or modified.  
**Working tree at discovery:** clean (`git status` showed no pending changes).

---

## 1. Current relevant repository structure

```
eOS/
├── app-*/                         # Flat peer Vite + React heads (no apps/ workspace)
│   ├── app-home/                  # Home Launcher (do not add lab card in MVP)
│   ├── app-ai-takeoff/            # AI Takeoff Lab head (authorized future refactor target)
│   ├── app-internal-estimate/     # Internal Estimate (DO NOT TOUCH)
│   ├── app-quote/                 # Public Quote + shared quote UI libs (DO NOT TOUCH)
│   ├── app-quote-library/         # Quote Library head (DO NOT TOUCH)
│   ├── app-partner-quote/         # Partner Quote (DO NOT TOUCH)
│   ├── app-custom-quote/          # Custom Quote (DO NOT TOUCH)
│   ├── app-pricing-admin/         # Pricing Admin (read-only for lab research)
│   └── …                          # sales, hr, visualizer, slab-inventory, etc.
├── backend-core/
│   ├── src/
│   │   ├── server.js              # Express 5 app; all attach*Routes registration
│   │   ├── auth/                  # requireAuth, requireHeadAccess, governance slugs
│   │   ├── quotes/                # quoteCalculator, quote_headers persistence, libraries
│   │   ├── quoteDelivery/         # PDF + Resend email delivery
│   │   ├── takeoff/               # Pure takeoff contracts + workspace APIs
│   │   ├── email/                 # emailClient (Resend)
│   │   ├── me/                    # launcherHeads, headDeploymentUrls
│   │   └── …                      # moraware, monday, quickbooks, etc.
│   ├── api/index.js               # Vercel serverless entry
│   └── supabase/                  # SQL migrations / foundations (production)
├── shared/
│   ├── eliteos-ui/                # Presentational UI (EliteosTopbar, tokens, Takeoff* banners)
│   └── eliteos-supabase/          # Cookie-scoped auth options
├── docs/
│   ├── eliteos/                   # Living system docs (canonical for product architecture)
│   ├── quote-platform/            # Quote engine / takeoff plans
│   └── quote-intake-lab/          # THIS INITIATIVE (new, isolated)
├── package.json                   # Backend host + eos:build:* / eos:test:* scripts
└── .cursor/rules/                 # Always-on agent rules (no root AGENTS.md)
```

There is **no npm workspaces** field. Each `app-*` has its own `package.json`. Root scripts build heads via `npm run build --prefix app-<name>`.

---

## 2. AI Takeoff file inventory

### Head — `app-ai-takeoff/` (port **5186**, slug `ai_takeoff`, host `takeoff.eliteosfab.com`)

| Path | Role |
|------|------|
| `src/TakeoffLabApp.tsx` | App shell |
| `src/main.tsx` | Bootstrap |
| `src/lib/api.ts` | Backend `/api/takeoff*` client |
| `src/lib/supabase.ts` | Anon Supabase client |
| `src/lib/authSession.ts` | Session bootstrap |
| `src/lib/config.ts` | `VITE_*` config |
| `src/lib/takeoffWorkflowUi.ts` | UI workflow helpers |
| `src/lib/takeoffBeta.ts` | Beta gating copy/flags |
| `src/lib/takeoffGenerationPoll.mjs` | Async generation polling |
| `src/components/TakeoffRunInbox.tsx` | Job list |
| `src/components/TakeoffWorkbench.tsx` | Main workbench |
| `src/components/TakeoffReviewWorkbench.tsx` | Review surface |
| `src/components/Takeoff*Panel.tsx` | QA, evidence, readiness, diagnostics, etc. |
| `vite.config.ts` | Proxies `/api`; aliases `@takeoff-core` → `backend-core/src/takeoff` |

### Backend — `backend-core/src/takeoff/` (≈65 modules)

**Contract / pure (preferred reuse behind adapter):**

- `takeoffContract.mjs` — versioned TakeoffResult schema
- `takeoffMeasurementCalc.mjs` — recomputed sf authority
- `takeoffValidator.mjs` — AI vs computed validation
- `takeoffImportPlanner.mjs` / `takeoffImportMeasurements.mjs` / `takeoffImportWorkflow.mjs`
- `takeoffApprovalGate.mjs` / `takeoffQaGate.mjs` / `takeoffWorkflowState.mjs`
- `takeoffReviewStatus.mjs` — `TAKEOFF_WORKFLOW_STATUS`
- `takeoffFabricationRules.mjs`, `reviewedTakeoffMath.mjs`, evidence/page inventory helpers

**I/O / orchestration (wrap; do not call production import paths):**

- `takeoffWorkspaceRoutes.js` — Express mounts under `/api/takeoff*` and related
- `takeoffWorkspaceService.mjs`, `takeoffExtractionService.mjs`
- `takeoffProcessOrchestrator.mjs` / `takeoffGenerationOrchestrator.mjs`
- Providers: `geminiTakeoffProvider.mjs`, `openAiTakeoffProvider.mjs`, `exayardTakeoffProvider.mjs`

### Production tables / storage (DO NOT migrate or reuse for lab writes)

| Artifact | Notes |
|----------|-------|
| `quote_takeoff_jobs` | Job status + `review_status` |
| `quote_takeoff_results` | Result JSON + corrections audit |
| `quote_files` / `quote_file_events` | File metadata + events |
| Bucket `eliteos-quote-files` | Private; signed URLs only |
| SQL foundations | `backend-core/supabase/eos_quote_takeoff_visual_foundation.sql`, `eliteos_quote_files_takeoff_storage.sql`, `eliteos_takeoff_import_traceability.sql` |

### Shared UI takeoff pieces — `shared/eliteos-ui/`

- `TakeoffBetaBanner.tsx`, `TakeoffFeedbackForm.tsx`, `TakeoffIssueReportModal.tsx`
- `takeoffBetaCopy.ts`, `takeoffWorkflow.css`, `useWorkflowRailScrollSpy.ts`

Safe to **import without modification** (presentational). Do not expand these for lab-specific estimator UX without a separate shared-UI approval.

### Internal Estimate coupling (DO NOT TOUCH)

| Path | Why |
|------|-----|
| `app-internal-estimate/src/lib/takeoffImportWorkflow.ts` | Client mirror of import workflow |
| `app-internal-estimate/src/lib/takeoffBeta*.ts` | Beta import API |
| `app-internal-estimate/src/components/internal-estimate/Takeoff*.tsx` | Receipt, checklist, traceability, drawers |
| `POST /api/internal-quotes/import-from-takeoff` | Creates production IE drafts |
| `POST /api/internal-quotes/:id/detach-takeoff-import` | Mutates IE drafts |

Docs: `docs/eliteos/ai-takeoff-foundation.md`, `docs/eliteos/SHARED_UI_TAKEOFF_IMPLEMENTATION_NOTE.md`.

### Takeoff status layers (do not conflate with intake-lab case status)

| Layer | Values / location |
|-------|-------------------|
| Job `status` | `pending`, `processing`, `completed`, `failed` |
| DB `review_status` | `needs_review`, `approved` |
| Workflow UI | `ai_draft`, `needs_review`, `review_complete`, `approved_for_import`, `imported` (`takeoffReviewStatus.mjs`) |
| Processing phases | `queued` → `download` → `page_inventory` → `dimension_evidence` → `extraction` → `normalize` → `persist` → `done` |
| QA gate | `ready_for_review` / `needs_review` / `do_not_import` (gate module) |
| Result contract `status` | AI drafts forced to `"draft"` until human review |

---

## 3. Existing quote / pricing boundaries

| Concern | Authority | Path |
|---------|-----------|------|
| **Calculate** | `calculateQuote()` | `backend-core/src/quotes/quoteCalculator.js` |
| **ESF Direct tiers** | `ESF_DIRECT_PRICE_PER_SQFT` (Promo–F, Remnant) | same file |
| **Elite 100 colors / groups** | `quote_pricing_rules` where `category = 'material_color'`; group from `metadata.group` | `materialColorsCatalog.js`; `GET /api/internal-quotes/material-colors` |
| **Pricing Admin tables** | `quote_price_groups` / rates exist | **Not fully wired** into `calculateQuote()` yet (TODO in pricing resolver) |
| **Slab inventory price_group** | SlabCloud import | **Non-authoritative** for quoting |
| **Local Elite 100 fixture** | JSON fixture | `backend-core/src/slabInventory/fixtures/elite100-2026.json` (+ `sales/elite100CatalogFixture.js`) |
| **Frontend preview math** | UI mirror only | `app-quote/src/lib/prototypeQuoteMath.ts` — not authority |
| **Public calculate** | Legacy aggregate payload | `POST /api/public-quote/calculate` — do not break |
| **Internal calculate** | Auth’d IE path | `POST /api/quote/calculate` / internal-quotes calculate |

---

## 4. Existing Quote Library boundary

- Head: `app-quote-library/` (port **5183**, slug `quote_library`).
- API: `backend-core/src/quotes/quoteLibraryApi.js` → `/api/quote-library/*`.
- Persistence: shared production table **`quote_headers`** (plus related line/room/status history tables). There is **no separate “library” table** — the head is a management UI over the same rows Internal Estimate / public / partner / custom writes.
- Status sets:
  - Internal: `draft`, `testing_review`, `sent`, `follow_up`, `revised`, `sold`, `lost`, `archived`, `submitted`
  - Public: `lead_submitted`, `reviewing`, `contacted`, `quoted`, `won`, `lost`, `archived`
- Persist helper: `quotePersist.js` / Internal Estimate save paths in `internalQuotesApi.js`.

**Lab implication:** never insert into `quote_headers` until a controlled Phase 10 promotion through `QuoteLibraryAdapter`. Lab drafts live in isolated lab tables (or staging project).

---

## 5. Existing PDF / email boundary

| Piece | Location | Notes |
|-------|----------|-------|
| PDF pipeline | `backend-core/src/quoteDelivery/` | Puppeteer/Chromium + prebuilt SSR under `quoteDelivery/generated/` |
| Email client | `backend-core/src/email/emailClient.js` | **Resend** only; `QUOTE_EMAIL_SEND_ENABLED` defaults off |
| Email builder | `estimateEmailBuilder.js` | “Outlook-safe” HTML layout — not Microsoft Graph |
| IE print path | `app-internal-estimate` print components | Browser print — separate from server PDF |
| Monday sync | `backend-core/src/integrations/mondayQuoteSync.js` | Must not be triggered by lab |

**Outlook / Graph:** **not implemented.** `FEATURE_DECISIONS.md` lists Microsoft Graph / Outlook send as **deferred**. Lab Phase 9 must build a new adapter, not call production Resend send.

---

## 6. Recommended new lab paths

| Resource | Recommended path | Convention match |
|----------|------------------|------------------|
| Frontend head | `app-quote-intake-lab/` | Matches `app-{kebab}/` |
| Dev port | **5196** (next after kiosk 5195) | Monotonic ports |
| Backend module | `backend-core/src/quoteIntakeLab/` | camelCase domain folders |
| Routes file | `quoteIntakeLabRoutes.js` exporting `attachQuoteIntakeLabRoutes` | Matches HR / install / visualizer |
| API prefix | `/api/quote-intake-lab/*` | kebab-case prefixes |
| Head slug (when registered) | `quote_intake_lab` | snake_case slugs |
| Env (CORS only, later) | `HEAD_URL_QUOTE_INTAKE_LAB` | `HEAD_URL_*` pattern |
| Docs (this initiative) | `docs/quote-intake-lab/` | **Prompt-mandated**; see §8 |
| Fixtures | `app-quote-intake-lab/fixtures/` and/or `backend-core/src/quoteIntakeLab/fixtures/` | Co-located like takeoff `fixtures/` |
| Lab data | Prefer **separate staging Supabase project**; else `quote_intake_lab_*` tables in non-prod only | No production migrations in early phases |

**MVP quarantine vs full new-head checklist:**  
`SYSTEM_BLUEPRINT.md` §16 requires slug registration in `eosGovernanceConstants.js`, `launcherHeads.js`, and head-map updates for production-ready protected heads. For intake lab MVP: **omit Home Launcher card** and delay production CORS/build registration until an explicit Phase decision. Still require `requireAuth()` on any Brain routes that exist. Document the intentional exception in `FEATURE_DECISIONS.md` only when scaffolding begins (not in this docs-only phase).

---

## 7. Areas where repository facts differ from the assignment prompt

| Prompt assumption | Repository fact |
|-------------------|-----------------|
| AI Takeoff “is not currently being used” | **Incorrect.** Live head at `takeoff.eliteosfab.com`; foundation doc marks run inbox, approval, and IE import as shipped (v6.1–v6.4 controlled beta). Refactor is still authorized by this initiative, but must treat production takeoff tables/APIs as **live** and prefer adapter + parallel lab jobs. |
| Suggested paths roughly correct | Largely yes; backend folder should be **camelCase** (`quoteIntakeLab`), not kebab. |
| Docs under `docs/quote-intake-lab/` | Allowed and created here; living product docs conventionally live under `docs/eliteos/` (e.g. `ai-takeoff-foundation.md`). Keep lab docs here to avoid editing living docs until a later architecture lock entry. |
| Outlook exists for send | **No Graph/Outlook send today.** Production send is Resend + env gates. |
| Quote Library is a separate save sink | Saves land in shared **`quote_headers`**; library is a view/manager. |
| State names can mirror takeoff/quote statuses | **Unsafe.** Production already uses `needs_review`, `draft`, `sent`, `failed`, etc. Lab must use a **namespaced** status vocabulary (see `ARCHITECTURE.md`). |
| Isolate from Home Launcher | Compatible; `ai_takeoff` is launcher-wired today, but lab may stay quarantined. |
| Separate staging Supabase | Preferred; no second project is wired in-repo yet — must be created operationally. |

---

## 8. Auth, data-access, tests, env (brief)

| Topic | Fact |
|-------|------|
| Auth | Supabase JWT + `requireAuth` / `requireHeadAccess`; cookie session via `shared/eliteos-supabase` |
| Backend DB | Service-role singleton in `server.js`; org from auth context |
| Frontend DB | Anon client; privileged mutations via Brain API only |
| Tests | Node built-in `node:test` + `*.test.mjs` co-located; no Jest/Vitest standard |
| Deploy | Heads → Vercel static; Brain → `backend-core/api/index.js`; CORS from `*HEAD_URL_*` |
| Agent instructions | No root `AGENTS.md`; `.cursor/rules/{eliteos-architecture,security-audit,quote-platform}.mdc` |

---

## 9. Classification summary (existing components)

| Component | Classification |
|-----------|----------------|
| `shared/eliteos-ui` presentational (Topbar, tokens, Takeoff beta banners) | Safe import without modification |
| `shared/eliteos-supabase` | Safe import without modification |
| `backend-core/src/takeoff/*.mjs` pure modules | Safe read-only reuse; call via TakeoffAdapter |
| Existing `/api/takeoff*` against prod tables | Must wrap; lab should not write production takeoff tables |
| `calculateQuote()` | Safe read-only reuse behind PricingAdapter (no mutation) |
| `materialColorsCatalog` / Elite 100 fixture JSON | Read-only via Elite100CatalogAdapter; prefer lab snapshot |
| `quote_headers` / Quote Library / IE save | Do not touch; QuoteLibraryAdapter → lab draft only until Phase 10 |
| PDF / Resend delivery | Must wrap; lab drafts/previews only |
| Monday / Moraware / QuickBooks | Do not touch |
| Internal Estimate / Public / Partner / Custom Quote apps | Do not touch |
| Home Launcher production nav | Do not touch (no lab card) |
| Production Supabase migrations / buckets | Do not touch |
|}
