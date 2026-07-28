/**
 * Active-v4 Review & Publish readiness — real actionable information only.
 *
 * Historically, Digital Estimate publish readiness (studioEstimatePublicationAdapter.mjs)
 * reported *workflow-state* gaps — "Approve the Studio estimate before publishing",
 * "Current Takeoff must be approved", "The approved estimate changed and must be
 * recalculated" — because confirm/calculate/approve were separate estimator
 * clicks. Under the simplified active flow those steps are orchestrated
 * automatically by Publish (studioSimplifiedWorkflow.prepareEstimateForPublish);
 * an estimator should never see them as blockers.
 *
 * This pure module derives the ACTIVE-v4-facing eligible/blockers view from
 * real scope/configuration/calculation completeness instead — the same fields
 * Publish itself needs to succeed. It never reports legacy workflow-state
 * codes (estimate_not_approved, calculation_fingerprint_mismatch,
 * approved_snapshot_missing, pricing_engine_missing, takeoff_not_approved) as
 * blockers; those are Publish's own internal compatibility orchestration, not
 * estimator-facing gates.
 *
 * Pure module — browser-safe (no node:crypto), importable directly from the
 * Studio frontend (same pattern as studioScopeBilling.mjs).
 */

/**
 * @param {object|null|undefined} scope
 * @returns {{ hasIncludedRooms: boolean, hasIncludedPieces: boolean, hasMeasuredPiece: boolean }}
 */
function scopePieceCoverage(scope) {
  const rooms = Array.isArray(scope?.rooms) ? scope.rooms.filter((r) => r && r.included !== false) : [];
  const pieces = rooms.flatMap((r) => (Array.isArray(r.pieces) ? r.pieces.filter((p) => p && p.included !== false) : []));
  const hasMeasuredPiece = pieces.some(
    (p) => Number(p.sqft) > 0 || (Number(p.lengthIn) > 0 && Number(p.depthIn) > 0)
  );
  return {
    hasIncludedRooms: rooms.length > 0,
    hasIncludedPieces: pieces.length > 0,
    hasMeasuredPiece
  };
}

/**
 * Derive the active-v4 Review & Publish eligible/blockers view.
 * @param {{
 *   scope?: object|null,
 *   calculation?: { totals?: { customerDisplayTotal?: number|null }, unresolvedItems?: Array<{code?:string,message?:string}> } | null,
 *   calculationSnapshot?: object|null
 * }} estimate
 * @returns {{ eligible: boolean, blockers: Array<{ code: string, message: string }> }}
 */
export function deriveActiveReviewPublishReadiness(estimate) {
  const scope = estimate?.scope && typeof estimate.scope === "object" ? estimate.scope : {};
  const calculation = estimate?.calculation || estimate?.calculationSnapshot || null;
  /** @type {Array<{ code: string, message: string }>} */
  const blockers = [];

  if (!String(scope.customerEmail || "").trim()) {
    blockers.push({ code: "customer_email_required", message: "Customer email required" });
  }
  if (!String(scope.projectName || "").trim()) {
    blockers.push({ code: "project_name_required", message: "Project name required" });
  }

  const coverage = scopePieceCoverage(scope);
  if (!coverage.hasIncludedRooms || !coverage.hasIncludedPieces) {
    blockers.push({ code: "no_included_pieces", message: "No included countertop pieces" });
  } else if (!coverage.hasMeasuredPiece) {
    blockers.push({
      code: "no_measured_pieces",
      message: "No included measured pieces — enter dimensions or square footage"
    });
  }

  const hasMaterialGroup =
    String(scope.materialGroup || "").trim().length > 0 ||
    (Array.isArray(scope.rooms) &&
      scope.rooms.some((r) => r && r.included !== false && String(r.materialGroup || "").trim().length > 0));
  if (!hasMaterialGroup) {
    blockers.push({ code: "material_group_required", message: "Material group required" });
  }

  // Product-price gaps the v4 calculator itself could not resolve (e.g. a
  // sink/product selection with no published price) — pass through verbatim,
  // never re-labeled as a workflow-state error.
  const calcUnresolved = Array.isArray(calculation?.unresolvedItems) ? calculation.unresolvedItems : [];
  for (const item of calcUnresolved) {
    if (!item) continue;
    blockers.push({ code: item.code || "unresolved_item", message: item.message || "Product price unavailable" });
  }

  const displayTotal = Number(calculation?.totals?.customerDisplayTotal);
  if (
    coverage.hasMeasuredPiece &&
    hasMaterialGroup &&
    !calcUnresolved.length &&
    (!Number.isFinite(displayTotal) || displayTotal <= 0)
  ) {
    blockers.push({ code: "product_price_unavailable", message: "Product price unavailable" });
  }

  // De-duplicate by code (e.g. an unresolved item could coincide with a coverage gap).
  const seen = new Set();
  const deduped = blockers.filter((b) => {
    if (seen.has(b.code)) return false;
    seen.add(b.code);
    return true;
  });

  return { eligible: deduped.length === 0, blockers: deduped };
}
