/**
 * Additional-line alias boundary — next-state payloads and round-trips.
 * Run: node app-elite100-estimate-studio/src/estimateQueue/estimateRecord/additionalLinesBoundary.test.mjs
 */
import assert from "node:assert/strict";
import {
  TEAR_OUT_DEFAULT,
  readAdditionalLine,
  writeAdditionalLine,
  writeAdditionalLines,
  additionalLineAmount,
  nextLocalLineId
} from "./additionalLinesBoundary.mjs";
import { normalizeStudioCommercialLine } from "../../../../backend-core/src/elite100EstimateStudio/studioCommercialLines.mjs";

console.log("\nadditionalLinesBoundary.test.mjs\n");

{
  assert.equal(TEAR_OUT_DEFAULT.description, "Tear Out");
  assert.equal(TEAR_OUT_DEFAULT.unitPrice, 750);
  assert.equal(TEAR_OUT_DEFAULT.quantity, 1);
  assert.equal(TEAR_OUT_DEFAULT.role, "charge");
  assert.equal(TEAR_OUT_DEFAULT.customerVisible, true);
  assert.equal(TEAR_OUT_DEFAULT.percentageEligible, true);
  console.log("ok: Tear Out default");
}

{
  const lines = [
    {
      id: "tear",
      description: "Tear Out",
      quantity: 1,
      unitPrice: 750,
      role: "charge",
      customerVisible: true,
      percentageEligible: true,
      internalOnly: false,
      category: "Service",
      roomId: "",
      reason: ""
    },
    {
      id: "crane",
      description: "Crane",
      quantity: 1,
      unitPrice: 350,
      role: "charge",
      customerVisible: true,
      percentageEligible: true,
      internalOnly: false,
      category: "Other",
      roomId: "",
      reason: ""
    }
  ];
  const next = lines.filter((l) => l.id !== "tear");
  const payload = writeAdditionalLines(next);
  assert.equal(payload.length, 1);
  assert.equal(payload[0].name, "Crane");
  assert.equal(
    payload.some((l) => String(l.name || "").toLowerCase().includes("tear")),
    false,
    "remove-line next-state excludes Tear Out"
  );
  console.log("ok: remove-line queues next-state payload without Tear Out");
}

{
  const draft = {
    id: nextLocalLineId("line"),
    description: "Crane",
    quantity: 1,
    unitPrice: 350,
    role: "charge",
    customerVisible: true,
    percentageEligible: true,
    internalOnly: false,
    category: "Other",
    roomId: "kitchen",
    reason: "lift"
  };
  const written = writeAdditionalLine(draft, 0);
  const server = normalizeStudioCommercialLine(written, 0);
  const readBack = readAdditionalLine(server);
  assert.equal(readBack.description, "Crane");
  assert.equal(readBack.unitPrice, 350);
  assert.equal(readBack.customerVisible, true);
  assert.equal(readBack.percentageEligible, true);
  assert.equal(readBack.roomId, "kitchen");
  assert.equal(readBack.role, "charge");
  assert.equal(additionalLineAmount(readBack), 350);
  console.log("ok: line alias round-trip (customerVisible / percentageEligible / roomId)");
}

{
  const credit = writeAdditionalLine(
    {
      id: "cred",
      description: "Discount",
      quantity: 1,
      unitPrice: 100,
      role: "credit",
      customerVisible: true,
      percentageEligible: true,
      internalOnly: false,
      category: "Other",
      roomId: "",
      reason: ""
    },
    0
  );
  const server = normalizeStudioCommercialLine(credit, 0);
  const readBack = readAdditionalLine(server);
  assert.equal(readBack.role, "credit");
  assert.equal(readBack.category, "Discount/Credit");
  assert.equal(additionalLineAmount(readBack), -100);
  console.log("ok: credit sign and server category preserved");
}

console.log("\nadditionalLinesBoundary.test.mjs — passed\n");
