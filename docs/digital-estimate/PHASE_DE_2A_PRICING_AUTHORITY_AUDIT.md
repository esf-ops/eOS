# Phase DE.2A — Pricing Authority Audit

**Date:** 2026-07-16
**Status:** Documentation only — no implementation
**Branch context:** `elite-100-digital-estimate` (DE.1 + DE.1.1 complete)
**Scope:** Repository analysis of calculation, Pricing Admin, catalogs, and reproducibility for future interactive Elite 100 Digital Estimates

---

## 1. Executive summary

| Question | Finding |
|----------|---------|
| What prices Internal Estimate today? | **`calculateQuote()`** in `backend-core/src/quotes/quoteCalculator.js`, primarily via **hardcoded Direct-basis constants** (`ESF_DIRECT_PRICE_PER_SQFT`, add-on/edge/miter/vanity/tax constants) |
| Are Pricing Admin tables live? | **No** for quote math. `pricingConfigResolver.js` is preview/admin only; its own comment forbids wiring without approval |
| Are `quote_pricing_structures` / `quote_pricing_rules` live? | **Partially** — partner/wholesale paths can use DB rules; Internal Estimate Direct basis **ignores** DB material $/sf |
| Can historical totals be reproduced from live tables alone? | **No** — constants are in JS; rule values are not stored in the snapshot; CDT/`finalRounded` are client-authored integers validated for equality, not derived server-side from `calc.totals.retail` |
| DE.1 publication freeze | **Yes for customer-visible DE** — `quote_publication_snapshots` copies customer-safe + pricing-evidence JSON at publish; public path never recalculates |

**Recommended interactive pricing strategy (detail in §8):** **Hybrid (C)** — immutable published baseline from IE/`calculateQuote()` + new versioned Elite 100 **configuration delta calculator** over a frozen option catalog. Do not wire Pricing Admin into production IE math as a prerequisite for DE.2.

**Expanded inventory:** Every material group, add-on, edge, vanity, commercial rule, conflict, calculation order, and included-vs-optional matrix is in [`PHASE_DE_2A_PRICING_INVENTORY.md`](./PHASE_DE_2A_PRICING_INVENTORY.md).

---

## 2. Current `calculateQuote()` authority

### 2.1 Call sites (production estimating)

| Caller | Path | Notes |
|--------|------|-------|
| Internal Estimate save | `backend-core/src/quotes/internalQuotesApi.js` | Forces `quoteSource: "internal_quote"`, `material_program_default: "elite_100"` into stored snapshot UI |
| Related save helpers | `internalQuoteSave.js`, `quotePersist.js` | Persist header + write `quote_calculation_audit` |
| Public / partner / custom | Other APIs | Out of DE.2 scope; must remain unchanged |

### 2.2 Inputs that affect Internal Estimate totals today

| Input class | Examples | Authority |
|-------------|----------|-----------|
| Measurements | room pieces, guided shapes, countertop/backsplash exact sf, chargeable ceiling | Estimator / takeoff-approved data in request body |
| Material | `materialGroup`, per-room/piece overrides, `quoteDefaultMaterial` | Estimator |
| Program | `materialProgramDefault` / room override | Forced Elite 100 for IE save path; OOC premium currently **zeroed** in rooms engine for internal |
| Edges | `edgeMode`, upgraded/miter/manual | Estimator |
| Add-ons | `qty-sink`, `qty-blanco`, tearout, etc. | Estimator quantities × unit prices |
| Vanities | vanity program codes/tiers | Estimator + `vanityProgram2026.js` tables |
| Custom lines | name, category, qty, unitPrice, customerFacing | Estimator; Discount/Credit may be negative |
| Tax | 2% material use tax on CT+BS (hardcoded) | Code constant |
| Markup | stripped for `internal_quote` | N/A (retail = wholesale) |
| Pricing context | `pricingContext.db`, structure id, partner account | Used for structure metadata / wholesale rules; **not** Direct $/sf |

