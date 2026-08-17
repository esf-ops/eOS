/**
 * Tests for read-only Moraware incremental live-read dry-run wiring.
 * No live Moraware. No Supabase production writes.
 */
import assert from "node:assert/strict";
import {
  resolveIncrementalCreationWindowBootstrap,
  buildIncrementalDiscoveryWindow,
  normalizeIncrementalCursor
} from "./morawareIncrementalCursor.mjs";
import {
  createLiveReadDryRunDeps,
  enforceDryRunCandidateCap,
  runMorawareIncrementalLiveReadDryRun
} from "./morawareIncrementalLiveReadDryRun.mjs";
import {
  formsCompletenessFromSdkFetch,
  listIncrementalReadAdapterExports,
  normalizeMorawareListRowsForIncremental,
  fetchExactJobViaCanonicalReads,
  listCandidateRowsViaCanonicalProcessPagedQuery,
  MORAWARE_INCREMENTAL_DRY_RUN_CANDIDATE_CAP
} from "./morawareIncrementalReadAdapter.mjs";
import { planIncrementalWorksheetFactRefresh } from "./morawareJobWorksheetPreparedFacts.mjs";
import { describeMorawareIncrementalStrategy } from "./morawareIncrementalStrategy.mjs";

const EPOCH_A = "c3a0e6e5-b5af-499c-87a8-73d720d485be";
const ORG = "89180433-9fab-4024-bec9-a14d870bd0a8";
const FULL_START = "2026-08-15T18:48:47.614Z";

function worksheetExact(sourceJobId, formIds, { complete = true } = {}) {
  return {
    source_job_id: sourceJobId,
    forms_authoritative_complete: complete,
    raw_payload: {
      forms_authoritative_complete: complete,
      forms: formIds.map((id) => ({
        id,
        formTemplateName: "Job Worksheet",
        fields: [
          { label: "Color", value: "Gray" },
          { label: "Sq.Ft.", value: "12" }
        ]
      })),
      activities: [{ activityIndex: 0, startDate: "2026-08-16" }]
    }
  };
}

console.log("\n=== incremental live-read dry-run adapter ===\n");

// 1. no allowMorawareRead => refused
{
  const res = await runMorawareIncrementalLiveReadDryRun({
    allowMorawareRead: false,
    organizationId: ORG,
    resolvePopulation: async () => ({ available: true })
  });
  assert.equal(res.ok, false);
  assert.equal(res.status, "moraware_read_refused");
  assert.equal(res.exact_fetch_started, false);
  console.log("ok 1: no --allow-moraware-read => source contact refused");
}

// 2–7. allow read only; mutation deps throw
{
  const deps = createLiveReadDryRunDeps({
    listCandidateRows: async () => [],
    fetchExactJobs: async () => ({ ok: true, jobs: [] }),
    resolvePopulation: async () => ({ available: true }),
    readCursor: async () => ({})
  });
  assert.equal(deps.mode, "live_read_dry_run");
  await assert.rejects(() => deps.importBrain({}), /DRY_RUN_MUTATION_REFUSED: importBrain/);
  await assert.rejects(() => deps.writeCursor({}), /DRY_RUN_MUTATION_REFUSED: writeCursor/);
  await assert.rejects(() => deps.refreshPreparedJobFacts({}), /DRY_RUN_MUTATION_REFUSED/);
  await assert.rejects(() => deps.refreshWorksheetFacts({}), /DRY_RUN_MUTATION_REFUSED/);
  await assert.rejects(() => deps.acquireLock({}), /DRY_RUN_MUTATION_REFUSED: acquireLock/);
  await assert.rejects(() => deps.cursorStore.writeCursor("x", {}, { advance: true }), /writeCursor/);
  console.log("ok 2-7: allowMorawareRead is read-only; mutation adapters refuse");
}

