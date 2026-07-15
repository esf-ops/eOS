# Phase DE.0 — Elite 100 Digital Estimate — Current-State Audit

**Date:** 2026-07-15
**Status:** Documentation and repository analysis only — **no implementation**
**Branch context at audit:** working tree may also contain unrelated Quote Intake 6P.4 work; this phase must touch only `docs/digital-estimate/**`.
**Blueprint PDF:** `eliteOS_Cursor_Quoting_Blueprint.pdf` was **not found** in the repository.

**Related read-first docs:**
`docs/quote-intake-lab/DO_NOT_TOUCH.md`, `PHASE_6P_0_*`, `PHASE_6P_2/3/4_NOTES.md`,
`docs/quote-platform/*`, `docs/eliteos/eliteOS-master-head-map.md`, `FEATURE_DECISIONS.md`, `SYSTEM_BLUEPRINT.md`.

---

## 1. Executive summary

eliteOS already has a mature **Internal Estimate → Quote Library → PDF/email delivery** path for staff quotes, with **revision rows** and a **server-authored `calculation_snapshot`**. It does **not** yet have a customer-facing **tokenized digital estimate** product.

| Capability | Status |
|------------|--------|
| Save Elite 100 internal quotes | Live (`app-internal-estimate` + `/api/internal-quotes/*`) |
| Immutable historical revisions | Partially — prior revision **rows** frozen; **current** revision can be overwritten |
| Calculation snapshot at save | Yes — `quote_headers.calculation_snapshot` |
| Separate pricing-admin snapshot wired to math | **No** — Pricing Admin foundation tables **not** in `calculateQuote()` |
| Customer PDF / Resend email | Live foundation — `backend-core/src/quoteDelivery/**` |
| Secure share-link tokens | **SQL scaffold only** (`quote_share_links`) — **no app code uses it** |
| Public digital-estimate head | **Missing** |
| Customer configuration / acceptance | **Missing** |
| Quote Intake → auto Takeoff → IE | Intake pipeline in progress; **no** IE/QL/customer email automation yet |

---

## 2. Head / domain / launcher inventory (evidence)

| Product | App path | Domain / env | Head slug | Brain APIs |
|---------|----------|--------------|-----------|------------|
| Internal Estimate | `app-internal-estimate/` | `internal.eliteosfab.com` (primary); **`estimate.eliteosfab.com` is an IE alias** — do not reuse for Digital Estimate | `quote` | `/api/internal-quotes/*`, `/api/quote-delivery/*` |
| Quote Library | `app-quote-library/` | `https://quotes.eliteosfab.com` (`HEAD_URL_QUOTE_LIBRARY`) | `quote_library` | `/api/quote-library/*` |
| Public Consumer Quote | `app-quote/` | `quote.eliteosfab.com` (`HEAD_URL_PUBLIC_QUOTE`) | (public consumer; not staff slug for IE) | `/api/public-quote/*` |
| Partner Quote | `app-partner-quote/` | `HEAD_URL_PARTNER_QUOTE` | `partner_quote` | `/api/partner-quote/*` |
| Custom Quote | `app-custom-quote/` | `HEAD_URL_CUSTOM_QUOTE` | `custom_quote` | `/api/custom-quotes/*` |
| Pricing Admin | `app-pricing-admin/` | `HEAD_URL_PRICING_ADMIN` | `pricing_admin` | `/api/pricing-admin/*` (+ legacy `/api/admin/quote-pricing-*`) |
| AI Takeoff | `app-ai-takeoff/` | `takeoff.eliteosfab.com` | `ai_takeoff` | `/api/takeoff-jobs/*`, `/api/quote-intake/*` (pilot) |
| Home Launcher | `app-home/` | `www.eliteosfab.com` | — | `GET /api/me`, `GET /api/me/heads` |

**Launcher wiring:** `backend-core/src/me/headDeploymentUrls.js`, `backend-core/src/me/launcherHeads.js`, `backend-core/src/auth/eosGovernanceConstants.js` (`EOS_HEAD_SLUGS`).

