/**
 * Sanitize contaminated exclusive-room Digital Estimate selections.
 *
 * Older bugs could persist multiple positive qty values for the same
 * role:room (e.g. ESF sink + customer_provided). This module collapses those
 * to one envelope-backed winner before read-model, validation, and pricing.
 *
 * Does not invent off-envelope options. Ambiguous non-baseline conflicts fail
 * closed when throwOnAmbiguous is true.
 */

import { parseProductOptionKey } from "../catalog/digitalEstimateProductOptions.mjs";

/** Mutually exclusive room-scoped choice roles (one positive selection per role:room). */
export const EXCLUSIVE_ROOM_ROLES = new Set([
  "material",
  "sink",
  "faucet",
  "backsplash",
  "edge",
  "cooktop"
]);

/**
 * @param {string} optionKey
 * @returns {{ role: string, roomKey: string, token: string }|null}
 */
export function parseExclusiveRoomOptionKey(optionKey) {
  const parts = String(optionKey || "").split(":");
  if (parts.length < 3) return null;
  const role = parts[0];
  if (!EXCLUSIVE_ROOM_ROLES.has(role)) return null;
  return {
    role,
    roomKey: parts[1],
    token: parts.slice(2).join(":")
  };
}

/**
 * Map finish-suffixed ESF keys onto the longest matching envelope family key.
 * @param {string} rawKey
 * @param {Set<string>|Map<string, unknown>|Iterable<string>|null|undefined} envelopeKeys
 * @returns {string}
 */
export function remapEsfFamilyEnvelopeKey(rawKey, envelopeKeys) {
  const key = String(rawKey || "").trim();
  if (!key) return key;
  const parsed = parseProductOptionKey(key);
  if (!parsed || parsed.mode !== "esf" || !parsed.productId) return key;
  if (!["sink", "faucet"].includes(String(parsed.kind || ""))) return key;

  const keySet =
    envelopeKeys instanceof Set
      ? envelopeKeys
      : envelopeKeys instanceof Map
        ? new Set(envelopeKeys.keys())
        : envelopeKeys
          ? new Set(envelopeKeys)
          : null;
  if (!keySet || !keySet.size) return key;
  if (keySet.has(key)) return key;

  const prefix = `${parsed.kind}:${parsed.roomKey}:esf:`;
  /** @type {string[]} */
  const matches = [];
  for (const candidate of keySet) {
    const optionKey = String(candidate || "");
    if (!optionKey.startsWith(prefix)) continue;
    if (key === optionKey || key.startsWith(`${optionKey}:`)) {
      matches.push(optionKey);
    }
  }
  if (!matches.length) return key;
  matches.sort((a, b) => b.length - a.length);
  return matches[0];
}

/**
 * Higher score wins within an exclusive role:room group.
 * Baseline / included options lose to explicit customer / ESF selections.
 *
 * @param {string} optionKey
 * @param {{ includedInBaseline?: boolean, included_in_baseline?: boolean }|null|undefined} opt
 * @returns {number}
 */
export function exclusiveSelectionPriority(optionKey, opt = null) {
  const parsed = parseExclusiveRoomOptionKey(optionKey);
  if (!parsed) return 0;
  const included = Boolean(opt?.included_in_baseline ?? opt?.includedInBaseline);
  const token = String(parsed.token || "").toLowerCase();
  const role = parsed.role;

  if (role === "sink" || role === "faucet") {
    if (token.startsWith("esf:") || token === "esf") return included ? 80 : 100;
    if (token === "customer_provided" || token === "customer" || token.startsWith("customer")) {
      return included ? 20 : 50;
    }
    if (token === "none") return included ? 10 : 40;
    return included ? 15 : 60;
  }

  if (role === "backsplash") {
    if (token === "none") return included ? 10 : 90;
    if (token === "standard_4in") return included ? 20 : 70;
    if (token === "full_height" || token === "custom_height") return included ? 25 : 80;
    return included ? 15 : 60;
  }

  // material / edge / cooktop — prefer non-baseline explicit choice
  return included ? 10 : 100;
}

/**
 * Collapse contaminated exclusive-role quantities to one winner per role:room.
 *
 * @param {Record<string, number>|null|undefined} quantities
 * @param {Array<object>|null|undefined} options — envelope option rows (optional but preferred)
 * @param {{
 *   throwOnAmbiguous?: boolean,
 *   envelopeKeys?: Iterable<string>|Set<string>|null
 * }} [ctx]
 * @returns {{
 *   quantities: Record<string, number>,
 *   removedKeys: string[],
 *   remappedKeys: Array<{ from: string, to: string }>,
 *   changed: boolean
 * }}
 */
