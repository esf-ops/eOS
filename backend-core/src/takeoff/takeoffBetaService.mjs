/**
 * AI Takeoff controlled beta — feedback, issue reports, workflow metrics (v6.4).
 *
 * Persists to quote_takeoff_jobs.metadata.takeoff_beta and eos_action_log.
 *
 * @module takeoffBetaService
 */

import { logAction } from "../auth/auditLog.js";
import { sumTakeoffMeasurementTotalsFromRooms } from "./takeoffImportMeasurements.mjs";

export const TAKEOFF_BETA_LABEL =
  "AI-assisted takeoff beta — estimator verification required.";

export const TAKEOFF_BETA_IMPORT_CONFIRMATION_TEXT =
  "I reviewed the measurements and understand this will create an Internal Estimate draft.";

export const TAKEOFF_ISSUE_CATEGORIES = [
  "missed_room_piece",
  "wrong_dimension",
  "backsplash_issue",
  "cutout_addon_issue",
  "wrong_room_assignment",
  "plan_unreadable",
  "import_problem",
  "other",
];

export const TAKEOFF_BETA_METRIC_EVENTS = [
  "ai_takeoff_draft_generated",
  "ai_takeoff_review_started",
  "ai_takeoff_approved_for_import",
  "ai_takeoff_import_confirmed",
  "ai_takeoff_import_cancelled",
  "ai_takeoff_quote_saved",
  "ai_takeoff_feedback_submitted",
  "ai_takeoff_issue_reported",
];

