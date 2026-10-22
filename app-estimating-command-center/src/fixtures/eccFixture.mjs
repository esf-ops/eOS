/**
 * FIXTURE DATA — NOT PRODUCTION RECORDS.
 *
 * Customers, projects, people and amounts are synthetic. Only `sources[].lastSuccessAt`
 * reflects real production state: those timestamps come from a read-only aggregate probe
 * of project wbxbzhxsdlkpqsviyzkt on 2026-10-05 (latest successful run per sync table).
 */

export const FIXTURE_AS_OF = "2026-10-05T16:48:00Z";

export const fixtureSources = [
  {
    key: "qb_estimates",
    label: "QuickBooks estimates",
    authority: "QuickBooks Desktop",
    table: "sales_quickbooks_financial_transactions (estimate) · brain_quickbooks_estimates (July snapshot)",
    lastSuccessAt: "2026-09-10T05:12:43Z",
    staleAfterHours: 4,
    cadence: "ODBC worker every 2h (stopped)",
  },
  {
    key: "qb_sales_orders",
    label: "QuickBooks sales orders",
    authority: "QuickBooks Desktop",
    table: "sales_quickbooks_financial_transactions (sales_order)",
    lastSuccessAt: "2026-09-10T05:12:43Z",
    staleAfterHours: 4,
    cadence: "ODBC worker every 2h (stopped)",
  },
  {
    key: "qb_ar",
    label: "QuickBooks invoices, payments, open A/R",
    authority: "QuickBooks Desktop",
    table: "sales_quickbooks_open_ar_current · sales_quickbooks_financial_transactions (invoice) · qb_finance_transaction_index",
    lastSuccessAt: "2026-09-10T05:12:43Z",
    staleAfterHours: 4,
    cadence: "ODBC worker every 2h (stopped)",
  },
  {
    key: "qb_sdk_snapshot",
    label: "QuickBooks SDK snapshot (reps, classes, lines)",
    authority: "QuickBooks Desktop",
    table: "brain_quickbooks_* (qb_sync_runs 20260710-130918-512b1dca)",
    lastSuccessAt: "2026-07-10T18:30:23Z",
    staleAfterHours: null,
    kind: "snapshot",
    cadence: "One-time import; no recurring upload",
  },
  {
    key: "qb_customers",
    label: "QuickBooks customers → Account Directory",
    authority: "Account Directory (identity) · QuickBooks (facts)",
    table: "ad_qb_customer_facts · account_directory_external_links",
    lastSuccessAt: "2026-09-09T07:17:34Z",
    staleAfterHours: 26,
    cadence: "Nightly 02:15 (stopped)",
  },
  {
    key: "moraware_jobs",
    label: "Moraware jobs",
    authority: "Moraware",
    table: "brain_moraware_jobs · moraware_sync_runs",
    lastSuccessAt: "2026-09-02T18:03:00Z",
    staleAfterHours: 4,
    cadence: "Mac mini LaunchAgent, hourly (stopped)",
  },
  {
    key: "monday_owners",
    label: "Account owners (Monday)",
    authority: "Monday",
    table: "sales_ops_accounts.assigned_user_id",
    lastSuccessAt: "2026-10-05T16:51:47Z",
    staleAfterHours: 26,
    cadence: "Monday read mirror",
  },
  {
    key: "color_catalog",
    label: "Material/color catalog",
    authority: "slabOS",
    table: "slab_color_catalog_items · slab_color_aliases",
    lastSuccessAt: "2026-06-05T17:39:23Z",
    staleAfterHours: null,
    kind: "static",
    cadence: "Configuration (100 colors, 12 aliases)",
  },
];

const owner = (name) => ({ userId: `fixture-user-${name.toLowerCase().replace(/\W+/g, "-")}`, name, source: "monday" });
const rep = (initials, userName = null) => ({ qbSalesRepListId: `FIX-REP-${initials}`, initials, userName });
const noRep = { qbSalesRepListId: null, initials: null, userName: null };
const branch = (key, cls = `ESF - ${key}`) => ({ qbClassName: cls, branchKey: key });
const line = (colorKey, colorLabel, sqft, amount, desc) => ({ isMaterial: true, colorKey, colorLabel, sqft, amount, desc: desc ?? `${colorLabel} 3cm` });
const unmatched = (desc, sqft = null) => ({ isMaterial: true, colorKey: null, colorLabel: null, sqft, amount: null, desc });
const labor = (desc, amount) => ({ isMaterial: false, desc, amount });
const rev = (n, txnDate, total, lines, extra = {}) => ({
  txnId: `FIX-EST-${n}`,
  refNumber: `E${n}`,
  txnDate,
  editSequence: String(1_700_000_000 + n),
  total,
  isActive: true,
  lines,
  ...extra,
});
const so = (refNumber, date, amount, memo = null) => ({ refNumber, date, amount, memo });
const inv = (refNumber, invoiceDate, dueDate, amount, balance, termsName) => ({ refNumber, invoiceDate, dueDate, amount, balance, termsName });
const pay = (refNumber, date, amount) => ({ refNumber, date, amount });
const cust = (name, linked = true) => ({ accountId: linked ? `fixture-acct-${name.toLowerCase().replace(/\W+/g, "-")}` : null, qbRootListId: `FIX-CUST-${name.slice(0, 4).toUpperCase()}`, name });

