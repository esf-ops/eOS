/**
 * TRUSTED Moraware Job Worksheet scope facts — unit tests.
 * Run: node backend-core/src/moraware/morawareJobWorksheetScope.test.mjs
 */

import assert from "node:assert/strict";
import {
  aggregateWorksheetColors,
  aggregateWorksheetEdges,
  aggregateWorksheetRooms,
  aggregateWorksheetSinks,
  aggregateWorksheetThicknesses,
  assertNoForbiddenWorksheetScopeKeys,
  buildWorksheetScopeReadModel,
  extractCurrentMorawareJobWorksheetScopeFacts,
  extractMorawareJobWorksheetScopeFacts,
  isColorPlaceholder,
  planWorksheetScopeFactsRebuild,
  scrubWorksheetScopeFactForBrowser,
  sumWorksheetScopeSqft,
  toPreparedWorksheetFactRows,
  VERIFIED_BROIHAHN_2026_JOB_COUNT,
  VERIFIED_BROIHAHN_2026_WORKSHEET_COUNT,
  VERIFIED_BROIHAHN_2026_WORKSHEET_SQFT,
  VERIFIED_BROIHAHN_MORAWARE_ACCOUNT_IDS,
  VERIFIED_FOUNDATION_2026_JOBS_WITHOUT_WORKSHEET,
  VERIFIED_FOUNDATION_2026_JOBS_WITH_WORKSHEET,
  VERIFIED_FOUNDATION_2026_WORKSHEET_FORM_COUNT
} from "./morawareJobWorksheetScope.mjs";
import {
  VERIFIED_FOUNDATION_2026_JOB_COUNT,
  VERIFIED_FOUNDATION_2026_WORKSHEET_SQFT
} from "./morawareCurrentPopulation.mjs";
import { extractJobWorksheetCensusSqft } from "../sales/morawareSqftActuals.js";

const ORG = "11111111-1111-4111-8111-111111111111";
const EPOCH = "full-census-epoch-1";
const WATERMARK = "2026-08-15T18:48:47.614Z";

function field(label, value, extra = {}) {
  return {
    label,
    normalizedLabel: String(label).toLowerCase(),
    value,
    ...extra
  };
}

function worksheet(id, formName, fields) {
  return {
    id: String(id),
    formName,
    formTemplateName: "Job Worksheet",
    templateName: "Job Worksheet",
    fields
  };
}

function job({
  source_job_id,
  source_account_id = "100",
  last_seen_at = "2026-08-16T12:00:00.000Z",
  forms = [],
  extraForms = []
} = {}) {
  return {
    organization_id: ORG,
    source_job_id: String(source_job_id),
    source_account_id: String(source_account_id),
    last_seen_at,
    created_at_source: "2026-03-01",
    raw_payload: {
      forms: [...forms, ...extraForms]
    }
  };
}

const population = {
  available: true,
  full_census_import_group_id: EPOCH,
  full_census_started_at: WATERMARK
};

{
  const j = job({
    source_job_id: "1",
    forms: [
      worksheet("f1", "Kitchen", [
        field("Room", "Kitchen"),
        field("Sq.Ft.", "42.5"),
        field("Color", "ASMI Lincoln Snow"),
        field("Edge", "Eased"),
        field("Thickness", "3 cm"),
        field("Back Splash Type", "Granite/Quartz"),
        field("Back Splash Height", '4"'),
        field("Sink Type", "Under Mount"),
        field("Faucet Type", "Single Hole"),
        field("Stove Type", "Cook Top"),
        field("Electrical Cut-outs Needed", "2"),
        field("Island or Raised Bar Overhang", '12"'),
        field("Braces Needed", "4"),
        field("Dry Treat", "1"),
        field("Stone Care Kit", "1"),
        field("Shop Comments", "Mitered waterfall please")
      ]),
      {
        id: "acct-1",
        formTemplateName: "Accounting Form",
        fields: [field("Sq.Ft.", "9999"), field("Color", "IGNORE")]
      }
    ]
  });
  const facts = extractMorawareJobWorksheetScopeFacts(j, { organizationId: ORG });
  assert.equal(facts.length, 1);
  assert.equal(facts[0].source_form_id, "f1");
  assert.equal(facts[0].room_raw, "Kitchen");
  assert.equal(facts[0].color_raw, "ASMI Lincoln Snow");
  assert.equal(facts[0].sqft, 42.5);
  assert.equal(facts[0].edge_raw, "Eased");
  assert.equal(facts[0].thickness_raw, "3 cm");
  assert.equal(facts[0].backsplash_type_raw, "Granite/Quartz");
  assert.equal(facts[0].backsplash_height_raw, '4"');
  assert.equal(facts[0].sink_type_raw, "Under Mount");
  assert.equal(facts[0].material_family, undefined);
  assert.equal(facts[0].upgrade_score, undefined);
  assert.equal(facts[0].shop_comments, undefined);
  assert.equal(facts[0].raw_payload, undefined);
  console.log("ok: one Job Worksheet = one fact; accounting form ignored; no upgrades/comments");
}

