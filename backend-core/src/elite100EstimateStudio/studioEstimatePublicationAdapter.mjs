/**
 * Adapt an approved Studio estimate into a quote_headers-shaped freeze source
 * for the existing Digital Estimate publish / eligibility / snapshot pipeline.
 *
 * Does not create a second publication system — output is consumed by
 * assessElite100PublicationEligibility + buildPublicationFreezePayloads.
 */

import { createHash } from "node:crypto";
import { STUDIO_ESTIMATE_STATUSES, STUDIO_UNRESOLVED_ADDON_KEYS } from "./studioEstimateTypes.mjs";
import { collectUnresolvedItems } from "./studioEstimatePricing.mjs";
import { resolveScopeEdgeLinearFeet } from "./studioScopeBilling.mjs";
import { assessElite100PublicationEligibility } from "../digitalEstimate/digitalEstimateEligibility.mjs";
import { readDigitalEstimatePricingValidDays } from "../digitalEstimate/digitalEstimateConfig.mjs";
import { serverApprovedOptionCatalog } from "../digitalEstimate/configuration/configurationTrustedContext.mjs";
import { getCatalogMeta } from "../digitalEstimate/catalog/esfPlumbingCatalog.mjs";
import { looksLikeUuid } from "../digitalEstimate/catalog/customerFacingCopy.mjs";
import {
  buildCustomerSafeEdgeOptionEffects,
  normalizeEdgeProfileToken
} from "../digitalEstimate/catalog/studioEdgeAuthority.mjs";
import { resolveRoomApprovedEligibleEdgeLf, assessLegacyProjectEdgeFallback } from "./studioRoomEdgeQuantity.mjs";
import { validateProjectNameForPublication } from "./studioProjectDetails.mjs";

function str(v) {
  if (v == null) return "";
  return String(v).trim();
}

function roundMoney(n) {
  return Math.round(Number(n));
}

function addDaysDateOnly(days, now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatUtcDateLong(isoDate) {
  const s = String(isoDate || "").slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return s;
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return dt.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  });
}

/**
 * Resolve / validate pricingValidThrough for Studio Digital Estimate publication.
 * Empty input → server default (pricingValidDays from today UTC).
 *
 * @param {unknown} raw
 * @param {NodeJS.ProcessEnv} [env]
 * @param {Date} [now]
 * @returns {{ ok: true, value: string } | { ok: false, blocker: object }}
 */
export function resolveStudioPricingValidThrough(raw, env = process.env, now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  const defaultDays = readDigitalEstimatePricingValidDays(env);
  const max = addDaysDateOnly(defaultDays + 30, now);
  const allowedRange = { min: today, max };

  if (raw == null || String(raw).trim() === "") {
    return { ok: true, value: addDaysDateOnly(defaultDays, now), allowedRange };
  }

  const s = String(raw).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return {
      ok: false,
      blocker: {
        code: "invalid_pricing_valid_through",
        field: "pricingValidThrough",
        message: "Pricing valid through must be a date in YYYY-MM-DD format.",
        allowedRange
      }
    };
  }
  if (s < today || s > max) {
    return {
      ok: false,
      blocker: {
        code: "invalid_pricing_valid_through",
        field: "pricingValidThrough",
        message: `Pricing must be valid through a date between ${formatUtcDateLong(today)} and ${formatUtcDateLong(max)}.`,
        allowedRange
      }
    };
  }
  return { ok: true, value: s, allowedRange };
}

/**
 * Stable publication family across estimate revisions for one intake case.
 * @param {object} estimate
 */
export function studioEstimatePublicationFamilyRoot(estimate) {
  return str(estimate?.intakeCaseId) || str(estimate?.id);
}

/**
 * Customer-safe quote number for Studio-backed publications.
 * @param {object} estimate
 */
export function studioEstimateQuoteNumber(estimate) {
  const caseId = str(estimate?.intakeCaseId) || str(estimate?.id);
  const short = caseId.replace(/-/g, "").slice(0, 8).toUpperCase();
  return `SE-${short}`;
}

/**
 * Hash of estimator-submitted configuration envelope (catalog IDs / booleans / limits).
 * Includes product catalog fingerprint so Save/Update reseeds when the approved workbook seed changes.
 * @param {object|null|undefined} configuration
 * @param {{ productCatalogFingerprint?: string|null }} [opts]
 */
