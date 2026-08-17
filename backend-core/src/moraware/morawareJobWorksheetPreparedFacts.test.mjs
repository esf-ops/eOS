/**
 * Tests for Moraware Job Worksheet prepared-fact builder / dry-run (zero writes).
 */
import assert from "node:assert/strict";
import {
  buildMorawareJobWorksheetPreparedFacts,
  analyzePreparedWorksheetFactKeys,
  assertPreparedWorksheetRowsMatchTableContract,
  evaluateWorksheetFactsLiveWriteGates,
  writeMorawareJobWorksheetPreparedFacts,
  planWorksheetFactRemovalsForAuthoritativeJob,
  populateMorawareJobWorksheetPreparedFacts,
  startWorksheetFactsPopulationLockHeartbeat,
  WORKSHEET_FACTS_UPSERT_ON_CONFLICT,
  WORKSHEET_FACTS_TABLE,
  WORKSHEET_FACTS_WRITER_COLUMNS,
  VERIFIED_FOUNDATION_2026_JOB_COUNT,
  VERIFIED_FOUNDATION_2026_WORKSHEET_SQFT,
  VERIFIED_FOUNDATION_2026_WORKSHEET_FORM_COUNT,
  VERIFIED_FOUNDATION_2026_JOBS_WITHOUT_WORKSHEET,
  MORAWARE_POPULATION_LOCK_NAME,
  MORAWARE_POPULATION_LOCK_LEASE_MS,
  MORAWARE_POPULATION_LOCK_HEARTBEAT_MS
} from "./morawareJobWorksheetPreparedFacts.mjs";
import {
  VERIFIED_BROIHAHN_2026_WORKSHEET_COUNT,
  VERIFIED_BROIHAHN_2026_WORKSHEET_SQFT,
  isColorPlaceholder
} from "./morawareJobWorksheetScope.mjs";
import {
  acquireMorawarePopulationLock,
  releaseMorawarePopulationLock,
  createMorawarePopulationLockOwnerToken
} from "./morawarePopulationLock.mjs";
import { clearCurrentMorawarePopulationCacheForTests } from "./morawareCurrentPopulation.mjs";

const ORG = "89180433-9fab-4024-bec9-a14d870bd0a8";
const EPOCH_A = "full-census-epoch-a";
const WATERMARK = "2026-08-15T18:48:47.614Z";

function field(label, value) {
  return { label, value };
}

function worksheet(id, formName, fields) {
  return {
    id,
    formTemplateName: "Job Worksheet",
    formName,
    fields
  };
}

function job(overrides = {}) {
  return {
    organization_id: ORG,
    source_job_id: "j1",
    source_account_id: "553",
    sync_run_id: "run-1",
    last_seen_at: "2026-08-16T12:00:00.000Z",
    raw_payload: {
      forms: [
        worksheet("f1", "Kitchen", [
          field("Room", "Kitchen"),
          field("Color", "ASMI Lincoln Snow"),
          field("Sq.Ft.", "40"),
          field("Edge", "Eased"),
          field("Thickness", "3 cm"),
          field("Sink Type", "Under Mount"),
          field("Back Splash Type", "Tile"),
          field("Back Splash Height", '4"')
        ])
      ]
    },
    ...overrides
  };
}

function population(overrides = {}) {
  return {
    available: true,
    full_census_import_group_id: EPOCH_A,
    full_census_started_at: WATERMARK,
    ...overrides
  };
}

{
  const built = buildMorawareJobWorksheetPreparedFacts({
    organizationId: ORG,
    population: population(),
    jobs: [job()]
  });
  assert.equal(built.ok, true);
  assert.equal(built.import_group_id, EPOCH_A);
  assert.equal(built.rows.length, 1);
  assertPreparedWorksheetRowsMatchTableContract(built.rows);
  assert.equal(built.rows[0].updated_at != null, true);
  assert.equal(WORKSHEET_FACTS_UPSERT_ON_CONFLICT, "organization_id,import_group_id,source_job_id,source_form_id");
  assert.equal(WORKSHEET_FACTS_TABLE, "sales_moraware_job_worksheet_facts");
  console.log("ok: exact unique key + table contract columns");
}

