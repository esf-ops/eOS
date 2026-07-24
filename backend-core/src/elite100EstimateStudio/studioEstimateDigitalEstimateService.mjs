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
  inferCustomerChoiceGroupsFromEnvelopeOptions,
  inferFriendlyChoiceFlags,
  normalizeCustomerChoiceGroups,
  partitionAllowedOptionKeys,
  choiceGroupEnabled
} from "./studioCustomerChoiceOptions.mjs";
import {
  ensureStudioEstimatePublicationSource,
  mapStudioPublicationPersistenceError
} from "./studioEstimatePublicationSource.mjs";
import { recoverStaffPublicationLinkMeta } from "../digitalEstimate/staffPublicationLinkRecovery.mjs";
import {
  listElite100CustomerMaterials,
  getElite100CustomerMaterial,
  pickDefaultMaterialForGroup
} from "../digitalEstimate/configuration/elite100CustomerMaterialCatalog.mjs";
import { GROUP_CODE_DISPLAY_NAMES } from "../digitalEstimate/configuration/approvedPricingFixtures.mjs";
import { serverApprovedOptionCatalog } from "../digitalEstimate/configuration/configurationTrustedContext.mjs";
import {
  buildDefaultRoomProductOptions,
  inferRoomEligibilityType,
  resolveOptionSellPriceFromCatalog
} from "../digitalEstimate/catalog/digitalEstimateProductOptions.mjs";
import { getCatalogMeta } from "../digitalEstimate/catalog/esfPlumbingCatalog.mjs";

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

