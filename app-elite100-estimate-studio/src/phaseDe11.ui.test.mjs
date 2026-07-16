/**
 * Phase DE.1.1 — Elite 100 Estimate Studio UI static checks.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const app = readFileSync(join(root, "src/StudioApp.tsx"), "utf8");
const vite = readFileSync(join(root, "vite.config.ts"), "utf8");
const envEx = readFileSync(join(root, ".env.example"), "utf8");
const pkg = readFileSync(join(root, "package.json"), "utf8");

assert.ok(vite.includes("5191"), "Studio port must be 5191");
assert.ok(envEx.includes("VITE_ELITE100_ESTIMATE_STUDIO_UI_ENABLED=false"));
assert.equal(envEx.includes("PILOT_USER"), false, "no pilot secrets in Vite env example");
assert.ok(app.includes("EliteosTopbar"));
assert.ok(app.includes("/api/elite100-estimate-studio/"));
assert.equal(app.includes("calculateQuote"), false);
assert.equal(app.includes("service_role"), false);
assert.equal(app.includes("VITE_ELITE100_ESTIMATE_STUDIO_PILOT"), false);
assert.ok(pkg.includes("app-elite100-estimate-studio"));

console.log("\nphaseDe11.ui.test.mjs\n");
console.log("ok: Studio UI flags, port, Brain-only APIs, Topbar");
console.log("\nAll phase DE.1.1 UI tests passed.\n");
