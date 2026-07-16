# Phase DE.2C — Deterministic Elite 100 Configuration Delta Pricing Engine

**Date:** 2026-07-16  
**Status:** Implemented (engine + golden fixtures + persistence hooks). **Flags off. SQL not applied. No UI.**  
**Engine:** `elite100-config-delta-v1`  
**Does not begin:** DE.2E (public customer configuration). DE.2D Studio envelope builder is implemented — see `PHASE_DE_2D_NOTES.md`.

---

## 1. What shipped

| Deliverable | Path |
|-------------|------|
| Money helpers (integer cents / bps) | `configuration/money.mjs` |
| Engine constants | `elite100ConfigDeltaConstants.mjs` |
| Pure calculation engine | `elite100ConfigDeltaEngine.mjs` |
| Public calculation DTO serializer | `elite100ConfigDeltaPublicSerializer.mjs` |
| Calculate + persist service | `configurationCalculationService.mjs` |
| Golden + security tests | `phaseDe2c.test.mjs` |
| Persistence methods | `getCalculation`, `getCalculationByInputFingerprint`, idempotent `insertCalculation` (memory + Supabase) |

**Not shipped:** customer UI, SQL apply, production seeds, flag enablement, `calculateQuote()` changes. Studio envelope UI is DE.2D (separate notes).

---

## 2. Confirmed calculation order

1. Resolve material group + locked chargeable SF  
2. Base Direct/Wholesale rate from **frozen** policy  
3. Account-specific material override (Watt’s Promo **$40** when trusted)  
4. Authorized material markup (bps; default 0)  
5. Material sell subtotal  
6. **2% material use tax** on final material sell (bundled; not a public line)  
7. Products / fabrication add-ons / options  
8. Customer-facing custom lines  
9. Credits / discounts  
10. Complete net **pre-rounded** subtotal  
11. Spahn & Rose **+3%** (when trusted membership)  
12. Ceiling-to-**$10** customer display total  

---

## 3. Confirmed rates (frozen fixtures / policy — not calculator cutover)

| Schedule | Promo | A | B | C | D | E | F | Remnant |
|----------|-------|---|---|---|---|---|---|---------|
| Direct | 70 | 77 | 85 | 95 | 105 | 120 | 135 | **50** |
| Wholesale | 45 | 57 | 65 | 75 | 85 | 100 | 115 | **45** |

- Watt’s: account-specific Promo **$40/SF** (not labeled Direct/Wholesale)  
- Material use tax: **200 bps** after markup  
- Spahn & Rose: **300 bps** after complete pre-rounded subtotal (includes tax)  
- Display: `ceil` to next **$10**  

`calculateQuote()` Remnant Wholesale remains **50** until a separate cutover.

---

## 4. Public vs internal

| Public | Internal only |
|--------|----------------|
| Baseline/configured **display** totals + display delta | Exact cents, tax amount, Spahn amount |
| Room material **labels**, locked SF | Wholesale/Direct rates, Watt’s rate |
| Visible option prices where treatment allows | Account-group IDs, rule IDs, markup, cost/margin |
| Review messages / disclaimers | Fingerprints, resolution evidence |

---

## 5. Tests

```bash
node backend-core/src/digitalEstimate/configuration/phaseDe2c.test.mjs
node backend-core/src/digitalEstimate/configuration/phaseDe2b.test.mjs
node backend-core/src/digitalEstimate/phaseDe1.test.mjs
```

---

## 6. Explicit non-goals held

- No `calculateQuote()` edit  
- No IE / QL / Takeoff / delivery / Pricing Admin behavior change  
- No customer configuration routes/UI  
- No migration apply / flag enable / deploy / commit  
