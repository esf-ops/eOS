/**
 * Elite 100 Studio pricing adapter — translates an existing Studio estimate
 * scope (studioEstimateTypes.mjs `emptyStudioEstimateScope()` shape, the same
 * object `calculateStudioEstimate` in studioEstimatePricing.mjs consumes at
 * pricingVersion 3) into elite100RoomPricingCalculator's canonical
 * { scope, configuration } contract, then runs the new pricingVersion 4
 * calculator.
 *
 * ADDITIVE ONLY:
 *  - studioEstimatePricing.mjs / calculateStudioEstimate (pricingVersion 3) is
 *    NOT modified and remains whatever route/UI currently calls it.
 *  - Nothing in this branch calls calculateElite100StudioEstimate() from any
 *    route, job, or UI — it exists so the new calculator can be exercised
 *    against real Studio scope shapes ahead of a separate, later wiring
 *    change. No estimator UI work or Digital Estimate wiring happens here.
 *
 * Legacy Studio blends estimator-owned physical facts and customer-owned
 * configuration into one JSON blob (e.g. `scope.materialGroup`,
 * `scope.edgeProfileToken`, `scope.addOns` are current customer choices, even
 * though they live on the object literally named "scope"). This adapter is
 * the one place that splits that blob into the new architecture's two
 * halves: physical Scope (rooms/pieces geometry, custom lines) vs mutable
 * Configuration (material/edge/backsplash/sinks/cutouts/miter selections).
 *
 * KNOWN ADAPTER APPROXIMATIONS (legacy Studio has no room-level granularity
 * for these — each one is flagged with an adapter warning rather than
 * silently guessed):
 *  - Finished-edge LF + edge profile are ONE estimate-wide value in Studio
 *    (studioScopeBilling.resolveScopeEdgeLinearFeet), not per room. Exact for
 *    a single priced room; for multiple rooms the full LF/profile is assigned
 *    to one default room (override via `opts.edgeRoomId`).
 *  - Sink/cutout counts (`scope.addOns`) are ONE estimate-wide map, not
 *    room-scoped. Assigned to a documented default room per key (override via
 *    `opts.roomAssignments`); ambiguous multi-room cases emit a warning.
 *  - Per-piece material overrides (`piece.materialOverride`) have no
 *    equivalent in the new per-ROOM-only material contract — the piece prices
 *    at its room's material group and a warning is emitted.
 *  - Governed manual corrections (`countertopScopeAdjustments`,
 *    `edgeScopeAdjustment`, `finishedEdgeOverride`) have no equivalent field
 *    in the new canonical Scope and are not translated; a non-zero value
 *    emits a warning instead of being silently dropped or guessed in.
 *  - Legacy retired generic sink SKUs (`qty-ss` / `qty-v-rect` / `qty-v-oval`)
 *    do not resolve against the real ESF plumbing catalog, so they are
 *    translated into priced, customer-facing custom lines (exact legacy flat
 *    price) rather than fabricated product IDs.
 *  - No Studio scope field currently expresses a customer Vanity Program
 *    election, so vanity rooms translate with `useStandardPricing: true`
 *    (ordinary countertop pricing) by default — never silently auto-enrolled
 *    into the fixed bundle. Pass `opts.vanityProgramSelections` to opt a room
 *    in explicitly.
 */

import {
  PROTOTYPE_ADDON_UNIT_PRICES
} from "../quotes/quoteCalculator.js";
import {
  calculateElite100Estimate,
  ELITE100_BUILDUP_RATE_PER_SF,
  ELITE100_TEAROUT
} from "./elite100RoomPricingCalculator.mjs";
import { resolveRoomMaterialGroup } from "./studioMaterialInheritance.mjs";
import { resolveScopeEdgeLinearFeet } from "./studioScopeBilling.mjs";
import { normalizeStudioCommercialLines } from "./studioCommercialLines.mjs";

function isBacksplashPieceType(pieceType) {
  return String(pieceType ?? "").toLowerCase().includes("backsplash");
}

function isVanityRoomType(roomType) {
  return String(roomType ?? "").trim().toLowerCase() === "vanity";
}

function includedRooms(scope) {
  return (Array.isArray(scope?.rooms) ? scope.rooms : []).filter((r) => r && r.included !== false);
}

