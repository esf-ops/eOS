/**
 * Compact Estimate header model for the persistent Elite 100 estimator.
 *
 * Revision mechanics stay mostly invisible: the estimator sees which revision
 * they are working on and which revision the customer currently has. Raw
 * estimate UUIDs, Takeoff job ids, lifecycle codes, and internal revision
 * errors are never surfaced here.
 */

const CUSTOMER_NOT_IDENTIFIED = "Customer not identified";
const NO_PUBLISHED_ESTIMATE = "No published estimate";

function text(value) {
  return value == null ? "" : String(value).trim();
}

function positiveInt(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

/** Rejects anything that looks like a UUID or opaque internal identifier. */
export function isSafeCustomerLabel(value) {
  const s = text(value);
  if (!s) return false;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return false;
  if (/^[0-9a-f]{24,}$/i.test(s)) return false;
  return true;
}

/**
 * @param {{
 *   customerLabel?: string|null,
 *   planFilename?: string|null,
 *   workingRevision?: number|null,
 *   publishedRevision?: number|null,
 *   basedOnRevision?: number|null,
 *   approved?: boolean,
 *   saveState?: string|null,
 *   acquiringDraft?: boolean
 * }} input
 */
export function buildEstimateWorkspaceHeader(input = {}) {
  const customer = isSafeCustomerLabel(input.customerLabel)
    ? text(input.customerLabel)
    : CUSTOMER_NOT_IDENTIFIED;
  const planFilename = text(input.planFilename) || "—";
  const working = positiveInt(input.workingRevision);
  const published = positiveInt(input.publishedRevision);
  const basedOn = positiveInt(input.basedOnRevision);
  const approved = input.approved === true;

  const revisionWord = approved ? "Approved" : "Draft";
  let workingRevisionLabel = working != null ? `${revisionWord} R${working}` : revisionWord;
  // "based on published R1" only reads correctly while the customer still has
  // an older revision than the one being edited.
  const supersedes = published != null && working != null && working > published;
  if (supersedes) {
    workingRevisionLabel = `${revisionWord} R${working} based on published R${published}`;
  } else if (basedOn != null && working != null && working > basedOn && published == null) {
    workingRevisionLabel = `${revisionWord} R${working} based on approved R${basedOn}`;
  }

  const publicationLabel =
    published == null
      ? NO_PUBLISHED_ESTIMATE
      : supersedes
        ? `Published R${published} remains active`
        : `Published R${published}`;

  return {
    customer,
    planFilename,
    workingRevisionLabel,
    publicationLabel,
    saveState: input.acquiringDraft === true
      ? "Starting editable revision…"
      : text(input.saveState) || null,
    workingRevision: working,
    publishedRevision: published,
    supersedesPublished: supersedes
  };
}

export const ESTIMATE_HEADER_CUSTOMER_FALLBACK = CUSTOMER_NOT_IDENTIFIED;
export const ESTIMATE_HEADER_NO_PUBLICATION = NO_PUBLISHED_ESTIMATE;
