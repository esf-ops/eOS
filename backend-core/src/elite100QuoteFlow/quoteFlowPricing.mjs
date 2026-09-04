/**
 * Quote Flow Estimates — Pricing tab (internal only).
 * Reuses Studio V2 pricing helpers + calculateStudioEstimateV4.
 * Does not approve, publish Digital Estimate, accept, or mark sold.
 */

import { createQuoteFlowError } from "./quoteFlowErrors.mjs";
import { isOfficialScopeSet } from "./quoteFlowScope.mjs";
import { summarizeOfficialScope } from "./quoteFlowEstimatesPresenter.mjs";
import {
  resolvePieceOpenEdgeLf,
  stampPieceOpenEdgeLf,
  syncPieceOpeningsIntoOfficialScopeAddOns
} from "./quoteFlowOpenEdge.mjs";
import { stampStudioOpeningsOntoPiece } from "./quoteFlowCutouts.mjs";
import {
  buildStudioV2EditablePricing,
  normalizeStudioV2PricingPatch,
  normalizeStudioV2MaterialGroup,
  STUDIO_V2_MATERIAL_GROUPS,
  STUDIO_V2_PRICING_BASES
} from "../elite100EstimateStudio/studioV2Pricing.mjs";
import {
  buildStudioV2CalculationResult,
  isStudioV2CalculationPersistable
} from "../elite100EstimateStudio/studioV2WorkingDraft.mjs";
import { calculateStudioEstimateV4 } from "../elite100EstimateStudio/elite100RoomPricingStudioAdapter.mjs";
import { STUDIO_ESTIMATE_STATUSES } from "../elite100EstimateStudio/studioEstimateTypes.mjs";
import {
  applyQuoteFlowCustomLineItemsToScope,
  presentQuoteFlowEdgeStatus,
  readQuoteFlowCustomLineItems,
  summarizeQuoteFlowCustomLineItems
} from "./quoteFlowCustomLineItems.mjs";
import { markQuoteFlowReviewStaleOnScope } from "./quoteFlowReviewMeta.mjs";
import { customerSafeCutoutLinesFromCharges } from "../elite100EstimateStudio/customerSafeCutoutPresentation.mjs";
import { mergePricedCutoutsIntoFabricationAddOns } from "../elite100EstimateStudio/elite100RoomPricingStudioAdapter.mjs";

const NO_SIDE_EFFECTS = Object.freeze({
  calculated: false,
  approved: false,
  published: false,
  sold: false,
  accepted: false,
  digitalEstimateCreated: false,
  takeoffRerun: false,
  refreshScopeFromTakeoff: false,
  estimateApproved: false
});

/**
 * Ensure openEdgeLf stamps finishedEdgeLf before calculator mapping.
 * @param {object} scope
 */
export function stampOpenEdgeLfOntoScopeForPricing(scope) {
  if (!scope || typeof scope !== "object") return scope || {};
  // Ensure Studio openings exist before aggregating addOns (bridges cutouts[]).
  const roomsStamped = Array.isArray(scope.rooms)
    ? scope.rooms.map((room) => {
        if (!room || typeof room !== "object") return room;
        const pieces = Array.isArray(room.pieces)
          ? room.pieces.map((piece) => {
              if (!piece || typeof piece !== "object") return piece;
              return stampStudioOpeningsOntoPiece(piece);
            })
          : [];
        return { ...room, pieces };
      })
    : [];
  const withOpenings = syncPieceOpeningsIntoOfficialScopeAddOns({
    ...scope,
    rooms: roomsStamped
  });
  const rooms = Array.isArray(withOpenings.rooms) ? withOpenings.rooms : [];
  return {
    ...withOpenings,
    rooms: rooms.map((room) => {
      if (!room || typeof room !== "object") return room;
      const pieces = Array.isArray(room.pieces)
        ? room.pieces.map((piece) => {
            if (!piece || typeof piece !== "object") return piece;
            const lf = resolvePieceOpenEdgeLf(piece);
            if (!(lf > 0) && !(Number(piece.finishedEdgeLf) > 0)) {
              return stampPieceOpenEdgeLf(piece, 0, { confirmOfficial: true });
            }
            return stampPieceOpenEdgeLf(piece, lf > 0 ? lf : undefined, {
              confirmOfficial: true
            });
          })
        : [];
      return { ...room, pieces };
    })
  };
}