**Important:** Internal Estimate uses head slug **`quote`**, not `internal_estimate`. Quote Delivery auth accepts heads `quote` **or** `quote_library` (`quoteDeliveryApi.js`).

**Quote Library is not a separate database.** It reads/writes the same `quote_headers` (+ related) rows via service-role Brain APIs (`docs/quote-platform/quote-library-head-plan.md`).

---

## 3. Audit checklist (exact paths)

### 3.1 Internal Estimate

| Item | Evidence |
|------|----------|
| App | `app-internal-estimate/` — `InternalEstimateApp.tsx` |
| Calculate | `POST /api/internal-quotes/calculate` → `calculateQuote()` |
| Save modes | `POST /api/internal-quotes/save` — `create`, `update_existing`, `save_revision`, `save_as_new_quote` (`internalQuoteSave.js`) |
| Read / patch | `GET/PATCH /api/internal-quotes/:id` — PATCH is **metadata-only** (`internalQuotePatchPolicy.js`) |
| Revisions | `GET …/revisions`, `POST …/restore-as-revision` |
| Material colors | `GET /api/internal-quotes/material-colors` |
| Takeoff import | `POST /api/internal-quotes/import-from-takeoff` (IE-owned; intake must not call) |
| Module map | `internalQuotesApi.js`, `internalQuoteSave.js`, `internalQuoteRestore.js` |

### 3.2 Public Quote

| Item | Evidence |
|------|----------|
| App | `app-quote/` |
| Routes | `POST /api/public-quote/calculate`, `POST /api/public-quote/submit-measurements` (`quoteRoutes.js`) |
| Persist | Creates `quote_headers` with `quote_source: public_consumer` |
| Trust boundary | Returns `estimates_by_group` with retail planning totals; applies min **25%** protection (`pricing-authority-map.md`) |
| Leak risk | Submit response includes **`quoteId`** (internal UUID) — see §6 |

### 3.3 Partner Quote

| Item | Evidence |
|------|----------|
| App | `app-partner-quote/` |
| Routes | `/api/partner-quote/*` (mounted from `quoteRoutes.js` log line) |
| Leak tests | `docs/quote-platform/partner-quote-leakage-verification.md`, `verifyPartnerQuoteLeakage.mjs` |

### 3.4 Custom Quote

| Item | Evidence |
|------|----------|
| App | `app-custom-quote/` |
| Persist | `customQuoteSave.js` — `quote_source: custom_quote` |
| Spec | `docs/quote-platform/custom-quote-tool-plan.md` |

### 3.5 Quote Library

| Item | Evidence |
|------|----------|
| App | `app-quote-library/src/QuoteLibraryApp.tsx` |
| APIs | `quoteLibraryApi.js` — list, detail, timeline, revisions, status, assign, archive, duplicate, mark-sold, handoff docs |
| SQL | `eliteos_quote_library_foundation.sql` → `quote_handoff_documents`, optional `account_name` |
| Sold | `POST /api/quote-library/quotes/:id/mark-sold` → status `sold`/`won`; **JSON entry docs only** (no Moraware/QB writeback) |

### 3.6 Quote save / persistence

| Table / module | Role |
|----------------|------|
| `quote_headers` | System of record (`eos_quote_platform.sql`) |
| `quote_line_items`, `quote_rooms` | Child rows (`quotePersist.js` / `replaceQuoteLinesAndRooms`) |
| `calculation_snapshot` jsonb | Server-authored blob at save (`internalQuoteSave.js` header comment) |
| Revision family columns | `eliteos_internal_quote_phase2.sql`: `quote_family_root_id`, `revision_number`, `revision_label`, `quote_number_base`, `is_current_revision` |
| Org column | `organization_id` (org-scoped queries via `organizationContext.js`) |

### 3.7 Quote-number generation

| Item | Evidence |
|------|----------|
| ESF family numbers | `quoteEsfNumber.js` — `formatEsfQuoteNumberBase`, `quoteNumberForRevision` |
| Generic fallback | `generateQuoteNumber()` in `quotePersist.js` |
| Library search | Uses `quote_number`, `quote_number_base` (`quoteLibrarySearch.js`) |

