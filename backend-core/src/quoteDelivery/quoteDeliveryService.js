/**
 * Quote Delivery orchestration — preview and env-gated send (Phase 1 dry-run).
 */

import { logAction } from "../auth/auditLog.js";
import { sendEstimateEmail } from "../email/emailClient.js";
import { assertCustomerSafeText } from "./estimateContentSanitizer.js";
import { buildCustomerEstimateDisplayFromSnapshot } from "./estimateDisplayFromSnapshot.js";
import { buildEstimateEmailContent } from "./estimateEmailBuilder.js";
import { computeSnapshotHash, loadInternalQuoteForDelivery } from "./estimateSnapshotLoader.js";
import { buildDeliveryLogRow, insertQuoteDeliveryLog } from "./quoteDeliveryLogs.js";
import { getQuoteDeliveryEnv, isRecipientDomainAllowed } from "./quoteDeliveryEnv.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const MAX_RECIPIENTS = 5;

/**
 * @typedef {{ email: string, type?: string }} DeliveryRecipient
 */

/**
 * @param {unknown} recipients
 * @returns {{ ok: true, recipients: DeliveryRecipient[] } | { ok: false, errors: string[] }}
 */
export function validateDeliveryRecipients(recipients) {
  const errors = [];
  if (!Array.isArray(recipients) || recipients.length === 0) {
    return { ok: false, errors: ["At least one recipient is required"] };
  }
  if (recipients.length > MAX_RECIPIENTS) {
    return { ok: false, errors: [`Maximum ${MAX_RECIPIENTS} recipients allowed`] };
  }

  const normalized = [];
  let toCount = 0;

  for (let i = 0; i < recipients.length; i++) {
    const raw = recipients[i];
    if (!raw || typeof raw !== "object") {
      errors.push(`Recipient ${i + 1} is invalid`);
      continue;
    }
    const email = String(raw.email ?? "").trim().toLowerCase();
    const type = String(raw.type ?? "to").trim().toLowerCase();

    if (!email) {
      errors.push(`Recipient ${i + 1} is missing email`);
      continue;
    }
    if (!EMAIL_RE.test(email)) {
      errors.push(`Recipient ${i + 1} has invalid email format`);
      continue;
    }
    if (type === "bcc") {
      errors.push("BCC recipients are not supported in Phase 1");
      continue;
    }
    if (type !== "to" && type !== "cc") {
      errors.push(`Recipient ${i + 1} has invalid type "${type}" — use "to" or "cc"`);
      continue;
    }
    if (type === "to") toCount += 1;
    normalized.push({ email, type });
  }

  if (toCount < 1) {
    errors.push('At least one recipient with type "to" is required');
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, recipients: normalized };
}

/**
 * @param {DeliveryRecipient[]} recipients
 * @param {{ allowedDomains?: string[], forceRecipient?: string|null }} env
 */