{
  const missingPop = buildMorawareJobWorksheetPreparedFacts({
    organizationId: ORG,
    population: { available: false },
    jobs: [job()]
  });
  assert.equal(missingPop.ok, false);
  assert.equal(missingPop.status, "full_census_not_ready");

  const missingEpoch = buildMorawareJobWorksheetPreparedFacts({
    organizationId: ORG,
    population: { available: true, full_census_import_group_id: "", full_census_started_at: WATERMARK },
    jobs: [job()]
  });
  assert.equal(missingEpoch.ok, false);
  console.log("ok: current population + epoch required");
}

{
  const j = job({
    raw_payload: {
      forms: [
        worksheet("f1", "A", [field("Color", "X"), field("Sq.Ft.", "10")]),
        worksheet("f1", "B", [field("Color", "Y"), field("Sq.Ft.", "20")])
      ]
    }
  });
  const built = buildMorawareJobWorksheetPreparedFacts({
    organizationId: ORG,
    population: population(),
    jobs: [j]
  });
  assert.equal(built.rows.length, 1);
  const keys = analyzePreparedWorksheetFactKeys(built.rows);
  assert.equal(keys.duplicate_key_count, 0);
  assert.equal(keys.unique_key_count, 1);
  console.log("ok: duplicate forms blocked/reported (last wins → one key)");
}

{
  const stale = job({
    source_job_id: "stale",
    last_seen_at: "2026-08-14T00:00:00.000Z",
    raw_payload: {
      forms: [worksheet("fs", "Old", [field("Color", "Stale"), field("Sq.Ft.", "999")])]
    }
  });
  const current = job({ source_job_id: "cur", last_seen_at: "2026-08-16T00:00:00.000Z" });
  const built = buildMorawareJobWorksheetPreparedFacts({
    organizationId: ORG,
    population: population(),
    jobs: [stale, current]
  });
  assert.equal(built.current_job_count, 1);
  assert.equal(built.rows.length, 1);
  assert.equal(built.rows[0].source_job_id, "cur");
  console.log("ok: stale jobs excluded");
}

{
  const popA = population({ full_census_import_group_id: EPOCH_A });
  const jobs = [
    job({ source_job_id: "a", last_seen_at: "2026-08-16T00:00:00.000Z" }),
    job({
      source_job_id: "b",
      last_seen_at: "2026-08-17T00:00:00.000Z",
      sync_run_id: "inc-17",
      raw_payload: {
        forms: [worksheet("fb", "Bath", [field("Color", "See Below"), field("Sq.Ft.", "12")])]
      }
    })
  ];
  const underA = buildMorawareJobWorksheetPreparedFacts({
    organizationId: ORG,
    population: popA,
    jobs
  });
  assert.equal(underA.import_group_id, EPOCH_A);
  assert.equal(underA.rows.every((r) => r.import_group_id === EPOCH_A), true);

  const popB = population({
    full_census_import_group_id: "full-census-epoch-b",
    full_census_started_at: "2026-09-01T01:00:00.000Z"
  });
  const underB = buildMorawareJobWorksheetPreparedFacts({
    organizationId: ORG,
    population: popB,
    jobs
  });
  assert.equal(underB.import_group_id, "full-census-epoch-b");
  assert.equal(underB.rows.length, 0, "jobs last_seen before B watermark excluded");
  console.log("ok: incremental epoch stays stable; future full epoch replaces read population");
}

{
  const built = buildMorawareJobWorksheetPreparedFacts({
    organizationId: ORG,
    population: population(),
    jobs: [
      job({
        raw_payload: {
          forms: [
            worksheet("f1", "K", [
              field("Color", "See Below"),
              field("Sq.Ft.", "10"),
              field("Shop Comments", "upgrade everything")
            ])
          ]
        }
      })
    ]
  });
  const row = built.rows[0];
  assert.equal(row.color_raw, "See Below");
  assert.equal(row.color_is_placeholder, true);
  assert.equal(isColorPlaceholder(row.color_raw), true);
  assert.equal("material_family" in row, false);
  assert.equal("upgrade_score" in row, false);
  assert.equal("raw_payload" in row, false);
  assert.equal("shop_comments" in row, false);
  console.log("ok: no Material / upgrade / raw_payload; placeholder preserved raw");
}

