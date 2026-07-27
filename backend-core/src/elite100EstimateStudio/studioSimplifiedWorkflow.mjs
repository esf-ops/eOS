/**
 * Elite 100 simplified estimating workflow — product orchestration.
 *
 * Estimator-facing path:
 *   Inbox → Start Estimate → Scope → Customer Choices → Review & Publish
 *
 * Internal compatibility still uses confirm / calculate / approve, but those
 * are orchestrated by Publish (and autosave/auto-calc), not estimator clicks.
 *
 * Does not: email, auto-sold, QuickBooks, Moraware, quote_headers writes,
 * or change Internal Estimate / legacy Quote Library.
 */

import { isSoldReviewChecklistComplete } from "./studioLifecycleTypes.mjs";

export const SIMPLIFIED_STUDIO_NAV = Object.freeze({
  INBOX: "inbox",
  ESTIMATES: "estimates"
});

export const SIMPLIFIED_ESTIMATE_SECTIONS = Object.freeze({
  SCOPE: "scope",
  CUSTOMER_CHOICES: "customer_choices",
  REVIEW_PUBLISH: "review_publish"
});

/** Estimator commitment actions that require deliberate confirmation. */
export const SIMPLIFIED_COMMITMENT_ACTIONS = Object.freeze({
  PUBLISH: "publish_digital_estimate",
  ACCEPT: "customer_accept_estimate",
  MARK_SOLD: "mark_sold"
});

/** Inbox estimate status chips (business language). */
export const INBOX_ESTIMATE_STATUS = Object.freeze({
  NOT_STARTED: "not_started",
  IN_PROGRESS: "in_progress",
  PUBLISHED: "published",
  ACCEPTED: "accepted",
  SOLD: "sold"
});

export const INBOX_ESTIMATE_STATUS_LABELS = Object.freeze({
  not_started: "Not Started",
  in_progress: "In Progress",
  published: "Published",
  accepted: "Accepted",
  sold: "Sold"
});

/** Consolidated Estimates registry filters. */
export const ESTIMATES_REGISTRY_FILTERS = Object.freeze({
  needs_attention: "needs_attention",
  draft: "draft",
  published: "published",
  changes_requested: "changes_requested",
  accepted: "accepted",
  awaiting_sold_review: "awaiting_sold_review",
  sold: "sold",
  archived: "archived"
});

export const AUTOSAVE_STATUS = Object.freeze({
  IDLE: "idle",
  SAVING: "saving",
  SAVED: "saved",
  FAILED: "failed",
  CONFLICT: "conflict"
});

export const AUTOSAVE_STATUS_LABELS = Object.freeze({
  idle: "",
  saving: "Saving…",
  saved: "Saved",
  failed: "Save failed — Retry",
  conflict: "Another user changed this estimate"
});

export const CALC_STATUS = Object.freeze({
  IDLE: "idle",
  UPDATING: "updating",
  UPDATED: "updated",
  NEEDS_ATTENTION: "needs_attention"
});

export const CALC_STATUS_LABELS = Object.freeze({
  idle: "",
  updating: "Updating price…",
  updated: "Price updated",
  needs_attention: "Pricing needs attention"
});

/**
 * Buttons / labels that must not appear as required estimator gates.
 */
export const OBSOLETE_ESTIMATOR_GATE_LABELS = Object.freeze([
  "Import and open",
  "Import",
  "Approve Takeoff",
  "Approve Takeoff & Build Estimate",
  "Build Estimate",
  "Confirm Scope",
  "Confirm Manual Scope",
  "Save Draft",
  "Save Manual Scope",
  "Calculate",
  "Calculate Estimate",
  "Approve Estimate",
  "Approve Commercial Estimate"
]);

/**
 * Map legacy inbox primary actions onto simplified Start / Resume / View Plans.
 * Keeps mutates semantics; rewrites keys + labels for the product surface.
 */