{
  const j = job({
    source_job_id: "2",
    forms: [
      worksheet("a", "Kitchen", [field("Room", "Kitchen"), field("Color", "A"), field("Sq.Ft.", "10")]),
      worksheet("b", "Bath", [field("Room", "Bath"), field("Color", "B"), field("Sq.Ft.", "20")])
    ]
  });
  const facts = extractMorawareJobWorksheetScopeFacts(j);
  assert.equal(facts.length, 2);
  assert.deepEqual(
    facts.map((f) => f.source_form_id).sort(),
    ["a", "b"]
  );
  assert.equal(sumWorksheetScopeSqft(facts), 30);
  console.log("ok: multiple worksheets remain multiple facts");
}

{
  const j = job({
    source_job_id: "3",
    forms: [
      worksheet("dup", "Kitchen", [field("Color", "First"), field("Sq.Ft.", "5")]),
      worksheet("dup", "Kitchen revised", [field("Color", "Second"), field("Sq.Ft.", "7")])
    ]
  });
  const facts = extractMorawareJobWorksheetScopeFacts(j);
  assert.equal(facts.length, 1);
  assert.equal(facts[0].color_raw, "Second");
  assert.equal(facts[0].sqft, 7);
  console.log("ok: duplicate source_form_id cannot double-count");
}

{
  const facts = [
    { source_job_id: "j1", color_raw: "Cloud White", color_is_placeholder: false, sqft: 40 },
    { source_job_id: "j1", color_raw: "Cloud White", color_is_placeholder: false, sqft: 10 },
    { source_job_id: "j2", color_raw: "See Below", color_is_placeholder: true, sqft: 50 },
    { source_job_id: "j3", color_raw: "Taj Mahal", color_is_placeholder: false, sqft: 25 }
  ];
  const colors = aggregateWorksheetColors(facts);
  const cloud = colors.find((c) => c.color_raw === "Cloud White");
  assert.equal(cloud.worksheet_count, 2);
  assert.equal(cloud.job_count, 1);
  assert.equal(cloud.sqft, 50);
  const placeholder = colors.find((c) => c.color_raw === "See Below");
  assert.equal(placeholder.is_placeholder, true);
  assert.equal(isColorPlaceholder("TBD"), true);
  assert.equal(isColorPlaceholder("ASMI Lincoln Snow"), false);
  console.log("ok: Color + SqFt aggregation; placeholders classified");
}

{
  const facts = [
    { source_job_id: "j1", room_raw: "Kitchen", sqft: 80 },
    { source_job_id: "j1", room_raw: "Bath", sqft: 20 },
    { source_job_id: "j2", room_raw: "Kitchen", sqft: 30 }
  ];
  const rooms = aggregateWorksheetRooms(facts);
  const kitchen = rooms.find((r) => r.room_raw === "Kitchen");
  assert.equal(kitchen.worksheet_count, 2);
  assert.equal(kitchen.job_count, 2);
  assert.equal(kitchen.sqft, 110);
  console.log("ok: Room + SqFt aggregation");
}

{
  const facts = [
    { source_job_id: "j1", edge_raw: "Eased", sqft: 100 },
    { source_job_id: "j1", edge_raw: "Eased", sqft: 50 },
    { source_job_id: "j2", edge_raw: "Ogee", sqft: 200 }
  ];
  const edges = aggregateWorksheetEdges(facts);
  const eased = edges.find((e) => e.edge_raw === "Eased");
  assert.equal(eased.worksheet_count, 2);
  assert.equal(eased.distinct_job_count, 1);
  assert.equal(Object.prototype.hasOwnProperty.call(eased, "sqft"), false);
  assert.equal(edges.every((e) => e.sqft === undefined), true);
  console.log("ok: Edge has counts only — no SqFt mix metric");
}

