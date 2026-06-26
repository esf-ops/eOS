/**
 * internalQuoteTakeoffImport — create Internal Estimate draft from approved AI Takeoff (v6.0).
 *
 * Raw AI output is never authoritative. Only approved takeoff import snapshots are used.
 *
 * @module internalQuoteTakeoffImport
 */

import { calculateQuote } from "./quoteCalculator.js";
import { generateQuoteNumber, persistQuoteSubmission } from "./quotePersist.js";
import { mergeRowOrganizationId, tableHasOrganizationId } from "../organizations/organizationContext.js";
import * as esf from "./quoteEsfNumber.js";
import {
  buildTakeoffImportPayload,
  takeoffImportPayloadToRoomDrafts,
} from "../takeoff/takeoffImportPayload.mjs";
import { loadReviewStateFromRaw } from "../takeoff/takeoffReviewStatus.mjs";
import { computeTakeoffMeasurements } from "../takeoff/takeoffMeasurementCalc.mjs";
import { validateTakeoffResult } from "../takeoff/takeoffValidator.mjs";
import { evaluateTakeoffQaGate } from "../takeoff/takeoffQaGate.mjs";
import { appendTakeoffImportAuditEvent } from "./internalQuoteTakeoffAudit.mjs";

function isUuid(v) {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {string} organizationId
 * @param {string} takeoffJobId
 */
async function loadApprovedTakeoff(db, organizationId, takeoffJobId) {
  const { data: jobRows, error: jobErr } = await db
    .from("quote_takeoff_jobs")
    .select("id,organization_id,review_status,quote_file_id,result_summary,metadata")
    .eq("id", takeoffJobId)
    .eq("organization_id", organizationId)
    .limit(1);
  if (jobErr) throw Object.assign(new Error(jobErr.message), { statusCode: 503 });
  const job = jobRows?.[0];
  if (!job) throw Object.assign(new Error("Takeoff job not found"), { statusCode: 404 });

  const importStatus = job.metadata?.importStatus ?? job.result_summary?.importStatus ?? null;
  if (importStatus === "imported") {
    throw Object.assign(new Error("This takeoff has already been imported."), { statusCode: 409 });
  }
  if (String(job.review_status ?? "") !== "approved") {
    throw Object.assign(
      new Error("Takeoff must be approved_for_import before creating an Internal Estimate draft."),
      { statusCode: 422 }
    );
  }

  const { data: resultRows, error: resErr } = await db
    .from("quote_takeoff_results")
    .select(
      "id,normalized_takeoff_json,computed_measurements_json,validation_diagnostics_json," +
      "raw_ai_result_json,review_status,reviewed_at,reviewed_by_user_id,import_plan_json"
    )
    .eq("takeoff_job_id", takeoffJobId)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (resErr) throw Object.assign(new Error(resErr.message), { statusCode: 503 });

  let result = resultRows?.[0] ?? null;
  if (!result && job.result_summary?.normalizedTakeoffJson) {
    result = {
      id: null,
      normalized_takeoff_json: job.result_summary.normalizedTakeoffJson,
      computed_measurements_json: job.result_summary.computedMeasurementsJson,
      validation_diagnostics_json: job.result_summary.validationDiagnosticsJson,
      raw_ai_result_json: null,
      review_status: "approved",
      reviewed_at: job.result_summary.approvedAt,
      reviewed_by_user_id: job.result_summary.approvedByUserId,
      import_plan_json: job.result_summary.importPlanJson,
    };
  }
  if (!result?.normalized_takeoff_json) {
    throw Object.assign(new Error("No approved takeoff result found"), { statusCode: 404 });
  }

  let fileName = null;
  if (job.quote_file_id) {
    const { data: fileRows } = await db
      .from("quote_files")
      .select("original_filename")
      .eq("id", job.quote_file_id)
      .limit(1);
    fileName = fileRows?.[0]?.original_filename ?? null;
  }

  return { job, result, fileName };
}

/**
 * Create an Internal Estimate draft quote from an approved takeoff job.
 *
 * @param {{
 *   db: import("@supabase/supabase-js").SupabaseClient,
 *   organizationId: string,
 *   userId?: string|null,
 *   userEmail?: string|null,
 *   takeoffJobId: string,
 *   takeoffResultId?: string|null,
 *   organizationContext?: object|null,
 * }} params
 */
export async function importInternalEstimateFromTakeoff({
  db,
  organizationId,
  userId = null,
  userEmail = "unknown",
  takeoffJobId,
  takeoffResultId = null,
  organizationContext = null,
}) {
  if (!isUuid(organizationId)) {
    throw Object.assign(new Error("organizationId must be a valid UUID"), { statusCode: 400 });
  }
  if (!isUuid(takeoffJobId)) {
    throw Object.assign(new Error("takeoffJobId must be a valid UUID"), { statusCode: 400 });
  }

  const { job, result, fileName } = await loadApprovedTakeoff(db, organizationId, takeoffJobId);
  const takeoffResult = result.normalized_takeoff_json;
  const reviewState = loadReviewStateFromRaw(result.raw_ai_result_json);
  const computed = result.computed_measurements_json ?? computeTakeoffMeasurements(takeoffResult);
  const validation = result.validation_diagnostics_json ?? validateTakeoffResult(takeoffResult, computed);
  const rawJson = result.raw_ai_result_json ?? {};
  const qaGate = evaluateTakeoffQaGate({
    takeoffResult,
    computedMeasurements: computed,
    validationDiagnostics: validation,
    dimensionEvidence: rawJson?._meta?.dimensionEvidence ?? null,
  });

  const approvedSnapshot = rawJson?._meta?.approvedSnapshot ?? null;
  let importPayload = approvedSnapshot?.importPayload ?? null;

  if (!importPayload) {
    importPayload = buildTakeoffImportPayload({
      takeoffJobId,
      takeoffResultId: takeoffResultId ?? result.id ?? null,
      takeoffResult,
      reviewState,
      computed,
      validation,
      qaGate,
      sourceFileName: fileName,
      approvedBy: result.reviewed_by_user_id ?? userEmail,
      approvedAt: result.reviewed_at ?? new Date().toISOString(),
      createdBy: userId ?? userEmail,
      reviewStatus: "approved",
    });
  }

  const roomDrafts = takeoffImportPayloadToRoomDrafts(importPayload);
  const calcBody = {
    quoteSource: "internal_quote",
    engine: "guided_shape_groups_v1",
    rooms: roomDrafts,
    materialGroup: null,
    material_group: null,
    internalMaterialBasis: "wholesale",
  };

  const calc = await calculateQuote(calcBody, { db });

  const orgKey = esf.organizationKeyForQuotes(organizationId);
  const bp = esf.branchPrefixFromBranchLabel("");
  let quoteNumber;
  let quote_number_base = null;
  try {
    const seq = await esf.allocateEsfSequence(db, orgKey, bp);
    quote_number_base = esf.formatEsfQuoteNumberBase(bp, seq);
    quoteNumber = esf.quoteNumberForRevision(quote_number_base, 1);
  } catch {
    quoteNumber = generateQuoteNumber();
  }

  const now = new Date().toISOString();
  const snapshotId = importPayload.takeoffResultId ?? result.id ?? null;

  let takeoffImportBlock = {
    schemaVersion: importPayload.schemaVersion,
    status: "active",
    takeoffJobId,
    takeoffSnapshotId: snapshotId,
    sourceFileName: fileName,
    approvedBy: importPayload.approvedBy,
    approvedAt: importPayload.approvedAt,
    importedBy: userId ?? userEmail,
    importedAt: now,
    totals: importPayload.totals,
    suggestedAddOns: importPayload.suggestedAddOns,
    importWarnings: importPayload.importWarnings,
    importedRoomIds: roomDrafts.map((r) => r.id),
    snapshot: importPayload,
    auditEvents: [],
  };
  takeoffImportBlock = appendTakeoffImportAuditEvent(takeoffImportBlock, {
    type: "takeoff_import_started",
    userId,
    userEmail,
    metadata: { takeoffJobId, takeoffSnapshotId: snapshotId },
  });
  takeoffImportBlock = appendTakeoffImportAuditEvent(takeoffImportBlock, {
    type: "takeoff_import_succeeded",
    userId,
    userEmail,
    metadata: { takeoffJobId, takeoffSnapshotId: snapshotId },
  });

  const snapshotToStore = {
    ...calc.snapshot,
    internal_ui_version: 1,
    internal_ui: {
      quote_workflow: "takeoff_import_draft",
      internal_material_basis: null,
      material_program_default: "elite_100",
      estimate_room_drafts: roomDrafts,
      estimate_rooms: calcBody.rooms,
      color_tbd: true,
      takeoff_import: takeoffImportBlock,
      takeoff_import_checklist: {
        account: false,
        project: false,
        branch: false,
        salesperson: false,
        pricing_mode: false,
        material: false,
        addons: false,
        notes: false,
        ready_to_calculate: false,
      },
    },
  };

  const orgId = organizationId;
  const hasQuoteHeadersOrg = orgId ? await tableHasOrganizationId(db, "quote_headers") : false;

  const { quoteId } = await persistQuoteSubmission(db, {
    body: {
      customer_name: null,
      project_name: fileName ? `Takeoff — ${fileName}` : "Takeoff import draft",
      quote_status: "draft",
      rooms: roomDrafts,
    },
    calc,
    userEmail,
    quoteNumber,
    quoteSource: "internal_quote",
    quoteStatus: "draft",
    snapshotToStore,
    estimatesByGroup: null,
    assignment: null,
    publicResponsePayload: null,
    organizationContext: organizationContext ?? { organizationId },
    skipMondaySync: true,
    headerExtras: {
      quote_family_root_id: null,
      revision_number: 1,
      revision_label: "R1",
      quote_number_base,
      is_current_revision: true,
      source_takeoff_job_id: takeoffJobId,
      source_takeoff_snapshot_id: snapshotId,
    },
  });

  await db
    .from("quote_headers")
    .update({
      quote_family_root_id: quoteId,
      updated_at: now,
    })
    .eq("id", quoteId)
    .eq("quote_source", "internal_quote");

  const nextMetadata = {
    ...(job.metadata && typeof job.metadata === "object" ? job.metadata : {}),
    importStatus: "imported",
    importedQuoteId: quoteId,
    importedAt: now,
    importedByUserId: userId ?? null,
  };

  await db
    .from("quote_takeoff_jobs")
    .update({
      quote_id: quoteId,
      metadata: nextMetadata,
      updated_at: now,
      result_summary: {
        ...(job.result_summary && typeof job.result_summary === "object" ? job.result_summary : {}),
        importStatus: "imported",
        importedQuoteId: quoteId,
        importedAt: now,
      },
    })
    .eq("id", takeoffJobId)
    .eq("organization_id", organizationId);

  return {
    ok: true,
    quoteId,
    quote_number: quoteNumber,
    takeoffJobId,
    takeoffSnapshotId: snapshotId,
    importPayload,
    takeoffImport: takeoffImportBlock,
    workflowStatus: "imported",
  };
}

/**
 * Lightweight validation helper for tests — quote draft fields incomplete until estimator fills them.
 *
 * @param {Record<string, unknown>} snapshot
 */
export function isTakeoffImportDraftComplete(snapshot) {
  const iu = snapshot?.internal_ui;
  if (!iu || typeof iu !== "object") return false;
  const readiness = iu.readiness;
  if (!readiness || typeof readiness !== "object") return false;
  return Object.values(readiness).every(Boolean);
}