export function simplifyInboxPrimaryAction(primaryAction, row = {}) {
  const src = primaryAction && typeof primaryAction === "object" ? primaryAction : {};
  const key = String(src.key || "").trim();
  const openTarget = src.openTarget || "scope";
  const hasEstimate = Boolean(row.estimateId || row.activeEstimateId || row.intakeCaseId);

  if (
    key === "import_and_open" ||
    key === "retry_import" ||
    key === "create_manual_estimate"
  ) {
    return {
      key: "start_estimate",
      label: "Start Estimate",
      openTarget: key === "create_manual_estimate" ? "scope" : openTarget === "takeoff" ? "scope" : openTarget,
      mutates: true,
      legacyKey: key
    };
  }

  if (
    key === "open_estimate" ||
    key === "view_progress" ||
    key === "review_ai_takeoff" ||
    key === "review_request"
  ) {
    return {
      key: hasEstimate || key !== "open_estimate" ? "resume_estimate" : "start_estimate",
      label: hasEstimate ? "Resume Estimate" : "Start Estimate",
      openTarget: "scope",
      mutates: false,
      legacyKey: key
    };
  }

  if (key === "start_estimate" || key === "resume_estimate" || key === "view_plans") {
    return {
      key,
      label:
        src.label ||
        (key === "start_estimate"
          ? "Start Estimate"
          : key === "resume_estimate"
            ? "Resume Estimate"
            : "View Plans"),
      openTarget: src.openTarget || "scope",
      mutates: Boolean(src.mutates),
      legacyKey: src.legacyKey || null
    };
  }

  return {
    key: key || "start_estimate",
    label: src.label || "Start Estimate",
    openTarget: openTarget || "scope",
    mutates: Boolean(src.mutates),
    legacyKey: key || null
  };
}

/**
 * Derive inbox estimate status chip from queue / lifecycle overlay.
 */
export function deriveInboxEstimateStatus(row = {}) {
  const lifecycle = String(row.lifecycleStatus || row.lifecycle_status || "").toLowerCase();
  const sold =
    lifecycle === "sold" ||
    Boolean(row.soldAt || row.sold_at || row.hasSoldSnapshot);
  if (sold) return INBOX_ESTIMATE_STATUS.SOLD;

  const accepted =
    lifecycle === "accepted_awaiting_sold_review" ||
    Boolean(row.acceptedAt || row.accepted_at || row.hasAcceptance);
  if (accepted) return INBOX_ESTIMATE_STATUS.ACCEPTED;

  const pub = String(row.publicationStatus || row.digitalEstimateStatus || "").toLowerCase();
  const published =
    lifecycle === "published" ||
    lifecycle === "changes_requested" ||
    pub === "active" ||
    pub === "published" ||
    Boolean(row.hasActivePublication);
  if (published) return INBOX_ESTIMATE_STATUS.PUBLISHED;

  if (row.estimateId || row.activeEstimateId || row.studioEstimateId) {
    return INBOX_ESTIMATE_STATUS.IN_PROGRESS;
  }
  return INBOX_ESTIMATE_STATUS.NOT_STARTED;
}

/**
 * Scope readiness from validation — no Confirm Scope button.
 * @returns {{ ready: boolean, status: 'scope_ready'|'scope_needs_attention', issues: Array<{code:string,message:string}> }}
 */
