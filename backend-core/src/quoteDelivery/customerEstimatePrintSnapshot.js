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
 * @param {string} quoteNumber
 * @param {string|null|undefined} revisionLabel
 */
export function buildCustomerEstimatePdfFilename(quoteNumber, revisionLabel) {
  const qn = String(quoteNumber ?? "").trim();
  const rev = String(revisionLabel ?? "").trim();
  const suffix = rev ? `-${rev}` : "";
  return `Elite Stone Fabrication Estimate - ${qn}${suffix}.pdf`;
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
  if (!printSnapshotMatchesCustomerDisplayTotal(snap, cdt)) {
    return { snapshot: snap, reconciled: false, customerDisplayTotal: cdt };
  }
  return { snapshot: snap, reconciled: true, customerDisplayTotal: cdt };
}