function isUuid(v) {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function nowIso() {
  return new Date().toISOString();
}

function msBetween(a, b) {
  if (!a || !b) return null;
  const t0 = Date.parse(String(a));
  const t1 = Date.parse(String(b));
  if (!Number.isFinite(t0) || !Number.isFinite(t1)) return null;
  return Math.max(0, t1 - t0);
}

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function emptyBetaBlock() {
  return {
    timestamps: {},
    metricsEvents: [],
    feedback: [],
    issueReports: [],
  };
}

export function normalizeTakeoffBetaBlock(metadata) {
  const raw =
    metadata?.takeoff_beta && typeof metadata.takeoff_beta === "object"
      ? metadata.takeoff_beta
      : metadata?.takeoffBeta && typeof metadata.takeoffBeta === "object"
        ? metadata.takeoffBeta
        : null;
  if (!raw) return emptyBetaBlock();
  return {
    timestamps: raw.timestamps && typeof raw.timestamps === "object" ? { ...raw.timestamps } : {},
    metricsEvents: Array.isArray(raw.metricsEvents) ? [...raw.metricsEvents] : [],
    feedback: Array.isArray(raw.feedback) ? [...raw.feedback] : [],
    issueReports: Array.isArray(raw.issueReports) ? [...raw.issueReports] : [],
  };
}

export function computeTakeoffBetaDurations(timestamps) {
  const ts = timestamps && typeof timestamps === "object" ? timestamps : {};
  const uploadAt = ts.workspaceCreatedAt ?? ts.uploadAt ?? null;
  const draftAt = ts.draftGeneratedAt ?? null;
  const approvedAt = ts.approvedAt ?? null;
  const importedAt = ts.importConfirmedAt ?? ts.importedAt ?? null;
  const savedAt = ts.quoteSavedAt ?? null;

  return {
    uploadToDraftGeneratedMs: msBetween(uploadAt, draftAt),
    draftGeneratedToApprovalMs: msBetween(draftAt, approvedAt),
    approvalToImportMs: msBetween(approvedAt, importedAt),
    importToQuoteSaveMs: msBetween(importedAt, savedAt),
  };
}

export function assertBetaImportConfirmed(body) {
  const confirmed = Boolean(body?.betaImportConfirmed ?? body?.beta_import_confirmed);
  if (!confirmed) {
    throw Object.assign(
      new Error(
        "Beta import confirmation required — estimator must confirm measurements were reviewed."
      ),
      { statusCode: 422, code: "beta_import_confirmation_required" }
    );
  }
}

function timestampKeyForEvent(eventType) {
  switch (eventType) {
    case "ai_takeoff_draft_generated":
      return "draftGeneratedAt";
    case "ai_takeoff_review_started":
      return "reviewStartedAt";
    case "ai_takeoff_approved_for_import":
      return "approvedAt";
    case "ai_takeoff_import_confirmed":
      return "importConfirmedAt";
    case "ai_takeoff_quote_saved":
      return "quoteSavedAt";
    default:
      return null;
  }
}

function normalizeBool(v) {
  if (typeof v === "boolean") return v;
  if (v === "yes" || v === "true" || v === 1 || v === "1") return true;
  if (v === "no" || v === "false" || v === 0 || v === "0") return false;
  return null;
}

function normalizeIssueCategory(raw) {
  const c = String(raw ?? "").trim().toLowerCase();
  if (TAKEOFF_ISSUE_CATEGORIES.includes(c)) return c;
  const aliases = {
    missed_room: "missed_room_piece",
    missed_piece: "missed_room_piece",
    wrong_dimensions: "wrong_dimension",
    backsplash: "backsplash_issue",
    cutout: "cutout_addon_issue",
    addon: "cutout_addon_issue",
    room_assignment: "wrong_room_assignment",
    unreadable: "plan_unreadable",
    import: "import_problem",
  };
  return aliases[c] ?? null;
}

/**
 * @param {object} row
 */
export function formatTakeoffBetaQaRow(row) {
  const importedCt = Number(row?.importedTotals?.countertopSqft ?? 0);
  const importedBs = Number(row?.importedTotals?.standardBacksplashSqft ?? 0);
  const currentCt = Number(row?.currentTotals?.countertopSqft ?? 0);
  const currentBs = Number(row?.currentTotals?.standardBacksplashSqft ?? 0);
  const deltaCt = round2(currentCt - importedCt);
  const deltaBs = round2(currentBs - importedBs);
  const feedbackCount = Number(row?.feedbackCount ?? 0);
  const issueCount = Number(row?.issueCount ?? 0);

  return {
    quoteId: row?.quoteId ?? null,
    quoteNumber: row?.quoteNumber ?? null,
    takeoffJobId: row?.takeoffJobId ?? null,
    estimator: row?.estimator ?? null,
    importedAt: row?.importedAt ?? null,
    importedCountertopSf: round2(importedCt),
    importedBacksplashSf: round2(importedBs),
    currentCountertopSf: round2(currentCt),
    currentBacksplashSf: round2(currentBs),
    deltaCountertopSf: deltaCt,
    deltaBacksplashSf: deltaBs,
    feedbackStatus: feedbackCount > 0 ? "submitted" : "none",
    feedbackCount,
    issueCount,
  };
}

async function loadJobRow(db, organizationId, takeoffJobId) {
  const { data, error } = await db
    .from("quote_takeoff_jobs")
    .select("id,organization_id,metadata,created_at,quote_id")
    .eq("id", takeoffJobId)
    .eq("organization_id", organizationId)
    .limit(1);
  if (error) throw Object.assign(new Error(error.message), { statusCode: 503 });
  const job = data?.[0];
  if (!job) throw Object.assign(new Error("Takeoff job not found"), { statusCode: 404 });
  return job;
}

async function persistTakeoffBetaBlock(db, organizationId, takeoffJobId, betaBlock, baseMetadata) {
  const nextMetadata = {
    ...(baseMetadata && typeof baseMetadata === "object" ? baseMetadata : {}),
    takeoff_beta: betaBlock,
  };
  const { error } = await db
    .from("quote_takeoff_jobs")
    .update({ metadata: nextMetadata, updated_at: nowIso() })
    .eq("id", takeoffJobId)
    .eq("organization_id", organizationId);
  if (error) throw Object.assign(new Error(error.message), { statusCode: 503 });
  return nextMetadata;
}

/**
 * Record a durable beta workflow metric on the takeoff job.
 */
export async function recordTakeoffBetaMetric({
  db,
  organizationId,
  takeoffJobId,
  eventType,
  userId = null,
  userEmail = null,
  quoteId = null,
  metadata = null,
  req = null,
  workspaceCreatedAt = null,
}) {
  if (!isUuid(organizationId) || !isUuid(takeoffJobId)) {
    throw Object.assign(new Error("organizationId and takeoffJobId must be UUIDs"), { statusCode: 400 });
  }
  if (!TAKEOFF_BETA_METRIC_EVENTS.includes(eventType)) {
    throw Object.assign(new Error(`Unknown beta metric event: ${eventType}`), { statusCode: 400 });
  }

  const job = await loadJobRow(db, organizationId, takeoffJobId);
  const beta = normalizeTakeoffBetaBlock(job.metadata);
  const at = nowIso();

  if (!beta.timestamps.workspaceCreatedAt) {
    beta.timestamps.workspaceCreatedAt = workspaceCreatedAt ?? job.created_at ?? at;
  }
  const tsKey = timestampKeyForEvent(eventType);
  if (tsKey && !beta.timestamps[tsKey]) {
    beta.timestamps[tsKey] = at;
  }

  const durations = computeTakeoffBetaDurations(beta.timestamps);
  const eventRow = {
    eventType,
    at,
    userId: userId ?? null,
    userEmail: userEmail ?? null,
    quoteId: quoteId && isUuid(quoteId) ? quoteId : null,
    durations,
    metadata: metadata && typeof metadata === "object" ? metadata : null,
  };

  beta.metricsEvents.push(eventRow);
  await persistTakeoffBetaBlock(db, organizationId, takeoffJobId, beta, job.metadata);

  const logHead = eventType === "ai_takeoff_quote_saved" ? "quote" : "ai_takeoff";
  await logAction({
    user: userId ? { id: userId, email: userEmail } : null,
    head: logHead,
    actionType: eventType,
    entityType: quoteId ? "quote_header" : "quote_takeoff_job",
    entityId: quoteId ?? takeoffJobId,
    metadata: {
      takeoff_job_id: takeoffJobId,
      quote_id: quoteId ?? null,
      ...durations,
      ...(metadata && typeof metadata === "object" ? metadata : {}),
    },
    req,
  }).catch(() => {});

  return { ok: true, event: eventRow, durations };
}

export async function submitTakeoffFeedback({
  db,
  organizationId,
  takeoffJobId,
  userId = null,
  userEmail = null,
  quoteId = null,
  helpful = null,
  editedMeasurements = null,
  missedRooms = null,
  misreadBacksplash = null,
  note = null,
  estimatedTimeSavedMinutes = null,
  req = null,
}) {
  if (!isUuid(organizationId) || !isUuid(takeoffJobId)) {
    throw Object.assign(new Error("organizationId and takeoffJobId must be UUIDs"), { statusCode: 400 });
  }

  const helpfulBool = normalizeBool(helpful);
  const editedBool = normalizeBool(editedMeasurements);
  const missedBool = normalizeBool(missedRooms);
  const misreadBool = normalizeBool(misreadBacksplash);

  if (helpfulBool == null || editedBool == null || missedBool == null || misreadBool == null) {
    throw Object.assign(
      new Error("helpful, editedMeasurements, missedRooms, and misreadBacksplash are required yes/no fields"),
      { statusCode: 400 }
    );
  }

  const job = await loadJobRow(db, organizationId, takeoffJobId);
  const beta = normalizeTakeoffBetaBlock(job.metadata);
  const at = nowIso();
  const resolvedQuoteId =
    quoteId && isUuid(quoteId)
      ? quoteId
      : job.metadata?.importedQuoteId && isUuid(job.metadata.importedQuoteId)
        ? job.metadata.importedQuoteId
        : job.quote_id && isUuid(job.quote_id)
          ? job.quote_id
          : null;

  const row = {
    id: `${at}-${beta.feedback.length + 1}`,
    sourceTakeoffJobId: takeoffJobId,
    quoteId: resolvedQuoteId,
    helpful: helpfulBool,
    editedMeasurements: editedBool,
    missedRooms: missedBool,
    misreadBacksplash: misreadBool,
    note: note != null ? String(note).trim().slice(0, 4000) || null : null,
    estimatedTimeSavedMinutes: (() => {
      const n = Number(estimatedTimeSavedMinutes);
      return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
    })(),
    at,
    userId: userId ?? null,
    userEmail: userEmail ?? null,
  };

  beta.feedback.push(row);
  await persistTakeoffBetaBlock(db, organizationId, takeoffJobId, beta, job.metadata);

  await recordTakeoffBetaMetric({
    db,
    organizationId,
    takeoffJobId,
    eventType: "ai_takeoff_feedback_submitted",
    userId,
    userEmail,
    quoteId: resolvedQuoteId,
    metadata: {
      helpful: helpfulBool,
      editedMeasurements: editedBool,
      missedRooms: missedBool,
      misreadBacksplash: misreadBool,
      hasNote: Boolean(row.note),
      estimatedTimeSavedMinutes: row.estimatedTimeSavedMinutes,
    },
    req,
  });

  return { ok: true, feedback: row };
}

export async function submitTakeoffIssueReport({
  db,
  organizationId,
  takeoffJobId,
  userId = null,
  userEmail = null,
  quoteId = null,
  category = null,
  note = null,
  sourcePage = null,
  sourcePiece = null,
  req = null,
}) {
  if (!isUuid(organizationId) || !isUuid(takeoffJobId)) {
    throw Object.assign(new Error("organizationId and takeoffJobId must be UUIDs"), { statusCode: 400 });
  }

  const normalizedCategory = normalizeIssueCategory(category);
  if (!normalizedCategory) {
    throw Object.assign(new Error("Invalid issue category"), { statusCode: 400 });
  }

  const job = await loadJobRow(db, organizationId, takeoffJobId);
  const beta = normalizeTakeoffBetaBlock(job.metadata);
  const at = nowIso();
  const resolvedQuoteId =
    quoteId && isUuid(quoteId)
      ? quoteId
      : job.metadata?.importedQuoteId && isUuid(job.metadata.importedQuoteId)
        ? job.metadata.importedQuoteId
        : job.quote_id && isUuid(job.quote_id)
          ? job.quote_id
          : null;

  const row = {
    id: `${at}-${beta.issueReports.length + 1}`,
    takeoffJobId,
    quoteId: resolvedQuoteId,
    category: normalizedCategory,
    note: note != null ? String(note).trim().slice(0, 4000) || null : null,
    status: "open",
    sourcePage: sourcePage != null ? String(sourcePage).trim().slice(0, 120) || null : null,
    sourcePiece: sourcePiece != null ? String(sourcePiece).trim().slice(0, 240) || null : null,
    at,
    userId: userId ?? null,
    userEmail: userEmail ?? null,
  };

  beta.issueReports.push(row);
  await persistTakeoffBetaBlock(db, organizationId, takeoffJobId, beta, job.metadata);

  await recordTakeoffBetaMetric({
    db,
    organizationId,
    takeoffJobId,
    eventType: "ai_takeoff_issue_reported",
    userId,
    userEmail,
    quoteId: resolvedQuoteId,
    metadata: {
      category: normalizedCategory,
      sourcePage: row.sourcePage,
      sourcePiece: row.sourcePiece,
      hasNote: Boolean(row.note),
    },
    req,
  });

  return { ok: true, issueReport: row };
}

export async function buildTakeoffBetaQaSummary(db, organizationId, { limit = 25 } = {}) {
  if (!isUuid(organizationId)) {
    throw Object.assign(new Error("organizationId must be a UUID"), { statusCode: 400 });
  }

  const { data: jobs, error: jobErr } = await db
    .from("quote_takeoff_jobs")
    .select("id,metadata,created_at,updated_at,quote_id")
    .eq("organization_id", organizationId)
    .eq("metadata->>importStatus", "imported")
    .order("updated_at", { ascending: false })
    .limit(Math.min(Math.max(Number(limit) || 25, 1), 100));

  if (jobErr) throw Object.assign(new Error(jobErr.message), { statusCode: 503 });

  const rows = [];
  for (const job of jobs ?? []) {
    const quoteId = job.metadata?.importedQuoteId ?? job.quote_id ?? null;
    if (!quoteId || !isUuid(String(quoteId))) continue;

    const { data: quoteRows } = await db
      .from("quote_headers")
      .select("id,quote_number,entered_by,calculation_snapshot,updated_at")
      .eq("id", quoteId)
      .eq("organization_id", organizationId)
      .limit(1);

    const quote = quoteRows?.[0];
    if (!quote) continue;

    const iu = quote.calculation_snapshot?.internal_ui ?? {};
    const takeoffImport = iu.takeoff_import ?? null;
    const importedTotals = takeoffImport?.totals ?? {};
    const roomDrafts = iu.estimate_room_drafts ?? [];
    const currentTotals = sumTakeoffMeasurementTotalsFromRooms(roomDrafts, "current");
    const beta = normalizeTakeoffBetaBlock(job.metadata);

    rows.push(
      formatTakeoffBetaQaRow({
        quoteId: quote.id,
        quoteNumber: quote.quote_number,
        takeoffJobId: job.id,
        estimator: quote.entered_by ?? takeoffImport?.importedBy ?? null,
        importedAt: takeoffImport?.importedAt ?? job.metadata?.importedAt ?? null,
        importedTotals,
        currentTotals,
        feedbackCount: beta.feedback.length,
        issueCount: beta.issueReports.length,
      })
    );
  }

  return { ok: true, rows, betaLabel: TAKEOFF_BETA_LABEL };
}
