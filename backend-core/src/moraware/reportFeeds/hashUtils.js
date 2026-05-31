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
    row = null
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
  if (accountName || jobName) return sha256Hex(canonical);
  return sha256Hex(JSON.stringify(row ?? {}));
}
