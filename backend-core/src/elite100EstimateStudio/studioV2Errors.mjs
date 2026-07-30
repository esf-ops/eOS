/**
 * Safe Elite 100 Studio V2 error codes — staff UI only.
 * Avoid raw lifecycle jargon in user-facing messages.
 */

export const STUDIO_V2_ERROR_CODES = Object.freeze({
  NO_ESTIMATE: "no_estimate",
  UNSUPPORTED_ORIGIN: "unsupported_origin",
  APPROVE_REQUIRED: "approve_required",
  PUBLISH_BLOCKED: "publish_blocked",
  CALCULATE_FAILED: "calculate_failed",
  NOT_PRICED: "not_priced",
  SUPERSEDED_REVISION: "superseded_revision",
  FORBIDDEN: "forbidden",
  UNAVAILABLE: "unavailable",
  /** Slice B — current revision is not an editable working draft. */
  DRAFT_REQUIRED: "draft_required",
  /** Slice B — approved/published/frozen snapshot cannot be mutated. */
  APPROVED_SNAPSHOT_READONLY: "approved_snapshot_readonly",
  /** Slice B — scope payload failed validation. */
  VALIDATION_FAILED: "validation_failed"
});

const USER_MESSAGES = Object.freeze({
  [STUDIO_V2_ERROR_CODES.NO_ESTIMATE]: "No estimate exists for this case yet.",
  [STUDIO_V2_ERROR_CODES.UNSUPPORTED_ORIGIN]:
    "This estimate origin is not supported in Studio V2 yet.",
  [STUDIO_V2_ERROR_CODES.APPROVE_REQUIRED]: "Approve required before publish.",
  [STUDIO_V2_ERROR_CODES.PUBLISH_BLOCKED]:
    "This estimate cannot be published yet. Review the blockers below.",
  [STUDIO_V2_ERROR_CODES.CALCULATE_FAILED]: "Calculation failed. Nothing was published.",
  [STUDIO_V2_ERROR_CODES.NOT_PRICED]: "This estimate has not been priced yet.",
  [STUDIO_V2_ERROR_CODES.SUPERSEDED_REVISION]:
    "A newer estimate revision is active. Refresh before continuing.",
  [STUDIO_V2_ERROR_CODES.FORBIDDEN]: "You do not have access to this estimate.",
  [STUDIO_V2_ERROR_CODES.UNAVAILABLE]: "Studio V2 is temporarily unavailable.",
  [STUDIO_V2_ERROR_CODES.DRAFT_REQUIRED]:
    "An editable working draft is required before scope can be saved.",
  [STUDIO_V2_ERROR_CODES.APPROVED_SNAPSHOT_READONLY]:
    "This approved or published estimate is read-only. Scope cannot be changed here.",
  [STUDIO_V2_ERROR_CODES.VALIDATION_FAILED]: "Scope changes could not be saved. Check the fields and try again."
});

/**
 * @param {string} code
 * @param {string} [fallback]
 */
export function studioV2UserMessage(code, fallback) {
  const key = String(code || "").trim();
  if (USER_MESSAGES[key]) return USER_MESSAGES[key];
  return fallback || USER_MESSAGES[STUDIO_V2_ERROR_CODES.UNAVAILABLE];
}

/**
 * @param {string} code
 * @param {{ message?: string, statusCode?: number, blockers?: unknown[], details?: unknown }} [opts]
 */
export function createStudioV2Error(code, opts = {}) {
  const normalized = String(code || STUDIO_V2_ERROR_CODES.UNAVAILABLE).trim();
  const err = new Error(studioV2UserMessage(normalized, opts.message));
  err.code = normalized;
  err.statusCode = Number(opts.statusCode) || defaultStatusForCode(normalized);
  if (opts.blockers != null) err.blockers = opts.blockers;
  if (opts.details != null) err.details = opts.details;
  return err;
}

/**
 * @param {string} code
 */
function defaultStatusForCode(code) {
  switch (code) {
    case STUDIO_V2_ERROR_CODES.NO_ESTIMATE:
      return 404;
    case STUDIO_V2_ERROR_CODES.FORBIDDEN:
      return 403;
    case STUDIO_V2_ERROR_CODES.APPROVE_REQUIRED:
    case STUDIO_V2_ERROR_CODES.PUBLISH_BLOCKED:
    case STUDIO_V2_ERROR_CODES.UNSUPPORTED_ORIGIN:
    case STUDIO_V2_ERROR_CODES.NOT_PRICED:
    case STUDIO_V2_ERROR_CODES.DRAFT_REQUIRED:
    case STUDIO_V2_ERROR_CODES.APPROVED_SNAPSHOT_READONLY:
      return 409;
    case STUDIO_V2_ERROR_CODES.SUPERSEDED_REVISION:
      return 409;
    case STUDIO_V2_ERROR_CODES.CALCULATE_FAILED:
    case STUDIO_V2_ERROR_CODES.VALIDATION_FAILED:
      return 422;
    default:
      return 503;
  }
}

/**
 * Map internal publish/readiness codes to safe V2 codes.
 * @param {string|null|undefined} rawCode
 */
export function mapPublishBlockerCode(rawCode) {
  const c = String(rawCode || "").toLowerCase();
  if (!c) return STUDIO_V2_ERROR_CODES.PUBLISH_BLOCKED;
  if (c === "estimate_not_approved" || c === "not_approved" || c === "approve_required") {
    return STUDIO_V2_ERROR_CODES.APPROVE_REQUIRED;
  }
  if (c === "estimate_revision_superseded") {
    return STUDIO_V2_ERROR_CODES.SUPERSEDED_REVISION;
  }
  return STUDIO_V2_ERROR_CODES.PUBLISH_BLOCKED;
}

/**
 * Staff-safe blocker list for UI (code + message only).
 * @param {unknown} blockers
 */
export function sanitizePublishBlockers(blockers) {
  if (!Array.isArray(blockers)) return [];
  return blockers
    .map((b) => {
      if (!b || typeof b !== "object") return null;
      const code = String(b.code || "").trim() || null;
      const message =
        String(b.message || b.title || "").trim() ||
        studioV2UserMessage(mapPublishBlockerCode(code));
      return { code, message };
    })
    .filter(Boolean);
}
