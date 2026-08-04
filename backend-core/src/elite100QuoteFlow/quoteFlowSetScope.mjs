/**
 * Quote Flow Set Scope — freeze takeoff measurements + seed official studio_estimates scope.
 * No calculate / estimate-approve / publish / accept / sold.
 */

import { createQuoteFlowError } from "./quoteFlowErrors.mjs";
import { presentQuoteFlowQueueItem } from "./quoteFlowQueuePresenter.mjs";
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

/**
 * @param {{
 *   queueService: { listQueue: Function },
 *   estimateRepository?: { getActiveByIntakeCase?: Function, getById?: Function }|null,
 *   studioEstimateService?: {
 *     getOrCreateForCase?: Function,
 *     refreshScopeFromTakeoff?: Function,
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
    // Also pull "all" rows that have takeoff jobs if takeoff filter is empty.
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
      // Keep returned/processing/failed/scoped takeoffs visible.
      if (
        presented.status.key === "ready_for_review" ||
        presented.status.key === "takeoff_processing" ||
        presented.status.key === "takeoff_queued" ||
        presented.status.key === "takeoff_failed" ||
        presented.status.key === "scope_set"
      ) {
        items.push(presented);
      }
    }
    const filter = String(query.filter || query.state || "ready").toLowerCase();
    const filtered =
      filter === "all"
        ? items
        : filter === "scoped"
          ? items.filter((i) => i.alreadyScoped)
          : items.filter((i) => i.status.key === "ready_for_review" || i.status.key === "takeoff_processing" || i.status.key === "takeoff_queued");

    return {
      ok: true,
      items: filtered,
      total: filtered.length,
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
    const item = presentQuoteFlowQueueItem(caseRow, {
      alreadyScoped: scoped,
      estimateId: estimate?.id || caseRow.studioEstimateId || null
    });

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

    return {
      ok: true,
      item,
      review: {
        takeoffJobId: jobId,
        intakeCaseId: caseRow.id,
        canSetScope: !scoped && item.status.key === "ready_for_review",
        reviewStatus: workspace?.reviewStatus || caseRow.takeoffReviewStatus || null,
        jobStatus: workspace?.status || caseRow.takeoffJobStatus || null,
        canApprove: workspace?.canApprove === true,
        resultId: latestResult?.id || latestResult?.resultId || null,
        roomCount: Number(latestResult?.computedMeasurementsJson?.roomCount) || null,
        pieceCount: Number(latestResult?.computedMeasurementsJson?.pieceCount) || null
      },
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
      return {
        ok: true,
        alreadyScoped: true,
        reused: true,
        created: false,
        estimateId: prior.estimate.id,
        intakeCaseId,
        takeoffJobId: jobId,
        message: "Scope is set for this estimate.",
        roomCount: Array.isArray(prior.estimate.scope?.rooms)
          ? prior.estimate.scope.rooms.length
          : 0,
        sideEffects: { ...NO_SIDE_EFFECTS }
      };
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
      const rooms = Array.isArray(afterEnsure.estimate.scope?.rooms)
        ? afterEnsure.estimate.scope.rooms
        : [];
      return {
        ok: true,
        alreadyScoped: true,
        reused: true,
        created: false,
        estimateId: afterEnsure.estimate.id,
        intakeCaseId,
        takeoffJobId: jobId,
        message: "Scope is set for this estimate.",
        roomCount: rooms.length,
        sideEffects: { ...NO_SIDE_EFFECTS }
      };
    }

    const refreshed = await studioEstimateService.refreshScopeFromTakeoff({
      organizationId,
      estimateId,
      actorUserId,
      force: true
    });
    const estimate = refreshed?.estimate || refreshed;
    const rooms = Array.isArray(estimate?.scope?.rooms) ? estimate.scope.rooms : [];

    return {
      ok: true,
      alreadyScoped: false,
      reused: false,
      created: true,
      estimateId: estimate?.id || estimateId,
      intakeCaseId,
      takeoffJobId: jobId,
      message: "Scope is set for this estimate.",
      roomCount: rooms.length,
      sideEffects: { ...NO_SIDE_EFFECTS }
    };
  }

  return {
    listQueue,
    getQueueDetail,
    setScope
  };
}
