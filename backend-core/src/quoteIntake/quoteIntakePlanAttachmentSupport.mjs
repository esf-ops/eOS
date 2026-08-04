/**
 * Quote Intake / Shared Inbox — conservative plan attachment classification.
 *
 * Supported takeoff candidates: PDF + plan-like JPEG/PNG/WEBP.
 * Uncertain images are review candidates (manual staff override), not auto-plans.
 * Inline / item attachments are never auto-classified as plans.
 */

export const PLAN_MIME_TYPES = Object.freeze([
  "application/pdf",
  "application/x-pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp"
]);

export const IMAGE_PLAN_MIME_TYPES = Object.freeze([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp"
]);

/** Filename cues that a customer likely sent a measurement / layout plan. */
const PLAN_LIKE_NAME_RE =
  /\b(plan|plans|drawing|layout|measure|measurement|counter(?:top)?|kitchen|bath(?:room)?|vanity|island|sketch|scan|scanned|blueprint|floor[\s_-]?plan|elevation|cabinet|template|field[\s_-]?measure|as[\s_-]?built)\b/i;

const IMAGE_EXT_RE = /\.(jpe?g|png|webp)$/i;
const PDF_EXT_RE = /\.pdf$/i;

/**
 * @param {string|null|undefined} mime
 */
export function normalizePlanMime(mime) {
  const m = String(mime || "")
    .trim()
    .toLowerCase()
    .split(";")[0]
    .trim();
  if (m === "image/jpg") return "image/jpeg";
  if (m === "application/x-pdf") return "application/pdf";
  return m;
}

/**
 * @param {string|null|undefined} name
 */
export function filenameLooksPlanLike(name) {
  const n = String(name || "").trim();
  if (!n) return false;
  if (PLAN_LIKE_NAME_RE.test(n)) return true;
  // Bare "plan.jpg" / "kitchen.png" already covered; also accept "IMG_####" only
  // when paired with quote/request context elsewhere — not here alone.
  return false;
}

/**
 * @param {{ mimeType?: string|null, contentType?: string|null, name?: string|null, filename?: string|null, safeFilename?: string|null }} att
 */
export function attachmentLooksPdf(att = {}) {
  const mime = normalizePlanMime(att.mimeType || att.contentType);
  const name = String(att.name || att.filename || att.safeFilename || "");
  return mime === "application/pdf" || PDF_EXT_RE.test(name);
}

/**
 * @param {{ mimeType?: string|null, contentType?: string|null, name?: string|null, filename?: string|null, safeFilename?: string|null }} att
 */
export function attachmentLooksImage(att = {}) {
  const mime = normalizePlanMime(att.mimeType || att.contentType);
  const name = String(att.name || att.filename || att.safeFilename || "");
  if (IMAGE_PLAN_MIME_TYPES.includes(mime)) return true;
  return IMAGE_EXT_RE.test(name);
}

/**
 * Classify a file attachment's plan support (after inline/item gates).
 * @param {{
 *   mimeType?: string|null,
 *   contentType?: string|null,
 *   name?: string|null,
 *   filename?: string|null,
 *   isInline?: boolean,
 *   isItemAttachment?: boolean,
 *   isFileAttachment?: boolean,
 *   forcePlan?: boolean
 * }} att
 * @returns {"direct_pdf"|"direct_image_plan"|"image_needs_review"|null}
 *   null = not a plan candidate (caller keeps prior support)
 */
export function classifyPlanFileSupport(att = {}) {
  if (att.isInline || att.isItemAttachment) return null;
  if (att.isFileAttachment === false) return null;

  if (attachmentLooksPdf(att)) return "direct_pdf";

  if (!attachmentLooksImage(att)) return null;

  const name = String(att.name || att.filename || att.safeFilename || "");
  if (att.forcePlan === true || filenameLooksPlanLike(name)) {
    return "direct_image_plan";
  }
  return "image_needs_review";
}

/**
 * Human-readable support label for Inbox UI.
 * @param {string|null|undefined} support
 */
export function planSupportLabel(support) {
  switch (String(support || "")) {
    case "direct_pdf":
      return "Supported plan PDF";
    case "direct_image_plan":
      return "Supported image plan";
    case "image_needs_review":
      return "Attachment needs review";
    case "too_large":
      return "Plan too large";
    default:
      return "No supported plan";
  }
}

/**
 * Row-level summary when multiple attachments exist.
 * @param {Array<{ support?: string|null, supportedForTakeoff?: boolean }>} attachments
 */