export function sanitizeExclusiveRoomSelectionQuantities(quantities, options = [], ctx = {}) {
  const throwOnAmbiguous = ctx.throwOnAmbiguous === true;
  const byKey = new Map(
    (options || []).map((o) => [String(o.option_key || o.optionKey || ""), o])
  );
  const envelopeKeys =
    ctx.envelopeKeys ||
    (byKey.size ? byKey : null);

  /** @type {Record<string, number>} */
  const working = {};
  /** @type {Array<{ from: string, to: string }>} */
  const remappedKeys = [];

  for (const [rawKey, qtyRaw] of Object.entries(quantities || {})) {
    const qty = Number(qtyRaw) || 0;
    if (!(qty > 0) && qty !== 0) continue;
    let key = String(rawKey);
    const remapped = remapEsfFamilyEnvelopeKey(key, envelopeKeys);
    if (remapped !== key) {
      remappedKeys.push({ from: key, to: remapped });
      key = remapped;
    }
    working[key] = Math.max(Number(working[key] || 0), qty);
  }

  /** @type {Map<string, string[]>} */
  const groups = new Map();
  for (const [key, qty] of Object.entries(working)) {
    if (!(Number(qty) > 0)) continue;
    const parsed = parseExclusiveRoomOptionKey(key);
    if (!parsed) continue;
    const groupId = `${parsed.role}:${parsed.roomKey}`;
    if (!groups.has(groupId)) groups.set(groupId, []);
    groups.get(groupId).push(key);
  }

  /** @type {string[]} */
  const removedKeys = [];

  for (const [, keys] of groups) {
    if (keys.length < 2) continue;

    const ranked = keys.map((key) => {
      const opt = byKey.get(key) || null;
      const priority = exclusiveSelectionPriority(key, opt);
      const token = parseExclusiveRoomOptionKey(key)?.token || "";
      return { key, priority, token, included: Boolean(opt?.included_in_baseline ?? opt?.includedInBaseline) };
    });
    ranked.sort((a, b) => b.priority - a.priority || a.key.localeCompare(b.key));

    const winner = ranked[0];
    const topPriority = winner.priority;
    const topTier = ranked.filter((r) => r.priority === topPriority);
    // Ambiguous: two different non-baseline winners at the same priority
    // (e.g. two ESF products). Baseline vs non-baseline is never ambiguous.
    if (
      throwOnAmbiguous &&
      topTier.length > 1 &&
      topTier.every((r) => !r.included) &&
      new Set(topTier.map((r) => r.token)).size > 1
    ) {
      const err = new Error(
        `Ambiguous exclusive selections for ${parseExclusiveRoomOptionKey(winner.key)?.role}:${parseExclusiveRoomOptionKey(winner.key)?.roomKey}`
      );
      err.code = "selection_unavailable";
      err.statusCode = 422;
      err.reason = "ambiguous_exclusive_selection";
      err.restoreSavedState = true;
      err.selectionKeys = topTier.map((r) => r.key);
      throw err;
    }

    for (const loser of ranked.slice(1)) {
      if (Number(working[loser.key] || 0) > 0) {
        removedKeys.push(loser.key);
      }
      working[loser.key] = 0;
    }
  }

  const changed = removedKeys.length > 0 || remappedKeys.length > 0;
  return { quantities: working, removedKeys, remappedKeys, changed };
}

/**
 * Align product drafts with sanitized exclusive sink/faucet quantities.
 * Drops customer_provided/none drafts when an ESF qty won, and vice versa.
 *
 * @param {Record<string, any>|null|undefined} productDrafts
 * @param {Record<string, number>} quantities
 * @returns {Record<string, any>}
 */
