# Elite Stone QuickBooks Estimate Mapping

**Status:** Offline discovery v1 (read-only)  
**Source export:** QuickBooks Desktop full materialized export (`QB_EXPORT_DIR`), run `20260710-130918-512b1dca`  
**Scope:** Reverse-engineer how Elite Stone historically constructs QuickBooks Estimates so a future slabOS Quote Flow adapter can match accounting conventions.  
**Non-goals:** No live QuickBooks connection, no CData, no EstimateAdd/Mod, no Sales Dashboard production changes.

Machine-readable companions (gitignored): `debug/quickbooks/estimate-sales-truth-discovery/estimate-profile.json`, `estimate-line-profile.json`, `item-usage.json`, `reference-usage.json`, `slabos-qb-estimate-field-mapping.json`.

---

## 1. How to re-run discovery

```bash
QB_EXPORT_DIR=/path/to/quickbooks-full-materialized-YYYYMMDD \
  npm run qb:discover:estimate-sales-truth -- --out debug/quickbooks/estimate-sales-truth-discovery
```

Or:

```bash
QB_EXPORT_DIR=/path/to/export \
  node backend-core/src/scripts/discoverQuickBooksEstimateSalesTruth.mjs
```

---

## 2. Volume analyzed

| Entity | Count | Notes |
|--------|------:|-------|
| Estimates | 88,702 | TxnDate range 2011-01-03 → 2026-07-10 |
| Estimate lines | 926,393 | ~10.4 lines / estimate average |
| Customers/jobs | 36,555 unique ListIDs | ~31,644 job-like (`Sublevel > 0` / `ParentRef`) |
| Items | 469 | Mostly `ItemNonInventoryRet` + `ItemServiceRet` |
| Classes | 45 | Branch-like labels historically |
| Sales reps | 287 | |
| Terms | 17 | |

Estimate dollars (sum of `TotalAmount`): **~$416.0M** across the full history in this export.

---

## 3. Estimate header construction (observed)

### 3.1 Fields present on nearly all Estimates (≥95%)

`TxnID`, `TxnNumber`, `EditSequence`, `TimeCreated`, `TimeModified`, `RefNumber`, `TxnDate`, `CustomerRef`, `ClassRef`, `TemplateRef`, `TermsRef`, `DueDate`, `BillAddress` / `BillAddressBlock`, `IsActive`, `IsToBeEmailed`, `Subtotal`, `ItemSalesTaxRef`, `SalesTaxPercentage`, `SalesTaxTotal`, `TotalAmount`, `CustomerSalesTaxCodeRef`, `EstimateLineRet`, `DataExtRet`

### 3.2 Common optional fields

| Field | Approx. rate | Notes |
|-------|-------------:|-------|
| `SalesRepRef` | ~62% | Entry-time salesperson — not universal |
| `CustomerMsgRef` | high / common | Standard proposal message ListID |
| `PONumber` | ~10% | Optional customer PO |
| `ShipAddress` | ~0.06% | Rare |
| `Memo` | **0%** | Estimates themselves do **not** carry memos in this export |

### 3.3 Absent / not usable offline

- **`LinkedTxn`:** never present on Estimates in this export → no native QB graph to Sales Orders / Invoices offline.
- **Templates / CustomerMsg list entities:** referenced by ListID on txns, but **not exported** as folders.

### 3.4 Numbering (`RefNumber`)

| Format | Count | Era signal |
|--------|------:|------------|
| `YY-NNNN` | 63,415 | Dominant modern |
| `YY-NNNNN` | 18,138 | Overflow / later volume |
| `MM-DD-NNNN` legacy | 2,282 | Early history |
| other / numeric / missing | ~4,867 | Mixed leftovers |

**Downstream convention (critical):** Sales Orders and many Invoices set `Memo` to `Estimate {RefNumber}:` (exact structural pattern). Estimates themselves leave `Memo` empty.

### 3.5 Customer / job hierarchy