export function deriveScopeReadiness(estimate) {
  const issues = [];
  const scope = estimate?.scope && typeof estimate.scope === "object" ? estimate.scope : {};
  const rooms = Array.isArray(scope.rooms) ? scope.rooms : [];
  const pieces = Array.isArray(scope.pieces)
    ? scope.pieces
    : rooms.flatMap((r) => (Array.isArray(r?.pieces) ? r.pieces.map((p) => ({ ...p, roomId: r.id })) : []));

  const includedPieces = pieces.filter((p) => p && p.excluded !== true && p.include !== false);
  if (rooms.length === 0 && includedPieces.length === 0) {
    const manual = scope.manualPhysicalScope;
    const manualRooms = Array.isArray(manual?.rooms) ? manual.rooms : [];
    if (manualRooms.length === 0) {
      issues.push({
        code: "missing_room",
        message: "Add at least one room to define fabrication scope."
      });
    } else {
      for (const room of manualRooms) {
        if (room?.included === false) continue;
        const rPieces = Array.isArray(room.pieces) ? room.pieces : [];
        for (const piece of rPieces) {
          if (piece?.included === false || piece?.excluded === true) continue;
          const len = Number(piece.lengthIn ?? piece.length_in ?? piece.length);
          const depth = Number(piece.depthIn ?? piece.depth_in ?? piece.depth);
          const qty = Number(piece.quantity ?? piece.qty ?? 1);
          if (!Number.isFinite(len) || len <= 0) {
            issues.push({
              code: "missing_length",
              message: `Piece length required for ${piece.name || piece.id || "a piece"}.`
            });
          }
          if (!Number.isFinite(depth) || depth <= 0) {
            const directSf = Number(piece.directSf ?? piece.areaSf);
            if (!Number.isFinite(directSf) || directSf <= 0) {
              issues.push({
                code: "missing_depth",
                message: `Piece depth (or area) required for ${piece.name || piece.id || "a piece"}.`
              });
            }
          }
          if (!Number.isFinite(qty) || qty <= 0) {
            issues.push({
              code: "invalid_quantity",
              message: `Invalid quantity for ${piece.name || piece.id || "a piece"}.`
            });
          }
        }
        if (room.backsplashOffered || room.offerBacksplash) {
          const eligible = Number(
            room.backsplashEligibleLf ??
              room.backsplash_eligible_lf ??
              room.backsplashMeasuredLf ??
              room.backsplash?.eligibleLf
          );
          if (!Number.isFinite(eligible) || eligible < 0) {
            issues.push({
              code: "missing_backsplash_eligible_length",
              message: `Set backsplash-eligible length for ${room.name || "room"}.`
            });
          }
        }
      }
    }
  } else {
    for (const piece of includedPieces) {
      const len = Number(piece.lengthIn ?? piece.length_in ?? piece.length);
      const depth = Number(piece.depthIn ?? piece.depth_in ?? piece.depth);
      const qty = Number(piece.quantity ?? piece.qty ?? 1);
      if (!Number.isFinite(len) || len <= 0) {
        issues.push({
          code: "missing_length",
          message: `Piece length required for ${piece.name || piece.id || "a piece"}.`
        });
      }
      if (!Number.isFinite(depth) || depth <= 0) {
        const directSf = Number(piece.directSf ?? piece.areaSf);
        if (!Number.isFinite(directSf) || directSf <= 0) {
          issues.push({
            code: "missing_depth",
            message: `Piece depth (or area) required for ${piece.name || piece.id || "a piece"}.`
          });
        }
      }
      if (!Number.isFinite(qty) || qty <= 0) {
        issues.push({
          code: "invalid_quantity",
          message: `Invalid quantity for ${piece.name || piece.id || "a piece"}.`
        });
      }
    }
  }

  const ready = issues.length === 0;
  return {
    ready,
    status: ready ? "scope_ready" : "scope_needs_attention",
    label: ready ? "Scope ready" : "Scope needs attention",
    issues
  };
}

/**
 * Canonical backsplash-eligible length authority for Studio.
 * Physical length lives on Scope (room). Customer Choices only offer types.
 */
