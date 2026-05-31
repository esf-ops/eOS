import { createHash } from "node:crypto";
import { normalizeSpaces } from "./parseCsv.js";

export function sha256Hex(input) {
  return createHash("sha256").update(String(input ?? ""), "utf8").digest("hex");
}

/** Stable hash for report header contract validation. */
export function computeHeaderHash(headers) {
  const normalized = (headers || []).map((h) => normalizeSpaces(h).toLowerCase()).filter(Boolean);
  return sha256Hex(normalized.join("|"));
}

/**
 * Stable row hash for dedupe / prepared-facts identity.
 * Includes both job-level identity (account, job, status, date) AND
 * worksheet-line discriminators (formName, room, color, totalWorksheetSqft)
 * so that two worksheet rows for the same job produce distinct hashes
 * when their line details differ.
 *
 * Falls back to full row JSON only when both accountName and jobName are absent.
 *
 * @param {object} params
 * @param {string} [params.organizationId]
 * @param {string} [params.reportType]
 * @param {string} [params.accountName]
 * @param {string} [params.jobName]
 * @param {string} [params.jobStatus]
 * @param {string} [params.jobCreationDate]
 * @param {string} [params.formName]
 * @param {string} [params.room]
 * @param {string} [params.color]
 * @param {string} [params.totalWorksheetSqft]
 * @param {object|null} [params.row]          - Raw CSV row; used as fallback when no identity fields.
 * @param {string[]|null} [params.extraDiscriminators] - Optional additional normalized values folded into
 *   the hash after the base fields. Used by view-220 (sales_worksheet_history_facts) to include all 34
 *   column values so that rows identical in base fields but differing in detail fields (Edge, Thickness,
 *   Sink Type, etc.) still produce distinct hashes. Callers for view 219 MUST NOT pass this param —
 *   omitting it preserves the existing view-219 hash values exactly (backward-compatible).
 */
export function computeReportRowHash(params) {
  const {
    organizationId = "",
    reportType = "",
    accountName = "",
    jobName = "",
    jobStatus = "",
    jobCreationDate = "",
    formName = "",
    room = "",
    color = "",
    totalWorksheetSqft = "",
    row = null,
    extraDiscriminators = null
  } = params;
  const canonical = [
    String(organizationId),
    String(reportType),
    normalizeSpaces(accountName).toLowerCase(),
    normalizeSpaces(jobName).toLowerCase(),
    normalizeSpaces(jobStatus).toLowerCase(),
    normalizeSpaces(jobCreationDate),
    normalizeSpaces(formName).toLowerCase(),
    normalizeSpaces(room).toLowerCase(),
    normalizeSpaces(color).toLowerCase(),
    normalizeSpaces(totalWorksheetSqft)
  ].join("||");
  if (accountName || jobName) {
    const baseHash = sha256Hex(canonical);
    // When extra discriminators are provided (e.g. for sales_worksheet_history_facts),
    // fold them into the hash to distinguish rows that share all base fields but differ
    // in detail columns (Edge, Thickness, Sink Type, etc.). This is intentionally
    // backward-compatible: view 219 never passes extraDiscriminators, so its hashes
    // are unchanged by this code path.
    if (extraDiscriminators && extraDiscriminators.length > 0) {
      const extraStr = extraDiscriminators
        .map((v) => normalizeSpaces(String(v ?? "")))
        .join("||");
      return sha256Hex(baseHash + "|||" + extraStr);
    }
    return baseHash;
  }
  return sha256Hex(JSON.stringify(row ?? {}));
}
