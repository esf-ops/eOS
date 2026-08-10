# Elite Stone Sales Financial Truth

**Status:** Offline discovery v1 (read-only)  
**Source export:** QuickBooks Desktop full materialized export (`QB_EXPORT_DIR`), run `20260710-130918-512b1dca`  
**Scope:** Derive evidence-backed definitions for Quoted / Accepted / Booked-Sold / Invoiced / Collected / Open AR from historical Elite Stone QuickBooks data.  
**Non-goals:** No live QuickBooks/CData connection, no transaction writes, **no Sales Dashboard production behavior changes**.

Machine-readable companions (gitignored): `debug/quickbooks/estimate-sales-truth-discovery/transaction-flow-summary.json`, `transaction-link-analysis.json`, `amount-variance-analysis.json`, `sales-attribution-analysis.json`, `sales-financial-truth-proposal.json`.

---

## 1. Principle: financial truth vs operational truth

| Domain | Source of truth | Examples |
|--------|-----------------|----------|
| **Financial** | QuickBooks Desktop (this discovery) | Quote $, booking $, invoice $, cash, AR |
| **Operational** | Moraware + slabOS lifecycle | Production status, scheduled install, sqft, Mark Sold checklist |

Do **not** replace Moraware operational metrics with QB amounts.  
Do **not** silently equate slabOS Digital Estimate acceptance / Mark Sold with a QB transaction type until finance confirms the mapping.

Sales Dashboard today remains Moraware/sqft-oriented; this document is a foundation for a future financial layer.

---

## 2. Entity totals in the export

| Stage | Count | Amount sum | Notes |
|-------|------:|-----------:|-------|
| Estimates | 88,702 | ~$416.0M | `TotalAmount` |
| Sales Orders | 31,127 | ~$100.0M | From 2019-02 onward in this export; **94.2%** `IsFullyInvoiced=true` |
| Invoices | 45,900 | ~$128.2M | Derived as `Subtotal + SalesTaxTotal` (`TotalAmount` omitted in this export) |
| Payments | 22,908 | ~$124.8M | `ReceivePayment.TotalAmount` |
| Open AR | 985 invoices with balance &gt; 0 | ~$2.91M | Sum of `BalanceRemaining` |

---

## 3. Link confidence: CONFIRMED vs INFERRED

### 3.1 CONFIRMED_LINK

**Count: 0** in this export.

- No `LinkedTxn` on Estimates / Sales Orders / Invoices  
- No `AppliedToTxnRet` on Payments  

Native QuickBooks transaction graph links are **not available offline** from this materialized extract.

### 3.2 INFERRED_LINK (documented rule)

**Rule:**

> Downstream `Memo` matches `/Estimate\s+(\d{1,2}-\d{2,6})\b/` and that token uniquely equals an `Estimate.RefNumber` in the export.

| Relationship | Inferred volume | Rate |
|--------------|----------------:|-----:|
| Sales Order → Estimate | 29,577 of 31,127 SOs | ~95.0% |
| Invoice → Estimate | 29,902 of 45,900 invoices | ~65.1% |
| Estimates with inferred SO | 29,089 | ~32.8% |
| Estimates with inferred Invoice | 28,358 | ~32.0% |
| Estimates with **no** inferred downstream | 59,612 | ~67.2% |
| Invoices with **no** estimate memo link | 15,998 | ~34.9% |

This inference is strong operationally (nearly all SO memos are exactly `Estimate {RefNumber}:`) but is still labeled **INFERRED_LINK**, not confirmed QB linkage.

---

## 4. Dominant historical transaction paths

Absolute counts (inferred):

| Path | Count | Interpretation |
|------|------:|----------------|
| Estimate with **no** inferred SO/Invoice | 59,612 | Quoting volume ≫ conversion |
| **Estimate → Sales Order → Invoice** | 28,357 | Dominant **converted** path |
| Invoice without estimate memo | 15,998 | Standalone / other / pre-memo convention |
| Estimate → SO (no Invoice yet) | 732 | Open bookings |
| Estimate → Invoice (no SO) | **1** | Extremely rare in memo-linked set |

