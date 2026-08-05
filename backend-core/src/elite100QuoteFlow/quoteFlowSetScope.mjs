/**
 * Quote Flow Scope Creation Queue — Set Scope from AI Takeoff or manual rooms.
 * No calculate / estimate-approve / publish / accept / sold.
 * Already-scoped items belong in Estimates, not the main queue.
 */

import { createQuoteFlowError } from "./quoteFlowErrors.mjs";
import {
  applyTakeoffOpenEdgeLfToOfficialRooms
} from "./quoteFlowOpenEdge.mjs";
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
 *   reopenTakeoffJobForMeasurementRevision?: Function|null,
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
  const reopenTakeoffJobForMeasurementRevision =
    deps.reopenTakeoffJobForMeasurementRevision || null;
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
    if (name.length > 200) return name.slice(0, 200);
    return name;
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

  /**
   * Freeze reviewed measurements for Quote Flow Set Scope.
   * Accepts optional dirty takeoffResult — saves edits (reopening approved jobs
   * when needed) then approves. Already-approved + no edits is a no-op success.
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
    const hasReviewedPayload =
      takeoffResult != null && typeof takeoffResult === "object" && !Array.isArray(takeoffResult);

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
    const displayName = normalizeDisplayName(projectName || estimateName);

    const caseRow = await findCaseForTakeoffJob(organizationId, jobId, actorUserId);
    if (!caseRow?.id) throw createQuoteFlowError("takeoff_not_found");
    const intakeCaseId = String(caseRow.id);

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

    // Idempotent: if getOrCreate already seeded usable scope, reuse without re-import.
    const afterEnsure = await alreadyScopedForCase(organizationId, intakeCaseId);
    if (afterEnsure.scoped && afterEnsure.estimate?.id) {
      const named = displayName
        ? await applyEstimateDisplayName({
            organizationId,
            estimateId: afterEnsure.estimate.id,
            actorUserId,
            projectName: displayName,
            estimate: afterEnsure.estimate
          })
        : afterEnsure.estimate;
      return scopedSuccessPayload({
        estimate: named,
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

    // Carry open/exposed edge LF from reviewed takeoff → canonical piece.openEdgeLf.
    // refreshScopeFromTakeoff/seed preserves finishedEdge but historically omitted openEdgeLf.
    const priorRooms = Array.isArray(estimate?.scope?.rooms) ? estimate.scope.rooms : [];
    if (priorRooms.length > 0) {
      const edgedRooms = applyTakeoffOpenEdgeLfToOfficialRooms(priorRooms, takeoffResult);
      const normalizedEdgeRooms = validateAndNormalizeOfficialScopeRooms(edgedRooms);
      if (studioEstimateService?.updateScope) {
        try {
          const updated = await studioEstimateService.updateScope({
            organizationId,
            estimateId: estimate.id,
            actorUserId,
            body: {
              scope: {
                rooms: normalizedEdgeRooms,
                ...(estimate.scope?.source != null ? { source: estimate.scope.source } : {}),
                ...(estimate.scope?.physicalScopeSource != null
                  ? { physicalScopeSource: estimate.scope.physicalScopeSource }
                  : { physicalScopeSource: "takeoff" })
              }
            }
          });
          const next = updated?.estimate || updated;
          if (next) {
            estimate = {
              ...next,
              id: next.id || estimate.id,
              scope: {
                ...(next.scope || {}),
                rooms: Array.isArray(next.scope?.rooms) ? next.scope.rooms : normalizedEdgeRooms
              }
            };
          } else {
            estimate = {
              ...estimate,
              scope: {
                ...(estimate.scope || {}),
                rooms: normalizedEdgeRooms
              }
            };
          }
        } catch {
          estimate = {
            ...estimate,
            scope: {
              ...(estimate.scope || {}),
              rooms: normalizedEdgeRooms
            }
          };
        }
      } else {
        estimate = {
          ...estimate,
          scope: {
            ...(estimate.scope || {}),
            rooms: normalizedEdgeRooms
          }
        };
      }
    }

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
    const displayName = normalizeDisplayName(projectName || estimateName);

    const caseRow = await findCaseForTakeoffJob(organizationId, jobId, actorUserId);
    if (!caseRow?.id) throw createQuoteFlowError("takeoff_not_found");
    const intakeCaseId = String(caseRow.id);

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
    setManualScope
  };
}