// 8. list adapter uses complete-discovery listImpl (not sample helper)
{
  let called = false;
  const listed = await listCandidateRowsViaCanonicalProcessPagedQuery({
    client: { ensureSession: async () => {} },
    listImpl: async () => {
      called = true;
      return {
        ok: true,
        status: "COMPLETE_LIST_DISCOVERY",
        pagination_complete: true,
        termination_reason: "natural_page_end_all_processes",
        list_rows: [
          { id: "10", source_job_id: "10", creationDate: "2026-08-16T12:00:00.000Z", name: "A" },
          { id: "11", source_job_id: "11", creationDate: "2026-08-10T00:00:00.000Z" }
        ],
        candidate_rows: [
          { id: "10", source_job_id: "10", creationDate: "2026-08-16T12:00:00.000Z", name: "A" },
          { id: "11", source_job_id: "11", creationDate: "2026-08-10T00:00:00.000Z" }
        ],
        diagnostics: {
          pages_fetched: 1,
          rows_scanned: 2,
          sample_helper_used: false,
          canonical_path:
            "collectCompleteIncrementalJobList → buildJobQueryByProcessInnerXml + sendMorawareCommand"
        }
      };
    }
  });
  assert.equal(called, true);
  assert.equal(listed.ok, true);
  assert.equal(listed.pagination_complete, true);
  assert.equal(listed.canonical_path.includes("collectCompleteIncrementalJobList"), true);
  assert.equal(listed.canonical_path.includes("collectGlobalSyncStyleJobListSample"), false);
  assert.equal(listed.list_rows[0].id, "10");
  assert.equal(listed.list_rows[0].creationDate, "2026-08-16T12:00:00.000Z");
  assert.equal(listed.view222_used, false);
  console.log("ok 8: canonical list adapter uses complete discovery path");
}

// 9. creationDate window still filters (via normalize)
{
  const rows = normalizeMorawareListRowsForIncremental([
    { _attributes: { id: "in" }, creationDate: "2026-08-16T12:00:00.000Z" },
    { _attributes: { id: "out" }, creationDate: "2026-01-01T00:00:00.000Z" }
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].creationDate.includes("2026-08-16"), true);
  console.log("ok 9: creationDate normalization for window filter");
}

// 10–12. bootstrap from FULL boundary; no all-history; unresolved without FULL
{
  const boot = resolveIncrementalCreationWindowBootstrap({
    cursor: { advanced_to: null },
    parentFullStartedAt: FULL_START,
    parentFullEpochId: EPOCH_A,
    now: new Date("2026-08-17T12:00:00.000Z"),
    overlapMs: 3600000
  });
  assert.equal(boot.ok, true);
  assert.equal(boot.bootstrap, true);
  assert.equal(boot.status, "bootstrap_from_full_census");
  // FULL start − 1h
  assert.ok(boot.note.includes("Not beginning of history") || boot.note.includes("FULL census"));
  assert.equal(boot.cursor_start, "2026-08-15T17:48:47.614Z");

  const unresolved = resolveIncrementalCreationWindowBootstrap({
    cursor: {},
    parentFullStartedAt: null,
    now: new Date("2026-08-17T12:00:00.000Z")
  });
  assert.equal(unresolved.ok, false);
  assert.equal(unresolved.status, "BOOTSTRAP_CURSOR_UNRESOLVED");

  const win = buildIncrementalDiscoveryWindow({
    cursor: {},
    parentFullStartedAt: null,
    now: new Date("2026-08-17T12:00:00.000Z")
  });
  assert.equal(win.ok, false);
  assert.equal(win.status, "BOOTSTRAP_CURSOR_UNRESOLVED");
  console.log("ok 10-12: bootstrap FULL−overlap; null advanced_to ≠ all-history; unresolved without FULL");
}

// 13–14. rolling from CURRENT + union dedupe covered in hybrid suite; spot-check here via live-read run
{
  let exactCalled = false;
  const res = await runMorawareIncrementalLiveReadDryRun({
    allowMorawareRead: true,
    organizationId: ORG,
    rollingBatchSize: 2,
    now: new Date("2026-08-17T12:00:00.000Z"),
    resolvePopulation: async () => ({
      available: true,
      organization_id: ORG,
      full_census_import_group_id: EPOCH_A,
      full_census_started_at: FULL_START,
      current_source_job_ids: ["100", "200", "300"]
    }),
    readCursor: async () => ({ advanced_to: null }),
    listCandidateRows: async () => ({
      ok: true,
      list_rows: [{ id: "100", creationDate: "2026-08-16T12:00:00.000Z" }]
    }),
    fetchExactJobs: async ({ sourceJobIds }) => {
      exactCalled = true;
      return {
        ok: true,
        jobs: sourceJobIds.map((id) => worksheetExact(id, [`f-${id}`])),
        exact_jobs_fetched: sourceJobIds.length,
        forms_fetched: sourceJobIds.length,
        activities_fetched: sourceJobIds.length,
        jobs_with_complete_authoritative_forms: sourceJobIds.length,
        jobs_with_incomplete_forms: 0,
        failures: []
      };
    }
  });
  assert.equal(res.ok, true);
  assert.equal(exactCalled, true);
  assert.ok(res.rolling.source_job_ids.includes("100"));
  assert.equal(res.counts.deduplicated_candidates, res.discovery.candidates.length);
  // 100 in creation+rolling → one candidate
  assert.equal(res.discovery.candidates.filter((c) => c.source_job_id === "100").length, 1);
  assert.ok(res.discovery.candidates.find((c) => c.source_job_id === "100").reasons.length >= 2);
  console.log("ok 13-14: rolling from CURRENT; union deduplicates IDs");
}

