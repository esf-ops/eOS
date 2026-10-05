# slabOS connected workspace — Command Center, Customers, Quotes & Jobs (DRAFT FOR REVIEW)

**Status:** Design + local prototype. No schema, no Brain routes, no deploy, no head registration. QuickBooks and Moraware writes stay off.
**Prototype:** `app-estimating-command-center/` (fixture data, labeled). `VITE_ECC_FIXTURE_PREVIEW=1 npm run dev` → http://localhost:5199. Routes: `#/command`, `#/customers[/key]`, `#/jobs[/project]`. It predates the container rule below and still models estimate revisions, "sold = first sales order" and change orders; those parts are superseded until it is reworked.
**Builds on:** `ESTIMATING_COMMAND_CENTER_DESIGN.md` (source map, feed freshness, QuickBooks SDK prerequisite). This document replaces its head-only framing with one workspace.
**Evidence:** read-only aggregate queries against production Supabase `wbxbzhxsdlkpqsviyzkt`, 2026-10-05. No customer rows copied here.

> **Sequencing (2026-10-05).** This remains the future direction. The first release is narrower: a read-only, QuickBooks-backed estimate library inside the existing Quote Library head (FEATURE_DECISIONS §397) — search, filters, count/value, list, line items, export, exact Account Directory links, sync freshness. A/R expansion, Moraware recovery and the phase-2 workflow are not prerequisites for it. Rules adopted for every release: a QuickBooks Customer:Job is a **container**, not proof that its estimates are revisions or that its sales orders are change orders; sales-order dollars are labelled "Sales orders ($)"; distinct sold jobs are not inferred from transaction counts; estimator assignment is phase 2; existing Mark Sold behaviour is unchanged.

## 1. What this is and is not

One slabOS workspace where staff move from a number to the customer to the quote/job to its money, using identities that already exist.

- **Not** a QuickBooks replacement: QuickBooks stays the quoting and accounting source. Nothing is re-keyed in slabOS.
- **Not** a CRM: Account Directory stays the identity spine; Monday stays the account-owner source.
- **Not** a production system: Moraware stays the production source.
- **Not** a new status system: project stage is derived from source records and is never stored or edited.

## 2. Shared identities

| Identity | Key | Owner | Evidence (Elite, production) |
|---|---|---|---|
| **Customer** | Account Directory UUID (`account_directory_accounts.id`) via exact `account_directory_external_links` (`quickbooks_desktop` root ListID; `moraware` account IDs, Option B §324) | Account Directory | 399 active QuickBooks links. Unlinked QuickBooks roots stay visible as "Not in Account Directory" — never name-matched. |
| **Project** | QuickBooks Customer:Job ListID (`ad_qb_customer_facts.is_job`). Browser reference = `ad_qb_customer_facts.id` (UUID), so ListIDs never reach the browser (§319). | QuickBooks | 2026: 90% of estimates (2,107/2,351), 91% of sales orders, 92% of invoices and 95% of open A/R rows sit on a child job. |
| **Estimate** | QuickBooks estimate TxnID, filed on a job | QuickBooks | Sales mirror (2026-06-12 → 2026-09-09): 1,561 jobs have one estimate, 253 have more. Several estimates on one job are **not** evidence of revisions — they may be options, separate rooms or unrelated work. |
| **Sales order** | QuickBooks sales order TxnID, filed on a job | QuickBooks | Same window: 1,277 jobs have one sales order, 188 have more. Not evidence of change orders or of distinct sold jobs. |
| **Invoice / open A/R** | `sales_quickbooks_open_ar_current.source_invoice_id`, job via `qb_customer_list_id` | QuickBooks | 910 open invoices; 869 on a job. |
| **Payment** | `qb_finance_transaction_index` ReceivePayment rows, job via `entity_id` | QuickBooks | Payment→invoice application not mirrored (`qb_finance_linked_transactions` empty). |
| **Production job** | `brain_moraware_jobs.source_job_id` | Moraware | Attached to a customer by exact Moraware account link. Attached to a project **only** by an explicit link captured at handoff (phase 2). |

Transactions posted to the customer root (no job): ~10% of rows. They stay on the customer under **Not filed under a job** and are never assigned to a project by guess.

```
Customer (AD UUID)
 ├─ Project (QB job)          ← estimates, sales orders, invoices, payments, open A/R all carry this job ID
 │    ├─ Estimates (QB; listed, not chained as revisions)
 │    ├─ Sales orders (QB; listed, not classified as sold / change orders)
 │    ├─ Invoices · open A/R (QB, due-date aging)
 │    ├─ Payments (QB)
 │    └─ Production job (Moraware) — explicit link only (phase 2 handoff)
 ├─ Not filed under a job (QB root-level invoices/payments)
 └─ Moraware jobs on linked Moraware accounts
```

