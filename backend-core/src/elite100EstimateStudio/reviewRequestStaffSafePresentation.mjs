/**
 * Staff-safe presentation for Studio review-request blockers and selection rows.
 * Never put raw option keys, UUIDs, or catalog tokens in staff-facing copy.
 */

import {
  isRoomProductOptionKey,
  parseProductOptionKey,
  resolveCatalogProductSelection
} from "../digitalEstimate/catalog/digitalEstimateProductOptions.mjs";
import { getElite100CustomerMaterial } from "../digitalEstimate/configuration/elite100CustomerMaterialCatalog.mjs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * @param {string|null|undefined} value
 */
export function looksLikeUuid(value) {
  return UUID_RE.test(String(value || "").trim());
}

/**
 * @param {string|null|undefined} raw
 */
export function humanizeCatalogToken(raw) {
  const s = String(raw || "").trim();
  if (!s || looksLikeUuid(s)) return null;
  return s
    .split(/[:/_-]+/)
    .filter(Boolean)
    .filter((part) => !looksLikeUuid(part))
    .map((part) => {
      if (/^[a-z0-9]+$/i.test(part) && part.length <= 12 && part === part.toUpperCase()) {
        return part;
      }
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(" ")
    .replace(/\bBlanco\b/gi, "BLANCO")
    .trim() || null;
}

/**
 * @param {string} optionKey
 */
export function inferProductCategoryFromKey(optionKey) {
  const key = String(optionKey || "");
  if (/^qty-?sink/i.test(key) || key.startsWith("sink:")) return "Sink";
  if (/^qty-?faucet/i.test(key) || key.startsWith("faucet:")) return "Faucet";
  if (key.startsWith("accessory:")) return "Accessory";
  if (key.startsWith("specialty:")) return "Specialty";
  if (key.startsWith("material:")) return "Material";
  if (key.startsWith("edge:")) return "Edge";
  if (key.startsWith("backsplash:")) return "Backsplash";
  return "Product";
}

/**
 * Best-effort display name from an option key without exposing the key.
 * @param {string} optionKey
 * @param {{ displayLabel?: string|null, quantity?: number|null }|null} [opt]
 */
export function resolveStaffProductLabel(optionKey, opt = null) {
  const fromOpt = String(opt?.displayLabel || "").trim();
  if (fromOpt && !fromOpt.includes(":") && !looksLikeUuid(fromOpt)) {
    return fromOpt;
  }

  const key = String(optionKey || "");
  if (key.startsWith("material:")) {
    const token = key.split(":")[2];
    const mat = getElite100CustomerMaterial(token);
    if (mat?.displayName) return mat.displayName;
    return humanizeCatalogToken(token) || "Selected material";
  }

  if (isRoomProductOptionKey(key)) {
    const parsed = parseProductOptionKey(key);
    if (parsed?.mode === "esf" && parsed.productId) {
      try {
        const resolved = resolveCatalogProductSelection(parsed.productId);
        const name = resolved?.product?.displayName || resolved?.variant?.displayName;
        if (name) return String(name);
      } catch {
        /* fall through */
      }
      const human = humanizeCatalogToken(parsed.productId);
      if (human) return human;
    }
    if (parsed?.productId) {
      const human = humanizeCatalogToken(parsed.productId);
      if (human) return human;
    }
    if (parsed?.mode && parsed.mode !== "esf") {
      const rest = key.split(":").slice(2).join(":");
      const human = humanizeCatalogToken(rest);
      if (human) return human;
    }
  }

  if (/^qty-?sink/i.test(key)) return null;
  if (/^qty-/i.test(key)) return null;

  const slug = key.includes(":") ? key.split(":").slice(-2).join(":") : key;
  return humanizeCatalogToken(slug);
}

/**
 * Convert a diagnostic blocker into staff-safe UI fields.
 * Raw optionKey is retained only for tests/logs — callers must strip before HTTP.
 *
 * @param {{
 *   optionKey?: string,
 *   code?: string,
 *   message?: string,
 *   quantity?: number|null,
 *   displayLabel?: string|null
 * }} blocker
 * @param {{ quantity?: number|null, displayLabel?: string|null }|null} [opt]
 */
export function toStaffSafeBlocker(blocker, opt = null) {
  const optionKey = String(blocker?.optionKey || "");
  const code = String(blocker?.code || "unknown_option");
  const quantity =
    opt?.quantity != null
      ? Number(opt.quantity)
      : blocker?.quantity != null
        ? Number(blocker.quantity)
        : null;
  const category = inferProductCategoryFromKey(optionKey);
  const parsed = isRoomProductOptionKey(optionKey) ? parseProductOptionKey(optionKey) : null;
  const room =
    parsed?.roomKey && !looksLikeUuid(parsed.roomKey)
      ? humanizeCatalogToken(parsed.roomKey)
      : null;
  const productDisplayName = resolveStaffProductLabel(optionKey, {
    displayLabel: opt?.displayLabel || blocker?.displayLabel
  });

  let title = "Selection needs estimator review";
  let staffMessage = "A customer selection cannot be applied safely. Open the Studio estimate to resolve it.";
  let estimatorAction = "Open the source Studio estimate and choose an approved catalog option.";

  if (code === "unknown_material") {
    title = "Material is not customer-visible";
    staffMessage = productDisplayName
      ? `The selected material “${productDisplayName}” is no longer available for customer configuration.`
      : "The selected material is no longer available for customer configuration.";
    estimatorAction = "Choose an approved customer-visible material on a new estimate revision.";
  } else if (/^qty-?sink:/i.test(optionKey) || (code === "unsupported_customer_option" && /^qty-?sink:/i.test(optionKey))) {
    title = "Sink quantity cannot be applied";
    staffMessage =
      "The requested sink quantity cannot be applied until an approved sink option is selected.";
    estimatorAction = "Select an approved sink from the catalog, then revise and recalculate.";
  } else if (/^qty-[a-z0-9-]+:/i.test(optionKey)) {
    title = `${category} quantity cannot be applied`;
    staffMessage = `The requested ${category.toLowerCase()} quantity cannot be applied until an approved catalog option is selected.`;
    estimatorAction = `Select an approved ${category.toLowerCase()} from the catalog, then revise and recalculate.`;
  } else if (code === "unknown_option" || code === "invalid_selection" || code === "unsupported_customer_option") {
    title = "Catalog product no longer available";
    if (productDisplayName) {
      staffMessage = `The selected ${productDisplayName} is no longer available in the approved catalog.`;
    } else {
      staffMessage = `The selected ${category.toLowerCase()} is no longer available in the approved catalog.`;
    }
    estimatorAction = "Replace the selection with an approved catalog product on a new revision.";
  }

  return {
    code,
    title,
    staffMessage,
    productDisplayName: productDisplayName || null,
    category,
    room: room || null,
    quantity: Number.isFinite(quantity) ? quantity : null,
    estimatorAction,
    blocksApply: true,
    blocksRepublish: true,
    // Diagnostic only — strip before staff HTTP responses.
    diagnosticOptionKey: optionKey || null
  };
}

/**
 * @param {Array<object>} blockers
 * @param {object|null|undefined} request
 */
export function presentUnsupportedBlockers(blockers, request = null) {
  const snap = request?.request_snapshot_json || {};
  const selected = Array.isArray(snap.selectedOptions) ? snap.selectedOptions : [];
  const byKey = new Map(
    selected.map((o) => [String(o.optionKey || o.key || ""), o])
  );
  return (blockers || []).map((b) => {
    const key = String(b.optionKey || "");
    return toStaffSafeBlocker(b, byKey.get(key) || null);
  });
}

/**
 * Staff-safe comparison row (no raw option keys in visible fields).
 * @param {object} row
 */
export function toStaffSafeComparisonRow(row) {
  const optionKey = String(row?.optionKey || row?.requestedSelection?.optionKey || "");
  const label =
    resolveStaffProductLabel(optionKey, {
      displayLabel: row?.displayLabel || row?.customerSafeDisplay?.label
    }) || inferProductCategoryFromKey(optionKey);
  const category = inferProductCategoryFromKey(optionKey);
  const roomRaw = row?.roomKey || null;
  const room =
    roomRaw && !looksLikeUuid(roomRaw) ? humanizeCatalogToken(String(roomRaw)) : null;
  const qty = Number(row?.requestedSelection?.quantity ?? row?.customerSafeDisplay?.quantity) || 0;
  const baseline =
    row?.baselineSelection?.colorLabel ||
    row?.baselineSelection?.materialLabel ||
    "Original estimate selection";
  const blocked = Boolean(row?.blocked || row?.reviewState === "blocked");

  return {
    room: room || "Project",
    category,
    originalSelection: String(baseline),
    requestedSelection: label,
    quantity: qty,
    priceEffect: null,
    status: blocked ? "Needs catalog review" : "Pending review",
    blocked
  };
}

/**
 * Plain-language publication guidance for the detail drawer.
 * @param {string|null|undefined} publicationStatus
 * @param {{ replacementPublicationId?: string|null, pricingValidThrough?: string|null }} [ctx]
 */
export function publicationStateGuidance(publicationStatus, ctx = {}) {
  const st = String(publicationStatus || "").toLowerCase();
  if (st === "revoked") {
    return {
      state: "revoked",
      title: "Publication revoked",
      message:
        "This Digital Estimate link has been revoked. Review the customer request, then open the current Studio estimate to prepare a new approved publication.",
      allowRepublish: false,
      allowSilentReactivate: false
    };
  }
  if (st === "superseded") {
    return {
      state: "superseded",
      title: "Publication superseded",
      message: ctx.replacementPublicationId
        ? "A newer Digital Estimate publication replaced this link. Open the current Studio estimate to continue from the latest revision."
        : "This Digital Estimate link was superseded by a newer publication. Open the current Studio estimate to continue.",
      allowRepublish: false,
      allowSilentReactivate: false,
      newerPublicationRef: ctx.replacementPublicationId
        ? String(ctx.replacementPublicationId).slice(0, 8)
        : null
    };
  }
  if (st === "expired") {
    return {
      state: "expired",
      title: "Publication expired",
      message:
        "This Digital Estimate link has expired. Review the customer request explicitly, then prepare a replacement through a new approved publication.",
      allowRepublish: false,
      allowSilentReactivate: false
    };
  }
  return {
    state: st || "unknown",
    title: st === "active" ? "Publication active" : "Publication state",
    message: null,
    allowRepublish: st === "active",
    allowSilentReactivate: false
  };
}

/**
 * Strip diagnostic keys from staff HTTP payloads.
 * @param {object} presented
 */
export function toPublicBlockerDto(presented) {
  const {
    diagnosticOptionKey: _diag,
    ...safe
  } = presented || {};
  return safe;
}