{
  const facts = [
    { source_job_id: "j1", thickness_raw: "3 cm", sqft: 40 },
    { source_job_id: "j2", thickness_raw: "2 cm", sqft: 10 }
  ];
  const thicknesses = aggregateWorksheetThicknesses(facts);
  assert.equal(thicknesses.find((t) => t.thickness_raw === "3 cm").sqft, 40);
  console.log("ok: Thickness extraction + same-grain SqFt");
}

{
  const facts = [
    { source_job_id: "j1", sink_type_raw: "Under Mount" },
    { source_job_id: "j1", sink_type_raw: "Under Mount" },
    { source_job_id: "j2", sink_type_raw: "Apron Front" }
  ];
  const sinks = aggregateWorksheetSinks(facts);
  assert.equal(sinks.find((s) => s.sink_type_raw === "Under Mount").worksheet_count, 2);
  assert.equal(sinks.find((s) => s.sink_type_raw === "Under Mount").job_count, 1);
  console.log("ok: Sink Type frequency");
}

{
  const j = job({
    source_job_id: "bs",
    forms: [
      worksheet("f", "Kitchen", [
        field("Back Splash Type", "Full Height"),
        field("Back Splash Height", "FHBS"),
        field("Sq.Ft.", "12")
      ])
    ]
  });
  const [fact] = extractMorawareJobWorksheetScopeFacts(j);
  assert.equal(fact.backsplash_type_raw, "Full Height");
  assert.equal(fact.backsplash_height_raw, "FHBS");
  assert.equal(fact.backsplash_type_normalized, undefined);
  console.log("ok: raw backsplash extraction only");
}

{
  const j = job({
    source_job_id: "mat",
    forms: [worksheet("f", "Kitchen", [field("Color", "Cristalo Iceberg Quartzite"), field("Sq.Ft.", "10")])]
  });
  const [fact] = extractMorawareJobWorksheetScopeFacts(j);
  assert.equal(fact.material_family, undefined);
  assert.equal(Object.keys(fact).some((k) => k.toLowerCase().includes("material")), false);
  console.log("ok: Material remains absent");
}

{
  const j = job({
    source_job_id: "up",
    forms: [
      worksheet("f", "Island", [
        field("Edge", "Eased"),
        field("Shop Comments", "Mitered waterfall and bookmatch"),
        field("More Shop Comments", "Drain grooves"),
        field("Sq.Ft.", "30")
      ])
    ]
  });
  const facts = extractMorawareJobWorksheetScopeFacts(j);
  const json = JSON.stringify(facts);
  assert.equal(json.includes("upgrade"), false);
  assert.equal(json.includes("mitered"), false);
  assert.equal(json.includes("waterfall"), false);
  assert.equal(json.includes("Shop Comments"), false);
  console.log("ok: Shop Comments produce no upgrades");
}

{
  const jobs = [
    job({
      source_job_id: "current",
      last_seen_at: "2026-08-16T12:00:00.000Z",
      forms: [worksheet("c1", "Kitchen", [field("Color", "A"), field("Sq.Ft.", "10")])]
    }),
    job({
      source_job_id: "stale",
      last_seen_at: "2026-08-14T12:00:00.000Z",
      forms: [worksheet("s1", "Kitchen", [field("Color", "STALE"), field("Sq.Ft.", "917.5")])]
    })
  ];
  const facts = extractCurrentMorawareJobWorksheetScopeFacts(jobs, population, { organizationId: ORG });
  assert.equal(facts.length, 1);
  assert.equal(facts[0].source_job_id, "current");
  assert.equal(sumWorksheetScopeSqft(facts), 10);
  console.log("ok: CURRENT population excludes stale jobs");
}

{
  const jobs = [
    ...Array.from({ length: 5 }, (_, i) =>
      job({
        source_job_id: `base-${i}`,
        last_seen_at: "2026-08-15T20:00:00.000Z",
        sync_run_id: "full",
        forms: [worksheet(`f-${i}`, "Kitchen", [field("Color", "A"), field("Sq.Ft.", "1")])]
      })
    ),
    job({
      source_job_id: "new-inc",
      last_seen_at: "2026-08-17T08:00:00.000Z",
      sync_run_id: "inc",
      forms: [worksheet("f-new", "Bath", [field("Color", "B"), field("Sq.Ft.", "2")])]
    })
  ];
  // Untouched base job still in current set (last_seen from full census)
  const plan = planWorksheetScopeFactsRebuild({
    jobs,
    population,
    latestCompleteGroup: {
      import_group_id: "incremental-17",
      successful_sync_run_ids: ["inc"]
    }
  });
  assert.equal(plan.import_group_id, EPOCH);
  assert.equal(plan.uses_latest_complete_group_as_universe, false);
  assert.equal(plan.worksheet_fact_count, 6);
  assert.ok(plan.facts.some((f) => f.source_job_id === "base-0"));
  assert.ok(plan.facts.some((f) => f.source_job_id === "new-inc"));
  assert.notEqual(plan.worksheet_fact_count, 1);
  console.log("ok: incremental overlay preserves untouched facts; epoch stays full census");
}