### 3.8 Revision / version behavior

**Current model:** one `quote_headers` **row per revision**.

| Mode | Behavior |
|------|----------|
| `create` | New row, R1, `is_current_revision=true` |
| `update_existing` | **Overwrites** current revision fields + **fresh** `calculateQuote` snapshot |
| `save_revision` | Marks prior current `is_current_revision=false`; **inserts new row**; prior snapshots **not rewritten** |
| Historical row | Cannot `update_existing` (`internalQuoteSave.js`) |

**Implication for Digital Estimate:** historical revision immutability exists at the **row** level, but the **current** revision is mutable. Publications must bind to a **specific revision row id** (and preferably freeze a publication snapshot copy).

### 3.9 `calculateQuote()` / pricing authority

| Layer | Path | Live in math? |
|-------|------|----------------|
| Calculator | `backend-core/src/quotes/quoteCalculator.js` | **Yes — authority** |
| Structure/rules | `quote_pricing_structures` + `quote_pricing_rules` via `resolvePricingStructure()` | Yes when DB available |
| Hardcoded ESF Direct / prototype tiers | constants in calculator | Yes (internal Direct, public) |
| Pricing Admin tables | `quote_price_groups`, `quote_price_group_rates`, `quote_material_color_mappings` (`eliteos_pricing_admin_foundation.sql`) | **No** — `pricingConfigResolver.js` is **not** called from `calculateQuote()` |
| Contract doc | `docs/quote-platform/pricing-authority-map.md` | Confirms gap |
| Contract tests | `pricingAuthority.contract.test.mjs` | Locks current behavior |

Elite 100 naming appears in calculator (`elite_100` program path ~L362); Internal Estimate material groups Promo→F are first-class. **Pricing Admin group rates are not live calc authority.**

### 3.10 Pricing Admin

| Item | Evidence |
|------|----------|
| Head | `app-pricing-admin/` |
| APIs | `pricingAdminHeadApi.js`, legacy `quotePricingAdminApi.js` |
| Foundation SQL | `eliteos_pricing_admin_foundation.sql` |
| Audit | `quote_pricing_audit_log` |

### 3.11 Elite 100 colors / groups / mappings

| Source | Wired to calc? |
|--------|----------------|
| Prototype `material_color` seed rules (`eos_quote_platform_seed_prototype.sql`) | Metadata / catalog — calc prices by **`material_group`** |
| Pricing Admin `quote_material_color_mappings` | Optional admin data — **not** calc authority today |
| IE `GET /api/internal-quotes/material-colors` | Staff catalog for picking colors → group |

### 3.12 Customer rounding / display

| Rule | Evidence |
|------|----------|
| Persisted customer total | `calculation_snapshot.internal_ui.customer_display_total` |
| Print snapshot | `customer_estimate_print_snapshot.finalRounded` must **equal** CDT on save (`internalQuotesApi.js`) |
| Display money | `estimateDisplayFromSnapshot.js` — `Math.round` integer USD formatting |
| Library prefers CDT | `QuoteLibraryApp.tsx`, Sales KPI scripts |

### 3.13 PDF generation

| Module | Role |
|--------|------|
| `estimateSnapshotLoader.js` | Load header + snapshot for delivery |
| `buildCustomerEstimateDisplayFromSnapshot` | Customer-safe view model from **saved** snapshot |
| `customerEstimatePdfBuilder.js` + Chromium | PDF bytes |
| `customerEstimatePrintHtml.js` | Print HTML |
| Output gate | `quoteOutputGate` — blocks missing `quote_number` / snapshot |

**Evidence:** PDF is based on **persisted snapshot**, not a live Pricing Admin recalculation (`estimateDisplayFromSnapshot.js` header comment).

### 3.14 Delivery / Resend

| Item | Evidence |
|------|----------|
| Routes | `POST /api/quote-delivery/quotes/:quoteId/preview`, `…/send` |
| Service | `quoteDeliveryService.js` — Resend via `emailClient.js` when env-gated |
| Logs | `quote_delivery_logs` |
| Domains | `quoteDeliveryEnv.js` recipient allowlists |