### 2.3 Tables / modules that **do** affect `calculateQuote()` when DB present

| Resource | Effect on Internal Estimate Direct |
|----------|-------------------------------------|
| `quote_pricing_structures` | Structure metadata; not Direct $/sf |
| `quote_pricing_rules` | Partner/wholesale material & add-on overrides; Direct CT/BS still use `ESF_DIRECT_PRICE_PER_SQFT` |
| `quote_partner_pricing_assignments` | Partner structure resolution |

### 2.4 Tables / modules that **do not** affect `calculateQuote()` today

| Resource | Status |
|----------|--------|
| `quote_price_groups` / `quote_price_group_rates` | Pricing Admin foundation — unused by calculator |
| `quote_addon_catalog` | Seed/preview only (Blanco $495 vs calculator $450 discrepancy) |
| `quote_pricing_policy_rules` | Preview only |
| `quote_material_color_mappings` | Schema, no seeds, unused |
| `quote_programs` / `quote_catalog_*` | Forward schema only |
| `pricingConfigResolver.js` | Explicitly not in hot path |
| `elite100-2026.json` / slab color catalog | Inventory/visualizer — not quote math |
| `app-slab-inventory/.../productCatalogData.ts` | Display catalog (sinks/faucets) — not priced in IE |

### 2.5 Hardcoded rates (reproducibility-critical)

Documented in `quoteCalculator.js` and related modules (non-exhaustive):

- `ESF_DIRECT_PRICE_PER_SQFT` (Promo–F, Remnant)
- `PROTOTYPE_TIER_PRICE_PER_SQFT` (wholesale fallback)
- `PROTOTYPE_ADDON_UNIT_PRICES` (cutouts, sinks, tearout, …)
- Edge/miter/build-up v2 rates
- `INTERNAL_ESTIMATE_MATERIAL_USE_TAX_PERCENT = 2`
- OOC premium percents (legacy path; rooms engine currently does not charge OOC for internal)
- Vanity program 2026 price table

### 2.6 Snapshot & customer totals

| Artifact | Where | Notes |
|----------|-------|-------|
| `calculation_snapshot` | `quote_headers` | Built by `buildCalculationSnapshot()` + IE `internal_ui` enrichment |
| `customer_display_total` | `internal_ui` | Client integer; server stores/validates |
| `customer_estimate_print_snapshot.finalRounded` | `internal_ui` | Must equal CDT when present |
| `grand_total` | header | `calc.totals.retail` (exact) — may differ from CDT due to UI per-row $10 rounding |
| `quote_calculation_audit` | table | Full body + calc output; **not** a frozen rule-value ledger |

### 2.7 Output gate

`quoteOutputGate.js`: requires saved UUID, non-empty `quote_number`, non-empty `calculation_snapshot`. Does **not** validate pricing version consistency.

### 2.8 Digital Estimate publish freeze (DE.1)

At publish, Brain copies:

- Customer-safe allowlist document → `customer_snapshot_json`
- Pricing evidence including `calculationSnapshotCopy` → `pricing_evidence_json`

Public GET never calls `calculateQuote()`. Tokens never point at live `quote_headers`.

---

## 3. Pricing Admin wiring status

| Layer | Status | Evidence |
|-------|--------|----------|
| Foundation SQL `eliteos_pricing_admin_foundation.sql` | Applied manually in some envs; **not** calculator authority | Seeds groups/rates/addons/policies |
| `pricingConfigResolver.js` | Admin preview only | File comment: do not wire without parity tests |
| `pricingAdminHeadApi.js` | CRUD + preview for finance/admin/executive + `pricing_admin` head | Does not change IE save math |
| `quotePricingAdminApi.js` | System-admin structures/rules/partners | Affects partner paths if rules change live |
| Cutover | Explicitly deferred | `docs` / pricing-authority-map guidance |

**Known discrepancy:** Stock Blanco $450 in calculator constants vs $495 in `quote_addon_catalog` seed.

---

## 4. Catalog / product capabilities

