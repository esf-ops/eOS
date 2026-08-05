/**
 * Quote Flow Estimates library row selection (non-destructive).
 */

import { isOfficialScopeSet } from "./quoteFlowScope.mjs";

/**
 * Collapse scoped estimate rows to one official library row per intake case.
 * Keeps highest revision (then newest updatedAt). Rows without intakeCaseId
 * stay unique by estimate id. Does not delete sibling revisions.
 * @param {object[]} rows
 */
export function selectOfficialQuoteFlowLibraryRows(rows) {
  const list = Array.isArray(rows) ? rows.filter(Boolean) : [];
  /** @type {Map<string, object>} */
  const byKey = new Map();
  for (const row of list) {
    if (!isOfficialScopeSet(row)) continue;
    const caseId = String(row.intakeCaseId || "").trim();
    const key = caseId || `id:${String(row.id || "")}`;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, row);
      continue;
    }
    const prevRev = Number(prev.revision) || 0;
    const nextRev = Number(row.revision) || 0;
    if (nextRev > prevRev) {
      byKey.set(key, row);
      continue;
    }
    if (nextRev === prevRev) {
      const prevTs = Date.parse(String(prev.updatedAt || prev.createdAt || "")) || 0;
      const nextTs = Date.parse(String(row.updatedAt || row.createdAt || "")) || 0;
      if (nextTs >= prevTs) byKey.set(key, row);
    }
  }
  return [...byKey.values()];
}
