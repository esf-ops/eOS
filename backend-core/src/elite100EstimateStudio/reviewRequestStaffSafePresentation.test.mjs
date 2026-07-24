/**
 * Staff-safe review blocker / comparison presentation tests.
 * Run: node backend-core/src/elite100EstimateStudio/reviewRequestStaffSafePresentation.test.mjs
 */
import assert from "node:assert/strict";
import {
  humanizeCatalogToken,
  publicationStateGuidance,
  toPublicBlockerDto,
  toStaffSafeBlocker,
  toStaffSafeComparisonRow
} from "./reviewRequestStaffSafePresentation.mjs";
import { detectUnsupportedSelections } from "./studioReviewRequestService.mjs";
import { presentUnsupportedBlockers } from "./reviewRequestStaffSafePresentation.mjs";

console.log("\nreviewRequestStaffSafePresentation.test.mjs\n");

{
  assert.equal(humanizeCatalogToken("blanco:super-single"), "BLANCO Super Single");
  const sink = toStaffSafeBlocker({
    optionKey: "sink:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa:blanco:super-single",
    code: "invalid_selection",
    message: "Invalid catalog product selection: sink:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa:blanco:super-single"
  });
  assert.match(sink.staffMessage, /BLANCO Super Single|approved catalog/i);
  assert.doesNotMatch(sink.staffMessage, /aaaaaaaa-aaaa|sink:/i);
  assert.equal(sink.blocksApply, true);
  console.log("ok: 6–9 sink catalog blocker is staff-safe");
}

{
  const qty = toStaffSafeBlocker({
    optionKey: "qty-sink:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    code: "unknown_option",
    message: "Option not in server-approved catalog: qty-sink:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
  });
  assert.match(qty.staffMessage, /sink quantity cannot be applied/i);
  assert.doesNotMatch(qty.staffMessage, /bbbbbbbb|qty-sink:/i);
  console.log("ok: qty-sink blocker uses generic useful message");
}

{
  const missing = toStaffSafeBlocker({
    optionKey: "qty-sink:cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    code: "unknown_option"
  });
  assert.ok(missing.staffMessage);
  assert.ok(missing.estimatorAction);
  console.log("ok: missing safe product name still produces useful guidance");
}

{
  const pub = publicationStateGuidance("revoked");
  assert.equal(pub.allowRepublish, false);
  assert.equal(pub.allowSilentReactivate, false);
  assert.match(String(pub.message), /revoked/i);
  assert.match(String(pub.message), /new approved publication/i);

  const superSeded = publicationStateGuidance("superseded", {
    replacementPublicationId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
  });
  assert.equal(superSeded.allowRepublish, false);
  assert.equal(superSeded.newerPublicationRef, "dddddddd");

  const expired = publicationStateGuidance("expired");
  assert.equal(expired.allowRepublish, false);
  assert.match(String(expired.message), /expired/i);
  console.log("ok: 11–13 revoked/superseded/expired publication guidance");
}

{
  const request = {
    request_snapshot_json: {
      selectedOptions: [
        {
          optionKey: "sink:kitchen:esf:not-a-real-product-zzz",
          quantity: 1,
          displayLabel: "Mystery Sink"
        },
        {
          optionKey: "qty-sink:eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
          quantity: 2
        }
      ]
    }
  };
  const raw = detectUnsupportedSelections(request);
  assert.ok(raw.length >= 1);
  assert.ok(raw.some((b) => String(b.message).includes(":") || String(b.optionKey).includes(":")));
  const presented = presentUnsupportedBlockers(raw, request).map(toPublicBlockerDto);
  const payload = JSON.stringify(presented);
  assert.doesNotMatch(payload, /diagnosticOptionKey|eeeeeeee-eeee|optionKey/i);
  assert.ok(presented.every((b) => b.staffMessage && b.estimatorAction));
  console.log("ok: public blocker DTO strips raw keys; diagnostic stays out of HTTP shape");
}

{
  const row = toStaffSafeComparisonRow({
    optionKey: "sink:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa:blanco:super-single",
    displayLabel: "sink:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa:blanco:super-single",
    roomKey: "kitchen",
    baselineSelection: { materialLabel: "Customer-provided sink" },
    requestedSelection: {
      optionKey: "sink:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa:blanco:super-single",
      quantity: 1
    },
    blocked: true
  });
  assert.equal(row.room, "Kitchen");
  assert.equal(row.category, "Sink");
  assert.match(row.requestedSelection, /BLANCO Super Single/i);
  assert.doesNotMatch(row.requestedSelection, /aaaaaaaa-aaaa|sink:/i);
  assert.equal(row.status, "Needs catalog review");
  console.log("ok: selection comparison hides raw option keys");
}

console.log("\nreviewRequestStaffSafePresentation.test.mjs: ok\n");
