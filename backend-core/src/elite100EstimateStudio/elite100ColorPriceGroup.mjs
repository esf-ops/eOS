/**
 * Elite 100 color → price group authority (Quote Flow pricing, Quote Flow review, Studio approve).
 *
 * A recognized Elite 100 color (exact catalog name) is priced at its catalog group. A different
 * group is allowed only through a documented price-group exception (group, reason, who, when)
 * applied by an authorized estimator. Account rules (Watts trusted Promo rate, Spahn +3%) key
 * off the resolved group and are unaffected. Custom slab rooms, TBD colors and colors outside
 * the catalog keep the group staff chose.
 */

import { resolveRoomMaterialGroup } from "./studioMaterialInheritance.mjs";
import { resolvePublishedRoomColorName } from "./studioEstimatePublicationAdapter.mjs";
import { normalizeStudioV2MaterialGroup } from "./studioV2Pricing.mjs";
import {
  getElite100CustomerMaterial,
  listElite100CustomerMaterials,
  slugifyElite100ColorName
} from "../digitalEstimate/configuration/elite100CustomerMaterialCatalog.mjs";

export const PRICE_GROUP_LABEL_BY_CODE = Object.freeze({
  promo: "Group Promo",
  group_a: "Group A",
  group_b: "Group B",
  group_c: "Group C",
  group_d: "Group D",
  group_e: "Group E",
  group_f: "Group F",
  remnant: "Remnant"
});

export const PRICE_GROUP_EXCEPTION_REASON_MIN_LENGTH = 10;

function str(v) {
  return String(v ?? "").trim();
}

/**
 * @param {unknown} colorName
 * @returns {{ materialId: string, colorName: string, groupLabel: string } | null}
 */
export function resolveElite100ColorPriceGroup(colorName) {
  const name = str(colorName);
  if (!name) return null;
  const mat = getElite100CustomerMaterial(`e100-${slugifyElite100ColorName(name)}`);
  if (!mat || mat.active === false || mat.pricingGroupCode === "remnant") return null;
  const groupLabel = PRICE_GROUP_LABEL_BY_CODE[mat.pricingGroupCode];
  if (!groupLabel) return null;
  return { materialId: mat.materialId, colorName: mat.displayName, groupLabel };
}

/** Staff pick list: every active Elite 100 color with its price group. */
export function listElite100ColorPriceGroups() {
  return listElite100CustomerMaterials(true)
    .map((m) => ({ colorName: m.displayName, group: PRICE_GROUP_LABEL_BY_CODE[m.pricingGroupCode] || null }))
    .filter((c) => c.group && c.group !== "Remnant")
    .sort((a, b) => a.colorName.localeCompare(b.colorName));
}

/**
 * Price-group exceptions are limited to admin / super_admin, or users listed (email or id) in
 * ELITE100_QUOTE_FLOW_PRICE_EXCEPTION_ALLOWLIST.
 * @param {{ id?: string|null, role?: string|null, email?: string|null }|null|undefined} actor
 * @param {NodeJS.ProcessEnv} [env]
 */
export function canApplyQuoteFlowPriceGroupException(actor, env = process.env) {
  const role = str(actor?.role).toLowerCase();
  if (role === "admin" || role === "super_admin") return true;
  const allow = str(env?.ELITE100_QUOTE_FLOW_PRICE_EXCEPTION_ALLOWLIST)
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (!allow.length) return false;
  const email = str(actor?.email).toLowerCase();
  const id = str(actor?.id).toLowerCase();
  return Boolean((email && allow.includes(email)) || (id && allow.includes(id)));
}

function sameColor(a, b) {
  const sa = slugifyElite100ColorName(str(a));
  return Boolean(sa) && sa === slugifyElite100ColorName(str(b));
}

/**
 * The room's documented exception, when it still applies to the color it names.
 * @param {object} room
 * @param {string} colorName
 * @param {string} colorGroupLabel
 */
