/**
 * Parse and validate frozen customer print snapshots from saved quote snapshots.
 */

export const PRINT_SNAPSHOT_VERSION = 1;

/**
 * @param {unknown} raw
 * @returns {Record<string, unknown>|null}
 */
export function parseCustomerEstimatePrintSnapshot(raw) {
  if (!raw || typeof raw !== "object") return null;
  const snap = raw;
  if (Number(snap.version) !== PRINT_SNAPSHOT_VERSION) return null;
  const finalRounded = Math.round(Number(snap.finalRounded));
  if (!Number.isFinite(finalRounded) || finalRounded <= 0) return null;
  if (!snap.header || typeof snap.header !== "object") return null;
  if (!snap.display || typeof snap.display !== "object") return null;
  const quoteNumber = String(snap.header.quoteNumber ?? "").trim();
  if (!quoteNumber) return null;
  return snap;
}

/**
 * @param {Record<string, unknown>} snapshot
 * @param {number|null|undefined} customerDisplayTotal
 */
export function printSnapshotMatchesCustomerDisplayTotal(snapshot, customerDisplayTotal) {
  const cdt = Math.round(Number(customerDisplayTotal));
  if (!Number.isFinite(cdt) || cdt <= 0) return true;
  return Math.round(Number(snapshot.finalRounded)) === cdt;
}

/**
 * Estimate Summary rows must sum to finalRounded (customer-facing reconciliation).
 *
 * @param {Record<string, unknown>} snapshot
 */
export function printSnapshotSummaryRowsReconcile(snapshot) {
  const finalRounded = Math.round(Number(snapshot?.finalRounded));
  if (!Number.isFinite(finalRounded) || finalRounded <= 0) return false;
  const display = snapshot.display && typeof snapshot.display === "object" ? snapshot.display : null;
  const rows = display?.estimateSummaryRows;
  if (!Array.isArray(rows) || rows.length === 0) return true;
  const summarySum = rows.reduce((sum, row) => {
    if (!row || typeof row !== "object") return sum;
    const amount = Math.round(Number(row.displayAmount));
    return sum + (Number.isFinite(amount) ? amount : 0);
  }, 0);
  return summarySum === finalRounded;
}

/**
 * Optional comparison blocks must reconcile displayed line items to room totals.
 *
 * @param {Record<string, unknown>} snapshot
 */
export function printSnapshotComparisonReconciles(snapshot) {
  const display = snapshot.display && typeof snapshot.display === "object" ? snapshot.display : null;
  const table = display?.roomComparisonTable;
  if (!table || typeof table !== "object") return true;
  const roomBlocks = table.roomBlocks;
  if (!Array.isArray(roomBlocks) || roomBlocks.length === 0) return true;

  for (const roomBlock of roomBlocks) {
    if (!roomBlock || typeof roomBlock !== "object") continue;
    const groupBlocks = roomBlock.groupBlocks;
    if (!Array.isArray(groupBlocks)) continue;
    for (const groupBlock of groupBlocks) {
      if (!groupBlock || typeof groupBlock !== "object") continue;
      const material =
        Math.round(Number(groupBlock.countertopDisplay) || 0) +
        Math.round(Number(groupBlock.backsplashDisplay) || 0) +
        Math.round(Number(groupBlock.fhbDisplay) || 0);
      let extras = Math.round(Number(groupBlock.addonsDisplay) || 0);
      if (Array.isArray(groupBlock.extraLines) && groupBlock.extraLines.length > 0) {
        extras = groupBlock.extraLines.reduce((sum, line) => {
          if (!line || typeof line !== "object") return sum;
          const amount = Math.round(Number(line.displayAmount));
          return sum + (Number.isFinite(amount) ? amount : 0);
        }, 0);
      }
      const roomTotal = Math.round(Number(groupBlock.roomTotalDisplay) || 0);
      if (material + extras !== roomTotal) return false;
    }
  }
  return true;
}

/**
 * Comparison blocks with add-ons must carry itemized extraLines (post–project-misc fix).
 *
 * @param {Record<string, unknown>} snapshot
 */