export const fixtureOpportunities = [
  {
    id: "opp-01",
    customer: cust("Fixture Homes LLC"),
    projectName: "Lot 14 Kitchen + Baths",
    qbJobListId: "FIX-JOB-01",
    branch: branch("Dyersville"),
    accountOwner: owner("Avery Owner"),
    salesRep: rep("JM", "Jordan Rep"),
    estimator: { name: "Casey Estimator", source: "quickbooks_other_field" },
    revisions: [
      rev(1001, "2026-08-18", 9200, [line("calacatta-laza", "Calacatta Laza", 62, 5600), line("white-shadow", "White Shadow", 18, 1400), labor("Fabrication", 2200)]),
      rev(1002, "2026-08-27", 9850, [line("calacatta-laza", "Calacatta Laza", 66, 6000), line("white-shadow", "White Shadow", 18, 1400), labor("Fabrication", 2450)]),
    ],
    lastFollowUpAt: "2026-08-29T15:00:00Z",
    followUpSource: "account_directory",
    sold: { salesOrderTxnId: "FIX-SO-501", refNumber: "SO501", soldAt: "2026-09-02", amount: 9850, estimateTxnId: "FIX-EST-1002", linkMethod: "memo_ref" },
    financial: {
      salesOrders: [so("SO501", "2026-09-02", 9850), so("SO533", "2026-10-02", 650, "Change order — added vanity")],
      invoices: [inv("INV7001", "2026-09-03", "2026-09-03", 4925, 0, "Due on receipt"), inv("INV7002", "2026-09-20", "2026-10-20", 5575, 5575, "Net 30")],
      payments: [pay("PMT3301", "2026-09-05", 4925)],
    },
    handoff: { state: "initiated", receivedAt: "2026-09-02T18:00:00Z", initiatedAt: "2026-09-03T14:00:00Z", morawareJobId: "FIX-MW-88121" },
  },
  {
    id: "opp-02",
    customer: cust("Sample Remodeling Co"),
    projectName: "Hillcrest Kitchen",
    qbJobListId: "FIX-JOB-02",
    branch: branch("Lisbon"),
    accountOwner: owner("Riley Owner"),
    salesRep: rep("TK", "Taylor Rep"),
    estimator: { name: "Casey Estimator", source: "quickbooks_other_field" },
    revisions: [rev(1010, "2026-09-21", 6400, [line("leathered-black", "Leathered Black Granite", 48, 4100), labor("Fabrication", 2300)])],
    lastFollowUpAt: null,
    followUpSource: "unavailable",
    sold: { salesOrderTxnId: "FIX-SO-512", refNumber: "SO512", soldAt: "2026-10-01", amount: 6400, estimateTxnId: "FIX-EST-1010", linkMethod: "linked_txn" },
    financial: { salesOrders: [so("SO512", "2026-10-01", 6400)], invoices: [], payments: [] },
    handoff: null,
  },
  {
    id: "opp-03",
    customer: cust("Demo Cabinetry"),
    projectName: "Maple St Vanity",
    qbJobListId: "FIX-JOB-03",
    branch: branch("Iowa City"),
    accountOwner: owner("Avery Owner"),
    salesRep: rep("JM", "Jordan Rep"),
    estimator: { name: null, source: "unknown" },
    revisions: [rev(1020, "2026-09-12", 1850, [line("white-shadow", "White Shadow", 14, 1100), labor("Fabrication", 750)])],
    lastFollowUpAt: null,
    followUpSource: "unavailable",
    sold: { salesOrderTxnId: "FIX-SO-509", refNumber: "SO509", soldAt: "2026-09-26", amount: 1850, estimateTxnId: "FIX-EST-1020", linkMethod: "memo_ref" },
    financial: {
      salesOrders: [so("SO509", "2026-09-26", 1850)],
      invoices: [inv("INV7010", "2026-09-28", "2026-09-28", 1850, 1850, "Due on receipt")],
      payments: [],
    },
    handoff: { state: "awaiting_tanya", receivedAt: "2026-09-29T13:00:00Z", initiatedAt: null, morawareJobId: null },
  },
  {
    id: "opp-04",
    customer: cust("Placeholder Builders"),
    projectName: "Spec Home 7",
    qbJobListId: "FIX-JOB-04",
    branch: branch("Dyersville"),
    accountOwner: owner("Riley Owner"),
    salesRep: rep("TK", "Taylor Rep"),
    estimator: { name: "Morgan Estimator", source: "quickbooks_other_field" },
    revisions: [
      rev(1030, "2026-08-04", 12400, [line("calacatta-laza", "Calacatta Laza", 90, 8100), labor("Fabrication", 4300)]),
      rev(1031, "2026-08-19", 11800, [line("misty-carrera", "Misty Carrera", 90, 7500), labor("Fabrication", 4300)]),
      rev(1032, "2026-09-08", 11950, [line("misty-carrera", "Misty Carrera", 92, 7650), labor("Fabrication", 4300)]),
    ],
    lastFollowUpAt: "2026-09-09T16:00:00Z",
    followUpSource: "account_directory",
    sold: null,
    handoff: null,
  },
  {
    id: "opp-05",
    customer: cust("Unlinked Customer Example", false),
    projectName: "Basement Bar",
    qbJobListId: "FIX-JOB-05",
    branch: { qbClassName: "ESF - Retail", branchKey: null },
    accountOwner: { userId: null, name: null, source: "monday" },
    salesRep: noRep,
    estimator: { name: null, source: "unknown" },
    revisions: [rev(1040, "2026-09-24", 2300, [unmatched("Customer-supplied quartz, color TBD", 22), labor("Fabrication", 2300)])],
    lastFollowUpAt: null,
    followUpSource: "unavailable",
    sold: null,
    handoff: null,
  },
  {
    id: "opp-06",
    customer: cust("Fixture Homes LLC"),
    projectName: "Lot 15 Kitchen",
    qbJobListId: "FIX-JOB-06",
    branch: branch("Dyersville"),
    accountOwner: owner("Avery Owner"),
    salesRep: rep("JM", "Jordan Rep"),
    estimator: { name: "Casey Estimator", source: "quickbooks_other_field" },
    revisions: [rev(1050, "2026-09-15", null, null)],
    lastFollowUpAt: "2026-09-30T15:00:00Z",
    followUpSource: "account_directory",
    sold: null,
    handoff: null,
  },
  {
    id: "opp-07",
    customer: cust("Sample Remodeling Co"),
    projectName: "Oak Ave Master Bath",
    qbJobListId: "FIX-JOB-07",
    branch: branch("Lisbon"),
    accountOwner: owner("Riley Owner"),
    salesRep: rep("TK", "Taylor Rep"),
    estimator: { name: "Morgan Estimator", source: "quickbooks_other_field" },
    revisions: [rev(1060, "2026-08-11", 3400, [line("white-shadow", "White Shadow", 30, 2200), labor("Fabrication", 1200)])],
    lastFollowUpAt: "2026-08-20T15:00:00Z",
    followUpSource: "account_directory",
    sold: null,
    lost: { at: "2026-09-05", reason: "Went with competitor" },
    handoff: null,
  },
  {
    id: "opp-08",
    customer: cust("Demo Cabinetry"),
    projectName: "Riverside Kitchen + Laundry",
    qbJobListId: "FIX-JOB-08",
    branch: branch("Iowa City"),
    accountOwner: owner("Avery Owner"),
    salesRep: rep("LS"),
    estimator: { name: "Casey Estimator", source: "quickbooks_other_field" },
    revisions: [
      rev(1070, "2026-09-03", 7300, [line("leathered-black", "Leathered Black Granite", 40, 3600), line("calacatta-laza", "Calacatta Laza", 22, 2000), labor("Fabrication", 1700)]),
    ],
    lastFollowUpAt: "2026-09-04T15:00:00Z",
    followUpSource: "account_directory",
    sold: { salesOrderTxnId: "FIX-SO-506", refNumber: "SO506", soldAt: "2026-09-18", amount: 7450, estimateTxnId: "FIX-EST-1070", linkMethod: "memo_ref" },
    financial: {
      salesOrders: [so("SO506", "2026-09-18", 7450)],
      invoices: [inv("INV7006", "2026-09-18", "2026-09-18", 3725, 3725, "50% deposit")],
      payments: [],
    },
    handoff: { state: "in_progress", receivedAt: "2026-09-19T13:00:00Z", initiatedAt: null, morawareJobId: null },
  },
  {
    id: "opp-09",
    customer: cust("Placeholder Builders"),
    projectName: "Spec Home 8",
    qbJobListId: "FIX-JOB-09",
    branch: branch("Dyersville"),
    accountOwner: owner("Riley Owner"),
    salesRep: rep("TK", "Taylor Rep"),
    estimator: { name: "Morgan Estimator", source: "quickbooks_other_field" },
    revisions: [rev(1080, "2026-10-01", 10100, [line("misty-carrera", "Misty Carrera", 80, 6600), unmatched("Backsplash — color per builder"), labor("Fabrication", 3500)])],
    lastFollowUpAt: null,
    followUpSource: "unavailable",
    sold: null,
    handoff: null,
  },
  {
    id: "opp-10",
    customer: cust("Example Kitchens Inc"),
    projectName: "Prairie View Island",
    qbJobListId: "FIX-JOB-10",
    branch: branch("Lisbon"),
    accountOwner: owner("Riley Owner"),
    salesRep: rep("TK", "Taylor Rep"),
    estimator: { name: "Casey Estimator", source: "quickbooks_other_field" },
    revisions: [rev(1090, "2026-09-09", 4200, [line("calacatta-laza", "Calacatta Laza", 34, 3100), labor("Fabrication", 1100)])],
    lastFollowUpAt: "2026-09-16T15:00:00Z",
    followUpSource: "account_directory",
    sold: { salesOrderTxnId: "FIX-SO-503", refNumber: "SO503", soldAt: "2026-09-10", amount: null, estimateTxnId: "FIX-EST-1090", linkMethod: "memo_ref" },
    financial: {
      salesOrders: [so("SO503", "2026-09-10", null)],
      invoices: [inv("INV7003", "2026-09-12", "2026-09-12", 4200, 0, "Due on receipt"), inv("INV7004", "2026-09-25", null, 900, 900, null)],
      payments: [pay("PMT3310", "2026-09-20", 4200)],
    },
    handoff: { state: "initiated", receivedAt: "2026-09-10T15:00:00Z", initiatedAt: "2026-09-11T14:00:00Z", morawareJobId: "FIX-MW-88140" },
  },
];