/**
 * Both mappers must agree on which room absorbs estimate-wide legacy
 * aggregates (edge LF, add-ons) — computed once here so the Scope mapper
 * (which owns `edgeFinishedLf`) and the Configuration mapper (which owns
 * `edgeProfile` / sinks / cutouts) never pick different rooms.
 * @param {Array<object>} rooms already-filtered included Studio rooms
 */
function resolveDefaultRoomIds(rooms) {
  const kitchenRooms = rooms.filter((r) => !isVanityRoomType(r.roomType));
  const vanityRooms = rooms.filter((r) => isVanityRoomType(r.roomType));
  const defaultKitchenRoomId = kitchenRooms[0] ? String(kitchenRooms[0].id) : rooms[0] ? String(rooms[0].id) : null;
  const defaultVanityRoomId = vanityRooms[0] ? String(vanityRooms[0].id) : defaultKitchenRoomId;
  return { kitchenRooms, vanityRooms, defaultKitchenRoomId, defaultVanityRoomId };
}

/**
 * Physical/estimator-owned facts only: rooms, piece geometry, custom lines.
 * Also carries the one estimate-wide finished-edge LF (Studio has no
 * per-room edge tracking) onto a default target room's `edgeFinishedLf` —
 * LF is Scope-owned geometry in the new contract, while the profile the
 * customer picked is Configuration-owned (see mapStudioScopeToElite100Configuration).
 *
 * @param {object} scope Studio estimate scope
 * @param {{ edgeRoomId?: string }} [opts]
 * @returns {{ scope: object, warnings: Array<{code:string,message:string}> }}
 */
export function mapStudioScopeToElite100Scope(scope, opts = {}) {
  const src = scope || {};
  const warnings = [];
  const rawRooms = includedRooms(src);
  const { defaultKitchenRoomId } = resolveDefaultRoomIds(rawRooms);
  const edgeRoomId = opts.edgeRoomId ? String(opts.edgeRoomId) : defaultKitchenRoomId;
  const edgeScopeResult = resolveScopeEdgeLinearFeet(src);

  const rooms = rawRooms.map((room, idx) => {
    const roomId = String(room.id ?? `room-${idx}`);
    const pieces = (Array.isArray(room.pieces) ? room.pieces : [])
      .filter((p) => p && p.included !== false && !isBacksplashPieceType(p.pieceType))
      .map((piece) => {
        if (piece.materialOverride) {
          warnings.push({
            code: "adapter_piece_material_override_unsupported",
            message: `Room "${room.name || roomId}" piece "${piece.id}": elite100RoomPricingCalculator prices material per room only — the piece-level material override is not applied (uses the room's resolved material group).`
          });
        }
        // Studio prices pieces from the stored (possibly manually corrected)
        // `sqft`, not a lengthIn×depthIn recomputation — directArea preserves
        // that exact billing input (see billableCountertopFromRoom).
        const sqft = Number(piece.sqft);
        return {
          id: String(piece.id ?? ""),
          name: piece.name || null,
          pieceType: piece.pieceType || "counter",
          lengthIn: Number(piece.lengthIn) || 0,
          depthIn: Number(piece.depthIn) || 0,
          quantity: 1,
          included: true,
          directArea: Number.isFinite(sqft) && sqft > 0 ? sqft : undefined
        };
      });
    const mappedRoom = {
      id: roomId,
      name: room.name || `Room ${idx + 1}`,
      roomType: room.roomType || "Kitchen",
      included: true,
      pieces
    };
    if (roomId === edgeRoomId && edgeScopeResult.finalLf > 0) {
      mappedRoom.edgeFinishedLf = edgeScopeResult.finalLf;
    }
    return mappedRoom;
  });

  if (edgeRoomId && edgeScopeResult.finalLf > 0 && rawRooms.length > 1) {
    warnings.push({
      code: "adapter_edge_lf_single_room_assignment",
      message: `Studio tracks one estimate-wide finished-edge total (${edgeScopeResult.finalLf} LF); the adapter assigned it in full to room "${edgeRoomId}". Pass opts.edgeRoomId to change this, or supply per-room finishedEdgeLf directly once Studio tracks edge geometry per room.`
    });
  }

  const adjustments = Array.isArray(src.countertopScopeAdjustments) ? src.countertopScopeAdjustments : [];
  if (adjustments.some((a) => Number(a?.adjustmentSf) !== 0)) {
    warnings.push({
      code: "adapter_scope_adjustments_not_translated",
      message: "Governed countertop scope adjustments exist on this Studio scope but have no equivalent field in the new calculator's Scope contract — not applied."
    });
  }
  if (src.edgeScopeAdjustment && Number(src.edgeScopeAdjustment.adjustmentLf) !== 0) {
    warnings.push({
      code: "adapter_edge_adjustment_not_translated",
      message: "A governed edge scope adjustment exists on this Studio scope but has no equivalent field in the new calculator's Scope contract — not applied."
    });
  }
  if (src.finishedEdgeOverride && src.finishedEdgeOverride.finalLf != null) {
    warnings.push({
      code: "adapter_edge_override_not_translated",
      message: "A finished-edge Pricing Setup override exists on this Studio scope but has no equivalent field in the new calculator's Scope contract — not applied."
    });
  }

  const customLines = normalizeStudioCommercialLines(src)
    .map((line) => {
      if (line.lineTotal == null) {
        warnings.push({
          code: "adapter_percent_discount_not_translated",
          message: `Custom line "${line.name}" is a percent-of-base discount — the new calculator only accepts fixed/unit custom lines; this line was not translated.`
        });
        return null;
      }
      return {
        id: line.id,
        description: line.customerDescription || line.name,
        roomId: line.roomId || null,
        // Pass the raw signed total through as-is — normalizeElite100CustomLine
        // re-derives the correct sign from commercialRole for discount/credit,
        // so this must not force abs() (would flip a negative internal_only cost).
        fixedAmount: line.lineTotal,
        kind: line.commercialRole === "discount" ? "discount" : line.commercialRole === "credit" ? "credit" : "charge",
        commercialRole: line.commercialRole
      };
    })
    .filter(Boolean);

  return {
    scope: {
      estimateId: src.estimateId || src.id || null,
      organizationId: src.organizationId || null,
      accountId: src.accountDirectoryAccountId || null,
      partnerAccountId: src.partnerAccountId || null,
      pricingBasis: src.pricingBasis === "wholesale" ? "wholesale" : "direct_retail",
      rooms,
      customLines
    },
    warnings
  };
}

