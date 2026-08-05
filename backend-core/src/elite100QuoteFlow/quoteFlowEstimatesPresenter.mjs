/**
 * Present Estimates list/detail for Quote Flow official scoped workspace.
 */

/**
 * @param {unknown} value
 */
function cleanLabel(value) {
  const s = String(value || "").trim();
  if (!s) return null;
  if (/^unknown contact$/i.test(s)) return null;
  if (/^customer not identified$/i.test(s)) return null;
  if (/^project not named$/i.test(s)) return null;
  if (/^AAMk/i.test(s) && s.length > 24) return null;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return null;
  return s;
}

/**
 * @param {string|null|undefined} filename
 */
export function filenameWithoutExtension(filename) {
  const raw = cleanLabel(filename);
  if (!raw) return null;
  return raw.replace(/\.(pdf|png|jpe?g|heic|webp|svg)$/i, "").trim() || raw;
}

/**
 * Best display name for a scoped estimate (list + detail).
 * @param {object} input
 */
export function resolveEstimateDisplayName(input = {}) {
  const scope = input.scope && typeof input.scope === "object" ? input.scope : {};
  return (
    cleanLabel(scope.projectName) ||
    cleanLabel(scope.quoteFlowEstimateName) ||
    cleanLabel(input.estimateName) ||
    cleanLabel(input.title) ||
    cleanLabel(input.projectName) ||
    cleanLabel(input.subject) ||
    filenameWithoutExtension(input.planFilename || scope.planFilename) ||
    cleanLabel(input.customerName) ||
    cleanLabel(input.accountName) ||
    cleanLabel(input.senderName) ||
    "Untitled estimate"
  );
}

/**
 * @param {object|null|undefined} scope
 * @param {{ takeoffJobId?: string|null, sourceTakeoffResultId?: string|null }} [meta]
 */
export function resolveScopeSource(scope, meta = {}) {
  const source = String(scope?.source || "").toLowerCase();
  if (source.includes("manual") || source === "quote_flow_manual_scope") {
    return { key: "manual", label: "Manual scope" };
  }
  if (
    source.includes("takeoff") ||
    source.includes("ai") ||
    meta.takeoffJobId ||
    meta.sourceTakeoffResultId
  ) {
    return { key: "ai_takeoff", label: "AI Takeoff" };
  }
  if (source) {
    return { key: "unknown", label: "Unknown" };
  }
  if (meta.takeoffJobId || meta.sourceTakeoffResultId) {
    return { key: "ai_takeoff", label: "AI Takeoff" };
  }
  return { key: "unknown", label: "Unknown" };
}

/**
 * Resolve open/exposed edge linear feet from common scope field names.
 * Canonical write path is piece.openEdgeLf.
 * @param {object|null|undefined} piece
 */
export function resolvePieceOpenEdgeLf(piece) {
  if (!piece || typeof piece !== "object") return 0;
  const candidates = [
    piece.openEdgeLf,
    piece.exposedEdgeLf,
    piece.exposedEdgeLinearFeet,
    piece.openEdgeLinearFeet,
    piece.edgeLinearFeet,
    piece.edgeLf,
    piece.finishedEdgeLf
  ];
  for (const c of candidates) {
    if (c == null || c === "") continue;
    const n = Number(c);
    if (Number.isFinite(n) && n > 0) return Math.round(n * 100) / 100;
  }
  const fe = piece.finishedEdge;
  if (fe && typeof fe === "object") {
    const inches = Number(fe.totalFinishedEdgeLengthIn);
    if (Number.isFinite(inches) && inches > 0) {
      return Math.round((inches / 12) * 100) / 100;
    }
    const lfAlias = Number(fe.totalFinishedEdgeLengthLf ?? fe.linearFeet ?? fe.total);
    if (Number.isFinite(lfAlias) && lfAlias > 0) {
      return Math.round(lfAlias * 100) / 100;
    }
  }
  return 0;
}

/**
 * @param {object|null|undefined} scope
 */