export function readBacksplashEligibleLf(room) {
  if (!room || typeof room !== "object") return null;
  const candidates = [
    room.backsplashEligibleLf,
    room.backsplash_eligible_lf,
    room.backsplashMeasuredLf,
    room.backsplash?.eligibleLf,
    room.backsplash?.measuredLf,
    room.backsplash?.lengthLf
  ];
  for (const c of candidates) {
    const n = Number(c);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return null;
}

/**
 * Autosave concurrency helper — reject stale server responses.
 */
export function shouldApplyAutosaveResponse({
  localMutationRevision,
  responseMutationRevision,
  requestStartedAt,
  latestEditAt
}) {
  if (latestEditAt != null && requestStartedAt != null && Number(latestEditAt) > Number(requestStartedAt)) {
    return { apply: false, reason: "local_edits_newer" };
  }
  if (
    localMutationRevision != null &&
    responseMutationRevision != null &&
    Number(responseMutationRevision) < Number(localMutationRevision)
  ) {
    return { apply: false, reason: "stale_response_revision" };
  }
  return { apply: true, reason: null };
}

/**
 * Stale calculation response rejection.
 */
export function shouldApplyCalculationResponse({
  requestCalcToken,
  latestCalcToken,
  responseFingerprint
}) {
  if (requestCalcToken != null && latestCalcToken != null && requestCalcToken !== latestCalcToken) {
    return { apply: false, reason: "stale_calculation_token" };
  }
  if (responseFingerprint == null) {
    return { apply: false, reason: "missing_fingerprint" };
  }
  return { apply: true, reason: null };
}

/**
 * Map registry filter to all-estimates / lifecycle predicates.
 */
export function matchEstimatesRegistryFilter(row, filter) {
  const f = String(filter || "").trim().toLowerCase();
  if (!f || f === "all") return true;
  const lifecycle = String(row.lifecycleStatus || "").toLowerCase();
  const commercial = String(row.commercialStatus || row.status || "").toLowerCase();
  switch (f) {
    case ESTIMATES_REGISTRY_FILTERS.needs_attention:
      return (
        Boolean(row.needsAttention) ||
        lifecycle === "changes_requested" ||
        row.reviewRequestStatus === "open" ||
        commercial === "draft" ||
        commercial === "ready_to_price" ||
        commercial === "priced"
      );
    case ESTIMATES_REGISTRY_FILTERS.draft:
      return (
        !row.hasActivePublication &&
        lifecycle !== "sold" &&
        lifecycle !== "accepted_awaiting_sold_review" &&
        lifecycle !== "archived"
      );
    case ESTIMATES_REGISTRY_FILTERS.published:
      return lifecycle === "published" || row.publicationStatus === "active";
    case ESTIMATES_REGISTRY_FILTERS.changes_requested:
      return lifecycle === "changes_requested" || row.reviewRequestStatus === "open";
    case ESTIMATES_REGISTRY_FILTERS.accepted:
    case ESTIMATES_REGISTRY_FILTERS.awaiting_sold_review:
      return lifecycle === "accepted_awaiting_sold_review";
    case ESTIMATES_REGISTRY_FILTERS.sold:
      return lifecycle === "sold";
    case ESTIMATES_REGISTRY_FILTERS.archived:
      return lifecycle === "archived" || Boolean(row.archived);
    default:
      return true;
  }
}

/**
 * Build customer-safe frozen option package summary (no internal economics).
 */
export function buildFrozenCustomerOptionPackageSummary({
  estimate,
  configuration = {},
  customerDisplayTotal = null
} = {}) {
  const scope = estimate?.scope || {};
  const cfg = configuration && typeof configuration === "object" ? configuration : {};
  const groups = Array.isArray(cfg.customerChoiceGroups)
    ? cfg.customerChoiceGroups
    : Array.isArray(cfg.allowedOptionKeys)
      ? cfg.allowedOptionKeys.map((k) => ({ key: k }))
      : [];

  const packageJson = {
    version: "studio_frozen_option_package_v1",
    approvedBaseCustomerTotal:
      customerDisplayTotal ??
      estimate?.approval?.customerDisplayTotal ??
      estimate?.calculationSnapshot?.totals?.customerDisplayTotal ??
      null,
    allowedMaterialGroups: cfg.allowedMaterialGroups || scope.allowedMaterialGroups || null,
    allowedColors: cfg.allowedColors || null,
    textureImageRefs: cfg.textureImageRefs || cfg.visualAssetRefs || null,
    allowedEdgeChoices: cfg.allowedEdgeModes || cfg.approvedEdgeModes || null,
    allowedBacksplashChoices: cfg.allowedBacksplashModes || null,
    allowedProducts: cfg.allowedProducts || cfg.productRefs || null,
    defaultSelections: cfg.defaults || cfg.defaultSelections || null,
    validCombinations: cfg.validCombinations || null,
    customerSafePriceEffects: cfg.priceEffects || null,
    termsVersion: cfg.termsVersion || null,
    frozenScopeSummary: {
      roomCount: Array.isArray(scope.rooms) ? scope.rooms.length : null,
      projectName: scope.projectName || null,
      customerName: scope.customerName || null
    },
    choiceGroups: groups.map((g) => ({
      key: g.key || g.id || null,
      label: g.label || null
    }))
  };

  const serialized = JSON.stringify(packageJson).toLowerCase();
  const forbidden = [
    "exactinternaltotal",
    "internal_only",
    "internalmarkup",
    "internal_markup",
    "absorbed",
    "margin",
    "wholesale",
    "fabricationformula",
    "rawmaterialrate"
  ];
  for (const f of forbidden) {
    if (serialized.includes(f)) {
      const err = new Error("Frozen option package leaked internal pricing data");
      err.code = "frozen_package_leak";
      err.statusCode = 500;
      throw err;
    }
  }
  return packageJson;
}

/**
 * Assert obsolete gate labels are absent from a primary UI surface string.
 */
export function assertNoObsoleteEstimatorGates(uiSource, { allowAdvancedSection = false } = {}) {
  const src = String(uiSource || "");
  const hits = [];
  for (const label of OBSOLETE_ESTIMATOR_GATE_LABELS) {
    if (allowAdvancedSection && /advanced/i.test(label)) continue;
    // Allow comments / compatibility wrappers mentioning legacy keys
    const re = new RegExp(`>(\\s*)${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s*)<|"${label}"|'${label}'`, "i");
    if (src.includes(label) && (re.test(src) || src.includes(`>${label}<`))) {
      hits.push(label);
    }
  }
  return { ok: hits.length === 0, hits };
}

/**
 * Create simplified workflow orchestration service.
 *
 * @param {{
 *   sharedInboxService: any,
 *   studioEstimateService: any,
 *   manualEstimateService?: any,
 *   digitalEstimateService: any,
 *   approveTakeoffJob?: Function,
 *   env?: NodeJS.ProcessEnv
 * }} deps
 */
export function createStudioSimplifiedWorkflowService(deps) {
  const {
    sharedInboxService,
    studioEstimateService,
    manualEstimateService,
    digitalEstimateService,
    approveTakeoffJob = null
  } = deps;
  const env = deps.env || process.env;

  if (!sharedInboxService) throw new Error("sharedInboxService required");
  if (!studioEstimateService) throw new Error("studioEstimateService required");
  if (!digitalEstimateService) throw new Error("digitalEstimateService required");

  /**
   * One-click Start Estimate — idempotent import + estimate ensure.
   */
  async function startEstimate({
    organizationId,
    actorUserId,
    messageKey,
    idempotencyKey = null,
    forceManual = false
  }) {
    const imported = await sharedInboxService.importMessage({
      organizationId,
      actorUserId,
      messageKey,
      idempotencyKey: idempotencyKey || `start-estimate:${organizationId}:${messageKey}`,
      forceManual: Boolean(forceManual)
    });

    const intakeCaseId = imported?.intakeCaseId || imported?.caseId || null;
    if (!intakeCaseId) {
      const err = new Error("Unable to start estimate from this message");
      err.statusCode = 409;
      err.code = "start_estimate_failed";
      throw err;
    }

    let estimate = null;
    if (typeof studioEstimateService.getOrCreateForCase === "function") {
      estimate = await studioEstimateService.getOrCreateForCase({
        organizationId,
        intakeCaseId,
        actorUserId
      });
    }

    return {
      ok: true,
      reused: Boolean(imported?.reused || imported?.alreadyImported),
      intakeCaseId,
      estimateId: estimate?.id || imported?.estimateId || null,
      openTarget: SIMPLIFIED_ESTIMATE_SECTIONS.SCOPE,
      section: SIMPLIFIED_ESTIMATE_SECTIONS.SCOPE,
      sideEffects: {
        emailSent: false,
        publicationChanged: false,
        quickbooksWritten: false,
        morawareWritten: false,
        markedSold: false
      }
    };
  }

  /**
   * Orchestrate internal confirm → calculate → approve for one-step Publish.
   * Does not publish; caller publishes after this succeeds.
   * On failure, no approve/publish is committed beyond what calculate may persist
   * as a non-approved priced snapshot (compatible with existing services).
   */
  async function prepareEstimateForPublish({
    organizationId,
    estimateId,
    actorUserId
  }) {
    const steps = [];
    let estimate =
      typeof studioEstimateService.getById === "function"
        ? await studioEstimateService.getById(organizationId, estimateId)
        : null;
    if (!estimate) {
      const err = new Error("Estimate not found");
      err.statusCode = 404;
      err.code = "estimate_not_found";
      throw err;
    }

    const scopeReady = deriveScopeReadiness(estimate);
    if (!scopeReady.ready) {
      const err = new Error(scopeReady.issues[0]?.message || "Scope needs attention");
      err.statusCode = 422;
      err.code = "scope_needs_attention";
      err.issues = scopeReady.issues;
      throw err;
    }
    steps.push("scope_validated");

    // Auto-confirm manual scope when still unconfirmed (compatibility state).
    const isManual =
      estimate?.scope?.estimateOrigin === "manual_staff" ||
      estimate?.scope?.physicalScopeSource === "manual_staff";
    const confirmed = Boolean(estimate?.scope?.manualScopeConfirmed);
    if (isManual && !confirmed && manualEstimateService?.confirmManualScope) {
      estimate = await manualEstimateService.confirmManualScope({
        organizationId,
        estimateId,
        actorUserId,
        body: {}
      });
      steps.push("manual_scope_auto_confirmed");
    }

    // Optional: auto-approve takeoff when present and not yet approved.
    if (
      estimate?.takeoffJobId &&
      typeof approveTakeoffJob === "function" &&
      !isManual
    ) {
      try {
        await approveTakeoffJob({
          organizationId,
          takeoffJobId: estimate.takeoffJobId,
          actorUserId,
          env
        });
        steps.push("takeoff_auto_approved");
        if (typeof studioEstimateService.refreshScopeFromTakeoff === "function") {
          estimate = await studioEstimateService.refreshScopeFromTakeoff({
            organizationId,
            estimateId,
            actorUserId,
            force: false
          });
          steps.push("scope_refreshed_from_takeoff");
        }
      } catch (e) {
        // If takeoff cannot auto-approve, continue when estimate already has priced/approved path
        // or when readiness will surface the blocker.
        if (e?.code && String(e.code).includes("takeoff")) {
          /* fall through — publish readiness reports exact blocker */
        } else if (e?.statusCode === 409 || e?.statusCode === 422) {
          const err = new Error(e.message || "Takeoff needs attention before publish");
          err.statusCode = 422;
          err.code = e.code || "takeoff_needs_attention";
          err.cause = e;
          throw err;
        }
      }
    }

    // Authoritative calculate (always from persisted estimate).
    estimate = await studioEstimateService.calculate({
      organizationId,
      estimateId,
      actorUserId,
      body: {}
    });
    steps.push("calculated");

    // Commercial approval is Publish's internal commitment — not a separate UI gate.
    estimate = await studioEstimateService.approve({
      organizationId,
      estimateId,
      actorUserId,
      body: { confirm: true }
    });
    steps.push("commercially_approved");

    return { estimate, steps };
  }

  /**
   * One-step Publish Digital Estimate — atomic from estimator POV.
   * confirm: true required. No email / sold / QB / Moraware.
   */
  async function publishDigitalEstimate({
    organizationId,
    estimateId,
    actorUserId,
    body = {}
  }) {
    if (body?.confirm !== true && body?.confirm !== "true") {
      const err = new Error("Confirm Publish Digital Estimate to continue");
      err.statusCode = 400;
      err.code = "confirm_required";
      throw err;
    }

    const prepared = await prepareEstimateForPublish({
      organizationId,
      estimateId,
      actorUserId
    });

    const publication = await digitalEstimateService.publish({
      organizationId,
      estimateId,
      actorUserId,
      body: {
        ...body,
        confirm: true
      }
    });

    const frozenOptionPackage = buildFrozenCustomerOptionPackageSummary({
      estimate: prepared.estimate,
      configuration: body?.configuration,
      customerDisplayTotal:
        publication?.customerDisplayTotal ??
        prepared.estimate?.approval?.customerDisplayTotal ??
        null
    });

    return {
      ok: true,
      preparedSteps: prepared.steps,
      publication,
      frozenOptionPackage,
      customerUrl: publication?.customerUrl || publication?.publication?.customerUrl || null,
      sideEffects: {
        emailSent: false,
        publicationReplaced: Boolean(publication?.replaced),
        quickbooksWritten: false,
        morawareWritten: false,
        markedSold: false,
        automaticSold: false
      }
    };
  }

  /**
   * Mark message viewed without starting an estimate.
   */
  async function markInboxViewed({ organizationId, actorUserId, messageKey }) {
    if (typeof sharedInboxService.markViewed === "function") {
      return sharedInboxService.markViewed({ organizationId, actorUserId, messageKey });
    }
    // Compatibility: no persistence yet — return viewed view-model only.
    return {
      ok: true,
      messageKey,
      viewed: true,
      viewedAt: new Date().toISOString(),
      persistence: "ephemeral"
    };
  }

  return {
    startEstimate,
    prepareEstimateForPublish,
    publishDigitalEstimate,
    markInboxViewed,
    deriveScopeReadiness,
    matchEstimatesRegistryFilter,
    buildFrozenCustomerOptionPackageSummary,
    canMarkSoldChecklistComplete: isSoldReviewChecklistComplete
  };
}
