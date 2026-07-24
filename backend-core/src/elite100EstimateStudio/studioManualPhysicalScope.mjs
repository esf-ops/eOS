/**
 * Manual physical scope — normalize/validate into the same room/piece shape
 * consumed by Studio pricing (mirrors takeoff-seeded scope).
 *
 * Server is authoritative for estimateOrigin / physicalScopeSource /
 * manualScopeConfirmed. Browser drafts are never trusted for those flags.
 */

import { createHash } from "node:crypto";
import { STUDIO_SUPPORTED_ADDON_KEYS } from "./studioEstimateTypes.mjs";
import { applyRoomBacksplashPatch } from "./studioRoomBacksplash.mjs";

export const MANUAL_ESTIMATE_ORIGIN = "manual_staff";
export const MANUAL_PHYSICAL_SCOPE_SOURCE = "manual_staff";

export const MANUAL_ROOM_TYPES = Object.freeze([
  "Kitchen",
  "Island",
  "Vanity",
  "Bar",
  "Laundry",
  "Fireplace",
  "Shower",
  "Other"
]);

export const MANUAL_PIECE_TYPES = Object.freeze([
  "counter",
  "island",
  "vanity_top",
  "bar_top",
  "backsplash",
  "waterfall",
  "fireplace",
  "shower",
  "custom_rect",
  "other"
]);

export const MANUAL_MEASUREMENT_MODES = Object.freeze({
  DIMENSIONS: "dimensions",
  DIRECT_AREA: "direct_area"
});

/** Cutout qty keys estimators may set on manual scope (existing pricing keys only). */
export const MANUAL_CUTOUT_ADDON_KEYS = Object.freeze([
  "qty-sink",
  "qty-bar",
  "qty-cook",
  "qty-outlet"
]);

/** Estimator-facing labels for cutout keys (never show raw keys as primary UI). */
export const MANUAL_CUTOUT_LABELS = Object.freeze({
  "qty-sink": "Kitchen sink openings",
  "qty-bar": "Vanity / bar sink openings",
  "qty-cook": "Cooktop openings",
  "qty-outlet": "Electrical outlet openings"
});

export const MANUAL_BACKSPLASH_MODES = Object.freeze([
  "none",
  "standard",
  "custom",
  "full_height"
]);

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function sqftFromDimensions(lengthIn, depthIn) {
  const L = Number(lengthIn) || 0;
  const D = Number(depthIn) || 0;
  if (L <= 0 || D <= 0) return 0;
  // Same conversion used by seedScopeFromTakeoffPayload / applyRoomBacksplashPatch.
  return round2((L * D) / 144);
}

function stableId(prefix, seed) {
  const s = String(seed || "").trim();
  if (s) return s.slice(0, 80);
  return `${prefix}_${createHash("sha256").update(`${prefix}:${Date.now()}:${Math.random()}`).digest("hex").slice(0, 12)}`;
}

/**
 * Strip client-controlled authority flags from an incoming scope patch.
 * @param {object} scope
 */
export function stripClientManualAuthority(scope) {
  if (!scope || typeof scope !== "object") return scope;
  const next = { ...scope };
  delete next.manualScopeConfirmed;
  delete next.manualScopeConfirmedAt;
  delete next.manualScopeConfirmedBy;
  delete next.manualScopeFingerprint;
  delete next.manualCreateRequestFingerprint;
  delete next.estimateOrigin;
  delete next.physicalScopeSource;
  // Never accept takeoff authority markers from the browser on a manual draft.
  delete next.takeoffApproved;
  delete next.takeoffScopeSummary;
  return next;
}

/**
 * Fingerprint of the create-request business fields for idempotency conflict checks.
 * Not a permanent business-payload dedupe key — only compared when the same
 * Idempotency-Key retries within an organization.
 * @param {object} [body]
 */
