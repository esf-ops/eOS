/**
 * ConfigurationView runtime / autosave / side-splash polish contracts.
 * Run: node app-digital-estimate/src/phaseOptionRuntime.ui.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const view = readFileSync(join(__dirname, "ConfigurationView.tsx"), "utf8");
const vm = readFileSync(join(__dirname, "lovableViewModel.ts"), "utf8");
const api = readFileSync(join(__dirname, "publicConfigApi.ts"), "utf8");

assert.equal(view.includes("productNote"), false, "productNote must not be referenced");
assert.ok(view.includes("projectNote"), "projectNote must be saved");
assert.ok(view.includes("ConfiguratorErrorBoundary"));
assert.ok(view.includes("We couldn’t save that change. Please try again."));
assert.ok(view.includes("All changes saved") || view.includes("Couldn't save — Retry"));
assert.ok(!view.includes('"Save selections"'), "permanent Save selections CTA removed");
assert.ok(view.includes("AccessoriesOrSpecialtyModal"));
assert.ok(view.includes("Sink accessories"));
// Pre-existing drift found during the production polish phase: this assertion previously
// required an exact-case "Plumbing add-ons" substring that never matched the shipped
// "Faucet and plumbing add-ons" section header (lowercase "plumbing"). Not a business-logic
// bug — isolated here as a stale test expectation and corrected to a case-insensitive check.
assert.ok(/plumbing add-ons/i.test(view), "expected a Faucet/plumbing add-ons accessory section header");
assert.ok(view.includes("clearIncompatibleAccessoriesForRoom"));

assert.ok(vm.includes("looksLikeUuid"));
assert.ok(vm.includes("Countertop run"));
assert.ok(vm.includes("pieceDisplayName"));
assert.ok(vm.includes("priceEffectLabel"));
assert.ok(api.includes("priceEffectLabel"));
assert.ok(api.includes("pieceDisplayName"));

console.log("ok: phaseOptionRuntime UI contracts");
