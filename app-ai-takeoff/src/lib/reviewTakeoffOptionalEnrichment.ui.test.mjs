/**
 * Review Takeoff optional enrichment must not blank the core worksheet.
 *
 * Guards:
 * 1) Rules of Hooks — no useEffect after authChecked early return
 * 2) Optional AD / selections / starting-config failures must not call setLoadError
 * 3) Core worksheet + plan testids remain present for legacy / enrichment-absent cases
 *
 * Run: node app-ai-takeoff/src/lib/reviewTakeoffOptionalEnrichment.ui.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const component = readFileSync(join(root, "components/ConsolidatedTakeoffReview.tsx"), "utf8");
const legacyHydration = readFileSync(
  join(root, "../../backend-core/src/elite100QuoteFlow/quoteFlowLegacyHydration.test.mjs"),
  "utf8"
);

console.log("\nreviewTakeoffOptionalEnrichment.ui.test.mjs\n");

const authCheckedIdx = component.indexOf("if (!authChecked)");
assert.ok(authCheckedIdx > 0, "authChecked gate present");
const afterAuthChecked = component.slice(authCheckedIdx);
assert.doesNotMatch(
  afterAuthChecked,
  /\buseEffect\s*\(/,
  "no useEffect after authChecked early return (Rules of Hooks — was blanking Review Takeoff)"
);
assert.match(
  component.slice(0, authCheckedIdx),
  /Best-effort AD suggestions|refresh_suggestions/,
  "AD suggestion effect must be registered before authChecked return"
);
console.log("ok: AD useEffect is above authChecked gate (hooks stable across Loading → signed-in)");

assert.match(component, /data-testid="ctr-worksheet"/);
assert.match(component, /data-testid="ctr-plan-preview"/);
assert.match(component, /data-testid="ctr-split-layout"/);
assert.match(component, /data-testid="consolidated-takeoff-review"/);
console.log("ok: core plan + worksheet testids always present in Review Takeoff shell");

// Optional enrichment failures must not use global setLoadError
const adCatch = component.slice(
  component.indexOf("const postAccountDirectoryLink"),
  component.indexOf("Best-effort AD suggestions")
);
assert.doesNotMatch(adCatch, /setLoadError/);
assert.match(adCatch, /lookupUnavailable/);
console.log("ok: AD link failures do not call setLoadError");

const selectionCatch = component.slice(
  component.indexOf("async function updateRequestedSelectionAction"),
  component.indexOf("async function saveStartingConfigurationPatch")
);
assert.doesNotMatch(selectionCatch, /setLoadError/);
assert.match(selectionCatch, /setOptionalEnrichmentError/);
console.log("ok: requested-selections failures use local optional error, not setLoadError");

const startingCatch = component.slice(
  component.indexOf("async function saveStartingConfigurationPatch"),
  component.indexOf("async function reseedStartingConfiguration") + 800
);
assert.doesNotMatch(
  startingCatch.replace(/setOptionalEnrichmentError/g, "OPTIONAL"),
  /setLoadError/
);
assert.match(startingCatch, /setOptionalEnrichmentError/);
console.log("ok: Starting Configuration failures use local optional error, not setLoadError");

assert.match(component, /data-testid="ctr-optional-enrichment-error"/);
assert.match(component, /AccountDirectoryLinkPanel/);
assert.match(component, /CustomerRequestedSelectionsPanel/);
assert.match(component, /StartingConfigurationPanel/);
console.log("ok: optional panels remain mounted; enrichment errors are local");

// Core workspace load still uses setLoadError
assert.match(component, /Unable to load Takeoff/);
assert.match(
  component,
  /void loadWorkspace\(authToken, takeoffJobId\)\.catch/,
  "core workspace hydrate still reports via setLoadError"
);
console.log("ok: core workspace failure still uses global setLoadError");

// Backend legacy hydration covers metadata-absent cases used by production image001
assert.match(legacyHydration, /legacy takeoff job with none of the new quoteFlow metadata/);
assert.match(legacyHydration, /legacy filename-only job \(image001\)/);
assert.match(legacyHydration, /job with Quote Name only/);
assert.match(legacyHydration, /requested selections but no AD link/);
assert.match(legacyHydration, /AD link but no Starting Configuration/);
assert.match(legacyHydration, /fully populated current job/);
assert.match(legacyHydration, /refresh_suggestions write failure does not throw/);
console.log("ok: legacy metadata cases covered in backend hydration tests");

console.log("\nreviewTakeoffOptionalEnrichment.ui.test.mjs — passed\n");
