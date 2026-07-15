# Quote Intake Lab — Do Not Touch

**Purpose:** Hard isolation boundaries for all future Cursor prompts and human implementers.

**Date:** 2026-07-14 (updated 2026-07-15 for Phase 6P.0 live-promotion authorization)

**Only authorized future refactor target:** AI Takeoff (`app-ai-takeoff` + `backend-core/src/takeoff/*` pure/orchestration modules), and even that must go through a `TakeoffAdapter` / ProductionTakeoffAdapter without breaking Internal Estimate import.

**Phase 6P.0 authorization update:** Live promotion may add a **pilot-gated Estimator Queue tab/view** inside `app-ai-takeoff` and a **server-side ProductionTakeoffAdapter** that invokes existing takeoff **services** (not IE import). See `PHASE_6P_0_LIVE_PROMOTION_ARCHITECTURE.md` and `PHASE_6P_0_TAKEOFF_INTEGRATION_MAP.md`. Until an implementation slice explicitly starts, treat Takeoff as carefully as before — documentation phases must not modify it.

---

## Special warning — AI Takeoff

The assignment authorizes takeoff as the **only** existing product head open to bounded live-promotion refactoring.

Repository fact: AI Takeoff is **live** (`takeoff.eliteosfab.com`, production tables, IE import path enabled under beta gates). Treat it as a **production-critical adjacent system**, not a dead prototype.

**Rules when refactoring takeoff later (including 6P.3+):**

1. Prefer extracting shared pure modules; avoid drive-by IE UI changes.
2. Do **not** modify Internal Estimate takeoff import components or `import-from-takeoff` behavior as part of intake work.
3. Local Quote Intake Lab must not write production `quote_takeoff_jobs` / `quote_takeoff_results` / `eliteos-quote-files` from the lab head. Live promotion may create takeoff jobs **only** via the server ProductionTakeoffAdapter after trusted gates (6P.6+).
4. Any takeoff refactor lands behind adapter boundaries and keeps IE + interactive Takeoff green.
5. Default Takeoff workbench (upload → generate → review → approve → optional import UI) must not regress; Queue is additive and pilot-gated.
6. Intake automation must **never** call `POST /api/internal-quotes/import-from-takeoff` or auto-set `betaImportConfirmed`.

---

## 1. Applications / heads — do not modify

| Path | Why it matters | Lab alternative |
|------|----------------|-----------------|
| `app-internal-estimate/**` | Live estimator quoting product | Lab review workspace in `app-quote-intake-lab` |
| `app-quote/**` | Public quote + shared quote UI/math mirrors | Lab-only UI; PricingAdapter for math |
| `app-quote-library/**` | Production archive / status workflow | `QuoteLibraryAdapter` → lab drafts |
| `app-partner-quote/**` | Dealer quoting | Out of scope |
| `app-custom-quote/**` | Off-program material quotes | Out of scope |
| `app-pricing-admin/**` | Live pricing configuration UI | Elite100CatalogAdapter snapshot |
| `app-home/**` | Production launcher navigation | Manual URL / quarantined head only |
| `app-sales/**`, `app-executive/**`, `app-system-admin/**`, `app-brain-health/**`, `app-hr/**`, `app-install-dashboard/**`, `app-slab-inventory/**`, `app-visualizer/**`, `app-kiosk/**`, `app-org-directory/**`, `app-quickbooks-intelligence/**` | Unrelated production heads | No coupling |
| `app-ai-takeoff/**` | **Bounded live-promotion host (6P.3+ only)** — Estimator Queue tab/view; default workbench unchanged | Leave untouched in Phases 0–4B lab isolation and in Phase 6P.0 docs; implement only when slice prompt authorizes |

---

## 2. Backend quote / delivery / integration modules — do not modify

