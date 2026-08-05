/**
 * Detect whether a published Digital Estimate already includes sink cutout scope
 * for a room. Used so ESF sink product selection does not charge a second cutout.
 */

/**
 * @param {{
 *   roomKey: string,
 *   roomName?: string|null,
 *   roomType?: string|null,
 *   envelopeOptions?: Array<object>|null,
 *   publishedRoomPricing?: object|null,
 *   customerSnapshot?: object|null
 * }} args
 * @returns {boolean}
 */
export function publishedScopeIncludesSinkCutout(args) {
  const roomKey = String(args?.roomKey || "").trim();
  if (!roomKey) return false;
  const roomName = String(args?.roomName || "").trim().toLowerCase();

  for (const opt of args?.envelopeOptions || []) {
    const key = String(opt?.option_key || opt?.optionKey || "");
    // Bare fabrication cutout options seeded from scope.addOns at publish.
    if (key === "qty-sink" || key === "qty-bar" || key.startsWith(`qty-sink:`) || key.startsWith(`qty-bar:`)) {
      const included = Boolean(opt?.included_in_baseline ?? opt?.includedInBaseline);
      const defaultQty = Number(opt?.default_qty ?? opt?.defaultQty ?? 0);
      if (included || defaultQty > 0) return true;
    }
    if (!key.startsWith(`sink:${roomKey}:`)) continue;
    const mode = key.split(":")[2] || "";
    if (mode !== "customer_provided" && mode !== "customer" && mode !== "stock") continue;
    const included = Boolean(opt?.included_in_baseline ?? opt?.includedInBaseline);
    const defaultQty = Number(opt?.default_qty ?? opt?.defaultQty ?? 0);
    if (included || defaultQty > 0) return true;
  }

  const pricing =
    (args?.publishedRoomPricing && typeof args.publishedRoomPricing === "object"
      ? args.publishedRoomPricing
      : null) ||
    (args?.customerSnapshot?.roomPricing && typeof args.customerSnapshot.roomPricing === "object"
      ? args.customerSnapshot.roomPricing
      : null);

  for (const room of Array.isArray(pricing?.rooms) ? pricing.rooms : []) {
    const id = String(room?.roomId || room?.roomKey || "").trim();
    const name = String(room?.roomName || "").trim().toLowerCase();
    const match =
      id === roomKey ||
      (roomName && name === roomName) ||
      (name && roomKey && name.replace(/\s+/g, "-") === roomKey);
    if (!match) continue;
    const lines = [
      ...(Array.isArray(room.customerFacingLines) ? room.customerFacingLines : []),
      ...(Array.isArray(room.addOnLines) ? room.addOnLines : [])
    ];
    for (const line of lines) {
      const cat = String(line?.category || "").toLowerCase();
      const label = String(line?.label || line?.name || "").toLowerCase();
      if (cat === "sink_cutout") return true;
      if (/cutout/.test(label) && /sink/.test(label)) return true;
      if (/customer-provided\s+sink/.test(label)) return true;
    }
  }

  return false;
}

/**
 * Baseline flags for a sink cutout line in config-delta options.
 * @param {boolean} cutoutInPublishedScope
 */
export function sinkCutoutBaselineFlags(cutoutInPublishedScope) {
  if (cutoutInPublishedScope) {
    return {
      includedInBaseline: true,
      defaultQty: 1,
      baselineQuantity: 1,
      // Already in the frozen publication — show as included scope, $0 delta.
      customerPriceTreatment: "included"
    };
  }
  return {
    includedInBaseline: false,
    defaultQty: 0,
    baselineQuantity: 0
  };
}