// 15. >100 stops BEFORE exact fetch
{
  let exactCalled = false;
  const ids = Array.from({ length: 101 }, (_, i) => String(1000 + i));
  const res = await runMorawareIncrementalLiveReadDryRun({
    allowMorawareRead: true,
    organizationId: ORG,
    rollingBatchSize: 101,
    now: new Date("2026-08-17T12:00:00.000Z"),
    resolvePopulation: async () => ({
      available: true,
      full_census_import_group_id: EPOCH_A,
      full_census_started_at: FULL_START,
      current_source_job_ids: ids
    }),
    readCursor: async () => ({ advanced_to: "2026-08-16T00:00:00.000Z" }),
    listCandidateRows: async () => ({ ok: true, list_rows: [] }),
    fetchExactJobs: async () => {
      exactCalled = true;
      return { ok: true, jobs: [] };
    }
  });
  assert.equal(res.ok, false);
  assert.equal(res.status, "DRY_RUN_CANDIDATE_CAP_EXCEEDED");
  assert.equal(res.exact_fetch_started, false);
  assert.equal(exactCalled, false);
  assert.equal(res.deduplicated_candidates, 101);
  console.log("ok 15: >100 deduplicated candidates stops BEFORE exact source fetch");
}

// 16. exactly 100 permitted
{
  const cap = enforceDryRunCandidateCap(100);
  assert.equal(cap.ok, true);
  assert.equal(enforceDryRunCandidateCap(101).ok, false);
  assert.equal(MORAWARE_INCREMENTAL_DRY_RUN_CANDIDATE_CAP, 100);
  console.log("ok 16: exactly 100 is permitted");
}

// 17–18. exact-fetch uses injected canonical path + preserves source id
{
  const res = await fetchExactJobViaCanonicalReads({
    sourceJobId: "555",
    fetchHeader: async ({ jobId }) => ({
      job: { name: { _text: "Job" }, jobStatus: { _text: "Active" }, creationDate: { _text: "2026-08-16" }, _attributes: { id: jobId } }
    }),
    fetchForms: async () => ({ forms: [{ id: "f1", formTemplateName: "Job Worksheet", fields: [] }] }),
    fetchOperational: async () => ({ parsed: { MorawareResponse: {} } })
  });
  assert.equal(res.ok, true);
  assert.equal(res.source_job_id, "555");
  assert.equal(res.job.source_job_id, "555");
  assert.equal(res.canonical_paths.forms, "fetchJobFormsAllFields");
  assert.equal(res.view222_used, false);
  console.log("ok 17-18: exact-fetch uses canonical paths; source ID preserved");
}

// 19–21. forms completeness not fabricated; complete enables reconcile; incomplete upsert-only
{
  const incomplete = formsCompletenessFromSdkFetch({ formsFetchOk: false, formsArray: [{ id: "x" }] });
  assert.equal(incomplete.forms_authoritative_complete, false);
  const complete = formsCompletenessFromSdkFetch({ formsFetchOk: true, formsArray: [{ id: "a" }, { id: "b" }] });
  assert.equal(complete.forms_authoritative_complete, true);
  assert.equal(complete.forms_completeness.source, "sdk_fetchJobFormsAllFields");

  const existing = new Map([
    ["100", [{ source_form_id: "old" }, { source_form_id: "keep" }]],
    ["200", [{ source_form_id: "other" }]]
  ]);
  const planComplete = planIncrementalWorksheetFactRefresh({
    organizationId: ORG,
    importGroupId: EPOCH_A,
    jobs: [worksheetExact("100", ["keep"], { complete: true })],
    existingRowsByJobId: existing
  });
  assert.deepEqual(planComplete.removal_plans[0].remove_source_form_ids, ["old"]);
  assert.equal(planComplete.removal_plans.some((p) => p.source_job_id === "200"), false);

  const planIncomplete = planIncrementalWorksheetFactRefresh({
    organizationId: ORG,
    importGroupId: EPOCH_A,
    jobs: [worksheetExact("100", ["keep"], { complete: false })],
    existingRowsByJobId: existing
  });
  assert.equal(planIncomplete.removal_plans.length, 0);
  console.log("ok 19-21: completeness not fabricated; complete reconciles; incomplete upsert-only");
}

