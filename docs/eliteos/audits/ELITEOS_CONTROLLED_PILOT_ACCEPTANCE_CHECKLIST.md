# eliteOS controlled pilot — acceptance checklist

**Purpose:** Smallest trustworthy end-of-week estimator pilot for Elite 100 Estimate Studio.  
**Audited main:** `f572a36` (includes Takeoff physical-result persistence `f2e99bf`).  
**Rule:** Checkboxes are **hosted / operator** evidence unless marked *local*.

---

## Pilot definition (supported)

| Item | Supported? |
|------|------------|
| Estimate types | Elite 100 / Studio kitchens & baths with **one project material group** |
| Intake | Shared Inbox explicit import **or** Manual New Estimate |
| AI Takeoff | **Yes**, after P0 Save→approve integrity passes |
| Manual Scope fallback | **Yes** (preferred if Takeoff P0 fails) |
| Pricing | Material group, edge profiles, backsplash, cutouts/add-ons, fees as exposed in Pricing Setup, custom lines (visible + internal absorbed) |
| Customer publication | Explicit publish; stable link; replace/revoke; Review Requests |
| Unsupported | Vanity Program 2026, per-room/piece materials, Final Acceptance, Mark Sold, auto email, Moraware/QB writes, All Estimates, Outlook mutation |

**Who may use it:** Named estimator allowlist with Studio + AI Takeoff head access.  
**Training notes:** Explicit Save only; never approve dirty Takeoff; one material group; vanity jobs stay on Internal Estimate; sold stays on Quote Library.  
**Operational fallback:** Internal Estimate + Quote Library unchanged.  
**Rollback:** Remove pilot head access; keep IE/QL; do not delete Studio data.  
**Monitoring:** Brain logs for `takeoff_result_persistence_failed`, `takeoff_result_not_persisted`, `stale_takeoff_correction`; DE publish errors.

---

## GO criteria (all required)

- [ ] **P0-T1** Save corrected Takeoff → physical `resultId` returned → refresh shows same corrections (backsplash / exposed edge / note sentinels).
- [ ] **P0-T2** `getResultById(resultId)` (or UI equivalent) loads that result — not 404.
- [ ] **P0-T3** Approve Takeoff & Build Estimate updates **that** physical result; Estimate Scope shows **B** sentinels (not original AI **A**).
- [ ] **P0-T4** Dirty Takeoff cannot approve; Save failure leaves draft dirty and blocks approval.
- [ ] **P0-C1** Multi-room (≥3) calculate → approve commercial estimate → totals stable on reopen.
- [ ] **P0-R1** Publish revision 1 → create revision 2 → recalculate → reapprove → **explicit** replace → old snapshot still openable/frozen.
- [ ] **P0-P1** Customer Digital Estimate shows customer-safe pricing; **no** named internal-only / absorbed custom lines.
- [ ] **P0-S1** No unintended email, publish-on-load, Mark Sold, QuickBooks, or Moraware write during the script.
- [ ] **P0-G1** Local gates green: `eos:test:takeoff-physical-result-persistence`, `eos:test:studio-golden-path-gate` (*local*).

## NO-GO criteria (any one blocks pilot)

- [ ] Save succeeds without a physical `resultId`, or refresh returns older AI result after correction.
- [ ] Approval marks job approved while zero `quote_takeoff_results` rows updated.
- [ ] Scope seeds from AI result A after estimator saved/approved B.
- [ ] Internal-only line names visible on customer DE.
- [ ] Any automatic publish / email / sold / QB / Moraware side effect.
- [ ] Cross-org data visible on any pilot API.
- [ ] Vanity Program jobs priced in Studio as if program rules applied (misrepresentation).

---

## Scenario scripts

### Scenario 1 — Multi-room standard kitchen

**Goal:** Three+ rooms/areas, multiple pieces, backsplash, cutouts, products/add-ons, mixed exposed edges → calc → approve → publish → reopen → revision.

