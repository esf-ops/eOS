/**
 * Connected workspace model (prototype): customer → project → quote/job → financial records.
 *
 * Identity contract (docs/eliteos/CONNECTED_WORKSPACE_DESIGN.md §2):
 * - Customer = Account Directory UUID (exact QuickBooks root link). Unlinked QuickBooks roots stay visible
 *   as "not in Account Directory" — never merged by name.
 * - Project = QuickBooks Customer:Job. Estimates, sales orders, invoices and open A/R all carry that job ID.
 * - Transactions posted to the customer root (no job) stay on the customer as "not filed under a job".
 *
 * A/R uses the verified Account Directory aging (`buildOpenArAging`, FEATURE_DECISIONS §315): positive
 * balances only, QuickBooks DueDate only, missing due date → unknown (never overdue, never zero).
 */
import { buildOpenArAging } from "../../../backend-core/src/accountDirectory/accountDirectoryFinancialIntelligence.mjs";
import { currentRevision, firstQuotedAt, knownSum, opportunityStage, orderedRevisions, projectSalesOrders } from "./eccModel.mjs";

/** Systems that own data shown in the workspace. */
export const SYSTEMS = {
  quickbooks: { label: "QuickBooks", role: "Quotes, sales orders, invoices, payments, A/R" },
  moraware: { label: "Moraware", role: "Production jobs" },
  account_directory: { label: "Account Directory", role: "Customer identity and links" },
  monday: { label: "Monday", role: "Account owner" },
  slabos: { label: "slabOS", role: "Workflow records (phase 2)" },
};

/**
 * Field → owning system. The workspace never stores a second copy of a QuickBooks or Moraware
 * value; slabOS-owned fields are workflow facts that no other system holds.
 */
export const FIELD_OWNERSHIP = {
  "customer.name": "account_directory",
  "customer.status": "account_directory",
  "customer.links": "account_directory",
  "customer.accountOwner": "monday",
  "project.name": "quickbooks",
  "project.branch": "quickbooks",
  "project.salesRep": "quickbooks",
  "project.estimator": null,
  "project.stage": "derived",
  "quote.revisions": "quickbooks",
  "job.salesOrders": "quickbooks",
  "finance.invoices": "quickbooks",
  "finance.payments": "quickbooks",
  "finance.openAr": "quickbooks",
  "production.morawareJobs": "moraware",
  "workflow.followUps": "slabos",
  "workflow.assignments": "slabos",
  "workflow.handoff": "slabos",
};

const DAY_MS = 86_400_000;
const ymd = (iso) => (iso ? String(iso).slice(0, 10) : null);
const inRange = (iso, from, to) => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) && t >= Date.parse(from) && t < Date.parse(to) + DAY_MS;
};

function toArRows(invoices, customerName) {
  return (invoices ?? []).map((i) => ({
    balance: i.balance,
    due_date: i.dueDate ?? null,
    invoice_date: i.invoiceDate ?? null,
    reference_number: i.refNumber ?? null,
    original_amount: i.amount ?? null,
    customer_name: customerName ?? null,
  }));
}

export function projectFinancials(opp, asOf) {
  const salesOrders = projectSalesOrders(opp);
  const invoices = opp.financial?.invoices ?? [];
  const payments = opp.financial?.payments ?? [];
  const ar = buildOpenArAging(toArRows(invoices, opp.customer?.name), ymd(asOf));
  const openBalance = knownSum(invoices.filter((i) => Number(i.balance) > 0).map((i) => i.balance));
  return {
    salesOrders,
    soldTotal: knownSum(salesOrders.map((s) => s.amount)),
    invoices,
    invoicedTotal: knownSum(invoices.map((i) => i.amount)),
    payments,
    collectedTotal: knownSum(payments.map((p) => p.amount)),
    openAr: invoices.length ? openBalance.value ?? 0 : 0,
    aging: ar,
  };
}

/** Stable browser key for a customer. Production uses the Account Directory UUID or an opaque token. */
export function customerKey(customer) {
  if (customer?.accountId) return customer.accountId;
  return `unlinked:${customer?.qbRootListId ?? customer?.name ?? "unknown"}`;
}

/**
 * Build the customer index from projects plus customer-level records (root-level invoices, Moraware jobs).
 * @param {any[]} opps @param {any[]} customerRecords @param {string} asOf
 */
export function buildCustomers(opps, customerRecords, asOf) {
  const recordByKey = new Map((customerRecords ?? []).map((c) => [customerKey(c), c]));
  /** @type {Map<string, any>} */
  const out = new Map();
  for (const o of opps) {
    const key = customerKey(o.customer);
    let c = out.get(key);
    if (!c) {
      const rec = recordByKey.get(key) ?? {};
      c = {
        key,
        accountId: o.customer?.accountId ?? null,
        name: o.customer?.name ?? null,
        linked: Boolean(o.customer?.accountId),
        status: rec.status ?? (o.customer?.accountId ? null : "not_in_directory"),
        accountOwner: rec.accountOwner ?? o.accountOwner ?? null,
        morawareJobs: rec.morawareJobs ?? [],
        unfiledInvoices: rec.unfiledInvoices ?? [],
        unfiledPayments: rec.unfiledPayments ?? [],
        projectIds: [],
      };
      out.set(key, c);
    }
    c.projectIds.push(o.id);
  }
  const oppById = new Map(opps.map((o) => [o.id, o]));
  for (const c of out.values()) {
    const projectInvoices = c.projectIds.flatMap((id) => oppById.get(id)?.financial?.invoices ?? []);
    const allInvoices = [...projectInvoices, ...c.unfiledInvoices];
    c.aging = buildOpenArAging(toArRows(allInvoices, c.name), ymd(asOf));
    c.openAr = knownSum(allInvoices.filter((i) => Number(i.balance) > 0).map((i) => i.balance)).value ?? 0;
    c.unfiledOpenAr = knownSum(c.unfiledInvoices.filter((i) => Number(i.balance) > 0).map((i) => i.balance)).value ?? 0;
    c.openPipeline = knownSum(
      c.projectIds.map((id) => oppById.get(id)).filter((o) => o && opportunityStage(o) === "open").map((o) => currentRevision(o)?.total),
    );
    const linkedMw = new Set(c.projectIds.map((id) => oppById.get(id)?.handoff?.morawareJobId).filter(Boolean));
    c.morawareJobs = c.morawareJobs.map((j) => ({
      ...j,
      projectId: c.projectIds.find((id) => oppById.get(id)?.handoff?.morawareJobId === j.sourceJobId) ?? null,
      linkedToProject: linkedMw.has(j.sourceJobId),
    }));
  }
  return [...out.values()].sort((a, b) => b.openAr - a.openAr || String(a.name).localeCompare(String(b.name)));
}

