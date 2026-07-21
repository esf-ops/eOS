/**
 * Items for later grouping unit tests.
 * Run: node --experimental-strip-types app-digital-estimate/src/itemsForLater.test.ts
 */
import assert from "node:assert/strict";
import {
  groupMissingInformationRequirements,
  missingInfoHeadline,
} from "./itemsForLater.ts";

const groups = groupMissingInformationRequirements([
  {
    code: "sink_model",
    customerCopy: "Sink model needed before fabrication for Kitchen",
    roomKey: "kitchen",
    roomName: "Kitchen",
    timing: "before_fabrication",
  },
  {
    code: "sink_model",
    customerCopy: "Sink model needed before fabrication for Coffee Bar",
    roomKey: "coffee",
    roomName: "Coffee Bar",
    timing: "before_fabrication",
  },
  {
    code: "phone",
    customerCopy: "Confirm phone number",
    optional: true,
  },
]);

assert.equal(groups.length, 2);
assert.equal(groups[0].rooms.length, 2);
assert.equal(missingInfoHeadline(groups), "3 details are still needed before fabrication");
console.log("ok: itemsForLater grouping\n");