export function applyRecipientPolicy(recipients, env) {
  const warnings = [];
  const force = env.forceRecipient?.trim().toLowerCase();
  if (force) {
    warnings.push(`Non-production force recipient active — delivery would go to ${force}`);
    return {
      ok: true,
      recipients: [{ email: force, type: "to" }],
      intendedRecipients: recipients,
      warnings
    };
  }

  for (const r of recipients) {
    if (!isRecipientDomainAllowed(r.email, env)) {
      return {
        ok: false,
        errors: [`Recipient domain not allowed: ${r.email}`]
      };
    }
  }

  return { ok: true, recipients, warnings };
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {import("express").Request} req
 * @param {string} quoteId
 * @param {Record<string, unknown>} body
 * @param {{ mode: "preview" | "send" }} options
 */
export async function runQuoteDelivery(db, req, quoteId, body, options) {
  const env = getQuoteDeliveryEnv();
  const recipientResult = validateDeliveryRecipients(body.recipients);
  if (!recipientResult.ok) {
    return { ok: false, httpStatus: 400, error: recipientResult.errors.join("; "), errors: recipientResult.errors };
  }

  const policyResult = applyRecipientPolicy(recipientResult.recipients, env);
  if (!policyResult.ok) {
    return { ok: false, httpStatus: 400, error: policyResult.errors.join("; "), errors: policyResult.errors };
  }

  const loadResult = await loadInternalQuoteForDelivery(db, req, quoteId);
  if (!loadResult.ok) {
    return {
      ok: false,
      httpStatus: loadResult.httpStatus || 400,
      error: loadResult.error,
      code: loadResult.code
    };
  }

  const row = loadResult.row;
  const snapshot =
    row.calculation_snapshot && typeof row.calculation_snapshot === "object"
      ? row.calculation_snapshot
      : {};

  const display = buildCustomerEstimateDisplayFromSnapshot(row, {
    includeComparisonTable: Boolean(body.includeComparisonTable)
  });

  const emailContent = buildEstimateEmailContent(display, {
    subject: body.subject != null ? String(body.subject) : undefined
  });

  const warnings = [...(display.warnings || []), ...(policyResult.warnings || [])];

  if (!assertCustomerSafeText(emailContent.htmlPreview)) {
    warnings.push("HTML preview failed customer-safe assertion — review sanitizer output");
  }
  if (!assertCustomerSafeText(emailContent.textPreview)) {
    warnings.push("Text preview failed customer-safe assertion — review sanitizer output");
  }

  const snapshotHash = computeSnapshotHash(snapshot);
  const effectiveRecipients = policyResult.recipients;
  const toList = effectiveRecipients.filter((r) => r.type === "to").map((r) => r.email);
  const ccList = effectiveRecipients.filter((r) => r.type === "cc").map((r) => r.email);

  const isPreview = options.mode === "preview";
  const sendBlocked = !env.sendEnabled || isPreview;

  let status = isPreview ? "preview" : env.sendEnabled ? "queued" : "blocked";
  let providerMessageId = null;
  let sendError = null;

  if (!isPreview && env.sendEnabled) {
    const sendResult = await sendEstimateEmail({
      to: toList,
      cc: ccList,
      subject: emailContent.subject,
      html: emailContent.htmlPreview,
      text: emailContent.textPreview,
      from: env.fromAddress,
      provider: env.provider
    });
    if (sendResult.ok && !sendResult.skipped) {
      status = "sent";
      providerMessageId = sendResult.messageId ?? null;
    } else {
      status = "failed";
      sendError = sendResult.error ?? "Email provider not configured";
      warnings.push(sendError);
    }
  } else if (!isPreview) {
    status = "dry_run";
  }

  const logRow = buildDeliveryLogRow({
    organizationId: loadResult.orgId,
    quoteId: row.id,
    quoteNumber: row.quote_number,
    revisionNumber: row.revision_number,
    revisionLabel: row.revision_label,
    snapshotHash,
    deliveryMode: "email",
    status,
    sentBy: req.user?.id ?? null,
    sentByEmail: req.user?.email ?? null,
    recipients: effectiveRecipients,
    subject: emailContent.subject,
    provider: env.provider,
    providerMessageId,
    error: sendError,
    metadata: {
      dry_run: sendBlocked,
      send_enabled: env.sendEnabled,
      mode: options.mode,
      intended_recipients: policyResult.intendedRecipients ?? effectiveRecipients,
      warnings
    },
    sentAt: status === "sent" ? new Date().toISOString() : null
  });

  const logResult = await insertQuoteDeliveryLog(db, logRow);
  if (logResult.setupWarning) warnings.push(logResult.setupWarning);

  await recordDeliveryAudit(req, {
    mode: options.mode,
    status,
    quoteId: row.id,
    quoteNumber: row.quote_number,
    sendEnabled: env.sendEnabled,
    deliveryLogId: logResult.deliveryLogId ?? null
  });

  const baseResponse = {
    ok: true,
    dryRun: sendBlocked,
    sendEnabled: env.sendEnabled,
    quoteId: row.id,
    quoteNumber: row.quote_number ?? null,
    revisionLabel: row.revision_label ?? null,
    revisionNumber: row.revision_number ?? null,
    customerDisplayTotal: display.estimateTotal,
    subject: emailContent.subject,
    recipients: effectiveRecipients,
    htmlPreview: emailContent.htmlPreview,
    textPreview: emailContent.textPreview,
    warnings,
    deliveryLogId: logResult.deliveryLogId ?? null,
    deliveryLogSkipped: Boolean(logResult.skipped),
    setupWarning: logResult.setupWarning ?? null
  };

  if (isPreview) {
    return baseResponse;
  }

  if (!env.sendEnabled) {
    return {
      ...baseResponse,
      dryRun: true,
      blocked: true,
      sendEnabled: false
    };
  }

  return {
    ...baseResponse,
    blocked: status === "blocked" || status === "dry_run",
    provider: env.provider,
    providerMessageId,
    status
  };
}

/**
 * @param {import("express").Request} req
 * @param {Record<string, unknown>} meta
 */
async function recordDeliveryAudit(req, meta) {
  const actionType =
    meta.mode === "preview"
      ? "quote_estimate_email_preview"
      : !meta.sendEnabled || meta.status === "blocked" || meta.status === "dry_run"
        ? "quote_estimate_email_send_blocked"
        : meta.status === "sent"
          ? "quote_estimate_email_sent"
          : "quote_estimate_email_failed";

  try {
    await logAction({
      user: req.user,
      toolSlug: "quote_delivery",
      actionType,
      entityType: "quote",
      entityId: String(meta.quoteId),
      entityLabel: meta.quoteNumber ?? null,
      outcome: meta.status === "failed" ? "failure" : "success",
      metadata: {
        mode: meta.mode,
        status: meta.status,
        send_enabled: meta.sendEnabled,
        delivery_log_id: meta.deliveryLogId
      },
      req
    });
  } catch (e) {
    console.warn("[quote-delivery] eos_action_log optional:", e?.message || e);
  }
}
