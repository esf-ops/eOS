/**
 * Phase 1 — quote_qb_write_queue helpers (one row, test env, dry-run).
 */

import { hashQbWritePayload } from "./quoteQbWriteQueue.js";
import { QB_WRITE_ENV_TEST, validateQbWriteSafetyGate } from "./quoteQbWriteSafety.js";
import { QBTEST_IDEMPOTENCY_KEY, QBTEST_REF_NUMBER } from "./quoteQbEstimateAddBuilder.js";

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {string} organizationId
 * @param {string} idempotencyKey
 */
export async function findQueueRowByIdempotencyKey(db, organizationId, idempotencyKey) {
  const { data, error } = await db
    .from("quote_qb_write_queue")
    .select(
      "id,organization_id,quote_id,quote_revision,operation_type,environment,idempotency_key,payload_hash,status,attempt_count,last_error_code,last_error_message,qb_txn_id,qb_edit_sequence,qb_ref_number,request_payload,response_payload,created_at,updated_at"
    )
    .eq("organization_id", organizationId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (error) throw new Error(`quote_qb_write_queue lookup failed: ${error.message || error}`);
  return data || null;
}

/**
 * Upsert at most one pending QBTEST-0001 queue row. Refuses if succeeded already.
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {{
 *   organizationId: string,
 *   companyIdentity: string,
 *   allowedCompanyIdentities: string[],
 *   requestPayload: object,
 *   createdBy?: string|null
 * }} args
 */
export async function upsertQbtest0001QueueRow(db, args) {
  const idempotencyKey = QBTEST_IDEMPOTENCY_KEY;
  const existing = await findQueueRowByIdempotencyKey(db, args.organizationId, idempotencyKey);

  const safety = validateQbWriteSafetyGate({
    writeEnvironment: QB_WRITE_ENV_TEST,
    quoteNumber: QBTEST_REF_NUMBER,
    companyIdentity: args.companyIdentity,
    allowedCompanyIdentities: args.allowedCompanyIdentities,
    idempotencyKey,
    existingQueueStatus: existing?.status ?? null,
    rejectProductionCompany: true
  });
  if (!safety.ok) {
    return { ok: false, errors: safety.errors, row: existing };
  }

  const payloadHash = hashQbWritePayload(args.requestPayload);
  if (existing) {
    if (existing.status === "succeeded") {
      return {
        ok: false,
        errors: [
          {
            code: "QB_QUEUE_ALREADY_SUCCEEDED",
            message: "Succeeded queue items cannot be re-executed.",
            field: "idempotency_key"
          }
        ],
        row: existing
      };
    }
    const { data, error } = await db
      .from("quote_qb_write_queue")
      .update({
        environment: QB_WRITE_ENV_TEST,
        operation_type: "EstimateAdd",
        payload_hash: payloadHash,
        request_payload: args.requestPayload,
        status: "pending",
        last_error_code: null,
        last_error_message: null,
        updated_at: new Date().toISOString()
      })
      .eq("id", existing.id)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(`quote_qb_write_queue update failed: ${error.message || error}`);
    return { ok: true, errors: [], row: data, created: false };
  }

  const insertRow = {
    organization_id: args.organizationId,
    quote_id: null,
    quote_revision: null,
    operation_type: "EstimateAdd",
    environment: QB_WRITE_ENV_TEST,
    idempotency_key: idempotencyKey,
    payload_hash: payloadHash,
    status: "pending",
    attempt_count: 0,
    request_payload: args.requestPayload,
    created_by: args.createdBy ?? null
  };
  const { data, error } = await db.from("quote_qb_write_queue").insert(insertRow).select("*").maybeSingle();
  if (error) throw new Error(`quote_qb_write_queue insert failed: ${error.message || error}`);
  return { ok: true, errors: [], row: data, created: true };
}

/**
 * Phase 1.1 dry-run: if a leftover claim exists for the QBTEST idempotency key,
 * restore it to pending. Does not claim. Used so dry-run never leaves claimed.
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {{ organizationId: string }} args
 */
export async function restoreClaimedQbtest0001QueueRowToPending(db, args) {
  const existing = await findQueueRowByIdempotencyKey(db, args.organizationId, QBTEST_IDEMPOTENCY_KEY);
  if (!existing || existing.status !== "claimed") {
    return { ok: true, restored: false, row: existing };
  }
  const { data, error } = await db
    .from("quote_qb_write_queue")
    .update({
      status: "pending",
      last_error_code: null,
      last_error_message: "phase1_1_dry_run_restored_from_claimed",
      updated_at: new Date().toISOString()
    })
    .eq("id", existing.id)
    .eq("status", "claimed")
    .select("*")
    .maybeSingle();
  if (error) throw new Error(`quote_qb_write_queue restore-from-claimed failed: ${error.message || error}`);
  return { ok: true, restored: Boolean(data), row: data || existing };
}

/**
 * Claim exactly one pending queue row by id. Fails if not pending or wrong env.
 * Future transmitting worker only — dry-run must not call this.
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {{ organizationId: string, queueRowId: string }} args
 */
export async function claimSinglePendingQueueRow(db, args) {
  const { data: row, error } = await db
    .from("quote_qb_write_queue")
    .select("*")
    .eq("id", args.queueRowId)
    .eq("organization_id", args.organizationId)
    .maybeSingle();
  if (error) throw new Error(`quote_qb_write_queue claim lookup failed: ${error.message || error}`);
  if (!row) {
    return {
      ok: false,
      errors: [{ code: "QB_QUEUE_ROW_NOT_FOUND", message: "Queue row not found." }],
      row: null
    };
  }
  if (row.environment !== QB_WRITE_ENV_TEST) {
    return {
      ok: false,
      errors: [{ code: "QB_QUEUE_ENV_NOT_TEST", message: "Queue row environment must be test." }],
      row
    };
  }
  if (row.status === "succeeded") {
    return {
      ok: false,
      errors: [{ code: "QB_QUEUE_ALREADY_SUCCEEDED", message: "Succeeded queue items cannot be re-executed." }],
      row
    };
  }
  if (row.status !== "pending" && row.status !== "failed") {
    return {
      ok: false,
      errors: [
        {
          code: "QB_QUEUE_NOT_CLAIMABLE",
          message: `Queue row status "${row.status}" is not claimable.`
        }
      ],
      row
    };
  }

  const attempt = Number(row.attempt_count || 0) + 1;
  const { data: claimed, error: updErr } = await db
    .from("quote_qb_write_queue")
    .update({
      status: "claimed",
      attempt_count: attempt,
      last_attempt_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq("id", row.id)
    .eq("status", row.status)
    .select("*")
    .maybeSingle();
  if (updErr) throw new Error(`quote_qb_write_queue claim failed: ${updErr.message || updErr}`);
  if (!claimed) {
    return {
      ok: false,
      errors: [{ code: "QB_QUEUE_CLAIM_RACE", message: "Queue row was claimed by another process." }],
      row
    };
  }
  return { ok: true, errors: [], row: claimed };
}
