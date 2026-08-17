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
  WORKSHEET_FACTS_UPSERT_ON_CONFLICT,
  WORKSHEET_FACTS_TABLE,
  WORKSHEET_FACTS_WRITER_COLUMNS,
  VERIFIED_FOUNDATION_2026_JOB_COUNT,
  VERIFIED_FOUNDATION_2026_WORKSHEET_SQFT,
  VERIFIED_FOUNDATION_2026_WORKSHEET_FORM_COUNT,
  VERIFIED_FOUNDATION_2026_JOBS_WITHOUT_WORKSHEET
} from "./morawareJobWorksheetPreparedFacts.mjs";
import {
  VERIFIED_BROIHAHN_2026_WORKSHEET_COUNT,
  VERIFIED_BROIHAHN_2026_WORKSHEET_SQFT,
  isColorPlaceholder
} from "./morawareJobWorksheetScope.mjs";

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

console.log("\nAll morawareJobWorksheetPreparedFacts tests passed.");
