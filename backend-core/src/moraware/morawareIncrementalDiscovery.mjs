/**
 * Hybrid incremental candidate discovery:
 *   creation_window ∪ explicit ∪ rolling_CURRENT
 *
 * Rolling selection is deterministic over CURRENT_MORAWARE_JOB_SET source_job_ids.
 * It is NOT a modified-since / change feed.
 */

import {
  MORAWARE_INCREMENTAL_API_CAPABILITY,
  MORAWARE_INCREMENTAL_DEFAULT_ROLLING_BATCH_SIZE,
  MORAWARE_INCREMENTAL_DISCOVERY_REASONS,
  MORAWARE_INCREMENTAL_STRATEGY,
  resolveRollingBatchSize
} from "./morawareIncrementalStrategy.mjs";

function pickStr(v) {
  return v != null ? String(v).trim() : "";
}

function creationMsOf(row) {
  const raw =
    row?.creationDate ??
    row?.creation_date ??
    row?.created_at_source ??
    row?.jobInfo?.creationDate ??
    row?.createdAt ??
    null;
  if (raw == null || raw === "") return NaN;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  const ms = Date.parse(String(raw));
  return Number.isFinite(ms) ? ms : NaN;
}

function sourceJobIdOf(row) {
  return pickStr(
    row?.source_job_id ??
      row?.jobId ??
      row?.job_id ??
      row?.id ??
      row?.jobInfo?.id ??
      row?.["@_id"]
  );
}

function compareSourceJobId(a, b) {
  return String(a).localeCompare(String(b), "en", { numeric: true });
}

/** Stable deterministic ordering for CURRENT set rolling. */
export function sortCurrentSourceJobIds(ids = []) {
  return [...new Set((ids || []).map((id) => pickStr(id)).filter(Boolean))].sort(compareSourceJobId);
}

/**
 * Select a bounded rolling batch from CURRENT_MORAWARE_JOB_SET.
 * Resume after `afterSourceJobId` (exclusive). Wrap to start when past end.
 * Does not fill a partial end-of-cycle batch from the beginning in the same run.
 */
export function selectRollingCurrentJobBatch({
  currentSourceJobIds = [],
  afterSourceJobId = null,
  batchSize = MORAWARE_INCREMENTAL_DEFAULT_ROLLING_BATCH_SIZE
} = {}) {
  const sorted = sortCurrentSourceJobIds(currentSourceJobIds);
  const n = resolveRollingBatchSize(batchSize, MORAWARE_INCREMENTAL_DEFAULT_ROLLING_BATCH_SIZE);
  const after = pickStr(afterSourceJobId);

  if (!sorted.length || n < 1) {
    return {
      ok: true,
      source_job_ids: [],
      candidates: [],
      batch_size_requested: n,
      batch_size_selected: 0,
      population_size: sorted.length,
      start_index: 0,
      end_index_exclusive: 0,
      start_source_job_id: null,
      end_source_job_id: null,
      wrapped: false,
      next_after_source_job_id: after || null,
      note: "rolling_refresh is bounded exact refresh — not modified_since"
    };
  }

  let startIndex = 0;
  let wrapped = false;
  if (after) {
    const idx = sorted.findIndex((id) => compareSourceJobId(id, after) > 0);
    if (idx < 0) {
      startIndex = 0;
      wrapped = true;
    } else {
      startIndex = idx;
    }
  }

  const endExclusive = Math.min(startIndex + n, sorted.length);
  const batch = sorted.slice(startIndex, endExclusive);
  const reason = MORAWARE_INCREMENTAL_DISCOVERY_REASONS.ROLLING_REFRESH;

  return {
    ok: true,
    source_job_ids: batch,
    candidates: batch.map((id) => ({
      source_job_id: id,
      creation_date_iso: null,
      discovery: reason,
      reasons: [reason]
    })),
    batch_size_requested: n,
    batch_size_selected: batch.length,
    population_size: sorted.length,
    start_index: startIndex,
    end_index_exclusive: endExclusive,
    start_source_job_id: batch[0] || null,
    end_source_job_id: batch.length ? batch[batch.length - 1] : null,
    wrapped,
    next_after_source_job_id: batch.length ? batch[batch.length - 1] : after || null,
    note: "rolling_refresh is bounded exact refresh over CURRENT — not a change feed"
  };
}

