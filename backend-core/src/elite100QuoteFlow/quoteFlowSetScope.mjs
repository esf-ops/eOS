/**
 * Quote Flow Scope Creation Queue — Set Scope from AI Takeoff or manual rooms.
 * No calculate / estimate-approve / publish / accept / sold.
 * Already-scoped items belong in Estimates, not the main queue.
 */

import { createQuoteFlowError } from "./quoteFlowErrors.mjs";
import { applyTakeoffCutoutsToOfficialRooms } from "./quoteFlowCutouts.mjs";
import { normalizeVanityQuotedDepth } from "./quoteFlowVanityDepth.mjs";
import {
  applyTakeoffOpenEdgeLfToOfficialRooms,
  stampOpenEdgeLfOnTakeoffResult,
  syncPieceOpeningsIntoOfficialScopeAddOns
} from "./quoteFlowOpenEdge.mjs";
import { validateAndNormalizeOfficialScopeRooms } from "./quoteFlowEstimates.mjs";
import {
  groupQuoteFlowQueueItems,
  presentQuoteFlowQueueItem,
  resolveQuoteFlowQueueItemKey,
  sortQuoteFlowQueueItems
} from "./quoteFlowQueuePresenter.mjs";
import {
  isMeaningfulQuoteName,
  persistQuoteFlowQuoteName
} from "./quoteFlowQueueSourceMeta.mjs";
import {
  createMemoryQuoteFlowQueueStateStore,
  createQuoteFlowQueueStateStore
} from "./quoteFlowQueueStateStore.mjs";
import { isOfficialScopeSet } from "./quoteFlowScope.mjs";

const NO_SIDE_EFFECTS = Object.freeze({
  calculated: false,
  approved: false,
  published: false,
  sold: false,
  accepted: false,
  digitalEstimateCreated: false,
  takeoffRerun: false,
  takeoffCancelled: false,
  takeoffDeleted: false,
  intakeDeleted: false,
  estimateDeleted: false,
  emailDeleted: false
});

const QUEUE_STATUS_KEYS = new Set([
  "ready_for_review",
  "takeoff_processing",
  "takeoff_queued",
  "takeoff_failed",
  "manual_scope_needed"
]);

/**
 * @param {{
 *   queueService: { listQueue: Function },
 *   estimateRepository?: { getActiveByIntakeCase?: Function, getById?: Function }|null,
 *   studioEstimateService?: {
 *     getOrCreateForCase?: Function,
 *     refreshScopeFromTakeoff?: Function,
 *     updateScope?: Function,
 *     repository?: object
 *   }|null,
 *   approveAndBuildEstimate?: Function|null,
 *   reopenTakeoffJobForMeasurementRevision?: Function|null,
 *   getTakeoffWorkspace?: Function|null,
 *   getLatestTakeoffResult?: Function|null,
 *   queueStateStore?: ReturnType<typeof createQuoteFlowQueueStateStore>|null,
 *   getSupabase?: Function|null,
 *   env?: NodeJS.ProcessEnv
 * }} deps
 */