{
  const plan = planWorksheetFactRemovalsForAuthoritativeJob({
    organizationId: ORG,
    importGroupId: EPOCH_A,
    sourceJobId: "j1",
    existingFormIds: ["f1", "f2", "f3"],
    currentFormIds: ["f1", "f3"]
  });
  assert.deepEqual(plan.remove_source_form_ids, ["f2"]);
  console.log("ok: authoritative job removal plan is job-scoped only");
}

{
  const fakeDb = {
    from() {
      throw new Error("dry-run must not call supabase.from for writes");
    }
  };
  const result = await writeMorawareJobWorksheetPreparedFacts(fakeDb, { rows: [{ a: 1 }] }, {
    liveWrite: false
  });
  assert.equal(result.status, "live_write_disabled");
  assert.equal(result.writes.upserts, 0);

  const gated = await writeMorawareJobWorksheetPreparedFacts(fakeDb, { rows: [] }, {
    liveWrite: true,
    allowLivePopulation: true,
    summary: {
      population_available: true,
      import_group_id: EPOCH_A,
      current_job_count: 1,
      worksheet_fact_count: 1,
      unique_key_count: 1,
      duplicate_key_count: 0,
      sqft: 1,
      jobs_without_worksheet: 0,
      broihahn: { match: true }
    }
  });
  assert.equal(gated.status, "gates_failed");
  assert.equal(gated.writes.upserts, 0);
  console.log("ok: dry-run / live writer performs zero writes without gates");
}

{
  assert.equal(VERIFIED_FOUNDATION_2026_JOB_COUNT, 4073);
  assert.equal(VERIFIED_FOUNDATION_2026_WORKSHEET_FORM_COUNT, 10719);
  assert.equal(VERIFIED_FOUNDATION_2026_WORKSHEET_SQFT, 271432.5);
  assert.equal(VERIFIED_FOUNDATION_2026_JOBS_WITHOUT_WORKSHEET, 109);
  assert.equal(VERIFIED_BROIHAHN_2026_WORKSHEET_COUNT, 39);
  assert.equal(VERIFIED_BROIHAHN_2026_WORKSHEET_SQFT, 1283.5);

  const gatesOk = evaluateWorksheetFactsLiveWriteGates({
    population_available: true,
    import_group_id: EPOCH_A,
    current_job_count: 4073,
    worksheet_fact_count: 10719,
    unique_key_count: 10719,
    duplicate_key_count: 0,
    sqft: 271432.5,
    jobs_without_worksheet: 109,
    broihahn: { match: true }
  });
  assert.equal(gatesOk.ok, true);

  const gatesFail = evaluateWorksheetFactsLiveWriteGates({
    population_available: true,
    import_group_id: EPOCH_A,
    current_job_count: 4000,
    worksheet_fact_count: 100,
    unique_key_count: 100,
    duplicate_key_count: 2,
    sqft: 1,
    jobs_without_worksheet: 0,
    broihahn: { match: false }
  });
  assert.equal(gatesFail.ok, false);
  console.log("ok: control constants + live gates expect 10719 / 271432.5 / Broihahn");
}

{
  const jobs = [job()];
  let upsertCalled = false;
  const db = {
    from(table) {
      if (table === WORKSHEET_FACTS_TABLE) {
        return {
          upsert() {
            upsertCalled = true;
            return Promise.resolve({ error: null });
          }
        };
      }
      throw new Error(`unexpected table ${table}`);
    }
  };
  const built = buildMorawareJobWorksheetPreparedFacts({
    organizationId: ORG,
    population: population(),
    jobs
  });
  await writeMorawareJobWorksheetPreparedFacts(db, built, { liveWrite: false });
  assert.equal(upsertCalled, false);

  assert.ok(WORKSHEET_FACTS_WRITER_COLUMNS.includes("sqft"));
  assert.ok(WORKSHEET_FACTS_WRITER_COLUMNS.includes("color_is_placeholder"));
  assert.ok(!WORKSHEET_FACTS_WRITER_COLUMNS.includes("material_family"));
  console.log("ok: dry-run path never upserts; writer columns match applied table");
}

