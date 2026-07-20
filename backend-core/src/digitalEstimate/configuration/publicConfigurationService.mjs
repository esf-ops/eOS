/**
 * DE.2E — Public configuration session + selection service (server-authoritative).
 * Never returns internal pricing evidence. Never invokes the Internal Estimate calculator.
 */

import {
  calculateElite100ConfigDelta,
  ELITE100_CONFIG_DELTA_ENGINE_ID
} from "./currentConfigDeltaEngine.mjs";
import { assertPublicConfigurationHasNoForbiddenContent } from "./configurationPublicSerializer.mjs";
import {
  buildTrustedConfigurationContext,
  rejectClientAuthoritativeEconomics,
  serverApprovedOptionCatalog
} from "./configurationTrustedContext.mjs";
import { enrichElite100MaterialsWithCustomerImages } from "./elite100CustomerImageResolver.mjs";
import {
  edgeProfileDisplayLabel,
  isPremiumEdgeProfile,
  normalizeEdgeProfileToken,
  remapLegacyEdgeOptionKey,
  resolvePremiumEdgeRatePerLf
} from "../catalog/studioEdgeAuthority.mjs";
import { resolvePublicVisualizerOrganizationId } from "../../visualizer/publicVisualizerConfig.mjs";
import { normalizeSelectionPayload } from "./configurationValidation.mjs";
import {
  mergeSelectionPayloadMeta,
  sanitizeBacksplashDrafts,
  sanitizeCustomerInfoDraft,
  sanitizeCustomerProductDrafts,
  sanitizeProjectNoteDraft,
  sanitizeRoomLabelDrafts,
  sanitizeRoomNotesDraft,
  sanitizeSideSplashDrafts,
  splitSelectionPayloadMeta
} from "./customerConfigurationDraft.mjs";
import {
  buildMissingInformationRequirements
} from "../catalog/customerDraftRequirements.mjs";
import {
  cutoutKeyForSinkSelection,
  inferRoomEligibilityType,
  isRoomProductOptionKey,
  parseProductOptionKey,
  resolveCatalogProductSelection,
  sideSplashBillableSf,
  sideSplashQtyFromMode
} from "../catalog/digitalEstimateProductOptions.mjs";
import { customerPriceEffectLabel } from "../catalog/customerFacingCopy.mjs";
import {
  buildQuoteLibraryCustomerConfigProjection
} from "../catalog/quoteLibraryCustomerConfigProjection.mjs";
import { buildCustomerConfigurationSummary } from "../catalog/customerConfigurationSummary.mjs";
import {
  isDigitalEstimatePublicConfigurationRuntimeEnabled,
  readDigitalEstimatePublicConfigurationOrigin,
  readDigitalEstimateSessionTtlHours
} from "./publicConfigurationConfig.mjs";
import {
  constantTimeEqualSessionHash,
  generateConfigurationSessionSecret,
  hashConfigurationSessionSecret
} from "./publicConfigurationSession.mjs";
import {
  constantTimeEqualHex,
  hashDigitalEstimateToken
} from "../digitalEstimateToken.mjs";
import { buildPublicDigitalEstimateDto, assertPublicDtoHasNoForbiddenContent } from "../digitalEstimatePublicSerializer.mjs";
import {
  assertSyntheticPublicationPublicAccess,
  rejectSyntheticCallerAuthority
} from "../syntheticPilotGuard.mjs";
import {
  ELITE100_MATERIAL_CATALOG_CONTRACT,
  getElite100CustomerMaterial,
  resolveMaterialSelectionFromOption,
  toCustomerSafeMaterialRecord
} from "./elite100CustomerMaterialCatalog.mjs";

function unavailable(message = "Estimate unavailable", diagnosticCode = "DE-EXCHANGE-404") {
  const e = new Error(message);
  e.code = "not_found";
  e.statusCode = 404;
  e.diagnosticCode = diagnosticCode;
  return e;
}

/** Distinct lookup failures for sanitized server logs / pilot diagnostics (never expose IDs). */
function exchangeUnavailable(reason) {
  const e = unavailable("Estimate unavailable", "DE-EXCHANGE-404");
  e.exchangeReason = reason;
  return e;
}

function configUnavailable(message = "Configuration unavailable") {
  const e = new Error(message);
  e.code = "configuration_unavailable";
  e.statusCode = 422;
  e.diagnosticCode = "DE-SAVE";
  e.recoverable = true;
  return e;
}

function safeFail(code, message, statusCode = 400, extra = {}) {
  const e = new Error(message);
  e.code = code;
  e.statusCode = statusCode;
  e.recoverable = statusCode < 500 && statusCode !== 404 && statusCode !== 410;
  for (const [k, v] of Object.entries(extra)) {
    if (v !== undefined) e[k] = v;
  }
  return e;
}

/** Map Supabase / persistence failures so public routes never emit bare 404. */
function mapPersistenceError(error) {
  const code = String(error?.code || "");
  const message = String(error?.message || "");
  if (code === "23505" || /uq_de_config_calc_input_fingerprint|duplicate key/i.test(message)) {
    return safeFail(
      "stale_configuration",
      "Please refresh and try again",
      409,
      { diagnosticCode: "DE-SAVE", recoverable: true }
    );
  }
  if (code === "23514" || /check constraint|violates check|event_type/i.test(message)) {
    return safeFail(
      "configuration_contract_invalid",
      "Please refresh and try again",
      422,
      { diagnosticCode: "DE-CONFIGURATION-CONTRACT-INVALID", recoverable: true }
    );
  }
  if (error?.statusCode && error?.code) return error;
  return safeFail(
    "persistence_failed",
    "Unable to save right now. Please try again.",
    500,
    { diagnosticCode: "DE-SAVE", recoverable: true }
  );
}

/**
 * Resolve option key against envelope, remapping legacy edge tokens (eased→edge_eased, etc.).
 */
function findEnvelopeOptionForSelectionKey(options, key, id) {
  const rawKey = key ? String(key) : "";
  let opt = options.find(
    (o) => o.id === id || (o.option_key || o.optionKey) === rawKey
  );
  if (opt || !rawKey.startsWith("edge:")) return opt || null;
  const remapped = remapLegacyEdgeOptionKey(rawKey);
  if (remapped === rawKey) return null;
  return (
    options.find((o) => (o.option_key || o.optionKey) === remapped) || null
  );
}

/** Recoverable session cookie / row problems — customer may re-exchange. */
function sessionRecoverable(code, message = "Please refresh and try again", reason = null) {
  const e = new Error(message);
  e.code = code;
  e.statusCode = 401;
  e.diagnosticCode = "DE-COOKIE";
  e.recoverable = true;
  e.exchangeReason = reason || code;
  return e;
}

/** True publication lifecycle failures — customer unavailable page. */
function publicationLifecycle(code, message = "Estimate unavailable", statusCode = 404) {
  const e = new Error(message);
  e.code = code;
  e.statusCode = statusCode;
  e.diagnosticCode = "DE-EXCHANGE-404";
  e.lifecycleFatal = true;
  e.exchangeReason = code;
  return e;
}

function isPricingExpired(pricingValidThrough, now = new Date()) {
  if (!pricingValidThrough) return false;
  const d = new Date(`${String(pricingValidThrough).slice(0, 10)}T23:59:59.999Z`);
  return Number.isFinite(d.getTime()) && now.getTime() > d.getTime();
}

/**
 * Reject public selection mutation authority spoofing.
 */
export function rejectPublicSelectionAuthority(body) {
  rejectClientAuthoritativeEconomics(body);
  if (!body || typeof body !== "object") return;
  const forbidden = [
    "chargeableCounterSf",
    "countertopSqft",
    "roomSf",
    "edgeLf",
    "cutoutCount",
    "lockedMeasurement",
    "policyId",
    "pricingPolicyVersionId",
    "discount",
    "customLinePrice",
    "calculationResult",
    "displayDelta",
    "exactDelta",
    "actor",
    "approverUserId",
    "publicationId",
    "quoteId",
    "revisionNumber",
    "envelopeId",
    "sessionId",
    "organization",
    "watts",
    "spahn",
    "Direct",
    "Wholesale",
    "materialGroup",
    "pricingGroup",
    "pricingGroupCode",
    "rate",
    "tax",
    "markup",
    "total",
    "configuredTotal",
    "baselineTotal"
  ];
  for (const f of forbidden) {
    if (Object.prototype.hasOwnProperty.call(body, f)) {
      throw safeFail("forbidden_caller_authority", "That selection is unavailable", 400);
    }
  }
  if (Array.isArray(body.items)) {
    for (const item of body.items) rejectPublicSelectionAuthority(item);
  }
}