/**
 * Safe internal pricing result for Quote Flow UI (no raw elite100 dump).
 * @param {object|null|undefined} estimate
 * @param {object|null|undefined} [calcOverride]
 */
export function presentQuoteFlowPricingResult(estimate, calcOverride = null) {
  const built = buildStudioV2CalculationResult(estimate, calcOverride);
  const breakdown =
    built.pricingBreakdown && typeof built.pricingBreakdown === "object"
      ? built.pricingBreakdown
      : {};
  const totals =
    (calcOverride || estimate?.calculationSnapshot)?.totals &&
    typeof (calcOverride || estimate?.calculationSnapshot).totals === "object"
      ? (calcOverride || estimate.calculationSnapshot).totals
      : {};
  const snap = calcOverride || estimate?.calculationSnapshot || null;
  const fab = snap?.fabrication && typeof snap.fabrication === "object" ? snap.fabrication : {};
  const edge = fab.edge && typeof fab.edge === "object" ? fab.edge : {};
  const edgeAmount =
    edge.amount != null && Number.isFinite(Number(edge.amount))
      ? Math.round(Number(edge.amount) * 100) / 100
      : null;
  const edgeLf =
    edge.finalLf != null && Number.isFinite(Number(edge.finalLf))
      ? Number(edge.finalLf)
      : breakdown.edgeLf != null
        ? Number(breakdown.edgeLf)
        : null;

  const scope = estimate?.scope && typeof estimate.scope === "object" ? estimate.scope : {};
  const customLines = readQuoteFlowCustomLineItems(scope);
  const customSummary = summarizeQuoteFlowCustomLineItems(customLines);
  const edgeStatus = presentQuoteFlowEdgeStatus(scope, {
    openEdgeLf: summarizeOfficialScope(scope).openEdgeLf,
    edgeLf,
    openEdgeAmount: edgeAmount,
    edgeTier: edge.tier || null,
    edgeProfileToken: edge.profileToken || scope.edgeProfileToken || null,
    edgeProfileLabel: edge.profileLabel || null
  });

  // Visible fabrication cutouts — prefer calculator room charges; fall back to fab.addOns qty.
  const pricedRooms = Array.isArray(snap?.rooms)
    ? snap.rooms
    : Array.isArray(snap?.elite100?.rooms)
      ? snap.elite100.rooms
      : [];
  /** @type {Array<{ label: string, amount: number|null, quantity?: number|null }>} */
  const cutoutLines = [];
  for (const room of pricedRooms) {
    for (const line of customerSafeCutoutLinesFromCharges(room?.cutouts)) {
      cutoutLines.push({ label: line.label, amount: line.amount });
    }
  }
  const fabAddOns =
    fab.addOns && typeof fab.addOns === "object"
      ? fab.addOns
      : mergePricedCutoutsIntoFabricationAddOns(scope.addOns, pricedRooms);
  const qtySink = Math.max(0, Math.floor(Number(fabAddOns["qty-sink"]) || 0));
  if (qtySink > 0 && !cutoutLines.some((l) => /kitchen\s*sink\s*cutout/i.test(String(l.label)))) {
    cutoutLines.push({
      label: "Kitchen sink cutout",
      amount: null,
      quantity: qtySink
    });
  }

  /** Ensure Latest calculation linePreview surfaces cutouts (not only Other/adjustments). */
  let linePreview = Array.isArray(built.customerSafeLinePreview)
    ? built.customerSafeLinePreview.map((g) => ({
        label: String(g?.label || g?.name || "Line"),
        amount:
          g?.amount != null && Number.isFinite(Number(g.amount))
            ? Math.round(Number(g.amount) * 100) / 100
            : null
      }))
    : [];
  for (const cut of cutoutLines) {
    const already = linePreview.some(
      (l) =>
        String(l.label).toLowerCase() === String(cut.label).toLowerCase() ||
        (/fabrication\s*add-?ons/i.test(String(l.label)) && /sink\s*cutout/i.test(String(cut.label)))
    );
    if (already) continue;
    if (cut.amount != null && Number(cut.amount) > 0) {
      linePreview.push({ label: cut.label, amount: cut.amount });
    } else if (cut.quantity != null && cut.quantity > 0) {
      linePreview.push({
        label: `Fabrication add-ons — ${cut.label} ×${cut.quantity}`,
        amount: null
      });
    }
  }

  return {
    available: built.available === true,
    calculatedAt: built.calculatedAt || null,
    pricingVersion: built.pricingVersion ?? null,
    pricingEngine: snap?.pricingEngine || estimate?.pricingEngine || null,
    estimatedTotal:
      built.total != null && Number.isFinite(Number(built.total))
        ? Math.round(Number(built.total) * 100) / 100
        : null,
    exactInternalTotal:
      totals.exactInternalTotal != null && Number.isFinite(Number(totals.exactInternalTotal))
        ? Math.round(Number(totals.exactInternalTotal) * 100) / 100
        : null,
    customerDisplayTotal:
      totals.customerDisplayTotal != null && Number.isFinite(Number(totals.customerDisplayTotal))
        ? Math.round(Number(totals.customerDisplayTotal) * 100) / 100
        : built.total != null
          ? Math.round(Number(built.total) * 100) / 100
          : null,
    openEdgeAmount: edgeAmount,
    edgeStatus,
    customLineItems: {
      customerFacing: customSummary.customerFacing,
      internalOnly: customSummary.internalOnly,
      summary: {
        customerFacingChargesTotal: customSummary.customerFacingChargesTotal,
        customerFacingCreditsTotal: customSummary.customerFacingCreditsTotal,
        internalOnlyChargesTotal: customSummary.internalOnlyChargesTotal,
        internalOnlyCreditsTotal: customSummary.internalOnlyCreditsTotal,
        noteOnlyCount: customSummary.noteOnlyCount,
        netCustomAdjustment: customSummary.netCustomAdjustment
      }
    },
    fabricationAddOns: fabAddOns,
    cutoutLines,
    linePreview,
    breakdown: {
      measuredStoneSf:
        breakdown.measuredStoneSf != null ? Number(breakdown.measuredStoneSf) : null,
      billedStoneSf: breakdown.billedStoneSf != null ? Number(breakdown.billedStoneSf) : null,
      materialRatePerSf:
        breakdown.materialRatePerSf != null ? Number(breakdown.materialRatePerSf) : null,
      edgeLf: edgeStatus.profileSelected ? edgeLf : null,
      openEdgeAmount: edgeAmount,
      pricingBasis: breakdown.pricingBasis || breakdown.selectedPricingBasis || null,
      materialGroup: breakdown.materialGroup || breakdown.selectedPriceGroup || null
    },
    warnings: Array.isArray(built.warnings) ? built.warnings : [],
    unresolvedItems: Array.isArray(built.unresolvedItems) ? built.unresolvedItems : []
  };
}

