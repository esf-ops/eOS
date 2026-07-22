/**
 * Pricing Setup scope + commercial simplification — UI wiring regression tests.
 *
 * Authority model under test:
 *  - Approved Takeoff  → "Approved physical scope", read-only geometry,
 *    measured vs billed SF, governed estimator adjustments.
 *  - No approved Takeoff → "Manual physical scope" fallback editors.
 *  - Never both simultaneously.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const panel = readFileSync(join(root, "src/estimateQueue/EstimateScopePanel.tsx"), "utf8");

console.log("\nphasePricingSetupSimplification.ui.test.mjs\n");

// 13. Approved Takeoff is recognized from physicalScopeSource alone (summary is
// display data and must not flip authority back to manual).
assert.ok(panel.includes('scope.physicalScopeSource === "takeoff"'));
assert.equal(
  panel.includes('physicalScopeSource === "takeoff" && scope.takeoffScopeSummary'),
  false,
  "authority must not require takeoffScopeSummary presence"
);
console.log("ok: authority = physicalScopeSource only (no summary-presence dependency)");

// 14/15/16. Authority and manual fallback are the two arms of one conditional —
// they can never render simultaneously.
assert.ok(panel.includes("eq-approved-scope-label"));
assert.ok(panel.includes("Approved physical scope."));
assert.ok(panel.includes("eq-manual-scope-label"));
assert.ok(panel.includes("Manual physical scope."));
{
  const approvedIdx = panel.indexOf("eq-approved-scope-summary");
  const manualIdx = panel.indexOf("eq-manual-scope-label");
  const between = panel.slice(approvedIdx, manualIdx);
  assert.ok(
    between.includes(") : ("),
    "approved and manual scope blocks must be exclusive ternary arms"
  );
}
console.log("ok: approved vs manual physical scope render as exclusive branches");

// 2/5. Measured vs billed countertop scope with independent section count.
assert.ok(panel.includes("eq-measured-billed-scope"));
assert.ok(panel.includes("eq-measured-countertop-sf"));
assert.ok(panel.includes("eq-billed-countertop-sf"));
assert.ok(panel.includes("eq-independent-section-count"));
assert.ok(panel.includes("Measured countertop scope"));
assert.ok(panel.includes("Billed countertop scope"));
assert.ok(panel.includes("Independent pricing sections"));
// Display mirrors the same pure module backend pricing uses — no frontend math fork.
assert.ok(panel.includes("buildStudioScopeBilling"));
assert.ok(panel.includes("studioScopeBilling.mjs"));
console.log("ok: measured vs billed scope summary is rendered from the shared governed module");

// 3. Estimator SF adjustment: room-scoped input + required reason.
assert.ok(panel.includes("eq-room-sf-adjustment"));
assert.ok(panel.includes("eq-room-sf-adjustment-reason"));
assert.ok(panel.includes("patchCountertopAdjustment"));
console.log("ok: governed room SF adjustment inputs (value + reason) exist");

// 17. Manual cutout quantity fields render only in the no-Takeoff fallback branch.
assert.ok(panel.includes("eq-manual-cutout-grid"));
assert.ok(panel.includes("eq-derived-cutouts-note"));
{
  const gridIdx = panel.indexOf("eq-manual-cutout-grid");
  const noteIdx = panel.indexOf("eq-derived-cutouts-note");
  assert.ok(noteIdx < gridIdx, "derived note (authority arm) must precede manual grid (fallback arm)");
}
console.log("ok: manual cutout quantities are fallback-only; authority shows derived summary");

// 18. Generic sink product quantity fields are gone from Pricing Setup.
assert.equal(panel.includes("ESF stainless kitchen sink"), false);
assert.equal(panel.includes("Rectangular vanity sink"), false);
assert.equal(panel.includes("Oval vanity sink"), false);
assert.equal(panel.includes('"qty-ss"') && panel.includes('["qty-ss", "ESF'), false);
// Legacy saved quantities surface only as a warning with a clear action.
assert.ok(panel.includes("eq-legacy-product-qty-warning"));
assert.ok(panel.includes("eq-clear-legacy-product-qty"));
console.log("ok: generic sink quantity fields removed; legacy values surface as a clearable warning");

// 8. Customer-selectable catalog permissions + estimator services section.
assert.ok(panel.includes("eq-catalog-permissions"));
assert.ok(panel.includes("eq-catalog-permission-${key}"));
for (const key of ["sink", "faucet", "accessories", "specialty", "edge", "backsplash"]) {
  assert.ok(panel.includes(`["${key}",`), `missing catalog permission key ${key}`);
}
assert.ok(panel.includes("customerCatalogPermissions"));
assert.ok(panel.includes("eq-service-grid"));
assert.ok(panel.includes("Tear-out"));
console.log("ok: catalog permissions + services section replace the zero-filled product row");

// 20/21. Backsplash scope is a read-only Takeoff summary under authority;
// customer chooses the height mode later in the Digital Estimate.
assert.ok(panel.includes("eq-backsplash-scope-summary"));
assert.ok(panel.includes("Backsplash-approved runs:"));
assert.ok(panel.includes("Source: Approved Takeoff"));
assert.ok(panel.includes("eq-room-backsplash-readonly"));
assert.ok(panel.includes("customer chooses No / 4-inch / custom / full height later"));
// Editable geometry fields remain only in the manual fallback arm.
{
  const readonlyIdx = panel.indexOf("eq-room-backsplash-readonly");
  const editorIdx = panel.indexOf('data-testid="eq-backsplash-height-mode"');
  assert.ok(readonlyIdx !== -1 && editorIdx !== -1 && readonlyIdx < editorIdx);
}
console.log("ok: backsplash scope read-only under authority; editors are manual fallback only");

// 22-25. Canonical edge profiles; legacy W/D options are gone.
assert.ok(panel.includes("eq-edge-profile"));
assert.ok(panel.includes("Edge profile (canonical)"));
assert.equal(panel.includes("W edge"), false);
assert.equal(panel.includes("D edge"), false);
assert.equal(panel.includes("Included edges (eased)"), false);
for (const label of ["Eased", "Large Eased", "Full Bullnose", "Large Ogee", "Bevel", "Small Ogee", "Crescent", "Knife"]) {
  assert.ok(panel.includes(`label: "${label}"`), `missing canonical profile ${label}`);
}
console.log("ok: canonical included + premium edge profiles; W/D removed");

// 10. Finished-edge display + governed adjustment; estimator never retypes Edge LF.
assert.ok(panel.includes("eq-edge-derived-lf"));
assert.ok(panel.includes("eq-edge-adjustment"));
assert.ok(panel.includes("eq-edge-adjustment-reason"));
assert.ok(panel.includes("eq-edge-final-lf"));
assert.ok(panel.includes("Approved finished edge"));
assert.ok(panel.includes("independent of backsplash"));
assert.ok(panel.includes("resolveScopeEdgeLinearFeet"));
console.log("ok: approved finished-edge LF + estimator adjustment + final priced edge are wired");

// 12. Miter/build-up: "Not identified in approved scope" + explicit specialty action.
assert.ok(panel.includes("eq-specialty-not-identified"));
assert.ok(panel.includes("Not identified in approved scope"));
assert.ok(panel.includes("eq-add-specialty-fabrication"));
assert.ok(panel.includes("Add specialty fabrication"));
console.log("ok: miter/build-up gated behind explicit specialty-fabrication action under authority");

// 13/14 (custom lines). Ownership + stone categories on custom lines.
assert.ok(panel.includes("eq-custom-line-room"));
assert.ok(panel.includes("eq-custom-line-category"));
assert.ok(panel.includes('"Countertop"'));
assert.ok(panel.includes('"Backsplash"'));
assert.ok(panel.includes("eq-custom-line-customer-visible"));
console.log("ok: custom lines carry ownership (room/project), category, and customer visibility");

// Guardrail: the panel never computes authoritative pricing locally.
assert.equal(panel.includes("materialSubtotal ="), false);
assert.ok(panel.includes("/calculate"));
console.log("ok: pricing stays backend-authoritative (panel only displays calculation results)");

console.log("\nAll Pricing Setup simplification UI tests passed.\n");