Link coverage today: 83% of 2026 estimate dollars ($8.55M of $10.26M) and 79% of open A/R dollars ($2.36M of $2.99M) roll up to a customer in Account Directory. Of jobs with a sales order, 1,238 also have an estimate in the mirror and 227 do not (the sales mirror starts 2026-06-12; earlier estimates are outside it). 332 jobs have invoices but no sales order.

## 3. Who owns each piece of information

Every value in the workspace carries the system that owns it (prototype: `FIELD_OWNERSHIP` in `src/lib/workspaceModel.mjs`; UI labels on every section).

| Information | Owner | slabOS behaviour |
|---|---|---|
| Customer name, status, contacts, links | Account Directory | Edit in Account Directory only |
| Account owner | Monday | Display only; change in Monday |
| Project name, branch (QB class), sales rep | QuickBooks | Display only |
| Estimator | **No source yet** | Shown as "No source yet" until chosen (§7) |
| Estimates, totals | QuickBooks | Display only |
| Sales orders | QuickBooks | Display only |
| Invoices, payments, open A/R, terms, due dates | QuickBooks | Display only |
| Production status | Moraware | Display only |
| Project stage (Quoted / Sold / Lost / No estimate) | **Derived** | Computed; never stored or edited |
| Follow-ups, assignments, handoff (phase 2) | slabOS | The only slabOS-owned workflow facts |

Rules that prevent duplicate entry and competing status:

1. slabOS never stores a copy of a QuickBooks or Moraware value as an editable field.
2. slabOS does not derive "sold" from QuickBooks transaction counts. How a sold job is identified is an open decision (§8); until then sales orders are shown as "Sales orders ($)" only. Existing eliteOS Mark Sold behaviour is unchanged.
3. Production state is Moraware's. The handoff record stores only the Moraware job ID Tanya confirms, not a production status.
4. "Lost" (phase 2) is a slabOS disposition because QuickBooks has none; a later sales order on the job overrides it automatically.
5. Every phase-2 record keys to existing identities (AD UUID, project reference). No new customer or project identity is created.

## 4. Views and navigation

| View | Production home | Contents |
|---|---|---|
| **Command Center** | Workspace | Source freshness; quote and sales-order metrics; receivables and reconciliation metrics; record-link gaps; color report. Every metric drills down. |
| **Customers** | **Account Directory** list + Account 360 (existing) | Adds open pipeline and a **Quotes & Jobs** tab to Account 360. A/R aging already exists there. |
| **Quotes & Jobs** | Workspace | One row per QuickBooks job; filters; open A/R per job; links to customer and project. |
| **Project detail** | Workspace (also opened from the Account 360 Quotes & Jobs tab) | Estimates, sales orders, invoices + aging, payments, production link, owner labels. |

Navigation paths in v1:

- Metric → filtered Quotes & Jobs (project metrics) or filtered Customers (A/R metrics) → customer → project → invoices/payments.
- Project → customer (breadcrumb) → Account 360 (deep link `?account=<uuid>&panel=…`, existing).
- Account 360 → Quotes & Jobs tab → project.

**Recommended placement:** extend the existing **Account Directory head** into the workspace (Command Center and Quotes & Jobs as top-level views beside the customer directory) instead of registering a new head. Same auth, head access, org scope, topbar and Account 360 — and customers are never one click into a different app. The prototype head stays a local prototype and is not registered. Alternative: a separate head that deep-links into Account 360; rejected because staff would cross apps on every customer click. **Decision needed (§8).**

## 5. Version one: reporting and record relationships (read-only)

### 5.1 Brain reads (new module `backend-core/src/workspace/`, extends existing services)

| Route | Purpose | Reuses |
|---|---|---|
| `GET /api/workspace/metrics?period=` | Command Center metrics + drill descriptors | eccModel counting rules moved server-side; Finance `buildAr` for company A/R total |
| `GET /api/workspace/projects?…` | Paged, SQL-filtered Quotes & Jobs list | `sales_quickbooks_financial_transactions` (indexes on `(organization_id, qb_customer_list_id)` and root already exist, v2 SQL) |
| `GET /api/workspace/projects/:projectRef` | Project detail | `buildOpenArAging` / `classifyArAgingBucket` (§315), customer history loader (§319) for payments, Moraware linkage (§325–326) |
| `GET /api/account-directory/accounts/:id/projects` | Account 360 Quotes & Jobs tab | Same module, scoped to the account's exact QuickBooks roots |

All routes: `requireAuth` + `requireHeadAccess`, `organization_id` from the caller only (no query override — unlike the open `/api/sales` finding), explicit DTOs, QuickBooks ListIDs/TxnIDs and raw payloads omitted, bounded pages (default 50, max 100), per-field-group `source` and freshness.

**No schema change is needed for v1.** Required indexes exist. Project references use the existing `ad_qb_customer_facts.id`.

### 5.2 A/R uses the verified logic — one definition everywhere

