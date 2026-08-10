/**
 * Proposed Sales Financial Truth definitions from offline QB evidence.
 * Does not change Sales Dashboard production behavior.
 */

/**
 * @param {object} ctx
 */
export function buildSalesFinancialTruthProposal(ctx) {
  const {
    flowSummary,
    linkAnalysis,
    amountVariance,
    paymentAnalysis,
    invoiceAnalysis,
    salesOrderAnalysis,
    estimateAnalysis,
  } = ctx;

  const metrics = [
    {
      metric: "Quoted $",
      proposedDefinition:
        "Sum of QuickBooks Estimate.TotalAmount for Estimates in the reporting period (optionally active-only or created-in-period). Parallel: slabOS Quote Flow / Studio estimates for operational quoting not yet in QB.",
      primarySource: "QuickBooks Estimates",
      secondarySource: "slabOS Quote Flow / Digital Estimate publications",
      confidence: "STRONGLY_SUPPORTED_BY_QB_DATA",
      financialTruth: true,
      operationalTruth: false,
      evidence: [
        `Export contains ${estimateAnalysis.profile.estimateCount} Estimates totaling $${estimateAnalysis.profile.totalAmountSum}.`,
        "Estimates are the historical quote document of record in QuickBooks.",
      ],
      openQuestions: [
        "Filter IsActive=true only, or all Estimates created in period?",
        "How to avoid double-counting revised Estimates that share related jobs?",
      ],
    },
    {
      metric: "Accepted $",
      proposedDefinition:
        "Sum of Digital Estimate acceptance customer_display_total (slabOS). Not a QuickBooks Estimate field.",
      primarySource: "slabOS Digital Estimate acceptances",
      secondarySource: null,
      confidence: "PROPOSED",
      financialTruth: false,
      operationalTruth: true,
      evidence: [
        "QB Estimate has no acceptance timestamp/flag equivalent to Digital Estimate acceptance.",
        "IsActive is not acceptance.",
      ],
      openQuestions: [
        "Should Accepted $ require Account Directory ↔ QB customer link before counting toward financial funnel?",
      ],
    },
    {
      metric: "Booked / Sold $",
      proposedDefinition:
        "STRONGEST CANDIDATE from this export: QuickBooks Sales Order.TotalAmount (created/in period), typically memo-linked to an Estimate. Do NOT treat Invoice creation alone as Sold without a business decision — invoices also occur without SO, and many Estimates never convert.",
      primarySource: "QuickBooks Sales Orders",
      secondarySource: "slabOS Mark Sold (operational) — keep distinct until reconciled",
      confidence: "NEEDS_BUSINESS_DECISION",
      financialTruth: true,
      operationalTruth: false,
      evidence: [
        `Sales Orders in export: ${salesOrderAnalysis.count}, total $${salesOrderAnalysis.totalAmountSum}.`,
        `~${pct(salesOrderAnalysis.memoInference.inferredUnique, salesOrderAnalysis.count)} of Sales Orders inferentially link to an Estimate via Memo 'Estimate {RefNumber}:'.`,
        `~${pct(salesOrderAnalysis.fullyInvoiced, salesOrderAnalysis.count)} of Sales Orders have IsFullyInvoiced=true — SO is a real pre-invoice booking stage.`,
        "Native LinkedTxn confirmation unavailable in this export.",
        "slabOS Mark Sold is an operational checklist and must not be silently equated to QB SO.",
      ],
      openQuestions: [
        "Confirm with Elite Stone finance that Sales Order creation is the official 'Sold/Booked' event.",
        "How to treat SO that are manually closed / never invoiced?",
        "How to treat Invoice-without-SO paths in Sold reporting?",
      ],
      alternativeCandidates: [
        {
          candidate: "Invoice.TotalAmount as Sold",
          confidence: "PROPOSED",
          whyWeak:
            "Invoicing is billing truth, not necessarily booking truth; timing differs; deposits/progress invoices possible.",
        },
        {
          candidate: "Estimate IsActive flip / custom field",
          confidence: "INSUFFICIENT_DATA",
          whyWeak: "No clear sold flag on Estimates in export; IsActive=false is common for old quotes.",
        },
      ],
    },
    {
      metric: "Invoiced $",
      proposedDefinition: "Sum of QuickBooks Invoice.TotalAmount in period.",
      primarySource: "QuickBooks Invoices",
      secondarySource: null,
      confidence: "CONFIRMED_FROM_QB_DATA",
      financialTruth: true,
      operationalTruth: false,
      evidence: [
        `Invoices in export: ${invoiceAnalysis.count}, total $${invoiceAnalysis.totalAmountSum}.`,
      ],
      openQuestions: ["Pending vs non-pending invoices?", "Finance charge invoices?"],
    },
    {
      metric: "Collected $",
      proposedDefinition: "Sum of QuickBooks ReceivePayment.TotalAmount in period.",
      primarySource: "QuickBooks Payments",
      secondarySource: null,
      confidence: "STRONGLY_SUPPORTED_BY_QB_DATA",
      financialTruth: true,
      operationalTruth: false,
      evidence: [
        `Payments in export: ${paymentAnalysis.count}, total $${paymentAnalysis.totalAmountSum}.`,
        "Cannot allocate collections to invoices in this export (AppliedToTxnRet absent).",
      ],
      openQuestions: ["UnusedPayment / credits handling?", "Deposit vs applied cash?"],
    },
    {
      metric: "Open AR",
      proposedDefinition: "Sum of Invoice.BalanceRemaining where balance > 0 (as-of snapshot).",
      primarySource: "QuickBooks Invoices.BalanceRemaining",
      secondarySource: null,
      confidence: "CONFIRMED_FROM_QB_DATA",
      financialTruth: true,
      operationalTruth: false,
      evidence: [
        `Open AR invoice count (balance>0): ${invoiceAnalysis.openArCount}; BalanceRemaining sum $${invoiceAnalysis.openArAmountSum}.`,
      ],
      openQuestions: ["Aging buckets already exist in QuickBooks Intelligence — reuse rather than redefining."],
    },
  ];

  return {
    generatedAt: new Date().toISOString(),
    principle:
      "Financial truth (QB) and operational truth (Moraware production / slabOS lifecycle) must remain separate. Do not replace Moraware sqft/schedule with QB amounts.",
    salesDashboardNote:
      "This proposal is discovery-only. Sales Dashboard production behavior is unchanged in this task.",
    dominantHistoricalPaths: flowSummary.dominantPaths,
    linkConfidence: {
      confirmedLinkCount: linkAnalysis.confirmedLinks.count,
      inferredMemoLinkRule: linkAnalysis.inferredLinks.rule,
    },
    amountVarianceSummary: {
      estimateToSalesOrder: amountVariance.estimateToSalesOrder,
      estimateToInvoice: amountVariance.estimateToInvoice,
      salesOrderToInvoice: amountVariance.salesOrderToInvoice_sharedEstimate,
    },
    metrics,
    strongestSoldCandidate: {
      candidate: "QuickBooks Sales Order.TotalAmount",
      confidence: "NEEDS_BUSINESS_DECISION",
      why:
        "High volume, strong Estimate memo linkage, IsFullyInvoiced shows SO precedes invoice completion — but finance must confirm SO == Sold.",
    },
    unresolvedBusinessDecisions: [
      "Does Sales Order creation equal Booked/Sold $ for Elite Stone finance?",
      "How should Invoice-without-SO be counted in Sold vs Invoiced?",
      "Should Quoted $ include inactive Estimates?",
      "RefNumber policy for future slabOS→QB Estimate writeback",
      "Tax model reconciliation (QB sales tax vs slabOS 2% use tax)",
      "Salesperson of record: txn SalesRepRef vs Account Directory owner vs slabOS createdBy",
    ],
    futureReadOnlyCDataNeeds: [
      "IncludeLinkedTxns on Estimate / SalesOrder / Invoice queries for CONFIRMED_LINK graph",
      "ReceivePayment AppliedToTxnRet for collection allocation and invoice-level Collected $",
      "Templates, CustomerMsg, PaymentMethod, SalesTaxCode list queries",
      "Possibly Estimate IsFullyInvoiced / related flags if available in company file version",
    ],
  };
}

function pct(num, den) {
  if (!den) return "0%";
  return `${Math.round((num / den) * 1000) / 10}%`;
}
