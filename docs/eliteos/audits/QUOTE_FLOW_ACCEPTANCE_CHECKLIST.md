# Quote Flow → Digital Estimate → acceptance → Mark Sold → QuickBooks: acceptance checklist

Status as of 2026-10-02. Each row says what proves it today. Evidence classes:

- **PROD**: verified read-only against production data
- **LOCAL**: automated test against in-memory repositories (real services, real calculator)
- **PG**: automated test against local Postgres (`~/eliteos-nonprod`)
- **SIM**: QuickBooks simulator (`qbSalesOrderSimulator.mjs`), not real QuickBooks
- **BROWSER**: manual browser run against local Brain and local Supabase
- **NONE**: untested

The question every row answers: **do the saved pricing, published pricing, accepted total and accounting lines agree?**

## Workflow stages

| Stage | Evidence | Notes |
|---|---|---|
| Quote Flow pricing saved = approval = review = Digital Estimate = published snapshot | PROD (Marshal's 5 estimates) | 929000 / 390000 / 414000 / 405000 / 743000 cents; snapshots reconciled; tax null; 0 unresolved |
| Customer acceptance | LOCAL | 0 production acceptances since the release |
| Staff Mark Sold, sold snapshot locked | LOCAL (`estimateLifecyclePersistenceHardening` 10–22) | 0 production sold snapshots |
| Sales order plan = accepted total | LOCAL (`quoteFlowPublicAcceptance` 7, 13, 14; `studioSalesOrderQueue` 1–18) | Plan only; no config row in production |
| Queue → agent → QuickBooks write, read-back, retry, duplicate safety | PG + SIM | Never run against real QuickBooks (Milestone 1 pending) |
| Production QuickBooks write | NONE (disabled) | First enablement needs explicit approval |

## Scenarios

| # | Scenario | Saved = published = accepted = plan | Evidence | Test |
|---|---|---|---|---|
| 1 | Elite 100, single and multi-room | yes | PROD (to publish), LOCAL (to plan) | Marshal 5; `quoteFlowPublicAcceptance` 2, 10 |
| 2 | Custom slab at slab cost × 2.25 (fabrication/install included), exact cents, quantity confirm gate | yes | LOCAL | `quoteFlowPublicAcceptance` 7; `elite100SlabPackagePricing` |
| 3 | Shared slab across rooms (charged once, allocated) | yes | LOCAL | `quoteFlowPublicAcceptance` 14 (added); `elite100SlabPackagePricing` |
| 4 | Mixed rooms (custom slab kitchen + Elite 100 bath) | yes, per room | LOCAL | `quoteFlowPublicAcceptance` 7 |
| 5 | **Custom → Elite 100 switch (staff, before approval)** | yes; identical to a never-custom estimate | LOCAL | `quoteFlowPublicAcceptance` 13 (added): package removed, and package kept but unassigned |
| 6 | Custom → Elite 100 switch by the customer in the Digital Estimate | not offered | LOCAL | `quoteFlowPublicAcceptance` 7 asserts slab rooms have no swaps. Business decision below |
| 7 | Vanity Program (program sink included, no cutout charge, no swaps) | yes to acceptance | LOCAL | `quoteFlowPublicAcceptance` 12; `quoteFlowVanityProgram` |
| 8 | Sink substitutions (staff catalog sink; customer switch charges the difference) | yes | LOCAL | `quoteFlowPublicAcceptance` 11; `studioSalesOrderQueue` 2 (model code, unmapped blocks) |
| 9 | Backsplash and side splash (none / sections / reprice / restore) | yes; separate accounting line | LOCAL | `phaseBacksplashSideSplashLivePricing` 1–20; `studioSalesOrderQueue` 1 |
| 10 | Credits and charges (customer-facing vs internal) | yes; negative line → credit item | LOCAL | `quoteFlowPricing` charges/credits; `quoteFlowPublicAcceptance` 14; `studioSalesOrderQueue` 1, 3 |
| 11 | Manual adjustment, view-only publish, accept as quoted | yes | LOCAL | `quoteFlowPublicAcceptance` 8 |
| 12 | Taxes | accepted total never raised; tax > 0 blocks the plan | LOCAL + SIM | `studioSalesOrderQueue` 5, 12, 16. **Policy unconfirmed (2% interpretation awaits bookkeeper)** |
| 13 | Customer changes before acceptance (selections, sink switch, backsplash) | accepted-as-configured total = configured total | LOCAL | `quoteFlowPublicAcceptance` 3, 6, 6b, 11 |
| 14 | Customer changes after acceptance | locked (423); stale version 409; tampered quote blocked; accepted scope change rejected by the plan | LOCAL | `quoteFlowPublicAcceptance` 4, 5, 6, 9, 9b; `studioSalesOrderQueue` 15 |
| 15 | Post-acceptance change order (amendment) through to accounting | — | NONE | Not covered by this checklist |
| 16 | No slab cost / supplier / multiplier in customer payloads or accounting plan | yes | LOCAL | `quoteFlowPublicAcceptance` 7, 13, 14 |

## Remaining business decisions

1. Tax policy (2% interpretation) — bookkeeper. Until then, any plan whose tax would be > 0 is blocked.
2. QuickBooks header: branch class, plumbing class, terms, template.
3. Material lines: ESF house colors / Promo mapping by catalog line; the QuickBooks material item for custom slabs (`custom_slab_material_unmapped`).
4. Sinks: model item vs parent item.
5. Credit item, memo format, sales rep and custom fields.
6. Whether customers may switch a custom slab room back to Elite 100 in the Digital Estimate (today: staff only, before approval).
7. How post-acceptance customer changes reach accounting (amendment vs new estimate).

## Not claimed

Production (`studio_estimate_acceptances`, organization `elite_stone_fabrication`) holds 4 customer acceptances, dated 2026-08-02 to 2026-08-05; none since the 2026-09-30 Marshal release, so the current acceptance path has not run in production. No production Mark Sold (0 sold snapshots) or QuickBooks write has happened. Simulator and local Postgres runs do not prove real QuickBooks behavior. The bounded real QuickBooks test (TEST company copy, shared builder, write / read-back / duplicate retry) is prepared separately with the VM maintenance checklist and has not been run.
