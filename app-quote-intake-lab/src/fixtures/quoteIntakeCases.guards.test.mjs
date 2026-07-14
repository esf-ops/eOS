import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isQuoteIntakeStatus } from "../domain/statuses.mjs";
import { QUOTE_INTAKE_FIXTURE_CASES } from "./quoteIntakeCases.mjs";

const EXAMPLE_EMAIL = /@example\.com$/i;

describe("fixture data guards", () => {
  it("every sender email uses example.com", () => {
    for (const c of QUOTE_INTAKE_FIXTURE_CASES) {
      assert.match(c.senderEmail, EXAMPLE_EMAIL, `${c.id} sender ${c.senderEmail}`);
      assert.match(c.recipientMailbox, EXAMPLE_EMAIL, `${c.id} mailbox`);
    }
  });

  it("no fixture is marked or described as production data", () => {
    for (const c of QUOTE_INTAKE_FIXTURE_CASES) {
      assert.equal(c.dataSource, "fixture");
      const blob = JSON.stringify(c).toLowerCase();
      assert.equal(blob.includes("production data"), false, c.id);
      assert.equal(blob.includes("live customer"), false, c.id);
      assert.ok(
        Array.isArray(c.simulatedLabels) && c.simulatedLabels.length > 0,
        `${c.id} should declare simulated labels`
      );
    }
  });

  it("every case uses a valid qil_ status", () => {
    for (const c of QUOTE_INTAKE_FIXTURE_CASES) {
      assert.ok(isQuoteIntakeStatus(c.status), `${c.id} ${c.status}`);
    }
  });

  it("covers required business situations", () => {
    const byStatus = new Set(QUOTE_INTAKE_FIXTURE_CASES.map((c) => c.status));
    for (const required of [
      "qil_received",
      "qil_classifying",
      "qil_takeoff_processing",
      "qil_ready_for_review",
      "qil_needs_information",
      "qil_needs_manual_takeoff",
      "qil_not_elite_100",
      "qil_in_review",
      "qil_approved_lab_quote",
      "qil_ready_to_send_lab",
      "qil_sent_simulated",
      "qil_failed",
      "qil_processing_attachments"
    ]) {
      assert.ok(byStatus.has(required), `missing status fixture: ${required}`);
    }

    assert.ok(
      QUOTE_INTAKE_FIXTURE_CASES.some((c) => c.missingInformation.includes("requested_elite_100_color")),
      "missing Elite 100 color case"
    );
    assert.ok(
      QUOTE_INTAKE_FIXTURE_CASES.some((c) => c.missingInformation.includes("edge_profile")),
      "missing edge profile case"
    );
    assert.ok(
      QUOTE_INTAKE_FIXTURE_CASES.some((c) => c.missingInformation.includes("countertop_measurements")),
      "unreadable measurements case"
    );
    assert.ok(
      QUOTE_INTAKE_FIXTURE_CASES.some((c) => c.relatedCaseId),
      "revision / related case fixture"
    );
    assert.ok(
      QUOTE_INTAKE_FIXTURE_CASES.some((c) => (c.sinkCutoutCount ?? 0) >= 3),
      "multiple sink cutouts case"
    );
  });
});