export function summarizeRowPlanSupport(attachments = []) {
  const list = Array.isArray(attachments) ? attachments : [];
  const hasPdf = list.some(
    (a) => a.support === "direct_pdf" || (a.supportedForTakeoff === true && attachmentLooksPdf(a))
  );
  const hasImagePlan = list.some((a) => a.support === "direct_image_plan");
  const hasNeedsReview = list.some((a) => a.support === "image_needs_review");
  const supportedCount = list.filter(
    (a) =>
      a.supportedForTakeoff === true ||
      a.support === "direct_pdf" ||
      a.support === "direct_image_plan"
  ).length;

  const needsReviewCount = list.filter((a) => a.support === "image_needs_review").length;
  const possiblePlanCount = supportedCount + needsReviewCount;
  if (possiblePlanCount > 1) {
    return {
      key: "choose_plan",
      label: "Choose plan",
      supported: supportedCount > 0,
      planSelectionRequired: true
    };
  }
  if (supportedCount > 0) {
    if (hasImagePlan && !hasPdf) {
      return { key: "supported_image_plan", label: "Supported image plan", supported: true };
    }
    if (hasPdf && !hasImagePlan) {
      return { key: "supported_plan_pdf", label: "Supported plan", supported: true };
    }
    return { key: "supported_plan", label: "Supported plan", supported: true };
  }
  if (hasNeedsReview) {
    return { key: "needs_review", label: "Attachment needs review", supported: false };
  }
  return { key: "none", label: "No supported plan", supported: false };
}

/**
 * Whether support value is auto-eligible for AI Takeoff (no manual mark).
 * @param {string|null|undefined} support
 */
export function isAutoSupportedTakeoffSupport(support) {
  const s = String(support || "");
  return s === "direct_pdf" || s === "direct_image_plan";
}

/**
 * Whether staff can manually mark this attachment as a plan.
 * @param {string|null|undefined} support
 * @param {object} [att]
 */
export function canMarkAsPlanForTakeoff(support, att = {}) {
  if (String(support || "") === "image_needs_review") return true;
  if (isAutoSupportedTakeoffSupport(support)) return false;
  if (att.isInline) return false;
  return attachmentLooksImage(att);
}

/**
 * Safe image types staff may promote via explicit manual override.
 * PDF / plan-like images do not need this; inline/item never qualify.
 * @param {{
 *   mimeType?: string|null,
 *   contentType?: string|null,
 *   name?: string|null,
 *   filename?: string|null,
 *   safeFilename?: string|null,
 *   isInline?: boolean,
 *   support?: string|null
 * }} att
 */
export function isSafeManualPlanImageOverride(att = {}) {
  if (!att || att.isInline) return false;
  const support = String(att.support || "");
  if (support === "inline_ignored" || support === "unsupported_item") return false;
  return attachmentLooksImage(att);
}

/**
 * True when the request body asks for an explicit staff plan override.
 * Accepts aliases used by Inbox UI / API.
 * @param {unknown} body
 */
export function requestHasManualPlanOverride(body) {
  if (!body || typeof body !== "object") return false;
  const b = /** @type {Record<string, unknown>} */ (body);
  return (
    b.manualPlanOverride === true ||
    b.manualPlanOverride === "true" ||
    b.useAttachmentAsPlan === true ||
    b.useAttachmentAsPlan === "true" ||
    b.markAsPlan === true ||
    b.markAsPlan === "true"
  );
}

/**
 * Collect identifier strings for an attachment (Graph + intake + DTO shapes).
 * @param {object} att
 * @returns {string[]}
 */
export function attachmentIdentityKeys(att = {}) {
  return [
    att.attachmentKey,
    att.id,
    att.attachmentId,
    att.sourceAttachmentId,
    att.graphAttachmentId,
    att.providerAttachmentId
  ]
    .map((v) => String(v ?? "").trim())
    .filter(Boolean);
}

/**
 * Display / stored filename candidates for scoped matching.
 * @param {object} att
 * @returns {string[]}
 */
