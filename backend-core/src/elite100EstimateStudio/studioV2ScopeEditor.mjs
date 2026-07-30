/**
 * Studio V2 Slice B — Working Draft physical scope normalize / validate / editability.
 * Pure helpers + merge. Persistence is owned by studioV2Service (repository.update).
 * Intentionally does NOT use V1 updateScope (hidden auto-fork / ensure-editable-draft).
 */

import { randomUUID } from "node:crypto";
import {
  STUDIO_ESTIMATE_STATUSES,
  STUDIO_SUPPORTED_ADDON_KEYS,
  EDGE_SCOPE_SOURCES
} from "./studioEstimateTypes.mjs";
import {
  MANUAL_ESTIMATE_ORIGIN,
  MANUAL_ROOM_TYPES
} from "./studioManualPhysicalScope.mjs";
import { isStudioV2CalculationPersistable } from "./studioV2WorkingDraft.mjs";
import {
  ALL_EDGE_PROFILES,
  resolveEdgeProfileDefinition
} from "../digitalEstimate/catalog/studioEdgeAuthority.mjs";

const OPENING_KEYS = Object.freeze(["qty-sink", "qty-bar", "qty-cook", "qty-outlet"]);

/** Allowed priced edge profile tokens for Studio V2 piece/estimate controls. */
export const STUDIO_V2_EDGE_PROFILE_OPTIONS = Object.freeze(
  ALL_EDGE_PROFILES.map((p) => ({
    value: p.optionToken,
    label: p.label,
    tier: p.tier
  }))
);

const STUDIO_V2_EDGE_PROFILE_TOKENS = new Set(
  STUDIO_V2_EDGE_PROFILE_OPTIONS.map((p) => p.value)
);

/**
 * Normalize a piece/estimate edge profile token. Empty/null clears to inherit.
 * @param {unknown} raw
 * @returns {{ ok: true, value: string|null } | { ok: false, error: string }}
 */
export function normalizeStudioV2EdgeProfileToken(raw) {
  if (raw == null || raw === "") return { ok: true, value: null };
  const def = resolveEdgeProfileDefinition(raw);
  const token = def?.optionToken || null;
  if (!token || !STUDIO_V2_EDGE_PROFILE_TOKENS.has(token)) {
    return {
      ok: false,
      error: "Edge profile must be a supported profile (Eased, Large Eased, Full Bullnose, Large Ogee, Bevel, Small Ogee, Crescent, or Knife)."
    };
  }
  return { ok: true, value: token };
}

