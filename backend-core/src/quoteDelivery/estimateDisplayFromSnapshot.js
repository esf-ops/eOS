/**
 * Build customer-safe estimate display from a saved quote snapshot (no live pricing calc).
 */

import { sanitizeSnapshotForCustomer } from "./estimateContentSanitizer.js";

function str(v) {
  return v != null && String(v).trim() ? String(v).trim() : null;
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function formatMoney(n) {
  const v = Math.round(Number(n) || 0);
  if (v < 0) return `-$${Math.abs(v).toLocaleString("en-US")}`;
  return `$${Math.max(0, v).toLocaleString("en-US")}`;
}

/**
 * @param {Record<string, unknown>} header quote_headers row
 * @param {Record<string, unknown>} [options]
 */
export function buildCustomerEstimateDisplayFromSnapshot(header, options = {}) {
  const snapshot =
    header.calculation_snapshot && typeof header.calculation_snapshot === "object"
      ? header.calculation_snapshot
      : {};

  const { sanitized, warnings: sanitizeWarnings } = sanitizeSnapshotForCustomer(snapshot);
  const warnings = [...sanitizeWarnings];

  const customerDisplayTotal =
    sanitized.customerDisplayTotal != null && sanitized.customerDisplayTotal > 0
      ? sanitized.customerDisplayTotal
      : num(header.grand_total);

  if (sanitized.customerDisplayTotal == null) {
    warnings.push("customer_display_total missing — using grand_total for estimate total");
  }

  const summaryRows = [];
  if (customerDisplayTotal != null && customerDisplayTotal !== 0) {
    summaryRows.push({
      key: "project_total",
      label: "Estimated project total",
      displayAmount: customerDisplayTotal,
      displayFormatted: formatMoney(customerDisplayTotal)
    });
  }

  for (const line of sanitized.customerFacingCustomLines) {
    if (line.lineTotal == null) continue;
    summaryRows.push({
      key: `custom_${line.name}`,
      label: line.name,
      displayAmount: line.lineTotal,
      displayFormatted: formatMoney(line.lineTotal)
    });
  }

  const accountName =
    str(header.account_name) ||
    str(snapshot.internal_ui?.account_name) ||
    str(snapshot.internal_ui?.account) ||
    null;

  const preparedBy = str(header.prepared_by) || str(snapshot.internal_ui?.entered_by) || null;

  const printEmailData = extractPrintSnapshotEmailData(snapshot.internal_ui);

  const emailBreakdownRows =
    printEmailData?.breakdownRows?.length
      ? printEmailData.breakdownRows
      : buildLegacyEmailBreakdownRows(summaryRows);

  if (printEmailData?.breakdownRows?.length && customerDisplayTotal != null) {
    const breakdownSum = printEmailData.breakdownRows.reduce(
      (sum, row) => sum + (num(row.displayAmount) ?? 0),
      0
    );
    if (breakdownSum !== customerDisplayTotal) {
      warnings.push(
        `Saved estimate summary lines ($${breakdownSum.toLocaleString("en-US")}) do not match customer display total ($${customerDisplayTotal.toLocaleString("en-US")}). Re-save the quote to refresh customer delivery output.`
      );
    }
  }

  return {
    header: {
      quoteNumber: str(header.quote_number),
      revisionLabel: str(header.revision_label),
      revisionNumber: num(header.revision_number),
      accountName,
      customerName: str(header.customer_name),
      customerEmail: str(header.customer_email),
      projectName: str(header.project_name),
      projectAddress: str(header.project_address),
      city: str(header.city),
      state: str(header.state),
      branch: str(header.branch),
      salesRep: str(header.sales_rep),
      preparedBy,
      preparedByDisplayName: printEmailData?.preparedByDisplayName || preparedBy,
      estimateDate: printEmailData?.estimateDate || null,
      estimatedSqft: num(header.estimated_sqft) ?? sanitized.estimatedSqft,
      materialGroup: sanitized.materialGroup || str(header.estimated_material_group)
    },
    estimateTotal: customerDisplayTotal,
    estimateTotalFormatted: customerDisplayTotal != null ? formatMoney(customerDisplayTotal) : null,
    summaryRows,
    emailBreakdownRows,
    comparisonNote: printEmailData?.comparisonNote || null,
    roomSummaries: sanitized.roomSummaries,
    customerFacingNotes: sanitized.customerFacingNotes,
    showRoomBreakdown: sanitized.roomSummaries.length > 0,
    warnings,
    includeComparisonTable: Boolean(options.includeComparisonTable)
  };
}

function isProjectTotalRow(row) {
  const label = String(row?.label ?? "").trim().toLowerCase();
  const key = String(row?.key ?? "").trim().toLowerCase();
  return key === "project_total" || label.includes("estimated project total");
}

/**
 * @param {Array<{ key?: string, label?: string, displayAmount?: number, displayFormatted?: string }>} summaryRows
 */
function buildLegacyEmailBreakdownRows(summaryRows) {
  if (!Array.isArray(summaryRows)) return [];
  return summaryRows
    .filter((row) => row && !isProjectTotalRow(row))
    .map((row) => ({
      key: str(row.key) || str(row.label) || "row",
      label: str(row.label) || "Line item",
      displayAmount: num(row.displayAmount),
      displayFormatted: row.displayFormatted || formatMoney(row.displayAmount)
    }));
}

/**
 * @param {Record<string, unknown>|null|undefined} internalUi
 */
function extractPrintSnapshotEmailData(internalUi) {
  if (!internalUi || typeof internalUi !== "object") return null;
  const raw = internalUi.customer_estimate_print_snapshot;
  if (!raw || typeof raw !== "object") return null;

  const snapHeader = raw.header && typeof raw.header === "object" ? raw.header : {};
  const display = raw.display && typeof raw.display === "object" ? raw.display : {};

  const breakdownRows = [];
  if (Array.isArray(display.estimateSummaryRows)) {
    for (const row of display.estimateSummaryRows) {
      if (!row || typeof row !== "object") continue;
      if (isProjectTotalRow(row)) continue;
      const label = str(row.label);
      if (!label) continue;
      breakdownRows.push({
        key: str(row.key) || label,
        label,
        displayAmount: num(row.displayAmount),
        displayFormatted: formatMoney(row.displayAmount)
      });
    }
  }

  let comparisonNote = null;
  const comparison = display.roomComparisonTable;
  if (comparison && typeof comparison === "object" && Array.isArray(comparison.roomBlocks) && comparison.roomBlocks.length) {
    comparisonNote = comparison.isPerRoomMode
      ? "Optional alternate material comparisons are summarized in the detailed estimate."
      : "Optional material group comparisons are summarized in the detailed estimate.";
  }

  return {
    estimateDate: str(snapHeader.estimateDate),
    preparedByDisplayName: str(display.preparedByDisplayName),
    breakdownRows,
    comparisonNote
  };
}
