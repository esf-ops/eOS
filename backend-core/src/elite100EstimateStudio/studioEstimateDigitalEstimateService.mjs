/**
 * Studio estimate → Digital Estimate publication (reuses existing DE publish pipeline).
 */

import {
  isDigitalEstimateApiEnabled,
  isDigitalEstimatePublishEnabled,
  readDigitalEstimatePricingValidDays
} from "../digitalEstimate/digitalEstimateConfig.mjs";
import {
  publishDigitalEstimate,
  replaceDigitalEstimateToken,
  revokeDigitalEstimatePublication,
  recordDigitalEstimateLinkCopied
} from "../digitalEstimate/digitalEstimatePublishService.mjs";
import { buildPublicationFreezePayloads } from "../digitalEstimate/digitalEstimateSnapshot.mjs";
import {
  buildPublicDigitalEstimateDto,
  assertPublicDtoHasNoForbiddenContent
} from "../digitalEstimate/digitalEstimatePublicSerializer.mjs";
import { getTakeoffWorkspace } from "../takeoff/takeoffWorkspaceService.mjs";
import {
  assessStudioEstimatePublicationReadiness,
  buildSyntheticQuoteHeaderFromStudioEstimate,
  hashConfigurationEnvelope,
  studioEstimatePublicationFamilyRoot
} from "./studioEstimatePublicationAdapter.mjs";
import {
  listElite100CustomerMaterials,
  getElite100CustomerMaterial
} from "../digitalEstimate/configuration/elite100CustomerMaterialCatalog.mjs";
import { GROUP_CODE_DISPLAY_NAMES } from "../digitalEstimate/configuration/approvedPricingFixtures.mjs";
import { serverApprovedOptionCatalog } from "../digitalEstimate/configuration/configurationTrustedContext.mjs";

function scopeMaterialGroupToCode(raw) {
  const s = String(raw || "").trim().toLowerCase();
  const map = {
    promo: "promo",
    "group promo": "promo",
    a: "group_a",
    "group a": "group_a",
    b: "group_b",
    "group b": "group_b",
    c: "group_c",
    "group c": "group_c",
    d: "group_d",
    "group d": "group_d",
    e: "group_e",
    "group e": "group_e",
    f: "group_f",
    "group f": "group_f",
    remnant: "remnant"
  };
  return map[s] || null;
}

function deError(message, code, statusCode = 400) {
  const err = new Error(message);
  err.code = code;
  err.statusCode = statusCode;
  return err;
}

function rejectCallerAuthority(body) {
  if (!body || typeof body !== "object") return;
  const forbidden = [
    "organizationId",
    "organization_id",
    "actorId",
    "actorUserId",
    "userId",
    "token",
    "accessToken",
    "customerDisplayTotal",
    "exactInternalTotal",
    "totals",
    "rate",
    "rates",
    "tax",
    "markup",
    "internalMarkup",
    "internalMarkupPercent",
    "trustedAccount",
    "accountGroup",
    "wholesale",
    "takeoffApproved",
    "approval",
    "status"
  ];
  for (const key of forbidden) {
    if (Object.prototype.hasOwnProperty.call(body, key) && body[key] != null && body[key] !== "") {
      throw deError("Caller-controlled pricing or identity fields are not accepted", "forbidden_caller_authority", 400);
    }
  }
}

function addDaysDateOnly(days, now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function validatePricingValidThrough(raw, env, now = new Date()) {
  if (raw == null || String(raw).trim() === "") {
    return addDaysDateOnly(readDigitalEstimatePricingValidDays(env), now);
  }
  const s = String(raw).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    throw deError("pricingValidThrough must be YYYY-MM-DD", "invalid_pricing_valid_through", 400);
  }
  const max = addDaysDateOnly(readDigitalEstimatePricingValidDays(env) + 30, now);
  if (s < now.toISOString().slice(0, 10) || s > max) {
    throw deError("pricingValidThrough is outside allowed server policy", "invalid_pricing_valid_through", 400);
  }
  return s;
}

function wrapRepositoryWithStudioHeader(deRepository, syntheticHeader) {
  return {
    ...deRepository,
    async getQuoteHeader(organizationId, quoteId) {
      if (String(quoteId) === String(syntheticHeader.id)) {
        if (
          syntheticHeader.organization_id &&
          String(syntheticHeader.organization_id) !== String(organizationId)
        ) {
          return null;
        }
        return structuredClone(syntheticHeader);
      }
      if (typeof deRepository.getQuoteHeader === "function") {
        return deRepository.getQuoteHeader(organizationId, quoteId);
      }
      return null;
    }
  };
}

