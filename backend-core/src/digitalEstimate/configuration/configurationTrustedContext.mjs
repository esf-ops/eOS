/**
 * DE.2D — server-side trusted configuration context builder.
 * Never trusts browser prices, account groups, or measurements.
 */

import {
  FIXTURE_ELITE100_DIRECT_RATES_PER_SQFT,
  FIXTURE_ELITE100_WHOLESALE_RATES_PER_SQFT,
  FIXTURE_GLOBAL_MATERIAL_USE_TAX,
  GROUP_CODE_DISPLAY_NAMES,
  buildFixtureMaterialGroupRates
} from "./approvedPricingFixtures.mjs";
import { CURRENT_ELITE100_CONFIG_DELTA_ENGINE_ID } from "./elite100ConfigDeltaConstants.mjs";
import { sha256CanonicalJson } from "../digitalEstimateToken.mjs";
import {
  billableBacksplashFromRoom,
  billableCountertopFromRoom
} from "../../quotes/billableSquareFeet.mjs";
import { normalizeCustomerCatalogPermissions } from "./customerCatalogPermissions.mjs";

function fail(code, message, statusCode = 422) {
  const e = new Error(message);
  e.code = code;
  e.statusCode = statusCode;
  return e;
}

function normalizeGroupCode(raw) {
  const s = String(raw || "").trim().toLowerCase();
  const map = {
    promo: "promo",
    "group promo": "promo",
    group_promo: "promo",
    a: "group_a",
    "group a": "group_a",
    group_a: "group_a",
    b: "group_b",
    "group b": "group_b",
    group_b: "group_b",
    c: "group_c",
    "group c": "group_c",
    group_c: "group_c",
    d: "group_d",
    "group d": "group_d",
    group_d: "group_d",
    e: "group_e",
    "group e": "group_e",
    group_e: "group_e",
    f: "group_f",
    "group f": "group_f",
    group_f: "group_f",
    remnant: "remnant"
  };
  return map[s] || null;
}

/**
 * Extract locked rooms + chargeable SF from frozen publication evidence.
 * @returns {{ rooms: Array, blockers: Array<{code:string,message:string}> }}
 */