/** Retired generic sink SKUs — no real catalog product id; preserved as priced custom lines. */
const RETIRED_KITCHEN_ADDON_KEYS = Object.freeze(["qty-ss"]);
const RETIRED_VANITY_ADDON_KEYS = Object.freeze(["qty-v-rect", "qty-v-oval"]);
const RETIRED_ADDON_KEYS = Object.freeze([...RETIRED_KITCHEN_ADDON_KEYS, ...RETIRED_VANITY_ADDON_KEYS]);

/**
 * Customer-owned choices currently embedded in the Studio scope object
 * (material group, edge, backsplash, sink/cutout add-ons, miter, buildup) —
 * translated into the new canonical per-room Configuration shape, plus any
 * extra custom lines needed to preserve legacy dollar amounts that have no
 * first-class field in the new contract (retired sink SKUs, tear-out,
 * build-up).
 *
 * @param {object} scope Studio estimate scope
 * @param {{
 *   roomAssignments?: Record<string, string>,
 *   edgeRoomId?: string,
 *   vanityProgramSelections?: Record<string, { remnantQualifies?: boolean, sinkType?: string, additionalTrips?: number }>
 * }} [opts]
 */
export function mapStudioScopeToElite100Configuration(scope, opts = {}) {
  const src = scope || {};
  const rooms = includedRooms(src);
  const warnings = [];
  const configRooms = {};
  const extraCustomLines = [];

  const { kitchenRooms, vanityRooms, defaultKitchenRoomId, defaultVanityRoomId } = resolveDefaultRoomIds(rooms);

  function ensureRoom(roomId) {
    if (!configRooms[roomId]) configRooms[roomId] = { sinks: [], cutouts: {}, products: [] };
    return configRooms[roomId];
  }

  for (const [idx, room] of rooms.entries()) {
    const roomId = String(room.id ?? `room-${idx}`);
    const mat = resolveRoomMaterialGroup(src, room);
    const cfg = ensureRoom(roomId);
    cfg.materialGroup = mat.group;
    if (room.includeBacksplash === true || (room.includeBacksplash == null && Number(room.backsplashSqft) > 0)) {
      const heightIn = Number(room.backsplashHeightIn) > 0 ? Number(room.backsplashHeightIn) : 4;
      cfg.backsplash = { selected: true, heightIn };
    }
    if (isVanityRoomType(room.roomType)) {
      const election = opts.vanityProgramSelections?.[roomId];
      cfg.vanityProgram = election
        ? { remnantQualifies: Boolean(election.remnantQualifies), sinkType: election.sinkType, additionalTrips: election.additionalTrips }
        : { useStandardPricing: true };
    }
  }

  // One estimate-wide edge profile (Studio has no per-room edge tracking).
  // The matching finished-edge LF is assigned to the same default room, but
  // as a Scope fact (`room.edgeFinishedLf`) — see mapStudioScopeToElite100Scope,
  // which uses the identical resolveDefaultRoomIds/opts.edgeRoomId derivation
  // so both mappers always agree on the target room.
  const edgeScopeResult = resolveScopeEdgeLinearFeet(src);
  const edgeRoomId = opts.edgeRoomId ? String(opts.edgeRoomId) : defaultKitchenRoomId;
  if (edgeRoomId && edgeScopeResult.finalLf > 0) {
    ensureRoom(edgeRoomId).edgeProfile = src.edgeProfileToken || "edge_eased";
  }

  // Miter — also one estimate-wide value in Studio.
  const miterLf = Math.max(0, Number(src.miterLinearFeet) || 0);
  const miterKey = String(src.miterHeightKey ?? "");
  if (miterLf > 0 && miterKey && edgeRoomId) {
    ensureRoom(edgeRoomId).miter = { lf: miterLf, key: miterKey };
    if (rooms.length > 1) {
      warnings.push({
        code: "adapter_miter_single_room_assignment",
        message: `Studio tracks one estimate-wide miter total (${miterLf} LF); the adapter assigned it in full to room "${edgeRoomId}".`
      });
    }
  }

  // Build-up — priced flat rate with no first-class field; preserved as a custom line.
  const buildupSqft = Math.max(0, Number(src.buildupSqft) || 0);
  if (buildupSqft > 0) {
    extraCustomLines.push({
      id: "adapter-buildup",
      description: "Build-Up",
      roomId: edgeRoomId,
      fixedAmount: round2(buildupSqft * ELITE100_BUILDUP_RATE_PER_SF),
      kind: "charge"
    });
  }

  // Sink / cutout / tear-out add-ons — one estimate-wide map in Studio.
  const addOns = src.addOns && typeof src.addOns === "object" ? src.addOns : {};
  const assignments = opts.roomAssignments || {};
  const ambiguousKitchen = kitchenRooms.length > 1;
  // "qty-bar" defaults to the vanity room when exactly one exists (unambiguous
  // even with several kitchen-type rooms); ambiguous only when there is more
  // than one vanity room, or none at all and more than one fallback room.
  const ambiguousVanity = vanityRooms.length > 1 || (vanityRooms.length === 0 && kitchenRooms.length > 1);

  function targetRoomFor(key, fallbackRoomId, ambiguous) {
    if (assignments[key]) return String(assignments[key]);
    if (ambiguous && fallbackRoomId) {
      warnings.push({
        code: "adapter_addon_room_assignment_ambiguous",
        message: `Studio add-on "${key}" is an estimate-wide quantity; multiple eligible rooms exist, so the adapter assigned it to room "${fallbackRoomId}" by default. Pass opts.roomAssignments["${key}"] to target a different room.`
      });
    }
    return fallbackRoomId;
  }

  const kitchenSinkQty = Math.max(0, Math.floor(Number(addOns["qty-sink"]) || 0));
  if (kitchenSinkQty > 0) {
    const targetRoomId = targetRoomFor("qty-sink", defaultKitchenRoomId, ambiguousKitchen);
    if (targetRoomId) {
      ensureRoom(targetRoomId).sinks.push({ id: "qty-sink", sinkKind: "kitchen", quantity: kitchenSinkQty });
    }
  }
  const barSinkQty = Math.max(0, Math.floor(Number(addOns["qty-bar"]) || 0));
  if (barSinkQty > 0) {
    const targetRoomId = targetRoomFor("qty-bar", defaultVanityRoomId, ambiguousVanity);
    if (targetRoomId) {
      ensureRoom(targetRoomId).sinks.push({ id: "qty-bar", sinkKind: "vanity", quantity: barSinkQty });
    }
  }
  const cooktopQty = Math.max(0, Math.floor(Number(addOns["qty-cook"]) || 0));
  if (cooktopQty > 0) {
    const targetRoomId = targetRoomFor("qty-cook", defaultKitchenRoomId, ambiguousKitchen);
    if (targetRoomId) ensureRoom(targetRoomId).cutouts.cooktopQuantity = cooktopQty;
  }
  const outletQty = Math.max(0, Math.floor(Number(addOns["qty-outlet"]) || 0));
  if (outletQty > 0) {
    const targetRoomId = targetRoomFor("qty-outlet", defaultKitchenRoomId, rooms.length > 1);
    if (targetRoomId) ensureRoom(targetRoomId).cutouts.electricalOutletQuantity = outletQty;
  }
  for (const key of RETIRED_ADDON_KEYS) {
    const qty = Math.max(0, Math.floor(Number(addOns[key]) || 0));
    if (qty <= 0) continue;
    const unit = PROTOTYPE_ADDON_UNIT_PRICES[key];
    const isKitchenRetired = RETIRED_KITCHEN_ADDON_KEYS.includes(key);
    const targetRoomId = targetRoomFor(
      key,
      isKitchenRetired ? defaultKitchenRoomId : defaultVanityRoomId,
      isKitchenRetired ? ambiguousKitchen : ambiguousVanity
    );
    extraCustomLines.push({
      id: `adapter-${key}`,
      description: `${unit?.name || key} (legacy retired SKU)`,
      roomId: targetRoomId,
      fixedAmount: round2((unit?.price || 0) * qty),
      kind: "charge"
    });
  }
  const tearoutQty = Math.max(0, Math.floor(Number(addOns.tearout) || 0));
  if (tearoutQty > 0) {
    extraCustomLines.push({
      id: "adapter-tearout",
      description: "Tear-Out",
      roomId: edgeRoomId,
      fixedAmount: round2(ELITE100_TEAROUT * tearoutQty),
      kind: "charge"
    });
  }

  return {
    configuration: { rooms: configRooms },
    extraCustomLines,
    warnings
  };
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Combine the Scope and Configuration adapters into one canonical calculator
 * input, merging adapter-generated custom lines (build-up / tear-out /
 * retired SKUs) into the Scope's customLines array.
 *
 * @param {object} scope Studio estimate scope
 * @param {Parameters<typeof mapStudioScopeToElite100Configuration>[1]} [opts]
 */
export function mapStudioEstimateToElite100Input(scope, opts = {}) {
  const scopeResult = mapStudioScopeToElite100Scope(scope, opts);
  const configResult = mapStudioScopeToElite100Configuration(scope, opts);
  return {
    scope: {
      ...scopeResult.scope,
      customLines: [...scopeResult.scope.customLines, ...configResult.extraCustomLines]
    },
    configuration: configResult.configuration,
    warnings: [...scopeResult.warnings, ...configResult.warnings]
  };
}

/**
 * Run the new pricingVersion 4 calculator against an existing Studio scope.
 * Purely additive — does not touch calculateStudioEstimate (pricingVersion 3)
 * and is not called by any route/UI in this branch.
 *
 * @param {{
 *   scope: object,
 *   roomAssignments?: Record<string, string>,
 *   edgeRoomId?: string,
 *   vanityProgramSelections?: object,
 *   env?: NodeJS.ProcessEnv,
 *   now?: Date
 * }} params
 */
export async function calculateElite100StudioEstimate(params) {
  const { scope: studioScope, env, now, ...opts } = params || {};
  const mapped = mapStudioEstimateToElite100Input(studioScope, opts);
  const result = await calculateElite100Estimate({
    scope: mapped.scope,
    configuration: mapped.configuration,
    pricingContext: { env: env ?? process.env, now }
  });
  return {
    ...result,
    warnings: [...mapped.warnings, ...result.warnings],
    adapterWarnings: mapped.warnings
  };
}
