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
import { normalizeSelectionPayload } from "./configurationValidation.mjs";
import {
  mergeSelectionPayloadMeta,
  sanitizeCustomerInfoDraft,
  sanitizeRoomLabelDrafts,
  splitSelectionPayloadMeta
} from "./customerConfigurationDraft.mjs";
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
  e.statusCode = 404;
  return e;
}

function safeFail(code, message, statusCode = 400) {
  const e = new Error(message);
  e.code = code;
  e.statusCode = statusCode;
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
  return {
    id: opt.id,
    optionKey: opt.option_key || opt.optionKey,
    groupId: opt.group_id || opt.groupId,
    groupKey: group?.group_key || group?.groupKey || null,
    displayLabel: mat?.displayName || opt.display_label || opt.displayLabel,
    description: opt.description_customer || opt.description || null,
    imageAssetRef: mat?.imageThumbPath || opt.image_asset_ref || opt.imageAssetRef || null,
    materialId: resolved.materialId || null,
    roomKey: resolved.roomKey || null,
    availabilityState: availability,
    customerPriceTreatment: treatment,
    minQty: Number(opt.min_qty ?? opt.minQty ?? 0),
    maxQty: opt.max_qty ?? opt.maxQty ?? null,
    defaultQty: Number(opt.default_qty ?? opt.defaultQty ?? 0),
    includedInBaseline: Boolean(opt.included_in_baseline ?? opt.includedInBaseline),
    requiredSelection: Boolean(opt.required_selection ?? opt.requiredSelection),
    selectable:
      availability === "active" &&
      treatment !== "unavailable" &&
      treatment !== "review_required"
  };
}