export function createQuoteFlowSetScopeService(deps) {
  const queueService = deps.queueService;
  if (!queueService?.listQueue) {
    throw new Error("createQuoteFlowSetScopeService: queueService.listQueue required");
  }
  const estimateRepository =
    deps.estimateRepository || deps.studioEstimateService?.repository || null;
  const studioEstimateService = deps.studioEstimateService || null;
  const approveAndBuildEstimate = deps.approveAndBuildEstimate || null;
  const reopenTakeoffJobForMeasurementRevision =
    deps.reopenTakeoffJobForMeasurementRevision || null;
  const getTakeoffWorkspace = deps.getTakeoffWorkspace || null;
  const getLatestTakeoffResult = deps.getLatestTakeoffResult || null;
  const getSupabase = deps.getSupabase || null;
  const queueStateStore =
    deps.queueStateStore ||
    (typeof getSupabase === "function"
      ? createQuoteFlowQueueStateStore({ getSupabase })
      : createMemoryQuoteFlowQueueStateStore());

  async function alreadyScopedForCase(organizationId, intakeCaseId) {
    const caseId = String(intakeCaseId || "").trim();
    if (!caseId || !estimateRepository?.getActiveByIntakeCase) return { scoped: false, estimate: null };
    try {
      const est = await estimateRepository.getActiveByIntakeCase(organizationId, caseId);
      return { scoped: isOfficialScopeSet(est), estimate: est || null };
    } catch {
      return { scoped: false, estimate: null };
    }
  }

  async function loadQueueCases(organizationId, actorUserId) {
    const result = await queueService.listQueue({
      organizationId,
      actorUserId,
      query: { filter: "takeoff", limit: 100, offset: 0 }
    });
    const cases = Array.isArray(result?.cases) ? result.cases : [];
    if (cases.length) return cases;
    const all = await queueService.listQueue({
      organizationId,
      actorUserId,
      query: { filter: "all", limit: 100, offset: 0 }
    });
    return (Array.isArray(all?.cases) ? all.cases : []).filter((c) => c?.takeoffJobId);
  }

  async function listQueue({ organizationId, actorUserId = null, query = {} }) {
    const cases = await loadQueueCases(organizationId, actorUserId);
    const archiveState = await queueStateStore.readState(organizationId);
    const archivedMap = archiveState?.archivedQueueItemKeys || {};
    const items = [];
    for (const row of cases) {
      if (!row?.takeoffJobId) continue;
      const { scoped, estimate } = await alreadyScopedForCase(organizationId, row.id);
      const presented = presentQuoteFlowQueueItem(row, {
        alreadyScoped: scoped,
        estimateId: estimate?.id || row.studioEstimateId || null
      });
      const queueItemKey = presented.queueItemKey || resolveQuoteFlowQueueItemKey(presented);
      const archiveMeta = archivedMap[queueItemKey] || null;
      const withArchive = {
        ...presented,
        queueItemKey,
        archived: Boolean(archiveMeta),
        archivedAt: archiveMeta?.at || null
      };
      if (QUEUE_STATUS_KEYS.has(withArchive.status.key) || withArchive.status.key === "scope_set") {
        items.push(withArchive);
      }
    }

    const filter = String(query.filter || query.state || "active").toLowerCase();
    let filtered;
    if (filter === "all") {
      filtered = items;
    } else if (filter === "scoped") {
      filtered = items.filter((i) => i.alreadyScoped === true);
    } else if (filter === "ready") {
      // Legacy alias: unscoped ready + in-flight (excludes failed/manual/scoped).
      filtered = items.filter(
        (i) =>
          i.alreadyScoped !== true &&
          (i.status.key === "ready_for_review" ||
            i.status.key === "takeoff_processing" ||
            i.status.key === "takeoff_queued")
      );
    } else {
      // active (default): Scope Creation Queue — unscoped only.
      filtered = items.filter(
        (i) => i.alreadyScoped !== true && QUEUE_STATUS_KEYS.has(i.status.key)
      );
    }

    // Archive view is orthogonal to scope/status filter (default: hide archived).
    const archiveView = String(query.archiveView || "active").toLowerCase();
    if (archiveView === "archived") {
      filtered = filtered.filter((i) => i.archived === true);
    } else if (archiveView === "all") {
      // keep both
    } else {
      filtered = filtered.filter((i) => i.archived !== true);
    }

    const sorted = sortQuoteFlowQueueItems(filtered);
    const grouped = groupQuoteFlowQueueItems(sorted);

    return {
      ok: true,
      items: sorted,
      groups: {
        ready: grouped.ready,
        manual: grouped.manual,
        processing: grouped.processing,
        failed: grouped.failed
      },
      stats: grouped.stats,
      total: sorted.length,
      archiveView:
        archiveView === "archived" || archiveView === "all" ? archiveView : "active",
      sideEffects: { ...NO_SIDE_EFFECTS }
    };
  }

  async function archiveQueueItem({
    organizationId,
    queueItemKey,
    actorUserId = null
  }) {
    const key = String(queueItemKey || "").trim();
    if (!key) {
      throw createQuoteFlowError("queue_item_key_required", {
        statusCode: 400,
        message: "Queue item key required"
      });
    }
    const result = await queueStateStore.archive({
      organizationId,
      queueItemKey: key,
      actorUserId
    });
    return {
      ...result,
      sideEffects: { ...NO_SIDE_EFFECTS }
    };
  }

  async function restoreQueueItem({
    organizationId,
    queueItemKey,
    actorUserId = null
  }) {
    const key = String(queueItemKey || "").trim();
    if (!key) {
      throw createQuoteFlowError("queue_item_key_required", {
        statusCode: 400,
        message: "Queue item key required"
      });
    }
    const result = await queueStateStore.restore({
      organizationId,
      queueItemKey: key,
      actorUserId
    });
    return {
      ...result,
      sideEffects: { ...NO_SIDE_EFFECTS }
    };
  }

  async function findCaseForTakeoffJob(organizationId, takeoffJobId, actorUserId) {
    const jobId = String(takeoffJobId || "").trim();
    const cases = await loadQueueCases(organizationId, actorUserId);
    return cases.find((c) => String(c.takeoffJobId || "") === jobId) || null;
  }

  async function getQueueDetail({ organizationId, takeoffJobId, actorUserId = null }) {
    const jobId = String(takeoffJobId || "").trim();
    if (!jobId) throw createQuoteFlowError("takeoff_not_found");

    const caseRow = await findCaseForTakeoffJob(organizationId, jobId, actorUserId);
    if (!caseRow) throw createQuoteFlowError("takeoff_not_found");

    const { scoped, estimate } = await alreadyScopedForCase(organizationId, caseRow.id);

    let workspace = null;
    let latestResult = null;
    const supabase = getSupabase?.();
    if (supabase && typeof getTakeoffWorkspace === "function") {
      try {
        workspace = await getTakeoffWorkspace({
          supabase,
          organizationId,
          takeoffJobId: jobId
        });
      } catch {
        workspace = null;
      }
    }
    if (supabase && typeof getLatestTakeoffResult === "function") {
      try {
        latestResult = await getLatestTakeoffResult({
          supabase,
          organizationId,
          takeoffJobId: jobId
        });
      } catch {
        latestResult = null;
      }
    }

    const roomCount = Number(latestResult?.computedMeasurementsJson?.roomCount);
    const pieceCount = Number(latestResult?.computedMeasurementsJson?.pieceCount);
    const totalSf = Number(
      latestResult?.computedMeasurementsJson?.totalSf ??
        latestResult?.computedMeasurementsJson?.totalSquareFeet
    );

    const item = presentQuoteFlowQueueItem(caseRow, {
      alreadyScoped: scoped,
      estimateId: estimate?.id || caseRow.studioEstimateId || null,
      roomCount: Number.isFinite(roomCount) ? roomCount : null,
      pieceCount: Number.isFinite(pieceCount) ? pieceCount : null,
      totalSf: Number.isFinite(totalSf) ? totalSf : null,
      failureReason: workspace?.errorMessage || caseRow.failureReason || null
    });

    return {
      ok: true,
      item,
      review: {
        takeoffJobId: jobId,
        intakeCaseId: caseRow.id,
        canSetScope: !scoped && item.status.key === "ready_for_review",
        canCreateManualScope: !scoped && item.canCreateManualScope === true,
        reviewStatus: workspace?.reviewStatus || caseRow.takeoffReviewStatus || null,
        jobStatus: workspace?.status || caseRow.takeoffJobStatus || null,
        canApprove: workspace?.canApprove === true,
        resultId: latestResult?.id || latestResult?.resultId || null,
        roomCount: Number.isFinite(roomCount) ? roomCount : null,
        pieceCount: Number.isFinite(pieceCount) ? pieceCount : null,
        failureReason: item.failureReason
      },
      sideEffects: { ...NO_SIDE_EFFECTS }
    };
  }

  function scopedSuccessPayload({ estimate, intakeCaseId, takeoffJobId, created, reused, projectName = null }) {
    const rooms = Array.isArray(estimate?.scope?.rooms) ? estimate.scope.rooms : [];
    const name =
      String(projectName || estimate?.scope?.projectName || estimate?.scope?.quoteFlowEstimateName || "").trim() ||
      null;
    return {
      ok: true,
      alreadyScoped: reused === true || created !== true,
      reused: reused === true,
      created: created === true,
      estimateId: estimate?.id || null,
      intakeCaseId,
      takeoffJobId: takeoffJobId || null,
      projectName: name,
      estimateName: name,
      message: "Scope is set for this estimate.",
      roomCount: rooms.length,
      sideEffects: { ...NO_SIDE_EFFECTS }
    };
  }

  function normalizeDisplayName(value) {
    const name = String(value || "").trim();
    if (!name) return null;
    if (/^unknown contact$/i.test(name)) return null;
    if (/^quote name required$/i.test(name)) return null;
    if (name.length > 200) return name.slice(0, 200);
    return name;
  }

  function requireMeaningfulQuoteName(value) {
    const name = normalizeDisplayName(value);
    if (!isMeaningfulQuoteName(name)) {
      throw createQuoteFlowError("quote_name_required", { statusCode: 422 });
    }
    return name;
  }

  /**
   * Persist canonical Quote Name on the takeoff job (Save Draft / rename).
   */
  async function updateQuoteName({
    organizationId,
    takeoffJobId,
    actorUserId = null,
    quoteName = null,
    estimateName = null,
    projectName = null,
    userSet = true
  }) {
    void actorUserId;
    const jobId = String(takeoffJobId || "").trim();
    if (!jobId) throw createQuoteFlowError("takeoff_not_found");
    const name = requireMeaningfulQuoteName(quoteName || estimateName || projectName);
    const persisted = await persistQuoteFlowQuoteName({
      getSupabase,
      organizationId,
      takeoffJobId: jobId,
      quoteName: name,
      userSet: userSet !== false
    });
    if (!persisted?.ok) {
      if (persisted?.reason === "job_not_found") {
        throw createQuoteFlowError("takeoff_not_found");
      }
      if (persisted?.reason === "quote_name_required") {
        throw createQuoteFlowError("quote_name_required", { statusCode: 422 });
      }
      throw createQuoteFlowError("takeoff_unavailable", {
        message: "Unable to save Quote Name right now.",
        statusCode: 503
      });
    }
    return {
      ok: true,
      takeoffJobId: jobId,
      quoteName: name,
      quoteNameUserSet: userSet !== false
    };
  }

  /**
   * Persist editable Estimate/Job name on scope.projectName (no migration).
   */
  async function applyEstimateDisplayName({
    organizationId,
    estimateId,
    actorUserId,
    projectName,
    estimate
  }) {
    const name = normalizeDisplayName(projectName);
    if (!name || !estimateId || !studioEstimateService?.updateScope) {
      return estimate || null;
    }
    try {
      const updated = await studioEstimateService.updateScope({
        organizationId,
        estimateId,
        actorUserId,
        body: {
          scope: {
            projectName: name,
            quoteFlowEstimateName: name
          }
        }
      });
      const next = updated?.estimate || updated;
      if (next?.scope) {
        return {
          ...next,
          scope: {
            ...next.scope,
            projectName: name,
            quoteFlowEstimateName: name
          }
        };
      }
      return {
        ...(estimate || {}),
        id: estimateId,
        scope: {
          ...((estimate && estimate.scope) || {}),
          projectName: name,
          quoteFlowEstimateName: name,
          rooms: Array.isArray(estimate?.scope?.rooms) ? estimate.scope.rooms : []
        }
      };
    } catch {
      return {
        ...(estimate || { id: estimateId }),
        scope: {
          ...((estimate && estimate.scope) || {}),
          projectName: name,
          quoteFlowEstimateName: name
        }
      };
    }
  }

  function isAlreadyApprovedError(e) {
    const code = String(e?.code || "").toLowerCase();
    const msg = String(e?.message || "").toLowerCase();
    return (
      code === "already_approved" ||
      code === "takeoff_already_approved" ||
      e?.statusCode === 409 ||
      msg.includes("already approved") ||
      msg.includes("cannot be changed")
    );
  }

  function hasClientTakeoffPayload(takeoffResult) {
    return takeoffResult != null && typeof takeoffResult === "object" && !Array.isArray(takeoffResult);
  }

  /**
   * Load latest saved reviewed/editable takeoff draft for Set Scope fallback
   * (when the Quote Flow parent could not collect a live iframe payload).
   * Returns stamped takeoffResult or null.
   */
  async function loadSavedReviewedTakeoffResult(organizationId, takeoffJobId) {
    const supabase = getSupabase?.();
    if (!supabase || typeof getLatestTakeoffResult !== "function") return null;
    try {
      const latest = await getLatestTakeoffResult({
        supabase,
        organizationId,
        takeoffJobId
      });
      const draft =
        latest?.normalizedTakeoffJson ||
        latest?.takeoffResult ||
        latest?.normalized_takeoff_json ||
        null;
      if (!hasClientTakeoffPayload(draft)) return null;
      return stampOpenEdgeLfOnTakeoffResult(draft);
    } catch {
      return null;
    }
  }

  /**
   * Resolve takeoffResult used for openEdgeLf carry-forward after official scope import.
   * Prefers live client payload; otherwise latest saved reviewed draft.
   */
  async function resolveTakeoffResultForOpenEdge(organizationId, takeoffJobId, clientTakeoffResult) {
    if (hasClientTakeoffPayload(clientTakeoffResult)) {
      return stampOpenEdgeLfOnTakeoffResult(clientTakeoffResult);
    }
    return loadSavedReviewedTakeoffResult(organizationId, takeoffJobId);
  }

  /**
   * Persist canonical openEdgeLf + sink/fabrication cutouts onto official rooms.
   * Must run even when getOrCreate already seeded usable rooms (afterEnsure path) —
   * that path previously returned early and left openEdgeLf at 0 / dropped cutouts.
   */
  async function persistOpenEdgeLfOnEstimate({
    organizationId,
    takeoffJobId,
    actorUserId,
    estimate,
    takeoffResult = null
  }) {
    if (!estimate?.id) return estimate;
    const priorRooms = Array.isArray(estimate?.scope?.rooms) ? estimate.scope.rooms : [];
    if (priorRooms.length === 0) return estimate;

    const edgeSource = await resolveTakeoffResultForOpenEdge(
      organizationId,
      takeoffJobId,
      takeoffResult
    );
    const edgedRooms = applyTakeoffOpenEdgeLfToOfficialRooms(priorRooms, edgeSource);
    const withCutouts = applyTakeoffCutoutsToOfficialRooms(edgedRooms, edgeSource);
    const withVanity = withCutouts.map((room) => {
      if (!room || typeof room !== "object") return room;
      const pieces = Array.isArray(room.pieces)
        ? room.pieces.map((p) =>
            normalizeVanityQuotedDepth(p, {
              roomName: room.name,
              roomType: room.roomType,
              planFilename: estimate?.scope?.planFilename || null
            })
          )
        : [];
      return { ...room, pieces };
    });
    const normalizedEdgeRooms = validateAndNormalizeOfficialScopeRooms(withVanity);
    const scopeWithAddOns = syncPieceOpeningsIntoOfficialScopeAddOns({
      ...(estimate.scope && typeof estimate.scope === "object" ? estimate.scope : {}),
      rooms: normalizedEdgeRooms
    });

    if (studioEstimateService?.updateScope) {
      try {
        const updated = await studioEstimateService.updateScope({
          organizationId,
          estimateId: estimate.id,
          actorUserId,
          body: {
            scope: {
              rooms: normalizedEdgeRooms,
              ...(scopeWithAddOns.addOns && typeof scopeWithAddOns.addOns === "object"
                ? { addOns: scopeWithAddOns.addOns }
                : {}),
              ...(estimate.scope?.source != null ? { source: estimate.scope.source } : {}),
              ...(estimate.scope?.physicalScopeSource != null
                ? { physicalScopeSource: estimate.scope.physicalScopeSource }
                : { physicalScopeSource: "takeoff" })
            }
          }
        });
        const next = updated?.estimate || updated;
        if (next) {
          return {
            ...next,
            id: next.id || estimate.id,
            scope: {
              ...(next.scope || {}),
              rooms: Array.isArray(next.scope?.rooms) ? next.scope.rooms : normalizedEdgeRooms,
              addOns:
                next.scope?.addOns && typeof next.scope.addOns === "object"
                  ? next.scope.addOns
                  : scopeWithAddOns.addOns
            }
          };
        }
      } catch {
        /* fall through to in-memory stamp */
      }
    }

    return {
      ...estimate,
      scope: {
        ...(estimate.scope || {}),
        rooms: normalizedEdgeRooms,
        ...(scopeWithAddOns.addOns && typeof scopeWithAddOns.addOns === "object"
          ? { addOns: scopeWithAddOns.addOns }
          : {})
      }
    };
  }

  /**
   * Freeze reviewed measurements for Quote Flow Set Scope.
   * Accepts optional dirty takeoffResult — saves edits (reopening approved jobs
   * when needed) then approves. When no live payload is provided, approveAndBuildEstimate
   * loads the latest saved reviewed takeoff from storage (post–Save Draft path).
   * Already-approved + no edits is a no-op success.
   */
  async function freezeReviewedMeasurements({
    organizationId,
    actorUserId,
    takeoffJobId,
    takeoffResult = null,
    reviewState = null
  }) {
    if (typeof approveAndBuildEstimate !== "function" || !getSupabase) return;
    const supabase = getSupabase();
    const hasReviewedPayload = hasClientTakeoffPayload(takeoffResult);

    // Dirty edits on an approved-but-unscoped takeoff: reopen before save/approve.
    if (
      hasReviewedPayload &&
      typeof reopenTakeoffJobForMeasurementRevision === "function"
    ) {
      try {
        await reopenTakeoffJobForMeasurementRevision({
          supabase,
          organizationId,
          takeoffJobId,
          userId: actorUserId
        });
      } catch {
        // Non-fatal — approve path also passes reopenIfApproved.
      }
    }

    try {
      await approveAndBuildEstimate({
        supabase,
        organizationId,
        userId: actorUserId,
        takeoffJobId,
        takeoffResult: hasReviewedPayload ? takeoffResult : undefined,
        reviewState: reviewState || undefined,
        confirmAdvisories: true,
        acceptAdvisoryWarnings: true,
        correctionNotes: "Quote Flow Set Scope",
        reopenIfApproved: hasReviewedPayload === true
      });
    } catch (e) {
      if (isAlreadyApprovedError(e) && !hasReviewedPayload) {
        // Approved measurements are ready — continue to official scope import.
        return;
      }
      if (isAlreadyApprovedError(e) && hasReviewedPayload) {
        // Retry once after explicit reopen when locked approved blocked the save.
        if (typeof reopenTakeoffJobForMeasurementRevision === "function") {
          await reopenTakeoffJobForMeasurementRevision({
            supabase,
            organizationId,
            takeoffJobId,
            userId: actorUserId
          });
          await approveAndBuildEstimate({
            supabase,
            organizationId,
            userId: actorUserId,
            takeoffJobId,
            takeoffResult,
            reviewState: reviewState || undefined,
            confirmAdvisories: true,
            acceptAdvisoryWarnings: true,
            correctionNotes: "Quote Flow Set Scope (after reopen)",
            reopenIfApproved: true
          });
          return;
        }
      }
      // Never surface the Studio "Edit Measurements" hard blocker on this path.
      if (isAlreadyApprovedError(e)) {
        return;
      }
      throw createQuoteFlowError("takeoff_not_ready", {
        message: e?.message || "Review measurements before setting scope.",
        statusCode: Number(e?.statusCode) || 422
      });
    }
  }

  async function setScope({
    organizationId,
    takeoffJobId,
    actorUserId = null,
    confirm = false,
    takeoffResult = null,
    reviewState = null,
    projectName = null,
    estimateName = null
  }) {
    if (confirm !== true && confirm !== "true") {
      throw createQuoteFlowError("set_scope_confirm_required");
    }
    const jobId = String(takeoffJobId || "").trim();
    if (!jobId) throw createQuoteFlowError("takeoff_not_found");
    const displayName = requireMeaningfulQuoteName(projectName || estimateName);

    const caseRow = await findCaseForTakeoffJob(organizationId, jobId, actorUserId);
    if (!caseRow?.id) throw createQuoteFlowError("takeoff_not_found");
    const intakeCaseId = String(caseRow.id);

    await persistQuoteFlowQuoteName({
      getSupabase,
      organizationId,
      takeoffJobId: jobId,
      quoteName: displayName,
      userSet: true
    }).catch(() => ({ ok: false }));

    const prior = await alreadyScopedForCase(organizationId, intakeCaseId);
    if (prior.scoped && prior.estimate?.id) {
      const named = displayName
        ? await applyEstimateDisplayName({
            organizationId,
            estimateId: prior.estimate.id,
            actorUserId,
            projectName: displayName,
            estimate: prior.estimate
          })
        : prior.estimate;
      return scopedSuccessPayload({
        estimate: named,
        intakeCaseId,
        takeoffJobId: jobId,
        created: false,
        reused: true,
        projectName: displayName
      });
    }

    await freezeReviewedMeasurements({
      organizationId,
      actorUserId,
      takeoffJobId: jobId,
      takeoffResult,
      reviewState
    });

    if (!studioEstimateService?.getOrCreateForCase || !studioEstimateService?.refreshScopeFromTakeoff) {
      throw createQuoteFlowError("takeoff_unavailable", {
        message: "Unable to create estimate scope right now.",
        statusCode: 503
      });
    }

    const ensured = await studioEstimateService.getOrCreateForCase({
      organizationId,
      intakeCaseId,
      takeoffJobId: jobId,
      actorUserId
    });
    const estimateId = ensured?.id || ensured?.estimateId;
    if (!estimateId) {
      throw createQuoteFlowError("takeoff_unavailable", {
        message: "Unable to create estimate for this case.",
        statusCode: 503
      });
    }

    // Idempotent: if getOrCreate already seeded usable scope, still stamp openEdgeLf
    // from live/saved takeoff (seed historically wrote 0 / early-return skipped stamp).
    const afterEnsure = await alreadyScopedForCase(organizationId, intakeCaseId);
    if (afterEnsure.scoped && afterEnsure.estimate?.id) {
      let estimate = await persistOpenEdgeLfOnEstimate({
        organizationId,
        takeoffJobId: jobId,
        actorUserId,
        estimate: afterEnsure.estimate,
        takeoffResult
      });
      if (displayName) {
        estimate = await applyEstimateDisplayName({
          organizationId,
          estimateId: estimate.id,
          actorUserId,
          projectName: displayName,
          estimate
        });
      }
      return scopedSuccessPayload({
        estimate,
        intakeCaseId,
        takeoffJobId: jobId,
        created: false,
        reused: true,
        projectName: displayName
      });
    }

    const refreshed = await studioEstimateService.refreshScopeFromTakeoff({
      organizationId,
      estimateId,
      actorUserId,
      force: true
    });
    let estimate = refreshed?.estimate || refreshed;
    estimate = { ...estimate, id: estimate?.id || estimateId };

    estimate = await persistOpenEdgeLfOnEstimate({
      organizationId,
      takeoffJobId: jobId,
      actorUserId,
      estimate,
      takeoffResult
    });

    if (displayName) {
      estimate = await applyEstimateDisplayName({
        organizationId,
        estimateId: estimate.id,
        actorUserId,
        projectName: displayName,
        estimate
      });
    }

    return scopedSuccessPayload({
      estimate,
      intakeCaseId,
      takeoffJobId: jobId,
      created: true,
      reused: false,
      projectName: displayName
    });
  }

  /**
   * Create official scope from manually entered rooms (no takeoff refresh).
   */
  async function setManualScope({
    organizationId,
    takeoffJobId,
    actorUserId = null,
    confirm = false,
    rooms = null,
    projectName = null,
    estimateName = null
  }) {
    if (confirm !== true && confirm !== "true") {
      throw createQuoteFlowError("set_scope_confirm_required");
    }
    const jobId = String(takeoffJobId || "").trim();
    if (!jobId) throw createQuoteFlowError("takeoff_not_found");
    const displayName = requireMeaningfulQuoteName(projectName || estimateName);

    const caseRow = await findCaseForTakeoffJob(organizationId, jobId, actorUserId);
    if (!caseRow?.id) throw createQuoteFlowError("takeoff_not_found");
    const intakeCaseId = String(caseRow.id);

    await persistQuoteFlowQuoteName({
      getSupabase,
      organizationId,
      takeoffJobId: jobId,
      quoteName: displayName,
      userSet: true
    }).catch(() => ({ ok: false }));

    const prior = await alreadyScopedForCase(organizationId, intakeCaseId);
    if (prior.scoped && prior.estimate?.id) {
      const named = displayName
        ? await applyEstimateDisplayName({
            organizationId,
            estimateId: prior.estimate.id,
            actorUserId,
            projectName: displayName,
            estimate: prior.estimate
          })
        : prior.estimate;
      return scopedSuccessPayload({
        estimate: named,
        intakeCaseId,
        takeoffJobId: jobId,
        created: false,
        reused: true,
        projectName: displayName
      });
    }

    const normalizedRooms = validateAndNormalizeOfficialScopeRooms(rooms);
    const hasIncludedPiece = normalizedRooms.some(
      (r) =>
        r?.included !== false &&
        Array.isArray(r.pieces) &&
        r.pieces.some((p) => p && p.excluded !== true && p.included !== false)
    );
    if (!hasIncludedPiece) {
      throw createQuoteFlowError("scope_invalid", {
        message: "Add at least one included room and piece before setting scope.",
        statusCode: 422
      });
    }

    if (!studioEstimateService?.getOrCreateForCase || !studioEstimateService?.updateScope) {
      throw createQuoteFlowError("takeoff_unavailable", {
        message: "Unable to create estimate scope right now.",
        statusCode: 503
      });
    }

    const ensured = await studioEstimateService.getOrCreateForCase({
      organizationId,
      intakeCaseId,
      takeoffJobId: jobId,
      actorUserId
    });
    const estimateId = ensured?.id || ensured?.estimateId;
    if (!estimateId) {
      throw createQuoteFlowError("takeoff_unavailable", {
        message: "Unable to create estimate for this case.",
        statusCode: 503
      });
    }

    const scopeBody = {
      rooms: normalizedRooms,
      source: "quote_flow_manual_scope"
    };
    if (displayName) {
      scopeBody.projectName = displayName;
      scopeBody.quoteFlowEstimateName = displayName;
    }

    const updated = await studioEstimateService.updateScope({
      organizationId,
      estimateId,
      actorUserId,
      body: { scope: scopeBody }
    });
    const estimate = updated?.estimate || updated || {
      id: estimateId,
      scope: scopeBody
    };

    // Ensure readiness: if updateScope didn't flip status, still treat rooms as official.
    if (!isOfficialScopeSet(estimate) && Array.isArray(normalizedRooms) && normalizedRooms.length) {
      estimate.scope = { ...(estimate.scope || {}), ...scopeBody, rooms: normalizedRooms };
      if (!estimate.status || estimate.status === "draft") {
        estimate.status = "ready_to_price";
      }
    }

    return scopedSuccessPayload({
      estimate: { ...estimate, id: estimate?.id || estimateId },
      intakeCaseId,
      takeoffJobId: jobId,
      created: true,
      reused: false,
      projectName: displayName
    });
  }

  return {
    listQueue,
    getQueueDetail,
    setScope,
    setManualScope,
    updateQuoteName,
    archiveQueueItem,
    restoreQueueItem
  };
}
