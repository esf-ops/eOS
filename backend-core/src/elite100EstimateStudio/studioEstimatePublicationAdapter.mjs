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
import { assessElite100PublicationEligibility } from "../digitalEstimate/digitalEstimateEligibility.mjs";
import { readDigitalEstimatePricingValidDays } from "../digitalEstimate/digitalEstimateConfig.mjs";
import { serverApprovedOptionCatalog } from "../digitalEstimate/configuration/configurationTrustedContext.mjs";

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
 * @param {object|null|undefined} configuration
 */
export function hashConfigurationEnvelope(configuration) {
  const cfg = configuration && typeof configuration === "object" ? configuration : {};
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
    customerChoiceGroups: Array.isArray(cfg.customerChoiceGroups)
      ? [...cfg.customerChoiceGroups].map(str).filter(Boolean).sort()
      : [],
    allowedOptionKeys: Array.isArray(cfg.allowedOptionKeys)
      ? [...cfg.allowedOptionKeys].map(str).filter(Boolean).sort()
      : [],
    allowedEdgeModes: Array.isArray(cfg.allowedEdgeModes)
      ? [...cfg.allowedEdgeModes].map(str).filter(Boolean).sort()
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
    estimatorNotes: str(cfg.estimatorNotes).slice(0, 2000) || null
  };
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex").slice(0, 32);
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
  return rooms
    .filter((r) => r && r.included !== false)
    .map((r, idx) => {
      const pieces = Array.isArray(r.pieces) ? r.pieces.filter((p) => p && p.included !== false) : [];
      let countertopSqft = Number(r.countertopSqft);
      let backsplashSqft = Number(r.backsplashSqft);
      if (!Number.isFinite(countertopSqft) || countertopSqft < 0) {
        countertopSqft = pieces
          .filter((p) => String(p.pieceType ?? "").toLowerCase() !== "backsplash")
          .reduce((s, p) => s + (Number(p.sqft) || 0), 0);
      }
      if (!Number.isFinite(backsplashSqft) || backsplashSqft < 0) {
        backsplashSqft = pieces
          .filter((p) => String(p.pieceType ?? "").toLowerCase().includes("backsplash"))
          .reduce((s, p) => s + (Number(p.sqft) || 0), 0);
      }
      return {
        id: str(r.id) || `room-${idx + 1}`,
        name: str(r.name) || `Room ${idx + 1}`,
        roomType: str(r.roomType) || "Kitchen",
        countertopSqft,
        backsplashSqft,
        materialGroup,
        colorName,
        notes: str(r.notes) || ""
      };
    });
}

/**
 * Customer-safe print snapshot rooms / totals (no rates, markup, or wholesale).
 * @param {object} estimate
 * @param {number} customerDisplayTotal
 */
function buildPrintSnapshot(estimate, customerDisplayTotal) {
  const rooms = buildStudioEstimateRoomsForPublication(estimate);
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
  return {
    materialProgramDefault: "elite_100",
    material_program_default: "elite_100",
    materialGroup: str(scope.materialGroup) || "Group Promo",
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
      estimate_rooms: rooms,
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
    customer_name: str(scope.customerName) || null,
    project_name: str(scope.projectName) || null,
    project_address: str(scope.projectAddress) || null,
    estimated_material_group: str(scope.materialGroup) || "Group Promo",
    partner_account_id: scope.partnerAccountId || null,
    calculation_snapshot: {
      ...snapshotCopy,
      // Eligibility reads internal_ui on this object
      internal_ui: {
        material_program_default: "elite_100",
        customer_display_total: customerDisplayTotal,
        estimate_rooms: rooms,
        customer_estimate_print_snapshot: printSnap
        // Estimator-only notes intentionally excluded from customer-facing freeze path
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
  if (takeoffStatus !== "approved") {
    blockers.push({
      code: "takeoff_not_approved",
      message: "Current Takeoff must be approved before Digital Estimate publication"
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
  if (!str(scope.projectName)) {
    blockers.push({
      code: "project_name_required",
      field: "projectName",
      message: "Project name is required before publishing."
    });
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
    message: b.message,
    ...(b.allowedRange ? { allowedRange: b.allowedRange } : {}),
    ...(b.detail ? { detail: b.detail } : {})
  }));
  return {
    eligible,
    code: eligible ? "eligible" : blockers[0].code,
    message: eligible
      ? "Approved Studio estimate is ready for Digital Estimate publication"
      : blockers[0].message,
    field: eligible ? null : blockers[0].field || null,
    allowedRange: eligible ? null : blockers[0].allowedRange || null,
    blockers,
    blockingReasons,
    eliteEligibility,
    details: {
      studioEstimateId: estimate.id,
      intakeCaseId: estimate.intakeCaseId || null,
      takeoffJobId: estimate.takeoffJobId || null,
      revision: Number(estimate.revision) || 1,
      calculationFingerprint: calcFp || null,
      repositoryMode: input.repositoryMode || null,
      envelopeFingerprint: hashConfigurationEnvelope(cfg),
      pricingValidThrough
    }
  };
}
