/**
 * Studio V2 Slice F — strict Digital Estimate publish readiness + body sanitization.
 *
 * Reuses studioDigitalEstimateService.publish only after V2 gates.
 * Never calls simplified-publish / auto-approve / auto-calculate.
 *
 * Customer configuration: V2 publish must attach the same interactive defaults used by
 * simplified-publish so public DE can load customer options (not document-only).
 */

import { STUDIO_ESTIMATE_STATUSES } from "./studioEstimateTypes.mjs";
import { buildSafeStudioPublicationSummary } from "./studioPublicationSummary.mjs";
import { resolveSimplifiedPublishConfiguration } from "./studioCustomerChoiceOptions.mjs";

function str(v, max = 240) {
  return String(v ?? "")
    .trim()
    .slice(0, max);
}

/**
 * Resolve customer configuration for V2 strict publish.
 * Missing / empty → interactive defaults (same as simplified-publish defaults).
 * Explicit document-only remains respected.
 * @param {object|null|undefined} bodyConfiguration
 */
export function resolveStudioV2PublishConfiguration(bodyConfiguration) {
  return resolveSimplifiedPublishConfiguration(bodyConfiguration);
}

/**
 * Assess whether an estimate may be published from Studio V2.
 * @param {object|null|undefined} row
 */
export function assessStudioV2PublishReadiness(row) {
  if (!row) {
    return {
      allowed: false,
      code: "no_estimate",
      message: "No estimate exists for this case yet.",
      blockers: [{ code: "no_estimate", message: "No estimate exists for this case yet." }],
      approved: false,
      published: false
    };
  }

  const status = String(row.status || "").toLowerCase();
  /** @type {Array<{ code: string, message: string }>} */
  const blockers = [];

  if (status === STUDIO_ESTIMATE_STATUSES.SUPERSEDED) {
    return {
      allowed: false,
      code: "superseded_revision",
      message: "A newer estimate revision is active. Refresh before publishing.",
      blockers: [
        {
          code: "superseded_revision",
          message: "A newer estimate revision is active. Refresh before publishing."
        }
      ],
      approved: false,
      published: false
    };
  }

  const approved =
    status === STUDIO_ESTIMATE_STATUSES.APPROVED || Boolean(row.approval?.approvedAt);

  if (!approved) {
    return {
      allowed: false,
      code: "approve_required",
      message: "Approve required before publish.",
      blockers: [
        { code: "approve_required", message: "Approve required before publish." }
      ],
      approved: false,
      published: false
    };
  }

  const calc = row.calculationSnapshot || row.calculation || null;
  const fingerprint = str(calc?.fingerprint || row.approval?.calculationFingerprint, 120);
  if (!fingerprint) {
    blockers.push({
      code: "not_priced",
      message: "Approved snapshot is missing a calculation fingerprint."
    });
    return {
      allowed: false,
      code: "not_priced",
      message: "Approved snapshot is missing a calculation fingerprint.",
      blockers,
      approved: true,
      published: false
    };
  }

  const staleReason = str(row.staleReason, 400);
  if (staleReason) {
    blockers.push({
      code: "calculation_stale",
      message: staleReason || "Calculation is stale. Re-approve before publishing."
    });
    return {
      allowed: false,
      code: "calculation_stale",
      message: staleReason || "Calculation is stale. Re-approve before publishing.",
      blockers,
      approved: true,
      published: false
    };
  }

  const approvalFp = str(row.approval?.calculationFingerprint, 120);
  if (approvalFp && fingerprint && approvalFp !== fingerprint) {
    blockers.push({
      code: "calculation_stale",
      message: "Approval fingerprint does not match the current calculation."
    });
    return {
      allowed: false,
      code: "calculation_stale",
      message: "Approval fingerprint does not match the current calculation.",
      blockers,
      approved: true,
      published: false
    };
  }

  return {
    allowed: true,
    code: null,
    message: null,
    blockers: [],
    approved: true,
    published: false
  };
}

/**
 * Sanitize V2 publish body for strict DE publish (link-only preferred).
 * Always forces confirm:true for the DE service contract.
 * @param {object|null|undefined} body
 */
export function sanitizeStudioV2PublishBody(body) {
  const raw = body && typeof body === "object" ? { ...body } : {};
  const deliveryMode =
    str(raw.deliveryMode || "link_only", 40).toLowerCase() || "link_only";

  delete raw.autoConfirm;
  delete raw.autoCalculate;
  delete raw.autoApprove;
  delete raw.simplified;
  delete raw.notify;
  delete raw.sendEmail;
  delete raw.send_email;
  delete raw.email;
  delete raw.recipients;
  delete raw.emailRecipients;
  delete raw.notification;

  // Prefer link-only; do not invent email delivery in Slice F.
  raw.deliveryMode = deliveryMode === "link_only" ? "link_only" : "link_only";
  raw.confirm = true;
  // Attach interactive customer options envelope so public DE does not fall into
  // document-only / "Customer options could not be loaded."
  raw.configuration = resolveStudioV2PublishConfiguration(raw.configuration);

  return {
    body: raw,
    deliveryMode: "link_only",
    confirmed: body?.confirmed === true || body?.confirm === true || body?.confirm === "true"
  };
}

/**
 * Normalize DE publish service result into a staff-safe V2 publication DTO.
 * @param {object|null|undefined} result
 * @param {object|null|undefined} estimate
 */
export function buildStudioV2PublicationResult(result, estimate) {
  const pub = result?.publication && typeof result.publication === "object" ? result.publication : {};
  const customerUrl =
    (typeof result?.customerUrl === "string" && result.customerUrl) ||
    (typeof pub.customerUrl === "string" && pub.customerUrl) ||
    null;
  const publishedAt = pub.publishedAt || pub.published_at || null;
  const status = str(pub.status || (customerUrl ? "published" : "unknown"), 40) || "published";
  const publicationId = pub.id || pub.publicationId || null;

  return {
    publicationId,
    status,
    active: pub.active !== false && Boolean(publicationId || customerUrl),
    customerUrl,
    publishedAt,
    linkStatus: result?.linkStatus || pub.linkStatus || null,
    reused: Boolean(result?.reused),
    staffNotice: result?.staffNotice || null,
    summary: buildSafeStudioPublicationSummary({
      estimate,
      activePublication: {
        id: publicationId,
        status,
        customerUrl,
        publishedAt,
        active: true
      }
    })
  };
}
