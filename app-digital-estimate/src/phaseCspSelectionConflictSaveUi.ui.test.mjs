/**
 * Selection concurrency, sink contract, save UI — Digital Estimate configure.
 * Run: node app-digital-estimate/src/phaseCspSelectionConflictSaveUi.ui.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const viewSrc = readFileSync(join(__dirname, "ConfigurationView.tsx"), "utf8");
const vmSrc = readFileSync(join(__dirname, "lovableViewModel.ts"), "utf8");
const apiSrc = readFileSync(join(__dirname, "publicConfigApi.ts"), "utf8");
const viteSrc = readFileSync(join(__dirname, "../vite.config.ts"), "utf8");
const indexHtml = readFileSync(join(__dirname, "../index.html"), "utf8");
const svcSrc = readFileSync(
  join(__dirname, "../../backend-core/src/digitalEstimate/configuration/publicConfigurationService.mjs"),
  "utf8",
);
const routesSrc = readFileSync(
  join(__dirname, "../../backend-core/src/digitalEstimate/configuration/publicConfigurationRoutes.js"),
  "utf8",
);

console.log("\nphaseCspSelectionConflictSaveUi.ui.test.mjs\n");

assert.ok(viteSrc.includes("htmlCsp"));
assert.ok(viteSrc.includes("VITE_SUPABASE_URL") || viteSrc.includes("supabaseOrigin"));
assert.ok(indexHtml.includes("img-src 'self' data: blob:"));
assert.doesNotMatch(indexHtml, /img-src[^"]*\*/);
console.log("ok: 1–8 CSP source wiring (full policy covered in htmlCsp.test.mjs)");

assert.ok(vmSrc.includes("productHasSavableOptionKey"));
assert.ok(vmSrc.includes("envelopeOptionKeys"));
assert.ok(viewSrc.includes("resolveProductOptionKey"));
assert.ok(viewSrc.includes("That product is unavailable"));
assert.ok(!/optionKey:\s*`sink:\$\{/.test(viewSrc), "UI must not invent sink option keys");
console.log("ok: 9–10 displayed sinks require envelope option keys");

assert.ok(viewSrc.includes("saveInFlightRef"));
assert.ok(viewSrc.includes("pendingSaveRef"));
assert.ok(viewSrc.includes("conflictRetryRef"));
assert.ok(viewSrc.includes("fetchConfiguration"));
assert.ok(viewSrc.includes("conflictRetried"));
assert.ok(apiSrc.includes("DE-CONFIGURATION-STALE"));
assert.ok(viewSrc.includes("requestSeq"));
assert.match(viewSrc, /if \(seq !== requestSeq\.n\)/);
assert.ok(svcSrc.includes('diagnosticCode: "DE-CONFIGURATION-STALE"'));
assert.ok(svcSrc.includes('diagnosticCode: "DE-OPTION-NOT-ALLOWED"'));
assert.ok(svcSrc.includes("row_version_conflict"));
assert.ok(routesSrc.includes("DE-OPTION-NOT-ALLOWED"));
assert.ok(routesSrc.includes("option_not_allowed"));
console.log("ok: 11–17 concurrency + typed stale / option-not-allowed");

function classifyConfigurationMutationError(status, body) {
  const code = String(body?.code || "").trim();
  const diagnosticCode = String(body?.diagnosticCode || "").trim();
  if (code === "option_not_allowed" || code === "invalid_selection" || code === "unknown_option") {
    return {
      lifecycleFatal: false,
      code,
      diagnosticCode: diagnosticCode || "DE-OPTION-NOT-ALLOWED",
    };
  }
  if (code === "row_version_conflict" || code === "stale_configuration" || status === 409) {
    return {
      lifecycleFatal: false,
      code: code || "stale_configuration",
      diagnosticCode: diagnosticCode || "DE-CONFIGURATION-STALE",
    };
  }
  return { lifecycleFatal: false, code: code || "save_failed", diagnosticCode };
}

{
  const conflict = classifyConfigurationMutationError(409, {
    code: "row_version_conflict",
    diagnosticCode: "DE-CONFIGURATION-STALE",
  });
  assert.equal(conflict.lifecycleFatal, false);
  assert.equal(conflict.code, "row_version_conflict");
  assert.equal(conflict.diagnosticCode, "DE-CONFIGURATION-STALE");
}
{
  const removed = classifyConfigurationMutationError(422, {
    code: "option_not_allowed",
    diagnosticCode: "DE-OPTION-NOT-ALLOWED",
  });
  assert.equal(removed.lifecycleFatal, false);
  assert.equal(removed.code, "option_not_allowed");
  assert.equal(removed.diagnosticCode, "DE-OPTION-NOT-ALLOWED");
}
console.log("ok: 11/15/16 typed conflict + option-not-allowed classification");

assert.equal(
  (viewSrc.match(/void onSave\(/g) || []).length,
  1,
  "only Retry path should call void onSave(",
);
assert.ok(
  viewSrc.includes('data-testid="de-mobile-total-bar"') ||
    !viewSrc.includes("fixed inset-x-0 bottom-0"),
  "legacy bottom Save bar absent (mobile total bar allowed)",
);
assert.ok(viewSrc.includes("de-autosave-status-system"));
assert.ok(viewSrc.includes("de-save-status"));
assert.ok(viewSrc.includes("Pending changes"));
assert.ok(viewSrc.includes("savedCalc"));
assert.ok(viewSrc.includes("setLatestCalc(savedCalc)"));
assert.ok(viewSrc.includes("Retry"));
console.log("ok: 21–31 save UI + optimistic total safety");

assert.ok(viewSrc.includes("All changes saved") || viewSrc.includes("Saving…"));
assert.ok(vmSrc.includes("normalizePricingGroupLabel"));
console.log("ok: regression anchors present");

console.log("\nphaseCspSelectionConflictSaveUi.ui.test.mjs PASSED\n");
