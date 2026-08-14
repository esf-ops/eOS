# QuickBooks Finance Backfill Readiness — Full Finance Foundation

**Status:** PHASE 1 FOUNDATION IMPLEMENTED (2026-08-14) — **NOT READY** for 2025 historical backfill.  
**Verdict:** **NOT READY** until small-window DryRun + live ingest + opening capture + reconciliation storage are ops-proven.  
**Scope:** Live-proven CData Desktop entities + repo foundation (schema, isolated workers, ingest, checkpoints).  
**Non-goals this pass:** No SQL apply, no ODBC/QB access from this coding session, no 2025 backfill, no QB writes, no Finance UI, no commit/deploy required by the coding agent.

---

## 1. Executive verdict

**NOT READY FOR 2025 HISTORICAL BACKFILL.**

Phase 1 **code/schema** now exists. The expensive 2025-01-01 → current pull must wait until the go-live checklist in §11 is ops-complete (small DryRuns, idempotent live ingest, lock, P&L/BS snapshot compare, opening 2024-12-31 capture, checkpoint resume).

---

## 2. Documentation sources (authoritative)

### CData ODBC Driver for QuickBooks (relational schema we query)

| Resource | URL |
|----------|-----|
| Overview | https://cdn.cdata.com/help/RQJ/odbc/ |
| Tables index | https://cdn.cdata.com/help/RQJ/odbc/pg_alltables.htm |
| Views index | https://cdn.cdata.com/help/RQJ/odbc/pg_allviews.htm |
| System tables | https://cdn.cdata.com/help/RQJ/odbc/pg_allsystables.htm |
| Connection | https://cdn.cdata.com/help/RQJ/odbc/Connection.htm |

**Documentation build noted:** **Build 23.0.8839** (footer on CData pages, © 2024).

**Installed driver on QB Server:** **LIVE VERIFICATION REQUIRED** — not recorded as a pinned build in-repo. Repo does record DSN ops facts:

- System DSN `slabOS_QuickBooks_Local_RO`
- `ConnectDirectly=True`, `Readonly=True`
- `QBXMLVersion=16.0` (`docs/quickbooks/ELITE_STONE_QUICKBOOKS_LIVE_READ.md`)

Do **not** assume installed build ≡ docs 23.0.8839. Later probes should use ODBC `GetSchema` / CData `sys_tables` / `sys_tablecolumns`.

### Intuit QuickBooks Desktop (accounting semantics)

| Resource | URL |
|----------|-----|
| QB Desktop API reference | https://developer.intuit.com/app/developer/qbdesktop/docs/api-reference/qbdesktop |
| Develop | https://developer.intuit.com/app/developer/qbdesktop/docs/develop |
| Exploring the SDK | https://developer.intuit.com/app/developer/qbdesktop/docs/develop/exploring-the-quickbooks-desktop-sdk |
| Additional reference | https://developer.intuit.com/app/developer/qbdesktop/docs/additional-reference |
| GeneralDetailReportQuery | https://developer.intuit.com/app/developer/qbdesktop/docs/api-reference/qbdesktop/generaldetailreportquery |
| GeneralSummaryReportQuery | https://developer.intuit.com/app/developer/qbdesktop/docs/api-reference/qbdesktop/generalsummaryreportquery |
| TransactionQuery | https://developer.intuit.com/app/developer/qbdesktop/docs/api-reference/qbdesktop/transactionquery |
| TxnDeletedQuery | https://developer.intuit.com/app/developer/qbdesktop/docs/api-reference/qbdesktop/txndeletedquery |

**Rule:** CData = ODBC table/view/column truth for workers. Intuit = meaning (accrual vs cash, linking, deletion limits, reports). Do not use QuickBooks Online docs as Desktop authority.

---

## 2b. Live discovery (completed 2026-08-14)

Installed driver still not pinned as a build number in-repo; entities below were **live-proven** on Elite’s QB Server CData Desktop DSN.

### Live-proven sources

| Domain | Entities |
|--------|----------|
| Sales/AR (already production) | Estimates, SalesOrders, Invoices, ReceivePayments, current Open A/R, CustomerId/ListID, Invoice DueDate/Terms |
| Additional revenue/AR | ReceivePaymentsAppliedTo, CreditMemos, SalesReceipts, InvoiceLinkedTransactions, CreditMemoLinkedTransactions |
| AP | Vendors, Bills, BillPaymentChecks, BillPaymentChecksAppliedTo, BillPaymentCreditCards, BillPaymentCreditCardsAppliedTo, VendorCredits |
| Cash | Deposits, DepositLineItems, Checks, Transfers, ReceivePaymentToDeposit |
| Accounting / master | Accounts, JournalEntries, JournalEntryLines, Transactions, ProfitAndLossStandard, BalanceSheetStandard, BalanceSheetDetail, ProfitAndLossDetail, DeletedTransactions, DeletedEntities |

CreditCardCharges/Credits exist but returned **no sample rows**.

### Critical live field proofs