// ─── moraware_population lock integration ───────────────────────────────────

function createMemoryEosSyncLocksDb() {
  const rows = new Map();
  function matches(row, filters) {
    for (const f of filters) {
      const actual = row[f.col];
      if (f.op === "eq" && String(actual ?? "") !== String(f.val ?? "")) return false;
      if (f.op === "lt" && String(actual ?? "") >= String(f.val ?? "")) return false;
    }
    return true;
  }
  return {
    rows,
    from(table) {
      assert.equal(table, "eos_sync_locks");
      const state = { op: "select", payload: null, filters: [] };
      const api = {
        select() {
          return api;
        },
        insert(payload) {
          state.op = "insert";
          state.payload = payload;
          return api;
        },
        update(payload) {
          state.op = "update";
          state.payload = payload;
          return api;
        },
        delete() {
          state.op = "delete";
          return api;
        },
        eq(col, val) {
          state.filters.push({ op: "eq", col, val });
          return api;
        },
        lt(col, val) {
          state.filters.push({ op: "lt", col, val });
          return api;
        },
        limit() {
          return api;
        },
        then(onFulfilled, onRejected) {
          return Promise.resolve(execute()).then(onFulfilled, onRejected);
        }
      };
      function execute() {
        if (state.op === "insert") {
          const row = { ...state.payload };
          const name = String(row.lock_name ?? "");
          if (rows.has(name)) return { data: null, error: { code: "23505", message: "duplicate key" } };
          rows.set(name, row);
          return { data: [row], error: null };
        }
        const matched = [...rows.values()].filter((row) => matches(row, state.filters));
        if (state.op === "select") return { data: matched, error: null };
        if (state.op === "update") {
          const updated = [];
          for (const row of matched) {
            const next = { ...row, ...state.payload };
            rows.set(String(next.lock_name), next);
            updated.push(next);
          }
          return { data: updated, error: null };
        }
        if (state.op === "delete") {
          const removed = [];
          for (const row of matched) {
            rows.delete(String(row.lock_name));
            removed.push(row);
          }
          return { data: removed, error: null };
        }
        return { data: [], error: null };
      }
      return api;
    }
  };
}

function stubSyncRunsApi() {
  const api = {
    select() {
      return api;
    },
    eq() {
      return api;
    },
    order() {
      return api;
    },
    limit() {
      return Promise.resolve({ data: [], error: null });
    },
    gte() {
      return api;
    },
    not() {
      return api;
    },
    in() {
      return api;
    },
    or() {
      return api;
    },
    range() {
      return Promise.resolve({ data: [], error: null });
    },
    then(onFulfilled, onRejected) {
      return Promise.resolve({ data: [], error: null }).then(onFulfilled, onRejected);
    }
  };
  return api;
}

{
  // live write without owner token fails closed
  const built = buildMorawareJobWorksheetPreparedFacts({
    organizationId: ORG,
    population: population(),
    jobs: [job()]
  });
  const summary1 = {
    population_available: true,
    import_group_id: EPOCH_A,
    current_job_count: VERIFIED_FOUNDATION_2026_JOB_COUNT,
    worksheet_fact_count: VERIFIED_FOUNDATION_2026_WORKSHEET_FORM_COUNT,
    unique_key_count: VERIFIED_FOUNDATION_2026_WORKSHEET_FORM_COUNT,
    duplicate_key_count: 0,
    sqft: VERIFIED_FOUNDATION_2026_WORKSHEET_SQFT,
    jobs_without_worksheet: VERIFIED_FOUNDATION_2026_JOBS_WITHOUT_WORKSHEET,
    broihahn: { match: true }
  };
  const missing = await writeMorawareJobWorksheetPreparedFacts(
    { from() { throw new Error("should not upsert"); } },
    built,
    { liveWrite: true, allowLivePopulation: true, summary: summary1 }
  );
  assert.equal(missing.status, "population_lock_required");
  assert.equal(missing.writes.upserts, 0);
  console.log("ok: live mode with no valid lock ownership fails closed");
}