export function sanitizeProductDraftsForExclusiveSelections(productDrafts, quantities) {
  if (!productDrafts || typeof productDrafts !== "object") return {};
  /** @type {Record<string, any>} */
  const out = { ...productDrafts };

  for (const role of ["sink", "faucet"]) {
    /** @type {Map<string, string>} */
    const winnerByRoom = new Map();
    for (const [key, qty] of Object.entries(quantities || {})) {
      if (!(Number(qty) > 0)) continue;
      const parsed = parseExclusiveRoomOptionKey(key);
      if (!parsed || parsed.role !== role) continue;
      winnerByRoom.set(parsed.roomKey, parsed.token);
    }

    for (const [roomKey, drafts] of Object.entries(out)) {
      if (!drafts || typeof drafts !== "object") continue;
      const draft = drafts[role];
      if (!draft || typeof draft !== "object") continue;
      const winnerToken = winnerByRoom.get(roomKey);
      if (!winnerToken) continue;

      const source = String(draft.source || "").toLowerCase();
      const draftKey = String(draft.optionKey || "");
      const winnerIsEsf = winnerToken.startsWith("esf:") || winnerToken === "esf";
      const winnerIsNone = winnerToken === "none";
      const winnerIsCustomer =
        winnerToken === "customer_provided" ||
        winnerToken === "customer" ||
        winnerToken.startsWith("customer");

      let compatible = true;
      if (winnerIsEsf) {
        compatible =
          source === "esf" ||
          source === "stock" ||
          draftKey.includes(":esf:") ||
          Boolean(draft.productId);
      } else if (winnerIsNone) {
        compatible = source === "none" || draftKey.endsWith(":none");
      } else if (winnerIsCustomer) {
        compatible =
          source === "customer_provided" ||
          source === "customer" ||
          /customer_provided|:customer(?:_provided)?$/.test(draftKey);
      }

      if (!compatible) {
        out[roomKey] = { ...drafts };
        delete out[roomKey][role];
        if (!Object.keys(out[roomKey]).length) delete out[roomKey];
      }
    }
  }

  return out;
}

/**
 * Sanitize a split selection payload meta object in place-friendly copy form.
 *
 * @param {{
 *   quantities?: Record<string, number>,
 *   customerProductDrafts?: object,
 *   backsplashDrafts?: object,
 *   [key: string]: unknown
 * }} meta
 * @param {Array<object>|null|undefined} options
 * @param {{ throwOnAmbiguous?: boolean }} [ctx]
 */
export function sanitizeSelectionPayloadMeta(meta, options = [], ctx = {}) {
  const base = meta && typeof meta === "object" ? meta : {};
  const sanitized = sanitizeExclusiveRoomSelectionQuantities(base.quantities || {}, options, ctx);
  const productDrafts = sanitizeProductDraftsForExclusiveSelections(
    base.customerProductDrafts || {},
    sanitized.quantities
  );

  // Align backsplash drafts with winning backsplash qty when present.
  /** @type {Record<string, any>} */
  const backsplashDrafts = { ...(base.backsplashDrafts || {}) };
  for (const [key, qty] of Object.entries(sanitized.quantities)) {
    if (!(Number(qty) > 0)) continue;
    const parsed = parseExclusiveRoomOptionKey(key);
    if (!parsed || parsed.role !== "backsplash") continue;
    const mode = parsed.token;
    const prior = backsplashDrafts[parsed.roomKey] || {};
    backsplashDrafts[parsed.roomKey] = {
      ...prior,
      mode,
      optionKey: key
    };
  }

  return {
    ...base,
    quantities: sanitized.quantities,
    customerProductDrafts: productDrafts,
    backsplashDrafts,
    _exclusiveSanitization: {
      changed: sanitized.changed,
      removedKeys: sanitized.removedKeys,
      remappedKeys: sanitized.remappedKeys
    }
  };
}

/**
 * @param {Record<string, number>|null|undefined} quantities
 * @returns {Map<string, { sink: string|null, faucet: string|null, backsplash: string|null, material: string|null, edge: string|null }>}
 */
export function exclusiveWinnersByRoom(quantities) {
  const cleaned = sanitizeExclusiveRoomSelectionQuantities(quantities || {}, [], {
    throwOnAmbiguous: false
  }).quantities;
  /** @type {Map<string, { sink: string|null, faucet: string|null, backsplash: string|null, material: string|null, edge: string|null }>} */
  const byRoom = new Map();
  for (const [key, qty] of Object.entries(cleaned)) {
    if (!(Number(qty) > 0)) continue;
    const parsed = parseExclusiveRoomOptionKey(key);
    if (!parsed) continue;
    if (!byRoom.has(parsed.roomKey)) {
      byRoom.set(parsed.roomKey, {
        sink: null,
        faucet: null,
        backsplash: null,
        material: null,
        edge: null
      });
    }
    const row = byRoom.get(parsed.roomKey);
    if (parsed.role === "sink" || parsed.role === "faucet" || parsed.role === "backsplash") {
      const mode = String(parsed.token || "").split(":")[0] || parsed.token;
      row[parsed.role] = mode;
    } else if (parsed.role === "material" || parsed.role === "edge") {
      row[parsed.role] = parsed.token;
    }
  }
  return byRoom;
}