export function printSnapshotComparisonHasExtraLineMetadata(snapshot) {
  const display = snapshot.display && typeof snapshot.display === "object" ? snapshot.display : null;
  const table = display?.roomComparisonTable;
  if (!table || typeof table !== "object") return true;
  const roomBlocks = table.roomBlocks;
  if (!Array.isArray(roomBlocks) || roomBlocks.length === 0) return true;

  for (const roomBlock of roomBlocks) {
    if (!roomBlock || typeof roomBlock !== "object") continue;
    const groupBlocks = roomBlock.groupBlocks;
    if (!Array.isArray(groupBlocks)) continue;
    for (const groupBlock of groupBlocks) {
      if (!groupBlock || typeof groupBlock !== "object") continue;
      const addonsDisplay = Math.round(Number(groupBlock.addonsDisplay) || 0);
      if (addonsDisplay > 0 && !Array.isArray(groupBlock.extraLines)) return false;
    }
  }
  return true;
}

/**
 * @param {string} quoteNumber
 * @param {string|null|undefined} revisionLabel
 */
export function buildCustomerEstimatePdfFilename(quoteNumber, revisionLabel) {
  const qn = String(quoteNumber ?? "").trim();
  const rev = String(revisionLabel ?? "").trim();
  if (!qn) return "Elite Stone Fabrication Estimate.pdf";
  if (!rev) {
    return `Elite Stone Fabrication Estimate - ${qn}.pdf`;
  }
  const normalizedRev = rev.startsWith("-") ? rev.slice(1) : rev;
  const revSuffix = rev.startsWith("-") ? rev : `-${rev}`;
  if (qn.endsWith(revSuffix) || qn.endsWith(`-${normalizedRev}`) || qn.endsWith(normalizedRev)) {
    return `Elite Stone Fabrication Estimate - ${qn}.pdf`;
  }
  return `Elite Stone Fabrication Estimate - ${qn}${revSuffix}.pdf`;
}

/**
 * @param {Record<string, unknown>} snapshotToStore
 * @param {string|null|undefined} quoteNumber
 */
export function patchPrintSnapshotQuoteNumber(snapshotToStore, quoteNumber) {
  const qn = String(quoteNumber ?? "").trim();
  if (!qn || !snapshotToStore || typeof snapshotToStore !== "object") return snapshotToStore;
  const iu = snapshotToStore.internal_ui;
  if (!iu || typeof iu !== "object") return snapshotToStore;
  const ps = iu.customer_estimate_print_snapshot;
  if (!ps || typeof ps !== "object") return snapshotToStore;
  iu.customer_estimate_print_snapshot = {
    ...ps,
    header: {
      ...(ps.header && typeof ps.header === "object" ? ps.header : {}),
      quoteNumber: qn
    }
  };
  return snapshotToStore;
}

/**
 * @param {Record<string, unknown>} row quote_headers row
 */
export function loadPrintSnapshotFromQuoteRow(row) {
  const calc =
    row?.calculation_snapshot && typeof row.calculation_snapshot === "object"
      ? row.calculation_snapshot
      : null;
  const iu =
    calc?.internal_ui && typeof calc.internal_ui === "object" ? calc.internal_ui : null;
  const snap = parseCustomerEstimatePrintSnapshot(iu?.customer_estimate_print_snapshot);
  if (!snap) return null;
  const cdt = Number(iu?.customer_display_total);
  const cdtReconciled = printSnapshotMatchesCustomerDisplayTotal(snap, cdt);
  const summaryReconciled = printSnapshotSummaryRowsReconcile(snap);
  const comparisonReconciled = printSnapshotComparisonReconciles(snap);
  const comparisonMetadataOk = printSnapshotComparisonHasExtraLineMetadata(snap);
  if (!cdtReconciled || !summaryReconciled || !comparisonReconciled || !comparisonMetadataOk) {
    return {
      snapshot: snap,
      reconciled: false,
      customerDisplayTotal: cdt,
      summaryReconciled,
      cdtReconciled,
      comparisonReconciled,
      comparisonMetadataOk
    };
  }
  return { snapshot: snap, reconciled: true, customerDisplayTotal: cdt };
}
