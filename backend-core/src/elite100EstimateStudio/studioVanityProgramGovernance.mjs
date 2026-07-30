/**
 * Governed Vanity Program resolution for the Elite 100 estimator.
 *
 * The estimator has exactly one commercial decision: add the program, or do
 * not. Everything else is derived here from Takeoff physical facts plus the
 * existing governed 2026 program rules:
 *
 *   - eligibility;
 *   - the matching governed program and its display label;
 *   - the governed program price (from the authoritative calculation);
 *   - the scope included in the program;
 *   - the customer selections the program permits.
 *
 * There is no trip question, no confirmation question, no package picker, and
 * no upgrade-category checklist. Unusual conditions (separate trip, special
 * delivery, custom labor, nonstandard plumbing) are ordinary additional lines.
 *
 * Pure — no I/O, and no pricing of its own. Rates and bundle totals come from
 * the v4 calculator snapshot only.
 */

import { VANITY_PROGRAM_2026_BY_CODE } from "../quotes/vanityProgram2026.js";
import { ELITE100_VANITY_STANDARD_DEPTH_IN } from "./elite100RoomPricingCalculator.mjs";
import { resolveRoomMaterialGroup } from "./studioMaterialInheritance.mjs";

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function str(v) {
  return v == null ? "" : String(v).trim();
}

/** "37_S" → "37-inch Single-Bowl Vanity Program". Raw codes never reach the UI. */
export function governedVanityProgramLabel(code) {
  const m = str(code).match(/^(\d+(?:\.\d+)?)_([SD])$/i);
  if (!m) return null;
  const bowl = m[2].toUpperCase() === "D" ? "Double" : "Single";
  return `${m[1]}-inch ${bowl}-Bowl Vanity Program`;
}

export function isVanityRoomLike(room) {
  return /vanity|bath/i.test(str(room?.name) + str(room?.roomType));
}

/**
 * The governed program is only ever evaluated for Scope rooms typed "vanity".
 * A bath-like room with another room type is listed but not eligible, so the
 * estimator is never offered a program the calculator will refuse to price.
 */
export function isGovernedVanityRoomType(room) {
  return str(room?.roomType).toLowerCase() === "vanity";
}

/**
 * Sink-opening count for a vanity room, taken from Takeoff facts.
 * Order: estimate-wide vanity/bar add-on, then typed cutouts, then openings.
 */
export function vanitySinkOpeningsFromScope(scope, room) {
  const addOns = scope?.addOns && typeof scope.addOns === "object" ? scope.addOns : {};
  const fromAddOn = num(addOns["qty-bar"]) || num(room?.addOns?.["qty-bar"]);
  if (fromAddOn > 0) return Math.floor(fromAddOn);
  let fromCutouts = 0;
  for (const piece of Array.isArray(room?.pieces) ? room.pieces : []) {
    if (!piece || piece.included === false) continue;
    for (const c of Array.isArray(piece.cutouts) ? piece.cutouts : []) {
      const type = str(c?.type || c?.cutoutType).toLowerCase();
      if (type === "vanity_bar_sink" || type === "vanity_sink" || type === "bar_sink") {
        fromCutouts += num(c.quantity) || 1;
      }
    }
  }
  if (fromCutouts > 0) return fromCutouts;
  const typed = room?.openingsByType?.vanityBarSink ?? room?.openingsByType?.vanity_bar_sink;
  return num(typed) || 0;
}

/** The vanity countertop piece supplies width and depth. */
function vanityPieceOf(room) {
  const pieces = Array.isArray(room?.pieces) ? room.pieces : [];
  const included = pieces.filter((p) => p && p.included !== false);
  return included.find((p) => /vanity/i.test(str(p.name) + str(p.pieceType))) || included[0] || null;
}

/**
 * Physical facts the customer can never change.
 * @param {object} scope
 * @param {object} room
 */
export function vanityPhysicalFactsFromScope(scope, room) {
  const piece = vanityPieceOf(room);
  const sinkOpenings = vanitySinkOpeningsFromScope(scope, room);
  const widthIn = piece && num(piece.lengthIn) > 0 ? num(piece.lengthIn) : null;
  const depthIn = piece && num(piece.depthIn) > 0 ? num(piece.depthIn) : null;
  const bowlCount = sinkOpenings === 2 ? 2 : sinkOpenings === 1 ? 1 : null;
  const backsplashSelected =
    room?.backsplashSelected === true || num(room?.backsplashHeightIn) > 0;
  return {
    widthIn,
    depthIn,
    quantity: piece ? num(piece.quantity) || 1 : 0,
    sinkOpenings: sinkOpenings || null,
    bowlCount,
    bowlLabel: bowlCount === 2 ? "Double bowl" : bowlCount === 1 ? "Single bowl" : null,
    backsplashSelected,
    backsplashLabel: backsplashSelected
      ? `Backsplash from Takeoff${num(room?.backsplashHeightIn) > 0 ? ` — ${num(room.backsplashHeightIn)}"` : ""}`
      : "No backsplash in Takeoff"
  };
}

/**
 * Governed program code from physical facts alone.
 * @returns {{ code: string|null, label: string|null, reason: string|null }}
 */
