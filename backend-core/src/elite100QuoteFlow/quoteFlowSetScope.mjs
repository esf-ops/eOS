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
import {
  applyTakeoffBacksplashToOfficialRooms,
  applyTakeoffPieceGeometryToOfficialRooms
} from "./quoteFlowBacksplash.mjs";
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
  applyEstimatorSelectionAction,
  addManualRequestedSelection,
  summarizeRequestedSelections
} from "./quoteFlowRequestedSelections.mjs";
import {
  applyStartingConfigurationToScope,
  patchStartingConfiguration,
  resolveStartingConfigurationForSetScope,
  seedStartingConfigurationFromConfirmed,
  summarizeStartingConfiguration
} from "./quoteFlowStartingConfiguration.mjs";
import {
  applyAccountDirectoryLinkToEstimateScope,
  applySuggestionsToLink,
  confirmAccountDirectoryLink,
  emptyAccountDirectoryLink,
  patchQuoteIdentitySnapshot,
  resolveQuoteFlowMatchHints,
  suggestAccountDirectoryMatches,
  summarizeAccountDirectoryLink,
  unlinkAccountDirectoryLink
} from "./quoteFlowAccountDirectory.mjs";
import {
  getAccountDirectoryServiceForEstimate,
  loadAccountForEstimateSelection,
  lookupAccountsForEstimate
} from "../elite100EstimateStudio/studioAccountDirectoryLookup.mjs";
import { buildCustomerIdentitySnapshot } from "../quotes/customerIdentitySnapshot.mjs";
import {
  createMemoryQuoteFlowQueueStateStore,
  createQuoteFlowQueueStateStore
} from "./quoteFlowQueueStateStore.mjs";
import { isOfficialScopeSet } from "./quoteFlowScope.mjs";
import { createRequestStageTimer } from "../lib/requestStageTimer.mjs";

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

  /**
   * Resolve intake case id for a takeoff job without listing the full Estimate Queue.
   * Direct link/estimate lookup first; queue scan is fallback only.
   * @returns {Promise<{ id: string } | null>}
   */
  async function resolveIntakeCaseForTakeoffJob(organizationId, takeoffJobId, actorUserId) {
    const jobId = String(takeoffJobId || "").trim();
    if (!jobId) return null;
    const supabase = getSupabase?.();
    if (supabase?.from) {
      try {
        const { data: links } = await supabase
          .from("quote_intake_takeoff_links")
          .select("intake_case_id")
          .eq("organization_id", organizationId)
          .eq("takeoff_job_id", jobId)
          .order("created_at", { ascending: false })
          .limit(1);
        const linkCaseId = links?.[0]?.intake_case_id;
        if (linkCaseId) return { id: String(linkCaseId) };
      } catch {
        // fall through
      }
      try {
        const { data: estimates } = await supabase
          .from("studio_estimates")
          .select("intake_case_id")
          .eq("organization_id", organizationId)
          .eq("takeoff_job_id", jobId)
          .is("superseded_at", null)
          .order("updated_at", { ascending: false })
          .limit(1);
        const estCaseId = estimates?.[0]?.intake_case_id;
        if (estCaseId) return { id: String(estCaseId) };
      } catch {
        // fall through
      }
    }
    return findCaseForTakeoffJob(organizationId, jobId, actorUserId);
  }

  /**
   * Request-scoped latest takeoff loader (dedupes getLatestTakeoffResult within Set Scope).
   */
  function createTakeoffResultCache() {
    /** @type {Map<string, Promise<object|null>>} */
    const cache = new Map();
    return {
      /**
       * @param {string} organizationId
       * @param {string} takeoffJobId
       * @param {object|null|undefined} clientTakeoffResult
       */
      async resolve(organizationId, takeoffJobId, clientTakeoffResult) {
        if (hasClientTakeoffPayload(clientTakeoffResult)) {
          return stampOpenEdgeLfOnTakeoffResult(clientTakeoffResult);
        }
        const key = `${organizationId}:${takeoffJobId}`;
        if (!cache.has(key)) {
          cache.set(
            key,
            (async () => {
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
            })()
          );
        }
        return cache.get(key);
      }
    };
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

  async function readJobQuoteFlowMeta(organizationId, takeoffJobId) {
    if (typeof getSupabase !== "function") return null;
    const supabase = getSupabase();
    if (!supabase) return null;
    try {
      const { data } = await supabase
        .from("quote_takeoff_jobs")
        .select("id,metadata")
        .eq("organization_id", organizationId)
        .eq("id", takeoffJobId)
        .maybeSingle();
      const meta = data?.metadata && typeof data.metadata === "object" ? data.metadata : {};
      return meta.quoteFlow && typeof meta.quoteFlow === "object" ? meta.quoteFlow : null;
    } catch {
      return null;
    }
  }

  async function writeJobQuoteFlowFields(organizationId, takeoffJobId, fields) {
    if (typeof getSupabase !== "function") return { ok: false, reason: "no_supabase" };
    const supabase = getSupabase();
    if (!supabase || typeof supabase.from !== "function") return { ok: false, reason: "no_supabase" };
    try {
      const { data: row } = await supabase
        .from("quote_takeoff_jobs")
        .select("id,metadata")
        .eq("organization_id", organizationId)
        .eq("id", takeoffJobId)
        .maybeSingle();
      if (!row?.id) return { ok: false, reason: "job_not_found" };
      const meta =
        row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
          ? { ...row.metadata }
          : {};
      const qf =
        meta.quoteFlow && typeof meta.quoteFlow === "object" && !Array.isArray(meta.quoteFlow)
          ? { ...meta.quoteFlow }
          : {};
      meta.quoteFlow = { ...qf, ...(fields && typeof fields === "object" ? fields : {}) };
      const { error } = await supabase
        .from("quote_takeoff_jobs")
        .update({ metadata: meta })
        .eq("organization_id", organizationId)
        .eq("id", takeoffJobId);
      if (error) return { ok: false, reason: "write_failed" };
      return { ok: true, quoteFlow: meta.quoteFlow };
    } catch {
      return { ok: false, reason: "write_failed" };
    }
  }

  async function writeJobRequestedSelections(organizationId, takeoffJobId, requestedSelections) {
    return writeJobQuoteFlowFields(organizationId, takeoffJobId, { requestedSelections });
  }

  async function getRequestedSelections({ organizationId, takeoffJobId }) {
    const jobId = String(takeoffJobId || "").trim();
    if (!jobId) throw createQuoteFlowError("takeoff_not_found");
    const qf = await readJobQuoteFlowMeta(organizationId, jobId);
    const requestedSelections = qf?.requestedSelections || { items: [] };
    const startingConfiguration = qf?.startingConfiguration || null;
    return {
      ok: true,
      takeoffJobId: jobId,
      requestedSelections,
      startingConfiguration,
      summary: summarizeRequestedSelections(requestedSelections),
      startingSummary: summarizeStartingConfiguration(startingConfiguration)
    };
  }

  async function updateRequestedSelection({
    organizationId,
    takeoffJobId,
    actorUserId = null,
    selectionId,
    action,
    patch = null,
    item = null
  }) {
    const jobId = String(takeoffJobId || "").trim();
    if (!jobId) throw createQuoteFlowError("takeoff_not_found");
    const qf = (await readJobQuoteFlowMeta(organizationId, jobId)) || {};
    let next;
    if (action === "add") {
      next = addManualRequestedSelection(qf.requestedSelections, item || patch || {}, actorUserId);
    } else {
      next = applyEstimatorSelectionAction(qf.requestedSelections, {
        selectionId,
        action,
        actorUserId,
        patch
      });
    }
    // Reseed starting configuration from confirmed requests unless estimator already customized it.
    let startingConfiguration = qf.startingConfiguration || null;
    if (!(startingConfiguration && startingConfiguration.userSet === true)) {
      startingConfiguration = seedStartingConfigurationFromConfirmed(next, {
        roomsFromTakeoff: []
      });
    }
    const written = await writeJobQuoteFlowFields(organizationId, jobId, {
      requestedSelections: next,
      startingConfiguration
    });
    if (!written.ok) {
      throw createQuoteFlowError("takeoff_unavailable", {
        message: "Unable to save requested selections.",
        statusCode: 503
      });
    }
    return {
      ok: true,
      takeoffJobId: jobId,
      requestedSelections: next,
      startingConfiguration,
      summary: summarizeRequestedSelections(next),
      startingSummary: summarizeStartingConfiguration(startingConfiguration)
    };
  }

  async function getStartingConfiguration({ organizationId, takeoffJobId }) {
    const jobId = String(takeoffJobId || "").trim();
    if (!jobId) throw createQuoteFlowError("takeoff_not_found");
    const qf = await readJobQuoteFlowMeta(organizationId, jobId);
    let startingConfiguration = qf?.startingConfiguration || null;
    if (!startingConfiguration || startingConfiguration.status === "empty") {
      startingConfiguration = seedStartingConfigurationFromConfirmed(qf?.requestedSelections, {
        roomsFromTakeoff: []
      });
    }
    return {
      ok: true,
      takeoffJobId: jobId,
      startingConfiguration,
      summary: summarizeStartingConfiguration(startingConfiguration)
    };
  }

  async function updateStartingConfiguration({
    organizationId,
    takeoffJobId,
    actorUserId = null,
    patch = null,
    reseedFromConfirmed = false
  }) {
    const jobId = String(takeoffJobId || "").trim();
    if (!jobId) throw createQuoteFlowError("takeoff_not_found");
    const qf = (await readJobQuoteFlowMeta(organizationId, jobId)) || {};
    let next;
    if (reseedFromConfirmed) {
      next = seedStartingConfigurationFromConfirmed(qf.requestedSelections, { roomsFromTakeoff: [] });
    } else {
      next = patchStartingConfiguration(qf.startingConfiguration, patch || {}, actorUserId);
    }
    const written = await writeJobQuoteFlowFields(organizationId, jobId, {
      startingConfiguration: next
    });
    if (!written.ok) {
      throw createQuoteFlowError("takeoff_unavailable", {
        message: "Unable to save starting configuration.",
        statusCode: 503
      });
    }
    return {
      ok: true,
      takeoffJobId: jobId,
      startingConfiguration: next,
      summary: summarizeStartingConfiguration(next)
    };
  }

  async function applyStartingConfigurationOntoEstimate({
    organizationId,
    takeoffJobId,
    actorUserId,
    estimate
  }) {
    if (!estimate?.id || !studioEstimateService?.updateScope) return estimate;
    const qf = await readJobQuoteFlowMeta(organizationId, takeoffJobId);
    const roomsFromTakeoff = Array.isArray(estimate.scope?.rooms) ? estimate.scope.rooms : [];
    let starting = resolveStartingConfigurationForSetScope({
      existingStartingConfiguration: qf?.startingConfiguration,
      requestedSelections: qf?.requestedSelections,
      roomsFromTakeoff
    });
    // Persist resolved starting config so reload/Save Draft paths stay consistent.
    if (
      starting &&
      (!qf?.startingConfiguration || qf.startingConfiguration.status === "empty")
    ) {
      await writeJobQuoteFlowFields(organizationId, takeoffJobId, {
        startingConfiguration: starting
      });
    }
    if (!starting || starting.status === "empty") {
      // Still allow AD soft-link alone to initialize identity when no starting config.
      let identityOnly = applyAccountDirectoryLinkToEstimateScope(
        estimate.scope || {},
        qf?.accountDirectoryLink || null
      );
      if (identityOnly.accountDirectoryAccountId) {
        try {
          const updated = await studioEstimateService.updateScope({
            organizationId,
            estimateId: estimate.id,
            actorUserId,
            body: {
              scope: identityOnly,
              accountDirectoryAccountId: identityOnly.accountDirectoryAccountId,
              accountDirectoryContactId: identityOnly.accountDirectoryContactId,
              accountDirectoryLocationId: identityOnly.accountDirectoryLocationId,
              customerIdentitySnapshot: identityOnly.customerIdentitySnapshot,
              explicitAccountRelink: true
            }
          });
          return updated?.estimate || updated || { ...estimate, scope: identityOnly };
        } catch {
          return { ...estimate, scope: identityOnly };
        }
      }
      return estimate;
    }

    let nextScope = applyStartingConfigurationToScope(estimate.scope || {}, starting, {
      roomsFromTakeoff
    });
    // Keep audit of which confirmed requests existed at promote time (non-authoritative).
    if (Array.isArray(qf?.requestedSelections?.items)) {
      nextScope.customerRequestedSelections = {
        version: qf.requestedSelections.extractionVersion || "qf_requested_selections_v1",
        appliedAt: new Date().toISOString(),
        note: "Starting Configuration is authoritative for estimate init; requestedSelections remain the request ledger.",
        items: qf.requestedSelections.items.filter((i) => i?.status === "confirmed")
      };
    }
    // Soft-link Account Directory (optional) — fill-if-empty quote fields + durable IDs.
    nextScope = applyAccountDirectoryLinkToEstimateScope(nextScope, qf?.accountDirectoryLink || null);
    try {
      const updated = await studioEstimateService.updateScope({
        organizationId,
        estimateId: estimate.id,
        actorUserId,
        body: {
          scope: nextScope,
          accountDirectoryAccountId: nextScope.accountDirectoryAccountId ?? null,
          accountDirectoryContactId: nextScope.accountDirectoryContactId ?? null,
          accountDirectoryLocationId: nextScope.accountDirectoryLocationId ?? null,
          customerIdentitySnapshot: nextScope.customerIdentitySnapshot ?? null,
          explicitAccountRelink: nextScope.accountDirectoryAccountId ? true : false
        }
      });
      return updated?.estimate || updated || { ...estimate, scope: nextScope };
    } catch {
      return { ...estimate, scope: nextScope };
    }
  }

  /** @deprecated Prefer applyStartingConfigurationOntoEstimate */
  async function applyConfirmedSelectionsOntoEstimate(args) {
    return applyStartingConfigurationOntoEstimate(args);
  }

  async function getAccountDirectoryLink({ organizationId, takeoffJobId }) {
    const jobId = String(takeoffJobId || "").trim();
    if (!jobId) throw createQuoteFlowError("takeoff_not_found");
    // Missing quoteFlow / accountDirectoryLink on legacy jobs → empty unlinked link.
    const qf = (await readJobQuoteFlowMeta(organizationId, jobId)) || {};
    const raw = qf.accountDirectoryLink;
    const link =
      raw && typeof raw === "object" && !Array.isArray(raw)
        ? raw
        : emptyAccountDirectoryLink();
    return {
      ok: true,
      takeoffJobId: jobId,
      accountDirectoryLink: link,
      summary: summarizeAccountDirectoryLink(link),
      matchHints: resolveQuoteFlowMatchHints({
        senderLabel: qf.senderLabel,
        customerLabel: qf.customerLabel,
        requestSubject: qf.requestSubject,
        sourceEmailBodyPreview: qf.sourceEmailBodyPreview
      })
    };
  }

  async function updateAccountDirectoryLink({
    organizationId,
    takeoffJobId,
    actorUserId = null,
    action,
    patch = null,
    accountId = null,
    contactId = null,
    locationId = null,
    identitySnapshot = null,
    matchConfidence = null,
    matchReason = null,
    role = null
  }) {
    const jobId = String(takeoffJobId || "").trim();
    if (!jobId) throw createQuoteFlowError("takeoff_not_found");
    const qf = (await readJobQuoteFlowMeta(organizationId, jobId)) || {};
    const prevRaw = qf.accountDirectoryLink;
    const prev =
      prevRaw && typeof prevRaw === "object" && !Array.isArray(prevRaw)
        ? prevRaw
        : emptyAccountDirectoryLink();
    const act = String(action || "").trim();
    let next = prev;

    if (act === "unlink") {
      next = unlinkAccountDirectoryLink(prev, actorUserId);
    } else if (act === "patch_snapshot") {
      next = patchQuoteIdentitySnapshot(prev, patch || {}, actorUserId);
    } else if (act === "reject_suggestion") {
      next = {
        ...prev,
        status: "unlinked",
        suggestions: [],
        matchConfidence: null,
        matchReason: "suggestion_rejected",
        userSet: true,
        updatedAt: new Date().toISOString()
      };
    } else if (act === "confirm" || act === "link") {
      let snapshot = identitySnapshot;
      if (!snapshot && accountId && typeof getSupabase === "function") {
        try {
          const service = getAccountDirectoryServiceForEstimate({ getSupabase });
          const loaded = await loadAccountForEstimateSelection({
            service,
            organizationId,
            role: role || "estimator",
            accountId
          });
          const contact =
            (contactId && (loaded.contacts || []).find((c) => String(c.id) === String(contactId))) ||
            loaded.primaryContact ||
            null;
          const location =
            (locationId &&
              (loaded.locations || []).find((l) => String(l.id) === String(locationId))) ||
            loaded.primaryLocation ||
            null;
          snapshot = buildCustomerIdentitySnapshot({
            account: loaded.account,
            contact,
            location
          });
          if (!contactId && contact?.id) contactId = contact.id;
          if (!locationId && location?.id) locationId = location.id;
        } catch {
          snapshot = identitySnapshot;
        }
      }
      next = confirmAccountDirectoryLink(prev, {
        accountId,
        contactId,
        locationId,
        identitySnapshot: snapshot,
        matchConfidence: matchConfidence || "manual",
        matchReason: matchReason || "estimator_confirmed",
        actorUserId,
        quoteSnapshot: patch?.quoteSnapshot || prev.quoteSnapshot
      });
    } else if (act === "refresh_suggestions") {
      // Best-effort suggest; never fails Review Takeoff / Set Scope.
      // Legacy jobs may have no quoteFlow / sender / AD fields — treat as unlinked.
      try {
        const hints = resolveQuoteFlowMatchHints({
          senderLabel: qf.senderLabel,
          customerLabel: qf.customerLabel,
          requestSubject: qf.requestSubject,
          sourceEmailBodyPreview: qf.sourceEmailBodyPreview
        });
        const service = getAccountDirectoryServiceForEstimate({ getSupabase });
        const search =
          hints.customerEmailCandidates[0] || hints.accountHint || hints.customerHint || "";
        let accounts = [];
        if (search) {
          const listed = await lookupAccountsForEstimate({
            service,
            organizationId,
            role: role || "estimator",
            search,
            limit: 12
          });
          accounts = listed.items || [];
          // Enrich with contacts for exact email match when detail available.
          const enriched = [];
          for (const item of accounts.slice(0, 6)) {
            try {
              const detail = await loadAccountForEstimateSelection({
                service,
                organizationId,
                role: role || "estimator",
                accountId: item.id
              });
              enriched.push({
                ...item,
                contacts: detail?.contacts || [],
                primaryContactId: detail?.selectedContactId || null
              });
            } catch {
              enriched.push(item);
            }
          }
          accounts = enriched;
        }
        const suggested = suggestAccountDirectoryMatches({
          accounts,
          emailCandidates: hints.customerEmailCandidates,
          nameHint: hints.accountHint || hints.customerHint
        });
        next = applySuggestionsToLink(
          prev && typeof prev === "object" ? prev : emptyAccountDirectoryLink(),
          suggested
        );
      } catch {
        next = {
          ...(prev && typeof prev === "object" ? prev : emptyAccountDirectoryLink()),
          lookupUnavailable: true,
          updatedAt: new Date().toISOString()
        };
      }
      // Persist best-effort only — write failure must not 5xx Review Takeoff.
      const written = await writeJobQuoteFlowFields(organizationId, jobId, {
        accountDirectoryLink: next
      });
      if (!written.ok) {
        next = {
          ...next,
          lookupUnavailable: next.lookupUnavailable === true || written.reason === "write_failed",
          persistDeferred: true,
          updatedAt: new Date().toISOString()
        };
      }
      return {
        ok: true,
        takeoffJobId: jobId,
        accountDirectoryLink: next,
        summary: summarizeAccountDirectoryLink(next),
        persisted: Boolean(written?.ok)
      };
    } else {
      throw createQuoteFlowError("validation_failed", {
        message: "Invalid account-directory link action",
        statusCode: 400
      });
    }

    const written = await writeJobQuoteFlowFields(organizationId, jobId, {
      accountDirectoryLink: next
    });
    if (!written.ok) {
      // Confirmed link / unlink / patch should still surface save failure,
      // but never claim takeoff itself is unavailable.
      throw createQuoteFlowError("validation_failed", {
        message: "Unable to save Account Directory link right now. Estimating can continue unlinked.",
        statusCode: 503
      });
    }
    return {
      ok: true,
      takeoffJobId: jobId,
      accountDirectoryLink: next,
      summary: summarizeAccountDirectoryLink(next),
      persisted: true
    };
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
  async function loadSavedReviewedTakeoffResult(organizationId, takeoffJobId, takeoffCache = null) {
    if (takeoffCache) {
      return takeoffCache.resolve(organizationId, takeoffJobId, null);
    }
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
  async function resolveTakeoffResultForOpenEdge(
    organizationId,
    takeoffJobId,
    clientTakeoffResult,
    takeoffCache = null
  ) {
    if (hasClientTakeoffPayload(clientTakeoffResult)) {
      return stampOpenEdgeLfOnTakeoffResult(clientTakeoffResult);
    }
    return loadSavedReviewedTakeoffResult(organizationId, takeoffJobId, takeoffCache);
  }

  /**
   * Persist reviewed takeoff physical facts onto official rooms:
   * piece geometry, backsplash, openEdgeLf, cutouts.
   * Must run even when getOrCreate already seeded usable rooms (afterEnsure path) —
   * that path previously returned early and left openEdgeLf / backsplash stale.
   */
  async function persistOpenEdgeLfOnEstimate({
    organizationId,
    takeoffJobId,
    actorUserId,
    estimate,
    takeoffResult = null,
    takeoffCache = null
  }) {
    if (!estimate?.id) return estimate;
    const priorRooms = Array.isArray(estimate?.scope?.rooms) ? estimate.scope.rooms : [];
    if (priorRooms.length === 0) return estimate;

    const edgeSource = await resolveTakeoffResultForOpenEdge(
      organizationId,
      takeoffJobId,
      takeoffResult,
      takeoffCache
    );
    const withGeometry = applyTakeoffPieceGeometryToOfficialRooms(priorRooms, edgeSource);
    const withBacksplash = applyTakeoffBacksplashToOfficialRooms(withGeometry, edgeSource);
    const edgedRooms = applyTakeoffOpenEdgeLfToOfficialRooms(withBacksplash, edgeSource);
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
    reviewState = null,
    _timing = null
  }) {
    if (typeof approveAndBuildEstimate !== "function" || !getSupabase) return null;
    const supabase = getSupabase();
    const hasReviewedPayload = hasClientTakeoffPayload(takeoffResult);
    const mark = (name) => _timing?.mark?.(name);

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
      mark("freeze_reopen");
    }

    try {
      const approved = await approveAndBuildEstimate({
        supabase,
        organizationId,
        userId: actorUserId,
        takeoffJobId,
        takeoffResult: hasReviewedPayload ? takeoffResult : undefined,
        reviewState: reviewState || undefined,
        confirmAdvisories: true,
        acceptAdvisoryWarnings: true,
        correctionNotes: "Quote Flow Set Scope",
        reopenIfApproved: hasReviewedPayload === true,
        _timing
      });
      mark("freeze_approve_build");
      return approved && typeof approved === "object" ? approved : null;
    } catch (e) {
      if (isAlreadyApprovedError(e) && !hasReviewedPayload) {
        // Approved measurements are ready — continue to official scope import.
        mark("freeze_already_approved");
        return { alreadyApproved: true };
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
          mark("freeze_reopen_retry");
          const approved = await approveAndBuildEstimate({
            supabase,
            organizationId,
            userId: actorUserId,
            takeoffJobId,
            takeoffResult,
            reviewState: reviewState || undefined,
            confirmAdvisories: true,
            acceptAdvisoryWarnings: true,
            correctionNotes: "Quote Flow Set Scope (after reopen)",
            reopenIfApproved: true,
            _timing
          });
          mark("freeze_approve_build_retry");
          return approved && typeof approved === "object" ? approved : null;
        }
      }
      // Never surface the Studio "Edit Measurements" hard blocker on this path.
      if (isAlreadyApprovedError(e)) {
        mark("freeze_already_approved");
        return { alreadyApproved: true };
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
    estimateName = null,
    _timing = null
  }) {
    const ownsTimer = !_timing;
    const timer =
      _timing ||
      createRequestStageTimer("POST set-scope", {
        enabled: String(process.env.ELITEOS_REQUEST_TIMING || "") === "1"
      });
    const done = () => {
      if (ownsTimer) timer.finish();
    };
    if (confirm !== true && confirm !== "true") {
      throw createQuoteFlowError("set_scope_confirm_required");
    }
    const jobId = String(takeoffJobId || "").trim();
    if (!jobId) throw createQuoteFlowError("takeoff_not_found");
    const displayName = requireMeaningfulQuoteName(projectName || estimateName);

    const caseRow = await resolveIntakeCaseForTakeoffJob(organizationId, jobId, actorUserId);
    timer.mark("resolve_intake_case");
    if (!caseRow?.id) throw createQuoteFlowError("takeoff_not_found");
    const intakeCaseId = String(caseRow.id);

    const takeoffCache = createTakeoffResultCache();

    // Quote name write is independent of already-scoped check.
    const [prior] = await Promise.all([
      alreadyScopedForCase(organizationId, intakeCaseId),
      persistQuoteFlowQuoteName({
        getSupabase,
        organizationId,
        takeoffJobId: jobId,
        quoteName: displayName,
        userSet: true
      }).catch(() => ({ ok: false }))
    ]);
    timer.mark("prior_scope_and_quote_name");

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
      timer.mark("already_scoped_return");
      done();
      return scopedSuccessPayload({
        estimate: named,
        intakeCaseId,
        takeoffJobId: jobId,
        created: false,
        reused: true,
        projectName: displayName
      });
    }

    const freezeResult = await freezeReviewedMeasurements({
      organizationId,
      actorUserId,
      takeoffJobId: jobId,
      takeoffResult,
      reviewState,
      _timing: timer
    });
    timer.mark("freeze_reviewed");
    let setScopeFacts =
      freezeResult?.setScopeFacts && typeof freezeResult.setScopeFacts === "object"
        ? freezeResult.setScopeFacts
        : null;

    // Prime request-scoped takeoff cache from freeze facts (or one latest load).
    if (setScopeFacts?.normalizedTakeoffJson) {
      await takeoffCache.resolve(organizationId, jobId, setScopeFacts.normalizedTakeoffJson);
    } else {
      const draft = await takeoffCache.resolve(organizationId, jobId, takeoffResult);
      if (draft && !setScopeFacts) {
        setScopeFacts = {
          takeoffJobId: jobId,
          reviewStatus: "approved",
          resultId: freezeResult?.approvedResultId || null,
          normalizedTakeoffJson: draft,
          computedMeasurementsJson: null,
          validationDiagnosticsJson: null,
          reviewState: reviewState || null,
          approvedAt: null,
          approvedByUserId: actorUserId
        };
      }
    }
    timer.mark("prime_takeoff_facts");

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
      actorUserId,
      setScopeFacts,
      _timing: timer
    });
    timer.mark("get_or_create");
    const estimateId = ensured?.id || ensured?.estimateId;
    if (!estimateId) {
      throw createQuoteFlowError("takeoff_unavailable", {
        message: "Unable to create estimate for this case.",
        statusCode: 503
      });
    }

    // Reuse getOrCreate row when it already carries official scope — avoid a second
    // getActiveByIntakeCase round-trip (previously alreadyScopedForCase after ensure).
    const ensuredEstimate = {
      ...ensured,
      id: estimateId
    };
    if (isOfficialScopeSet(ensuredEstimate)) {
      let estimate = await persistOpenEdgeLfOnEstimate({
        organizationId,
        takeoffJobId: jobId,
        actorUserId,
        estimate: ensuredEstimate,
        takeoffResult,
        takeoffCache
      });
      timer.mark("persist_physical_facts");
      if (displayName) {
        estimate = await applyEstimateDisplayName({
          organizationId,
          estimateId: estimate.id,
          actorUserId,
          projectName: displayName,
          estimate
        });
      }
      timer.mark("display_name");
      estimate = await applyConfirmedSelectionsOntoEstimate({
        organizationId,
        takeoffJobId: jobId,
        actorUserId,
        estimate
      });
      timer.mark("starting_configuration");
      done();
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
    timer.mark("refresh_scope");
    let estimate = refreshed?.estimate || refreshed;
    estimate = { ...estimate, id: estimate?.id || estimateId };

    estimate = await persistOpenEdgeLfOnEstimate({
      organizationId,
      takeoffJobId: jobId,
      actorUserId,
      estimate,
      takeoffResult,
      takeoffCache
    });
    timer.mark("persist_physical_facts");

    if (displayName) {
      estimate = await applyEstimateDisplayName({
        organizationId,
        estimateId: estimate.id,
        actorUserId,
        projectName: displayName,
        estimate
      });
    }
    timer.mark("display_name");

    estimate = await applyConfirmedSelectionsOntoEstimate({
      organizationId,
      takeoffJobId: jobId,
      actorUserId,
      estimate
    });
    timer.mark("starting_configuration");
    done();

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

    const caseRow = await resolveIntakeCaseForTakeoffJob(organizationId, jobId, actorUserId);
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

    const withSelections = await applyConfirmedSelectionsOntoEstimate({
      organizationId,
      takeoffJobId: jobId,
      actorUserId,
      estimate: { ...estimate, id: estimate?.id || estimateId }
    });

    return scopedSuccessPayload({
      estimate: withSelections,
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
    getRequestedSelections,
    updateRequestedSelection,
    getStartingConfiguration,
    updateStartingConfiguration,
    getAccountDirectoryLink,
    updateAccountDirectoryLink,
    applyStartingConfigurationOntoEstimate,
    applyConfirmedSelectionsOntoEstimate,
    archiveQueueItem,
    restoreQueueItem
  };
}
