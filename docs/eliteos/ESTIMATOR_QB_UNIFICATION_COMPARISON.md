# Estimator unification: standalone vs eliteOS, and the QuickBooks path

Prepared 2026-09-29 in response to `eliteos-estimator/docs/CURSOR_HANDOFF.md`. No production schema, deploy or QuickBooks state was changed. Phase 1 code changes exist locally only (see §5).

Evidence base: eOS `main` at `aeb7ab89` plus the uncommitted `quoteQbCatalog` work in the tree; the standalone at `/Users/chris.henely/Desktop/retry to build/eliteos-estimator` (read before its baseline commit `c467955`). Code/SQL/tests were read; deployed flags and applied-migration state in production were **not** checked.

## Recommendation in one paragraph

Keep eliteOS as the system of record. Quote Flow → Studio estimate → Digital Estimate publish → public acceptance is the live, governed path, and it already has server-side pricing, frozen publication snapshots, hashed reusable links, an immutable idempotent acceptance row and org-scoped auth. Do **not** run the standalone as a second head with D1: that would create a second estimate identity, a second acceptance authority and a second customer app. Instead, port the standalone's genuinely new pieces into eOS as extensions of the existing authority: the custom-slab material model, sales tax, optional/alternative lines, QuickBooks-style proposal presentation and item mapping, fast-entry editing ideas, and the acceptance → outbox pattern. Then build one QuickBooks delivery path on top of the existing (uncommitted, dry-run-only) `quote_qb_write_queue` work.

## 1. Active eOS journey

| Step | Status | Code | Storage |
|---|---|---|---|
| Intake (inbox → AI takeoff) | Active | `elite100QuoteFlow/quoteFlowService.mjs` | `quote_intake_cases`, takeoff jobs |
| Official scope | Active | `quoteFlowSetScope.mjs`, `quoteFlowEstimates.mjs` → Studio `updateScope` | `studio_estimates.scope_json` (sibling revisions) |
| Pricing | Active | `quoteFlowPricing.mjs` → `calculateStudioEstimateV4` → `elite100RoomPricingCalculator.mjs` (`elite100-room-pricing-v1`, v4) | `studio_estimates.calculation_snapshot_json` |
| Internal review | Active | `quoteFlowReview.mjs` | `approval_json` (fingerprints) |
| Publish | Active | `quoteFlowDigitalEstimate.mjs` → `studioEstimateDigitalEstimateService.mjs` → `digital_estimate_publish_atomic` | `quote_publications`, immutable `quote_publication_snapshots`, hashed tokens, bridge `quote_headers` row |
| Customer configures | Active (flags default off; synthetic-pilot guard defaults on) | `app-digital-estimate/src/ConfigurationView.tsx`; `publicConfigurationService.saveSelections` → `elite100ConfigDeltaEngineV2.mjs` | `digital_estimate_configuration_*` |
| Customer accepts | Active | `studioFinalAcceptanceService.acceptResolvedContext` | immutable `studio_estimate_acceptances` UNIQUE(org, publication); status `accepted_awaiting_sold_review` |
| Sold | Studio only, manual | `studioSoldReviewService.markSold` | `studio_estimate_sold_reviews/_snapshots` |
| Accounting | **Absent** | — | — |

Legacy/parallel: `app-internal-estimate` + `quoteDelivery` (legacy, mounted), `app-quote-library` (legacy-active on `quote_headers`, own mark-sold), `app-custom-quote` (legacy, slab+markup), `app-partner-quote` (scaffold), `app-quote` (active public calculator, protected by `quote-platform.mdc`), `app-elite100-estimate-studio` (active, parallel staff UI over the same tables).

## 2. Feature matrix

| Capability | eOS today | Standalone | Recommended owner | Evidence / missing verification |
|---|---|---|---|---|
| Elite 100 $/SF, groups, remnant | Yes (v4) | Yes | eOS v4 calculator | Same-fixture totals match to the cent (see §3) |
| Retail vs wholesale | Wholesale + direct_retail (retail = direct) | Wholesale + retail | eOS | Same rate books |
| Billable-area rounding | Ceil **per piece** | Ceil **per room section** | eOS rule, unless Elite decides otherwise | Diverges — §3 case 7b |
| Custom slab (count, cost, size, waste, editable markup) | **No** (only legacy `customQuoteCalculator.js`) | Yes | Port standalone model into eOS v4 as a new material kind | Markup placeholders 1.15/1.25 unconfirmed |
| Fabrication / install lines for slab jobs | No (fab folded into $/SF; install only as custom line) | Yes, separate mapped lines | Port | — |
| Vanity program | In calculator; **not reachable from Quote Flow** (`applyProgram` only set by Studio V2) | Yes | eOS; wire Quote Flow | Same-fixture match |
| Cutouts, sinks, products | Yes, catalog-driven | Catalog add-ons | eOS | Match |
| Edge, miter, waterfall, side splash | Yes (some not mapped from staff scope) | Partial via add-ons | eOS | — |
| Credits / discounts | Yes (credit, discount, internal-only, absorbed) | Yes (credit, lump sum) | eOS | Match |
| Customer sales tax | **No** (only 2% material use tax; `taxable` flag stored, unused) | Yes (rate, per-line taxable, exemption reason) | Port | Tax policy needs Elite approval |
| Optional additions | No staff-defined optional lines | Yes | Port as envelope options | — |
| Replacement alternatives | Interactive color/group/edge swaps, repriced server-side | Informational notes only | eOS (better) | — |
| Customer total display | Rounded to nearest $10 | Exact cents | Decide explicitly; QuickBooks invoice must equal accepted total | Invoice lines won't sum to a rounded total |
| QuickBooks-style proposal table and notes under items | No | Yes | Port presentation into snapshot/print | — |
| QuickBooks item mapping per line | Seed + `quote_qb_item_mappings` (uncommitted, Quote Library only) | Picker over imported items | eOS table, fed by standalone mapping keys | ListIDs not verified against a destination company |
| Publication, tokens, allowlist serializer | Mature | Simple token and snapshot | eOS | — |
| Acceptance | Immutable, idempotent, server-priced | Immutable, trigger marks sold + outbox | eOS row + standalone outbox pattern | eOS has no outbox |
| Post-acceptance selection lock | **Browser only** | Trigger-enforced | Fix in eOS | Confirmed: `saveSelections` never checks acceptance |
| Sold on acceptance | No (manual `markSold`) | Yes | Business decision; handoff says acceptance = sold | — |
| Staff identity, head access, org scope | Yes | Shared password | eOS | — |
| QuickBooks write | Dry-run EstimateAdd, TEST-only, transport stub | Local queue only | eOS queue, extended | §6 |