export function readValidPriceGroupException(room, colorName, colorGroupLabel) {
  const ex = room?.priceGroupException;
  if (!ex || typeof ex !== "object") return null;
  const group = normalizeStudioV2MaterialGroup(ex.group);
  const reason = str(ex.reason);
  if (!group || group === colorGroupLabel) return null;
  if (!sameColor(ex.colorName, colorName)) return null;
  if (reason.length < PRICE_GROUP_EXCEPTION_REASON_MIN_LENGTH) return null;
  if (!str(ex.appliedByUserId) || !str(ex.appliedAt)) return null;
  return {
    group,
    colorName: str(ex.colorName),
    colorGroup: colorGroupLabel,
    reason,
    appliedByUserId: str(ex.appliedByUserId),
    appliedAt: str(ex.appliedAt)
  };
}

/**
 * Per room: published color, its catalog group, the group it is priced at, and whether they
 * match, differ under a documented exception, or conflict.
 * @param {object} scope
 */
export function assessRoomColorPriceGroups(scope) {
  const projectColorName = scope?.colorTbd ? null : str(scope?.colorName) || null;
  const rooms = Array.isArray(scope?.rooms) ? scope.rooms.filter((r) => r && r.included !== false) : [];
  const out = [];
  for (const room of rooms) {
    if (str(room.slabPackageId)) continue;
    const roomMaterial = resolveRoomMaterialGroup(scope, room);
    const colorName = resolvePublishedRoomColorName({ projectColorName, room, roomMaterial, slabPackageLabel: null });
    const hit = resolveElite100ColorPriceGroup(colorName);
    if (!hit) continue;
    const exception = readValidPriceGroupException(room, hit.colorName, hit.groupLabel);
    const status =
      roomMaterial.group === hit.groupLabel
        ? "matches"
        : exception && exception.group === roomMaterial.group
          ? "exception"
          : "conflict";
    out.push({
      roomId: room.id || null,
      roomName: str(room.name || room.id) || "Room",
      colorName: hit.colorName,
      colorGroupLabel: hit.groupLabel,
      pricedGroup: roomMaterial.group,
      status,
      exception: status === "exception" ? exception : null
    });
  }
  return out;
}

/**
 * Apply the color's authoritative group after the estimator's pricing patch.
 *
 * Only runs for what the estimator touched (estimate color, or a room's color / group /
 * exception fields); an untouched draft is never regrouped here — Review blocks it instead.
 *
 * @param {object} scope scope with the estimator's patch already applied
 * @param {{
 *   estimateColorTouched?: boolean,
 *   touchedRoomIds?: Set<string>,
 *   exceptionPatches?: Map<string, { group?: unknown, reason?: unknown } | null>,
 *   actor?: { id?: string|null, role?: string|null, email?: string|null } | null,
 *   env?: NodeJS.ProcessEnv,
 *   now?: string
 * }} [opts]
 */
