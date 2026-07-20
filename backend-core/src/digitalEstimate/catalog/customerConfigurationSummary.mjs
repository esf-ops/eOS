/**
 * Structured room selections summary for Studio review / publication review payloads.
 * Customer-safe — no cost, margin, wholesale, or internal evidence.
 */

import {
  CUSTOMER_PRODUCT_DRAFTS_KEY,
  BACKSPLASH_DRAFTS_KEY,
  splitSelectionPayloadMeta
} from "../configuration/customerConfigurationDraft.mjs";
import { getProductById } from "./esfPlumbingCatalog.mjs";
import { parseProductOptionKey } from "./digitalEstimateProductOptions.mjs";
import { toCustomerSafeProduct } from "./esfPlumbingCatalogContract.mjs";

/**
 * @param {{
 *   selectionPayload?: object|null,
 *   quantities?: Record<string, number>|null,
 *   customerProductDrafts?: object|null,
 *   backsplashDrafts?: object|null,
 *   roomNotes?: Record<string, string>|null,
 *   projectNote?: string|null,
 *   missingInformationRequirements?: object[]|null,
 *   baselineDisplayTotal?: number|null,
 *   configuredDisplayTotal?: number|null,
 *   displayDelta?: number|null,
 *   rooms?: Array<{ roomKey: string, displayName?: string }>|null
 * }} input
 */
export function buildCustomerConfigurationSummary(input = {}) {
  const split = input.selectionPayload
    ? splitSelectionPayloadMeta(input.selectionPayload)
    : {
        quantities: input.quantities || {},
        customerProductDrafts: input.customerProductDrafts || {},
        backsplashDrafts: input.backsplashDrafts || {},
        roomNotes: input.roomNotes || {},
        projectNote: input.projectNote || null
      };

  const quantities = split.quantities || {};
  const productDrafts = split.customerProductDrafts || input.customerProductDrafts || {};
  const backsplashDrafts = split.backsplashDrafts || input.backsplashDrafts || {};
  const roomNotes = split.roomNotes || input.roomNotes || {};
  const roomNameByKey = new Map(
    (input.rooms || []).map((r) => [r.roomKey, r.displayName || r.roomKey])
  );

  /** @type {Map<string, any>} */
  const byRoom = new Map();
  const ensure = (roomKey) => {
    if (!byRoom.has(roomKey)) {
      byRoom.set(roomKey, {
        roomKey,
        displayName: roomNameByKey.get(roomKey) || roomKey,
        material: null,
        backsplashMode: null,
        sink: null,
        faucet: null,
        accessories: [],
        specialty: [],
        edgeMode: null,
        sideSplash: [],
        notes: roomNotes[roomKey] || null
      });
    }
    return byRoom.get(roomKey);
  };

  for (const [key, qtyRaw] of Object.entries(quantities)) {
    const qty = Number(qtyRaw) || 0;
    if (qty <= 0) continue;
    if (key.startsWith("material:")) {
      const [, roomKey, token] = key.split(":");
      const room = ensure(roomKey);
      room.material = { optionKey: key, materialToken: token, quantity: qty };
      continue;
    }
    const parsed = parseProductOptionKey(key);
    if (!parsed?.roomKey) continue;
    const room = ensure(parsed.roomKey);
    const draft = productDrafts[parsed.roomKey] || {};

    if (parsed.kind === "backsplash") {
      room.backsplashMode = parsed.mode;
      if (parsed.mode === "custom_height") {
        room.backsplash = {
          mode: "custom_height",
          requestedHeightInches: backsplashDrafts[parsed.roomKey]?.requestedHeightInches ?? null,
          note: backsplashDrafts[parsed.roomKey]?.note || null
        };
      }
    } else if (parsed.kind === "edge") {
      room.edgeMode = parsed.mode;
    } else if (parsed.kind === "sink") {
      if (parsed.mode === "none") {
        room.sink = { source: "none" };
      } else if (parsed.mode === "customer_provided" || parsed.mode === "customer") {
        room.sink = {
          source: "customer_provided",
          manufacturer: draft.sink?.manufacturer || null,
          model: draft.sink?.model || null,
          finish: draft.sink?.finish || null,
          notes: draft.sink?.notes || null
        };
      } else if (parsed.mode === "esf" && parsed.productId) {
        const product = getProductById(parsed.productId);
        const safe = product ? toCustomerSafeProduct(product) : null;
        room.sink = {
          source: "esf",
          productId: parsed.productId,
          displayName: safe?.displayName || parsed.productId,
          manufacturer: safe?.manufacturer || null,
          model: safe?.model || null,
          variantSku: draft.sink?.variantSku || null,
          finish: draft.sink?.finish || safe?.finish || null
        };
      } else if (parsed.mode === "stock") {
        room.sink = { source: "esf", productId: "legacy-stock", displayName: "Elite stock sink" };
      }
    } else if (parsed.kind === "faucet") {
      if (parsed.mode === "none") {
        room.faucet = { source: "none" };
      } else if (parsed.mode === "customer_provided") {
        room.faucet = {
          source: "customer_provided",
          manufacturer: draft.faucet?.manufacturer || null,
          model: draft.faucet?.model || null,
          finish: draft.faucet?.finish || null
        };
      } else if (parsed.mode === "esf" && parsed.productId) {
        const product = getProductById(parsed.productId);
        const safe = product ? toCustomerSafeProduct(product) : null;
        room.faucet = {
          source: "esf",
          productId: parsed.productId,
          displayName: safe?.displayName || parsed.productId,
          manufacturer: safe?.manufacturer || null
        };
      }
    } else if (parsed.kind === "accessory" && parsed.productId) {
      const product = getProductById(parsed.productId);
      room.accessories.push({
        productId: parsed.productId,
        displayName: product?.displayName || parsed.productId,
        quantity: qty
      });
    } else if (parsed.kind === "specialty" && parsed.productId) {
      const product = getProductById(parsed.productId);
      room.specialty.push({
        productId: parsed.productId,
        displayName: product?.displayName || parsed.productId,
        pricingTreatment: product?.pricingTreatment || "priced",
        quantity: qty
      });
    } else if (parsed.kind === "sidesplash") {
      room.sideSplash.push({
        pieceKey: parsed.pieceKey,
        mode: parsed.sideMode,
        quantity: qty
      });
    }
  }

  void CUSTOMER_PRODUCT_DRAFTS_KEY;
  void BACKSPLASH_DRAFTS_KEY;

  return {
    rooms: [...byRoom.values()],
    projectNote: split.projectNote || input.projectNote || null,
    missingInformationRequirements: Array.isArray(input.missingInformationRequirements)
      ? input.missingInformationRequirements
      : [],
    totals: {
      baselineDisplayTotal: input.baselineDisplayTotal ?? null,
      configuredDisplayTotal: input.configuredDisplayTotal ?? null,
      displayDelta: input.displayDelta ?? null
    }
  };
}
