/**
 * Cross-platform review split layout helpers (Mac + Windows safe).
 * Pointer-driven ratios; presets for keyboard/fallback.
 */

export const CTR_SPLIT_STORAGE_KEY = "eliteos.ctr.reviewSplitRatio.v1";

/** Default plan pane fraction of the split (0–1). */
export const CTR_SPLIT_DEFAULT_RATIO = 0.4;

export const CTR_SPLIT_PRESETS = Object.freeze({
  split: 0.4,
  largerPlan: 0.55,
  largerWorksheet: 0.28
});

/** Absolute min widths used when clamping against container. */
export const CTR_PLAN_MIN_PX = 360;
export const CTR_WORKSHEET_MIN_PX = 520;

/**
 * @param {number} ratio
 * @param {number} [containerWidth]
 * @returns {number}
 */
export function clampReviewSplitRatio(ratio, containerWidth = 0) {
  let next = Number(ratio);
  if (!Number.isFinite(next)) next = CTR_SPLIT_DEFAULT_RATIO;
  next = Math.min(0.72, Math.max(0.22, next));

  const width = Number(containerWidth);
  if (Number.isFinite(width) && width > CTR_PLAN_MIN_PX + CTR_WORKSHEET_MIN_PX) {
    const minRatio = CTR_PLAN_MIN_PX / width;
    const maxRatio = 1 - CTR_WORKSHEET_MIN_PX / width;
    next = Math.min(maxRatio, Math.max(minRatio, next));
  }
  return Math.round(next * 1000) / 1000;
}

/**
 * @param {unknown} raw
 * @returns {number|null}
 */
export function parseStoredReviewSplitRatio(raw) {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return clampReviewSplitRatio(n);
}

/**
 * @param {Storage|null|undefined} storage
 * @returns {number}
 */
export function readStoredReviewSplitRatio(storage) {
  try {
    if (!storage || typeof storage.getItem !== "function") return CTR_SPLIT_DEFAULT_RATIO;
    const parsed = parseStoredReviewSplitRatio(storage.getItem(CTR_SPLIT_STORAGE_KEY));
    return parsed == null ? CTR_SPLIT_DEFAULT_RATIO : parsed;
  } catch {
    return CTR_SPLIT_DEFAULT_RATIO;
  }
}

/**
 * @param {Storage|null|undefined} storage
 * @param {number} ratio
 */
export function writeStoredReviewSplitRatio(storage, ratio) {
  try {
    if (!storage || typeof storage.setItem !== "function") return;
    storage.setItem(CTR_SPLIT_STORAGE_KEY, String(clampReviewSplitRatio(ratio)));
  } catch {
    /* ignore quota / private mode */
  }
}

/**
 * @param {"split"|"largerPlan"|"largerWorksheet"|"reset"} preset
 * @param {number} [containerWidth]
 */
export function resolveReviewSplitPreset(preset, containerWidth = 0) {
  if (preset === "largerPlan") return clampReviewSplitRatio(CTR_SPLIT_PRESETS.largerPlan, containerWidth);
  if (preset === "largerWorksheet") {
    return clampReviewSplitRatio(CTR_SPLIT_PRESETS.largerWorksheet, containerWidth);
  }
  return clampReviewSplitRatio(CTR_SPLIT_DEFAULT_RATIO, containerWidth);
}

/**
 * Compute next ratio from pointer X within a container rect.
 * @param {number} clientX
 * @param {{ left: number, width: number }} rect
 */
export function ratioFromPointerClientX(clientX, rect) {
  const width = Number(rect?.width) || 0;
  if (width <= 0) return CTR_SPLIT_DEFAULT_RATIO;
  const x = Number(clientX) - Number(rect.left || 0);
  return clampReviewSplitRatio(x / width, width);
}
