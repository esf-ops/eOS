/**
 * Pricing Setup / Customer Choices commercial simplification — UI wiring
 * regression tests.
 *
 * Active-v4 authority model under test:
 *  - The canonical ManualPhysicalScopeEditor (mounted once, above this panel,
 *    for both manual and AI-assisted estimates) is the single Scope editor +
 *    summary. This panel must not render a second "Approved physical scope" /
 *    "Manual physical scope" read model of the same rooms/pieces/edge/
 *    backsplash facts (that dual-branch duplication is what caused the
 *    "editor shows 46.25 SF, summary shows 0" regression).
 *  - Customer/estimator-only commercial controls (Account Directory, trusted
 *    partner, services, custom lines, specialty fabrication, internal markup,
 *    notes, troubleshooting save) live in one collapsed "Advanced estimator
 *    pricing" section, not scattered across the primary Customer Choices view.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const panel = readFileSync(join(root, "src/estimateQueue/EstimateScopePanel.tsx"), "utf8");

console.log("\nphasePricingSetupSimplification.ui.test.mjs\n");

// Approved Takeoff is recognized from physicalScopeSource alone (summary is
// display data and must not flip authority back to manual).
assert.ok(panel.includes('scope.physicalScopeSource === "takeoff"'));
assert.equal(
  panel.includes('physicalScopeSource === "takeoff" && scope.takeoffScopeSummary'),
  false,
  "authority must not require takeoffScopeSummary presence"
);
console.log("ok: authority = physicalScopeSource only (no summary-presence dependency)");

// The old "Approved physical scope" / "Manual physical scope" dual-branch
// read model is gone from active rendering — replaced by a single hint
// pointing at the canonical editor mounted above this panel.
assert.doesNotMatch(panel, /eq-approved-scope-label/);
assert.doesNotMatch(panel, /Approved physical scope\./);
assert.doesNotMatch(panel, /eq-manual-scope-label/);
assert.doesNotMatch(panel, /eq-measured-billed-scope/);
assert.doesNotMatch(panel, /eq-manual-cutout-grid/);
assert.ok(panel.includes("eq-scope-canonical-hint"));
console.log("ok: legacy approved/manual physical-scope dual branches removed; single canonical hint remains");

// Generic sink product quantity fields are gone from Customer Choices.
assert.equal(panel.includes("ESF stainless kitchen sink"), false);
assert.equal(panel.includes("Rectangular vanity sink"), false);
assert.equal(panel.includes("Oval vanity sink"), false);
assert.equal(panel.includes('"qty-ss"') && panel.includes('["qty-ss", "ESF'), false);
// Legacy saved quantities surface only as a warning with a clear action.
assert.ok(panel.includes("eq-legacy-product-qty-warning"));
assert.ok(panel.includes("eq-clear-legacy-product-qty"));
console.log("ok: generic sink quantity fields removed; legacy values surface as a clearable warning");

// Customer selections summary replaces the old per-category checkbox
// whitelist as the normal-view content; the checkbox whitelist itself is
// compatibility-only (collapsed, not part of the customer-facing summary).
assert.ok(panel.includes("eq-customer-selections-summary"));
assert.ok(panel.includes("Customer selections"));
assert.ok(panel.includes("The customer can choose active Elite 100 materials"));
assert.ok(panel.includes("eq-compat-catalog-permissions"));
assert.ok(panel.includes("eq-catalog-permissions"));
assert.ok(panel.includes("eq-catalog-permission-${key}"));
for (const key of ["sink", "faucet", "accessories", "specialty", "edge", "backsplash"]) {
  assert.ok(panel.includes(`["${key}",`), `missing catalog permission key ${key}`);
}
assert.ok(panel.includes("customerCatalogPermissions"));
console.log("ok: concise Customer selections summary is primary; catalog checkbox whitelist is compatibility-only");

// Advanced estimator pricing: Account Directory, trusted partner, services,
// custom lines, specialty fabrication, internal markup, notes, and
// troubleshooting save controls are collapsed into one section.
assert.ok(panel.includes('data-testid="eq-advanced-estimator-pricing"'));
assert.ok(panel.includes("Advanced estimator pricing"));
{
  const advIdx = panel.indexOf('data-testid="eq-advanced-estimator-pricing"');
  // The Advanced section itself contains a nested details (Advanced Pricing —
  // charges/discounts/credits); bound the search past that nested block's own
  // close so we capture the full outer section, not just the inner one.
  const saveDraftIdx = panel.indexOf("eq-compat-save-draft", advIdx);
  const advCloseIdx = panel.indexOf("</details>", saveDraftIdx);
  assert.ok(
    advIdx !== -1 && saveDraftIdx !== -1 && advCloseIdx !== -1,
    "Advanced estimator pricing details must open and close around save controls"
  );
  const advBody = panel.slice(advIdx, advCloseIdx);
  for (const marker of [
    "StudioAccountDirectoryPanel",
    "eq-partner-account-search",
    "eq-service-grid",
    "Tear-out",
    "eq-custom-lines",
    "eq-specialty-not-identified",
    "Internal markup",
    "Estimator notes",
    "eq-compat-save-draft"
  ]) {
    assert.ok(advBody.includes(marker), `Advanced estimator pricing section missing ${marker}`);
  }
}
console.log("ok: Account Directory/trusted partner/services/custom lines/specialty/markup/notes/save are one collapsed Advanced section");

// Canonical edge profiles (visible, not buried in Advanced); legacy W/D
// options are gone.
{
  const advIdx = panel.indexOf('data-testid="eq-advanced-estimator-pricing"');
  const edgeIdx = panel.indexOf("eq-edge-profile");
  assert.ok(edgeIdx !== -1 && edgeIdx < advIdx, "Edge profile must render before/outside the collapsed Advanced section");
}
assert.ok(panel.includes("eq-edge-profile"));
assert.ok(panel.includes("Edge profile (canonical)"));
assert.equal(panel.includes("W edge"), false);
assert.equal(panel.includes("D edge"), false);
assert.equal(panel.includes("Included edges (eased)"), false);
for (const label of ["Eased", "Large Eased", "Full Bullnose", "Large Ogee", "Bevel", "Small Ogee", "Crescent", "Knife"]) {
  assert.ok(panel.includes(`label: "${label}"`), `missing canonical profile ${label}`);
}
console.log("ok: canonical included + premium edge profiles render outside Advanced; W/D removed");

// Finished-edge display + governed adjustment; estimator never retypes Edge LF.
assert.ok(panel.includes("eq-edge-derived-lf"));
assert.ok(panel.includes("eq-finished-edge-override"));
assert.ok(panel.includes("eq-edge-adjustment"));
assert.ok(panel.includes("eq-edge-adjustment-reason"));
assert.ok(panel.includes("eq-edge-final-lf"));
assert.ok(panel.includes("Approved finished edge"));
assert.ok(panel.includes("independent of backsplash"));
assert.ok(panel.includes("resolveScopeEdgeLinearFeet"));
console.log("ok: approved finished-edge LF + estimator adjustment + final priced edge are wired");

// Miter/build-up: "Not identified in approved scope" + explicit specialty action.
assert.ok(panel.includes("eq-specialty-not-identified"));
assert.ok(panel.includes("Not identified in approved scope"));
assert.ok(panel.includes("eq-add-specialty-fabrication"));
assert.ok(panel.includes("Add specialty fabrication"));
console.log("ok: miter/build-up gated behind explicit specialty-fabrication action under authority");

// Custom lines carry ownership (room/project) and category.
assert.ok(panel.includes("eq-custom-line-room"));
assert.ok(panel.includes("eq-custom-line-category"));
assert.ok(panel.includes('"Countertop"'));
assert.ok(panel.includes('"Backsplash"'));
console.log("ok: custom lines carry ownership (room/project) and category");

// Guardrail: the panel never computes authoritative pricing locally.
assert.equal(panel.includes("materialSubtotal ="), false);
assert.ok(panel.includes("/calculate"));
console.log("ok: pricing stays backend-authoritative (panel only displays calculation results)");

console.log("\nAll Pricing Setup simplification UI tests passed.\n");