| Catalog | Capability today | Fit for customer configuration |
|---------|------------------|--------------------------------|
| Elite 100 colors ↔ groups | IE color picker via `materialColorsCatalog.js` + rules/fallback; slab catalog parallel | Usable as **source** for envelope options after freeze |
| Price groups Promo–F | Hardcoded Direct rates + Admin rates (unused) | Must freeze rate version into config calc |
| Cutout / sink add-ons | Calculator add-on codes | Partial — not a merchandising catalog |
| Pop-up cutout | Admin seed only | Not in IE add-on constants |
| Faucets / accessories | `productCatalogData.ts` display-only | Need priced, versioned option rows for DE.2 |
| Custom lines | First-class in IE with `customerFacing` | Envelope can allow estimator-authored optional lines |

---

## 5. Account / customer identity & specialty pricing

| Topic | Finding |
|-------|---------|
| Org ownership | `quote_headers.organization_id` (SaaS foundation) |
| Customer fields | Plain text `customer_name` / email / phone — **not** CRM FK |
| Account grouping | Optional `account_name` text (Quote Library) |
| Partner specialty pricing | `quote_partner_accounts` + assignments → structures/rules |
| ESF house / Internal | Direct constants; no per-account markup on internal_quote |
| Freeze of “pricing agreement” | Only via snapshot at save/publish — **no** `pricing_agreement_id` / version lock field |
| Override approval roles | **None modeled** — finance can edit Admin tables; no per-quote override approval workflow |

For DE.2 interactive config, account-specific specialty pricing must be **copied into the envelope / pricing freeze** at activation time, not resolved live from mutable partner tables.

---

## 6. Reproducibility gaps (must copy for future config calc)

To reproduce a historical customer configuration total after Admin/catalog/code changes, freeze at least:

1. **Baseline publication** customer snapshot + pricing evidence hashes (already DE.1)
2. **Normalized measurement basis** used for chargeable sf (or store chargeable totals per room/piece)
3. **Material group rates** actually used (Direct table version or explicit $/sf map)
4. **Add-on / option unit sell prices and cost bases** for every allowed option ID
5. **Tax percent and policy id/version**
6. **Edge/miter/vanity rate tables** if options can change those lines
7. **Markup / account adjustment** applied to options (if any)
8. **Rounding policy** (integer USD, nearest $10 row rules, etc.) — versioned
9. **Calculator engine version** string (separate from IE `quoteCalculator` commit drift)
10. **Envelope option set** (IDs, labels, constraints) — inactive catalog later must not remove historical options from frozen envelope
11. **Selection set** + calculation snapshot of outputs
12. **Audit of overrides** (who/why/when)

**Do not rely on:** live `quote_pricing_rules`, live Admin rates, live slab catalog, or “re-run same body through current `calculateQuote()`.”

---

## 7. Authority classification (future configuration fields)

| Field / concern | Class | Notes |
|-----------------|-------|-------|
| Takeoff geometry, room measurements, measured CT/BS sf | **A** Locked professional scope | Never customer-editable |
| Fabrication measurements, authoritative sink cutout count | **A** | Estimator/takeoff |
| Professional scope / room program assignments | **A** | |
| Elite 100 color (within offered set) | **B** Customer-selectable | Envelope-bound |
| Material price group (if multiple offered) | **B** | Must stay within offered groups |
| Eligible edge upgrades | **B** | |
| Standard vs eligible backsplash options | **B** | |
| Stock sinks / faucets / pop-ups / accessories | **B** | Only listed option IDs |
| Optional customer-facing upgrades | **B** | |
| Customer-facing custom lines (estimator-authored) | **B** or included | Quantity only if envelope allows |
| Allowed quantities | **B** with min/max | |
| Material cost basis, markup %, fabrication/labor | **C** Internal pricing input | Never public |
| Account-specific adjustment | **C** | Frozen at envelope activate |
| Bundled service/risk/handling (“hidden fees” = bundled into package price) | **C** → sold as **D** package | Not an after-the-fact surprise charge |
| Configuration subtotal / option delta / updated total | **D** Customer-visible calculated | Brain only |
| Pricing-valid-through | **D** | |
| Margin, rule IDs, cost breakdown, markup % | **E** Internal-only evidence | |
| Estimator price override on an option | **F** Override + audit | Approver TBD (open decision) |
| Client-supplied price, org id, account id, rule id, markup | **G** Prohibited | Fail closed |
| Arbitrary line prices from customer | **G** | |
| Mutating quote_headers / publication snapshot / takeoff | **G** | |