const mw = (sourceJobId, name, status, createdAt) => ({ sourceJobId, name, status, createdAt });

/** Customer-level records: invoices posted to the QuickBooks customer root (no job) and Moraware jobs on linked accounts. */
export const fixtureCustomers = [
  {
    accountId: "fixture-acct-fixture-homes-llc",
    name: "Fixture Homes LLC",
    status: "active",
    morawareJobs: [mw("FIX-MW-88121", "Lot 14 Kitchen + Baths", "Templated", "2026-09-03"), mw("FIX-MW-87990", "Lot 9 Kitchen", "Installed", "2026-07-21")],
    unfiledInvoices: [inv("INV6900", "2026-06-30", "2026-07-30", 1200, 1200, "Net 30")],
    unfiledPayments: [],
  },
  { accountId: "fixture-acct-sample-remodeling-co", name: "Sample Remodeling Co", status: "active", morawareJobs: [], unfiledInvoices: [], unfiledPayments: [] },
  { accountId: "fixture-acct-demo-cabinetry", name: "Demo Cabinetry", status: "active", morawareJobs: [mw("FIX-MW-88077", "Elm Ct Kitchen", "Installed", "2026-08-12")], unfiledInvoices: [], unfiledPayments: [] },
  { accountId: "fixture-acct-placeholder-builders", name: "Placeholder Builders", status: "active", morawareJobs: [], unfiledInvoices: [], unfiledPayments: [] },
  { accountId: "fixture-acct-example-kitchens-inc", name: "Example Kitchens Inc", status: "active", morawareJobs: [mw("FIX-MW-88140", "Prairie View Island", "Installed", "2026-09-11")], unfiledInvoices: [], unfiledPayments: [] },
  {
    accountId: null,
    qbRootListId: "FIX-CUST-UNLI",
    name: "Unlinked Customer Example",
    status: "not_in_directory",
    morawareJobs: [],
    unfiledInvoices: [inv("INV6950", "2026-08-15", "2026-08-15", 640, 640, "Due on receipt")],
    unfiledPayments: [],
  },
];

export const fixtureDataset = {
  mode: "fixture",
  asOf: FIXTURE_AS_OF,
  sources: fixtureSources,
  opportunities: fixtureOpportunities,
  customers: fixtureCustomers,
};
