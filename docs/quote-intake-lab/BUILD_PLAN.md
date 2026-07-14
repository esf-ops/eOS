# Quote Intake Lab — Build Plan

**Date:** 2026-07-14  
**Rule:** Complete and accept each phase before starting the next. Phase 0 is documentation-only (this folder). **Do not begin Phase 1 in the same prompt as Phase 0.**

Conventions: paths from [`REPOSITORY_MAP.md`](./REPOSITORY_MAP.md). Isolation rules from [`DO_NOT_TOUCH.md`](./DO_NOT_TOUCH.md). Architecture from [`ARCHITECTURE.md`](./ARCHITECTURE.md).

---

## Phase 0 — Architecture lock

| | |
|--|--|
| **Goal** | Freeze isolation rules, adapters, state model, and repo map before any scaffold. |
| **Files added** | `docs/quote-intake-lab/{ARCHITECTURE,DO_NOT_TOUCH,BUILD_PLAN,REPOSITORY_MAP}.md` |
| **May read/import** | Entire repo (read-only) |
| **Must not modify** | Any source, manifests, migrations, living eliteOS docs, Home Launcher |
| **Acceptance** | Four docs exist; classifications + `qil_*` statuses + adapter contracts documented; AI Takeoff “live vs unused” discrepancy recorded |
| **Tests** | None (docs) |
| **Rollback** | Delete `docs/quote-intake-lab/` |
| **Risks** | Prompt assumed takeoff unused — plan must treat takeoff as live |
| **Stop before next** | Human signs off on architecture; no `app-quote-intake-lab` yet |

---

## Phase 1 — Isolated lab scaffold and fixture-driven queue

| | |
|--|--|
| **Goal** | Empty protected-capable head + backend namespace that lists fixture cases only. No production registration on Home Launcher. |
| **Files expected** | `app-quote-intake-lab/**` (Vite scaffold, port 5196); `backend-core/src/quoteIntakeLab/quoteIntakeLabRoutes.js` (+ attach in `server.js` only if required to serve routes locally); `backend-core/src/quoteIntakeLab/fixtures/*.json`; minimal queue UI |
| **May read/import** | `shared/eliteos-ui/EliteosTopbar`, `shared/eliteos-supabase`, patterns from `app-ai-takeoff` / `app-quote-library` bootstraps |
| **Must not modify** | Launcher (`launcherHeads.js`), production heads, quote modules, takeoff production routes, package lock churn beyond additive head package |
| **Acceptance** | Dev: open lab URL → auth → see fixture queue; API `GET /api/quote-intake-lab/cases` returns fixtures; no launcher card; no prod tables written |
| **Tests** | `quoteIntakeLabRoutes.test.mjs` — fixture list shape, auth required |
| **Rollback** | Remove new head + backend folder; revert single `server.js` attach line |
| **Risks** | Accidental slug registration → delay registration until Phase 8+ |
| **Stop before next** | Fixture queue demos cleanly; DO_NOT_TOUCH checklist passes `git status` |

---

## Phase 2 — Manual email and `.eml` ingestion

| | |
|--|--|
| **Goal** | Ingest `.eml`, pasted email, and attachments into lab store via `InboundEmailAdapter`. |
| **Files expected** | `inboundEmailAdapter.*`, parsers, lab storage helpers, upload UI, idempotency module |
| **May read/import** | Node email parsing libraries (new dep only inside lab package/backend with approval); existing file-upload patterns (read-only) |
| **Must not modify** | `eliteos-quote-files`, quote file APIs, delivery modules |
| **Acceptance** | Upload sample `.eml` → case `qil_received`; duplicate Message-ID returns same case; original raw preserved |
| **Tests** | Idempotency + normalization unit tests with fixture `.eml` files under lab fixtures |
| **Rollback** | Disable ingest routes; drop staging tables only |
| **Risks** | PII in fixtures committed to git — use anonymized samples |
| **Stop before next** | At least 3 fixture emails ingest stably |

---

## Phase 3 — Email classification and field extraction