export function manualCreateRequestFingerprint(body = {}) {
  const payload = {
    customerName: String(body.customerName || "").trim().slice(0, 200),
    customerContactName: String(body.customerContactName || "").trim().slice(0, 200),
    customerEmail: String(body.customerEmail || "").trim().slice(0, 200),
    customerPhone: String(body.customerPhone || "").trim().slice(0, 80),
    projectName: String(body.projectName || "").trim().slice(0, 200),
    projectAddress: String(body.projectAddress || "").trim().slice(0, 400),
    estimatorNotes: String(body.estimatorNotes || body.internalNotes || "").trim().slice(0, 4000),
    accountDirectoryAccountId: body.accountDirectoryAccountId
      ? String(body.accountDirectoryAccountId).trim()
      : null,
    accountDirectoryContactId: body.accountDirectoryContactId
      ? String(body.accountDirectoryContactId).trim()
      : null,
    accountDirectoryLocationId: body.accountDirectoryLocationId
      ? String(body.accountDirectoryLocationId).trim()
      : null
  };
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

/**
 * @param {unknown} value
 * @returns {'dimensions'|'direct_area'}
 */
export function normalizeMeasurementMode(value) {
  const m = String(value || "").toLowerCase().trim();
  if (m === MANUAL_MEASUREMENT_MODES.DIRECT_AREA || m === "direct" || m === "area") {
    return MANUAL_MEASUREMENT_MODES.DIRECT_AREA;
  }
  return MANUAL_MEASUREMENT_MODES.DIMENSIONS;
}

/**
 * Normalize one piece into pricing-compatible shape.
 * @param {object} piece
 * @param {string} roomId
 */
export function normalizeManualPiece(piece, roomId) {
  const id = stableId("piece", piece?.id);
  const name = String(piece?.name || piece?.label || "Piece").trim().slice(0, 120) || "Piece";
  let pieceType = String(piece?.pieceType || "counter").trim().toLowerCase() || "counter";
  if (pieceType === "vanity") pieceType = "vanity_top";
  if (!MANUAL_PIECE_TYPES.includes(pieceType) && pieceType !== "counter") {
    pieceType = "other";
  }
  const included = piece?.included !== false;
  const mode = normalizeMeasurementMode(piece?.measurementMode);
  const lengthIn = Number(piece?.lengthIn) || 0;
  const depthIn = Number(piece?.depthIn) || 0;
  let sqft = 0;
  /** @type {Record<string, unknown>} */
  const out = {
    id,
    name,
    pieceType,
    included,
    measurementMode: mode,
    source: MANUAL_ESTIMATE_ORIGIN,
    roomId: roomId || null,
    notes: String(piece?.notes || "").slice(0, 2000)
  };

  if (mode === MANUAL_MEASUREMENT_MODES.DIRECT_AREA) {
    sqft = round2(Number(piece?.sqft) || Number(piece?.directSqft) || 0);
    // Dimensions may be retained for display but are not authoritative.
    if (lengthIn > 0) out.lengthIn = lengthIn;
    if (depthIn > 0) out.depthIn = depthIn;
    out.directAreaOverride = true;
  } else {
    out.lengthIn = lengthIn;
    out.depthIn = depthIn;
    sqft = sqftFromDimensions(lengthIn, depthIn);
    out.directAreaOverride = false;
  }
  out.sqft = sqft;

  if (pieceType === "vanity_top") {
    out.pricingLabel = "Vanity top (standard countertop pricing)";
  }

  const fe = piece?.finishedEdge;
  if (fe && typeof fe === "object") {
    const front = Number(fe.frontEdgeLengthIn) || 0;
    const left = Number(fe.leftExposedEdgeLengthIn) || 0;
    const right = Number(fe.rightExposedEdgeLengthIn) || 0;
    const other = Number(fe.otherExposedEdgeLengthIn) || 0;
    const total =
      Number(fe.totalFinishedEdgeLengthIn) ||
      round2(front + left + right + other);
    out.finishedEdge = {
      frontEdgeLengthIn: front,
      leftExposedEdgeLengthIn: left,
      rightExposedEdgeLengthIn: right,
      otherExposedEdgeLengthIn: other,
      totalFinishedEdgeLengthIn: total,
      approved: fe.approved === true || total > 0,
      source: "estimator_confirmed"
    };
  }

  if (piece?.backsplashGeometry && typeof piece.backsplashGeometry === "object") {
    out.backsplashGeometry = piece.backsplashGeometry;
  }
  if (piece?.backsplashEligible != null) {
    out.backsplashEligible = piece.backsplashEligible === true;
  }
  if (piece?.backsplashEligibleLengthIn != null) {
    out.backsplashEligibleLengthIn = Number(piece.backsplashEligibleLengthIn) || 0;
  }

  if (Array.isArray(piece?.cutouts) && piece.cutouts.length) {
    out.cutouts = piece.cutouts.slice(0, 40).map((c) => ({
      type: String(c?.type || c?.cutoutType || "other").slice(0, 40),
      quantity: Math.max(0, Math.floor(Number(c?.quantity) || 0))
    }));
  }

  return out;
}

/**
 * Normalize room-level backsplash geometry for manual physical scope.
 * Uses the same length×height/144 conversion as Pricing Setup / Takeoff seed.
 * @param {object} room
 */
export function normalizeManualRoomBacksplash(room) {
  const modeRaw = String(room?.backsplashHeightMode || "").toLowerCase().trim();
  let mode = MANUAL_BACKSPLASH_MODES.includes(modeRaw) ? modeRaw : "none";
  const includeExplicit = room?.includeBacksplash;
  const include =
    includeExplicit === true ||
    (includeExplicit !== false && mode !== "none" && Number(room?.backsplashMeasuredLengthIn) > 0);

  if (!include || mode === "none") {
    return {
      includeBacksplash: false,
      backsplashHeightMode: "none",
      backsplashMeasuredLengthIn: Number(room?.backsplashMeasuredLengthIn) || 0,
      backsplashHeightIn: Number(room?.backsplashHeightIn) || null,
      backsplashSqft: 0,
      backsplashSource: MANUAL_ESTIMATE_ORIGIN,
      backsplashNotes: String(room?.backsplashNotes || "").slice(0, 2000)
    };
  }

  let heightIn = Number(room?.backsplashHeightIn);
  if (mode === "standard" && !(heightIn > 0)) heightIn = 4;
  if (mode === "full_height" && !(heightIn > 0)) {
    // Full-height without measured height: keep length; SF may be 0 until height entered.
    heightIn = Number(room?.backsplashHeightIn) || 0;
  }
  if (heightIn >= 48) mode = "full_height";
  else if (heightIn > 4.5 && mode === "standard") mode = "custom";

  const patched = applyRoomBacksplashPatch(
    {
      includeBacksplash: true,
      backsplashHeightMode: mode,
      backsplashMeasuredLengthIn: Number(room?.backsplashMeasuredLengthIn) || 0,
      backsplashHeightIn: heightIn > 0 ? heightIn : mode === "standard" ? 4 : heightIn,
      backsplashSqft: room?.backsplashSqft,
      backsplashSource: MANUAL_ESTIMATE_ORIGIN
    },
    {
      includeBacksplash: true,
      backsplashHeightMode: mode,
      backsplashMeasuredLengthIn: Number(room?.backsplashMeasuredLengthIn) || 0,
      backsplashHeightIn: heightIn > 0 ? heightIn : mode === "standard" ? 4 : heightIn
    }
  );

  return {
    includeBacksplash: true,
    backsplashHeightMode: String(patched.backsplashHeightMode || mode),
    backsplashMeasuredLengthIn: Number(patched.backsplashMeasuredLengthIn) || 0,
    backsplashHeightIn: patched.backsplashHeightIn,
    backsplashSqft: Number(patched.backsplashSqft) || 0,
    backsplashSource: MANUAL_ESTIMATE_ORIGIN,
    backsplashNotes: String(room?.backsplashNotes || "").slice(0, 2000)
  };
}

/**
 * Sum confirmed room finished-edge LF from piece geometry / room aggregates.
 * Prefer piece finishedEdge totals; fall back to room.approvedFinishedEdgeLf.
 * @param {object|null|undefined} scope
 */
export function sumManualConfirmedEdgeLf(scope) {
  const rooms = Array.isArray(scope?.rooms) ? scope.rooms : [];
  let total = 0;
  for (const room of rooms) {
    if (!room || room.included === false) continue;
    const pieces = Array.isArray(room.pieces) ? room.pieces : [];
    let roomLf = 0;
    let fromPieces = false;
    for (const p of pieces) {
      if (!p || p.included === false) continue;
      const totalIn = Number(p?.finishedEdge?.totalFinishedEdgeLengthIn);
      if (Number.isFinite(totalIn) && totalIn > 0) {
        roomLf += totalIn / 12;
        fromPieces = true;
      }
    }
    if (!fromPieces) {
      roomLf = Number(room.approvedFinishedEdgeLf) || Number(room.edgeEligibleLinearFeet) || 0;
    }
    total += roomLf;
  }
  return round2(total);
}

/**
 * Sync project-level edge LF fields from confirmed room/piece geometry so
 * legacy Pricing Setup / pricing readers stay consistent without a second entry.
 * @param {object} scope
 */
export function syncManualProjectEdgeFromRooms(scope) {
  const lf = sumManualConfirmedEdgeLf(scope);
  return {
    ...scope,
    edgeEligibleLinearFeet: lf,
    // Keep edgeLinearFeet aligned with confirmed geometry so free-tier edge
    // profiles cannot zero out physical LF used by customer upgrades.
    edgeLinearFeet: lf
  };
}

/**
 * Normalize rooms array from client draft into pricing-compatible rooms.
 * @param {unknown} roomsIn
 */
export function normalizeManualRooms(roomsIn) {
  const rooms = Array.isArray(roomsIn) ? roomsIn : [];
  return rooms.map((room, idx) => {
    const id = stableId("room", room?.id || `room_${idx + 1}`);
    const name = String(room?.name || `Room ${idx + 1}`).trim().slice(0, 120) || `Room ${idx + 1}`;
    let roomType = String(room?.roomType || "Kitchen").trim();
    if (!MANUAL_ROOM_TYPES.includes(roomType)) roomType = "Other";
    const included = room?.included !== false;
    const pieces = (Array.isArray(room?.pieces) ? room.pieces : []).map((p) =>
      normalizeManualPiece(p, id)
    );
    const countertopSqft = round2(
      pieces
        .filter((p) => p.included !== false)
        .filter((p) => !String(p.pieceType).toLowerCase().includes("backsplash"))
        .reduce((s, p) => s + (Number(p.sqft) || 0), 0)
    );
    const edgeLf = round2(
      pieces
        .filter((p) => p.included !== false && p.finishedEdge)
        .reduce(
          (s, p) => s + (Number(p.finishedEdge.totalFinishedEdgeLengthIn) || 0) / 12,
          0
        )
    );
    const backsplash = normalizeManualRoomBacksplash(room);
    return {
      id,
      name,
      roomType,
      included,
      countertopSqft,
      approvedFinishedEdgeLf: edgeLf,
      edgeEligibleLinearFeet: edgeLf,
      pieces,
      notes: String(room?.notes || "").slice(0, 2000),
      ...backsplash
    };
  });
}

/**
 * Merge client addOns — only allow known cutout keys; strip unknowns/secrets.
 * @param {object} addOnsIn
 */
export function normalizeManualAddOns(addOnsIn) {
  /** @type {Record<string, number>} */
  const out = {};
  if (!addOnsIn || typeof addOnsIn !== "object") return out;
  for (const key of MANUAL_CUTOUT_ADDON_KEYS) {
    if (key in addOnsIn) {
      out[key] = Math.max(0, Math.floor(Number(addOnsIn[key]) || 0));
    }
  }
  // Preserve other supported addon keys that pricing understands (non-cutout).
  for (const key of STUDIO_SUPPORTED_ADDON_KEYS) {
    if (MANUAL_CUTOUT_ADDON_KEYS.includes(key)) continue;
    if (key in addOnsIn) {
      out[key] = Math.max(0, Number(addOnsIn[key]) || 0);
    }
  }
  return out;
}

/**
 * Apply normalized manual rooms into a scope object (authority flags set by caller).
 * @param {object} baseScope
 * @param {{ rooms?: unknown, addOns?: object }} draft
 */
export function applyNormalizedManualRooms(baseScope, draft) {
  const rooms = normalizeManualRooms(draft?.rooms);
  const addOns = {
    ...(baseScope?.addOns && typeof baseScope.addOns === "object" ? baseScope.addOns : {}),
    ...normalizeManualAddOns(draft?.addOns)
  };
  return syncManualProjectEdgeFromRooms({
    ...baseScope,
    rooms,
    addOns
  });
}

/**
 * Validation errors blocking Confirm Manual Scope.
 * @param {object} scope
 * @returns {string[]}
 */
export function validateManualScopeForConfirm(scope) {
  /** @type {string[]} */
  const errors = [];
  const rooms = Array.isArray(scope?.rooms) ? scope.rooms.filter((r) => r && r.included !== false) : [];
  if (!rooms.length) {
    errors.push("Add at least one included room before confirming manual scope.");
    return errors;
  }
  let includedPieces = 0;
  for (const room of rooms) {
    if (!String(room.name || "").trim()) {
      errors.push("Every room needs a name.");
    }
    if (room.includeBacksplash === true) {
      const mode = String(room.backsplashHeightMode || "").toLowerCase();
      if (mode === "none") {
        errors.push(`Room "${room.name || room.id}" includes backsplash but mode is None.`);
      }
      if (!(Number(room.backsplashMeasuredLengthIn) > 0)) {
        errors.push(`Room "${room.name || room.id}" needs measured backsplash length.`);
      }
      if (mode === "custom" || mode === "full_height") {
        if (!(Number(room.backsplashHeightIn) > 0)) {
          errors.push(`Room "${room.name || room.id}" needs backsplash height for ${mode} mode.`);
        }
      }
    }
    const pieces = Array.isArray(room.pieces) ? room.pieces.filter((p) => p && p.included !== false) : [];
    if (!pieces.length) {
      errors.push(`Room "${room.name || room.id}" needs at least one included piece.`);
      continue;
    }
    for (const piece of pieces) {
      includedPieces += 1;
      const mode = normalizeMeasurementMode(piece.measurementMode);
      if (mode === MANUAL_MEASUREMENT_MODES.DIRECT_AREA) {
        if (!(Number(piece.sqft) > 0)) {
          errors.push(`Piece "${piece.name}" needs approved square footage in direct-area mode.`);
        }
      } else {
        if (!(Number(piece.lengthIn) > 0) || !(Number(piece.depthIn) > 0)) {
          errors.push(`Piece "${piece.name}" needs length and depth in dimensions mode.`);
        }
      }
      // Mutual exclusion: both authoritative modes must not be claimed.
      if (piece.directAreaOverride === true && piece.measurementMode === MANUAL_MEASUREMENT_MODES.DIMENSIONS) {
        errors.push(`Piece "${piece.name}" cannot use both dimension and direct-area authority.`);
      }
    }
  }
  if (includedPieces === 0) {
    errors.push("Add at least one included piece before confirming.");
  }
  if (!String(scope?.projectName || "").trim() && !String(scope?.customerName || "").trim()) {
    // Soft: still allow confirm if rooms exist; wizard usually sets these.
  }
  return [...new Set(errors)];
}

/**
 * Deterministic fingerprint of confirmed physical scope (rooms/pieces/edges/cutouts).
 * @param {object} scope
 */
export function manualScopeFingerprint(scope) {
  const rooms = (Array.isArray(scope?.rooms) ? scope.rooms : [])
    .filter((r) => r && r.included !== false)
    .map((r) => ({
      id: r.id,
      name: r.name,
      roomType: r.roomType,
      includeBacksplash: r.includeBacksplash === true,
      backsplashHeightMode: r.backsplashHeightMode || "none",
      backsplashMeasuredLengthIn: r.backsplashMeasuredLengthIn ?? null,
      backsplashHeightIn: r.backsplashHeightIn ?? null,
      backsplashSqft: r.backsplashSqft ?? null,
      pieces: (Array.isArray(r.pieces) ? r.pieces : [])
        .filter((p) => p && p.included !== false)
        .map((p) => ({
          id: p.id,
          name: p.name,
          pieceType: p.pieceType,
          measurementMode: p.measurementMode,
          lengthIn: p.lengthIn ?? null,
          depthIn: p.depthIn ?? null,
          sqft: p.sqft ?? null,
          finishedEdge: p.finishedEdge || null,
          cutouts: p.cutouts || null
        }))
    }));
  const addOns = {};
  for (const key of MANUAL_CUTOUT_ADDON_KEYS) {
    addOns[key] = Number(scope?.addOns?.[key]) || 0;
  }
  const payload = JSON.stringify({ rooms, addOns });
  return createHash("sha256").update(payload).digest("hex");
}

/**
 * @param {object|null|undefined} scope
 */
export function isConfirmedManualPhysicalScope(scope) {
  if (!scope || typeof scope !== "object") return false;
  return (
    scope.physicalScopeSource === MANUAL_PHYSICAL_SCOPE_SOURCE &&
    scope.estimateOrigin === MANUAL_ESTIMATE_ORIGIN &&
    scope.manualScopeConfirmed === true
  );
}

/**
 * Initial scope for a newly created manual estimate (server-authored authority).
 * @param {object} [projectFields]
 */
export function buildInitialManualScope(projectFields = {}) {
  return {
    customerName: String(projectFields.customerName || "").slice(0, 200),
    customerContactName: String(projectFields.customerContactName || "").slice(0, 200),
    customerEmail: String(projectFields.customerEmail || "").slice(0, 200),
    customerPhone: String(projectFields.customerPhone || "").slice(0, 80),
    projectName: String(projectFields.projectName || "").slice(0, 200),
    projectAddress: String(projectFields.projectAddress || "").slice(0, 400),
    partnerAccountId: null,
    accountDirectoryAccountId: projectFields.accountDirectoryAccountId || null,
    accountDirectoryContactId: projectFields.accountDirectoryContactId || null,
    accountDirectoryLocationId: projectFields.accountDirectoryLocationId || null,
    customerIdentitySnapshot: projectFields.customerIdentitySnapshot || null,
    pricingBasis: "wholesale",
    materialGroup: "Group Promo",
    colorName: "",
    colorTbd: false,
    rooms: [],
    addOns: {},
    customLineItems: [],
    edgeProfileToken: "edge_eased",
    edgeMode: "included",
    edgeLinearFeet: 0,
    countertopScopeAdjustments: [],
    edgeScopeAdjustment: null,
    finishedEdgeOverride: null,
    customerCatalogPermissions: {},
    miterHeightKey: null,
    miterLinearFeet: 0,
    buildupSqft: 0,
    estimatorNotes: String(projectFields.estimatorNotes || "").slice(0, 4000),
    internalMarkupPercent: 0,
    unresolvedManualReview: false,
    // Server-authored — never accept from browser on create.
    estimateOrigin: MANUAL_ESTIMATE_ORIGIN,
    physicalScopeSource: MANUAL_PHYSICAL_SCOPE_SOURCE,
    manualScopeConfirmed: false,
    manualScopeConfirmedAt: null,
    manualScopeConfirmedBy: null,
    manualScopeFingerprint: null,
    manualCreateRequestFingerprint: projectFields.manualCreateRequestFingerprint || null
  };
}