function wrapRepositoryWithStudioHeader(deRepository, syntheticHeader) {
  // Explicit forwards — do not rely on object spread for prototype methods.
  return {
    mode: deRepository?.mode,
    seedQuote: typeof deRepository?.seedQuote === "function" ? deRepository.seedQuote.bind(deRepository) : undefined,
    getQuote: typeof deRepository?.getQuote === "function" ? deRepository.getQuote.bind(deRepository) : undefined,
    listPublicationsForQuote:
      typeof deRepository?.listPublicationsForQuote === "function"
        ? deRepository.listPublicationsForQuote.bind(deRepository)
        : undefined,
    listActivePublicationsForFamily:
      typeof deRepository?.listActivePublicationsForFamily === "function"
        ? deRepository.listActivePublicationsForFamily.bind(deRepository)
        : undefined,
    listEventsForPublication:
      typeof deRepository?.listEventsForPublication === "function"
        ? deRepository.listEventsForPublication.bind(deRepository)
        : undefined,
    getPublication:
      typeof deRepository?.getPublication === "function"
        ? deRepository.getPublication.bind(deRepository)
        : undefined,
    getSnapshotByPublicationId:
      typeof deRepository?.getSnapshotByPublicationId === "function"
        ? deRepository.getSnapshotByPublicationId.bind(deRepository)
        : undefined,
    getActiveTokenForPublication:
      typeof deRepository?.getActiveTokenForPublication === "function"
        ? deRepository.getActiveTokenForPublication.bind(deRepository)
        : undefined,
    countTokensForPublication:
      typeof deRepository?.countTokensForPublication === "function"
        ? deRepository.countTokensForPublication.bind(deRepository)
        : undefined,
    probeTokenWrappedColumn:
      typeof deRepository?.probeTokenWrappedColumn === "function"
        ? deRepository.probeTokenWrappedColumn.bind(deRepository)
        : undefined,
    assertActiveTokenWrappedWritable:
      typeof deRepository?.assertActiveTokenWrappedWritable === "function"
        ? deRepository.assertActiveTokenWrappedWritable.bind(deRepository)
        : undefined,
    setActiveTokenWrapped:
      typeof deRepository?.setActiveTokenWrapped === "function"
        ? deRepository.setActiveTokenWrapped.bind(deRepository)
        : undefined,
    publishAtomic:
      typeof deRepository?.publishAtomic === "function"
        ? deRepository.publishAtomic.bind(deRepository)
        : undefined,
    replaceTokenAtomic:
      typeof deRepository?.replaceTokenAtomic === "function"
        ? deRepository.replaceTokenAtomic.bind(deRepository)
        : undefined,
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

function readinessFailureError(readiness) {
  const first = readiness?.blockingReasons?.[0] || readiness?.blockers?.[0];
  const err = deError(
    readiness?.message || first?.message || "Not eligible to publish",
    readiness?.code || first?.code || "not_eligible",
    400
  );
  err.blockers = readiness?.blockers || [];
  err.blockingReasons = readiness?.blockingReasons || readiness?.blockers || [];
  err.field = readiness?.field || first?.field || null;
  err.allowedRange = readiness?.allowedRange || first?.allowedRange || null;
  return err;
}

/** Soft budget for configure-enabled Studio publish (seed + activate). */
const STUDIO_PUBLISH_BUDGET_MS = 45_000;

/**
 * After configure publish fails post-atomic, restore prior family publications so
 * the previous working customer link remains usable.
 */
async function restorePriorPublicationsAfterFailedConfigure({
  organizationId,
  deRepository,
  priorPublicationIds,
  failedPublicationId
}) {
  const priors = Array.isArray(priorPublicationIds) ? priorPublicationIds : [];
  for (const priorId of priors) {
    if (!priorId || String(priorId) === String(failedPublicationId)) continue;
    try {
      await deRepository.updatePublication(organizationId, priorId, {
        status: "active",
        superseded_at: null,
        superseded_by_publication_id: null
      });
      if (typeof deRepository.listTokensForPublication !== "function") continue;
      const tokens = await deRepository.listTokensForPublication(organizationId, priorId);
      const hasActive = (tokens || []).some((t) => !t.revoked_at);
      if (hasActive) continue;
      const revoked = [...(tokens || [])]
        .filter((t) => t.revoked_at)
        .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
      if (revoked[0]?.id && typeof deRepository.updateToken === "function") {
        await deRepository.updateToken(organizationId, revoked[0].id, { revoked_at: null });
      }
    } catch {
      /* best-effort restore */
    }
  }
}

function staffPublicationView(pub, linkMeta = null) {
  const base = {
    id: pub.id,
    publicationId: pub.id,
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
  // Always serialize recoverable-link contract fields when meta is supplied so
  // route JSON cannot omit customerUrl/linkStatus by sparse object construction.
  if (!linkMeta) return base;
  return {
    ...base,
    customerUrl: Object.prototype.hasOwnProperty.call(linkMeta, "customerUrl")
      ? linkMeta.customerUrl
      : null,
    linkStatus: Object.prototype.hasOwnProperty.call(linkMeta, "linkStatus")
      ? linkMeta.linkStatus
      : null,
    linkDiagnostics: Object.prototype.hasOwnProperty.call(linkMeta, "linkDiagnostics")
      ? linkMeta.linkDiagnostics
      : null,
    linkError: Object.prototype.hasOwnProperty.call(linkMeta, "linkError")
      ? linkMeta.linkError
      : null
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

  /**
   * Recover stable customer URL for authorized Studio callers (never public).
   * Uses the shared staff link recovery authority (same as Publications + Live DE).
   * @param {string} organizationId
   * @param {object} pub
   */
  async function linkMetaForPublication(organizationId, pub) {
    return recoverStaffPublicationLinkMeta(deRepository, organizationId, pub, env);
  }

  async function staffPublicationViews(organizationId, pubs) {
    const out = [];
    for (const pub of pubs) {
      const linkMeta = await linkMetaForPublication(organizationId, pub);
      out.push(staffPublicationView(pub, linkMeta));
    }
    return out;
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
        .map((r) => {
          const snap = r.request_snapshot_json || {};
          return {
            id: r.id,
            status: r.status,
            publicationId: r.publication_id,
            requestedAt: r.created_at,
            customerNote: r.customer_note || null,
            configuredDisplayTotal: r.configured_display_total ?? null,
            baselineDisplayTotal: r.baseline_display_total ?? null,
            intakeCaseId: estimate.intakeCaseId,
            studioEstimateId: estimate.id,
            sourceProject: snap.sourceProject || null,
            customerInfoDraft: snap.customerInfoDraft || null,
            roomLabelDrafts: snap.roomLabelDrafts || null,
            roomNotes: snap.roomNotes || null,
            projectNote: snap.projectNote || null,
            selectedOptions: Array.isArray(snap.selectedOptions) ? snap.selectedOptions : [],
            customerConfigurationSummary: snap.customerConfigurationSummary || null,
            missingInformationRequirements: Array.isArray(snap.missingInformationRequirements)
              ? snap.missingInformationRequirements
              : []
          };
        });
    }

    const publicationViews = await staffPublicationViews(organizationId, publications);
    const activeRaw =
      familyActive[0] ||
      publications.find((p) => p.status === "active" && !p.revoked_at && !p.superseded_at) ||
      null;
    const activeView = activeRaw
      ? staffPublicationView(activeRaw, await linkMetaForPublication(organizationId, activeRaw))
      : null;

    // Contract: authorized Studio readiness always exposes link fields on activePublication.
    const activePublication = activeView
      ? {
          ...activeView,
          customerUrl: activeView.customerUrl ?? null,
          linkStatus: activeView.linkStatus ?? "needs_replace",
          linkDiagnostics: activeView.linkDiagnostics ?? null
        }
      : null;

    const publishedConfiguration = await resolvePublishedConfiguration({
      organizationId,
      publication: activeRaw,
      configurationStudioService
    });

    const { buildStudioPublicationReadinessDto } = await import(
      "./studioPublicationReadiness.mjs"
    );
    const readinessDto = buildStudioPublicationReadinessDto({
      estimate,
      readiness,
      configuration,
      publishedConfiguration,
      activePublication
    });

    return {
      ok: true,
      readiness: {
        ...readiness,
        ...readinessDto,
        // Preserve flat blockers for older clients.
        eligible: readinessDto.eligible,
        message: readinessDto.primaryMessage?.message || readiness.message,
        code: readinessDto.primaryMessage?.code || readiness.code
      },
      estimate: studioEstimateService.safeEstimateView(estimate),
      preview,
      publications: publicationViews,
      activePublication,
      publishedConfiguration,
      reviewRequests,
      links: {
        intakeCaseId: estimate.intakeCaseId || null,
        studioEstimateId: estimate.id,
        takeoffJobId: estimate.takeoffJobId || null
      }
    };
  }

  /**
   * Recover the last saved customer-choice permissions for Studio checkbox hydration.
   */
  async function resolvePublishedConfiguration({
    organizationId,
    publication,
    configurationStudioService: cfgService
  }) {
    if (!publication?.id) return null;
    const events =
      typeof deRepository.listEventsForPublication === "function"
        ? await deRepository.listEventsForPublication(organizationId, publication.id, 80)
        : [];
    const configEv = (events || []).find(
      (e) =>
        e.event_type === "configuration_updated" ||
        (e.event_type === "published" && e.metadata?.customerChoiceGroups)
    );
    let customerChoiceGroups = Array.isArray(configEv?.metadata?.customerChoiceGroups)
      ? configEv.metadata.customerChoiceGroups.map(String)
      : [];
    let allowedOptionKeys = Array.isArray(configEv?.metadata?.allowedOptionKeys)
      ? configEv.metadata.allowedOptionKeys.map(String)
      : [];
    const envelopeFingerprint = configEv?.metadata?.envelopeFingerprint
      ? String(configEv.metadata.envelopeFingerprint)
      : null;

    if ((!customerChoiceGroups.length || !allowedOptionKeys.length) && cfgService) {
      try {
        const envelopes = await cfgService.listEnvelopes(organizationId, publication.id);
        const active = (envelopes || []).find((e) => String(e.status || "") === "active");
        const envelopeId = active?.id;
        if (envelopeId) {
          const graph = await cfgService.getEnvelope(organizationId, envelopeId);
          const inferred = inferCustomerChoiceGroupsFromEnvelopeOptions(graph?.options || []);
          if (!customerChoiceGroups.length && inferred.length) {
            customerChoiceGroups = inferred;
          }
          if (!allowedOptionKeys.length) {
            const keys = (graph?.options || [])
              .map((o) => String(o.option_key || o.optionKey || ""))
              .filter((k) => k === "qty-sink" || k === "qty-ss" || k === "qty-cook");
            allowedOptionKeys = keys;
          }
        }
      } catch {
        /* hydration best-effort */
      }
    }

    if (!customerChoiceGroups.length && !allowedOptionKeys.length && !envelopeFingerprint) {
      return null;
    }

    const flags = inferFriendlyChoiceFlags({ customerChoiceGroups, allowedOptionKeys });
    const { legacyUnknown } = partitionAllowedOptionKeys(allowedOptionKeys);
    return {
      customerChoiceGroups,
      allowedOptionKeys,
      legacyUnknownKeys: legacyUnknown,
      choiceFlags: flags,
      envelopeFingerprint,
      pricingValidThrough: publication.pricing_valid_through
        ? String(publication.pricing_valid_through).slice(0, 10)
        : null,
      estimatorNotes:
        configEv?.metadata?.estimatorNotes != null
          ? String(configEv.metadata.estimatorNotes)
          : null
    };
  }

  function latestEnvelopeFingerprintFromEvents(events) {
    for (const e of events || []) {
      if (
        (e.event_type === "configuration_updated" || e.event_type === "published") &&
        e.metadata?.envelopeFingerprint
      ) {
        return String(e.metadata.envelopeFingerprint);
      }
    }
    return null;
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
      const fingerprint = latestEnvelopeFingerprintFromEvents(events);
      const publishedEv = (events || []).find((e) => e.event_type === "published");
      const meta = publishedEv?.metadata || {};
      const sameEnvelope =
        !envelopeFingerprint ||
        String(fingerprint || meta.envelopeFingerprint || "") === String(envelopeFingerprint);
      const sameKey =
        idempotencyKey &&
        String(meta.idempotencyKey || "") === String(idempotencyKey);
      // Same revision + same configuration fingerprint: reuse without mutation.
      if (sameEnvelope && (sameKey || !idempotencyKey || meta.idempotencyKey)) {
        return pub;
      }
      if (sameEnvelope) {
        return pub;
      }
    }
    return null;
  }

  /**
   * Active publication for the same estimate revision (fingerprint may differ).
   */
  async function findActivePublicationForSameRevision({
    organizationId,
    estimate,
    sourceQuoteFingerprint
  }) {
    const familyRoot = studioEstimatePublicationFamilyRoot(estimate);
    const active =
      typeof deRepository.listActivePublicationsForFamily === "function"
        ? await deRepository.listActivePublicationsForFamily(organizationId, familyRoot)
        : [];
    return (
      (active || []).find(
        (pub) => String(pub.source_quote_fingerprint) === String(sourceQuoteFingerprint)
      ) || null
    );
  }

  /**
   * True when Studio publish requested customer configuration (not document-only).
   * Do not infer from existing saved selections.
   */
  function configurationIntendsCustomerConfigure(configuration) {
    const cfg = configuration && typeof configuration === "object" ? configuration : {};
    if (cfg.enableConfiguration === true || cfg.configurationMode === "configure") return true;
    if (cfg.enableConfiguration === false || cfg.configurationMode === "document") return false;
    const groups = Array.isArray(cfg.customerChoiceGroups) ? cfg.customerChoiceGroups : [];
    const keys = Array.isArray(cfg.allowedOptionKeys) ? cfg.allowedOptionKeys : [];
    const materialIds = Array.isArray(cfg.allowedMaterialIds) ? cfg.allowedMaterialIds : [];
    const materialGroups = Array.isArray(cfg.allowedMaterialGroupCodes)
      ? cfg.allowedMaterialGroupCodes
      : Array.isArray(cfg.allowedMaterialGroups)
        ? cfg.allowedMaterialGroups
        : [];
    return groups.length > 0 || keys.length > 0 || materialIds.length > 0 || materialGroups.length > 0;
  }

  async function recordConfigurationFingerprintEvent({
    organizationId,
    publication,
    actorUserId,
    envelopeFingerprint,
    configuration,
    idempotencyKey
  }) {
    if (typeof deRepository.appendEvent !== "function") return;
    const cfg = configuration && typeof configuration === "object" ? configuration : {};
    try {
      await deRepository.appendEvent({
        organization_id: organizationId,
        publication_id: publication.id,
        source_quote_id: publication.source_quote_id,
        event_type: "configuration_updated",
        actor_type: "user",
        actor_user_id: actorUserId ?? null,
        metadata: {
          envelopeFingerprint,
          idempotencyKey: idempotencyKey || null,
          customerChoiceGroups: Array.isArray(cfg.customerChoiceGroups)
            ? normalizeCustomerChoiceGroups(cfg.customerChoiceGroups)
            : [],
          allowedOptionKeys: Array.isArray(cfg.allowedOptionKeys) ? cfg.allowedOptionKeys : [],
          estimatorNotes: cfg.estimatorNotes != null ? String(cfg.estimatorNotes).slice(0, 2000) : null
        }
      });
    } catch (e) {
      const pg = String(e?.code || e?.cause?.code || "");
      const msg = String(e?.message || "");
      if (pg === "23514" || /check constraint|event_type/i.test(msg)) {
        throw deError(
          "Configuration event contract rejected by database. Apply eliteos_digital_estimate_configuration_updated_event_v1.sql.",
          "DE-CONFIGURATION-CONTRACT-INVALID",
          422
        );
      }
      throw e;
    }
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
      {
        // Studio publish seeds options once via putOptions (batched). Avoid createDraft
        // double-seeding ~200 options with sequential Supabase round-trips.
        seedCatalogOptions: false,
        customerChoiceGroups: Array.isArray(cfg.customerChoiceGroups)
          ? cfg.customerChoiceGroups
          : undefined,
        configuration: cfg
      }
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

    // createDraft seeds one baseline material. Expand to estimator-allowed Elite 100
    // colors across allowed pricing groups (not only the originally published group).
    const baselineGroupCode = scopeMaterialGroupToCode(estimate.scope?.materialGroup) || "promo";
    const choiceGroups = new Set(
      normalizeCustomerChoiceGroups(
        Array.isArray(cfg.customerChoiceGroups) ? cfg.customerChoiceGroups : []
      )
    );
    const allowedIds = Array.isArray(cfg.allowedMaterialIds)
      ? cfg.allowedMaterialIds.map(String).filter(Boolean)
      : [];
    const allowedGroupCodesRaw = Array.isArray(cfg.allowedMaterialGroupCodes)
      ? cfg.allowedMaterialGroupCodes.map(String)
      : Array.isArray(cfg.allowedMaterialGroups)
        ? cfg.allowedMaterialGroups.map(String)
        : [];
    const allowedGroupCodes = new Set(
      allowedGroupCodesRaw
        .map((g) => scopeMaterialGroupToCode(g) || String(g).toLowerCase())
        .filter(Boolean)
    );
    const materialColorEnabled =
      choiceGroupEnabled(choiceGroups, "material_color") ||
      allowedIds.length > 0 ||
      allowedGroupCodes.size > 0;
    // Default: all customer groups except Remnant unless Remnant is explicitly allowed.
    if (materialColorEnabled && allowedGroupCodes.size === 0 && allowedIds.length === 0) {
      for (const code of ["promo", "group_a", "group_b", "group_c", "group_d", "group_e", "group_f"]) {
        allowedGroupCodes.add(code);
      }
      allowedGroupCodes.add(baselineGroupCode);
    }
    const catalogMaterials = listElite100CustomerMaterials(true).filter((m) => {
      if (allowedIds.length) return allowedIds.includes(m.materialId);
      return allowedGroupCodes.has(m.pricingGroupCode);
    });
    const defaultMat =
      pickDefaultMaterialForGroup(baselineGroupCode) ||
      catalogMaterials[0] ||
      null;
    const includedId =
      strOrNull(cfg.includedMaterialId || cfg.defaultMaterialId) ||
      defaultMat?.materialId ||
      null;
    const materialIdsToPublish = materialColorEnabled
      ? catalogMaterials.map((m) => m.materialId)
      : [];
    const rooms = Array.isArray(estimate.scope?.rooms)
      ? estimate.scope.rooms.filter((r) => r && r.included !== false)
      : [];
    const materialGroupRow = groups.find(
      (g) => String(g.group_key || g.groupKey) === "material_by_room"
    );
    const options = [];

    if (materialIdsToPublish.length && rooms.length && materialGroupRow?.id) {
      for (const room of rooms) {
        const roomKey = String(room.id || room.name);
        for (const materialId of materialIdsToPublish) {
          const mat = getElite100CustomerMaterial(materialId);
          if (!mat || !mat.customerVisible) {
            throw deError(
              `Material not customer-visible: ${materialId}`,
              "unknown_material",
              400
            );
          }
          if (
            allowedGroupCodes.size &&
            !allowedGroupCodes.has(mat.pricingGroupCode) &&
            !allowedIds.includes(materialId)
          ) {
            continue;
          }
          const isDefault = Boolean(includedId && materialId === includedId);
          options.push({
            groupId: materialGroupRow.id,
            optionKey: `material:${roomKey}:${materialId}`,
            displayLabel: mat.displayName,
            includedInBaseline: isDefault,
            defaultQty: isDefault ? 1 : 0,
            minQty: 0,
            maxQty: 1,
            // Room needs one material; do not pin requiredSelection to the baseline
            // color ID (that blocked saving alternate envelope option IDs).
            requiredSelection: false,
            customerPriceTreatment: "delta",
            pricingMode: "replacement",
            imageAssetRef: mat.imageThumbPath,
            compatibilityJson: {
              roomKey,
              materialColorId: materialId,
              materialGroup: mat.pricingGroupCode,
              role: "material_selection",
              isDefault
            }
          });
        }
      }
    }

    // Room-scoped fabrication / sink / faucet / backsplash / edge / specialty options
    // when estimator enabled them. ESF catalog products are seeded as family/SKU options
    // (Blanco color variants stay nested — not hundreds of top-level keys).
    let roomChoicesGroup = groups.find(
      (g) => String(g.group_key || g.groupKey) === "room_choices"
    );
    if (
      !roomChoicesGroup &&
      (choiceGroupEnabled(choiceGroups, "backsplash") ||
        choiceGroupEnabled(choiceGroups, "sink") ||
        choiceGroupEnabled(choiceGroups, "faucet") ||
        choiceGroupEnabled(choiceGroups, "accessories") ||
        choiceGroupEnabled(choiceGroups, "specialty") ||
        choiceGroupEnabled(choiceGroups, "edge") ||
        choiceGroupEnabled(choiceGroups, "side_splash") ||
        choiceGroupEnabled(choiceGroups, "cooktop_cutout"))
    ) {
      const created = await configurationStudioService.putGroups(organizationId, envelopeId, {
        groups: [
          {
            groupKey: "room_choices",
            displayLabel: "Room options",
            required: false,
            selectionMode: "multi",
            mutuallyExclusive: false
          }
        ]
      });
      roomChoicesGroup = created?.groups?.find(
        (g) => String(g.group_key || g.groupKey) === "room_choices"
      ) || created?.groups?.[0] || null;
    }

    if (roomChoicesGroup?.id && rooms.length) {
      const roomRows = rooms.map((room) => {
        const roomKey = String(room.id || room.name);
        return {
          roomKey,
          displayName: room.name || roomKey,
          roomType: inferRoomEligibilityType(room),
          includeBacksplash: room.includeBacksplash,
          backsplashHeightMode: room.backsplashHeightMode,
          backsplashHeightIn: room.backsplashHeightIn,
          backsplashSf: Number(room.backsplashSqft) || 0,
          backsplashMeasuredLengthIn: Number.isFinite(Number(room.backsplashMeasuredLengthIn))
            ? Number(room.backsplashMeasuredLengthIn)
            : null,
          pieces: Array.isArray(room.pieces) ? room.pieces : [],
          edgeMode: estimate.scope?.edgeMode || "included"
        };
      });
      const seeded = buildDefaultRoomProductOptions({
        rooms: roomRows,
        choiceGroups,
        groupId: roomChoicesGroup.id,
        estimateAddOns: estimate.scope?.addOns || {},
        estimateEdgeMode: estimate.scope?.edgeMode || "included",
        approvedEdgeModes: Array.isArray(cfg.allowedEdgeModes)
          ? cfg.allowedEdgeModes
          : undefined
      });
      for (const opt of seeded) {
        const priced = resolveOptionSellPriceFromCatalog(
          opt.optionKey,
          opt.compatibilityJson || {}
        );
        // Never pass sellPrice into putOptions — rejectClientAuthoritativeEconomics
        // treats it as caller authority; putOptions resolves price from catalog.
        const {
          sellPrice: _dropSellPrice,
          sell_price: _dropSellPriceSnake,
          price: _dropPrice,
          rate: _dropRate,
          ...safeOpt
        } = opt;
        options.push({
          ...safeOpt,
          availabilityState: priced.availabilityState || opt.availabilityState || "active"
        });
      }
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

      const correlationId =
        strOrNull(body?.correlationId) ||
        (typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `de-pub-${Date.now()}`);
      const t0 = Date.now();
      const phases = {};
      const mark = (name) => {
        phases[name] = Date.now() - t0;
      };
      const assertWithinBudget = (phase) => {
        if (Date.now() - t0 > STUDIO_PUBLISH_BUDGET_MS) {
          const err = deError(
            `Digital Estimate publish exceeded ${STUDIO_PUBLISH_BUDGET_MS}ms during ${phase}`,
            "DE-PUBLISH-TIMEOUT",
            504
          );
          err.correlationId = correlationId;
          err.phases = { ...phases };
          throw err;
        }
      };

      const rawConfiguration =
        body?.configuration && typeof body.configuration === "object" ? body.configuration : {};
      let configuration;
      try {
        configuration = {
          ...rawConfiguration,
          customerChoiceGroups: normalizeCustomerChoiceGroups(
            rawConfiguration.customerChoiceGroups || [],
            { rejectUnknown: true }
          )
        };
      } catch (e) {
        if (e?.code === "DE-CONFIGURATION-CONTRACT-INVALID") {
          throw deError(e.message, "DE-CONFIGURATION-CONTRACT-INVALID", 422);
        }
        throw e;
      }
      // Same validation function as readiness GET (including configuration envelope fields).
      const readiness = await assessReadiness(organizationId, estimateId, configuration);
      mark("validate_request");
      if (!readiness.readiness.eligible) {
        throw readinessFailureError(readiness.readiness);
      }

      const estimate = await loadEstimateRow(organizationId, estimateId);
      mark("load_estimate");
      const synthetic = buildSyntheticQuoteHeaderFromStudioEstimate(estimate, { organizationId });
      const pricingValidThrough =
        readiness.readiness.details?.pricingValidThrough ||
        addDaysDateOnly(readDigitalEstimatePricingValidDays(env));
      const catalogMeta = getCatalogMeta();
      const envelopeFingerprint = hashConfigurationEnvelope(configuration, {
        productCatalogFingerprint: catalogMeta.fingerprint
      });
      const idempotencyKey = strOrNull(body.idempotencyKey);
      const familyRoot = studioEstimatePublicationFamilyRoot(estimate);
      const priorActive =
        typeof deRepository.listActivePublicationsForFamily === "function"
          ? await deRepository.listActivePublicationsForFamily(organizationId, familyRoot)
          : [];
      const priorPublicationIds = (priorActive || []).map((p) => p.id).filter(Boolean);

      const freezeProbe = buildPublicationFreezePayloads({
        header: synthetic,
        publishedAt: new Date().toISOString(),
        pricingValidThrough
      });
      try {
        assertPublicDtoHasNoForbiddenContent(
          buildPublicDigitalEstimateDto(freezeProbe.customerSnapshot, { accessExpiresAt: null })
        );
      } catch (e) {
        const err = deError(
          e?.message || "Customer snapshot failed public safety checks",
          e?.code || "public_dto_leak",
          500
        );
        throw err;
      }

      const existing = await findIdempotentReuse({
        organizationId,
        estimate,
        envelopeFingerprint,
        idempotencyKey,
        sourceQuoteFingerprint: freezeProbe.sourceQuoteFingerprint
      });
      if (existing) {
        const intendsConfigure = configurationIntendsCustomerConfigure(configuration);
        if (intendsConfigure && configurationStudioService) {
          const envelopes = await configurationStudioService.listEnvelopes(
            organizationId,
            existing.id
          );
          const hasActive = (envelopes || []).some(
            (e) => String(e.status || "") === "active"
          );
          if (!hasActive) {
            assertWithinBudget("idempotent_repair");
            const repaired = await applyConfigurationEnvelope({
              organizationId,
              actorUserId,
              publicationId: existing.id,
              configuration,
              estimate
            });
            mark("repair_envelope");
            if (!repaired.configured) {
              throw deError(
                repaired.message ||
                  "Configuration envelope is required for this customer link but could not be activated",
                "DE-ENVELOPE-ACTIVATION-FAILED",
                422
              );
            }
          }
        }
        const linkMeta = await linkMetaForPublication(organizationId, existing);
        mark("build_response");
        console.info(
          JSON.stringify({
            msg: "studio_de_publish",
            correlationId,
            estimateId,
            reused: true,
            phases,
            elapsedMs: Date.now() - t0
          })
        );
        return {
          ok: true,
          reused: true,
          correlationId,
          phases,
          publication: staffPublicationView(existing, linkMeta),
          accessToken: null,
          customerUrl: linkMeta.customerUrl,
          linkStatus: linkMeta.linkStatus,
          readiness: readiness.readiness,
          envelope: intendsConfigure
            ? { configured: true, repaired: true }
            : { configured: false, reason: "document_only" },
          publishedConfiguration: {
            customerChoiceGroups: Array.isArray(configuration?.customerChoiceGroups)
              ? configuration.customerChoiceGroups
              : [],
            allowedOptionKeys: Array.isArray(configuration?.allowedOptionKeys)
              ? configuration.allowedOptionKeys
              : [],
            envelopeFingerprint
          },
          staffNotice:
            linkMeta.customerUrl
              ? "This revision is already published. The customer link is unchanged."
              : "Publication already exists for this revision. Use Replace Link to create a recoverable customer URL."
        };
      }

      // Same estimate revision, different configuration fingerprint → update envelope
      // on the active publication (do not claim "unchanged" and discard permissions).
      const sameRevisionPub = await findActivePublicationForSameRevision({
        organizationId,
        estimate,
        sourceQuoteFingerprint: freezeProbe.sourceQuoteFingerprint
      });
      if (sameRevisionPub) {
        const intendsConfigure = configurationIntendsCustomerConfigure(configuration);
        if (intendsConfigure && configurationStudioService) {
          assertWithinBudget("update_envelope");
          const updated = await applyConfigurationEnvelope({
            organizationId,
            actorUserId,
            publicationId: sameRevisionPub.id,
            configuration,
            estimate
          });
          mark("update_envelope");
          if (!updated.configured) {
            throw deError(
              updated.message ||
                "Configuration envelope could not be updated for the changed permissions",
              "DE-ENVELOPE-ACTIVATION-FAILED",
              422
            );
          }
          await recordConfigurationFingerprintEvent({
            organizationId,
            publication: sameRevisionPub,
            actorUserId,
            envelopeFingerprint,
            configuration,
            idempotencyKey
          });
          mark("record_config");
          const linkMeta = await linkMetaForPublication(organizationId, sameRevisionPub);
          console.info(
            JSON.stringify({
              msg: "studio_de_publish",
              correlationId,
              estimateId,
              reused: false,
              configurationUpdated: true,
              phases,
              elapsedMs: Date.now() - t0
            })
          );
          return {
            ok: true,
            reused: false,
            configurationUpdated: true,
            correlationId,
            phases,
            publication: staffPublicationView(sameRevisionPub, linkMeta),
            accessToken: null,
            customerUrl: linkMeta.customerUrl,
            linkStatus: linkMeta.linkStatus,
            readiness: readiness.readiness,
            envelope: { configured: true, updated: true },
            publishedConfiguration: {
              customerChoiceGroups: Array.isArray(configuration?.customerChoiceGroups)
                ? configuration.customerChoiceGroups
                : [],
              allowedOptionKeys: Array.isArray(configuration?.allowedOptionKeys)
                ? configuration.allowedOptionKeys
                : [],
              envelopeFingerprint
            },
            staffNotice:
              "Configuration permissions updated. The customer link is unchanged."
          };
        }
        // Document-only update on existing revision — treat as reuse.
        const linkMeta = await linkMetaForPublication(organizationId, sameRevisionPub);
        return {
          ok: true,
          reused: true,
          correlationId,
          phases,
          publication: staffPublicationView(sameRevisionPub, linkMeta),
          accessToken: null,
          customerUrl: linkMeta.customerUrl,
          linkStatus: linkMeta.linkStatus,
          readiness: readiness.readiness,
          envelope: { configured: false, reason: "document_only" },
          staffNotice:
            linkMeta.customerUrl
              ? "This revision is already published. The customer link is unchanged."
              : "Publication already exists for this revision."
        };
      }

      // Hosted FK: quote_publications.source_quote_id → quote_headers.id
      try {
        await ensureStudioEstimatePublicationSource({
          db: deps.getSupabase?.() || null,
          deRepository,
          organizationId,
          estimate,
          syntheticHeader: synthetic
        });
      } catch (e) {
        throw mapStudioPublicationPersistenceError(e);
      }
      mark("ensure_source");

      const wrapped = wrapRepositoryWithStudioHeader(deRepository, synthetic);
      let result;
      try {
        assertWithinBudget("create_publication");
        result = await publishDigitalEstimate({
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
              customerChoiceGroups: Array.isArray(configuration?.customerChoiceGroups)
                ? configuration.customerChoiceGroups
                : [],
              allowedOptionKeys: Array.isArray(configuration?.allowedOptionKeys)
                ? configuration.allowedOptionKeys
                : [],
              estimatorNotes:
                configuration?.estimatorNotes != null
                  ? String(configuration.estimatorNotes).slice(0, 2000)
                  : null,
              studioEstimateId: estimate.id,
              intakeCaseId: estimate.intakeCaseId || null,
              takeoffJobId: estimate.takeoffJobId || null,
              calculationFingerprint: estimate.approval?.calculationFingerprint || null,
              studioEstimateRevision: Number(estimate.revision) || 1,
              correlationId
            }
          }
        });
      } catch (e) {
        if (e?.statusCode && e.statusCode < 500) throw e;
        throw mapStudioPublicationPersistenceError(e);
      }
      mark("create_publication");

      const intendsConfigure = configurationIntendsCustomerConfigure(configuration);
      let envelope = { configured: false, reason: "document_only" };
      if (intendsConfigure) {
        try {
          assertWithinBudget("activate_envelope");
          envelope = await applyConfigurationEnvelope({
            organizationId,
            actorUserId,
            publicationId: result.publication.id,
            configuration,
            estimate
          });
          mark("activate_envelope");
        } catch (e) {
          if (e?.code === "DE-PUBLISH-TIMEOUT") throw e;
          envelope = {
            configured: false,
            reason: e?.code || "DE-ENVELOPE-ACTIVATION-FAILED",
            message: e?.message || "Configuration envelope failed"
          };
        }
        if (!envelope.configured) {
          // Configuration-enabled publish must not leave customers on a static-only link.
          try {
            await revokeDigitalEstimatePublication({
              env,
              organizationId,
              actorUserId,
              repository: deRepository,
              publicationId: result.publication.id,
              body: {
                confirm: true,
                reason:
                  "Configuration envelope activation failed — publication revoked to avoid static-only customer links"
              }
            });
          } catch {
            /* best-effort revoke */
          }
          await restorePriorPublicationsAfterFailedConfigure({
            organizationId,
            deRepository,
            priorPublicationIds,
            failedPublicationId: result.publication.id
          });
          mark("restore_prior_link");
          console.info(
            JSON.stringify({
              msg: "studio_de_publish_failed",
              correlationId,
              estimateId,
              code: "DE-ENVELOPE-ACTIVATION-FAILED",
              phases,
              elapsedMs: Date.now() - t0
            })
          );
          const failErr = deError(
            envelope.message ||
              "Customer configuration envelope could not be activated for this publication",
            "DE-ENVELOPE-ACTIVATION-FAILED",
            422
          );
          failErr.correlationId = correlationId;
          failErr.phases = { ...phases };
          throw failErr;
        }
      }

      mark("build_response");
      console.info(
        JSON.stringify({
          msg: "studio_de_publish",
          correlationId,
          estimateId,
          publicationId: result.publication?.id || null,
          configured: Boolean(envelope.configured),
          phases,
          elapsedMs: Date.now() - t0
        })
      );

      return {
        ...result,
        reused: false,
        correlationId,
        phases,
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
      const all = [...map.values()];
      const views = await staffPublicationViews(organizationId, all);
      const activeRaw = byFamily[0] || null;
      return {
        ok: true,
        publications: views,
        activePublication: activeRaw
          ? staffPublicationView(
              activeRaw,
              await linkMetaForPublication(organizationId, activeRaw)
            )
          : null
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
      const result = await replaceDigitalEstimateToken({
        env,
        organizationId,
        actorUserId,
        repository: deRepository,
        publicationId,
        body
      });
      return {
        ...result,
        linkStatus: "active"
      };
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
