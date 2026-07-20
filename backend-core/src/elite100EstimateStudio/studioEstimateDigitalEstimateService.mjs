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
  ensureStudioEstimatePublicationSource,
  mapStudioPublicationPersistenceError
} from "./studioEstimatePublicationSource.mjs";
import {
  buildDigitalEstimateCustomerUrl,
  buildLinkRecoveryDiagnostics,
  unwrapDigitalEstimateAccessTokenDetailed
} from "../digitalEstimate/digitalEstimateTokenWrap.mjs";
import {
  listElite100CustomerMaterials,
  getElite100CustomerMaterial,
  pickDefaultMaterialForGroup
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
   * @param {string} organizationId
   * @param {object} pub
   */
  async function linkMetaForPublication(organizationId, pub) {
    if (!pub?.id) {
      return {
        customerUrl: null,
        linkStatus: null,
        linkDiagnostics: buildLinkRecoveryDiagnostics(env, null, { code: null })
      };
    }
    if (pub.status === "revoked" || pub.revoked_at) {
      return {
        customerUrl: null,
        linkStatus: "revoked",
        linkDiagnostics: buildLinkRecoveryDiagnostics(env, null, {
          code: "publication_revoked",
          decryptSucceeded: false
        })
      };
    }
    if (pub.status === "superseded" || pub.superseded_at) {
      return {
        customerUrl: null,
        linkStatus: "superseded",
        linkDiagnostics: buildLinkRecoveryDiagnostics(env, null, {
          code: "publication_superseded",
          decryptSucceeded: false
        })
      };
    }
    if (pub.status !== "active") {
      return {
        customerUrl: null,
        linkStatus: String(pub.status || "invalid"),
        linkDiagnostics: buildLinkRecoveryDiagnostics(env, null, {
          code: "publication_inactive",
          decryptSucceeded: false
        })
      };
    }
    if (typeof deRepository.getActiveTokenForPublication !== "function") {
      return {
        customerUrl: null,
        linkStatus: "recovery_error",
        linkDiagnostics: buildLinkRecoveryDiagnostics(env, null, {
          code: "active_token_lookup_unavailable",
          decryptSucceeded: false
        }),
        linkError: {
          code: "active_token_lookup_unavailable",
          message: "Customer link recovery is unavailable on this Brain."
        }
      };
    }
    try {
      const counts =
        typeof deRepository.countTokensForPublication === "function"
          ? await deRepository.countTokensForPublication(organizationId, pub.id)
          : { activeTokenRows: null };
      const tokenRow = await deRepository.getActiveTokenForPublication(organizationId, pub.id);
      if (!tokenRow || tokenRow.revoked_at) {
        return {
          customerUrl: null,
          linkStatus: "needs_replace",
          linkDiagnostics: buildLinkRecoveryDiagnostics(env, tokenRow, {
            activeTokenRows: counts.activeTokenRows,
            decryptSucceeded: false,
            code: "active_token_missing"
          }),
          linkError: {
            code: "active_token_missing",
            message: "No active customer link token. Use Replace Link to create one."
          }
        };
      }
      const unwrapped = unwrapDigitalEstimateAccessTokenDetailed(tokenRow.token_wrapped, env, {
        tokenRow,
        activeTokenRows: counts.activeTokenRows
      });
      if (!unwrapped.ok) {
        // Never silently map decrypt/key failures to needs_replace.
        const message =
          unwrapped.code === "link_wrap_key_missing"
            ? "Customer link recovery key is missing on Brain. Set DIGITAL_ESTIMATE_LINK_WRAP_KEY and redeploy."
            : unwrapped.code === "token_wrapped_missing"
              ? "Customer link is not recoverable yet. Use Replace Link once (requires DIGITAL_ESTIMATE_LINK_WRAP_KEY)."
              : "Customer link could not be decrypted with the current wrap key. Verify DIGITAL_ESTIMATE_LINK_WRAP_KEY and Replace Link.";
        return {
          customerUrl: null,
          linkStatus: "recovery_error",
          linkDiagnostics: unwrapped.diagnostics,
          linkError: { code: unwrapped.code, message }
        };
      }
      return {
        customerUrl: buildDigitalEstimateCustomerUrl(unwrapped.rawToken, env),
        linkStatus: "active",
        linkDiagnostics: unwrapped.diagnostics
      };
    } catch (e) {
      return {
        customerUrl: null,
        linkStatus: "recovery_error",
        linkDiagnostics: buildLinkRecoveryDiagnostics(env, null, {
          code: e?.code || "link_recovery_failed",
          decryptSucceeded: false
        }),
        linkError: {
          code: e?.code || "link_recovery_failed",
          message: e?.message || "Unable to recover customer link."
        }
      };
    }
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
            selectedOptions: Array.isArray(snap.selectedOptions) ? snap.selectedOptions : []
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

    return {
      ok: true,
      readiness,
      estimate: studioEstimateService.safeEstimateView(estimate),
      preview,
      publications: publicationViews,
      activePublication,
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

    // createDraft seeds one baseline material. Expand to estimator-allowed Elite 100
    // colors across allowed pricing groups (not only the originally published group).
    const baselineGroupCode = scopeMaterialGroupToCode(estimate.scope?.materialGroup) || "promo";
    const choiceGroups = new Set(
      (Array.isArray(cfg.customerChoiceGroups) ? cfg.customerChoiceGroups : []).map(String)
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
      choiceGroups.has("materialColor") || allowedIds.length > 0 || allowedGroupCodes.size > 0;
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

    // Room-scoped fabrication / sink / backsplash / edge options when estimator enabled them.
    let roomChoicesGroup = groups.find(
      (g) => String(g.group_key || g.groupKey) === "room_choices"
    );
    if (
      !roomChoicesGroup &&
      (choiceGroups.has("backsplash") ||
        choiceGroups.has("sink") ||
        choiceGroups.has("edge") ||
        choiceGroups.has("cooktop"))
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

    for (const room of rooms) {
      const roomKey = String(room.id || room.name);
      if (choiceGroups.has("backsplash") && roomChoicesGroup?.id) {
        const heightMode = String(room.backsplashHeightMode || "").toLowerCase();
        const fullAllowed =
          heightMode === "full_height" ||
          heightMode === "custom" ||
          Number(room.backsplashHeightIn) > 4;
        const splashOpts = [
          { key: "none", label: "No backsplash", included: room.includeBacksplash === false },
          {
            key: "standard_4in",
            label: "4-inch backsplash",
            included: room.includeBacksplash !== false && !fullAllowed
          }
        ];
        if (fullAllowed) {
          splashOpts.push({
            key: "full_height",
            label: "Full-height backsplash",
            included: heightMode === "full_height" || Number(room.backsplashHeightIn) > 4
          });
        }
        for (const so of splashOpts) {
          options.push({
            groupId: roomChoicesGroup.id,
            optionKey: `backsplash:${roomKey}:${so.key}`,
            displayLabel: so.label,
            includedInBaseline: so.included,
            defaultQty: so.included ? 1 : 0,
            minQty: 0,
            maxQty: 1,
            requiredSelection: false,
            customerPriceTreatment: "delta",
            pricingMode: "replacement",
            compatibilityJson: {
              roomKey,
              role: "backsplash_selection",
              backsplashMode: so.key
            }
          });
        }
      }
      if (choiceGroups.has("sink") && roomChoicesGroup?.id) {
        for (const so of [
          { key: "stock", label: "Elite stock sink", included: Number(estimate.scope?.addOns?.["qty-sink"] || 0) > 0 },
          { key: "customer", label: "Customer-supplied sink", included: false },
          { key: "none", label: "No sink", included: Number(estimate.scope?.addOns?.["qty-sink"] || 0) <= 0 }
        ]) {
          options.push({
            groupId: roomChoicesGroup.id,
            optionKey: `sink:${roomKey}:${so.key}`,
            displayLabel: so.label,
            includedInBaseline: so.included,
            defaultQty: so.included ? 1 : 0,
            minQty: 0,
            maxQty: 1,
            customerPriceTreatment: "delta",
            pricingMode: "replacement",
            compatibilityJson: { roomKey, role: "sink_selection", sinkMode: so.key }
          });
        }
      }
      if (choiceGroups.has("edge") && roomChoicesGroup?.id) {
        for (const so of [
          { key: "eased", label: "Eased edge", included: true },
          { key: "w_edge", label: "W edge", included: false },
          { key: "d_edge", label: "D edge", included: false }
        ]) {
          options.push({
            groupId: roomChoicesGroup.id,
            optionKey: `edge:${roomKey}:${so.key}`,
            displayLabel: so.label,
            includedInBaseline: so.included,
            defaultQty: so.included ? 1 : 0,
            minQty: 0,
            maxQty: 1,
            customerPriceTreatment: "delta",
            pricingMode: "per_lf",
            compatibilityJson: { roomKey, role: "edge_selection", edgeMode: so.key }
          });
        }
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

      const configuration =
        body?.configuration && typeof body.configuration === "object" ? body.configuration : {};
      // Same validation function as readiness GET (including configuration envelope fields).
      const readiness = await assessReadiness(organizationId, estimateId, configuration);
      if (!readiness.readiness.eligible) {
        throw readinessFailureError(readiness.readiness);
      }

      const estimate = await loadEstimateRow(organizationId, estimateId);
      const synthetic = buildSyntheticQuoteHeaderFromStudioEstimate(estimate, { organizationId });
      const pricingValidThrough =
        readiness.readiness.details?.pricingValidThrough ||
        addDaysDateOnly(readDigitalEstimatePricingValidDays(env));
      const envelopeFingerprint = hashConfigurationEnvelope(configuration);
      const idempotencyKey = strOrNull(body.idempotencyKey);

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
        const linkMeta = await linkMetaForPublication(organizationId, existing);
        return {
          ok: true,
          reused: true,
          publication: staffPublicationView(existing, linkMeta),
          accessToken: null,
          customerUrl: linkMeta.customerUrl,
          linkStatus: linkMeta.linkStatus,
          readiness: readiness.readiness,
          staffNotice:
            linkMeta.customerUrl
              ? "Publication already exists for this approved estimate revision and configuration. Customer URL is unchanged."
              : "Publication already exists for this revision. Use Replace Link to create a recoverable customer URL."
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

      const wrapped = wrapRepositoryWithStudioHeader(deRepository, synthetic);
      let result;
      try {
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
              studioEstimateId: estimate.id,
              intakeCaseId: estimate.intakeCaseId || null,
              takeoffJobId: estimate.takeoffJobId || null,
              calculationFingerprint: estimate.approval?.calculationFingerprint || null,
              studioEstimateRevision: Number(estimate.revision) || 1
            }
          }
        });
      } catch (e) {
        if (e?.statusCode && e.statusCode < 500) throw e;
        throw mapStudioPublicationPersistenceError(e);
      }

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