export function hashConfigurationEnvelope(configuration, opts = {}) {
  const cfg = configuration && typeof configuration === "object" ? configuration : {};
  // Normalize permission keys so camelCase / snake_case / order never fork fingerprints.
  let customerChoiceGroups = [];
  try {
    // Lazy require-free: inline normalize (keep adapter free of Studio UI module cycles).
    const alias = {
      materialColor: "material_color",
      cooktop: "cooktop_cutout",
      sideSplash: "side_splash",
      sidesplash: "side_splash",
      accessory: "accessories"
    };
    const order = [
      "material_color",
      "sink",
      "faucet",
      "accessories",
      "specialty",
      "cooktop_cutout",
      "edge",
      "backsplash",
      "side_splash"
    ];
    const set = new Set();
    for (const raw of Array.isArray(cfg.customerChoiceGroups) ? cfg.customerChoiceGroups : []) {
      let k = str(raw);
      if (!k) continue;
      if (alias[k]) k = alias[k];
      k = k.replace(/([a-z0-9])([A-Z])/g, "$1_$2").replace(/-/g, "_").toLowerCase();
      if (order.includes(k)) set.add(k);
    }
    customerChoiceGroups = order.filter((k) => set.has(k));
  } catch {
    customerChoiceGroups = [];
  }
  // Every customer-choice permission flag must affect the fingerprint. Most friendly
  // groups (material/edge/faucet/…) have empty catalogKeys — omitting
  // customerChoiceGroups made permission edits look unchanged and skipped envelope re-seed.
  const normalized = {
    roomLocks: Array.isArray(cfg.roomLocks)
      ? cfg.roomLocks
          .map((r) => ({
            roomKey: str(r.roomKey || r.roomId),
            locked: Boolean(r.locked)
          }))
          .sort((a, b) => a.roomKey.localeCompare(b.roomKey))
      : [],
    includedMaterialId: str(cfg.includedMaterialId || cfg.defaultMaterialId) || null,
    allowedMaterialIds: Array.isArray(cfg.allowedMaterialIds)
      ? [...cfg.allowedMaterialIds].map(str).filter(Boolean).sort()
      : [],
    allowedMaterialGroupCodes: Array.isArray(cfg.allowedMaterialGroupCodes)
      ? [...cfg.allowedMaterialGroupCodes].map(str).filter(Boolean).sort()
      : Array.isArray(cfg.allowedMaterialGroups)
        ? [...cfg.allowedMaterialGroups].map(str).filter(Boolean).sort()
        : [],
    customerChoiceGroups,
    allowedOptionKeys: Array.isArray(cfg.allowedOptionKeys)
      ? [...cfg.allowedOptionKeys].map(str).filter(Boolean).sort()
      : [],
    allowedEdgeModes: Array.isArray(cfg.allowedEdgeModes)
      ? [...cfg.allowedEdgeModes].map(str).filter(Boolean).sort()
      : Array.isArray(cfg.allowedEdgeProfiles)
        ? [...cfg.allowedEdgeProfiles].map(str).filter(Boolean).sort()
        : [],
    quantityLimits:
      cfg.quantityLimits && typeof cfg.quantityLimits === "object"
        ? Object.fromEntries(
            Object.entries(cfg.quantityLimits)
              .map(([k, v]) => [str(k), Math.max(0, Math.floor(Number(v) || 0))])
              .sort(([a], [b]) => a.localeCompare(b))
          )
        : {},
    pricingValidThrough: str(cfg.pricingValidThrough).slice(0, 10) || null,
    estimatorNotes: str(cfg.estimatorNotes).slice(0, 2000) || null,
    productCatalogFingerprint: str(opts.productCatalogFingerprint || cfg.productCatalogFingerprint) || null
  };
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex").slice(0, 32);
}

/**
 * Customer-safe piece label for Digital Estimate side-splash (never a UUID).
 * @param {object} piece
 * @param {number} ordinal 1-based within the room
 */
function customerSafePieceLabel(piece, ordinal) {
  const candidates = [
    piece?.name,
    piece?.label,
    piece?.displayName,
    piece?.displayLabel,
    piece?.areaLabel,
    piece?.areaName
  ];
  for (const raw of candidates) {
    const value = str(raw);
    if (value && !looksLikeUuid(value)) return value;
  }
  return `Countertop run ${Math.max(1, ordinal)}`;
}

/**
 * Persist side-splash-eligible countertop runs into the publication freeze.
 * Labels come from estimator-edited Takeoff/Studio piece names — never run IDs.
 * @param {Array<object>} pieces
 */
