import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ageBucket, elapsedMs, formatTurnaround } from "./age.mjs";
import { buildStatusCounts, filterQuoteIntakeCases } from "./filters.mjs";
import { QUOTE_INTAKE_STATUSES, statusLabel, summaryBucketForStatus } from "./statuses.mjs";

const AS_OF = "2026-07-14T15:00:00.000Z";

const sample = [
  {
    id: "a",
    status: "qil_received",
    priority: "high",
    receivedAt: "2026-07-14T14:00:00.000Z",
    assignedSalesperson: "Jordan Blake",
    assignedEstimator: null,
    customerAccount: "Acme",
    projectName: "Alpha",
    projectAddress: "1 Main",
    senderName: "A",
    senderEmail: "a@example.com",
    emailSubject: "Hello",
    emailExcerpt: "world",
    requestedColor: "Calacatta Mira",
    resolvedPriceGroup: "Group B",
    recipientMailbox: "sales@example.com",
    missingInformation: []
  },
  {
    id: "b",
    status: "qil_needs_information",
    priority: "urgent",
    receivedAt: "2026-07-13T15:00:00.000Z",
    assignedSalesperson: "Casey Morgan",
    assignedEstimator: "Alex Rivera",
    customerAccount: "Beta Co",
    projectName: "Beta Kitchen",
    projectAddress: "2 Oak",
    senderName: "B",
    senderEmail: "b@example.com",
    emailSubject: "Need color",
    emailExcerpt: "missing color",
    requestedColor: null,
    resolvedPriceGroup: null,
    recipientMailbox: "estimates@example.com",
    missingInformation: ["requested_elite_100_color"]
  },
  {
    id: "c",
    status: "qil_ready_for_review",
    priority: "normal",
    receivedAt: "2026-07-11T15:00:00.000Z",
    assignedSalesperson: "Jordan Blake",
    assignedEstimator: "Alex Rivera",
    customerAccount: "Gamma",
    projectName: "Gamma",
    projectAddress: "3 Pine",
    senderName: "C",
    senderEmail: "c@example.com",
    emailSubject: "Ready",
    emailExcerpt: "ok",
    requestedColor: "Moonstone",
    resolvedPriceGroup: "Group A",
    recipientMailbox: "sales@example.com",
    missingInformation: []
  }
];

describe("statuses", () => {
  it("exposes namespaced qil_ statuses", () => {
    assert.ok(QUOTE_INTAKE_STATUSES.every((s) => s.startsWith("qil_")));
    assert.equal(statusLabel("qil_ready_for_review"), "Ready for review");
    assert.equal(summaryBucketForStatus("qil_classifying"), "processing");
  });
});

describe("age / turnaround", () => {
  it("formats elapsed turnaround", () => {
    assert.equal(formatTurnaround("2026-07-14T14:00:00.000Z", AS_OF), "1h");
    assert.equal(formatTurnaround("2026-07-14T14:37:00.000Z", AS_OF), "23m");
    assert.equal(formatTurnaround("2026-07-13T15:00:00.000Z", AS_OF), "1d");
    assert.equal(formatTurnaround("bad", AS_OF), "—");
  });

  it("classifies age buckets", () => {
    assert.equal(ageBucket("2026-07-14T14:00:00.000Z", AS_OF), "under_4h");
    assert.equal(ageBucket("2026-07-13T16:00:00.000Z", AS_OF), "under_24h");
    assert.equal(ageBucket("2026-07-12T14:00:00.000Z", AS_OF), "under_3d");
    assert.equal(ageBucket("2026-07-01T15:00:00.000Z", AS_OF), "over_3d");
  });

  it("computes elapsed ms", () => {
    assert.equal(elapsedMs("2026-07-14T14:00:00.000Z", AS_OF), 3600000);
  });
});

describe("filters and counts", () => {
  it("filters by search", () => {
    const rows = filterQuoteIntakeCases(sample, { search: "beta kitchen" }, AS_OF);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, "b");
  });

  it("filters by status", () => {
    const rows = filterQuoteIntakeCases(sample, { status: "qil_ready_for_review" }, AS_OF);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, "c");
  });

  it("filters by missing information", () => {
    const missing = filterQuoteIntakeCases(sample, { missingInfo: "has_missing" }, AS_OF);
    assert.equal(missing.length, 1);
    assert.equal(missing[0].id, "b");
    const none = filterQuoteIntakeCases(sample, { missingInfo: "none_missing" }, AS_OF);
    assert.equal(none.length, 2);
  });

  it("filters by priority", () => {
    const rows = filterQuoteIntakeCases(sample, { priority: "urgent" }, AS_OF);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, "b");
  });

  it("builds status counts", () => {
    const counts = buildStatusCounts(sample);
    assert.equal(counts.total, 3);
    assert.equal(counts.new, 1);
    assert.equal(counts.missing_information, 1);
    assert.equal(counts.ready_for_review, 1);
  });
});