- **Bills:** ID, ReferenceNumber, Date, DueDate, Terms, TermsId, VendorName, VendorId, Amount, OpenAmount, IsPaid, AccountsPayable/Id, Memo, TimeCreated, TimeModified.
- **Bill payment AppliedTo:** AppliedToRefId, AppliedToAmount, AppliedToBalanceRemaining, AppliedToReferenceNumber, AppliedToTxnDate/Type.
- **DepositLineItems:** DepositId, TotalDeposit, ItemAmount, ItemTxnType, ItemRefId. Recent 2026 deposits: `ItemTxnType='ReceivePayment'` and `ItemRefId` = ReceivePayment TxnID.
- **Transfers:** from/to account ListID + name, Amount, TimeCreated, TimeModified.
- **Accounts:** ID, Name, FullName, Type, SpecialType, Number, Balance, AccountBalance, ParentId/Name, hierarchy, cash-flow classification, active, TimeModified.
- **JournalEntryLines:** JournalEntryID, LineId, LineType, LineAccount/Id, LineAmount, entity, memo, class, TimeModified.
- **Transactions:** ID, TxnLineId, Type, Date, Entity/Id, AccountName/Id, ReferenceNumber, Amount, AmountInHomeCurrency, Memo, TimeModified.

### Architecture proofs from live data

1. **Transactions is NOT a full double-entry ledger.** A date-bounded Bill query returned one summarized Bill row per transaction, blank TxnLineId, AccountName=Accounts Payable and the Bill amount. Store as `qb_finance_transaction_index` only.
2. **P&L:** `ProfitAndLossStandard` returned Accrual P&L for 2026-08-01 through 2026-08-14.
3. **Balance Sheet:** `BalanceSheetStandard` Accrual as-of 2026-08-14; Total Assets = Total Liabilities & Equity = **$9,987,679.41**.
4. Installed `BalanceSheetStandard` does **NOT** accept `ReturnRows`.
5. Opening state for 2025 history: capture Accrual BS **as-of 2024-12-31** (not current `Accounts.Balance`).

### Phase 1 implementation map

| Piece | Location |
|-------|----------|
| SQL | `backend-core/supabase/eliteos_qb_finance_foundation_v1.sql` (manual apply) |
| Ingest | `POST /api/internal/finance/quickbooks-sync` |
| Worker | `quickbooks-sdk-connector/finance-sync/sync-finance.ps1` domains master/revenue_ar/ap/cash/accounting |
| Decision | `FEATURE_DECISIONS.md` §316 |

---

## 3. What exists today in eliteOS / slabOS

### Production-supported Sales Financial Truth lane

```
QuickBooks Desktop
  → CData ODBC DSN slabOS_QuickBooks_Local_RO (SELECT-only)
  → sync-sales-financials.ps1 (worker v1.2.0 after Slice B)
  → POST /api/internal/sales/quickbooks-sync
  → Supabase prepared facts
  → Sales Dashboard Financial Truth + Account Directory Financials
```

| Capability | Status |
|------------|--------|
| Estimates / SalesOrders / Invoices / ReceivePayments (header amounts) | **EXISTING / PROVEN** |
| Open A/R = unpaid invoices (`IsPaid = false`, positive Balance) | **EXISTING / PROVEN** (current snapshot) |
| `CustomerId` → `qb_customer_list_id` | **EXISTING / PROVEN** |
| Root resolution via `ad_qb_customer_facts` ParentId | **EXISTING / PROVEN** |
| Invoice `DueDate` / `Terms` / `TermsId` on txn + open A/R | **EXISTING / PROVEN** (Slice B code; SQL v3 may still be unapplied in some envs) |
| True DueDate aging + collection attention (AD Financials) | **EXISTING / PROVEN** (Slice B) |
| Exact `quickbooks_desktop` external link join (no name/fuzzy) | **EXISTING / PROVEN** |
| 60-day incremental + month-window `-Backfill` | **EXISTING / PROVEN** |
| Non-overlap lock / ops wrappers | **EXISTING / PROVEN** |
| Planned historical start `2025-01-01` (Sales lane) | **DOCUMENTED INTENT** |

SQL artifacts:

- `eliteos_sales_quickbooks_financial_truth_v1.sql`
- `eliteos_sales_quickbooks_financial_truth_listid_v2.sql`
- `eliteos_sales_quickbooks_financial_truth_aging_v3.sql`
- `eliteos_account_directory_qb_customer_enrichment_v1.sql`

### Related but separate lanes (do not confuse with Finance Command Center)