/**
 * A/R and booking metrics with drill targets. `drillKind` tells the UI whether ids are customers or projects.
 * Open A/R matches the Finance head total by construction: same rows, same positive-balance rule.
 */
export function workspaceMetrics(opps, customers, { from, to, freshnessByKey }) {
  const arStale = ["stale", "snapshot", "unknown"].includes(freshnessByKey.qb_ar?.state ?? "unknown");
  const soStale = ["stale", "snapshot", "unknown"].includes(freshnessByKey.qb_sales_orders?.state ?? "unknown");
  const withAr = customers.filter((c) => c.openAr > 0);
  const overdue = customers.filter((c) => c.aging.overdueBalance > 0);
  const unknownDue = customers.reduce((n, c) => n + c.aging.unknownDueCount, 0);
  const unlinkedAr = customers.filter((c) => !c.linked && c.openAr > 0);
  const unfiled = customers.filter((c) => c.unfiledOpenAr > 0);
  const totalAr = customers.reduce((s, c) => s + c.openAr, 0);
  const overdueAr = customers.reduce((s, c) => s + c.aging.overdueBalance, 0);

  const changeOrderProjects = opps.filter((o) => {
    const sos = projectSalesOrders(o);
    return sos.length > 1 && sos.slice(1).some((s) => inRange(s.date, from, to));
  });

  const state = (stale, partial) => (stale ? "stale" : partial ? "partial" : "ok");
  return [
    {
      key: "open_ar",
      label: "Open A/R",
      value: totalAr,
      format: "money",
      state: state(arStale, unknownDue > 0),
      reason: [unknownDue ? `${unknownDue} open invoice(s) have no QuickBooks due date.` : null, arStale ? "A/R snapshot is past its freshness window." : null]
        .filter(Boolean)
        .join(" ") || null,
      drillKind: "customers",
      drill: withAr.map((c) => c.key),
      owner: "quickbooks",
      definition: "Sum of positive open invoice balances in the QuickBooks A/R snapshot. Same rows and rule as the Finance head.",
    },
    {
      key: "overdue_ar",
      label: "Overdue A/R",
      value: overdueAr,
      format: "money",
      state: state(arStale, unknownDue > 0),
      reason: unknownDue ? "Invoices without a due date are excluded from overdue, not counted as current." : null,
      drillKind: "customers",
      drill: overdue.map((c) => c.key),
      owner: "quickbooks",
      definition: "Open balance past the QuickBooks invoice due date. Due dates are never inferred from terms.",
    },
    {
      key: "change_orders",
      label: "Projects with change orders",
      value: changeOrderProjects.length,
      format: "count",
      state: state(soStale, false),
      reason: null,
      drillKind: "projects",
      drill: changeOrderProjects.map((o) => o.id),
      owner: "quickbooks",
      definition: "Projects with an additional sales order dated in the period after the first one.",
    },
    {
      key: "ar_unlinked",
      label: "A/R not in Account Directory",
      value: unlinkedAr.reduce((s, c) => s + c.openAr, 0),
      format: "money",
      state: state(arStale, false),
      reason: null,
      drillKind: "customers",
      drill: unlinkedAr.map((c) => c.key),
      owner: "account_directory",
      definition: "Open A/R whose QuickBooks customer has no Account Directory link. Shown so totals reconcile; fix by linking, not by name matching.",
    },
    {
      key: "ar_unfiled",
      label: "A/R not filed under a job",
      value: unfiled.reduce((s, c) => s + c.unfiledOpenAr, 0),
      format: "money",
      state: state(arStale, false),
      reason: null,
      drillKind: "customers",
      drill: unfiled.map((c) => c.key),
      owner: "quickbooks",
      definition: "Open invoices posted to the customer, not a QuickBooks job. They stay on the customer and are never assigned to a project by guess.",
    },
  ];
}

/** Project detail view model. Everything is read-only in v1. */
export function projectDetail(opp, customers, asOf) {
  const fin = projectFinancials(opp, asOf);
  const customer = customers.find((c) => c.projectIds.includes(opp.id)) ?? null;
  const linkedMw = opp.handoff?.morawareJobId
    ? customer?.morawareJobs.find((j) => j.sourceJobId === opp.handoff.morawareJobId) ?? { sourceJobId: opp.handoff.morawareJobId, name: null, status: null }
    : null;
  return {
    opp,
    customer,
    stage: opportunityStage(opp),
    revisions: orderedRevisions(opp),
    current: currentRevision(opp),
    firstQuotedAt: firstQuotedAt(opp),
    fin,
    production: {
      linked: linkedMw,
      customerJobsNotLinked: (customer?.morawareJobs ?? []).filter((j) => !j.linkedToProject),
    },
  };
}
