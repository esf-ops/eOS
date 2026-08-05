/**
 * Quote Flow — customer acceptance status + internal accepted-job report.
 * Reuses Studio Final Acceptance rows (studio_estimate_acceptances).
 * Read-only: no sold, handoff, job, QuickBooks, or email.
 */

import { ceilBillableSquareFeet } from "../quotes/billableSquareFeet.mjs";
import { buildCustomerConfigurationSummary } from "../digitalEstimate/catalog/customerConfigurationSummary.mjs";
import {
  resolveCustomerEdgeLabel,
  CUSTOMER_CONFIGURATION_FOUNDATION_KEY
} from "../digitalEstimate/configuration/customerConfigurationFoundation.mjs";
import { splitSelectionPayloadMeta } from "../digitalEstimate/configuration/customerConfigurationDraft.mjs";
import { friendlyMaterialLabel } from "../elite100EstimateStudio/studioCustomerSelectionReview.mjs";
import { resolveEstimateDisplayName } from "./quoteFlowEstimatesPresenter.mjs";
import { readQuoteFlowCustomLineItems } from "./quoteFlowCustomLineItems.mjs";
import { createQuoteFlowError } from "./quoteFlowErrors.mjs";
import { isOfficialScopeSet } from "./quoteFlowScope.mjs";

const NO_SIDE_EFFECTS = Object.freeze({
  calculated: false,
  approved: false,
  published: false,
  sold: false,
  accepted: false,
  digitalEstimateCreated: false,
  takeoffRerun: false,
  refreshScopeFromTakeoff: false,
  estimateApproved: false,
  emailed: false,
  handoffCreated: false,
  jobCreated: false,
  quickbooksInvoiceCreated: false,
  mutated: false
});

