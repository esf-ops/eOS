/**
 * Present Estimates list/detail for Quote Flow Slice 1D.
 */

/**
 * @param {object|null|undefined} scope
 */
export function summarizeOfficialScope(scope) {
  const rooms = Array.isArray(scope?.rooms) ? scope.rooms : [];
  let roomCount = 0;
  let pieceCount = 0;
  for (const room of rooms) {
    if (!room || room.included === false) continue;
    roomCount += 1;
    const pieces = Array.isArray(room.pieces) ? room.pieces : [];
    for (const piece of pieces) {
      if (!piece) continue;
      if (piece.excluded === true || piece.include === false || piece.included === false) continue;
      pieceCount += 1;
    }
  }
  return {
    roomCount,
    pieceCount,
    label:
      roomCount === 0
        ? "No rooms"
        : `${roomCount} room${roomCount === 1 ? "" : "s"} · ${pieceCount} piece${
            pieceCount === 1 ? "" : "s"
          }`
  };
}

/**
 * @param {string} status
 */
export function mapQuoteFlowEstimateStatus(status) {
  const s = String(status || "").toLowerCase();
  if (s === "priced") {
    return { key: "priced", label: "Priced", nextAction: "Open estimate" };
  }
  if (s === "approved") {
    return { key: "approved", label: "Approved", nextAction: "Open estimate" };
  }
  if (s === "ready_to_price") {
    return {
      key: "scope_set",
      label: "Scope set",
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
    identity.displayName ||
    identity.accountName ||
    identity.customerName ||
    scope.customerName ||
    estimate?.customerName ||
    null;
  const projectName =
    scope.projectName || identity.projectName || estimate?.projectName || null;
  const accountName =
    identity.accountName || scope.accountName || estimate?.accountName || customerName || null;
  const status = mapQuoteFlowEstimateStatus(estimate?.status);
  const scopeSummary = summarizeOfficialScope(scope);

  return {
    estimateId: estimate?.id || estimate?.estimateId || null,
    intakeCaseId: estimate?.intakeCaseId || null,
    takeoffJobId: estimate?.takeoffJobId || null,
    customerName,
    accountName,
    projectName,
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
      addOns: scope.addOns && typeof scope.addOns === "object" ? scope.addOns : undefined
    },
    revision: estimate?.revision ?? null,
    sourceTakeoffResultId: estimate?.sourceTakeoffResultId || null
  };
}
