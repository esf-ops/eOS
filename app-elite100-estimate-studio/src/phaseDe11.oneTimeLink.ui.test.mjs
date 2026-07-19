/**
 * Phase DE.2G — Studio stable reusable customer link UI contract (static).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(__dirname, "StudioApp.tsx"), "utf8");

assert.ok(app.includes("preserveCustomerLink"), "loadQuote recovers/preserves customer link");
assert.ok(app.includes("Customer link"), "stable customer link panel title");
assert.ok(app.includes("Copy link"), "copy control");
assert.ok(app.includes("Open customer view"), "open customer view control");
assert.ok(app.includes("Stable reusable link") || app.includes("stable reusable"), "reusable retention copy");
assert.ok(app.includes("Replace link"), "replace recovery control");
assert.equal(app.includes("oneTimeToken"), false, "raw token must not be stored in dedicated state");
assert.equal(app.includes("will not be shown again after you leave or refresh"), false);
assert.equal(app.includes("localStorage"), false, "no localStorage persistence");
assert.equal(app.includes("sessionStorage"), false, "no sessionStorage persistence");
assert.equal(app.includes("indexedDB"), false, "no IndexedDB persistence");
assert.equal(app.includes("console.log"), false, "no mutation response logging");
assert.ok(app.includes("publishInFlight"), "in-flight publish guard");
assert.ok(app.includes("replaceInFlight"), "in-flight replace guard");
assert.ok(app.includes("activeSameRevision"), "duplicate publish protection by revision");
assert.ok(app.includes("Active publication exists"), "active publication banner");
assert.equal(app.includes("Token length"), false, "must not display raw token metadata");

console.log("\nphaseDe11.oneTimeLink.ui.test.mjs\n");
console.log("ok: Studio stable reusable customer link UI contract");
console.log("\nAll Studio customer-link UI tests passed.\n");
