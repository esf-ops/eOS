/**
 * Maps backend takeoff generation processing metadata to estimator-facing progress.
 * Pure JS for node tests without a TS build step.
 */

/** @typedef {{
 *   asyncStatus?: string|null,
 *   phase?: string|null,
 *   phaseLabel?: string|null,
 *   pageProgress?: { current?: number, total?: number }|null,
 *   runId?: string|null,
 *   startedAt?: string|null,
 *   updatedAt?: string|null,
 *   error?: string|null,
 * }} TakeoffProcessingMeta */

/** @typedef {{
 *   state: "indeterminate"|"determinate"|"complete"|"failed",
 *   percent: number|null,
 *   label: string,
 *   stepIndex: number|null,
 *   stepTotal: number,
 *   phase: string|null,
 *   pageProgress: { current: number, total: number }|null,
 *   indeterminate: boolean,
 * }} GenerationProgressView */

const WORK_PHASES = Object.freeze([
  "download",
  "page_inventory",
  "dimension_evidence",
  "extraction",
  "normalize",
  "persist",
]);

/** @type {Record<string, { percent: number, label: string, stepIndex: number|null }>} */
const PHASE_MAP = Object.freeze({
  queued: { percent: 5, label: "Queued", stepIndex: null },
  download: { percent: 12, label: "Preparing plan", stepIndex: 1 },
  preparing_file: { percent: 12, label: "Preparing plan", stepIndex: 1 },
  page_inventory: { percent: 25, label: "Reading plan pages", stepIndex: 2 },
  dimension_evidence: { percent: 45, label: "Finding dimensions", stepIndex: 3 },
  extraction: { percent: 70, label: "Building takeoff draft", stepIndex: 4 },
  normalize: { percent: 88, label: "Recomputing totals", stepIndex: 5 },
  recompute_validate: { percent: 88, label: "Recomputing totals", stepIndex: 5 },
  persist: { percent: 95, label: "Saving review draft", stepIndex: 6 },
  persist_result: { percent: 95, label: "Saving review draft", stepIndex: 6 },
  done: { percent: 100, label: "Ready for review", stepIndex: 6 },
  completed: { percent: 100, label: "Ready for review", stepIndex: 6 },
});

const STEP_TOTAL = WORK_PHASES.length;

/**
 * @param {string|null|undefined} raw
 * @returns {string|null}
 */
export function normalizeGenerationPhase(raw) {
  const phase = String(raw ?? "").trim().toLowerCase();
  if (!phase || phase === "processing") return null;
  if (phase === "failed") return "failed";
  return phase;
}

/**
 * @param {TakeoffProcessingMeta|null|undefined} processing
 * @param {string|null|undefined} jobStatus
 * @returns {GenerationProgressView}
 */
export function deriveGenerationProgress(processing, jobStatus) {
  const status = String(jobStatus ?? "").trim().toLowerCase();
  const phase = normalizeGenerationPhase(processing?.phase ?? processing?.asyncStatus);
  const pageProgress =
    processing?.pageProgress &&
    typeof processing.pageProgress === "object" &&
    Number(processing.pageProgress.total ?? 0) > 0
      ? {
          current: Number(processing.pageProgress.current ?? 0),
          total: Number(processing.pageProgress.total ?? 0),
        }
      : null;

  if (status === "failed" || phase === "failed" || processing?.asyncStatus === "failed") {
    return {
      state: "failed",
      percent: null,
      label: processing?.phaseLabel ?? "Generation failed",
      stepIndex: null,
      stepTotal: STEP_TOTAL,
      phase: phase ?? "failed",
      pageProgress,
      indeterminate: false,
    };
  }

  if (status === "completed" || phase === "done" || phase === "completed") {
    return {
      state: "complete",
      percent: 100,
      label: "Ready for review",
      stepIndex: STEP_TOTAL,
      stepTotal: STEP_TOTAL,
      phase: "done",
      pageProgress,
      indeterminate: false,
    };
  }

  const mapped = phase ? PHASE_MAP[phase] : null;
  if (!mapped) {
    return {
      state: "indeterminate",
      percent: null,
      label: "Starting AI takeoff…",
      stepIndex: null,
      stepTotal: STEP_TOTAL,
      phase,
      pageProgress,
      indeterminate: true,
    };
  }

  return {
    state: "determinate",
    percent: mapped.percent,
    label: processing?.phaseLabel ?? mapped.label,
    stepIndex: mapped.stepIndex,
    stepTotal: STEP_TOTAL,
    phase,
    pageProgress,
    indeterminate: false,
  };
}

/**
 * @param {number} elapsedMs
 * @returns {string|null}
 */
export function longRunningGenerationHint(elapsedMs) {
  if (elapsedMs >= 120_000) {
    return "Still processing. You can leave this screen open while eliteOS finishes the takeoff.";
  }
  if (elapsedMs >= 45_000) {
    return "Still working — large or detailed plans can take a few minutes.";
  }
  return null;
}

/**
 * @param {string|null|undefined} startedAt
 * @param {number} [nowMs]
 * @returns {number}
 */
export function generationElapsedMs(startedAt, nowMs = Date.now()) {
  if (!startedAt) return 0;
  const t = Date.parse(startedAt);
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, nowMs - t);
}
