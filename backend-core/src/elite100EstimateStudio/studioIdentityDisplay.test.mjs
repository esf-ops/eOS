/**
 * Safe identity display fallbacks.
 * Run: node backend-core/src/elite100EstimateStudio/studioIdentityDisplay.test.mjs
 */
import assert from "node:assert/strict";
import {
  resolveCustomerDisplayLabel,
  resolveProjectDisplayLabel,
  resolveEstimatorDisplayLabel,
  looksLikeRawIdLabel
} from "./studioIdentityDisplay.mjs";

console.log("\nstudioIdentityDisplay.test.mjs\n");

assert.equal(looksLikeRawIdLabel("User 902c8f2c…"), true);
assert.equal(looksLikeRawIdLabel("Acme Cabinets"), false);

{
  const r = resolveCustomerDisplayLabel({
    customerIdentitySnapshot: { accountDisplayName: "Snapshot Co" },
    accountDirectoryDisplayName: "AD Co",
    intakeCustomerName: "Intake Co",
    senderDisplayName: "Sender Name"
  });
  assert.equal(r.label, "Snapshot Co");
  assert.equal(r.source, "estimate_snapshot");
}

{
  const r = resolveCustomerDisplayLabel({
    accountDirectoryDisplayName: "AD Co",
    intakeCustomerName: "Intake Co"
  });
  assert.equal(r.label, "AD Co");
  assert.equal(r.source, "account_directory");
}

{
  const r = resolveCustomerDisplayLabel({ intakeCustomerName: "Intake Co" });
  assert.equal(r.label, "Intake Co");
}

{
  const r = resolveCustomerDisplayLabel({
    senderDisplayName: "Pat Sender",
    customerName: "Unknown"
  });
  assert.equal(r.label, "Pat Sender");
  assert.equal(r.source, "sender_context");
}

{
  const r = resolveCustomerDisplayLabel({
    intakeCustomerName: "pat@example.com",
    senderDisplayName: "pat@example.com"
  });
  assert.equal(r.label, "Customer not identified");
}

{
  const r = resolveProjectDisplayLabel({ projectName: "Kitchen" });
  assert.equal(r.label, "Kitchen");
}
{
  const r = resolveProjectDisplayLabel({ intakeProjectName: "From Intake" });
  assert.equal(r.label, "From Intake");
}
{
  const r = resolveProjectDisplayLabel({});
  assert.equal(r.label, "Project not named");
}
{
  const r = resolveEstimatorDisplayLabel({ assignedEstimatorLabel: "User abcd1234…" });
  assert.equal(r.label, "Unassigned");
}
{
  const r = resolveEstimatorDisplayLabel({ assignedEstimatorLabel: "Chris H" });
  assert.equal(r.label, "Chris H");
}

console.log("\nstudioIdentityDisplay.test.mjs — all passed\n");
