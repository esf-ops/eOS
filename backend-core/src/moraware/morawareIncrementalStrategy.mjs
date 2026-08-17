/**
 * Hybrid bounded exact-refresh Moraware incremental strategy.
 *
 * AUTHORITATIVE API FINDING:
 *   Moraware XML exposes NO trustworthy modified-since / changed-since list filter.
 *   creationDate on list rows is NOT modification detection.
 *
 * Honest strategy name:
 *   creation_window_plus_rolling_exact_refresh
 *
 * Candidate set = UNION of:
 *   1) creation-window candidates (new/recently created jobs)
 *   2) explicit exact source_job_ids
 *   3) deterministic rolling subset of CURRENT_MORAWARE_JOB_SET
 *
 * Rolling refresh is NOT a change feed — it guarantees eventual authoritative
 * exact refresh of existing CURRENT jobs despite no modified-since API.
 *
 * Absence from creation window / rolling batch / explicit list NEVER removes
 * CURRENT membership. Only complete uncapped FULL census establishes absence.
 *
 * View 222 is NEVER identity or change authority.
 */

import { CENSUS_SCOPE_FULL, CENSUS_SCOPE_INCREMENTAL } from "./morawareCurrentPopulation.mjs";

/** Final honest strategy id — not modified_since / change_feed / CDC. */
export const MORAWARE_INCREMENTAL_STRATEGY = "creation_window_plus_rolling_exact_refresh";

/** Prior strategy name (creation-window only). Still recognized when reading cursors. */
export const MORAWARE_INCREMENTAL_STRATEGY_LEGACY_CREATION_ONLY = "creation_window_bounded_exact_refresh";

/** Cursor document kind — dual creation + rolling positions. */
export const MORAWARE_INCREMENTAL_CURSOR_KIND = "creation_date_iso_plus_rolling_source_job_id";

/** organization_integration_configs.integration_key (existing table — no migration). */
export const MORAWARE_INCREMENTAL_CURSOR_INTEGRATION_KEY = "moraware_incremental_cursor";

/** Default overlap for creation-window replay safety. */
export const MORAWARE_INCREMENTAL_DEFAULT_OVERLAP_MS = 60 * 60 * 1000; // 1 hour

/**
 * Conservative default rolling batch for tests / early runs.
 * Production cadence/batch policy is decided later — override via options/env.
 */
export const MORAWARE_INCREMENTAL_DEFAULT_ROLLING_BATCH_SIZE = 25;

export const MORAWARE_INCREMENTAL_DISCOVERY_REASONS = Object.freeze({
  CREATION_WINDOW: "creation_window",
  EXPLICIT: "explicit",
  ROLLING_REFRESH: "rolling_refresh"
});

export const MORAWARE_INCREMENTAL_API_CAPABILITY = Object.freeze({
  modified_since_list_filter: false,
  changed_since_list_filter: false,
  change_feed: false,
  cdc: false,
  process_paged_job_query: true,
  creation_date_include_on_list: true,
  creation_date_client_window_filter: true,
  creation_date_server_range_filter: "unproven",
  creation_date_is_not_modification_detection: true,
  rolling_current_job_exact_refresh: true,
  exact_job_detail_refresh: true,
  exact_job_forms_refresh: true,
  exact_job_activities_refresh: true,
  view222_identity_authority: false,
  fuzzy_identity_matching: false,
  moraware_writeback: false,
  quickbooks_writes: false,
  account_directory_writes: false
});

export function incrementalCensusScope() {
  return CENSUS_SCOPE_INCREMENTAL;
}

export function fullCensusScope() {
  return CENSUS_SCOPE_FULL;
}

export function resolveRollingBatchSize(raw, fallback = MORAWARE_INCREMENTAL_DEFAULT_ROLLING_BATCH_SIZE) {
  if (raw == null || raw === "") return fallback;
  const n = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n < 0) return fallback;
  // 0 = explicitly disable rolling for a run (tests / creation-only diagnostics)
  return n;
}

/**
 * Human + machine description of what this incremental path can and cannot do.
 */
export function describeMorawareIncrementalStrategy() {
  return {
    strategy: MORAWARE_INCREMENTAL_STRATEGY,
    cursor_kind: MORAWARE_INCREMENTAL_CURSOR_KIND,
    census_scope: CENSUS_SCOPE_INCREMENTAL,
    discovers_via: [
      "process-scoped paged jobQuery creationDate window (new/recent creations)",
      "explicit exact source_job_id list",
      "deterministic rolling exact refresh over CURRENT_MORAWARE_JOB_SET"
    ],
    not_supported_by_api: [
      "authoritative modified-since / changed-since list filter",
      "change feed / CDC"
    ],
    not_claimed: [
      "creationDate is not modification detection",
      "rolling refresh is not a changed-since feed"
    ],
    limits: [
      "Between FULL censuses, existing-job freshness depends on rolling batch coverage over time",
      "A single incremental run exact-refreshes only a bounded candidate union",
      "Incremental absence never removes CURRENT membership",
      "Only complete uncapped FULL census establishes global absence / new epoch"
    ],
    default_rolling_batch_size: MORAWARE_INCREMENTAL_DEFAULT_ROLLING_BATCH_SIZE,
    api_capability: MORAWARE_INCREMENTAL_API_CAPABILITY
  };
}