| | |
|--|--|
| **Goal** | Classify quote vs not; Elite 100 vs not; extract MVP fields into case + extraction versions. |
| **Files expected** | Classifier/extractor modules, `qil_classifying` → branch statuses, extraction audit events |
| **May read/import** | Elite100CatalogAdapter snapshot for color alias hints; pure string utilities elsewhere (read-only) |
| **Must not modify** | Monday sync, pricing rules writers, IE |
| **Acceptance** | Fixtures land in `qil_not_quote` / `qil_not_elite_100` / continue path; color + address fields populated when present; missing flags set |
| **Tests** | Fixture matrix: quote/non-quote/Elite100/non-Elite100 |
| **Rollback** | Feature-flag classifier off → manual field entry only |
| **Risks** | LLM non-determinism — pin prompts + golden fixtures |
| **Stop before next** | Classification accuracy acceptable on fixture set; no takeoff calls yet |

---

## Phase 4 — AI Takeoff refactor / integration

| | |
|--|--|
| **Goal** | `TakeoffAdapter` runs takeoff for lab cases with plan attachments; results stored in **lab** takeoff tables. Optional careful extraction of shared takeoff orchestration **only if** required — no IE changes. |
| **Files expected** | `takeoffAdapter.*`, lab takeoff run persistence, UI panels for measurements/evidence (lab-local), statuses `qil_takeoff_processing` / `qil_needs_manual_takeoff` |
| **May read/import** | Pure `backend-core/src/takeoff/*.mjs`; `@takeoff-core` alias pattern from `app-ai-takeoff/vite.config.ts` |
| **Must not modify** | `app-internal-estimate/**`, `import-from-takeoff`, production takeoff job tables (default), shared Takeoff UI beyond import-without-change |
| **Acceptance** | Plan PDF in fixture → lab takeoff result with sf/cutouts/evidence; case → `qil_ready_for_review` or `qil_needs_manual_takeoff`; production `quote_takeoff_jobs` row count unchanged |
| **Tests** | Adapter tests with recorded takeoff fixtures; regression run existing takeoff `*.test.mjs` if any pure modules touched |
| **Rollback** | Adapter returns `needs_manual`; revert any takeoff file edits |
| **Risks** | **Highest phase risk** — takeoff is live; prefer parallel lab runs over refactoring shared code |
| **Stop before next** | Human confirms IE takeoff import + Takeoff Lab still green; no production table writes |

---

## Phase 5 — Estimator review workspace

| | |
|--|--|
| **Goal** | Estimators open cases, edit fields, add custom line items, move `qil_ready_for_review` ↔ `qil_in_review`, full AI-vs-human audit. |
| **Files expected** | Review UI, line-item API, audit event writers, optimistic lock / claimed-by |
| **May read/import** | Topbar, tokens, status pill patterns (visual only) |
| **Must not modify** | IE review chrome, Quote Library UI |
| **Acceptance** | Correction of AI color/sf logs before/after; custom lines persist; second user sees audit trail |
| **Tests** | API tests for corrections + line items + illegal status jumps |
| **Rollback** | Read-only mode flag |
| **Risks** | Concurrent edits — start with simple `claimed_by` |
| **Stop before next** | Estimators can complete review without pricing |

---

## Phase 6 — Isolated Elite 100 pricing preview

| | |
|--|--|
| **Goal** | Price comparison across Elite 100 groups via `PricingAdapter` + catalog adapter; preview only. |
| **Files expected** | `pricingAdapter.*`, `elite100CatalogAdapter.*` (+ snapshot JSON), pricing preview panel |
| **May read/import** | `calculateQuote()` **read-only**; `elite100-2026.json` / exported material_color snapshot |
| **Must not modify** | `quoteCalculator.js` source, pricing admin APIs, public calculate contract |
| **Acceptance** | Selecting Group A vs Promo changes preview totals; custom lines included; nothing in `quote_headers` |
| **Tests** | Pricing adapter contract tests with fixed inputs; group matrix snapshot |
| **Rollback** | Hide pricing panel |
| **Risks** | Accidental persistence — adapter must not call `persistQuoteSubmission` |
| **Stop before next** | Pricing preview matches expected fixture totals within tolerance |

---

## Phase 7 — Missing-information detection and draft communication

