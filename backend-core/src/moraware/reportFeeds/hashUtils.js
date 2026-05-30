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
 * Uses canonical business columns when present; falls back to full row JSON.
 */
export function computeReportRowHash(params) {
  const {
    organizationId = "",
    reportType = "",
    accountName = "",
    jobName = "",
    jobStatus = "",
    jobCreationDate = "",
    row = null
  } = params;
  const canonical = [
    String(organizationId),
    String(reportType),
    normalizeSpaces(accountName).toLowerCase(),
    normalizeSpaces(jobName).toLowerCase(),
    normalizeSpaces(jobStatus).toLowerCase(),
    normalizeSpaces(jobCreationDate)
  ].join("||");
  if (accountName || jobName) return sha256Hex(canonical);
  return sha256Hex(JSON.stringify(row ?? {}));
}