**Verdict for converted work after Sales Order adoption (~2019+):**  
Elite Stone’s converted financial path is overwhelmingly **Estimate → Sales Order → Invoice**, with Payments collecting against AR. Estimate → Invoice skipping SO is not a meaningful historical pattern in the memo-linked population.

**Caveats:**

- Absolute majority of Estimates never convert (pipeline / lost / superseded quotes).  
- ~35% of Invoices lack the estimate memo convention — do not assume every invoice traces to an Estimate via this export alone.  
- Payment → Invoice allocation cannot be confirmed offline.

---

## 5. Timing and dollar variance (inferred pairs)

| Transition | Pairs | Mean latency | Unchanged $ | Mean Δ | Mean \|Δ\| |
|------------|------:|-------------:|------------:|-------:|----------:|
| Estimate → Sales Order | 29,577 | ~20 days | 24,091 | −$67 | ~$180 (~3.3%) |
| Estimate → Invoice | 29,902 | ~44 days | 22,743 | −$664 | ~$749 (~6.8%) |
| Sales Order → Invoice (shared Estimate, exactly one SO) | 29,131 | ~24 days | 26,592 | −$542 | ~$544 (~3.9%) |

Most converted Estimate→SO pairs keep dollars flat; larger downward drift appears by Invoice (progress / change orders / partials possible — needs business interpretation).

---

## 6. Proposed Sales Dashboard financial metrics

| Metric | Proposed source | Confidence | Financial? | Operational? |
|--------|-----------------|------------|:----------:|:------------:|
| **Quoted $** | QB Estimate `TotalAmount` (period rules TBD); parallel slabOS Quote Flow for pre-QB quotes | `STRONGLY_SUPPORTED_BY_QB_DATA` | Yes | No |
| **Accepted $** | slabOS Digital Estimate acceptance `customer_display_total` | `PROPOSED` | No | Yes |
| **Booked / Sold $** | **Candidate: QB Sales Order `TotalAmount`** | `NEEDS_BUSINESS_DECISION` | Yes | No |
| **Invoiced $** | QB Invoice total (`Subtotal + SalesTaxTotal` in this export) | `CONFIRMED_FROM_QB_DATA` | Yes | No |
| **Collected $** | QB Payment `TotalAmount` | `STRONGLY_SUPPORTED_BY_QB_DATA` | Yes | No |
| **Open AR** | QB Invoice `BalanceRemaining` (&gt; 0) | `CONFIRMED_FROM_QB_DATA` | Yes | No |

### 6.1 Strongest candidate for Booked / Sold $

**QuickBooks Sales Order `TotalAmount`**, confidence **`NEEDS_BUSINESS_DECISION`**.

Why this is the strongest *evidence-backed* candidate:

1. Large historical volume (31k SOs, ~$100M).  
2. ~95% inferentially linked to Estimates via the memo convention.  
3. ~94% `IsFullyInvoiced=true` — SO is a real pre-invoice booking stage, not a seldom-used form.  
4. Converted path Estimate→SO→Invoice dominates among estimates that convert.  
5. Estimate→Invoice without SO is essentially nonexistent in memo-linked data.

Why it is **not** declared confirmed “Sold”:

- Finance must confirm SO creation is the official sold event.  
- Invoice-without-SO / invoice-without-memo paths still need a reporting policy.  
- slabOS Mark Sold is an operational checklist and must stay distinct until reconciled.  
- No native `LinkedTxn` confirmation in this export.

**Weaker alternatives:**

| Candidate | Why weaker |
|-----------|------------|
| Invoice as Sold | Billing truth ≠ booking truth; timing differs; many invoices lack estimate linkage |
| Estimate flag / `IsActive` | No sold flag; `IsActive=false` is rare and not “sold” |

### 6.2 Accepted $

Keep in **slabOS** (Digital Estimate acceptance). QuickBooks Estimates have no acceptance field. Do not overload `IsActive`.

### 6.3 Collected $ vs Open AR

- **Collected $** can be summed from payments now.  
- **Invoice-level collection allocation** requires future `AppliedToTxnRet` / linked payment detail.  
- **Open AR** is already trustworthy from `BalanceRemaining` (and aligns with existing QuickBooks Intelligence AR aging).