export function extractLockedRoomsFromEvidence(pricingEvidence, customerSnapshot) {
  const blockers = [];
  const snap =
    pricingEvidence?.calculationSnapshotCopy &&
    typeof pricingEvidence.calculationSnapshotCopy === "object"
      ? pricingEvidence.calculationSnapshotCopy
      : {};
  const iu = snap.internal_ui && typeof snap.internal_ui === "object" ? snap.internal_ui : {};
  const estimateRooms = Array.isArray(iu.estimate_rooms) ? iu.estimate_rooms : [];

  const rooms = [];
  if (estimateRooms.length) {
    for (let i = 0; i < estimateRooms.length; i++) {
      const r = estimateRooms[i];
      const roomKey = String(r.id || r.roomKey || r.name || `room_${i + 1}`);
      const counterBilled = billableCountertopFromRoom({
        countertopSqft: r.countertopSqft ?? r.countertop_sqft ?? r.chargeableCounterSf,
        pieces: Array.isArray(r.pieces) ? r.pieces : []
      });
      const splashBilled = billableBacksplashFromRoom({
        includeBacksplash: r.includeBacksplash !== false,
        backsplashSqft: r.backsplashSqft ?? r.backsplash_sqft ?? 0,
        backsplashSections: r.backsplashSections
      });
      const ct = counterBilled.billableSf;
      const bs = splashBilled.billableSf;
      if (!Number.isFinite(ct) || ct < 0) {
        blockers.push({
          code: "missing_locked_measurement",
          message: `Room ${roomKey} missing locked chargeable countertop SF`
        });
        continue;
      }
      const groupRaw = r.materialGroup ?? r.group ?? snap.materialGroup ?? snap.material_group;
      const groupCode = normalizeGroupCode(groupRaw);
      if (!groupCode) {
        blockers.push({
          code: "unknown_baseline_group",
          message: `Room ${roomKey} has unknown baseline material group`
        });
      }
      // Internal locked measurements — never project numeric SF to public DTOs.
      rooms.push({
        roomKey,
        displayName: String(r.name || r.room_name || roomKey),
        chargeableCounterSf: ct,
        rawCountertopSf: counterBilled.rawSf,
        backsplashSf: Number.isFinite(bs) ? bs : 0,
        rawBacksplashSf: splashBilled.rawSf,
        backsplashHeightMode: r.backsplashHeightMode || null,
        backsplashHeightIn: Number.isFinite(Number(r.backsplashHeightIn))
          ? Number(r.backsplashHeightIn)
          : null,
        backsplashMeasuredLengthIn: r.backsplashMeasuredLengthIn ?? null,
        edgeLinearFeet: Number(r.edgeLinearFeet ?? r.edge_linear_feet) || 0,
        baselineMaterialGroup: groupCode,
        baselineMaterialLabel: GROUP_CODE_DISPLAY_NAMES[groupCode] || String(groupRaw || ""),
        colorLabel: r.colorName || r.color_name || r.colorLabel || null,
        measurementsLocked: true,
        pieces: Array.isArray(r.pieces)
          ? r.pieces.map((p, idx) => {
              const ordinal = idx + 1;
              const rawLabel = String(
                p.displayLabel ||
                  p.displayName ||
                  p.name ||
                  p.label ||
                  p.areaLabel ||
                  p.areaName ||
                  ""
              ).trim();
              const looksUuid =
                /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
                  rawLabel
                ) || /^[0-9a-f]{32}$/i.test(rawLabel.replace(/[\s-]/g, ""));
              const displayLabel =
                rawLabel && !looksUuid ? rawLabel : `Countertop run ${ordinal}`;
              return {
                id: String(p.id || p.key || p.takeoffRunId || `piece_${ordinal}`),
                name: displayLabel,
                label: displayLabel,
                displayName: displayLabel,
                displayLabel,
                areaLabel: p.areaLabel || p.areaName || null,
                pieceType: p.pieceType || p.type || null,
                depthIn: Number(p.depthIn ?? p.depth) || null,
                included: p.included !== false,
                sideSplashLeftEligible:
                  p.sideSplashLeftEligible == null ? null : Boolean(p.sideSplashLeftEligible),
                sideSplashRightEligible:
                  p.sideSplashRightEligible == null ? null : Boolean(p.sideSplashRightEligible),
                sideSplashEligible:
                  p.sideSplashEligible == null ? null : Boolean(p.sideSplashEligible)
              };
            })
          : []
      });
    }
  } else if (Array.isArray(customerSnapshot?.rooms) && customerSnapshot.rooms.length) {
    // Customer snapshot alone lacks numeric SF — structural blocker
    blockers.push({
      code: "missing_locked_measurement",
      message:
        "Publication evidence lacks locked chargeable SF (estimate_rooms). Cannot build configuration without guessing."
    });
  } else {
    blockers.push({
      code: "missing_locked_measurement",
      message: "No locked rooms found in publication evidence"
    });
  }

  return { rooms, blockers };
}

/**
 * Server-approved option catalog for DE.2D (fixtures — not live Admin).
 */