export function matchGovernedVanityProgram(facts) {
  const bowl = facts?.bowlCount === 2 ? "D" : facts?.bowlCount === 1 ? "S" : null;
  if (!bowl) {
    return {
      code: null,
      label: null,
      reason: "Takeoff must show one or two vanity sink openings."
    };
  }
  const depth = num(facts?.depthIn);
  if (!(Math.abs(depth - ELITE100_VANITY_STANDARD_DEPTH_IN) < 0.01)) {
    return {
      code: null,
      label: null,
      reason: `The governed program covers ${ELITE100_VANITY_STANDARD_DEPTH_IN}" deep vanities.`
    };
  }
  const width = num(facts?.widthIn);
  const code = width > 0 ? `${width}_${bowl}` : null;
  const row = code ? VANITY_PROGRAM_2026_BY_CODE[code] : null;
  if (!row) {
    return {
      code: null,
      label: null,
      reason: "No governed program matches this vanity width and bowl count."
    };
  }
  return { code, label: governedVanityProgramLabel(code), reason: null };
}

/** Customer selections a governed program permits — never estimator-toggled. */
export function governedVanityCustomerSelections() {
  return ["material_color", "vanity_sink_upgrade", "edge_profile"];
}

/** Scope included in the governed bundle. Shown so nothing is double-charged. */
export function governedVanityIncludedScope(facts) {
  const included = ["Vanity top"];
  if (facts?.backsplashSelected) included.push("Governed backsplash scope");
  if (num(facts?.sinkOpenings) > 0) {
    included.push(num(facts.sinkOpenings) === 2 ? "Vanity sink openings" : "Vanity sink opening");
  }
  included.push("Included program sink");
  included.push("Program labor");
  return included;
}

/** True when the scope explicitly elects the governed program for this room. */
export function isVanityProgramApplied(scope, roomId) {
  const cfg =
    scope?.roomConfigurations?.[roomId]?.vanityProgram ||
    scope?.roomConfigurations?.[String(roomId)]?.vanityProgram ||
    null;
  if (!cfg || typeof cfg !== "object") return false;
  if (cfg.useStandardPricing === true) return false;
  return cfg.applyProgram === true;
}

/**
 * The authoritative governed price for a room, read from the v4 calculation.
 * Returns null when the calculation has not qualified the room yet.
 */
export function governedVanityPriceFromCalculation(calculationSnapshot, roomId) {
  const rooms = Array.isArray(calculationSnapshot?.elite100?.rooms)
    ? calculationSnapshot.elite100.rooms
    : [];
  const match = rooms.find((r) => str(r?.roomId) === str(roomId));
  const vp = match?.vanityProgram;
  if (!vp || vp.qualifies !== true) return null;
  const total = num(vp.bundleExactTotal);
  return total > 0 ? Math.round(total * 100) / 100 : null;
}

/**
 * One governed Vanity Program row per vanity-like room.
 *
 * @param {{ scope: object, calculationSnapshot?: object|null }} input
 */
export function resolveGovernedVanityPrograms(input = {}) {
  const scope = input.scope && typeof input.scope === "object" ? input.scope : {};
  const rooms = (Array.isArray(scope.rooms) ? scope.rooms : []).filter(
    (r) => r && r.included !== false && isVanityRoomLike(r)
  );
  return rooms.map((room) => {
    const roomId = str(room.id) || null;
    const facts = vanityPhysicalFactsFromScope(scope, room);
    const typeOk = isGovernedVanityRoomType(room);
    const materialGroup = resolveRoomMaterialGroup(scope, room).group;
    const materialOk = materialGroup === "Group Promo" || materialGroup === "Remnant";
    const match = typeOk
      ? matchGovernedVanityProgram(facts)
      : { code: null, label: null, reason: "This room is not measured as a vanity in Takeoff." };
    const applied = roomId ? isVanityProgramApplied(scope, roomId) : false;
    const eligible = Boolean(match.code) && materialOk;
    const price = roomId
      ? governedVanityPriceFromCalculation(input.calculationSnapshot, roomId)
      : null;
    return {
      roomId,
      roomName: str(room.name) || "Bathroom Vanity",
      physicalFacts: facts,
      eligible,
      ineligibleReason: eligible
        ? null
        : "Not eligible for the Vanity Program. Price this vanity using standard estimate scope or an additional line.",
      ineligibleDetail: match.code && !materialOk
        ? "The room's material group is not covered by the governed program."
        : match.reason,
      programLabel: match.label,
      programPrice: price,
      applied,
      includedScope: eligible ? governedVanityIncludedScope(facts) : [],
      permittedCustomerSelections: applied ? governedVanityCustomerSelections() : []
    };
  });
}

/**
 * Scope patch for the single estimator decision.
 *
 * Adding writes an explicit election; removing writes standard pricing. The
 * calculator's governed rules and rates are untouched either way.
 *
 * @param {{ roomId: string, apply: boolean, existing?: object|null }} input
 */
export function buildVanityProgramScopePatch(input = {}) {
  const roomId = str(input.roomId);
  if (!roomId) return null;
  const existing =
    input.existing && typeof input.existing === "object" ? { ...input.existing } : {};
  return {
    [roomId]: {
      ...existing,
      vanityProgram: input.apply === true
        ? { applyProgram: true, useStandardPricing: false }
        : { applyProgram: false, useStandardPricing: true }
    }
  };
}