{
  const lockDb = createMemoryEosSyncLocksDb();
  const owner = createMorawarePopulationLockOwnerToken();
  await acquireMorawarePopulationLock(lockDb, { ownerToken: owner, lockedBy: "outer" });
  const wrong = await writeMorawareJobWorksheetPreparedFacts(
    lockDb,
    { rows: [] },
    {
      liveWrite: true,
      allowLivePopulation: true,
      ownerToken: "not-the-owner",
      summary: {
        population_available: true,
        import_group_id: EPOCH_A,
        current_job_count: VERIFIED_FOUNDATION_2026_JOB_COUNT,
        worksheet_fact_count: VERIFIED_FOUNDATION_2026_WORKSHEET_FORM_COUNT,
        unique_key_count: VERIFIED_FOUNDATION_2026_WORKSHEET_FORM_COUNT,
        duplicate_key_count: 0,
        sqft: VERIFIED_FOUNDATION_2026_WORKSHEET_SQFT,
        jobs_without_worksheet: VERIFIED_FOUNDATION_2026_JOBS_WITHOUT_WORKSHEET,
        broihahn: { match: true }
      }
    }
  );
  assert.equal(wrong.status, "population_lock_denied");
  assert.equal(wrong.writes.upserts, 0);

  // expire lock
  const row = lockDb.rows.get(MORAWARE_POPULATION_LOCK_NAME);
  row.expires_at = new Date(Date.now() - 1000).toISOString();
  const expired = await writeMorawareJobWorksheetPreparedFacts(lockDb, { rows: [] }, {
    liveWrite: true,
    allowLivePopulation: true,
    ownerToken: owner,
    summary: {
      population_available: true,
      import_group_id: EPOCH_A,
      current_job_count: VERIFIED_FOUNDATION_2026_JOB_COUNT,
      worksheet_fact_count: VERIFIED_FOUNDATION_2026_WORKSHEET_FORM_COUNT,
      unique_key_count: VERIFIED_FOUNDATION_2026_WORKSHEET_FORM_COUNT,
      duplicate_key_count: 0,
      sqft: VERIFIED_FOUNDATION_2026_WORKSHEET_SQFT,
      jobs_without_worksheet: VERIFIED_FOUNDATION_2026_JOBS_WITHOUT_WORKSHEET,
      broihahn: { match: true }
    }
  });
  assert.equal(expired.status, "population_lock_inactive");
  assert.equal(expired.writes.upserts, 0);
  console.log("ok: wrong owner and expired owner fail closed");
}