export function summarizeOfficialScope(scope) {
  const rooms = Array.isArray(scope?.rooms) ? scope.rooms : [];
  let roomCount = 0;
  let pieceCount = 0;
  let excludedPieceCount = 0;
  let countertopSf = 0;
  let backsplashSf = 0;
  let openEdgeLf = 0;

  for (const room of rooms) {
    if (!room) continue;
    const roomIncluded = room.included !== false;
    if (roomIncluded) roomCount += 1;

    const pieces = Array.isArray(room.pieces) ? room.pieces : [];
    for (const piece of pieces) {
      if (!piece) continue;
      const included =
        piece.excluded !== true && piece.include !== false && piece.included !== false;
      if (!included) {
        excludedPieceCount += 1;
        continue;
      }
      if (!roomIncluded) continue;
      pieceCount += 1;
      const lengthIn = Number(piece.lengthIn) || 0;
      const depthIn = Number(piece.depthIn) || 0;
      const quantity = Math.max(1, Math.floor(Number(piece.quantity) || 1));
      const sf = lengthIn > 0 && depthIn > 0 ? (lengthIn * depthIn * quantity) / 144 : 0;
      const pieceType = String(piece.pieceType || "").toLowerCase();
      const isSplash =
        piece.includeBacksplash === true ||
        pieceType === "splash" ||
        pieceType === "backsplash" ||
        pieceType === "fhb";
      if (isSplash) backsplashSf += sf;
      else countertopSf += sf;
      openEdgeLf += resolvePieceOpenEdgeLf(piece) * quantity;
    }

    if (roomIncluded && room.includeBacksplash === true) {
      const h = Number(room.backsplashHeightIn) || 0;
      const len = Number(room.backsplashMeasuredLengthIn) || 0;
      if (h > 0 && len > 0) backsplashSf += (h * len) / 144;
    }
  }

  const round2 = (n) => Math.round(n * 100) / 100;
  countertopSf = round2(countertopSf);
  backsplashSf = round2(backsplashSf);
  openEdgeLf = round2(openEdgeLf);

  const parts = [
    roomCount === 0
      ? "No rooms"
      : `${roomCount} room${roomCount === 1 ? "" : "s"} · ${pieceCount} piece${
          pieceCount === 1 ? "" : "s"
        }`
  ];
  if (countertopSf > 0) parts.push(`${countertopSf.toFixed(1)} SF countertop`);
  if (backsplashSf > 0) parts.push(`${backsplashSf.toFixed(1)} SF backsplash`);
  if (openEdgeLf > 0) parts.push(`${openEdgeLf.toFixed(1)} LF open edge`);

  return {
    roomCount,
    pieceCount,
    excludedPieceCount,
    countertopSf,
    backsplashSf,
    openEdgeLf,
    label: parts.join(" · ")
  };
}

/**
 * @param {object} estimate
 * @param {object} scope
 */
export function mapQuoteFlowEstimateStatus(estimate, scope = {}) {
  const commercial = String(estimate?.status || "").toLowerCase();
  const qfReview =
    scope.quoteFlowReview && typeof scope.quoteFlowReview === "object" ? scope.quoteFlowReview : null;
  const qfDe =
    scope.quoteFlowDigitalEstimate && typeof scope.quoteFlowDigitalEstimate === "object"
      ? scope.quoteFlowDigitalEstimate
      : null;
  const staleReview =
    qfReview?.status === "stale" ||
    (commercial === "approved" && String(estimate?.staleReason || "").trim());
  const dePublished =
    qfDe?.status === "published" ||
    (Boolean(qfDe?.publicationId || qfDe?.customerUrl) && qfDe?.status !== "stale");
  const deNeedsRepublish = qfDe?.status === "stale";

  if (deNeedsRepublish) {
    return {
      key: "needs_republish",
      label: "Needs republish",
      nextAction: staleReview ? "Open Review" : "Open Digital Estimate"
    };
  }
  if (dePublished && commercial === "approved" && !staleReview) {
    return {
      key: "published",
      label: "Published",
      nextAction: "Open Digital Estimate"
    };
  }
  if (commercial === "approved" && !staleReview) {
    return { key: "approved", label: "Approved", nextAction: "Open Digital Estimate" };
  }
  if (staleReview || (qfReview?.status === "stale" && commercial !== "approved")) {
    return {
      key: "needs_review",
      label: "Re-review required",
      nextAction: "Open Review"
    };
  }
  if (commercial === "priced") {
    return { key: "priced", label: "Priced", nextAction: "Open Review" };
  }
  const edited =
    scope.quoteFlowScopeEdited === true ||
    scope.quoteFlowManualEdits === true ||
    (Number(estimate?.revision) > 1 && commercial === "ready_to_price");
  if (edited) {
    return {
      key: "scope_edited",
      label: "Scope edited",
      nextAction: "Edit official scope"
    };
  }
  return {
    key: "scope_set",
    label: "Scope set",
    nextAction: "Edit official scope"
  };
}