- Estimates always reference `CustomerRef.ListID`.
- Customer catalog is heavily job-structured (`ParentRef` / `Sublevel > 0` on ~86% of customer rows).
- Prefer **ListID** joins to Account Directory (`quickbooks_desktop` external link on the **root** customer). Job ListIDs are children.

### 3.6 Class (branch proxy)

- `ClassRef` is nearly universal.
- Historically FullNames look like branch labels (e.g. `ESF - {Branch}`).
- One class ListID dominates historically; newer branch classes appear in later years.
- **Future writeback:** map slabOS branch → QB Class **ListID**, never name matching alone.

### 3.7 Template

- `TemplateRef` nearly always set.
- A single template ListID accounts for the large majority (~76k); a second template is common (~12k).
- Template catalog was **not** exported → `MISSING_REFERENCE_DATA` for writeback defaults until a templates query exists.

### 3.8 Terms

- `TermsRef` nearly always set; several active term ListIDs appear (including deposit / scheduling-oriented terms historically).
- Terms catalog **is** exported (`terms/`).

### 3.9 Sales rep

- Present on ~62% of Estimates.
- Distinct from Account Directory account ownership and from customer `SalesRepRef`.
- Treat as **transaction-entered** attribution.

### 3.10 Tax

Nearly always populated:

- Header: `ItemSalesTaxRef`, `SalesTaxPercentage`, `SalesTaxTotal`, `CustomerSalesTaxCodeRef`
- Line: `SalesTaxCodeRef` on priced item lines

This is **QuickBooks sales tax**, not the slabOS Quote Flow **2% material use tax** model. Reconciling these is a business decision before writeback.

### 3.11 Custom fields (`DataExtRet`)

Observed DataExt names on Estimates:

| DataExtName | Approx. count |
|-------------|--------------:|
| `Project` | 86,331 |
| `County` | 75,843 |

These are the primary free-text project/geo fields historically stored on QB Estimates.

### 3.12 Active flag

- `IsActive=true` on ~88,544 Estimates; `false` on only ~158.
- Do **not** interpret `IsActive` as “accepted” or “sold.”

---

## 4. Estimate line construction (observed)

### 4.1 Line container

- Lines live in `EstimateLineRet` (array or single object).
- **No** `EstimateLineGroupRet` / `OREstimateLineRet` observed in this export.

### 4.2 Line kinds (full scan)

| Kind | Count | Meaning |
|------|------:|---------|
| `item` | 443,456 | Has `ItemRef` + priced fields |
| `description_only` | 276,442 | `Desc` present, no `Amount` / no item |
| `other` | 206,332 | Sparse / structural lines (often neither priced nor descriptive) |
| `amount_without_item` | 145 | Rare |
| markup fields | 1,012 lines | `MarkupRate` / `MarkupRatePercent` rare |

### 4.3 Quantity / rate / amount

When `Quantity`, `Rate`, and `Amount` are all present (~434.5k lines):

- **Quantity × Rate ≈ Amount** within $0.05 on **~100%** of those lines.

### 4.4 Typical line fields

| Field | Presence | Notes |
|-------|---------:|-------|
| `TxnLineID` | 100% | Stable line id |
| `Desc` | ~78% | Narrative (material/dims/notes) |
| `ItemRef` | ~48% | Catalog item ListID |
| `Quantity` / `Rate` / `Amount` | ~47–48% | Priced rows |
| `ClassRef` | ~48% | Usually mirrors header class |
| `SalesTaxCodeRef` | ~48% | On priced rows |

### 4.5 Description conventions

- Description-only lines are a first-class construction pattern (not noise).
- Priced lines often carry material/dimension text in `Desc` while `ItemRef` points at a coarse catalog item (e.g. material family / service).
- Future slabOS→QB mapping should preserve **both** priced Item lines and descriptive spacer/note lines.

### 4.6 Item usage

- Join via `ItemRef.ListID` to `items/` (469 catalog rows).
- Item FullNames are intentionally omitted from discovery artifacts; use ListIDs.