/**
 * Filter list rows by creationDate window [start, end] inclusive.
 */
export function selectCandidatesByCreationDateWindow(listRows, { cursorStart, cursorEnd } = {}) {
  const startMs = Date.parse(String(cursorStart ?? ""));
  const endMs = Date.parse(String(cursorEnd ?? ""));
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return {
      ok: false,
      error: "invalid_discovery_window",
      candidates: [],
      rejected: []
    };
  }
  const reason = MORAWARE_INCREMENTAL_DISCOVERY_REASONS.CREATION_WINDOW;
  const candidates = [];
  const rejected = [];
  for (const row of Array.isArray(listRows) ? listRows : []) {
    const id = sourceJobIdOf(row);
    const cms = creationMsOf(row);
    if (!id) {
      rejected.push({ reason: "missing_source_job_id", row_sample: null });
      continue;
    }
    if (!Number.isFinite(cms)) {
      rejected.push({ source_job_id: id, reason: "missing_creation_date" });
      continue;
    }
    if (cms < startMs || cms > endMs) {
      rejected.push({ source_job_id: id, reason: "outside_creation_window", creation_ms: cms });
      continue;
    }
    candidates.push({
      source_job_id: id,
      creation_date_iso: new Date(cms).toISOString(),
      discovery: reason,
      reasons: [reason],
      list_row: row
    });
  }
  return { ok: true, candidates, rejected_count: rejected.length, rejected_sample: rejected.slice(0, 20) };
}

function upsertCandidate(byId, { source_job_id, creation_date_iso = null, reason, list_row = undefined }) {
  const id = pickStr(source_job_id);
  if (!id || !reason) return;
  const prev = byId.get(id);
  if (!prev) {
    byId.set(id, {
      source_job_id: id,
      creation_date_iso: creation_date_iso || null,
      reasons: [reason],
      discovery: reason,
      ...(list_row !== undefined ? { list_row } : {})
    });
    return;
  }
  const reasons = [...new Set([...(prev.reasons || []), reason])].sort();
  byId.set(id, {
    ...prev,
    creation_date_iso: prev.creation_date_iso || creation_date_iso || null,
    reasons,
    discovery: reasons.join("+"),
    ...(list_row !== undefined && !prev.list_row ? { list_row } : {})
  });
}

/**
 * Union creation + explicit + rolling candidates; dedupe by exact source_job_id.
 * Multiple discovery reasons may coexist on one candidate.
 */
export function mergeIncrementalCandidateIds({
  discovered = [],
  extraSourceJobIds = [],
  rollingCandidates = []
} = {}) {
  const byId = new Map();
  for (const c of discovered || []) {
    const reasons = Array.isArray(c?.reasons) && c.reasons.length
      ? c.reasons
      : [c?.discovery || MORAWARE_INCREMENTAL_DISCOVERY_REASONS.CREATION_WINDOW];
    for (const reason of reasons) {
      upsertCandidate(byId, {
        source_job_id: c?.source_job_id || c,
        creation_date_iso: c?.creation_date_iso || null,
        reason: pickStr(reason) || MORAWARE_INCREMENTAL_DISCOVERY_REASONS.CREATION_WINDOW,
        list_row: c?.list_row
      });
    }
  }
  for (const raw of extraSourceJobIds || []) {
    upsertCandidate(byId, {
      source_job_id: raw,
      reason: MORAWARE_INCREMENTAL_DISCOVERY_REASONS.EXPLICIT
    });
  }
  for (const c of rollingCandidates || []) {
    const reasons = Array.isArray(c?.reasons) && c.reasons.length
      ? c.reasons
      : [MORAWARE_INCREMENTAL_DISCOVERY_REASONS.ROLLING_REFRESH];
    for (const reason of reasons) {
      upsertCandidate(byId, {
        source_job_id: c?.source_job_id || c,
        reason: pickStr(reason) || MORAWARE_INCREMENTAL_DISCOVERY_REASONS.ROLLING_REFRESH
      });
    }
  }
  return [...byId.values()].sort((a, b) => compareSourceJobId(a.source_job_id, b.source_job_id));
}