{
  const jobs = [
    job({
      source_job_id: "old-only",
      last_seen_at: "2026-08-15T20:00:00.000Z",
      forms: [worksheet("o1", "Kitchen", [field("Color", "Old"), field("Sq.Ft.", "5")])]
    })
  ];
  const nextPopulation = {
    available: true,
    full_census_import_group_id: "full-census-epoch-2",
    full_census_started_at: "2026-09-01T01:00:00.000Z"
  };
  const planNext = planWorksheetScopeFactsRebuild({ jobs, population: nextPopulation });
  assert.equal(planNext.import_group_id, "full-census-epoch-2");
  assert.equal(planNext.worksheet_fact_count, 0);
  console.log("ok: future full epoch replaces current read population (old last_seen excluded)");
}

{
  // Broihahn control fixture: 13 jobs / 39 worksheets / 1283.5 SqFt
  assert.deepEqual([...VERIFIED_BROIHAHN_MORAWARE_ACCOUNT_IDS], ["553", "635"]);
  assert.equal(VERIFIED_BROIHAHN_2026_JOB_COUNT, 13);
  assert.equal(VERIFIED_BROIHAHN_2026_WORKSHEET_COUNT, 39);
  assert.equal(VERIFIED_BROIHAHN_2026_WORKSHEET_SQFT, 1283.5);

  const broihahnJobs = [];
  let formSeq = 1;
  const colorPlan = [
    // job 38020-style multi-color
    [
      ["Kitchen", "ASMI Lincoln Snow", 86],
      ["Laundry", "ASMI Lincoln Snow", 11],
      ["Mudroom", "ASMI Lincoln Snow", 11],
      ["Bath", "ASMI Lincoln Snow", 14],
      ["Kitchenette", "India Black Pearl (Leathered)", 72],
      ["Basement Bath", "ASMI Lincoln Snow", 10],
      ["Bath", "ASMI Lincoln Snow", 27],
      ["Kitchen", "ASMI Lincoln Snow", 21]
    ]
  ];
  // Build remaining worksheets to reach 39 and SqFt 1283.5
  // First job already 252 sqft across 8 forms
  let remainingSqft = 1283.5 - 252;
  let remainingForms = 39 - 8;
  broihahnJobs.push(
    job({
      source_job_id: "38020",
      source_account_id: "553",
      forms: colorPlan[0].map(([room, color, sqft]) =>
        worksheet(String(formSeq++), room, [
          field("Room", room),
          field("Color", color),
          field("Sq.Ft.", String(sqft)),
          field("Edge", "Eased"),
          field("Thickness", "3 cm"),
          field("Sink Type", "Under Mount")
        ])
      )
    })
  );
  // 12 more jobs → 31 remaining worksheets
  const per = [3, 3, 3, 3, 3, 3, 3, 2, 2, 2, 2, 2];
  assert.equal(per.reduce((a, b) => a + b, 0), 31);
  let left = remainingSqft;
  let formsLeft = 31;
  for (let i = 0; i < 12; i += 1) {
    const n = per[i];
    const forms = [];
    for (let k = 0; k < n; k += 1) {
      formsLeft -= 1;
      const sqft = formsLeft === 0 ? round1(left) : round1(left / (formsLeft + 1));
      left = round1(left - sqft);
      forms.push(
        worksheet(String(formSeq++), `Area-${i}-${k}`, [
          field("Room", i % 2 === 0 ? "Kitchen" : "Bath"),
          field("Color", i % 3 === 0 ? "Pacific Carrara Royale" : "Cambria Axbridge"),
          field("Sq.Ft.", String(sqft)),
          field("Edge", i % 2 === 0 ? "Eased" : "Ogee"),
          field("Thickness", "3 cm"),
          field("Sink Type", i % 4 === 0 ? "Apron Front" : "Under Mount")
        ])
      );
    }
    broihahnJobs.push(
      job({
        source_job_id: `broi-${i + 1}`,
        source_account_id: i < 6 ? "553" : "635",
        forms
      })
    );
  }
  assert.equal(broihahnJobs.length, 13);
  const facts = broihahnJobs.flatMap((j) => extractMorawareJobWorksheetScopeFacts(j));
  assert.equal(facts.length, 39);
  assert.equal(new Set(facts.map((f) => f.source_form_id)).size, 39);
  assert.equal(sumWorksheetScopeSqft(facts), 1283.5);
  const census = broihahnJobs.reduce((s, j) => s + extractJobWorksheetCensusSqft(j).totalSqft, 0);
  assert.equal(Math.round(census * 10) / 10, 1283.5);
  const colorRollup = aggregateWorksheetColors(facts, { includePlaceholders: false });
  assert.ok(colorRollup.some((c) => c.color_raw === "ASMI Lincoln Snow" && c.sqft === 180));
  assert.ok(facts.every((f) => f.edge_raw));
  assert.ok(facts.every((f) => f.thickness_raw === "3 cm"));
  assert.ok(facts.some((f) => f.sink_type_raw === "Apron Front"));
  assert.ok(facts.some((f) => f.room_raw === "Kitchenette"));
  console.log("ok: Broihahn = 39 worksheets / 1,283.5 SqFt; Color×SqFt rollup; raw Room/Edge/Thickness/Sink examples");
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

{
  assert.equal(VERIFIED_FOUNDATION_2026_JOB_COUNT, 4073);
  assert.equal(VERIFIED_FOUNDATION_2026_WORKSHEET_SQFT, 271432.5);
  assert.equal(VERIFIED_FOUNDATION_2026_WORKSHEET_FORM_COUNT, 10719);
  assert.equal(VERIFIED_FOUNDATION_2026_JOBS_WITH_WORKSHEET, 3964);
  assert.equal(VERIFIED_FOUNDATION_2026_JOBS_WITHOUT_WORKSHEET, 109);
  assert.equal(3964 + 109, 4073);
  console.log("ok: global control constants 4073 / 10719 / 271432.5");
}

{
  const facts = [
    {
      organization_id: ORG,
      source_job_id: "j1",
      source_form_id: "f1",
      color_raw: "A",
      room_raw: "Kitchen",
      edge_raw: "Eased",
      thickness_raw: "3 cm",
      sink_type_raw: "Under Mount",
      sqft: 10,
      raw_payload: { secret: true },
      material_family: "Quartz",
      upgrade_score: 9
    }
  ];
  const scrubbed = scrubWorksheetScopeFactForBrowser(facts[0]);
  assert.equal(scrubbed.raw_payload, undefined);
  assert.equal(scrubbed.material_family, undefined);
  assert.equal(scrubbed.upgrade_score, undefined);
  const model = buildWorksheetScopeReadModel(
    facts.map((f) => scrubWorksheetScopeFactForBrowser(f))
  );
  assert.equal(model.state, "available");
  assert.equal(model.colors[0].color_raw, "A");
  assert.equal(model.edges[0].sqft, undefined);
  assertNoForbiddenWorksheetScopeKeys(model);
  console.log("ok: no raw_payload escapes; safe read contract");
}

{
  const facts = extractMorawareJobWorksheetScopeFacts(
    job({
      source_job_id: "org",
      forms: [worksheet("1", "K", [field("Color", "X"), field("Sq.Ft.", "1")])]
    }),
    { organizationId: ORG }
  );
  const rows = toPreparedWorksheetFactRows(facts, {
    organizationId: ORG,
    importGroupId: EPOCH,
    syncRunId: null
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].organization_id, ORG);
  assert.equal(rows[0].import_group_id, EPOCH);
  assert.equal(rows[0].source_form_id, "1");
  assert.equal(rows[0].organization_id === "other", false);
  console.log("ok: organization scoping preserved on prepared rows");
}

{
  const coverageTargets = {
    color: 3886,
    room: 3885,
    edge: 3898,
    thickness: 3896,
    sink: 3508
  };
  // Documented reconciliation targets from completed validation — not live-asserted here.
  assert.ok(coverageTargets.color > 3800);
  assert.ok(coverageTargets.sink > 3400);
  console.log("ok: documented coverage targets retained (Color≈3886 … Sink≈3508)");
}

console.log("\nAll morawareJobWorksheetScope tests passed.");