function freezePiecesForPublication(pieces) {
  const out = [];
  let ordinal = 0;
  for (const piece of Array.isArray(pieces) ? pieces : []) {
    if (!piece || piece.included === false) continue;
    const pieceType = String(piece.pieceType || piece.type || "").toLowerCase();
    ordinal += 1;
    const leftEligible =
      piece.sideSplashLeftEligible === true ||
      piece.sideSplashEligible === true ||
      piece.side_splash_left_eligible === true;
    const rightEligible =
      piece.sideSplashRightEligible === true ||
      piece.sideSplashEligible === true ||
      piece.side_splash_right_eligible === true;
    // Legacy Studio seeds often omit eligibility flags. Treat missing as
    // "eligible for customer choice" so existing envelopes keep working; when
    // either flag is explicitly present, require at least one side.
    const eligibilityKnown =
      piece.sideSplashLeftEligible != null ||
      piece.sideSplashRightEligible != null ||
      piece.sideSplashEligible != null ||
      piece.side_splash_left_eligible != null ||
      piece.side_splash_right_eligible != null;
    const sideSplashEligible = eligibilityKnown ? leftEligible || rightEligible : true;
    const displayLabel = customerSafePieceLabel(piece, ordinal);
    out.push({
      id: str(piece.id || piece.key || piece.takeoffRunId || `piece-${ordinal}`),
      name: displayLabel,
      label: displayLabel,
      displayName: displayLabel,
      displayLabel,
      areaLabel: str(piece.areaLabel || piece.areaName) || null,
      pieceType: piece.pieceType || piece.type || "counter",
      depthIn: Number.isFinite(Number(piece.depthIn ?? piece.depth))
        ? Number(piece.depthIn ?? piece.depth)
        : null,
      included: true,
      sideSplashLeftEligible: eligibilityKnown ? leftEligible : null,
      sideSplashRightEligible: eligibilityKnown ? rightEligible : null,
      sideSplashEligible,
      // Internal trace only — never used as a customer label.
      takeoffRunId: piece.takeoffRunId || piece.runId || null
    });
  }
  return out;
}

/**
 * Build estimate_rooms for eligibility + configuration evidence (locked SF).
 * @param {object} estimate
 */
export function buildStudioEstimateRoomsForPublication(estimate) {
  const scope = estimate?.scope && typeof estimate.scope === "object" ? estimate.scope : {};
  const materialGroup = str(scope.materialGroup) || "Group Promo";
  const colorName = scope.colorTbd ? null : str(scope.colorName) || null;
  const rooms = Array.isArray(scope.rooms) ? scope.rooms : [];
  const edgeScope = resolveScopeEdgeLinearFeet(scope);
  const included = rooms.filter((r) => r && r.included !== false);
  const legacyFallback = assessLegacyProjectEdgeFallback(scope);
  // Room-scoped edge LF (FEATURE_DECISIONS §165 / §173): each room freezes its own
  // confirmed/approved open-edge quantity. Never assign project finalLf to
  // the first countertop room. Never divide project LF across rooms.
  return included.map((r, idx) => {
      let roomEdge = resolveRoomApprovedEligibleEdgeLf(r);
      // Single-room legacy: project LF only when that room has no quantity.
      if (
        !roomEdge.authoritative &&
        legacyFallback.applyProjectFallback &&
        included.length === 1
      ) {
        roomEdge = {
          lf: legacyFallback.projectLf,
          authoritative: true,
          source: "legacy_single_room_project_lf",
          missingReason: null
        };
      } else if (
        !roomEdge.authoritative &&
        legacyFallback.reviewRequired
      ) {
        roomEdge = {
          lf: null,
          authoritative: false,
          source: null,
          missingReason: "legacy_multi_room_project_lf_unallocated"
        };
      }
      const edgeQuantityAuthoritative = roomEdge.authoritative === true;
      const edgeLinearFeet =
        edgeQuantityAuthoritative && roomEdge.lf != null ? Math.max(0, Number(roomEdge.lf) || 0) : 0;
      const pieces = freezePiecesForPublication(r.pieces);
      let countertopSqft = Number(r.countertopSqft);
      let backsplashSqft = Number(r.backsplashSqft);
      if (!Number.isFinite(countertopSqft) || countertopSqft < 0) {
        countertopSqft = pieces
          .filter((p) => String(p.pieceType ?? "").toLowerCase() !== "backsplash")
          .reduce((s, p) => s + (Number(p.sqft) || 0), 0);
      }
      if (!Number.isFinite(backsplashSqft) || backsplashSqft < 0) {
        backsplashSqft = (Array.isArray(r.pieces) ? r.pieces : [])
          .filter((p) => String(p?.pieceType ?? "").toLowerCase().includes("backsplash"))
          .reduce((s, p) => s + (Number(p.sqft) || 0), 0);
      }
      // Backsplash location/height authority — estimator-approved at Studio Estimate Scope
      // (studioRoomBacksplash.mjs). Additive: rooms.backsplashHeightMode/backsplashHeightIn/
      // backsplashMeasuredLengthIn were historically dropped at this exact freeze boundary,
      // which is why elite100-config-delta-v2 could never govern backsplash pricing (see
      // FEATURE_DECISIONS.md §137). Legacy publications frozen before this change simply lack
      // these fields — explicit legacy fallback, never backfilled/fabricated.
      const rawHeightMode = str(r.backsplashHeightMode);
      const backsplashHeightMode =
        rawHeightMode === "standard" ||
        rawHeightMode === "custom" ||
        rawHeightMode === "full_height"
          ? rawHeightMode
          : backsplashSqft > 0
            ? "standard"
            : "none";
      const backsplashHeightIn = Number.isFinite(Number(r.backsplashHeightIn))
        ? Number(r.backsplashHeightIn)
        : null;
      const backsplashMeasuredLengthIn = Number.isFinite(Number(r.backsplashMeasuredLengthIn))
        ? Number(r.backsplashMeasuredLengthIn)
        : null;
      return {
        id: str(r.id) || `room-${idx + 1}`,
        name: str(r.name) || `Room ${idx + 1}`,
        roomType: str(r.roomType) || "Kitchen",
        countertopSqft,
        backsplashSqft,
        backsplashHeightMode,
        backsplashHeightIn,
        backsplashMeasuredLengthIn,
        edgeLinearFeet,
        edgeFinalLf: edgeLinearFeet,
        edgeQuantityAuthoritative,
        edgeQuantitySource: roomEdge.source || null,
        edgeQuantityMissingReason: edgeQuantityAuthoritative
          ? null
          : roomEdge.missingReason || "missing_room_edge_lf",
        edgeScopeSource: edgeScope.source || null,
        materialGroup,
        colorName,
        pieces,
        notes: str(r.notes) || ""
      };
    });
}