---

## 5. Historical format changes (high level)

1. **Early RefNumbers** sometimes `MM-DD-NNNN`; later almost entirely `YY-NNNN` / `YY-NNNNN`.
2. **Sales Orders appear from 2019-02 onward** in this export — Estimate→SO→Invoice becomes the converted path after SO adoption; earlier periods may invoice differently.
3. **Class ListIDs** diversify in later years as additional branch classes are added.
4. **DataExt Project/County** are long-running conventions, not recent inventions.

---

## 6. slabOS Quote Flow ↔ QuickBooks Estimate field mapping

Canonical slabOS objects: Studio `studio_estimates` + Digital Estimate publication/acceptance (Quote Flow does not own a separate schema).

| slabOS | QuickBooks Estimate | Classification |
|--------|---------------------|----------------|
| Account Directory `quickbooks_desktop` ListID | `CustomerRef.ListID` | `CONFIRMED_FROM_QB_DATA` |
| `scope.projectName` / DE project name | `DataExtRet[Project]` | `STRONGLY_SUPPORTED_BY_QB_DATA` |
| Branch (missing on Studio; legacy `quote_headers.branch`) | `ClassRef.ListID` | `NEEDS_BUSINESS_DECISION` |
| Salesperson (`createdByUserId` / weak labels) | `SalesRepRef.ListID` | `NEEDS_BUSINESS_DECISION` |
| Quote number `SE-{shortId}` | `RefNumber` (`YY-NNNN`) | `NEEDS_BUSINESS_DECISION` |
| `customerDisplayTotal` / DE `estimatedProjectTotal` | `Subtotal` / `TotalAmount` (+ tax fields) | `PROPOSED_FROM_SLABOS` |
| 2% material use tax | `ItemSalesTaxRef` / line `SalesTaxCodeRef` | `NEEDS_BUSINESS_DECISION` |
| DE disclosure `terms_version` | `TermsRef.ListID` | `NEEDS_BUSINESS_DECISION` |
| (none) | `TemplateRef.ListID` | `MISSING_REFERENCE_DATA` |
| (none) | `PONumber` | `INFERRED_FROM_QB_DATA` (rare) |
| Rooms / pieces / addOns / custom lines | `EstimateLineRet[]` | `INFERRED_FROM_QB_DATA` |
| Line qty / unit / total | `Quantity` / `Rate` / `Amount` | `CONFIRMED_FROM_QB_DATA` |
| Acceptance / Mark Sold | *(no Estimate field)* | `PROPOSED_FROM_SLABOS` / see financial truth doc |

Full machine-readable mapping: `slabos-qb-estimate-field-mapping.json`.

---

## 7. Future write contract (types only — not implemented)

Package: `backend-core/src/quickbooks/estimateSalesTruth/contracts.js`

- `buildQuickBooksEstimatePreview(slabosQuote)` — **throws** (future only)
- `validateQuickBooksEstimatePreview(preview)` — **throws** (future only)
- `QuickBooksEstimateWriteContract` — typedef only; `transport: 'UNIMPLEMENTED_DISCOVERY_ONLY'`

**Forbidden in this package:** `EstimateAdd`, `EstimateMod`, `InvoiceAdd`, `SalesOrderAdd`, `ReceivePaymentAdd`, CData write transport, QBXMLRP2 write transport.

---

## 8. Writeback prerequisites (not started)

1. Account Directory ↔ QB customer/job ListID link  
2. Item ListID map for commercial line categories  
3. Class ListID map for branch  
4. SalesRep ListID map (if required)  
5. Default Terms / Template / CustomerMsg ListIDs  
6. Tax policy reconciliation  
7. RefNumber policy (`SE-*` vs Elite Stone `YY-NNNN`)  
8. Future read-only query for Templates + LinkedTxn confirmation  

See also: [`ELITE_STONE_SALES_FINANCIAL_TRUTH.md`](./ELITE_STONE_SALES_FINANCIAL_TRUTH.md).