---

## 7. Sales attribution

| Signal | Observation | Use |
|--------|-------------|-----|
| Txn `SalesRepRef` | Estimates ~62%, SOs ~68%, Invoices ~52% | Transaction-entered salesperson |
| Customer `SalesRepRef` | Present on many customer/job rows | Account ownership-like — **not identical** to txn rep |
| `ClassRef` | Nearly universal; branch-like | Branch / location proxy via ListID |
| Account Directory | Existing `quickbooks_desktop` ListID link | Anchor customer identity; **do not alter mappings in this task** |

Recommendation: report financial attribution primarily from **transaction SalesRepRef + ClassRef ListIDs**, and separately compare to Account Directory ownership for conflict analytics later.

---

## 8. Unresolved business decisions

1. Does **Sales Order creation** equal **Booked / Sold $** for Elite Stone finance?  
2. How should **Invoice-without-SO** (and invoices without estimate memo) count in Sold vs Invoiced?  
3. Should **Quoted $** include all Estimates or only active / period-created / non-superseded?  
4. How to handle **revised / replaced** Estimates (duplicate RefNumbers are rare but non-zero)?  
5. **RefNumber** policy for future slabOS→QB Estimate writeback (`SE-*` vs `YY-NNNN`).  
6. **Tax** reconciliation: QB sales tax vs slabOS 2% material use tax.  
7. **Salesperson of record**: txn SalesRep vs AD owner vs slabOS `createdBy`.  
8. Period filters for funnel metrics (TxnDate vs TimeCreated vs paid date).

---

## 9. What future read-only CData / SDK queries must add

These cannot be answered faithfully from the July 10, 2026 materialized export alone:

1. **`IncludeLinkedTxns`** on Estimate / Sales Order / Invoice queries → promote INFERRED memo links to **CONFIRMED_LINK** where QB stores them.  
2. **ReceivePayment `AppliedToTxnRet`** → invoice-level Collected $ and cash application.  
3. **Templates**, **CustomerMsg**, **PaymentMethod**, and dedicated **SalesTaxCode** list queries.  
4. Confirm whether Invoice `TotalAmount` is omitted only by this extract path or by company-file query options (discovery currently derives `Subtotal + SalesTaxTotal`).  
5. Any Estimate “fully invoiced” / closed-state fields available in the live company file version.

**Phase 2 live read:** see [`ELITE_STONE_QUICKBOOKS_LIVE_READ.md`](./ELITE_STONE_QUICKBOOKS_LIVE_READ.md). Raw CData Gateway HTTP+QBXML POST was **not** validated on the production VM (HTTP 200 empty body). Prefer the Desktop SDK COM smoke `quickbooks-sdk-connector/live-sdk-linked-smoke.ps1` for live linked-txn validation (still read-only; **no Sales Dashboard changes**).

---

## 10. Architecture boundaries (preserved)

Reuse — do not fork:

- `quickbooks-sdk-connector/` extract → materialized JSON  
- `backend-core/src/quickbooks/*` export reader, staging, intelligence facts  
- Account Directory `quickbooks_desktop` ListID linking  
- Quote Flow / Digital Estimate for Accepted $ operational truth  
- Existing QuickBooks Intelligence for AR-oriented analytics  

New discovery code lives under:

- `backend-core/src/quickbooks/estimateSalesTruth/`  
- `backend-core/src/scripts/discoverQuickBooksEstimateSalesTruth.mjs`  

Outputs under gitignored `debug/quickbooks/estimate-sales-truth-discovery/`.

Future write contracts exist as **types/stubs only** (`contracts.js`) and throw if called.

---

## 11. Related docs

- [`ELITE_STONE_QUICKBOOKS_ESTIMATE_MAPPING.md`](./ELITE_STONE_QUICKBOOKS_ESTIMATE_MAPPING.md) — Estimate construction + slabOS field mapping  
- `docs/eliteos/QUICKBOOKS_INGESTION_PLAN.md` — ingestion phases  
- `docs/eliteos/FEATURE_DECISIONS.md` §186 — acceptance ≠ sold (slabOS lifecycle)