export function applyElite100ColorPriceGroups(scope, opts = {}) {
  const touchedRoomIds = opts.touchedRoomIds || new Set();
  const exceptionPatches = opts.exceptionPatches || new Map();
  const actor = opts.actor || null;
  const now = opts.now || new Date().toISOString();
  /** @type {string[]} */
  const notices = [];
  /** @type {{ field: string, message: string, code?: string }[]} */
  const issues = [];
  let exceptionsApplied = 0;

  const next = { ...scope };
  const rooms = Array.isArray(next.rooms) ? next.rooms : [];
  const anyTouched = Boolean(opts.estimateColorTouched) || touchedRoomIds.size > 0 || exceptionPatches.size > 0;
  if (!anyTouched) return { ok: true, scope: next, notices, exceptionsApplied };

  const inheritsEstimateColor = (room) => !room?.colorTbd && !str(room?.colorNameOverride);

  const projectHit = next.colorTbd ? null : resolveElite100ColorPriceGroup(next.colorName);
  let nextRooms = rooms;
  if (projectHit) {
    next.colorName = projectHit.colorName;
    const priorDefault = normalizeStudioV2MaterialGroup(next.materialGroup) || "Group Promo";
    if (priorDefault !== projectHit.groupLabel) {
      // Rooms that don't show the estimate color keep the group they were priced at.
      nextRooms = rooms.map((room) =>
        room && typeof room === "object" && !str(room.slabPackageId) && !inheritsEstimateColor(room) && !room.materialGroupOverride
          ? { ...room, materialGroupOverride: priorDefault }
          : room
      );
      next.materialGroup = projectHit.groupLabel;
      notices.push(`${projectHit.colorName} is ${projectHit.groupLabel} — estimate price group set to ${projectHit.groupLabel}.`);
    }
  }

  next.rooms = nextRooms.map((room) => {
    if (!room || typeof room !== "object") return room;
    const id = str(room.id);
    const inherits = inheritsEstimateColor(room);
    const touched = touchedRoomIds.has(id) || exceptionPatches.has(id) || (inherits && Boolean(projectHit));
    if (!touched || str(room.slabPackageId)) return room;
    const name = str(room.name || room.id) || "Room";
    const r = { ...room };
    const field = `pricing.roomSelections.${id}.priceGroupException`;

    const ownColor = str(r.colorNameOverride);
    const effColor = r.colorTbd ? null : ownColor || (next.colorTbd ? null : str(next.colorName));
    const hit = resolveElite100ColorPriceGroup(effColor);
    if (!hit) {
      if (exceptionPatches.get(id)) {
        issues.push({ field, message: `${name}: a price-group exception needs an Elite 100 color on the room.` });
      }
      if (r.priceGroupException) delete r.priceGroupException;
      return r;
    }
    if (ownColor) r.colorNameOverride = hit.colorName;

    if (exceptionPatches.has(id)) {
      const p = exceptionPatches.get(id);
      if (p === null) {
        delete r.priceGroupException;
      } else if (!canApplyQuoteFlowPriceGroupException(actor, opts.env)) {
        issues.push({
          field,
          code: "price_group_exception_forbidden",
          message: "Only an authorized estimator can apply a price-group exception."
        });
        return r;
      } else {
        const group = normalizeStudioV2MaterialGroup(p?.group);
        const reason = str(p?.reason);
        if (!group) {
          issues.push({ field, message: `${name}: choose the price group for the exception.` });
          return r;
        }
        if (group === hit.groupLabel) {
          delete r.priceGroupException;
        } else if (reason.length < PRICE_GROUP_EXCEPTION_REASON_MIN_LENGTH) {
          issues.push({
            field,
            message: `${name}: explain why ${hit.colorName} is priced as ${group} (at least ${PRICE_GROUP_EXCEPTION_REASON_MIN_LENGTH} characters).`
          });
          return r;
        } else {
          const prior = readValidPriceGroupException(room, hit.colorName, hit.groupLabel);
          if (prior && prior.group === group && prior.reason === reason) {
            r.priceGroupException = prior;
          } else {
            r.priceGroupException = {
              group,
              colorName: hit.colorName,
              colorGroup: hit.groupLabel,
              reason,
              appliedByUserId: str(actor?.id) || null,
              appliedAt: now
            };
            exceptionsApplied += 1;
          }
          // The room keeps showing its color even though it is priced off the estimate default.
          if (!ownColor) r.colorNameOverride = hit.colorName;
        }
      }
    }

    const exception = readValidPriceGroupException(r, hit.colorName, hit.groupLabel);
    if (exception) {
      r.materialGroupOverride = exception.group;
      return r;
    }
    if (r.priceGroupException) {
      delete r.priceGroupException;
      notices.push(`${name}: price-group exception removed because the color changed to ${hit.colorName}.`);
    }
    const before = resolveRoomMaterialGroup(next, r).group;
    if (str(r.colorNameOverride)) {
      r.materialGroupOverride = hit.groupLabel;
    } else {
      r.materialGroupOverride = null;
    }
    const after = resolveRoomMaterialGroup(next, r).group;
    if (before !== after) {
      notices.push(`${name}: ${hit.colorName} is ${hit.groupLabel} — price group set to ${hit.groupLabel}.`);
    }
    return r;
  });

  if (issues.length) return { ok: false, issues };
  return { ok: true, scope: next, notices, exceptionsApplied };
}