### 3.15 Public links / tokens

| Item | Evidence |
|------|----------|
| Table scaffold | `quote_share_links` (`token_hash`, `expires_at`, `revoked_at`, `last_accessed_at`, `access_count`) |
| App usage | **None** in `backend-core/src/**` (grep: only SQL + docs) |
| Not on `quote_headers` | Tokens intentionally separate |

### 3.16 Customer approvals / signatures

**Not found** as a first-class product table or API for digital acceptance. Closest: Quote Library status workflow (`sent`, `sold`, etc.) and intake statuses — staff-driven, not customer-signed.

### 3.17 Status / history / audit

| Mechanism | Path |
|-----------|------|
| `quote_status` on header | Workflow |
| `quote_status_history` | `eos_quote_platform.sql` |
| `quote_calculation_audit` | Platform SQL |
| Delivery logs | `quote_delivery_logs` |
| Library timeline | `GET /api/quote-library/quotes/:id/timeline` |
| Pricing admin audit | `quote_pricing_audit_log` |
| Quote Intake audit | `quote_intake_audit_events` (separate product) |

### 3.18 Supabase tables & Storage (quote-related)

**Core (`eos_quote_platform.sql` + follow-ons):**
`quote_headers`, `quote_line_items`, `quote_rooms`, `quote_files`, `quote_status_history`, `quote_calculation_audit`, `quote_forecast_events`, `quote_monday_sync_log`, pricing structure/rules, partners, catalog, takeoff/visual foundations.

**Additive:**
`quote_handoff_documents`, `quote_delivery_logs`, `quote_share_links`, Pricing Admin foundation tables, `quote_intake_*` (intake — do not merge into digital estimate), takeoff tables.

**Storage:** `eliteos-quote-files` (see `docs/eliteos/quote-files-storage.md`) — plans/files; **not** customer digital-estimate hosting.

### 3.19 Auth / public-route patterns

| Pattern | Examples |
|---------|----------|
| Staff Bearer JWT + `requireAuth` + `requireHeadAccess` | IE, Library, Pricing Admin, Takeoff |
| Public unauthenticated POST | `/api/public-quote/*`, Visualizer public routes |
| Org resolution | `resolveOrganizationContext` (`mode: "public"` vs staff) |
| Dealer-safe heads | `DEALER_SAFE_HEAD_SLUGS` — not IE |

### 3.20 Rate limiting

| Pattern | Location |
|---------|----------|
| In-memory IP limiter (public visualizer) | `publicVisualizerRateLimit.mjs` |
| Graph / Exayard 429 handling | Takeoff / Graph modules |
| **No** generic quote public-token rate limiter yet | Gap for digital estimate |

### 3.21 Org scoping / RLS

| Pattern | Evidence |
|---------|----------|
| Service-role Brain APIs + org filter helpers | Dominant pattern for quotes |
| RLS helpers exist on some tables | Platform migrations vary by table |
| Delivery SQL comment | “Backend service role is the write path; no browser-direct RLS in this pass” for delivery foundation |
| Intake | Strong RLS package in `eliteos_quote_intake_v1.sql` (unrelated product) |

### 3.22 Events / notifications

| Existing | Gap |
|----------|-----|
| Monday sync (server) | Not customer digital-estimate events |
| Forecast events | Analytics |
| Delivery log rows | Email/PDF audit |
| **No** Published / First Viewed / Revoked product events | Needed for DE |

### 3.23 Sold / Moraware / QuickBooks

| Behavior | Evidence |
|----------|----------|
| Mark sold | Quote Library API |
| Handoff docs | `quote_handoff_documents` JSON generators — **no writeback** |
| Integrations | `backend-core/src/moraware/**`, `quickbooks/**` — separate; do not couple DE.1 |

### 3.24 Quote Intake (adjacent — do not modify)

Completed per 6P notes: `quote_intake_*` persistence, Estimator Queue UI, Graph manual preview/import. **No** auto Takeoff, IE import, QL writes, or customer email. See `docs/quote-intake-lab/PHASE_6P_4_NOTES.md`.