function lineAmountNumber(line) {
  const n = Number(line?.amount ?? line?.displayAmount ?? line?.amountCents);
  if (!Number.isFinite(n)) return 0;
  // amountCents are integers; public DTO amounts are dollars
  if (line?.amountCents != null && Number.isFinite(Number(line.amountCents))) {
    return Number(line.amountCents) / 100;
  }
  return n;
}

function isCustomerProvidedPlumbingLine(line, role = "sink") {
  const label = String(line?.label || "").toLowerCase();
  const category = String(line?.category || "").toLowerCase();
  if (/cutout/.test(label) || category.includes("cutout")) return false;
  if (!/customer-provided|customer provided/.test(label)) return false;
  if (role === "faucet") {
    return /faucet/.test(category) || /faucet/.test(label);
  }
  // Sink role: any customer-provided line that is not clearly a faucet.
  return !/faucet/.test(label);
}

function isEsfPlumbingProductLine(line, role = "sink") {
  const label = String(line?.label || "").toLowerCase();
  const category = String(line?.category || "").toLowerCase();
  if (/cutout/.test(label) || category.includes("cutout")) return false;
  if (/customer-provided|customer provided/.test(label)) return false;
  if (role === "sink") {
    return (
      category === "sink" ||
      /^sink\b/i.test(String(line?.label || "")) ||
      /esf sink/i.test(label)
    );
  }
  return category === "faucet" || /^faucet\b/i.test(String(line?.label || ""));
}

/**
 * Strip exclusive-role loser add-on lines from a persisted public roomPricing DTO
 * so sidebar/print match sanitized currentSelections without re-running pricing.
 *
 * @param {object|null|undefined} roomPricing
 * @param {Record<string, number>|null|undefined} quantities
 * @param {Array<{ roomKey?: string, displayName?: string }>|null|undefined} rooms
 * @returns {object|null|undefined}
 */
