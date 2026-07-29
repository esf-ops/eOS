/**
 * Safe, derived read model for the active AI estimator workspace.
 * Pure — no I/O. Consumes existing estimate / calculation / publication fields.
 * Never invents customer activity or authoritative prices.
 */

import { dedupeCustomerSafeCutoutLines } from "./customerSafeCutoutPresentation.mjs";
import { isBacksplashPiece } from "./estimatorPieceClassification.mjs";
import { partitionEstimatorWarnings } from "./estimatorWarningSafety.mjs";
import {
  distributeEstimateWideAdjustment,
  resolveEffectiveEstimateWideAdjustment
} from "./studioEstimateWideAdjustment.mjs";

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function str(v) {
  if (v == null) return "";
  return String(v).trim();
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function pieceSf(piece) {
  const p = piece && typeof piece === "object" ? piece : {};
  if (num(p.sqft) > 0) return round2(num(p.sqft));
  const len = num(p.lengthIn);
  const depth = num(p.depthIn);
  const qty = num(p.quantity) || 1;
  if (len > 0 && depth > 0) return round2((len * depth * qty) / 144);
  return 0;
}

function openingsFromScope(scope) {
  const addOns = scope?.addOns && typeof scope.addOns === "object" ? scope.addOns : {};
  const kitchenSink = num(addOns["qty-sink"]);
  const vanityBar = num(addOns["qty-bar"]);
  const cooktop = num(addOns["qty-cook"]);
  const outlet = num(addOns["qty-outlet"]);
  return {
    kitchenSink,
    vanityBarSink: vanityBar,
    cooktop,
    outlet,
    total: kitchenSink + vanityBar + cooktop + outlet
  };
}

function openingsFromRoom(room) {
  // Prefer room-level add-ons if present; else derive from piece cutouts when available.
  const addOns = room?.addOns && typeof room.addOns === "object" ? room.addOns : null;
  if (addOns) {
    return {
      kitchenSink: num(addOns["qty-sink"]),
      vanityBarSink: num(addOns["qty-bar"]),
      cooktop: num(addOns["qty-cook"]),
      outlet: num(addOns["qty-outlet"])
    };
  }
  return { kitchenSink: 0, vanityBarSink: 0, cooktop: 0, outlet: 0 };
}

/**
 * Build room-by-room verified scope from estimate.scope (server authority).
 * countertopSf = included counter/vanity tops only (never splash/fhb).
 * backsplashSf = included splash/fhb only.
 * @param {object|null|undefined} estimate
 */
export function buildVerifiedRoomsFromEstimate(estimate) {
  const scope = estimate?.scope && typeof estimate.scope === "object" ? estimate.scope : {};
  const rooms = Array.isArray(scope.rooms) ? scope.rooms : [];
  const built = rooms
    .filter((r) => r && r.included !== false)
    .map((room) => {
      const rawPieces = Array.isArray(room.pieces) ? room.pieces : [];
      const pieces = rawPieces
        .filter((p) => p && p.included !== false)
        .map((p) => ({
          id: str(p.id) || null,
          name: str(p.name) || str(p.label) || "Piece",
          type: str(p.pieceType) || str(p.type) || "counter",
          lengthIn: num(p.lengthIn) || null,
          depthIn: num(p.depthIn) || null,
          quantity: num(p.quantity) || 1,
          squareFeet: pieceSf(p),
          included: p.included !== false,
          isBacksplash: isBacksplashPiece(p)
        }));
      const counterPieces = pieces.filter((p) => !p.isBacksplash);
      const splashPieces = pieces.filter((p) => p.isBacksplash);
      // Always derive countertop from counter pieces — never trust room.countertopSqft,
      // which historically summed splash/fhb into the countertop field.
      const countertopSf = round2(counterPieces.reduce((s, p) => s + p.squareFeet, 0));
      const fromSplashPieces = round2(splashPieces.reduce((s, p) => s + p.squareFeet, 0));
      const roomBacksplashField = round2(num(room.backsplashSqft));
      const backsplashSf = roomBacksplashField > 0 ? roomBacksplashField : fromSplashPieces;
      const exposedEdgeLf = round2(
        num(room.edgeEligibleLinearFeet) ||
          num(room.finishedEdgeLf) ||
          pieces.reduce((s, p) => {
            const fe = rawPieces.find((x) => str(x.id) === p.id)?.finishedEdge;
            return s + (num(fe?.totalFinishedEdgeLengthIn) || num(fe?.frontEdgeLengthIn) || 0) / 12;
          }, 0)
      );
      return {
        id: str(room.id) || null,
        name: str(room.name) || "Room",
        countertopSf,
        backsplashSf,
        totalBillableStoneSf: round2(countertopSf + backsplashSf),
        exposedEdgeLf: round2(exposedEdgeLf),
        openingsByType: openingsFromRoom(room),
        pieces
      };
    });

  // Openings live on estimate-level addOns; attribute them to the sole room when
  // room-level openings are empty so the room card can show typed counts.
  const estimateOpenings = openingsFromScope(scope);
  if (
    built.length === 1 &&
    estimateOpenings.total > 0 &&
    built[0].openingsByType.kitchenSink +
      built[0].openingsByType.vanityBarSink +
      built[0].openingsByType.cooktop +
      built[0].openingsByType.outlet ===
      0
  ) {
    built[0] = { ...built[0], openingsByType: { ...estimateOpenings } };
  }
  return built;
}

/**
 * Customer-safe starting price groups from calculation reviewSummary + fabrication.
 * When an estimate-wide % is active, eligible line amounts are scaled in place
 * (no separate surcharge line).
 * @param {object|null|undefined} estimate
 * @returns {Array<{ key: string, label: string, amount: number }>}
 */
export function buildCustomerSafePriceGroups(estimate) {
  const calc = estimate?.calculation || estimate?.calculationSnapshot || {};
  const review = calc.reviewSummary && typeof calc.reviewSummary === "object" ? calc.reviewSummary : {};
  const totals = calc.totals && typeof calc.totals === "object" ? calc.totals : {};
  const scope = estimate?.scope && typeof estimate.scope === "object" ? estimate.scope : {};
  /** @type {Array<{ key: string, label: string, amount: number, percentageEligible?: boolean }>} */
  const groups = [];
  const push = (key, label, amount, percentageEligible = true) => {
    const a = round2(amount);
    if (a === 0) return;
    groups.push({ key, label, amount: a, percentageEligible });
  };
  push("countertop", "Countertop material", review.countertopMaterialTotal);
  push("backsplash", "Backsplash", review.backsplashTotal);
  push("tax", "Material use tax", review.materialTaxTotal);

  // Prefer typed cutout lines from reviewSummary when present.
  const cutoutLines = Array.isArray(review.cutoutLines) ? review.cutoutLines : [];
  for (const line of cutoutLines) {
    push(
      String(line.label || "cutout")
        .toLowerCase()
        .replace(/\s+/g, "_")
        .slice(0, 40),
      String(line.label || "Cutout"),
      line.amount
    );
  }

  // Remaining fabrication (edges, sinks, products, etc.) after typed cutouts.
  const cutoutSum = round2(cutoutLines.reduce((s, l) => s + (Number(l.amount) || 0), 0));
  const fabRemainder = round2((Number(review.fabricationTotal) || 0) - cutoutSum);
  if (fabRemainder > 0) {
    push("fabrication", "Edges & fabrication", fabRemainder);
  } else if (!cutoutLines.length) {
    push("fabrication", "Edges, cutouts & fabrication", review.fabricationTotal);
  }

  // Customer-visible commercial lines (Tear Out, etc.) — light read, no node:crypto.
  const rawCustom = Array.isArray(scope.customLineItems)
    ? scope.customLineItems
    : Array.isArray(scope.customLines)
      ? scope.customLines
      : [];
  for (const line of rawCustom) {
    if (!line || typeof line !== "object") continue;
    const role = str(line.commercialRole || line.commercial_role);
    if (role === "internal_only" || role === "absorbed") continue;
    const customerFacing =
      line.customerFacing === true ||
      line.customer_facing === true ||
      role === "customer_charge" ||
      role === "discount";
    if (!customerFacing) continue;
    const qty = num(line.quantity) || 1;
    const unit = num(line.unitPrice ?? line.unit_price);
    const amount = line.lineTotal != null ? num(line.lineTotal) : round2(qty * unit);
    if (!amount) continue;
    push(
      `custom_${String(line.id || line.name || "line").slice(0, 24)}`,
      str(line.customerDescription || line.customer_description || line.name) || "Custom line",
      amount,
      line.percentageEligible !== false && line.percentage_eligible !== false
    );
  }

  // Prefer elite100 / customerFacing per-room lineItems when present (more specific).
  const eliteRooms = Array.isArray(calc.elite100?.rooms)
    ? calc.elite100.rooms
    : Array.isArray(estimate?.calculationSnapshot?.elite100?.customerFacing?.rooms)
      ? estimate.calculationSnapshot.elite100.customerFacing.rooms
      : Array.isArray(estimate?.calculationSnapshot?.elite100?.rooms)
        ? estimate.calculationSnapshot.elite100.rooms
        : Array.isArray(calc.customerFacing?.rooms)
          ? calc.customerFacing.rooms
          : [];
  let baseGroups;
  if (eliteRooms.length) {
    const byLabel = new Map();
    for (const room of eliteRooms) {
      for (const li of room.lineItems || []) {
        const label = str(li.label);
        if (!label) continue;
        byLabel.set(label, round2((byLabel.get(label) || 0) + num(li.amount)));
      }
    }
    if (byLabel.size) {
      const raw = [...byLabel.entries()]
        .filter(([, amount]) => amount !== 0)
        .map(([label, amount]) => ({
          key: label.toLowerCase().replace(/\s+/g, "_").slice(0, 40),
          label,
          amount,
          percentageEligible: true
        }));
      // Merge commercial custom lines not already present.
      for (const g of groups.filter((x) => String(x.key).startsWith("custom_"))) {
        raw.push(g);
      }
      baseGroups = dedupeCustomerSafeCutoutLines(raw, { amountUnit: "dollars" });
    }
  }
  if (!baseGroups) {
    baseGroups = dedupeCustomerSafeCutoutLines(groups, { amountUnit: "dollars" });
  }

  const resolved = resolveEffectiveEstimateWideAdjustment({
    scopeAdjustment: scope.estimateWideAdjustment,
    partnerAccountId: scope.partnerAccountId || calc.account?.partnerAccountId
  });
  let deduped = baseGroups;
  if (resolved.active && resolved.percentage > 0) {
    const distributed = distributeEstimateWideAdjustment({
      percentage: resolved.percentage,
      lines: baseGroups.map((g) => ({
        id: g.key,
        amountExact: g.amount,
        percentageEligible: g.percentageEligible !== false
      }))
    });
    const byId = new Map(distributed.lines.map((l) => [l.id, l]));
    deduped = baseGroups.map((g) => {
      const adj = byId.get(g.key);
      return {
        key: g.key,
        label: g.label,
        amount: adj ? round2(adj.adjustedExact) : g.amount
      };
    });
  }

  const total = num(totals.customerDisplayTotal);
  const grouped = round2(deduped.reduce((s, g) => s + g.amount, 0));
  // Do not invent a "percentage surcharge" reconciling line when adjustment is active —
  // display total uses nearest-$10 rounding and may differ from exact adjusted sum.
  if (
    !resolved.active &&
    total > 0 &&
    deduped.length &&
    Math.abs(total - grouped) > 0.5
  ) {
    deduped.push({ key: "other", label: "Other / adjustments", amount: round2(total - grouped) });
  }
  if (!deduped.length && total > 0) {
    deduped.push({ key: "total", label: "Starting estimate total", amount: total });
  }
  return deduped.map(({ key, label, amount }) => ({ key, label, amount }));
}

/**
 * Diff two scopes for revision comparison (geometry only).
 * @param {object|null|undefined} baseEstimate
 * @param {object|null|undefined} draftEstimate
 */
export function buildMeasurementRevisionComparison(baseEstimate, draftEstimate) {
  const baseRooms = buildVerifiedRoomsFromEstimate(baseEstimate);
  const draftRooms = buildVerifiedRoomsFromEstimate(draftEstimate);
  const baseMap = new Map(baseRooms.map((r) => [r.name, r]));
  const draftMap = new Map(draftRooms.map((r) => [r.name, r]));
  /** @type {Array<{ kind: string, label: string, from: string|number|null, to: string|number|null }>} */
  const changedItems = [];

  for (const [name, draft] of draftMap) {
    const base = baseMap.get(name);
    if (!base) {
      changedItems.push({ kind: "added_room", label: `Added room ${name}`, from: null, to: name });
      continue;
    }
    const basePieces = new Map(base.pieces.map((p) => [p.name, p]));
    const draftPieces = new Map(draft.pieces.map((p) => [p.name, p]));
    for (const [pname, dp] of draftPieces) {
      const bp = basePieces.get(pname);
      if (!bp) {
        changedItems.push({
          kind: "added_piece",
          label: `${name} — added ${pname}`,
          from: null,
          to: pname
        });
        continue;
      }
      if (num(bp.lengthIn) !== num(dp.lengthIn)) {
        changedItems.push({
          kind: "length",
          label: `${name} — ${pname} length`,
          from: num(bp.lengthIn),
          to: num(dp.lengthIn)
        });
      }
      if (num(bp.depthIn) !== num(dp.depthIn)) {
        changedItems.push({
          kind: "depth",
          label: `${name} — ${pname} depth`,
          from: num(bp.depthIn),
          to: num(dp.depthIn)
        });
      }
      if (num(bp.quantity) !== num(dp.quantity)) {
        changedItems.push({
          kind: "quantity",
          label: `${name} — ${pname} quantity`,
          from: num(bp.quantity),
          to: num(dp.quantity)
        });
      }
    }
    for (const [pname] of basePieces) {
      if (!draftPieces.has(pname)) {
        changedItems.push({
          kind: "removed_piece",
          label: `${name} — removed ${pname}`,
          from: pname,
          to: null
        });
      }
    }
    if (round2(base.countertopSf) !== round2(draft.countertopSf)) {
      changedItems.push({
        kind: "room_sf",
        label: `${name} countertop SF`,
        from: round2(base.countertopSf),
        to: round2(draft.countertopSf)
      });
    }
    if (round2(base.backsplashSf) !== round2(draft.backsplashSf)) {
      changedItems.push({
        kind: "backsplash",
        label: `${name} backsplash SF`,
        from: round2(base.backsplashSf),
        to: round2(draft.backsplashSf)
      });
    }
  }
  for (const [name] of baseMap) {
    if (!draftMap.has(name)) {
      changedItems.push({ kind: "removed_room", label: `Removed room ${name}`, from: name, to: null });
    }
  }

  const baseOpen = openingsFromScope(baseEstimate?.scope);
  const draftOpen = openingsFromScope(draftEstimate?.scope);
  for (const key of ["kitchenSink", "vanityBarSink", "cooktop", "outlet"]) {
    if (baseOpen[key] !== draftOpen[key]) {
      changedItems.push({
        kind: "opening",
        label: `${key} openings`,
        from: baseOpen[key],
        to: draftOpen[key]
      });
    }
  }

  const previousTotal = num(
    baseEstimate?.calculation?.totals?.customerDisplayTotal ??
      baseEstimate?.approval?.customerDisplayTotal
  );
  const revisedTotal = num(
    draftEstimate?.calculation?.totals?.customerDisplayTotal ??
      draftEstimate?.approval?.customerDisplayTotal
  );
  const baseSf = round2(baseRooms.reduce((s, r) => s + r.countertopSf, 0));
  const draftSf = round2(draftRooms.reduce((s, r) => s + r.countertopSf, 0));
  if (baseSf !== draftSf) {
    changedItems.unshift({
      kind: "total_sf",
      label: "Total countertop SF",
      from: baseSf,
      to: draftSf
    });
  }

  return {
    baseRevision: num(baseEstimate?.revision) || null,
    draftRevision: num(draftEstimate?.revision) || null,
    changedItems,
    previousCountertopSf: baseSf,
    revisedCountertopSf: draftSf,
    previousTotal: previousTotal || null,
    revisedTotal: revisedTotal || null,
    difference:
      previousTotal && revisedTotal ? round2(revisedTotal - previousTotal) : null,
    pricingStale: !draftEstimate?.calculation?.totals?.customerDisplayTotal
  };
}

/**
 * @param {{
 *   estimate: object,
 *   priorEstimate?: object|null,
 *   publicationSummary?: object|null,
 *   digitalEstimateRead?: object|null,
 *   stageHint?: string|null
 * }} args
 */
export function buildAiEstimatorSummary(args = {}) {
  const estimate = args.estimate || {};
  const prior = args.priorEstimate || null;
  const pub = args.publicationSummary || null;
  const deRead = args.digitalEstimateRead || null;
  const scope = estimate.scope && typeof estimate.scope === "object" ? estimate.scope : {};
  const calc = estimate.calculation || estimate.calculationSnapshot || {};
  const totals = calc.totals && typeof calc.totals === "object" ? calc.totals : {};
  const rooms = buildVerifiedRoomsFromEstimate(estimate);
  const openings = openingsFromScope(scope);
  const countertopSf = round2(rooms.reduce((s, r) => s + r.countertopSf, 0));
  const backsplashSf = round2(rooms.reduce((s, r) => s + r.backsplashSf, 0));
  const exposedEdgeLf = round2(
    num(calc.fabrication?.edge?.finalLf) ||
      num(calc.scopeBilling?.edgeLf) ||
      num(scope.edgeEligibleLinearFeet) ||
      rooms.reduce((s, r) => s + r.exposedEdgeLf, 0)
  );

  const publishedRevision =
    pub?.revision != null
      ? num(pub.revision)
      : deRead?.publicationSummary?.revision != null
        ? num(deRead.publicationSummary.revision)
        : null;
  const currentRevision = num(estimate.revision) || 1;
  const customerDisplayTotal =
    totals.customerDisplayTotal != null ? num(totals.customerDisplayTotal) : null;

  const reviewRequests = Array.isArray(deRead?.reviewRequests) ? deRead.reviewRequests : [];
  const openReview = reviewRequests.find((r) => r && r.open !== false && !r.resolvedAt) || null;
  const configuredTotal =
    openReview?.configuredDisplayTotal != null
      ? num(openReview.configuredDisplayTotal)
      : deRead?.activePublication?.configuredDisplayTotal != null
        ? num(deRead.activePublication.configuredDisplayTotal)
        : null;

  const activityState = str(pub?.customerActivityState || pub?.state) || "not_published";
  const activityLabel = str(pub?.customerActivityLabel || pub?.statusLabel) || null;

  const unresolved = Array.isArray(calc.unresolvedItems) ? calc.unresolvedItems : [];
  const warnings = Array.isArray(calc.warnings) ? calc.warnings : [];
  const { estimatorWarnings, internalDiagnostics } = partitionEstimatorWarnings(warnings);
  const activeReview = estimate.activeReview || null;

  const comparison =
    prior && estimate
      ? buildMeasurementRevisionComparison(prior, estimate)
      : null;

  return {
    revision: {
      current: currentRevision,
      published: publishedRevision,
      hasNewerApprovedRevision:
        publishedRevision != null &&
        currentRevision > publishedRevision &&
        Boolean(estimate.approval || estimate.calculation)
    },
    measurements: {
      countertopSf,
      backsplashSf,
      totalBillableStoneSf: round2(countertopSf + backsplashSf),
      exposedEdgeLf,
      openingsByType: openings
    },
    rooms,
    pricing: {
      customerDisplayTotal,
      customerSafeGroups: buildCustomerSafePriceGroups(estimate),
      unresolvedItems: unresolved.map((u) => ({
        code: str(u?.code) || null,
        message: str(u?.message) || "Unresolved item"
      })),
      // Normal estimator UI — estimatorWarnings only (never raw adapter diagnostics).
      warnings: estimatorWarnings,
      estimatorWarnings,
      activeReviewBlockers: Array.isArray(activeReview?.blockers)
        ? activeReview.blockers.map((b) => ({
            code: str(b?.code) || null,
            message: str(b?.message) || "Blocker"
          }))
        : []
    },
    // Internal diagnostics stay off the normal UI path (tests/logs only).
    internalDiagnostics,
    publication: {
      isPublished: Boolean(pub?.active || pub?.customerUrl || deRead?.activePublication),
      publishedAt: pub?.publishedAt || deRead?.activePublication?.publishedAt || null,
      pricingValidThrough:
        deRead?.publishedConfiguration?.pricingValidThrough ||
        deRead?.activePublication?.pricingValidThrough ||
        null,
      customerUrlAvailable: Boolean(pub?.customerUrlAvailable ?? pub?.customerUrl),
      customerUrl: pub?.customerUrl || deRead?.activePublication?.customerUrl || null,
      customerActivityState: activityState,
      customerActivityLabel: activityLabel,
      lastCustomerActivityAt: pub?.lastCustomerActivityAt || null,
      customerConfiguredTotal: configuredTotal,
      customerDifference:
        configuredTotal != null && customerDisplayTotal != null
          ? round2(configuredTotal - customerDisplayTotal)
          : null,
      reviewRequested: Boolean(pub?.reviewRequestOpen || openReview),
      finalApproved: /final|accepted|sold/i.test(activityState)
    },
    comparison
  };
}
