# eliteOS remaining implementation plan (post readiness audit)

**Audit HEAD:** `main` @ `f572a36`  
**Date:** 2026-07-27  
**Constraint:** ≤2 implementation branches before controlled pilot freeze; prefer **zero** if hosted P0 passes.

---

## Can the pilot launch without further implementation?

**Yes — if and only if hosted P0 Takeoff integrity passes** (see [ELITEOS_CONTROLLED_PILOT_ACCEPTANCE_CHECKLIST.md](./ELITEOS_CONTROLLED_PILOT_ACCEPTANCE_CHECKLIST.md)).

Rationale:

- Core Studio path (intake → Manual/Takeoff → calc → approve → publish → revise → replace → Review Requests) is **code-connected** with golden-path gates.
- Physical Takeoff result integrity is **implemented and locally tested** (`f2e99bf`); production `quote_id` is already nullable.
- Remaining vision gaps (Vanity, Final Acceptance, Sold, All Estimates) are **explicitly out of pilot scope**.

**Do not** start Vanity, All Estimates, or Sold Job branches before pilot freeze.

---

## If hosted P0 fails — smallest blocker branch

### Branch 1 (only if needed): `fix/takeoff-physical-persistence-hosted-hotfix`

| Field | Value |
|-------|--------|
| **Business outcome** | Estimators can Save/refresh/approve Takeoff and seed Scope from the physical corrected result on hosted. |
| **Capabilities** | Physical insert; nullable `quote_id` env apply; failure messaging; approval affected-row; Scope seed |
| **Likely files** | `takeoffWorkspaceService.mjs`, frontend reconcile (only if response envelope bug), migration SQL apply notes |
| **SQL** | Maybe — apply existing `eliteos_quote_takeoff_results_quote_id_nullable_v1.sql` **manually** if `23502` |
| **Tests** | `eos:test:takeoff-physical-result-persistence` + hosted script |
| **Hosted acceptance** | Checklist P0-T1…T3 |
| **Stop conditions** | Integrity green; no new features; no synthetic IDs |
| **Deploy order** | SQL (if needed) → Brain → AI Takeoff → Studio (if touched) |
| **Size / risk** | S / High (integrity) |

**Second branch before freeze:** only if P0 customer leakage fails.

### Branch 2 (only if needed): `fix/studio-publication-internal-line-leak-hotfix`

| Field | Value |
|-------|--------|
| **Business outcome** | Internal-only / absorbed custom lines never appear by name on customer DE. |
| **Capabilities** | Publication adapter filter; DE print/view |
| **Likely files** | `studioEstimatePublicationAdapter.mjs`, DE public views |
| **SQL** | No |
| **Tests** | Existing slice2 + new DE assertion |
| **Hosted acceptance** | Scenario 3 |
| **Stop** | Leak fixed; no sold/vanity work |
| **Size / risk** | S / High (trust) |

---

## After pilot freeze (P2) — recommended sequence (not this week)

Max one coherent product outcome per branch; reuse calculators, publication snapshots, Account Directory, review services.

| Order | Branch (suggested) | Outcome | Size | SQL | Risk |
|-------|--------------------|---------|------|-----|------|
| 1 | `feature/studio-final-acceptance` | Customer final accept + lock | L | Likely | High |
| 2 | `feature/studio-sold-review` | Explicit Mark Sold + frozen sold snapshot (no auto QB/Moraware) | L | Likely | High |
| 3 | `feature/studio-all-estimates-registry` | Unified family search; QL coexistence | XL | Likely | High |
| 4 | `feature/studio-vanity-program` | Wire Vanity Program 2026 into Studio calc/DE | L–XL | Maybe | High |
| 5 | `feature/studio-per-room-materials` | Material by room/piece parity with IE | L | Maybe | Medium |
| 6 | `feature/pricing-admin-studio-cutover` | Resolver drives Studio with parity tests | XL | No/Maybe | High |

Do **not** remove Quote Library or Internal Estimate until All Estimates + Sold + pilot maturity.

---

## What must not be touched before pilot freeze

- Vanity Program port  
- All Estimates / Quote Library removal  
- Sold Job / Final Acceptance feature builds  
- Manual↔Takeoff authority switcher  
- Mailbox webhook / malware / Add Plans  
- Broad Pricing Admin calculator cutover  
- Autosave reintroduction on Takeoff  
- Weakening concurrency (409) or synthetic result IDs  
- Any automatic publish / email / sold / QB / Moraware  

---

## Deployment order (steady state)

1. Confirm / apply nullable `quote_id` where needed (manual).  
2. Brain (`backend-core`) with physical-row Takeoff.  
3. `app-ai-takeoff`.  
4. `app-elite100-estimate-studio` if changed.  
5. Hosted P0 script.  
6. Pilot allowlist enablement.

---

## Next branch (if one is necessary)

**Next branch:** `fix/takeoff-physical-persistence-hosted-hotfix`  

**Exact business outcome:** Hosted Save/refresh/approve/Scope seed uses one physical corrected Takeoff result end-to-end.

**Why highest value:** Without this, estimator corrections can fail closed (503) or — under older unsafe backends — corrupt Scope seeding; it is the only P0 integrity hinge for Workflow A this week.

**If hosted P0 already passes:** **No next implementation branch.** Freeze and run the controlled pilot.

**What must not be touched before pilot freeze:** Everything listed in the freeze section above — especially Vanity, Sold, All Estimates, and delivery-boundary automations.

## Update (2026-07-27) — `feature/studio-estimating-parity`

Completed on this branch (not Vanity/Acceptance/Sold/All Estimates):

- Material inheritance (estimate → room → piece)
- Canonical commercial lines (customer / discount / credit / internal_only / absorbed)
- Customer vs internal totals + public payload/print filtering
- Print snapshot schema compatible with shared PDF parser
- Safe read model for future All Estimates consumers

Next deferred product phases remain: Vanity Program, Final Acceptance, Sold Review, All Estimates UI.
