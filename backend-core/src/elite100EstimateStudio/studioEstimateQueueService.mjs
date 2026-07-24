/**
 * Studio Estimate Queue — combined operational list + preview.
 *
 * Joins Quote Intake + Takeoff link/job + Studio estimate + publication +
 * review-request summaries. Org-scoped. No Graph IDs / hashes / storage paths /
 * tokens / pricing internals in list DTOs.
 *
 * @module studioEstimateQueueService
 */

import {
  buildQueueIndicators,
  deriveNeedsAttention,
  deriveQueueOpenTarget,
  deriveQueueWorkflowStatus,
  workflowStatusesForFilter
} from "./studioEstimateQueueWorkflow.mjs";

const FORBIDDEN_LIST_KEYS = [
  "graphImmutableMessageId",
  "internetMessageId",
  "contentHash",
  "subjectHash",
  "fromAddressHash",
  "sha256",
  "storagePath",
  "storage_path",
  "accessToken",
  "token",
  "serviceRole",
  "clientSecret"
];

function stripForbidden(value, depth = 0) {
  if (depth > 6 || value == null) return value;
  if (Array.isArray(value)) return value.map((v) => stripForbidden(v, depth + 1));
  if (typeof value !== "object") return value;
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (FORBIDDEN_LIST_KEYS.includes(k)) continue;
    if (/hash|token|secret|storagepath|graphimmutable/i.test(k)) continue;
    out[k] = stripForbidden(v, depth + 1);
  }
  return out;
}

function clampInt(n, min, max, fallback) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(v)));
}

function safeFilename(name) {
  const s = String(name ?? "").trim();
  if (!s) return "attachment";
  return s.slice(0, 180);
}

function attachmentSummary(attachments = []) {
  const list = Array.isArray(attachments) ? attachments : [];
  let supportedPdfCount = 0;
  let blockedCount = 0;
  const names = [];
  for (const a of list) {
    const support = String(a.support ?? a.support_classification ?? "").toLowerCase();
    const mime = String(a.mimeType ?? a.mime_type ?? "").toLowerCase();
    const fname = safeFilename(a.safeFilename ?? a.safe_filename);
    names.push(fname);
    const isPdf = mime.includes("pdf") || fname.toLowerCase().endsWith(".pdf");
    if (support === "supported" || (isPdf && support !== "unsupported" && support !== "blocked")) {
      supportedPdfCount += 1;
    }
    if (support === "unsupported" || support === "blocked" || support === "failed") {
      blockedCount += 1;
    }
  }
  return {
    count: list.length,
    supportedPdfCount,
    blockedCount,
    filenames: names.slice(0, 8),
    attachmentBlocked: list.length > 0 && supportedPdfCount === 0
  };
}

function customerProjectFromScope(scope) {
  const snap =
    scope?.customerIdentitySnapshot && typeof scope.customerIdentitySnapshot === "object"
      ? scope.customerIdentitySnapshot
      : null;
  const customerName =
    String(snap?.accountDisplayName ?? "").trim() ||
    String(scope?.customerName ?? "").trim() ||
    null;
  const projectName = String(scope?.projectName ?? "").trim() || null;
  return {
    customerName,
    projectName,
    accountLinked: Boolean(scope?.accountDirectoryAccountId || snap?.accountId)
  };
}

function cutoutTotalsFromRooms(rooms = []) {
  let kitchenSink = 0;
  let vanitySink = 0;
  let cooktop = 0;
  let outlet = 0;
  let pieces = 0;
  let countertopSf = 0;
  let backsplashSf = 0;
  for (const room of rooms) {
    backsplashSf += Number(room.backsplashSqft) || 0;
    for (const p of room.pieces ?? []) {
      if (p.included === false) continue;
      pieces += 1;
      countertopSf += Number(p.sqft) || 0;
      // Structured cutouts seeded from approved Takeoff scope.
      for (const c of Array.isArray(p.cutouts) ? p.cutouts : []) {
        const qty = Number(c?.quantity) || 0;
        if (c?.type === "kitchen_sink") kitchenSink += qty;
        else if (c?.type === "vanity_bar_sink") vanitySink += qty;
        else if (c?.type === "cooktop") cooktop += qty;
        else if (c?.type === "electrical_outlet") outlet += qty;
      }
    }
  }
  return { rooms: rooms.length, pieces, countertopSf, backsplashSf, kitchenSink, vanitySink, cooktop, outlet };
}