export function serverApprovedOptionCatalog() {
  return [
    {
      optionKey: "qty-sink",
      groupKey: "cutouts",
      displayLabel: "Kitchen Sink Cutouts",
      pricingMode: "per_each",
      sellPrice: 200,
      availabilityState: "active",
      customerPriceTreatment: "absolute",
      minQty: 0,
      maxQty: 10,
      lockedQuantity: true
    },
    {
      optionKey: "qty-bar",
      groupKey: "cutouts",
      displayLabel: "Vanity/Bar Sink Cutouts",
      pricingMode: "per_each",
      sellPrice: 100,
      availabilityState: "active",
      customerPriceTreatment: "absolute",
      minQty: 0,
      maxQty: 10,
      lockedQuantity: true
    },
    {
      optionKey: "qty-cook",
      groupKey: "cutouts",
      displayLabel: "Cooktop Cutouts",
      pricingMode: "per_each",
      sellPrice: 150,
      availabilityState: "active",
      customerPriceTreatment: "absolute",
      minQty: 0,
      maxQty: 5,
      lockedQuantity: true
    },
    {
      optionKey: "qty-outlet",
      groupKey: "cutouts",
      displayLabel: "Electrical Outlet Cutouts",
      pricingMode: "per_each",
      sellPrice: 30,
      availabilityState: "active",
      customerPriceTreatment: "absolute",
      minQty: 0,
      maxQty: 20,
      lockedQuantity: true
    },
    {
      optionKey: "qty-ss",
      groupKey: "sinks",
      displayLabel: "ESF Stainless Kitchen Sink",
      pricingMode: "per_each",
      sellPrice: 160,
      availabilityState: "active",
      customerPriceTreatment: "absolute",
      minQty: 0,
      maxQty: 5
    },
    {
      optionKey: "qty-v-rect",
      groupKey: "sinks",
      displayLabel: "ESF Rectangular Vanity Sink",
      pricingMode: "per_each",
      sellPrice: 55,
      availabilityState: "active",
      customerPriceTreatment: "absolute",
      minQty: 0,
      maxQty: 10
    },
    {
      optionKey: "qty-v-oval",
      groupKey: "sinks",
      displayLabel: "ESF Oval Vanity Sink",
      pricingMode: "per_each",
      sellPrice: 35,
      availabilityState: "active",
      customerPriceTreatment: "absolute",
      minQty: 0,
      maxQty: 10
    },
    {
      optionKey: "tearout",
      groupKey: "services",
      displayLabel: "Tear Out Needed",
      pricingMode: "fixed",
      sellPrice: 750,
      availabilityState: "active",
      customerPriceTreatment: "absolute",
      minQty: 0,
      maxQty: 1
    },
    {
      optionKey: "qty-blanco",
      groupKey: "sinks",
      displayLabel: "Stock Blanco Sink",
      pricingMode: "per_each",
      sellPrice: null,
      availabilityState: "review_required",
      customerPriceTreatment: "review_required",
      unresolvedReason: "Blanco 450 vs 495 unresolved"
    },
    {
      optionKey: "waterfall",
      groupKey: "edges",
      displayLabel: "Waterfall",
      pricingMode: "fixed",
      sellPrice: null,
      availabilityState: "unavailable",
      customerPriceTreatment: "unavailable",
      unresolvedReason: "Waterfall LF vs flat unresolved"
    },
    {
      optionKey: "popup_outlet_cutout",
      groupKey: "cutouts",
      displayLabel: "Pop-up outlet cutout",
      pricingMode: "per_each",
      sellPrice: null,
      availabilityState: "unavailable",
      customerPriceTreatment: "unavailable",
      unresolvedReason: "Pop-up not calculator authority"
    }
  ];
}

/**
 * @param {{
 *   organizationId: string,
 *   publicationId: string,
 *   deRepository: { getPublication: Function, getSnapshotByPublicationId: Function, getQuoteHeader?: Function },
 *   pricingPolicyRepository?: { seedConfirmedElite100Fixtures?: Function, getBaseRates?: Function, _dump?: Function }|null,
 *   pricingBasis?: 'direct'|'wholesale'
 * }} args
 */