---

## 4. Key questions (answered with evidence)

| # | Question | Answer | Evidence |
|---|----------|--------|----------|
| 1 | Can a saved quote be reproduced exactly later? | **Mostly for historical revisions** via frozen `calculation_snapshot`. **Current** revision may change on `update_existing`. Re-running `calculateQuote` from raw inputs may diverge if code/constants/rules change. | `internalQuoteSave.js`, `eos_quote_platform.sql` comment on snapshot |
| 2 | Revisions immutable or overwritten? | **Hybrid:** prior revision rows immutable; current row overwritten by save modes | `internalQuoteSave.js` |
| 3 | Calculation snapshot exists? | **Yes** — required jsonb on `quote_headers` | SQL + save path |
| 4 | Pricing snapshot exists? | **Embedded in calculation_snapshot** (structure refs + totals). No separate Admin pricing snapshot FK | authority map |
| 5 | Can Pricing Admin change old quotes when recalculated? | **Stored snapshots: no.** **Recalc of current revision: yes** once Admin is wired; today Admin edits don't affect calc, but **code constant / rule** changes do on recalc | `pricing-authority-map.md` |
| 6 | Does `calculateQuote()` support Elite 100 groups? | **Yes** for Promo→F / Elite 100 program paths via constants + `material_group` rules | `quoteCalculator.js` |
| 7 | Are Pricing Admin group tables wired? | **No** | authority map + resolver unused by calc |
| 8 | Room-level material-group pricing? | **Yes** — rooms carry groups; multi-group supported | `internalQuoteSave` MULTI_GROUP |
| 9 | Colors reliably mapped to groups? | **Partially** — staff color catalog; calc still prices by **group**. Mapping tables/seeds exist but are not sole authority | seeds + material-colors API |
| 10 | Where are customer-safe totals rounded? | Integer round on CDT / `finalRounded` / display formatters | IE save + `estimateDisplayFromSnapshot.js` |
| 11 | Public-safe serializer? | **Yes for delivery** (`sanitizeSnapshotForCustomer`, display builder). **No** dedicated digital-estimate public DTO API yet | `estimateContentSanitizer.js` |
| 12 | Secure public token model? | **Scaffold only** (`quote_share_links`) | SQL; no JS consumers |
| 13 | Public API expose internals? | Public calc mostly safe; submit returns **`quoteId`**; partner APIs carefully gated | `quoteRoutes.js` |
| 14 | PDF from persisted or live pricing? | **Persisted snapshot** | delivery modules |
| 15 | Quote Library revisions/history? | Revisions list + timeline + status history | `quoteLibraryApi.js` |
| 16 | Break if multiple immutable publications? | Today email/PDF per quote; share_links scaffold lacks publication/revision/snapshot binding — **new model required** | SQL vs delivery code |
| 17 | Smallest safe Publish seam? | Auth’d Brain publish from IE/QL reading **saved revision snapshot** → new publication tables → public token GET | This audit |
| 18 | New public head without changing others? | **Yes** — mirrors Visualizer/public-quote pattern; register CORS/`HEAD_URL_DIGITAL_ESTIMATE`; keep IE publish UI additive. Prefer host **`digital.eliteosfab.com`** — **`estimate.eliteosfab.com` is reserved/alias for IE** | head map, `SYSTEM_BLUEPRINT.md`, `server.js` CORS |
| 19 | Pure/safe reuse modules? | Sanitizer, display-from-snapshot, print/PDF builders (adapter), output gate, org context, calculator **not** re-run on public view | §5 |
| 20 | Must wrap behind adapters? | `quote_headers` access, delivery logs vs new events, share_links (extend/replace), any IE UI publish button | §5 |

---

## 5. Reusable modules vs wrap-required

### Safe to reuse (prefer call-as-is / thin adapter)

- `estimateContentSanitizer.js` — redaction primitives
- `estimateDisplayFromSnapshot.js` — customer-safe view model
- `customerEstimatePrintHtml.js` / `customerEstimatePdfBuilder.js` — print representation
- `quoteOutputGate` — readiness checks
- `organizationContext.js` — org binding
- `publicVisualizerRateLimit.mjs` — **pattern** for public IP limits
- Revision identity fields on `quote_headers`