/**
 * @param {object} estimate studio estimate row or safe view
 */
export function presentQuoteFlowEstimateListItem(estimate) {
  const scope = estimate?.scope && typeof estimate.scope === "object" ? estimate.scope : {};
  const identity =
    estimate?.customerIdentitySnapshot && typeof estimate.customerIdentitySnapshot === "object"
      ? estimate.customerIdentitySnapshot
      : scope.customerIdentitySnapshot && typeof scope.customerIdentitySnapshot === "object"
        ? scope.customerIdentitySnapshot
        : {};
  const customerName =
    cleanLabel(identity.displayName) ||
    cleanLabel(identity.accountName) ||
    cleanLabel(identity.customerName) ||
    cleanLabel(scope.customerName) ||
    cleanLabel(estimate?.customerName) ||
    null;
  const accountName =
    cleanLabel(identity.accountName) ||
    cleanLabel(scope.accountName) ||
    cleanLabel(estimate?.accountName) ||
    customerName ||
    null;
  const planFilename =
    cleanLabel(scope.planFilename) ||
    cleanLabel(estimate?.planFilename) ||
    cleanLabel(identity.planFilename) ||
    null;
  const subject =
    cleanLabel(scope.subject) ||
    cleanLabel(estimate?.subject) ||
    cleanLabel(identity.subject) ||
    null;
  const projectName =
    cleanLabel(scope.projectName) ||
    cleanLabel(scope.quoteFlowEstimateName) ||
    cleanLabel(identity.projectName) ||
    cleanLabel(estimate?.projectName) ||
    null;
  const estimateName = resolveEstimateDisplayName({
    scope,
    projectName,
    subject,
    planFilename,
    customerName,
    accountName,
    estimateName: estimate?.estimateName || estimate?.title,
    title: estimate?.title
  });
  const scopeSource = resolveScopeSource(scope, {
    takeoffJobId: estimate?.takeoffJobId || null,
    sourceTakeoffResultId: estimate?.sourceTakeoffResultId || null
  });
  const status = mapQuoteFlowEstimateStatus(estimate, scope);
  const scopeSummary = summarizeOfficialScope(scope);

  return {
    estimateId: estimate?.id || estimate?.estimateId || null,
    intakeCaseId: estimate?.intakeCaseId || null,
    takeoffJobId: estimate?.takeoffJobId || null,
    revision: Number(estimate?.revision) || null,
    estimateName,
    displayName: estimateName,
    customerName,
    accountName,
    projectName: projectName || estimateName,
    subject,
    planFilename,
    scopeSource,
    scopeSummary,
    status,
    nextAction: status.nextAction,
    updatedAt: estimate?.updatedAt || null,
    createdAt: estimate?.createdAt || null,
    commercialStatus: estimate?.status || null
  };
}

/**
 * Official scope payload for detail + after PATCH.
 * @param {object} estimate
 */
export function presentQuoteFlowEstimateDetail(estimate) {
  const list = presentQuoteFlowEstimateListItem(estimate);
  const scope = estimate?.scope && typeof estimate.scope === "object" ? estimate.scope : {};
  return {
    ...list,
    scope: {
      rooms: Array.isArray(scope.rooms) ? scope.rooms : [],
      addOns: scope.addOns && typeof scope.addOns === "object" ? scope.addOns : undefined,
      projectName: cleanLabel(scope.projectName) || null,
      quoteFlowEstimateName: cleanLabel(scope.quoteFlowEstimateName) || null,
      source: scope.source != null ? String(scope.source) : null,
      planFilename: cleanLabel(scope.planFilename) || null
    },
    revision: estimate?.revision ?? null,
    sourceTakeoffResultId: estimate?.sourceTakeoffResultId || null
  };
}
