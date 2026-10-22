/**
 * Phase 0 — Quote ↔ QuickBooks catalog foundation tests.
 * No QuickBooks I/O. No EstimateAdd.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  QUOTE_QB_STRONG_MATCH_SEEDS,
  QUOTE_QB_PRICING_SOURCES,
  inferConceptKeyFromLineItem,
  listStrongMatchSeedsForOrganization,
  resolveQbItemMapping
} from "./quoteQbCatalog/quoteQbItemMappingCatalog.js";
import {
  QB_TEST_QUOTE_PREFIX,
  validateQbWriteSafetyGate,
  executeQbWriteQueueItem,
  claimQbWriteQueueItem,
  FORBIDDEN_QB_WRITE_PHASE0_APIS
} from "./quoteQbCatalog/quoteQbWriteSafety.js";
import { buildQbWriteQueueRowPreview, hashQbWritePayload } from "./quoteQbCatalog/quoteQbWriteQueue.js";
import {
  buildQuickBooksEntryDocPayload,
  hashCalculationSnapshot
} from "./quoteLibraryHandoffPayloads.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlPath = join(__dirname, "../../supabase/eliteos_quote_qb_item_mapping_and_write_queue_v1.sql");

test("strong-match seeds cover required concepts with ListIDs and pricing_admin source", () => {
  const keys = QUOTE_QB_STRONG_MATCH_SEEDS.map((s) => s.eliteos_concept_key);
  for (const required of [
    "tear_out",
    "cooktop_cutout",
    "electrical_outlet_cutout",
    "kitchen_sink_cutout",
    "vanity_bar_sink_cutout",
    "vanity_sink_cutout",
    "waterfall",
    "polish_waterfall_backside",
    "popup_outlet_cutout"
  ]) {
    assert.ok(keys.includes(required), `missing seed ${required}`);
  }
  for (const seed of QUOTE_QB_STRONG_MATCH_SEEDS) {
    assert.ok(seed.qb_list_id.startsWith("8000"), `ListID shape ${seed.eliteos_concept_key}`);
    assert.equal(seed.pricing_source, "eliteos_pricing_admin");
    assert.ok(QUOTE_QB_PRICING_SOURCES.includes(seed.pricing_source));
    assert.equal(seed.organization_key, "elite_stone_fabrication");
  }
  assert.equal(listStrongMatchSeedsForOrganization("other_org").length, 0);
  assert.equal(listStrongMatchSeedsForOrganization("elite_stone_fabrication").length, 9);
});

test("resolveQbItemMapping uses ListID identity", () => {
  const m = resolveQbItemMapping("tear_out", QUOTE_QB_STRONG_MATCH_SEEDS);
  assert.equal(m.qb_list_id, "8000005C-1327168522");
  assert.equal(m.qb_full_name, "Tear Out");
  assert.equal(resolveQbItemMapping("stock_blanco", QUOTE_QB_STRONG_MATCH_SEEDS), null);
});

test("inferConceptKeyFromLineItem maps calculator codes", () => {
  assert.equal(inferConceptKeyFromLineItem({ item_code: "tearout" }), "tear_out");
  assert.equal(inferConceptKeyFromLineItem({ item_code: "qty-cook" }), "cooktop_cutout");
  assert.equal(inferConceptKeyFromLineItem({ item_code: "qty-sink" }), "kitchen_sink_cutout");
  assert.equal(inferConceptKeyFromLineItem({ item_name: "Kitchen sink cutout" }), "kitchen_sink_cutout");
});

test("buildQuickBooksEntryDocPayload v2 enriches mapped lines and preserves legacy fields", () => {
  const header = {
    id: "11111111-1111-4111-8111-111111111111",
    quote_number: "DYR-000042",
    revision_number: 2,
    revision_label: "R2",
    organization_id: "89180433-9fab-4024-bec9-a14d870bd0a8",
    account_directory_account_id: "22222222-2222-4222-8222-222222222222",
    account_name: "Acme Builder",
    customer_name: "Acme Builder",
    customer_email: "a@example.com",
    project_name: "Kitchen Remodel",
    city: "Dyersville",
    state: "IA",
    branch: "Dyersville",
    sales_rep: "Casey",
    prepared_by: "Estimator",
    grand_total: 5000,
    subtotal: 5000,
    markup_total: 0,
    tax_total: 0
  };
  const snapshot = {
    totals: { retail: 5000 },
    internal_ui: {
      internal_material_basis: "wholesale",
      custom_line_items: [
        {
          name: "Tear Out Needed",
          category: "Labor",
          quantity: 1,
          unitPrice: 750,
          customerFacing: true,
          description: "Remove old tops"
        }
      ]
    },
    material_breakdown: []
  };
  const lines = [
    {
      item_name: "Kitchen sink cutout",
      category: "cutout",
      item_code: "qty-sink",
      quantity: 1,
      unit_price: 200,
      line_subtotal: 200
    },
    {
      item_name: "Cooktop cutout",
      category: "cutout",
      item_code: "qty-cook",
      quantity: 1,
      unit_price: 150,
      line_subtotal: 150
    }
  ];

  const payload = buildQuickBooksEntryDocPayload(header, snapshot, lines, {
    organizationId: header.organization_id,
    organizationKey: "elite_stone_fabrication"
  });

  assert.equal(payload.doc_version, 2);
  assert.equal(payload.doc_type, "quickbooks_entry");
  assert.equal(payload.quote_id, header.id);
  assert.equal(payload.quote_number, "DYR-000042");
  assert.equal(payload.revision, 2);
  assert.equal(payload.organization_id, header.organization_id);
  assert.equal(payload.account_directory_id, header.account_directory_account_id);
  assert.equal(payload.qb_write_enabled, false);
  assert.ok(payload.calculation_snapshot_hash);
  assert.equal(payload.operations.branch, "Dyersville");
  assert.equal(payload.operations.salesperson, "Casey");
  assert.equal(payload.line_items_summary.length, 2);
  assert.equal(payload.line_items_summary[0].qty, 1);
  assert.equal(payload.line_items_summary[0].mapped_qb_list_id, "8000006D-1327168526");
  assert.equal(payload.line_items_summary[0].mapped_qb_full_name, "Undermount Sink Cutout");
  assert.equal(payload.line_items_summary[0].pricing_source, "eliteos_pricing_admin");
  assert.equal(payload.line_items_summary[0].eliteos_concept_key, "kitchen_sink_cutout");
  assert.equal(payload.line_items_summary[1].mapped_qb_list_id, "80000023-1327168507");
  assert.ok(Array.isArray(payload.financials.custom_line_items));
  assert.equal(payload.financials.custom_line_items_enriched[0].mapped_qb_list_id, "8000005C-1327168522");
  assert.equal(payload.estimate_candidate_lines[0].amount, 200);
  assert.match(payload.notes, /future-only/i);

  const otherOrg = buildQuickBooksEntryDocPayload(header, snapshot, lines, {
    organizationKey: "some_other_fabricator"
  });
  assert.equal(otherOrg.line_items_summary[0].mapped_qb_list_id, null);
  assert.equal(otherOrg.qb_mapping_source, "none");
});

test("hashCalculationSnapshot is stable for same input", () => {
  const a = hashCalculationSnapshot({ x: 1 });
  const b = hashCalculationSnapshot({ x: 1 });
  assert.equal(a, b);
  assert.notEqual(a, hashCalculationSnapshot({ x: 2 }));
});

test("validateQbWriteSafetyGate enforces test-only contracts", () => {
  const bad = validateQbWriteSafetyGate({
    writeEnvironment: "production",
    quoteNumber: "DYR-1",
    companyIdentity: "Elite Stone Fabrications",
    allowedCompanyIdentities: ["Elite Stone TEST"],
    idempotencyKey: "",
    existingQueueStatus: "succeeded",
    rejectProductionCompany: true
  });
  assert.equal(bad.ok, false);
  const codes = bad.errors.map((e) => e.code);
  assert.ok(codes.includes("QB_WRITE_ENV_NOT_TEST"));
  assert.ok(codes.includes("QB_TEST_QUOTE_PREFIX_REQUIRED"));
  assert.ok(codes.includes("QB_COMPANY_NOT_ALLOWLISTED"));
  assert.ok(codes.includes("QB_IDEMPOTENCY_KEY_REQUIRED"));
  assert.ok(codes.includes("QB_QUEUE_ALREADY_SUCCEEDED"));

  const good = validateQbWriteSafetyGate({
    writeEnvironment: "test",
    quoteNumber: `${QB_TEST_QUOTE_PREFIX}0001`,
    companyIdentity: "Elite Stone TEST Company",
    allowedCompanyIdentities: ["Elite Stone TEST Company"],
    idempotencyKey: "org:quote:EstimateAdd:v1",
    existingQueueStatus: "pending",
    rejectProductionCompany: true
  });
  assert.equal(good.ok, true);
});

test("Phase 0 write executors throw; queue preview is non-executing", () => {
  assert.throws(() => executeQbWriteQueueItem({}), /Phase 0|disabled/i);
  assert.throws(() => claimQbWriteQueueItem({}), /Phase 0|disabled/i);
  assert.ok(FORBIDDEN_QB_WRITE_PHASE0_APIS.includes("EstimateAdd"));

  const preview = buildQbWriteQueueRowPreview({
    organizationId: "89180433-9fab-4024-bec9-a14d870bd0a8",
    quoteId: "11111111-1111-4111-8111-111111111111",
    quoteNumber: "QBTEST-0001",
    idempotencyKey: "test-key-1",
    requestPayload: { lines: [] },
    companyIdentity: "Elite Stone TEST Company",
    allowedCompanyIdentities: ["Elite Stone TEST Company"]
  });
  assert.equal(preview.execution_enabled, false);
  assert.equal(preview.preview_only, true);
  assert.equal(preview.safety.ok, true);
  assert.equal(preview.row.status, "pending");
  assert.equal(preview.row.payload_hash, hashQbWritePayload({ lines: [] }));
});

test("SQL foundation file defines mapping + queue tables and no EstimateAdd senders", () => {
  const sql = readFileSync(sqlPath, "utf8");
  assert.match(sql, /create table if not exists public\.quote_qb_item_mappings/i);
  assert.match(sql, /create table if not exists public\.quote_qb_write_queue/i);
  assert.match(sql, /eliteos_pricing_admin/);
  assert.match(sql, /8000005C-1327168522/);
  assert.match(sql, /DO NOT auto-apply/i);
  assert.doesNotMatch(sql, /EstimateAddRq/i);
});