| Lane | Role |
|------|------|
| Account Directory QB customer enrichment | Customer/job ListID facts + link suggestions |
| Offline QBXML export → `brain_quickbooks_*` intelligence | File/staging intelligence; not ODBC Sales Truth |
| Gateway HTTP live-read probe | Experimental; **not** production transport |
| Desktop SDK connector (C#) | Estimate/export tooling; not finance prepared facts |

### Explicit gaps vs a Finance Command Center

Missing before a complete backfill contract:

- Payment applications (`ReceivePaymentsAppliedTo`)
- Credit memos / sales receipts / refunds (population TBD live)
- Entire A/P domain
- Cash/banking domain with deposit vs payment grain
- Chart of Accounts / vendors / class / terms masters as finance tables
- Ledger/P&L/BS durable facts + reconciliation
- Opening BS/cash as-of 2025-01-01
- TimeModified-based change detection (beyond Date lookback)
- Domain checkpoints independent of Sales worker

**Do not expand `sales_quickbooks_financial_transactions` into the whole GL.**

---

## 4. Domain map (target finance foundation)

### 4.1 Revenue / customer financials

| Dataset | Class | CData source | Before backfill? | Notes |
|---------|-------|--------------|------------------|-------|
| Estimates | Historical | `Estimates` | YES (exists) | Sales Truth |
| Sales Orders | Historical | `SalesOrders` | YES (exists) | Not “Sold $” |
| Invoices | Historical | `Invoices` | YES (exists) | Add richer attrs over time (Class, SalesRep, AR account, TimeModified, Memo, PO) |
| Invoice line items | Historical | `InvoiceLineItems` | **DEFER** unless product/margin GL needed | Can re-pull later if headers+applications exist; lines are large |
| ReceivePayments | Historical | `ReceivePayments` | YES (exists) | Operational receipt event |
| **ReceivePaymentsAppliedTo** | Historical | `ReceivePaymentsAppliedTo` | **YES — BLOCKER** | Docs: payment→invoice/JE applications; server filters Date/TimeModified/CustomerId/… |
| CreditMemos | Historical | `CreditMemos` | **YES** | Affects A/R settlement |
| CreditMemo linked/applied | Hybrid | `CreditMemoLinkedTransactions` / applied fields | YES if Elite uses credits | Live population check |
| SalesReceipts | Historical | `SalesReceipts` | **YES if used** | Cash-sale path; live check |
| CreditCardRefunds | Historical | `CreditCardRefunds` | LIVE VERIFY / likely YES if used | AR refunds |
| StatementCharges | Historical | `StatementCharges` | LIVE VERIFY | Often unused |
| Invoice/Estimate/SO linked txns | Hybrid | `*LinkedTransactions` views | Useful, not always primary | Prefer AppliedTo for payment settlement |

**Payment applications are required before historical backfill** if eliteOS wants DSO-like metrics, invoice paid date, on-time %, customer payment behavior, and historical settlement without a second full payment pull.

CData `ReceivePaymentsAppliedTo` key columns (docs):  
`ReceivePaymentId`, `AppliedToRefId`, `AppliedToPaymentAmount`, `AppliedToAmount`, `AppliedToTxnType`, `AppliedToTxnDate`, `AppliedToReferenceNumber`, `CustomerId`, `Date`, `TimeModified`, composite `ID` = `ReceivePaymentId|AppliedToRefId`.

### 4.2 Accounts Receivable

| Dataset | Class | Source | Before backfill? |
|---------|-------|--------|------------------|
| Open A/R snapshot | Snapshot | `Invoices` unpaid (`IsPaid=false`, Balance>0) + DueDate/Terms | YES (exists) |
| Invoice history | Historical | `Invoices` | YES (exists) |
| Payment applications | Historical | `ReceivePaymentsAppliedTo` | **YES — BLOCKER** |
| Credits | Historical | `CreditMemos` (+ links) | YES |
| Periodic A/R snapshots | Snapshot time-series | Derived nightly/month-end from open A/R | **GOING FORWARD** — cannot invent past month-ends never captured |

**Historical point-in-time A/R:** Reconstructing arbitrary past A/R from invoices + credits + applications is *possible in theory* but fragile (voids, discounts, JE A/R, undeposited funds, deletes). Recommendation:

- Backfill **transaction history + applications** from 2025-01-01
- **Start persisting periodic A/R snapshots** (e.g. daily or month-end) after finance launch
- Do **not** claim reconstructed month-end A/R equals QuickBooks historical Open Invoices without reconciliation samples

### 4.3 Accounts Payable

| Dataset | Class | CData source | Before backfill? |
|---------|-------|--------------|------------------|
| Vendors | Master | `Vendors` | YES |
| VendorTypes | Master | `VendorTypes` | Optional |
| Bills | Historical | `Bills` | **YES — BLOCKER** |
| Bill expense/line items | Historical | `BillExpenseItems` / `BillLineItems` | DEFER for v1 totals; YES if expense detail/GL drilldown |
| VendorCredits | Historical | `VendorCredits` | YES |
| BillPaymentChecks | Historical | `BillPaymentChecks` | YES |
| **BillPaymentChecksAppliedTo** | Historical | `BillPaymentChecksAppliedTo` | **YES — BLOCKER** |
| BillPaymentCreditCards + AppliedTo | Historical | corresponding tables | YES if used |
| Open A/P snapshot | Snapshot | `Bills` where `IsPaid = false` (docs expose `IsPaid`, `OpenAmount`, `DueDate`, `Terms`) | **YES — LIVE VERIFY** |

Open A/P authoritative candidate: mirror Sales Open A/R pattern — unpaid Bills with positive open balance. Confirm Elite field population live (`OpenAmount` vs computed).

### 4.4 Cash / banking

| Dataset | Class | Source | Before backfill? |
|---------|-------|--------|------------------|
| Accounts (bank/CC/UF) | Master + current balances | `Accounts` (`Type`, `Balance`, `AccountBalance`, `CashFlowClassification`) | YES |
| ReceivePayments | Historical | (already) | YES — **receipt event**, not always bank posting |
| ReceivePaymentToDeposit | Snapshot/queue | View: payments ready to deposit | Useful current; **no server-side filters** (client-side) |
| Deposits + DepositLineItems | Historical | `Deposits` / `DepositLineItems` | **YES — BLOCKER** for bank cash-in |
| Checks (+ lines/expenses) | Historical | `Checks`… | YES |
| Transfers | Historical | `Transfers` (QBXML ≥ 12) | YES |
| Bill payments (cash out) | Historical | BillPayment* | YES |
| CreditCardCharges/Credits | Historical | tables | YES if used |
| SalesReceipts | Historical | if used | YES |

**Anti-double-count (critical):**

| Event | Grain | Do **not** sum as “cash in” with… |
|-------|-------|-----------------------------------|
| `ReceivePayment` to Undeposited Funds | Customer receipt / AR relief | Later `Deposit` of same dollars |
| `Deposit` to Bank | Bank cash posting | Underlying ReceivePayment amounts again |
| `SalesReceipt` deposited immediately | May post differently | Depends on DepositToAccount |

**Model recommendation:** store both layers with explicit `cash_event_role`:

- `customer_receipt` (ReceivePayment / SalesReceipt)
- `bank_deposit` (Deposit lines referencing payment TxnIDs)
- `bank_disbursement` (Checks / BillPaymentChecks / CC charges)
- `transfer` (Transfers)

Cash KPIs choose one grain; never sum receipt + deposit indiscriminately. Use `ReceivePaymentToDeposit` + DepositLineItems to link undeposited → deposited.

### 4.5 General Ledger / P&L / Balance Sheet

| Approach | Role | Recommendation |
|----------|------|----------------|
| **CData `Transactions` view** | Candidate raw posting-ish facts (ID, TxnLineId, Type, Date, EntityId, AccountId, Amount, TimeModified; `PostingStatus`, `DetailLevel` pseudos) | **Primary candidate for durable drilldown** — LIVE VERIFY grain (debit/credit? signed amount?) and completeness |
| Form tables (Invoice, Bill, Check, …) | Operational + settlement | Keep for AR/AP/cash behavior; **do not** also sum into P&L as a second expense/revenue path |
| `JournalEntries` / `JournalEntryLines` | Explicit journals only | Necessary but **not** entire GL |
| `ProfitAndLossStandard` / Detail | Report views with `ReportPeriod`, **`ReportBasis` (Cash/Accrual)** | **Reconciliation control**, not sole historical fact store |
| `BalanceSheetStandard` / Detail / Summary | Report views; `ReportAsOf`, `ReportBasis` | **Opening BS + reconciliation** |
| Intuit GeneralDetailReportQuery | Semantic/report options (GeneralLedger, OpenInvoices, UnpaidBillsDetail, …) | Guides reconciliation; ODBC may expose via CData report views |

**Recommended architecture:**

1. **Raw truth:** normalized ledger-ish rows from `Transactions` (posting only) **or** proven GL detail report — decide after live probe proves columns/grain.  
2. **Operational truth:** Sales/AP/Cash form tables + applications (already planned).  
3. **Controls:** P&L / BS / Open Invoices / Unpaid Bills report pulls after each sync.  
4. **Never** compute “GAAP revenue” from Sales Dashboard invoice totals alone without stating **accrual** basis.

**Accrual vs cash (v1):**

- **Canonical operating finance:** **Accrual** (`ReportBasis=Accrual`) for P&L/BS command center.
- **Alternate view:** Cash-basis reports for cash management — separate labeled metrics.
- Do not mix bases in one KPI card.

### 4.6 Master / dimensions

| Dataset | Class | Source | Before backfill? |
|---------|-------|--------|------------------|
| Accounts | Master | `Accounts` | YES |
| Customers/Jobs | Master | Already via AD enrichment + Sales CustomerId | YES (exists) |
| Vendors | Master | `Vendors` | YES |
| Class | Master | `Class` | YES if Elite uses classes |
| SalesReps | Master | `SalesReps` | YES if used |
| StandardTerms / DateDrivenTerms | Master | tables | YES |
| PaymentMethods | Master | `PaymentMethods` | YES |
| CompanyInfo / Preferences | Master | views | YES (config/audit) |
| Items | Master | `Items` | DEFER unless inventory/COGS detail needed |

Vendor ListIDs must **not** be conflated with Account Directory customer identity.

### 4.7 Deletion / modification

| Mechanism | Limit | Implication |
|-----------|-------|-------------|
| `DeletedTransactions` view | TxnID, TxnDelType, TimeDeleted, … | Useful for **ongoing** sync; Intuit deletion history is **time-window limited** — cannot rebuild full 2025 deletes years later from deletes alone |
| `TimeModified` on form tables | Server-filterable on many entities | Recurring sync must use **Date lookback + TimeModified lookback** |
| Voids | Often remain as transactions with $0 / special status | LIVE VERIFY how Elite voids appear in CData |

Do not claim audit completeness beyond QuickBooks’ deletion-query window.

---

## 5. Opening-balance / 2025-01-01 analysis (prominent)

**Target window:** 2025-01-01 → current  
**Gives:** full 2025, 2026 YTD, prior-YTD / YoY for overlapping periods, T12 once enough months exist.  
**Does not give:** company lifetime history. Never label metrics “lifetime.”

### Special questions

1. **Is 2025-01-01 enough for P&L YoY?**  
   **Yes for 2026 vs 2025 calendar P&L**, if full 2025 + 2026 YTD accrual P&L facts (or reconciled report series) exist. Not enough for lifetime P&L.

2. **What opening state is needed for a legitimate Balance Sheet beginning 2025-01-01?**  
   A Balance Sheet is **cumulative**. Transaction history from 2025 alone **cannot** reconstruct opening assets/liabilities/equity.  
   **Required:** QuickBooks **Balance Sheet as of 2024-12-31** (or as of start of 2025-01-01 per `ReportAsOf`) stored as opening snapshot (`qb_finance_balance_sheet_snapshots` / account opening balances). Then apply 2025+ movements.

3. **Cash balances from 2025 txs alone?**  
   **No.** Need opening bank/CC/Undeposited Funds balances as of 2025-01-01 (from Accounts balances as-of that date via BS report, or documented account balance query at cutover). Then apply deposits/checks/transfers/payments.

4. **Historical A/R at arbitrary dates?**  
   Prefer applications + invoices for analytics; **persist forward A/R snapshots** for trustworthy month-end A/R. Do not fake pre-launch month-ends.

5. **Historical A/P?** Same as A/R.

6. **ReceivePayments vs Deposits double count?**  
   Treat as different grains (receipt vs bank deposit); link via deposit lines / undeposited queue; never sum both as cash-in.

7. **Bills vs payments vs ledger double count expenses?**  
   Accrual expense from bill/JE postings once; cash-out from bill payments/checks once; do not add both into the same expense KPI.

8. **P&L primary facts?**  
   Prefer normalized posting facts + **reconcile** to `ProfitAndLossStandard` (Accrual). Do not use report views as the only durable grain if drilldown is required.

9. **13-week cash forecast inputs (QB authoritative):**  
   Open A/R + DueDate/Terms + payment applications/history; Open A/P + DueDate/Terms + bill applications; bank/CC balances; scheduled deposits queue; historical days-to-pay / days-to-pay-vendors.  
   **Non-QB later:** Moraware sold/uninvoiced, payroll, pipeline — separate signals.

10. **Must historically extract vs current-only:**  
    See matrix §7. Masters/snapshots can be current; txs/applications/deposits/checks/bills/ledger movements from 2025-01-01 must be historical. Opening BS/cash are **point-in-time snapshots at cutover**, not a lifetime GL dump.

11. **TimeModified vs Date for recurring sync:**  
    Pure 60-day `Date` lookback **misses** edits to older txs. Recurring finance sync should use:
    - transaction-date lookback (operational freshness), **and**
    - `TimeModified` lookback (correction catch-up),  
    plus periodic delete reconciliation via `DeletedTransactions` within QB’s window.  
    **Do not change Sales worker 1.2.0 in this audit** — architecture only.

---

## 6. Readiness matrix (strict)

| Domain | Dataset | Class | Source | Required before backfill | Verified |
|--------|---------|-------|--------|--------------------------|----------|
| Sales | Invoices | Historical | `Invoices` | YES | EXISTING / PROVEN |
| Sales | Estimates / SOs | Historical | tables | YES | EXISTING / PROVEN |
| Sales | ReceivePayments | Historical | `ReceivePayments` | YES | EXISTING / PROVEN |
| Sales | Payment applications | Historical | `ReceivePaymentsAppliedTo` | **YES** | DOCS VERIFIED |
| Sales | CreditMemos | Historical | `CreditMemos` | YES | DOCS VERIFIED |
| Sales | SalesReceipts | Historical | `SalesReceipts` | IF USED | LIVE VERIFICATION REQUIRED |
| AR | Open A/R | Snapshot | Unpaid Invoices | YES | EXISTING / PROVEN |
| AR | DueDate/Terms | Hybrid | Invoice fields | YES | EXISTING / PROVEN |
| AR | Periodic A/R snapshots | Snapshot series | Derived going forward | START AT LAUNCH | NOT NEEDED historically |
| AP | Vendors | Master | `Vendors` | YES | DOCS VERIFIED |
| AP | Bills | Historical | `Bills` | **YES** | DOCS VERIFIED |
| AP | Bill payment applications | Historical | `BillPaymentChecksAppliedTo` (+ CC variant) | **YES** | DOCS VERIFIED |
| AP | Open A/P | Snapshot | Unpaid Bills | **YES** | DOCS VERIFIED / LIVE VERIFY fields |
| Cash | Accounts | Master+balance | `Accounts` | YES | DOCS VERIFIED |
| Cash | Deposits + lines | Historical | `Deposits`/`DepositLineItems` | **YES** | DOCS VERIFIED |
| Cash | Checks / Transfers / CC | Historical | tables | YES | DOCS VERIFIED |
| Cash | Opening bank balances | Snapshot @ cutover | BS / Accounts as-of | **YES** | LIVE VERIFICATION REQUIRED |
| Ledger | Posting facts | Historical | `Transactions` and/or GL report | **YES** | DOCS VERIFIED / **LIVE VERIFY grain** |
| Ledger | JournalEntries | Historical | JE tables | YES (subset) | DOCS VERIFIED |
| Reports | P&L / BS controls | Reconciliation | report views | YES (controls) | DOCS VERIFIED |
| Opening | BS as-of 2024-12-31 | Snapshot | `BalanceSheetStandard` | **YES — BLOCKER** | DOCS VERIFIED |
| Master | Class / Terms / SalesReps / PaymentMethods | Master | tables | YES if used | DOCS VERIFIED |
| Sync | DeletedTransactions | Ongoing | view | YES for recurring | DOCS VERIFIED |
| Identity | Customer root ListID | Hybrid | existing | YES | EXISTING / PROVEN |
| Identity | Vendor ListID | Master | Vendors.Id | YES | DOCS VERIFIED |

---

## 7. Proposed prepared-fact tables (illustrative — do not implement yet)

Keep Sales Truth tables for Sales Dashboard/AD Financials. Add a **finance_** namespace (names adjustable):

| Proposed table | Purpose | Grain | Natural key | Class | Before backfill |
|----------------|---------|-------|-------------|-------|-----------------|
| `qb_finance_sync_runs` | Domain run metadata, coverage, checkpoints | 1 row / run | `id` | Meta | YES |
| `qb_finance_sync_checkpoints` | Resume: domain × month × status | 1 / domain+month | `(org, domain, period_start)` | Meta | YES |
| `qb_finance_accounts` | Chart of Accounts | 1 / QB account | `(org, qb_account_id)` | Master | YES |
| `qb_finance_vendors` | Vendor master | 1 / QB vendor | `(org, qb_vendor_id)` | Master | YES |
| `qb_finance_customer_transactions` | Optional enriched AR headers beyond Sales Truth **or** extend Sales carefully | 1 / txn type+id | `(org, txn_type, qb_txn_id)` | Historical | Prefer extend Sales Truth for invoices/payments; don’t duplicate |
| `qb_finance_payment_applications` | ReceivePayment → applied txns | 1 / payment+applied | `(org, receive_payment_id, applied_to_ref_id)` | Historical | **YES** |
| `qb_finance_bills` | Vendor bills | 1 / bill | `(org, qb_bill_id)` | Historical | **YES** |
| `qb_finance_bill_applications` | Bill payments → bills | 1 / payment+bill | `(org, bill_payment_id, applied_to_ref_id)` | Historical | **YES** |
| `qb_finance_open_ap_current` | Current unpaid bills | 1 / open bill | `(org, qb_bill_id)` | Snapshot | YES |
| `qb_finance_cash_transactions` | Typed cash events (receipt/deposit/disbursement/transfer) | 1 / event line | domain-specific | Historical | YES |
| `qb_finance_ledger_entries` | Posting lines for P&L/BS drilldown | 1 / txn line / account | `(org, qb_txn_id, txn_line_id)` or report line key | Historical | YES |
| `qb_finance_account_balances_current` | Current account balances | 1 / account | `(org, qb_account_id)` | Snapshot | YES |
| `qb_finance_opening_balances` | Cutover BS/cash as-of date | 1 / account / as_of | `(org, as_of_date, qb_account_id)` | Snapshot | **YES** |
| `qb_finance_ar_snapshots` | Periodic open A/R totals/detail | 1 / invoice / as_of | `(org, as_of_date, invoice_id)` | Snapshot series | After launch |
| `qb_finance_ap_snapshots` | Periodic open A/P | similar | similar | Snapshot series | After launch |
| `qb_finance_reconciliation_results` | QB report vs prepared deltas | 1 / check | `(org, run_id, check_type)` | Meta | YES |

**Browser safety:** retain QB IDs server-side; scrub `terms_list_id`, ListIDs, TxnIDs from staff APIs unless explicitly approved opaque handles.

**Idempotency:** upsert on natural keys; applications use composite payment|applied ids per CData docs.

---

## 8. Recommended worker / ingest architecture

**Do not** turn `sync-sales-financials.ps1` into a monolith.

| Worker domain | Responsibility | Independence |
|---------------|----------------|--------------|
| **Sales/AR** (existing) | Estimates, SO, Invoices, Payments, Open A/R, DueDate/Terms; later AppliedTo + CreditMemos | Preserve current Sales Dashboard math |
| **AP** | Vendors, Bills, VendorCredits, BillPayments + AppliedTo, Open A/P | Separate token/run |
| **Cash** | Accounts balances, Deposits/lines, Checks, Transfers, CC, linkage to undeposited | Separate |
| **Ledger** | Transactions/GL posting facts + opening BS snapshot | Separate; heaviest |
| **Master** | Accounts, Class, Terms, SalesReps, PaymentMethods, CompanyInfo/Preferences | Frequent light sync |
| **Reconcile** | P&L/BS/OpenInvoices/UnpaidBills report pulls → `reconciliation_results` | After domain loads |

Shared rules (all domains):

- SELECT-only ODBC; no QB writes; no Thryve touch
- Outbound HTTPS Brain ingest only
- **Single-flight ODBC lock** across domains (no overlapping QB readers)
- Month windows for historical extraction where Date/TimeModified pushdown exists
- Per-domain `worker_version`, coverage_start/end, counts, warnings
- Checkpoint table: domain × YYYY-MM → `pending|running|success|failed`
- Failed 2025-08 AP must not force restart of 2025-01 Sales

### Filterability (performance)

Documented server-side WHERE subsets (examples):

| Entity | Documented pushdown highlights |
|--------|--------------------------------|
| Bills | Id, Date, TimeModified, ReferenceNumber, VendorId/Name, AccountsPayableId, IsPaid |
| ReceivePayments / AppliedTo | Id, Date, TimeModified, ReferenceNumber, CustomerId/Name, DepositToAccountId |
| Deposits | Id, Date, TimeModified, DepositToAccountId |
| Accounts | Id, Name, Type, IsActive, TimeModified |
| ReceivePaymentToDeposit | **No server-side filters** — avoid large blind pulls |

Design month/TimeModified windows around pushdown columns; avoid `SELECT *` multi-year.

---

## 9. Reconciliation strategy (conceptual)

After each successful domain sync / backfill month:

| Check | Prepared | QuickBooks control | Tolerance (start) |
|-------|----------|--------------------|-------------------|
| Open A/R | Sum open A/R snapshot | Open Invoices / AR total (report or unpaid invoices) | $1 or 0.1% |
| Open A/P | Sum open A/P | Unpaid Bills | same |
| P&L (period, Accrual) | Sum ledger income/expense | `ProfitAndLossStandard` ReportPeriod + ReportBasis=Accrual | same |
| Balance Sheet (as-of) | Opening + movements or BS build | `BalanceSheetStandard` as-of | same |
| Customer/Vendor balances | Optional detail | CustomerBalanceDetail / VendorBalanceDetail via Intuit/CData if exposed | sampling |

Store results in `qb_finance_reconciliation_results` with `status=pass|warn|fail`.

---

## 10. Safe to defer (no second historical extraction if raw facts captured)

Defer **after** capturing irreplaceable txs/applications/cash/ledger/opening:

- Dashboards / visualization
- AI insights / credit scoring
- Forecast algorithms (keep raw inputs now)
- Advanced ratios
- Invoice/Bill **line-item** detail (unless needed for COGS/margins v1)
- Payroll deep detail (separate sensitive track)
- Purchase Orders (unless AP forecasting requires them)
- Inventory assemblies/sites

**Cannot defer** without re-pull risk: payment/bill applications, deposits/checks/transfers, bills/credits, credit memos, opening BS/cash, posting ledger facts, TimeModified catch-up design.

---

## 11. Definition of READY FOR BACKFILL

GO only when **all** are true:

1. Required entities/columns selected and documented  
2. Installed CData exposure live-verified (sys_tables / GetSchema)  
3. Prepared-fact schemas applied  
4. Domain workers + ingest + checkpoints implemented  
5. Current/small-range dry runs pass per domain  
6. Incremental sync + TimeModified catch-up proven  
7. Reconciliation controls pass on a known week/month  
8. Double-count rules tested (payment vs deposit; bill vs payment vs ledger)  
9. Opening BS + cash as-of cutover captured and checked  
10. Non-overlap lock prevents concurrent ODBC readers  
11. Sales Dashboard definitions unchanged / regression green  

**Until then: NOT READY FOR 2025 BACKFILL.**

---

## 12. Live verification plan (AFTER current Sales dry run finishes)

Do **not** run while Sales dry run is active.

### Step A — Driver / schema

```powershell
# Conceptual — run later on QB Server only
# 1) Record driver file version / CData build from ODBC administrator or installer
# 2) SELECT TableName FROM sys_tables ORDER BY TableName
# 3) SELECT ColumnName, DataType FROM sys_tablecolumns WHERE TableName IN (
#      'ReceivePaymentsAppliedTo','Bills','BillPaymentChecksAppliedTo',
#      'Deposits','DepositLineItems','Accounts','Transactions',
#      'CreditMemos','SalesReceipts','Vendors','Transfers','Checks',
#      'ProfitAndLossStandard','BalanceSheetStandard','DeletedTransactions',
#      'ReceivePaymentToDeposit','JournalEntries','JournalEntryLines'
#    ) ORDER BY TableName, ColumnName
```

### Step B — Population (smallest feasible)

Prefer `TOP 5` / narrow Date / `IsPaid` filters. Examples (execute later):

```sql
SELECT TOP 5 Id, Date, CustomerId, Amount FROM ReceivePaymentsAppliedTo
SELECT TOP 5 Id, VendorId, Date, DueDate, Amount, IsPaid, OpenAmount FROM Bills WHERE IsPaid = false
SELECT TOP 5 Id, Date, DepositToAccountId, TotalDeposit FROM Deposits
SELECT TOP 5 ID, Type, Date, AccountId, Amount FROM Transactions WHERE PostingStatus = 'Posting'
SELECT Id, Name, Type, Balance, AccountBalance FROM Accounts WHERE Type IN ('BANK','CREDITCARD','OTHERCURRENTASSET')
```

### Step C — Field coverage

Sample DueDate/Terms/Account/Vendor/Class/TimeModified/AppliedTo* population rates on 30–90 day windows.

### Step D — Report controls

```sql
-- Pseudo-column usage per CData docs; exact SQL syntax to confirm live
SELECT Label, Amount, RowType FROM ProfitAndLossStandard
-- with ReportPeriod / ReportBasis Accrual for a closed month
SELECT Label, Total FROM BalanceSheetStandard
-- as-of 2024-12-31 and as-of today
```

---

## 13. Recommended implementation order

1. Freeze this contract; live schema/population probes  
2. Finance sync_runs + checkpoints schema  
3. Masters: Accounts, Vendors, Terms, PaymentMethods, Class  
4. Opening BS + cash snapshot as-of cutover  
5. Extend Sales/AR: `ReceivePaymentsAppliedTo` + CreditMemos (+ SalesReceipts if used)  
6. AP domain: Bills, payments, applications, Open A/P  
7. Cash domain: Deposits/lines, Checks, Transfers, CC + anti-double-count model  
8. Ledger domain: Transactions/GL posting facts  
9. Reconciliation worker (P&L/BS/AR/AP)  
10. TimeModified catch-up on recurring workers  
11. Forward A/R & A/P snapshot jobs  
12. Only then: **2025-01-01 historical backfill by domain×month**  
13. Finance Command Center UI / forecast layers  

---

## 14. Final backfill go-live checklist

- [ ] Live CData build recorded; required tables/columns present  
- [ ] Payment applications ingested & reconciled on sample month  
- [ ] AP bills + applications + open A/P proven  
- [ ] Deposits linked without double-counting ReceivePayments  
- [ ] Opening Balance Sheet + bank balances as-of 2025-01-01 stored  
- [ ] Ledger posting facts reconcile to Accrual P&L for sample month  
- [ ] Domain checkpoints resume after forced failure  
- [ ] ODBC single-flight lock verified  
- [ ] Sales Dashboard + AD Financials regressions green  
- [ ] Ops window scheduled; no concurrent Sales dry/backfill  

---

## 15. Major unknowns / blockers

| Item | Status |
|------|--------|
| Installed CData build vs docs 23.0.8839 | Still not pinned in-repo (entities live-proven) |
| Whether Elite uses SalesReceipts / StatementCharges / CC bill pay | SalesReceipts live-proven; CC charges/credits **no sample rows**; StatementCharges still unused-TBD |
| Exact debit/credit grain of `Transactions` view | **PROVEN: not double-entry.** Summarized Bill → AP account. Index only. |
| `OpenAmount` reliability on Bills for Open A/P | Live-exposed; still confirm snapshot vs Unpaid Bills report |
| DepositLineItems ability to join to ReceivePayment Ids | **PROVEN** (`ItemTxnType` + `ItemRefId`) |
| QB deletion history window length in practice | LIVE / Intuit limits |
| Class / SalesRep usage density | Still density-TBD (JE lines expose class) |
| Fiscal year vs calendar in Preferences | Still TBD |
| Small DryRun / live ingest / opening capture | **OPS PENDING** — foundation shipped, not executed in this coding pass |

---

## 16. Explicit answers to special questions (summary)

| # | Answer |
|---|--------|
| 1 | 2025-01-01 sufficient for **calendar P&L YoY 2026 vs 2025**, not lifetime |
| 2 | Need **BS opening snapshot** as-of cutover; 2025 txs alone insufficient |
| 3 | Need **opening cash/bank balances**; cannot reconstruct from 2025 txs alone |
| 4 | Applications help; **persist forward A/R snapshots**; don’t fake past month-ends |
| 5 | Same for A/P |
| 6 | Separate receipt vs deposit grains; link; never sum both as cash-in |
| 7 | One accrual expense path; one cash-out path; don’t add both into expense KPIs |
| 8 | Official P&L/BS = QuickBooks report snapshots (Accrual). Do not manufacture from forms. `Transactions` is not the GL. JournalEntryLines are journals only. |
| 9 | Open AR/AP + due dates + applications + balances + payment behavior; ops signals later |
| 10 | Historical: txs/applications/cash movements/JE + opening BS 2024-12-31; masters current |
| 11 | Add **TimeModified lookback** (+ deletes) to recurring finance sync design |

---

## 17. Document control

| Field | Value |
|-------|--------|
| Created | 2026-08-13 |
| Updated | 2026-08-14 Phase 1 foundation + live discovery |
| Authoring mode | Repo + CData/Intuit docs + live-proven Elite ODBC results |
| Code/SQL/QB access this coding pass | Schema/workers/ingest added; **SQL not applied**; **no QB/ODBC run**; **no 2025 backfill** |
| Next step | Manual SQL apply → Brain token → small DryRun per domain → small live ingest → `-CaptureOpening` |

Related decisions: `FEATURE_DECISIONS.md` §308–§316.