/**
 * Custom lines for the publication freeze source, from the approved
 * calculation snapshot (server-calculated) or scope fallback. Carries
 * ownership + visibility so the room pricing snapshot can freeze explicit
 * customer-facing lines and absorb internal-only lines by policy.
 * @param {object} estimate
 */
export function buildStudioCustomLineItemsForPublication(estimate) {
  const calc = estimate?.calculationSnapshot || estimate?.calculation || null;
  const fromCalc = Array.isArray(calc?.fabrication?.customLineItems)
    ? calc.fabrication.customLineItems
    : null;
  const scope = estimate?.scope && typeof estimate.scope === "object" ? estimate.scope : {};
  const raw = fromCalc || (Array.isArray(scope.customLineItems) ? scope.customLineItems : []);
  return raw
    .map((line, i) => {
      const name = str(line?.name);
      if (!name) return null;
      const qty = Number(line?.quantity ?? 1) || 0;
      const unitPrice = Number(line?.unitPrice ?? 0) || 0;
      return {
        lineKey: str(line?.lineKey) || str(line?.id) || `studio-cli-${i + 1}`,
        name,
        category: str(line?.category) || "Other",
        quantity: qty,
        unit: str(line?.unit) || "ea",
        lineTotal: Math.round(qty * unitPrice * 100) / 100,
        customer_facing: line?.customerFacing !== false,
        customerFacing: line?.customerFacing !== false,
        roomId: str(line?.roomId),
        roomName: str(line?.roomName)
      };
    })
    .filter(Boolean);
}

/**
 * Customer-safe print snapshot rooms / totals (no rates, markup, or wholesale).
 * Customer-facing custom lines appear EXPLICITLY as named rows in the customer
 * breakdown; internal-only lines never appear here (they are absorbed into
 * stone categories by the room pricing snapshot's allocation policy).
 * @param {object} estimate
 * @param {number} customerDisplayTotal
 */
function buildPrintSnapshot(estimate, customerDisplayTotal) {
  const rooms = buildStudioEstimateRoomsForPublication(estimate);
  const customLines = buildStudioCustomLineItemsForPublication(estimate);
  const customerFacingRows = customLines
    .filter((l) => l.customerFacing)
    .map((l, i) => ({
      key: `custom-line-${l.lineKey || i + 1}`,
      label: l.roomName ? `${l.roomName} — ${l.name}` : l.name,
      displayAmount: l.lineTotal
    }));
  return {
    finalRounded: customerDisplayTotal,
    rooms: rooms.map((r) => {
      const lines = [];
      if (r.countertopSqft > 0) lines.push(`Countertop ${Math.round(r.countertopSqft)} sf`);
      if (r.backsplashSqft > 0) lines.push(`Backsplash ${Math.round(r.backsplashSqft)} sf`);
      return {
        name: r.name,
        materialLabel: r.materialGroup,
        colorLabel: r.colorName,
        summaryLines: lines
      };
    }),
    summaryRows: [
      ...customerFacingRows,
      {
        key: "project_total",
        label: "Estimated project total",
        displayAmount: customerDisplayTotal
      }
    ]
  };
}

/**
 * Strip internal-only economics from calculation evidence before freeze copy.
 * Keeps room SF + material program needed for configuration; drops markup/rates.
 * @param {object|null|undefined} calc
 * @param {object} estimate
 * @param {number} customerDisplayTotal
 */