function parseOptionalNonNegInt(value, field) {
  if (value == null || value === "") return { ok: true, value: null };
  const n = num(value);
  if (!Number.isFinite(n) || n < 0 || Math.floor(n) !== n) {
    return { ok: false, error: `${field} must be a non-negative integer` };
  }
  return { ok: true, value: Math.floor(n) };
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function str(v, max = 200) {
  return String(v ?? "")
    .trim()
    .slice(0, max);
}

function stableId(prefix, raw) {
  const id = str(raw, 80);
  if (id) return id;
  try {
    return `${prefix}-${randomUUID().slice(0, 8)}`;
  } catch {
    return `${prefix}-${Date.now().toString(36)}`;
  }
}

/**
 * @param {object|null|undefined} row
 * @returns {{ editable: boolean, code: string|null, message: string|null }}
 */
export function assessStudioV2ScopeEditability(row) {
  if (!row) {
    return { editable: false, code: "no_estimate", message: "No estimate exists." };
  }
  const status = String(row.status || "").toLowerCase();
  if (status === STUDIO_ESTIMATE_STATUSES.SUPERSEDED) {
    return {
      editable: false,
      code: "superseded_revision",
      message: "A newer estimate revision is active."
    };
  }
  if (status === STUDIO_ESTIMATE_STATUSES.APPROVED) {
    return {
      editable: false,
      code: "approved_snapshot_readonly",
      message: "This approved estimate is read-only."
    };
  }
  const published = Boolean(
    row.publication?.active ||
      row.publication?.customerUrl ||
      row.publishedAt ||
      row.published_at
  );
  if (published) {
    return {
      editable: false,
      code: "approved_snapshot_readonly",
      message: "This published estimate is read-only."
    };
  }
  if (status === "historical" || row.historical === true || row.isHistorical === true) {
    return {
      editable: false,
      code: "approved_snapshot_readonly",
      message: "This historical estimate is read-only."
    };
  }
  if (!isStudioV2CalculationPersistable(status)) {
    return {
      editable: false,
      code: "draft_required",
      message: "An editable working draft is required before scope can be saved."
    };
  }
  return { editable: true, code: null, message: null };
}

/**
 * Editor form projection from persisted estimate scope.
 * @param {object|null|undefined} estimate
 */
function pieceHasOpeningsDetail(p) {
  if (!p || typeof p !== "object") return false;
  return (
    p.kitchenSinkCutouts != null ||
    p.vanityBarSinkCutouts != null ||
    p.cooktopCutouts != null ||
    p.outletCutouts != null
  );
}

/**
 * Sum piece-level openings when present; otherwise fall back to estimate addOns.
 * @param {object} scope
 */
export function resolveStudioV2OpeningsSummary(scope) {
  const rooms = Array.isArray(scope?.rooms) ? scope.rooms : [];
  const addOns = scope?.addOns && typeof scope.addOns === "object" ? scope.addOns : {};
  let kitchenSink = 0;
  let vanityBarSink = 0;
  let cooktop = 0;
  let outlet = 0;
  let fromPieces = false;
  for (const room of rooms) {
    if (!room || room.included === false) continue;
    for (const p of Array.isArray(room.pieces) ? room.pieces : []) {
      if (!p || p.included === false || !pieceHasOpeningsDetail(p)) continue;
      fromPieces = true;
      kitchenSink += Math.max(0, Math.floor(Number(p.kitchenSinkCutouts) || 0));
      vanityBarSink += Math.max(0, Math.floor(Number(p.vanityBarSinkCutouts) || 0));
      cooktop += Math.max(0, Math.floor(Number(p.cooktopCutouts) || 0));
      outlet += Math.max(0, Math.floor(Number(p.outletCutouts) || 0));
    }
  }
  if (fromPieces) {
    return {
      kitchenSink,
      vanityBarSink,
      cooktop,
      outlet,
      source: "piece"
    };
  }
  return {
    kitchenSink: Math.max(0, Math.floor(Number(addOns["qty-sink"]) || 0)),
    vanityBarSink: Math.max(0, Math.floor(Number(addOns["qty-bar"]) || 0)),
    cooktop: Math.max(0, Math.floor(Number(addOns["qty-cook"]) || 0)),
    outlet: Math.max(0, Math.floor(Number(addOns["qty-outlet"]) || 0)),
    source: "estimate"
  };
}

export function buildStudioV2EditableScope(estimate) {
  const scope = estimate?.scope && typeof estimate.scope === "object" ? estimate.scope : {};
  const rooms = Array.isArray(scope.rooms) ? scope.rooms : [];
  const openings = resolveStudioV2OpeningsSummary(scope);
  const estimateEdgeNorm = normalizeStudioV2EdgeProfileToken(scope.edgeProfileToken);
  const estimateEdgeProfile = estimateEdgeNorm.ok ? estimateEdgeNorm.value : "edge_eased";
  return {
    rooms: rooms.map((room, ri) => {
      const pieces = Array.isArray(room?.pieces) ? room.pieces : [];
      return {
        id: str(room?.id, 80) || `room-${ri + 1}`,
        name: str(room?.name || room?.label, 120) || `Room ${ri + 1}`,
        roomType: str(room?.roomType || room?.type, 40) || "Other",
        included: room?.included !== false,
        backsplashSqft:
          room?.backsplashSqft != null && Number.isFinite(Number(room.backsplashSqft))
            ? round2(Number(room.backsplashSqft))
            : null,
        edgeEligibleLinearFeet:
          room?.edgeEligibleLinearFeet != null &&
          Number.isFinite(Number(room.edgeEligibleLinearFeet))
            ? round2(Number(room.edgeEligibleLinearFeet))
            : room?.approvedFinishedEdgeLf != null &&
                Number.isFinite(Number(room.approvedFinishedEdgeLf))
              ? round2(Number(room.approvedFinishedEdgeLf))
              : null,
        pieces: pieces.map((p, pi) => {
          const fe = p?.finishedEdge && typeof p.finishedEdge === "object" ? p.finishedEdge : null;
          const finishedEdgeLf =
            fe?.totalFinishedEdgeLengthIn != null
              ? round2(Number(fe.totalFinishedEdgeLengthIn) / 12)
              : p?.finishedEdgeLf != null
                ? round2(Number(p.finishedEdgeLf))
                : null;
          const mode = String(p?.measurementMode || "").toLowerCase();
          const directSf =
            mode === "direct_area" || p?.directAreaOverride === true
              ? round2(Number(p?.sqft) || Number(p?.directSqft) || 0)
              : p?.sqft != null && Number(p.sqft) > 0 && !(Number(p.lengthIn) > 0)
                ? round2(Number(p.sqft))
                : null;
          const profileNorm = normalizeStudioV2EdgeProfileToken(p?.edgeProfileToken);
          return {
            id: str(p?.id, 80) || `piece-${ri + 1}-${pi + 1}`,
            name: str(p?.name || p?.label, 120) || `Piece ${pi + 1}`,
            pieceType: str(p?.pieceType || p?.type, 40) || "counter",
            included: p?.included !== false,
            lengthIn: Number.isFinite(Number(p?.lengthIn)) ? Number(p.lengthIn) : 0,
            depthIn: Number.isFinite(Number(p?.depthIn)) ? Number(p.depthIn) : 0,
            quantity: Math.max(1, Math.floor(Number(p?.quantity) || 1)),
            approvedDirectSqft: directSf,
            backsplashEligibleLengthIn:
              p?.backsplashEligibleLengthIn != null
                ? round2(Number(p.backsplashEligibleLengthIn) || 0)
                : null,
            finishedEdgeLf,
            edgeProfileToken: profileNorm.ok ? profileNorm.value : null,
            kitchenSinkCutouts:
              p?.kitchenSinkCutouts != null ? Math.max(0, Math.floor(Number(p.kitchenSinkCutouts) || 0)) : null,
            vanityBarSinkCutouts:
              p?.vanityBarSinkCutouts != null
                ? Math.max(0, Math.floor(Number(p.vanityBarSinkCutouts) || 0))
                : null,
            cooktopCutouts:
              p?.cooktopCutouts != null ? Math.max(0, Math.floor(Number(p.cooktopCutouts) || 0)) : null,
            outletCutouts:
              p?.outletCutouts != null ? Math.max(0, Math.floor(Number(p.outletCutouts) || 0)) : null,
            sideSplashLeft: p?.sideSplashLeft === true || p?.sideSplashLeftEligible === true,
            sideSplashRight: p?.sideSplashRight === true || p?.sideSplashRightEligible === true,
            source: str(p?.source, 40) || null
          };
        })
      };
    }),
    openings: {
      kitchenSink: openings.kitchenSink,
      vanityBarSink: openings.vanityBarSink,
      cooktop: openings.cooktop,
      outlet: openings.outlet
    },
    openingsSource: openings.source,
    edgeProfileToken: estimateEdgeProfile || "edge_eased",
    allowedEdgeProfiles: STUDIO_V2_EDGE_PROFILE_OPTIONS
  };
}

/**
 * @param {unknown} value
 * @param {string} field
 * @param {{ allowZero?: boolean }} [opts]
 * @returns {{ ok: true, value: number } | { ok: false, error: string }}
 */
function parseNonNegative(value, field, opts = {}) {
  if (value == null || value === "") {
    return { ok: true, value: opts.allowZero === false ? NaN : 0 };
  }
  const n = num(value);
  if (!Number.isFinite(n) || n < 0) {
    return { ok: false, error: `${field} must be a non-negative number` };
  }
  return { ok: true, value: n };
}

/**
 * Normalize client scope patch into calculator-compatible rooms + openings.
 * Preserves existing estimateOrigin / physicalScopeSource / roomConfigurations.
 *
 * @param {{
 *   existingScope: object,
 *   incomingScope: object,
 *   originType?: string
 * }} args
 */
export function normalizeStudioV2ScopePatch(args = {}) {
  const existingScope =
    args.existingScope && typeof args.existingScope === "object" ? args.existingScope : {};
  const incoming =
    args.incomingScope && typeof args.incomingScope === "object" ? args.incomingScope : {};
  const issues = [];
  const warnings = [];

  const rawRooms = Array.isArray(incoming.rooms) ? incoming.rooms : null;
  if (!rawRooms) {
    return {
      ok: false,
      issues: [{ field: "scope.rooms", message: "rooms array is required" }],
      warnings: [],
      scope: null
    };
  }
  if (rawRooms.length > 40) {
    return {
      ok: false,
      issues: [{ field: "scope.rooms", message: "Too many rooms (max 40)" }],
      warnings: [],
      scope: null
    };
  }

  const existingById = new Map();
  for (const r of Array.isArray(existingScope.rooms) ? existingScope.rooms : []) {
    if (r?.id) existingById.set(String(r.id), r);
  }

  /** @type {{ kitchenSink: number, vanityBarSink: number, cooktop: number, outlet: number }} */
  const pieceOpeningSums = { kitchenSink: 0, vanityBarSink: 0, cooktop: 0, outlet: 0 };
  let hasPieceOpenings = false;
  let pieceEdgeSumLf = 0;
  let hasPieceEdgeLf = false;
  /** @type {string|null} */
  let dominantPieceEdgeProfile = null;
  const rooms = [];
  for (let i = 0; i < rawRooms.length; i++) {
    const room = rawRooms[i];
    if (!room || typeof room !== "object") {
      issues.push({ field: `rooms[${i}]`, message: "Invalid room" });
      continue;
    }
    const name = str(room.name || room.label, 120);
    if (!name) {
      issues.push({ field: `rooms[${i}].name`, message: "Room name is required" });
    }
    let roomType = str(room.roomType || room.type, 40) || "Other";
    if (!MANUAL_ROOM_TYPES.includes(roomType)) {
      // Allow free-text room types from AI takeoff; warn only.
      warnings.push(`Room "${name || i + 1}" uses non-standard type "${roomType}"`);
    }
    const roomId = stableId("room", room.id);
    const prior = existingById.get(roomId) || null;
    const rawPieces = Array.isArray(room.pieces) ? room.pieces : [];
    if (rawPieces.length > 80) {
      issues.push({ field: `rooms[${i}].pieces`, message: "Too many pieces (max 80)" });
      continue;
    }

    const pieces = [];
    for (let j = 0; j < rawPieces.length; j++) {
      const piece = rawPieces[j];
      if (!piece || typeof piece !== "object") {
        issues.push({ field: `rooms[${i}].pieces[${j}]`, message: "Invalid piece" });
        continue;
      }
      const label = str(piece.name || piece.label, 120);
      if (!label) {
        issues.push({
          field: `rooms[${i}].pieces[${j}].name`,
          message: "Piece label is required"
        });
      }
      const lengthParsed = parseNonNegative(piece.lengthIn, `rooms[${i}].pieces[${j}].lengthIn`);
      const depthParsed = parseNonNegative(piece.depthIn, `rooms[${i}].pieces[${j}].depthIn`);
      if (!lengthParsed.ok) {
        issues.push({
          field: `rooms[${i}].pieces[${j}].lengthIn`,
          message: lengthParsed.error
        });
      }
      if (!depthParsed.ok) {
        issues.push({
          field: `rooms[${i}].pieces[${j}].depthIn`,
          message: depthParsed.error
        });
      }
      let quantity = Math.floor(Number(piece.quantity));
      if (!Number.isFinite(quantity) || quantity < 1) quantity = 1;
      if (quantity > 99) {
        issues.push({
          field: `rooms[${i}].pieces[${j}].quantity`,
          message: "Quantity must be between 1 and 99"
        });
        quantity = 99;
      }

      const included = piece.included !== false;
      const lengthIn = lengthParsed.ok ? lengthParsed.value : 0;
      const depthIn = depthParsed.ok ? depthParsed.value : 0;

      const directRaw =
        piece.approvedDirectSqft != null
          ? piece.approvedDirectSqft
          : piece.directSqft != null
            ? piece.directSqft
            : piece.directAreaOverride === true
              ? piece.sqft
              : null;
      let measurementMode = "dimensions";
      let sqft = 0;
      let directAreaOverride = false;
      if (directRaw != null && directRaw !== "") {
        const d = parseNonNegative(directRaw, `rooms[${i}].pieces[${j}].approvedDirectSqft`);
        if (!d.ok) {
          issues.push({
            field: `rooms[${i}].pieces[${j}].approvedDirectSqft`,
            message: d.error
          });
        } else if (d.value > 0) {
          measurementMode = "direct_area";
          sqft = round2(d.value);
          directAreaOverride = true;
        }
      }
      if (!directAreaOverride) {
        sqft = lengthIn > 0 && depthIn > 0 ? round2((lengthIn * depthIn * quantity) / 144) : 0;
      }

      /** @type {Record<string, unknown>} */
      const out = {
        id: stableId("piece", piece.id),
        name: label || `Piece ${j + 1}`,
        pieceType: str(piece.pieceType || piece.type, 40) || "counter",
        included,
        measurementMode,
        quantity,
        lengthIn,
        depthIn,
        sqft,
        directAreaOverride,
        notes: str(piece.notes, 2000)
      };

      const priorPiece = Array.isArray(prior?.pieces)
        ? prior.pieces.find((p) => String(p?.id) === String(piece.id))
        : null;
      if (priorPiece?.source) out.source = priorPiece.source;
      else if (piece.source) out.source = str(piece.source, 40);

      if (piece.backsplashEligibleLengthIn != null && piece.backsplashEligibleLengthIn !== "") {
        const b = parseNonNegative(
          piece.backsplashEligibleLengthIn,
          `rooms[${i}].pieces[${j}].backsplashEligibleLengthIn`
        );
        if (!b.ok) {
          issues.push({
            field: `rooms[${i}].pieces[${j}].backsplashEligibleLengthIn`,
            message: b.error
          });
        } else {
          out.backsplashEligibleLengthIn = round2(b.value);
          out.backsplashEligible = b.value > 0;
        }
      } else if (priorPiece?.backsplashEligibleLengthIn != null) {
        // cleared intentionally when client sends null — omit
      }

      const edgeLfRaw =
        piece.finishedEdgeLf != null
          ? piece.finishedEdgeLf
          : piece.finishedEdge?.totalFinishedEdgeLengthIn != null
            ? Number(piece.finishedEdge.totalFinishedEdgeLengthIn) / 12
            : null;
      if (edgeLfRaw != null && edgeLfRaw !== "") {
        const e = parseNonNegative(edgeLfRaw, `rooms[${i}].pieces[${j}].finishedEdgeLf`);
        if (!e.ok) {
          issues.push({
            field: `rooms[${i}].pieces[${j}].finishedEdgeLf`,
            message: e.error
          });
        } else {
          const totalIn = round2(e.value * 12);
          out.finishedEdgeLf = round2(e.value);
          out.finishedEdge = {
            frontEdgeLengthIn: totalIn,
            leftExposedEdgeLengthIn: 0,
            rightExposedEdgeLengthIn: 0,
            otherExposedEdgeLengthIn: 0,
            totalFinishedEdgeLengthIn: totalIn,
            approved: totalIn > 0,
            source: "estimator_confirmed"
          };
          if (included) {
            hasPieceEdgeLf = true;
            pieceEdgeSumLf += round2(e.value);
          }
        }
      } else if (priorPiece?.finishedEdgeLf != null && included) {
        // Prior piece edge retained only when client omitted the field entirely —
        // handled below via priorPiece preserve is not used; client sends null to clear.
      }

      if (Object.prototype.hasOwnProperty.call(piece, "edgeProfileToken")) {
        const profile = normalizeStudioV2EdgeProfileToken(piece.edgeProfileToken);
        if (!profile.ok) {
          issues.push({
            field: `rooms[${i}].pieces[${j}].edgeProfileToken`,
            message: profile.error
          });
        } else if (profile.value) {
          out.edgeProfileToken = profile.value;
          if (included && !dominantPieceEdgeProfile) {
            dominantPieceEdgeProfile = profile.value;
          } else if (
            included &&
            profile.value &&
            dominantPieceEdgeProfile &&
            resolveEdgeProfileDefinition(profile.value)?.tier === "premium" &&
            resolveEdgeProfileDefinition(dominantPieceEdgeProfile)?.tier !== "premium"
          ) {
            dominantPieceEdgeProfile = profile.value;
          }
        }
      } else if (priorPiece?.edgeProfileToken) {
        out.edgeProfileToken = priorPiece.edgeProfileToken;
        if (included && !dominantPieceEdgeProfile) {
          dominantPieceEdgeProfile = String(priorPiece.edgeProfileToken);
        }
      }

      const openingFields = [
        ["kitchenSinkCutouts", "kitchenSink"],
        ["vanityBarSinkCutouts", "vanityBarSink"],
        ["cooktopCutouts", "cooktop"],
        ["outletCutouts", "outlet"]
      ];
      for (const [field, sumKey] of openingFields) {
        if (!Object.prototype.hasOwnProperty.call(piece, field)) {
          if (priorPiece?.[field] != null) {
            out[field] = Math.max(0, Math.floor(Number(priorPiece[field]) || 0));
            if (included) {
              hasPieceOpenings = true;
              pieceOpeningSums[sumKey] += out[field];
            }
          }
          continue;
        }
        if (piece[field] == null || piece[field] === "") {
          // Explicit clear — do not copy prior.
          continue;
        }
        const parsed = parseOptionalNonNegInt(piece[field], `rooms[${i}].pieces[${j}].${field}`);
        if (!parsed.ok) {
          issues.push({ field: `rooms[${i}].pieces[${j}].${field}`, message: parsed.error });
        } else if (parsed.value != null) {
          out[field] = parsed.value;
          if (included) {
            hasPieceOpenings = true;
            pieceOpeningSums[sumKey] += parsed.value;
          }
        }
      }

      if (Object.prototype.hasOwnProperty.call(piece, "sideSplashLeft")) {
        out.sideSplashLeft = piece.sideSplashLeft === true;
        out.sideSplashLeftEligible = piece.sideSplashLeft === true;
      } else if (priorPiece?.sideSplashLeft === true || priorPiece?.sideSplashLeftEligible === true) {
        out.sideSplashLeft = true;
        out.sideSplashLeftEligible = true;
      }
      if (Object.prototype.hasOwnProperty.call(piece, "sideSplashRight")) {
        out.sideSplashRight = piece.sideSplashRight === true;
        out.sideSplashRightEligible = piece.sideSplashRight === true;
      } else if (priorPiece?.sideSplashRight === true || priorPiece?.sideSplashRightEligible === true) {
        out.sideSplashRight = true;
        out.sideSplashRightEligible = true;
      }

      // Preserve waterfall panels / geometry from prior piece when not re-sent.
      if (priorPiece?.waterfallPanels && !piece.waterfallPanels) {
        out.waterfallPanels = priorPiece.waterfallPanels;
      }
      if (priorPiece?.backsplashGeometry && !piece.backsplashGeometry) {
        out.backsplashGeometry = priorPiece.backsplashGeometry;
      }

      pieces.push(out);
    }

    /** @type {Record<string, unknown>} */
    const roomOut = {
      id: roomId,
      name: name || `Room ${i + 1}`,
      roomType,
      included: room.included !== false,
      pieces
    };

    // Aggregate piece splash LF into room measured backsplash length for calculator.
    const splashInSum = pieces.reduce((s, p) => {
      if (!p || p.included === false) return s;
      return s + (Number(p.backsplashEligibleLengthIn) || 0);
    }, 0);
    if (splashInSum > 0) {
      roomOut.backsplashMeasuredLengthIn = round2(splashInSum);
      roomOut.includeBacksplash = true;
    }

    if (Object.prototype.hasOwnProperty.call(room, "backsplashSqft")) {
      if (room.backsplashSqft != null && room.backsplashSqft !== "") {
        const b = parseNonNegative(room.backsplashSqft, `rooms[${i}].backsplashSqft`);
        if (!b.ok) issues.push({ field: `rooms[${i}].backsplashSqft`, message: b.error });
        else roomOut.backsplashSqft = round2(b.value);
      } else {
        roomOut.backsplashSqft = 0;
      }
    } else if (prior?.backsplashSqft != null) {
      roomOut.backsplashSqft = prior.backsplashSqft;
    }

    if (Object.prototype.hasOwnProperty.call(room, "edgeEligibleLinearFeet")) {
      if (room.edgeEligibleLinearFeet != null && room.edgeEligibleLinearFeet !== "") {
        const e = parseNonNegative(
          room.edgeEligibleLinearFeet,
          `rooms[${i}].edgeEligibleLinearFeet`
        );
        if (!e.ok) issues.push({ field: `rooms[${i}].edgeEligibleLinearFeet`, message: e.error });
        else {
          roomOut.edgeEligibleLinearFeet = round2(e.value);
          roomOut.approvedFinishedEdgeLf = round2(e.value);
        }
      }
    } else if (prior?.edgeEligibleLinearFeet != null) {
      roomOut.edgeEligibleLinearFeet = prior.edgeEligibleLinearFeet;
      if (prior.approvedFinishedEdgeLf != null) {
        roomOut.approvedFinishedEdgeLf = prior.approvedFinishedEdgeLf;
      }
    }
    rooms.push(roomOut);
  }

  const openingsIn =
    incoming.openings && typeof incoming.openings === "object"
      ? incoming.openings
      : incoming.addOns && typeof incoming.addOns === "object"
        ? {
            kitchenSink: incoming.addOns["qty-sink"],
            vanityBarSink: incoming.addOns["qty-bar"],
            cooktop: incoming.addOns["qty-cook"],
            outlet: incoming.addOns["qty-outlet"]
          }
        : null;

  const existingAddOns =
    existingScope.addOns && typeof existingScope.addOns === "object"
      ? { ...existingScope.addOns }
      : {};
  /** @type {Record<string, number>} */
  const addOns = { ...existingAddOns };
  const openingMap = [
    ["kitchenSink", "qty-sink"],
    ["vanityBarSink", "qty-bar"],
    ["cooktop", "qty-cook"],
    ["outlet", "qty-outlet"]
  ];
  if (hasPieceOpenings) {
    // Piece-level openings are authoritative when any piece detail is present.
    for (const [from, to] of openingMap) {
      addOns[to] = Math.max(0, Math.floor(pieceOpeningSums[from] || 0));
    }
  } else if (openingsIn) {
    for (const [from, to] of openingMap) {
      if (openingsIn[from] == null && openingsIn[to] == null) continue;
      const raw = openingsIn[from] != null ? openingsIn[from] : openingsIn[to];
      const p = parseNonNegative(raw, `openings.${from}`);
      if (!p.ok) issues.push({ field: `openings.${from}`, message: p.error });
      else addOns[to] = Math.floor(p.value);
    }
  }
  // Drop unsupported keys the client may have stuffed into addOns.
  for (const key of Object.keys(addOns)) {
    if (!STUDIO_SUPPORTED_ADDON_KEYS.includes(key) && !OPENING_KEYS.includes(key)) {
      // Keep legacy keys already on the estimate; only strip brand-new unknown from openings patch.
    }
  }

  if (issues.length) {
    return { ok: false, issues, warnings, scope: null };
  }

  const nextScope = {
    ...existingScope,
    rooms,
    addOns
  };

  // Estimate-wide edge profile: prefer piece selection, else keep existing.
  if (dominantPieceEdgeProfile) {
    nextScope.edgeProfileToken = dominantPieceEdgeProfile;
  } else if (
    Object.prototype.hasOwnProperty.call(incoming, "edgeProfileToken") &&
    incoming.edgeProfileToken != null
  ) {
    const profile = normalizeStudioV2EdgeProfileToken(incoming.edgeProfileToken);
    if (!profile.ok) {
      return {
        ok: false,
        issues: [{ field: "scope.edgeProfileToken", message: profile.error }],
        warnings,
        scope: null
      };
    }
    if (profile.value) nextScope.edgeProfileToken = profile.value;
  }

  // Sync estimator-confirmed piece edge LF into scope fields the calculator already reads.
  if (hasPieceEdgeLf) {
    const edgeLf = round2(pieceEdgeSumLf);
    nextScope.edgeEligibleLinearFeet = edgeLf;
    const priorSummary =
      existingScope.takeoffScopeSummary && typeof existingScope.takeoffScopeSummary === "object"
        ? { ...existingScope.takeoffScopeSummary }
        : {};
    nextScope.takeoffScopeSummary = {
      ...priorSummary,
      approvedFinishedEdgeLf: edgeLf,
      edgeEligibleLinearFeet: edgeLf,
      edgeScopeSource: EDGE_SCOPE_SOURCES.FINISHED_EDGE,
      edgeGeometryConfirmationRequired: false
    };
  }
  // Preserve server authority markers exactly.
  if (existingScope.estimateOrigin != null) nextScope.estimateOrigin = existingScope.estimateOrigin;
  if (existingScope.physicalScopeSource != null) {
    nextScope.physicalScopeSource = existingScope.physicalScopeSource;
  }
  if (existingScope.manualScopeConfirmed === true) {
    // Physical room edits invalidate manual confirmation (same rule as V1 for manual).
    const wasManual =
      String(existingScope.estimateOrigin || "").toLowerCase() === MANUAL_ESTIMATE_ORIGIN ||
      String(existingScope.physicalScopeSource || "").toLowerCase() === MANUAL_ESTIMATE_ORIGIN;
    if (wasManual) {
      nextScope.manualScopeConfirmed = false;
      nextScope.manualScopeConfirmedAt = null;
      nextScope.manualScopeConfirmedBy = null;
      nextScope.manualScopeFingerprint = null;
      warnings.push("Manual scope confirmation cleared after measurement edits.");
    }
  }
  // Never accept client authority.
  delete nextScope.takeoffApproved;
  delete nextScope.totals;

  return { ok: true, issues: [], warnings, scope: nextScope };
}
