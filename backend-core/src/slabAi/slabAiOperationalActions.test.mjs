/**
 * Phase 5 operational action unit tests (Brain side).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { toAiAccountListItem, toAiAccountSummary } from "./slabAiAccountActions.mjs";
import { toAiMaterialSummary } from "./slabAiInventoryActions.mjs";

describe("AI account DTOs", () => {
  it("builds disambiguation labels with location", () => {
    const item = toAiAccountListItem({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      displayName: "ABC Builders",
      city: "Cedar Rapids",
      state: "IA",
      status: "Active",
    });
    assert.equal(item.accountName, "ABC Builders");
    assert.equal(item.label, "ABC Builders — Cedar Rapids, IA");
    assert.equal(Object.prototype.hasOwnProperty.call(item, "raw"), false);
  });

  it("summary omits financial embed and keeps staff-safe facts", () => {
    const summary = toAiAccountSummary({
      account: {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        displayName: "ABC Builders",
        status: "Active",
        accountType: "Builder",
        branch: "Cedar",
        salesperson: "Pat",
      },
      relationship: {
        moraware: {
          jobs_state: "available",
          job_count_2026: 3,
          recent_jobs: [{ source_job_id: "78342", job_name: "Kitchen", status_name: "Template Complete" }],
        },
        estimates: { internal: { items: [{ quote_number: "ESF-1", status: "sent", grand_total: 5000 }] } },
        health: { signals: [{ code: "ok", label: "Healthy", severity: "info" }] },
      },
      retrievedAt: "2026-09-22T12:00:00.000Z",
    });
    assert.equal(summary.accountId, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    assert.equal(summary.recentJobs[0].jobId, "78342");
    assert.equal(summary.recentQuotes[0].recordedTotal, 5000);
    assert.equal(summary.sourceSystem, "account_directory");
    assert.equal(Object.prototype.hasOwnProperty.call(summary, "quickbooks"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(summary, "credentials"), false);
  });
});

describe("AI inventory DTOs", () => {
  it("exposes dimensions without inventing quantity", () => {
    const m = toAiMaterialSummary(
      {
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        inventory_id: "INV-1",
        color_name: "Taj Mahal",
        material_name: "Quartzite",
        thickness_nominal: "3cm",
        width_actual_in: 60,
        length_actual_in: 120,
        rack: "A1",
        external_source: "slabcloud",
        is_active: true,
        source_inventory_type: "remnant",
      },
      "2026-09-22T12:00:00.000Z"
    );
    assert.equal(m.dimensions, '60" × 120"');
    assert.equal(m.isRemnant, true);
    assert.match(m.freshnessNote, /sync cache/i);
    assert.equal(Object.prototype.hasOwnProperty.call(m, "quantity"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(m, "unit_cost"), false);
  });
});

describe("permission intersection contract", () => {
  it("exports requireDomainHead and userMayAccessHead", async () => {
    const mod = await import("./slabAiPermissionIntersection.mjs");
    assert.equal(typeof mod.requireDomainHead, "function");
    assert.equal(typeof mod.userMayAccessHead, "function");
  });

  it("denies unknown head slug", async () => {
    const { userMayAccessHead } = await import("./slabAiPermissionIntersection.mjs");
    const result = await userMayAccessHead({
      db: {},
      user: { id: "u1", role: "viewer" },
      headSlug: "not_a_real_head_xyz",
    });
    assert.equal(result.allowed, false);
    assert.equal(result.reason, "unknown_head");
  });
});
