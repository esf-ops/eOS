/**
 * Quote Flow — estimator sink decision per room, made before publication.
 *
 * Stored at `scope.roomConfigurations[roomId].sink` (read by the v4 adapter):
 *   { mode: "catalog", productId }   chosen ESF catalog sink; its price replaces the
 *                                    generic sink add-on, the cutout is charged once
 *   { mode: "customer_provided" }    customer supplies the sink; cutout only
 * Vanity Program rooms keep the sink bundled; staff choose the program sink type
 * (`roomConfigurations[roomId].vanityProgram.sinkType`) instead.
 *
 * Room sink openings come from the same mapping the calculator receives, so a room
 * needs a decision exactly when the calculator will charge it a sink cutout.
 */

import {
  mapStudioScopeToElite100Configuration,
  scopeRoomSinkDecision,
  scopeVanityProgramElection
} from "../elite100EstimateStudio/elite100RoomPricingStudioAdapter.mjs";
import { getCatalogProducts, getProductById } from "../digitalEstimate/catalog/esfPlumbingCatalog.mjs";

export const VANITY_PROGRAM_SINK_TYPES = Object.freeze([
  { value: "oval_white", label: "Oval white (included)" },
  { value: "oval_bisque", label: "Oval bisque (+$10 per bowl)" },
  { value: "rectangular_white", label: "Rectangular white (+$25 per bowl)" },
  { value: "rectangular_bisque", label: "Rectangular bisque (+$25 per bowl)" }
]);
const PROGRAM_SINK_TYPE_VALUES = new Set(VANITY_PROGRAM_SINK_TYPES.map((t) => t.value));

const KIND_ROOM_ELIGIBILITY = Object.freeze({
  kitchen: ["kitchen", "bar_prep", "laundry_utility"],
  vanity: ["vanity", "bar_prep"]
});

function isStaffSelectableSink(product) {
  return Boolean(
    product &&
      product.category === "sink" &&
      product.active === true &&
      product.pricingTreatment !== "review_only" &&
      Number(product.sellPrice) > 0 &&
      !(Array.isArray(product.variants) && product.variants.length > 0)
  );
}

/**
 * Staff-only sink catalog (sell prices are customer prices; no costs).
 */
export function listStaffSinkCatalog() {
  return getCatalogProducts()
    .filter(isStaffSelectableSink)
    .map((p) => ({
      productId: p.productId,
      displayName: p.displayName,
      sellPrice: Number(p.sellPrice),
      roomEligibility: Array.isArray(p.roomEligibility) ? p.roomEligibility : []
    }));
}

/**
 * Per-room sink state for staff: openings the calculator will receive, whether the
 * Vanity Program bundles the sink, and the recorded decision.
 * @param {object} stampedScope scope after `stampOpenEdgeLfOntoScopeForPricing`
 */
export function resolveQuoteFlowSinkRooms(stampedScope) {
  const scope = stampedScope && typeof stampedScope === "object" ? stampedScope : {};
  const mapped = mapStudioScopeToElite100Configuration(scope).configuration.rooms;
  const rooms = Array.isArray(scope.rooms) ? scope.rooms : [];
  const out = [];
  for (const room of rooms) {
    if (!room || room.included === false) continue;
    const roomId = String(room.id ?? "");
    if (!roomId) continue;
    const sinks = Array.isArray(mapped[roomId]?.sinks) ? mapped[roomId].sinks : [];
    const kitchenOpenings = sinks
      .filter((s) => s.sinkKind === "kitchen")
      .reduce((n, s) => n + Math.max(0, Math.floor(Number(s.quantity) || 0)), 0);
    const vanityOpenings = sinks
      .filter((s) => s.sinkKind !== "kitchen")
      .reduce((n, s) => n + Math.max(0, Math.floor(Number(s.quantity) || 0)), 0);
    if (kitchenOpenings + vanityOpenings === 0) continue;
    const program = scopeVanityProgramElection(scope, roomId);
    const decision = scopeRoomSinkDecision(scope, roomId);
    out.push({
      roomId,
      roomName: String(room.name || roomId),
      kitchenOpenings,
      vanityOpenings,
      vanityProgramApplied: Boolean(program),
      programSinkType: program ? program.sinkType || "oval_white" : null,
      decision: program ? null : decision,
      decisionRequired: !program && !decision
    });
  }
  return out;
}