| Step | Action | Pass criteria |
|------|--------|---------------|
| 1 | Shared Inbox import **or** Manual New | Case + estimate open |
| 2 | Takeoff path **or** Manual Scope | ≥3 rooms, ≥2 pieces in one room |
| 3 | Set backsplash + cutouts + edges | Local draft dirty until Save/Confirm |
| 4 | Save/Confirm → refresh | Persistence holds |
| 5 | Approve Takeoff (if used) → Scope | Seed matches approved geometry |
| 6 | Pricing Setup + Calculate + Approve | Fingerprints set; reopen shows same total |
| 7 | Publish DE | Staff recovers customer URL |
| 8 | Reopen publication management | No accidental republish |
| 9 | Edit price-affecting field → new revision → calc → approve → replace | Old pub frozen |

**Status if Vanity/mixed materials required:** N/A for this scenario.  
**BLOCKED if:** P0 Takeoff integrity fails on Takeoff path — fall back to Manual Scope and re-run.

---

### Scenario 2 — Island and peninsula

| Step | Action | Pass criteria |
|------|--------|---------------|
| 1 | Island with four exposed sides | Physical LF matches confirmation |
| 2 | Peninsula with attached side | Attached side not billed as open incorrectly |
| 3 | Quantity / commercial edge profiles | Room totals and customer DE edge presentation coherent |

**BLOCKED if:** Topology cannot be represented — file defect; do not expand pilot to peninsula jobs.

---

### Scenario 3 — Custom commercial estimate

| Step | Action | Pass criteria |
|------|--------|---------------|
| 1 | ≥2 customer-facing custom lines | Appear on internal + DE |
| 2 | Discount/credit via scope adjustments | Customer total drops correctly |
| 3 | ≥1 `customerFacing=false` internal line | Charges internal total; **absorbed / unnamed** on DE |
| 4 | Print/DE view | Customer total ≠ leak internal descriptions |

**BLOCKED if:** Internal names appear publicly.

---

### Scenario 4 — Vanity Program

| Step | Action | Pass criteria |
|------|--------|---------------|
| — | — | **BLOCKED — MISSING in Studio** |

**Missing implementation:** Wire `vanityProgram2026.js` (or Pricing Admin rules) into `elite100EstimateStudio` pricing/publication.  
**Pilot instruction:** Run vanity jobs in **Internal Estimate** only.

---

### Scenario 5 — Revision and publication

| Step | Action | Pass criteria |
|------|--------|---------------|
| 1 | Publish revision 1; customer can open | Active pub |
| 2 | Create revision 2; change scope/price | Old estimate id superseded (409 if mutated) |
| 3 | Recalc + reapprove + explicit replace | New token/link; prior snapshot frozen |
| 4 | History understandable in Live DE / DE panel | Labels distinguish current vs historical |

---

### Scenario 6 — Acceptance and sold

| Step | Action | Pass criteria |
|------|--------|---------------|
| — | — | **BLOCKED — MISSING in Studio** |

**Missing:** Customer Final Acceptance API/UI; Sold Review checklist; Mark Sold; sold snapshot; Studio→QL visibility; explicit Moraware/QB handoff without auto-write.  
**Pilot instruction:** Stop at Review Request / published state; use Quote Library only for legacy sold workflow on IE quotes.

---

## P0 hosted Takeoff integrity script (must run first)

Use distinctive sentinels on correction **B**:

- Note / piece note: `corrected-result-B`
- Backsplash: `true` where A was `false`
- Exposed edge: known side set

Then:

1. Save → record `resultId` **B**.  
2. Hard refresh → confirm B.  
3. Approve & Build Estimate → confirm Scope contains `corrected-result-B`, not `result-A`.  
4. Confirm original A remains historical / needs_review if still present.  
5. Confirm no publish/email/sold occurred.

**Schema note (already checked 2026-07-27):** production `quote_id` nullable. If Save returns `takeoff_result_persistence_failed` with db `23502`, apply `backend-core/supabase/eliteos_quote_takeoff_results_quote_id_nullable_v1.sql` on that environment only, then redeploy Brain and retest.

---

## Sign-off

| Role | Name | Date | GO / NO-GO |
|------|------|------|------------|
| Operator (hosted P0) | | | |
| Estimator lead | | | |
| Engineering | | | |