## 3. Pricing trace on shared synthetic fixtures

Scratch harness (ignored, outside both repos' tracked files): `eliteos-estimator/.local/parity/compare.test.ts`. It calls the standalone `priceQuote` and eOS `calculateElite100Estimate` with default tables and no DB.

| Case | Standalone | eOS exact | eOS customer display |
|---|---|---|---|
| Group A kitchen 120×25.5 + 4" splash | 2,042.04 | 2,042.04 | 2,050 |
| L-shape + island sharing Group B | 4,681.80 | 4,681.80 | 4,690 |
| Same, wholesale | 3,580.20 | 3,580.20 | 3,590 |
| Sink + cooktop + 3 outlets, Group C | 2,765.60 | 2,765.60 | 2,770 |
| Vanity 61_S oval white + 40 SF kitchen | 3,312.40 | 3,312.40 | 3,320 |
| Case 1 + fixed $30 credit | 2,012.04 | 2,012.04 | 2,020 |
| 3 identical 96×25.5 tops | 4,005.54 | 4,005.54 | 4,010 |
| **Two 10.2 SF pieces in one room** | **1,649.34** (21 SF) | **1,727.88** (22 SF) | 1,730 |
| Remnant 60×25.5 | 561.00 | 561.00 | 570 |
| Custom quartzite, 2 slabs @ $2,400, 35% markup, fab, $900 install | 9,073.60 | not expressible | — |
| Case 1 + 7% sales tax | 2,184.98 | not expressible | — |
| Case 1 + optional $500 extra | base 2,042.04 | not expressible | — |

Findings:

- Rates, use tax, cutouts, vanity, credits and repeats agree.
- Area rounding differs whenever pieces in a room have fractional square footage that sums across a whole foot.
- The standalone's "eOS parity" fixtures come from legacy `quotes/quoteCalculator.js` with prototype tiers, **not** the v4 calculator that Quote Flow uses. Its 88,702-estimate replay replayed historical lines as fixed charges, so neither check could catch this.
- The use-tax method differs (standalone folds it into the rate, eOS adds 2% per section). Both methods round to the same cent on whole-dollar rates but could diverge on fractional Pricing Admin overrides.

## 4. Reuse decision

**Reuse from eOS (keep as authority):**

- Quote Flow staff workflow.
- `studio_estimates` revisions and fingerprints.
- The v4 calculator.
- Digital Estimate publish, snapshot, serializer allowlist and tokens.
- `app-digital-estimate` interactive configuration (color, sink, faucet, backsplash, edge, side splash, Original/Updated/Changes).
- Final acceptance service.
- Account Directory QuickBooks linkage.
- The Windows connector patterns (scoped bearer token to Brain, read-only guards).
- The `quote_qb_write_queue` schema.

**Port from the standalone (into eOS modules, rewritten to eOS conventions):**

- **Slab material model:** `SlabMaterial` and `pushSlabLines` become a new material kind inside the v4 calculator, with markup labelled as markup (not margin).
- **Sales tax:** `tax.ts`, per-line taxable flags, exemption reason, and the tax confirmation gate.
- **Optional lines:** staff-defined optional lines published as envelope options.
- **Proposal presentation:** `proposalLines` (quantity 1 × area amount, notes anchored under charges, grouping by area) into the customer snapshot and print.
- **Publication readiness checks:** `publicationProblems` (active QuickBooks item on every priced line, whole slab count, confirmed markup/fab/install).
- **Mapping keys and item picker:** mapping keys feed `quote_qb_item_mappings`; the item picker goes into the Quote Flow pricing panel.
- **Acceptance outbox pattern:** acceptance plus outbox row in one transaction.
- **Tests:** `proposal.test.ts` / `publication.test.ts` scenarios become eOS regression tests.
- **Measurement parsing:** `parseDims` / `parseInches` for fast entry.

**Do not reuse:** D1 storage, the Hono Worker, preview-password auth, the standalone `CustomerEstimate.tsx`, and the standalone price book as a pricing authority.

**Data migration consequence:** no standalone data needs migrating (demo/synthetic only). Existing eOS saved, published and accepted estimates stay on pricing v4. The slab kind ships as an additive calculator feature under a new `pricingVersion` (5), so frozen v4 snapshots are never recalculated.

**Authentication consequence:** everything stays behind `requireAuth` + `requireHeadAccess("elite100_quote_flow")` + org scope. No new head, no shared password.

## 5. Phased plan

Each phase is additive, flag-gated and independently reversible. Deploy order: database → Brain → head.

**Phase 0 — preserve and decide (no production change)**

- Done: the standalone has a local baseline commit `c467955` (no remote; `.local/` and `.dev.vars` excluded).
- Commit or park the uncommitted `quoteQbCatalog` work under its own review.
- Decided by Chris (2026-09-29):
  - **Rounding:** billable square feet are ceiled per piece (current eOS behavior). The standalone's per-section rounding is not ported; the "two 57.6 × 25.5 pieces" fixture difference is expected.
  - **Totals:** exact cents everywhere a total is shown, so the digital estimate, acceptance and QuickBooks document agree. Replacing today's nearest-$10 customer display total is Phase 3 work; the public quote-platform rounding rule for homeowner quick quotes is unchanged.
  - **Sold:** staff confirm Mark Sold after acceptance; acceptance does not mark sold automatically.
  - **QuickBooks transaction:** sales order first (not invoice) for the first verified test-company write.
- Still open: sales-tax policy and slab markup defaults.

**Phase 1 — close existing eOS gaps (implemented locally, not committed or deployed)**

- Server-side acceptance lock: `publicConfigurationService.saveSelections` checks `studio_estimate_acceptances` for the publication and rejects with `configuration_locked` (HTTP 423, not recoverable). If the acceptance lookup fails, the save fails closed with 503. Tests: `quoteFlowPublicAcceptance.test.mjs` cases 4 and 5.
- Quote Flow vanity program: the pricing PATCH/calculate body accepts `vanityPrograms: [{ roomId, apply }]` and writes the same `roomConfigurations[roomId].vanityProgram` election Studio uses. Brain validates eligibility against the stamped scope the calculator sees. Pricing responses return the governed vanity rows. The Pricing tab has Add/Remove Vanity Program per room. Tests: `quoteFlowVanityProgram.test.mjs`.
- Rollback: revert the Brain and head deploys; no schema change.

**Phase 2 — pricing v5 (additive)**

- Add a `slab` material kind, separate fabrication and installation lines, sales tax and optional lines to `elite100RoomPricingCalculator.mjs`, behind a new `pricingVersion: 5`.
- v4 snapshots are untouched.
- Port the standalone fixtures as the v5 test matrix.
- Assert v5 equals v4 for every Elite-100-only case.

**Phase 3 — publication and customer experience**

- **Snapshot and envelope:** extend the customer snapshot and serializer allowlist (proposal rows, notes, tax, optional keys). Map optional lines to envelope options.
- **Slab rooms:** keep them frozen (no material swap). This replaces today's silent coercion to Group Promo with an explicit `custom_material` room program that disables configuration for that room only.
- **Presentation:** ProposalBreakdown-style presentation becomes a view mode in `app-digital-estimate`.
- **Regression guards:**
  - `phaseDe1`, `phaseDe2e` and `phaseDePublicV2Route.productionPath` stay green;
  - serializer leak tests cover slab cost and markup.

**Phase 4 — acceptance to accounting event**

- In the same database transaction as `studio_estimate_acceptances`, insert a `quote_qb_write_queue` row. It references the studio estimate and publication, not `quote_headers`.
- Idempotency key: `org:publication:acceptance:company:txnType`.
- Payload frozen from the accepted snapshot.
- Sold status stays separate from accounting status (pending / processing / synced / retryable / needs review).
- The migration is additive: add a nullable `studio_estimate_id` / `publication_id` and relax the `quote_headers` FK.

**Phase 5 — QuickBooks delivery (test company only; needs your explicit approval before the first write)**

- VM worker claims jobs from Brain endpoints using a scoped bearer token, following the existing sync workers — **not** the service-role key on the VM.
- Claims carry a lease and expiry.
- **Before any Add:** query by the eliteOS reference marker to reconcile a lost acknowledgment.
- **Send and read back:** send SalesOrderAdd (decided transaction type), read back by TxnID, compare lines and totals, then store TxnID, RefNumber and EditSequence.
- Pin company-file identity more strongly than a CompanyName substring.
- Resolve customer:job from Account Directory links.
- Map class, terms, rep and tax per line.

**Milestone (handoff's vertical slice):** staff quote → existing digital estimate → acceptance → staff Mark Sold → one queue row → verified test-company sales order with matching lines and totals. Production-ready only after that, plus timed estimator trials.

## 6. QuickBooks capability inventory

- **Live writes:** none anywhere. No InvoiceAdd, SalesOrderAdd, CustomerAdd, JobAdd or Web Connector code.
- **Read paths** (all query-only):
  - C# SDK extractor → `importQuickBooksStaging.mjs` → `brain_quickbooks_*`;
  - CData ODBC (read-only DSN) sales/finance/customer workers → Brain internal endpoints with scoped bearer tokens.
- **Uncommitted EstimateAdd groundwork** (`backend-core/src/quotes/quoteQbCatalog/*`):
  - the builder is hardcoded to `QBTEST-0001` (4 lines, test customer);
  - `transmitEstimateAdd` always throws;
  - fail-closed config and safety gates;
  - the SQL is marked "prepared, not applied" in FEATURE_DECISIONS §377, while §378 refers to live mappings — **reconcile before relying on it**;
  - its 31 in-memory tests pass.
- **Missing pieces:**
  - an InvoiceAdd builder;
  - the link from a real accepted quote to lines;
  - a per-quote idempotency key;
  - lost-ack reconciliation;
  - claim leases;
  - Brain claim/complete endpoints;
  - a persistent VM agent;
  - class/terms/rep/tax/template/custom-field mapping;
  - read-back verification;
  - a stronger company-file identity;
  - a verified TEST company that is a copy of production (expected item ListIDs are production IDs).
- **Security fixes needed before use:**
  - the VM script expects `SUPABASE_SERVICE_ROLE_KEY` on the VM, which contradicts the Brain-only rule;
  - `qb-estimate-write-test.env.example` contains a real org UUID;
  - `qbXmlContainsWriteRequest` misses SalesOrderMod, ReceivePaymentAdd, TxnDel, ListDel and DataExt writes.
- **VM prerequisites** (documented):
  - Windows with QuickBooks Enterprise;
  - QuickBooks Desktop SDK;
  - .NET 4.8;
  - SDKTestPlus3 status 0;
  - `C:\eliteOS\...` install path.

  The observed build is Enterprise Contractor 24.0 (from screenshots, unverified). No test company, connector install or script run is recorded.

## 7. Status after Phase 2 (2026-09-29, FEATURE_DECISIONS #382)

**Capability matrix: where each concern lives now.** "Verified" means covered by automated in-memory tests. Nothing below has been browser-tested or run against a QuickBooks company.

| Capability | Owner (source of truth) | State |
|---|---|---|
| Elite 100 pricing, per-piece rounding | v4 calculator (`calculateElite100Estimate`) | Unchanged; verified |
| Custom slab package (L×W, cost/slab, 20% waste, full slab, ×2.25, shared, confirm) | v4 calculator `elite100SlabPackagePricing.mjs`; Quote Flow pricing payload | Built; review blocker until confirmed; verified |
| Vanity program | Studio room configuration | Reachable from Quote Flow (#381); verified |
| Customer-facing total | Studio publication → digital estimate snapshot | Exact cents; verified |
| Room / package breakdown | `roomPricing` publish snapshot (calculator-weighted) | Room amounts equal calculator room totals; verified |
| Accepted revision + selection | `studio_estimate_acceptances` (+ frozen `acceptedRoomPricing`) | Both accept paths freeze a reconciled breakdown; verified |
| Sold | `studioSoldReviewService.markSold` → `studio_estimate_sold_snapshots` | Unchanged; staff confirm only |
| Sales order plan / qbXML / reconcile | `elite100EstimateStudio/qbSalesOrder/` | Built; verified against a fake QuickBooks |
| Sales order queue persistence | `studio_qb_sales_order_jobs` | SQL written, **not applied**; in-memory repository only |
| QuickBooks item/class/terms/tax mapping | `organization_integration_configs` (`quickbooks_sales_order`) | Shape defined; no rows; convergence with `quote_qb_item_mappings` open |
| QuickBooks customer:job | QuickBooks (must exist); link via Account Directory | Resolver not built |
| Sales tax | **Undecided** | Blocks planning unless every line has an explicit tax code; QuickBooks-added tax flagged |
| Write transport | Windows QuickBooks connector | **Not built**; live gateway read-only by design |
| Optional additions vs alternatives in proposal | Digital estimate envelope | Alternatives = existing swaps; staff-defined optional lines not built |

**TEST-company setup needed before the first SalesOrderAdd (Chris / operator):**

1. **VM access:** confirm RemotePC access to the QuickBooks VM (reported: `QB_Server` on `DESKTOP-HOST`, Enterprise Contractor 24.0; unverified). Record the QuickBooks build and the highest supported qbXML version (SDKTestPlus3 → HostQuery).
2. **A separate TEST company file** (not production), opened single-user. Report its exact `CompanyName` from `CompanyQuery`, which becomes `QB_SALES_ORDER_COMPANY_ALLOWLIST` and the mapping `companyIdentity`.
3. **A write-capable connector endpoint** on the VM that accepts only SalesOrderAdd and SalesOrderQuery/CompanyQuery for this pipeline. It is reached from Brain with a scoped token, and no Supabase service-role key goes on the VM. Building it and enabling the first write both need explicit approval.
4. **Items in the TEST company** for: installed countertop package, sink cutout, sink products, other fabrication, credit/adjustment, project services (tear-out etc.). Also one **class**, one **terms** entry, and **sales-tax codes** (`Tax`/`Non` or whatever the file uses). Their full names go into the central mapping row.
5. **One or more synthetic customer:jobs** created by hand in the TEST company (this pipeline does not create customers or jobs).
6. **Sales-tax policy decision** (which lines are taxable, rate/item, exemptions). Until then, tests use explicit `Non`/`Tax` codes and any QuickBooks-computed tax blocks "Synced".
7. **Brain env for the test run only:** `QB_SALES_ORDER_WRITE_ENABLED=1`, `QB_SALES_ORDER_WRITE_ENVIRONMENT=test`, `QB_SALES_ORDER_COMPANY_ALLOWLIST=<exact TEST CompanyName>`.
8. **Apply** `eliteos_studio_qb_sales_order_jobs_v1.sql` to a non-production database (none is configured locally today; all local envs point at production Supabase).

## 8. Status after Phase 3 (2026-09-29, FEATURE_DECISIONS #383)

Changes to the Phase 2 matrix. "Verified locally" means run end-to-end in a browser against the local non-production Supabase with synthetic data and the in-memory QuickBooks simulator. No real QuickBooks company has been written to.

| Capability | Owner (source of truth) | State |
|---|---|---|
| Sales order queue persistence | `studio_qb_sales_order_jobs` via `supabaseSalesOrderJobRepository.mjs` | Applied to local non-production DB only; Postgres integration test 10/10 (concurrency, two agents, lost ack + restart, sweep, cross-org) |
| Mark Sold → enqueue | Quote Flow Handoff tab + Studio route | Verified locally; enqueue failure is recovered by the agent-poll sweep |
| QuickBooks item mapping | `quote_qb_item_mappings` (ListID by concept key) | One authority shared with Quote Library work |
| Company / terms / class / tax codes | `organization_integration_configs` (`quickbooks_sales_order`) | Synthetic row locally; none in production |
| QuickBooks customer:job | Staff selection, else the single active Account Directory `quickbooks_desktop` link checked against `ad_qb_customer_facts` | Verified locally, including the job picker when the customer has jobs |
| Write transport | `quickbooks-sdk-connector/sales-order-agent/` (pull agent) | Built; offline harness 7/7; writes off by default; **never run against QuickBooks** |
| Status in UI | Quote Flow Handoff tab | Synced only after read-back; shows sales order number and TxnID |

**Still required for the completion check:** a TEST company file on the VM with the mapped items/class/terms/tax codes and a synthetic customer:job, Chris's approval of the first write (exact company, synthetic transaction, expected result), and a sales-tax decision. Step 8 above is done for local non-production; production apply was not requested.

## 9. Local test setup, Mark Sold verification, rate authority (2026-09-29, FEATURE_DECISIONS #383–#384)

### 9.1 Current local test setup

Nothing here touches production. Every script refuses a non-loopback Supabase or Brain URL.

| Piece | How it runs |
|---|---|
| Database | Supabase CLI stack in `~/eliteos-nonprod` (API `127.0.0.1:54321`, container `supabase_db_eliteos-nonprod`), loaded with a schema-only dump of production plus local-only migrations, including `eliteos_studio_qb_sales_order_jobs_v1.sql` |
| Synthetic data | `backend-core/src/scripts/nonprod/seedNonprodSynthetic.mjs`: org `5e1f0000-…0001`, staff user `staff@nonprod.eliteos.local`, synthetic accounts, item mappings, and the `quickbooks_sales_order` config for company `Elite Stone TEST (simulated)`. Idempotent. |
| Brain | `node src/server.js` on `:3001`. `~/eliteos-nonprod/brain.flags.env` holds **feature flags only** (Quote Flow, Studio, digital estimate, `QB_SALES_ORDER_WRITE_ENVIRONMENT=test`, company allowlist). Supabase keys are injected at launch from `supabase status`, and the agent token from `~/eliteos-nonprod/.agent-token`; none is written to a file in the repo. |
| Heads | Quote Flow `127.0.0.1:5191`, Digital Estimate `127.0.0.1:5190`. Use `127.0.0.1`, not `localhost`: the customer session cookie is host-bound, so mixing the two returns "Estimate unavailable". |
| Staff driver | `scripts/nonprod/quoteFlowStaffDriver.mjs <estimateId> clone \| price \| publish \| status \| studio-mark-sold`. It signs in as the synthetic staff user and calls the same Brain routes as the heads. |
| Customer step | Browser at `http://127.0.0.1:5190/e/<token>`. A customer project note or scope request correctly blocks "accept as published" (`acceptance_blocked_scope_review`). |
| QuickBooks | `scripts/qbSalesOrderSimulatorAgent.mjs`: the same pull protocol as the Windows agent, with an in-memory QuickBooks. Transaction IDs start from the current Unix time (`QB_SO_SIM_START_SEQ` overrides), because the Brain enforces unique TxnIDs per company and simulator state does not survive a restart. |

### 9.2 Mark Sold in the Handoff tab, and whether it reaches durable accounting jobs

The Handoff tab (`OfficialSoldAccountingPanel.tsx`) shows the sold-review checklist, an explicit confirm step, sales-order status, the sales order number and TxnID, blockers, a customer:job picker and retry. It polls every 5 s. **The button alone proves nothing**, so both server paths were run against the local Postgres database, and the rows were checked directly:

| Check | Quote Flow route | Studio route |
|---|---|---|
| Job rows after customer acceptance, before Mark Sold | 0 | 0 |
| Mark Sold creates a `studio_qb_sales_order_jobs` row in the same request | Yes | Yes (`5e9caf58…`, idempotency key = org + publication + acceptance + company) |
| First state when the estimate has no Account Directory account | Blocked: customer:job | Blocked: customer:job (no guessing by name) |
| After staff picks customer:job → simulator agent | Synced, sales order 1000, $5,755.57 | Synced, sales order 1790723903, $5,755.57, read-back reconciliation OK |
| Repeat Mark Sold | Same sale, one job | `reused: true`, same job, one job and one sold snapshot |
| Handoff tab / Quote Flow API shows it | Synced | Synced (same job, same total) |

The Studio run also exercised a real failure path. The first agent run's add collided with an existing simulator TxnID. The unique constraint `uq_studio_qb_so_org_company_txn` rejected the write, and the job stayed `in_progress` with no TxnID. After the 5-minute lease expired, the next claim ran a QuickBooks **lookup before adding again**. The event trail is `blocked > customer_job_selected > claimed > company_verified > claimed > company_verified > lookup_clear > added > synced`. The cause was the simulator's number reuse, which is fixed above.

### 9.3 Customer-repricing rate authority (fix is local only, NOT deployed)

**The bug.** `configurationTrustedContext.mjs` called the async Supabase `getBaseRates()` without `await`, so customer repricing always used the built-in `FIXTURE_ELITE100_*` rates. **Fixed locally (#384):**

- only an `active` + approved + in-effect policy version counts;
- an approved schedule replaces the built-in rates for that schedule code completely;
- ambiguous or empty approved schedules are errors;
- a failed lookup returns `pricing_rates_unavailable` (503), and the customer change is rejected rather than priced at defaults.

Regression tests:

- `configurationRateAuthority.test.mjs`, 6/6, fails on the pre-fix code. It uses an async provider through publish, token exchange and save.
- `pricingPolicyRepository.supabase.integration.test.mjs`, 7/7 against local Postgres. It covers draft, unapproved, expired and superseded versions being ignored, the ambiguous case, and cross-org isolation.

**Database rates vs built-in rates.**

| Source | Direct (promo / A / B / C / D / E / F / remnant) | Wholesale |
|---|---|---|
| Built-in (`FIXTURE_ELITE100_*`) | 70 / 77 / 85 / 95 / 105 / 120 / 135 / 50 | 45 / 57 / 65 / 75 / 85 / 100 / 115 / 45 |
| v4 calculator (`ESF_DIRECT_PRICE_PER_SQFT`, `PROTOTYPE_TIER_PRICE_PER_SQFT`) | Same | Same |
| Production pricing-policy tables | **No rows** (versions, schedules and group rates all empty) | No rows |

So deploying the fix today changes **$0** in production. The dollar effect appears only once someone approves a schedule: a material swap moves by (new group rate − published group rate) × chargeable SF × 1.02 (use tax), plus material markup. Example from the regression test (a 10 SF room swapping B → C):

| Rates | B → C delta | Room total |
|---|---|---|
| Built-in (B 85, C 95) | +$102.00 | $972.00 |
| Hypothetical approved schedule (B 90, C 110) | +$204.00 | $1,074.00 |

Rule of thumb: each $1/SF rate change moves a room's swap delta by SF × $1.02. For a 50 SF kitchen that is $51 per $1/SF. Keeping the published material stays at delta 0 under any rates, so **published totals never move**. Accepted estimates are locked server-side (#381), so accepted totals cannot move either.

**Which schedule and version each publication used.** None of the production envelopes has `pricing_policy_version_id`, and nothing can have used a database schedule, because none exists. Each envelope's `pricing_policy_fingerprint` (engine + rates + tax) was recomputed against the built-in rates:

- v2 engine: 69 envelopes, all match the built-in rates.
- v1 engine: 1 envelope, matches.
- The 4 accepted publications are v4 and fingerprinted. They are locked.

**Publications without enough pricing information to pin a version:**

| Group | Count | Detail |
|---|---|---|
| Active publications with no recorded pricing basis | 4 | `1b9de633` (ESF-DYER-000207), `59fe2b09` (SE-9668E2F6), `49d7b435` (SE-A90F801A), `1d2e0c83` (SE-E5B27205) |
| Draft envelopes with no fingerprint | 4 | Never published to customers |
| Superseded publications with no envelope | 4 | Historical; not customer-editable |

The earlier recommendation here (record the built-in set as approved version 1 and backfill `pricing_policy_version_id`) is **superseded by section 9.4**. That approach mixed technical identity with business approval and would have rewritten existing rows.

### 9.4 Publication-level pricing pin (local only, NOT deployed; FEATURE_DECISIONS #385)

**Technical identity is separate from business approval.**

- Every new publication freezes `pricing_evidence_json.pricingPin` when it is published. The pin holds the rate set used (direct and wholesale $/SF, material use tax, and the customer option prices), the recorded pricing basis, and `rateSetId`.
- `rateSetId` is `rs1_` plus a SHA-256 of that content. It identifies *what the rates were*, not whether anyone approved them. No approval fields go into the pin.
- Approval stays in `digital_estimate_pricing_policy_versions` (status, `approved_at`, `approved_by_user_id`). Customer repricing never checks approval. It uses the pin.

**Customer changes use the publication's pin, never the current schedule.**

- The trusted context reads rates, tax and option prices only from the pin. It no longer calls `pricingPolicyRepository.getBaseRates` at all, so the #384 current-schedule lookup is gone from customer repricing.
- A pin whose content no longer hashes to its `rateSetId` is refused (`pricing_pin_invalid`).
- An option that is active today but absent from the pin is shown as unavailable instead of being priced at today's rate.
- Amendments copy the source evidence, so the pin carries forward. New schedules affect only new or explicitly republished estimates. Accepted estimates stay locked (#381).
- Today the pinned set is the built-in set, because the v4 calculator that produces the published baseline reads only its built-in tables. Pinning a database schedule the baseline never used would make option prices disagree with the published total. When the calculator starts reading approved schedules, new pins will capture those rates (`source: "policy_version"`, `policyVersionId`) with no change to existing publications.

**Publications from before pins existed:**

| Situation | Behaviour |
|---|---|
| Recorded basis (`pricing_basis` direct or wholesale) | Reprices from the built-in set, which every production fingerprint already matches (section 9.3). Nothing is written. |
| No recorded basis (the 4 active publications) | Published total shown unchanged. Online changes refused (409 `pricing_basis_unestablished`) with: "Online changes aren't available for this estimate. Your published total is unchanged. Please contact Elite Stone Fabrication to make changes." Not pinned, republished or revoked. |
| Staff previewing with an explicit basis | Allowed (`rateSource: staff_selected_basis`), so staff can check an option before republishing. |

**Staff review.** `GET /api/elite100-quote-flow/digital-estimate/pricing-basis-review` (Quote Flow staff access, org-scoped, read-only) lists unpinned active publications whose basis cannot be established. For each one it shows the project, published scope and total, plus the evidence: calculator retail and wholesale totals, which one the published total matches, measured rooms and groups, envelope fingerprints compared with the built-in set, and the acceptance count. The retail/wholesale match is evidence only. It is never applied automatically.

**Tests.**

- `configurationRateAuthority.test.mjs` (10/10) covers:
  - approving a different schedule after publication leaves an existing publication's option pricing identical (B→C +$102, rates, option prices, fingerprint), with zero schedule lookups;
  - a publication pinned to a different set prices from its own pin;
  - a tampered pin is refused;
  - a legacy publication with a recorded basis reprices from the built-in set;
  - a legacy publication without a basis gets the contact-Elite block, with no auto-pin or revoke.
- `pricingBasisReview.test.mjs` covers org isolation, read-only behaviour and the absence of token material.

**Follow-up (FEATURE_DECISIONS #386): pins record the rates the calculation actually used.**

- The pin is built from `calculationSnapshot.pricingRuleEvidence`, which the Studio calculator records alongside each calculation (rooms, basis, $/SF per room, account rules). It is not built from the defaults available at publish time.
- Rules carried in the pin and reproduced for customer changes: retail or wholesale basis, the Watts $40/SF promo, custom slab package rooms (slab qty × slab cost × 2.25, fixed in the baseline), and the Spahn 3% account rule.
- Rules that cannot be reproduced block online changes explicitly, with a code in the pin (`repricingBlockedReasons`): a manual estimate-wide adjustment, a Vanity Program room, a room rate that none of the recorded rules explains, a basis mismatch, or missing rate evidence. The publication is still published, but **view-only**: the customer sees the published total and the contact-Elite message, and there is no Accept button. Staff see a persistent "Published without online changes: …" notice in the Quote Flow Digital Estimate tab.
- Current Pricing Admin overrides, account memberships and estimate-wide adjustments are ignored when a pin exists. A publication from before pins that belonged to a partner account, or whose calculation shows bundled rooms, Watts, custom slab or an adjustment, is blocked rather than repriced at today's rates. A production read-only check (2026-09-29) found none of the 40 active unpinned publications in that position.
- Amendments keep the source pin byte-for-byte (same `rateSetId` and basis). A repriced revision happens only when staff explicitly republish from a recalculated and re-approved estimate.
- Finding: Pricing Admin overrides are **not** applied by the Studio calculator today (it receives only `env` and `now`). The rates actually used are the code tables plus the env-configured Watts and Spahn account lists.

### 9.5 Built-in rate table (what new publications pin today)

Approval status: **not recorded.** No approved policy version exists in production, so these are the code-owned built-in rates. Confirm them before any schedule is approved.

**Material $/SF** (retail = "direct"):

| Group | Retail | Wholesale | Difference |
|---|---|---|---|
| Promo | 70 | 45 | 25 |
| A | 77 | 57 | 20 |
| B | 85 | 65 | 20 |
| C | 95 | 75 | 20 |
| D | 105 | 85 | 20 |
| E | 120 | 100 | 20 |
| F | 135 | 115 | 20 |
| Remnant | 50 | 45 | 5 |

**Uplifts and adjustments:**

| Item | Rule |
|---|---|
| Material use tax | 2% of material only; included in the total, not shown as a line |
| Material markup | 0 by default; needs an authorised user (empty allowlist ⇒ nobody) |
| Watts (trusted partner) | Promo material at $40/SF instead of 45/70 |
| Spahn & Rose | +3% on the whole estimate after use tax, before rounding |
| Credit card | 3.5% fee (terms text only; not in totals) |
| Sales tax | **Unresolved**; not inferred from item defaults |

**Fabrication and add-ons** (the same for retail and wholesale):

| Item | Price |
|---|---|
| Kitchen sink cutout | $200 each |
| Vanity sink cutout | $100 each |
| Cooktop cutout | $150 each |
| Electrical outlet cutout | $30 each |
| ESF stainless sink | $160 |
| Rectangular vanity sink | $55 |
| Oval vanity sink | $35 |
| Blanco sink | **Unresolved** (450 vs 495; review required) |
| Tear-out | $750 |
| Standard edges | Included |
| Upgraded edge | $15/LF |
| Mitered edge | 2–3in $65/LF, 4in $70, 5in $75, 6in $80 |
| Waterfall labour | $600/leg; customer waterfall option unavailable (unresolved) |
| Backside polish | $225 |
| Build-up | $20/SF |
| Additional vanity trip | $150 |

**Vanity Program 2026** (per vanity, including top, sink(s) and cutouts; the kitchen-size tier is decided by qualifying kitchen SF of 35 or more; the displayed total is rounded to $5):

| Code | Kitchen ≥ 35 SF | Kitchen < 35 SF |
|---|---|---|
| 25" single | 190 | 370 |
| 31" single | 210 | 425 |
| 37" single | 240 | 475 |
| 43" single | 270 | 535 |
| 49" single | 310 | 590 |
| 55" single | 360 | 650 |
| 61" single | 385 | 675 |
| 61" double | 410 | 700 |
| 73" double | 490 | 810 |
| 84" double | 570 | 950 |
| 93" double | 650 | 1000 |
| 96" double | 685 | 1050 |
| 105" double | 760 | 1100 |
| 120" double | 800 | 1150 |

Sink upgrades per bowl: oval bisque +$10, rectangular white or bisque +$25.

**Custom slab package (confirmed):** slab quantity × slab cost × 2.25, including fabrication and installation. The suggested slab quantity adds 20% waste to the required area with no separate trim deduction. That waste rule is the current implementation and is **not yet approved**.

**What the customer page pins.** The customer-option subset is material $/SF (both schedules), 2% use tax, sink cutout $200, vanity sink cutout $100, cooktop $150, outlet $30, ESF stainless $160, rectangular vanity $55, oval vanity $35 and tear-out $750.

## 10. Which pricing controls affect calculations (2026-09-30, FEATURE_DECISIONS #387)

**Short answer:** today, **no Pricing Admin setting changes a Quote Flow or Studio price.** Pricing Admin (`quote_price_group_rates`, `quote_addon_catalog`, `quote_pricing_policy_rules`) is read only by the legacy public/partner quote calculator (`quotes/pricingConfigResolver.js` → `quoteCalculator.js`) and by the Pricing Admin head itself. The v4 calculator (`elite100RoomPricingCalculator.mjs`) uses code tables. Nothing has been activated or changed; wiring Pricing Admin into v4 needs your approval.

### 10.1 What each control actually drives

| Control | Where the v4 value comes from | Affects Quote Flow / Studio price? |
|---|---|---|
| Material $/SF by group and basis | `ESF_DIRECT_PRICE_PER_SQFT` / `ELITE100_WHOLESALE_RATE_PER_SF` (code) | Yes, from code only |
| Pricing Admin material rates | `quote_price_group_rates` | **No.** The calculator accepts `pricingContext.materialRateOverrides`, but no caller passes it |
| Digital Estimate account overrides | `digital_estimate_material_*` via `pricingPolicyRepository` | **No** in Supabase mode (only the in-memory repository exposes them). Pinned publications ignore them by design (#386) |
| Cutouts (kitchen $200, vanity $100, cooktop $150, outlet $30) | `ELITE100_CUTOUT_RATES` (code) | Yes, from code only |
| Staff-selected / customer-switched sink | ESF plumbing catalog in code (`esfPlumbingCatalogSeed.mjs`) | Yes, from code only |
| Upgraded edge $15/LF, miter, waterfall $600/leg, backside polish $225, tear-out $750, build-up $20/SF, extra vanity trip $150 | Calculator constants | Yes, from code only |
| Vanity Program 2026 prices and sink upgrades | `quotes/vanityProgram2026.js` | Yes, from code only |
| Custom slab package ×2.25, 20% waste | `elite100SlabPackagePricing.mjs` | Yes (waste rule not approved) |
| Material use tax 2% | `internalEstimateMaterialTaxPolicy.js` | Yes, internal economics only. Sales tax is unresolved |
| Watts $40/SF Promo, Spahn +3% | Env-configured partner lists + `studioEstimateTrustedAccounts.mjs` | Yes |
| Estimate-wide adjustment | Staff input on the estimate | Yes. **Increase only, 0–100%.** Negative values are clamped to 0 and the adjustment switches off (`studioEstimateWideAdjustment.mjs`); the Quote Flow field now says so and refuses negatives |
| Customer-facing / internal-only custom lines | Staff input | Yes (charges, discounts and credits are the way to discount) |
| `public_consumer_markup_percent`, `public_rounding_rule` | `quote_pricing_policy_rules` | No (public quote tool only) |

### 10.2 Impact comparison: production Pricing Admin vs. the v4 calculator

Read-only SELECT against production on 2026-09-30. Only global rows (no organization overrides) exist, all last updated 2026-05-13.

| Item | Pricing Admin (production) | v4 calculator | Impact if Pricing Admin became authoritative |
|---|---|---|---|
| Direct $/SF Promo, A–F | 70 / 77 / 85 / 95 / 105 / 120 / 135 | same | None |
| Wholesale $/SF Promo, A–F | 45 / 57 / 65 / 75 / 85 / 100 / 115 | same | None |
| Remnant | **no row** | Direct 50, Wholesale 45 | Needs a Remnant row first, or Remnant would have no rate |
| Kitchen / vanity / cooktop / outlet cutout | 200 / 100 / 150 / 30 | same | None |
| Waterfall, backside polish, tear-out, specialty edge | 600 / 225 / 750 / 15 | same | None |
| ESF stainless, rectangular vanity, oval vanity sink | 160 / 55 / 35 | same | None |
| Stock Blanco sink | **495** | 450 (`qty-blanco`, not priced by v4; the customer option is "review required") | +$45 per Blanco sink once mapped |
| Pop-up outlet cutout | 150 | no v4 equivalent | Needs a mapping decision |
| Miter, build-up, vanity trip, Vanity Program, slab ×2.25, use tax | not in Pricing Admin | code | Must stay in code or be added to Pricing Admin first |

**Net effect of activation today:** no change to any material, cutout, edge or ESF sink price. The only price differences are the Blanco sink (+$45) and any Remnant estimate (no rate). None of the local test estimates would change.

**Proposed mapping (not activated):** pass Pricing Admin rates into the calculator through `pricingContext.materialRateOverrides.{direct_retail|wholesale}`, resolved server-side per organization. The pin already records `pricing_admin_override` per room, so published quotes stay frozen. Cutouts and add-ons need a new `pricingContext.cutoutRates` input keyed by `addon_code`. Prerequisites: a Remnant row, a Blanco price decision, a pop-up outlet mapping, and your approval of the rate set.

## Open risks to track

- Digital Estimate repricing uses fixture rates/catalog (`FIXTURE_ELITE100_*`), which can drift from the v4 calculator; the baseline-parity guard contains this but should be pointed at Pricing Admin.
  - Root cause of "fixtures always win": `configurationTrustedContext.mjs` called `pricingPolicyRepository.getBaseRates()` without `await`. **Fixed locally only, not deployed** (#384, section 9.3). Production has no schedule rows, so the fix changes nothing today. Superseded locally by the publication pricing pin (#385, section 9.4): customer repricing no longer reads the current schedule at all. Also local only, NOT deployed.
- `DIGITAL_ESTIMATE_SYNTHETIC_PILOT_ONLY` defaults on; confirm production state before real customers.
- `patchPricing` updates an approved row in place instead of forking a revision (published snapshots remain safe).
- Quote Flow audit is console logging, not `eos_action_log`; accounting writes need durable audit rows.