function buildCustomerSafeCalculationSnapshotCopy(calc, estimate, customerDisplayTotal) {
  const scope = estimate?.scope && typeof estimate.scope === "object" ? estimate.scope : {};
  const rooms = buildStudioEstimateRoomsForPublication(estimate);
  const pricingBasis =
    String(scope.pricingBasis || calc?.pricingBasis || "").toLowerCase() === "wholesale"
      ? "wholesale"
      : "direct";
  const fabricationAddOns =
    calc?.fabrication?.addOns && typeof calc.fabrication.addOns === "object"
      ? { ...calc.fabrication.addOns }
      : scope.addOns && typeof scope.addOns === "object"
        ? { ...scope.addOns }
        : {};
  const edgeLfTotal = Number(
    rooms.reduce((s, r) => s + (Number(r.edgeLinearFeet) || 0), 0)
  );
  const calcEdge = calc?.fabrication?.edge;
  const originalProfileToken = normalizeEdgeProfileToken(
    calcEdge?.profileToken || scope.edgeProfileToken || "edge_eased"
  );
  // Per-room frozen effects: each room's approved LF × catalog rate.
  // Rooms without authoritative LF get review_required premium effects (no
  // project-total substitution).
  /** @type {Array<object>} */
  const edgeOptionEffects = [];
  for (const room of rooms) {
    const roomKey = room?.id || null;
    const roomName = room?.name || null;
    const authoritative = room?.edgeQuantityAuthoritative === true;
    const roomLf = authoritative ? Math.max(0, Number(room.edgeLinearFeet) || 0) : 0;
    const roomEffects = buildCustomerSafeEdgeOptionEffects({
      finalPricedEdgeLf: roomLf,
      pricingBasis,
      originalProfileToken,
      roomKey,
      roomName
    });
    if (!authoritative) {
      for (const row of roomEffects) {
        if (row.classification === "premium" && !row.originalSelection) {
          row.available = false;
          row.reviewRequired = true;
          row.priceEffectCents = null;
          row.priceEffectLabel = "Elite will confirm this option and price.";
          row.customerPriceTreatment = "review_required";
          row.blockReason = "missing_room_edge_lf";
        }
      }
    }
    edgeOptionEffects.push(...roomEffects);
  }  return {
    materialProgramDefault: "elite_100",
    material_program_default: "elite_100",
    materialGroup: str(scope.materialGroup) || "Group Promo",
    pricingBasis,
    fingerprint: str(calc?.fingerprint || estimate?.calculationFingerprint) || null,
    pricingEngine: calc?.pricingEngine || estimate?.pricingEngine || null,
    pricingVersion: calc?.pricingVersion ?? estimate?.pricingVersion ?? null,
    calculatedAt: calc?.calculatedAt || null,
    studioSource: {
      studioEstimateId: estimate.id,
      studioEstimateRevision: Number(estimate.revision) || 1,
      intakeCaseId: estimate.intakeCaseId || null,
      takeoffJobId: estimate.takeoffJobId || null,
      approvedCalculationFingerprint:
        estimate.approval?.calculationFingerprint || calc?.fingerprint || null
    },
    // Intentionally omit: internalMarkup, account overlays, rate tables, wholesale totals.
    totals: {
      customerDisplayTotal
    },
    internal_ui: {
      material_program_default: "elite_100",
      customer_display_total: customerDisplayTotal,
      pricing_basis: pricingBasis,
      estimate_rooms: rooms,
      // Project aggregate for legacy DE option resolution when a room row
      // lacks per-room LF (legacy pubs / multi-room assignment).
      edge_linear_feet_total: edgeLfTotal,
      // Customer-safe frozen per-profile effects (no LF/rate/basis). Preferred
      // authority for published Digital Estimate option labels + save amounts.
      edge_option_effects: edgeOptionEffects,
      fabrication_add_ons: fabricationAddOns,
      custom_line_items: buildStudioCustomLineItemsForPublication(estimate),
      customer_catalog_permissions:
        estimate?.scope?.customerCatalogPermissions &&
        typeof estimate.scope.customerCatalogPermissions === "object"
          ? { ...estimate.scope.customerCatalogPermissions }
          : {},
      customer_estimate_print_snapshot: buildPrintSnapshot(estimate, customerDisplayTotal)
    }
  };
}

/**
 * Build a quote_headers-shaped object for existing DE publish/eligibility.
 * @param {object} estimate raw or safe studio estimate row (must include org + approval)
 * @param {{ organizationId?: string }} [opts]
 */
