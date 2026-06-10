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
      estimatedSqft: num(header.estimated_sqft) ?? sanitized.estimatedSqft,
      materialGroup: sanitized.materialGroup || str(header.estimated_material_group)
    },
    estimateTotal: customerDisplayTotal,
    estimateTotalFormatted: customerDisplayTotal != null ? formatMoney(customerDisplayTotal) : null,
    summaryRows,
    roomSummaries: sanitized.roomSummaries,
    customerFacingNotes: sanitized.customerFacingNotes,
    showRoomBreakdown: sanitized.roomSummaries.length > 0,
    warnings,
    includeComparisonTable: Boolean(options.includeComparisonTable)
  };
}