- Rows: `sales_quickbooks_open_ar_current`, positive balances only. Same as Finance (`financeRead/service.js buildAr`) and Account Directory (`sumLinkedOpenAr`).
- Aging: QuickBooks DueDate only; missing due date → "No due date" (never overdue, never zero). Buckets and collection attention from `buildOpenArAging`. The prototype imports this function directly from `backend-core`.
- Grouping is the only difference: Finance groups by customer **name**; the workspace groups by exact identity (job → root → AD UUID), with unlinked and not-filed buckets so totals still reconcile to Finance.

### 5.3 Metric definitions added or changed

| Metric | Definition |
|---|---|
| Sales orders ($) | Sum of every QuickBooks sales order dated in the period. Same as the Sales dashboard and Account 360 "Sales Orders" (replaces the earlier per-opportunity "Sold value"). |
| ~~Jobs sold~~, ~~Projects with change orders~~ | Withdrawn 2026-10-05: they inferred sold jobs and change orders from sales-order counts per Customer:Job. |
| Open A/R / Overdue A/R | As §5.2. Company totals are restricted (§5.4). |
| A/R not in Account Directory | Open A/R on QuickBooks customers with no AD link — a reconciliation bucket, fixed by linking. |
| A/R not filed under a job | Open A/R posted to the customer root. |

Quote counting, revisions, multi-color and unknown-vs-zero rules are unchanged (`ESTIMATING_COMMAND_CENTER_DESIGN.md` §5).

### 5.4 Access

- Customer- and project-scoped facts follow the Account 360 staff-safe allowlist (§319).
- Company-wide totals and rankings (company A/R, pipeline and sales-order totals, top balances) are **not** staff-safe under §319. In v1 they're omitted server-side unless the caller has a Finance/Executive role (`admin`, `super_admin`, `executive`, `finance`, `accounting`). Staff see their customer/project views. **Decision needed (§8)** if sales staff should see company pipeline.

## 6. Validation gate before workflow (phase 2 starts only when all pass)

1. **Feeds fresh:** QuickBooks sales/A/R, customer and finance feeds and the Moraware incremental feed all fresh for 7 consecutive days (stale-feed alert, FEATURE_DECISIONS §395).
2. **A/R reconciles:** workspace open A/R total = Finance head Open A/R to the cent; Σ customer A/R + unlinked + not-filed = total.
3. **Customer A/R matches Account 360** for 20 sampled accounts.
4. **Sales orders ($) and quote counts** match the Sales dashboard for the same period.
5. **Relationship spot check:** staff confirm 25 projects end to end (estimates, sales orders, invoices, payments) against QuickBooks, including which estimates are true revisions — the evidence needed before any revision or sold-job rule is adopted.
6. **Coverage tracked:** % of estimate dollars and A/R dollars linked to Account Directory, and % on a job, shown in Command Center and trending up through linking (not name matching).

Automated checks 2–4 become regression tests in Brain; 5 is a recorded sign-off.

## 7. Phase 2 design room (not built)

| Capability | Design | Schema (additive, after review) |
|---|---|---|
| **Follow-ups** | Extend Account 360 follow-ups (§329) with an optional project reference. One follow-up system for account- and quote-level reminders. | Nullable `project_ref` on `account_directory_follow_ups` + index |
| **Assignments** | Estimator assignment per project (slabOS-owned, because QuickBooks has no estimator field). Account owner stays Monday; sales rep stays QuickBooks — neither is editable in slabOS. | `workspace_project_assignments (organization_id, project_ref, role, user_id, assigned_by, …)` with audit |
| **Sold-job handoff** | Trigger to be decided (not "first sales order" — see §3 rule 2). Tanya moves it received → initiated and confirms the Moraware job ID; that confirmation is the project ↔ Moraware link. | `workspace_project_handoffs (organization_id, project_ref, sales_order_ref, state, moraware_source_job_id, actor, timestamps)` + audit events |
| **Lost disposition** | slabOS-owned with reason; auto-cleared by a later sales order. | Column on a project-disposition table, or part of follow-up completion |

All phase-2 writes: Brain-only, org-scoped, audited, no QuickBooks or Moraware writes.

## 8. Decisions needed

1. **Placement:** extend Account Directory into the workspace (recommended) vs a separate head.
2. **Company metric visibility:** Finance/Executive only (default) vs also sales leadership.
3. **Estimator source:** a QuickBooks field (if one exists) or slabOS assignment.
4. **Root-level transactions:** leave on the customer (default) or ask office staff to post future estimates under jobs.
5. **QuickBooks RefNumber in the browser:** staff need estimate/invoice numbers; staging excludes RefNumber from `brain_quickbooks_*` (the sales mirror and A/R table already store `reference_number`).

## 9. Blockers outside this design

- Every QuickBooks feed has been stopped since 2026-09-09/10. The Moraware incremental import fails on a statement timeout (catch-up run of 613 jobs; fix in progress on the Mac mini). No workspace number is trustworthy until feeds recover — the stale-feed alert is live.
- `/api/sales/*` and QuickBooks Intelligence accept `?organization_id=` without checking it against the caller (audit finding; not fixed).