function money(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function str(v) {
  const s = String(v ?? "").trim();
  return s || null;
}

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

/**
 * Compact acceptance summary — mirrors Studio V2 getCustomerActivity.
 * @param {object|null|undefined} acceptance
 */
export function presentQuoteFlowAcceptance(acceptance) {
  if (!acceptance) return null;
  const snap =
    acceptance.customer_safe_snapshot_json ||
    acceptance.customerSafeSnapshot ||
    {};
  const acceptedAsConfigured = snap.acceptedAsConfigured === true;
  const snapTotals = snap.totals && typeof snap.totals === "object" ? snap.totals : {};
  const columnTotal = money(
    acceptance.customer_display_total ?? acceptance.customerDisplayTotal
  );
  const configuredTotal =
    money(snapTotals.acceptedConfiguredTotal) ??
    money(snapTotals.customerDisplayTotal) ??
    columnTotal;
  const publishedBaseline =
    money(snapTotals.publishedBaselineTotal) ??
    (acceptedAsConfigured ? null : columnTotal);
  const customerDisplayTotal = acceptedAsConfigured
    ? configuredTotal ?? columnTotal
    : columnTotal;
  const difference =
    customerDisplayTotal != null && publishedBaseline != null
      ? round2(customerDisplayTotal - publishedBaseline)
      : money(snapTotals.displayDelta) ?? money(snapTotals.displayTotalDelta);

  return {
    id: acceptance.id || null,
    acceptedAt: acceptance.accepted_at || acceptance.acceptedAt || null,
    estimateRevision:
      acceptance.estimate_revision ?? acceptance.estimateRevision ?? null,
    publicationId: acceptance.publication_id || acceptance.publicationId || null,
    customerDisplayTotal,
    publishedBaselineTotal: publishedBaseline,
    difference,
    acceptedAsConfigured,
    acceptedAsPublished: acceptedAsConfigured
      ? false
      : snap.acceptedAsPublished !== false,
    acceptedSelectionId: snap.acceptedSelectionId || null,
    selectionSource: acceptedAsConfigured ? "customer_configured" : "published",
    customerName: str(snap.customerName),
    projectName: str(snap.projectName),
    materialGroup: str(snap.materialGroup)
  };
}

/**
 * Measured SF for a scope piece — same formula as v4 measuredPieceSqft.
 * @param {object} piece
 */
export function measuredPieceSfFromScope(piece) {
  const direct = Number(piece?.directArea ?? piece?.sqft);
  if (Number.isFinite(direct) && direct > 0) return round2(direct);
  const lengthIn = Math.max(0, Number(piece?.lengthIn) || 0);
  const depthIn = Math.max(0, Number(piece?.depthIn) || 0);
  const quantity = Math.max(1, Math.floor(Number(piece?.quantity) || 1));
  return round2((lengthIn * depthIn * quantity) / 144);
}

function isBacksplashPiece(piece) {
  const t = String(piece?.pieceType || piece?.type || "").toLowerCase();
  const n = String(piece?.name || piece?.label || "").toLowerCase();
  return t.includes("backsplash") || n.includes("backsplash");
}

function resolvePieceOpenEdgeLf(piece) {
  const n = Number(
    piece?.openEdgeLf ??
      piece?.finishedEdgeLf ??
      piece?.finishedEdge?.totalFinishedEdgeLengthIn / 12
  );
  return Number.isFinite(n) && n >= 0 ? round2(n) : null;
}

/**
 * @param {object} estimate
 * @param {object|null} acceptance
 * @param {{ selectionReview?: object|null }} [opts]
 */
export function buildQuoteFlowAcceptedReport(estimate, acceptance, opts = {}) {
  const presented = presentQuoteFlowAcceptance(acceptance);
  if (!presented) {
    return {
      ok: true,
      status: "not_accepted",
      statusLabel: "Not accepted yet",
      acceptance: null,
      report: null,
      sideEffects: { ...NO_SIDE_EFFECTS }
    };
  }

  const scope = estimate?.scope && typeof estimate.scope === "object" ? estimate.scope : {};
  const calc = estimate?.calculationSnapshot || {};
  const eliteRooms = Array.isArray(calc?.elite100?.rooms) ? calc.elite100.rooms : [];
  const eliteByRoomId = new Map(
    eliteRooms.map((r) => [String(r.roomId || r.id || ""), r])
  );
  const eliteByRoomName = new Map(
    eliteRooms.map((r) => [String(r.roomName || r.name || "").toLowerCase(), r])
  );

  const snap =
    acceptance.customer_safe_snapshot_json ||
    acceptance.customerSafeSnapshot ||
    {};
  const configuration =
    acceptance.customer_configuration_json ||
    acceptance.customerConfigurationJson ||
    snap.configuration ||
    null;

  /** @type {object|null} */
  let configSummary = null;
  try {
    const payload =
      configuration && typeof configuration === "object"
        ? configuration.selection_payload_json ||
          configuration.selectionPayload ||
          (configuration[CUSTOMER_CONFIGURATION_FOUNDATION_KEY]
            ? { [CUSTOMER_CONFIGURATION_FOUNDATION_KEY]: configuration }
            : configuration)
        : null;
    if (payload && typeof payload === "object") {
      const split = splitSelectionPayloadMeta(payload);
      configSummary = buildCustomerConfigurationSummary({
        selectionPayload: payload,
        quantities: split.quantities,
        customerProductDrafts: split.customerProductDrafts,
        backsplashDrafts: split.backsplashDrafts,
        roomNotes: split.roomNotes,
        projectNote: split.projectNote,
        rooms: (Array.isArray(scope.rooms) ? scope.rooms : []).map((r) => ({
          roomKey: String(r.id || r.roomKey || ""),
          displayName: String(r.name || r.displayName || r.id || "Room")
        })),
        baselineDisplayTotal: presented.publishedBaselineTotal,
        configuredDisplayTotal: presented.customerDisplayTotal,
        displayDelta: presented.difference
      });
    }
  } catch {
    configSummary = null;
  }

  const summaryRooms = Array.isArray(configSummary?.rooms) ? configSummary.rooms : [];
  const summaryByKey = new Map(
    summaryRooms.map((r) => [String(r.roomKey || "").toLowerCase(), r])
  );

  const selectionReview = opts.selectionReview || null;
  const reviewRooms = Array.isArray(selectionReview?.pricedSelections?.rooms)
    ? selectionReview.pricedSelections.rooms
    : [];
  const reviewByKey = new Map(
    reviewRooms.map((r) => [String(r.roomKey || "").toLowerCase(), r])
  );

  const materialSummary = Array.isArray(
    acceptance.material_summary_json || acceptance.materialSummaryJson || snap.materialSummary
  )
    ? acceptance.material_summary_json ||
      acceptance.materialSummaryJson ||
      snap.materialSummary
    : [];

  const identity =
    estimate?.customerIdentitySnapshot && typeof estimate.customerIdentitySnapshot === "object"
      ? estimate.customerIdentitySnapshot
      : scope.customerIdentitySnapshot && typeof scope.customerIdentitySnapshot === "object"
        ? scope.customerIdentitySnapshot
        : {};

  const estimateName =
    resolveEstimateDisplayName({
      estimateName: scope.quoteFlowEstimateName || scope.projectName,
      projectName: scope.projectName,
      customerName: identity.displayName || scope.customerName,
      planFilename: scope.planFilename
    }) ||
    str(snap.projectName) ||
    str(scope.projectName) ||
    "Estimate";

  const customLines = readQuoteFlowCustomLineItems(scope);
  const customerFacingCustom = customLines.filter((l) => l.visibility !== "internal");
  const internalOnlyCustom = customLines.filter((l) => l.visibility === "internal");

  const fabLines = Array.isArray(calc?.fabrication?.customLineItems)
    ? calc.fabrication.customLineItems
    : [];
  const fabCustomerFacing = fabLines.filter(
    (l) =>
      l?.customerFacing !== false &&
      l?.commercialRole !== "internal_only" &&
      l?.commercialRole !== "absorbed"
  );
  const fabInternal = fabLines.filter(
    (l) => l?.commercialRole === "internal_only" || l?.commercialRole === "absorbed"
  );

  /** @type {object[]} */
  const roomsOut = [];
  let projectMeasuredSf = 0;
  let projectBilledSf = 0;
  let projectBacksplashBilledSf = 0;
  let materialSubtotal = 0;
  let backsplashSubtotal = 0;
  let cutoutSubtotal = 0;
  let productsSubtotal = 0;
  let useTaxTotal = 0;

  for (const room of Array.isArray(scope.rooms) ? scope.rooms : []) {
    if (!room || room.included === false) continue;
    const roomId = String(room.id || room.roomKey || "");
    const roomName = String(room.name || room.displayName || roomId || "Room");
    const roomKeyLower = roomId.toLowerCase();
    const priced =
      eliteByRoomId.get(roomId) ||
      eliteByRoomName.get(roomName.toLowerCase()) ||
      null;
    const sel =
      summaryByKey.get(roomKeyLower) ||
      summaryByKey.get(roomName.toLowerCase()) ||
      null;
    const reviewRoom =
      reviewByKey.get(roomKeyLower) || reviewByKey.get(roomName.toLowerCase()) || null;
    const matFromSummary = materialSummary.find(
      (m) =>
        String(m.roomId || "") === roomId ||
        String(m.roomName || "").toLowerCase() === roomName.toLowerCase()
    );

    const pieces = Array.isArray(room.pieces) ? room.pieces : [];
    const pricedSections = Array.isArray(priced?.pieceSections) ? priced.pieceSections : [];
    const sectionById = new Map(
      pricedSections.map((s) => [String(s.pieceId || ""), s])
    );
    const sectionByName = new Map(
      pricedSections.map((s) => [String(s.pieceName || "").toLowerCase(), s])
    );

    /** @type {object[]} */
    const pieceRows = [];
    let roomMeasured = 0;
    let roomBilled = 0;
    for (const piece of pieces) {
      if (!piece) continue;
      const included = piece.included !== false && piece.excluded !== true;
      const isSplash = isBacksplashPiece(piece);
      const section =
        sectionById.get(String(piece.id || "")) ||
        sectionByName.get(String(piece.name || piece.label || "").toLowerCase()) ||
        null;
      const rawSf = section
        ? Number(section.measuredSf)
        : isSplash
          ? null
          : measuredPieceSfFromScope(piece);
      const roundedSf =
        section != null
          ? Number(section.billedSf)
          : rawSf != null && included && !isSplash
            ? ceilBillableSquareFeet(rawSf)
            : null;
      if (included && !isSplash && rawSf != null) {
        roomMeasured = round2(roomMeasured + rawSf);
        roomBilled += Number(roundedSf) || 0;
      }
      pieceRows.push({
        pieceId: piece.id || null,
        name: str(piece.name || piece.label) || "Piece",
        pieceType: str(piece.pieceType || piece.type) || (isSplash ? "backsplash" : "counter"),
        lengthIn: piece.lengthIn != null ? Number(piece.lengthIn) : null,
        depthIn: piece.depthIn != null ? Number(piece.depthIn) : null,
        quantity: Math.max(1, Math.floor(Number(piece.quantity) || 1)),
        rawSquareFeet: rawSf,
        roundedSquareFeet: roundedSf,
        openEdgeLf: resolvePieceOpenEdgeLf(piece),
        included,
        roomId,
        roomName,
        isBacksplash: isSplash,
        roundingSource: section ? "elite100_pieceSections" : "ceilBillableSquareFeet"
      });
    }

    const measuredCountertopSf =
      priced?.measuredCountertopSf != null
        ? Number(priced.measuredCountertopSf)
        : roomMeasured;
    const billedCountertopSf =
      priced?.billedCountertopSf != null ? Number(priced.billedCountertopSf) : roomBilled;
    projectMeasuredSf = round2(projectMeasuredSf + measuredCountertopSf);
    projectBilledSf += billedCountertopSf;

    const backsplash = priced?.backsplash || null;
    if (backsplash?.billedSf) {
      projectBacksplashBilledSf += Number(backsplash.billedSf) || 0;
    }
    materialSubtotal = round2(
      materialSubtotal + (Number(priced?.countertopMaterialSubtotal) || 0)
    );
    backsplashSubtotal = round2(
      backsplashSubtotal + (Number(priced?.backsplashMaterialSubtotal) || 0)
    );
    cutoutSubtotal = round2(cutoutSubtotal + (Number(priced?.cutoutsTotal) || 0));
    productsSubtotal = round2(
      productsSubtotal +
        (Number(priced?.sinkProductsTotal) || 0) +
        (Number(priced?.productsTotal) || 0)
    );
    useTaxTotal = round2(useTaxTotal + (Number(priced?.materialUseTaxAmount) || 0));

    const materialLabel =
      reviewRoom?.material?.label ||
      friendlyMaterialLabel(sel?.material?.displayName) ||
      friendlyMaterialLabel(sel?.material?.materialToken) ||
      friendlyMaterialLabel(matFromSummary?.materialGroup) ||
      str(priced?.materialGroup) ||
      str(scope.materialGroup) ||
      null;
    const priceGroup =
      str(reviewRoom?.material?.group) ||
      str(matFromSummary?.materialGroup) ||
      str(priced?.materialGroup) ||
      str(scope.materialGroup) ||
      null;
    const edgeLabel =
      reviewRoom?.edge?.label ||
      (sel?.edgeMode ? resolveCustomerEdgeLabel(sel.edgeMode, null) : null) ||
      str(priced?.edge?.profileLabel) ||
      str(scope.edgeProfileToken) ||
      null;

    const sinkLabel =
      reviewRoom?.sink?.label ||
      str(sel?.sink?.displayName) ||
      (sel?.sink?.source === "customer_provided"
        ? [sel.sink.manufacturer, sel.sink.model].filter(Boolean).join(" ") ||
          "Customer-provided sink"
        : sel?.sink?.source === "none"
          ? "No sink"
          : null) ||
      null;
    const faucetLabel =
      reviewRoom?.faucet?.label ||
      str(sel?.faucet?.displayName) ||
      (sel?.faucet?.source === "customer_provided"
        ? [sel.faucet.manufacturer, sel.faucet.model].filter(Boolean).join(" ") ||
          "Customer-provided faucet"
        : null) ||
      null;

    const cutouts = priced?.cutouts || null;
    const roomInternalLines = [
      ...(Array.isArray(priced?.internalOnlyLines) ? priced.internalOnlyLines : []),
      ...(Array.isArray(priced?.absorbedLines) ? priced.absorbedLines : [])
    ].map((l) => ({
      label: str(l.description || l.name || l.label) || "Internal line",
      amount: money(l.amount ?? l.lineTotal),
      commercialRole: str(l.commercialRole) || "internal_only",
      visibility: "internal",
      internalOnly: true
    }));
    const roomCustomerLines = [
      ...(Array.isArray(priced?.customerFacingLines) ? priced.customerFacingLines : [])
    ].map((l) => ({
      label: str(l.description || l.name || l.label) || "Line",
      amount: money(l.amount ?? l.lineTotal),
      commercialRole: str(l.commercialRole) || "customer_charge",
      visibility: "customer",
      internalOnly: false
    }));

    roomsOut.push({
      roomId,
      roomName,
      roomType: str(room.roomType) || null,
      material: materialLabel,
      priceGroup,
      edgeProfile: edgeLabel,
      countertopMeasuredSf: measuredCountertopSf,
      countertopRoundedSf: billedCountertopSf,
      backsplash: backsplash
        ? {
            selected: Boolean(backsplash.selected),
            heightIn: backsplash.heightIn ?? null,
            measuredSf: backsplash.measuredSf ?? null,
            roundedSf: backsplash.billedSf ?? null,
            materialSubtotal: money(backsplash.materialSubtotal)
          }
        : null,
      sideSplash: priced?.sideSplash
        ? {
            measuredSf: priced.sideSplash.measuredSf ?? null,
            roundedSf: priced.sideSplash.billedSf ?? null
          }
        : null,
      sink: sinkLabel,
      sinkCutout: cutouts
        ? {
            kitchenSinkQty: Number(cutouts.kitchenSinkQty) || 0,
            kitchenSinkCharge: money(cutouts.kitchenSinkCharge),
            vanitySinkQty: Number(cutouts.vanitySinkQty) || 0,
            vanitySinkCharge: money(cutouts.vanitySinkCharge)
          }
        : null,
      faucet: faucetLabel,
      accessories: (reviewRoom?.accessories || sel?.accessories || []).map((a) => ({
        label: str(a.label || a.displayName) || "Accessory",
        quantity: Number(a.quantity) || 1
      })),
      specialty: (reviewRoom?.specialty || sel?.specialty || []).map((s) => ({
        label: str(s.label || s.displayName) || "Specialty",
        quantity: Number(s.quantity) || 1
      })),
      customerNote: str(reviewRoom?.notes || sel?.notes) || null,
      roomSubtotal: money(priced?.exactTotal ?? priced?.customerFacingLinesTotal),
      pieces: pieceRows,
      customerFacingLines: roomCustomerLines,
      internalOnlyLines: roomInternalLines,
      roundingCheck: {
        sumRoundedIncludedCountertopPieces: pieceRows
          .filter((p) => p.included && !p.isBacksplash && p.roundedSquareFeet != null)
          .reduce((s, p) => s + (Number(p.roundedSquareFeet) || 0), 0),
        roomCountertopRoundedSf: billedCountertopSf,
        matchesRoomTotal:
          billedCountertopSf ===
          pieceRows
            .filter((p) => p.included && !p.isBacksplash && p.roundedSquareFeet != null)
            .reduce((s, p) => s + (Number(p.roundedSquareFeet) || 0), 0)
      }
    });
  }

  const customerCustomTotal = round2(
    customerFacingCustom.reduce((s, l) => s + (Number(l.amount) || 0), 0)
  );
  const internalCustomTotal = round2(
    internalOnlyCustom.reduce((s, l) => s + (Number(l.amount) || 0), 0)
  );

  const report = {
    purpose:
      "Internal report for invoicing and job setup. Not customer-facing.",
    header: {
      estimateId: estimate?.id || null,
      estimateName,
      customerName:
        presented.customerName ||
        str(identity.displayName) ||
        str(identity.customerName) ||
        str(scope.customerName) ||
        null,
      customerEmail: str(identity.email) || str(scope.customerEmail) || null,
      intakeCaseId: estimate?.intakeCaseId || null,
      takeoffJobId: estimate?.takeoffJobId || null,
      source: estimate?.takeoffJobId ? "ai_takeoff" : "manual",
      acceptedAt: presented.acceptedAt,
      publicationId: presented.publicationId,
      estimateRevision: presented.estimateRevision ?? estimate?.revision ?? null,
      acceptedCustomerTotal: presented.customerDisplayTotal,
      publishedEstimateTotal: presented.publishedBaselineTotal,
      difference: presented.difference,
      selectionSource: presented.selectionSource,
      pricingBasis: str(calc.pricingBasis || scope.pricingBasis) || null,
      priceGroup: str(scope.materialGroup || presented.materialGroup) || null,
      materialSummary: materialLabelSummary(roomsOut, presented.materialGroup),
      preparedForQuickBooks: true,
      quickbooksInvoiceCreated: false,
      notice: "Prepared for QuickBooks/invoicing. No invoice has been created."
    },
    rooms: roomsOut,
    projectSquareFeet: {
      countertopMeasuredSf: projectMeasuredSf,
      countertopRoundedSf: projectBilledSf,
      backsplashRoundedSf: projectBacksplashBilledSf,
      roundingRule:
        "Each countertop piece is ceiled independently (ceilBillableSquareFeet) before summing — Pricing Engine v4 pieceSections."
    },
    lineItems: {
      customerFacing: [
        ...customerFacingCustom.map((l) => ({
          label: l.label,
          amount: money(l.amount),
          type: l.type,
          visibility: "customer",
          internalOnly: false
        })),
        ...fabCustomerFacing.map((l) => ({
          label: str(l.name || l.customerDescription) || "Line",
          amount: money(l.lineTotal ?? l.amount),
          type: "charge",
          visibility: "customer",
          internalOnly: false
        }))
      ],
      internalOnly: [
        ...internalOnlyCustom.map((l) => ({
          label: l.label,
          amount: money(l.amount),
          type: l.type,
          visibility: "internal",
          internalOnly: true
        })),
        ...fabInternal.map((l) => ({
          label: str(l.name || l.customerDescription) || "Internal line",
          amount: money(l.lineTotal ?? l.amount),
          type: "charge",
          visibility: "internal",
          internalOnly: true,
          commercialRole: str(l.commercialRole)
        }))
      ],
      notes: str(scope.quoteFlowPricing?.notes || scope.estimatorNotes) || null
    },
    invoicePreparation: {
      acceptedCustomerTotal: presented.customerDisplayTotal,
      materialCountertopTotal: money(materialSubtotal),
      backsplashTotal: money(backsplashSubtotal),
      sinkCutoutTotal: money(cutoutSubtotal),
      faucetAccessoriesTotal: money(productsSubtotal),
      customerFacingCustomLineTotal: money(customerCustomTotal),
      materialUseTax: money(useTaxTotal || calc?.totals?.estimateWideAdjustment?.materialUseTax),
      internalOnlyAdjustmentsTotal: money(internalCustomTotal),
      exactInternalTotal: money(calc?.totals?.exactInternalTotal),
      suggestedQuickBooksNotes: [
        `Accepted ${presented.acceptedAt || ""}`.trim(),
        `Estimate: ${estimateName}`,
        presented.selectionSource === "customer_configured"
          ? "Accepted as customer-configured selections"
          : "Accepted as published estimate",
        `Customer total: $${Number(presented.customerDisplayTotal ?? 0).toFixed(2)}`,
        "No QuickBooks invoice created by eliteOS."
      ]
        .filter(Boolean)
        .join(" · ")
    },
    configurationSummary: configSummary
      ? {
          rooms: summaryRooms.map((r) => ({
            roomKey: r.roomKey,
            displayName: r.displayName,
            material: r.material,
            edgeMode: r.edgeMode,
            backsplashMode: r.backsplashMode,
            sink: r.sink,
            faucet: r.faucet,
            accessories: r.accessories,
            specialty: r.specialty,
            sideSplash: r.sideSplash,
            notes: r.notes
          })),
          projectNote: configSummary.projectNote || null
        }
      : null
  };

  return {
    ok: true,
    status: "accepted",
    statusLabel:
      presented.selectionSource === "customer_configured"
        ? "Accepted (customer configured)"
        : "Accepted (as published)",
    acceptance: presented,
    report,
    sideEffects: { ...NO_SIDE_EFFECTS }
  };
}

function materialLabelSummary(rooms, fallbackGroup) {
  const labels = rooms
    .map((r) => [r.roomName, r.material || r.priceGroup].filter(Boolean).join(": "))
    .filter(Boolean);
  if (labels.length) return labels.join("; ");
  return str(fallbackGroup);
}

/**
 * @param {{
 *   estimateRepository?: { getById?: Function }|null,
 *   studioEstimateService?: { getById?: Function, repository?: object }|null,
 *   lifecycleRepository?: { getAcceptanceForEstimate?: Function }|null,
 *   loadSelectionReview?: Function|null,
 *   env?: NodeJS.ProcessEnv
 * }} deps
 */
export function createQuoteFlowAcceptedReportService(deps = {}) {
  const estimateRepository =
    deps.estimateRepository || deps.studioEstimateService?.repository || null;
  const studioEstimateService = deps.studioEstimateService || null;
  const lifecycleRepository = deps.lifecycleRepository || null;
  const loadSelectionReview = deps.loadSelectionReview || null;
  const env = deps.env || process.env;

  async function loadEstimateRow(organizationId, estimateId) {
    const id = String(estimateId || "").trim();
    if (!id) return null;
    if (estimateRepository?.getById) {
      return estimateRepository.getById(organizationId, id);
    }
    if (studioEstimateService?.getById) {
      return studioEstimateService.getById(organizationId, id);
    }
    return null;
  }

  async function getAcceptedReport({ organizationId, estimateId } = {}) {
    const row = await loadEstimateRow(organizationId, estimateId);
    if (!row) {
      throw createQuoteFlowError("estimate_not_found", {
        message: "Estimate not found.",
        statusCode: 404
      });
    }
    if (!isOfficialScopeSet(row)) {
      throw createQuoteFlowError("estimate_not_scoped", {
        message: "Official scope is not set for this estimate yet.",
        statusCode: 404
      });
    }

    let acceptance = null;
    if (lifecycleRepository?.getAcceptanceForEstimate) {
      try {
        acceptance = await lifecycleRepository.getAcceptanceForEstimate(
          organizationId,
          row.id || estimateId
        );
      } catch {
        acceptance = null;
      }
    }

    let selectionReview = null;
    if (typeof loadSelectionReview === "function" && acceptance) {
      try {
        selectionReview = await loadSelectionReview({
          organizationId,
          estimate: row,
          acceptance
        });
      } catch {
        selectionReview = null;
      }
    }

    void env;
    return buildQuoteFlowAcceptedReport(row, acceptance, { selectionReview });
  }

  return {
    getAcceptedReport,
    buildQuoteFlowAcceptedReport,
    presentQuoteFlowAcceptance,
    NO_SIDE_EFFECTS
  };
}