export async function buildTrustedConfigurationContext(args) {
  const {
    organizationId,
    publicationId,
    deRepository,
    pricingPolicyRepository = null,
    pricingBasis: pricingBasisArg = null
  } = args;

  if (!organizationId) throw fail("organization_required", "organizationId required", 403);

  const pub = await deRepository.getPublication(organizationId, publicationId);
  if (!pub) throw fail("publication_not_found", "Publication not found", 404);
  if (pub.status !== "active") {
    throw fail("publication_not_active", "Publication is not active", 400);
  }

  const snap = await deRepository.getSnapshotByPublicationId(organizationId, publicationId);
  if (!snap) throw fail("snapshot_missing", "Publication snapshot missing", 422);

  const customerSnapshot = snap.customer_snapshot_json || {};
  const pricingEvidence = snap.pricing_evidence_json || {};
  const calcCopy =
    pricingEvidence.calculationSnapshotCopy &&
    typeof pricingEvidence.calculationSnapshotCopy === "object"
      ? pricingEvidence.calculationSnapshotCopy
      : {};
  const iu =
    calcCopy.internal_ui && typeof calcCopy.internal_ui === "object" ? calcCopy.internal_ui : {};
  // Prefer explicit caller override, then frozen Studio publication basis.
  const frozenBasis = String(
    pricingBasisArg || iu.pricing_basis || calcCopy.pricingBasis || "direct"
  ).toLowerCase();
  const pricingBasis = frozenBasis === "wholesale" ? "wholesale" : "direct";

  const { rooms, blockers } = extractLockedRoomsFromEvidence(pricingEvidence, customerSnapshot);

  let partnerAccountId = null;
  if (typeof deRepository.getQuoteHeader === "function" && pub.source_quote_id) {
    const header = await deRepository.getQuoteHeader(organizationId, pub.source_quote_id);
    partnerAccountId = header?.partner_account_id || header?.partnerAccountId || null;
  }

  // Account membership / overrides from pricing policy repo (memory fixtures or empty)
  let accountMemberships = [];
  let materialRateOverrides = [];
  let estimateAdjustments = [];
  let accountMappingNotice = null;

  if (pricingPolicyRepository && typeof pricingPolicyRepository._dump === "function") {
    const dump = pricingPolicyRepository._dump();
    accountMemberships = (dump.memberships || [])
      .filter((m) => m.organization_id === organizationId)
      .map((m) => ({
        id: m.id,
        organizationId: m.organization_id,
        accountGroupId: m.account_group_id,
        partnerAccountId: m.partner_account_id,
        isActive: m.is_active !== false,
        effectiveFrom: m.effective_from,
        effectiveTo: m.effective_to
      }));
    const groupsById = new Map((dump.accountGroups || []).map((g) => [g.id, g]));
    materialRateOverrides = (dump.materialOverrides || [])
      .filter((o) => o.organization_id === organizationId)
      .map((o) => {
        const g = groupsById.get(o.account_group_id);
        return {
          id: o.id,
          organizationId: o.organization_id,
          accountGroupId: o.account_group_id,
          accountGroupCode: o.account_group_code || g?.group_code,
          overrideKind: o.override_kind || null,
          groupCode: o.group_code,
          ratePerSqft: Number(o.rate_per_sqft),
          priority: o.priority,
          scheduleCode: o.schedule_code,
          isActive: o.is_active !== false,
          effectiveFrom: o.effective_from,
          effectiveTo: o.effective_to
        };
      });
    estimateAdjustments = (dump.estimateAdjustments || [])
      .filter((a) => a.organization_id === organizationId)
      .map((a) => {
        const g = groupsById.get(a.account_group_id);
        return {
          id: a.id,
          organizationId: a.organization_id,
          accountGroupId: a.account_group_id,
          accountGroupCode: g?.group_code || a.account_group_code,
          adjustmentCode: a.adjustment_code,
          bps: a.rate_bps ?? Math.round(Number(a.rate || 0) * 10000),
          rate: Number(a.rate),
          isActive: a.is_active !== false,
          effectiveFrom: a.effective_from,
          effectiveTo: a.effective_to
        };
      });
  }

  if (!partnerAccountId) {
    accountMappingNotice =
      "No trusted account pricing mapping (partner_account_id). Watt's / Spahn & Rose rules will not apply.";
  }

  const frozenBaseRates = {
    direct: { ...FIXTURE_ELITE100_DIRECT_RATES_PER_SQFT },
    wholesale: { ...FIXTURE_ELITE100_WHOLESALE_RATES_PER_SQFT }
  };
  if (pricingPolicyRepository?.getBaseRates) {
    const d = pricingPolicyRepository.getBaseRates(organizationId, "direct");
    const w = pricingPolicyRepository.getBaseRates(organizationId, "wholesale");
    if (d && Object.keys(d).length) Object.assign(frozenBaseRates.direct, d);
    if (w && Object.keys(w).length) Object.assign(frozenBaseRates.wholesale, w);
  }

  const allowedMaterialGroups = buildFixtureMaterialGroupRates("direct").map((g) => ({
    groupCode: g.groupCode,
    displayName: g.displayName
  }));

  const pricingPolicyFingerprint = sha256CanonicalJson({
    engine: CURRENT_ELITE100_CONFIG_DELTA_ENGINE_ID,
    rates: frozenBaseRates,
    tax: FIXTURE_GLOBAL_MATERIAL_USE_TAX.rate
  });
  const catalogFingerprint = sha256CanonicalJson({
    options: serverApprovedOptionCatalog().map((o) => o.optionKey)
  });

  const baselineDisplayTotal = Number(customerSnapshot?.totals?.estimatedProjectTotal);
  const materialProgram =
    pricingEvidence.materialProgramDefault ||
    pricingEvidence.calculationSnapshotCopy?.materialProgramDefault ||
    "elite_100";

  if (materialProgram && materialProgram !== "elite_100") {
    blockers.push({
      code: "not_elite_100",
      message: "Source estimate is not Elite 100"
    });
  }

  // Frozen at Studio publication (Pricing Setup → Customer-selectable catalogs).
  // Missing keys default to allowed. Never invent permissions from client input.
  const customerCatalogPermissions = normalizeCustomerCatalogPermissions(
    iu.customer_catalog_permissions ||
      iu.customerCatalogPermissions ||
      calcCopy.customerCatalogPermissions ||
      customerSnapshot.customerCatalogPermissions ||
      null
  );

  // Project-level governed open-edge LF (Studio freezes onto rooms; also keep
  // an aggregate so premium edge option effects never fail for missing per-room LF).
  const edgeLinearFeetTotal = rooms.reduce(
    (s, r) => s + (Number(r.edgeLinearFeet) || 0),
    0
  );

  return {
    organizationId,
    publication: {
      id: pub.id,
      status: pub.status,
      sourceQuoteId: pub.source_quote_id,
      quoteFamilyRootId: pub.quote_family_root_id,
      quoteNumber: pub.quote_number,
      revisionNumber: pub.revision_number,
      revisionLabel: pub.revision_label,
      pricingValidThrough: pub.pricing_valid_through,
      accessExpiresAt: pub.access_expires_at,
      snapshotId: snap.id,
      customerSnapshotHash: snap.customer_snapshot_hash || pub.customer_snapshot_hash,
      pricingEvidenceHash: snap.pricing_evidence_hash || pub.pricing_evidence_hash,
      sourceQuoteFingerprint: pub.source_quote_fingerprint
    },
    project: customerSnapshot.project || {},
    // Raw frozen customer snapshot — internal use only (e.g. building the Original room
    // pricing projection for the Changes view). Never forward this object directly to a
    // public response; always go through buildOriginalRoomPricingProjection + the
    // allowlisted toPublicRoomPricingDto/toPublicChangesPricingDto helpers.
    customerSnapshot,
    customerCatalogPermissions,
    edgeLinearFeetTotal,
    baselineDisplayTotal: Number.isFinite(baselineDisplayTotal) ? baselineDisplayTotal : null,
    pricingValidThrough: pub.pricing_valid_through,
    rooms,
    lockedScopeNotice:
      "Measurements and fabrication quantities are locked professional scope and cannot be edited in configuration.",
    partnerAccountId,
    accountMappingNotice,
    accountMemberships,
    materialRateOverrides,
    estimateAdjustments,
    pricingBasis,
    frozenBaseRates,
    allowedMaterialGroups,
    optionCatalog: serverApprovedOptionCatalog().map((o) => ({
      optionKey: o.optionKey,
      groupKey: o.groupKey,
      displayLabel: o.displayLabel,
      availabilityState: o.availabilityState,
      customerPriceTreatment: o.customerPriceTreatment,
      minQty: o.minQty ?? 0,
      maxQty: o.maxQty ?? null,
      lockedQuantity: Boolean(o.lockedQuantity),
      unresolvedReason: o.unresolvedReason || null
      // sellPrice intentionally omitted from customer-safe context; staff preview resolves server-side
    })),
    optionCatalogInternal: serverApprovedOptionCatalog(),
    materialTaxPolicy: {
      bps: 200,
      rate: 0.02,
      taxableBasis: "material_sell_amount",
      customerPresentation: "bundled_not_separate_line"
    },
    engineVersion: CURRENT_ELITE100_CONFIG_DELTA_ENGINE_ID,
    pricingPolicyFingerprint,
    catalogFingerprint,
    blockers,
    canConfigure: blockers.length === 0
  };
}

/**
 * Reject client-supplied authoritative economics on Studio mutation bodies.
 */
export function rejectClientAuthoritativeEconomics(body) {
  if (!body || typeof body !== "object") return;
  const forbidden = [
    "price",
    "sellPrice",
    "sell_price",
    "rate",
    "ratePerSqft",
    "cost",
    "tax",
    "taxRate",
    "useTax",
    "accountGroup",
    "accountGroupId",
    "accountGroupCode",
    "materialGroup",
    "pricingGroup",
    "pricingGroupCode",
    "markup",
    "markupBps",
    "total",
    "watts",
    "spahn",
    "configuredTotal",
    "baselineTotal",
    "exactTotal",
    "displayTotal",
    "delta",
    "organizationId",
    "organization_id",
    "pricingPolicyFingerprint",
    "catalogFingerprint",
    "engineVersion",
    "approverUserId",
    "approver",
    "partnerAccountId",
    "wholesale",
    "directRate",
    "wholesaleRate"
  ];
  for (const f of forbidden) {
    if (Object.prototype.hasOwnProperty.call(body, f)) {
      throw fail("forbidden_caller_authority", `Caller must not supply ${f}`, 400);
    }
  }
}