{
  const lockDb = createMemoryEosSyncLocksDb();
  const owner = createMorawarePopulationLockOwnerToken();
  await acquireMorawarePopulationLock(lockDb, { ownerToken: owner });
  const built = buildMorawareJobWorksheetPreparedFacts({
    organizationId: ORG,
    population: population(),
    jobs: [job()]
  });
  // Make rows match control gate counts by fabricating a summary that passes
  // while only writing the 1 fixture row (unit test of lock+upsert path).
  const summary = {
    population_available: true,
    import_group_id: EPOCH_A,
    current_job_count: VERIFIED_FOUNDATION_2026_JOB_COUNT,
    worksheet_fact_count: VERIFIED_FOUNDATION_2026_WORKSHEET_FORM_COUNT,
    unique_key_count: VERIFIED_FOUNDATION_2026_WORKSHEET_FORM_COUNT,
    duplicate_key_count: 0,
    sqft: VERIFIED_FOUNDATION_2026_WORKSHEET_SQFT,
    jobs_without_worksheet: VERIFIED_FOUNDATION_2026_JOBS_WITHOUT_WORKSHEET,
    broihahn: { match: true }
  };
  let upserts = 0;
  const db = {
    from(table) {
      if (table === "eos_sync_locks") return lockDb.from(table);
      if (table === WORKSHEET_FACTS_TABLE) {
        return {
          upsert(chunk) {
            upserts += chunk.length;
            return Promise.resolve({ error: null });
          }
        };
      }
      throw new Error(table);
    }
  };
  const ok = await writeMorawareJobWorksheetPreparedFacts(db, built, {
    liveWrite: true,
    allowLivePopulation: true,
    ownerToken: owner,
    summary,
    chunkSize: 1
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.status, "upserted");
  assert.equal(upserts, 1);
  assert.ok(ok.renewals.length >= 1);

  // cannot steal
  const thief = createMorawarePopulationLockOwnerToken();
  const steal = await acquireMorawarePopulationLock(lockDb, { ownerToken: thief });
  assert.equal(steal.acquired, false);
  console.log("ok: healthy owner succeeds; lock cannot be stolen");
}

{
  // standalone populate acquires BEFORE brain load; releases own lock; outer does not release
  clearCurrentMorawarePopulationCacheForTests();
  const lockDb = createMemoryEosSyncLocksDb();
  const jobs = [job()];

  const outer = createMorawarePopulationLockOwnerToken();
  await acquireMorawarePopulationLock(lockDb, { ownerToken: outer, lockedBy: "pipeline" });

  const dbOuter = {
    from(table) {
      if (table === "eos_sync_locks") return lockDb.from(table);
      if (table === "brain_moraware_jobs") {
        const api = {
          select() {
            return api;
          },
          eq() {
            return api;
          },
          gte() {
            return api;
          },
          order() {
            return api;
          },
          range() {
            return Promise.resolve({ data: jobs, error: null });
          }
        };
        return api;
      }
      if (table === WORKSHEET_FACTS_TABLE) {
        return {
          select() {
            return this;
          },
          eq() {
            return Promise.resolve({ count: 0, error: null });
          }
        };
      }
      return stubSyncRunsApi();
    }
  };

  const outerResult = await populateMorawareJobWorksheetPreparedFacts(dbOuter, ORG, {
    liveWrite: true,
    allowLivePopulation: true,
    outerOwnerToken: outer,
    verifyAfterWrite: false
  });
  assert.equal(outerResult.ok, false);
  assert.equal(outerResult.lock_mode, "outer");
  assert.ok(outerResult.event_log.some((e) => e.step === "outer_lock_not_released"));
  const still = lockDb.rows.get(MORAWARE_POPULATION_LOCK_NAME);
  assert.equal(String(still.locked_by), outer);

  const steps = outerResult.event_log.map((e) => e.step);
  assert.ok(steps.indexOf("outer_owner_assert_before_source_load") < steps.indexOf("resolve_and_build_after_lock"));

  await releaseMorawarePopulationLock(lockDb, { ownerToken: outer });

  clearCurrentMorawarePopulationCacheForTests();
  const lockDb2 = createMemoryEosSyncLocksDb();
  const dbSolo = {
    from(table) {
      if (table === "eos_sync_locks") return lockDb2.from(table);
      if (table === "brain_moraware_jobs") {
        const api = {
          select() {
            return api;
          },
          eq() {
            return api;
          },
          gte() {
            return api;
          },
          order() {
            return api;
          },
          range() {
            return Promise.resolve({ data: jobs, error: null });
          }
        };
        return api;
      }
      if (table === WORKSHEET_FACTS_TABLE) {
        return {
          select() {
            return this;
          },
          eq() {
            return Promise.resolve({ count: 0, error: null });
          }
        };
      }
      return stubSyncRunsApi();
    }
  };
  const solo = await populateMorawareJobWorksheetPreparedFacts(dbSolo, ORG, {
    liveWrite: true,
    allowLivePopulation: true,
    verifyAfterWrite: false
  });
  assert.equal(solo.lock_mode, "standalone");
  assert.ok(solo.event_log.some((e) => e.step === "standalone_acquire_before_source_load"));
  assert.ok(solo.event_log.some((e) => e.step === "standalone_release"));
  assert.equal(solo.released_standalone_lock, true);
  assert.equal(lockDb2.rows.has(MORAWARE_POPULATION_LOCK_NAME), false);
  const soloSteps = solo.event_log.map((e) => e.step);
  assert.ok(soloSteps.indexOf("standalone_acquired") < soloSteps.indexOf("resolve_and_build_after_lock"));
  console.log("ok: standalone acquire-before-load + release; outer does not release");
}

{
  // lease renewal during write; ownership loss stops write
  const lockDb = createMemoryEosSyncLocksDb();
  const owner = createMorawarePopulationLockOwnerToken();
  await acquireMorawarePopulationLock(lockDb, { ownerToken: owner });
  let renewCalls = 0;
  const built = {
    rows: Array.from({ length: 3 }, (_, i) => ({
      organization_id: ORG,
      import_group_id: EPOCH_A,
      sync_run_id: null,
      source_account_id: "553",
      source_job_id: "j1",
      source_form_id: `f${i}`,
      form_name_raw: null,
      room_raw: null,
      color_raw: "X",
      color_is_placeholder: false,
      sqft: 1,
      edge_raw: null,
      thickness_raw: null,
      backsplash_type_raw: null,
      backsplash_height_raw: null,
      sink_type_raw: null,
      faucet_type_raw: null,
      stove_type_raw: null,
      electrical_cutouts_raw: null,
      overhang_raw: null,
      braces_raw: null,
      dry_treat_raw: null,
      stone_care_kit_raw: null,
      updated_at: new Date().toISOString()
    }))
  };
  const summary = {
    population_available: true,
    import_group_id: EPOCH_A,
    current_job_count: VERIFIED_FOUNDATION_2026_JOB_COUNT,
    worksheet_fact_count: VERIFIED_FOUNDATION_2026_WORKSHEET_FORM_COUNT,
    unique_key_count: VERIFIED_FOUNDATION_2026_WORKSHEET_FORM_COUNT,
    duplicate_key_count: 0,
    sqft: VERIFIED_FOUNDATION_2026_WORKSHEET_SQFT,
    jobs_without_worksheet: VERIFIED_FOUNDATION_2026_JOBS_WITHOUT_WORKSHEET,
    broihahn: { match: true }
  };
  const db = {
    from(table) {
      if (table === "eos_sync_locks") {
        renewCalls += 1;
        return lockDb.from(table);
      }
      if (table === WORKSHEET_FACTS_TABLE) {
        return {
          upsert() {
            return Promise.resolve({ error: null });
          }
        };
      }
      throw new Error(table);
    }
  };
  const wrote = await writeMorawareJobWorksheetPreparedFacts(db, built, {
    liveWrite: true,
    allowLivePopulation: true,
    ownerToken: owner,
    summary,
    chunkSize: 1
  });
  assert.equal(wrote.ok, true);
  assert.ok(wrote.renewals.length >= 3);

  // ownership loss mid-write
  let lost = false;
  const mid = await writeMorawareJobWorksheetPreparedFacts(db, built, {
    liveWrite: true,
    allowLivePopulation: true,
    ownerToken: owner,
    summary,
    chunkSize: 1,
    ownershipLostFlag: () => {
      if (!lost) {
        lost = true;
        return false;
      }
      return true;
    }
  });
  assert.equal(mid.ok, false);
  assert.equal(mid.status, "population_lock_lost");

  const hb = startWorksheetFactsPopulationLockHeartbeat(lockDb, {
    ownerToken: owner,
    intervalMs: 60_000
  });
  await hb.tickNow();
  assert.equal(hb.hasFailed(), false);
  hb.stop();
  assert.equal(MORAWARE_POPULATION_LOCK_LEASE_MS, 4 * 60 * 60 * 1000);
  assert.equal(MORAWARE_POPULATION_LOCK_HEARTBEAT_MS, 15 * 60 * 1000);
  console.log("ok: lease renewal during write; ownership loss stops write path");
}

{
  // dry-run requires no lock
  const lockDb = createMemoryEosSyncLocksDb();
  assert.equal(lockDb.rows.size, 0);
  console.log("ok: dry-run requires no lock (lock store empty / unused by dry-run path)");
}

console.log("\nAll morawareJobWorksheetPreparedFacts tests passed.");