| Path | Why | Lab alternative |
|------|-----|-----------------|
| `backend-core/src/quotes/quoteCalculator.js` | **Pricing authority** — may be *called* read-only via adapter, not edited for lab features | `PricingAdapter` facade |
| `backend-core/src/quotes/quotePersist.js` | Writes `quote_headers` | Lab quote tables |
| `backend-core/src/quotes/quoteRoutes.js` | Public/internal calculate+submit contracts | `/api/quote-intake-lab/*` |
| `backend-core/src/quotes/internalQuotesApi.js` | IE CRUD + `import-from-takeoff` | Lab case APIs |
| `backend-core/src/quotes/quoteLibraryApi.js` | Production library mutations | Lab draft adapter |
| `backend-core/src/quotes/partnerQuotesApi.js` | Partner contracts | Out of scope |
| `backend-core/src/quotes/customQuotesApi.js` (if present) / custom quote routes | Custom program | Out of scope |
| `backend-core/src/quotes/quotePipelineApi.js` | Pipeline status patches | Lab `intake_status` |
| `backend-core/src/quotes/pricingAdmin*.js` / pricing admin APIs | Live pricing admin | Snapshot catalog |
| `backend-core/src/quoteDelivery/**` | Production PDF/email send path | `PdfRendererAdapter` / `EmailDeliveryAdapter` stubs |
| `backend-core/src/email/emailClient.js` | Resend send | Simulated send only |
| `backend-core/src/integrations/mondayQuoteSync.js` | Monday CRM sync | No Monday calls |
| `backend-core/src/moraware/**` | Moraware sync | No coupling |
| `backend-core/src/quickbooks/**` | QuickBooks | No coupling |
| `backend-core/src/me/launcherHeads.js` | Production Home cards | Do not register lab card in MVP |
| Auth middleware behavior in `backend-core/src/auth/**` | Global security | Use existing helpers; do not weaken |

**Additive exception (when Phase 1+ starts):** new files under `backend-core/src/quoteIntakeLab/**` and a single `attachQuoteIntakeLabRoutes` registration line in `server.js` — only when explicitly entering implementation phases. Phase 0 does **not** edit `server.js`.

---

## 3. Takeoff — careful zone

| Path | Classification | Rule |
|------|----------------|------|
| `backend-core/src/takeoff/*.mjs` pure modules | Read / call via adapter | Do not change contracts for lab convenience without tests |
| `backend-core/src/takeoff/takeoffWorkspaceService.mjs` + generation/extraction services | Allowed via **ProductionTakeoffAdapter** in 6P.6+ | Prefer internal service calls; do not fork providers/prompts |
| `backend-core/src/takeoff/takeoffWorkspaceRoutes.js` | Production interactive API | Keep contracts stable; do not overload routes as Graph/email intake APIs |
| Production takeoff SQL / tables | Live | Interactive Takeoff continues to use them; intake links via `quote_intake_takeoff_links` — do not merge intake columns into takeoff tables unless unavoidable |
| New `backend-core/src/quoteIntake/**` (or successor) | Authorized additive package (6P.1+) | Namespaced intake APIs only |
| `app-ai-takeoff` Estimator Queue tab | Authorized additive UI (6P.3+) | Default workbench unchanged; pilot-gated |
| `app-internal-estimate/**/Takeoff*` | DO NOT TOUCH | Hard boundary |
| `POST /api/internal-quotes/import-from-takeoff` | DO NOT TOUCH / never automate | Intake never calls; pilot keeps promotion disabled |
| `shared/eliteos-ui/Takeoff*.tsx` | Safe import w/o modification | Do not repurpose for intake queue chrome without shared-UI approval |

---

## 4. Database / storage — do not touch (production)