export function attachmentFilenameKeys(att = {}) {
  return [att.filename, att.name, att.safeFilename]
    .map((v) => String(v ?? "").trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Server-built in-memory plan candidate from a live Inbox/Graph attachment when the
 * persisted intake case has no matching attachment row. Never accept from browser body.
 * Supports auto PDF/image plans and manual image override. Does not include bytes.
 *
 * @param {{
 *   liveAttachment?: object|null,
 *   attachmentKey?: string|null,
 *   providerMessageId?: string|null
 * }} input
 * @returns {object|null}
 */
export function buildLivePlanAttachmentCandidate(input = {}) {
  const live = input.liveAttachment && typeof input.liveAttachment === "object"
    ? input.liveAttachment
    : null;
  if (!live) return null;
  if (live.isInline === true || live.inline === true) return null;

  const key = String(
    input.attachmentKey ||
      live.attachmentKey ||
      live.sourceAttachmentId ||
      live.id ||
      ""
  ).trim();
  const filename = String(
    live.filename || live.name || live.safeFilename || ""
  ).trim();
  const mime = normalizePlanMime(live.contentType || live.mimeType);
  const liveSupport = String(live.support || "");
  const asPdf =
    liveSupport === "direct_pdf" ||
    attachmentLooksPdf({
      ...live,
      name: filename,
      filename,
      mimeType: mime,
      contentType: mime
    });

  if (asPdf) {
    return {
      id: live.id || (key ? `live:${key.slice(0, 48)}` : null),
      sourceAttachmentId: key || null,
      providerMessageId:
        String(input.providerMessageId || live.providerMessageId || "").trim() || null,
      safeFilename: filename || "plan.pdf",
      name: filename || null,
      filename: filename || null,
      mimeType: mime || "application/pdf",
      contentType: mime || "application/pdf",
      sizeBytes: Number.isFinite(Number(live.sizeBytes)) ? Number(live.sizeBytes) : undefined,
      isInline: false,
      support: "direct_pdf",
      kind: "pdf_candidate",
      retrievalState: "pending",
      // Synthetic / Graph ids must not write into intake_attachment UUID FK.
      liveManualCandidate: true
    };
  }

  const candidate = {
    id: live.id || (key ? `live:${key.slice(0, 48)}` : null),
    sourceAttachmentId: key || null,
    providerMessageId: String(input.providerMessageId || live.providerMessageId || "").trim() || null,
    safeFilename: filename || "plan-image",
    name: filename || null,
    filename: filename || null,
    mimeType: mime || null,
    contentType: mime || null,
    sizeBytes: Number.isFinite(Number(live.sizeBytes)) ? Number(live.sizeBytes) : undefined,
    isInline: false,
    support: liveSupport === "direct_image_plan" ? "direct_image_plan" : "image_needs_review",
    kind:
      liveSupport === "direct_image_plan" ? "image_plan_candidate" : "image_review_candidate",
    retrievalState: "pending",
    liveManualCandidate: true
  };

  if (candidate.support === "direct_image_plan") return candidate;
  if (!isSafeManualPlanImageOverride(candidate)) return null;
  return candidate;
}

/** @deprecated Prefer buildLivePlanAttachmentCandidate (PDF + image). */
export function buildLiveManualPlanAttachmentCandidate(input = {}) {
  return buildLivePlanAttachmentCandidate(input);
}

/**
 * Find an attachment inside a single message/case list.
 *
 * Matching order:
 * 1) exact id / Graph key fields
 * 2) truncated Graph-id prefix (stored slice vs live AAMk key)
 * 3) exact filename within this list only (manual override / disambiguation)
 *
 * @param {object[]} attachments
 * @param {{
 *   attachmentKey?: string|null,
 *   attachmentId?: string|null,
 *   filename?: string|null,
 *   allowFilenameFallback?: boolean
 * }} selector
 * @returns {object|null}
 */
export function findScopedAttachment(attachments, selector = {}) {
  const list = Array.isArray(attachments) ? attachments : [];
  if (!list.length) return null;

  const key = String(selector.attachmentKey || selector.attachmentId || "").trim();
  const filename = String(selector.filename || "")
    .trim()
    .toLowerCase();
  const allowFilename = selector.allowFilenameFallback === true;

  if (key) {
    const exact = list.find((a) => attachmentIdentityKeys(a).includes(key));
    if (exact) return exact;

    // Persist layer may truncate long Graph immutable ids; live UI sends the full key.
    if (key.length >= 32) {
      const prefixed = list.find((a) => {
        for (const id of attachmentIdentityKeys(a)) {
          if (id.length < 32) continue;
          if (key.startsWith(id) || id.startsWith(key)) return true;
        }
        return false;
      });
      if (prefixed) return prefixed;
    }
  }

  if (allowFilename && filename) {
    const matches = list.filter((a) => attachmentFilenameKeys(a).includes(filename));
    if (matches.length === 1) return matches[0];
  }

  return null;
}