function staffPublicationView(pub) {
  return {
    id: pub.id,
    sourceQuoteId: pub.source_quote_id,
    quoteNumber: pub.quote_number,
    revisionNumber: pub.revision_number,
    revisionLabel: pub.revision_label,
    status: pub.status,
    publishedAt: pub.published_at,
    accessExpiresAt: pub.access_expires_at,
    pricingValidThrough: pub.pricing_valid_through,
    termsDisclosureVersion: pub.terms_disclosure_version,
    revokedAt: pub.revoked_at ?? null,
    supersededAt: pub.superseded_at ?? null
  };
}

/**
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   studioEstimateService: any,
 *   digitalEstimateRepository: any,
 *   configurationStudioService?: any,
 *   amendmentRepository?: any,
 *   getSupabase?: () => any,
 *   loadTakeoffWorkspace?: typeof getTakeoffWorkspace
 * }} deps
 */
export function createStudioEstimateDigitalEstimateService(deps) {
  const env = deps.env ?? process.env;
  const studioEstimateService = deps.studioEstimateService;
  const deRepository = deps.digitalEstimateRepository;
  const configurationStudioService = deps.configurationStudioService || null;
  const amendmentRepository = deps.amendmentRepository || null;
  const loadTakeoffWorkspace = deps.loadTakeoffWorkspace || getTakeoffWorkspace;

  async function loadEstimateRow(organizationId, estimateId) {
    const repo = studioEstimateService?.repository || null;
    if (repo && typeof repo.getById === "function") {
      return repo.getById(organizationId, estimateId);
    }
    throw deError("Studio estimate repository unavailable", "estimate_repo_unavailable", 500);
  }

  async function takeoffStatusFor(estimate, organizationId) {
    if (!estimate?.takeoffJobId) return null;
    try {
      const supabase = deps.getSupabase?.();
      if (!supabase && loadTakeoffWorkspace === getTakeoffWorkspace) {
        return null;
      }
      const workspace = await loadTakeoffWorkspace({
        supabase,
        organizationId,
        takeoffJobId: estimate.takeoffJobId
      });
      return workspace?.reviewStatus ?? null;
    } catch {
      return null;
    }
  }

  async function assessReadiness(organizationId, estimateId, configuration = null) {
    const estimate = await loadEstimateRow(organizationId, estimateId);
    if (!estimate) {
      throw deError("Estimate not found", "estimate_not_found", 404);
    }
    const takeoffReviewStatus = await takeoffStatusFor(estimate, organizationId);
    const readiness = assessStudioEstimatePublicationReadiness({
      estimate: { ...estimate, organizationId },
      repositoryMode: studioEstimateService.repositoryMode,
      takeoffReviewStatus,
      env,
      configuration
    });

    let preview = null;
    if (readiness.eligible) {
      const header = buildSyntheticQuoteHeaderFromStudioEstimate(estimate, { organizationId });
      const freeze = buildPublicationFreezePayloads({
        header,
        publishedAt: new Date().toISOString(),
        pricingValidThrough: addDaysDateOnly(readDigitalEstimatePricingValidDays(env))
      });
      preview = buildPublicDigitalEstimateDto(freeze.customerSnapshot, { accessExpiresAt: null });
      assertPublicDtoHasNoForbiddenContent(preview);
      // Defense: customer snapshot must never carry internal markup fields
      const snapRaw = JSON.stringify(freeze.customerSnapshot).toLowerCase();
      if (snapRaw.includes("internalmarkup") || snapRaw.includes("internal_markup")) {
        throw deError("Customer snapshot leaked internal markup", "public_dto_leak", 500);
      }
    }

    const familyRoot = studioEstimatePublicationFamilyRoot(estimate);
    const publications = await deRepository.listPublicationsForQuote(organizationId, estimate.id);
    const familyActive =
      typeof deRepository.listActivePublicationsForFamily === "function"
        ? await deRepository.listActivePublicationsForFamily(organizationId, familyRoot)
        : publications.filter((p) => p.status === "active");

    let reviewRequests = [];
    if (amendmentRepository && typeof amendmentRepository.listReviewRequests === "function") {
      const activeIds = new Set(
        [...publications, ...familyActive].map((p) => String(p.id))
      );
      const all = await amendmentRepository.listReviewRequests(organizationId, { limit: 80 });
      reviewRequests = (all || [])
        .filter((r) => activeIds.has(String(r.publication_id)))
        .map((r) => ({
          id: r.id,
          status: r.status,
          publicationId: r.publication_id,
          requestedAt: r.created_at,
          customerNote: r.customer_note || null,
          configuredDisplayTotal: r.configured_display_total ?? null,
          baselineDisplayTotal: r.baseline_display_total ?? null,
          intakeCaseId: estimate.intakeCaseId,
          studioEstimateId: estimate.id
        }));
    }

    return {
      ok: true,
      readiness,
      estimate: studioEstimateService.safeEstimateView(estimate),
      preview,
      publications: publications.map(staffPublicationView),
      activePublication: familyActive[0] ? staffPublicationView(familyActive[0]) : null,
      reviewRequests,
      links: {
        intakeCaseId: estimate.intakeCaseId || null,
        studioEstimateId: estimate.id,
        takeoffJobId: estimate.takeoffJobId || null
      }
    };
  }

  async function findIdempotentReuse({
    organizationId,
    estimate,
    envelopeFingerprint,
    idempotencyKey,
    sourceQuoteFingerprint
  }) {
    const familyRoot = studioEstimatePublicationFamilyRoot(estimate);
    const active =
      typeof deRepository.listActivePublicationsForFamily === "function"
        ? await deRepository.listActivePublicationsForFamily(organizationId, familyRoot)
        : [];

    for (const pub of active) {
      if (String(pub.source_quote_fingerprint) !== String(sourceQuoteFingerprint)) continue;
      const events =
        typeof deRepository.listEventsForPublication === "function"
          ? await deRepository.listEventsForPublication(organizationId, pub.id, 50)
          : [];
      const publishedEv = (events || []).find((e) => e.event_type === "published");
      const meta = publishedEv?.metadata || {};
      const sameEnvelope =
        !envelopeFingerprint ||
        String(meta.envelopeFingerprint || "") === String(envelopeFingerprint);
      const sameKey =
        idempotencyKey &&
        String(meta.idempotencyKey || "") === String(idempotencyKey);
      // Same revision fingerprint: never create a duplicate active publication.
      if (sameEnvelope && (sameKey || !idempotencyKey || meta.idempotencyKey)) {
        return pub;
      }
      if (sameEnvelope) {
        return pub;
      }
    }
    return null;
  }

  async function applyConfigurationEnvelope({
    organizationId,
    actorUserId,
    publicationId,
    configuration,
    estimate
  }) {
    if (!configurationStudioService) {
      return { configured: false, reason: "configuration_service_unavailable" };
    }
    const cfg = configuration && typeof configuration === "object" ? configuration : {};

    const draft = await configurationStudioService.createDraft(
      organizationId,
      actorUserId,
      publicationId,
      {}
    );
    const envelopeId = draft?.envelope?.id || draft?.id;
    if (!envelopeId) {
      return { configured: false, reason: "envelope_create_failed" };
    }

    const graph =
      (await configurationStudioService.getEnvelope(organizationId, envelopeId)) || draft;
    const groups = Array.isArray(graph?.groups) ? graph.groups : [];
    let cutoutGroup = groups.find(
      (g) => String(g.group_key || g.groupKey) === "cutouts"
    );
    if (!cutoutGroup && (Array.isArray(cfg.allowedOptionKeys) ? cfg.allowedOptionKeys.length : 0)) {
      const created = await configurationStudioService.putGroups(organizationId, envelopeId, {
        groups: [
          {
            groupKey: "cutouts",
            displayLabel: "Cutouts & options",
            required: false,
            selectionMode: "multi",
            mutuallyExclusive: false
          }
        ]
      });
      cutoutGroup = created?.groups?.[0] || null;
    }

    // createDraft already seeds baseline material options. Add estimator-allowed
    // colors / options when explicitly configured; otherwise activate defaults.
    const groupCode = scopeMaterialGroupToCode(estimate.scope?.materialGroup) || "promo";
    const materials = listElite100CustomerMaterials(true).filter(
      (m) => m.pricingGroupCode === groupCode
    );
    const allowedIds = Array.isArray(cfg.allowedMaterialIds)
      ? cfg.allowedMaterialIds.map(String).filter(Boolean)
      : [];
    const includedId = strOrNull(cfg.includedMaterialId || cfg.defaultMaterialId);
    const rooms = Array.isArray(estimate.scope?.rooms)
      ? estimate.scope.rooms.filter((r) => r && r.included !== false)
      : [];
    const materialGroupRow = groups.find(
      (g) => String(g.group_key || g.groupKey) === "material_by_room"
    );
    const options = [];

    if (allowedIds.length && rooms.length && materialGroupRow?.id) {
      for (const room of rooms) {
        const roomKey = String(room.id || room.name);
        for (const materialId of allowedIds) {
          const mat = getElite100CustomerMaterial(materialId);
          if (!mat || !mat.customerVisible) {
            throw deError(
              `Material not customer-visible: ${materialId}`,
              "unknown_material",
              400
            );
          }
          if (mat.pricingGroupCode !== groupCode) {
            throw deError(
              `Material ${materialId} is not in baseline group ${GROUP_CODE_DISPLAY_NAMES[groupCode] || groupCode}`,
              "material_group_mismatch",
              400
            );
          }
          options.push({
            groupId: materialGroupRow.id,
            optionKey: `material:${roomKey}:${materialId}`,
            displayLabel: mat.displayName,
            includedInBaseline: includedId ? materialId === includedId : false,
            defaultQty: includedId && materialId === includedId ? 1 : 0,
            minQty: 0,
            maxQty: 1,
            requiredSelection: Boolean(includedId && materialId === includedId),
            customerPriceTreatment: "delta",
            pricingMode: "replacement",
            imageAssetRef: mat.imageThumbPath,
            compatibilityJson: {
              roomKey,
              materialColorId: materialId,
              materialGroup: mat.pricingGroupCode,
              role: "material_selection",
              isDefault: Boolean(includedId && materialId === includedId)
            }
          });
        }
      }
    } else if (!materials.length) {
      // No catalog colors for this group — createDraft defaults already applied.
    }

    const catalog = new Map(serverApprovedOptionCatalog().map((o) => [o.optionKey, o]));
    const allowedOptionKeys = Array.isArray(cfg.allowedOptionKeys) ? cfg.allowedOptionKeys : [];
    const qtyLimits =
      cfg.quantityLimits && typeof cfg.quantityLimits === "object" ? cfg.quantityLimits : {};
    for (const key of allowedOptionKeys) {
      const cat = catalog.get(String(key));
      if (!cat) {
        throw deError(
          `Unsupported option for customer selection: ${key}`,
          "unsupported_customer_option",
          400
        );
      }
      if (!cutoutGroup?.id) {
        throw deError("Cutouts group missing for customer options", "envelope_group_missing", 500);
      }
      const includedQty = Math.max(0, Math.floor(Number(estimate.scope?.addOns?.[key] ?? 0) || 0));
      const maxQty = Math.max(
        includedQty,
        Math.floor(Number(qtyLimits[key] ?? cat.maxQty ?? 10) || 0)
      );
      options.push({
        groupId: cutoutGroup.id,
        optionKey: cat.optionKey,
        displayLabel: cat.displayLabel,
        includedInBaseline: includedQty > 0,
        defaultQty: includedQty,
        minQty: 0,
        maxQty,
        requiredSelection: false,
        customerPriceTreatment: cat.customerPriceTreatment,
        pricingMode: cat.pricingMode,
        // sellPrice resolved server-side from catalog in putOptions
        compatibilityJson: { role: "option" }
      });
    }

    if (options.length) {
      await configurationStudioService.putOptions(organizationId, envelopeId, { options });
    }

    await configurationStudioService.activate(organizationId, envelopeId, {
      confirm: true,
      acknowledgeFreeze: true
    }, actorUserId);

    return { configured: true, envelopeId };
  }

  function strOrNull(v) {
    if (v == null) return null;
    const s = String(v).trim();
    return s || null;
  }

  return {
    assessReadiness,

    async publish({ organizationId, estimateId, actorUserId, body }) {
      rejectCallerAuthority(body);
      if (!isDigitalEstimateApiEnabled(env) || !isDigitalEstimatePublishEnabled(env)) {
        throw deError("Digital Estimate publish disabled", "digital_estimate_disabled", 404);
      }
      if (body?.confirm !== true && body?.confirm !== "true") {
        throw deError("Explicit publish confirmation required", "confirm_required", 400);
      }

      const configuration =
        body?.configuration && typeof body.configuration === "object" ? body.configuration : {};
      const readiness = await assessReadiness(organizationId, estimateId, configuration);
      if (!readiness.readiness.eligible) {
        throw deError(readiness.readiness.message, readiness.readiness.code, 400);
      }

      const estimate = await loadEstimateRow(organizationId, estimateId);
      const synthetic = buildSyntheticQuoteHeaderFromStudioEstimate(estimate, { organizationId });
      const pricingValidThrough = validatePricingValidThrough(
        configuration.pricingValidThrough || body.pricingValidThrough,
        env
      );
      const envelopeFingerprint = hashConfigurationEnvelope(configuration);
      const idempotencyKey = strOrNull(body.idempotencyKey);

      const freezeProbe = buildPublicationFreezePayloads({
        header: synthetic,
        publishedAt: new Date().toISOString(),
        pricingValidThrough
      });
      assertPublicDtoHasNoForbiddenContent(
        buildPublicDigitalEstimateDto(freezeProbe.customerSnapshot, { accessExpiresAt: null })
      );

      const existing = await findIdempotentReuse({
        organizationId,
        estimate,
        envelopeFingerprint,
        idempotencyKey,
        sourceQuoteFingerprint: freezeProbe.sourceQuoteFingerprint
      });
      if (existing) {
        return {
          ok: true,
          reused: true,
          publication: staffPublicationView(existing),
          accessToken: null,
          customerUrl: null,
          readiness: readiness.readiness,
          staffNotice:
            "Publication already exists for this approved estimate revision and configuration. Use Replace Link for a new customer token."
        };
      }

      const wrapped = wrapRepositoryWithStudioHeader(deRepository, synthetic);
      const result = await publishDigitalEstimate({
        env,
        organizationId,
        actorUserId,
        repository: wrapped,
        body: {
          confirm: true,
          quoteId: estimate.id,
          pricingValidThrough,
          publishMetadata: {
            idempotencyKey,
            envelopeFingerprint,
            studioEstimateId: estimate.id,
            intakeCaseId: estimate.intakeCaseId || null,
            takeoffJobId: estimate.takeoffJobId || null,
            calculationFingerprint: estimate.approval?.calculationFingerprint || null,
            studioEstimateRevision: Number(estimate.revision) || 1
          }
        }
      });

      let envelope = { configured: false };
      try {
        envelope = await applyConfigurationEnvelope({
          organizationId,
          actorUserId,
          publicationId: result.publication.id,
          configuration,
          estimate
        });
      } catch (e) {
        // Publication is immutable once created; surface envelope failure without rolling back.
        envelope = {
          configured: false,
          reason: e?.code || "envelope_failed",
          message: e?.message || "Configuration envelope failed"
        };
      }

      return {
        ...result,
        reused: false,
        readiness: readiness.readiness,
        envelope,
        links: {
          intakeCaseId: estimate.intakeCaseId || null,
          studioEstimateId: estimate.id,
          publicationId: result.publication.id,
          takeoffJobId: estimate.takeoffJobId || null
        }
      };
    },

    async listPublications(organizationId, estimateId) {
      const estimate = await loadEstimateRow(organizationId, estimateId);
      if (!estimate) throw deError("Estimate not found", "estimate_not_found", 404);
      const familyRoot = studioEstimatePublicationFamilyRoot(estimate);
      const byEstimate = await deRepository.listPublicationsForQuote(organizationId, estimate.id);
      const byFamily =
        typeof deRepository.listActivePublicationsForFamily === "function"
          ? await deRepository.listActivePublicationsForFamily(organizationId, familyRoot)
          : [];
      const map = new Map();
      for (const p of [...byEstimate, ...byFamily]) map.set(p.id, p);
      // Also include superseded family history via quote list if repository supports family listing
      return {
        ok: true,
        publications: [...map.values()].map(staffPublicationView),
        activePublication: byFamily[0] ? staffPublicationView(byFamily[0]) : null
      };
    },

    async revoke({ organizationId, publicationId, actorUserId, body }) {
      return revokeDigitalEstimatePublication({
        env,
        organizationId,
        actorUserId,
        repository: deRepository,
        publicationId,
        body
      });
    },

    async replaceLink({ organizationId, publicationId, actorUserId, body }) {
      return replaceDigitalEstimateToken({
        env,
        organizationId,
        actorUserId,
        repository: deRepository,
        publicationId,
        body
      });
    },

    async recordLinkCopied({ organizationId, publicationId, actorUserId }) {
      return recordDigitalEstimateLinkCopied({
        env,
        organizationId,
        actorUserId,
        repository: deRepository,
        publicationId
      });
    }
  };
}