| | |
|--|--|
| **Goal** | Compute missing flags; transition `qil_needs_information`; draft customer follow-up preview via `EmailDeliveryAdapter.renderPreview`. |
| **Files expected** | Missing-info rules engine, draft message templates, preview UI |
| **May read/import** | Email HTML layout ideas from `estimateEmailBuilder.js` (**copy patterns into lab**, do not modify production builder) |
| **Must not modify** | `emailClient.js`, quoteDelivery send routes |
| **Acceptance** | Incomplete fixture → needs_information + editable draft; send buttons are preview/simulate only |
| **Tests** | Rules unit tests; assert sendLive/Resend never invoked |
| **Rollback** | Disable draft generation |
| **Risks** | Over-aggressive emails — keep human edit mandatory |
| **Stop before next** | No provider network calls in tests |

---

## Phase 8 — Simulated approval and lab quote record

| | |
|--|--|
| **Goal** | Approve → `qil_approved_lab_quote` → lab quote record via `QuoteLibraryAdapter.saveLabDraft` → `qil_ready_to_send_lab` → `qil_sent_simulated`. |
| **Files expected** | Lab quote schema, approval API, PDF preview adapter stub, simulation log |
| **May read/import** | Pdf preview patterns (read-only) |
| **Must not modify** | Quote Library app/API, `quote_headers` |
| **Acceptance** | End-to-end fixture path to `qil_sent_simulated`; lab quote retrievable; production quotes unchanged |
| **Tests** | E2E-ish API flow test on fixtures |
| **Rollback** | Soft-delete lab quotes; status back to `qil_in_review` |
| **Risks** | Naming collision with production “sent” — keep `qil_` prefix |
| **Stop before next** | MVP demo complete; Outlook/Graph still absent |

---

## Phase 9 — Outlook adapter

| | |
|--|--|
| **Goal** | Implement Graph-backed `InboundEmailAdapter.pollMailbox` and optional live send behind hard flags — still isolated credentials. |
| **Files expected** | `outlookGraphClient.*`, secret env docs, mailbox allowlist |
| **May read/import** | Lab adapter interfaces only |
| **Must not modify** | Resend client defaults, production `QUOTE_EMAIL_SEND_ENABLED` semantics |
| **Acceptance** | Staging mailbox poll creates cases; live send requires dual flag + allowlisted recipients; disabled in production by default |
| **Tests** | Mock Graph client; refuse send without flags |
| **Rollback** | Set live flags to 0; revert to upload-only ingest |
| **Risks** | Tenant email exfiltration — strict allowlists |
| **Stop before next** | Security review sign-off |

---

## Phase 10 — Controlled Quote Library integration

| | |
|--|--|
| **Goal** | Optional `promoteToProduction` mapping lab quote → `quote_headers` through existing Brain persist, fully audited and flag-gated. |
| **Files expected** | Promoter mapper, admin-only route, runbook |
| **May read/import** | `persistQuoteSubmission` / internal save payload shapes (**call**, don’t rewrite) |
| **Must not modify** | Quote Library UI; public submit; Monday sync side effects must remain opt-in/off for promotions |
| **Acceptance** | Flag off → 403; flag on + role → one lab quote becomes internal draft; lab audit stores `quote_header_id`; IE can open draft without lab code in IE |
| **Tests** | Promotion dry-run + blocked-without-flag tests |
| **Rollback** | Flag off; archive promoted quote via existing tools if needed |
| **Risks** | Highest business risk — require human checklist + FEATURE_DECISIONS entry |
| **Stop before next** | Treat as release gate; no further automation without new architecture review |

---

## Cross-phase engineering standards

1. **Tests:** Node `node:test` + `*.test.mjs` co-located (repo convention).
2. **Auth:** All mutating lab routes use `requireAuth()`; org from server context.
3. **Additive only:** Prefer new files; minimize `server.js` / `package.json` touch points; never reformat unrelated files.
4. **No commits/pushes** unless human asks.
5. **Validation after each phase:** `git diff --check`, `git status --short`, confirm only intended paths.
6. **Do not proceed into Phase 1** until Phase 0 is explicitly accepted.
