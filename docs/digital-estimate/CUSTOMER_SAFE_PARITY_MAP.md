# Digital Estimate — customer-safe parity map

**Branch:** `feature/digital-estimate-complete-customer-options`  
**Date:** 2026-07-19  
**Authority:** Internal Estimate / Studio scope + `quoteCalculator` + DE configuration envelope. No second catalogs or engines.

## Categories

| Code | Meaning |
|------|---------|
| **A** | Customer-selectable (envelope-gated) |
| **B** | Customer-visible but locked |
| **C** | Estimator-only — never public |
| **D** | Unsupported / unresolved → estimator review |

## Project / room fields

| Field | Cat | Reuse |
|-------|-----|-------|
| Customer name / project / phone / email / address | A (proposed corrections only) | `customerConfigurationDraft` |
| Room label | A (when allowed) | `__roomLabelDrafts` |
| Room / project notes (customer) | A | draft meta `__roomNotes` / `__projectNote` |
| Estimator notes | C | never in public DTO |
| Pricing basis Wholesale/Direct | C | — |
| Internal markup | C | — |
| Partner account / trusted rates | C | — |
| Material group (allowed set) | A | envelope `allowedMaterialGroupCodes` + materials |
| Exact color | A | `material:room:materialId` options |
| Locked geometry / pieces | B | trusted context; **no public numeric SF** |
| Countertop sections (raw/billable SF) | B internal / hidden public | `ceilBillableSquareFeet` per section |
| Backsplash none / 4″ / full-height | A | envelope backsplash options |
| Backsplash length/height/SF | B locked | server calc only |
| Sink stock / catalog / customer / none | A | options + Product Catalog filter |
| Cooktop cutout Y/N | A | `qty-cook` when allowed |
| Outlet qty | A | `qty-outlet` max from envelope |
| Edge eased + upgrades | A | eased included; LF locked server-side |
| Edge LF | B locked (not shown publicly) | `edgeLinearFeetTotal` |
| Waterfall / miter / build-up | A only if estimator-allowed else D | optional keep/remove; no dim edits |
| Tear-out | A/B | `tearout` when in envelope |
| Customer-visible custom lines | A/B | `customerFacing: true` only |
| Internal-only custom lines | C | — |
| Blanco / popup / unresolved waterfall | D | `review_required` / Ask estimator |
| Remnant group | A only if explicitly allowed | envelope |

## Square-foot pricing boundary

**Authoritative independently priced sections** (each `ceilBillableSquareFeet` before rate×SF):

1. Each included room **piece** `sqft` when `pieces[]` present  
2. Else room **countertopSqft** as one section  
3. Each **backsplash section** when present; else room **backsplashSqft**  
4. Each **waterfall panel** SF when present  

Do **not** `Math.ceil(sum(sections))`.

Shared helper: `backend-core/src/quotes/billableSquareFeet.mjs` → `ceilBillableSquareFeet`.

Raw geometry is preserved; billable SF is derived server-side only.

## Public safety

Never public: Wholesale, Direct/Retail, raw keys, group codes, SF numbers, rates, cost, margin, markup, estimator notes, internal-only lines, vendor/inventory.