function buildCustomerSafeMaterials(graphOptions) {
  const materials = [];
  for (const opt of graphOptions || []) {
    const key = opt.option_key || opt.optionKey || "";
    if (!String(key).startsWith("material:")) continue;
    const resolved = resolveMaterialSelectionFromOption(opt);
    if (!resolved.materialId) continue;
    const mat = getElite100CustomerMaterial(resolved.materialId);
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
    pricingPolicyRepository = null
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
    const materials = buildCustomerSafeMaterials(graph?.options || []);
    assertPublicConfigurationHasNoForbiddenContent(materials);

    let latestSelection = null;
    let latestCalculation = null;
    if (typeof configurationRepository.getLatestSelectionForSession === "function") {
      latestSelection = await configurationRepository.getLatestSelectionForSession(
        organizationId,
        session.id
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
        rooms: (ctx.rooms || []).map((r) => ({
          roomKey: r.roomKey,
          displayName:
            selectionMeta.roomLabelDrafts[r.roomKey] || r.displayName,
          sourceDisplayName: r.displayName,
          baselineMaterialLabel: r.baselineMaterialLabel,
          baselineColorLabel: r.colorLabel || null,
          countertopSf: Number(r.chargeableCounterSf) || 0,
          backsplashSf: Number(r.backsplashSf) || 0,
          // Customer-facing label drafts only — measurements remain locked server-side.
          customerMayEditLabel: true,
          locked: true
        })),
        groups,
        options,
        materials,
        currentSelections: selectionMeta.quantities,
        latestCalculation: customerCalc,
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

      const state = await buildPublicState({
        organizationId,
        publication,
        snap,
        session,
        activeEnvelope
      });

      return {
        rawSecret,
        state,
        publicOrigin: readDigitalEstimatePublicConfigurationOrigin(env)
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
      if (!session || !constantTimeEqualSessionHash(session.session_secret_hash, secretHash)) {
        throw unavailable();
      }
      if (session.status !== "active" && session.status !== "configuring" && session.status !== "saved") {
        throw unavailable();
      }
      if (Number(session.row_version) !== Number(expectedRowVersion)) {
        throw safeFail("row_version_conflict", "Please refresh and try again", 409);
      }

      const publication = await deRepository.getPublication(
        session.organization_id,
        session.publication_id
      );
      if (!publication || publication.status !== "active") throw unavailable();
      assertSyntheticPublicationPublicAccess(publication.id, env);
      if (isPricingExpired(publication.pricing_valid_through)) {
        throw configUnavailable("Pricing has expired");
      }

      const activeEnvelope = await configurationRepository.getActiveEnvelope(
        session.organization_id,
        session.publication_id
      );
      if (!activeEnvelope) throw unavailable();
      if (!session.envelope_id || session.envelope_id !== activeEnvelope.id) {
        throw unavailable();
      }
      if (activeEnvelope.status !== "active") throw unavailable();

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
          const opt = options.find(
            (o) => o.id === id || (o.option_key || o.optionKey) === key
          );
          if (!opt) throw safeFail("unknown_option", "That selection is unavailable", 400);
          const avail = opt.availability_state || opt.availabilityState || "active";
          if (avail !== "active") {
            throw safeFail("unresolved_product", "That selection is unavailable", 422);
          }
          selectionMap[opt.option_key || opt.optionKey] = Number(item.quantity ?? item.qty ?? 0);
        }
      } else {
        const rawMap =
          body.selections && typeof body.selections === "object" ? body.selections : {};
        selectionMap = splitSelectionPayloadMeta(rawMap).quantities;
      }

      const customerInfoDraft =
        sanitizeCustomerInfoDraft(body.customerInfoDraft) ||
        sanitizeCustomerInfoDraft(body.customer_info_draft);
      const roomLabelDrafts = sanitizeRoomLabelDrafts(
        body.roomLabelDrafts || body.room_label_drafts || {}
      );

      // Preserve prior drafts when caller omits them (material-only saves).
      let priorMeta = { customerInfoDraft: null, roomLabelDrafts: {} };
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

      // Build DE.2C rooms from material: selections + baseline (server resolves color → group)
      const rooms = (ctx.rooms || []).map((r) => {
        let selected = r.baselineMaterialGroup;
        for (const [key, qty] of Object.entries(normalized.selections)) {
          if (Number(qty) <= 0) continue;
          if (key.startsWith(`material:${r.roomKey}:`)) {
            const opt = options.find((o) => (o.option_key || o.optionKey) === key);
            const resolved = resolveMaterialSelectionFromOption(opt || { optionKey: key });
            if (!resolved.materialGroup) {
              throw safeFail("unknown_material", "That selection is unavailable", 400);
            }
            // Reject forged color IDs not frozen into the envelope
            if (!opt) {
              throw safeFail("unknown_option", "That selection is unavailable", 400);
            }
            selected = resolved.materialGroup;
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
          selectedMaterialGroup: selected,
          baselineMaterialGroup: r.baselineMaterialGroup
        };
      });

      const catalog = new Map(serverApprovedOptionCatalog().map((o) => [o.optionKey, o]));
      const calcOptions = [];
      for (const [key, qtyRaw] of Object.entries(normalized.selections)) {
        if (key.startsWith("material:")) continue;
        const qty = Number(qtyRaw) || 0;
        if (qty <= 0) continue;
        const cat = catalog.get(key);
        const envOpt = options.find((o) => (o.option_key || o.optionKey) === key);
        if (!cat && !envOpt) {
          throw safeFail("unknown_option", "That selection is unavailable", 400);
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

      const result = calculateElite100ConfigDelta({
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
        frozenBaseRates: ctx.frozenBaseRates,
        authorizedMaterialMarkup: { bps: markupBps },
        materialTaxPolicy: { bps: 200 },
        options: calcOptions,
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

      assertPublicConfigurationHasNoForbiddenContent(result.public);

      const persisted = await configurationRepository.saveSelectionAndCalculationAtomic({
        organizationId: session.organization_id,
        sessionId: session.id,
        expectedRowVersion: Number(expectedRowVersion),
        idempotencyKey,
        selectionPayload: mergeSelectionPayloadMeta(normalized.selections, {
          customerInfoDraft: mergedInfo,
          roomLabelDrafts: mergedLabels
        }),
        selectionHash: normalized.selectionHash,
        customerResultJson: result.public,
        internalEvidenceJson: result.internal,
        baselineTotal: result.totals.baselineExactTotal,
        configuredTotal: result.totals.configuredExactTotal,
        pricingValidThrough: ctx.pricingValidThrough,
        engineVersion: ELITE100_CONFIG_DELTA_ENGINE_ID,
        calculationInputFingerprint: result.inputFingerprint,
        calculationFingerprint: result.calculationFingerprint
      });

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
        roomLabelDrafts: mergedLabels
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
