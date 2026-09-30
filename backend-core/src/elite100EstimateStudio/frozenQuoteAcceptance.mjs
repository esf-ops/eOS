/**
 * "Accept as quoted": a customer may accept the exact published quote even when
 * online changes are unavailable (no configuration envelope), provided the frozen
 * quote itself can be proven intact and staff-approved. Pure validation only.
 */
import { sha256CanonicalJson } from "../digitalEstimate/digitalEstimateToken.mjs";

const REASON_MESSAGES = {
  frozen_quote_missing: "the published quote could not be loaded",
  frozen_quote_hash_missing: "the published quote has no integrity record",
  frozen_quote_integrity_failed: "the published quote does not match its integrity record",
  frozen_quote_total_invalid: "the published total is missing or invalid",
  frozen_quote_scope_missing: "the published quote has no rooms",
  estimate_not_approved: "the estimate is not staff-approved",
  estimate_approval_stale: "the estimate changed after staff approval",
  estimate_total_mismatch: "the published total does not match the approved estimate"
};

const cents = (v) => Math.round(Number(v) * 100);

/**
 * @param {{ publication: any, snap: any, estimate: any }} input
 * @returns {{ ok: true, total: number } | { ok: false, reasons: string[], message: string }}
 */
export function validateFrozenQuoteForAcceptance({ publication, snap, estimate }) {
  const reasons = [];
  const customerSnapshot =
    snap?.customer_snapshot_json && typeof snap.customer_snapshot_json === "object"
      ? snap.customer_snapshot_json
      : null;

  let total = null;
  if (!customerSnapshot) {
    reasons.push("frozen_quote_missing");
  } else {
    const storedHash = snap.customer_snapshot_hash || publication?.customer_snapshot_hash || null;
    if (!storedHash) reasons.push("frozen_quote_hash_missing");
    else if (sha256CanonicalJson(customerSnapshot) !== storedHash) {
      reasons.push("frozen_quote_integrity_failed");
    }
    const raw = Number(customerSnapshot.totals?.estimatedProjectTotal);
    if (!Number.isFinite(raw) || raw <= 0) reasons.push("frozen_quote_total_invalid");
    else total = cents(raw) / 100;
    if (!Array.isArray(customerSnapshot.rooms) || customerSnapshot.rooms.length === 0) {
      reasons.push("frozen_quote_scope_missing");
    }
  }

  const approval = estimate?.approval && typeof estimate.approval === "object" ? estimate.approval : null;
  const calc = estimate?.calculationSnapshot || estimate?.calculation || null;
  if (!approval) {
    reasons.push("estimate_not_approved");
  } else {
    const approvedFp = approval.calculationFingerprint || null;
    const calcFp = calc?.fingerprint || estimate?.calculationFingerprint || null;
    if (estimate.staleReason || !approvedFp || !calcFp || approvedFp !== calcFp) {
      reasons.push("estimate_approval_stale");
    }
    const approvedTotal = Number(calc?.totals?.customerDisplayTotal ?? approval.customerDisplayTotal);
    if (total != null && (!Number.isFinite(approvedTotal) || cents(approvedTotal) !== cents(total))) {
      reasons.push("estimate_total_mismatch");
    }
  }

  if (reasons.length) {
    return {
      ok: false,
      reasons,
      message: `This estimate can't be accepted online because ${reasons
        .map((r) => REASON_MESSAGES[r] || r)
        .join("; ")}. Please contact Elite Stone Fabrication.`
    };
  }
  return { ok: true, total };
}