export function sanitizePublicRoomPricingForExclusiveSelections(
  roomPricing,
  quantities,
  rooms = []
) {
  if (!roomPricing || typeof roomPricing !== "object") return roomPricing;
  const winners = exclusiveWinnersByRoom(quantities);
  if (!winners.size) return roomPricing;

  /** @type {Map<string, ReturnType<typeof exclusiveWinnersByRoom> extends Map<any, infer V> ? V : never>} */
  const byName = new Map();
  for (const r of rooms || []) {
    const key = String(r?.roomKey || "");
    const name = String(r?.displayName || "").trim().toLowerCase();
    if (key && winners.has(key) && name) byName.set(name, winners.get(key));
  }

  // If only one room has a sink winner, apply it when roomName matching fails.
  let soleSinkWinner = null;
  for (const w of winners.values()) {
    if (!w.sink) continue;
    if (soleSinkWinner && soleSinkWinner !== w.sink) {
      soleSinkWinner = null;
      break;
    }
    soleSinkWinner = w.sink;
  }

  const nextRooms = (Array.isArray(roomPricing.rooms) ? roomPricing.rooms : []).map((room) => {
    const name = String(room?.roomName || room?.roomLabel || "").trim().toLowerCase();
    const roomId = String(room?.roomId || room?.roomKey || "");
    const winner =
      (roomId && winners.get(roomId)) ||
      byName.get(name) ||
      (soleSinkWinner ? { sink: soleSinkWinner, faucet: null, backsplash: null, material: null, edge: null } : null);
    if (!winner) return room;

    const lines = Array.isArray(room.addOnLines) ? room.addOnLines : [];
    /** @type {typeof lines} */
    const kept = [];
    let removedAmount = 0;
    const seenSinkLabels = new Set();

    for (const line of lines) {
      const labelKey = String(line?.label || "")
        .trim()
        .toLowerCase();
      if (winner.sink === "esf" || winner.sink === "none") {
        if (isCustomerProvidedPlumbingLine(line, "sink")) {
          removedAmount += lineAmountNumber(line);
          continue;
        }
      }
      if (winner.sink === "none" && isEsfPlumbingProductLine(line, "sink")) {
        removedAmount += lineAmountNumber(line);
        continue;
      }
      if (winner.faucet === "esf" || winner.faucet === "none") {
        if (isCustomerProvidedPlumbingLine(line, "faucet")) {
          removedAmount += lineAmountNumber(line);
          continue;
        }
      }
      if (winner.sink === "esf" && isEsfPlumbingProductLine(line, "sink")) {
        if (seenSinkLabels.has(labelKey)) continue;
        seenSinkLabels.add(labelKey);
      }
      kept.push(line);
    }

    const addOnsAmount =
      room.addOnsAmount != null && Number.isFinite(Number(room.addOnsAmount))
        ? Math.max(0, Number(room.addOnsAmount) - removedAmount)
        : room.addOnsAmount;
    const roomTotal =
      room.roomTotal != null && Number.isFinite(Number(room.roomTotal)) && removedAmount
        ? Math.max(0, Number(room.roomTotal) - removedAmount)
        : room.roomTotal;

    const nestedAddOns = room.addOns && typeof room.addOns === "object" ? room.addOns : null;

    const esfSinkLabel =
      winner.sink === "esf"
        ? kept.find((line) => isEsfPlumbingProductLine(line, "sink"))?.label || null
        : null;

    return {
      ...room,
      addOnLines: kept,
      addOnsAmount,
      roomTotal,
      selectedSink:
        winner.sink === "none"
          ? null
          : winner.sink === "esf"
            ? esfSinkLabel ||
              (room.selectedSink && !/customer-provided/i.test(String(room.selectedSink))
                ? room.selectedSink
                : room.selectedSink)
            : room.selectedSink,
      ...(nestedAddOns
        ? {
            addOns: {
              ...nestedAddOns,
              lines: kept,
              displayAmount:
                nestedAddOns.displayAmount != null && removedAmount
                  ? Math.max(0, Number(nestedAddOns.displayAmount) - removedAmount)
                  : nestedAddOns.displayAmount,
              amountCents:
                nestedAddOns.amountCents != null && removedAmount
                  ? Math.max(0, Number(nestedAddOns.amountCents) - Math.round(removedAmount * 100))
                  : nestedAddOns.amountCents
            }
          }
        : {})
    };
  });

  let projectTotal = roomPricing.projectTotal;
  // Only adjust project total when we removed dollars from room add-ons and the
  // previous total was a simple sum of rooms (display hygiene — not a reprice).
  const removedAcrossRooms = (roomPricing.rooms || []).reduce((sum, room, idx) => {
    const before = Number(room?.addOnsAmount);
    const after = Number(nextRooms[idx]?.addOnsAmount);
    if (Number.isFinite(before) && Number.isFinite(after) && after < before) {
      return sum + (before - after);
    }
    return sum;
  }, 0);
  if (
    removedAcrossRooms > 0 &&
    projectTotal != null &&
    Number.isFinite(Number(projectTotal))
  ) {
    projectTotal = Math.max(0, Number(projectTotal) - removedAcrossRooms);
  }

  return {
    ...roomPricing,
    rooms: nextRooms,
    projectTotal
  };
}

/**
 * Sanitize persisted customer calculation display projections for exclusive losers.
 * Does not recompute pricing formulas — only removes display lines / adjusts
 * matching add-on dollars that belong to exclusive-role losers.
 *
 * @param {object|null|undefined} customerCalc
 * @param {Record<string, number>|null|undefined} quantities
 * @param {Array<{ roomKey?: string, displayName?: string }>|null|undefined} rooms
 */
export function sanitizeCustomerCalculationForExclusiveSelections(
  customerCalc,
  quantities,
  rooms = []
) {
  if (!customerCalc || typeof customerCalc !== "object") return customerCalc;
  const roomPricing = sanitizePublicRoomPricingForExclusiveSelections(
    customerCalc.roomPricing,
    quantities,
    rooms
  );
  let roomPricingChanges = customerCalc.roomPricingChanges;
  if (roomPricingChanges && Array.isArray(roomPricingChanges.rows)) {
    const winners = exclusiveWinnersByRoom(quantities);
    const anyEsfSink = [...winners.values()].some((w) => w.sink === "esf");
    if (anyEsfSink) {
      roomPricingChanges = {
        ...roomPricingChanges,
        rows: roomPricingChanges.rows.filter((row) => {
          const labels = `${row?.originalLabel || ""} ${row?.updatedLabel || ""}`.toLowerCase();
          if (/cutout/.test(labels)) return true;
          return !/customer-provided|customer provided/.test(labels);
        })
      };
    }
  }
  return {
    ...customerCalc,
    roomPricing,
    roomPricingChanges
  };
}
