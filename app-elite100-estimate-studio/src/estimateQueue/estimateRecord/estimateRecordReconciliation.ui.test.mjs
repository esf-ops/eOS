/**
 * Estimate Record R2 Digital Estimate state + print/screen CSS + vanity label contracts (UI source).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildScenario,
  recalculateCommercialAuthority,
  vanityPackageLabel,
  EXPECTED_COUNTERTOP_SF
} from "../../review/munstermanFixtures.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

console.log("\nestimateRecordReconciliation.ui.test.mjs\n");

{
  assert.equal(vanityPackageLabel("37_S"), "37-inch Single-Bowl Vanity Program");
  const commercialSrc = readFileSync(
    join(root, "src/estimateQueue/estimateRecord/CommercialConfigurationSection.tsx"),
    "utf8"
  );
  assert.match(commercialSrc, /vanityPackageLabel/);
  assert.match(commercialSrc, /eq-preview-adjusted/);
  assert.match(commercialSrc, /Customer amount after/);
  assert.equal(commercialSrc.includes('value={v.applyProgram ? v.selectedProgram ||'), false);
  console.log("ok: vanity human label + adjusted customer preview");
}

{
  const sections = readFileSync(
    join(root, "src/estimateQueue/estimateRecord/EstimateRecordSections.tsx"),
    "utf8"
  );
  assert.match(sections, /eq-de-r1-remains-active/);
  assert.match(sections, /eq-de-r1-active-r2-draft/);
  assert.match(sections, /eq-verified-authority-totals/);
  assert.match(sections, /Verified base estimate/);
  assert.match(sections, /Customer display total/);

  // R1 published + R2 draft must not only show waiting
  const r2 = buildScenario("r2");
  assert.ok(r2.customerUrl);
  assert.equal(r2.measurementsApproved, false);
  assert.equal(r2.showPublishRevised, false);

  const r2Approved = buildScenario("r2-approved");
  assert.equal(r2Approved.measurementsApproved, true);
  assert.equal(r2Approved.showPublishRevised, true);
  console.log("ok: R1/R2 Digital Estimate rendered-state fixtures");
}

{
  const approved = buildScenario("approved");
  assert.equal(approved.aiSummary.measurements.countertopSf, EXPECTED_COUNTERTOP_SF);
  assert.equal(approved.aiSummary.pricing.customerDisplayTotal, 5280);
  const authority = recalculateCommercialAuthority({
    customLines: approved.commercial.customLines,
    percentage: 3,
    active: true,
    vanityApplied: true
  });
  assert.equal(authority.customerDisplayTotal, approved.aiSummary.pricing.customerDisplayTotal);
  console.log("ok: percentage persistence / authoritative total coherence");
}

{
  const deCss = readFileSync(
    join(root, "../app-digital-estimate/src/digitalEstimatePrint.css"),
    "utf8"
  );
  assert.match(deCss, /\.de-print-only/);
  assert.match(deCss, /\.de-screen-only/);
  assert.match(deCss, /@media print[\s\S]*\.de-screen-only/);
  assert.match(deCss, /@media print[\s\S]*\.de-print-only[\s\S]*display:\s*block\s*!important/);
  assert.match(deCss, /display:\s*none/);
  const deMain = readFileSync(
    join(root, "../app-digital-estimate/src/review/digitalEstimateReviewMain.tsx"),
    "utf8"
  );
  assert.match(deMain, /digitalEstimatePrint\.css/);
  console.log("ok: screen-only / print-only CSS wiring");
}

{
  const shot = readFileSync(join(root, "scripts/runEstimateRecordVisualProof.mjs"), "utf8");
  assert.match(shot, /estimate-record-commercial-controls-v3/);
  assert.match(shot, /waitTakeoffReady/);
  assert.match(shot, /Kitchen Island/);
  assert.match(shot, /refusing screenshot/);
  assert.match(shot, /position:\s*static\s*!important/);
  console.log("ok: screenshot iframe-ready + sticky header guard");
}

console.log("\nAll estimateRecordReconciliation UI contracts passed.\n");
