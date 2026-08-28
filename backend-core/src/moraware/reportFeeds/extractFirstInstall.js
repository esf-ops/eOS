/**
 * Extract JobTracker "First Install - {type} in Job" status/date from a report raw_row.
 * Pure. Does not infer from job-level API scheduled/completed fields.
 */

import { FIRST_INSTALL_ACTIVITY_TYPES } from "./constants.js";
import { parseSqft } from "./mapPreparedSalesWorksheetFact.js";
import { normalizeSpaces } from "./parseCsv.js";

export const QUALIFYING_FIRST_INSTALL_STATUSES = Object.freeze(["complete", "completed", "installed"]);
export const EXCLUDED_FIRST_INSTALL_STATUSES = Object.freeze([
  "scheduled",
  "confirmed",
  "estimate",
  "cancelled",
  "confirmed – accessories",
  "confirmed - accessories"
]);

export const FORM_IDENTITY_MATCHED = "MATCHED";
export const FORM_IDENTITY_UNRESOLVED = "FORM_IDENTITY_UNRESOLVED";
export const JOB_IDENTITY_UNRESOLVED = "JOB_IDENTITY_UNRESOLVED";

function cell(rawRow, header) {
  if (!rawRow || typeof rawRow !== "object") return "";
  return normalizeSpaces(rawRow[header] ?? "");
}

export function parseReportInstallDate(raw) {
  const s = normalizeSpaces(raw);
  if (!s) return null;
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) {
    return `${mdy[3]}-${mdy[1].padStart(2, "0")}-${mdy[2].padStart(2, "0")}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return null;
}

export function normalizeInstallStatus(raw) {
  return normalizeSpaces(raw).toLowerCase();
}

export function isQualifyingFirstInstallStatus(raw) {
  return QUALIFYING_FIRST_INSTALL_STATUSES.includes(normalizeInstallStatus(raw));
}

export function firstInstallStatusHeader(type) {
  return `First Install - ${type} in Job Status`;
}

export function firstInstallDateHeader(type) {
  return `First Install - ${type} in Job Date`;
}

/**
 * Earliest qualifying First Install in-Job Date across the eight typed groups.
 * @returns {{ status: string, activityType: string, date: string }|null}
 */
export function extractEarliestQualifyingFirstInstall(rawRow, types = FIRST_INSTALL_ACTIVITY_TYPES) {
  const hits = [];
  for (const type of types) {
    const status = cell(rawRow, firstInstallStatusHeader(type));
    if (!isQualifyingFirstInstallStatus(status)) continue;
    const date = parseReportInstallDate(cell(rawRow, firstInstallDateHeader(type)));
    if (!date) continue;
    hits.push({
      status: normalizeInstallStatus(status) === "installed" ? "Installed" : "Complete",
      activityType: type,
      date
    });
  }
  if (!hits.length) return null;
  hits.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return types.indexOf(a.activityType) - types.indexOf(b.activityType);
  });
  return hits[0];
}

export function extractWorksheetFormName(rawRow) {
  return cell(rawRow, "Job Worksheet - Form Name");
}

export function extractWorksheetSqft(rawRow) {
  return parseSqft(cell(rawRow, "Total Job Worksheet - Sq.Ft. by Job Creation Date"));
}

export function normalizeFormNameKey(value) {
  return normalizeSpaces(value).toLowerCase();
}
