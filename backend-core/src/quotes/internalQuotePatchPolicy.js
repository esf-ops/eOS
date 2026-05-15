/**
 * Internal Estimate PATCH policy — lightweight metadata edits only.
 *
 * **Historical snapshot rule:** `quote_headers.calculation_snapshot` is the server-authored pricing artifact for that row’s revision.
 * It must match calculator output + curated `internal_ui` fragments merged at save time (`POST /api/internal-quotes/save`).
 * Clients must never PATCH raw snapshots onto existing rows — that would break reproducibility and audit trails.
 *
 * To update totals/pricing inputs on the **current** revision, call POST `/api/internal-quotes/save` with `save_mode: update_existing`
 * so `calculateQuote` recomputes the snapshot consistently with rooms/add-ons/custom lines.
 *
 * To revise pricing without altering older rows, use `save_mode: save_revision` — older revision snapshots remain frozen as-is.
 */

/**
 * @param {Record<string, unknown>} patch
 * @param {{ archived_at?: string|null; is_current_revision?: boolean|null }} row
 * @returns {{ ok: true } | { ok: false; httpStatus: number; error: string }}
 */
export function validateInternalQuotePatchContext(patch, row) {
  if (row.archived_at) {
    return {
      ok: false,
      httpStatus: 400,
      error: "Quote is archived — restore before patching metadata."
    };
  }
  if (row.is_current_revision === false) {
    return {
      ok: false,
      httpStatus: 400,
      error:
        "Historical revisions are immutable on PATCH — open the latest revision and use POST /api/internal-quotes/save (update_existing or save_revision)."
    };
  }
  if (Object.prototype.hasOwnProperty.call(patch, "calculation_snapshot")) {
    return {
      ok: false,
      httpStatus: 400,
      error:
        "calculation_snapshot cannot be PATCH'd — pricing snapshots are server-authored via POST /api/internal-quotes/save (update_existing recalculates from inputs)."
    };
  }
  return { ok: true };
}
