/**
 * Public Digital Estimate premium presentation contracts.
 * Run: node --experimental-strip-types app-digital-estimate/src/phasePublicDigitalEstimatePremiumUi.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const view = readFileSync(join(here, "ConfigurationView.tsx"), "utf8");
const theme = readFileSync(join(here, "lovable-theme.css"), "utf8");

console.log("\nphasePublicDigitalEstimatePremiumUi.test.ts\n");

assert.match(theme, /--primary:\s*oklch\(0\.48/);
assert.match(theme, /\.de-premium-page/);
assert.match(theme, /\.de-premium-card/);
assert.match(theme, /\.de-brand-mark/);
assert.match(view, /de-premium-page/);
assert.match(view, /de-premium-card/);
assert.match(view, /de-brand-mark/);
assert.match(view, /Elite Stone Fabrication/);
assert.match(view, /data-testid="de-compact-header"/);
assert.match(view, /data-testid="de-estimate-panel"/);
assert.match(view, /data-testid="de-updated-total"/);
assert.match(view, /data-testid="de-mobile-total-bar"/);
assert.match(view, /bg-primary/);
assert.match(view, /Accept estimate with these selections/);
assert.match(view, /Your selections have been sent to Elite/);
assert.match(view, /This estimate has been accepted/);
assert.match(view, /Needs Elite review/);
assert.match(view, /Updates as you choose options/);
assert.match(view, /This link has been replaced by a newer estimate/);
assert.match(view, /This estimate link has expired/);
assert.doesNotMatch(view, /No ESF \{role\} options/);
assert.doesNotMatch(view, /Totals calculated by your estimator\s+system/);
// Customer-visible string literals must not leak internal jargon
const uiLiterals = [...view.matchAll(/["'`]([^"'`]{8,200})["'`]/g)].map((m) => m[1]);
const leak = uiLiterals.find((s) =>
  /pricing engine|customer configuration foundation|configured acceptance|revision required/i.test(s),
);
assert.equal(leak, undefined, `customer UI literal leak: ${leak}`);
// Logic anchors still present
assert.match(view, /saveConfigurationSelections/);
assert.match(view, /submitFinalAcceptance/);
assert.match(view, /submitReviewRequest/);
assert.match(view, /window\.print\(\)/);
assert.match(view, /dedupePlumbingFinishVariants/);
assert.match(view, /de-screen-root de-no-print/);
assert.match(view, /de-print-root/);
assert.match(view, /data-testid="de-save-error-dismiss"/);
console.log("ok: premium presentation + protected logic anchors");

console.log("\nphasePublicDigitalEstimatePremiumUi.test.ts: ok\n");