Legend: **A** Locked · **B** Selectable · **C** Internal pricing · **D** Visible result · **E** Internal evidence · **F** Audited override · **G** Prohibited

---

## 8. Recommended configuration pricing strategy

### Options evaluated

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| **A** | Strict adapter re-calling `calculateQuote()` | Reuses production engine | Re-feeds geometry; couples customer path to IE semantics; constant drift; hard to freeze Admin later |
| **B** | Brand-new full Elite 100 config calculator | Clean versioning | Risk of dual-truth vs IE baseline; large scope |
| **C** | **Hybrid:** frozen IE/`calculateQuote` baseline + versioned **delta engine** for authorized options | Preserves IE; matches DE.1 imprint model; clear freeze boundary | Must carefully define which lines are baseline vs delta |

### Recommendation: **C (Hybrid)**

**Why (repository evidence):**

1. IE Direct pricing is **constant-driven**, not Pricing Admin–driven — a customer recalc through live Admin would invent a new authority that production IE does not use.
2. DE.1 already treats the publication as an **immutable imprint**; interactive config should layer **immutable calculations**, not rewrite the imprint or `quote_headers`.
3. Customer must not supply measurements; calling full `calculateQuote()` invites accidental geometry/price injection surfaces.
4. Product catalogs (faucets, etc.) are **not** in `calculateQuote()` — configuration needs a priced option model that IE does not have yet.
5. Hybrid lets DE.2C ship deterministic fixtures for option deltas while leaving `calculateQuote()` untouched (hard DE.2A boundary).

**Baseline** = publication customer snapshot totals + locked scope.
**Delta** = sum of authorized option sell prices / replacements per envelope rules, with versioned rounding.
**Later (post-DE.2):** optional convergence of option rate tables with Pricing Admin after parity tests — not a DE.2B blocker.

---

## 9. Security & fail-closed (pricing-related)

Fail closed when:

- Missing pricing/catalog version on envelope
- Option outside envelope
- Stale publication (revoked/superseded/expired)
- Cross-org access
- Unknown material/group mapping for a selection
- Calculator/engine version mismatch vs envelope
- Invalid quantity / incompatible combination
- Missing locked measurement basis on baseline
- Ambiguous Elite 100 eligibility on source (publish gate already)
- Client-provided price, markup, org, account, or rule identity

---

## 10. Open decisions (pricing)

1. Who may approve **F**-class estimator overrides (finance role vs Studio pilot only)?
2. Should optional group changes reprice **all** material lines as a delta package or replace group on locked sf × frozen rate table?
3. Tax: keep **2% material use tax** inside baseline only, or recompute when material group changes?
4. Align Blanco/pop-up catalog prices before first customer-facing option set.
5. Whether CDT/$10 UI rounding becomes an explicit **server** rounding policy version for configuration totals.

---

## 11. References

- `backend-core/src/quotes/quoteCalculator.js`
- `backend-core/src/quotes/pricingConfigResolver.js`
- `backend-core/src/quotes/internalQuotesApi.js`
- `backend-core/src/quotes/quoteOutputGate.js`
- `backend-core/src/digitalEstimate/**`
- `backend-core/supabase/eliteos_pricing_admin_foundation.sql`
- `backend-core/supabase/eos_quote_platform.sql`
- `docs/digital-estimate/PHASE_DE_1_NOTES.md`, `PHASE_DE_1_1_NOTES.md`