// 22. cross-job removals cannot occur
{
  const plan = planIncrementalWorksheetFactRefresh({
    organizationId: ORG,
    importGroupId: EPOCH_A,
    jobs: [worksheetExact("100", ["a"], { complete: true })],
    existingRowsByJobId: new Map([
      ["100", [{ source_form_id: "gone" }]],
      ["200", [{ source_form_id: "keep-other" }]]
    ])
  });
  const removals = plan.removal_plans.flatMap((p) => p.remove_source_form_ids.map((id) => ({ job: p.source_job_id, id })));
  assert.equal(removals.every((r) => r.job === "100"), true);
  assert.equal(removals.some((r) => r.id === "keep-other"), false);
  console.log("ok 22: cross-job worksheet removal cannot occur");
}

// 23–24. View222 not consulted; no mutation APIs on read adapter
{
  const exportsInfo = listIncrementalReadAdapterExports();
  assert.equal(exportsInfo.view222, false);
  assert.equal(exportsInfo.moraware_writeback, false);
  assert.ok(exportsInfo.mutation_api_names_forbidden.includes("importBrain"));
  assert.equal(describeMorawareIncrementalStrategy().api_capability.view222_identity_authority, false);
  console.log("ok 23-24: View222 unused; read adapter has no mutation APIs");
}

// 25. live WRITE command remains separately gated (script still refuses without gates)
{
  const liveSrc = await import("node:fs").then((fs) =>
    fs.readFileSync(new URL("../scripts/moraware/incrementalLive.mjs", import.meta.url), "utf8")
  );
  assert.match(liveSrc, /MORAWARE_INCREMENTAL_LIVE/);
  assert.match(liveSrc, /--allow-live-incremental/);
  assert.match(liveSrc, /I_UNDERSTAND_PRODUCTION_WRITES/);
  assert.match(liveSrc, /evaluateMorawareIncrementalLiveGates|formatLiveIncrementalGateRefusal|REFUSED/);
  assert.match(liveSrc, /runMorawareIncrementalPopulation/);
  console.log("ok 25: live WRITE command remains separately gated");
}

// End-to-end projection: actual_writes stay zero; cursor not advanced
{
  const cursorBefore = normalizeIncrementalCursor({
    advanced_to: null,
    rolling: { after_source_job_id: null }
  });
  const res = await runMorawareIncrementalLiveReadDryRun({
    allowMorawareRead: true,
    organizationId: ORG,
    rollingBatchSize: 2,
    now: new Date("2026-08-17T12:00:00.000Z"),
    resolvePopulation: async () => ({
      available: true,
      organization_id: ORG,
      full_census_import_group_id: EPOCH_A,
      full_census_started_at: FULL_START,
      current_source_job_ids: ["100", "200", "300"]
    }),
    readCursor: async () => cursorBefore,
    listCandidateRows: async () => ({ ok: true, list_rows: [] }),
    fetchExactJobs: async ({ sourceJobIds }) => ({
      ok: true,
      jobs: sourceJobIds.map((id) => worksheetExact(id, [`f-${id}`])),
      exact_jobs_fetched: sourceJobIds.length,
      forms_fetched: sourceJobIds.length,
      activities_fetched: 0,
      jobs_with_complete_authoritative_forms: sourceJobIds.length,
      jobs_with_incomplete_forms: 0,
      failures: []
    }),
    loadExistingWorksheetRowsByJobId: async () => new Map()
  });
  assert.equal(res.ok, true);
  assert.equal(res.actual_writes.supabase, 0);
  assert.equal(res.actual_writes.cursor, 0);
  assert.equal(res.actual_writes.brain, 0);
  assert.equal(res.actual_writes.moraware, 0);
  assert.equal(res.cursor_before.rolling_cursor.after_source_job_id, null);
  assert.ok(res.projected_rolling_cursor_after_success);
  assert.equal(res.projected.jobs_removed_from_current, 0);
  assert.equal(res.projected.absence_establishes_deletion, false);
  assert.equal(res.projected.cross_job_worksheet_removals.length, 0);
  console.log("ok: projection-only dry-run keeps actual writes at 0");
}

console.log("\nAll live-read dry-run adapter tests passed.\n");