export function buildSyntheticQuoteHeaderFromStudioEstimate(estimate, opts = {}) {
  if (!estimate?.id) {
    const err = new Error("Studio estimate required");
    err.code = "estimate_required";
    err.statusCode = 400;
    throw err;
  }

  const scope = estimate.scope && typeof estimate.scope === "object" ? estimate.scope : {};
  const calc = estimate.calculationSnapshot || estimate.calculation || null;
  const customerDisplayTotal = roundMoney(
    estimate.approval?.customerDisplayTotal ?? calc?.totals?.customerDisplayTotal
  );
  const organizationId =
    str(opts.organizationId) || str(estimate.organizationId) || str(estimate.organization_id);
  const revision = Number(estimate.revision) || 1;
  const rooms = buildStudioEstimateRoomsForPublication(estimate);
  const printSnap = buildPrintSnapshot(estimate, customerDisplayTotal);
  const snapshotCopy = buildCustomerSafeCalculationSnapshotCopy(calc, estimate, customerDisplayTotal);

  const snap =
    estimate.customerIdentitySnapshot && typeof estimate.customerIdentitySnapshot === "object"
      ? estimate.customerIdentitySnapshot
      : scope.customerIdentitySnapshot && typeof scope.customerIdentitySnapshot === "object"
        ? scope.customerIdentitySnapshot
        : null;
  const customerName =
    str(snap?.accountDisplayName) ||
    str(snap?.contactDisplayName) ||
    str(scope.customerName) ||
    null;
  const customerEmail = str(snap?.contactEmail) || str(scope.customerEmail) || null;
  const customerPhone = str(snap?.contactPhone) || str(scope.customerPhone) || null;

  return {
    id: estimate.id,
    organization_id: organizationId || null,
    quote_source: "internal_quote",
    quote_number: studioEstimateQuoteNumber(estimate),
    quote_number_base: studioEstimateQuoteNumber(estimate),
    revision_number: revision,
    revision_label: `R${revision}`,
    quote_family_root_id: studioEstimatePublicationFamilyRoot(estimate),
    is_current_revision: estimate.status === STUDIO_ESTIMATE_STATUSES.APPROVED,
    archived_at: null,
    customer_name: customerName,
    customer_email: customerEmail,
    customer_phone: customerPhone,
    project_name: str(scope.projectName) || null,
    project_address: str(scope.projectAddress) || null,
    estimated_material_group: str(scope.materialGroup) || "Group Promo",
    // Trusted partner pricing id only — never Account Directory UUID.
    partner_account_id: scope.partnerAccountId || null,
    account_directory_account_id:
      estimate.accountDirectoryAccountId || scope.accountDirectoryAccountId || null,
    account_directory_contact_id:
      estimate.accountDirectoryContactId || scope.accountDirectoryContactId || null,
    account_directory_location_id:
      estimate.accountDirectoryLocationId || scope.accountDirectoryLocationId || null,
    customer_identity_snapshot: snap,
    // Prefer the customer-safe snapshot copy (rooms with pieces/edge LF,
    // pricingBasis, fabrication add-ons). Keep print snapshot in sync.
    calculation_snapshot: {
      ...snapshotCopy,
      internal_ui: {
        ...(snapshotCopy.internal_ui || {}),
        estimate_rooms: rooms,
        customer_estimate_print_snapshot: printSnap,
        customer_identity_snapshot: snap
      }
    }
  };
}

/**
 * Assess Studio-specific readiness before DE eligibility / publish.
 *
 * @param {{
 *   estimate: object,
 *   repositoryMode: string,
 *   takeoffReviewStatus?: string|null,
 *   env?: NodeJS.ProcessEnv,
 *   configuration?: object|null
 * }} input
 */
