/**
 * Quote Flow Scope Creation Queue — Set Scope from AI Takeoff or manual rooms.
 * No calculate / estimate-approve / publish / accept / sold.
 * Already-scoped items belong in Estimates, not the main queue.
 */

import { createQuoteFlowError } from "./quoteFlowErrors.mjs";
import { validateAndNormalizeOfficialScopeRooms } from "./quoteFlowEstimates.mjs";
import {
  groupQuoteFlowQueueItems,
  presentQuoteFlowQueueItem,
  sortQuoteFlowQueueItems
} from "./quoteFlowQueuePresenter.mjs";
import { isOfficialScopeSet } from "./quoteFlowScope.mjs";

const NO_SIDE_EFFECTS = Object.freeze({
  calculated: false,
  approved: false,
  published: false,
  sold: false,
  accepted: false,
  digitalEstimateCreated: false,
  takeoffRerun: false
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
 *   getTakeoffWorkspace?: Function|null,
 *   getLatestTakeoffResult?: Function|null,
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
  const getTakeoffWorkspace = deps.getTakeoffWorkspace || null;
  const getLatestTakeoffResult = deps.getLatestTakeoffResult || null;
  const getSupabase = deps.getSupabase || null;

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
    const items = [];
    for (const row of cases) {
      if (!row?.takeoffJobId) continue;
      const { scoped, estimate } = await alreadyScopedForCase(organizationId, row.id);
      const presented = presentQuoteFlowQueueItem(row, {
        alreadyScoped: scoped,
        estimateId: estimate?.id || row.studioEstimateId || null
      });
      if (QUEUE_STATUS_KEYS.has(presented.status.key) || presented.status.key === "scope_set") {
        items.push(presented);
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

  function scopedSuccessPayload({ estimate, intakeCaseId, takeoffJobId, created, reused }) {
    const rooms = Array.isArray(estimate?.scope?.rooms) ? estimate.scope.rooms : [];
    return {
      ok: true,
      alreadyScoped: reused === true || created !== true,
      reused: reused === true,
      created: created === true,
      estimateId: estimate?.id || null,
      intakeCaseId,
      takeoffJobId: takeoffJobId || null,
      message: "Scope is set for this estimate.",
      roomCount: rooms.length,
      sideEffects: { ...NO_SIDE_EFFECTS }
    };
  }

  async function setScope({
    organizationId,
    takeoffJobId,
    actorUserId = null,
    confirm = false,
    takeoffResult = null,
    reviewState = null
  }) {
    if (confirm !== true && confirm !== "true") {
      throw createQuoteFlowError("set_scope_confirm_required");
    }
    const jobId = String(takeoffJobId || "").trim();
    if (!jobId) throw createQuoteFlowError("takeoff_not_found");

    const caseRow = await findCaseForTakeoffJob(organizationId, jobId, actorUserId);
    if (!caseRow?.id) throw createQuoteFlowError("takeoff_not_found");
    const intakeCaseId = String(caseRow.id);

    const prior = await alreadyScopedForCase(organizationId, intakeCaseId);
    if (prior.scoped && prior.estimate?.id) {
      return scopedSuccessPayload({
        estimate: prior.estimate,
        intakeCaseId,
        takeoffJobId: jobId,
        created: false,
        reused: true
      });
    }

    // Freeze verified measurements (idempotent if already approved).
    if (typeof approveAndBuildEstimate === "function" && getSupabase) {
      try {
        await approveAndBuildEstimate({
          supabase: getSupabase(),
          organizationId,
          userId: actorUserId,
          takeoffJobId: jobId,
          takeoffResult: takeoffResult || undefined,
          reviewState: reviewState || undefined,
          confirmAdvisories: true,
          acceptAdvisoryWarnings: true,
          correctionNotes: "Quote Flow Set Scope"
        });
      } catch (e) {
        const code = String(e?.code || "").toLowerCase();
        const msg = String(e?.message || "").toLowerCase();
        const alreadyApproved =
          code === "already_approved" ||
          e?.statusCode === 409 ||
          msg.includes("already approved");
        if (!alreadyApproved) {
          throw createQuoteFlowError("takeoff_not_ready", {
            message: e?.message || "Review measurements before setting scope.",
            statusCode: Number(e?.statusCode) || 422
          });
        }
      }
    }

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

    // Idempotent: if getOrCreate already seeded usable scope, reuse without re-import.
    const afterEnsure = await alreadyScopedForCase(organizationId, intakeCaseId);
    if (afterEnsure.scoped && afterEnsure.estimate?.id) {
      return scopedSuccessPayload({
        estimate: afterEnsure.estimate,
        intakeCaseId,
        takeoffJobId: jobId,
        created: false,
        reused: true
      });
    }

    const refreshed = await studioEstimateService.refreshScopeFromTakeoff({
      organizationId,
      estimateId,
      actorUserId,
      force: true
    });
    const estimate = refreshed?.estimate || refreshed;

    return scopedSuccessPayload({
      estimate: { ...estimate, id: estimate?.id || estimateId },
      intakeCaseId,
      takeoffJobId: jobId,
      created: true,
      reused: false
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
    rooms = null
  }) {
    if (confirm !== true && confirm !== "true") {
      throw createQuoteFlowError("set_scope_confirm_required");
    }
    const jobId = String(takeoffJobId || "").trim();
    if (!jobId) throw createQuoteFlowError("takeoff_not_found");

    const caseRow = await findCaseForTakeoffJob(organizationId, jobId, actorUserId);
    if (!caseRow?.id) throw createQuoteFlowError("takeoff_not_found");
    const intakeCaseId = String(caseRow.id);

    const prior = await alreadyScopedForCase(organizationId, intakeCaseId);
    if (prior.scoped && prior.estimate?.id) {
      return scopedSuccessPayload({
        estimate: prior.estimate,
        intakeCaseId,
        takeoffJobId: jobId,
        created: false,
        reused: true
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

    const updated = await studioEstimateService.updateScope({
      organizationId,
      estimateId,
      actorUserId,
      body: {
        scope: {
          rooms: normalizedRooms,
          source: "quote_flow_manual_scope"
        }
      }
    });
    const estimate = updated?.estimate || updated || {
      id: estimateId,
      scope: { rooms: normalizedRooms }
    };

    // Ensure readiness: if updateScope didn't flip status, still treat rooms as official.
    if (!isOfficialScopeSet(estimate) && Array.isArray(normalizedRooms) && normalizedRooms.length) {
      estimate.scope = { ...(estimate.scope || {}), rooms: normalizedRooms };
      if (!estimate.status || estimate.status === "draft") {
        estimate.status = "ready_to_price";
      }
    }

    return scopedSuccessPayload({
      estimate: { ...estimate, id: estimate?.id || estimateId },
      intakeCaseId,
      takeoffJobId: jobId,
      created: true,
      reused: false
    });
  }

  return {
    listQueue,
    getQueueDetail,
    setScope,
    setManualScope
  };
}