/**
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   getSupabase?: Function,
 *   listIntakeCases?: Function,
 *   listTakeoffLinksByCaseIds?: Function,
 *   listTakeoffJobsByIds?: Function,
 *   listStudioEstimatesByCaseIds?: Function,
 *   listPublicationsByEstimateIds?: Function,
 *   listOpenReviewRequests?: Function,
 *   updateIntakeCaseActivity?: Function,
 *   getIntakeCaseDetail?: Function,
 *   getLatestTakeoffSummary?: Function
 * }} [deps]
 */
export function createStudioEstimateQueueService(deps = {}) {
  const getSupabase = deps.getSupabase;

  async function defaultListIntakeCases({ organizationId, limit, offset }) {
    const supabase = getSupabase?.();
    if (!supabase) return { rows: [], total: 0 };
    const { data, error, count } = await supabase
      .from("quote_intake_cases")
      .select(
        "id,organization_id,status,source_type,mailbox_identity,received_at,created_at,updated_at,priority,assigned_estimator_user_id,first_opened_at,last_opened_at,last_activity_at,last_estimator_action,created_by_user_id",
        { count: "exact" }
      )
      .eq("organization_id", organizationId)
      .order("received_at", { ascending: false, nullsFirst: false })
      .range(offset, offset + limit - 1);
    if (error) throw Object.assign(new Error(error.message), { statusCode: 503 });
    return { rows: data || [], total: count ?? (data || []).length };
  }

  async function defaultListAttachments(caseIds, organizationId) {
    const supabase = getSupabase?.();
    if (!supabase || !caseIds.length) return new Map();
    const { data, error } = await supabase
      .from("quote_intake_attachments")
      .select(
        "id,intake_case_id,safe_filename,mime_type,support_classification,retrieval_state,attachment_kind,is_inline,size_bytes"
      )
      .eq("organization_id", organizationId)
      .in("intake_case_id", caseIds);
    if (error) return new Map();
    const map = new Map();
    for (const row of data || []) {
      const list = map.get(row.intake_case_id) || [];
      list.push(row);
      map.set(row.intake_case_id, list);
    }
    return map;
  }

  async function defaultListTakeoffLinks(caseIds, organizationId) {
    const supabase = getSupabase?.();
    if (!supabase || !caseIds.length) return new Map();
    const { data, error } = await supabase
      .from("quote_intake_takeoff_links")
      .select(
        "id,intake_case_id,takeoff_job_id,relationship_status,initiation_mode,created_at"
      )
      .eq("organization_id", organizationId)
      .in("intake_case_id", caseIds)
      .order("created_at", { ascending: false });
    if (error) return new Map();
    const map = new Map();
    for (const row of data || []) {
      if (map.has(row.intake_case_id)) continue; // newest only
      map.set(row.intake_case_id, row);
    }
    return map;
  }

  async function defaultListTakeoffJobs(jobIds, organizationId) {
    const supabase = getSupabase?.();
    if (!supabase || !jobIds.length) return new Map();
    const { data, error } = await supabase
      .from("quote_takeoff_jobs")
      .select("id,status,review_status,updated_at,result_summary")
      .eq("organization_id", organizationId)
      .in("id", jobIds);
    if (error) return new Map();
    return new Map((data || []).map((r) => [r.id, r]));
  }

  async function defaultListEstimates(caseIds, organizationId) {
    const supabase = getSupabase?.();
    if (!supabase || !caseIds.length) return new Map();
    const { data, error } = await supabase
      .from("studio_estimates")
      .select(
        "id,intake_case_id,takeoff_job_id,status,revision,scope_json,stale_reason,approved_at,updated_at,calculation_fingerprint,superseded_at"
      )
      .eq("organization_id", organizationId)
      .in("intake_case_id", caseIds)
      .is("superseded_at", null);
    if (error) return new Map();
    const map = new Map();
    for (const row of data || []) {
      map.set(String(row.intake_case_id), row);
    }
    return map;
  }

  async function defaultListPublications(estimateIds, organizationId) {
    const supabase = getSupabase?.();
    if (!supabase || !estimateIds.length) return new Map();
    const { data, error } = await supabase
      .from("quote_publications")
      .select(
        "id,source_quote_id,status,published_at,revoked_at,superseded_at,access_expires_at,revision_number,revision_label"
      )
      .eq("organization_id", organizationId)
      .in("source_quote_id", estimateIds)
      .order("published_at", { ascending: false });
    if (error) return new Map();
    const map = new Map();
    for (const row of data || []) {
      const key = String(row.source_quote_id);
      if (map.has(key)) continue;
      map.set(key, row);
    }
    return map;
  }

  async function defaultListReviewRequests(organizationId) {
    const supabase = getSupabase?.();
    if (!supabase) return [];
    // Prefer configuration review requests table if present; tolerate missing.
    const { data, error } = await supabase
      .from("digital_estimate_configuration_review_requests")
      .select(
        "id,organization_id,publication_id,status,requested_at,closed_at,closed_reason,studio_estimate_id,intake_case_id"
      )
      .eq("organization_id", organizationId)
      .order("requested_at", { ascending: false })
      .limit(200);
    if (error) return [];
    return data || [];
  }

  const listIntakeCases = deps.listIntakeCases || defaultListIntakeCases;
  const listAttachments = deps.listAttachments || defaultListAttachments;
  const listTakeoffLinks = deps.listTakeoffLinksByCaseIds || defaultListTakeoffLinks;
  const listTakeoffJobs = deps.listTakeoffJobsByIds || defaultListTakeoffJobs;
  const listEstimates = deps.listStudioEstimatesByCaseIds || defaultListEstimates;
  const listPublications = deps.listPublicationsByEstimateIds || defaultListPublications;
  const listReviewRequests = deps.listOpenReviewRequests || defaultListReviewRequests;
  const updateActivity = deps.updateIntakeCaseActivity || defaultUpdateActivity;
  const getCaseDetail = deps.getIntakeCaseDetail || defaultGetCaseDetail;
  const getTakeoffSummary = deps.getLatestTakeoffSummary || defaultGetTakeoffSummary;

  async function defaultUpdateActivity({ organizationId, caseId, patch }) {
    const supabase = getSupabase?.();
    if (!supabase) return null;
    const { data, error } = await supabase
      .from("quote_intake_cases")
      .update(patch)
      .eq("organization_id", organizationId)
      .eq("id", caseId)
      .select(
        "id,first_opened_at,last_opened_at,last_activity_at,last_estimator_action,assigned_estimator_user_id"
      )
      .maybeSingle();
    if (error) throw Object.assign(new Error(error.message), { statusCode: 503 });
    return data;
  }

  async function defaultGetCaseDetail({ organizationId, caseId }) {
    const supabase = getSupabase?.();
    if (!supabase) return null;
    const { data, error } = await supabase
      .from("quote_intake_cases")
      .select(
        "id,organization_id,status,source_type,mailbox_identity,received_at,created_at,updated_at,priority,assigned_estimator_user_id,first_opened_at,last_opened_at,last_activity_at,last_estimator_action"
      )
      .eq("organization_id", organizationId)
      .eq("id", caseId)
      .maybeSingle();
    if (error) throw Object.assign(new Error(error.message), { statusCode: 503 });
    return data;
  }

  async function defaultGetTakeoffSummary({ organizationId, takeoffJobId }) {
    const supabase = getSupabase?.();
    if (!supabase || !takeoffJobId) return null;
    const { data: job } = await supabase
      .from("quote_takeoff_jobs")
      .select("id,status,review_status,result_summary,updated_at")
      .eq("organization_id", organizationId)
      .eq("id", takeoffJobId)
      .maybeSingle();
    if (!job) return null;
    const summary = job.result_summary && typeof job.result_summary === "object" ? job.result_summary : {};
    return {
      takeoffJobId: job.id,
      jobStatus: job.status,
      reviewStatus: job.review_status,
      countertopSf: Number(summary.countertopExactSf ?? summary.countertopSf ?? 0) || 0,
      backsplashSf: Number(summary.backsplashExactSf ?? summary.backsplashSf ?? 0) || 0,
      roomCount: Number(summary.roomCount ?? 0) || null,
      pieceCount: Number(summary.pieceCount ?? 0) || null,
      updatedAt: job.updated_at
    };
  }

  function mapReviewOperator(row) {
    const status = String(row?.status ?? "").toLowerCase();
    const closed = String(row?.closed_reason ?? "").toLowerCase();
    if (status === "requested") return "new";
    if (status === "reviewing" || status === "clarification") return "in_review";
    if (status === "amendment_prepared") return "revision_required";
    if (status === "published") return "resolved_republished";
    if (status === "closed" && closed.includes("no_change")) return "resolved_no_change";
    if (status === "closed" && closed.includes("reject")) return "rejected";
    if (status === "closed") return "resolved_no_change";
    return "";
  }

  function buildRow({
    caseRow,
    attachments,
    link,
    takeoffJob,
    estimate,
    publication,
    reviewRequest
  }) {
    const att = attachmentSummary(
      (attachments || []).map((a) => ({
        safeFilename: a.safe_filename || a.safeFilename,
        mimeType: a.mime_type || a.mimeType,
        support: a.support_classification || a.support
      }))
    );
    const scope = estimate?.scope_json || estimate?.scope || {};
    const { customerName, projectName, accountLinked } = customerProjectFromScope(scope);
    const rooms = Array.isArray(scope.rooms) ? scope.rooms : [];
    const roomStats = cutoutTotalsFromRooms(rooms);

    const takeoffJobStatus = takeoffJob?.status || takeoffJob?.jobStatus || null;
    const takeoffReviewStatus =
      takeoffJob?.review_status || takeoffJob?.reviewStatus || null;
    const estimateStatus = estimate?.status || null;
    const publicationStatus = publication?.status || null;
    const reviewOperatorStatus = reviewRequest ? mapReviewOperator(reviewRequest) : "";
    const estimateNotCalculated =
      estimateStatus === "ready_to_price" && !estimate?.calculation_fingerprint;

    const resultSummary =
      takeoffJob?.result_summary && typeof takeoffJob.result_summary === "object"
        ? takeoffJob.result_summary
        : {};
    const takeoffRoomCount =
      Number(resultSummary.roomCount ?? 0) || roomStats.rooms || 0;
    const takeoffPieceCount =
      Number(resultSummary.pieceCount ?? resultSummary.runCount ?? 0) ||
      roomStats.pieces ||
      0;
    const usableGeometryPresent = takeoffPieceCount > 0 || takeoffRoomCount > 0;
    const estimatorDraftPresent =
      usableGeometryPresent ||
      String(resultSummary.reviewStatus ?? "").toLowerCase() === "needs_review";

    const sourceType = String(caseRow.source_type || caseRow.sourceType || "").toLowerCase();
    const estimateOrigin = String(scope?.estimateOrigin || "").toLowerCase();
    const physicalScopeSource = String(scope?.physicalScopeSource || "").toLowerCase();
    const isManualStaff =
      sourceType === "manual" ||
      estimateOrigin === "manual_staff" ||
      physicalScopeSource === "manual_staff";

    const derivationInput = {
      caseStatus: caseRow.status,
      sourceType,
      estimateOrigin,
      physicalScopeSource,
      firstOpenedAt: caseRow.first_opened_at || caseRow.firstOpenedAt || null,
      takeoffJobId: takeoffJob?.id || link?.takeoff_job_id || link?.takeoffJobId || null,
      takeoffJobStatus,
      takeoffReviewStatus,
      estimateStatus,
      publicationStatus,
      reviewOperatorStatus,
      staleReason: estimate?.stale_reason || estimate?.staleReason || null,
      estimateNotCalculated,
      attachmentBlocked: isManualStaff ? false : att.attachmentBlocked,
      customerViewed: false,
      customerSelectionsSaved: false,
      accepted: false,
      sold: false,
      republished: reviewOperatorStatus === "resolved_republished",
      revisionInProgress:
        reviewOperatorStatus === "revision_required" ||
        (Number(estimate?.revision) > 1 && estimateStatus === "ready_to_price"),
      usableGeometryPresent,
      estimatorDraftPresent,
      roomCount: takeoffRoomCount,
      pieceCount: takeoffPieceCount,
      linkStatus: link?.relationship_status || link?.relationshipStatus || null,
      manualScopeConfirmed: scope?.manualScopeConfirmed === true
    };

    const workflowStatus = deriveQueueWorkflowStatus(derivationInput);
    const attention = deriveNeedsAttention(derivationInput, workflowStatus);
    const openTarget = deriveQueueOpenTarget(derivationInput);
    const indicators = buildQueueIndicators(derivationInput, workflowStatus, attention);

    // Keep AI column aligned with authoritative workflow vocabulary (no "idle").
    const takeoffDisplay = isManualStaff
      ? scope?.manualScopeConfirmed
        ? "Manual scope confirmed"
        : "Manual scope"
      : workflowStatus.startsWith("Takeoff")
        ? workflowStatus
        : takeoffReviewStatus === "approved"
          ? "Approved"
          : takeoffJobStatus === "failed" || takeoffJobStatus === "error"
            ? "Takeoff failed"
            : "Not started";

    const lastActivityAt =
      caseRow.last_activity_at ||
      caseRow.lastActivityAt ||
      estimate?.updated_at ||
      takeoffJob?.updated_at ||
      caseRow.updated_at ||
      caseRow.received_at ||
      null;

    return stripForbidden({
      id: caseRow.id,
      customerName: customerName || "Unknown",
      projectName: projectName || "Unknown",
      accountLinked: Boolean(accountLinked),
      accountDirectoryLinked: Boolean(accountLinked),
      sourceType: sourceType || null,
      sourceBadge: isManualStaff ? "Manual" : sourceType === "graph_mailbox" ? "Email" : null,
      estimateOrigin: estimateOrigin || (isManualStaff ? "manual_staff" : null),
      senderLabel: isManualStaff
        ? "Manual estimate"
        : caseRow.mailbox_identity
          ? "Inbound mailbox"
          : "Inbound sender",
      salespersonLabel: null,
      receivedAt: caseRow.received_at || caseRow.receivedAt || caseRow.created_at || null,
      attachmentStatus: att.count
        ? `${att.count} file${att.count === 1 ? "" : "s"}${att.supportedPdfCount ? ` · ${att.supportedPdfCount} PDF` : ""}`
        : "No attachments",
      attachmentSummary: {
        count: att.count,
        supportedPdfCount: att.supportedPdfCount,
        blockedCount: att.blockedCount,
        filenames: att.filenames
      },
      aiTakeoffStatus: takeoffDisplay,
      estimateStatus: estimateStatus || "none",
      digitalEstimateStatus: publicationStatus || "none",
      customerReviewStatus: reviewOperatorStatus || "none",
      workflowStatus,
      needsAttention: attention.needsAttention,
      attentionReasons: attention.reasons,
      lastActivityAt,
      assignedEstimatorUserId: caseRow.assigned_estimator_user_id || caseRow.assignedEstimatorUserId || null,
      assignedEstimatorLabel: caseRow.assigned_estimator_user_id
        ? `User ${String(caseRow.assigned_estimator_user_id).slice(0, 8)}…`
        : "Unassigned",
      priority: caseRow.priority || "normal",
      firstOpenedAt: caseRow.first_opened_at || caseRow.firstOpenedAt || null,
      lastOpenedAt: caseRow.last_opened_at || caseRow.lastOpenedAt || null,
      lastEstimatorAction: caseRow.last_estimator_action || caseRow.lastEstimatorAction || null,
      takeoffJobId: link?.takeoff_job_id || link?.takeoffJobId || estimate?.takeoff_job_id || null,
      studioEstimateId: estimate?.id || null,
      publicationId: publication?.id || null,
      reviewRequestId: reviewRequest?.id || null,
      openTarget,
      indicators,
      roomCount: roomStats.rooms || null,
      pieceCount: roomStats.pieces || null,
      countertopSf: roomStats.countertopSf || null,
      backsplashSf: roomStats.backsplashSf || null,
      caseStatus: caseRow.status,
      manualScopeConfirmed: scope?.manualScopeConfirmed === true,
      searchText: [
        customerName,
        projectName,
        caseRow.status,
        workflowStatus,
        takeoffDisplay,
        estimateStatus,
        publicationStatus,
        ...(att.filenames || [])
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
    });
  }

  function applyFilters(rows, query) {
    const search = String(query.search || query.q || "")
      .trim()
      .toLowerCase();
    const filter = String(query.filter || "all").toLowerCase();
    const assignee = String(query.assignedEstimatorUserId || "").trim();
    const receivedFrom = query.receivedFrom ? Date.parse(String(query.receivedFrom)) : null;
    const receivedTo = query.receivedTo ? Date.parse(String(query.receivedTo)) : null;
    const activityFrom = query.activityFrom ? Date.parse(String(query.activityFrom)) : null;
    const activityTo = query.activityTo ? Date.parse(String(query.activityTo)) : null;
    const statusSet = workflowStatusesForFilter(filter);

    return rows.filter((row) => {
      if (search) {
        const hay = String(row.searchText || "").toLowerCase();
        if (!hay.includes(search)) return false;
      }
      if (filter === "needs_attention" && !row.needsAttention) return false;
      if (statusSet && !statusSet.has(row.workflowStatus)) return false;
      if (assignee && String(row.assignedEstimatorUserId || "") !== assignee) return false;
      if (receivedFrom && Date.parse(row.receivedAt || 0) < receivedFrom) return false;
      if (receivedTo && Date.parse(row.receivedAt || 0) > receivedTo) return false;
      if (activityFrom && Date.parse(row.lastActivityAt || 0) < activityFrom) return false;
      if (activityTo && Date.parse(row.lastActivityAt || 0) > activityTo) return false;
      return true;
    });
  }

  function applySort(rows, query) {
    const sort = String(query.sort || "newest_received").toLowerCase();
    const copy = [...rows];
    copy.sort((a, b) => {
      switch (sort) {
        case "oldest_received":
          return Date.parse(a.receivedAt || 0) - Date.parse(b.receivedAt || 0);
        case "recent_activity":
          return Date.parse(b.lastActivityAt || 0) - Date.parse(a.lastActivityAt || 0);
        case "status":
          return String(a.workflowStatus).localeCompare(String(b.workflowStatus));
        case "customer":
          return String(a.customerName).localeCompare(String(b.customerName)) ||
            String(a.projectName).localeCompare(String(b.projectName));
        case "newest_received":
        default:
          return Date.parse(b.receivedAt || 0) - Date.parse(a.receivedAt || 0);
      }
    });
    return copy;
  }

  return {
    async listQueue({ organizationId, query = {} }) {
      if (!organizationId) {
        const err = new Error("Organization required");
        err.statusCode = 403;
        throw err;
      }
      const limit = clampInt(query.limit, 1, 100, 50);
      const offset = clampInt(query.offset, 0, 100000, 0);

      // Fetch a working window then filter in-memory for v1 (org-scoped; bounded).
      const fetchLimit = Math.min(500, Math.max(limit + offset, 100));
      const { rows: caseRows, total: dbTotal } = await listIntakeCases({
        organizationId,
        limit: fetchLimit,
        offset: 0
      });

      const caseIds = caseRows.map((r) => r.id);
      const [attachmentsMap, linksMap, estimatesMap, reviewRows] = await Promise.all([
        listAttachments(caseIds, organizationId),
        listTakeoffLinks(caseIds, organizationId),
        listEstimates(caseIds, organizationId),
        listReviewRequests(organizationId)
      ]);

      const jobIds = [
        ...new Set(
          [...linksMap.values(), ...estimatesMap.values()]
            .map((x) => x.takeoff_job_id || x.takeoffJobId)
            .filter(Boolean)
        )
      ];
      const jobsMap = await listTakeoffJobs(jobIds, organizationId);
      const estimateIds = [...estimatesMap.values()].map((e) => e.id).filter(Boolean);
      const pubsMap = await listPublications(estimateIds, organizationId);

      const reviewByCase = new Map();
      const reviewByEstimate = new Map();
      for (const rr of reviewRows) {
        if (rr.intake_case_id && !reviewByCase.has(rr.intake_case_id)) {
          reviewByCase.set(rr.intake_case_id, rr);
        }
        if (rr.studio_estimate_id && !reviewByEstimate.has(rr.studio_estimate_id)) {
          reviewByEstimate.set(rr.studio_estimate_id, rr);
        }
      }

      let rows = caseRows.map((caseRow) => {
        const estimate = estimatesMap.get(String(caseRow.id)) || null;
        const link = linksMap.get(caseRow.id) || null;
        const jobId = link?.takeoff_job_id || estimate?.takeoff_job_id || null;
        const takeoffJob = jobId ? jobsMap.get(jobId) : null;
        const publication = estimate ? pubsMap.get(String(estimate.id)) : null;
        const reviewRequest =
          reviewByCase.get(caseRow.id) ||
          (estimate ? reviewByEstimate.get(estimate.id) : null) ||
          null;
        return buildRow({
          caseRow,
          attachments: attachmentsMap.get(caseRow.id) || [],
          link,
          takeoffJob,
          estimate,
          publication,
          reviewRequest
        });
      });

      rows = applySort(applyFilters(rows, query), query);
      const total = rows.length;
      const page = rows.slice(offset, offset + limit).map((r) => {
        const { searchText, ...rest } = r;
        return rest;
      });

      const attentionCount = rows.filter((r) => r.needsAttention).length;

      return {
        ok: true,
        total,
        limit,
        offset,
        dbCaseCount: dbTotal,
        attentionCount,
        cases: page
      };
    },

    async getPreview({ organizationId, caseId }) {
      if (!organizationId || !caseId) {
        const err = new Error("Case not found");
        err.statusCode = 404;
        throw err;
      }
      const caseRow = await getCaseDetail({ organizationId, caseId });
      if (!caseRow || String(caseRow.organization_id || caseRow.organizationId) !== String(organizationId)) {
        const err = new Error("Case not found");
        err.statusCode = 404;
        throw err;
      }

      const [attachmentsMap, linksMap, estimatesMap, reviewRows] = await Promise.all([
        listAttachments([caseId], organizationId),
        listTakeoffLinks([caseId], organizationId),
        listEstimates([caseId], organizationId),
        listReviewRequests(organizationId)
      ]);
      const estimate = estimatesMap.get(String(caseId)) || null;
      const link = linksMap.get(caseId) || null;
      const jobId = link?.takeoff_job_id || estimate?.takeoff_job_id || null;
      const jobsMap = await listTakeoffJobs(jobId ? [jobId] : [], organizationId);
      const takeoffJob = jobId ? jobsMap.get(jobId) : null;
      const pubsMap = await listPublications(estimate ? [estimate.id] : [], organizationId);
      const publication = estimate ? pubsMap.get(String(estimate.id)) : null;
      const reviewRequest =
        reviewRows.find((r) => r.intake_case_id === caseId) ||
        (estimate && reviewRows.find((r) => r.studio_estimate_id === estimate.id)) ||
        null;

      const row = buildRow({
        caseRow,
        attachments: attachmentsMap.get(caseId) || [],
        link,
        takeoffJob,
        estimate,
        publication,
        reviewRequest
      });
      const takeoffSummary = jobId
        ? await getTakeoffSummary({ organizationId, takeoffJobId: jobId })
        : null;
      const scope = estimate?.scope_json || estimate?.scope || {};
      const rooms = Array.isArray(scope.rooms) ? scope.rooms : [];
      const roomStats = cutoutTotalsFromRooms(rooms);

      const { searchText, ...safeRow } = row;
      return stripForbidden({
        ok: true,
        case: safeRow,
        preview: {
          customerName: safeRow.customerName,
          projectName: safeRow.projectName,
          senderLabel: safeRow.senderLabel,
          salespersonLabel: safeRow.salespersonLabel,
          receivedAt: safeRow.receivedAt,
          attachments: (attachmentsMap.get(caseId) || []).map((a) => ({
            id: a.id,
            filename: safeFilename(a.safe_filename || a.safeFilename),
            mimeType: a.mime_type || a.mimeType || null,
            support: a.support_classification || a.support || null,
            sizeBytes: a.size_bytes == null ? null : Number(a.size_bytes)
          })),
          pdfSupportState:
            safeRow.attachmentSummary.supportedPdfCount > 0
              ? "supported"
              : safeRow.attachmentSummary.count
                ? "unsupported"
                : "none",
          aiTakeoff: {
            status: safeRow.aiTakeoffStatus,
            takeoffJobId: safeRow.takeoffJobId,
            rooms: takeoffSummary?.roomCount ?? roomStats.rooms,
            pieces: takeoffSummary?.pieceCount ?? roomStats.pieces,
            countertopSf: takeoffSummary?.countertopSf ?? roomStats.countertopSf,
            backsplashSf: takeoffSummary?.backsplashSf ?? roomStats.backsplashSf,
            cutouts: {
              kitchenSink: roomStats.kitchenSink,
              vanityBarSink: roomStats.vanitySink,
              cooktop: roomStats.cooktop,
              outlet: roomStats.outlet
            },
            warnings: safeRow.attentionReasons
          },
          estimateStatus: safeRow.estimateStatus,
          digitalEstimateStatus: safeRow.digitalEstimateStatus,
          customerReviewStatus: safeRow.customerReviewStatus,
          workflowStatus: safeRow.workflowStatus,
          openTarget: safeRow.openTarget,
          activity: {
            firstOpenedAt: safeRow.firstOpenedAt,
            lastOpenedAt: safeRow.lastOpenedAt,
            lastActivityAt: safeRow.lastActivityAt,
            lastEstimatorAction: safeRow.lastEstimatorAction,
            assignedEstimatorLabel: safeRow.assignedEstimatorLabel
          },
          timeline: [
            safeRow.receivedAt ? { at: safeRow.receivedAt, label: "Received" } : null,
            safeRow.firstOpenedAt ? { at: safeRow.firstOpenedAt, label: "First opened" } : null,
            takeoffSummary?.updatedAt
              ? { at: takeoffSummary.updatedAt, label: "Takeoff updated" }
              : null,
            estimate?.updated_at || estimate?.updatedAt
              ? { at: estimate.updated_at || estimate.updatedAt, label: "Estimate updated" }
              : null,
            publication?.published_at
              ? { at: publication.published_at, label: "Digital Estimate published" }
              : null,
            reviewRequest?.requested_at
              ? { at: reviewRequest.requested_at, label: "Customer review requested" }
              : null
          ].filter(Boolean)
        }
      });
    },

    async recordOpened({ organizationId, caseId, actorUserId }) {
      const now = new Date().toISOString();
      const existing = await getCaseDetail({ organizationId, caseId });
      if (!existing) {
        const err = new Error("Case not found");
        err.statusCode = 404;
        throw err;
      }
      const patch = {
        last_opened_at: now,
        last_activity_at: now,
        last_estimator_action: "opened",
        updated_at: now
      };
      if (!existing.first_opened_at && !existing.firstOpenedAt) {
        patch.first_opened_at = now;
      }
      if (actorUserId && !existing.assigned_estimator_user_id && !existing.assignedEstimatorUserId) {
        // Soft-assign on first open only when unassigned — does not overwrite.
        patch.assigned_estimator_user_id = actorUserId;
      }
      const updated = await updateActivity({ organizationId, caseId, patch });
      return {
        ok: true,
        caseId,
        firstOpenedAt: updated?.first_opened_at || patch.first_opened_at || existing.first_opened_at,
        lastOpenedAt: updated?.last_opened_at || now,
        assignedEstimatorUserId:
          updated?.assigned_estimator_user_id ||
          existing.assigned_estimator_user_id ||
          actorUserId ||
          null
      };
    },

    async assignEstimator({ organizationId, caseId, assignedEstimatorUserId, actorUserId }) {
      const now = new Date().toISOString();
      const existing = await getCaseDetail({ organizationId, caseId });
      if (!existing) {
        const err = new Error("Case not found");
        err.statusCode = 404;
        throw err;
      }
      const assignee = assignedEstimatorUserId ? String(assignedEstimatorUserId).trim() : null;
      const updated = await updateActivity({
        organizationId,
        caseId,
        patch: {
          assigned_estimator_user_id: assignee,
          last_activity_at: now,
          last_estimator_action: assignee ? "assigned" : "unassigned",
          updated_at: now,
          updated_by_user_id: actorUserId || null
        }
      });
      return {
        ok: true,
        caseId,
        assignedEstimatorUserId: updated?.assigned_estimator_user_id ?? assignee
      };
    }
  };
}