export function assessStudioEstimatePublicationReadiness(input) {
  const estimate = input.estimate;
  const blockers = [];
  const env = input.env ?? process.env;

  if (!estimate) {
    return {
      eligible: false,
      code: "estimate_not_found",
      message: "Studio estimate not found",
      blockers: [{ code: "estimate_not_found", message: "Studio estimate not found" }]
    };
  }

  const allowMemory =
    String(env.ELITE100_STUDIO_ESTIMATE_ALLOW_MEMORY_PUBLISH || "").trim() === "1";
  if (String(input.repositoryMode || "") === "memory" && !allowMemory) {
    blockers.push({
      code: "memory_only_estimate",
      message:
        "Studio estimate is memory-only on this Brain. Apply eliteos_studio_estimates_v1.sql and use Supabase persistence before publishing."
    });
  }

  if (estimate.status === STUDIO_ESTIMATE_STATUSES.SUPERSEDED || estimate.supersededAt) {
    blockers.push({
      code: "estimate_superseded",
      message: "Superseded Studio estimates cannot be published"
    });
  }

  if (estimate.status !== STUDIO_ESTIMATE_STATUSES.APPROVED) {
    blockers.push({
      code: "estimate_not_approved",
      message: "Approve the Studio estimate before publishing a Digital Estimate"
    });
  }

  if (str(estimate.staleReason)) {
    blockers.push({
      code: "estimate_stale",
      message: str(estimate.staleReason)
    });
  }

  const calcFp =
    str(estimate.calculationFingerprint) ||
    str(estimate.calculationSnapshot?.fingerprint) ||
    str(estimate.calculation?.fingerprint);
  const approvalFp = str(estimate.approval?.calculationFingerprint);
  if (!approvalFp || !calcFp || approvalFp !== calcFp) {
    blockers.push({
      code: "calculation_fingerprint_mismatch",
      message: "The approved estimate changed and must be recalculated."
    });
  }

  if (!estimate.approval?.customerDisplayTotal && estimate.approval?.customerDisplayTotal !== 0) {
    const cdt = estimate.calculationSnapshot?.totals?.customerDisplayTotal;
    if (cdt == null || !Number.isFinite(Number(cdt)) || Number(cdt) <= 0) {
      blockers.push({
        code: "approved_snapshot_missing",
        message: "Approved calculation snapshot with customer display total is required"
      });
    }
  }

  const pricingEngine =
    estimate.pricingEngine ||
    estimate.calculationSnapshot?.pricingEngine ||
    estimate.calculation?.pricingEngine;
  const pricingVersion =
    estimate.pricingVersion ??
    estimate.calculationSnapshot?.pricingVersion ??
    estimate.calculation?.pricingVersion;
  if (!pricingEngine || pricingVersion == null) {
    blockers.push({
      code: "pricing_engine_missing",
      message: "Approved estimate must record pricing engine and version"
    });
  }

  const takeoffStatus = str(input.takeoffReviewStatus).toLowerCase();
  const isConfirmedManual =
    estimate?.scope?.physicalScopeSource === "manual_staff" &&
    estimate?.scope?.estimateOrigin === "manual_staff" &&
    estimate?.scope?.manualScopeConfirmed === true;
  if (!isConfirmedManual && takeoffStatus !== "approved") {
    blockers.push({
      code: "takeoff_not_approved",
      message: "Current Takeoff must be approved before Digital Estimate publication"
    });
  }

  /** @type {Array<{ code: string, message: string, severity?: string }>} */
  const warnings = [];

  // Approved calculation snapshot is the finished-edge authority for publication.
  // Do NOT re-run a Takeoff draft geometry gate after estimate approval — that
  // produced the hosted contradiction: "Ready to publish" + finished_edge_geometry_required.
  const approvedEdgeFinalLf = Number(
    estimate.calculationSnapshot?.fabrication?.edge?.finalLf ??
      estimate.calculation?.fabrication?.edge?.finalLf
  );
  const hasValidApprovedEdgeLf =
    estimate.status === STUDIO_ESTIMATE_STATUSES.APPROVED &&
    Number.isFinite(approvedEdgeFinalLf) &&
    approvedEdgeFinalLf >= 0;

  const scopeSummary =
    estimate.scope?.takeoffScopeSummary && typeof estimate.scope.takeoffScopeSummary === "object"
      ? estimate.scope.takeoffScopeSummary
      : null;
  const overrideActive =
    estimate.scope?.finishedEdgeOverride &&
    typeof estimate.scope.finishedEdgeOverride === "object" &&
    (estimate.scope.finishedEdgeOverride.finalLf != null ||
      estimate.scope.finishedEdgeOverride.final_lf != null) &&
    String(estimate.scope.finishedEdgeOverride.finalLf ?? "").trim() !== "";

  if (hasValidApprovedEdgeLf) {
    if (approvedEdgeFinalLf === 0) {
      warnings.push({
        code: "finished_edge_zero_lf",
        message: "Finished edge is approved at 0 LF.",
        severity: "warning"
      });
    }
    if (overrideActive) {
      warnings.push({
        code: "finished_edge_override_used",
        message: "Estimator finished-edge override was used for the approved calculation.",
        severity: "warning"
      });
    }
    if (
      scopeSummary?.edgeGeometryConfirmationRequired === true ||
      String(scopeSummary?.edgeScopeSource || "") === "finished_edge_geometry_required"
    ) {
      warnings.push({
        code: "legacy_finished_edge_geometry_advisory",
        message:
          "Piece-level finished-edge confirmation metadata is incomplete or legacy; approved calculation LF is authoritative.",
        severity: "warning"
      });
    }
  } else if (
    estimate.status !== STUDIO_ESTIMATE_STATUSES.APPROVED &&
    (scopeSummary?.edgeGeometryConfirmationRequired === true ||
      String(scopeSummary?.edgeScopeSource || "") === "finished_edge_geometry_required") &&
    !overrideActive
  ) {
    // Pre-approval advisory only — never a post-approval publication block.
    warnings.push({
      code: "finished_edge_geometry_advisory",
      message:
        "Confirm finished-edge geometry in Takeoff or set a Pricing Setup override before calculating.",
      severity: "warning"
    });
  }

  const scope = estimate.scope && typeof estimate.scope === "object" ? estimate.scope : {};
  if (!str(scope.customerName)) {
    blockers.push({
      code: "customer_name_required",
      field: "customerName",
      message: "Customer name is required before publishing."
    });
  }
  const projectNameCheck = validateProjectNameForPublication(scope, {
    estimateId: estimate.id,
    intakeCaseId: estimate.intakeCaseId
  });
  if (!projectNameCheck.ok) {
    blockers.push(projectNameCheck.blocker);
  }

  const unresolved = collectUnresolvedItems(scope);
  if (unresolved.length && !scope.unresolvedManualReview) {
    for (const u of unresolved) {
      blockers.push({
        code: "unresolved_commercial_item",
        message: u.message,
        detail: u.code
      });
    }
  }

  // Configuration envelope (same rules for readiness GET and publish POST).
  const cfg = input.configuration && typeof input.configuration === "object" ? input.configuration : {};
  const allowedOptions = Array.isArray(cfg.allowedOptionKeys)
    ? cfg.allowedOptionKeys.map(str).filter(Boolean)
    : [];
  const catalogKeys = new Set(serverApprovedOptionCatalog().map((o) => o.optionKey));
  for (const key of allowedOptions) {
    if (!catalogKeys.has(key)) {
      blockers.push({
        code: "unknown_catalog_option",
        field: "allowedOptionKeys",
        message: `Option "${key}" is not a valid catalog option key.`
      });
      continue;
    }
    if (
      STUDIO_UNRESOLVED_ADDON_KEYS.includes(key) ||
      key === "qty-blanco" ||
      key.includes("faucet") ||
      key.includes("accessory")
    ) {
      blockers.push({
        code: "unsupported_customer_option",
        field: "allowedOptionKeys",
        message: `Option "${key}" is not supported for customer selection by pricing authority.`
      });
    }
  }

  const now = input.now instanceof Date ? input.now : new Date();
  const pricingResolved = resolveStudioPricingValidThrough(cfg.pricingValidThrough, env, now);
  let pricingValidThrough = null;
  if (!pricingResolved.ok) {
    blockers.push(pricingResolved.blocker);
  } else {
    pricingValidThrough = pricingResolved.value;
  }

  const rooms = buildStudioEstimateRoomsForPublication(estimate);
  if (!rooms.length) {
    blockers.push({
      code: "rooms_required",
      message: "At least one included room is required before publishing"
    });
  }

  // Existing DE eligibility on synthetic header (Elite 100 + customer_display_total).
  let eliteEligibility = { eligible: false, code: "not_assessed", message: "Not assessed" };
  if (!blockers.length) {
    try {
      const header = buildSyntheticQuoteHeaderFromStudioEstimate(estimate, {
        organizationId: estimate.organizationId
      });
      eliteEligibility = assessElite100PublicationEligibility(header);
      if (!eliteEligibility.eligible) {
        blockers.push({
          code: eliteEligibility.code,
          message: eliteEligibility.message
        });
      }
    } catch (e) {
      blockers.push({
        code: e?.code || "adapter_failed",
        message: e?.message || "Unable to build publication source"
      });
    }
  }

  const eligible = blockers.length === 0;
  const blockingReasons = blockers.map((b) => ({
    code: b.code,
    field: b.field || null,
    title: b.title || null,
    message: b.message,
    action: b.action || null,
    ...(b.allowedRange ? { allowedRange: b.allowedRange } : {}),
    ...(b.detail ? { detail: b.detail } : {})
  }));
  return {
    eligible,
    code: eligible ? "eligible" : blockers[0].code,
    message: eligible
      ? "Approved Studio estimate is ready for Digital Estimate publication"
      : blockers[0].message,
    title: eligible ? null : blockers[0].title || null,
    action: eligible ? null : blockers[0].action || null,
    field: eligible ? null : blockers[0].field || null,
    allowedRange: eligible ? null : blockers[0].allowedRange || null,
    blockers,
    blockingReasons,
    warnings,
    eliteEligibility,
    details: {
      studioEstimateId: estimate.id,
      intakeCaseId: estimate.intakeCaseId || null,
      takeoffJobId: estimate.takeoffJobId || null,
      revision: Number(estimate.revision) || 1,
      calculationFingerprint: calcFp || null,
      repositoryMode: input.repositoryMode || null,
      envelopeFingerprint: hashConfigurationEnvelope(cfg, {
        productCatalogFingerprint: getCatalogMeta()?.fingerprint || null
      }),
      pricingValidThrough,
      approvedFinishedEdgeLf: hasValidApprovedEdgeLf ? approvedEdgeFinalLf : null
    }
  };
}