### Must wrap / must not reuse raw

- Internal quote API JSON responses (contain internals)
- `calculateQuote()` on the **public request path** (customer browser must not become authority)
- `quote_share_links` as-is (too thin for publication snapshot + events)
- Quote Intake / Takeoff / Graph modules
- Pricing Admin write APIs
- Moraware/QB writebacks

---

## 6. Contradictions / risks

1. **Doc vs reality — snapshots “immutable”:** platform SQL comments say immutable snapshot; IE `update_existing` **replaces** the current revision’s snapshot.
2. **Pricing Admin vs calculator drift:** Admin UI suggests configurability; calc still uses hardcoded Direct tiers + older rules — digital estimate must freeze **presented** numbers, not re-resolve Admin later.
3. **`quote_share_links` incomplete:** no revision id, no snapshot blob, no event log, no first-viewed — do not ship DE.1 on bare share links without extension.
4. **Public submit returns `quoteId`:** precedent that public responses sometimes include internal ids — digital estimate must avoid repeating that.
5. **CDT vs `grand_total`:** delivery falls back to `grand_total` with warning — publish eligibility should require CDT / print snapshot consistency.
6. **Status column overload risk:** `quote_status` already carries sales workflow (`sold`, etc.). Digital estimate must **not** jam publish/view/revoke into the same column.
7. **Adjacent intake work:** 6P.4 Graph/mailbox code may be uncommitted nearby — DE.0 must not modify it.

---

## 7. Current quote flow (as-built)

```mermaid
flowchart LR
  subgraph staff [Staff heads]
    IE[Internal Estimate<br/>app-internal-estimate]
    QL[Quote Library<br/>app-quote-library]
    PA[Pricing Admin<br/>app-pricing-admin]
    TO[AI Takeoff<br/>app-ai-takeoff]
  end

  subgraph brain [backend-core Brain]
    CQ[calculateQuote]
    IQ[/api/internal-quotes]
    LIB[/api/quote-library]
    DEL[/api/quote-delivery]
    PUB[/api/public-quote]
  end

  subgraph data [Supabase]
    QH[(quote_headers<br/>+ calculation_snapshot)]
    DL[(quote_delivery_logs)]
    SL[(quote_share_links<br/>unused scaffold)]
  end

  subgraph customer [Customer today]
    EMAIL[Email PDF via Resend]
    PC[Public Consumer Quote Tool]
  end

  IE --> IQ --> CQ
  IQ --> QH
  QL --> LIB --> QH
  IE --> DEL --> DL
  DEL --> EMAIL
  PA -.->|not wired into CQ| CQ
  TO -->|optional IE import| IQ
  PC --> PUB --> QH
  SL -.->|no app readers| customer
```

---

## 8. Missing foundations for Digital Estimate

1. Publication entity bound to **revision + org + frozen customer-safe snapshot**
2. Token lifecycle (issue / hash-store / constant-time verify / revoke / replace / expire)
3. Public-safe read API that never returns internal quote JSON
4. Dedicated public head + domain
5. Activity events: Published, Link Copied/Sent, First Viewed, Last Viewed, Revoked
6. Feature flags + rate limits + generic 404 for bad/revoked tokens
7. Quote Library activity surfacing for publications (read model)
8. Explicit eligibility: Elite 100 / `internal_quote` / saved CDT / current or selected revision

---

## 9. Sources consulted

- `docs/quote-platform/three-head-quote-architecture.md`
- `docs/quote-platform/pricing-authority-map.md`
- `docs/quote-platform/quote-library-head-plan.md`
- `docs/quote-platform/INTERNAL_ESTIMATE_PRODUCT_SPEC.md`
- `docs/eliteos/eliteOS-master-head-map.md`
- `docs/quote-intake-lab/DO_NOT_TOUCH.md` + 6P.0–6P.4 notes
- Backend modules listed above (read/grep only)

**No application source, migrations, packages, env files, or external services were modified or called in DE.0.**