function toCustomerSafeOption(opt, group) {
  const availability = opt.availability_state || opt.availabilityState || "active";
  const treatment = opt.customer_price_treatment || opt.customerPriceTreatment || "absolute";
  const resolved = resolveMaterialSelectionFromOption(opt);
  const mat = resolved.materialId ? getElite100CustomerMaterial(resolved.materialId) : null;
  const compat =
    opt.compatibility_json && typeof opt.compatibility_json === "object"
      ? opt.compatibility_json
      : opt.compatibilityJson && typeof opt.compatibilityJson === "object"
        ? opt.compatibilityJson
        : {};
  const customerSafe =
    compat.customerSafe && typeof compat.customerSafe === "object" ? compat.customerSafe : {};
  const productId =
    resolved.materialId ||
    customerSafe.productId ||
    compat.productId ||
    null;
  const catalogAvailability = customerSafe.availability || compat.catalogAvailability || null;
  const sell = opt.sell_price ?? opt.sellPrice ?? null;
  const publicOpt = {
    id: opt.id,
    optionKey: opt.option_key || opt.optionKey,
    groupId: opt.group_id || opt.groupId,
    groupKey: group?.group_key || group?.groupKey || null,
    displayLabel: mat?.displayName || opt.display_label || opt.displayLabel,
    description:
      opt.description_customer ||
      opt.description ||
      customerSafe.description ||
      null,
    imageAssetRef:
      mat?.thumbnailUrl ||
      mat?.imageThumbPath ||
      opt.image_asset_ref ||
      opt.imageAssetRef ||
      customerSafe.imageUrl ||
      null,
    materialId: resolved.materialId || null,
    roomKey: resolved.roomKey || compat.roomKey || null,
    productId,
    availabilityState: availability,
    catalogAvailability,
    availabilityText: customerSafe.availabilityText || null,
    customerPriceTreatment: treatment,
    minQty: Number(opt.min_qty ?? opt.minQty ?? 0),
    maxQty: opt.max_qty ?? opt.maxQty ?? null,
    defaultQty: Number(opt.default_qty ?? opt.defaultQty ?? 0),
    includedInBaseline: Boolean(opt.included_in_baseline ?? opt.includedInBaseline),
    requiredSelection: Boolean(opt.required_selection ?? opt.requiredSelection),
    selectable:
      availability === "active" &&
      treatment !== "unavailable" &&
      treatment !== "review_required",
    accessoryKind: compat.accessoryKind || customerSafe.accessoryKind || null,
    compatibleFamilyIds: Array.isArray(compat.compatibleFamilyIds)
      ? compat.compatibleFamilyIds
      : Array.isArray(customerSafe.compatibleFamilyIds)
        ? customerSafe.compatibleFamilyIds
        : [],
    manufacturer: customerSafe.manufacturer || null,
    model: customerSafe.model || null,
    finish: customerSafe.finish || null,
    variants: Array.isArray(customerSafe.variants) ? customerSafe.variants : undefined,
    visibleSellPrice:
      treatment === "absolute" && sell != null ? Number(sell) : null,
    visibleDelta: treatment === "delta" && sell != null ? Number(sell) : null
  };
  publicOpt.priceEffectLabel = customerPriceEffectLabel({
    includedInBaseline: publicOpt.includedInBaseline,
    customerPriceTreatment: treatment,
    availabilityState: availability,
    visibleSellPrice: publicOpt.visibleSellPrice,
    visibleDelta: publicOpt.visibleDelta,
    reviewRequired: treatment === "review_required" || Boolean(compat.estimatorReviewRequired)
  });
  return publicOpt;
}

function buildCustomerSafeMaterials(graphOptions, enrichedById = null) {
  const materials = [];
  for (const opt of graphOptions || []) {
    const key = opt.option_key || opt.optionKey || "";
    if (!String(key).startsWith("material:")) continue;
    const resolved = resolveMaterialSelectionFromOption(opt);
    if (!resolved.materialId) continue;
    const mat =
      (enrichedById && enrichedById.get(resolved.materialId)) ||
      getElite100CustomerMaterial(resolved.materialId);
    if (!mat) continue;
    const availability = opt.availability_state || opt.availabilityState || "active";
    materials.push(
      toCustomerSafeMaterialRecord(mat, {
        roomKey: resolved.roomKey,
        optionKey: key,
        includedInBaseline: Boolean(opt.included_in_baseline ?? opt.includedInBaseline),
        isDefault: Number(opt.default_qty ?? opt.defaultQty ?? 0) > 0,
        selectable: availability === "active"
      })
    );
  }
  return materials;
}

/**
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   deRepository: any,
 *   configurationRepository: any,
 *   pricingPolicyRepository?: any
 * }} deps
 */
