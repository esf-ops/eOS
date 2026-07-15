/**
 * Synthetic-only live takeoff allowlist (Phase 4B.4B).
 * Exact committed fixture hashes only — no bypass.
 */

export const APPROVED_SYNTHETIC_LIVE_TAKEOFF_HASHES = Object.freeze([
  // fixtures/takeoff/qil-synth-kitchen-island-plan.pdf
  "0833ca1afd77665f24590158535e90b60b6e78d3e176de6a34a336d97deae9cb"
]);

/** Known non-approved / placeholder digests that must never take the live path. */
export const BLOCKED_PLACEHOLDER_PLAN_HASHES = Object.freeze([
  // src/fixtures/eml/with-pdf-attachment.eml tiny PDF (~45 bytes)
  "aeb3142125f4707795376346666c7e94b9704fa1344e5bd30e9423e475c7c396"
]);

export const SYNTHETIC_LIVE_TAKEOFF_FIXTURE_ID = "qil-synth-kitchen-island-plan";

export const SYNTHETIC_LIVE_GATE_MESSAGE =
  "Live Gemini takeoff is currently restricted to approved synthetic fixtures.";

/**
 * @param {string|null|undefined} contentHash
 */
export function normalizeAttachmentHash(contentHash) {
  return String(contentHash ?? "")
    .trim()
    .toLowerCase();
}

/**
 * @param {string|null|undefined} contentHash
 */
export function isApprovedSyntheticLiveHash(contentHash) {
  const h = normalizeAttachmentHash(contentHash);
  return Boolean(h) && APPROVED_SYNTHETIC_LIVE_TAKEOFF_HASHES.includes(h);
}

/**
 * @param {string|null|undefined} contentHash
 * @param {{ sizeBytes?: number|null }} [meta]
 */
export function assertApprovedForLiveTakeoff(contentHash, meta = {}) {
  const h = normalizeAttachmentHash(contentHash);
  if (!h || !/^[a-f0-9]{64}$/.test(h)) {
    const err = new Error(`${SYNTHETIC_LIVE_GATE_MESSAGE} Attachment hash is missing or invalid.`);
    err.code = "SYNTHETIC_HASH_REQUIRED";
    throw err;
  }
  if (BLOCKED_PLACEHOLDER_PLAN_HASHES.includes(h)) {
    const err = new Error(
      `${SYNTHETIC_LIVE_GATE_MESSAGE} Placeholder PDF attachments cannot be used for live takeoff.`
    );
    err.code = "PLACEHOLDER_PLAN_BLOCKED";
    throw err;
  }
  if (meta.sizeBytes != null && Number(meta.sizeBytes) > 0 && Number(meta.sizeBytes) < 500) {
    const err = new Error(
      `${SYNTHETIC_LIVE_GATE_MESSAGE} Attachment is too small to be an approved synthetic plan.`
    );
    err.code = "PLACEHOLDER_PLAN_BLOCKED";
    throw err;
  }
  if (!APPROVED_SYNTHETIC_LIVE_TAKEOFF_HASHES.includes(h)) {
    const err = new Error(
      `${SYNTHETIC_LIVE_GATE_MESSAGE} Unknown or non-synthetic attachment hashes are blocked.`
    );
    err.code = "SYNTHETIC_ALLOWLIST_REJECTED";
    throw err;
  }
  return h;
}