| Artifact | Why | Lab alternative |
|----------|-----|-----------------|
| `quote_headers` and related quote child tables | Production Quote Library source of truth | `quote_intake_lab_quotes` (staging) |
| `quote_status_history` | Production audit | Lab audit events |
| `quote_pricing_rules` writes | Live catalog | Read-only snapshot / fixture |
| `quote_takeoff_jobs`, `quote_takeoff_results`, `quote_files`, `quote_file_events` | Live takeoff | Lab takeoff run tables |
| Bucket `eliteos-quote-files` | Production plans | Lab/staging bucket |
| Any production migration under `backend-core/supabase/` applied to prod | Risk to live tenants | Staging project migrations only |
| RLS / auth schema production hardening scripts | Global security | Do not dilute |

---

## 5. Shared UI / packages — modification rules

| Path | Rule |
|------|------|
| `shared/eliteos-ui/EliteosTopbar.tsx` | Import only; do not add intake business logic |
| `shared/eliteos-ui/tokens.css`, `primitives.css` | Import only |
| `shared/eliteos-supabase/**` | Import only |
| Expanding shared UI for lab-only widgets | Prefer lab-local components until a shared-UI contribution is approved (`docs/eliteos/SHARED_UI_CONTRIBUTING.md`) |

---

## 6. API contracts / env / deploy — do not change

| Boundary | Why | Lab alternative |
|----------|-----|-----------------|
| `/api/public-quote/*` | Public regression bar (quote-platform rule) | Lab namespace only |
| `/api/quote/calculate`, `/api/quote/submit` | Production quote contracts | Lab preview endpoint |
| `/api/quote-library/*` | Production library | Lab draft routes |
| `/api/internal-quotes/*` | IE | Lab cases |
| Existing `VITE_*` / `QUOTE_EMAIL_*` / `HEAD_URL_*` meanings | Deploy coupling | New `QUOTE_INTAKE_LAB_*` vars when needed |
| Root `package.json` / lockfiles | Build graph | Untouched until Phase 1 scaffold explicitly allows additive scripts |
| `backend-core/vercel.json` production settings | Deploy risk | Untouched in early phases |
| Production CORS allowlists | Security | Preview/lab origin only when approved |

---

## 7. Documentation boundaries

| Path | Rule |
|------|------|
| `docs/quote-intake-lab/**` | **Allowed** — this initiative’s home |
| `docs/eliteos/SYSTEM_BLUEPRINT.md`, `FEATURE_DECISIONS.md`, head map | Do not edit in Phase 0; add FEATURE_DECISIONS entry only when scaffolding begins |
| `docs/quote-platform/**` | Do not rewrite for lab |

---

## 8. Checklist — every future Cursor prompt must follow

Copy into implementation prompts:

```
[ ] Documentation or code changes for Quote Intake Lab only under approved paths
[ ] No edits to Internal Estimate, Public/Partner/Custom Quote, Quote Library apps
[ ] No edits to quoteCalculator.js, quotePersist, quoteDelivery send, monday/moraware/quickbooks
[ ] No production Supabase migrations; no writes to quote_headers / eliteos-quote-files
[ ] No Home Launcher card; no live Outlook/Resend send; no Monday sync
[ ] New APIs only under /api/quote-intake-lab/*
[ ] All production touchpoints go through adapters (email, takeoff, catalog, pricing, library, pdf, delivery)
[ ] AI Takeoff refactor only when phase explicitly says so; never via IE import routes
[ ] Preserve any pre-existing dirty working-tree files unrelated to the lab
[ ] Do not commit / push / deploy unless the human explicitly asks
[ ] After changes: git diff --check && git status --short — only expected lab paths
```

---

## 9. Why these boundaries exist

eliteOS heads share one Brain. Silent coupling has already produced cross-head regressions in quoting, takeoff import, and delivery. The Intake Lab exists to **de-risk automation** for email-driven Elite 100 estimating. Isolation failure modes include: wrong quote_status transitions, accidental customer emails, Monday clutter, corrupted takeoff jobs used by estimators, and catalog/price drift.

When in doubt: **replicate in the lab** or **adapter stub**, never “just patch” a production module.