/**
 * @param {{
 *   estimateRepository?: { getById?: Function, update?: Function }|null,
 *   studioEstimateService?: { getById?: Function, repository?: object }|null,
 *   calculateStudioEstimate?: Function|null,
 *   env?: NodeJS.ProcessEnv
 * }} deps
 */
export function createQuoteFlowPricingService(deps = {}) {
  const estimateRepository =
    deps.estimateRepository || deps.studioEstimateService?.repository || null;
  const studioEstimateService = deps.studioEstimateService || null;
  const calculateImpl = deps.calculateStudioEstimate || calculateStudioEstimateV4;
  const env = deps.env || process.env;

  async function loadEstimateRow(organizationId, estimateId) {
    const id = String(estimateId || "").trim();
    if (!id) {
      throw createQuoteFlowError("estimate_not_found", {
        message: "Estimate not found.",
        statusCode: 404
      });
    }
    let row = null;
    if (estimateRepository?.getById) {
      row = await estimateRepository.getById(organizationId, id);
    } else if (studioEstimateService?.getById) {
      row = await studioEstimateService.getById(organizationId, id);
    }
    if (!row) {
      throw createQuoteFlowError("estimate_not_found", {
        message: "Estimate not found.",
        statusCode: 404
      });
    }
    return row;
  }

  function assertScoped(row) {
    if (!isOfficialScopeSet(row)) {
      throw createQuoteFlowError("estimate_not_scoped", {
        message: "Official scope is not set for this estimate yet.",
        statusCode: 404
      });
    }
  }

  function buildScopeSummary(row) {
    return summarizeOfficialScope(row?.scope || {});
  }

  /**
   * Apply Studio pricing fields + optional Quote Flow custom line items onto scope.
   * @param {object} existingScope
   * @param {object} pricingPayload
   * @param {string|null} actorUserId
   */
  function applyPricingDraftToScope(existingScope, pricingPayload, actorUserId) {
    const normalized = normalizeStudioV2PricingPatch({
      existingScope: existingScope && typeof existingScope === "object" ? existingScope : {},
      pricing: pricingPayload,
      actorUserId: actorUserId || null,
      env
    });
    if (!normalized.ok) {
      return { ok: false, issues: normalized.issues };
    }

    let nextScope = {
      ...normalized.scope,
      quoteFlowPricingEdited: true
    };

    // Starting Configuration / Pricing & Selections fields (estimator-owned).
    if (Object.prototype.hasOwnProperty.call(pricingPayload, "colorName")) {
      nextScope.colorName = String(pricingPayload.colorName || "").trim();
    }
    if (Object.prototype.hasOwnProperty.call(pricingPayload, "colorTbd")) {
      nextScope.colorTbd = pricingPayload.colorTbd === true;
      if (nextScope.colorTbd) nextScope.colorName = "";
    }
    if (Object.prototype.hasOwnProperty.call(pricingPayload, "edgeProfileToken")) {
      const token = String(pricingPayload.edgeProfileToken || "").trim();
      nextScope.edgeProfileToken = token || null;
      if (token && Array.isArray(nextScope.rooms)) {
        nextScope.rooms = nextScope.rooms.map((room) => {
          if (!room || typeof room !== "object") return room;
          const pieces = Array.isArray(room.pieces)
            ? room.pieces.map((p) =>
                p && typeof p === "object"
                  ? { ...p, edgeProfileToken: p.edgeProfileToken || token }
                  : p
              )
            : [];
          return { ...room, pieces };
        });
      }
    }
    if (
      pricingPayload.addOns &&
      typeof pricingPayload.addOns === "object" &&
      Object.prototype.hasOwnProperty.call(pricingPayload.addOns, "tearout")
    ) {
      const prior =
        nextScope.addOns && typeof nextScope.addOns === "object" ? { ...nextScope.addOns } : {};
      const tear = Number(pricingPayload.addOns.tearout);
      if (Number.isFinite(tear) && tear > 0) prior.tearout = tear;
      else delete prior.tearout;
      nextScope.addOns = prior;
    }
    if (Array.isArray(pricingPayload.roomSelections)) {
      const byId = new Map(
        pricingPayload.roomSelections
          .filter((r) => r && typeof r === "object" && String(r.roomId || "").trim())
          .map((r) => [String(r.roomId).trim(), r])
      );
      if (byId.size && Array.isArray(nextScope.rooms)) {
        nextScope.rooms = nextScope.rooms.map((room) => {
          if (!room || typeof room !== "object") return room;
          const patch = byId.get(String(room.id || "").trim());
          if (!patch) return room;
          /** @type {Record<string, unknown>} */
          const next = { ...room };
          if (Object.prototype.hasOwnProperty.call(patch, "materialGroupOverride")) {
            const g = normalizeStudioV2MaterialGroup(patch.materialGroupOverride);
            next.materialGroupOverride = g || null;
          }
          if (Object.prototype.hasOwnProperty.call(patch, "colorNameOverride")) {
            next.colorNameOverride = String(patch.colorNameOverride || "").trim() || null;
          }
          if (Object.prototype.hasOwnProperty.call(patch, "colorTbd")) {
            if (patch.colorTbd === true) {
              next.colorNameOverride = null;
            }
          }
          if (Object.prototype.hasOwnProperty.call(patch, "edgeProfileToken")) {
            const token = String(patch.edgeProfileToken || "").trim();
            if (token && Array.isArray(next.pieces)) {
              next.pieces = next.pieces.map((p) =>
                p && typeof p === "object" ? { ...p, edgeProfileToken: token } : p
              );
            }
          }
          if (Object.prototype.hasOwnProperty.call(patch, "includeBacksplash")) {
            next.includeBacksplash = patch.includeBacksplash === true;
            if (!next.includeBacksplash) {
              next.backsplashSqft = 0;
            }
          }
          return next;
        });
      }
    }

    if (Object.prototype.hasOwnProperty.call(pricingPayload, "customLineItems")) {
      const applied = applyQuoteFlowCustomLineItemsToScope(
        nextScope,
        pricingPayload.customLineItems
      );
      if (!applied.ok) {
        return { ok: false, issues: applied.issues };
      }
      nextScope = applied.scope;
    } else {
      // Keep existing QF lines synced onto Studio customLineItems for calculator.
      const existingLines = readQuoteFlowCustomLineItems(nextScope);
      const applied = applyQuoteFlowCustomLineItemsToScope(nextScope, existingLines);
      if (applied.ok) nextScope = applied.scope;
    }

    return {
      ok: true,
      scope: nextScope,
      customLineItems: readQuoteFlowCustomLineItems(nextScope),
      customLineSummary: summarizeQuoteFlowCustomLineItems(
        readQuoteFlowCustomLineItems(nextScope)
      )
    };
  }

  function presentPricingDraft(row, editablePricing) {
    const customLineItems = readQuoteFlowCustomLineItems(row?.scope || {});
    const customLineSummary = summarizeQuoteFlowCustomLineItems(customLineItems);
    const scope = row?.scope && typeof row.scope === "object" ? row.scope : {};
    const rooms = Array.isArray(scope.rooms) ? scope.rooms : [];
    const startingSelections = {
      colorName: scope.colorName || "",
      colorTbd: scope.colorTbd === true,
      edgeProfileToken: scope.edgeProfileToken || null,
      tearout: Number(scope.addOns?.tearout) > 0,
      seededFromStartingConfiguration: Boolean(scope.quoteFlowStartingConfiguration),
      rooms: rooms.map((room) => {
        const pieces = Array.isArray(room?.pieces) ? room.pieces : [];
        const edgeTokens = [
          ...new Set(
            pieces
              .map((p) => String(p?.edgeProfileToken || "").trim())
              .filter(Boolean)
          )
        ];
        return {
          roomId: String(room?.id || ""),
          roomName: String(room?.name || ""),
          materialGroupOverride: room?.materialGroupOverride || null,
          colorNameOverride: room?.colorNameOverride || null,
          edgeProfileToken: edgeTokens[0] || scope.edgeProfileToken || null,
          includeBacksplash: room?.includeBacksplash === true,
          backsplashSqft: Number(room?.backsplashSqft) || 0,
          hasSinkCutout: pieces.some(
            (p) =>
              Number(p?.kitchenSinkCutouts) > 0 ||
              Number(p?.vanityBarSinkCutouts) > 0 ||
              (Array.isArray(p?.cutouts) &&
                p.cutouts.some((c) => /sink/i.test(String(c?.type || ""))))
          ),
          hasWaterfallGeometry: pieces.some(
            (p) =>
              (Array.isArray(p?.waterfallPanels) && p.waterfallPanels.length > 0) ||
              (p?.waterfallSegmentLengthsIn &&
                typeof p.waterfallSegmentLengthsIn === "object" &&
                Object.keys(p.waterfallSegmentLengthsIn).length > 0)
          )
        };
      })
    };
    return {
      customLineItems,
      customLineSummary: {
        customerFacingChargesTotal: customLineSummary.customerFacingChargesTotal,
        customerFacingCreditsTotal: customLineSummary.customerFacingCreditsTotal,
        internalOnlyChargesTotal: customLineSummary.internalOnlyChargesTotal,
        internalOnlyCreditsTotal: customLineSummary.internalOnlyCreditsTotal,
        noteOnlyCount: customLineSummary.noteOnlyCount,
        netCustomAdjustment: customLineSummary.netCustomAdjustment
      },
      edgeStatus: presentQuoteFlowEdgeStatus(row?.scope || {}, {
        openEdgeLf: buildScopeSummary(row).openEdgeLf
      }),
      startingSelections,
      blockers: buildBlockers(row, editablePricing)
    };
  }

  function buildBlockers(row, editablePricing) {
    /** @type {string[]} */
    const blockers = [];
    const summary = buildScopeSummary(row);
    if (!(summary.countertopSf > 0) && !(summary.pieceCount > 0)) {
      blockers.push("Official scope has no priced pieces. Edit Scope before calculating.");
    }
    if (!editablePricing?.materialGroup) {
      blockers.push("Select a price group before calculating.");
    }
    if (!editablePricing?.pricingBasis) {
      blockers.push("Select a pricing basis before calculating.");
    }
    return blockers;
  }

  function buildWarnings(row, result) {
    /** @type {string[]} */
    const notes = [];
    const summary = buildScopeSummary(row);
    if (summary.excludedPieceCount > 0) {
      notes.push(`${summary.excludedPieceCount} excluded piece(s) are not priced.`);
    }
    if (!(summary.openEdgeLf > 0)) {
      notes.push("Open edge LF is 0.0 — edge charges may be $0 until Open edge LF is set on Scope.");
    }
    if (String(row.staleReason || "").trim()) {
      notes.push(String(row.staleReason));
    }
    for (const w of result?.warnings || []) {
      const msg = String(w?.message || "").trim();
      if (msg) notes.push(msg);
    }
    return notes;
  }

  async function getPricing({ organizationId, estimateId, actorUserId = null } = {}) {
    const row = await loadEstimateRow(organizationId, estimateId);
    assertScoped(row);
    const editablePricing = buildStudioV2EditablePricing(row, {
      actorUserId,
      env
    });
    const lastCalculation = presentQuoteFlowPricingResult(row);
    const staleReason = String(row.staleReason || "").trim() || null;
    const scopeChangedSinceCalculation = /scope changed/i.test(String(staleReason || ""));
    const draft = presentPricingDraft(row, editablePricing);
    return {
      ok: true,
      estimateId: row.id || estimateId,
      revision: row.revision ?? null,
      status: row.status || null,
      scopeSummary: buildScopeSummary(row),
      editablePricing,
      allowedPricingBases: [...STUDIO_V2_PRICING_BASES],
      allowedMaterialGroups: [...STUDIO_V2_MATERIAL_GROUPS],
      customLineItems: draft.customLineItems,
      customLineSummary: draft.customLineSummary,
      edgeStatus: draft.edgeStatus,
      startingSelections: draft.startingSelections,
      lastCalculation,
      staleReason,
      pricingStale: Boolean(staleReason),
      scopeChangedSinceCalculation,
      blockers: draft.blockers,
      sideEffects: { ...NO_SIDE_EFFECTS }
    };
  }

  async function patchPricing({
    organizationId,
    estimateId,
    body = {},
    actorUserId = null
  } = {}) {
    if (!estimateRepository?.update) {
      throw createQuoteFlowError("takeoff_unavailable", {
        message: "Unable to save pricing draft.",
        statusCode: 503
      });
    }
    const row = await loadEstimateRow(organizationId, estimateId);
    assertScoped(row);

    const status = String(row.status || "").toLowerCase();
    if (status === "superseded") {
      throw createQuoteFlowError("scope_invalid", {
        message: "This estimate revision cannot be priced here.",
        statusCode: 409
      });
    }

    const pricingPayload =
      body?.pricing && typeof body.pricing === "object"
        ? body.pricing
        : body && typeof body === "object"
          ? body
          : {};
    const applied = applyPricingDraftToScope(
      row.scope && typeof row.scope === "object" ? row.scope : {},
      pricingPayload,
      actorUserId
    );
    if (!applied.ok) {
      const first = applied.issues?.[0];
      throw createQuoteFlowError("pricing_invalid", {
        message: first?.message || "Pricing settings could not be saved.",
        statusCode: 422,
        diagnostic: { issues: applied.issues }
      });
    }

    const statusBefore = String(row.status || "").toLowerCase();
    const staleScope = markQuoteFlowReviewStaleOnScope(
      applied.scope,
      "Scope or pricing changed after approval. Re-review required."
    );
    /** @type {Record<string, unknown>} */
    const patch = {
      scope: staleScope,
      staleReason: "Pricing settings changed — recalculate"
    };
    if (
      statusBefore === STUDIO_ESTIMATE_STATUSES.PRICED ||
      statusBefore === STUDIO_ESTIMATE_STATUSES.APPROVED
    ) {
      patch.status = STUDIO_ESTIMATE_STATUSES.READY_TO_PRICE;
      patch.calculationSnapshot = null;
      if (statusBefore === STUDIO_ESTIMATE_STATUSES.APPROVED) {
        patch.approval = null;
      }
    } else if (statusBefore === STUDIO_ESTIMATE_STATUSES.DRAFT) {
      patch.status = STUDIO_ESTIMATE_STATUSES.READY_TO_PRICE;
    }

    const updated = await estimateRepository.update(
      organizationId,
      row.id || estimateId,
      patch,
      actorUserId || null
    );

    const editablePricing = buildStudioV2EditablePricing(updated, {
      actorUserId,
      env
    });
    const draft = presentPricingDraft(updated, editablePricing);
    return {
      ok: true,
      message: "Pricing draft saved.",
      estimateId: updated.id || estimateId,
      revision: updated.revision ?? null,
      status: updated.status || null,
      editablePricing,
      customLineItems: draft.customLineItems,
      customLineSummary: draft.customLineSummary,
      edgeStatus: draft.edgeStatus,
      startingSelections: draft.startingSelections,
      lastCalculation: presentQuoteFlowPricingResult(updated),
      staleReason: String(updated.staleReason || "").trim() || null,
      pricingStale: true,
      scopeChangedSinceCalculation: false,
      scopeSummary: buildScopeSummary(updated),
      blockers: draft.blockers,
      sideEffects: { ...NO_SIDE_EFFECTS }
    };
  }

  async function calculatePricing({
    organizationId,
    estimateId,
    body = {},
    actorUserId = null
  } = {}) {
    if (!estimateRepository?.update) {
      throw createQuoteFlowError("takeoff_unavailable", {
        message: "Unable to calculate pricing.",
        statusCode: 503
      });
    }
    const row = await loadEstimateRow(organizationId, estimateId);
    assertScoped(row);

    const status = String(row.status || "").toLowerCase();
    if (status === "superseded") {
      throw createQuoteFlowError("scope_invalid", {
        message: "This estimate revision cannot be priced here.",
        statusCode: 409
      });
    }

    // Optional: save pricing draft fields before calculate when provided.
    let working = row;
    const wasApproved = status === STUDIO_ESTIMATE_STATUSES.APPROVED;
    const pricingPayload =
      body?.pricing && typeof body.pricing === "object" ? body.pricing : null;
    if (pricingPayload) {
      const applied = applyPricingDraftToScope(
        row.scope && typeof row.scope === "object" ? row.scope : {},
        pricingPayload,
        actorUserId
      );
      if (!applied.ok) {
        const first = applied.issues?.[0];
        throw createQuoteFlowError("pricing_invalid", {
          message: first?.message || "Pricing settings are invalid.",
          statusCode: 422,
          diagnostic: { issues: applied.issues }
        });
      }
      working = {
        ...row,
        scope: markQuoteFlowReviewStaleOnScope(
          applied.scope,
          "Scope or pricing changed after approval. Re-review required."
        ),
        ...(wasApproved
          ? { status: STUDIO_ESTIMATE_STATUSES.READY_TO_PRICE, approval: null }
          : {})
      };
    } else {
      // Ensure persisted QF lines are synced onto Studio customLineItems before calc.
      const applied = applyPricingDraftToScope(
        row.scope && typeof row.scope === "object" ? row.scope : {},
        {},
        actorUserId
      );
      if (applied.ok) {
        working = {
          ...row,
          scope: wasApproved
            ? markQuoteFlowReviewStaleOnScope(
                applied.scope,
                "Scope or pricing changed after approval. Re-review required."
              )
            : applied.scope,
          ...(wasApproved
            ? { status: STUDIO_ESTIMATE_STATUSES.READY_TO_PRICE, approval: null }
            : {})
        };
      }
    }

    const editablePricing = buildStudioV2EditablePricing(working, {
      actorUserId,
      env
    });
    const blockers = buildBlockers(working, editablePricing);
    if (blockers.length && !(buildScopeSummary(working).pieceCount > 0)) {
      throw createQuoteFlowError("pricing_invalid", {
        message: blockers[0],
        statusCode: 422,
        diagnostic: { blockers }
      });
    }

    const stampedScope = stampOpenEdgeLfOntoScopeForPricing(
      working.scope && typeof working.scope === "object" ? working.scope : {}
    );

    let calc;
    try {
      calc = await calculateImpl({
        scope: stampedScope,
        actorUserId: actorUserId || null,
        env
      });
    } catch (e) {
      throw createQuoteFlowError("pricing_calculate_failed", {
        message: e?.message || "Unable to calculate pricing.",
        statusCode: 422
      });
    }

    let nextRow = working;
    let persisted = false;
    if (isStudioV2CalculationPersistable(working.status)) {
      /** @type {Record<string, unknown>} */
      const patch = {
        scope: stampedScope,
        calculationSnapshot: calc,
        status: STUDIO_ESTIMATE_STATUSES.PRICED,
        staleReason: null
      };
      nextRow = await estimateRepository.update(
        organizationId,
        working.id || estimateId,
        patch,
        actorUserId || null
      );
      persisted = true;
    }

    const result = presentQuoteFlowPricingResult(nextRow, calc);
    const notes = buildWarnings(nextRow, result);
    const draft = presentPricingDraft(nextRow, editablePricing);
    return {
      ok: true,
      message: "Pricing calculated.",
      persisted,
      estimateId: nextRow.id || estimateId,
      revision: nextRow.revision ?? null,
      status: nextRow.status || null,
      editablePricing: buildStudioV2EditablePricing(nextRow, { actorUserId, env }),
      customLineItems: draft.customLineItems,
      customLineSummary: draft.customLineSummary,
      edgeStatus: result.edgeStatus || draft.edgeStatus,
      lastCalculation: result,
      calculationNotes: notes,
      staleReason: null,
      pricingStale: false,
      scopeChangedSinceCalculation: false,
      scopeSummary: buildScopeSummary(nextRow),
      blockers: [],
      sideEffects: {
        ...NO_SIDE_EFFECTS,
        // Internal calculator ran — not estimate approval / Digital Estimate publish.
        pricingCalculated: true
      }
    };
  }

  return {
    getPricing,
    patchPricing,
    calculatePricing,
    stampOpenEdgeLfOntoScopeForPricing,
    presentQuoteFlowPricingResult,
    NO_SIDE_EFFECTS
  };
}
