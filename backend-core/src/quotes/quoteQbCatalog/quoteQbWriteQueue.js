/**
 * Phase 0 QuickBooks write queue stubs — schema companion only.
 * No worker execution. No QuickBooks I/O.
 */

import { createHash } from "node:crypto";

import { QB_WRITE_ENV_TEST, validateQbWriteSafetyGate } from "./quoteQbWriteSafety.js";

/**
 * @param {object} payload
 * @returns {string}
 */
export function hashQbWritePayload(payload) {
  const body = JSON.stringify(payload ?? {});
  return createHash("sha256").update(body).digest("hex");
}

/**
 * Build a queue row shape for future insert — does not write to the database.
 *
 * @param {{
 *   organizationId: string,
 *   quoteId: string|null,
 *   quoteRevision?: number|null,
 *   quoteNumber: string,
 *   operationType?: string,
 *   environment?: string,
 *   idempotencyKey: string,
 *   requestPayload: object,
 *   createdBy?: string|null,
 *   companyIdentity?: string|null,
 *   allowedCompanyIdentities?: string[],
 * }} args
 */
export function buildQbWriteQueueRowPreview(args) {
  const environment = args.environment != null ? String(args.environment) : QB_WRITE_ENV_TEST;
  const safety = validateQbWriteSafetyGate({
    writeEnvironment: environment,
    quoteNumber: args.quoteNumber,
    companyIdentity: args.companyIdentity ?? null,
    allowedCompanyIdentities: args.allowedCompanyIdentities ?? [],
    idempotencyKey: args.idempotencyKey,
    existingQueueStatus: null,
    rejectProductionCompany: true
  });

  const requestPayload = args.requestPayload && typeof args.requestPayload === "object" ? args.requestPayload : {};
  return {
    preview_only: true,
    execution_enabled: false,
    safety,
    row: {
      organization_id: args.organizationId,
      quote_id: args.quoteId,
      quote_revision: args.quoteRevision ?? null,
      operation_type: args.operationType || "EstimateAdd",
      environment,
      idempotency_key: String(args.idempotencyKey || "").trim(),
      payload_hash: hashQbWritePayload(requestPayload),
      status: "pending",
      attempt_count: 0,
      request_payload: requestPayload,
      created_by: args.createdBy ?? null
    }
  };
}