/**
 * Apply `pricing.sinkSelections` onto scope.
 * Entry: { roomId, mode: "catalog"|"customer_provided"|"program", productId?, sinkType? }
 * @param {object} scope raw scope (decisions are written here)
 * @param {object} stampedScope same scope stamped for pricing (openings authority)
 * @param {unknown} raw
 * @param {{ actorUserId?: string|null, now?: string }} [meta]
 */
export function applyQuoteFlowSinkSelections(scope, stampedScope, raw, meta = {}) {
  const field = "pricing.sinkSelections";
  if (!Array.isArray(raw)) {
    return { ok: false, issues: [{ field, message: "Sink selections must be a list." }] };
  }
  const sinkRooms = new Map(resolveQuoteFlowSinkRooms(stampedScope).map((r) => [r.roomId, r]));
  const roomConfigurations =
    scope?.roomConfigurations && typeof scope.roomConfigurations === "object"
      ? { ...scope.roomConfigurations }
      : {};
  for (const entry of raw) {
    const roomId = String(entry?.roomId || "").trim();
    const room = roomId ? sinkRooms.get(roomId) : null;
    if (!room) {
      return {
        ok: false,
        issues: [{ field, message: "A sink can only be chosen for a room with a sink cutout in Scope." }]
      };
    }
    const existing =
      roomConfigurations[roomId] && typeof roomConfigurations[roomId] === "object"
        ? { ...roomConfigurations[roomId] }
        : {};
    const mode = String(entry?.mode || "");
    if (room.vanityProgramApplied) {
      const sinkType = String(entry?.sinkType || "");
      if (mode !== "program" || !PROGRAM_SINK_TYPE_VALUES.has(sinkType)) {
        return {
          ok: false,
          issues: [
            {
              field,
              message: `"${room.roomName}" is on the Vanity Program, which includes the sink. Choose the program sink type.`
            }
          ]
        };
      }
      roomConfigurations[roomId] = {
        ...existing,
        vanityProgram: { ...(existing.vanityProgram || {}), sinkType }
      };
      continue;
    }
    if (mode === "customer_provided") {
      roomConfigurations[roomId] = {
        ...existing,
        sink: {
          mode: "customer_provided",
          productId: null,
          decidedAt: meta.now || new Date().toISOString(),
          decidedByUserId: meta.actorUserId || null
        }
      };
      continue;
    }
    if (mode !== "catalog") {
      return { ok: false, issues: [{ field, message: `Choose a sink for "${room.roomName}".` }] };
    }
    const productId = String(entry?.productId || "").trim();
    const product = productId ? getProductById(productId) : null;
    if (!isStaffSelectableSink(product)) {
      return {
        ok: false,
        issues: [{ field, message: `"${room.roomName}": that sink is not available in the catalog.` }]
      };
    }
    const eligibility = Array.isArray(product.roomEligibility) ? product.roomEligibility : [];
    const kinds = [
      ...(room.kitchenOpenings > 0 ? ["kitchen"] : []),
      ...(room.vanityOpenings > 0 ? ["vanity"] : [])
    ];
    const fits = kinds.every((kind) => KIND_ROOM_ELIGIBILITY[kind].some((t) => eligibility.includes(t)));
    if (!fits) {
      return {
        ok: false,
        issues: [
          {
            field,
            message: `"${room.roomName}": ${product.displayName} is not a ${kinds.join("/")} sink.`
          }
        ]
      };
    }
    roomConfigurations[roomId] = {
      ...existing,
      sink: {
        mode: "catalog",
        productId,
        decidedAt: meta.now || new Date().toISOString(),
        decidedByUserId: meta.actorUserId || null
      }
    };
  }
  return { ok: true, scope: { ...scope, roomConfigurations } };
}