/**
 * Classify candidates relative to CURRENT membership.
 * Incremental absence NEVER marks removal.
 */
export function classifyIncrementalCandidates({
  candidates = [],
  currentSourceJobIds = []
} = {}) {
  const current = new Set((currentSourceJobIds || []).map(String).filter(Boolean));
  const candidateIds = new Set();
  const updates = [];
  const additions = [];
  for (const c of candidates) {
    const id = pickStr(c?.source_job_id);
    if (!id) continue;
    candidateIds.add(id);
    if (current.has(id)) updates.push(id);
    else additions.push(id);
  }
  const absentFromIncremental = [...current].filter((id) => !candidateIds.has(id));
  return {
    strategy: MORAWARE_INCREMENTAL_STRATEGY,
    candidate_count: candidateIds.size,
    existing_job_updates: updates,
    new_job_additions: additions,
    current_jobs_absent_from_incremental: absentFromIncremental,
    would_remove_from_current: [],
    absence_establishes_global_absence: false,
    note: "Jobs absent from this incremental batch remain in CURRENT_MORAWARE_JOB_SET until a later FULL census."
  };
}

/**
 * Plan hybrid discovery (no I/O).
 */
export function planIncrementalDiscovery({
  window,
  listRows = [],
  extraSourceJobIds = [],
  currentSourceJobIds = [],
  rollingAfterSourceJobId = null,
  rollingBatchSize = MORAWARE_INCREMENTAL_DEFAULT_ROLLING_BATCH_SIZE
} = {}) {
  const selected = selectCandidatesByCreationDateWindow(listRows, {
    cursorStart: window?.cursor_start,
    cursorEnd: window?.cursor_end
  });
  if (!selected.ok) {
    return {
      ok: false,
      status: "discovery_window_invalid",
      error: selected.error,
      strategy: MORAWARE_INCREMENTAL_STRATEGY,
      api_capability: MORAWARE_INCREMENTAL_API_CAPABILITY
    };
  }

  const rolling = selectRollingCurrentJobBatch({
    currentSourceJobIds,
    afterSourceJobId: rollingAfterSourceJobId,
    batchSize: rollingBatchSize
  });

  const merged = mergeIncrementalCandidateIds({
    discovered: selected.candidates,
    extraSourceJobIds,
    rollingCandidates: rolling.candidates
  });

  const classified = classifyIncrementalCandidates({
    candidates: merged,
    currentSourceJobIds
  });

  const creationIds = selected.candidates.map((c) => c.source_job_id);
  const explicitIds = [...new Set((extraSourceJobIds || []).map((id) => pickStr(id)).filter(Boolean))];
  const rollingIds = rolling.source_job_ids;

  return {
    ok: true,
    status: "planned",
    strategy: MORAWARE_INCREMENTAL_STRATEGY,
    window,
    rolling,
    counts: {
      creation_window_candidates: creationIds.length,
      explicit_candidates: explicitIds.length,
      rolling_candidates: rollingIds.length,
      deduplicated_candidates: merged.length,
      current_population_size: rolling.population_size
    },
    creation_window_job_ids: creationIds,
    explicit_job_ids: explicitIds,
    rolling_job_ids: rollingIds,
    candidates: merged,
    classification: classified,
    rejected_count: selected.rejected_count,
    rejected_sample: selected.rejected_sample,
    api_capability: MORAWARE_INCREMENTAL_API_CAPABILITY,
    view222_used: false,
    fuzzy_matching_used: false,
    creates_new_full_epoch: false
  };
}

/**
 * Idempotency helper: replaying the same inputs yields the same ID set.
 */
export function incrementalCandidateSetKey(candidates = []) {
  return (candidates || [])
    .map((c) => pickStr(c?.source_job_id || c))
    .filter(Boolean)
    .sort(compareSourceJobId)
    .join("|");
}