export function createPublicConfigurationService(deps) {
  const {
    deRepository,
    configurationRepository,
    pricingPolicyRepository = null,
    getSupabase = null
  } = deps;
  const env = deps.env ?? process.env;

  async function resolvePublicationFromRawToken(rawToken) {
    const token = String(rawToken ?? "").trim();
    if (!token || token.length < 20 || token.length > 256) {
      throw exchangeUnavailable("token_shape");
    }
    const tokenHash = hashDigitalEstimateToken(token);
    const tokenRow = await deRepository.findAnyTokenByHash(tokenHash);
    if (!tokenRow) throw exchangeUnavailable("token_lookup_miss");
    if (!constantTimeEqualHex(String(tokenRow.token_hash), tokenHash)) {
      throw exchangeUnavailable("token_hash_mismatch");
    }
    if (tokenRow.revoked_at) throw exchangeUnavailable("token_revoked");

    const publication = await deRepository.getPublication(
      tokenRow.organization_id,
      tokenRow.publication_id
    );
    if (!publication || publication.status !== "active" || publication.revoked_at) {
      throw exchangeUnavailable("publication_inactive");
    }
    try {
      assertSyntheticPublicationPublicAccess(publication.id, env);
    } catch (e) {
      if (e?.code === "not_found") throw exchangeUnavailable("allowlist_blocked");
      throw e;
    }
    const now = Date.now();
    const expiresAt = new Date(publication.access_expires_at).getTime();
    if (Number.isFinite(expiresAt) && now > expiresAt) {
      throw exchangeUnavailable("publication_expired");
    }

    const snap = await deRepository.getSnapshotByPublicationId(
      publication.organization_id,
      publication.id
    );
    if (!snap?.customer_snapshot_json) throw exchangeUnavailable("snapshot_missing");

    return { tokenRow, publication, snap };
  }

  async function ensurePolicyFixtures(organizationId) {
    if (pricingPolicyRepository?.seedConfirmedElite100Fixtures) {
      const dump = pricingPolicyRepository._dump?.() || {};
      const has = (dump.policyVersions || []).some((p) => p.organization_id === organizationId);
      if (!has) pricingPolicyRepository.seedConfirmedElite100Fixtures(organizationId);
    }
  }

  function publicLifecycleFromSession(session, { activeEnvelope, publication }) {
    if (!publication || publication.status !== "active") return "revoked";
    if (!session) return "revoked";
    if (session.status === "expired") return "expired";
    if (session.status === "revoked" || session.status === "blocked") return session.status;
    if (session.expires_at && new Date(session.expires_at).getTime() < Date.now()) return "expired";
    if (!activeEnvelope) return "blocked";
    if (session.envelope_id !== activeEnvelope.id) return "superseded";
    if (activeEnvelope.status !== "active") return "superseded";
    return "active";
  }

  function shouldIncludeBaselineOnNonActiveLifecycle(lifecycle, activeEnvelope, publication) {
    if (!publication || publication.status !== "active" || publication.revoked_at) return false;
    if (lifecycle === "expired") return true;
    // Publication-only sessions (no active envelope) still expose frozen read-only baseline.
    if (lifecycle === "blocked" && !activeEnvelope) return true;
    return false;
  }

  async function buildPublicState({ organizationId, publication, snap, session, activeEnvelope }) {
    await ensurePolicyFixtures(organizationId);
    if (typeof configurationRepository.seedPublication === "function") {
      configurationRepository.seedPublication(publication);
      configurationRepository.seedSnapshot(snap);
    }

    const baselineDto = buildPublicDigitalEstimateDto(snap.customer_snapshot_json, {
      accessExpiresAt: publication.access_expires_at
    });
    assertPublicDtoHasNoForbiddenContent(baselineDto);
    // v2 session/configuration responses expose the inner estimate object only.
    // buildPublicDigitalEstimateDto wraps { ok, estimate, access } for the v1 path.
    const baselineEstimate =
      baselineDto && typeof baselineDto === "object" && baselineDto.estimate
        ? baselineDto.estimate
        : null;
    if (!baselineEstimate || typeof baselineEstimate !== "object") {
      throw unavailable("Estimate unavailable");
    }

    const lifecycle = publicLifecycleFromSession(session, { activeEnvelope, publication });
    if (lifecycle !== "active") {
      const includeBaseline = shouldIncludeBaselineOnNonActiveLifecycle(
        lifecycle,
        activeEnvelope,
        publication
      );
      return {
        lifecycle,
        message:
          lifecycle === "superseded"
            ? "Your estimate options were updated"
            : lifecycle === "expired"
              ? (() => {
                  const d = String(publication.pricing_valid_through || "").slice(0, 10);
                  return d
                    ? `Pricing expired on ${d}. Contact your estimator for updated pricing.`
                    : "Pricing expired. Contact your estimator for updated pricing.";
                })()
              : lifecycle === "revoked"
                ? "This estimate link has been revoked."
                : includeBaseline
                  ? null
                  : "This estimate is unavailable.",
        estimate: includeBaseline ? baselineEstimate : null,
        configuration: null,
        readMode: includeBaseline ? "baseline" : null,
        session: session
          ? {
              id: session.id,
              status: lifecycle,
              rowVersion: session.row_version,
              expiresAt: session.expires_at
            }
          : null
      };
    }

    const ctx = await buildTrustedConfigurationContext({
      organizationId,
      publicationId: publication.id,
      deRepository,
      pricingPolicyRepository
    });
    if (!ctx.canConfigure) {
      return {
        lifecycle: "blocked",
        message: "Configuration unavailable",
        estimate: baselineEstimate,
        configuration: null,
        session: {
          id: session.id,
          status: "blocked",
          rowVersion: session.row_version,
          expiresAt: session.expires_at
        }
      };
    }

    const pricingThrough = publication.pricing_valid_through || ctx.pricingValidThrough;
    if (isPricingExpired(pricingThrough)) {
      const expiredOn = String(pricingThrough || "").slice(0, 10);
      return {
        lifecycle: "expired",
        message: expiredOn
          ? `Pricing expired on ${expiredOn}. Contact your estimator for updated pricing.`
          : "Pricing expired. Contact your estimator for updated pricing.",
        estimate: baselineEstimate,
        configuration: null,
        pricingValidThrough: expiredOn || null,
        session: {
          id: session.id,
          status: "expired",
          rowVersion: session.row_version,
          expiresAt: session.expires_at
        }
      };
    }

    const graph = await configurationRepository.getEnvelopeGraph(organizationId, activeEnvelope.id);
    const groups = (graph?.groups || []).map((g) => ({
      id: g.id,
      groupKey: g.group_key,
      displayLabel: g.display_label,
      description: g.description_customer,
      selectionMode: g.selection_mode,
      required: Boolean(g.required),
      mutuallyExclusive: Boolean(g.mutually_exclusive),
      sortOrder: g.sort_order
    }));
    const options = (graph?.options || [])
      .filter((o) => o.is_active_in_envelope !== false)
      .map((o) => {
        const g = (graph?.groups || []).find((x) => x.id === o.group_id);
        return toCustomerSafeOption(o, g);
      });
    let enrichedById = null;
    try {
      const seedMaterials = [];
      const seen = new Set();
      for (const opt of graph?.options || []) {
        const resolved = resolveMaterialSelectionFromOption(opt);
        if (!resolved.materialId || seen.has(resolved.materialId)) continue;
        const mat = getElite100CustomerMaterial(resolved.materialId);
        if (!mat) continue;
        seen.add(resolved.materialId);
        seedMaterials.push(mat);
      }
      if (seedMaterials.length) {
        const orgId =
          String(organizationId || publication?.organization_id || "").trim() ||
          resolvePublicVisualizerOrganizationId() ||
          String(env.SLABOS_ORGANIZATION_ID || "").trim() ||
          String(env.PUBLIC_VISUALIZER_ORGANIZATION_ID || "").trim() ||
          String(env.SLABCLOUD_ORGANIZATION_ID || "").trim() ||
          null;
        if (!orgId) {
          console.info(
            JSON.stringify({
              msg: "de_elite100_image_resolver",
              warning: "organization_id_missing",
              hint: "Set SLABOS_ORGANIZATION_ID (preferred) or PUBLIC_VISUALIZER_ORGANIZATION_ID / SLABCLOUD_ORGANIZATION_ID on Brain"
            })
          );
        }
        const enriched = await enrichElite100MaterialsWithCustomerImages(seedMaterials, {
          getSupabase: typeof getSupabase === "function" ? getSupabase : null,
          organizationId: orgId,
          env
        });
        enrichedById = new Map(enriched.map((m) => [m.materialId, m]));
      }
    } catch {
      enrichedById = null;
    }
    const materials = buildCustomerSafeMaterials(graph?.options || [], enrichedById);
    // Prefer Supabase thumbnail on material options (same URLs as kiosk/showroom).
    for (const opt of options) {
      if (!opt.materialId || !enrichedById) continue;
      const mat = enrichedById.get(opt.materialId);
      if (mat?.thumbnailUrl) opt.imageAssetRef = mat.thumbnailUrl;
    }
    assertPublicConfigurationHasNoForbiddenContent(materials);

    let latestSelection = null;
    let latestCalculation = null;
    if (typeof configurationRepository.getLatestSelectionForSession === "function") {
      latestSelection = await configurationRepository.getLatestSelectionForSession(
        organizationId,
        session.id
      );
    }
    // New session exchange must restore the latest successful draft for this
    // active publication + envelope (stable link), not only the empty new session.
    if (
      !latestSelection &&
      activeEnvelope?.id &&
      publication?.id &&
      typeof configurationRepository.getLatestSelectionForPublicationEnvelope === "function"
    ) {
      latestSelection = await configurationRepository.getLatestSelectionForPublicationEnvelope(
        organizationId,
        publication.id,
        activeEnvelope.id
      );
    }
    if (session.latest_calculation_id && configurationRepository.getCalculation) {
      latestCalculation = await configurationRepository.getCalculation(
        organizationId,
        session.latest_calculation_id
      );
    } else if (
      latestSelection &&
      typeof configurationRepository.getCalculationBySelectionId === "function"
    ) {
      latestCalculation = await configurationRepository.getCalculationBySelectionId(
        organizationId,
        latestSelection.id
      );
    }

    const customerCalc = latestCalculation?.customer_result_json || null;
    if (customerCalc) assertPublicConfigurationHasNoForbiddenContent(customerCalc);

    const selectionMeta = splitSelectionPayloadMeta(latestSelection?.selection_payload_json);
    const sourceProject = {
      customerName: baselineEstimate.project?.customerName || null,
      projectName: baselineEstimate.project?.projectName || null,
      projectAddress: baselineEstimate.project?.projectAddress || null,
      phone: null,
      email: null
    };

    const state = {
      lifecycle: "active",
      message: null,
      estimate: baselineEstimate,
      session: {
        id: session.id,
        status: "active",
        rowVersion: session.row_version,
        expiresAt: session.expires_at
      },
      configuration: {
        envelopeId: activeEnvelope.id,
        envelopeVersion: activeEnvelope.envelope_version,
        materialCatalogContract:
          activeEnvelope.material_catalog_contract || ELITE100_MATERIAL_CATALOG_CONTRACT,
        pricingValidThrough: publication.pricing_valid_through || ctx.pricingValidThrough,
        lockedScopeNotice:
          "Professional measurements and fabrication scope are locked. Your finish and option choices may update the estimate total.",
        sourceProject,
        customerInfoDraft: selectionMeta.customerInfoDraft,
        roomLabelDrafts: selectionMeta.roomLabelDrafts,
        roomNotes: selectionMeta.roomNotes || {},
        projectNote: selectionMeta.projectNote || null,
        customerProductDrafts: selectionMeta.customerProductDrafts || {},
        backsplashDrafts: selectionMeta.backsplashDrafts || {},
        rooms: (ctx.rooms || []).map((r) => ({
          roomKey: r.roomKey,
          displayName:
            selectionMeta.roomLabelDrafts[r.roomKey] || r.displayName,
          sourceDisplayName: r.displayName,
          baselineMaterialLabel: r.baselineMaterialLabel,
          baselineColorLabel: r.colorLabel || null,
          // Measurements verified — numeric SF never projected publicly.
          measurementsLocked: true,
          measurementStatus: "Measurements verified by estimator",
          countertopIncluded: Number(r.chargeableCounterSf) > 0,
          backsplashIncluded: Number(r.backsplashSf) > 0,
          backsplashHeightMode: r.backsplashHeightMode || null,
          customerMayEditLabel: true,
          locked: true
        })),
        groups,
        options,
        materials,
        currentSelections: selectionMeta.quantities,
        latestCalculation: customerCalc,
        missingInformationRequirements: Array.isArray(
          customerCalc?.missingInformationRequirements
        )
          ? customerCalc.missingInformationRequirements
          : [],
        baselineDisplayTotal: ctx.baselineDisplayTotal
      }
    };
    assertPublicDtoHasNoForbiddenContent(state.estimate);
    return state;
  }

  return {
    /**
     * Exchange publication Bearer token → session cookie secret (returned to caller for Set-Cookie).
     */
    async exchangePublicationToken({ rawToken, body = null, now = () => new Date() }) {
      if (!isDigitalEstimatePublicConfigurationRuntimeEnabled(env)) {
        throw unavailable();
      }
      rejectSyntheticCallerAuthority(body);
      const { tokenRow, publication, snap } = await resolvePublicationFromRawToken(rawToken);
      const organizationId = publication.organization_id;

      if (typeof configurationRepository.seedPublication === "function") {
        configurationRepository.seedPublication(publication);
        configurationRepository.seedSnapshot(snap);
      }

      const activeEnvelope = await configurationRepository.getActiveEnvelope(
        organizationId,
        publication.id
      );
      // Session can be created even without envelope — UI falls back to read-only baseline
      const { rawSecret, secretHash } = generateConfigurationSessionSecret();
      const ttlHours = readDigitalEstimateSessionTtlHours(env);
      const expiresAt = new Date(now().getTime() + ttlHours * 3600 * 1000).toISOString();

      let session;
      if (activeEnvelope) {
        session = await configurationRepository.createPublicConfigurationSession({
          organizationId,
          publicationId: publication.id,
          envelopeId: activeEnvelope.id,
          accessTokenId: tokenRow.id,
          sessionSecretHash: secretHash,
          expiresAt,
          status: "active"
        });
      } else {
        // No envelope: still issue a short-lived session bound to publication for resume of baseline-only mode
        session = await configurationRepository.createPublicConfigurationSession({
          organizationId,
          publicationId: publication.id,
          envelopeId: null,
          accessTokenId: tokenRow.id,
          sessionSecretHash: secretHash,
          expiresAt,
          status: "active",
          allowMissingEnvelope: true
        });
      }

      if (!session?.id) {
        throw exchangeUnavailable("session_persist_failed");
      }

      // Same-process verify: create hash must resolve before Set-Cookie (catches write/hash drift).
      const verified = await configurationRepository.getSessionBySecretHash(secretHash);
      if (!verified || String(verified.id) !== String(session.id)) {
        throw exchangeUnavailable("session_persist_verify_failed");
      }
      if (!constantTimeEqualSessionHash(verified.session_secret_hash, secretHash)) {
        throw exchangeUnavailable("session_hash_mismatch");
      }

      const state = await buildPublicState({
        organizationId,
        publication,
        snap,
        session: verified,
        activeEnvelope
      });

      return {
        rawSecret,
        state,
        publicOrigin: readDigitalEstimatePublicConfigurationOrigin(env),
        // Safe ops-only prefix for correlated logs (never the raw secret).
        sessionHashPrefix: secretHash.slice(0, 8)
      };
    },

    async resumeFromSessionSecret({ rawSecret }) {
      if (!isDigitalEstimatePublicConfigurationRuntimeEnabled(env)) {
        throw unavailable();
      }
      const secret = String(rawSecret ?? "").trim();
      if (!secret) throw unavailable();
      const secretHash = hashConfigurationSessionSecret(secret);
      const session = await configurationRepository.getSessionBySecretHash(secretHash);
      if (!session) throw unavailable();
      if (!constantTimeEqualSessionHash(session.session_secret_hash, secretHash)) {
        throw unavailable();
      }
      if (["revoked", "blocked"].includes(session.status)) throw unavailable();
      if (session.expires_at && new Date(session.expires_at).getTime() < Date.now()) {
        throw configUnavailable("Pricing has expired");
      }

      const publication = await deRepository.getPublication(
        session.organization_id,
        session.publication_id
      );
      if (!publication || publication.status !== "active") throw unavailable();
      assertSyntheticPublicationPublicAccess(publication.id, env);
      const snap = await deRepository.getSnapshotByPublicationId(
        session.organization_id,
        session.publication_id
      );
      if (!snap) throw unavailable();

      const activeEnvelope = await configurationRepository.getActiveEnvelope(
        session.organization_id,
        session.publication_id
      );

      // Envelope-bound sessions must match the current active envelope. Superseded /
      // revoked sessions fail closed with a generic 404 (no lifecycle leak).
      if (session.envelope_id) {
        if (!activeEnvelope || session.envelope_id !== activeEnvelope.id) {
          throw unavailable();
        }
        if (activeEnvelope.status !== "active") throw unavailable();
      }

      if (typeof configurationRepository.appendEvent === "function") {
        await configurationRepository.appendEvent({
          organization_id: session.organization_id,
          envelope_id: session.envelope_id,
          publication_id: session.publication_id,
          session_id: session.id,
          event_type: "configuration_session_resumed",
          actor_type: "public",
          metadata: {}
        });
      }

      return buildPublicState({
        organizationId: session.organization_id,
        publication,
        snap,
        session,
        activeEnvelope
      });
    },

    async getConfiguration({ rawSecret }) {
      return this.resumeFromSessionSecret({ rawSecret });
    },

    /**
     * Validate selections, run DE.2C, persist atomically, return customer-safe calculation only.
     */
    async saveSelections({ rawSecret, body }) {
      if (!isDigitalEstimatePublicConfigurationRuntimeEnabled(env)) {
        throw unavailable();
      }
      rejectSyntheticCallerAuthority(body);
      rejectPublicSelectionAuthority(body || {});
      const expectedRowVersion = body?.expectedRowVersion ?? body?.expected_row_version;
      const idempotencyKey = String(body?.idempotencyKey || body?.idempotency_key || "").trim();
      if (!idempotencyKey) {
        throw safeFail("idempotency_required", "Please refresh and try again", 400);
      }
      if (expectedRowVersion == null) {
        throw safeFail("concurrency_required", "Please refresh and try again", 400);
      }

      const secretHash = hashConfigurationSessionSecret(rawSecret);
      const session = await configurationRepository.getSessionBySecretHash(secretHash);
      if (!session) {
        throw sessionRecoverable("session_not_found", "Please refresh and try again", "session_not_found");
      }
      if (!constantTimeEqualSessionHash(session.session_secret_hash, secretHash)) {
        throw sessionRecoverable("session_invalid", "Please refresh and try again", "session_hash_mismatch");
      }
      if (session.status === "revoked" || session.status === "blocked" || session.status === "superseded") {
        throw sessionRecoverable("session_invalid", "Please refresh and try again", `session_status_${session.status}`);
      }
      if (session.status !== "active" && session.status !== "configuring" && session.status !== "saved") {
        throw sessionRecoverable("session_invalid", "Please refresh and try again", `session_status_${session.status}`);
      }
      if (session.expires_at && new Date(session.expires_at).getTime() < Date.now()) {
        throw sessionRecoverable("session_invalid", "Please refresh and try again", "session_expired");
      }
      if (Number(session.row_version) !== Number(expectedRowVersion)) {
        throw safeFail("row_version_conflict", "Please refresh and try again", 409, {
          diagnosticCode: "DE-CONFIGURATION-STALE",
          recoverable: true
        });
      }

      const publication = await deRepository.getPublication(
        session.organization_id,
        session.publication_id
      );
      if (!publication) {
        throw publicationLifecycle("publication_unavailable");
      }
      if (publication.status === "revoked") {
        throw publicationLifecycle("publication_revoked");
      }
      if (publication.status === "superseded") {
        throw publicationLifecycle("publication_superseded");
      }
      if (publication.status !== "active") {
        throw publicationLifecycle("publication_unavailable");
      }
      try {
        assertSyntheticPublicationPublicAccess(publication.id, env);
      } catch (e) {
        throw publicationLifecycle("publication_unavailable");
      }
      if (isPricingExpired(publication.pricing_valid_through)) {
        throw publicationLifecycle("publication_expired", "Pricing has expired", 410);
      }

      const activeEnvelope = await configurationRepository.getActiveEnvelope(
        session.organization_id,
        session.publication_id
      );
      if (!activeEnvelope) {
        throw sessionRecoverable("session_invalid", "Please refresh and try again", "envelope_missing");
      }
      if (!session.envelope_id || String(session.envelope_id) !== String(activeEnvelope.id)) {
        throw safeFail("stale_configuration", "Please refresh and try again", 409, {
          diagnosticCode: "DE-CONFIGURATION-STALE",
          recoverable: true,
          exchangeReason: "envelope_mismatch"
        });
      }
      if (activeEnvelope.status !== "active") {
        throw safeFail("stale_configuration", "Please refresh and try again", 409, {
          diagnosticCode: "DE-CONFIGURATION-STALE",
          recoverable: true,
          exchangeReason: "envelope_inactive"
        });
      }

      await ensurePolicyFixtures(session.organization_id);
      const snap = await deRepository.getSnapshotByPublicationId(
        session.organization_id,
        session.publication_id
      );
      if (typeof configurationRepository.seedPublication === "function") {
        configurationRepository.seedPublication(publication);
        configurationRepository.seedSnapshot(snap);
      }

      const ctx = await buildTrustedConfigurationContext({
        organizationId: session.organization_id,
        publicationId: publication.id,
        deRepository,
        pricingPolicyRepository
      });
      if (!ctx.canConfigure) throw configUnavailable();
      if (ctx.baselineDisplayTotal == null || !Number.isFinite(Number(ctx.baselineDisplayTotal))) {
        throw safeFail(
          "unresolved_baseline_total",
          "Configuration unavailable",
          422
        );
      }
      if ((ctx.blockers || []).some((b) => b.code === "unknown_baseline_group" || b.code === "missing_locked_measurement")) {
        throw safeFail(
          "unresolved_baseline_material",
          "Configuration unavailable",
          422
        );
      }

      const graph = await configurationRepository.getEnvelopeGraph(
        session.organization_id,
        activeEnvelope.id
      );
      const options = graph?.options || [];

      // Normalize: accept items[{optionId|optionKey, quantity}] or selections map
      let selectionMap = {};
      if (Array.isArray(body.items)) {
        for (const item of body.items) {
          rejectPublicSelectionAuthority(item);
          const id = item.optionId || item.option_id;
          const key = item.optionKey || item.option_key;
          const opt = findEnvelopeOptionForSelectionKey(options, key, id);
          if (!opt) {
            throw safeFail("option_not_allowed", "That selection is unavailable", 422, {
              selectionKey: String(key || id || "").slice(0, 160) || null,
              diagnosticCode: "DE-OPTION-NOT-ALLOWED"
            });
          }
          const avail = opt.availability_state || opt.availabilityState || "active";
          if (avail !== "active") {
            throw safeFail("unresolved_product", "That selection is unavailable", 422);
          }
          selectionMap[opt.option_key || opt.optionKey] = Number(item.quantity ?? item.qty ?? 0);
        }
      } else {
        const rawMap =
          body.selections && typeof body.selections === "object" ? body.selections : {};
        const split = splitSelectionPayloadMeta(rawMap);
        selectionMap = {};
        for (const [k, qty] of Object.entries(split.quantities || {})) {
          const remapped = k.startsWith("edge:") ? remapLegacyEdgeOptionKey(k) : k;
          const opt = findEnvelopeOptionForSelectionKey(options, remapped, null);
          if (!opt) {
            if (Number(qty) <= 0) continue;
            throw safeFail("option_not_allowed", "That selection is unavailable", 422, {
              selectionKey: String(remapped).slice(0, 160),
              diagnosticCode: "DE-OPTION-NOT-ALLOWED"
            });
          }
          selectionMap[opt.option_key || opt.optionKey] = Number(qty) || 0;
        }
      }

      const customerInfoDraft =
        sanitizeCustomerInfoDraft(body.customerInfoDraft) ||
        sanitizeCustomerInfoDraft(body.customer_info_draft);
      const roomLabelDrafts = sanitizeRoomLabelDrafts(
        body.roomLabelDrafts || body.room_label_drafts || {}
      );
      const roomNotes = sanitizeRoomNotesDraft(body.roomNotes || body.room_notes || {});
      const projectNote = sanitizeProjectNoteDraft(body.projectNote ?? body.project_note ?? "");
      const customerProductDrafts = sanitizeCustomerProductDrafts(
        body.customerProductDrafts || body.customer_product_drafts || {}
      );
      const backsplashDrafts = sanitizeBacksplashDrafts(
        body.backsplashDrafts || body.backsplash_drafts || {}
      );
      const sideSplashDrafts = sanitizeSideSplashDrafts(
        body.sideSplashDrafts || body.side_splash_drafts || {}
      );

      // Preserve prior drafts when caller omits them (material-only saves).
      let priorMeta = {
        customerInfoDraft: null,
        roomLabelDrafts: {},
        roomNotes: {},
        projectNote: null,
        customerProductDrafts: {},
        backsplashDrafts: {},
        sideSplashDrafts: {}
      };
      if (typeof configurationRepository.getLatestSelectionForSession === "function") {
        const prior = await configurationRepository.getLatestSelectionForSession(
          session.organization_id,
          session.id
        );
        priorMeta = splitSelectionPayloadMeta(prior?.selection_payload_json);
      }
      const mergedInfo =
        body.customerInfoDraft != null || body.customer_info_draft != null
          ? customerInfoDraft
          : priorMeta.customerInfoDraft;
      const mergedLabels =
        body.roomLabelDrafts != null || body.room_label_drafts != null
          ? roomLabelDrafts
          : priorMeta.roomLabelDrafts;
      const mergedRoomNotes =
        body.roomNotes != null || body.room_notes != null
          ? roomNotes
          : priorMeta.roomNotes || {};
      const mergedProjectNote =
        body.projectNote != null || body.project_note != null
          ? projectNote || null
          : priorMeta.projectNote;
      const mergedProductDrafts =
        body.customerProductDrafts != null || body.customer_product_drafts != null
          ? customerProductDrafts
          : priorMeta.customerProductDrafts || {};
      const mergedBacksplashDrafts =
        body.backsplashDrafts != null || body.backsplash_drafts != null
          ? backsplashDrafts
          : priorMeta.backsplashDrafts || {};
      const mergedSideSplashDrafts =
        body.sideSplashDrafts != null || body.side_splash_drafts != null
          ? sideSplashDrafts
          : priorMeta.sideSplashDrafts || {};

      const normalized = normalizeSelectionPayload({ selections: selectionMap }, options);

      // Required groups / unresolved defaults
      for (const opt of options) {
        const key = opt.option_key || opt.optionKey;
        const qty = Number(normalized.selections[key] || 0);
        const avail = opt.availability_state || opt.availabilityState || "active";
        if ((avail === "unavailable" || avail === "review_required") && qty > 0) {
          throw safeFail("unresolved_product", "That selection is unavailable", 422);
        }
      }

      /** @type {string[]} */
      const reviewFlags = [];

      // Build DE.2C rooms from material: selections + baseline (server resolves color → group)
      const rooms = (ctx.rooms || []).map((r) => {
        let selected = r.baselineMaterialGroup;
        let chargeableBacksplashSf = Number(r.backsplashSf) || 0;
        let edgeMode = "edge_eased";
        const roomType = inferRoomEligibilityType(r);
        for (const [key, qty] of Object.entries(normalized.selections)) {
          if (Number(qty) <= 0) continue;
          if (key.startsWith(`material:${r.roomKey}:`)) {
            const opt = options.find((o) => (o.option_key || o.optionKey) === key);
            const resolved = resolveMaterialSelectionFromOption(opt || { optionKey: key });
            if (!resolved.materialGroup) {
              throw safeFail("unknown_material", "That selection is unavailable", 400);
            }
            if (!opt) {
              throw safeFail("invalid_selection", "That selection is unavailable", 422, {
                selectionKey: String(key).slice(0, 160),
                diagnosticCode: "DE-SAVE"
              });
            }
            selected = resolved.materialGroup;
          } else if (key.startsWith(`backsplash:${r.roomKey}:`)) {
            const mode = key.split(":")[2];
            if (mode === "none") chargeableBacksplashSf = 0;
            else if (mode === "standard_4in" || mode === "full_height") {
              chargeableBacksplashSf = Number(r.backsplashSf) || 0;
              if (mode === "full_height") {
                reviewFlags.push(`full_height_backsplash:${r.roomKey}`);
              }
            } else if (mode === "custom_height") {
              // Do not invent chargeable SF for custom height — review required.
              chargeableBacksplashSf = 0;
              reviewFlags.push(`custom_height_backsplash:${r.roomKey}`);
            }
          } else if (key.startsWith(`edge:${r.roomKey}:`)) {
            edgeMode = normalizeEdgeProfileToken(key.split(":").slice(2).join(":"));
          } else {
            const opt = options.find((o) => (o.option_key || o.optionKey) === key);
            const compat = opt?.compatibility_json || opt?.compatibilityJson || {};
            if (compat.roomKey === r.roomKey && compat.materialGroup) {
              selected = compat.materialGroup;
            }
          }
        }
        return {
          roomKey: r.roomKey,
          displayName: r.displayName,
          chargeableCounterSf: r.chargeableCounterSf,
          chargeableBacksplashSf,
          edgeLinearFeet: Number(r.edgeLinearFeet) || 0,
          edgeMode,
          selectedMaterialGroup: selected,
          baselineMaterialGroup: r.baselineMaterialGroup,
          roomType,
          pieces: Array.isArray(r.pieces) ? r.pieces : []
        };
      });

      const edgeLfTotal = rooms.reduce((s, r) => s + (Number(r.edgeLinearFeet) || 0), 0);
      const pricingBasis = ctx.pricingBasis || "direct";
      const rateTable =
        (ctx.frozenBaseRates && ctx.frozenBaseRates[pricingBasis]) ||
        ctx.frozenBaseRates?.direct ||
        {};

      const catalog = new Map(serverApprovedOptionCatalog().map((o) => [o.optionKey, o]));
      const calcOptions = [];
      for (const [key, qtyRaw] of Object.entries(normalized.selections)) {
        if (key.startsWith("material:")) continue;
        if (key.startsWith("backsplash:")) continue; // handled via chargeableBacksplashSf
        const qty = Number(qtyRaw) || 0;
        if (qty <= 0) continue;

        const parsed = parseProductOptionKey(key);

        // Sink modes → product sellPrice + cutout (server catalog); browser prices ignored
        if (parsed?.kind === "sink") {
          const roomKey = parsed.roomKey;
          const roomRow = rooms.find((r) => r.roomKey === roomKey);
          const roomType = roomRow?.roomType || "kitchen";
          const draft = mergedProductDrafts[roomKey]?.sink || null;

          if (parsed.mode === "none") continue;

          if (parsed.mode === "customer_provided" || parsed.mode === "customer") {
            const cutoutKey = cutoutKeyForSinkSelection(roomType, null);
            const sinkCutout = catalog.get(cutoutKey);
            if (sinkCutout?.sellPrice != null) {
              calcOptions.push({
                optionKey: `${cutoutKey}:${roomKey}`,
                displayLabel: sinkCutout.displayLabel,
                quantity: 1,
                sellPrice: sinkCutout.sellPrice,
                pricingMode: "per_each",
                customerPriceTreatment: "absolute",
                availabilityState: "active",
                includedInBaseline: false,
                defaultQty: 0,
                baselineQuantity: 0
              });
            }
            continue;
          }

          if (parsed.mode === "stock") {
            // Legacy Elite stock sink
            const sinkCutout = catalog.get("qty-sink");
            if (sinkCutout?.sellPrice != null) {
              calcOptions.push({
                optionKey: `qty-sink:${roomKey}`,
                displayLabel: sinkCutout.displayLabel,
                quantity: 1,
                sellPrice: sinkCutout.sellPrice,
                pricingMode: "per_each",
                customerPriceTreatment: "absolute",
                availabilityState: "active",
                includedInBaseline: false,
                defaultQty: 0,
                baselineQuantity: 0
              });
            }
            const stock = catalog.get("qty-ss");
            if (stock?.sellPrice != null) {
              calcOptions.push({
                optionKey: `qty-ss:${roomKey}`,
                displayLabel: stock.displayLabel,
                quantity: 1,
                sellPrice: stock.sellPrice,
                pricingMode: "per_each",
                customerPriceTreatment: "absolute",
                availabilityState: "active",
                includedInBaseline: false,
                defaultQty: 0,
                baselineQuantity: 0
              });
            }
            continue;
          }

          if (parsed.mode === "esf" && parsed.productId) {
            let resolved;
            try {
              resolved = resolveCatalogProductSelection(parsed.productId, draft);
            } catch (e) {
              if (e?.code === "invalid_blanco_variant") {
                throw safeFail("invalid_selection", "That sink finish is unavailable", 422, {
                  selectionKey: String(key).slice(0, 160),
                  diagnosticCode: "DE-SAVE"
                });
              }
              throw e;
            }
            if (!resolved?.product) {
              throw safeFail("invalid_selection", "That selection is unavailable", 422, {
                selectionKey: String(key).slice(0, 160),
                diagnosticCode: "DE-SAVE"
              });
            }
            const roomsOk = Array.isArray(resolved.product.roomEligibility)
              ? resolved.product.roomEligibility
              : [];
            if (roomsOk.length && !roomsOk.includes(roomType)) {
              throw safeFail("invalid_selection", "That sink is not available for this room", 422, {
                selectionKey: String(key).slice(0, 160),
                diagnosticCode: "DE-SAVE"
              });
            }
            if (resolved.sellPrice != null) {
              calcOptions.push({
                optionKey: key,
                displayLabel: resolved.product.displayName,
                quantity: 1,
                sellPrice: resolved.sellPrice,
                pricingMode: "per_each",
                customerPriceTreatment: "absolute",
                availabilityState: "active",
                includedInBaseline: false,
                defaultQty: 0,
                baselineQuantity: 0
              });
            }
            const cutoutKey = cutoutKeyForSinkSelection(roomType, resolved.product);
            const sinkCutout = cutoutKey ? catalog.get(cutoutKey) : null;
            if (sinkCutout?.sellPrice != null && resolved.product.requiresCutout) {
              calcOptions.push({
                optionKey: `${cutoutKey}:${roomKey}`,
                displayLabel: sinkCutout.displayLabel,
                quantity: 1,
                sellPrice: sinkCutout.sellPrice,
                pricingMode: "per_each",
                customerPriceTreatment: "absolute",
                availabilityState: "active",
                includedInBaseline: false,
                defaultQty: 0,
                baselineQuantity: 0
              });
            }
            continue;
          }
          continue;
        }

        // Faucet — sellPrice only (no auto drilling / hole cutouts)
        if (parsed?.kind === "faucet") {
          if (parsed.mode === "none" || parsed.mode === "customer_provided") continue;
          if (parsed.mode === "esf" && parsed.productId) {
            const roomKey = parsed.roomKey;
            const roomRow = rooms.find((r) => r.roomKey === roomKey);
            const roomType = roomRow?.roomType || "kitchen";
            const draft = mergedProductDrafts[roomKey]?.faucet || null;
            let resolved;
            try {
              resolved = resolveCatalogProductSelection(parsed.productId, draft);
            } catch (e) {
              if (e?.code === "invalid_blanco_variant") {
                throw safeFail("invalid_selection", "That faucet finish is unavailable", 422);
              }
              throw e;
            }
            if (!resolved?.product) {
              throw safeFail("invalid_selection", "That selection is unavailable", 422);
            }
            const roomsOk = Array.isArray(resolved.product.roomEligibility)
              ? resolved.product.roomEligibility
              : [];
            if (roomsOk.length && !roomsOk.includes(roomType)) {
              throw safeFail("invalid_selection", "That faucet is not available for this room", 422);
            }
            if (resolved.sellPrice != null) {
              calcOptions.push({
                optionKey: key,
                displayLabel: resolved.product.displayName,
                quantity: qty,
                sellPrice: resolved.sellPrice,
                pricingMode: "per_each",
                customerPriceTreatment: "absolute",
                availabilityState: "active",
                includedInBaseline: false,
                defaultQty: 0,
                baselineQuantity: 0
              });
            }
          }
          continue;
        }

        // Accessories — bounded qty, sellPrice only
        if (parsed?.kind === "accessory" && parsed.mode === "esf" && parsed.productId) {
          const resolved = resolveCatalogProductSelection(parsed.productId);
          if (!resolved?.product) {
            throw safeFail("invalid_selection", "That selection is unavailable", 422);
          }
          const envOpt = options.find((o) => (o.option_key || o.optionKey) === key);
          const maxQty = Number(envOpt?.max_qty ?? envOpt?.maxQty ?? 5) || 5;
          if (qty > maxQty) {
            throw safeFail("invalid_selection", "That accessory quantity is unavailable", 422);
          }
          calcOptions.push({
            optionKey: key,
            displayLabel: resolved.product.displayName,
            quantity: qty,
            sellPrice: resolved.sellPrice ?? 0,
            pricingMode: "per_each",
            customerPriceTreatment: "absolute",
            availabilityState: "active",
            includedInBaseline: false,
            defaultQty: 0,
            baselineQuantity: 0,
            maxQty
          });
          continue;
        }

        // Specialty — priced → installed price; review_only → $0 + flag
        if (parsed?.kind === "specialty" && parsed.mode === "esf" && parsed.productId) {
          const resolved = resolveCatalogProductSelection(parsed.productId);
          if (!resolved?.product) {
            throw safeFail("invalid_selection", "That selection is unavailable", 422);
          }
          if (resolved.product.pricingTreatment === "review_only") {
            reviewFlags.push(`specialty_review:${parsed.roomKey}:${parsed.productId}`);
            calcOptions.push({
              optionKey: key,
              displayLabel: resolved.product.displayName,
              quantity: qty,
              sellPrice: 0,
              pricingMode: "per_each",
              customerPriceTreatment: "included",
              availabilityState: "active",
              includedInBaseline: false,
              defaultQty: 0,
              baselineQuantity: 0
            });
          } else {
            const price =
              resolved.product.installedPrice != null
                ? Number(resolved.product.installedPrice)
                : resolved.sellPrice ?? 0;
            calcOptions.push({
              optionKey: key,
              displayLabel: resolved.product.displayName,
              quantity: qty,
              sellPrice: price,
              pricingMode: "per_each",
              customerPriceTreatment: "absolute",
              availabilityState: "active",
              includedInBaseline: false,
              defaultQty: 0,
              baselineQuantity: 0
            });
          }
          continue;
        }

        // Side splash — independent ceiling per piece from trusted depth; else review-only
        if (parsed?.kind === "sidesplash") {
          const mode = parsed.sideMode || parsed.mode;
          const splashQty = sideSplashQtyFromMode(mode);
          if (splashQty <= 0) continue;
          const roomRow = rooms.find((r) => r.roomKey === parsed.roomKey);
          const piece = (roomRow?.pieces || []).find(
            (p) => String(p.id || p.key) === String(parsed.pieceKey)
          );
          const depth = Number(piece?.depthIn ?? piece?.depth);
          const billableSf = sideSplashBillableSf(depth);
          if (billableSf == null || billableSf <= 0) {
            reviewFlags.push(
              `sidesplash_review:${parsed.roomKey}:${parsed.pieceKey}`
            );
            continue;
          }
          const rate = Number(rateTable[roomRow?.selectedMaterialGroup] || 0);
          if (rate > 0) {
            calcOptions.push({
              optionKey: key,
              displayLabel: "Side splash",
              quantity: 1,
              sellPrice: Math.round(billableSf * splashQty * rate * 100) / 100,
              pricingMode: "fixed",
              customerPriceTreatment: "absolute",
              availabilityState: "active",
              includedInBaseline: false,
              defaultQty: 0,
              baselineQuantity: 0
            });
          } else {
            reviewFlags.push(
              `sidesplash_review:${parsed.roomKey}:${parsed.pieceKey}`
            );
          }
          continue;
        }

        if (key.startsWith("edge:")) {
          const parts = key.split(":");
          const roomKey = parts[1];
          const token = normalizeEdgeProfileToken(parts.slice(2).join(":"));
          if (!isPremiumEdgeProfile(token)) continue;
          const roomRow = rooms.find((r) => r.roomKey === roomKey);
          const lf = Number(roomRow?.edgeLinearFeet) || Number(edgeLfTotal) || 0;
          if (!(lf > 0)) {
            reviewFlags.push(`edge_length_review:${roomKey}:${token}`);
            continue;
          }
          const rate = resolvePremiumEdgeRatePerLf(pricingBasis);
          calcOptions.push({
            optionKey: key,
            displayLabel: edgeProfileDisplayLabel(token),
            quantity: lf,
            sellPrice: rate,
            pricingMode: "per_each",
            customerPriceTreatment: "absolute",
            availabilityState: "active",
            includedInBaseline: false,
            defaultQty: 0,
            baselineQuantity: 0
          });
          continue;
        }

        if (isRoomProductOptionKey(key)) {
          // Unrecognized room-product mode — ignore rather than invent pricing
          continue;
        }

        const cat = catalog.get(key);
        const envOpt = options.find((o) => (o.option_key || o.optionKey) === key);
        if (!cat && !envOpt) {
          throw safeFail("invalid_selection", "That selection is unavailable", 422, {
            selectionKey: String(key).slice(0, 160),
            diagnosticCode: "DE-SAVE"
          });
        }
        if (cat && cat.availabilityState !== "active") {
          throw safeFail("unresolved_product", "That selection is unavailable", 422);
        }
        const sellPrice =
          cat?.sellPrice != null
            ? cat.sellPrice
            : envOpt?.sell_price ?? envOpt?.sellPrice;
        if (sellPrice == null) {
          throw safeFail("unresolved_product", "That selection is unavailable", 422);
        }
        calcOptions.push({
          optionKey: key,
          displayLabel: cat?.displayLabel || envOpt?.display_label || key,
          quantity: qty,
          sellPrice,
          pricingMode: cat?.pricingMode || envOpt?.pricing_mode || "fixed",
          customerPriceTreatment:
            cat?.customerPriceTreatment || envOpt?.customer_price_treatment || "absolute",
          minQty: cat?.minQty ?? envOpt?.min_qty ?? 0,
          maxQty: cat?.maxQty ?? envOpt?.max_qty ?? null,
          availabilityState: "active",
          includedInBaseline: Boolean(
            envOpt?.included_in_baseline ?? envOpt?.includedInBaseline
          ),
          defaultQty: Number(envOpt?.default_qty ?? envOpt?.defaultQty ?? 0),
          baselineQuantity: Number(envOpt?.default_qty ?? envOpt?.defaultQty ?? 0)
        });
      }

      // Authorized markup from envelope override records only (never from client)
      let markupBps = 0;
      if (pricingPolicyRepository?._dump) {
        const overrides = (pricingPolicyRepository._dump().estimatorOverrides || []).filter(
          (o) =>
            o.organization_id === session.organization_id &&
            o.envelope_id === activeEnvelope.id &&
            o.target_key === "material_markup_bps"
        );
        if (overrides.length) {
          markupBps = Number(overrides[overrides.length - 1].override_value) || 0;
        }
      }

      let result;
      try {
        result = calculateElite100ConfigDelta({
        organizationId: session.organization_id,
        publication: {
          id: publication.id,
          snapshotId: snap.id,
          status: "active",
          quoteFamilyRootId: publication.quote_family_root_id
        },
        envelope: {
          id: activeEnvelope.id,
          version: activeEnvelope.envelope_version,
          status: "active",
          publicationId: publication.id
        },
        pricingPolicyFingerprint: ctx.pricingPolicyFingerprint,
        catalogFingerprint: ctx.catalogFingerprint,
        engineVersion: ELITE100_CONFIG_DELTA_ENGINE_ID,
        pricingBasis: ctx.pricingBasis || "direct",
        partnerAccountId: ctx.partnerAccountId,
        accountMemberships: ctx.accountMemberships,
        materialRateOverrides: ctx.materialRateOverrides,
        estimateAdjustments: ctx.estimateAdjustments,
        rooms,
        lockedScope: { edgeLinearFeetTotal: edgeLfTotal },
        frozenBaseRates: ctx.frozenBaseRates,
        authorizedMaterialMarkup: { bps: markupBps },
        materialTaxPolicy: { bps: 200 },
        options: calcOptions,
        // Distinct per customer selection payload (color IDs), not only material group.
        selectionFingerprint: normalized.selectionHash,
        baseline: {
          exactTotal: ctx.baselineDisplayTotal,
          displayTotal: ctx.baselineDisplayTotal,
          rooms: (ctx.rooms || []).map((r) => ({
            roomKey: r.roomKey,
            materialGroup: r.baselineMaterialGroup
          }))
        },
        pricingValidThrough: ctx.pricingValidThrough,
        materialProgram: "elite_100",
        actor: { type: "public" }
      });
      } catch (e) {
        if (e?.statusCode) throw e;
        throw mapPersistenceError(e);
      }

      assertPublicConfigurationHasNoForbiddenContent(result.public);

      const selectionPayloadForMeta = mergeSelectionPayloadMeta(normalized.selections, {
        customerInfoDraft: mergedInfo,
        roomLabelDrafts: mergedLabels,
        roomNotes: mergedRoomNotes,
        projectNote: mergedProjectNote,
        customerProductDrafts: mergedProductDrafts,
        backsplashDrafts: mergedBacksplashDrafts,
        sideSplashDrafts: mergedSideSplashDrafts
      });

      const missingInformationRequirements = buildMissingInformationRequirements(
        selectionPayloadForMeta
      ).map((r) => ({
        code: r.code,
        roomKey: r.roomKey || null,
        customerCopy: r.customerCopy,
        severity: r.severity,
        blocksSave: false
      }));

      const customerConfigurationSummary = buildCustomerConfigurationSummary({
        selectionPayload: selectionPayloadForMeta,
        missingInformationRequirements,
        baselineDisplayTotal: result.public?.baselineDisplayTotal ?? null,
        configuredDisplayTotal: result.public?.configuredDisplayTotal ?? null,
        displayDelta: result.public?.displayTotalDelta ?? result.public?.displayDelta ?? null,
        rooms: (ctx.rooms || []).map((r) => ({
          roomKey: r.roomKey,
          displayName: r.displayName
        }))
      });

      const firstRoomSummary = (customerConfigurationSummary?.rooms || [])[0] || null;
      const quoteLibraryProjection = buildQuoteLibraryCustomerConfigProjection({
        configuredTotal: result.totals?.configuredDisplayTotal ?? result.public?.configuredDisplayTotal,
        baselineTotal: result.totals?.baselineDisplayTotal ?? result.public?.baselineDisplayTotal,
        deltaFromPublished:
          result.totals?.displayDelta ?? result.public?.displayTotalDelta ?? null,
        selectionQuantities: normalized.selections,
        roomMaterialGroups: Object.fromEntries(
          rooms.map((r) => [r.roomKey, r.selectedMaterialGroup])
        ),
        selectedMaterialGroup: rooms[0]?.selectedMaterialGroup || null,
        selectedMaterialSummary:
          firstRoomSummary?.material?.displayName ||
          firstRoomSummary?.material?.groupLabel ||
          rooms[0]?.selectedMaterialLabel ||
          rooms[0]?.selectedMaterialGroup ||
          null,
        selectedSinkSummary:
          firstRoomSummary?.sink?.displayName ||
          (firstRoomSummary?.sink?.source === "customer_provided"
            ? "Customer-provided sink"
            : firstRoomSummary?.sink?.source === "none"
              ? "No sink"
              : null),
        selectedFaucetSummary:
          firstRoomSummary?.faucet?.displayName ||
          (firstRoomSummary?.faucet?.source === "customer_provided"
            ? "Customer-provided faucet"
            : firstRoomSummary?.faucet?.source === "none"
              ? "No faucet"
              : null),
        reviewRequested: Boolean(session?.status === "review_requested"),
        reviewOnlyOutstandingCount: (missingInformationRequirements || []).filter(
          (r) => r.severity === "review" || /review|specialty/i.test(String(r.code || ""))
        ).length,
        missingInformationRequirements,
        now: new Date()
      });

      const customerResultJson = {
        ...result.public,
        missingInformationRequirements,
        reviewRequiredMessages: [
          ...(result.public?.reviewRequiredMessages || []),
          ...reviewFlags.map((f) => {
            if (f.startsWith("custom_height_backsplash:")) {
              return "Custom backsplash height requires estimator review.";
            }
            if (f.startsWith("full_height_backsplash:")) {
              return "Full-height backsplash measurements will be confirmed by your estimator.";
            }
            if (f.startsWith("specialty_review:")) {
              return "A specialty item requires estimator review and custom quoting.";
            }
            if (f.startsWith("sidesplash_review:")) {
              return "Side splash pricing requires estimator review (piece depth unavailable).";
            }
            return "Estimator review required for one or more selections.";
          })
        ],
        customerConfigurationSummary,
        quoteLibraryCustomerConfig: quoteLibraryProjection
      };
      assertPublicConfigurationHasNoForbiddenContent(customerResultJson);

      const internalEvidenceJson = {
        ...result.internal,
        missingInformationRequirements,
        reviewFlags,
        quoteLibraryCustomerConfig: quoteLibraryProjection,
        customerConfigurationSummary
      };

      let persisted;
      try {
        persisted = await configurationRepository.saveSelectionAndCalculationAtomic({
        organizationId: session.organization_id,
        sessionId: session.id,
        expectedRowVersion: Number(expectedRowVersion),
        idempotencyKey,
        selectionPayload: selectionPayloadForMeta,
        selectionHash: normalized.selectionHash,
        customerResultJson,
        internalEvidenceJson,
        baselineTotal: result.totals.baselineExactTotal,
        configuredTotal: result.totals.configuredExactTotal,
        pricingValidThrough: ctx.pricingValidThrough,
        engineVersion: ELITE100_CONFIG_DELTA_ENGINE_ID,
        calculationInputFingerprint: result.inputFingerprint,
        calculationFingerprint: result.calculationFingerprint
      });
      } catch (e) {
        if (e?.statusCode === 409 || e?.code === "row_version_conflict") {
          throw safeFail("stale_configuration", "Please refresh and try again", 409, {
            diagnosticCode: "DE-CONFIGURATION-STALE",
            recoverable: true
          });
        }
        throw mapPersistenceError(e);
      }

      if (typeof configurationRepository.appendEvent === "function") {
        try {
          await configurationRepository.appendEvent({
            organization_id: session.organization_id,
            envelope_id: activeEnvelope.id,
            publication_id: session.publication_id,
            session_id: session.id,
            event_type: "quote_library_customer_config",
            actor_type: "public",
            metadata: quoteLibraryProjection
          });
        } catch (e) {
          // Telemetry must never fail a successful customer save.
          console.info(
            JSON.stringify({
              msg: "de_quote_library_event_skipped",
              code: e?.code || null,
              hint: "Apply eliteos_digital_estimate_configuration_updated_event_v1.sql if 23514"
            })
          );
        }
      }

      return {
        ok: true,
        session: {
          id: persisted.session.id,
          rowVersion: persisted.session.row_version,
          status: persisted.session.status
        },
        calculation: persisted.calculation.customer_result_json,
        selectionHash: normalized.selectionHash,
        customerInfoDraft: mergedInfo,
        roomLabelDrafts: mergedLabels,
        missingInformationRequirements
      };
    },

    async revokeSessionCookie({ rawSecret }) {
      if (!rawSecret) return { ok: true };
      const secretHash = hashConfigurationSessionSecret(rawSecret);
      const session = await configurationRepository.getSessionBySecretHash?.(secretHash);
      if (session && typeof configurationRepository.revokeSession === "function") {
        await configurationRepository.revokeSession(session.organization_id, session.id);
      }
      return { ok: true };
    }
  };
}
