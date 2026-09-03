/**
 * Cross-platform review split layout helpers (Mac + Windows safe).
 * Pointer-driven ratios; presets for keyboard/fallback.
 */

export const CTR_SPLIT_STORAGE_KEY = "eliteos.ctr.reviewSplitRatio.v1";

/**
 * Large-desktop balanced split (plan fraction).
 * Smaller effective viewports (common Windows laptop / scaled displays) default
 * to a worksheet-first ratio instead.
 */
export const CTR_SPLIT_DEFAULT_RATIO = 0.4;

/** Worksheet-first default when the review container is compact (~≤1500px). */
export const CTR_SPLIT_COMPACT_DEFAULT_RATIO = 0.28;

/** Container width at/below which the compact default applies (covers ~1536×864 scaled Windows). */
export const CTR_SPLIT_COMPACT_WIDTH_PX = 1600;

export const CTR_SPLIT_PRESETS = Object.freeze({
  /** Resolved via defaultReviewSplitRatio(containerWidth). */
  split: CTR_SPLIT_DEFAULT_RATIO,
  largerPlan: 0.55,
  largerWorksheet: 0.25
});

/** Absolute min widths used when clamping against container. */
export const CTR_PLAN_MIN_PX = 320;
export const CTR_WORKSHEET_MIN_PX = 520;

/**
 * Viewport-aware default plan fraction when no stored preference exists.
 * @param {number} [containerWidth]
 * @returns {number}
 */
export function defaultReviewSplitRatio(containerWidth = 0) {
  let width = Number(containerWidth);
  if (!Number.isFinite(width) || width <= 0) {
    try {
      if (typeof window !== "undefined" && Number.isFinite(window.innerWidth)) {
        width = window.innerWidth;
      }
    } catch {
      width = 0;
    }
  }
  if (width > 0 && width <= CTR_SPLIT_COMPACT_WIDTH_PX) {
    return CTR_SPLIT_COMPACT_DEFAULT_RATIO;
  }
  return CTR_SPLIT_DEFAULT_RATIO;
}

/**
 * @param {number} ratio
 * @param {number} [containerWidth]
 * @returns {number}
 */
export function clampReviewSplitRatio(ratio, containerWidth = 0) {
  let next = Number(ratio);
  if (!Number.isFinite(next)) next = defaultReviewSplitRatio(containerWidth);
  next = Math.min(0.72, Math.max(0.2, next));

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
 * @param {number} [containerWidth]
 * @returns {number|null}
 */
export function parseStoredReviewSplitRatio(raw, containerWidth = 0) {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return clampReviewSplitRatio(n, containerWidth);
}

/**
 * @param {Storage|null|undefined} storage
 * @param {number} [containerWidth]
 * @returns {number}
 */
export function readStoredReviewSplitRatio(storage, containerWidth = 0) {
  const fallback = clampReviewSplitRatio(defaultReviewSplitRatio(containerWidth), containerWidth);
  try {
    if (!storage || typeof storage.getItem !== "function") return fallback;
    const parsed = parseStoredReviewSplitRatio(storage.getItem(CTR_SPLIT_STORAGE_KEY), containerWidth);
    return parsed == null ? fallback : parsed;
  } catch {
    return fallback;
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
  if (preset === "largerPlan") {
    return clampReviewSplitRatio(CTR_SPLIT_PRESETS.largerPlan, containerWidth);
  }
  if (preset === "largerWorksheet") {
    return clampReviewSplitRatio(CTR_SPLIT_PRESETS.largerWorksheet, containerWidth);
  }
  // Split view + Reset: viewport-aware balanced default.
  return clampReviewSplitRatio(defaultReviewSplitRatio(containerWidth), containerWidth);
}

/**
 * Compute next ratio from pointer X within a container rect.
 * @param {number} clientX
 * @param {{ left: number, width: number }} rect
 */
export function ratioFromPointerClientX(clientX, rect) {
  const width = Number(rect?.width) || 0;
  if (width <= 0) return defaultReviewSplitRatio(0);
  const x = Number(clientX) - Number(rect.left || 0);
  return clampReviewSplitRatio(x / width, width);
}

/**
 * Collapsed waterfall summary label for the review worksheet.
 * @param {number} count
 */
export function waterfallCollapsedSummary(count) {
  const n = Number(count) || 0;
  if (n <= 0) return "Waterfall panels · None added";
  if (n === 1) return "Waterfall panels · 1 panel";
  return `Waterfall panels · ${n} panels`;
}
